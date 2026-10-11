import {test} from 'node:test';
import assert from 'node:assert/strict';
import {applyCustomExtensions,normalizeCustomExtensions,extensionSelectionShape,recordCustomExtensions} from '../shared/customExtensions.js';
import {GameData} from '../server/match/gamedata.js';
import {SharedPool} from '../server/match/pool.js';
import {computeBonds} from '../server/match/bondsMeta.js';
import {layerGainRoom} from '../shared/constants.js';
import {DATA,makeMatch} from './match/harness.js';
import {buildRecord,recordToResult,compactRecord,normalizeRecord} from '../public/js/ui/stats.js';
const selection=normalizeCustomExtensions({bonds:[],stages:[],rules:['unlimitedStock','unlimitedLayers','defaultHarmony'],ruleValues:{deployCap:12,enemyHp:200,enemyAtk:150,enemyDef:50,enemyRes:0}},DATA);
const gd=new GameData(applyCustomExtensions(DATA,selection),'mode_single_normal');
test('numeric rules validate and retain their values through normalization',()=>{
 assert.equal(extensionSelectionShape(selection),true);
 for(const n of [3,13,NaN,8.5])assert.equal(extensionSelectionShape({...selection,ruleValues:{deployCap:n}}),false);
 assert.equal(gd.deployCap,12);
 const normal=new GameData(applyCustomExtensions(DATA,{bonds:[],stages:[]}),'mode_single_normal');
 const boss=Object.keys(DATA.bosses)[0];assert.equal(gd.bossPoolHp(boss,1),normal.bossPoolHp(boss,1)*2);
});
test('unlimited inventory keeps finite sampling weights and never reserves copies',()=>{
 const pool=new SharedPool(gd),id=[...pool.entries.keys()][0];
 assert.equal(pool.left(id),Infinity);assert.equal(pool.take(id,10000),0);assert.equal(pool.give(id,10000),0);
 assert.equal(pool.entries.get(id).left,pool.cap(id));assert.ok(pool._eligible().every(([,weight])=>Number.isFinite(weight)&&weight>0));
 assert.equal(gd.itemPoolCopies(Object.keys(DATA.items)[0]),null);
});
test('default Harmony works without a Harmony operator and adds the native core-member bonus',()=>{
 const chess=Object.values(gd.raw.chess).find(c=>c.visible&&!c.isGolden&&c.bonds.some(id=>gd.bond(id)?.isCore));
 const bonds=computeBonds(gd,{board:new Map([['9,2',{kind:'chess',id:chess.chessId,items:[]}]]),hand:[],layers:{}});
 assert.equal(bonds.maniShip.active,true);
 assert.ok(chess.bonds.some(id=>bonds[id]?.harmony===1));
});
test('uncapped layers apply immediately while default games retain 999',t=>{
 const h=makeMatch({mode:'solo',customExtensions:selection});t.after(()=>h.m.dispose());
 const ps=h.m.players.values().next().value;ps.layers.yanShip=998;ps.addLayers('yanShip',20);assert.equal(ps.layers.yanShip,1018);
 assert.equal(layerGainRoom(998,20),1);assert.equal(layerGainRoom(998,20,Infinity),20);
});
test('custom settings survive recording, replay and compact history; empty settings stay absent',()=>{
 const res={seed:1,modeId:'mode_single_normal',customExtensions:selection,players:[{playerId:'p1',stats:{}}]};
 const rec=buildRecord(res,{myId:'p1'});
 assert.deepEqual(recordToResult(rec).customExtensions,recordCustomExtensions(selection));
 assert.deepEqual(normalizeRecord(compactRecord(rec)).customExtensions,rec.customExtensions);
 assert.equal(recordCustomExtensions({bonds:[],stages:[],ruleValues:{deployCap:8}}),null);
 selection.rules.push('duplicateBands');assert.ok(!rec.customExtensions.rules.includes('duplicateBands'));
});
test('enemy ratios apply once at spawn, including after battle-data extension filtering',async()=>{
 const {Battle}=await import('../server/sim/Battle.js');
 const configured=applyCustomExtensions(applyCustomExtensions(DATA,selection),selection);
 const make=data=>new Battle({data,stageId:'act2autochess_m03',players:[{playerId:'p',units:[]}],spawns:[],routes:[],timeLimit:10});
 const a=make(DATA),b=make(configured),key=Object.keys(DATA.enemies)[0];
 const x=a.spawnEnemy(key,{pos:[9,2]}),y=b.spawnEnemy(key,{pos:[9,2]});
 assert.equal(y.base.maxHp,x.base.maxHp*2);assert.equal(y.base.atk,x.base.atk*1.5);assert.equal(y.base.def,x.base.def*.5);assert.equal(y.base.res,0);
});
test('Personnel File increases configured deployment capacity by exactly one',t=>{
 for(const cap of [4,12]){
 const h=makeMatch({mode:'solo',customExtensions:{bonds:[],stages:[],ruleValues:{deployCap:cap}}});t.after(()=>h.m.dispose());h.start();h.m.phase='PREP';h.m.round=1;
 const ps=h.m.players.values().next().value;
 const id=h.m.gd.visibleChess[0];ps.acquireChess(id,{fromPool:false});const op=ps.hand.find(p=>p?.kind==='chess');
 ps.acquireItem('chess_item_6_08_e_a',{fromPool:false});const item=ps.hand.find(p=>p?.kind==='item'&&p.id==='chess_item_6_08_e_a');
 assert.ok(item);const r=h.m.handle(ps.playerId,{t:'g.equip',itemUid:item.uid,targetUid:op.uid});assert.deepEqual(r,{ok:true});assert.equal(ps.deployCap,cap+1);
 }
});
test('shared HP charges leaks at settlement and keeps every participant alive until the pool is empty',t=>{
 const h=makeMatch({mode:'coop',humans:2,fake:true,customExtensions:{bonds:[],stages:[],rules:['sharedHp']}});t.after(()=>h.m.dispose());h.start();
 const [a,b]=[...h.m.players.values()];for(const p of [a,b])p.bandId=h.m.gd.bandIds()[0];a.lp=4;b.lp=20;
 h.m.startRound(1);assert.equal(h.m.teamLp,24);
 h.m.lastResults=new Map([[a.playerId,{leaked:Array.from({length:10},()=>({counted:true})),perfect:false,layerGains:{}}],[b.playerId,{leaked:[],perfect:true,layerGains:{}}]]);
 assert.equal(h.m.teamLp,24,'pending leaks do not reduce HP before settlement');h.m.settle(null,null);
 assert.equal(h.m.teamLp,14);assert.equal(a.alive,true);assert.equal(b.alive,true);assert.equal(a.stats.lpLost,10);assert.equal(a.lp+b.lp,14);
 h.m.startFinalAssault(false);assert.equal(h.m.teamLp,14,'boss entry does not merge the pool again');
 h.m._teamLpLoss(13);assert.equal(h.m.teamLp,1);
 h.m.lastResults=new Map([[a.playerId,{leaked:[{counted:true}],perfect:false,layerGains:{}}],[b.playerId,{leaked:[],perfect:true,layerGains:{}}]]);h.m.settle(null,null);
 assert.equal(h.m.teamLp,0);assert.equal(a.alive,false);assert.equal(b.alive,false);
});
test('the rule auditor validates shared losses rather than personal HP shares',async t=>{
 const {attachAudit}=await import('../server/match/audit.js');
 const h=makeMatch({mode:'coop',humans:2,fake:true,customExtensions:{bonds:[],stages:[],rules:['sharedHp']}});t.after(()=>h.m.dispose());h.start();
 const [a,b]=[...h.m.players.values()];for(const p of [a,b])p.bandId=h.m.gd.bandIds()[0];a.lp=4;b.lp=20;h.m.startRound(1);
 const audit=attachAudit(h.m,{invariants:false});
 h.m.lastResults=new Map([[a.playerId,{leaked:Array.from({length:10},()=>({counted:true})),perfect:false,layerGains:{}}],[b.playerId,{leaked:[],perfect:true,layerGains:{}}]]);h.m.settle(null,null);
 assert.deepEqual(audit.violations,[]);assert.ok(audit.checks>0);
});
