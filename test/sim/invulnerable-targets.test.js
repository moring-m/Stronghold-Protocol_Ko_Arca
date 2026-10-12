import {test} from 'node:test';import assert from 'node:assert/strict';import {canTargetEnemy} from '../../server/sim/targeting.js';import {makeBattle,enemyRec} from '../helpers/battleHarness.js';
const enemy={alive:true,hidden:false,deployed:true,isFlying:false,s:{flags:{invulnerable:true}}};
test('invulnerable enemies are outside attack targeting until immunity ends',()=>{assert.equal(canTargetEnemy({},enemy,{}),false);enemy.s.flags.invulnerable=false;assert.equal(canTargetEnemy({},enemy,{}),true);});
test('an invulnerable enemy in range does not trigger attacks or consume attack-SP skills',()=>{
 const h=makeBattle({autoFinish:false,captureNoisy:true,defs:{enemies:{dummy:enemyRec({key:'dummy',hp:1e6,atk:0,speed:0})}},units:[{chessId:'chess_char_1_01_a',row:9,col:5,dir:'RIGHT'}],enemies:[{key:'dummy',pos:[10,7]}]});h.step();const e=h.enemy(),u=h.unit('chess_char_1_01_a');h.b.addBuff(e,{key:'qa-invulnerable',flags:{invulnerable:true},duration:10});h.run(3);assert.equal(u.stats.attacks,0);h.b.removeBuff(e,'qa-invulnerable');h.run(3);assert.ok(u.stats.attacks>0);
});
