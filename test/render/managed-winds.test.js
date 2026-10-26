import test from 'node:test';import assert from 'node:assert/strict';import {WindFx} from '../../public/js/render/vfx/windfx.js';import {FxWiring} from '../../public/js/render/vfx/wiring.js';
test('three moving winds retain separate official handles, turn, hit and end independently',()=>{
 const spawned=[],hits=[],owner={id:1};const w={idx:{projectiles:{projectile_chr_heyak_s3:{main:'heyak_skill_03_trail_01',movement:{speed:1}}}},projectileOf:p=>p,effectKey:k=>k,view:()=>null,playOn:(...a)=>(hits.push(a),{}),ofx:{active:true,time:0,lib:{has:()=>true},spawn:(key,place,opts)=>{const h={key,place,opts,stop(){this.stopped=true;}};spawned.push(h);return h;}}};
 const wind=new WindFx(w);for(let i=0;i<3;i++)assert.equal(wind.simFx('tornado',5,10+i,{id:1,windId:i,dc:1,dr:0,skill:'heyak:wind'},owner),true);
 assert.equal(spawned.length,3);w.ofx.time=.25;const fx={anchor:[]};spawned[0].opts.track(fx);assert.equal(fx.anchor[0],-4.75);
 wind.simFx('tornado',5.5,10,{id:1,windId:0,dc:0,dr:1,skill:'heyak:wind'},null);assert.equal(spawned.length,3,'existing winds survive departure of their owner');w.ofx.time=.5;spawned[0].opts.track(fx);assert.equal(fx.yaw,Math.PI/2);
 wind.simFx('tornadoPulse',5.5,10,{id:1,windId:0,skill:'heyak:wind'},null);assert.equal(hits[0][0],'heyak_skill_03_hit_01');
 wind.simFx('tornado',5.5,10,{id:1,windId:0,phase:'end',skill:'heyak:wind'},null);assert.equal(wind.live.size,2);assert.equal(spawned[0].stopped,true);assert.equal(hits[1][0],'heyak_skill_03_trail_01_end');w.ofx.time=2;wind.tick();assert.equal(wind.live.size,0);
});
test('Clemen(tia) fallback is restricted to the two unavailable S2 visuals',()=>{
 const owner={id:1};const w=new FxWiring({});w.view=()=>owner;w.unitKeyOf=()=> 'char_4231_clemnt';w.skills.of=()=>({skillId:'skchr_clemnt_2'});
 for(const kind of ['anchor','tide'])assert.equal(w.simpleEvent(kind,{id:1}),true);
 assert.equal(w.simpleEvent('aoe',{id:1}),false);w.skills.of=()=>({skillId:'skchr_clemnt_3'});assert.equal(w.simpleEvent('tide',{id:1}),false);
});
test('Clementia fallback follows the battle clock and removes its indicators on skill end',async()=>{
 const {FxSystem}=await import('../../public/js/render/fx.js');const fx=Object.create(FxSystem.prototype),made=[];
 Object.assign(fx,{ctx:{timeScale:()=>2},zones:[],_groundZ:()=>0,_aura(){},zone(...args){made.push(args);},_freeZone(z){z.freed=true;}});
 fx._simFx('anchor',6,10,{id:1,skill:'clemnt:cabin',fromX:4,fromY:10,dur:2});assert.equal(made[0][5],1);assert.equal(made[0][8].vx,2);
 fx._simFx('tide',6,10,{id:1,skill:'clemnt:cabin',r:1,dur:8});assert.equal(made[1][5],4);
 const cabin={key:'clemnt-cabin:1'},vortex={key:'clemnt-vortex:1'},other={key:'other'};fx.zones=[cabin,vortex,other];fx._skill({id:1},false);assert.deepEqual(fx.zones,[other]);assert.ok(cabin.freed&&vortex.freed);
});
test('Clementia S2 draws the official cabin along its path and the vortex until the skill ends',async()=>{
 const {ClemntFx}=await import('../../public/js/render/vfx/clemntfx.js');
 const spawned=[],owner={id:1},has=new Set(['clemnt_skill_02_bullet_01','clemnt_skill_02_bullet_02','clemnt_skill_02_bullet_range_01']);
 const w={ofx:{active:true,time:0,lib:{has:k=>has.has(k)},spawn:(key,place,opts)=>{const h={key,place,opts,stop(){this.stopped=true;}};spawned.push(h);return h;}}};
 const c=new ClemntFx(w);
 assert.equal(c.simFx('anchor',4,10,{id:1,skill:'clemnt:cabin',fromX:7,fromY:10,dur:1.5},owner),true);
 assert.equal(spawned[0].key,'clemnt_skill_02_bullet_01','side view for a horizontal path');
 const fx={anchor:[]};w.ofx.time=.75;spawned[0].opts.track(fx);assert.deepEqual(fx.anchor,[-4.5,1,0]);assert.equal(fx.yaw,Math.PI,'leftward');
 assert.equal(c.simFx('anchor',7,13,{id:2,skill:'clemnt:cabin',fromX:7,fromY:10,dur:1.5},owner),true);assert.equal(spawned[1].key,'clemnt_skill_02_bullet_02');
 assert.equal(c.simFx('tide',4,10,{id:1,skill:'clemnt:cabin',r:1.5,dur:10},owner),true);
 assert.equal(spawned[0].stopped,true,'the cabin gives way to the vortex');assert.equal(spawned[2].key,'clemnt_skill_02_bullet_range_01');assert.deepEqual(spawned[2].place.pos,[-6,1,0]);
 c.skillOff(1);assert.equal(spawned[2].stopped,true);assert.equal(c.live.size,1);
 w.ofx.time=5;c.tick();assert.equal(c.live.size,0);
 has.clear();assert.equal(c.simFx('tide',4,10,{id:1,skill:'clemnt:cabin',dur:1},owner),false,'without the prefabs the procedural zones stay');
 assert.equal(c.simFx('aoe',4,10,{id:1,skill:'clemnt:cabin'},owner),false);
});
