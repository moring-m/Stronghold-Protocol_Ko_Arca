import {test}from 'node:test';import assert from 'node:assert/strict';
import {DATA,makeMatch}from './match/harness.js';import {GameData}from '../server/match/gamedata.js';
import {drawDisabledBonds}from '../server/match/pool.js';import {eightUniteStage,EIGHT_UNITE_RECT}from '../shared/cooperativeEight.js';
import {makeBattle,enemyRec}from './helpers/battleHarness.js';import {getDefaultSource}from '../server/sim/simdata.js';
import {buildBattleSpec,createBattleFromSpec,compactResult}from '../server/sim/spec.js';import {validateClientResult}from '../server/match/fields.js';
import {planUnite,uniteBattleOpts}from '../server/match/unite.js';import {modeExtensionSelection,EXTENSION_CATEGORIES}from '../shared/customExtensions.js';
const eight=new GameData({...DATA,config:{...DATA.config,coop8:true}},'mode_multi_normal'),four=new GameData(DATA,'mode_multi_normal');
test('eight-player pool matches four players except three discounted communication items',()=>{
 for(const id of eight.visibleChess)assert.equal(eight.poolCopies(id),four.poolCopies(id),id);
 const special=new Set(['chess_item_2_06_e_a','chess_item_4_01_e_a','chess_item_5_04_e_a']);
 for(const[id,it]of Object.entries(DATA.items)){
  const base=eight.baseIdOf(id),n=four.itemPoolCopies(id);
  assert.equal(eight.itemPoolCopies(id),n===null?null:n*(special.has(base)?2:1),id);
  assert.equal(eight.itemPrice(id),Math.max(0,four.itemPrice(id)-(special.has(base)?1:0)),id);
 }
});
test('eight players have neither operator nor bond bans, including old exclusion presets',()=>{
 assert.deepEqual(drawDisabledBonds(eight,()=>.5,{mode:'coop8',protectedOperators:['old']}),{drawn:[],staticOff:[],banned:[]});
 assert.ok(!EXTENSION_CATEGORIES.some(c=>c.id==='protectedOperators'));
 assert.deepEqual(modeExtensionSelection({bonds:[],stages:[],protectedOperators:['old'],disabledBonds:['old']},'coop8'),{bonds:[],stages:[]});
});
test('Touch spawns one medic on each of four cooperative-defense fields',()=>{
 const stage=eightUniteStage(DATA.stages.act1autochess_m01);
 const h=makeBattle({kind:'unite',stage,rect:EIGHT_UNITE_RECT,autoFinish:false,players:[24,16,8,0].map((colOffset,i)=>({playerId:`p${i}`,colOffset,bandId:'band_amedic',units:[],bonds:{}}))});h.run(.2);
 for(let i=0;i<4;i++){const units=h.b.allyUnits.filter(u=>u.ownerId===`p${i}`&&u.defId==='char_605_cmedic');assert.equal(units.length,1);assert.equal(units[0].x,26-i*8);}
 assert.equal(h.b.errorCount,0);
});
test('raid travels to every occupied field and falls back when own enemies have no landing tile',()=>{
 const id='chess_char_6_13_a',raw=getDefaultSource().rawChess(id),stage=eightUniteStage(DATA.stages.act1autochess_m01);
 for(const target of [5,13,21,29]){
  const h=makeBattle({kind:'unite',stage,rect:EIGHT_UNITE_RECT,autoFinish:false,defs:{chess:{[id]:{...raw,bonds:[...raw.bonds,'raidShip']}},enemies:{dummy:enemyRec({key:'dummy',hp:1e9,speed:0})}},players:[24,16,8,0].map((colOffset,i)=>({playerId:`p${i}`,colOffset,bonds:{raidShip:{active:true,tier:1,count:2,layers:0}},units:i===0?[{uid:1,chessId:id,row:12,col:8}]:[]}))});
  h.step();const u=h.b.allyUnits.find(u=>u.uid===1);
  // An enemy owned by the raider but outside any deployable board must not hide other fields' targets.
  h.spawn('dummy',{pos:[9,36],ownerPlayerId:'p0'});h.spawn('dummy',{pos:[10,target],ownerPlayerId:'p3'});h.run(12);
  assert.ok(Math.abs(u.x-target)<=2,`${target}: raider is at ${u.x}`);assert.equal(h.b.errorCount,0);
 }
});
test('death-spawned hit-count cups re-enter eight-player defense through verified combat results',t=>{
 const h=makeMatch({mode:'coop8',humans:8});t.after(()=>h.m.dispose());const m=h.m;m.round=1;
 const spec=buildBattleSpec({stageId:'act2autochess_m01',kind:'normal',timeLimit:30,players:[{playerId:'p_0',units:[],bonds:{}}],spawns:[{time:0,enemyKey:'enemy_1203_sfhu',pos:[10,7],mods:{speedMul:0}}]});
 const b=createBattleFromSpec(spec,DATA,{quiet:true});b.step();b.kill(b.enemies[0]);b.forceEnd('timeout');
 const checked=validateClientResult(spec,compactResult(b.result()),{gd:m.gd});assert.ok(checked.ok,checked.reason);
 m.lastResults=new Map(m.order.map(p=>[p.playerId,p.playerId==='p_0'?checked.result.perPlayer.p_0:{leaked:[],perfect:true,unitsEnd:[]} ]));
 const plan=planUnite(m,m.lastResults);assert.equal(plan.leaked.length,4);
 const{wave,players}=uniteBattleOpts(m,plan,240);
 const us=buildBattleSpec({stageId:eightUniteStage(DATA.stages.act2autochess_m01).id,kind:'unite',rect:EIGHT_UNITE_RECT,players,spawns:wave.spawns,routes:wave.routes,timeLimit:240});
 const ub=createBattleFromSpec(us,m.data,{quiet:true});while(ub.time<20&&!ub.finished)ub.step();
 assert.equal(ub.enemies.filter(e=>e.defId==='enemy_1204_msfhu').length,4);assert.equal(ub.errorCount,0);
});
test('Quintus cell cannot be directly promoted and 10% boss damage broadcasts globally',t=>{
 const h=makeMatch({mode:'coop8',humans:8});t.after(()=>h.m.dispose());const m=h.m,ps=m.order[0];
 const item=ps.acquireItem('chess_item_5_08_e_a');assert.ok(item);assert.equal(ps.upgradeItem(item),false);assert.equal(item.id,'chess_item_5_08_e_a');
 m.startFinalAssault(false);m.bossPool.damage(ps.playerId,m.bossPool.maxHp*.1);
 assert.ok(h.bc.some(f=>f.t==='m.ticker'&&f.text.includes('10%')));
});

