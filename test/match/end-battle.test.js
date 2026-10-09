import {test} from 'node:test';
import assert from 'node:assert/strict';
import {makeMatch} from './harness.js';
function combat(humans=1){const h=makeMatch({mode:humans>1?'coop':'solo',humans,seed:71,clientCombat:true,clients:false,instant:false}).start();h.toPrep(1);for(const p of h.m.alivePlayers())h.m.handle(p.playerId,{t:'g.ready',ready:true});h.runToPhase('COMBAT',1);return h;}
test('end battle resolves the own field immediately and stale client reports cannot overwrite it',()=>{
 const h=combat();const f=h.m.fields.find(f=>f.players.includes('p_0'));
 assert.deepEqual(h.m.handle('p_0',{t:'g.endBattle',fieldId:f.fieldId}),{ok:true});
 h.run(()=>f.done,{maxSteps:10000});assert.equal(f.done,true);assert.equal(f.resultSource,'server');assert.ok(f.result.time<1);
 assert.deepEqual(h.m.handle('p_0',{t:'g.endBattle',fieldId:'foreign'}).error,'WRONG_PHASE');
});
test('a player cannot stop a teammate field',()=>{
 const h=combat(2);const f=h.m.fields.find(f=>f.players.includes('p_1'));
 assert.ok(h.m.handle('p_0',{t:'g.endBattle',fieldId:f.fieldId}).error);assert.equal(f.done,false);
});
test('shared field requires every human vote',()=>{
 const h=combat(2);const f=h.m.fields[0];f.players=['p_0','p_1'];
 assert.deepEqual(h.m.handle('p_0',{t:'g.endBattle',fieldId:f.fieldId}),{ok:true});assert.equal(f.done,false);assert.equal(f.endRequested,undefined);
 assert.deepEqual([...f.endVotes],['p_0']);
 assert.deepEqual(h.m.handle('p_1',{t:'g.endBattle',fieldId:f.fieldId}),{ok:true});
 h.run(()=>f.done,{maxSteps:10000});assert.equal(f.done,true);
});

test('boss fight requires the whole human team to agree before forcing its end',()=>{
 const h=combat(2);h.m.phase='FINAL_ASSAULT';for(const f of h.m.fields)f.kind='boss';
 const calls=[];h.m._endFinal=reason=>calls.push(reason);
 h.m.handle('p_0',{t:'g.endBattle',fieldId:h.m.fields[0].fieldId});assert.deepEqual(calls,[]);
 h.m.handle('p_1',{t:'g.endBattle',fieldId:h.m.fields[1].fieldId});assert.deepEqual(calls,['forced']);
});

test('pending shared termination is reevaluated when a nonvoter leaves',()=>{
 const h=combat(2);const f=h.m.fields[0];f.players=['p_0','p_1'];
 h.m.handle('p_0',{t:'g.endBattle',fieldId:f.fieldId});
 assert.equal(f.endRequested,undefined);
 h.m.onLeave('p_1');
 h.run(()=>f.done,{maxSteps:10000});assert.equal(f.done,true);
});
