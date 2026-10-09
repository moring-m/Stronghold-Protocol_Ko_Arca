import {test} from 'node:test';import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {makeBattle,chessRec,enemyRec,checkInvariants} from '../helpers/battleHarness.js';
import {DRONE_ID} from '../../server/sim/content/ursus.js';
const drone={tokenId:DRONE_ID,name:'Drone',stats:{maxHp:13000,atk:1000,def:800,res:50,aspd:100,bat:5,blockCnt:0,cost:0},position:'ALL',rangeGrid:[[0,0],[0,1],[0,2]],dmgType:'phys',canHitFly:true};
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
function setup(n,layers=0){
 const chess=Object.fromEntries(Array.from({length:7},(_,i)=>[`u${i}_a`,chessRec({id:`u${i}_a`,bonds:i<6?['ursusShip']:[],stats:{atk:500,maxHp:2000,aspd:100,blockCnt:1},skill:null})]));
 return makeBattle({defs:{chess,tokens:{[DRONE_ID]:drone},enemies:{dummy:enemyRec({key:'dummy',hp:1e8,speed:0,atk:0})}},units:Object.keys(chess).map((chessId,i)=>({chessId,row:10,col:i+3})),bonds:{ursusShip:{active:n>=3,count:n,tier:n>=6?2:n>=3?1:0,layers}}});
}
test('Ursus 2: no drone or speed buff',()=>{const h=setup(2);h.step(1);assert.equal(h.b.allyUnits.filter(u=>u.defId===DRONE_ID).length,0);close(h.unit('u0_a').s.aspd,100)});
for(const n of [3,5,6])test(`Ursus ${n}: one drone, layer scaling, selective +50 ASPD`,()=>{
 const h=setup(n,10);h.step(1);const d=h.b.allyUnits.find(u=>u.defId===DRONE_ID);assert.ok(d);close(d.s.atk,n===6?1814.605:1300);close(d.s.maxHp,16640);close(d.hp,d.s.maxHp);close(d.s.aspd,n===6?150:100);close(h.unit('u0_a').s.aspd,100);close(h.unit('u0_a').s.atk,650);close(h.unit('u0_a').s.maxHp,2560);close(h.unit('u6_a').s.aspd,100);
 h.b.addLayers('p1','ursusShip',20,'test');h.step(2);close(d.s.atk,n===6?2205.375:1500);close(d.s.maxHp,18720);close(d.s.aspd,n===6?150:100);assert.equal(h.b.allyUnits.filter(u=>u.defId===DRONE_ID).length,1);checkInvariants(h.b);
});
test('Default official data has no experimental faction, operators, or drone',()=>{
 for(const [file,key]of [['bonds','ursusShip'],['tokens',DRONE_ID],['chess','chess_custom_ursus_helage_a']])assert.equal(JSON.parse(readFileSync(new URL(`../../data/${file}.json`,import.meta.url)))[key],undefined);
});
test('Coop Ursus effects and live layer gains stay with the owning player',()=>{
 const chess={u_a:chessRec({id:'u_a',bonds:['ursusShip'],stats:{atk:500,maxHp:2000,aspd:100},skill:null})};
 const state=(count,layers)=>({ursusShip:{count,layers,active:count>=3,tier:count>=6?2:1}});
 const h=makeBattle({kind:'unite',flags:{layerGainsEnabled:true},rect:{r0:9,r1:12,c0:2,c1:18},defs:{chess,tokens:{[DRONE_ID]:drone},enemies:{dummy:enemyRec({key:'dummy',hp:1e8,speed:0,atk:0})}},players:[
 {playerId:'p1',units:[{chessId:'u_a',row:10,col:3}],bonds:state(6,0)},
 {playerId:'p2',colOffset:8,units:[{chessId:'u_a',row:10,col:12}],bonds:state(3,20)}]});
 h.step(1);const d1=h.b.allyUnits.find(u=>u.defId===DRONE_ID&&u.ownerId==='p1'),d2=h.b.allyUnits.find(u=>u.defId===DRONE_ID&&u.ownerId==='p2');assert.ok(d1&&d2);close(d1.s.atk,1272);close(d2.s.atk,1400);close(d1.s.aspd,150);close(d2.s.aspd,100);
 for(const u of h.b.allyUnits.filter(u=>u.kind==='op'))close(u.s.aspd,100);
 h.b.addLayers('p2','ursusShip',10,'test');h.step(2);close(d1.s.atk,1272);close(d2.s.atk,1500);checkInvariants(h.b);
});

