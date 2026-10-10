// Optional against the existing local Ursus preview; exercises real Pixi masks.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
const preview=process.env.SP_PREVIEW_URL,chrome=process.env.CHROME_PATH||'/usr/bin/chromium';
test('Archet nun-skin eye masks remain enabled in crowded fields at every quality', {skip:!preview||!existsSync(chrome),timeout:180000},async()=>{
 const puppeteer=(await import('puppeteer-core')).default;
 const browser=await puppeteer.launch({executablePath:chrome,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
  const page=await browser.newPage();await page.setViewport({width:1200,height:800});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(preview+'/dev/render-demo.html?scene=prep&quality=low&panel=0&board=2d',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__demo?.ready||window.__demo?.error,{timeout:40000});
  assert.equal(await page.evaluate(()=>window.__demo.error||null),null);console.log('Mask fixture ready');
  await page.evaluate(()=>{
   const view=window.__demo.view,skin='skin_char_332_archet_sale_14';
   const units=[1,2,3].map(id=>({id,kind:'op',side:'ally',defId:'chess_char_4_13_a',spine:skin,avatar:skin,x:3+id,y:10,maxHp:1000}));
   view.enterBattle({fieldId:'eye-mask-test',kind:'normal',units});
   view.pushSnapshot({fieldId:'eye-mask-test',gt:0,units:units.map(u=>[u.id,u.x,u.y,1000,1000,0,0,0,0])});
  });
  await page.waitForFunction(()=>[...window.__demo.view.debug.views.values()].filter(v=>v.actor?.clipped).length===3,{timeout:60000}).catch(async e=>{console.log(await page.evaluate(()=>[...__demo.view.debug.views.values()].map(v=>({id:v.id,entry:!!v.entry,ready:v.spineReady,clipped:v.actor?.clipped,busy:v._spineBusy,tries:v._spineTries,info:v.info}))));throw e;});
  console.log('Three clipping models loaded');
  for(const quality of ['low','medium','high']){
   await page.evaluate(q=>window.__demo.view.setSettings({quality:q}),quality);
   await page.waitForFunction(()=>[...window.__demo.view.debug.views.values()].every(v=>v.actor?.clipOn===true));
   const masks=await page.evaluate(()=>[...window.__demo.view.debug.views.values()].map(v=>({on:v.actor.clipOn,masks:v.actor.spine.skeleton.slots.filter(s=>s.clippingContainer?.mask).length})));
   assert.equal(masks.length,3);assert.ok(masks.every(m=>m.on&&m.masks>0),quality);console.log('Clipping quality',quality);
  }
  await page.evaluate(()=>{
   const view=window.__demo.view;window.__demo.pause();
   view.enterBattle({fieldId:'n:watched',kind:'boss',rect:{r0:0,r1:5,c0:0,c1:20},prep:true,units:[],nextEnemies:[{enemyKey:'enemy_9017_achunt',count:1,boss:true,start:[3,10]}]});
   view.setCamera('boss',{instant:true});
  });
  await page.waitForFunction(()=>window.__demo.view.debug.leader?.view.spineReady,{timeout:30000}).catch(async e=>{console.log(await page.evaluate(()=>{const d=__demo.view.debug,v=d.leader?.view;return {leader:!!v,ready:v?.spineReady,entry:!!v?.entry,busy:v?._spineBusy,visible:v?.root.visible,camera:d.camKind,failures:[...v.ctx.assets.spine.cache.map].filter(([k,e])=>e.error).map(([k,e])=>({k,error:String(e.error)}))};}));throw e;});
  assert.ok(await page.evaluate(()=>window.__demo.view.debug.leader.view.root.visible),'spectator prep camera shows the leader');
  assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});

test('spectator benches render read-only, survive snapshots, and mirror on the right boss half', {skip:!preview||!existsSync(chrome),timeout:180000},async()=>{
 const puppeteer=(await import('puppeteer-core')).default;
 const browser=await puppeteer.launch({executablePath:chrome,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 try {
  const page=await browser.newPage(); const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  await page.setViewport({width:1400,height:900});
  await page.goto(preview+'/dev/render-demo.html?scene=prep&panel=0&board=2d',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__demo?.ready||window.__demo?.error,{timeout:40000});
  const result=await page.evaluate(async()=>{
   const v=window.__demo.view; window.__demo.pause();
   v.enterBattle({fieldId:'bench-test',kind:'normal',prep:true,units:[]});
   const pieces=[null,{uid:991,kind:'chess',id:'chess_char_1_01_a'}];
   v.setObservedBench({playerId:'p1',pieces,tempPieces:[]});
   const before=v.debug.views.get('wb:p1:991');
   v.pushSnapshot({fieldId:'bench-test',gt:1,units:[]});
   await new Promise(r=>setTimeout(r,400));
   const normal={x:before.x,y:before.y,alive:before.alive,alpha:before.root.alpha};
   v.enterBattle({fieldId:'boss-bench',kind:'boss',prep:true,units:[]});
   v.setObservedBench({playerId:'p2',pieces,tempPieces:[]},{boss:true,side:'R'});
   const right=v.debug.views.get('wb:p2:991');
   const boss={x:right.x,y:right.y};
   v.setObservedBench({playerId:'p2',pieces:[],tempPieces:[]});
   return {normal,boss,cleared:!v.debug.views.has('wb:p2:991')};
  });
  assert.deepEqual(result.normal,{x:1,y:7,alive:true,alpha:1});
  assert.deepEqual(result.boss,{x:19,y:0}); assert.equal(result.cleared,true);
  assert.deepEqual(errors,[]);
 } finally {await browser.close();}
});
