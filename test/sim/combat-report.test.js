import {test} from 'node:test';
import assert from 'node:assert/strict';
import {makeBattle,chessRec,enemyRec} from '../helpers/battleHarness.js';
import {recordCombatField} from '../../server/match/combatHistory.js';
import {aggregateCombatUnits} from '../../public/js/ui/combatReport.js';
import {combatMetrics} from '../../shared/combatStats.js';
import {buildRecord,recordToResult,normalizeRecord} from '../../public/js/ui/stats.js';
const op=chessRec({id:'report_op',skill:null,stats:{maxHp:10000,atk:0,def:0,res:0,blockCnt:0}});
function battle(){return makeBattle({content:'generic',autoFinish:false,defs:{chess:{report_op:op},enemies:{report_enemy:enemyRec({key:'report_enemy',hp:10000,def:0,res:0,atk:0,speed:0})}},units:[{chessId:op.chessId||'report_op',row:10,col:5}],enemies:[{key:'report_enemy',pos:[10,6]}]});}
test('battle reports separate actual HP damage by type and shields, retain precise totals and zero internal errors',()=>{
 const h=battle();h.step();const u=h.unit('report_op'),e=h.enemies()[0];
 for(const [type,amount] of [['phys',100],['arts',200],['true',300],['elemental',400]])h.b.dealDamage(u,e,{type,amount});
 assert.equal(u.stats.physicalDamage,100);assert.equal(u.stats.artsDamage,200);assert.equal(u.stats.trueDamage,300);assert.equal(u.stats.elementalDamage,400);assert.equal(u.stats.dmg,1000);
 h.b.addBuff(u,{key:'test-shield',duration:10,shield:50});h.b.dealDamage(e,u,{type:'true',amount:100});
 assert.equal(u.stats.shieldAbsorbed,50);assert.equal(u.stats.takenTrue,50);assert.equal(u.stats.taken,50);
 h.run(.1);const r=h.b.result().perPlayer.p1.unitStats.find(x=>x.defId==='report_op');assert.equal(r.dmg,1000);assert.ok(r.activeTime>0);assert.equal(h.b.errorCount,0);
});
test('normal, alliance and boss rounds retain both teammates independently and never duplicate a finished field',()=>{
 const m={round:3,players:new Map([['p1',{}],['p2',{}]])};
 for(const kind of ['normal','unite','boss','hidden']){
  const f={kind,fieldId:kind,players:['p1','p2']};const r={time:12,perPlayer:{p1:{unitStats:[{uid:1,defId:'a',physicalDamage:10,dmg:10,redeploys:1}]},p2:{unitStats:[{uid:2,defId:'b',artsDamage:20,dmg:20}]}}};
  recordCombatField(m,f,r);recordCombatField(m,f,r);
 }
 assert.equal(m.players.get('p1').combatRounds.length,4);assert.equal(m.players.get('p2').combatRounds[2].totals.artsDamage,20);
 const all=aggregateCombatUnits(m.players.get('p1').combatRounds);assert.equal(all[0].dmg,40);assert.equal(all[0].redeploys,4);
 recordCombatField(m,{kind:'normal',players:['p1']},{synthetic:true,time:0,perPlayer:{p1:{unitStats:[]}}});assert.equal(m.players.get('p1').combatRounds.at(-1).available,false);
});
test('saved match history restores the round breakdown while old records remain readable',()=>{
 const combatRounds=[{round:1,kind:'normal',duration:4,units:[{uid:1,defId:'a',dmg:8,physicalDamage:8}],totals:{dmg:8,physicalDamage:8}}];
 const r={seed:4,victory:true,roundsPassed:1,durationMs:5000,players:[{playerId:'p1',name:'P1',combatRounds,stats:{}}]};
 const rec=buildRecord(r,{myId:'p1',now:123});assert.ok(rec);
 const loaded=recordToResult(normalizeRecord(JSON.parse(JSON.stringify(rec))));assert.equal(loaded.players[0].combatRounds[0].units[0].physicalDamage,8);
 const old=buildRecord({...r,players:[{playerId:'p1',name:'P1',stats:{}}]},{myId:'p1',now:123});assert.deepEqual(old.players[0].combatRounds,[]);
 assert.equal(combatMetrics({redeploys:1.5,dmg:NaN}).redeploys,1);
});
test('actual defeat and successful redeployment count once, not initial deployment or failed placement',()=>{
 const h=battle();h.step();const u=h.unit('report_op');assert.equal(u.stats.redeploys,0);
 h.b.kill(u);assert.equal(u.stats.deaths,1);assert.equal(h.b.redeploy(u,{free:true}),true);assert.equal(u.stats.redeploys,1);
 assert.equal(h.b.redeploy(u,{free:true}),false);assert.equal(u.stats.redeploys,1);assert.equal(h.b.errorCount,0);
});

