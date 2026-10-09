import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { EMOTES } from '../../shared/constants.js';
import { bundledEmoteArt, EMOTE_PAGES } from '../../shared/emote-art.js';
import { startServer } from '../../server/index.js';

test('all 36 replacement emotes have distinct, valid WebP files and safe lookups', () => {
  const paths = EMOTES.filter(id=>!id.startsWith('original_')).map(bundledEmoteArt);
  assert.equal(new Set(paths).size, 36);
  for (const path of paths) {
    assert.match(path, /^\/assets\/emotes\/[a-h]\d+\.webp$/);
    const bytes = readFileSync(new URL(`../../public${path}`, import.meta.url));
    assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
    assert.equal(bytes.toString('ascii', 8, 12), 'WEBP');
  }
  const displayed = EMOTE_PAGES.slice(1).flatMap(page=>page.emotes.map(e=>bundledEmoteArt(e.id)));
  assert.deepEqual(displayed, [...paths].sort((a,b)=>a.localeCompare(b,'en',{numeric:true})));
  assert.ok(EMOTE_PAGES.every(page=>page.emotes.length===6));
  for (const id of ['unknown', '__proto__', 'constructor', null, undefined]) assert.equal(bundledEmoteArt(id), null);
});

const chrome = process.env.CHROME_PATH || '/usr/bin/chromium';
test('browser renders every replacement image without the extracted asset manifest', {skip:!existsSync(chrome),timeout:30000}, async () => {
  const server = await startServer({port:0,host:'127.0.0.1',quiet:true});
  const puppeteer = (await import('puppeteer-core')).default;
  let browser;
  try {
    browser = await puppeteer.launch({executablePath:chrome,headless:true,args:['--no-sandbox']});
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${server.port}/dev/uikit.html`);
    await page.evaluate(async () => {
      const [{render}, {html}, {EmoteArt, EmoteWheel}, {EMOTES}] = await Promise.all([
        import('/vendor/preact.module.js'), import('/js/ui/components.js'),
        import('/js/ui/emotes.js'), import('/shared/constants.js')]);
      const container=document.createElement('div');container.id='replacement-art';document.body.append(container);
      localStorage.removeItem('sp.emoteTheme');
      render(html`${EMOTES.map(id=>html`<${EmoteArt} key=${id} id=${id} />`)}`,container);
      const wheel=document.createElement('div');wheel.id='replacement-wheel';document.body.append(wheel);
      render(html`<${EmoteWheel} open=${true} onToggle=${()=>{}} onSend=${()=>{}} />`,wheel);
    });
    await page.waitForFunction(() => {
      const images=[...document.querySelectorAll('#replacement-art img')];
      return images.length===42 && images.every(img=>img.complete && img.naturalWidth>0);
    });
    await page.addStyleTag({url:`http://127.0.0.1:${server.port}/css/emotes.css`});
    assert.equal(await page.$eval('#replacement-art img', img=>getComputedStyle(img).backgroundColor), 'rgb(255, 255, 255)');
    assert.equal(await page.$$eval('#replacement-art img', imgs=>new Set(imgs.map(i=>i.src)).size),42);
    const ids=[];
    ids.push(...await page.$$eval('#replacement-wheel .ewheel__item',els=>els.map(el=>el.dataset.emote)));
    await page.click('#replacement-wheel .ewheel__tabs button:nth-child(2)');
    for (let i=0;i<6;i++) {
      await page.waitForFunction(index=>document.querySelectorAll('#replacement-wheel .ewheel__dot')[index]?.getAttribute('aria-selected')==='true',{},i);
      ids.push(...await page.$$eval('#replacement-wheel .ewheel__item',els=>els.map(el=>el.dataset.emote)));
      if(i<5) await page.click('#replacement-wheel .is-next');
    }
    assert.deepEqual(ids, EMOTE_PAGES.flatMap(p=>p.emotes.map(e=>e.id)));
  } finally {await browser?.close();await server.close();}
});
