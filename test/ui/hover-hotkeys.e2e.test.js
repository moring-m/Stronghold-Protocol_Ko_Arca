// Real pointer/keyboard regression: Q/X act on the hovered operator without a preceding click.
// SP_E2E=1 CHROME_PATH=/path/to/chrome node --test test/ui/hover-hotkeys.e2e.test.js
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ENABLED = process.env.SP_E2E === '1' && existsSync(CHROME);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

describe('hovered operator shortcuts', { skip: !ENABLED && 'set SP_E2E=1 and CHROME_PATH to run' }, () => {
  let srv, browser;
  before(async () => {
    const { startServer } = await import('../../server/index.js');
    const puppeteer = (await import('puppeteer-core')).default;
    srv = await startServer({ port: 0, host: '127.0.0.1', quiet: true, handleRequest(req,res){
      const path=new URL(req.url,'http://localhost').pathname;
      // The mock has no official shadow sprite; exercise its procedural fallback.
      if(path==='/data/assets.json'){const manifest=JSON.parse(readFileSync('data/assets.json'));delete manifest.ui?.['battle/sprite_shadow'];res.setHeader('Content-Type','application/json');res.end(JSON.stringify(manifest));return true;}
      const file=path==='/data/local-assets.json'?'content/production/data/local-assets.json':path.startsWith('/assets/local/')?'.cache/local-production/public'+path:null;
      if(!file||!existsSync(file))return false;
      if(path==='/data/local-assets.json'){const source=JSON.parse(readFileSync(file)),atlas=source.groups?.['map/autochess']?.TX_autochessi_D;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({version:1,groups:atlas&&existsSync('.cache/local-production/public'+atlas.path)?{'map/autochess':{TX_autochessi_D:atlas}}:{}}));return true;}
      res.setHeader('Content-Type',file.endsWith('.json')?'application/json':file.endsWith('.png')?'image/png':file.endsWith('.webp')?'image/webp':'application/octet-stream');res.end(readFileSync(file));return true;
    } });
    browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--no-proxy-server'] });
  });
  after(async () => { await browser?.close(); await srv?.close(); });

  for (const mode of ['fallback', '2d', '3d']) {
    test(`${mode}: no click required; current hover wins over selection; blocked actions stay inert`, async (t) => {
      if(mode==='3d'&&!existsSync('.cache/local-production/public/assets/local/map/autochess/TX_autochessi_D.png')){t.skip('3D board atlas is not installed');return;}
      const context = await browser.createBrowserContext();
      t.after(() => context.close());
      const page = await context.newPage();
      page.setDefaultTimeout(10000);
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.setViewport({ width: 1920, height: 1080 });
      await page.evaluateOnNewDocument(()=>{window.__HOTKEY_REJECTIONS__=[];window.addEventListener('unhandledrejection',e=>window.__HOTKEY_REJECTIONS__.push({type:e.reason?.type,message:e.reason?.message,src:e.reason?.target?.src,name:e.reason?.constructor?.name}));});
      await page.evaluateOnNewDocument(()=>localStorage.setItem('sp.pref.settings',JSON.stringify({renderScale:.5,mapQuality:'low',effectsQuality:'low',frameLimit:30,muted:true})));
      const renderer = mode === 'fallback' ? 'fallback' : 'engine';
      await page.goto(`${srv.url}/dev/game-mock.html?shot=1&phase=PREP&variant=temp&render=${renderer}&board=${mode}`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction((kind) => globalThis.__SP_VIEW__?.kind === kind, { timeout: 30000 }, renderer);
      if (renderer === 'fallback') await page.waitForSelector('.ff-piece');
      if (renderer === 'engine') {
        await page.waitForFunction((on) => globalThis.__SP_VIEW__.raw.stats().board3d.on === on, {}, mode === '3d');
      }
      const state = () => page.evaluate(() => JSON.parse(JSON.stringify(globalThis.__MOCK__.S().priv)));
      const sent = () => page.evaluate(() => globalThis.__MOCK__.S().requests.filter(([type]) => ['g.sell', 'g.move', 'g.destroy'].includes(type)));
      const removed = (uid) => page.waitForFunction((u) => {
        const p = globalThis.__MOCK__.S().priv;
        return ![...p.board, ...p.hand, ...p.temp].some((piece) => piece?.uid === u);
      }, {}, uid);
      const hover = async (uid, {occluded=false}={}) => {

        await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        // The engine picks by the tile under the pointer, including raised and mirrored tiles.
        // Resolve the location from current state so a retreated operator is addressed on the bench.
        const locate = () => page.evaluate((u) => {
          const view = globalThis.__SP_VIEW__, p = globalThis.__MOCK__.S().priv;
          if (view.kind === 'fallback') {
            const r = view.pieceScreenRect(u);
            return r && { x: r.left + r.width / 2, y: r.top + r.height / 2 };
          }
          const board = p.board.find((piece) => piece.uid === u);
          const hand = p.hand.findIndex((piece) => piece?.uid === u);
          const temp = p.temp.findIndex((piece) => piece?.uid === u);
          return board ? view.tileScreen(board.row, board.col) : hand >= 0 ? view.tileScreen(7, hand) : view.tileScreen(8, 4 + temp);
        }, uid);
        // A ready/shop camera transition can move the tile after its first projection.
        // Follow its current position rather than waiting forever at an obsolete point.
        let point,previous,stable=0;
        for(let attempt=0;attempt<40;attempt++){
          point=await locate();assert.ok(point, `piece ${uid} has a screen position`);
          stable=previous&&Math.hypot(previous.x-point.x,previous.y-point.y)<.2?stable+1:0;previous=point;
          await page.mouse.move(point.x,point.y);
          if(stable>=2&&(occluded||await page.evaluate((u,p)=>__SP_VIEW__.pieceAtClientPoint(p.x,p.y)===u,uid,point)))return point;
          await sleep(50);
        }
        assert.fail(`piece ${uid} could not be hovered at its current tile`);
      };
      const inert = async (why, keys = ['KeyQ', 'KeyX']) => {
        const before = await sent();
        for (const key of keys) await page.keyboard.press(key);
        await sleep(180); // The mock replies within 100 ms; a wrongly sent intent must become observable.
        assert.deepEqual(await sent(), before, why);
      };

      const beforeBuy=await state(),known=new Set([...beforeBuy.board,...beforeBuy.hand,...beforeBuy.temp].filter(Boolean).map(p=>p.uid));
      const slot=beforeBuy.shop.slots.findIndex(s=>s?.kind==='chess'&&!s.sold&&s.price<=beforeBuy.funds);assert.ok(slot>=0);
      await page.hover(`.scard[data-shop-slot="${slot}"]`);await page.keyboard.press('KeyW');
      await page.waitForFunction(ids=>__MOCK__.S().priv.hand.some(p=>p&&!ids.includes(p.uid)),{},[...known]);
      const recentlyBought=(await state()).hand.find(p=>p&&!known.has(p.uid));assert.ok(recentlyBought);
      const initial = await state();
      const [first, selected, other] = initial.board.filter((p) => p.kind === 'chess');
      await hover(first.uid);
      assert.equal(await page.$('.uframe'), null, 'hovering does not select or open the underframe');
      await page.keyboard.press('KeyQ');
      await page.waitForFunction((uid) => globalThis.__MOCK__.S().priv.hand.some((p) => p?.uid === uid), {}, first.uid);
      assert.equal((await state()).funds, initial.funds, 'Q retreats without selling');
      assert.ok((await state()).hand.some(p=>p?.uid===recentlyBought.uid),'recent purchase is not retreated or sold instead of the hovered operator');
      await hover(first.uid);
      await inert('Q cannot retreat a bench operator', ['KeyQ']);
      await page.keyboard.press('KeyX');
      await removed(first.uid);
      assert.ok((await state()).hand.some(p=>p?.uid===recentlyBought.uid),'selling the hovered operator preserves the most recent purchase');
      assert.equal((await sent()).at(-1)[1].uid, first.uid, 'X sells a bench operator without selecting it');

      const selectedPoint = await hover(selected.uid);
      await page.mouse.click(selectedPoint.x, selectedPoint.y);
      await page.waitForSelector('.uframe__btn--sell');
      const oldPoint = await hover(other.uid);
      // Two keydowns in one task, before Preact can update: only one sale may be in flight.
      await page.evaluate(() => {
        for (let i = 0; i < 2; i++) window.dispatchEvent(new KeyboardEvent('keydown', { key: 'x', code: 'KeyX', bubbles: true }));
      });
      await removed(other.uid);
      await sleep(180);
      assert.equal((await sent()).filter(([type, f]) => type === 'g.sell' && f.uid === other.uid).length, 1);
      assert.ok((await state()).board.some((p) => p.uid === selected.uid), 'hover overrides the previously selected operator');
      await page.waitForFunction((x, y) => globalThis.__SP_VIEW__.pieceAtClientPoint(x, y) === null, {}, oldPoint.x, oldPoint.y);
      await inert('a removed hover target never falls back to the selected operator');
      await page.hover('.gm__gear');
      await inert('HUD does not redirect Q/X to an old selection');
      await page.keyboard.press('Escape');

      for (const kind of ['item', 'token']) {
        const piece = (await state()).hand.find((p) => p?.kind === kind);
        assert.ok(piece, `fixture includes a ${kind}`);
        await hover(piece.uid);
        await inert(`${kind} cannot be sold, destroyed or retreated by operator shortcuts`);
      }
      const temporary = (await state()).temp.find((p) => p?.kind === 'chess');
      await hover(temporary.uid);
      await page.keyboard.press('KeyX');
      await removed(temporary.uid);

      await hover(selected.uid);
      await page.mouse.down();
      await inert('holding a mouse button blocks piece shortcuts');
      await page.mouse.up();
      await page.keyboard.press('Escape');
      await hover(selected.uid);
      await page.evaluate(() => window.dispatchEvent(new Event('blur')));
      await inert('losing window focus clears the hover target');
      await hover(selected.uid);
      await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointermove', { pointerType: 'touch', clientX: 100, clientY: 100 })));
      await inert('a touch pointer cannot supply a hover target');

      await page.click('.gm__gear');
      await page.waitForSelector('.modal .set-category');
      await page.mouse.move(selectedPoint.x, selectedPoint.y);
      await inert('a dialog blocks hovered shortcuts');
      await page.keyboard.press('Escape');
      await page.waitForSelector('.modal', { hidden: true });
      await hover(selected.uid);
      await page.evaluate(() => {
        const input = document.createElement('input'); input.id = 'hotkey-test-input';
        document.body.append(input); input.focus();
      });
      await inert('typing cannot operate a hovered operator');
      await page.evaluate(() => document.querySelector('#hotkey-test-input').remove());

      await page.evaluate(() => globalThis.__MOCK__.mutate((s) => { s.priv.ready = true; }));
      await hover(selected.uid,{occluded:true});
      await inert('ready players cannot operate a hovered operator');
      await page.evaluate(() => globalThis.__MOCK__.mutate((s) => { s.priv.ready = false; }));
      await hover(selected.uid);
      await page.keyboard.down('KeyX');
      await removed(selected.uid);
      await page.keyboard.up('KeyX');
      assert.deepEqual(errors, [],JSON.stringify(await page.evaluate(()=>window.__HOTKEY_REJECTIONS__)));
    });
  }
});
