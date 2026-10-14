import {test} from 'node:test';import assert from 'node:assert/strict';
import {makeBattle,chessRec,enemyRec} from '../helpers/battleHarness.js';
test('raid relocation restores critically low HP before landing and never records a death',()=>{
 const h=makeBattle({autoFinish:false,hooks:['deploy','death'],defs:{chess:{op:chessRec({id:'op',bonds:['raidShip'],stats:{maxHp:1000,atk:100,def:100,bat:1,block:1}})},enemies:{dummy:enemyRec({key:'dummy',hp:1e9,speed:0,atk:0})}},bonds:{raidShip:{count:2,active:true,tier:1,layers:0}},units:[{chessId:'op',row:12,col:3}],enemies:[{key:'dummy',pos:[9,9]}]});
 const u=h.unit('op');u.hp=.01;const seq=u.deploySeq;assert.ok(h.runUntil(()=>u.deploySeq>seq,12));assert.ok(u.alive&&u.deployed);assert.equal(u.hp,u.s.maxHp);assert.equal(u.stats.deaths,0);assert.ok(h.hooksOf('death').every(c=>c.reason==='raid'));assert.equal(h.b.errorCount,0);
});
