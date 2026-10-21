import{test}from'node:test';import assert from'node:assert/strict';import fs from'node:fs';import puppeteer from'puppeteer-core';import{startServer}from'../../server/index.js';import{APP_VERSION}from'../../shared/constants.js';import{bountyText}from'../../server/match/choices.js';
const choices=JSON.parse(fs.readFileSync('content/production/data/choices.json')),effects=JSON.parse(fs.readFileSync('content/production/data/effects.json'));
const samples=[choices.cards.bounty[0],choices.cards.bounty.find(c=>c.multiRound),choices.cards.bounty.at(-1)].filter(Boolean).map((c,i)=>({id:'bounty-'+i,name:c.name,desc:bountyText(effects[c.effectId]?.descRaw||c.desc,c),iconKind:'choice',iconId:c.effectId,counter:2,counterText:'还剩 2 场作战'}));
test('hovered bounty effect tooltip translates title, kind, remaining battles and rich description',{skip:process.env.SP_E2E!=='1'},async()=>{
 const srv=await startServer({port:0,host:'127.0.0.1',quiet:true,dataDir:'content/production/data',assetIndex:false});let browser;
 try{browser=await puppeteer.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage']});const page=await browser.newPage();
 await page.evaluateOnNewDocument(version=>{localStorage.setItem('sp.pref.lang','"ko"');localStorage.setItem('sp.resources.downloadConsent','1');localStorage.setItem('sp.patchNotes.seenVersion',version);},APP_VERSION);
 await page.setRequestInterception(true);page.on('request',r=>new URL(r.url()).hostname!=='127.0.0.1'||r.url().endsWith('resource-worker.js')?r.abort():r.continue());
 await page.goto(srv.url,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>!!window.__SP__);
 await page.evaluate(async samples=>{const{render,h}=await import('/vendor/preact.module.js');const{EffectsList}=await import('/js/ui/effectsList.js');const{TooltipLayer}=await import('/js/ui/components.js');const host=document.createElement('div');host.id='bounty-hover-probe';host.style.cssText='position:fixed;top:100px;left:100px;z-index:9999';document.body.append(host);render(h('div',null,h(EffectsList,{effects:samples}),h(TooltipLayer)),host);},samples);
 for(let i=0;i<samples.length;i++){await page.hover(`#bounty-hover-probe .tt-anchor:nth-child(${i+1})`);await page.waitForSelector('.tooltip.is-shown');const text=await page.$eval('.tooltip.is-shown',e=>e.textContent);assert.ok(!/[一-鿿]/.test(text),text);assert.match(text,/작전 2회 남음/);await page.mouse.move(500,500);await page.waitForFunction(()=>!document.querySelector('.tooltip.is-shown'));}
 }finally{await browser?.close();await srv.close();}
});
