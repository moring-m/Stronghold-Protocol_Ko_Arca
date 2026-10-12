import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {installFakePixi} from './fakepixi.js';
import {selectedSkillClip,spineAttackTiming} from '../../shared/attackTiming.js';
const assets=JSON.parse(readFileSync(new URL('../../content/production/data/assets.json',import.meta.url)));
let fake,SpineActor;
before(async()=>{fake=installFakePixi();({SpineActor}=await import('../../public/js/render/spine.js'));});
after(()=>fake.restore());
for(const [id,record]of Object.entries(assets.chars).filter(([id])=>id.includes('char_180_amgoat'))){
 for(const [side,entry]of Object.entries(record.spine))test(`${id} ${side}: S2 ordinary attacks, S3 continuous authored motion`,()=>{
  for(const index of [0,1]){
   const role=selectedSkillClip(entry,index);assert.equal(role.via,'attack');assert.equal(role.loop,'Attack');assert.equal(role.begin,null);
   assert.equal(spineAttackTiming(entry).skills[index],undefined);
   const actor=new SpineActor({animations:Object.keys(entry.animations).map(name=>({name}))},entry);
   actor.setSkillIndex(index);const names=[],old=actor.spine.state.setAnimation;
   actor.spine.state.setAnimation=(track,name,loop)=>{names.push(name);return old(track,name,loop);};
   actor.setSkill(true);actor.attack();actor.update(.2);actor.setSkill(false);
   assert.ok(names.includes('Attack'));assert.ok(!names.some(n=>/^Skill/.test(n)));actor.destroy();
  }
  const actor=new SpineActor({animations:Object.keys(entry.animations).map(name=>({name}))},entry);
  actor.setSkillIndex(2);assert.deepEqual(actor.roles.skill,entry.anims.skills['2']);
  const names=[],old=actor.spine.state.setAnimation,queue=actor.spine.state.addAnimation;
  actor.spine.state.addAnimation=(track,name,loop)=>{names.push(name);return queue(track,name,loop);};
  actor.spine.state.setAnimation=(track,name,loop)=>{names.push(name);return old(track,name,loop);};
  actor.setSkill(true);actor.update(2);const before=names.length;actor.attack();actor.update(.2);
  if(side==='front'){assert.ok(names.includes('Skill_Start'));assert.ok(names.includes('Skill_Loop'));assert.equal(names.length,before,'S3 attacks retain the continuous pose');}
  actor.setSkill(false);if(side==='front')assert.ok(names.includes('Skill_End'));actor.destroy();
 });
}
for(const side of ['front','back'])test(`Lappland alter ${side}: attacks during S3 keep the skill animation`,()=>{
 const entry=assets.chars.char_1038_whitw2.spine[side];
 const actor=new SpineActor({animations:Object.keys(entry.animations).map(name=>({name}))},entry);
 actor.setSkillIndex(2);const names=[],old=actor.spine.state.setAnimation;
 actor.spine.state.setAnimation=(track,name,loop)=>{names.push(name);return old(track,name,loop);};
 actor.setSkill(true);actor.update(5);actor.attack();actor.update(.2);
 assert.ok(names.some(n=>/^Skill_3/.test(n)));assert.ok(!names.includes(entry.anims.attack.loop));actor.destroy();
});
