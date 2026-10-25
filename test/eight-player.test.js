import {validateC2S} from '../shared/protocol.js';
import {normalizeSp} from '../public/js/ui/gameLogic/draft.js';
import {makeBattle,chessRec} from './helpers/battleHarness.js';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {makeMatch,DATA} from './match/harness.js';
import {pairPlayers} from '../server/match/finalAssault.js';
import {createBattleFromSpec,buildBattleSpec} from '../server/sim/spec.js';
import {DataSource} from '../server/sim/simdata.js';
import {createRng} from '../server/sim/rng.js';
import {drawDisabledBonds} from '../server/match/pool.js';
import {roomSeatCap} from '../shared/constants.js';
import {modeExtensionSelection} from '../shared/customExtensions.js';

test('eight seats retain four-seat mode, have no bans and strip outdated ban policies',t=>{
 assert.equal(roomSeatCap('coop'),4);assert.equal(roomSeatCap('coop8'),8);
 const first=Object.values(DATA.chess).find(c=>c.visible&&!c.isGolden&&!c.optionalRecruit&&c.tier===1);
 const selection={bonds:[],stages:[],protectedOperators:[first.charId],forcedBonds:['yanShip'],disabledBonds:['kazimierzShip']};
 const h=makeMatch({mode:'coop8',humans:8,customExtensions:selection});t.after(()=>h.m.dispose());const m=h.m;
 assert.equal(m.order.length,8);assert.equal(m.mode,'coop8');assert.deepEqual(m.disabledBonds,[]);assert.deepEqual(m.staticInactiveBonds,[]);
 assert.deepEqual(m.bannedChess,[]);
 assert.ok(m.bannedChess.every(id=>m.gd.chess(id).charId!==first.charId));assert.ok(!m.customExtensions.disabledBonds);
 assert.equal(m.gd.unite.maxHelpers,4);assert.equal(pairPlayers(m.order).length,4);assert.equal(m.gd.bossPoolShare(8),8);
 const bans=drawDisabledBonds(m.gd,createRng(12),{...m.customExtensions,mode:m.mode});assert.equal(bans.banned.length,0);assert.ok(bans.banned.every(id=>m.gd.chess(id).charId!==first.charId));
 assert.ok(!modeExtensionSelection(selection,'coop8').forcedBonds);
});

test('four-helper unite builds distinct deployment fields and identical server/client geometry',t=>{
 const h=makeMatch({mode:'coop8',humans:8});t.after(()=>h.m.dispose());const m=h.m;
 const chess=m.gd.visibleChess.find(id=>!m.gd.chess(id).optionalRecruit&&m.gd.chess(id).position==='MELEE');
 const helpers=m.order.slice(0,4);
 for(const p of helpers){p.board.set('10,3',p.newPiece('chess',chess));m.lastResults.set(p.playerId,{unitsEnd:[]});p.recompute();}
 const enemy=Object.keys(DATA.enemies).find(id=>!DATA.enemies[id].tokenOnly);
 const plan={helpers,leakers:m.order.slice(4),leaked:[{enemyKey:enemy,lpr:1,sourcePlayerId:m.order[4].playerId}],notReentered:new Map()};
 const opts=m._uniteOpts(plan,60);assert.ok(opts.spawns.length>0);assert.equal(opts.rect.r0,9);assert.equal(opts.players.length,4);
 assert.deepEqual(opts.players.map(p=>[p.colOffset,p.rowOffset]),[[24,0],[16,0],[8,0],[0,0]]);
 const stage=m.gd.stage(opts.stageId);assert.equal(stage.coopEightStage,true);assert.equal(stage.rows[10][19],m.stage.rows[10][3]);
 const battle=createBattleFromSpec(buildBattleSpec(opts),new DataSource(m.data),{quiet:true});
 const positions=battle.allyUnits.filter(u=>u.kind==='op').map(u=>`${u.x},${u.y}`);
 assert.equal(new Set(positions).size,4);
 for(const route of opts.routes.filter(r=>r.motion!=='FLY')){const path=battle.grid.flowField(...route.end,{ignoreObstacles:true});assert.ok(path.dist[route.start[0]*battle.grid.cols+route.start[1]]>=0,'all four fields connect to the exit');}
 battle.runToEnd(.5);assert.equal(battle.errorCount,0);
 assert.ok(opts.routes.every(r=>r.end[1]===2));
});

test('setup reroll retains explicit custom ban policies',t=>{
 const h=makeMatch({humans:1,customExtensions:{bonds:[],stages:[],forcedBonds:['yanShip'],protectedBonds:['kazimierzShip']}}).start();t.after(()=>h.m.dispose());
 const m=h.m;assert.ok(m.disabledBonds.includes('yanShip'));assert.ok(!m.disabledBonds.includes('kazimierzShip'));
 m.requestSetupReroll('p_0',0);assert.ok(m.disabledBonds.includes('yanShip'));assert.ok(!m.disabledBonds.includes('kazimierzShip'));
});

