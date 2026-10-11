import {test} from 'node:test';
import assert from 'node:assert/strict';
import {LaboratoryMatch} from '../../server/match/LaboratoryMatch.js';
import {Match} from '../../server/match/Match.js';
import {VirtualScheduler} from '../../server/match/scheduler.js';
import {getData} from '../../server/data.js';
import {PHASE,ERR,BOND_LAYER_CAP} from '../../shared/constants.js';
import {legalTileFor} from './harness.js';
const raw=getData({dataDir:'content/production/data'});
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
