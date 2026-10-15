/* SPDX-License-Identifier: GPL-3.0-only */
const $ = id => document.getElementById(id);
const selected = new Set();
let currentScan = null;
let tabId;
let lastSignature = '';
let settingsLoaded = false;
let savedSettings = null;
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
    summary.textContent = `${job.automatic ? '자동' : '선택'} 저장 · 완료 ${counts.complete}/${job.tasks.length}`;
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
    box.append(line, progress, details); $('jobs').append(box);
  }
}

async function refresh() {
  if (refreshPending || !Number.isInteger(tabId)) return;
  refreshPending = true;
  try {
    const view = await request('GET_VIEW', {tabId});
    savedSettings = {...view.settings};
    if (!settingsLoaded) {
      $('autoDownload').checked = view.settings.autoDownload;
      $('quality').value = view.settings.quality; $('folder').value = view.settings.folder;
      settingsLoaded = true;
    }
    renderScan(view.scan); renderJobs(view.jobs);
    $('logs').textContent = view.logs.join('\n') || 'Waiting for scan.';
  } finally {refreshPending = false;}
}

async function saveSettings() {
  const folder = NBlogCore.normalizeFolder($('folder').value);
  const settings = await request('SAVE_SETTINGS', {settings: {autoDownload: $('autoDownload').checked,
    quality: $('quality').value, folder}});
  savedSettings = {...settings};
  $('folder').value = settings.folder;
  notice(settings.autoDownload ? '설정을 저장했습니다. 게시글 방문 시 자동 저장됩니다.' : '설정을 저장했습니다. 선택 저장을 사용할 수 있습니다.');
}

async function guarded(action) {
  try {await action();} catch {
    console.error('[NBlog] popup_action_failed');
    notice('요청을 처리하지 못했습니다. 저장 경로를 확인하거나 게시글을 새로고침해주세요.', true);
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
$('autoDownload').addEventListener('change', () => guarded(async () => {
  // The auto switch must still work while a folder draft is invalid. Save
  // only the switch against the last accepted settings, leaving drafts alone.
  if (!savedSettings) return;
  const previous = savedSettings.autoDownload;
  try {
    savedSettings = await request('SAVE_SETTINGS', {settings: {...savedSettings, autoDownload: $('autoDownload').checked}});
    notice(savedSettings.autoDownload ? '자동 저장을 켰습니다.' : '자동 저장을 껐습니다. 진행 중인 작업은 중지 버튼으로 멈출 수 있습니다.');
  } catch (error) {$('autoDownload').checked = previous; throw error;}
}));
$('saveSettings').addEventListener('click', () => guarded(saveSettings));
$('download').addEventListener('click', () => guarded(async () => {
  $('download').disabled = true;
  try {
    await saveSettings();
    const result = await request('DOWNLOAD', {tabId, postKey: currentScan.post.key, ids: [...selected]});
    notice(result.queued ? `${result.queued}장을 다운로드 대기열에 추가했습니다.` : '선택한 이미지가 이미 다운로드 중입니다.');
    await refresh();
  } finally {updateSelection();}
}));
$('clearHistory').addEventListener('click', () => guarded(async () => {
  await request('CLEAR_HISTORY'); notice('자동 저장 이력을 초기화했습니다. 다음 방문부터 다시 저장됩니다.');
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
