import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {startServer} from '../../server/index.js';
import puppeteer from 'puppeteer-core';
test('four languages keep mobile headings on one row and align settings language with other selectors',{skip:process.env.SP_E2E!=='1'},async()=>{
 const srv=await startServer({port:0,host:'127.0.0.1',quiet:true,dataDir:'content/production/data',assetIndex:false});let browser;
 try{
  browser=await puppeteer.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage']});mkdirSync('docs/languages-2026-10-21/layout',{recursive:true});
  for(const lang of ['ko','en','ja','zh']){
   const ctx=await browser.createBrowserContext(),page=await ctx.newPage();
   await page.setViewport({width:1280,height:591,isMobile:true,hasTouch:true});await page.setBypassServiceWorker(true);
   await page.evaluateOnNewDocument(code=>{localStorage.setItem('sp.pref.lang',JSON.stringify(code));localStorage.setItem('sp.patchNotes.seenVersion','0.3.1e');localStorage.setItem('sp.resources.downloadConsent','1');},lang);
   await page.setRequestInterception(true);page.on('request',r=>{const u=new URL(r.url());return u.hostname!=='127.0.0.1'||u.pathname.endsWith('resource-worker.js')?r.abort():r.continue();});
   await page.goto(srv.url,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>!!window.__SP__);await page.evaluate(()=>{__SP__.store.patch('session',{entered:true});__SP__.net.setName('UI QA');});await page.waitForSelector('.lobby-screen .topbar');
   for(const [width,height]of [[1280,591],[1680,774],[844,390],[390,844]]){
    await page.setViewport({width,height,isMobile:true,hasTouch:true});
    const m=await page.evaluate(()=>{const h=document.querySelector('.app-topbar'),r=h.getBoundingClientRect(),title=h.querySelector('.topbar__center').getBoundingClientRect(),l=h.querySelector('.topbar__left').getBoundingClientRect(),right=h.querySelector('.topbar__right').getBoundingClientRect();return{height:r.height,titleY:(title.top+title.bottom)/2,leftY:(l.top+l.bottom)/2,rightY:(right.top+right.bottom)/2,titleBottom:title.bottom,bottom:r.bottom};});
    assert.equal(m.height,56,`${lang} ${width}`);assert.ok(Math.abs(m.titleY-m.leftY)<2&&Math.abs(m.titleY-m.rightY)<2,JSON.stringify(m));assert.ok(m.titleBottom<=m.bottom,JSON.stringify(m));
   }
   await page.setViewport({width:1280,height:591,isMobile:true,hasTouch:true});await page.screenshot({path:`docs/languages-2026-10-21/layout/${lang}-lobby.png`});
   await page.click('.topbar [data-testid="settings-btn"]');await page.waitForSelector('.settings-modal');
   const m=await page.evaluate(()=>{const language=document.querySelector('.settings-modal [data-testid="display-language"]').getBoundingClientRect(),map=document.querySelector('.set-category[data-category="graphics"] select').getBoundingClientRect();return{language:{right:language.right,width:language.width},map:{right:map.right,width:map.width}};});
   assert.ok(Math.abs(m.language.right-m.map.right)<2&&Math.abs(m.language.width-m.map.width)<2,`${lang}: ${JSON.stringify(m)}`);
   const labels=await page.$$eval('.set-row__label',els=>els.filter(e=>e.getClientRects().length).map(e=>e.textContent));
   if(lang!=='ko')assert.ok(labels.every(text=>!/[가-힣]/.test(text)),`${lang}: ${labels.join('|')}`);
   await page.screenshot({path:`docs/languages-2026-10-21/layout/${lang}-settings.png`});
   for(let category=1;category<=4;category++){
    await page.click(`.set-categories button:nth-child(${category})`);
    if(lang!=='ko'){
     const missing=await page.$$eval('.settings-modal .set-row__label',els=>els.filter(e=>e.getClientRects().length).map(e=>e.textContent).filter(text=>/[가-힣]/.test(text)));
     assert.deepEqual(missing,[],`${lang} settings category ${category}`);
    }
   }
   await ctx.close();
  }
 }finally{await browser?.close();await srv.close();}
});
