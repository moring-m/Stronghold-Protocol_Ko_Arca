import test from 'node:test';
import assert from 'node:assert/strict';
import {FxWiring} from '../../public/js/render/vfx/wiring.js';

test('costume artwork keeps its own size; only the verified default-outfit slashes shrink',()=>{
 const mappings={blkkgt_skill_03_start_01:'blkkgt_skill_03_start_01_witch#5',blkkgt_skill_03_end:'blkkgt_skill_03_end_2_witch#5',blkkgt_skill_03_start_02:'blkkgt_skill_03_start_02_witch#5',ascln_attack_start_01:'ascln_attack_start_01_iteration#4'};
 const def={spawn:5,keep:false,isLoop:false,rotateType:0,rotY:-1};let placed;
 const w=new FxWiring({lib:{has:()=>true,def:()=>def},spawn:(key,place)=>{placed={key,place};return placed;}});
 w.effectKey=key=>mappings[key]||key;
 const v={id:1,x:5,y:10,z:0,dir:'RIGHT',alive:true};
 for(const key of ['blkkgt_skill_03_start_01','blkkgt_skill_03_end']){w.playOn(key,v);assert.equal(placed.place.scale,undefined);assert.equal(placed.key,mappings[key]);}
 w.playOn('ascln_attack_start_01',v);assert.equal(placed.place.scale,undefined);
 const skinResolver=w.effectKey;w.effectKey=key=>key;w.playOn('blkkgt_skill_03_start_01',v);assert.equal(placed.place.scale,.5);w.effectKey=skinResolver;
 w.playOn('blkkgt_skill_03_start_02',v);assert.equal(placed.place.scale,undefined);
 w.playOn('ascln_skill_03_range_01',v);assert.equal(placed.place.scale,undefined);
 w.playOn('ascln_attack_start_01',v,{scale:()=>2});assert.equal(placed.place.scale,2);
});
test('the Ascalon iteration outfit keeps the official size (recording of 2026-10-27)',async()=>{
 const {effectArtScale}=await import('../../public/js/render/vfx/artScale.js');
 for(const k of ['ascln_attack_start_01','ascln_attack_start_03','ascln_attack_hit_01','ascln_skill_02_hit_01','ascln_skill_02_start_01','ascln_skill_03_hit_01'])
  assert.equal(effectArtScale(k,k+'_iteration#4'),1,k);
});