test('common Pith applies to all eight players without replacing their personal strategy',t=>{
 const h=makeMatch({mode:'coop8',humans:8,customExtensions:{bonds:[],stages:[],commonBands:['band_pith']}});t.after(()=>h.m.dispose());const m=h.m;m.round=1;
 for(const ps of m.order){ps.bandId='band_amedic';m.dispatch(ps,'onPrepStart',{});assert.equal(ps.bandId,'band_amedic');assert.ok([...ps.hand,...ps.temp].some(p=>p?.id==='chess_char_1_15_a'));}
 assert.equal(m.errorCount,0);
});

test('HP loss cap rule bills more than ten while default still caps at ten',t=>{
 for(const enabled of [false,true]){
  const h=makeMatch({mode:'coop8',humans:8,customExtensions:{bonds:[],stages:[],rules:enabled?['unlimitedHpLoss']:[]}});t.after(()=>h.m.dispose());const m=h.m;m.round=1;
  for(const p of m.order){p.lp=40;m.lastResults.set(p.playerId,{leaked:Array.from({length:15},()=>({counted:true})),perfect:false,layerGains:{}});}
  m.settle(null,null);assert.ok(m.order.every(p=>p.lp===(enabled?25:30)));
 }
});

test('eight-player simulation advances shared events and all personal fields into four shared-pool boss pairs',t=>{
 const h=makeMatch({mode:'coop8',difficulty:'FUNNY',humans:8,fake:true,customExtensions:{bonds:[],stages:[],rules:['duplicateBands']},script:b=>b.kind==='boss'?{bossDps:1e9}: {}}).start();t.after(()=>h.m.dispose());const m=h.m;
 assert.ok(h.drive(()=>m.phase==='PREP'&&m.round===14));
 assert.ok(h.drive(()=>m.phase==='FINAL_ASSAULT'));
 assert.equal(m.bossWaves.length,4);assert.ok(m.bossWaves.every(w=>w.players.length===2));
 assert.equal(m.bossPool.maxHp,m.gd.bossPoolHp(m.bossId,8));
 assert.ok(h.drive(()=>!!h.ended));assert.equal(h.ended.players.length,8);assert.equal(h.ended.roomMode,'coop8');assert.equal(m.errorCount,0);
});

test('common strategy battle buffs apply alongside personal strategies and stack identical strategies independently',()=>{
 const bonds=Object.fromEntries(['yanShip','swiftShip','arcaneShip'].map(id=>[id,{active:true,count:3,tier:1,layers:0}]));
 const raw={...DATA,config:{...DATA.config,commonBands:['band_amiya']},chess:{...DATA.chess,test:chessRec({id:'test',stats:{atk:100,maxHp:1000},skill:null})}};
 for(const bandId of ['band_pith','band_amiya']){
  const h=makeBattle({data:raw,bandId,units:[{chessId:'test',row:10,col:3}],bonds,autoFinish:false});h.run(.1);
  assert.equal(h.unit('test').s.atk,bandId==='band_amiya'?140:120);assert.equal(h.b.errorCount,0);
 }
});

test('every eight-player choice event provides nine equal selectable card slots, including narrow bounty and shop pools',t=>{
 const h=makeMatch({mode:'coop8',humans:8});t.after(()=>h.m.dispose());const m=h.m;
 for(const round of [3,6,9,11,13]){
  m.round=round;m.enterSpDraft();assert.equal(m.sp.cards.length,9,`round ${round}: ${m.sp.family}`);
  assert.equal(normalizeSp(m.publicView().sp).cards.length,9);assert.equal(validateC2S({t:'g.choice',idx:8}),null);
  const seen=new Set();while(m.sp.idx<m.sp.order.length){
   const ps=m.players.get(m.spTurn()),card=m.sp.cards.find(c=>m.spCardAvailable(c));assert.ok(card,`round ${round}: everyone can choose`);
   seen.add(ps.playerId);assert.ok(m.pickCard(ps,card.idx).ok);
  }
  assert.equal(seen.size,8);assert.equal(Object.keys(m.sp.picks).length,8);
 }
});

test('every original map has connected ground routes across the join of four helper fields',t=>{
 const h=makeMatch({mode:'coop8',humans:8});t.after(()=>h.m.dispose());const m=h.m;
 const helpers=m.order.slice(0,4),enemy=Object.keys(DATA.enemies).find(id=>!DATA.enemies[id].tokenOnly);
 const plan={helpers,leakers:m.order.slice(4),leaked:[{enemyKey:enemy,lpr:1,sourcePlayerId:m.order[4].playerId}],notReentered:new Map()};
 for(const p of m.order)m.lastResults.set(p.playerId,{unitsEnd:[]});
 let checked=0;
 for(const id of Object.keys(m.data.stages)){
  const stage=m.gd.stage(id);if(!stage||stage.optionalExtension||stage.rows?.length!==19||stage.rows[0]?.length!==21)continue;
  m.stage=stage;m.stageId=id;const opts=m._uniteOpts(plan,60),battle=createBattleFromSpec(buildBattleSpec(opts),new DataSource(m.data),{quiet:true});
  for(const route of opts.routes.filter(r=>r.motion!=='FLY')){
   const path=battle.grid.flowField(...route.end,{ignoreObstacles:true});
   assert.ok(path.dist[route.start[0]*battle.grid.cols+route.start[1]]>=0,`${id}: right spawn reaches left exit`);
  }
  checked++;
 }
 assert.ok(checked>1);
});
