import {test} from 'node:test';
import assert from 'node:assert/strict';
import {makeBattle,chessRec,enemyRec} from '../helpers/battleHarness.js';
import {DATA,makeMatch} from '../match/harness.js';
import {applyCustomExtensions} from '../../shared/customExtensions.js';
import {buildBattleSpec,createBattleFromSpec} from '../../server/sim/spec.js';
import {collectViolations} from '../../server/match/invariants.js';
import {bondBb} from '../../server/sim/content/bonds/core.js';
const close=(a,b)=>assert.ok(Math.abs(a-b)<Math.max(1,Math.abs(b))*1e-8,`${a} expected ${b}`);
const bondsAt=L=>({yanShip:{count:3,tier:1,active:true,layers:L},arcaneShip:{count:2,tier:1,active:true,layers:L},skillfulShip:{count:2,tier:1,active:true,layers:300}});
const op=chessRec({id:'test_unlimited',profession:'CASTER',bonds:['yanShip','arcaneShip','skillfulShip'],rangeGrid:[[0,0]],stats:{atk:1000,maxHp:10000,aspd:100},skill:null});
const raw={...DATA,chess:{...DATA.chess,test_unlimited:op},enemies:{...DATA.enemies,enemy_layer_dummy:enemyRec({key:'enemy_layer_dummy',hp:1e10,atk:0,def:0,res:0,speed:0})}};
function battle(L,kind='normal',unlimited=true){
 return makeBattle({kind,data:applyCustomExtensions(raw,{bonds:[],stages:[],rules:unlimited?['unlimitedLayers']:[],ruleValues:{maxDamage:0}}),autoFinish:false,bonds:bondsAt(L),units:[{chessId:'test_unlimited',row:10,col:3}]});
}
for(const L of [999,1000,2600,10000,100000])test(`unlimited ${L}: actual ATK, vulnerability and attack speed retain full layers`,()=>{
 const h=battle(L);h.run(1.5);const u=h.unit('test_unlimited'),e=h.spawn('enemy_layer_dummy',{pos:[10,8]});
 const bb=bondBb('yanShip');close(u.s.atk,1000*(1+bb.base_atk+bb.atk_per_stack*L));assert.equal(u.s.aspd,410);
 h.b.dealDamage(u,e,{amount:1,type:'arts'});close(e.s.artsTakenMul,1.2+.01*L);
 const hp=e.hp;h.b.dealDamage(u,e,{amount:u.s.atk,type:'arts'});close(hp-e.hp,u.s.atk*(1.2+.01*L));
 assert.equal(h.b.getPlayer('p1').bonds.yanShip.layers,L);assert.equal(h.b.errorCount,0);
});
for(const kind of ['boss','hidden'])test(`reported 2600 Yan / 2600 Arcane / 300 Skillful ${kind}: high damage reaches the boss without a single-hit limit`,()=>{
 const h=battle(2600,kind);h.run(1.5);const u=h.unit('test_unlimited'),e=h.spawn('enemy_layer_dummy',{pos:[3,8],tag:'boss'});
 close(u.s.atk,24630);h.b.dealDamage(u,e,{amount:1,type:'arts'});close(e.s.artsTakenMul,27.2);
 const hp=e.hp,damage=u.stats.dmg;h.b.dealDamage(u,e,{amount:u.s.atk,type:'arts'});
 close(hp-e.hp,669936);close(u.stats.dmg-damage,669936);assert.ok(!h.eventsOf('fx').some(e=>e[1]==='hitCap'));close(u.s.atk*e.s.artsTakenMul,669936);
});
test('unlimited rule controls live gains, snapshots and serialized client simulations past 999',()=>{
 for(const unlimited of [false,true]){
  const h=battle(990,'normal',unlimited);h.run(1.5);
  assert.equal(h.b.addLayers('p1','yanShip',1610),unlimited?1610:9);h.step(2);
  const expected=unlimited?2600:999;assert.equal(h.b.getPlayer('p1').bonds.yanShip.layers,expected);
  assert.equal(h.result().perPlayer.p1.layerGains.yanShip,unlimited?1610:9);
  const spec=buildBattleSpec({...h.b.opts,flags:{...h.b.flags,customExtensions:{bonds:[],stages:[],rules:unlimited?['unlimitedLayers']:[]}}});
  spec.players[0].bonds.yanShip.layers=expected;
  const client=createBattleFromSpec(JSON.parse(JSON.stringify(spec)),raw,{quiet:true});
  assert.equal(client.getPlayer('p1').bonds.yanShip.layers,expected);assert.equal(client.addLayers('p1','yanShip',100),unlimited?100:0);
 }
});
test('persistent gains, battle inputs and match invariants accept >999 only under unlimited rule',t=>{
 for(const unlimited of [false,true]){
  const h=makeMatch({mode:'solo',fake:true,customExtensions:{bonds:[],stages:[],rules:unlimited?['unlimitedLayers']:[]}}).start();t.after(()=>h.m.dispose());h.toPrep(1);
  const ps=[...h.m.players.values()][0];ps.layers.yanShip=990;ps.recompute();assert.equal(ps.addLayers('yanShip',1610),unlimited?1610:9);
  assert.equal(ps.battleInput().bonds.yanShip.layers,unlimited?2600:999);
  assert.ok(!collectViolations(h.m).some(x=>x.includes('layers')),collectViolations(h.m).join('\n'));
 }
});
