import {test} from 'node:test';
import assert from 'node:assert/strict';
import {makeMatch} from './harness.js';
import {PHASE} from '../../shared/constants.js';
test('boss and hidden clocks, start messages and overtime use 1×; normal combat stays 2×',()=>{
 const h=makeMatch({fake:true,instant:false});const m=h.m;
 for(const [phase,speed]of [[PHASE.COMBAT,2],[PHASE.UNITE,2],[PHASE.FINAL_ASSAULT,1],[PHASE.HIDDEN_CORE,1]]){
  m.phase=phase;assert.equal(m.gameSpeed,speed);
  const f={cc:true,fieldId:'f',kind:speed===1?'boss':'normal',players:['p_0'],battleId:'b',spec:{timeLimit:100},startAt:h.sched.now()-10000,done:false,mode:'client',authority:'p_0'};
  assert.equal(m._fieldElapsed(f),10*speed);assert.equal(m._startMsg(f,'p_0').speed,speed);assert.equal(m._startMsg(f,'spectator',{watch:true}).speed,speed);
 }
 assert.equal(m.gd.bossOvertimeDue(150),0);assert.equal(m.gd.bossOvertimeDue(151),1);assert.equal(m.gd.bossOvertimeDue(160),10);
 m.gameSpeed=20;assert.equal(m.gameSpeed,20,'explicit acceleration remains available for tools');m.dispose();
});

test('custom boss speed doubles simulation and countdown time while overtime uses game seconds',()=>{
 const h=makeMatch({fake:true,instant:false,customExtensions:{ruleValues:{bossBattleSpeed:2}}});const m=h.m;
 m.phase=PHASE.FINAL_ASSAULT;
 assert.equal(m.gameSpeed,2);assert.equal(m.gd.bossTimeScale,2);
 const f={cc:true,fieldId:'boss',kind:'boss',players:['p_0'],battleId:'b',spec:{timeLimit:100},startAt:h.sched.now()-10000,done:false,mode:'client',authority:'p_0'};
 assert.equal(m._fieldElapsed(f),20);assert.equal(m._startMsg(f,'p_0').speed,2);
 assert.equal(m.gd.bossOvertimeDue(151),1,'one game second after threshold');
 m.dispose();
});
