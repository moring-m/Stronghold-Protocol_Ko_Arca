import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {startServer} from '../../server/index.js';
test('initial screen defers combat and editors, then room and overlay entry load them safely',{skip:!existsSync('/usr/bin/chromium'),timeout:60000},async()=>{
 const server=await startServer({port:0,host:'127.0.0.1',quiet:true,dataDir:new URL('../../content/production/data',import.meta.url).pathname});
 const puppeteer=(await import('puppeteer-core')).default,browser=await puppeteer.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 try{
  const page=await browser.newPage(),requests=[],errors=[];page.on('request',r=>requests.push(new URL(r.url()).pathname));page.on('pageerror',e=>errors.push(e.message));
  await page.evaluateOnNewDocument(()=>localStorage.setItem('sp.resources.downloadConsent','1'));
  await page.goto(`http://127.0.0.1:${server.port}/`,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>!!globalThis.__SP__,{timeout:30000});
  for(const path of ['/js/screens/game.js','/js/ui/laboratory.js','/js/screens/loadout.js','/js/screens/stats.js','/data/chess.json','/data/enemies.json','/data/garrisons.json','/css/screens/game.css','/css/screens/stats.css','/css/screens/loadout.css'])assert.ok(!requests.includes(path),'initial request '+path);
  assert.equal(await page.evaluate(()=>!!globalThis.__SP_RUNNER__),true);
  assert.equal(await page.evaluate(()=>{const e=document.createElement('div');e.className='extensions-layout';document.body.append(e);const display=getComputedStyle(e).display;e.remove();return display;}),'grid','custom editor theme is ready before combat/editor imports');
  const returned=async()=>{await page.waitForFunction(()=>{
    const screen=document.querySelector('.app-root > .screen');
    return screen&&getComputedStyle(screen).visibility==='visible'&&screen.getBoundingClientRect().width>0&&!document.documentElement.classList.contains('sp-loadout-open')&&!document.documentElement.classList.contains('sp-stats-open');
  });};
  await page.evaluate(()=>{
    window.dispatchEvent(new CustomEvent('sp-resource-progress',{detail:{id:'qa-count',done:90,total:100}}));
    window.dispatchEvent(new CustomEvent('sp-resource-progress',{detail:{id:'qa-bytes',done:1,total:10,bytesDone:10,bytesTotal:1000,phase:'기본 리소스'}}));
  });
  assert.equal(await page.$eval('.resource-progress',el=>el.getAttribute('aria-valuenow')),'1','byte progress does not mix audio file counts with byte totals');
  await page.click('[data-testid="settings-btn"]');await page.waitForSelector('.settings-modal');
  assert.ok(await page.$('.resource-progress'),'progress persists over settings');
  await page.evaluate(()=>{for(const id of ['qa-count','qa-bytes'])window.dispatchEvent(new CustomEvent('sp-resource-progress',{detail:{id,active:false}}));});

  assert.equal(await page.$eval('.set-row',e=>getComputedStyle(e).display),'grid','settings theme exists before any combat/editor CSS');
  const zoomToggle='button[role="switch"][aria-label="배치 시 카메라 확대"]';
  assert.equal(await page.$eval(zoomToggle,e=>e.getAttribute('aria-checked')),'true');
  await page.click(zoomToggle);assert.equal(await page.evaluate(async()=>(await import('/js/ui/settings.js')).settingsStore.get().deployCameraZoom),false);
  await page.click(zoomToggle);assert.equal(await page.evaluate(async()=>(await import('/js/ui/settings.js')).settingsStore.get().deployCameraZoom),true);
  await page.evaluate(()=>[...document.querySelectorAll('.set-categories button')].find(b=>b.textContent==='플러그인').click());
  await page.waitForFunction(()=>!document.querySelector('[data-category="plugins"]').hidden);
  await page.evaluate(()=>[...document.querySelectorAll('.settings-modal button')].find(b=>b.textContent.includes('완료')||b.textContent.includes('完成')).click());

  await page.evaluate(async()=>{(await import('/js/ui/statsEntry.js')).openStats();});await page.waitForSelector('.st-tabs');await page.click('.st-back');await returned();
  await page.evaluate(async()=>{(await import('/js/ui/statsEntry.js')).openStats();});await page.waitForSelector('.st-tabs');await page.keyboard.press('Escape');await returned();
  await page.evaluate(async()=>{(await import('/js/ui/loadoutSync.js')).openLoadout();});await page.waitForSelector('.lo-card');await page.waitForFunction(()=>document.documentElement.classList.contains('sp-loadout-open'));await page.click('.lo-back');await returned();
  await page.evaluate(async()=>{(await import('/js/ui/loadoutSync.js')).openLoadout();});await page.waitForSelector('.lo-card');await page.waitForFunction(()=>document.documentElement.classList.contains('sp-loadout-open'));await page.keyboard.press('Escape');await returned();
  await page.evaluate(async()=>{(await import('/js/ui/favorites.js')).favoritesStore.set({open:true});});await page.waitForSelector('.favorites-modal');await page.evaluate(async()=>{(await import('/js/ui/favorites.js')).favoritesStore.set({open:false});});await returned();
  await page.evaluate(async()=>{(await import('/js/ui/recruitPresets.js')).recruitPresetStore.set({open:true});});await page.waitForSelector('.recruit-presets-modal');await page.evaluate(async()=>{(await import('/js/ui/recruitPresets.js')).recruitPresetStore.set({open:false});});await returned();
  await page.evaluate(()=>{__SP__.net.setName('로딩테스트');});
  await page.waitForFunction(()=>__SP__.store.get().connection.status==='online');
  assert.match(await page.evaluate(()=>__SP__.store.get().content?.vanilla),/^[a-f0-9]{64}$/,'welcome publishes the content identity before a battle can start');
  await page.evaluate(()=>{globalThis.__roomRequest=__SP__.net.request('room.create',{mode:'solo',difficulty:'NORMAL'});globalThis.__roomRequest.catch(error=>{globalThis.__roomError=error.message;});});await page.waitForFunction(()=>__SP__.store.get().room!=null);
  for(let i=0;i<100&&!requests.includes('/js/screens/game.js');i++)await new Promise(resolve=>setTimeout(resolve,50));
  assert.ok(requests.includes('/js/screens/game.js'),'room entry warms deferred game code');
  await page.evaluate(()=>__SP__.store.set(s=>({session:{...s.session,entered:true}})));
  await page.waitForSelector('.room-custom-extensions');await page.evaluate(()=>document.querySelector('.room-custom-extensions').click());await page.waitForSelector('.extensions-layout');
  assert.equal(await page.$eval('.extensions-layout',e=>getComputedStyle(e).display),'grid','custom settings have their pane theme');
  await page.evaluate(()=>[...document.querySelectorAll('.custom-ext .modal__actions button')].find(b=>b.textContent.includes('취소')||b.textContent.includes('닫기')).click());await returned();
  assert.deepEqual(errors,[]);
 }finally{await browser.close();await server.close();}
});

