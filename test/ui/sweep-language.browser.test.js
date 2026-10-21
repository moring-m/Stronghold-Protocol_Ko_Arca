import{test}from'node:test';import assert from'node:assert/strict';import puppeteer from'puppeteer-core';import{startServer}from'../../server/index.js';
test('nickname hint and actual S.W.E.E.P. tabs use the selected language',{skip:process.env.SP_E2E!=='1',timeout:90000},async()=>{
 const srv=await startServer({port:0,host:'127.0.0.1',quiet:true,dataDir:'content/production/data',assetIndex:false});let browser;
 try{browser=await puppeteer.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage']});
 for(const lang of ['ko','en','ja','zh']){
  const ctx=await browser.createBrowserContext(),page=await ctx.newPage();await page.setViewport({width:1600,height:900});await page.setBypassServiceWorker(true);
  await page.evaluateOnNewDocument(lang=>{localStorage.setItem('sp.pref.lang',JSON.stringify(lang));localStorage.setItem('sp.resources.downloadConsent','1');localStorage.setItem('sp.patchNotes.seenVersion','0.3.1e');},lang);
  await page.setRequestInterception(true);page.on('request',r=>new URL(r.url()).hostname!=='127.0.0.1'||r.url().endsWith('resource-worker.js')?r.abort():r.continue());
  await page.goto(srv.url,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>!!window.__SP__);
  const hint=await page.$eval('input',e=>e.placeholder);
  assert.match(hint,{ko:/닉네임/,en:/codename/,ja:/コードネーム/,zh:/代号/}[lang]);assert.ok(hint.includes('12'),hint);
  await page.evaluate(()=>{__SP__.store.patch('session',{entered:true});__SP__.net.setName('QA');});await page.waitForSelector('.lobby-sweep');await page.click('.lobby-sweep');await page.waitForSelector('.sw-tile');
  for(const [i,tab]of ['bonds','bands','enemies','augments'].entries()){
   await page.$$eval('.sw-tab',(es,i)=>es[i].click(),i);await page.waitForFunction(tab=>document.querySelector('.sw-body')?.dataset.tab===tab,{},tab);
   if(await page.$('.sw-tile'))await page.$eval('.sw-tile',e=>e.click());
   await page.waitForFunction(()=>!document.querySelector('.sw-loading'));
   const bad=await page.$$eval('.sw *',(es,lang)=>es.filter(e=>e.getClientRects().length&&e.children.length===0&&((lang==='ko'||lang==='en')?/[一-鿿]/.test(e.textContent):lang==='ja'?/[가-힣]/.test(e.textContent):/[가-힣]/.test(e.textContent))).map(e=>e.textContent),lang);
   assert.deepEqual(bad,[],`${lang} ${tab}`);
   if(tab==='augments'){assert.ok(await page.$('.sw-text .rt-vup'),'augment report highlights values');const labels=await page.$$eval('.sw-sec__name',es=>es.map(e=>e.textContent));if(lang!=='ko')assert.ok(labels.every(text=>!/[가-힣]/.test(text)),labels.join('|'));}
  }
  await ctx.close();
 }
 }finally{await browser?.close();await srv.close();}
});
