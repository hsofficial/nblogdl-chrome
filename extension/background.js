/* SPDX-License-Identifier: GPL-3.0-only
 * Naver Blog downloader: durable MV3 queue using Chrome's native downloads API.
 * DOM selection and w3840 strategy derive from hsofficial/nblog-img-downloder.
 */
importScripts('core.js');

const Core = globalThis.NBlogCore;
const DEFAULT_SETTINGS = {folder: 'NaverBlog'};
const ACTIVE = new Set(['queued', 'starting', 'downloading', 'canceling']);
const MAX_CONCURRENT = 3;
let state;
let serial = Promise.resolve();

// All queue mutations share one lock, including events that arrive while a
// download() Promise is resolving. Persist after every operation so a stopped
// service worker can rebuild its queue without relying on global variables.
function transact(operation) {
  const result = serial.then(async () => {
    if (!state) {
      const stored = await chrome.storage.local.get('state');
      state = stored.state || {schemaVersion: 2, settings: {...DEFAULT_SETTINGS}, jobs: [], logs: []};
      state.settings = {folder: Core.normalizeFolder(state.settings?.folder)};
      // Updating an existing install must not resurrect the removed auto mode.
      // Cancel its remaining work before reconciliation can dispatch a queued
      // task. Manual jobs retain their original folder and finish normally.
      if (state.schemaVersion !== 2) {
        for (const job of state.jobs) {
          if (!job.automatic) continue;
          for (const task of job.tasks) {
            if (!ACTIVE.has(task.status)) continue;
            task.cancelRequested = true;
            task.status = task.status === 'queued' ? 'canceled' : 'canceling';
            task.error = 'USER_CANCELED';
          }
        }
        state.schemaVersion = 2;
        delete state.history;
        log('settings_migrated', 'mode=manual quality=w3840');
        await chrome.storage.local.set({state});
      }
    }
    const value = await operation();
    prune();
    await chrome.storage.local.set({state});
    return value;
  });
  serial = result.catch(() => console.error('[NBlog] transaction_failed'));
  return result;
}

function log(event, details = '') {
  // Only internally generated ASCII tokens reach stdout. Never log page
  // titles, source URLs, filenames, or raw Chrome error strings.
  const line = `[${new Date().toISOString()}] ${event}${details ? ' ' + details : ''}`;
  console.log('[NBlog] ' + line);
  state.logs.push(line);
  state.logs = state.logs.slice(-60);
}

function prune() {
  const active = state.jobs.filter(job => job.tasks.some(task => ACTIVE.has(task.status)));
  const finished = state.jobs.filter(job => !job.tasks.some(task => ACTIVE.has(task.status))).slice(-30);
  state.jobs = [...finished, ...active].sort((a, b) => a.createdAt - b.createdAt);
}

function allTasks() {
  return state.jobs.flatMap(job => job.tasks.map(task => ({job, task})));
}

function badgeFor(job) {
  const pending = job.tasks.filter(task => ACTIVE.has(task.status)).length;
  const failed = job.tasks.some(task => task.status === 'failed');
  const text = pending ? String(pending) : failed ? '!' : '';
  // A tab can disappear while its files continue downloading. Badge failures
  // have no effect on the durable queue or on its completion accounting.
  chrome.action.setBadgeText({tabId: job.tabId, text}).catch(() => {});
  chrome.action.setBadgeBackgroundColor({tabId: job.tabId, color: failed ? '#b45309' : '#15945e'}).catch(() => {});
}

function validateScan(raw, senderUrl) {
  const post = Core.getPostIdentity(raw?.post?.url);
  const senderPost = Core.getPostIdentity(senderUrl);
  if (!post || (senderPost && senderPost.key !== post.key)) throw new Error('INVALID_POST');
  const senderHost = new URL(senderUrl).hostname;
  if (!['blog.naver.com', 'm.blog.naver.com'].includes(senderHost)) throw new Error('INVALID_HOST');
  if (!Array.isArray(raw.images) || raw.images.length > 5000) throw new Error('INVALID_IMAGES');
  const seen = new Set();
  const images = [];
  for (const image of raw.images) {
    const src = Core.normalizeImageUrl(image.src, post.url);
    if (!src) continue;
    const id = Core.getImageCandidates(src, 'original')[0];
    if (seen.has(id)) continue;
    seen.add(id);
    const dimension = value => Number.isFinite(Number(value)) ? Math.max(0, Math.min(100000, Number(value))) : 0;
    images.push({id, src, preview: Core.normalizeImageUrl(image.preview, post.url) || src,
      width: dimension(image.width), height: dimension(image.height), index: images.length + 1});
  }
  return {post, title: String(raw.title || post.key).slice(0, 300), images};
}

