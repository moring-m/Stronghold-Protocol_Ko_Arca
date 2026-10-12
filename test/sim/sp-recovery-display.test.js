import {test}from 'node:test';import assert from 'node:assert/strict';import{makeBattle,chessRec}from '../helpers/battleHarness.js';
const rec=chessRec({id:'recovery',skill:{kind:'duration',spType:'time',spCost:10,initSp:0,duration:5,trigger:{rule:'MANUAL'}},stats:{atk:100,maxHp:1000}});
test('SP recovery effects announce actual restored SP, excluding passive recharge and capped overflow',()=>{
 const h=makeBattle({defs:{chess:{recovery:rec}},units:[{chessId:'recovery',row:10,col:3}],autoFinish:false});h.step();const u=h.unit('recovery');assert.ok(u.skill);
 u.skill.sp=0;u.skill.charges=0;h.b.drainEvents();u.skill.gainSp(4,'talent');
 let ev=h.b.drainEvents().filter(e=>e[0]==='fx'&&e[1]==='spRecovered');assert.equal(ev.length,1);assert.equal(ev[0][4].n,4);
 u.skill.gainSp(20,'item');ev=h.b.drainEvents().filter(e=>e[0]==='fx'&&e[1]==='spRecovered');assert.equal(ev[0][4].n,6);
 u.skill.gainSp(5,'talent');assert.ok(!h.b.drainEvents().some(e=>e[1]==='spRecovered'));
 u.skill.sp=0;u.skill.charges=0;u.skill.gainSp(.1,'time');assert.ok(!h.b.drainEvents().some(e=>e[1]==='spRecovered'));
});
