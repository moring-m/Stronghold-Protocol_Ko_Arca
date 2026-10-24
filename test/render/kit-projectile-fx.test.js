import test from 'node:test';
import assert from 'node:assert/strict';
import {KitProjectileFx} from '../../public/js/render/vfx/kitprojectilefx.js';
function fixture(id){
 const spawned=[],owner={id:1,x:4,y:10},w={skinOf:()=>null,unitOf:()=>null,pose:v=>v,playOn:()=>({}),unitKeyOf:()=>id,effectKey:k=>k,projectileOf:p=>p,idx:{projectiles:{
 projectile_chr_jesca2_s3_bomb:{main:'jesca2_skill_03_trail_02',onStop:['jesca2_skill_03_hit_02']},
 projectile_chr_thorn2_s2:{onReached:['thorn2_token_start','thorn2_skill_02_token'],effects:['thorn2_token_start','thorn2_skill_02_token','thorn2_skill_02_range']},
 projectile_chr_lemuen_s3_attack:{main:'lemuen_skill_03_trail_02',effects:['lemuen_skill_03_trail_02','lemuen_skill_03_hit_01']},
 }},ofx:{active:true,time:0,lib:{has:()=>true},spawn(key,place,opts){const h={key,place,opts,stop(){this.stopped=true;}};spawned.push(h);return h;}}};
 return {fx:new KitProjectileFx(w),w,owner,spawned};
}
test('Thorns S2 updates one keyed official token and expands only its ground ring',()=>{
 const {fx,w,owner,spawned}=fixture('char_1039_thorn2');const e={key:'thorn2:1:1',duration:5,r:1.1,baseRadius:1.1,grow:.1,vx:.2,vy:0};
 assert.equal(fx.simFx('zone',4,10,e,owner),true);assert.equal(spawned.length,3);
 w.ofx.time=.5;const f={anchor:[],rootScale:1};spawned[1].opts.track(f);assert.equal(f.anchor[0],-5.9);assert.equal(f.rootScale,1);
 const ring={anchor:[]};spawned[2].opts.track(ring);assert.ok(Math.abs(ring.rootScale-1.15/1.1)<1e-9);
 w.ofx.time=1;fx.simFx('zone',4.2,10,{...e,duration:4,r:1.2},owner);assert.equal(spawned.length,3);
 w.ofx.time=5;fx.tick();assert.equal(fx.zones.size,0);assert.ok(spawned.every(h=>h.stopped));
});
test('separate casts coexist and missing token art preserves the procedural fallback',()=>{
 const {fx,w,owner}=fixture('char_1039_thorn2');const e={key:'thorn2:1:1',duration:5,r:1};
 fx.simFx('zone',4,10,e,owner);fx.simFx('zone',5,10,{...e,key:'thorn2:1:2'},owner);assert.equal(fx.zones.size,2);
 fx.clear();w.ofx.lib.has=k=>!k.endsWith('02_token');assert.equal(fx.simFx('zone',4,10,e,owner),false);assert.equal(fx.zones.size,0);
});
test('Lemuen shell follows world vertical flight for the simulation duration and ends before impact art',()=>{
 const {fx,w,owner,spawned}=fixture('char_4193_lemuen');assert.equal(fx.simFx('bombardShell',4,10,{t:.3},owner),true);
 assert.equal(spawned[0].key,'lemuen_skill_03_trail_02');w.ofx.time=.15;const f={anchor:[],def:{clips:[{length:.27}]}};spawned[0].opts.track(f);assert.deepEqual(f.anchor,[-6,1,0]);assert.equal(f.pitch,undefined);assert.ok(Math.abs(f.speed-.9)<1e-9);
 w.ofx.time=.3;fx.tick();assert.ok(spawned[0].stopped);assert.equal(fx.shells.size,0);
});
test('preloads dedicated projectile components and never claims unrelated operators or simplified mode',()=>{
 const {fx,w,owner}=fixture('char_4193_lemuen');assert.ok([...fx.keys([owner])].includes('lemuen_skill_03_trail_02'));
 w.ofx.active=false;assert.equal(fx.simFx('bombardShell',4,10,{t:.3},owner),false);w.ofx.active=true;w.unitKeyOf=()=> 'other';assert.equal(fx.simFx('bombardShell',4,10,{t:.3},owner),false);
});

test('Jessica S3 collision immediately stops its own shell and plays the official impact',()=>{
 const {fx,w,owner,spawned}=fixture('char_1034_jesca2'),hits=[];w.playOn=(k,v)=>{hits.push([k,v]);return {};};
 assert.equal(fx.simFx('bombardShell',8,10,{id:1,shellId:1,t:1,fromX:4,fromY:10},owner),true);
 w.ofx.time=.25;const f={anchor:[]};spawned[0].opts.track(f);assert.equal(f.anchor[0],-5);
 assert.equal(fx.simFx('bombard',5,10,{id:1,shellId:1},owner),true);assert.ok(spawned[0].stopped);assert.equal(fx.bombs.size,0);
 assert.equal(hits[0][0],'jesca2_skill_03_hit_02');assert.equal(hits[0][1].x,5);
});

test('conditional teleport and death explosions preload only their event-bound official effects',async()=>{
 const {FX_BINDINGS,bindingKeys}=await import('../../public/js/render/vfx/skills.js');
 assert.deepEqual(bindingKeys({},'skchr_yu_2'),['yu_skill2_teleport_02']);
 assert.deepEqual(bindingKeys({},'skchr_reed2_3'),['reed2_debuff_boom_01']);
 assert.equal(FX_BINDINGS.skchr_yu_2.teleport.owner,'src');
 assert.equal(FX_BINDINGS.skchr_reed2_3.scorchBurst.at,'point');
 assert.equal(FX_BINDINGS.skchr_reed2_3.scorchBurst.oneshot,true);
});

test('costume suffixes preserve token/range roles and never turn the start splash into a loop',()=>{
 const {fx,w,owner,spawned}=fixture('char_1039_thorn2');w.projectileOf=p=>({...p,onReached:p.onReached.map(k=>k+'_marthe#9'),effects:p.effects.map(k=>k+'_marthe#9')});
 assert.equal(fx.simFx('zone',4,10,{id:1,key:'thorn2:1:1',duration:5,r:1.1},owner),true);
 assert.equal(spawned.length,3);assert.equal(spawned[0].opts.loop,false);assert.equal(spawned[1].opts.loop,true);
 assert.ok(spawned[2].key.endsWith('_range_marthe#9'));
});
