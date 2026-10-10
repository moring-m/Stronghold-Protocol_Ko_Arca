// Browser check of 设置 →「文字大小」 (opt-in, needs Chrome, ~30 s):
//   SP_E2E=1 CHROME_PATH=… node --test test/ui/text-scale.e2e.test.js
//
// A 844×390 landscape phone: 1rem is clamped at 40 px, so the .18rem body text is 7.2 CSS px. The setting steps the text
// root `--t` (css/theme.css) instead of the layout root: the readable text grows, while `documentElement`'s font-size,
// the modal's rem-sized box and — through the dev mock's 休整期 screen — the field host, the canvas and the shop bar stay
// exactly where they were. Static counterpart: test/ui/text-scale.test.js.

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ENABLED = process.env.SP_E2E === '1' && existsSync(CHROME);
const PHONE = { width: 844, height: 390 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The settings the mock harness reads: `sp.pref.settings` with one text step (the argument is passed into the page —
 *  evaluateOnNewDocument cannot see a closure). */
const seedSettings = (page, textSize) => page.evaluateOnNewDocument((ts) => {
  try { if(!sessionStorage.getItem('text-size-seeded')) {localStorage.setItem('sp.pref.settings', JSON.stringify({ textSize: ts }));sessionStorage.setItem('text-size-seeded','1');} } catch { /* ignore */ }
}, textSize);

describe('文字大小 on a phone (headless Chrome)', { skip: !ENABLED && 'set SP_E2E=1 (and have Chrome) to run' }, () => {
  let srv;
  let browser;
  let base;

  before(async () => {
    const { startServer } = await import('../../server/index.js');
    const puppeteer = (await import('puppeteer-core')).default;
    srv = await startServer({ port: 0, host: '127.0.0.1', quiet: true });
    base = `http://127.0.0.1:${srv.port}`;
    browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--force-device-scale-factor=1'] });
  });

  after(async () => {
    await browser?.close();
    await srv?.close();
  });

  /** A page watching for console / page errors, with `sp.pref.settings` seeded before the first script runs. */
  async function open(url, textSize, { seed = true } = {}) {
    const page = await browser.newPage();
    await page.evaluateOnNewDocument(()=>{localStorage.setItem('sp.name','글자 크기 검증');sessionStorage.setItem('sp.entered','1');localStorage.setItem('sp.patchNotes.seenVersion','0.2.3a');});
    await selfHostedAssets(page);
    await page.setViewport(PHONE);
    const problems = [];
    page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|Refused to apply style|Spine: error in texture loader/.test(m.text())) problems.push(`console: ${m.text()}`); });
    page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
    if (seed && textSize) await seedSettings(page, textSize);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    return { page, problems };
  }

  /** What the settings modal shows at this step: the roots, a readable label, its Latin micro label, the box. */
  const modalMetrics = (page) => page.evaluate(() => {
    const px = (sel, prop = 'fontSize') => {
      const el = document.querySelector(sel);
      return el ? parseFloat(getComputedStyle(el)[prop]) : null;
    };
    const box = document.querySelector('.modal__box')?.getBoundingClientRect();
    const body = document.querySelector('.modal__body');
    const on = document.querySelector('[data-testid="text-size"] option:checked');
    // nothing may stick out of the modal's box (the label wraps and the four steps fit its row)
    let outRight = 0;
    for (const el of document.querySelectorAll('.modal__box *')) {
      const r = el.getBoundingClientRect();
      if (box && r.width > 0) outRight = Math.max(outRight, r.right - box.right);
    }
    return {
      root: parseFloat(getComputedStyle(document.documentElement).fontSize),
      label: px('.set-row__label'),
      micro: px('.set-row__label .micro'),
      modalWidth: box ? Math.round(box.width) : null,
      bodyOverflowX: body ? body.scrollWidth - body.clientWidth : null,
      outRight: Math.round(outRight),
      step: on?.textContent ?? null,
      hint: document.querySelector('.set-textsize-note')?.textContent ?? null,
    };
  });

  test('four text steps grow the categorized settings without moving the field/layout root',async()=>{
   const {page}=await open(base,'sm');await page.waitForSelector('.lobby-screen');
   await page.click('[data-testid="settings-btn"]');await page.waitForSelector('[data-testid="text-size"]');
   const measures=[];
   for(const value of ['sm','md','lg','xl']){
    await page.select('[data-testid="text-size"]',value);await sleep(150);measures.push(await modalMetrics(page));
   }
   const [sm,md,lg,xl]=measures;
   assert.ok(md.label>sm.label&&lg.label>md.label&&xl.label>lg.label);
   for(const m of measures){assert.equal(m.root,40);assert.equal(m.modalWidth,sm.modalWidth);assert.ok(m.bodyOverflowX<=1);assert.ok(m.outRight<=1);}
   assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('sp.pref.settings')).textSize),'xl');
   await page.reload({waitUntil:'domcontentloaded'});await page.waitForSelector('.lobby-screen');
   await page.click('[data-testid="settings-btn"]');await page.waitForSelector('[data-testid="text-size"]');
   assert.equal(await page.$eval('[data-testid="text-size"]',e=>e.value),'xl');await page.close();
  });

  test('the in-match field, canvas and shop bar do not move; the settings dialog in a match grows', async () => {
    const measure = async (textSize) => {
      const { page, problems } = await open(`${base}/dev/game-mock.html?shot=1&phase=PREP&variant=settings`, textSize);
      await page.waitForFunction(() => !!document.querySelector('.screen:not(.gload)'), { timeout: 15000 });
      await page.waitForSelector('.gm__field canvas');
      await sleep(900);
      const m = await page.evaluate(() => {
        const box = (sel) => {
          const el = document.querySelector(sel);
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)];
        };
        return {
          root: parseFloat(getComputedStyle(document.documentElement).fontSize),
          field: box('.gm__field'),
          canvas: box('.gm__field canvas'),
          shopbar: box('.gm__hud .shopbar'),
          label: (() => { const el = document.querySelector('.set-row__label'); return el ? parseFloat(getComputedStyle(el).fontSize) : null; })(),
        };
      });
      return { ...m, problems, page };
    };

    const small = await measure('sm');
    const big = await measure('xl');
    assert.ok(small.field && small.shopbar, 'the prep screen with its HUD is on screen');
    assert.equal(small.root, 40);
    assert.equal(big.root, 40, 'the text step never reaches the root');
    assert.deepEqual(big.field, small.field, 'the field host (host.clientWidth / clientHeight) is unchanged');
    assert.deepEqual(big.canvas, small.canvas, 'and so is the canvas the renderer resizes to it');
    assert.deepEqual(big.shopbar, small.shopbar, 'the shop bar is a fixed HUD box: still the design\'s size');
    assert.ok(big.label > small.label * 1.9, `while the dialog's readable text grows (${small.label} → ${big.label})`);
    assert.deepEqual(small.problems, []);
    assert.deepEqual(big.problems, []);
    await small.page.close();
    await big.page.close();
  });
});

// Geometry tests use a self-hosted fixture without model assets. Missing textures are expected;
// uncaught page errors remain failures. Resource/model loading has separate integration tests.
async function selfHostedAssets(page){
 await page.setRequestInterception(true);
 page.on('request',request=>{
  const url=request.url();
  if(url.endsWith('/vendor/browser-resources.json'))return request.respond({status:404,body:''});
  if(url.endsWith('/dev/ursus-config.json'))return request.respond({status:200,contentType:'application/json',body:'null'});
  if(url.endsWith('/fonts/fonts.css'))return request.respond({status:200,contentType:'text/css',body:''});
  if(url.includes('fonts.googleapis.com')||url.includes('fonts.gstatic.com'))return request.respond({status:200,body:''});
  request.continue();
 });
}
