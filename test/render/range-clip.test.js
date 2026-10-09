import {test} from 'node:test';
import assert from 'node:assert/strict';
import {rangeTileInside,clipRangeSegment} from '../../public/js/render/rangeClip.js';
import {GEO} from '../../shared/constants.js';
test('range tiles stay inside each combat field, excluding bench and background',()=>{
 for(const r of [GEO.NORMAL_RECT,GEO.UNITE_RECT,GEO.BOSS_RECT]){
  assert.equal(rangeTileInside(r,r.r0,r.c0),true);
  assert.equal(rangeTileInside(r,r.r1+1,r.c0),false);
  assert.equal(rangeTileInside(r,r.r0,r.c1+1),false);
 }
});
test('world-space circular and rectangular outline segments clip at the real tile edge',()=>{
 const r=GEO.NORMAL_RECT;
 assert.deepEqual(clipRangeSegment(r,-5,10,20,10),[-.5,10,10.5,10]);
 assert.equal(clipRangeSegment(r,-5,8,20,8),null);
 assert.deepEqual(clipRangeSegment(r,5,0,5,20),[5,8.5,5,12.5]);
 assert.deepEqual(clipRangeSegment(r,2,10,3,11),[2,10,3,11]);
});