async function enqueue(scan, tabId, selectedIds, folder) {
  const ids = new Set(selectedIds);
  const existing = allTasks();
  const images = scan.images.filter(image => {
    if (!ids.has(image.id)) return false;
    if (existing.some(({job, task}) => job.post.key === scan.post.key && task.image.id === image.id && ACTIVE.has(task.status))) return false;
    return true;
  });
  if (!images.length) return {queued: 0};
  const job = {id: crypto.randomUUID(), tabId, post: scan.post,
    title: scan.title, createdAt: Date.now(), folder, quality: 'w3840',
    tasks: images.map(image => ({image, filename: Core.buildFilename(scan.post, image, folder, 'w3840'),
      candidates: Core.getImageCandidates(image.src, 'w3840'),
      attempt: 0, status: 'queued', downloadId: null, error: '', bytes: 0}))};
  state.jobs.push(job);
  log('job_queued', `mode=manual quality=w3840 count=${images.length}`);
  // Checkpoint queued tasks BEFORE handing them to Chrome. If the worker is
  // terminated mid-dispatch, recovery can reconcile a starting task by URL.
  await chrome.storage.local.set({state});
  await pump();
  return {queued: images.length, jobId: job.id, folder: job.folder};
}

async function pump() {
  // Arm recovery BEFORE dispatch: termination between download() and saving
  // its id must still have a wakeup even when no popup is open.
  if (allTasks().some(({task}) => ACTIVE.has(task.status))) {
    await chrome.alarms.create('queue-recovery', {periodInMinutes: 0.5});
  }
  let active = allTasks().filter(({task}) => ['starting', 'downloading', 'canceling'].includes(task.status)).length;
  for (const {job, task} of allTasks()) {
    if (active >= MAX_CONCURRENT) break;
    if (task.status !== 'queued') continue;
    const url = task.candidates[task.attempt];
    if (!url) {task.status = 'failed'; task.error = 'NO_HIGH_RES_URL'; continue;}
    task.status = 'starting';
    task.startedAt = Date.now();
    await chrome.storage.local.set({state});
    try {
      task.downloadId = await chrome.downloads.download({url,
        filename: task.filename || Core.buildFilename(job.post, task.image, job.folder, job.quality),
        conflictAction: 'uniquify', saveAs: false});
    } catch {
      retryOrFail(task, 'START_FAILED');
      log('download_start_failed', `attempt=${task.attempt}`);
      badgeFor(job);
      continue;
    }
    task.status = 'downloading';
    active += 1;
    log('download_started', `id=${task.downloadId} attempt=${task.attempt + 1}`);
    try {
      await chrome.storage.local.set({state});
      // Tiny downloads may complete before their id is stored. A search
      // closes that race even if the onChanged event was already emitted.
      const [item] = await chrome.downloads.search({id: task.downloadId});
      if (item && item.state !== 'in_progress') {
        await settle(job, task, item);
        active -= 1;
      }
    } catch {
      // A checkpoint/search failure is NOT a failed native download. Keep
      // its id and status so recovery never starts a second candidate blindly.
      log('download_checkpoint_deferred', `id=${task.downloadId}`);
    }
    badgeFor(job);
  }
  // Rejected downloads can leave queued fallback tasks before the iterator's
  // current position. The recovery alarm handles these without recursion.
  if (allTasks().some(({task}) => ACTIVE.has(task.status))) {
    await chrome.alarms.create('queue-recovery', {periodInMinutes: 0.5});
  } else {
    await chrome.alarms.clear('queue-recovery');
  }
}

function retryOrFail(task, reason) {
  // User cancellations are final; never restart a download a user stopped.
  const fallback = !reason.startsWith('USER_') && !reason.startsWith('FILE_') && task.attempt + 1 < task.candidates.length;
  task.attempt += 1;
  task.status = fallback ? 'queued' : 'failed';
  task.error = reason;
  task.downloadId = null;
}

