import {test} from 'node:test';
import assert from 'node:assert/strict';
import {makeBattle,enemyRec} from '../helpers/battleHarness.js';
const build=()=>makeBattle({defs:{enemies:{f:enemyRec({key:'f',hp:100000,speed:0,motion:'FLY'})}},units:[{chessId:'chess_char_1_08_a',row:10,col:5,carryState:{sp:999}}],enemies:[{key:'f',pos:[10,6]}],hooks:['damaged','skillStart'],captureNoisy:true,autoFinish:false,timeLimit:30});
const hits=h=>h.hooksOf('damaged').filter(c=>c.dmg?.tags?.includes('swordRain'));
test('Texas Sword Rain starts two arts strikes at about one second, including air units',()=>{
 const h=build();assert.ok(h.runUntil(()=>h.hooksOf('skillStart').length>0,5));h.run(.9);assert.equal(hits(h).length,0);h.run(.2);
 const d=hits(h);assert.equal(d.length,2);assert.ok(d.every(c=>c.type==='arts'));
 assert.ok(d[1].t>d[0].t);assert.ok(d[1].t-d[0].t<=.05);
 assert.ok(h.unit('chess_char_1_08_a').s.flags.disarm,'recovery is preserved after impact');
});
test('sleep before Sword Rain impact cancels both strikes',()=>{
 const h=build();assert.ok(h.runUntil(()=>h.hooksOf('skillStart').length>0,5));h.b.applyStatus(h.unit('chess_char_1_08_a'),'sleep',{duration:3});h.run(1.3);assert.equal(hits(h).length,0);
});