test('maximum four-player detailed reports fit within the transport limit and invalid metrics are rejected',async()=>{
 const {validateC2S}=await import('../../shared/protocol.js'),{WS_MAX_PAYLOAD}=await import('../../server/index.js');
 const perPlayer={};for(let p=0;p<4;p++)perPlayer[`p${p}`]={killed:0,total:0,leaked:[],perfect:true,layerGains:{},unitsEnd:[],unitStats:Array.from({length:160},(_,uid)=>({uid:uid+1,defId:'report_op',kind:'op',...combatMetrics(Object.fromEntries(Object.keys(combatMetrics()).map(k=>[k,123456789.123])))}))};
 const msg={t:'b.result',battleId:'test',result:{time:40,reason:'cleared',perPlayer,killed:0,total:0}};
 assert.equal(validateC2S(msg),null);const bytes=Buffer.byteLength(JSON.stringify(msg));assert.ok(bytes>64*1024);assert.ok(bytes<WS_MAX_PAYLOAD);
 msg.result.perPlayer.p0.unitStats[0].physicalDamage=-1;assert.notEqual(validateC2S(msg),null);
});

import {combatDamageSegments} from '../../public/js/ui/combatReport.js';
test('damage charts retain total damage when old records have missing damage types',()=>{
 assert.deepEqual(combatDamageSegments({dmg:100}),[{key:'unclassifiedDamage',color:'unclassified',value:100,width:100}]);
 const parts=combatDamageSegments({dmg:100,physicalDamage:30,artsDamage:20});
 assert.equal(parts.reduce((n,p)=>n+p.width,0),100);assert.equal(parts.at(-1).value,50);
 assert.deepEqual(combatDamageSegments({dmg:0}),[]);
 const typed=combatDamageSegments({dmg:100,physicalDamage:70,artsDamage:30});assert.equal(typed.length,2);assert.equal(typed[0].width,70);
});

import {compactResult,fitResult} from '../../server/sim/spec.js';
test('browser result compaction and frame fitting retain every damage type and additional combat metric',()=>{
 const h=battle();h.step();const u=h.unit('report_op'),e=h.enemies()[0];
 for(const [type,amount] of [['phys',100.25],['arts',200.25],['true',300.25],['elemental',400.25]])h.b.dealDamage(u,e,{type,amount});
 u.stats.skillUses=3;u.stats.redeploys=2;u.stats.shieldAbsorbed=45;u.stats.activeTime=1.25;
 const raw=h.b.result();for(const converted of [compactResult(raw),fitResult(compactResult(raw))]){
 const result=converted.result||converted;
 const stat=result.perPlayer.p1.unitStats.find(s=>s.defId==='report_op');
 assert.deepEqual(combatMetrics(stat),combatMetrics(u.stats));
 assert.equal(stat.dmg,stat.physicalDamage+stat.artsDamage+stat.trueDamage+stat.elementalDamage);
 const m={round:1,players:new Map([['p1',{}]])};recordCombatField(m,{kind:'normal',fieldId:'one',players:['p1']},result);
 assert.equal(m.players.get('p1').combatRounds[0].totals.artsDamage,200.25);
 }
});
