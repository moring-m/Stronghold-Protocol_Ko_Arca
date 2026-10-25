import {test} from 'node:test';
import assert from 'node:assert/strict';
import {KitProjectileFx} from '../../public/js/render/vfx/kitprojectilefx.js';
import {emitMotes} from '../../server/sim/content/kits/shared/cetsyrMotes.js';
test('mote state carries available slots, including when no ally can collect one',()=>{
 const events=[],unit={id:7,x:11,y:12,deployedAt:1};
 emitMotes({time:3,fx:(...a)=>events.push(a)},unit,[0,4,3],1.15,30);
 assert.deepEqual(events[0][1].slots,[true,false,true]);
 assert.equal(events[0][1].src,7);
 assert.equal(events[0][1].phase,Math.PI/3);
});
test('official motes use skin projectile, follow owner, disappear and respawn by slot, clean on expiry',()=>{
 const spawned=[],owner={id:7,x:11,y:12,alive:true};
 const w={idx:{projectiles:{projectile_chr_cetsyr_talent:{main:'base',effects:['base']}}},ofx:{active:true,time:2,lib:{has:k=>k==='skin'},spawn:(key,anchor,opts)=>{
  const h={stopped:false,stop(){this.stopped=true;}};spawned.push({key,anchor,opts,h});return h;
 }},unitKeyOf:()=> 'char_4134_cetsyr',projectileOf:()=>({main:'skin'}),effectKey:k=>k};
 const fx=new KitProjectileFx(w),state={slots:[true,false,true],radius:1.15,speed:30,phase:0};
 assert.equal(fx.simFx('moteState',11,12,state,owner),true);
 assert.equal(spawned.length,2);assert.equal(spawned[0].key,'skin');
 const root={anchor:[0,0,0]};spawned[0].opts.track(root);assert.equal(root.anchor[0],2.15);
 owner.x=12;spawned[0].opts.track(root);assert.equal(root.anchor[0],3.15);
 fx.simFx('moteState',12,12,{...state,slots:[false,true,true]},owner);
 assert.equal(spawned[0].h.stopped,true);assert.equal(spawned.length,3);
 w.ofx.time=3;fx.tick();assert.equal(fx.motes.size,0);assert.ok(spawned.every(s=>s.h.stopped));
});
test('carrier orbit resolves caster skin and follows the carrier rather than caster',()=>{
 const caster={id:1,x:10,y:10},carrier={id:2,x:13,y:11},spawned=[];
 const w={idx:{projectiles:{projectile_chr_reed2_fire:{main:'fire'}}},view:id=>id===2?carrier:caster,unitKeyOf:()=> 'char_1020_reed2',projectileOf:(p,v)=>{assert.equal(v,caster);return p;},effectKey:k=>k,
 ofx:{active:true,time:0,lib:{has:()=>true},spawn:(key,anchor,opts)=>{const h={stop(){this.stopped=true;}};spawned.push({opts,h});return h;}}};
 const fx=new KitProjectileFx(w);
 fx.simFx('orbitProjectile',carrier.x,carrier.y,{id:2,src:1,projectile:'projectile_chr_reed2_fire',slots:[true,true,true],radius:1,phase:0,speed:150},caster);
 assert.equal(spawned.length,3);const root={anchor:[0,0,0]};spawned[0].opts.track(root);assert.equal(root.anchor[0],4);
 carrier.x=14;spawned[0].opts.track(root);assert.equal(root.anchor[0],5);
 fx.simFx('orbitProjectile',carrier.x,carrier.y,{id:2,src:1,projectile:'projectile_chr_reed2_fire',slots:[]},caster);
 assert.ok(spawned.every(s=>s.h.stopped));
});
for(const defId of ['chess_char_4_25_a','chess_char_4_25_b','chess_char_5_09_a','chess_char_5_09_b'])test(`${defId}: Civilight motes use the official model attachment without persistent particle emitters`,()=>{
 const states=[],owner={info:{defId},setMoteState:s=>states.push(s)};
 const w={unitKeyOf:()=> 'char_4134_cetsyr',ofx:{active:true,spawn:()=>assert.fail('persistent particle emitter')}};
 const fx=new KitProjectileFx(w),state={slots:[true,false,true],radius:1.15,phase:0};
 for(let i=0;i<1000;i++)assert.equal(fx.simFx('moteState',0,0,state,owner),true);
 assert.equal(states.length,1000);assert.equal(fx.motes.size,0);assert.deepEqual(states[0].slots,state.slots);
});
