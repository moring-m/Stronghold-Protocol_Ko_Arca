import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { startServer } from '../server/index.js';

const chrome = process.env.CHROME_PATH || '/usr/bin/chromium';
test('first visit consent, retry/resume, atlas normalization, cache reuse, eviction and resource update',
  { skip: !existsSync(chrome), timeout: 60000 }, async () => {
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jWZkAAAAASUVORK5CYII=', 'base64');
    let fail = true, downloads = 0, localDownloads = 0, version = 'fixture-v1';
    let releaseDownload;const downloadGate=new Promise(resolve=>releaseDownload=resolve);
    const files = [
      { path: '/assets/sample.png', sources: ['https://cdn.jsdelivr.net/sample.png'] },
      { path: '/assets/sample.atlas', sources: ['https://raw.githubusercontent.com/sample.atlas'], atlas: { textures: ['/assets/sample.png'], pma: true } },
      { path: '/assets/audio/bgm/sample.mp3', sources: ['https://raw.githubusercontent.com/sample.mp3'] },
    ];
    const origin = await startServer({ port: 0, host: '127.0.0.1', quiet: true });
    const server = http.createServer(async (request, response) => {
      try {
        if (request.url === '/vendor/browser-resources.json') {
          response.setHeader('Content-Type', 'application/json');
          response.end(JSON.stringify({ version, estimatedBytes: 1000, files, fontCss: 'body{color:white}' }));
        } else if (request.url === '/vendor/resource-atlas.mjs') {
          response.setHeader('Content-Type', 'text/javascript');
          response.end(await readFile(new URL('../tools/assets/atlas.mjs', import.meta.url)));
        } else if (request.url === '/resource-worker.js') {
          response.setHeader('Content-Type', 'text/javascript');
          // Only this test response redirects external fetches to deterministic local fixtures.
          const prefix = `const originalFetch = globalThis.fetch.bind(globalThis); globalThis.fetch = (url, options) => originalFetch(typeof url === 'string' && url.startsWith('https://') ? '/fixture/' + encodeURIComponent(url) : url, options);\n`;
          response.end(prefix + await readFile(new URL('../public/resource-worker.js', import.meta.url), 'utf8'));
        } else if (request.url.startsWith('/fixture/')) {
          await downloadGate;downloads++;
          const url = decodeURIComponent(request.url.slice('/fixture/'.length));
          if (fail && url.endsWith('.mp3')) { response.writeHead(503).end(); return; }
          response.end(url.endsWith('.png') ? png : url.endsWith('.atlas') ? 'sample.png\nformat: RGBA8888\nfilter: Linear,Linear\nrepeat: none\nregion\n  rotate: false\n  xy: 0,0\n  size: 1,1\n' : 'ID3fixture');
        } else if (request.url === '/assets/local-portrait.png') {
          localDownloads++;response.setHeader('Content-Type','image/png');response.end(png);
        } else if (request.url === '/js/resource-bootstrap.js') {
          response.setHeader('Content-Type','text/javascript');
          // Accelerate only the response-loss watchdog in this deterministic fixture.
          response.end((await readFile(new URL('../public/js/resource-bootstrap.js',import.meta.url),'utf8')).replace('60000','1500'));
        } else if (request.url === '/js/main.js') {
          response.setHeader('Content-Type', 'text/javascript');
          response.end('window.gameStarted = true; document.getElementById("boot")?.remove();');
        } else {
          const upstream = await fetch(`http://127.0.0.1:${origin.port}${request.url}`);
          response.writeHead(upstream.status, Object.fromEntries([...upstream.headers].filter(([key]) => !['content-length', 'content-encoding', 'transfer-encoding'].includes(key))));
          response.end(Buffer.from(await upstream.arrayBuffer()));
        }
      } catch (error) { response.writeHead(500).end(error.message); }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const puppeteer = (await import('puppeteer-core')).default;
    const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ['--no-sandbox'] });
    try {
      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 720 });
      const session=await page.createCDPSession();let workerVersion;
      session.on('ServiceWorker.workerVersionUpdated',({versions})=>{for(const v of versions)if(v.scriptURL.endsWith('/resource-worker.js')&&v.status==='activated')workerVersion=v.versionId;});
      await session.send('ServiceWorker.enable');
      const url = `http://127.0.0.1:${server.address().port}/`;
      await page.goto(url);
      await page.waitForSelector('.boot__inner button');
      assert.equal(downloads, 0, 'no game resources downloaded before consent');
      assert.equal(await page.evaluate(() => !!window.gameStarted), false);
      await page.click('.boot__inner button');
      await page.waitForFunction(() => window.gameStarted);
      await page.waitForSelector('.resource-download button');
      await page.click('.resource-download button');
      const compact=await page.$eval('.resource-download',el=>({width:el.getBoundingClientRect().width,expanded:el.querySelector('button').getAttribute('aria-expanded'),detailsHidden:el.lastElementChild.hidden,count:el.querySelector('span').textContent,progress:el.querySelector('progress').max}));
      assert.equal(compact.width,220);assert.equal(compact.expanded,'false');assert.equal(compact.detailsHidden,true);assert.equal(compact.progress,files.length);assert.match(compact.count,/^\d+\/3$/);
      await page.setViewport({width:390,height:844});
      assert.ok(await page.$eval('.resource-download',el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth;}),'compact progress fits mobile');
      await page.click('.resource-download button');
      assert.equal(await page.$eval('.resource-download',el=>el.lastElementChild.hidden),false);
      await page.click('.resource-download button');
      assert.ok(workerVersion,'actual Chromium resource worker is active');
      await session.send('ServiceWorker.stopWorker',{versionId:workerVersion});
      releaseDownload();
      await page.setViewport({width:1280,height:720});
      await page.waitForFunction(async () => !!await (await caches.open('stronghold-resources-fixture-v1')).match('/assets/sample.atlas'));
      assert.equal(await page.evaluate(async () => !!await (await caches.open('stronghold-resources-fixture-v1')).match('/__resources_ready__')), false, 'missing optional resources never block gameplay');
      await page.waitForFunction(() => !document.getElementById('boot'));
      await page.waitForFunction(() => document.body.innerText.includes('일부 리소스를 다운로드하지 못했습니다.'));
      assert.equal(await page.$eval('.resource-download button',b=>b.getAttribute('aria-expanded')),'true','a failure restores retry/skip controls from the compact view');
      assert.ok(await page.$eval('.resource-download',el=>el.textContent.includes('실패한 파일 건너뛰기')));
      assert.equal(downloads, 8, 'three interrupted requests plus five resumed attempts; the page finishes without reload after stopping the actual worker');
      fail = false;
      await page.reload();
      await page.waitForFunction(() => window.gameStarted);
      await page.waitForFunction(async () => !!await (await caches.open('stronghold-resources-fixture-v1')).match('/__resources_ready__'));
      assert.equal(downloads, 9, 'next visit resumes only the missing file without another notice');
      const atlas = await page.evaluate(async () => (await fetch('/assets/sample.atlas')).text());
      assert.match(atlas, /size: 1,1/);
      assert.match(atlas, /pma: true/);
      assert.equal(await page.evaluate(async () => (await fetch('/media/bgm/sample')).text()), 'ID3fixture');
      await page.reload();
      await page.waitForFunction(() => window.gameStarted);
      assert.equal(downloads, 9, 'repeat visit uses persistent cache');
      await page.evaluate(async () => { const cache = await caches.open('stronghold-resources-fixture-v1'); await cache.delete('/assets/sample.png'); });
      await page.reload();
      await page.waitForFunction(() => window.gameStarted);
      assert.equal(await page.$('.boot__inner button'),null,'an existing installation repairs evicted resources in the background');
      await page.waitForFunction(async()=>!!await(await caches.open('stronghold-resources-fixture-v1')).match('/assets/sample.png'));
      assert.equal(downloads,10,'only the evicted file is downloaded');
      version='fixture-v2';
      files.push({path:'/assets/sample-v2.png',sources:['https://cdn.jsdelivr.net/sample-v2.png']});
      await page.reload();
      await page.waitForFunction(()=>window.gameStarted);
      assert.equal(await page.$('.boot__inner button'),null,'patching does not require another download confirmation');
      await page.waitForFunction(async()=>!!await(await caches.open('stronghold-resources-fixture-v2')).match('/__resources_ready__'));
      assert.equal(downloads,11,'a patch reuses existing resources and downloads only its new image');
      assert.equal(await page.evaluate(async()=>!!await(await caches.open('stronghold-resources-fixture-v2')).match('/assets/sample.png')),false,'unchanged images are reused across versions without duplicate storage');
      version='fixture-v3';
      files.push({path:'/assets/local-portrait.png',local:true,sources:['/assets/local-portrait.png']});
      await page.reload();await page.waitForFunction(()=>window.gameStarted);
      await page.waitForFunction(async()=>!!await(await caches.open('stronghold-resources-fixture-v3')).match('/__resources_ready__'));
      assert.equal(localDownloads,1,'bundled artwork downloads from the same origin once');
      assert.equal(downloads,11,'bundled artwork does not redownload unchanged mirror assets');
      await page.reload();await page.waitForFunction(()=>window.gameStarted);
      assert.equal(localDownloads,1,'bundled artwork is reused from the browser cache');


    } finally {
      releaseDownload();
      await browser.close();
      await new Promise(resolve => server.close(resolve));
      await origin.close();
    }
  });
