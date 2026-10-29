import {test} from 'node:test';
import assert from 'node:assert/strict';
import {LaboratoryMatch} from '../../server/match/LaboratoryMatch.js';
import {GameData} from '../../server/match/gamedata.js';
import {Match} from '../../server/match/Match.js';
import {VirtualScheduler} from '../../server/match/scheduler.js';
import {loadData} from '../../server/data.js';
import {PHASE,ERR,BOND_LAYER_CAP} from '../../shared/constants.js';
import {legalTileFor} from './harness.js';
const raw=loadData(new URL('../../content/production/data/',import.meta.url).pathname);
function create(t,kind='boss',difficulty='NORMAL',bandId='band_pith'){
 const sched=new VirtualScheduler(),sent=[];
 const boss=Object.values(raw.bosses).find(b=>!!b.hidden===(kind==='hidden'));
 const setup={stageId:'act1autochess_m01',bossId:boss.bossId,bandId,kind};
 const m=new LaboratoryMatch({laboratory:setup,difficulty,data:raw,seed:13,scheduler:sched,seats:[{seat:0,playerId:'local',name:'박사'}],send:(_,x)=>{sent.push(x);return true;},broadcast:x=>sent.push(x),onEnd:()=>{}});
 t.after(()=>m.dispose());m.start();sched.advance(3000);
 return {m,sched,sent,ps:m.players.get('local')};
}
test('laboratory chooses its map/boss/round and runs Pith initial grant at every difficulty without bans',t=>{
 for(const difficulty of ['FUNNY','NORMAL','HARD','ABYSS'])for(const kind of ['boss','hidden']){
  const {m,ps}=create(t,kind,difficulty);
  assert.equal(m.phase,PHASE.PREP);assert.equal(m.deadline,0);assert.equal(m.stageId,'act1autochess_m01');
  assert.equal(m.round,kind==='boss'?m.gd.bossRound:m.gd.hiddenRound);assert.equal(m.difficulty,difficulty);
  assert.equal(ps.bandId,'band_pith');assert.equal(ps.hand.filter(Boolean).filter(p=>p.id==='chess_char_1_15_a').length,1);
  assert.deepEqual(m.disabledBonds,[]);assert.deepEqual(m.bannedChess,[]);assert.equal(m.gd.modeInactiveBonds.size,0);
  assert.ok(m.bossWaves[0].wave.spawns.some(s=>s.enemyKey===m.gd.boss(m.laboratory.bossId).enemyKey));
  assert.equal(m.errorCount,0);
 }
});
test('laboratory gives normal equipment and operators with shop purchase hooks free, permits placement/equip, and edits layers exactly',t=>{
 const {m,ps}=create(t);
 const funds=ps.funds;
 const events=[];const dispatch=m.dispatch.bind(m);m.dispatch=(ps,name,event,...rest)=>{if(name==='onBuy'||name==='onGain')events.push({name,source:event.source,kind:event.kind});return dispatch(ps,name,event,...rest);};
 const chess=Object.values(raw.chess).find(c=>c.visible&&!c.isGolden&&!c.isHidden&&!c.isDiy);
 assert.deepEqual(m.handle('local',{t:'g.labGain',kind:'chess',id:chess.chessId}),{ok:true});
 assert.equal(ps.stats.buys,1);assert.ok(events.some(e=>e.name==='onBuy'&&e.kind==='chess'));assert.ok(events.some(e=>e.name==='onGain'&&e.source==='buy'));
 const piece=ps.hand.find(p=>p?.id===chess.chessId);assert.ok(piece);
 const tile=legalTileFor(m,ps,chess.chessId);assert.ok(tile);
 assert.deepEqual(m.handle('local',{t:'g.move',uid:piece.uid,to:{area:'board',row:tile[0],col:tile[1]}}),{ok:true});
 assert.deepEqual(m.handle('local',{t:'g.labGain',kind:'item',id:'chess_item_1_02_e_a'}),{ok:true});
 const item=ps.hand.find(p=>p?.kind==='item');assert.ok(item);
 assert.deepEqual(m.handle('local',{t:'g.equip',itemUid:item.uid,targetUid:piece.uid}),{ok:true});assert.equal(ps.funds,funds);assert.equal(ps.stats.buys,2);
 assert.equal(m.handle('local',{t:'g.labGain',kind:'chess',id:chess.goldenId}).error,ERR.BAD_TARGET);
 assert.equal(m.handle('local',{t:'g.labGain',kind:'item',id:'chess_item_1_02_e_b'}).error,ERR.BAD_TARGET);
 for(const layers of [42,0,BOND_LAYER_CAP])assert.deepEqual(m.handle('local',{t:'g.labStack',bondId:'victoriaShip',layers}),{ok:true});
 assert.equal(ps.layers.victoriaShip,BOND_LAYER_CAP);
 assert.equal(m.handle('local',{t:'g.labStack',bondId:'victoriaShip',layers:BOND_LAYER_CAP+1}).error,ERR.BAD_TARGET);
 assert.equal(m.handle('local',{t:'g.labStack',bondId:'unknown',layers:2}).error,ERR.BAD_TARGET);
 assert.equal(m.handle('local',{t:'g.labGain',kind:'chess',id:'unknown'}).error,ERR.BAD_TARGET);
 assert.deepEqual(m.handle('local',{t:'g.ready',ready:true}),{ok:true});
 assert.equal(m.handle('local',{t:'g.labStack',bondId:'victoriaShip',layers:1}).error,ERR.WRONG_PHASE);
 assert.equal(m.handle('local',{t:'g.buy',slot:0}).error,ERR.WRONG_PHASE);
});
test('laboratory-only intents do not work in ordinary server matches',t=>{
 const m=new Match({mode:'solo',difficulty:'NORMAL',data:raw,seed:2,seats:[{seat:0,playerId:'p',name:'박사'}],send:()=>true,broadcast:()=>{},onEnd:()=>{}});t.after(()=>m.dispose());m.start();
 assert.ok(m.handle('p',{t:'g.labStack',bondId:'victoriaShip',layers:999}).error);
 assert.equal(m.players.get('p').layers.victoriaShip,undefined);
});

