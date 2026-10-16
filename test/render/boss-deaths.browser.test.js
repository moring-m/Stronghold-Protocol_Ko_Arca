import {test} from 'node:test';import assert from 'node:assert/strict';import {existsSync} from 'node:fs';
import {startServer} from '../../server/index.js';
test('a boss stays absent after its death fade, stale live snapshots and same-battle reentry',{skip:!existsSync('/usr/bin/chromium'),timeout:45000},async()=>{
 const server=await startServer({port:0,host:'127.0.0.1',quiet:true}),puppeteer=(await import('puppeteer-core')).default;
 const browser=await puppeteer.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try{
  const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.port}/dev/render-demo.html?scene=prep&board=2d&paused=1&panel=0`,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>globalThis.__demo?.ready||globalThis.__demo?.error,{timeout:30000});assert.equal(await page.evaluate(()=>__demo.error||null),null);
  await page.evaluate(()=>{
   const v=__demo.view;globalThis.__bossInfo={id:9876,kind:'enemy',side:'enemy',defId:'test_dead_boss',boss:true,x:10,y:3,maxHp:1000};globalThis.__bossMeta={fieldId:'boss-test',kind:'boss',battleId:'one',units:[__bossInfo]};
   v.enterBattle(__bossMeta);v.setCamera('boss');v.setLocalFeed({on:true,speed:1});globalThis.__bossTime=0;
   globalThis.__bossFeed=setInterval(()=>{__bossTime+=.05;v.pushSnapshot({fieldId:'boss-test',gt:__bossTime,units:[[9876,10,3,1000,1000,0,0,0,0,1,1]],down:[]});},30);
  });
  await page.waitForFunction(()=>__demo.view.debug.views.has(9876));
  await page.evaluate(()=>__demo.view.pushEvents({fieldId:'boss-test',gt:__bossTime,ev:[['die',9876,'killed']]}));
  await page.waitForFunction(()=>!__demo.view.debug.views.has(9876),{timeout:10000});
  await page.evaluate(()=>__demo.view.enterBattle({...__bossMeta}));
  await new Promise(resolve=>setTimeout(resolve,350));assert.equal(await page.evaluate(()=>__demo.view.debug.views.has(9876)),false,'old positive snapshots and metadata must not respawn the dead boss');
  await page.evaluate(()=>__demo.view.enterBattle({...__bossMeta,battleId:'two'}));await page.waitForFunction(()=>__demo.view.debug.views.has(9876));
 }finally{await browser.close();await server.close();}
});
