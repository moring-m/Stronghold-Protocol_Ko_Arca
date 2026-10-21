import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync} from 'node:fs';
import {startServer} from '../../server/index.js';
import {APP_VERSION} from '../../shared/constants.js';
import puppeteer from 'puppeteer-core';
test('touch landscape navigation keeps compact equal controls, centered title and contained player details',{skip:process.env.SP_E2E!=='1'},async()=>{
 const out='docs/mobile-topbar-2026-10-21';mkdirSync(out,{recursive:true});
 const srv=await startServer({port:0,host:'127.0.0.1',quiet:true,dataDir:'content/production/data',assetIndex:false});let browser;
 try{
  browser=await puppeteer.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  for(const phase of ['before','after']){
   const context=await browser.createBrowserContext(),page=await context.newPage();
   try{await page.setViewport({width:1280,height:591,isMobile:true,hasTouch:true,deviceScaleFactor:1});await page.setBypassServiceWorker(true);await page.evaluateOnNewDocument(v=>{localStorage.setItem('sp.patchNotes.seenVersion',v);localStorage.setItem('sp.resources.downloadConsent','1');},APP_VERSION);await page.setRequestInterception(true);page.on('request',r=>{const url=new URL(r.url());if(url.hostname!=='127.0.0.1'||url.pathname.endsWith('resource-worker.js'))return r.abort();if(phase==='before'&&url.pathname==='/css/ui-consistency.css')return r.respond({status:200,contentType:'text/css',body:readFileSync('public/css/ui-consistency.css','utf8').split('/* Touch navigation keeps')[0]});return r.continue();});
    await page.goto(srv.url,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>!!window.__SP__);await page.evaluate(()=>{__SP__.store.patch('session',{entered:true});__SP__.net.setName('모바일 확인');});await page.waitForSelector('.lobby-screen .topbar');await page.screenshot({path:`${out}/${phase}-landscape.png`});
    if(phase==='after')for(const width of [1280,844,390]){
     await page.setViewport({width,height:width===390?844:591,isMobile:true,hasTouch:true,deviceScaleFactor:1});
     const metrics=await page.evaluate(()=>{const header=document.querySelector('.app-topbar'),rect=header.getBoundingClientRect(),title=header.querySelector('.topbar__title').getBoundingClientRect();return{height:rect.height,titleCenter:(title.left+title.right)/2,width:innerWidth,buttons:[...header.querySelectorAll('.btn')].map(b=>b.getBoundingClientRect().height),chip:header.querySelector('.me-chip').getBoundingClientRect().height};});
     assert.equal(metrics.height,56);assert.ok(Math.abs(metrics.titleCenter-metrics.width/2)<2,JSON.stringify(metrics));assert.ok(metrics.buttons.every(h=>h===32),JSON.stringify(metrics));assert.equal(metrics.chip,32);
     await page.screenshot({path:`${out}/after-${width}.png`});
    }
   }finally{await context.close();}
  }
 }finally{await browser?.close();await srv.close();}
});
