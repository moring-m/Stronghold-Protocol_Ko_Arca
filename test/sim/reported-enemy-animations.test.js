import {test} from 'node:test';import assert from 'node:assert/strict';
import {makeBattle,chessRec} from '../helpers/battleHarness.js';
import {attackWindup} from '../../shared/attackTiming.js';
const wall=chessRec({id:'animation_wall',profession:'TANK',stats:{atk:0,maxHp:1e7,def:0,res:0,blockCnt:3},skill:null});
function arena(key){return makeBattle({autoFinish:false,timeLimit:60,defs:{chess:{animation_wall:wall}},units:[{chessId:'animation_wall',row:10,col:5}],enemies:[{key,pos:[10,5]}],captureNoisy:true});}
test('Big Bob has a full heavy-swing windup before HP changes, without changing his six-second interval',()=>{
 const h=arena('enemy_1001_bigbo');h.step();const e=h.enemies()[0],u=h.unit('animation_wall');
 assert.ok(Math.abs(attackWindup(e)-.733)<.001);assert.equal(e.s.interval,6);
 assert.ok(h.runUntil(()=>e.mem.attackWindup,5));const hp=u.hp,until=e.mem.attackWindup.until;
 h.run(.5);assert.equal(u.hp,hp);assert.ok(h.runUntil(()=>h.b.time>=until+.05,2));assert.ok(u.hp<hp);assert.equal(h.b.errorCount,0);
});
test('barrel recommender switches permanently to its empty-barrel form after the first unsilenced attack',()=>{
 const h=arena('enemy_10044_wintun');assert.ok(h.runUntil(()=>h.enemies()[0]?.form==='emptied',15));
 const e=h.enemies()[0];assert.ok(Math.abs(attackWindup(e)-.467)<.001);assert.ok(h.eventsOf('fx').some(x=>x[1]==='phase'&&x[4].form==='emptied'));
 h.run(8);assert.equal(e.form,'emptied');assert.equal(h.eventsOf('fx').filter(x=>x[1]==='zone'&&x[4].kind==='barrel').length,1);assert.equal(h.b.errorCount,0);
});
test('cathedral swordsman plays one ammunition-consumption gesture per enhancement and stops at five stacks',()=>{
 const h=arena('enemy_10087_hlchgr');h.step();const e=h.enemies()[0],atk=e.s.atk,speed=e.s.moveSpeed;
 h.run(6.1);assert.ok(e.s.atk>atk);assert.ok(e.buffs.find(b=>b.key==='ab:enhance').mods.moveFlat>0);
 const fx=h.eventsOf('fx').filter(x=>x[1]==='enemySkill'&&x[4].id===e.id);assert.equal(fx.length,1);assert.equal(fx[0][4].clip,'Skill');assert.equal(fx[0][4].dur,1);
 h.run(31);assert.equal(h.eventsOf('fx').filter(x=>x[1]==='enemySkill'&&x[4].id===e.id).length,5);assert.equal(h.b.errorCount,0);
});