test('Drone +50 ASPD shortens actual launches from five seconds to 3.33 seconds',()=>{
 const counts=[];
 for(const n of [3,6]){
  const h=setup(n),b=h.b;h.step();
  const d=b.allyUnits.find(u=>u.defId===DRONE_ID);
  const e=h.spawn('dummy',{route:{motion:'WALK',start:[10,7],end:[10,2],checkpoints:[]},pos:[10,7]});
  e.base.maxHp=1e8;e.hp=1e8;e.base.moveSpeed=0;e.markDirty();
  h.run(10.2);counts.push(d.stats.attacks);close(d.s.interval,n===6?5/1.5:5);
 }
 assert.deepEqual(counts,[3,4]);
});

test('drone pursues a priority boss despite other enemies in range, fires while travelling, and resumes',()=>{
 const h=setup(3);h.step();const d=h.b.allyUnits.find(u=>u.defId===DRONE_ID);d.x=8;d.y=10;d.atkCd=1;
 const leading=h.spawn('dummy',{pos:[10,3],route:{motion:'WALK',start:[10,3],end:[10,2],checkpoints:[]}});
 const nearby=h.spawn('dummy',{pos:[10,7],route:{motion:'WALK',start:[10,7],end:[10,2],checkpoints:[]}});
 leading.isBoss=true;leading.base.moveSpeed=nearby.base.moveSpeed=0;leading.markDirty();nearby.markDirty();
 h.run(.5);assert.ok(d.x<8,'does not park beside an in-range trailing enemy');const x=d.x;
 h.run(.7);assert.ok(d.stats.attacks>=1,'fires when cooldown expires during pursuit');
 assert.ok(h.eventsOf('atk').some(e=>e[1]===d.id&&e[2]===nearby.id),'fires at nearest base enemy within current radius');
 h.run(1);assert.ok(d.x<x,'resumes pursuit after its attack');assert.equal(d.profile.fixedFacing,true);
 assert.equal(h.eventsOf('spawn').find(e=>e[1].id===d.id)?.[1].fixedFacing,true,'spawn metadata carries fixed facing before flight installation');
});

test('drone cannot receive external heals and targets large enemy bodies intersecting its radius',()=>{
 const h=setup(3);h.step();const d=h.b.allyUnits.find(u=>u.defId===DRONE_ID),source=h.allies().find(u=>u.kind==='op');
 d.hp-=1000;const before=d.hp;
 h.b.heal(source,d,1000);assert.equal(d.hp,before);assert.equal(d.profile.noHeal,true);
 const enemy=h.spawn('dummy',{pos:[10,10],route:{motion:'WALK',start:[10,10],end:[10,2],checkpoints:[]}});
 d.x=7.5;d.y=10;
  // Use the same body shape as the stationary bosses (half width one tile).
 enemy.hitArea={width:3,height:1,offsetX:0,offsetY:0};
 assert.ok(d.profile.acquireTargets(h.b,d).includes(enemy),'body, not just its centre, can be within firing range');
});

test('Ursus shell excludes concealed enemies at impact and hits them after reveal',()=>{
 const h=setup(3);h.run(2);const d=h.b.allyUnits.find(u=>u.defId===DRONE_ID);
 const route={motion:'WALK',start:[11,7],end:[11,2],checkpoints:[]};
 const target=h.spawn('dummy',{pos:[11,7],route}),hidden=h.spawn('dummy',{pos:[11,7.1],route});
 h.b.addBuff(hidden,{key:'test:stealth',flags:{stealth:true},duration:100});d.profile.noAttack=true;
 const hp=hidden.hp;
 h.b.emit('attack',{attacker:d,targets:[target]});h.run(3.1);
 assert.equal(hidden.hp,hp,'an unblocked concealed enemy is not a splash target');assert.ok(target.hp<target.s.maxHp);
 h.b.addBuff(hidden,{key:'test:reveal',flags:{reveal:true},duration:100});
 h.b.emit('attack',{attacker:d,targets:[target]});h.run(3.1);assert.ok(hidden.hp<hp,'revealed enemies are hit normally');
});

