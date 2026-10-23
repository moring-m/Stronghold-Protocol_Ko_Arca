import test from 'node:test';import assert from 'node:assert/strict';
import {FxWiring} from '../../public/js/render/vfx/wiring.js';
function fixture(){
 const owner={id:1,alive:true,info:{spine:'char_1050_chen3'},x:4,y:10},spawned=[];
 const index={units:{},projectiles:{projectile_chr_chen3_s3:{main:'chen3_skill_03_trail_01',movement:{speed:1.5}}},prefabs:{chen3_skill_03_trail_01:{}}};
 const ofx={active:true,time:0,timers:[],lib:{has:key=>!!index.prefabs[key]},spawn:(key,place,opts)=>{const h={key,place,opts,stopped:false,stop(){this.stopped=true;}};spawned.push(h);return h;}};
 const w=new FxWiring(ofx,{view:id=>id===1?owner:null});w.idx=index;w.hasOfficialUnit=()=>true;w.projectileOf=p=>p;w.effectKey=k=>k;
 return {w,ofx,owner,spawned};
}
test('official Chen sword wave reuses one real prefab and follows reported position and turns',()=>{
 const {w,ofx,spawned}=fixture();assert.equal(w.simFx('chen3Wave',4,10,{id:1,dr:0,dc:1}),true);assert.equal(spawned.length,1);const h=spawned[0],fx={anchor:[0,0,0]};
 assert.equal(h.key,'chen3_skill_03_trail_01');assert.equal(h.opts.loop,true);ofx.time=.06;h.opts.track(fx);assert.ok(Math.abs(fx.anchor[0]+5.91)<1e-8);assert.equal(fx.anchor[1],1);assert.equal(fx.yaw,0);
 ofx.time=.12;assert.equal(w.simFx('chen3Wave',4.18,10,{id:1,dr:1,dc:0}),true);assert.equal(spawned.length,1);ofx.time=.18;h.opts.track(fx);assert.equal(fx.anchor[0],4.18-10);assert.ok(Math.abs(fx.anchor[1]-1.09)<1e-8);assert.equal(fx.yaw,Math.PI/2);assert.equal(fx.anchor[2],0);
});
test('wave stops at skill end, withdrawal, stale updates and render reset',()=>{
 for(const stop of ['skill','release','timeout','clear']){
  const {w,ofx,owner,spawned}=fixture();w.simFx('chen3Wave',4,10,{id:1,dr:0,dc:1});
  if(stop==='skill'){w.skills.skill=()=>false;w.talents.skill=()=>{};w.funnels.skill=()=>{};w.skill(owner,false);}
  if(stop==='release')w.release(owner);
  if(stop==='timeout'){ofx.time=.6;w.tick();}
  if(stop==='clear')w.clear();
  assert.equal(spawned[0].stopped,true,stop);assert.equal(w.chenWaves.size,0,stop);
 }
});
test('simple mode does not consume the procedural wave event',()=>{const {w,ofx,spawned}=fixture();ofx.active=false;w.skills.simFx=()=>false;w.talents.fx=()=>false;w.funnels.simFx=()=>false;assert.equal(w.simFx('chen3Wave',4,10,{id:1,dr:0,dc:1}),false);assert.equal(spawned.length,0);});
