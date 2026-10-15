/* Browser UI/DOM verification with isolated synthetic data, not a live Naver test.
 * Playwright is an optional development tool, never an extension dependency.
 * Run with PLAYWRIGHT_PATH and CHROME_PATH if they are not installed normally.
 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {chromium} = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const root = path.resolve(__dirname, '..');
const artifacts = path.join(root, 'artifacts');

function landscape(index) {
  // Synthetic preview illustrations let UI verification stay independent of
  // external websites, copyrighted sample photographs, and network failures.
  const palettes = [['#d7e7e3', '#8ebaaa', '#335b4c'], ['#f6dfba', '#d2ad8a', '#826c56'], ['#d3dee5', '#7fa4b4', '#3d6474']];
  const [sky, middle, front] = palettes[index % palettes.length];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 240"><rect width="360" height="240" fill="${sky}"/><circle cx="270" cy="65" r="25" fill="#fff8da"/><path d="M0 185L90 60L210 180L290 120L360 195V240H0Z" fill="${middle}"/><path d="M0 220L95 160L195 205L300 130L360 170V240H0Z" fill="${front}"/></svg>`;
}

async function main() {
  fs.mkdirSync(artifacts, {recursive: true});
  console.log('[browser] launch_isolated_headless');
  const browser = await chromium.launch({executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true});
  try {
    const context = await browser.newContext({viewport: {width: 420, height: 760}, colorScheme: 'light'});
    // Simulate one extension-wide storage area across separate local pages.
    // Production still uses Chrome storage; this bridge is test-only.
    const appearanceStore = {};
    await context.exposeBinding('readUIStorage', () => ({...appearanceStore}));
    await context.exposeBinding('writeUIStorage', async (_source, values) => {
      const changes = {};
      for (const [key, newValue] of Object.entries(values)) {
        changes[key] = {oldValue: appearanceStore[key], newValue};
        appearanceStore[key] = newValue;
      }
      await Promise.all(context.pages().map(page => page.evaluate(changes => {
        globalThis.fixtureStorageChanged?.(changes, 'local');
      }, changes)));
    });
    await context.addInitScript(() => {
      const listeners = [];
      globalThis.fixtureStorageChanged = (changes, area) => listeners.forEach(listener => listener(changes, area));
      globalThis.fixtureStorage = {local: {get: () => readUIStorage(), set: values => writeUIStorage(values)},
        onChanged: {addListener: listener => listeners.push(listener)}};
    });
    await context.route('https://*.pstatic.net/**', route => {
      const number = Number(/photo(\d)/.exec(route.request().url())?.[1] || 0);
      return route.fulfill({contentType: 'image/svg+xml', body: landscape(number)});
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.name));
    await page.addInitScript(() => {
      const images = [1, 2, 3].map(index => ({index, id: `https://postfiles.pstatic.net/fixture/photo${index}.jpg`,
        src: `https://postfiles.pstatic.net/fixture/photo${index}.jpg`, preview: `https://postfiles.pstatic.net/fixture/photo${index}.jpg?type=w200`,
        width: 2400 + index * 100, height: 1600 + index * 100}));
      const post = {key: 'example_223123456789', blogId: 'example', logNo: '223123456789', url: 'https://blog.naver.com/example/223123456789'};
      globalThis.fixture = {settings: {folder: 'NaverBlog'},
        scan: {post, title: '\uC8FC\uB9D0\uC758 \uAE30\uB85D, \uC0B0\uCC45\uAE38\uC5D0\uC11C \uB9CC\uB09C \uD48D\uACBD', images},
        jobs: [{id: 'fixture-job', folder: 'NaverBlog', post, title: 'Fixture', tasks: images.map(image => ({image, status: 'complete', error: '', bytes: 42000,
          downloadId: image.index, savedFilename: `C:\\Downloads\\NaverBlog\\${post.key}\\00${image.index}_photo${image.index}.jpg`}))}],
        logs: ['[fixture] scan_received count=3', '[fixture] download_complete count=3'], calls: []};
      globalThis.chrome = {runtime: {getURL: resource => 'chrome-extension://fixture/' + resource,
        getManifest: () => ({version: '0.4.0'}), sendMessage: async message => {
        fixture.calls.push(message);
        if (message.type === 'GET_VIEW') return {ok: true, data: fixture};
        if (message.type === 'SAVE_SETTINGS') {fixture.settings = message.settings; return {ok: true, data: message.settings};}
        if (message.type === 'DOWNLOAD') {fixture.settings.folder = message.folder; return {ok: true, data: {queued: message.ids.length, folder: message.folder}};}
        return {ok: true, data: {}};
      }}, tabs: {query: async () => [{id: 7}], sendMessage: async () => ({ok: true}),
        create: async options => {fixture.calls.push({type: 'OPEN_TAB', ...options}); return {id: 8};}},
        downloads: {show: id => fixture.calls.push({type: 'SHOW', id})}, storage: fixtureStorage};
    });
    await page.goto(pathToFileURL(path.join(root, 'extension/popup.html')).href);
    await page.waitForFunction(() => document.querySelectorAll('.image-card').length === 3);
    assert.equal(await page.locator('.image-card.selected').count(), 3);
    assert.equal(await page.locator('#autoDownload').count(), 0);
    assert.equal(await page.locator('#quality').count(), 0);
    assert.equal(await page.locator('#clearHistory').count(), 0);
    assert.equal(await page.locator('#githubProfile').getAttribute('href'), 'https://github.com/hsofficial');
    assert.equal((await page.locator('#githubProfile').textContent()).trim(), '');
    assert.equal(await page.locator('#githubProfile .github-icon').count(), 1);
    await page.waitForFunction(() => document.querySelector('#githubProfile img').naturalWidth === 16);
    await page.waitForFunction(() => document.documentElement.dataset.colorPreference === 'system');
    assert.equal(await page.locator('html').getAttribute('data-color-mode'), 'light');
    await page.emulateMedia({colorScheme: 'dark'});
    await page.waitForFunction(() => document.documentElement.dataset.colorMode === 'dark');
    await page.locator('[data-color-mode-value="light"]').click();
    await page.waitForFunction(() => document.documentElement.dataset.colorMode === 'light');
    await page.waitForFunction(async () => (await chrome.storage.local.get()).uiColorMode === 'light');
    await page.reload();
    await page.waitForFunction(() => document.querySelectorAll('.image-card').length === 3 && document.documentElement.dataset.colorPreference === 'light');
    assert.equal(await page.locator('html').getAttribute('data-color-mode'), 'light');
    await page.locator('[data-color-mode-value="system"]').click();
    await page.waitForFunction(() => document.documentElement.dataset.colorMode === 'dark');
    await page.evaluate(() => {fixture.jobs = [];});
    await page.waitForFunction(() => document.querySelectorAll('.job').length === 0);
    await page.screenshot({path: path.join(artifacts, 'popup-dark-preview.png'), fullPage: true});
    await page.emulateMedia({colorScheme: 'light'});
    await page.waitForFunction(() => document.documentElement.dataset.colorMode === 'light');
    // Restore an actual-path card for the pre-existing folder regression.
    await page.reload();
    await page.waitForFunction(() => document.querySelectorAll('.job').length === 1);
    assert.equal(await page.locator('#iuThemeBanner').isVisible(), false);
    await page.locator('#openSource').click();
    assert.equal(await page.evaluate(() => fixture.calls.find(call => call.type === 'OPEN_TAB').url), 'chrome-extension://fixture/about.html');
    await page.locator('.settings summary').click();
    await page.locator('#folder').fill('Photos\\Trip');
    await page.locator('.image-card input').first().uncheck();
    assert.equal(await page.locator('.image-card.selected').count(), 2);
    await page.locator('#download').click();
    await page.waitForFunction(() => fixture.calls.some(call => call.type === 'DOWNLOAD'));
    const download = await page.evaluate(() => fixture.calls.find(call => call.type === 'DOWNLOAD'));
    assert.equal(download.ids.length, 2);
    assert.equal(download.postKey, 'example_223123456789');
    assert.equal(download.folder, 'Photos/Trip');
    assert.equal(await page.evaluate(() => fixture.calls.filter(call => call.type === 'SAVE_SETTINGS').length), 0);
    assert.ok((await page.locator('#destination').textContent()).includes('Photos/Trip/' + download.postKey));
    assert.ok((await page.locator('#jobs').textContent()).includes('C:\\Downloads\\NaverBlog'));
    await page.locator('#jobs button').last().click();
    assert.equal(await page.evaluate(() => fixture.calls.find(call => call.type === 'SHOW').id), 3);
    // An invalid folder must never dispatch a partial download request.
    const downloadCount = await page.evaluate(() => fixture.calls.filter(call => call.type === 'DOWNLOAD').length);
    await page.locator('#folder').fill('../invalid-draft');
    await page.locator('#download').click();
    await page.waitForFunction(() => document.getElementById('notice').classList.contains('error'));
    assert.equal(await page.evaluate(() => fixture.calls.filter(call => call.type === 'DOWNLOAD').length), downloadCount);
    assert.equal(await page.evaluate(() => fixture.settings.folder), 'Photos/Trip');
    assert.equal(await page.locator('#folder').inputValue(), '../invalid-draft');
    await page.locator('#folder').fill('NaverBlog');
    await page.locator('#saveSettings').click();
    await page.waitForFunction(() => fixture.settings.folder === 'NaverBlog');
    await page.locator('.settings summary').click();
    await page.locator('#selectAll').check();
    assert.equal(await page.locator('.image-card.selected').count(), 3);
    await page.screenshot({path: path.join(artifacts, 'popup-preview.png'), fullPage: true});
    console.log('[browser] popup_manual_folder_settings_pass');

    // A title-only refresh must change the palette without changing selection.
    await page.evaluate(() => {fixture.scan.title = '[\uC544\uC774\uC720] Light stick theme preview'; fixture.jobs = [];});
    await page.waitForFunction(() => document.documentElement.classList.contains('iu-theme'));
    assert.equal(await page.locator('#iuThemeBanner').isVisible(), true);
    assert.equal(await page.locator('#iuThemeBanner').textContent().then(text => text.includes('IU LIGHT')), false);
    assert.equal(await page.locator('#iuThemeBanner p').textContent(), '\uC190\uD2C8\uC0C8\uB85C \uBE44\uCD94\uB294 \uC544\uC774\uC720 \uCC38\uC88B\uB2E4\uD83D\uDC9C');
    assert.equal(await page.locator('.image-card.selected').count(), 3);
    await page.waitForFunction(() => document.querySelector('#iuThemeBanner img').naturalWidth > 0);
    assert.equal(await page.locator('#download').evaluate(node => getComputedStyle(node).backgroundColor), 'rgb(134, 83, 181)');
    await page.locator('#openSource').click();
    assert.equal(await page.evaluate(() => fixture.calls.filter(call => call.type === 'OPEN_TAB').at(-1).url), 'chrome-extension://fixture/about.html?theme=iu');
    await page.screenshot({path: path.join(artifacts, 'iu-theme-preview.png'), fullPage: true});
    await page.locator('[data-color-mode-value="dark"]').click();
    await page.waitForFunction(() => document.documentElement.dataset.colorMode === 'dark');
    await page.screenshot({path: path.join(artifacts, 'iu-theme-dark-preview.png'), fullPage: true});

    // Check text insertion rather than HTML insertion with hostile page titles.
    await page.evaluate(() => {fixture.scan.title = '<img src=x onerror=alert(1)>';});
    await page.waitForFunction(() => document.getElementById('postTitle').textContent === '<img src=x onerror=alert(1)>');
    assert.equal(await page.locator('#postTitle img').count(), 0);
    assert.equal(await page.locator('#iuThemeBanner').isVisible(), false);
    assert.equal(await page.evaluate(() => document.documentElement.classList.contains('iu-theme')), false);
    assert.equal(await page.locator('html').getAttribute('data-color-mode'), 'dark');
    assert.equal(await page.locator('#download').evaluate(node => getComputedStyle(node).backgroundColor), 'rgb(37, 135, 91)');
    await page.evaluate(() => {fixture.scan = null; fixture.jobs = [];});
    await page.waitForFunction(() => document.querySelectorAll('.image-card').length === 0);
    assert.equal(await page.locator('#download').isDisabled(), true);
    await page.screenshot({path: path.join(artifacts, 'popup-empty.png'), fullPage: true});
    await page.locator('[data-color-mode-value="system"]').click();

    // Real browser DOM fixture covers modern body metadata, lazy loading,
    // duplicates, a legacy body, and exclusion of comment/profile images.
    const domPage = await context.newPage();
    await domPage.setContent(`<meta property="og:title" content="Fixture post"><div class="profile"><img src="https://postfiles.pstatic.net/profile.jpg"></div><div class="se-main-container"><a data-linktype="img" data-linkdata='{"src":"https://postfiles.pstatic.net/fixture/photo1.jpg?type=w80","originalWidth":4096,"originalHeight":2730}'><img src="https://postfiles.pstatic.net/fixture/photo1.jpg?type=w200"></a><img data-lazy-src="https://postfiles.pstatic.net/fixture/photo2.jpg?type=w80"><img src="https://postfiles.pstatic.net/fixture/photo1.jpg?type=w966"><div class="comment"><img src="https://postfiles.pstatic.net/comment.jpg"></div></div>`);
    await domPage.addScriptTag({path: path.join(root, 'extension/core.js')});
    let result = await domPage.evaluate(() => NBlogCore.collectImages(document, 'https://blog.naver.com/example/223123456789'));
    assert.equal(result.images.length, 2);
    assert.equal(result.images[0].width, 4096);
    assert.ok(!result.images[0].id.includes('type='));
    const listResult = await domPage.evaluate(() => NBlogCore.collectImages(document, 'https://blog.naver.com/example'));
    assert.equal(listResult, null);
    await domPage.evaluate(() => {document.querySelector('.se-main-container').innerHTML = '<img data-lazy-src="https://postfiles.pstatic.net/fixture/photo3.jpg?type=w80">';});
    result = await domPage.evaluate(() => NBlogCore.collectImages(document, 'https://m.blog.naver.com/example/223123456789'));
    assert.equal(result.images.length, 1);
    assert.ok(result.images[0].id.endsWith('photo3.jpg'));
    await domPage.setContent('<div id="postViewArea"><img src="https://postfiles.pstatic.net/fixture/photo1.jpg"></div>');
    await domPage.addScriptTag({path: path.join(root, 'extension/core.js')});
    result = await domPage.evaluate(() => NBlogCore.collectImages(document, 'https://blog.naver.com/PostView.naver?blogId=example&logNo=223123456789'));
    assert.equal(result.images.length, 1);

    // This reduced DOM reproduces the structure observed on the reported live
    // post: 37 typed photo links plus one middle OGQ sticker. Synthetic image
    // URLs keep regression runs independent of Naver networking and photos.
    const photoParts = Array.from({length: 37}, (_, index) => {
      const number = index + 1;
      const src = `https://postfiles.pstatic.net/fixture/photo${number}.jpg`;
      return `<a class="se-module-image-link __se_image_link __se_link" data-linktype="img" data-linkdata='${JSON.stringify({src, originalWidth: 4000, originalHeight: 2666})}'><img src="${src}?type=w80_blur" data-lazy-src="${src}?type=w773" class="se-image-resource"></a>`;
    });
    photoParts.splice(9, 0, '<div class="se-component se-sticker"><div class="se-module se-module-sticker"><a class="__se_sticker_link __se_link" data-linktype="sticker" data-linkdata=\'{"src":"","packCode":"ogq_6457f729fb5ef","seq":"9"}\'><img class="se-sticker-image" src="https://storep-phinf.pstatic.net/ogq_6457f729fb5ef/original_9.png?type=p100_100"></a></div></div>');
    await domPage.setContent(`<title>Gallery count regression</title><div class="se-main-container">${photoParts.join('')}</div>`);
    await domPage.addScriptTag({path: path.join(root, 'extension/core.js')});
    const counts = await domPage.evaluate(() => ({raw: document.querySelectorAll('.se-main-container img').length,
      scan: NBlogCore.collectImages(document, 'https://blog.naver.com/edament/224426042469')}));
    assert.equal(counts.raw, 38);
    assert.equal(counts.scan.images.length, 37);
    assert.deepEqual(counts.scan.images.map(image => image.index), Array.from({length: 37}, (_, index) => index + 1));
    assert.ok(counts.scan.images[8].src.endsWith('photo9.jpg'));
    assert.ok(counts.scan.images[9].src.endsWith('photo10.jpg'));
    assert.ok(counts.scan.images[36].src.endsWith('photo37.jpg'));
    await page.evaluate(scan => {fixture.scan = scan; fixture.jobs = [];}, counts.scan);
    await page.waitForFunction(() => document.querySelectorAll('.image-card').length === 37);
    assert.equal(await page.locator('.image-card.selected').count(), 37);
    await page.screenshot({path: path.join(artifacts, 'gallery-count-regression.png'), fullPage: true});
    console.log('[browser] gallery_photo_count_pass raw=38 collected=37 sticker_excluded=1');

    // The about page uses real local markup and CSS. Only the extension runtime
    // and file fetch are mocked because file:// pages do not have Chrome APIs.
    const about = await context.newPage();
    about.on('pageerror', error => errors.push(error.name));
    const license = fs.readFileSync(path.join(root, 'extension/LICENSE'), 'utf8');
    await about.addInitScript(({license}) => {
      globalThis.chrome = {runtime: {getManifest: () => ({version: '0.4.0'}), getURL: resource => 'chrome-extension://fixture/' + resource}, storage: fixtureStorage};
      globalThis.fetch = async resource => {
        if (resource !== 'chrome-extension://fixture/LICENSE') throw new Error('unexpected_resource');
        return new Response(license, {status: 200});
      };
    }, {license});
    const aboutURL = pathToFileURL(path.join(root, 'extension/about.html')).href;
    await about.setViewportSize({width: 1280, height: 900});
    await about.goto(aboutURL);
    await about.waitForFunction(() => document.getElementById('licenseText').textContent.includes('GNU GENERAL PUBLIC LICENSE'));
    assert.equal(await about.locator('#licenseText').textContent(), license);
    assert.equal(await about.locator('#projectVersion').textContent(), 'v0.4.0');
    assert.equal(await about.locator('.card').count(), 4);
    await about.waitForFunction(() => document.querySelector('.profile-link img').naturalWidth === 16);
    assert.equal(await about.evaluate(() => document.documentElement.classList.contains('iu-theme')), false);
    await about.locator('#licenseDetails summary').click();
    assert.equal(await about.locator('#licenseText').isVisible(), true);
    await about.locator('#licenseDetails summary').click();
    await about.goto(aboutURL + '?theme=iu');
    assert.equal(await about.evaluate(() => document.documentElement.classList.contains('iu-theme')), true);
    await about.screenshot({path: path.join(artifacts, 'about-iu-preview.png'), fullPage: true});
    // A preference chosen on the popup updates an already-open credits page.
    await page.locator('[data-color-mode-value="dark"]').click();
    await about.waitForFunction(() => document.documentElement.dataset.colorMode === 'dark');
    await about.screenshot({path: path.join(artifacts, 'about-iu-dark-preview.png'), fullPage: true});
    await about.locator('[data-color-mode-value="light"]').click();
    await page.waitForFunction(() => document.documentElement.dataset.colorMode === 'light');
    await about.setViewportSize({width: 390, height: 844});
    assert.equal(await about.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await about.goto(aboutURL + '?theme=unexpected');
    assert.equal(await about.evaluate(() => document.documentElement.classList.contains('iu-theme')), false);
    await about.locator('[data-color-mode-value="system"]').click();
    await about.emulateMedia({colorScheme: 'dark'});
    await about.waitForFunction(() => document.documentElement.dataset.colorMode === 'dark');
    await about.setViewportSize({width: 1280, height: 900});
    await about.screenshot({path: path.join(artifacts, 'about-dark-preview.png'), fullPage: true});
    console.log('[browser] system_manual_persisted_and_cross_page_color_modes_pass');
    console.log('[browser] iu_theme_reset_and_local_about_pass');
    assert.deepEqual(errors, []);
    console.log('[browser] real_dom_fixture_pass');
    console.log('[browser] native_extension_install_and_live_naver_not_tested');
    console.log('[browser] screenshot=artifacts/popup-preview.png');
  } finally {await browser.close();}
}
main().catch(error => {
  const ascii = String(error.message).replace(/[^\x20-\x7e]/g, character => '\\u' + character.charCodeAt(0).toString(16).padStart(4, '0'));
  console.error('[browser] smoke_failed ' + ascii);
  process.exitCode = 1;
});