test('every selectable leader uses its own template, including leaders outside the difficulty random pool',t=>{
 for(const difficulty of ['FUNNY','NORMAL','HARD','ABYSS'])for(const boss of Object.values(raw.bosses)){
  const m=new LaboratoryMatch({laboratory:{stageId:'act1autochess_m01',bossId:boss.bossId,bandId:'band_bldsk',kind:boss.hidden?'hidden':'boss'},difficulty,data:raw,seed:9,seats:[{seat:0,playerId:'local',name:'박사'}],send:()=>true,broadcast:()=>{},onEnd:()=>{}});
  try {m.start();assert.ok(m.bossWaves[0].wave.spawns.some(s=>s.enemyKey===boss.enemyKey),difficulty+' '+boss.bossId);}finally{m.dispose();}
 }
});

test('laboratory suppresses economic/acquisition hooks and reward offers but keeps combat hooks and natural merges', t => {
 const {m,ps}=create(t);
 const invoked=[];
 const original=m.dispatcher.dispatch.bind(m.dispatcher);
 m.dispatcher.dispatch=(player,hook,event,opts)=>{invoked.push(hook);return original(player,hook,event,opts);};
 for(const hook of ['onGain','onSold','onMerge','onBuy','onSpend','onRefresh','onPrice','onLevelUp','onIncome','onLayers'])m.dispatch(ps,hook,{});
 assert.deepEqual(invoked,[]);
 m.dispatch(ps,'onBattleStart',{input:ps.battleInput({side:'L',colOffset:0})});
 assert.ok(invoked.includes('onBattleStart'));
 const id=Object.values(raw.chess).find(c=>c.visible&&!c.isGolden&&!c.isHidden&&!c.isDiy).chessId;
 for(let i=0;i<3;i++)assert.deepEqual(m.handle('local',{t:'g.labGain',kind:'chess',id}),{ok:true});
 assert.ok([...ps.hand,...ps.temp].some(p=>p?.id===raw.chess[id].goldenId));
 assert.equal(ps.offers.length,0);
 assert.equal(ps.pushRewardOffer('merge'),null);
 assert.equal(ps.pushItemOffer(['chess_item_1_02_e_a']),null);
 assert.equal(ps.addLayers('victoriaShip',8),0);
 assert.deepEqual(m.handle('local',{t:'g.labStack',bondId:'victoriaShip',layers:24}),{ok:true});
 assert.equal(ps.layers.victoriaShip,24);
 assert.equal(ps.addLayers('victoriaShip',8),0);
 assert.equal(ps.layers.victoriaShip,24);
 assert.equal(invoked.includes('onGain'),false);
 assert.equal(invoked.includes('onMerge'),false);
});

