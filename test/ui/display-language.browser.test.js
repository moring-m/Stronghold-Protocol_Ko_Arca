import {test} from 'node:test';
import assert from 'node:assert/strict';
import {startServer} from '../../server/index.js';
import puppeteer from 'puppeteer-core';
test('display language defaults to Korean, restores four choices and persists title/settings changes',{skip:process.env.SP_E2E!=='1'},async()=>{
 const srv=await startServer({port:0,host:'127.0.0.1',quiet:true,dataDir:'content/production/data',assetIndex:false});let browser;
 try{
  browser=await puppeteer.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage']});
  let englishDownloads=0;const page=await browser.newPage();page.on('request',r=>{if(new URL(r.url()).pathname==='/i18n/en.json')englishDownloads++;});page.on('pageerror',e=>console.error('PAGEERROR',e));await page.setBypassServiceWorker(true);await page.evaluateOnNewDocument(()=>{localStorage.setItem('sp.resources.downloadConsent','1');});await page.setRequestInterception(true);page.on('request',r=>new URL(r.url()).hostname==='127.0.0.1'?r.continue():r.abort());
  await page.goto(srv.url,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>!!window.__SP__);
  assert.equal(await page.$eval('html',e=>e.lang),'ko');
  assert.deepEqual(await page.$$eval('.title-tools [data-testid="display-language"] option',els=>els.map(e=>e.value)),['ko','zh','en','ja']);
  for(const lang of ['en','ja','zh','ko']){
   await page.select('.title-tools [data-testid="display-language"]',lang);
   if(['en','ja','zh'].includes(lang)){await page.waitForSelector('[data-testid="download-language"]');const notice=await page.$eval('.language-download',e=>e.textContent);assert.match(notice,lang==='en'?/English language pack/:lang==='ja'?/日本語言語パック/:/中文语言包/);assert.equal(await page.$eval('html',e=>e.lang),lang==='en'?'ko':lang==='ja'?'en':'ja');if(lang==='en'){await page.click('.language-download .btn--ghost');assert.equal(await page.$eval('html',e=>e.lang),'ko');await page.select('.title-tools [data-testid="display-language"]','en');await page.waitForSelector('[data-testid="download-language"]');}await page.click('[data-testid="download-language"]');}
   await page.waitForFunction(code=>document.documentElement.lang===(code==='zh'?'zh-CN':code)&&!!window.__SP__&&JSON.parse(localStorage.getItem('sp.pref.lang'))===code,{timeout:12000},lang).catch(async e=>{console.error('SWITCH STATE',lang,await page.evaluate(()=>({html:document.documentElement.lang,saved:localStorage.getItem('sp.pref.lang'),ready:!!window.__SP__,body:document.body.innerText.slice(-900)})));throw e;});
   await page.waitForSelector('.title-tools [data-testid="display-language"]');
   assert.equal(await page.$eval('.title-tools [data-testid="display-language"]',e=>e.value),lang);
   const heading=await page.$eval('.title-cn',e=>e.textContent);
   if(lang==='en'){assert.match(heading,/Stronghold/i);await page.waitForFunction(()=>__SP__.data.localeName('夜莺')==='Nightingale');}
   if(lang==='ja')assert.match(heading,/協約|協定|盟約/);
   await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>!!window.__SP__);
   assert.equal(await page.$eval('html',e=>e.lang),lang==='zh'?'zh-CN':lang);
  }
  const beforeCachedSwitch=englishDownloads;await page.click('.title-tools [data-testid="settings-btn"]');
  await page.waitForSelector('.settings-modal [data-testid="display-language"]');
  await page.select('.settings-modal [data-testid="display-language"]','en');
  await page.waitForFunction(()=>document.documentElement.lang==='en'&&!!window.__SP__);
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('sp.pref.lang'))),'en');assert.equal(englishDownloads,beforeCachedSwitch,'an installed English pack is reused without downloading it again');
 }finally{await browser?.close();await srv.close();}
});
