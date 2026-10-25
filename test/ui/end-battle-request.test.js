import test from 'node:test';import assert from 'node:assert/strict';
import {endBattleFields} from '../../public/js/ui/endBattleRequest.js';
import {validateC2S} from '../../shared/protocol.js';
test('surrender reads a real b.snap game time, never its message type',()=>{
 const snap={t:'b.snap',fieldId:'normal-p1',gt:12.367,units:[]};
 assert.equal(validateC2S({t:'g.endBattle',fieldId:snap.fieldId,gt:snap.t}),'bad field gt');
 const fields=endBattleFields(snap.fieldId,snap);assert.deepEqual(fields,{fieldId:snap.fieldId,gt:12.367});
 assert.equal(validateC2S({t:'g.endBattle',...fields}),null);
});
test('a missing or invalid snapshot time does not prevent surrender',()=>{
 for(const gt of [undefined,null,NaN,Infinity,-1,3701,'b.snap','3']){
  const fields=endBattleFields('normal-p1',{t:'b.snap',gt});assert.deepEqual(fields,{fieldId:'normal-p1'});assert.equal(validateC2S({t:'g.endBattle',...fields}),null);
 }
 for(const gt of [0,3700])assert.equal(endBattleFields('normal-p1',{t:'b.snap',gt}).gt,gt);
 assert.deepEqual(endBattleFields('normal-p1',null),{fieldId:'normal-p1'});
});
