import{test}from'node:test';import assert from'node:assert/strict';
import{loadData}from'../../server/data.js';import{makeBattle}from'../helpers/battleHarness.js';
const data=loadData(new URL('../../content/production/data/',import.meta.url).pathname);
for(const chessId of ['chess_char_4_25_a','chess_char_5_09_a'])test(`${chessId}: emits available orbit slots without collision targets`,()=>{
 const h=makeBattle({data,autoFinish:false,timeLimit:4,units:[{chessId,row:10,col:5}]});h.run(1);
 const events=h.eventsOf('fx').filter(e=>e[1]==='moteState');
 assert.ok(events.length>0);assert.deepEqual(events[0][4].slots,[true,true,true]);
 assert.equal(events[0][4].src,h.unit(chessId).id);assert.deepEqual(h.b.errors,[]);
});