for (const blockConfiguration of [false,true]) test(`menu stays interactive while ${blockConfiguration?'configuration':'worker installation and assets'} is blocked`,{skip:!existsSync('/usr/bin/chromium'),timeout:30000},async()=>{
 let release;const blocked=new Promise(resolve=>release=resolve);
 let workerRequested=false;
 const server=await startServer({port:0,host:'127.0.0.1',quiet:true,dataDir:new URL('../../content/production/data',import.meta.url).pathname,handleRequest:async(req,res)=>{
  if(req.url==='/dev/ursus-config.json'){if(blockConfiguration){workerRequested=true;await blocked;}res.setHeader('Content-Type','application/json');res.end(JSON.stringify({lazyResources:true}));return true;}
  if(req.url==='/dev/ursus-resource-worker.js'){workerRequested=true;await blocked;res.writeHead(503).end();return true;}
  if(req.url==='/data/assets.json'){await blocked;res.writeHead(503).end();return true;}
  return false;
 }});
 const puppeteer=(await import('puppeteer-core')).default,browser=await puppeteer.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 try{
  const page=await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.port}/`,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>globalThis.__SP_UI_READY__&&!document.getElementById('boot'),{timeout:10000});
  await page.click('[data-testid="settings-btn"]');await page.waitForSelector('.settings-modal',{timeout:3000});
  assert.ok(await page.$('.settings-modal'),'settings opens with resource work still blocked');
  for(let i=0;i<20&&!workerRequested;i++)await new Promise(resolve=>setTimeout(resolve,50));
  assert.equal(workerRequested,true,'worker installation really is pending during interaction');
 }finally{release();await browser.close();await server.close();}
});