for(const difficulty of ['FUNNY','NORMAL','HARD','ABYSS'])for(const players of [1,2,3,4])test(`laboratory ${difficulty} scales to ${players} living participants with one actual player`,t=>{
 const modeId=`mode_${players>1?'multi':'single'}_${difficulty.toLowerCase()}`;
 const reference=new GameData(raw,modeId);
 const sched=new VirtualScheduler();
 const m=new LaboratoryMatch({laboratory:{stageId:'act1autochess_m02',bossId:'boss_1',bandId:'band_pith',kind:'boss',players},difficulty,data:raw,seed:17,scheduler:sched,seats:[{seat:0,playerId:'local',name:'박사'}],send:()=>true,broadcast:()=>{},onEnd:()=>{}});t.after(()=>m.dispose());m.start();sched.advance(3000);
 assert.equal(m.players.size,1);assert.equal(m.mode,'solo');
 assert.equal(m.round,reference.bossRound);
 assert.deepEqual(m.gd.enemyScale(m.round),reference.enemyScale(reference.bossRound));
 assert.equal(m.gd.bossPoolHp('boss_1',1),reference.bossPoolHp('boss_1',players));
 assert.deepEqual(m.handle('local',{t:'g.ready',ready:true}),{ok:true});
 sched.advance(3000);
 assert.equal(m.bossPool.maxHp,reference.bossPoolHp('boss_1',players));
 assert.equal(m.bossWaves[0].wave.templateId.replace(/_s$/,''),raw.bosses.boss_1.templates[modeId].template.replace(/_s$/,''));
 assert.equal(m.fields[0].players.length,1);
});

 test('laboratory loadout skin edits reach deployed battle input during preparation',t=>{
  const {m,ps}=create(t);
  const c=Object.values(raw.chess).find(c=>c.visible&&!c.isGolden&&!c.optionalRecruit&&c.skins?.length);
  assert.ok(c);
  assert.deepEqual(m.setLoadout('local',{[c.chessId]:{skin:c.skins[0].id}}),{ok:true});
  assert.equal(ps.privateView().loadout[c.chessId].skin,c.skins[0].id);
  m.handle('local',{t:'g.labGain',kind:'chess',id:c.chessId});
  const piece=ps.hand.find(p=>p?.id===c.chessId),tile=legalTileFor(m,ps,c.chessId);
  assert.deepEqual(m.handle('local',{t:'g.move',uid:piece.uid,to:{area:'board',row:tile[0],col:tile[1]}}),{ok:true});
  assert.equal(ps.battleInput({side:'L',colOffset:0}).units.find(u=>u.chessId===c.chessId).skinId,c.skins[0].id);
 });