async function settle(job, task, item) {
  if (item.filename) task.savedFilename = item.filename;
  if (item.state === 'complete') {
    if (!item.mime?.toLowerCase().startsWith('image/')) {
      const mime = (item.mime || '').split(';')[0].trim().toLowerCase();
      const knownInvalid = ['text/html', 'application/json', 'text/json', 'text/plain', 'application/xml', 'text/xml'].includes(mime);
      // Remove only an explicitly non-image artifact created by THIS extension.
      // uniquify avoids overwriting an existing user's file. Unknown MIME and
      // octet-stream are ambiguous and must not authorize file deletion.
      if (knownInvalid && item.byExtensionId === chrome.runtime.id) {
        try {
          // Recovery may revisit an already removed artifact if termination
          // occurred just before persisting the fallback task.
          if (item.exists !== false) await chrome.downloads.removeFile(item.id);
          log('invalid_response_removed', `id=${item.id}`);
          if (task.cancelRequested) {task.status = 'canceled'; task.error = 'USER_CANCELED';}
          else retryOrFail(task, 'NON_IMAGE_RESPONSE');
        } catch {
          task.status = 'failed'; task.error = 'INVALID_FILE_CLEANUP_FAILED';
          log('invalid_response_cleanup_failed', `id=${item.id}`);
        }
      } else {
        task.status = 'failed'; task.error = 'UNVERIFIED_IMAGE_MIME';
      }
      log('non_image_response', `id=${item.id}`);
    } else {
      task.status = 'complete';
      task.bytes = Math.max(0, item.fileSize || item.bytesReceived || 0);
      task.error = '';
      log('download_complete', `id=${item.id} bytes=${task.bytes}`);
    }
  } else if (item.state === 'interrupted') {
    const reason = /^[A-Z_]+$/.test(item.error || '') ? item.error : 'INTERRUPTED';
    if (task.cancelRequested) {task.status = 'canceled'; task.error = 'USER_CANCELED';}
    else retryOrFail(task, reason);
    log('download_interrupted', `id=${item.id} reason=${reason}`);
  }
  badgeFor(job);
}

async function reconcile() {
  for (const {job, task} of allTasks()) {
    if (!['starting', 'downloading', 'canceling'].includes(task.status)) continue;
    let item;
    if (task.downloadId !== null) {
      [item] = await chrome.downloads.search({id: task.downloadId});
    } else {
      // Recover the dispatch gap between downloads.download() and persisting
      // its id. Only this extension's recent matching URL is eligible.
      const items = await chrome.downloads.search({url: task.candidates[task.attempt],
        startedAfter: new Date(task.startedAt - 1000).toISOString(), orderBy: ['-startTime'], limit: 10});
      item = items.find(candidate => candidate.byExtensionId === chrome.runtime.id);
      if (item) task.downloadId = item.id;
    }
    if (!item) {
      if (task.cancelRequested) {task.status = 'canceled'; task.error = 'USER_CANCELED';}
      else retryOrFail(task, 'DOWNLOAD_MISSING');
      log('download_missing');
    } else if (item.state === 'in_progress') {
      task.status = task.cancelRequested ? 'canceling' : 'downloading';
      if (task.cancelRequested) {
        await chrome.downloads.cancel(item.id).catch(() => {});
        const [latest] = await chrome.downloads.search({id: item.id});
        if (latest && latest.state !== 'in_progress') await settle(job, task, latest);
      }
    } else await settle(job, task, item);
  }
  await pump();
}

async function view(tabId) {
  const stored = await chrome.storage.session.get(`scan:${tabId}`);
  const snapshot = stored[`scan:${tabId}`] || null;
  const jobs = state.jobs.filter(job => snapshot ? job.post.key === snapshot.scan.post.key : job.tabId === tabId).slice(-8);
  return {settings: state.settings, scan: snapshot?.scan || null, jobs, logs: state.logs};
}

