import {loadoutOptions} from '../../shared/protocol.js';
import {TestClient} from '../helpers/wsClient.js';
import {test} from 'node:test';import assert from 'node:assert/strict';import {existsSync,readFileSync,mkdirSync,writeFileSync} from 'node:fs';import {execFileSync} from 'node:child_process';import {startServer} from '../../server/index.js';import {APP_VERSION} from '../../shared/constants.js';
test('shared navigation keeps equal heights, centered titles and consistently icon-only help across real pages',{skip:process.env.SP_E2E!=='1'},async()=>{
 const output='docs/ui-consistency-2026-10-20',compare=process.env.SP_COMPARE_SCREENSHOTS==='1',captureCurrent=process.env.SP_CAPTURE_CURRENT==='1';if(compare||captureCurrent)mkdirSync(output,{recursive:true});
 const server=await startServer({port:0,host:'127.0.0.1',quiet:true,dataDir:'content/production/data',assetIndex:false,handleRequest(req,res){const path=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\/(assets|fonts)\/~[^/]+\//,'/$1/');if(['/vendor/browser-resources.json','/dev/ursus-config.json'].includes(path)){res.statusCode=404;res.end();return true;}if(path.startsWith('/capture/')){const file=output+'/'+path.slice(9);if(existsSync(file)){res.setHeader('Content-Type',file.endsWith('.png')?'image/png':'text/html');res.end(readFileSync(file));return true;}}if(path.startsWith('/assets/')||path.startsWith('/fonts/')){const file=['content/production'+path,'.cache/local-production/public'+path,'/tmp/analysis-panel-assets'+path].find(existsSync);if(file){res.end(readFileSync(file));return true;}}return false;}});
 const P=(await import('puppeteer-core')).default,browser=await P.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 const old=new Map(['public/js/screens/lobby.js','public/js/screens/room.js','public/js/screens/loadout.js','public/js/screens/stats.js','public/js/ui/laboratory.js','public/js/ui/guide.js'].map(path=>['/'+path.slice(7),execFileSync('git',['show','HEAD:'+path])]));
 const records=Object.values(JSON.parse(readFileSync('content/production/data/chess.json')));
 const first=records.find(c=>c.optionalRecruit&&!c.isGolden&&c.chessId.endsWith('_5_a')&&!c.recruitPrototype&&c.skills?.length===3&&!c.recruitReserve);
 const second=records.find(c=>c.optionalRecruit&&!c.isGolden&&c.chessId.endsWith('_6_a')&&!c.recruitPrototype&&c.skills?.length===3&&c.charId!==first.charId&&!c.recruitReserve);
 const third=records.find(c=>c.optionalRecruit&&!c.isGolden&&c.chessId.endsWith('_6_a')&&!c.recruitPrototype&&c.charId!==second.charId&&c.charId!==first.charId&&loadoutOptions(c,records.find(g=>g.chessId===c.goldenId)).modules.length!==loadoutOptions(second,records.find(g=>g.chessId===second.goldenId)).modules.length);
 assert.ok(third,'exercise differing module counts');
 const selected=[first.chessId,second.chessId,third.chessId],initialEntries=Object.fromEntries(selected.map(id=>[id,{selected:true}]));
 const captures=[];try{
 for(const phase of compare?['before','after']:['after']){
  const context=await browser.createBrowserContext(),page=await context.newPage(),errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error('browser error:',e.message);});
  try{await page.setViewport({width:1440,height:1000});await page.setBypassServiceWorker(true);await page.evaluateOnNewDocument((v,entries)=>{localStorage.setItem('sp.patchNotes.seenVersion',v);localStorage.setItem('sp.pref.loadout',JSON.stringify({v:1,entries}));},APP_VERSION,initialEntries);await page.setRequestInterception(true);page.on('request',r=>{const u=new URL(r.url());if(u.hostname!=='127.0.0.1'||u.pathname.endsWith('resource-worker.js'))return r.abort();if(phase==='before'){if(u.pathname==='/css/ui-consistency.css')return r.respond({status:200,contentType:'text/css',body:''});if(old.has(u.pathname))return r.respond({status:200,contentType:'text/javascript',body:old.get(u.pathname)});}return r.continue();});
  await page.goto(server.url,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>!!window.__SP__);await page.evaluate(()=>{__SP__.store.patch('session',{entered:true});__SP__.net.setName('UI 비교');});await page.waitForSelector('.lobby-screen .topbar');
  const check=async selector=>{if(phase!=='after')return;const p=await page.$eval(selector,e=>{const r=e.getBoundingClientRect(),c=e.querySelector('.topbar__center,.lo-top__center,.st-top__center').getBoundingClientRect();return{className:e.className,styleSheets:[...document.styleSheets].map(s=>s.href).filter(x=>x?.includes('consistency')),height:r.height,center:(c.left+c.right)/2,viewport:innerWidth,width:e.scrollWidth,client:e.clientWidth};});assert.equal(Math.round(p.height),88,JSON.stringify(p));assert.ok(Math.abs(p.center-p.viewport/2)<2,JSON.stringify(p));assert.ok(p.width<=p.client+1,JSON.stringify(p));const typography=await page.$$eval(selector+' .topbar__title,'+selector+' .lo-title-tabs button,'+selector+' .st-tab',es=>es.map(e=>({size:getComputedStyle(e).fontSize,weight:getComputedStyle(e).fontWeight,line:getComputedStyle(e).lineHeight})));for(const t of typography){assert.equal(t.size,'22px');assert.equal(t.weight,'700');assert.equal(t.line,'27.5px');}};
  const shot=async(name,selector,full=false)=>{await page.evaluate(()=>document.activeElement?.blur());if(compare||captureCurrent){const file=phase+'-'+name+'.png';if(full)await page.screenshot({path:output+'/'+file});else{const rect=await page.$eval(selector,e=>{const r=e.getBoundingClientRect();return{x:0,y:Math.max(0,r.y),width:innerWidth,height:Math.min(190,innerHeight-r.y)}});await page.screenshot({path:output+'/'+file,clip:rect});}captures.push({phase,name,file});}};
  await check('.lobby-screen .topbar');await shot('lobby','.lobby-screen .topbar');
  if(phase==='after'){
    const host=await TestClient.connect(`ws://127.0.0.1:${server.port}/ws`);
    try{
      await host.hello('관전 안내 확인');await host.request({t:'room.create',mode:'coop',difficulty:'NORMAL',spectators:0});const room=await host.waitFor('room.state');
      await page.type('.join-row input',room.code);await page.click('.join-spectate');
      await page.waitForFunction(()=>[...document.querySelectorAll('.toast__text')].some(e=>e.textContent==='관전이 허용되지 않은 방입니다.'));
      assert.equal(await page.$('.room-screen'),null);await page.click('.toast');for(let i=0;i<30&&await page.$('.toast');i++)await new Promise(r=>setTimeout(r,50));
    }finally{host.terminate();}
  }

  await page.click('[data-testid="loadout-open"]');await page.waitForSelector('.lo-top');await check('.lo-top');await shot('loadout','.lo-top');
  await page.waitForSelector('.lo-grid');await page.click('#lo-tab-recruits');try{await page.waitForSelector('.lo-grid--recruits',{timeout:8000});}catch(err){console.error('loadout state',await page.evaluate(()=>({text:document.body.innerText.slice(-4000),tabs:[...document.querySelectorAll('[role=tab]')].map(e=>({id:e.id,selected:e.getAttribute('aria-selected')}))})));await page.screenshot({path:'/tmp/recruit-failure.png'});throw err;}
  if(phase==='after'){
    await page.waitForSelector('.lo-recruit-selected .lo-row');assert.equal((await page.$$('.lo-recruit-selected .lo-row')).length,3);assert.equal((await page.$$('.lo-recruit-selected__empty')).length,1);
    const rosterOrder=()=>page.$$eval('.lo-grid--recruits .lo-card',es=>es.map(e=>e.dataset.chess.replace(/_[56]_a$/,'')));
    const originalOrder=await rosterOrder();
    const kit=await page.$$eval('.lo-recruit-selected__tier--6 .lo-row',es=>es.map(e=>{const x=q=>e.querySelector(q).getBoundingClientRect().x;return{skill:x('.lo-row__skills'),module:x('.lo-row__modules'),close:x('.lo-recruit-remove'),count:e.querySelectorAll('.lo-row__modules button').length};}));
    assert.equal(kit.length,2);assert.notEqual(kit[0].count,kit[1].count);assert.equal(kit[0].skill,kit[1].skill);assert.equal(kit[0].module,kit[1].module);assert.equal(kit[0].close,kit[1].close);
    const card='.lo-recruit-selected [data-chess="'+selected[0]+'"]';await page.click(card+' [data-skill="0"]');
    const shared=await page.evaluate(async id=>{const{loadoutStore}=await import('/js/ui/loadoutSync.js');return loadoutStore.get().entries[id.replace('_5_a','_6_a')]?.skill;},selected[0]);assert.equal(shared,0);
    const boxes=await page.$$eval('.lo-recruit-selected__tier',es=>es.map(e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width};}));assert.ok(boxes[1].x>boxes[0].x);assert.equal(boxes[0].y,boxes[1].y);
    await page.click(card+' .lo-recruit-remove');assert.equal((await page.$$('.lo-recruit-selected .lo-row')).length,2);
    await page.click('.lo-recruit-selected__tier--5 .lo-recruit-selected__empty');await page.waitForSelector('.lo-recruit-picker');
    assert.equal((await page.$$('.lo-recruit-picker input')).length,1);assert.equal(await page.$('.lo-recruit-picker select'),null);
    await page.type('.lo-recruit-picker input','레이');await page.waitForSelector('.lo-recruit-picker [data-chess="'+selected[0]+'"]');
    if(compare||captureCurrent)await page.screenshot({path:output+'/after-recruit-picker.png'});
    await page.click('.lo-recruit-picker [data-chess="'+selected[0]+'"]');await page.waitForSelector('.lo-recruit-picker',{hidden:true});assert.equal((await page.$$('.lo-recruit-selected .lo-row')).length,3);
    assert.deepEqual(await rosterOrder(),originalOrder,'selection does not reorder the roster');
    await page.click('.lo-filter-presets .btn');await page.waitForSelector('.recruit-presets-modal');
    const checkPresetWidths=async()=>{const widths=await page.$$eval('.favorites-presets > .btn,.favorites-presets > .preset-files > .btn',es=>es.map(e=>({x:e.getBoundingClientRect().x,w:e.getBoundingClientRect().width})));assert.equal(widths.length,3);for(const r of widths){assert.equal(r.x,widths[0].x);assert.equal(r.w,widths[0].w);}};
    await checkPresetWidths();if(compare||captureCurrent)await page.screenshot({path:output+'/after-recruit-presets.png'});
    await page.keyboard.press('Escape');await page.waitForSelector('.recruit-presets-modal',{hidden:true});
    await page.click('#lo-tab-standard');await page.click('.lo-filter-presets .btn');await page.waitForSelector('.favorites-modal');await checkPresetWidths();await page.keyboard.press('Escape');await page.waitForSelector('.favorites-modal',{hidden:true});await page.click('#lo-tab-recruits');
    const remainingChinese=await page.evaluate(async()=>{const{tr}=await import('/js/i18n/i18n.js');const raw=await(await fetch('/data/bands.json')).json();return Object.values(raw).flatMap(b=>['name','effectName','desc','descRaw'].filter(k=>/[一-鿿]/.test(tr(b[k]||''))).map(k=>b.bandId+':'+k));});assert.deepEqual(remainingChinese,[]);

  }
  await shot('recruits','.lo-roster',true);await page.click('.lo-back');await page.waitForSelector('.lo-top',{hidden:true});
  if(phase==='after')await page.evaluate(async()=>{const{recordResult}=await import('/js/ui/stats.js');const id=__SP__.store.get().me.playerId;recordResult({gameplayMode:'augment',victory:true,roundsPassed:3,modeId:'single_normal',difficulty:'NORMAL',players:[{playerId:id,name:'UI 비교',seat:0,alive:true,roundsPassed:3,lineup:[]}]},{myId:id,now:Date.now(),roomMode:'solo'});});
  await page.click('.me-chip--btn');await page.waitForSelector('.st-top');if(phase==='after'){await page.click('.st-tab[data-tab="history"]');await page.waitForSelector('.st-gameplay-mode');assert.equal(await page.$eval('.st-gameplay-mode',e=>e.textContent),'증강');}
await check('.st-top');await shot('stats','.st-top');await page.click('.st-top__left button');await page.waitForSelector('.st-top',{hidden:true});
  await page.evaluate(()=>__SP__.store.patch('ui',{laboratorySetup:{difficulty:'NORMAL',practice:false}}));await page.waitForSelector('.lab-screen');await check('.lab-screen .topbar');await shot('laboratory','.lab-screen .topbar');await page.click('.lab-screen .topbar__left button');await page.waitForSelector('.lab-screen',{hidden:true});
  await page.evaluate(async()=>{await __SP__.net.request('room.create',{mode:'coop',difficulty:'NORMAL',spectators:0});});await page.waitForSelector('.room-screen .topbar');await check('.room-screen .topbar');if(phase==='after'){
    const savedPrefs=await page.evaluate(async()=>{
      const selection={bonds:['leithanien'],stages:[],rules:['unlimitedLayers'],ruleValues:{enemyHp:177,bossHp:333,augmentSilver:9}};
      const {saveCustomExtensionPrefs}=await import('/js/ui/customExtensionPrefs.js');saveCustomExtensionPrefs(selection);await __SP__.net.request('room.setCustomExtensions',{selection});return localStorage.getItem('sp.pref.customExtensions');
    });
    const selectMode=async name=>{await page.$$eval('.room-gameplay-modes button',(es,n)=>es.find(e=>e.textContent===n).click(),name);};
    await selectMode('클래식');await page.waitForFunction(()=>__SP__.store.get().room.gameplayMode==='classic');
    assert.equal(await page.$eval('.room-custom-extensions',e=>e.disabled),true);assert.deepEqual(await page.evaluate(()=>__SP__.store.get().room.customExtensions.bonds),[]);
    await selectMode('증강');await page.waitForFunction(()=>__SP__.store.get().room.gameplayMode==='augment');
    const fixed=await page.evaluate(()=>__SP__.store.get().room.customExtensions);assert.deepEqual(fixed.rules,['augments']);assert.deepEqual([fixed.ruleValues.enemyHp,fixed.ruleValues.enemyAtk,fixed.ruleValues.enemyDef,fixed.ruleValues.enemyRes],[140,120,120,150]);assert.deepEqual([fixed.ruleValues.bossHp,fixed.ruleValues.bossAtk,fixed.ruleValues.bossDef,fixed.ruleValues.bossRes],[400,120,120,150]);assert.deepEqual([fixed.ruleValues.augmentSilver,fixed.ruleValues.augmentGold,fixed.ruleValues.augmentPrism],[2,5,3]);
    assert.equal(await page.$eval('.room-custom-extensions',e=>e.disabled),true);
    if(compare||captureCurrent)await page.screenshot({path:output+'/after-augment-mode.png'});
    await selectMode('커스텀');await page.waitForFunction(()=>__SP__.store.get().room.gameplayMode==='custom');
    assert.equal(await page.$eval('.room-custom-extensions',e=>e.disabled),false);assert.equal(await page.evaluate(()=>__SP__.store.get().room.customExtensions.ruleValues.enemyHp),177);assert.equal(await page.evaluate(()=>localStorage.getItem('sp.pref.customExtensions')),savedPrefs);
    const layout=await page.evaluate(()=>{const rect=q=>{const r=document.querySelector(q).getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};return{header:rect('.room-screen .topbar'),left:rect('.room-screen .topbar__left'),center:rect('.room-screen .topbar__center'),invite:rect('.invite'),difficulty:rect('.room-bar__difficulty .dpick'),reroll:rect('.room-bar__reroll .dpick')};});
    await page.waitForFunction(()=>{const c=document.querySelector('.game-chat--room').getBoundingClientRect(),s=document.querySelector('.seats .seat').getBoundingClientRect();return Math.abs(c.y-s.y)<2&&Math.abs(c.height-s.height)<2;});
    const roomLayout=await page.evaluate(()=>{
      const r=e=>{const b=e.getBoundingClientRect();return{x:b.x,y:b.y,right:b.right,bottom:b.bottom,height:b.height};};
      const label=document.querySelector('.room-bar__difficulty .room-bar__label'),title=document.querySelector('.game-chat--room .game-chat__panel header strong'),faction=document.querySelector('.game-chat--room .game-chat__faction-toggle');
      return{label:r(label),title:r(title),faction:r(faction),chat:r(document.querySelector('.game-chat--room')),seat:r(document.querySelector('.seats .seat')),titleText:title.textContent};
    });
    assert.ok(roomLayout.label.right+8<=layout.difficulty.x,JSON.stringify(roomLayout));assert.equal(roomLayout.titleText,'대기실 채팅');assert.ok(roomLayout.title.x<roomLayout.faction.x);assert.ok(roomLayout.title.y<roomLayout.faction.bottom&&roomLayout.title.bottom>roomLayout.faction.y);assert.ok(Math.abs(roomLayout.chat.height-roomLayout.seat.height)<2,JSON.stringify(roomLayout));
    assert.ok(layout.invite.bottom<=layout.header.bottom+1,JSON.stringify(layout));assert.ok(Math.abs(layout.difficulty.x-layout.reroll.x)<1,JSON.stringify(layout));assert.ok(Math.abs(layout.difficulty.width-layout.reroll.width)<1,JSON.stringify(layout));assert.equal(await page.$('.plugin-tag'),null);
    if(compare||captureCurrent)await page.screenshot({path:output+'/after-room-layout.png'});
  }await shot('room','.room-screen .topbar');
  const help=await page.$eval('.room-guide',e=>({square:e.classList.contains('btn--square'),width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height}));if(phase==='after'){assert.ok(help.square);assert.equal(help.width,help.height);const exit=await page.$eval('.room-screen .topbar .btn--danger',e=>({h:e.getBoundingClientRect().height,w:e.getBoundingClientRect().width,expected:parseFloat(getComputedStyle(document.documentElement).fontSize)*.64}));assert.ok(Math.abs(exit.h-exit.expected)<1,JSON.stringify(exit));assert.equal(exit.h,exit.w);}
  await page.click('[data-testid="settings-btn"]');await page.waitForSelector('.settings-modal');if(phase==='after')assert.equal(await page.$('[data-category=plugins]'),null);await shot('settings-modal','.settings-modal',true);await page.keyboard.press('Escape');await page.waitForSelector('.settings-modal',{hidden:true});await page.click('.room-custom-extensions');await page.waitForSelector('.custom-ext .extension-grid');if(phase==='after'){assert.equal(await page.$('.extension-description-toggle'),null);await page.click('#ext-tab-enemyStats');await page.waitForSelector('input[aria-label="적 최대 HP"]');assert.equal(await page.$eval('input[aria-label="적 최대 HP"]',e=>e.value),'177');assert.equal((await page.$$('.extension-rule-value')).length,6);await page.click('#ext-tab-rules');assert.equal(await page.$('input[aria-label="적 최대 HP"]'),null);await page.click('#ext-tab-bonds');}if(phase==='after')assert.equal(await page.$eval('.custom-ext .modal__title',e=>getComputedStyle(e).fontSize),'20px');await shot('custom-settings','.custom-ext',true);if(phase==='after'){
    await page.click('#ext-tab-commonBands');await page.waitForSelector('.extension-band-card');
    const first=await page.$('.extension-band-card:not(:disabled)');assert.ok(first);await first.click();assert.equal(await first.evaluate(e=>e.getAttribute('aria-pressed')),'true');await first.click();assert.equal(await first.evaluate(e=>e.getAttribute('aria-pressed')),'false');
    const actions=await page.$$eval('.extension-presets__actions > .btn',es=>es.map(e=>{const r=e.getBoundingClientRect();return{y:r.y,width:r.width};}));assert.equal(actions.length,3);for(const a of actions){assert.equal(a.y,actions[0].y);assert.ok(Math.abs(a.width-actions[0].width)<1);}
    if(compare||captureCurrent)await page.screenshot({path:output+'/after-common-strategies.png'});
  }await page.keyboard.press('Escape');await page.waitForSelector('.custom-ext',{hidden:true});
  await page.setViewport({width:390,height:844});if(phase==='after'){const h=await page.$eval('.room-screen .topbar',e=>({height:e.getBoundingClientRect().height,width:e.scrollWidth,client:e.clientWidth}));assert.equal(h.height,112);assert.ok(h.width<=h.client+1,JSON.stringify(h));}await shot('room-mobile','.room-screen .topbar');
  assert.deepEqual(errors,[]);
  }finally{await context.close();}
 }
 if(compare){
  const titles={recruits:'선발 설정',lobby:'로비',loadout:'오퍼레이터 설정',stats:'통계',laboratory:'실험실',room:'대기실','settings-modal':'설정창','custom-settings':'커스텀 설정창','room-mobile':'모바일 대기실'};
  let html='<!doctype html><html lang="ko"><meta charset="utf-8"><title>UI 통일 변경 전후</title><style>*{box-sizing:border-box}body{margin:0;background:#08110e;color:#e4eee8;font-family:sans-serif;padding:28px;width:1920px}h1{font-size:28px;margin:0 0 10px}p{font-size:15px;color:#aebfb5;margin:0 0 22px}.pair{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px}h2{grid-column:1/-1;font-size:18px;margin:0}figure{margin:0;border:1px solid #334b40;background:#111c16}figcaption{font-size:14px;padding:10px;color:#78d9b6}img{display:block;width:100%;height:auto}.mobile img{width:390px;margin:auto}</style><h1>페이지별 상단 메뉴·설정 UI 통일 — 실제 브라우저 변경 전 / 후</h1><p>동일한 실행 환경 · PC 1440×1000 / 모바일 390×844 · 각 페이지 실제 화면을 촬영해 배치했습니다.</p>';
  for(const name of Object.keys(titles)){html+='<section class="pair '+(name.includes('mobile')?'mobile':'')+'"><h2>'+titles[name]+'</h2>';for(const phase of ['before','after'])html+='<figure><figcaption>'+(phase==='before'?'변경 전':'변경 후')+'</figcaption><img src="'+phase+'-'+name+'.png"></figure>';html+='</section>';}
  html+='</html>';writeFileSync(output+'/comparison.html',html);const gallery=await browser.newPage();await gallery.setViewport({width:1920,height:1000});await gallery.goto(server.url+'/capture/comparison.html',{waitUntil:'networkidle0'});await gallery.screenshot({path:output+'/comparison.png',fullPage:true});await gallery.close();
 }
 }finally{await browser.close();await server.close();}
});
