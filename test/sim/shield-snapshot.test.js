import {test} from 'node:test';import assert from 'node:assert/strict';
import {makeBattle,chessRec} from '../helpers/battleHarness.js';
test('snapshot sends remaining HP shield sum and clears it on absorption; hit-count shields have no fake HP',()=>{
 const h=makeBattle({defs:{chess:{guard:chessRec({id:'guard',skill:null})}},units:[{chessId:'guard',row:10,col:3}],autoFinish:false});h.run(1);const u=h.unit('guard');
 h.b.addBuff(u,{key:'first',shield:200});h.b.addBuff(u,{key:'second',shield:300});assert.deepEqual(h.b.snapshot().shields,[[u.id,500,1]]);
 h.b.dealDamage(null,u,{amount:150,type:'true'});assert.deepEqual(h.b.snapshot().shields,[[u.id,350,1]]);
 h.b.dealDamage(null,u,{amount:400,type:'true'});assert.equal(h.b.snapshot().shields,undefined);
 h.b.addBuff(u,{key:'negation',shieldHits:3});assert.equal(h.b.snapshot().shields,undefined);
 // a magic- / physical-only 屏障 is up (its effect shows) but adds nothing to the HP bar
 h.b.addBuff(u,{key:'arts',shield:250,shieldType:'arts'});assert.deepEqual(h.b.snapshot().shields,[[u.id,0,1]]);
});