test('laboratory has fifteen deployment slots and does not grant personnel files',t=>{
 const {m,ps}=create(t);assert.equal(ps.deployCap,15);assert.ok(m.handle('local',{t:'g.labGain',kind:'item',id:'chess_item_6_08_e_a'}).error);assert.ok(!ps.hand.some(p=>p?.id==='chess_item_6_08_e_a'));
});

test('laboratory snapshots restore placements and equipment, and put operators on an empty bench on another map',t=>{
 const {m,ps}=create(t);ps.hand.fill(null);ps.temp.fill(null);ps.board.clear();
 const chess=m.gd.visibleChess.find(id=>!m.gd.chess(id).optionalRecruit),item=Object.keys(m.data.items)[0];
 const unit=ps.newPiece('chess',chess,{items:[ps.newPiece('item',item)],dir:2});ps.board.set('10,3',unit);ps.layers.yanShip=42;ps.recompute();
 const saved=JSON.parse(JSON.stringify(m.saveSetup('local')));
 assert.ok(m.loadSetup('local',saved).ok);assert.equal(ps.board.get('10,3').id,chess);assert.equal(ps.board.get('10,3').items[0].id,item);assert.equal(ps.layers.yanShip,42);assert.equal(ps.board.get('10,3').dir,2);assert.notEqual(ps.board.get('10,3').uid,unit.uid);
 const other={...saved,stageId:'other-map'};ps.hand[0]=ps.newPiece('chess',chess);
 assert.ok(m.loadSetup('local',other).ok);assert.equal(ps.board.size,0);assert.equal(ps.hand.filter(Boolean).length,1);assert.equal(ps.hand[0].id,chess);assert.equal(ps.hand[0].items[0].id,item);
 const before=JSON.stringify(ps.hand);assert.ok(m.loadSetup('local',{...other,hand:Array(100).fill(unit)}).error);assert.equal(JSON.stringify(ps.hand),before);
});

test('laboratory cross-map presets use temporary benches and reject invalid snapshots without clearing the current setup',t=>{
 const {m,ps}=create(t);ps.hand.fill(null);ps.temp.fill(null);ps.board.clear();
 const id=m.gd.visibleChess.find(id=>!m.gd.chess(id).optionalRecruit);
 const count=ps.hand.length+Math.min(ps.temp.length,3);
 const board=Array.from({length:count},(_,i)=>({key:`${9+Math.floor(i/8)},${3+i%8}`,piece:ps.newPiece('chess',id)}));
 const saved={...m.saveSetup('local'),stageId:'different-map',board};
 assert.ok(m.loadSetup('local',saved).ok);
 assert.equal(ps.board.size,0);assert.equal(ps.hand.filter(Boolean).length,ps.hand.length);assert.equal(ps.temp.filter(Boolean).length,Math.min(ps.temp.length,3));
 const before=JSON.stringify([...ps.hand,...ps.temp]);
 assert.ok(m.loadSetup('local',{...saved,board:[board[0],board[0]]}).error);
 assert.equal(JSON.stringify([...ps.hand,...ps.temp]),before);
});

test('lab file saves only pieces and ignores legacy loadout, recruit and layer fields',t=>{
 const {m,ps}=create(t);const c=Object.values(m.data.chess).find(c=>c.optionalRecruit&&!c.isGolden&&c.tier===5&&!c.recruitReserve);
 const baseline=m.gd.visibleChess.find(id=>!m.gd.chess(id).optionalRecruit);ps.hand.fill(null);ps.temp.fill(null);ps.board.clear();ps.board.set('10,3',ps.newPiece('chess',baseline));ps.hand[0]=ps.newPiece('chess',c.chessId);
 const saved=m.saveSetup('local');assert.equal(saved.v,2);for(const key of ['loadout','ops','layers','setup'])assert.ok(!(key in saved));
 const old={...saved,v:1,loadout:{[c.chessId]:{selected:true}},ops:{[c.charId]:{potential:1}},layers:{yanShip:999}};
 ps.layers.yanShip=17;const lo=JSON.stringify(ps.loadout),ops=JSON.stringify(ps.ops);assert.ok(m.loadSetup('local',old).ok);
 assert.equal(JSON.stringify(ps.loadout),lo);assert.equal(JSON.stringify(ps.ops),ops);assert.equal(ps.layers.yanShip,17);assert.ok(![...ps.hand,...ps.temp,...ps.board.values()].some(p=>p?.id===c.chessId));assert.equal(ps.board.get('10,3').id,baseline);
});

