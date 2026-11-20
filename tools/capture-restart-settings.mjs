// Real room UI capture, no mocked component state or server persistence.
// Browser globals are only referenced inside Puppeteer callbacks.
/* global window, document */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
const baseline=process.argv.includes('--before'),root=path.resolve(fileURLToPath(new URL('..',import.meta.url)));
const baseRoot=baseline?path.resolve(process.env.SP_VOTE_BASELINE_ROOT||path.resolve(root,'../../.cache/master-vote-preview')):root;
const {startServer}=await import(pathToFileURL(path.join(baseRoot,'server/index.js')));
const out=path.resolve(process.env.SP_VOTE_CAPTURE_OUT||'test/e2e/out/restart-vote');await fs.mkdir(out,{recursive:true});
const server=await startServer({port:0,host:'127.0.0.1',quiet:true,studio:false});let browser;
try{
 browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,pipe:true,args:['--no-sandbox']});
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.setViewport({width:1600,height:1100});await page.setBypassServiceWorker(true);
 await page.evaluateOnNewDocument(()=>{localStorage.setItem('sp.name','설정 검토 방장');sessionStorage.setItem('sp.entered','1');});
 await page.goto(`http://127.0.0.1:${server.port}`,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.__SP__?.store.get().connection.status==='online'&&window.__SP__.store.get().me.playerId);
 const send=(type,fields)=>page.evaluate(({type,fields})=>window.__SP__.net.request(type,fields),{type,fields});
 await send('room.create',{mode:'coop8',gameplayMode:'custom',difficulty:'NORMAL'});
 const open=async()=>{await page.click('.room-custom-extensions');await page.waitForSelector('.custom-ext');await page.click(baseline?'#ext-tab-rules':'#ext-tab-restartSettings');await page.waitForFunction(()=>!document.querySelector('.editor-status').textContent.includes('불러오는'));};
 await open();await new Promise(r=>setTimeout(r,400));
 const modal=await page.$('.custom-ext');await modal.screenshot({path:path.join(out,`settings-${baseline?'before':'after'}.png`)});
 if(!baseline){
  const vote=await page.$eval('[aria-label="투표 제한 시간"]',e=>({value:e.value,min:e.min,max:e.max}));assert.deepEqual(vote,{value:'45',min:'15',max:'90'});
  await page.select('[aria-label="동의 기준"]','1');await page.select('[aria-label="탈락한 참가자 투표"]','0');
  await modal.screenshot({path:path.join(out,'settings-majority-after.png')});
  await page.evaluate(()=>[...document.querySelectorAll('.custom-ext button')].find(e=>e.textContent==='적용').click());
  await page.waitForSelector('.custom-ext',{hidden:true});await page.waitForFunction(()=>window.__SP__.store.get().room.customExtensions.ruleValues?.restartAgreement===1);
  const room=await page.evaluate(()=>window.__SP__.store.get().room);const saved=server.lobby.rooms.get(room.code).customExtensions.ruleValues;
  assert.equal(saved.restartAgreement,1);assert.equal(saved.restartIncludeEliminated,0);
  await open();assert.equal(await page.$eval('[aria-label="동의 기준"]',e=>e.value),'1');
  let rejected=false;try{await send('room.setCustomExtensions',{selection:{bonds:[],stages:[],ruleValues:{restartVoteSeconds:91}}});}catch{rejected=true;}assert.equal(rejected,true);
  console.log(JSON.stringify({saved:{agreement:saved.restartAgreement,includeEliminated:saved.restartIncludeEliminated},vote,serverRejects91:rejected,errors}));
 }else console.log(JSON.stringify({baseline:true,errors}));
}finally{await browser?.close();await server.close();}
