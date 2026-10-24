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

test('Imperial shell uses its authored target-attached fall, not a second drone-to-target flight',async()=>{
 const {FxWiring}=await import('../../public/js/render/vfx/wiring.js');
 const ofx={time:10,active:true,lib:{def:()=>({clips:[{length:.266667}],fxDelay:new Map([[0,2.75]]),mainYaw:Math.PI/2})},spawn:(key,place,opts)=>spawned.push({key,place,opts})},spawned=[],arrivals=[],aim={stopped:false,stop(){this.stopped=true}};
 const w={ofx,playOn:()=>aim,_arrive:(...args)=>arrivals.push(args)};
 const target={x:12,y:11,z:0},proj={main:'enemy_emppnt_attack_01_trail',toTargetOnStart:['aim']};
 FxWiring.prototype._imperialBombard.call(w,proj,{x:9,y:10},target,{t:3,fall:.44});
 assert.equal(spawned.length,0);assert.ok(Math.abs(ofx.timers[0].at-12.56)<1e-9);
 target.x=13;target.y=12;ofx.time=12.56;ofx.timers[0].fn();
 assert.deepEqual(spawned[0].place.pos,[3,3,-0]);assert.deepEqual(spawned[0].place.rootRot,[0,0,0,1]);assert.equal(spawned[0].place.yaw,Math.PI/2);
 assert.ok(Math.abs(spawned[0].opts.speed*.44-.266667)<1e-9);
 assert.ok(Math.abs(spawned[0].opts.skip*spawned[0].opts.speed-2.75)<1e-9);
 ofx.time=13;ofx.timers[1].fn();assert.equal(aim.stopped,true);assert.deepEqual(arrivals[0][2],[3,3,-0]);
});
