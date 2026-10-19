import {test} from 'node:test';
import assert from 'node:assert/strict';
import {startServer} from '../../server/index.js';

test('shared nine-card choice keeps usable rows with eight players',{skip:process.env.SP_E2E!=='1'},async()=>{
 const fixture=`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${['theme','components','screens/game','screens/game-panels'].map(n=>`<link rel="stylesheet" href="/css/${n}.css">`).join('')}</head><body><div id="fixture" class="screen gm has-sp"></div><script type="module" src="/choice-fixture.js"></script></body></html>`;
 const script=`import{render}from'/vendor/preact.module.js';import{html}from'/js/ui/components.js';import{ChoiceView}from'/js/ui/choiceOverlay.js';
 const players=Array.from({length:8},(_,i)=>({playerId:'p'+i,name:'참가자 '+i,seat:i}));
 const sp={family:'bounty',name:'현상 수배',desc:'수배 목표를 선택하고 추가 보상을 받으십시오.',order:players.map(p=>p.playerId),turnPid:'p1',pickOf:new Map([['p0',0]]),cards:Array.from({length:9},(_,idx)=>({idx,name:'수배 목표 '+idx,desc:'다음 라운드의 적에게 적용되는 효과 설명입니다.',takenBy:idx===0?'p0':null}))};
 render(html\`<\${ChoiceView} pub=\${{players,deadline:Date.now()+60000}} sp=\${sp} myId="p2" solo=\${false}/>\`,document.getElementById('fixture'));window.ready=true;`;
 const server=await startServer({host:'127.0.0.1',port:0,quiet:true,handleRequest:(req,res)=>{if(req.url==='/choice-fixture'||req.url==='/choice-fixture.js'){res.setHeader('Content-Type',req.url.endsWith('.js')?'text/javascript':'text/html');res.end(req.url.endsWith('.js')?script:fixture);return true;}return false;}});
 const P=(await import('puppeteer-core')).default,browser=await P.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 try{
  const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  for(const [width,height]of [[1125,847],[1920,1080],[756,366]]){
   await page.setViewport({width,height});await page.goto(server.url+'/choice-fixture');await page.waitForFunction(()=>window.ready);
   const layout=await page.evaluate(()=>({order:!!document.querySelector('.spov__order'),cards:[...document.querySelectorAll('.spcard')].map(e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom}})}));
   assert.equal(layout.order,true);assert.equal(layout.cards.length,9);
   for(const r of layout.cards){assert.ok(r.height>height*.12,JSON.stringify({width,height,card:r}));assert.ok(r.bottom<=height+1);}
   assert.ok(Math.abs(layout.cards[0].y-layout.cards[2].y)<1);assert.ok(layout.cards[3].y>=layout.cards[0].bottom);
   if(width===1125)await page.screenshot({path:'/tmp/shared-choice-fixed.png'});
  }
  assert.deepEqual(errors,[]);
 }finally{await browser.close();await server.close();}
});
