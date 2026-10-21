import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {installFakePixi} from './fakepixi.js';
let fake,SpineActor;
before(async()=>{fake=installFakePixi();({SpineActor}=await import('../../public/js/render/spine.js'));});
after(()=>fake.restore());
const entry=JSON.parse(readFileSync(new URL('../../data/assets.json',import.meta.url))).chars.char_498_inside.spine.front;
function actor(continuous=true){const a=new SpineActor({animations:Object.keys(entry.animations).map(name=>({name}))},entry);a.clipPerAttack=true;a.continuousAttacks=continuous;return a;}
test('Insider holds Attack_Idle between shots, and lowers the gun only after the cadence stops',()=>{
 const a=actor();
 a.beginAttack(1.6,0);a.attack(1.6);a.update(1.01);
 assert.equal(a.current,'Attack_Idle');assert.equal(a.mode,'attackRest');
 a.update(.59);a.beginAttack(1.6,0);a.attack(1.6);
 assert.equal(a.current,'Attack_Loop');a.update(1.01);assert.equal(a.current,'Attack_Idle');
 a.update(.72);assert.equal(a.current,'Attack_End');assert.equal(a.mode,'base');
});
test('ready pose is interrupted by stun/cancellation and does not apply to enemies or one-off casts',()=>{
 for(const action of [a=>a.cancelAttack(),a=>a.setBase('stun')]){
  const a=actor();a.beginAttack(1.6,0);a.attack(1.6);a.update(1.01);action(a);
  assert.notEqual(a.mode,'attackRest');
  if(a.mode==='stun')assert.equal(a.frozen,true,'models without Stun freeze the current pose');
  else assert.notEqual(a.current,'Attack_Idle');
 }
 const enemy=actor(false);enemy.beginAttack(1.6,0);enemy.attack(1.6);enemy.update(1.01);assert.equal(enemy.current,'Attack_End');
 const cast=actor();cast.attack(1.6,true);cast.update(1.01);assert.equal(cast.current,'Attack_End');
});
test('rapid attacks finish their real timeline before idle without freezing the final pose',()=>{
 const ordinary={anims:{idle:'Idle',attack:{loop:'Attack'}},animations:{Idle:1,Attack:1},hits:{Attack:[.4]}};
 for(const interval of [.18,.5]){
  const a=new SpineActor({animations:[{name:'Idle',duration:1},{name:'Attack',duration:1}]},ordinary);a.clipPerAttack=true;a.continuousAttacks=true;
  const hit=.4*interval;
  a.beginAttack(interval,hit);a.update(hit);a.attack(interval);
  const track=a.spine.state.tracks[0];a.attackUntil=a.clock; // stale prediction must not truncate the actual clip
  a.update((interval-hit)/2);assert.equal(a.current,'Attack');assert.ok(track.timeScale>0);assert.ok(track.trackTime<1);
  a.beginAttack(interval,hit);assert.equal(a.current,'Attack');assert.equal(a.spine.state.tracks[0].trackTime,0);
  a.update(hit);a.attack(interval);a.update(interval-hit+.001);assert.equal(a.current,'Idle','completed attack rests immediately without holding');
 }
});

test('Sarkaz greatswordsmen retain their authored attack-ready stance between successive attacks',()=>{
 const manifest=JSON.parse(readFileSync(new URL('../../content/production/data/assets.json',import.meta.url)));
 for(const id of ['enemy_1010_demon','enemy_1010_demon_2']){
  const entry=manifest.enemies[id].spine;
  const a=new SpineActor({animations:Object.keys(entry.animations).map(name=>({name}))},entry);
  a.clipPerAttack=true;a.continuousAttacks=false;a.authoredAttackReady=true;
  for(let i=0;i<3;i++){
   a.beginAttack(2,.9);a.update(.9);a.attack(2);
   const track=a.spine.state.tracks[0];a.update(.59);
   assert.equal(a.current,'Attack',`${id}: recovery must finish before changing stance`);
   assert.equal(a.spine.state.tracks[0],track);
   a.update(.02);assert.equal(a.current,'Attack_Idle',`${id}: remain ready for the next strike`);
   a.update(.49);assert.equal(a.current,'Attack_Idle');
  }
  a.update(1.5);assert.equal(a.current,'Attack_End',`${id}: lower the weapon after attacking stops`);
 }
});

test('enemy ready stances stop for movement, cancelled attacks and stun, including accelerated attacks',()=>{
 const entry=JSON.parse(readFileSync(new URL('../../content/production/data/assets.json',import.meta.url))).enemies.enemy_1010_demon.spine;
 for(const interval of [2,.5,.1])for(const interrupt of ['move','cancel','stun']){
  const a=new SpineActor({animations:Object.keys(entry.animations).map(name=>({name}))},entry);
  a.clipPerAttack=true;a.authoredAttackReady=true;
  const speed=Math.max(1,1.5/interval),lead=.9/speed;
  a.beginAttack(interval,lead);a.update(lead);a.attack(interval);
  a.update(.59/speed);assert.equal(a.current,'Attack');
  a.update(.02/speed);assert.equal(a.current,'Attack_Idle');
  if(interrupt==='cancel'){a.cancelAttack();assert.equal(a.current,'Idle');}
  else if(interrupt==='stun'){a.setBase('stun');assert.equal(a.mode,'stun');}
  else{a.setBase('move');a.update(.001);assert.equal(a.current,'Attack_End');assert.equal(a.mode,'base');}
 }
});
