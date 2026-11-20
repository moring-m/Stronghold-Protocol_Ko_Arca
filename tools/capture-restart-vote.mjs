// Browser globals are only referenced inside Puppeteer callbacks.
/* global window, document, caches, Image, innerWidth, innerHeight, getComputedStyle */
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=path.resolve(fileURLToPath(new URL('..',import.meta.url)));
// Optional SP_VOTE_ART_ROOT and SP_VOTE_THEME_ROOT supply already installed resources.
const baseRoot=root;
const artRoot=process.env.SP_VOTE_ART_ROOT,themeRoot=process.env.SP_VOTE_THEME_ROOT;
const {startServer}=await import(pathToFileURL(path.join(baseRoot,'server/index.js')));
import {TestClient} from '../test/helpers/wsClient.js';
import {createRng} from '../server/sim/rng.js';
import {generateDraft} from '../server/match/choices.js';
import {canPlace} from '../server/match/board.js';
import {splitHashedPath} from '../shared/assetPaths.js';
const out=path.resolve(process.env.SP_VOTE_CAPTURE_OUT||'.cache/restart-vote-final');await fs.mkdir(out,{recursive:true});
process.env.SP_TEST_MODE='1';
const server=await startServer({port:0,host:'127.0.0.1',quiet:true,studio:false,seedFn:()=>9102});
const base=`http://127.0.0.1:${server.port}`;
const manifest={baseCommit:'1127bf81',source:'origin/master',kind:'centered nonblocking restart vote checks',scenarios:[],themes:[],errors:[]};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));let browser;
const allGuests=[];
const mime={'.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.woff2':'font/woff2','.woff':'font/woff','.css':'text/css','.json':'application/json','.mp3':'audio/mpeg'};
try{
 browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,pipe:true,args:['--no-sandbox']});
 for(const count of (process.argv.includes('--mobile-only')?[4]:[4,8])){
  const context=await browser.createBrowserContext(),page=await context.newPage(),guests=[];
  page.setDefaultTimeout(45000);await page.setViewport({width:1600,height:1000});await page.setBypassServiceWorker(true);
  page.on('pageerror',e=>{manifest.errors.push(`${count}p: ${e.message}`);console.log('Page error',e.message);});
  await page.setRequestInterception(true);
  page.on('request',async req=>{try{const u=new URL(req.url());if(artRoot&&u.origin===base&&/^\/(assets|fonts)\//.test(u.pathname)){
   const sourceRoot=themeRoot&&u.pathname.includes('/ui-themes/')?themeRoot:artRoot;
   const file=path.resolve(sourceRoot,`.${decodeURIComponent(splitHashedPath(u.pathname).path)}`);
   if(file.startsWith(path.resolve(sourceRoot)+path.sep))try{await req.respond({status:200,contentType:mime[path.extname(file)]||'application/octet-stream',body:await fs.readFile(file)});return;}catch{}
  }await req.continue();}catch{try{await req.continue();}catch{}}});
  await page.evaluateOnNewDocument(n=>{localStorage.setItem('sp.name',`${n}인 검토 방장`);sessionStorage.setItem('sp.entered','1');},count);
  await page.goto(base,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__SP__?.store.get().me.playerId&&window.__SP__.store.get().connection.status==='online');
  await page.evaluate(async()=>{const {updateSettings}=await import('/js/ui/settings.js');updateSettings({muted:true});});
  if(themeRoot){
   const files=JSON.parse(await fs.readFile(path.join(root,'content/custom/ui/ui-theme-resources.json'),'utf8')).files;
   manifest.themeResources=await page.evaluate(async files=>{
    const cache=await caches.open('restart-vote-theme-checks');
    for(const f of files){const response=await fetch(f.path);if(!response.ok)throw Error(f.path);const blob=await response.blob();if(blob.size!==f.bytes)throw Error('theme byte size: '+f.path);await cache.put(f.path,new Response(blob,{headers:{'content-type':'image/png'}}));const img=new Image();img.src=URL.createObjectURL(blob);await img.decode();URL.revokeObjectURL(img.src);}
    for(const id of new Set(files.map(f=>f.path.split('/')[3])))localStorage.setItem('sp.resources.themeReady.'+id,'verified-download');return files.length;
   },files);
  }
  const send=async(type,fields={})=>page.evaluate(async({type,fields})=>window.__SP__.net.request(type,fields),{type,fields});
  await send('room.create',{version:'act2autochess',mode:count===8?'coop8':'coop',difficulty:'NORMAL',gameplayMode:'custom',test:true});
  await send('room.setCustomExtensions',{selection:{bonds:[],stages:[],rules:['augments'],ruleValues:{augmentEnemyVote:1,restartRoomCooldown:0,restartPlayerCooldown:0,restartRequestLimit:10,restartVoteSeconds:90}}});
  const roomCode=await page.evaluate(()=>window.__SP__.store.get().room.code);
  for(let i=1;i<count;i++){
   const client=await TestClient.connect(`ws://127.0.0.1:${server.port}/ws`),welcome=await client.hello(`검토 팀원 ${i+1}`);
   assert.equal((await client.request({t:'room.join',code:roomCode,testAck:true})).t,'ok');
   assert.equal((await client.request({t:'room.ready',ready:true})).t,'ok');
   guests.push({client,id:welcome.playerId});allGuests.push(client);
  }
  await send('room.start');
  const room=server.lobby.rooms.get(roomCode),match=room.match,hostId=await page.evaluate(()=>window.__SP__.store.get().me.playerId);
  console.log(`Started master ${count}p room ${roomCode}; seats=${room.seats.filter(Boolean).length}; phase=${match.phase}`);
  assert.equal(room.seats.filter(Boolean).length,count);
  const until=async(predicate,label)=>{const t=Date.now();while(!predicate()){if(Date.now()-t>45000)throw new Error(`Timeout ${count}p ${label}; phase=${match.phase} R${match.round}`);await sleep(100);}};
  const command=async(cmd,args)=>send('g.test',{cmd,args});
  const snap=async(name,extra={})=>{await page.screenshot({path:path.join(out,`${count}p-${name}.png`)});manifest.scenarios.push({file:`${count}p-${name}.png`,players:count,mode:room.mode,phase:match.phase,round:match.round,...extra});console.log(`Captured ${count}p-${name}`);};
  const preview=async(name,label,selector)=>{
   await page.waitForSelector(selector);await page.waitForSelector('.pbanner--overlay',{hidden:true,timeout:10000});await sleep(200);
   // Ignore the choice cards' entry transforms; compare their actual layout boxes.
   const choiceGeometry=()=>page.$$eval('.spov__inner,.spcard,.draft__main,.rsel__main,.rsel__foot',es=>es.map(e=>
    [e.offsetLeft,e.offsetTop,e.offsetWidth,e.offsetHeight]));
   const beforeVote=await choiceGeometry();
   const requested=await guests[0].client.request({t:'room.requestRestart',matchNo:room.matchCount});assert.equal(requested.t,'ok',JSON.stringify(requested));
   await page.waitForSelector('.restart-decision');
   assert.equal(match.paused,false,'restart vote must not pause the match');
   const clock=match._clockNow(),deadline=match.deadline;
   await sleep(300);assert.ok(match._clockNow()>clock);assert.equal(match.deadline,deadline);
   const toggle=async expanded=>{if(await page.$eval('.restart-decision__toggle',e=>e.getAttribute('aria-expanded'))!==String(expanded))await page.click('.restart-decision__toggle');await sleep(70);};
   const checkLayout=async()=>{
    const result=await page.evaluate(()=>{
     const panel=document.querySelector('.restart-decision'),r=panel.getBoundingClientRect();
     const toggle=panel.querySelector('.restart-decision__toggle'),b=toggle.getBoundingClientRect();
     const at=document.elementFromPoint(b.x+b.width/2,b.y+b.height/2);
     const body=panel.querySelector('.modal__body');
     const centered=Math.abs(r.x+r.width/2-innerWidth/2)<2&&Math.abs(r.y+r.height/2-innerHeight/2)<2;
     return {onScreen:r.x>=0&&r.y>=0&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1,toggleVisible:at===toggle||toggle.contains(at),centered,expanded:!body.hidden,bodyHidden:body.hidden?getComputedStyle(body).display==='none':true,veil:!!document.querySelector('.restart-shade')};
    });
    assert.equal(result.onScreen,true,JSON.stringify(result));assert.equal(result.toggleVisible,true,JSON.stringify(result));
    assert.equal(result.centered,true,'vote must stay centered above choices: '+JSON.stringify(result));assert.equal(result.bodyHidden,true);assert.equal(result.veil,false);
    return result;
   };
   assert.equal(await page.$eval('.restart-decision__toggle',e=>e.getAttribute('aria-expanded')),'true','every vote starts expanded, including choice screens');
   assert.deepEqual(await choiceGeometry(),beforeVote,'vote must not move or resize choice UI');
   await toggle(false);
   assert.deepEqual(await choiceGeometry(),beforeVote,'folding must not move or resize choice UI');
   await toggle(true);
   for(const [width,height]of [[1600,1000],[1024,768],[390,844],[320,640],[844,390]]){
    await page.setViewport({width,height});await sleep(120);
    for(const expanded of [false,true]){await toggle(expanded);await checkLayout();if(count===8)await snap(`${name}-${width}x${height}-${expanded?'expanded':'collapsed'}`,{kind:'layout',expanded,version:'act2autochess',family:match.sp?.family});}
   }
   await page.setViewport({width:1600,height:1000});await toggle(true);
   if(name==='prep'){
    // The actual gameplay request and keyboard focus remain available throughout voting.
    await send('g.refresh');
    await page.focus('.game-chat__toggle');await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(()=>!document.activeElement.closest('.restart-overlay-host')),true);
    const themes=await page.evaluate(async()=>(await import('/js/ui/uiThemes.js')).UI_THEME_LIST);
    for(const theme of themes){
     await page.evaluate(async id=>(await import('/js/ui/uiThemes.js')).applyUiTheme(id),theme.id);
     if(theme.id!=='default')await page.waitForFunction(()=>!!document.querySelector('#ui-theme-css')?.sheet);
     await sleep(60);await checkLayout();
     const styles=await page.evaluate(()=>{
      const panel=document.querySelector('.restart-decision'),probe=document.createElement('section');probe.className='modal__box brackets modal__box--gold';probe.style.cssText='position:fixed;left:-9999px;top:0';document.body.append(probe);
      const a=getComputedStyle(panel),b=getComputedStyle(probe),keys=['backgroundImage','borderImageSource','clipPath','borderRadius','fontFamily'];
      const pairs=Object.fromEntries(keys.map(k=>[k,[a[k],b[k]]]));const opacity=a.opacity,bg=a.backgroundColor;probe.remove();return {pairs,opacity,bg};
     });
     for(const[key,[actual,expected]]of Object.entries(styles.pairs))assert.equal(actual,expected,theme.id+': '+key);
     assert.equal(styles.opacity,'1');assert.ok(!styles.bg.startsWith('rgba('),theme.id+': opaque base missing');
     await toggle(false);await checkLayout();await toggle(true);
     if(count===8)await snap('theme-'+theme.id,{kind:'theme',theme:theme.id});
     manifest.themes.push({players:count,id:theme.id,...styles});
    }
    await page.evaluate(async()=>(await import('/js/ui/uiThemes.js')).applyUiTheme('default'));
    await page.click('.gm__gear:not(.gm__guide):not(.gm__fs)');
    await page.waitForSelector('.settings-modal');
    assert.equal(await page.evaluate(()=>{
      const b=document.querySelector('.restart-decision__toggle').getBoundingClientRect();
      return !document.elementFromPoint(b.x+b.width/2,b.y+b.height/2)?.closest('.restart-overlay-host');
    }),true,'standard modal must keep focus and stacking priority');
    await page.keyboard.press('Escape');
    await page.waitForSelector('.settings-modal',{hidden:true});
    assert.ok(await page.$('.restart-decision'));

   }
   if(name==='event'||name==='bounty'){
    const pid=match.spTurn(),card=match.sp.cards.find(c=>match.spCardAvailable(c));
    const client=guests.find(g=>g.id===pid)?.client;
    if(client)assert.equal((await client.request({t:'g.choice',idx:card.idx})).t,'ok');else await send('g.choice',{idx:card.idx});
    assert.equal(match.sp.picks[pid],card.idx,'event choices must remain usable during the vote');
   }
   if(name==='augment-ally'){
    const s=match.augments.current;
    await send('g.augmentReroll',{eventId:s.id,side:'ally',idx:0,cardId:s.slots.get(hostId).cards[0].id});
    assert.equal(match.paused,false);
   }
   // Card selection stays local; two real clicks still submit once after the 150ms guard.
   await page.click('.restart-decision__card:first-child');
   await toggle(false);await toggle(true);
   assert.equal(await page.$eval('.restart-decision__card:first-child',e=>e.getAttribute('aria-pressed')),'true');
   await sleep(180);await page.click('.restart-decision__card:first-child');
   await page.waitForFunction(()=>!window.__SP__.store.get().restartVote?.vote);
   assert.equal(match.paused,false);
  };
  await send('g.infoReady');for(const g of guests)await g.client.request({t:'g.infoReady'});
  await until(()=>match.phase==='BAND_DRAFT','band');
  await preview('band-draft','전략 선택','.draft__main');
  await command('phase',{name:'battleCheck'});
  await until(()=>match.phase==='PREP','prep');await sleep(2200);
  const ps=match.players.get(hostId);
  const chessIds=[...match.pool.entries.keys()].filter(id=>{const c=match.gd.chess(id);return c&&!c.isGolden&&c.tier===1&&!match.bannedChess.includes(id);}).slice(0,3);
  for(const id of chessIds)await command('chess',{id});
  for(const piece of ps.hand.filter(p=>p?.kind==='chess')){
   const tile=[...ps.deployMap()].map(([key])=>key.split(',').map(Number)).find(([r,c])=>!ps.board.has(`${r},${c}`)&&canPlace(ps.deployMap(),ps._placementOf(piece),r,c));
   if(tile)await send('g.move',{uid:piece.uid,to:{area:'board',row:tile[0],col:tile[1]}});
  }
  await preview('prep','정비','.shopbar');
  if(process.argv.includes('--mobile-only')){for(const g of guests)await g.client.terminate();await context.close();continue;}
  await command('round',{round:3});
  await until(()=>match.phase==='SP_DRAFT'&&!!match.sp,'event');
  await preview('event','이벤트 선택','.spov:not(.augment-overlay)');
  // Generate an actual official bounty draft with a reproducible test seed (no production rule override).
  for(let seed=1;seed<1000;seed++){
   if(generateDraft(match.gd,createRng(seed),3,{stageId:match.stageId,bondAvailable:id=>match.bondLive(id),itemAvailable:id=>match.itemPool.canGain(id)})?.family==='bounty'){
    match.rngDraft=createRng(seed);match.enterSpDraft();match.flush(true);break;
   }
  }
  await page.waitForFunction(()=>window.__SP__.store.get().match.public?.sp?.family==='bounty');
  await preview('bounty','현상금 선택','.spov:not(.augment-overlay)');
  await command('round',{round:4});
  await until(()=>!!match.augments.current&&match.augments.current.side==='ally','ally augment');
  await preview('augment-ally','아군 증강 선택','.augment-overlay--ally');
  const choose=async(side)=>{
   const selection=match.augments.current;
   for(const [pid,client] of [[hostId,null],...guests.map(g=>[g.id,g.client])]){
    const cards=side==='ally'?selection.slots.get(pid)?.cards:selection.boss.cards;
    const fields={eventId:selection.id,side,idx:0,cardId:cards[0].id};
    if(client)assert.equal((await client.request({t:'g.augmentPick',...fields})).t,'ok');else await send('g.augmentPick',fields);
   }
  };
  await choose('ally');await until(()=>match.augments.current?.side==='enemy','enemy augment');
  await preview('augment-enemy','적 증강 투표','.augment-overlay--enemy');
  await choose('enemy');await until(()=>match.phase==='PREP'&&!match.augments.current,'post augment prep');
  await command('phase',{name:'combat'});await until(()=>match.phase==='COMBAT','combat');
  await page.waitForSelector('.gm canvas');await sleep(1500);
  await preview('combat','일반 전투','.gm canvas');
  for(const g of guests)await g.client.request({t:'room.leave'});
  await send('room.leave');for(const g of guests)await g.client.terminate();
  await context.close();
 }
 assert.deepEqual(manifest.errors,[]);console.log(`Completed ${manifest.scenarios.length} screenshots, ${manifest.themes.length} theme checks; no page errors`);
}catch(error){manifest.failure=error.stack;console.error(error);process.exitCode=1;}finally{
 await fs.writeFile(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2));
 for(const client of allGuests)try{await client.terminate();}catch{}
 await browser?.close();await server.close();
}
