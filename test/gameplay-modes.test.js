import {makeBattle,enemyRec} from './helpers/battleHarness.js';
import {applyCustomExtensions} from '../shared/customExtensions.js';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {startServer} from '../server/index.js';
import {StubMatch} from '../server/match/StubMatch.js';
import {TestClient} from './helpers/wsClient.js';
import {loadData} from '../server/data.js';
import {gameplayExtensions,AUGMENT_MODE_VALUES} from '../shared/gameplayModes.js';
import {normalizeRuleValues,recordCustomExtensions} from '../shared/customExtensions.js';
import {normalizeRecord,buildRecord,compactRecord,recordToResult} from '../public/js/ui/stats.js';
import {Match} from '../server/match/Match.js';
const data=loadData(new URL('../content/production/data',import.meta.url).pathname);
const saved={bonds:['ursus','leithanien'],rules:['unlimitedLayers','augments'],ruleValues:{enemyHp:777,bossHp:888,augmentSilver:9,augmentGold:1,augmentPrism:0}};
test('fixed modes ignore saved extensions, use requested weights and never mutate the saved selection',()=>{
 const before=structuredClone(saved);
 const classic=gameplayExtensions(saved,data,'coop','classic');assert.equal(recordCustomExtensions(classic),null);
 const augment=gameplayExtensions(saved,data,'coop','augment');assert.deepEqual(augment.rules,['augments']);assert.deepEqual(augment.bonds,[]);
 const values=normalizeRuleValues(augment.ruleValues);for(const[k,v]of Object.entries(AUGMENT_MODE_VALUES))assert.equal(values[k],v);
 assert.deepEqual([values.augmentSilver,values.augmentGold,values.augmentPrism],[2,5,3]);
 assert.equal(gameplayExtensions(saved,data,'coop','custom').ruleValues.enemyHp,777);assert.deepEqual(saved,before);
});
test('host switching preserves custom draft; fixed-mode edits and guest switching are refused; match receives mode',async()=>{
 class Recording extends StubMatch{constructor(opts){super(opts);Recording.opts=opts;}}
 const srv=await startServer({port:0,host:'127.0.0.1',quiet:true,dataDir:'content/production/data',MatchClass:Recording});let host,guest;
 try{
  host=await TestClient.connect(`ws://127.0.0.1:${srv.port}/ws`);guest=await TestClient.connect(`ws://127.0.0.1:${srv.port}/ws`);await host.hello('host');await guest.hello('guest');
  assert.equal((await host.request({t:'room.create',mode:'coop',difficulty:'NORMAL',customExtensions:saved,gameplayMode:'classic'})).t,'ok');
  const room=await host.waitFor('room.state');assert.equal(room.gameplayMode,'classic');assert.equal(recordCustomExtensions(room.customExtensions),null);
  assert.equal((await guest.request({t:'room.join',code:room.code})).t,'ok');
  assert.equal((await guest.request({t:'room.setGameplayMode',gameplayMode:'augment'})).code,'NOT_HOST');
  assert.equal((await host.request({t:'room.setCustomExtensions',selection:{bonds:[],stages:[]}})).t,'error');
  assert.equal((await host.request({t:'room.setGameplayMode',gameplayMode:'custom'})).t,'ok');
  const restored=await host.waitFor('room.state',r=>r.gameplayMode==='custom');assert.equal(restored.customExtensions.ruleValues.enemyHp,777);assert.ok(restored.customExtensions.bonds.includes('leithanien'));
  assert.equal((await guest.request({t:'room.ready',ready:true})).t,'ok');
  assert.equal((await host.request({t:'room.setGameplayMode',gameplayMode:'augment'})).t,'ok');
  const fixed=await host.waitFor('room.state',r=>r.gameplayMode==='augment');assert.equal(fixed.seats.find(s=>s?.playerId!==fixed.hostId&&!s?.isBot)?.ready,false);assert.equal(fixed.customExtensions.ruleValues.bossHp,400);assert.ok(fixed.customExtensions.rules.includes('augments'));
  assert.equal((await host.request({t:'room.setCustomExtensions',selection:saved})).t,'error');
  await guest.request({t:'room.ready',ready:true});assert.equal((await host.request({t:'room.start'})).t,'ok');assert.equal(Recording.opts.gameplayMode,'augment');assert.equal(Recording.opts.customExtensions.ruleValues.enemyHp,140);
  assert.equal((await host.request({t:'room.setGameplayMode',gameplayMode:'classic'})).code,'ROOM_STARTED');
 }finally{host?.terminate();guest?.terminate();await srv.close();}
});
test('real matches enforce the mode again and expose it to game state',()=>{
 for(const mode of ['classic','augment','custom']){
  const m=new Match({data,seats:[{playerId:'p',name:'p',seat:0}],mode:'solo',difficulty:'NORMAL',send(){},broadcast(){},onEnd(){},gameplayMode:mode,customExtensions:saved});
  try{assert.equal(m.gameplayMode,mode);assert.equal(m.augments.enabled,mode!=='classic');assert.equal(normalizeRuleValues(m.customExtensions.ruleValues).enemyHp,mode==='classic'?100:mode==='augment'?140:777);}finally{m.dispose();}
 }
});
test('mode survives history normalization, compaction and result reconstruction; old records stay unknown',()=>{
 const raw={id:'record',v:1,t:1,end:'settled',victory:true,roundsPassed:1,roomMode:'solo',gameplayMode:'augment',selfId:'p',players:[{playerId:'p',name:'p',roundsPassed:1}]};
 const record=normalizeRecord(raw);assert.equal(record.gameplayMode,'augment');assert.equal(compactRecord(record).gameplayMode,'augment');assert.equal(recordToResult(record).gameplayMode,'augment');assert.equal(normalizeRecord({...raw,gameplayMode:undefined}).gameplayMode,null);
 const result=buildRecord({...raw,t:'m.result',modeId:'single_normal'},{myId:'p',now:1});assert.equal(result.gameplayMode,'augment');
});

test('augment mode ratios reach real normal-enemy and boss battle stats independently',()=>{
 const raw={...data,enemies:{...data.enemies,enemy_mode_probe:enemyRec({key:'enemy_mode_probe',hp:1000,atk:100,def:100,res:20,speed:1,bat:1})}};
 for(const mode of ['classic','augment'])for(const boss of [false,true]){
  const selected=gameplayExtensions(saved,raw,'solo',mode),tables=applyCustomExtensions(raw,selected);
  const h=makeBattle({data:tables,kind:boss?'boss':'normal',content:'generic',autoFinish:false});
  const enemy=h.spawn('enemy_mode_probe',{pos:[3,6],...(boss?{tag:'boss'}:{})});
  const ratios=mode==='classic'?[1,1,1,1]:boss?[4,1.2,1.2,1.5]:[1.4,1.2,1.2,1.5];
  for(const[stat,base,ratio]of [['maxHp',1000,ratios[0]],['atk',100,ratios[1]],['def',100,ratios[2]],['res',20,ratios[3]]])assert.ok(Math.abs(enemy.s[stat]-base*ratio)<1e-6,`${mode} ${boss?'boss':'normal'} ${stat}`);
 }
});
