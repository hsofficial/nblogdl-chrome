/* SPDX-License-Identifier: GPL-3.0-only */
const $ = id => document.getElementById(id);
const selected = new Set();
let currentScan = null;
let tabId;
let lastSignature = '';
let settingsLoaded = false;
let refreshPending = false;

async function request(type, extra = {}) {
  const reply = await chrome.runtime.sendMessage({type, ...extra});
  if (!reply?.ok) throw new Error(reply?.error || 'REQUEST_FAILED');
  return reply.data;
}

function notice(message, error = false) {
  $('notice').textContent = message;
  $('notice').classList.toggle('error', error);
}

function updateSelection() {
  const count = currentScan?.images.length || 0;
  $('selectionCount').textContent = `${selected.size}장 선택`;
  $('download').disabled = !selected.size;
  $('download').textContent = selected.size ? `선택한 이미지 ${selected.size}장 저장` : '선택한 이미지 저장';
  $('selectAll').checked = count > 0 && count === selected.size;
  $('selectAll').indeterminate = selected.size > 0 && selected.size < count;
  $('selectAll').disabled = !count;
}

function updateDestination() {
  let folder;
  try {folder = NBlogCore.normalizeFolder($('folder').value);} catch {
    $('destination').textContent = '저장 경로: 하위 폴더 이름을 확인해주세요.';
    return;
  }
  const postFolder = currentScan ? '/' + NBlogCore.sanitizeSegment(currentScan.post.key) : '';
  $('destination').textContent = `저장 위치: 다운로드/${folder}${postFolder}`;
}

function readFolder() {
  try {
    const folder = NBlogCore.normalizeFolder($('folder').value);
    $('folder').setCustomValidity('');
    return folder;
  } catch {
    const message = '사진/네이버처럼 하위 경로를 입력해주세요. 절대 경로와 ..는 사용할 수 없습니다.';
    $('folder').setCustomValidity(message);
    $('folder').reportValidity();
    throw new Error('FOLDER_INVALID');
  }
}

function renderScan(scan) {
  // Only build cards on changed content, preserving selection while progress
  // refreshes. New lazy-loaded images are selected without losing old choices.
  const signature = JSON.stringify(scan);
  if (signature === lastSignature) return;
  const oldIds = new Set(currentScan?.images.map(image => image.id) || []);
  if (currentScan?.post.key !== scan?.post.key) {selected.clear(); oldIds.clear();}
  currentScan = scan;
  lastSignature = signature;
  const images = scan?.images || [];
  for (const id of selected) if (!images.some(image => image.id === id)) selected.delete(id);
  for (const image of images) if (!oldIds.has(image.id)) selected.add(image.id);
  $('postTitle').textContent = scan?.title || '네이버 블로그 게시글을 열어주세요.';
  $('postMeta').textContent = scan ? `${scan.post.blogId} · 본문 이미지 ${images.length}장` : '게시글을 연 뒤 새로고침하면 이미지를 찾습니다.';
  $('empty').hidden = images.length > 0;
  $('images').replaceChildren();
  for (const image of images) {
    const card = document.createElement('label');
    card.className = 'image-card';
    card.classList.toggle('selected', selected.has(image.id));
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox'; checkbox.checked = selected.has(image.id);
    checkbox.setAttribute('aria-label', `이미지 ${image.index} 선택`);
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) selected.add(image.id); else selected.delete(image.id);
      card.classList.toggle('selected', checkbox.checked); updateSelection();
    });
    const preview = document.createElement('img');
    preview.src = image.preview; preview.alt = `본문 이미지 ${image.index}`;
    preview.loading = 'lazy'; preview.referrerPolicy = 'no-referrer';
    const caption = document.createElement('span'); caption.className = 'caption';
    const number = document.createElement('span'); number.textContent = String(image.index).padStart(2, '0');
    const dimensions = document.createElement('span');
    dimensions.textContent = image.width && image.height ? `${image.width} × ${image.height}` : '크기 미확인';
    caption.append(number, dimensions); card.append(preview, checkbox, caption);
    $('images').append(card);
  }
  updateSelection();
  updateDestination();
}

