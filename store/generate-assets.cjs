/* Store artwork rendered from the unchanged extension UI with synthetic data.
 * Chrome APIs are mocked. These images are not proof of a native download.
 * Optional dev tool: PLAYWRIGHT_PATH can point to an installed Playwright.
 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {chromium} = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const root = path.resolve(__dirname, '..');
const output = path.join(__dirname, 'assets');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'extension/manifest.json'), 'utf8'));
const license = fs.readFileSync(path.join(root, 'extension/LICENSE'), 'utf8');
const icon = 'data:image/png;base64,' + fs.readFileSync(path.join(root, 'extension/icons/icon-128.png')).toString('base64');
const asData = buffer => 'data:image/png;base64,' + buffer.toString('base64');
function landscape(number) {
  const colors = [['#d7e7e3','#8ebaaa','#335b4c'], ['#f6dfba','#d2ad8a','#826c56'], ['#d3dee5','#7fa4b4','#3d6474']][number % 3];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 240"><rect width="360" height="240" fill="${colors[0]}"/><circle cx="270" cy="65" r="25" fill="#fff8da"/><path d="M0 185L90 60L210 180L290 120L360 195V240H0Z" fill="${colors[1]}"/><path d="M0 220L95 160L195 205L300 130L360 170V240H0Z" fill="${colors[2]}"/></svg>`;
}

async function main() {
  fs.mkdirSync(output, {recursive: true});
  const browser = await chromium.launch({headless: true, executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  const generated = [];
  try {
    const context = await browser.newContext({viewport: {width: 420, height: 1100}, colorScheme: 'light'});
    const errors = [];
    context.on('page', page => page.on('pageerror', error => errors.push(error.name)));
    await context.route('https://*.pstatic.net/**', route => route.fulfill({contentType: 'image/svg+xml', body: landscape(Number(/photo(\d+)/.exec(route.request().url())?.[1] || 0))}));
    await context.addInitScript(({version, license}) => {
      const listeners = [];
      const storage = {};
      const post = {key: 'sample_223123456789', blogId: 'sample', logNo: '223123456789', url: 'https://blog.naver.com/sample/223123456789'};
      const images = Array.from({length: 6}, (_, number) => {
        const index = number + 1, src = `https://postfiles.pstatic.net/fixture/photo${index}.jpg`;
        return {index, id: src, src, preview: src + '?type=w200', width: 4000, height: 2666};
      });
      globalThis.fixture = {settings: {folder: 'NaverBlog'}, scan: {post, title: '주말 산책에서 만난 여섯 가지 풍경', images}, jobs: [], logs: ['[fixture] sample_scan count=6']};
      globalThis.chrome = {
        storage: {local: {get: async () => ({...storage}), set: async values => {
          Object.assign(storage, values);
          listeners.forEach(listener => listener(Object.fromEntries(Object.entries(values).map(([key, newValue]) => [key, {newValue}])), 'local'));
        }}, onChanged: {addListener: listener => listeners.push(listener)}},
        runtime: {getManifest: () => ({version}), getURL: resource => 'chrome-extension://fixture/' + resource,
          sendMessage: async message => {
            if (message.type === 'GET_VIEW') return {ok: true, data: fixture};
            if (message.type === 'SAVE_SETTINGS') {fixture.settings = message.settings; return {ok: true, data: message.settings};}
            if (message.type === 'DOWNLOAD') {
              fixture.jobs = [{id: 'sample-job', post, title: fixture.scan.title, folder: message.folder,
                tasks: images.filter(image => message.ids.includes(image.id)).map(image => ({image, status: 'complete', error: '', downloadId: image.index,
                  savedFilename: `C:\\Downloads\\${message.folder.replaceAll('/', '\\')}\\${post.key}\\00${image.index}_photo${image.index}.jpg`}))}];
              return {ok: true, data: {queued: message.ids.length, folder: message.folder}};
            }
            return {ok: true, data: {}};
          }}, tabs: {query: async () => [{id: 7}], sendMessage: async () => ({ok: true}), create: async () => ({id: 8})},
        downloads: {show: () => {}}
      };
      globalThis.fetch = async resource => {
        if (resource !== 'chrome-extension://fixture/LICENSE') throw new Error('unexpected_resource');
        return new Response(license, {status: 200});
      };
    }, {version: manifest.version, license});
    const page = await context.newPage();
    await page.goto(pathToFileURL(path.join(root, 'extension/popup.html')).href);
    await page.waitForFunction(() => document.querySelectorAll('.image-card').length === 6);
    await page.locator('.image-card input').nth(1).uncheck();
    await page.locator('.image-card input').nth(4).uncheck();
    assert.equal(await page.locator('.image-card.selected').count(), 4);
    await page.waitForFunction(() => [...document.querySelectorAll('.image-card img')].every(image => image.complete && image.naturalWidth));
    const light = await page.locator('body').screenshot();
    await page.locator('[data-color-mode-value="dark"]').click();
    await page.waitForFunction(() => document.documentElement.dataset.colorMode === 'dark');
    const dark = await page.locator('body').screenshot();
    await page.evaluate(() => {fixture.scan.title = '[아이유] 응원봉 테마 예시';});
    await page.waitForFunction(() => document.documentElement.classList.contains('iu-theme'));
    const iu = await page.locator('body').screenshot();
    await page.evaluate(() => {fixture.scan.title = '주말 산책에서 만난 여섯 가지 풍경';});
    await page.waitForFunction(() => !document.documentElement.classList.contains('iu-theme'));
    await page.locator('[data-color-mode-value="light"]').click();
    await page.locator('.settings summary').click();
    await page.locator('#folder').fill('사진/네이버');
    await page.locator('#saveSettings').click();
    await page.locator('#download').click();
    await page.waitForFunction(() => document.querySelectorAll('.job').length === 1);
    // These are the real settings/progress components with clearly declared
    // sample values. No native filesystem write is performed by this fixture.
    const settings = await page.locator('.settings').screenshot();
    const result = await page.locator('.download-panel').screenshot();
    const about = await context.newPage();
    await about.setViewportSize({width: 1000, height: 900});
    await about.goto(pathToFileURL(path.join(root, 'extension/about.html')).href);
    await about.waitForFunction(() => document.getElementById('licenseText').textContent.includes('GNU GENERAL PUBLIC LICENSE'));
    const credits = await about.screenshot();

    const board = await context.newPage();
    await board.setViewportSize({width: 1280, height: 800});
    const styles = `*{box-sizing:border-box}body{margin:0;width:1280px;height:800px;overflow:hidden;font-family:'Malgun Gothic',sans-serif;background:#f0f4ee;color:#1d382b}.canvas{width:1280px;height:800px;padding:48px 64px;position:relative;background:radial-gradient(ellipse at 75% 30%,#dcebd7,transparent 65%)}.canvas.dark{background:radial-gradient(ellipse at 85% 35%,#32473c,#14231c 78%);color:#eef7ed}.canvas.iu{background:radial-gradient(ellipse at 85% 20%,#6d567b,#241c30 75%);color:#f6eefb}.brand{display:flex;align-items:center;gap:12px;font-size:15px;font-weight:700;letter-spacing:-.5px}.brand img{width:40px;height:40px}.copy{position:absolute;left:68px;top:180px;width:620px}.eyebrow{font-size:13px;letter-spacing:2px;color:#587963;font-weight:700}.dark .eyebrow,.iu .eyebrow{color:#c6dfb6}h1{font-size:48px;line-height:1.38;letter-spacing:-2.6px;margin:20px 0 24px;font-weight:800}p{font-size:19px;line-height:1.9;color:#56705c;margin:0}.dark p,.iu p{color:#c5d8c8}.features{margin-top:30px;display:flex;gap:9px;flex-wrap:wrap}.features span{padding:9px 13px;border:1px solid #a8c2a9;border-radius:9px;font-size:13px;font-weight:700}.dark .features span,.iu .features span{border-color:#6b876d}.foot{position:absolute;bottom:40px;left:68px;font-size:12px;color:#58705f}.dark .foot,.iu .foot{color:#b7cbbf}.screens{position:absolute;inset:48px 52px 48px auto;width:420px;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:14px}.screens img{object-fit:contain;width:auto;max-width:420px;max-height:700px;box-shadow:0 20px 60px #13342228;border:1px solid #aec7b4;border-radius:12px}.dark .screens img,.iu .screens img{border-color:#6d6178}.screens.stacked img{width:395px;max-height:360px}.screens.wide{width:560px;right:38px}.screens.wide img{width:560px;max-width:560px}.copy.narrow{width:540px}`;
    async function render(name, {theme='', eyebrow, title, description, features, shots, wide=false, stacked=false}) {
      await board.setContent(`<html lang="ko"><meta charset="utf-8"><style>${styles}</style><body><main class="canvas ${theme}"><div class="brand"><img src="${icon}" alt="">네이버 블로그 이미지 다운로더</div><section class="copy ${wide?'narrow':''}"><div class="eyebrow">${eyebrow}</div><h1>${title}</h1><p>${description}</p><div class="features">${features.map(text=>`<span>${text}</span>`).join('')}</div></section><div class="screens ${wide?'wide':''} ${stacked?'stacked':''}">${shots.map(src=>`<img src="${asData(src)}" alt="실제 확장 UI의 예시 데이터 화면">`).join('')}</div><div class="foot">v${manifest.version} · 실제 확장 UI / 샘플 이미지·작업 데이터로 구성한 예시 화면</div></main></body></html>`);
      await board.waitForFunction(() => [...document.images].every(image => image.complete && image.naturalWidth));
      await board.screenshot({path: path.join(output, name)});
      generated.push({file:name,width:1280,height:800,kind:'annotated-ui-screenshot'});
      console.log('[store] screenshot=' + name);
    }
    await render('01-select-1280x800.png', {eyebrow:'01 / SELECT',title:'블로그 사진,<br>보고 골라 저장하세요.',description:'본문 사진을 한눈에 미리보고<br>원하는 사진만 선택해 저장합니다.',features:['사진 미리보기','선택 다운로드','w3840 우선'],shots:[light]});
    await render('02-folders-1280x800.png', {eyebrow:'02 / SAVE',title:'저장 폴더까지<br>내 방식대로.',description:'다운로드 폴더 안의 하위 경로를 정하고<br>완료 카드에서 실제 저장 위치를 확인하세요.',features:['게시글별 폴더','실제 저장 경로','진행 상태'],shots:[settings,result],stacked:true});
    await render('03-dark-1280x800.png', {theme:'dark',eyebrow:'03 / APPEARANCE',title:'낮에도, 밤에도<br>편안하게.',description:'시스템 설정을 따르는 기본 모드.<br>라이트와 다크를 직접 선택할 수도 있습니다.',features:['시스템 기본','선택값 저장','라이트 / 다크'],shots:[dark]});
    await render('04-iu-1280x800.png', {theme:'iu',eyebrow:'04 / SPECIAL THEME',title:'제목에 아이유가 있다면,<br>조금 특별한 색으로.',description:'라벤더와 라임, 응원봉 모티프의 테마.<br>게시글 제목에 따라 자동으로 나타납니다.',features:['제목 기반 테마','라이트 / 다크 대응'],shots:[iu]});
    await render('05-open-source-1280x800.png', {eyebrow:'05 / OPEN SOURCE',title:'어떤 코드로<br>만들었는지도<br>확인하세요.',description:'원본과 참고 프로젝트, 라이선스 전문을<br>브라우저 안의 로컬 페이지에서 확인합니다.',features:['오픈소스 안내','동봉 라이선스'],shots:[credits],wide:true});

    // Promotional graphics are separate from screenshots and do not imitate
    // browser chrome or claim installation, ratings, or review approval.
    async function promo(name,width,height) {
      await board.setViewportSize({width,height});
      const small = width === 440;
      await board.setContent(`<html lang="ko"><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;width:${width}px;height:${height}px;overflow:hidden;font-family:'Malgun Gothic',sans-serif;background:#123f2d;color:white}.promo{width:100%;height:100%;display:flex;align-items:center;justify-content:center;gap:${small?24:100}px;background:radial-gradient(circle at 22% 30%,#438b51,transparent 55%)}img{width:${small?124:240}px;height:auto}h1{font-size:${small?25:54}px;letter-spacing:-1.5px;line-height:1.5;margin:0}p{font-size:${small?12:20}px;line-height:1.8;color:#c3e0c8;margin:12px 0 0}</style><body><div class="promo"><img src="${icon}" alt=""><div><h1>보고 고르고<br>선명하게 저장.</h1><p>네이버 블로그<br>이미지 다운로더</p></div></div></body></html>`);
      await board.waitForFunction(() => document.images[0].complete && document.images[0].naturalWidth);
      await board.screenshot({path:path.join(output,name)});
      generated.push({file:name,width,height,kind:'promotional-graphic'});
    }
    await promo('promo-small-440x280.png',440,280);
    await promo('promo-marquee-1400x560.png',1400,560);
    fs.copyFileSync(path.join(root,'extension/icons/icon-128.png'),path.join(output,'icon-current-128.png'));
    generated.push({file:'icon-current-128.png',width:128,height:128,kind:'current-package-icon-review-branding-before-submit'});
    assert.deepEqual(errors,[]);
    fs.writeFileSync(path.join(output,'asset-manifest.json'),JSON.stringify({version:manifest.version,generatedAt:new Date().toISOString(),source:'unchanged-extension-ui-with-mocked-chrome-apis',sampleImages:true,nativeDownloadsPerformed:false,files:generated},null,2)+'\n');
    console.log('[store] generated_assets=' + generated.length);
  } finally {await browser.close();}
}
main().catch(error=>{console.error('[store] asset_generation_failed ' + String(error.message).replace(/[^\x20-\x7e]/g,character=>'\\u'+character.charCodeAt(0).toString(16).padStart(4,'0')));process.exitCode=1;});