test('every death-spawned hit-count enemy remains in the verified result and cooperative-defense spawn schedule',t=>{
 const h=makeMatch({mode:'coop8',humans:8});t.after(()=>h.m.dispose());const m=h.m;m.round=1;
 let cases=0;
 for(const[key,def]of Object.entries(DATA.enemies)){
  const child=def.talents?.bbStr?.['DeadSpawn.enemy_key'];if(!child||!(DATA.enemies[child]?.stats?.maxHp<100))continue;
  const spec=buildBattleSpec({stageId:'act2autochess_m01',kind:'normal',timeLimit:30,players:[{playerId:'p_0',units:[],bonds:{}}],spawns:[{time:0,enemyKey:key,pos:[10,7],mods:{speedMul:0}}]});
  const b=createBattleFromSpec(spec,DATA,{quiet:true});b.step();b.kill(b.enemies[0]);const children=b.enemies.filter(e=>e.defId===child);assert.ok(children.length>0,key);b.forceEnd('timeout');
  const checked=validateClientResult(spec,compactResult(b.result()),{gd:m.gd});assert.ok(checked.ok,`${key}: ${checked.reason}`);
  m.lastResults=new Map(m.order.map(p=>[p.playerId,p.playerId==='p_0'?checked.result.perPlayer.p_0:{leaked:[],perfect:true,unitsEnd:[]} ]));
  const plan=planUnite(m,m.lastResults);assert.equal(plan.leaked.filter(l=>l.enemyKey===child).length,children.length,key);
  const{wave,players}=uniteBattleOpts(m,plan,240);
  const ub=createBattleFromSpec(buildBattleSpec({stageId:eightUniteStage(DATA.stages.act2autochess_m01).id,kind:'unite',rect:EIGHT_UNITE_RECT,players,spawns:wave.spawns,routes:wave.routes,timeLimit:240}),m.data,{quiet:true});
  while(ub.time<20&&!ub.finished)ub.step();assert.equal(ub.enemies.filter(e=>e.defId===child).length,children.length,key);assert.equal(ub.errorCount,0,key);cases++;
 }
 assert.ok(cases>=10,`checked ${cases} split enemy definitions`);
});
