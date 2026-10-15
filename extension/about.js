/* Local about page: no network resources or third-party runtime libraries.
 * Source and development-tool credits were checked on 2026-10-15.
 */
'use strict';

// Accept a single known palette; query values never become CSS or HTML.
document.documentElement.classList.toggle('iu-theme',
  new URLSearchParams(location.search).get('theme') === 'iu');

try {
  // Read the installed package version, so release bumps need no page edits.
  const version = chrome.runtime.getManifest().version;
  document.getElementById('projectVersion').textContent = `v${version}`;
  console.info('[about] manifest_version_loaded');
} catch {
  document.getElementById('projectVersion').textContent = '버전 확인 불가';
  console.warn('[about] manifest_version_unavailable');
}

async function loadLicense() {
  const status = document.getElementById('licenseStatus');
  const text = document.getElementById('licenseText');
  console.info('[about] local_license_loading');
  try {
    // The packaged LICENSE is the single source of truth. Do not fetch a
    // remote copy: this page must also work offline under the extension CSP.
    const response = await fetch(chrome.runtime.getURL('LICENSE'));
    if (!response.ok) throw new Error('local_license_http_error');
    const license = await response.text();
    if (!license.trim()) throw new Error('local_license_empty');

    // Treat file contents as plain text, including any markup-like characters.
    text.textContent = license;
    status.textContent = '동봉된 LICENSE 파일을 불러왔습니다. 아래 항목을 펼쳐 전문을 확인하실 수 있습니다.';
    console.info('[about] local_license_loaded');
  } catch {
    const fallback = '라이선스 전문을 불러오지 못했습니다. 아래의 동봉 LICENSE 열기 링크로 확인해 주세요.';
    text.textContent = fallback;
    status.textContent = fallback;
    status.classList.add('error');
    // Log a static ASCII code without exposing file paths or exception text.
    console.error('[about] local_license_load_failed');
  }
}

void loadLicense();
