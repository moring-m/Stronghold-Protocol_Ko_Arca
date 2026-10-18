import{test}from'node:test';import assert from'node:assert/strict';import{OfficialFx}from'../../public/js/render/vfx/system.js';import{FxWiring}from'../../public/js/render/vfx/wiring.js';
test('battle clear discards prepared shield geometry before preparation stops the effects clock',()=>{
 const fx=new OfficialFx({P:{Container:class{}},lib:{available:true},tier:'full'});fx.prepared=fx.frameNo;fx.items.ground.push({key:'shield'});fx.items.over.push({key:'shield'});fx.particles=20;fx.needDepth=true;
 fx.clear();assert.equal(fx.items.ground.length,0);assert.equal(fx.items.over.length,0);assert.equal(fx.prepared,-1);assert.equal(fx.needDepth,false);assert.equal(fx.particles,0);
});
test('observed preparation units cannot activate combat passive shields, charge effects or skill loops',()=>{
 const w=new FxWiring({active:true});w.idx={units:{char_known:{kind:'char',modes:[],skills:{}}},skins:{}};const seen=[],released=[];w.release=v=>released.push(v.id);w.syncStatuses=v=>seen.push(v.id);for(const key of ['skills','talents','funnels'])w[key].sync=vs=>assert.deepEqual(vs.map(v=>v.id),[2]);w.sync([{id:1,prep:true},{id:2,prep:false,info:{spine:'char_known'}}]);assert.deepEqual(released,[1]);assert.deepEqual(seen,[2]);
});
test('rapid imperial drone launches use independent sim shell timers and do not duplicate the impact',()=>{
 const source={id:7,info:{defId:'enemy_1112_emppnt'}};const ofx={active:true,time:0};const w=new FxWiring(ofx,{view:()=>source});const projectile={main:'shell'};w.idx={units:{enemy_1112_emppnt:{kind:'enemy',modes:[],skills:{}}},skins:{},projectiles:{projectile_enemy_emppnt:projectile}};const calls=[];w._fly=(...args)=>calls.push(args);
 for(const time of [0,.25,.5]){ofx.time=time;assert.equal(w.simFx('bombardShell',4,10,{id:7,t:3}),true);}
 assert.deepEqual(calls.map(c=>c[4]+c[5].dur),[3,3.25,3.5]);assert.ok(calls.every(c=>c[5].groundTarget));assert.equal(w.simFx('bombard',4,10,{kind:'emppnt'}),true);assert.equal(calls.length,3);
});
test('direct preparation effect requests do not start birth or passive effects',()=>{
 const w=new FxWiring({active:true});w.idx={};const v={prep:true};
 w.skills.deployed=()=>assert.fail('preparation skill effect');w.talents.deployed=()=>assert.fail('preparation talent effect');
 assert.equal(w.playOn('shield',v),null);assert.equal(w.deploy(v),false);assert.equal(w.spawned(v),false);
});