test('six Ursus reveals only enemies inside the live drone radius',async()=>{
 const {enemyStealthed}=await import('../../server/sim/targeting.js');
 const h=setup(6);h.step();const d=h.b.allyUnits.find(u=>u.defId===DRONE_ID);d.profile.noAttack=true;
 const e=h.spawn('dummy',{pos:[11,7],route:{motion:'WALK',start:[11,7],end:[11,2],checkpoints:[]}});
 h.b.addBuff(e,{key:'hidden',flags:{stealth:true},duration:100});d.x=7;d.y=11;
 h.run(.1);assert.equal(enemyStealthed(e),false);
 d.x=13;h.run(.3);assert.equal(enemyStealthed(e),true,'leaving detection range restores stealth');
 d.x=7;h.run(.1);assert.equal(enemyStealthed(e),false);
 h.b.kill(d,null);h.run(.3);assert.equal(enemyStealthed(e),true,'dead drone has no detection aura');
});
test('drone ASPD shortens the shell delay as well as attack cooldown',()=>{
 for(const n of [3,6]){
  const h=setup(n);h.step();const d=h.b.allyUnits.find(u=>u.defId===DRONE_ID);d.profile.noAttack=true;
  const e=h.spawn('dummy',{pos:[11,7],route:{motion:'WALK',start:[11,7],end:[11,2],checkpoints:[]}});
  const hp=e.hp;h.b.emit('attack',{attacker:d,targets:[e]});
  const flight=n===6?2:3;h.run(flight-.1);assert.equal(e.hp,hp);
  h.run(.2);assert.ok(e.hp<hp);
 }
});

test('drone movement gets a fixed 50 percent boost, independent of Ursus layers',async()=>{
 const {MOVE_SCALE}=await import('../../server/sim/constants.js');
 for(const layers of [0,100]){
  const h=setup(3,layers);h.step();const d=h.b.allyUnits.find(u=>u.defId===DRONE_ID);d.profile.noAttack=true;d.x=9;d.y=11;d.lastAttackAt=-100;
  h.spawn('dummy',{pos:[11,3],route:{motion:'WALK',start:[11,3],end:[11,2],checkpoints:[]}});
  const x=d.x;h.run(.2);close(x-d.x,.5*MOVE_SCALE*1.5*.2);
 }
});


test('drone prioritizes main leaders by distance, but bounty bosses use base distance',async()=>{
 const {droneTargets}=await import('../../server/sim/content/ursus.js');const h=setup(3);h.step();
 const d=h.b.allyUnits.find(u=>u.defId===DRONE_ID);d.x=7;d.y=11;
 const spawn=x=>h.spawn('dummy',{pos:[11,x],route:{motion:'WALK',start:[11,x],end:[11,2],checkpoints:[]}});
 const close=spawn(3),outer=spawn(4),inner=spawn(7.5),boss=spawn(9.5);
 outer.blockedBy=h.unit('u0_a');inner.blockedBy=h.unit('u1_a');boss.def={...boss.def,rank:'BOSS'};boss.tag='bounty';
 assert.deepEqual(droneTargets(h.b,d).map(e=>e.id),[close.id,outer.id,inner.id,boss.id]);
 assert.deepEqual(droneTargets(h.b,d,true).map(e=>e.id),[inner.id]);
 boss.tag='boss';boss.isBoss=true;
 const second=spawn(8);second.tag='boss';second.isBoss=true;
 assert.deepEqual(droneTargets(h.b,d).map(e=>e.id),[second.id,boss.id,close.id,outer.id,inner.id]);
 assert.deepEqual(droneTargets(h.b,d,true).map(e=>e.id),[second.id,inner.id]);
});
test('attack speed debuffs and increased attack intervals cannot slow the drone, buffs still work',()=>{
 const h=setup(6);h.step();const d=h.b.allyUnits.find(u=>u.defId===DRONE_ID);
 assert.equal(h.b.applyStatus(d,'aspdDown',{duration:10,value:-30}),false);
 h.b.addBuff(d,{key:'slow',mods:{aspd:-200,batPct:.8,atkPct:-.1},duration:100});
 h.b.addBuff(d,{key:'speed',mods:{aspd:30},duration:100});close(d.s.aspd,180);close(d.s.bat,5);
 assert.ok(d.s.atk<1500,'other debuffs are not discarded');
});
test('aim follows a moving target and changes dead or out-of-range targets without resetting its deadline',()=>{
 for(const reason of ['death','range']){
 const h=setup(3);h.step();const d=h.b.allyUnits.find(u=>u.defId===DRONE_ID);d.profile.noAttack=true;d.x=7;d.y=11;
 const spawn=x=>h.spawn('dummy',{pos:[11,x],route:{motion:'WALK',start:[11,x],end:[11,2],checkpoints:[]}});
 const a=spawn(7),b=spawn(8);h.b.emit('attack',{attacker:d,targets:[a]});h.run(.8);
 if(reason==='death')h.b.kill(a,null);else a.x=10;
 h.run(.2);assert.ok(h.eventsOf('fx').some(e=>e[1]==='bombardAim'&&e[4].target===b.id));
 b.x=8.2;h.run(1.5);b.x=8.3;h.run(.2);
 const locked=h.eventsOf('fx').find(e=>e[1]==='bombardAim'&&e[4].target===null);assert.ok(locked);
 const spot=locked[2];b.x=9.5;h.run(.4);
 const hit=h.eventsOf('fx').find(e=>e[1]==='bombard');assert.ok(hit);close(hit[2],spot);
 assert.equal(h.eventsOf('fx').filter(e=>e[1]==='bombardShell').length,1,'retarget never restarts the bombardment');
 }
});