function renderJobs(jobs) {
  $('jobs').replaceChildren();
  for (const job of jobs.slice(-3).reverse()) {
    const counts = {complete: 0, failed: 0, canceled: 0, active: 0};
    for (const task of job.tasks) {
      if (Object.hasOwn(counts, task.status)) counts[task.status] += 1; else counts.active += 1;
    }
    const box = document.createElement('div'); box.className = 'job';
    const line = document.createElement('div'); line.className = 'job-line';
    const summary = document.createElement('strong');
    summary.textContent = `선택 저장 · 완료 ${counts.complete}/${job.tasks.length}`;
    line.append(summary);
    if (counts.active) {
      const cancel = document.createElement('button'); cancel.type = 'button'; cancel.className = 'text-button'; cancel.textContent = '중지';
      cancel.addEventListener('click', () => guarded(async () => {await request('CANCEL', {jobId: job.id}); await refresh();}));
      line.append(cancel);
    }
    const progress = document.createElement('progress'); progress.max = job.tasks.length;
    progress.value = counts.complete + counts.failed + counts.canceled;
    progress.setAttribute('aria-label', '다운로드 처리 진행률');
    const details = document.createElement('p');
    details.textContent = `대기·진행 ${counts.active} · 실패 ${counts.failed} · 중지 ${counts.canceled}`;
    if (counts.failed) {
      const errors = [...new Set(job.tasks.filter(task => task.status === 'failed').map(task => task.error))];
      details.textContent += ` · ${errors.join(', ')}`;
    }
    const destination = document.createElement('p'); destination.className = 'saved-path';
    destination.textContent = `요청 경로: 다운로드/${job.folder}/${NBlogCore.sanitizeSegment(job.post.key)}`;
    box.append(line, progress, details, destination);
    const completed = job.tasks.findLast(task => task.status === 'complete' && task.savedFilename);
    if (completed) {
      const actual = document.createElement('p'); actual.className = 'saved-path';
      actual.textContent = `실제 저장: ${completed.savedFilename}`;
      const show = document.createElement('button'); show.type = 'button'; show.className = 'text-button'; show.textContent = '저장 폴더 열기';
      show.addEventListener('click', () => guarded(() => chrome.downloads.show(completed.downloadId)));
      box.append(actual, show);
    }
    $('jobs').append(box);
  }
}

async function refresh() {
  if (refreshPending || !Number.isInteger(tabId)) return;
  refreshPending = true;
  try {
    const view = await request('GET_VIEW', {tabId});
    if (!settingsLoaded) {
      $('folder').value = view.settings.folder;
      settingsLoaded = true;
    }
    renderScan(view.scan); renderJobs(view.jobs);
    updateDestination();
    $('logs').textContent = view.logs.join('\n') || 'Waiting for scan.';
  } finally {refreshPending = false;}
}

async function saveSettings() {
  const folder = readFolder();
  const settings = await request('SAVE_SETTINGS', {settings: {folder}});
  $('folder').value = settings.folder;
  updateDestination();
  notice(`저장 경로를 적용했습니다: 다운로드/${settings.folder}`);
}

async function guarded(action) {
  try {await action();} catch (error) {
    console.error('[NBlog] popup_action_failed');
    notice(error.message === 'FOLDER_INVALID' ? '사진/네이버처럼 하위 경로를 입력해주세요. 절대 경로와 ..는 사용할 수 없습니다.' :
      '요청을 처리하지 못했습니다. 저장 경로를 확인하거나 게시글을 새로고침해주세요.', true);
  }
}

$('selectAll').addEventListener('change', () => {
  if ($('selectAll').checked) for (const image of currentScan?.images || []) selected.add(image.id); else selected.clear();
  for (const card of $('images').children) {const checkbox = card.querySelector('input'); checkbox.checked = $('selectAll').checked; card.classList.toggle('selected', checkbox.checked);}
  updateSelection();
});
$('refresh').addEventListener('click', () => guarded(async () => {
  await chrome.tabs.sendMessage(tabId, {type: 'SCAN'});
  await refresh(); notice('본문 이미지를 다시 확인했습니다.');
}));
$('folder').addEventListener('input', () => {
  settingsLoaded = true;
  $('folder').setCustomValidity('');
  updateDestination();
});
$('folder').addEventListener('keydown', event => {
  if (event.key === 'Enter') {event.preventDefault(); guarded(saveSettings);}
});
$('saveSettings').addEventListener('click', () => guarded(saveSettings));
$('download').addEventListener('click', () => guarded(async () => {
  $('download').disabled = true;
  try {
    // Pass the typed folder with the same message that enqueues this batch.
    // No separate settings request can race and replace its destination.
    const folder = readFolder();
    const result = await request('DOWNLOAD', {tabId, postKey: currentScan.post.key, ids: [...selected], folder});
    $('folder').value = folder;
    updateDestination();
    notice(result.queued ? `${result.queued}장을 다운로드 대기열에 추가했습니다.` : '선택한 이미지가 이미 다운로드 중입니다.');
    await refresh();
  } finally {updateSelection();}
}));
guarded(async () => {
  const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
  tabId = tab?.id;
  await refresh();
  // An installed content script needs a reload on tabs opened before install.
  // Attempt a rescan, but keep a helpful empty state if the script is absent.
  await chrome.tabs.sendMessage(tabId, {type: 'SCAN'}).catch(() => {});
  await refresh();
});
const timer = setInterval(() => guarded(refresh), 1200);
window.addEventListener('pagehide', () => clearInterval(timer));
