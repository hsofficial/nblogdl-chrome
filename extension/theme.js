/* SPDX-License-Identifier: GPL-3.0-only
 * Shared by extension pages only; independent of download queue settings.
 */
(function () {
  'use strict';
  const key = 'uiColorMode';
  const valid = value => ['system', 'light', 'dark'].includes(value) ? value : 'system';
  const media = matchMedia('(prefers-color-scheme: dark)');
  const root = document.documentElement;
  const controls = [...document.querySelectorAll('[data-color-mode-value]')];
  const status = document.getElementById('colorModeStatus');
  let preference = 'system';
  let revision = 0;
  let pending = 0;
  let writes = Promise.resolve();

  function render() {
    root.dataset.colorPreference = preference;
    root.dataset.colorMode = preference === 'system' ? (media.matches ? 'dark' : 'light') : preference;
    for (const button of controls) button.setAttribute('aria-pressed', String(button.dataset.colorModeValue === preference));
  }

  function showFailure() {
    console.error('[theme] preference_storage_failed');
    if (status) {
      status.textContent = '화면 설정을 저장하지 못했습니다. 다시 선택해주세요.';
      status.hidden = false;
    }
  }

  for (const button of controls) button.addEventListener('click', () => {
    const choice = valid(button.dataset.colorModeValue);
    preference = choice;
    revision += 1;
    pending += 1;
    render();
    if (status) status.hidden = true;
    // Preserve click order even when asynchronous storage writes finish slowly.
    // Each write touches only this key, so queue/folder updates cannot erase it.
    writes = writes.then(() => chrome.storage.local.set({[key]: choice}))
      .then(() => console.info('[theme] preference_saved mode=' + choice), showFailure)
      .finally(() => {pending -= 1;});
  });
  media.addEventListener('change', () => {if (preference === 'system') render();});
  chrome.storage.onChanged.addListener((changes, area) => {
    // Ignore echoes of queued local clicks; other pages follow the last write.
    if (area !== 'local' || !Object.hasOwn(changes, key) || pending) return;
    revision += 1;
    preference = valid(changes[key].newValue);
    render();
  });
  render();
  const initialRevision = revision;
  chrome.storage.local.get(key).then(stored => {
    // A slow initial read must not overwrite a user's newer click or event.
    if (revision !== initialRevision) return;
    preference = valid(stored[key]);
    render();
    console.info('[theme] preference_loaded mode=' + preference);
  }).catch(showFailure);
})();