test('six Ursus adds donated total ATK before the three-member percentage, tracks skill buffs and deaths without recursion',()=>{
 const h=setup(6,10);h.step();const d=h.b.allyUnits.find(u=>u.defId===DRONE_ID),u=h.unit('u0_a');
 const expected=()=> (1000+h.b.allyUnits.filter(a=>a.kind==='op'&&a.ownerId==='p1'&&a.alive&&a.deployed&&a.def.bonds.includes('ursusShip')).reduce((sum,a)=>sum+a.s.atk,0)*.1015)*1.3;
 close(d.s.atk,expected());
 h.b.addBuff(u,{key:'test:skill-strength',mods:{atkPct:1},duration:10});h.step();close(d.s.atk,expected());
 const buffed=d.s.atk;h.step(10);close(d.s.atk,buffed);
 h.b.kill(u,null);h.step();assert.ok(d.s.atk<buffed);close(d.s.atk,expected());
});
test('hidden drone visual scale grows from 85 percent by 0.2 percent of that base per layer and is serialized',()=>{
 const h=setup(3,100);h.step();const d=h.b.allyUnits.find(u=>u.defId===DRONE_ID);close(d.mem.visualScale,.85*1.2);assert.deepEqual(h.b.snapshot().modelScales,[[d.id,.85*1.2]]);
 h.b.addLayers('p1','ursusShip',100,'test');h.step(2);close(d.mem.visualScale,.85*1.4);checkInvariants(h.b);
});

test('hidden drone range grows by 0.1 percent per layer and updates selection, reveal and snapshots',()=>{
 const h=setup(6,100);h.step();const d=h.b.allyUnits.find(u=>u.defId===DRONE_ID);
 close(d.profile.visibleRangeRadius,2.2);assert.deepEqual(h.b.snapshot().attackRanges,[[d.id,2.2]]);
 const e=h.spawn('dummy',{pos:[d.y,d.x+2.1],route:{motion:'WALK',start:[d.y,d.x+2.1],end:[10,2],checkpoints:[]}});
 h.b.addBuff(e,{key:'test:stealth',flags:{stealth:true}});h.step(2);
 assert.ok(e.s.flags.reveal,'six-Ursus reveal uses the enlarged attack radius');
 assert.ok(h.b.effectiveProfile(d).acquireTargets(h.b,d).includes(e),'target outside base radius is selectable');
 h.b.addLayers('p1','ursusShip',100,'test');h.step(2);
 close(d.profile.visibleRangeRadius,2.4);assert.deepEqual(h.b.snapshot().attackRanges,[[d.id,2.4]]);
 checkInvariants(h.b);
});

for (const layers of [0,499,500,501]) test(`Ursus donation rebalance at ${layers} layers`,()=>{
 const h=setup(6,layers);h.step();const d=h.b.allyUnits.find(u=>u.defId===DRONE_ID);
 const total=h.b.allyUnits.filter(u=>u.kind==='op'&&u.def.bonds.includes('ursusShip')).reduce((n,u)=>n+u.s.atk,0);
 const ratio=.1+.00015*layers,old=.05+.00025*layers;
 close(d.s.atk,(1000+total*ratio)*(1.2+.01*layers));
 close(d.s.maxHp,13000*(1.2+.008*layers));
 close(h.unit('u0_a').s.maxHp,2000*(1.2+.008*layers));
 if(layers<500)assert.ok(ratio>old);else if(layers===500)close(ratio,old);else assert.ok(ratio<old);
});