test('battle restart snapshot captures preparation before skill/round mutations',t=>{
 const {m,ps}=create(t);ps.layers.yanShip=13;const before=m.saveSetup('local');m.endPrep();assert.deepEqual(m.preparationSnapshot.pieces,before);assert.equal(m.preparationSnapshot.layers.yanShip,13);ps.layers.yanShip=999;assert.equal(m.preparationSnapshot.layers.yanShip,13);
});

import {withLaboratoryDummy,LAB_DUMMY_BOSS,LAB_DUMMY_ENEMY} from '../../shared/laboratoryDummy.js';
import {bossPoolHp} from '../../server/match/finalAssault.js';
import {DataSource} from '../../server/sim/simdata.js';
import {createBattleFromSpec} from '../../server/sim/spec.js';
for(const players of [1,4])test(`Jesselton dummy ${players}-person reference has armor defaults, no escorts/actions, fixed body and 3x model`,t=>{
 const scheduler=new VirtualScheduler(),m=new LaboratoryMatch({data:raw,laboratory:{stageId:'act1autochess_m01',bossId:LAB_DUMMY_BOSS,bandId:'band_pith',kind:'boss',players},difficulty:'NORMAL',seed:29,scheduler,seats:[{seat:0,playerId:'local',name:'박사'}],send:()=>true,broadcast:()=>true,onEnd:()=>{}});t.after(()=>m.dispose());
 const defaults={...m.dummyDefaults};assert.ok(defaults.maxHp>0);assert.equal(defaults.def,raw.enemies.enemy_9013_acstmk.stats.def);m.start();scheduler.advance(3000);m.endPrep();
 const spec=m.fields[0].spec;assert.equal(spec.spawns.length,1);assert.equal(spec.spawns[0].enemyKey,LAB_DUMMY_ENEMY);assert.equal(m.bossPool.maxHp,defaults.maxHp);
 const b=createBattleFromSpec(spec,new DataSource(m.data),{quiet:true});b.step();const e=b.enemies[0],xy=[e.x,e.y];assert.deepEqual(e.def.hitArea,raw.enemies.enemy_9013_acstmk.hitArea);assert.equal(e.def.spine,'enemy_1516_jakill');assert.equal(e.def.raw.modelScale,raw.enemies.enemy_1516_jakill.modelScale*2.5);
 b.runToEnd(20);assert.deepEqual([e.x,e.y],xy);assert.equal(e.stats.attacks,0);assert.equal(b.enemies.length,1);assert.equal(b.errorCount,0);const lp=m.teamLp;m._applyOvertime(1e6);assert.equal(m.teamLp,lp);
});