async function route(message, sender) {
  if (message.type === 'SITE_CLEAR') {
    if (!Number.isInteger(sender.tab?.id) || !['blog.naver.com', 'm.blog.naver.com'].includes(new URL(sender.url).hostname)) throw new Error('INVALID_TAB');
    const key = `scan:${sender.tab.id}`;
    const stored = await chrome.storage.session.get(key);
    const snapshot = stored[key];
    // A parent wrapper without a body must not erase the mainFrame scan.
    // Clear only the exact document/frame that supplied the current snapshot.
    if (snapshot && snapshot.frameId === sender.frameId && snapshot.documentId === sender.documentId) {
      await chrome.storage.session.remove(key);
      log('scan_cleared', `tab=${sender.tab.id}`);
    }
    return {};
  }
  if (message.type === 'SITE_SCAN') {
    if (!Number.isInteger(sender.tab?.id)) throw new Error('INVALID_TAB');
    const scan = validateScan(message.scan, sender.url);
    await chrome.storage.session.set({[`scan:${sender.tab.id}`]: {scan, frameId: sender.frameId, documentId: sender.documentId}});
    log('scan_received', `tab=${sender.tab.id} count=${scan.images.length}`);
    return {count: scan.images.length};
  }
  // Content scripts can only submit scans. GUI-only messages require an
  // extension-page sender; web page fields never authorize settings or jobs.
  if (sender.tab || !sender.url?.startsWith(chrome.runtime.getURL(''))) throw new Error('INVALID_SENDER');
  if (message.type === 'GET_VIEW') {await reconcile(); return view(message.tabId);}
  if (message.type === 'SAVE_SETTINGS') {
    const settings = message.settings;
    if (!settings || typeof settings.folder !== 'string') throw new Error('INVALID_SETTINGS');
    state.settings = {folder: Core.normalizeFolder(settings.folder)};
    log('settings_saved', 'quality=w3840');
    return state.settings;
  }
  if (message.type === 'DOWNLOAD') {
    const stored = await chrome.storage.session.get(`scan:${message.tabId}`);
    const snapshot = stored[`scan:${message.tabId}`];
    if (!snapshot || snapshot.scan.post.key !== message.postKey) throw new Error('POST_CHANGED');
    if (!Array.isArray(message.ids) || !message.ids.length) throw new Error('EMPTY_SELECTION');
    const validIds = new Set(snapshot.scan.images.map(image => image.id));
    if (message.ids.length > snapshot.scan.images.length || message.ids.some(id => typeof id !== 'string' || !validIds.has(id))) throw new Error('INVALID_SELECTION');
    // Folder validation and job creation share one transaction. The GUI sends
    // the currently typed path with the click, including an unsaved draft.
    const folder = Core.normalizeFolder(message.folder ?? state.settings.folder);
    state.settings = {folder};
    return enqueue(snapshot.scan, message.tabId, message.ids, folder);
  }
  if (message.type === 'CANCEL') {
    const job = state.jobs.find(candidate => candidate.id === message.jobId);
    if (!job) throw new Error('JOB_MISSING');
    for (const task of job.tasks) {
      if (!ACTIVE.has(task.status)) continue;
      if (task.downloadId === null) {
        task.status = 'canceled'; task.error = 'USER_CANCELED';
        continue;
      }
      // Preserve cancellation intent across worker termination. Native cancel
      // can race with completion; confirm its final state before counting it.
      task.cancelRequested = true;
      task.status = 'canceling';
      await chrome.storage.local.set({state});
      await chrome.downloads.cancel(task.downloadId).catch(() => {});
      try {
        const [item] = await chrome.downloads.search({id: task.downloadId});
        if (item && item.state !== 'in_progress') await settle(job, task, item);
      } catch {log('cancel_confirmation_deferred', `id=${task.downloadId}`);}
    }
    log('job_canceled');
    badgeFor(job);
    await pump();
    return {};
  }
  throw new Error('UNKNOWN_MESSAGE');
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  transact(() => route(message, sender)).then(data => respond({ok: true, data}), () => respond({ok: false, error: 'REQUEST_FAILED'}));
  return true;
});
chrome.downloads.onChanged.addListener(delta => {
  if (!delta.filename && (!delta.state || delta.state.current === 'in_progress')) return;
  transact(async () => {
    const match = allTasks().find(({task}) => task.downloadId === delta.id && ['downloading', 'canceling'].includes(task.status));
    if (match) {
      const [item] = await chrome.downloads.search({id: delta.id});
      if (item?.filename) match.task.savedFilename = item.filename;
      if (item && item.state !== 'in_progress') await settle(match.job, match.task, item);
      await pump();
    }
  });
});
chrome.downloads.onDeterminingFilename.addListener((item, suggest) => {
  if (item.byExtensionId !== chrome.runtime.id) {suggest(); return;}
  const finish = snapshot => {
    let suggestion;
    try {
      const pairs = (snapshot?.jobs || []).flatMap(job => job.tasks.map(task => ({job, task})));
      const match = pairs.find(({task}) => task.downloadId === item.id) ||
        pairs.find(({task}) => task.status === 'starting' && task.candidates[task.attempt] === item.url);
      if (match) {
        const filename = match.task.filename || Core.buildFilename(match.job.post, match.task.image, match.job.folder, match.job.quality);
        suggestion = {filename, conflictAction: 'uniquify'};
      }
    } catch {console.error('[NBlog] filename_suggestion_unavailable');}
    if (suggestion) suggest(suggestion); else suggest();
  };
  // Do NOT acquire the mutation lock here: downloads.download() can wait for
  // this callback while it already holds that lock. Cold worker reads are
  // independent, and suggest is always called exactly once.
  if (state) {
    finish(state);
    return;
  }
  chrome.storage.local.get('state').then(stored => finish(stored.state), () => finish(null));
  return true;
});
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === 'queue-recovery') transact(reconcile);
});
chrome.runtime.onInstalled.addListener(() => transact(async () => {log('extension_ready'); await reconcile();}));
chrome.runtime.onStartup.addListener(() => transact(reconcile));
chrome.tabs.onRemoved.addListener(tabId => {
  chrome.storage.session.remove(`scan:${tabId}`).catch(() => {});
});
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading') chrome.storage.session.remove(`scan:${tabId}`).catch(() => {});
});
// Register all events synchronously before reconciling persisted work.
transact(reconcile);
