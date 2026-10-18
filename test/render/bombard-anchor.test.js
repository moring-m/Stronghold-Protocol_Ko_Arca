import {test} from 'node:test';
import assert from 'node:assert/strict';
import {bombardAnchor} from '../../public/js/render/vfx/bombardAnchor.js';
test('official drone aim follows, retargets and locks at the simulation point',()=>{
 let time=0;const a={x:1,y:2,alive:true},b={x:4,y:5,alive:true};
 const aim=bombardAnchor(0,0,'a',id=>({a,b})[id],()=>time,2);
 assert.equal(aim.x,1);a.x=3;assert.equal(aim.x,3);
 aim.update({x:4,y:5,target:'b'});b.y=7;assert.equal(aim.y,7);
 aim.update({x:8,y:9,target:null});b.y=10;assert.equal(aim.y,9);assert.equal(aim.x,8);
});
test('aim has a fallback deadline if the explicit lock event is late',()=>{
 let time=0;const v={x:1,y:2};const aim=bombardAnchor(0,0,'v',()=>v,()=>time,1);
 assert.equal(aim.x,1);time=1;assert.equal(aim.x,1);v.x=8;assert.equal(aim.x,1);
});
