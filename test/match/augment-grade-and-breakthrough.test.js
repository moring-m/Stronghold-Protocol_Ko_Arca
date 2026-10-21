import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Match} from '../../server/match/Match.js';
import {loadData} from '../../server/data.js';
import {VirtualScheduler} from '../../server/match/scheduler.js';
import {PHASE} from '../../shared/constants.js';
import {augmentBossHpMultiplier} from '../../shared/gameplayModes.js';
import {makeBattle,enemyRec} from '../helpers/battleHarness.js';
import {install} from '../../server/sim/content/augments.js';
import {battleProgress} from '../../server/sim/spec.js';
import {timelineSample} from '../../server/match/fields.js';
const data=loadData('content/production/data');
function match(t,gameplayMode='augment'){
 const m=new Match({data,mode:'solo',gameplayMode,difficulty:'NORMAL',seed:1,customExtensions:{rules:['augments'],ruleValues:{bossHp:250}},seats:[{seat:0,playerId:'p1',name:'P1',connected:true}],scheduler:new VirtualScheduler(),send(){},broadcast(){},onEnd(){}});t.after(()=>m.dispose());return m;
}
test('augment mode multiplies boss HP once per offered grade, starting at 100%; custom preset remains independent',t=>{
 const m=match(t);assert.equal(m.customExtensions.ruleValues.bossHp,100);
 assert.equal(m.augments.bossHpMultiplier(),1);
 for(const [grade,factor]of [['silver',1.3],['gold',1.5],['prism',1.7]])assert.equal(augmentBossHpMultiplier([grade]),factor);
 m.augments.history=['gold','gold','prism'];assert.ok(Math.abs(m.augments.bossHpMultiplier()-3.825)<1e-12);
 m.augments.enemies=[{effect:{mods:{hpPct:.25}}}];assert.ok(Math.abs(m.augments.bossHpMultiplier()-3.825*1.25)<1e-12,'selected HP augments still have their own effect');
 const custom=match(t,'custom');custom.augments.history=['gold','gold','prism'];assert.equal(custom.customExtensions.ruleValues.bossHp,250);assert.equal(custom.augments.bossHpMultiplier(),1);
});
test('breakthrough is immediate and uncapped; duplicate cumulative reports and final result do not charge twice',t=>{
 const m=match(t),ps=m.players.get('p1');ps.lp=20;m.augments.enemies=[{effect:{kind:'leak',amount:1}}];
 const f={kind:'normal',players:['p1']};for(let n=1;n<=5;n++){m.augments.creditLeaks(f,{p1:n});assert.equal(ps.lp,20-n);}
 m.augments.creditLeaks(f,{p1:5});m.augments.creditLeaks(f,{p1:3});assert.equal(ps.lp,15);
 f.result={perPlayer:{p1:{leaked:[...Array.from({length:5},()=>({entered:true})),{entered:false}]}}};m.augments.creditResult(f);assert.equal(ps.lp,15);assert.equal(ps.stats.lpLost,5);assert.equal(m.augments.leakHpCost(),1);
 m.augments.creditLeaks({kind:'unite',players:[],spec:{spawns:[{sourcePlayerId:'p1'}]}},{p1:1});assert.equal(ps.lp,14);
 m.augments.creditLeaks({kind:'boss',players:['p1']},{p1:5});assert.equal(ps.lp,14,'normal/unite-only effect');
});
test('authoritative client progress charges breakthrough before settlement and ignores other senders',t=>{
 const m=match(t),ps=m.players.get('p1');m.phase=PHASE.COMBAT;m.clientCombat=true;ps.lp=20;m.augments.enemies=[{effect:{kind:'leak',amount:1}}];
 const f={cc:true,battleId:'b-test',kind:'normal',mode:'client',authority:'p1',players:['p1'],spec:{spawns:Array.from({length:5},()=>({ownerPlayerId:'p1'}))},progress:{gt:0,total:5,killed:0,leaks:0}};m.fields=[f];
 const msg={battleId:'b-test',gt:1,total:5,killed:0,leaks:5,leaksCountBy:{p1:5}};
 m._onProgress({playerId:'stranger'},msg);assert.equal(ps.lp,20);m._onProgress(ps,msg);assert.equal(ps.lp,15);m._onProgress(ps,msg);assert.equal(ps.lp,15);
});
test('actual goal entries are reported separately from timeout leaks, including headless timelines',()=>{
 const h=makeBattle({defs:{enemies:{probe:enemyRec({key:'probe',hp:100,atk:0,speed:0,lpr:1})}},content:'none',extraContent:[{install}],enemies:[{key:'probe',count:5,pos:[10,5]}],flags:{augments:{allies:{},enemies:[{id:'breakthrough',effect:{kind:'leak',amount:1}}]}},autoFinish:false});h.run(.2);
 for(const e of h.enemies())h.b.leak(e);
 assert.deepEqual(battleProgress(h.b).leaksCountBy,{p1:5});assert.deepEqual(timelineSample(h.b)[5],{p1:5});assert.ok(h.b.result().perPlayer.p1.leaked.every(l=>l.lpr===1&&l.entered===true));
 const remaining=h.spawn('probe',{pos:[10,5]});h.b.forceEnd('timeout');assert.ok(remaining);assert.deepEqual(battleProgress(h.b).leaksCountBy,{p1:5},'timeout does not count as entering a goal');
});
