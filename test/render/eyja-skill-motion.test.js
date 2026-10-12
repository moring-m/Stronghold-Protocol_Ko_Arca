import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {installFakePixi} from './fakepixi.js';
import {selectedSkillClip,spineAttackTiming} from '../../shared/attackTiming.js';
const assets=JSON.parse(readFileSync(new URL('../../content/production/data/assets.json',import.meta.url)));
let fake,SpineActor;
before(async()=>{fake=installFakePixi();({SpineActor}=await import('../../public/js/render/spine.js'));});
after(()=>fake.restore());
for(const side of ['front','back'])test(`Eyjafjalla ${side}: S1/S2 retain ordinary attacks, and S3 keeps its authored role`,()=>{
 const entry=assets.chars.char_180_amgoat.spine[side];
 for(const index of[0,1]){
  const role=selectedSkillClip(entry,index);assert.equal(role.via,'attack');assert.equal(role.loop,entry.anims.attack.loop);assert.equal(role.begin,null);assert.equal(role.end,null);
  assert.equal(spineAttackTiming(entry).skills[index],undefined);
  const actor=new SpineActor({animations:Object.keys(entry.animations).map(name=>({name}))},entry);
  actor.setSkillIndex(index);const names=[],old=actor.spine.state.setAnimation;actor.spine.state.setAnimation=(track,name,loop)=>{names.push(name);return old(track,name,loop);};
  actor.setSkill(true,{instant:true});actor.attack();actor.update(.2);
  assert.ok(!names.some(n=>/^Skill/.test(n)),`no Volcano animation for S${index+1}`);assert.ok(names.includes(entry.anims.attack.loop));
  actor.destroy();
 }
 assert.deepEqual(selectedSkillClip(entry,2),entry.anims.skills['2']);
});
for(const side of ['front','back'])test(`Lappland alter ${side}: attacks during S3 keep the skill animation`,()=>{
 const entry=assets.chars.char_1038_whitw2.spine[side];
 const actor=new SpineActor({animations:Object.keys(entry.animations).map(name=>({name}))},entry);
 actor.setSkillIndex(2);const names=[],old=actor.spine.state.setAnimation;
 actor.spine.state.setAnimation=(track,name,loop)=>{names.push(name);return old(track,name,loop);};
 actor.setSkill(true);actor.update(5);actor.attack();actor.update(.2);
 assert.ok(names.some(n=>/^Skill_3/.test(n)));assert.ok(!names.includes(entry.anims.attack.loop));actor.destroy();
});
