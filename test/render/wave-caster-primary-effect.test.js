import {test} from 'node:test';
import assert from 'node:assert/strict';
import {FxWiring} from '../../public/js/render/vfx/wiring.js';
function wiring(){
 const casts=[];const w=Object.create(FxWiring.prototype);
 Object.assign(w,{ofx:{active:true},idx:{projectiles:{}},skills:{frame:1,attackFx:()=>null},castFrame:new Map(),attackN:new Map(),lastTargets:new Map(),funnels:{attack:()=>null},melee:new Map(),_combatKind:(_s,_t,k)=>k,unitOf:s=>s.info,mode:()=>null,_attackSet:()=>({}),_casts:(_a,_s,t)=>casts.push(t.id),cancelAttack(){},hasAttackStart:()=>false,_drawable:()=>true});return{w,casts};
}
for(const defId of ['enemy_1161_tidmag','enemy_1161_tidmag_2','enemy_1162_magmot'])test(`${defId}: render only the primary wave, while the next attack can render again`,()=>{
 const {w,casts}=wiring(),src={id:1,info:{defId},isEnemy:true};
 for(const id of [2,3,4,5,6])assert.equal(w.attack(src,{id},'enemy',0),true);
 assert.deepEqual(casts,[2]);assert.equal(w.lastTargets.get(1).id,2);assert.equal(w.attackN.get(1),1);
 w.skills.frame++;w.attack(src,{id:4},'enemy',2);assert.deepEqual(casts,[2,4]);assert.equal(w.attackN.get(1),2);
});
test('other multi-target attacks retain one visual per affected target',()=>{
 const {w,casts}=wiring(),src={id:1,info:{defId:'enemy_other'},isEnemy:true};for(const id of [2,3,4])w.attack(src,{id},'enemy',0);assert.deepEqual(casts,[2,3,4]);
});
