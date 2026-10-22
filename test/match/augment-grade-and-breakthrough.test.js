import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Match} from '../../server/match/Match.js';
import {loadData} from '../../server/data.js';
import {VirtualScheduler} from '../../server/match/scheduler.js';
import {PHASE} from '../../shared/constants.js';
import {createAugmentCatalog} from '../../shared/augments.js';
import {augmentBossHpMultiplier} from '../../shared/gameplayModes.js';
import {makeBattle,enemyRec} from '../helpers/battleHarness.js';
import {install} from '../../server/sim/content/augments.js';
import {battleProgress} from '../../server/sim/spec.js';
import {timelineSample} from '../../server/match/fields.js';
const data=loadData('content/production/data');
function match(t,gameplayMode='augment',options={}){
 const m=new Match({data,mode:'solo',gameplayMode,difficulty:'NORMAL',seed:1,customExtensions:{rules:['augments'],ruleValues:{bossHp:250}},seats:[{seat:0,playerId:'p1',name:'P1',connected:true}],scheduler:new VirtualScheduler(),send(){},broadcast(){},onEnd(){},...options});t.after(()=>m.dispose());return m;
}
test('augment mode multiplies boss HP once per offered grade, starting at 100%; custom preset remains independent',t=>{
 const m=match(t);assert.equal(m.customExtensions.ruleValues.bossHp,100);
 assert.equal(m.augments.bossHpMultiplier(),1);
 for(const [grade,factor]of [['silver',1.3],['gold',1.5],['prism',1.7]])assert.equal(augmentBossHpMultiplier([grade]),factor);
 m.augments.history=['gold','gold','prism'];assert.ok(Math.abs(m.augments.bossHpMultiplier()-3.825)<1e-12);
 m.augments.enemies=[{effect:{mods:{hpPct:.25}}}];assert.ok(Math.abs(m.augments.bossHpMultiplier()-3.825*1.25)<1e-12,'selected HP augments still have their own effect');
 const custom=match(t,'custom');custom.augments.history=['gold','gold','prism'];assert.equal(custom.customExtensions.ruleValues.bossHp,250);assert.equal(custom.augments.bossHpMultiplier(),1);
});
test('breakthrough is immediate; duplicate cumulative reports and final result do not charge twice',t=>{
 const m=match(t),ps=m.players.get('p1');ps.lp=20;m.augments.enemies=[{effect:{kind:'leak',amount:1}}];
 const f={kind:'normal',players:['p1']};for(let n=1;n<=5;n++){m.augments.creditLeaks(f,{p1:n});assert.equal(ps.lp,20-n);}
 m.augments.creditLeaks(f,{p1:5});m.augments.creditLeaks(f,{p1:3});assert.equal(ps.lp,15);
 f.result={perPlayer:{p1:{leaked:[...Array.from({length:5},()=>({entered:true})),{entered:false}]}}};m.augments.creditResult(f);assert.equal(ps.lp,15);assert.equal(ps.stats.lpLost,5);assert.equal(m.augments.leakHpCost(),1);
 m.augments.creditLeaks({kind:'unite',players:[],spec:{spawns:[{sourcePlayerId:'p1'}]}},{p1:1});assert.equal(ps.lp,15);
 m.augments.creditLeaks({kind:'boss',players:['p1']},{p1:5});assert.equal(ps.lp,15,'normal-only effect');
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

test('breakthrough debits shared HP immediately, ignores unite re-entries, and leaves normal settlement intact',t=>{
 const m=match(t,'custom'),ps=m.players.get('p1');
 m.gd.config.customRules.sharedHp=true;m.teamLp=40;ps.lp=40;ps.lpAtFinal=40;
 m.augments.enemies=[{effect:{kind:'leak',amount:1}}];
 const normal={kind:'normal',players:['p1']};m.augments.creditLeaks(normal,{p1:10});
 assert.equal(m.teamLp,30);assert.equal(ps.lp,30);assert.equal(ps.stats.lpLost,10);
 m.augments.creditLeaks(normal,{p1:10});assert.equal(m.teamLp,30,'duplicate reports are not charged');
 const unite={kind:'unite',players:[],spec:{spawns:[{sourcePlayerId:'p1'}]}};
 m.augments.creditLeaks(unite,{p1:10});assert.equal(m.teamLp,30,'unite goal entries do not trigger breakthrough again');
 const leaked=Array.from({length:10},()=>({entered:true,sourcePlayerId:'p1',counted:true}));
 m.lastResults.set('p1',{leaked,perfect:false,coins:0,layerGains:{},killed:0,damageDealt:0});
 const before=m.teamLp;
 m.settle({leakers:[ps],helpers:[],notReentered:new Map()}, {perPlayer:{p1:{leaked}},unspawned:[]});
 assert.equal(m.teamLp,before-Math.min(m.gd.lpCapPerRound,10),'only the existing capped settlement damage is applied');
});

test('breakthrough is offered in rounds 4 and 7, never round 10',()=>{
 for(const round of [4,7,10])assert.equal(createAugmentCatalog(data,round).some(a=>a.side==='enemy'&&a.effect.kind==='leak'),round!==10);
});

test('shared breakthrough can exceed the leaking player’s displayed share and synchronizes all teammates',t=>{
 const m=match(t,'custom',{mode:'coop',seats:[{seat:0,playerId:'p1',name:'P1',connected:true},{seat:1,playerId:'p2',name:'P2',connected:true}],customExtensions:{rules:['augments','sharedHp']}});
 const p1=m.players.get('p1'),p2=m.players.get('p2');assert.equal(m.gd.config.customRules.sharedHp,true);
 p1.lp=p1.lpAtFinal=4;p2.lp=p2.lpAtFinal=36;m.teamLp=40;
 m.augments.enemies=[{effect:{kind:'leak',amount:1}}];
 const f1={kind:'normal',players:['p1']},f2={kind:'normal',players:['p2']};
 m.augments.creditLeaks(f1,{p1:10});assert.equal(m.teamLp,30);assert.equal(p1.lp+p2.lp,30);assert.equal(p1.stats.lpLost,10);
 m.augments.creditLeaks(f2,{p2:2});assert.equal(m.teamLp,28);assert.equal(p1.lp+p2.lp,28);assert.equal(p2.stats.lpLost,2);
 m.augments.creditLeaks(f1,{p1:20});assert.equal(m.teamLp,28,'shared HP also respects the per-player round cap');
});

test('augment mode defaults to ordinary enemy voting; custom cumulative HP uses the same base and grade factors',t=>{
 const mode=match(t);assert.equal(mode.augments.settings.augmentEnemyVote,1);
 const custom=match(t,'custom',{customExtensions:{rules:['augments'],ruleValues:{bossHp:250,bossHpByAugment:1}}});
 assert.equal(custom.customExtensions.ruleValues.bossHp,250,'saved fixed HP remains available');assert.equal(custom.gd.config.customRules.bossHp,100,'cumulative mode starts at 100%');
 custom.augments.history=['gold','gold','prism'];assert.ok(Math.abs(custom.augments.bossHpMultiplier()-3.825)<1e-12);
 const fixed=match(t,'custom');fixed.augments.history=['gold','gold','prism'];assert.equal(fixed.gd.config.customRules.bossHp,250);assert.equal(fixed.augments.bossHpMultiplier(),1);
});

test('ordinary enemies scale from 100% by each offered grade and custom fixed values remain stored',t=>{
 const m=match(t);assert.equal(m.gd.config.customRules.enemyHp,100);assert.equal(m.augments.battleState().enemyHpMultiplier,1);
 m.augments.history=['silver','gold','prism'];assert.ok(Math.abs(m.augments.battleState().enemyHpMultiplier-1.1*1.15*1.2)<1e-12);
 const custom=match(t,'custom',{customExtensions:{rules:['augments'],ruleValues:{enemyHp:180,enemyHpByAugment:1}}});custom.augments.history=['gold'];assert.equal(custom.customExtensions.ruleValues.enemyHp,180);assert.equal(custom.gd.config.customRules.enemyHp,100);assert.equal(custom.augments.battleState().enemyHpMultiplier,1.15);
 const fixed=match(t,'custom',{customExtensions:{rules:['augments'],ruleValues:{enemyHp:180}}});fixed.augments.history=['gold'];assert.equal(fixed.gd.config.customRules.enemyHp,180);assert.equal(fixed.augments.battleState().enemyHpMultiplier,1);
});

test('custom cumulative ATK DEF and RES can be enabled separately without losing fixed values',t=>{
 for(const stat of ['enemyAtk','enemyDef','enemyRes']){
  const m=match(t,'custom',{customExtensions:{rules:['augments'],ruleValues:{enemyAtk:177,enemyDef:188,enemyRes:155,[stat+'ByAugment']:1}}});m.augments.history=['gold','prism'];
  const state=m.augments.battleState();assert.equal(state.enemyAtkMultiplier,stat==='enemyAtk'?1.16:1);assert.equal(state.enemyDefMultiplier,stat==='enemyDef'?1.16:1);assert.equal(state.enemyResBonus,stat==='enemyRes'?8:0);
  assert.equal(m.customExtensions.ruleValues[stat],{enemyAtk:177,enemyDef:188,enemyRes:155}[stat]);assert.equal(m.gd.config.customRules[stat],100);
 }
});

test('approved surrender charges only unpaid remaining leaks against shared HP and never repeats in unite',t=>{
 const m=match(t,'custom'),ps=m.players.get('p1');
 m.gd.config.customRules.sharedHp=true;m.teamLp=40;ps.lp=40;ps.lpAtFinal=40;
 m.augments.enemies=[{effect:{kind:'leak',amount:1}}];
 const field={kind:'normal',players:['p1']};
 m.augments.creditLeaks(field,{p1:2});assert.equal(m.teamLp,38);
 field.result={perPlayer:{p1:{leaked:[{entered:true},{entered:true},{entered:false},{spawned:false}]}}};
 m.augments.creditResult(field);assert.equal(m.teamLp,38,'natural timeout does not charge enemies that never entered');
 field.endRequested=true;m.augments.creditResult(field);assert.equal(m.teamLp,36);assert.equal(ps.lp,36);
 m.augments.creditResult(field);assert.equal(m.teamLp,36,'previous goal entries and repeated results are deduplicated');
 m.augments.creditResult({...field,kind:'unite',augmentLeaksBy:{}});assert.equal(m.teamLp,36,'unite surrender has no extra breakthrough loss');
});


test('breakthrough caps each player at ten per round across progress and surrender; next round resets',t=>{
 const m=match(t),ps=m.players.get('p1');ps.lp=50;
 m.augments.enemies=[{effect:{kind:'leak',amount:1}}];
 const f={kind:'normal',players:['p1']};
 m.augments.creditLeaks(f,{p1:7});assert.equal(ps.lp,43);
 f.endRequested=true;f.result={perPlayer:{p1:{leaked:Array.from({length:25},()=>({spawned:false}))}}};
 m.augments.creditResult(f);assert.equal(ps.lp,40);
 m.augments.creditLeaks(f,{p1:30});m.augments.creditResult(f);assert.equal(ps.lp,40);
 m.augments.creditLeaks({kind:'normal',players:['p1']},{p1:15});assert.equal(ps.lp,30,'new field has a fresh round allowance');
});
