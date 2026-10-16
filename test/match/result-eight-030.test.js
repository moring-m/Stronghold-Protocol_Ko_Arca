import {test} from 'node:test';
import assert from 'node:assert/strict';
import {compactResult} from '../../server/sim/spec.js';
test('eight-player reports preserve every participant instead of truncating results to four',()=>{
 const perPlayer=Object.fromEntries(Array.from({length:8},(_,i)=>['p_'+i,{total:1,killed:1,leaked:[],perfect:true}]));
 const report=compactResult({reason:'cleared',time:2,total:8,killed:8,perPlayer});
 assert.deepEqual(Object.keys(report.perPlayer),Object.keys(perPlayer));
 assert.equal(report.perPlayer.p_7.killed,1);
});
