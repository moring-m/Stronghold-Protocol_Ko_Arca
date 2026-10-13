import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {NORMAL_ATTACK_BUFF_SKILLS,spineAttackTiming} from '../../shared/attackTiming.js';
import {installFakePixi} from './fakepixi.js';
const assets=JSON.parse(readFileSync(new URL('../../data/assets.json',import.meta.url)));
const releaseAssets=JSON.parse(readFileSync(new URL('../../content/production/data/assets.json',import.meta.url)));
let fake,SpineActor;
before(async()=>{fake=installFakePixi();({SpineActor}=await import('../../public/js/render/spine.js'));});
after(()=>fake.restore());
function actor(entry,index){const a=new SpineActor({animations:Object.keys(entry.animations).map(name=>({name}))},entry);a.clipPerAttack=true;if(index!=null){a.setSkillIndex(index);a.skillOn=true;}return a;}
function check(entry,index,label){
 const a=actor(entry,index),clip=a._attackClip();if(!clip||a._continuousSkillLoop())return false;
 const duration=a.dur(clip.loop),hit=a._hitTime(clip.loop,duration);if(!(hit>0&&duration>hit))return false;
 const interval=Math.max(duration,1.6);
 a.beginAttack(interval,hit);
 // An event can be displayed one render frame before the skeleton reaches its OnAttack key.
 a.update(Math.max(0,hit-.03));
 const e=a.spine.state.tracks[0],position=e.trackTime;
 a.attack(interval);
 assert.equal(a.spine.state.tracks[0],e,`${label}: no restart at impact`);
 assert.ok(Math.abs(a.attackUntil-a.clock-(duration-position)/e.timeScale)<1e-8,`${label}: deadline uses the actual pose`);
 const remaining=(duration-position)/e.timeScale;
 a.update(Math.max(0,remaining-.001));
 assert.equal(a.current,clip.loop,`${label}: recovery retained`);
 let finalProgress=0;const update=a.spine.update.bind(a.spine);
 a.spine.update=dt=>{update(dt);finalProgress=e.trackTime;};
 a.update(.002);
 assert.ok(finalProgress>=duration,`${label}: final frame advances before idle`);
 return true;
}
test('Vendela S2 Front and Back finish their normal Attack recovery before idle',()=>{
 for(const face of ['front','back'])assert.ok(check(assets.chars.char_494_vendla.spine[face],1,`Vendela ${face}`));
});
test('all manifest operator, enemy and token attack clips share the recovery fix',()=>{
 let count=0;
 for(const group of ['chars','enemies','tokens'])for(const [id,value] of Object.entries(assets[group]||{})){
  const sp=value.spine;if(!sp)continue;
  for(const [face,entry] of sp.front?Object.entries(sp).filter(([k])=>k==='front'||k==='back'):[['front',sp]]){
   if(!entry?.animations||!entry.anims)continue;
   if(check(entry,null,`${id}/${face}/attack`))count++;
   for(const index of Object.keys(entry.anims.skills||{}))if(check(entry,Number(index),`${id}/${face}/S${Number(index)+1}`))count++;
  }
 }
 assert.ok(count>500,`audited ${count} attack clips`);
 console.log(`Recovery audit: ${count} authored attack/skill clips`);
});

test('Vendela buffs use normal attacks and play the short gesture only on activation',()=>{
 for(const index of [0,1])for(const face of ['front','back']){
  const a=actor(assets.chars.char_494_vendla.spine[face],index);a.skillOn=false;
  a.setSkill(true);assert.equal(a.current,'Skill');
  a.update(.51);assert.equal(a.current,'Idle');
  assert.equal(a._attackClip().loop,'Attack');
  a.beginAttack(1.6,.567);assert.equal(a.current,'Attack');
  const e=a.spine.state.tracks[0];a.update(.567);a.attack(1.6);
  assert.equal(a.spine.state.tracks[0],e);a.update(.799);assert.equal(a.current,'Attack');
  a.update(.01);assert.equal(a.current,'Idle');
 }
});

test('ordinary-attack buffs retain normal attack clips and timing for every equipped model',()=>{
 let checked=0;
 for(const [id,indices] of NORMAL_ATTACK_BUFF_SKILLS)for(const [assetId,value] of Object.entries(releaseAssets.chars))for(const [face,entry] of Object.entries(value.spine||{})){
  if(!(entry?.skel||'').includes(id)||!entry.anims?.attack)continue;
  for(const index of indices){
   if(!entry.anims.skills?.[index])continue;
   const a=actor(entry,index);
   assert.equal(a._attackClip().loop,entry.anims.attack.loop,`${assetId}/${face}/S${index+1}`);
   assert.equal(a._continuousSkillLoop(),false);
   assert.equal(spineAttackTiming(entry).skills[index],undefined);
   checked++;
  }
 }
 assert.ok(checked>=24,`checked ${checked} model/skill combinations`);
});
test('true channel skills keep their separate authored loops',()=>{
 for(const [id,index] of [['char_136_hsguma',2],['char_150_snakek',1],['char_381_bubble',1],['char_197_poca',2],['char_128_plosis',1],['char_183_skgoat',1]]){
  const a=actor(releaseAssets.chars[id].spine.front,index);
  assert.notEqual(a.roles.skill.loop,a.roles.attack.loop,id);
  assert.equal(a.roles.skill.via,undefined,id);
 }
});

test('a 0.1-second extra attack accelerates the entire authored clip including recovery',()=>{
 const a=actor(assets.chars.char_494_vendla.spine.front),clip=a._attackClip(),duration=a.dur(clip.loop),hit=a._hitTime(clip.loop,duration),speed=duration/.1;
 a.beginAttack(.1,hit/speed);assert.ok(Math.abs(a.spine.state.tracks[0].timeScale-speed)<1e-8);a.update(hit/speed);a.attack(.1);assert.ok(Math.abs(a.spine.state.tracks[0].timeScale-speed)<1e-8);
});
