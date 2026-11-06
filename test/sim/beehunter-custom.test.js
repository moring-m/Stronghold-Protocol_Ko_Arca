import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {makeBattle,enemyRec} from '../helpers/battleHarness.js';
const chess=JSON.parse(readFileSync(new URL('../../content/production/data/chess.json',import.meta.url)));
function scenario(index=1){const id='chess_custom_ursus_brownb_b';return makeBattle({autoFinish:false,defs:{chess:{[id]:chess[id]},enemies:{dummy:enemyRec({key:'dummy',speed:0,hp:1e7,atk:0})}},units:[{chessId:id,row:10,col:3,skillIndex:index}],enemies:[{key:'dummy',pos:[10,4]}]});}
test('Beehunter S1 grants permanent physical evasion',()=>{const h=scenario(0);h.run(1.2);const u=h.b.allyUnits[0];assert.equal(u.skill.kind,'passive');assert.equal(u.s.dodgePhys,.4);h.run(12);assert.equal(u.s.dodgePhys,.4);});
test('Beehunter S2 shortens interval, talent caps and switches target, module follows HP',()=>{
 const h=scenario(),u=h.b.allyUnits[0];h.run(1.2);const base=u.s.interval;assert.ok(u.skill.activate('test',{free:true}));h.step();assert.ok(u.s.interval<base*.6);
 h.run(4);assert.equal(u.mem.brownbStacks,5);
 const target=h.enemies()[0];u.mem.brownbTarget=-1;h.b.emit('beforeAttack',{attacker:u,targets:[target],profile:u.profile});assert.equal(u.mem.brownbStacks,1);
 u.hp=u.s.maxHp*.4;h.step();assert.equal(u.s.aspd,100);u.hp=u.s.maxHp*.8;h.step();assert.equal(u.s.aspd,110);
});

// 0.3.3j2: <배치 시> activated [Ursus]/[Raid] layers +4 (elite +8) on every deploy, at most 8 per battle
import {loadData} from '../../server/data.js';
import {setGameData} from '../../server/sim/content/support/index.js';
const data=loadData(new URL('../../content/production/data/',import.meta.url).pathname);
function ursusBattle(units,bonds){
 const raw={...data,enemies:{...data.enemies,dummy:enemyRec({key:'dummy',hp:1e9,speed:0,atk:0,def:0,res:0})}};setGameData(raw);
 return makeBattle({data:raw,autoFinish:false,units,enemies:[{key:'dummy',route:{motion:'WALK',start:[10,9],end:[10,8],checkpoints:[]}}],bonds,flags:{layerGainsEnabled:true}});
}
test('Beehunter trait: each deploy adds +4 / +8 to the active Ursus and Raid bonds, at most eight times per battle',()=>{
 for(const [suffix,n] of [['a',4],['b',8]]){
  const id=`chess_custom_ursus_brownb_${suffix}`;
  const h=ursusBattle([{chessId:id,row:10,col:3}],{ursusShip:{active:true,count:3,tier:1,layers:0},raidShip:{active:true,count:3,tier:1,layers:0}});
  h.run(.2);const u=h.unit(id),p=h.b.getPlayer(u.ownerId);
  assert.equal(p.bonds.ursusShip.layers,n,'the initial deploy counts');assert.equal(p.bonds.raidShip.layers,n);
  for(let i=0;i<20;i++)h.b.emit('deploy',{unit:u,initial:false});
  assert.equal(p.bonds.ursusShip.layers,n*8,'eight deploys at most');assert.equal(p.bonds.raidShip.layers,n*8);
  h.b.emit('deploy',{unit:u,initial:false,move:true});assert.equal(p.bonds.ursusShip.layers,n*8,'a move is no deploy');
  setGameData(null);
 }
 // an inactive bond gains nothing (활성화된)
 const h=ursusBattle([{chessId:'chess_custom_ursus_brownb_a',row:10,col:3}],{ursusShip:{active:true,count:3,tier:1,layers:0},raidShip:{active:false,count:1,tier:0,layers:0}});
 h.run(.2);const p=h.b.getPlayer(h.unit('chess_custom_ursus_brownb_a').ownerId);assert.equal(p.bonds.ursusShip.layers,4);assert.equal(p.bonds.raidShip?.layers||0,0);setGameData(null);
});

test('Ursus 6: the drone adds the ATK of each different Ursus operator once (two copies of one operator count once)',()=>{
 const poca='chess_custom_ursus_poca_a',helage='chess_custom_ursus_helage_a';
 const h=ursusBattle([{chessId:poca,row:10,col:3},{chessId:poca,row:10,col:4},{chessId:helage,row:10,col:5}],{ursusShip:{active:true,count:6,tier:2,layers:20}});
 h.run(.5);
 const ops=h.b.allyUnits.filter(u=>u.kind==='op'),drone=h.b.allyUnits.find(u=>u.defId==='token_custom_ursus_drone');
 assert.ok(drone,'the drone is summoned');
 const best=new Map();for(const u of ops){const k=u.def.charId||u.def.raw?.charId;best.set(k,Math.max(best.get(k)||0,u.s.atk));}
 assert.equal(best.size,2);
 const expected=[...best.values()].reduce((a,b)=>a+b,0)*(.1+.00015*20),buff=drone.findBuff('bond:ursus:drone');
 assert.ok(Math.abs(buff.mods.atkFlat-expected)<1e-6,`${buff.mods.atkFlat} vs ${expected}`);
 setGameData(null);
});

test('Leto trait: an allied Ursus skill gives active Ursus +3 / +6, at most seven times per battle',()=>{
 for(const [suffix,n] of [['a',3],['b',6]]){
  const id=`chess_custom_ursus_leto_${suffix}`,h=ursusBattle([{chessId:id,row:10,col:3}],{ursusShip:{active:true,count:3,tier:1,layers:0}});
  h.run(.2);const u=h.unit(id),p=h.b.getPlayer(u.ownerId),before=p.bonds.ursusShip.layers;
  for(let i=0;i<10;i++)h.b.emit('skillStart',{unit:u,skill:u.skill,reason:'test'});
  assert.equal(p.bonds.ursusShip.layers-before,n*7);setGameData(null);
 }
});
