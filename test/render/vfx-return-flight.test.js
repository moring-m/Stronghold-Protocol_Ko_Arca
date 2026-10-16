import{test}from'node:test';import assert from'node:assert/strict';import{FxWiring}from'../../public/js/render/vfx/wiring.js';
function fixture(movement){let spawned;const ofx={time:0,lib:{has:()=>true,def:()=>null},spawn:(key,place,opts)=>{spawned={key,opts,fx:{time:0,anchor:place.pos.slice(),stop(){this.stopped=true;}}};return spawned;}};const w=new FxWiring(ofx);w.idx={units:{},skins:{}};let hits=0;w._arrive=()=>hits++;const src={id:1,x:10,y:9,z:0,alive:true},tgt={id:2,x:14,y:9,z:0,alive:true};w._fly({main:'disc',movement},src,tgt,'boomerang',0,{dur:1});return {w,src,tgt,get hits(){return hits;},step:t=>{spawned.fx.time=t;spawned.opts.track(spawned.fx);return spawned.fx;}};}
test('official loop shooter hits once, waits, returns visibly to a moving owner and then stops',()=>{
 const h=fixture({comeBack:1,comeBackSpeedScale:.25,delayAfterReached:.01});
 const at=h.step(1).anchor[0];assert.equal(h.hits,1);assert.equal(h.step(1).stopped,undefined);
 h.tgt.x=30;h.src.x=9;const back=h.step(3);assert.ok(back.anchor[0]<at&&back.anchor[0]>-1);assert.equal(h.hits,1);
 const end=h.step(5.01);assert.ok(end.stopped);assert.ok(Math.abs(end.anchor[0]+1)<1e-6);assert.equal(h.hits,1);assert.equal(h.w.flights.size,0);
});
test('ordinary official projectiles still disappear at the outward hit',()=>{const h=fixture({});assert.ok(h.step(1).stopped);assert.equal(h.hits,1);});
test('returning disc is removed safely if its owner leaves',()=>{const h=fixture({comeBack:1,comeBackSpeedScale:.25});h.step(1);h.src.destroyed=true;assert.ok(h.step(2).stopped);assert.equal(h.hits,1);});
import{existsSync,readFileSync}from'node:fs';import{compileEffect}from'../../public/js/render/vfx/effect.js';import{OfficialFx}from'../../public/js/render/vfx/system.js';
for(const code of ['narant','caper'])test(`${code}: real official disc remains alive and emitting through the return leg`,{skip:!existsSync(new URL(`../../public/assets/local/fx/prefabs/${code}_attack_01_trail.json`,import.meta.url))},()=>{
 const key=code+'_attack_01_trail',def=compileEffect(JSON.parse(readFileSync(new URL(`../../public/assets/local/fx/prefabs/${key}.json`,import.meta.url))));const lib={available:true,has:k=>k===key,def:()=>def};const ofx=new OfficialFx({P:{Container:class{}},lib,tier:'full'});const w=new FxWiring(ofx);w.idx={units:{},skins:{}};w._arrive=()=>{};
 w._fly({main:key,movement:{comeBack:1,comeBackSpeedScale:.25}}, {id:1,x:10,y:9,z:0,alive:true},{id:2,x:14,y:9,z:0,alive:true},'boomerang',0,{dur:.4});
 for(let i=0;i<60;i++)ofx.update(1/60);
 assert.equal(w.flights.size,1);assert.equal(ofx.effects.length,1);assert.ok(ofx.effects[0].anchor[0]>0&&ofx.effects[0].anchor[0]<4);assert.ok(ofx.effects[0].sys.some(s=>s?.count>0),'disc particles are still visible while returning');
});