test('dummy specs accept edits and restore armor values without touching the original data',t=>{
 const scheduler=new VirtualScheduler(),m=new LaboratoryMatch({data:raw,laboratory:{stageId:'act1autochess_m01',bossId:LAB_DUMMY_BOSS,bandId:'band_pith',kind:'boss'},difficulty:'NORMAL',seed:29,scheduler,seats:[{seat:0,playerId:'local',name:'박사'}],send:()=>true,broadcast:()=>true,onEnd:()=>{}});t.after(()=>m.dispose());m.start();scheduler.advance(3000);
 const initial={...m.dummyDefaults},next={...initial,maxHp:1000000,def:250,res:30,elementRes:50,elementDmgRes:25};assert.ok(m.handle('local',{t:'g.labDummyStats',stats:next}).ok);m.endPrep();assert.equal(m.bossPool.maxHp,1000000);
 const b=createBattleFromSpec(m.fields[0].spec,new DataSource(m.data),{quiet:true});b.step();assert.equal(b.enemies[0].s.def,250);assert.equal(b.enemies[0].def.epResistance,50);assert.equal(b.enemies[0].def.epDamageResistance,25);
 assert.ok(m.handle('local',{t:'g.labDummyStats',reset:true}).ok);assert.deepEqual(m.laboratory.dummyStats,initial);assert.ok(m.handle('local',{t:'g.labDummyStats',stats:{...initial,res:101}}).error);assert.ok(!raw.bosses[LAB_DUMMY_BOSS]);assert.ok(!raw.enemies[LAB_DUMMY_ENEMY]);
});
for(const kind of ['boss','hidden'])test(`Jesselton ${kind}: preview and live enemy identity match, and deployed ranged operators damage its pool`,t=>{
 const scheduler=new VirtualScheduler(),m=new LaboratoryMatch({data:raw,laboratory:{stageId:'act1autochess_m01',bossId:LAB_DUMMY_BOSS,bandId:'band_pith',kind},difficulty:'NORMAL',seed:29,scheduler,seats:[{seat:0,playerId:'local',name:'박사'}],send:()=>true,broadcast:()=>true,onEnd:()=>{}});t.after(()=>m.dispose());m.start();scheduler.advance(3000);
 assert.deepEqual(m.nextEnemiesFor(m.order[0]).map(e=>e.enemyKey),[LAB_DUMMY_ENEMY]);assert.equal(m.gd.enemy(LAB_DUMMY_ENEMY).name,'제셀톤 윌리엄스');
 const ps=m.order[0];ps.board.set('9,5',{...ps.newPiece('chess','chess_char_1_01_a'),dir:'RIGHT'});ps.recompute();m.endPrep();
 const b=createBattleFromSpec(m.fields[0].spec,new DataSource(m.data),{quiet:true});b.runToEnd(10);const u=b.allyUnits[0],e=b.enemies[0];assert.ok(u.alive);assert.ok(u.stats.attacks>0);assert.ok(b.sharedBoss.hp<b.sharedBoss.maxHp);assert.equal(e.stats.attacks,0);assert.equal(e.def.raw.staticBody,true);assert.equal(b.errorCount,0);
});
test('laboratory offers 拟态物质 and it always grants one more copy of its carrier',t=>{
 const {m,ps}=create(t);
 const chess=m.gd.raw.chess.chess_char_1_09_a||Object.values(m.gd.raw.chess).find(c=>c.visible&&!c.isHidden&&!c.isGolden&&ps.canRecruit(c.chessId));
 assert.deepEqual(m.handle('local',{t:'g.labGain',kind:'chess',id:chess.chessId}),{ok:true});
 const carrier=ps.hand.find(p=>p?.kind==='chess'&&p.id===chess.chessId);assert.ok(carrier);
 assert.deepEqual(m.handle('local',{t:'g.labGain',kind:'item',id:'chess_item_5_05_e_a'}),{ok:true});
 const item=ps.hand.find(p=>p?.kind==='item'&&p.id==='chess_item_5_05_e_a');assert.ok(item,'拟态物质 in the hand');
 const copies=()=>[...ps.board.values(),...ps.hand,...ps.temp].filter(p=>p?.kind==='chess'&&m.gd.baseIdOf(p.id)===m.gd.baseIdOf(chess.chessId)).length;
 const before=copies();
 assert.deepEqual(m.handle('local',{t:'g.equip',itemUid:item.uid,targetUid:carrier.uid}),{ok:true});
 assert.ok(copies()>before||ps.hand.some(p=>p?.kind==='chess'&&m.gd.isGolden(p.id)&&m.gd.baseIdOf(p.id)===m.gd.baseIdOf(chess.chessId)),'the carrier\'s own operator, not a random same-bond one');
});
