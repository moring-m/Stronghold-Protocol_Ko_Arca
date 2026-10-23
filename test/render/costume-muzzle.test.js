import test from 'node:test';import assert from 'node:assert/strict';
import {FxWiring} from '../../public/js/render/vfx/wiring.js';
import {costumeSkin} from '../../public/js/render/vfx/costumes.js';
import {costumeMountBindings} from '../../tools/assets/costumeMounts.mjs';

test('new exports bind explicit animator Transforms even when their names conflict with slot names',()=>{
 const row={points:{SpecialPoint0:{front:{pos:[8,0,0]}},OriginMuzzle:{front:{pos:[1,0,0]}}},components:[{class:'CharacterAnimator',fields:{_front:{specialPoint0:{reference:'OriginMuzzle'}}}}]};
 const bindings=costumeMountBindings(row);assert.deepEqual(bindings,{s0:{front:'OriginMuzzle'}});
 const index={skins:{outfit:{points:row.points,mountBindings:bindings}}};const skin=costumeSkin(index,{mount:'outfit'});
 assert.deepEqual(skin.points.Special0.front.pos,[1,0,0]);assert.deepEqual(index.skins.outfit.points.SpecialPoint0.front.pos,[8,0,0]);
});
test('old uploads recover only a unique unnamed slot; ambiguous OriginMuzzle choices remain unresolved',()=>{
 const row={points:{OriginMuzzle:{front:{pos:[1,0,0]}}},components:[{class:'CharacterAnimator',fields:{_front:{specialPoint1:{reference:null,type:'Transform'}}}}]};
 assert.deepEqual(costumeMountBindings(row),{s1:{front:'OriginMuzzle'}});
 row.points.OriginMuzzle_b={front:{pos:[2,0,0]}};assert.deepEqual(costumeMountBindings(row),{});
});
for(const left of [false,true])for(const back of [false,true])test(`skin projectile uses its actual bone, overriding the logical muzzle (left=${left}, back=${back})`,async()=>{
 const c={charId:'char_test',mount:'skin_char_1035_wisdel_game_9',effects:{},projectiles:{base:{graphic:'graphic',mount:6}}};
 const point={pos:[99,99,99],bone:back?'B_OriginMuzzle':'F_OriginMuzzle'};
 const index={units:{char_test:{skin:'base'}},costumes:{outfit:c},skins:{base:{points:{}},[c.mount]:{points:{OriginMuzzle:{front:point,back:point},Muzzle:{all:{pos:[.2,.2,-.2]}}}}},projectiles:{base:{main:'trail'},graphic:{main:'trail'}},prefabs:{trail:{}}};let start;
 const ofx={time:0,active:true,ctx:{cam:()=>({tilt:30})},lib:{index:async()=>index,has:k=>k==='trail',def:()=>({})},spawn:(k,place)=>{start=place.pos;return {};}};
 const w=new FxWiring(ofx,{unitKey:()=>['char_test']});await w.ready();
 const src={id:1,info:{spine:'char_test',skin:'outfit'},x:5,y:10,z:1,visFacing:left?-1:1,entryBack:back,_wantsBack:()=>back,boneOffset:(names,out,strike)=>{assert.equal(strike,true);assert.ok(names.includes(point.bone));return Object.assign(out,{x:left?-.8:.8,up:1.2});}},tgt={id:2,info:{},x:8,y:10,z:0};
 w._fly(index.projectiles.base,src,tgt,'arrow',0,{mount:2});
 assert.ok(Math.abs(start[0]-(-5+(left?-.8:.8)))<1e-6);assert.ok(Math.abs(start[1]-(1+1.2*Math.cos(Math.PI/6)))<1e-6);assert.ok(Math.abs(start[2]-(-1-1.2*.5))<1e-6);
});

test('an unresolved legacy fake mount falls back to the skin muzzle, never the generic body anchor',()=>{
 let start;const w=new FxWiring({time:0,active:true,lib:{has:k=>k==='trail',def:()=>({})},spawn:(key,p)=>{start=p.pos;return {};}});
 w.projectileOf=()=>({main:'trail',costumeMount:19});w.unitOf=()=>({});w.skinOf=()=>({points:{Muzzle:{all:{pos:[.7,.5,-.4]}}}});
 w._fly({}, {id:1,info:{},x:5,y:10,z:0}, {id:2,info:{},x:8,y:10,z:0}, 'arrow',0,{mount:2});
 assert.deepEqual(start,[-4.3,1.5,-.4]);
});
