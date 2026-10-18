import {test} from 'node:test';
import assert from 'node:assert/strict';
import {startServer} from '../../server/index.js';

test('production game entry loads settlement styles and permits navigating back',{skip:process.env.SP_E2E!=='1'},async()=>{
 const server=await startServer({host:'127.0.0.1',port:0,quiet:true});
 const P=(await import('puppeteer-core')).default,browser=await P.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setViewport({width:1280,height:800});await page.evaluateOnNewDocument(()=>localStorage.setItem('sp.resources.downloadConsent','1'));
  await page.setRequestInterception(true);page.on('request',r=>/\/assets\/|raw.githubusercontent.com|fonts.googleapis|fonts.gstatic/.test(r.url())?r.abort():r.continue());
  await page.goto(server.url,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>!!globalThis.__SP__,{timeout:15000}).catch(async e=>{throw Error(JSON.stringify({errors,text:await page.$eval('body',e=>e.innerText.slice(0,600))}))});
  await page.evaluate(()=>{__SP__.store.patch('session',{entered:true});__SP__.net.setName('결과 테스트')});await page.waitForFunction(()=>__SP__.net.status==='online',{timeout:15000});
  const before=await page.$$eval('link[rel=stylesheet]',nodes=>nodes.map(n=>new URL(n.href).pathname));assert.ok(!before.includes('/css/screens/settle.css'),'settlement CSS is lazy');
  for(const count of [1,8]){
  await page.evaluate(count=>{
   const store=__SP__.store,id=store.get().me.playerId,players=Array.from({length:count},(_,i)=>({playerId:i?'p'+i:id,seat:i,name:'결과 테스트 '+i,alive:true,lp:28,roundsPassed:3,lineup:[],bonds:{},reward:0,trophies:0}));
   store.patch('session',{entered:true});store.patch('match',{public:{phase:'RESULT',mode:'solo',difficulty:'NORMAL',players},result:{mode:'solo',difficulty:'NORMAL',victory:false,roundsPassed:3,durationMs:1000,players}});
  },count);
  await page.waitForSelector('[data-testid=settle-self]',{timeout:15000});
  for(const name of ['settle','match-popups','protocol-boot','boss-plates'])assert.ok(await page.$(`link[href*="/css/screens/${name}.css"]`),name);
  await page.waitForFunction(()=>{const r=document.querySelector('.settle__next')?.getBoundingClientRect();return r&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1});
  const box=await page.$eval('.settle__next',e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,visible:getComputedStyle(e).visibility}});
  assert.ok(box.w>40&&box.h>20&&box.x>=0&&box.y>=0&&box.x+box.w<=1281&&box.y+box.h<=801,JSON.stringify(box));
  const fold=await page.$('[aria-label="리소스 다운로드 창 접기"]');if(fold)await fold.click();
  await page.screenshot({path:'/tmp/result-fixed.png'});
  await page.click('.settle__next');await page.waitForSelector('[data-testid=settle-team]',{timeout:5000}).catch(e=>{throw Error(e.message+' '+JSON.stringify(errors))});
  if(count===8){await page.waitForFunction(()=>[...document.querySelectorAll('.tcard')].every(e=>e.getAnimations().every(a=>a.playState==='finished')));await page.screenshot({path:'/tmp/result-team-8-fixed.png'});const cards=await page.$$eval('.tcard',nodes=>nodes.map(e=>{const r=e.getBoundingClientRect();return {x:r.x,right:r.right,y:r.y,bottom:r.bottom}}));assert.equal(cards.length,8);for(const r of cards)assert.ok(r.x>=0&&r.right<=1281&&r.y>=0&&r.bottom<=801,JSON.stringify(r));}
  assert.match(await page.$eval('.steam__title',e=>e.textContent),/시뮬레이션 중단/);
  assert.match(await page.$eval('.steam__detail',e=>e.textContent),/상세 통계/);
  const footer=await page.$$eval('.steam__outcome,.steam__rounds,.steam__when',nodes=>nodes.map(e=>e.textContent).join(' '));assert.doesNotMatch(footer,/[\u3400-\u9fff]/);
  await page.click('.steam__detail');await page.waitForSelector('[data-testid=settle-detail]');
  await page.click('[data-testid=settle-detail] .result__foot button');
  await page.waitForFunction(()=>!document.querySelector('[data-testid=settle-detail]'));
  await page.click('.settle__back');await page.waitForFunction(()=>!__SP__.store.get().match.public);await page.waitForFunction(()=>!document.querySelector('[data-testid=settle]'));
  }
  assert.deepEqual(errors,[]);
 }finally{await browser.close();await server.close();}
});
