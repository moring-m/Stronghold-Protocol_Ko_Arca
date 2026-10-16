import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {startServer} from '../../server/index.js';

for(const lazyResources of [false,true]) test(`explicit redownload restores the notice and keeps the menu usable (${lazyResources?'preview':'production'})`,{skip:!existsSync('/usr/bin/chromium'),timeout:30000},async()=>{
 const server=await startServer({host:'127.0.0.1',port:0,quiet:true,dataDir:new URL('../../content/production/data',import.meta.url).pathname,handleRequest:async(req,res)=>{
  const path=new URL(req.url,'http://local').pathname;
  if(path==='/dev/ursus-config.json'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({lazyResources}));return true;}
  if(path==='/dev/ursus-resource-worker.js'||path==='/resource-worker.js'){res.setHeader('Content-Type','text/javascript');res.setHeader('Service-Worker-Allowed','/');res.end(`let ready=false;
self.addEventListener('install',e=>e.waitUntil(self.skipWaiting()));
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('message',e=>{
 if(e.data.type==='resetResources'){ready=false;e.ports[0].postMessage({type:'reset'});}
 if(e.data.type==='status')e.ports[0].postMessage({type:'status',ready,patch:false});
 if(e.data.type==='preparePatch'){const p=e.ports[0];p.postMessage({type:'progress',done:1,total:2,bytesDone:1048576,bytesTotal:2097152});setTimeout(()=>{ready=true;p.postMessage({type:'ready'});},500);}
 if(e.data.type==='warmPatch')e.waitUntil((async()=>{const clients=await self.clients.matchAll();for(const c of clients)c.postMessage({type:'resourceProgress',id:'preview',done:1,total:2,bytesDone:1048576,bytesTotal:2097152,active:true});await new Promise(r=>setTimeout(r,500));for(const c of clients)c.postMessage({type:'resourceProgress',id:'preview',active:false});ready=true;})());
});`);return true;}
  if(path==='/vendor/browser-resources.json'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({estimatedBytes:2097152,files:[]}));return true;}
  return false;
 }});
 const P=(await import('puppeteer-core')).default,b=await P.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 try{
  const p=await b.newPage();await p.evaluateOnNewDocument(()=>{if(!localStorage.getItem('qa.initialized')){localStorage.setItem('qa.initialized','1');localStorage.setItem('qa.keep','settings');}});
  await p.goto(`http://127.0.0.1:${server.port}/`,{waitUntil:'domcontentloaded'});
  await p.waitForFunction(()=>!!navigator.serviceWorker.controller&&!!globalThis.__SP_UI_READY__);
  await p.waitForSelector('.resource-consent');
  const initialNotice=await p.$eval('.resource-consent',e=>e.textContent);
  assert.ok(await p.$('.resource-consent.panel.brackets .panel__head'));
  assert.ok(await p.$('.resource-consent .btn--primary'));
  assert.notEqual(await p.$eval('.resource-consent select',e=>getComputedStyle(e).backgroundColor),'rgb(255, 255, 255)');
  if(!lazyResources){
    await p.screenshot({path:'/tmp/030-themed-download-desktop.png'});
    await p.setViewport({width:390,height:844});
    const bounds=await p.$eval('.resource-consent',e=>e.getBoundingClientRect().toJSON());
    assert.ok(bounds.left>=0&&bounds.right<=390&&bounds.height<=828);
    await p.screenshot({path:'/tmp/030-themed-download-mobile.png'});
    await p.setViewport({width:800,height:600});
  }

  await p.click('.resource-consent .btn--primary');
  await p.waitForSelector('.resource-download',{visible:true});
  await p.waitForFunction(()=>document.querySelector('.resource-download')?.textContent.includes('다운로드 완료'));
  await p.waitForFunction(()=>!document.querySelector('.resource-download'));
  assert.equal(await p.$eval('.title-repo',e=>e.href),'https://github.com/moring-m/Stronghold-Protocol_Ko_Arca');
  await p.click('button[title="리소스 재다운로드"]');await p.waitForSelector('[role="dialog"]');
  await p.evaluate(()=>[...document.querySelectorAll('[role="dialog"] button')].find(e=>e.textContent==='다시 다운로드').click());
  await p.waitForSelector('.resource-consent');
  assert.equal(await p.$eval('.resource-consent',e=>e.textContent),initialNotice,'first visit and redownload use the same notice');
  assert.equal(await p.evaluate(()=>localStorage.getItem('sp.resources.downloadConsent')),null);
  assert.equal(await p.evaluate(()=>localStorage.getItem('qa.keep')),'settings');
  await p.waitForFunction(()=>!!globalThis.__SP_UI_READY__);
  assert.equal(await p.evaluate(()=>!!globalThis.__SP_UI_READY__),true);
  await p.click('.resource-consent .btn--primary');await p.waitForFunction(()=>!document.querySelector('.resource-consent'));
  await p.waitForSelector('.resource-download',{visible:true});
  await p.waitForFunction(()=>document.querySelector('.resource-download progress')?.value===1);
  assert.equal(await p.$eval('.resource-download progress',e=>e.max),2);
  assert.match(await p.$eval('.resource-download__size',e=>e.textContent),/1 MB \/ 2 MB/);
  await p.click('.resource-download button');
  assert.equal(await p.$eval('.resource-download button',e=>e.getAttribute('aria-expanded')),'false');
  assert.ok(await p.$eval('.resource-download',e=>e.getBoundingClientRect().height<40));
  assert.equal(await p.$eval('.resource-download button',e=>e.textContent),'⌃');
  assert.equal(await p.evaluate(()=>localStorage.getItem('sp.resources.downloadConsent')),'1');
  assert.equal(await p.evaluate(()=>localStorage.getItem('sp.resources.redownloadPending')),null);
  assert.equal(await p.evaluate(()=>localStorage.getItem('sp.resources.downloadActive')),'1');
  await p.reload({waitUntil:'domcontentloaded'});
  await p.waitForSelector('.resource-download',{visible:true});
  assert.equal(await p.$('.resource-consent'),null,'refresh resumes without asking for consent again');
  await p.waitForFunction(()=>document.querySelector('.resource-download')?.textContent.includes('다운로드 완료'));
  assert.equal(await p.evaluate(()=>localStorage.getItem('sp.resources.downloadActive')),null,'clear persisted state only on completion');
  await p.click('[data-testid="settings-btn"]');await p.waitForSelector('.settings-modal');
  await p.evaluate(async()=>{(await import('/js/ui/settings.js')).updateSettings({officialFx:'full'});});
  await p.waitForSelector('.resource-consent');
  assert.equal(await p.$eval('.resource-consent select[aria-label="전투 이펙트"]',e=>e.value),'official');
  assert.equal(await p.evaluate(()=>localStorage.getItem('sp.resources.officialFxReady')),null);
  assert.notEqual(await p.evaluate(async()=>(await import('/js/ui/settings.js')).settingsStore.get().officialFx),'full','full is deferred until download completes');
  await p.click('.resource-consent select[aria-label="음성"]');
  assert.equal(await p.evaluate(()=>document.activeElement?.getAttribute('aria-label')),'음성','settings modal does not steal download input focus');
  await p.select('.resource-consent select[aria-label="음성"]','jp');
  await p.click('.resource-consent .btn--primary');
  await p.waitForFunction(()=>localStorage.getItem('sp.resources.officialFxReady')==='1');
  assert.equal(await p.evaluate(async()=>(await import('/js/ui/settings.js')).settingsStore.get().officialFx),'full');
  assert.equal(await p.evaluate(async()=>(await import('/js/ui/settings.js')).settingsStore.get().voiceLanguage),'jp');

 }finally{await b.close();await server.close();}
});
