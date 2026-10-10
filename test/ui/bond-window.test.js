import {test} from 'node:test';import assert from 'node:assert/strict';
import {bondWindowSize} from '../../public/js/ui/bondStrip.js';
test('12 bonds fit completely, 13 and above expose 11 full cells and exactly half the next cell',()=>{
 const full=bondWindowSize(12,1014,84,8,1400,68);assert.equal(full.overflow,false);assert.equal(full.width,1014);assert.equal(full.scale,1);
 for(const n of [13,16,25]){const s=bondWindowSize(n,n*84+6,84,8,1400,68);assert.equal(s.overflow,true);assert.equal(s.width,8+11*84+34);assert.equal(s.fadeWidth,34);assert.ok(s.contentWidth>s.width);}
});
test('narrow screens preserve the same eleven-and-a-half-cell window instead of squeezing every bond into one row',()=>{
 const s=bondWindowSize(20,1686,84,8,370,68);assert.equal(s.width,370);assert.ok(Math.abs(s.width/s.scale-(8+11*84+34))<1e-9);assert.ok(s.contentWidth>370);
});
