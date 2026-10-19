import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { startServer } from '../../server/index.js';
import { APP_VERSION } from '../../shared/constants.js';

// Exercise the real lobby and report with the prepared production catalogue.
// The supported no-download-index path keeps bulk resource preparation out of this UI check.
test('lobby report, custom bond references, augment search and profile statistics', { skip: process.env.SP_E2E !== '1' }, async () => {
  const root = process.cwd();
  const screenshotDir = process.env.SP_SCREENSHOT_DIR;
  if (screenshotDir) mkdirSync(screenshotDir, { recursive: true });
  const server = await startServer({ host: '127.0.0.1', port: 0, quiet: true, dataDir: path.join(root, 'content/production/data'),
    handleRequest(req, res) {
      const p = new URL(req.url, 'http://localhost').pathname.replace(/^\/(assets|fonts)\/~[^/]+\//, '/$1/');
      if (p === '/dev/ursus-config.json' || p === '/vendor/browser-resources.json') { res.statusCode = 404; res.end(); return true; }
      if (p.startsWith('/assets/') || p.startsWith('/fonts/')) {
        const f = [root + '/content/production' + p, root + '/.cache/local-production/public' + p,
          ...(process.env.SP_REPORT_ASSETS ? [process.env.SP_REPORT_ASSETS + p] : [])].find((f) => existsSync(f));
        if (f) { res.setHeader('Content-Type', p.endsWith('.png') ? 'image/png' : p.endsWith('.woff2') ? 'font/woff2' : 'image/webp'); res.end(readFileSync(f)); return true; }
      }
      return false;
    } });
  const P = (await import('puppeteer-core')).default;
  const browser = await P.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  try {
    const page = await browser.newPage(), errors = [], requests = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setBypassServiceWorker(true);
    await page.evaluateOnNewDocument((version) => localStorage.setItem('sp.patchNotes.seenVersion', version), APP_VERSION);
    await page.setRequestInterception(true);
    page.on('request', (r) => {
      const u = new URL(r.url()); requests.push(u.pathname);
      if (u.hostname !== '127.0.0.1' || /resource-worker\.js$/.test(u.pathname)) r.abort(); else r.continue();
    });
    await page.goto(server.url, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!globalThis.__SP__);
    await page.evaluate(() => { __SP__.store.patch('session', { entered: true }); __SP__.net.setName('리포트 확인'); });
    await page.waitForSelector('.lobby-sweep');
    assert.ok(!requests.includes('/js/screens/sweep.js'), 'report code is lazy');
    assert.ok(!requests.includes('/css/screens/sweep.css'), 'report styles are lazy');
    assert.equal(await page.$$('.me-chip__stats').then((x) => x.length), 1);
    const capture = async (name) => { if (screenshotDir) { await page.evaluate(() => document.activeElement?.blur()); await page.screenshot({ path: path.join(screenshotDir, name + '.png') }); } };
    await capture('lobby');
    await page.click('.lobby-sweep'); await page.waitForSelector('.sw-tile');
    assert.equal(await page.$$('.sw-tab').then((x) => x.length), 4);
    const choose = async (name) => { await page.click(`.sw-tile[title="${name}"]`); await page.waitForFunction((name) => document.querySelector('.sw-hero__name')?.textContent === name, {}, name); };
    for (const [bond, strategy, equipment] of [['우르수스', '카셰이', '우르수스'], ['라이타니엔', '위치킹', '라이타니엔']]) {
      await choose(bond);
      assert.equal(await page.$$('.sw-op').then((x) => x.length), 10);
      if (bond === '우르수스') assert.ok(await page.$eval('.sw-left', (e) => e.textContent.includes('제국 드론')));
      await page.$eval('.sw-related--equipment', (e) => { e.open = true; });
      assert.equal(await page.$$('.sw-related--equipment .sw-equipment').then((x) => x.length), 2);
      assert.ok((await page.$eval('.sw-related--equipment', (e) => e.textContent)).includes(equipment));
      if (process.env.SP_REPORT_ASSETS) await page.waitForFunction(() => document.querySelectorAll('.sw-related--equipment img').length === 2);
      await capture(bond === '우르수스' ? 'ursus' : 'leithanien');
      await page.$$eval('.sw-related', (es) => es.forEach((e) => { e.open = true; }));
      await page.$$eval('.sw-related__links button', (es, name) => es.find((e) => e.textContent.includes(name)).click(), strategy);
      await page.waitForFunction((name) => document.querySelector('.sw-body').dataset.tab === 'bands' && document.querySelector('.sw-hero__name')?.textContent === name, {}, strategy);
      await page.click('.sw-tab');
    }
    const gameMembersForBond = (id) => {
      const bonds = JSON.parse(readFileSync(path.join(root, 'content/production/data/bonds.json')));
      const chess = JSON.parse(readFileSync(path.join(root, 'content/production/data/chess.json')));
      return (bonds[id].visibleMembers || bonds[id].members).filter((id) => chess[id] && !chess[id].optionalRecruit).length;
    };
    await choose('염국');
    const expectedMembers = gameMembersForBond('yanShip');
    assert.equal(await page.$$('.sw-op').then((x) => x.length), expectedMembers);
    await page.$$eval('.sw-tab', (es) => es[2].click()); await page.waitForSelector('.sw-allcodex');
    await page.click('.sw-allcodex'); await page.waitForSelector('.sw-codex');
    await page.keyboard.press('Escape'); await page.waitForSelector('.sw-codex', { hidden: true });
    assert.ok(await page.$('.sw'), 'Escape closes the nested codex first');
    await page.$$eval('.sw-tab', (es) => es[3].click()); await page.waitForSelector('.sw-filter');
    assert.equal(await page.$eval('.sw-right', (e) => e.scrollTop), 0, 'changing tabs resets the list scroll');
    const { reportAugments } = await import('../../public/js/screens/sweep.js');
    const game = Object.fromEntries(['bonds', 'chess', 'items'].map((k) => [k, JSON.parse(readFileSync(path.join(root, `content/production/data/${k}.json`)))]));
    const catalog = reportAugments(game);
    assert.equal(await page.$$('.sw-tile').then((x) => x.length), catalog.length);
    await capture('augments');
    await page.type('[aria-label="증강 검색"]', '뮤엘시스의 지원');
    await page.waitForFunction(() => document.querySelectorAll('.sw-tile').length === 1);
    await page.click('.sw-tile');
    await page.waitForFunction(() => {
      const img = document.querySelector('.sw-tile--augment img');
      return img?.complete && img.naturalWidth > 0 && img.src.includes('is_choice_morph.png');
    });
    assert.equal(await page.$eval('.sw-tile--augment img', (e) => getComputedStyle(e).filter), 'none', 'the replacement glyph is shown without silhouette conversion');
    await capture('augment-icon-structure');
    await page.$eval('[aria-label="증강 검색"]', (e) => { e.value = ''; e.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.type('[aria-label="증강 검색"]', '라이타니엔');
    await page.waitForFunction(() => document.querySelectorAll('.sw-tile').length === 7);
    assert.equal(await page.$$('.sw-filter select').then((x) => x.length), 0, 'search remains without target/grade filters');
    await page.$eval('[aria-label="증강 검색"]', (e) => { e.value = ''; e.dispatchEvent(new Event('input', { bubbles: true })); });
    for (const [width, height] of [[1280, 720], [756, 366], [390, 844]]) {
      await page.setViewport({ width, height });
      const layout = await page.evaluate(() => {
        const r = document.querySelector('.sw').getBoundingClientRect(), header = document.querySelector('.sw-top');
        return { width: innerWidth, left: r.left, right: r.right, headerOverflow: header.scrollWidth > header.clientWidth + 1,
          tabs: [...document.querySelectorAll('.sw-tab')].map((e) => { const r = e.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; }) };
      });
      assert.ok(!layout.headerOverflow, JSON.stringify(layout));
      assert.ok(layout.tabs.every((r) => r.left >= 0 && r.right <= width + 1 && r.bottom <= height), JSON.stringify(layout));
      await capture('augments-' + width);
    }
    await page.keyboard.press('Escape'); await page.waitForSelector('.sw', { hidden: true });
    await page.setViewport({ width: 1920, height: 1080 });
    await page.focus('.me-chip--btn'); await page.keyboard.press('Enter'); await page.waitForSelector('.st');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await server.close(); }
});
