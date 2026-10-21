import {test} from 'node:test';
import assert from 'node:assert/strict';
import {startServer} from '../../server/index.js';
import puppeteer from 'puppeteer-core';
import {mkdirSync} from 'node:fs';
test('initial resource consent localizes immediately and installs selected language before applying it',{skip:process.env.SP_E2E!=='1'},async()=>{
 const srv=await startServer({port:0,host:'127.0.0.1',quiet:true,dataDir:'content/production/data',assetIndex:false});let browser;
 try{
  browser=await puppeteer.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage']});
  for(const code of ['en','ja','zh','ko']){
   const context=await browser.createBrowserContext(),page=await context.newPage();let packRequests=0;
   await page.evaluateOnNewDocument(()=>{if(!sessionStorage.getItem('language-test-seeded')){sessionStorage.setItem('language-test-seeded','1');localStorage.setItem('sp.resources.redownloadPending','1');}});
   await page.setRequestInterception(true);page.on('request',r=>{
    const u=new URL(r.url());if(u.hostname!=='127.0.0.1')return r.abort();
    if(u.pathname==='/vendor/browser-resources.json')return r.respond({status:200,contentType:'application/json',body:JSON.stringify({version:'language-test',files:[],estimatedBytes:0,estimatedStorageBytes:0})});
    if(/\/i18n\/(en|ja)\//.test(u.pathname))packRequests++;
    return r.continue();
   });
   await page.goto(srv.url,{waitUntil:'domcontentloaded'});await page.waitForSelector('[data-testid="resource-language"]');
   for(const [language,heading]of [['zh','下载游戏资源'],['ja','ゲームリソースのダウンロード'],['en','Download Game Resources'],['ko','게임 리소스 다운로드']]){
    await page.select('[data-testid="resource-language"]',language);
    assert.equal(await page.$eval('.resource-consent h2',e=>e.textContent),heading);
    assert.equal(await page.$eval('.resource-consent',e=>e.lang),language);
   }
   assert.equal(packRequests,0,'selecting a language does not download until confirmed');
   await page.select('[data-testid="resource-language"]',code);
   if(code==='en'){mkdirSync('docs/languages-2026-10-21',{recursive:true});await page.screenshot({path:'docs/languages-2026-10-21/initial-english.png'});}
   await page.click('.resource-consent .btn--primary');
   await page.waitForFunction(language=>!!window.__SP__&&JSON.parse(localStorage.getItem('sp.pref.lang'))===language&&document.documentElement.lang===(language==='zh'?'zh-CN':language),{},code);
   await page.waitForFunction(()=>!document.querySelector('.resource-consent'));
   if(code==='ko')assert.equal(packRequests,0,'default Korean needs no additional language download');
   else{assert.equal(await page.evaluate(async language=>{const m=await import('/js/i18n/languagePack.js');return m.languagePackReady(language);},code),true);}
   await context.close();
  }
 }finally{await browser?.close();await srv.close();}
});
