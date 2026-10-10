// test/render/feedback2-enemy-attack-clip.test.js — GitHub #58, client side: an enemy plays its attack clip once per
// attack at the clip's own speed (faster only when the attacks come quicker than the clip) and then its resting clip —
// Move while the sim walks it again (server/sim/ai.js attackStand stands it for exactly that clip). It used to stretch
// the clip over the whole attack interval and loop it for 1.4 intervals, so a ranged enemy seemed to slide while it
// attacked. Operators keep the clip looping over their attack rhythm. Headless fake PIXI (test/render/fakepixi.js).

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { installFakePixi, fakeViewCtx } from './fakepixi.js';
import { presetCamera } from '../../public/js/render/projection.js';
import { ANIM } from '../../shared/constants.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const assets = JSON.parse(readFileSync(path.join(ROOT, 'data/assets.json'), 'utf8'));
const JSHOOT = 'enemy_1019_jshoot';   // 隐形弩手: Attack 1.0 s, strike at 0.533 s; attacks every 2.7 s

let fake, SpineActor, UnitView;
before(async () => {
  fake = installFakePixi();
  ({ SpineActor } = await import('../../public/js/render/spine.js'));
  ({ UnitView } = await import('../../public/js/render/units.js'));
});
after(() => fake.restore());

const entryOf = (id) => assets.enemies[id].spine;
const dataOf = (entry) => ({ animations: Object.keys(entry.animations).map((name) => ({ name })) });
function actor(id, perAttack) {
  const entry = entryOf(id);
  const a = new SpineActor(dataOf(entry), entry);
  a.clipPerAttack = perAttack;
  a.setBase('move');
  return a;
}
const track = (a) => a.spine.state.tracks[0];
const run = (a, s, dt = 1 / 60) => { for (let t = 0; t < s - 1e-9; t += dt) a.update(dt); };

test('an enemy: wound up before the strike, the Attack clip plays once at its own speed, then Move again — no stretching over the interval', () => {
  const a = actor(JSHOOT, true);
  assert.equal(a.current, 'Move');
  assert.ok(a.windUp(2.7, 0.2), 'winds up 0.2 s before the strike');
  assert.equal(a.current, 'Attack');
  assert.equal(track(a).loop, false, 'one clip per attack');
  run(a, 0.2);
  a.attack(2.7);
  assert.equal(track(a).timeScale, 1, 'its own speed (the 2.7 s interval used to slow it to 0.37)');
  run(a, 0.45);
  assert.equal(a.current, 'Attack', 'the clip plays to its end (0.467 s after the strike)');
  run(a, 0.05);
  assert.equal(a.current, 'Move', 'then walks on its Move clip (it used to hold the attack for 1.4 intervals: 3.8 s)');
  // the next attack starts the clip anew
  run(a, 1.5);
  assert.ok(a.windUp(2.7, 0.3));
  assert.equal(a.current, 'Attack');
  run(a, 0.3);
  a.attack(2.7);
  run(a, 0.5);
  assert.equal(a.current, 'Move');
});

test('an enemy attacking quicker than its clip plays it faster, one clip per attack; an attack seen late starts on the strike frame', () => {
  const a = actor(JSHOOT, true);
  a.attack(0.5);                                   // no wind-up seen: from the strike frame, at 1.0 / 0.5 = 2×
  assert.equal(a.current, 'Attack');
  assert.equal(track(a).loop, false);
  assert.equal(track(a).timeScale, 2);
  assert.ok(Math.abs(track(a).trackTime - 0.533) < 1e-9, 'on the strike frame');
  run(a, 0.25);
  assert.equal(a.current, 'Move', 'the rest of the clip at 2×: 0.23 s');
});

test('an operator keeps its attack loop stretched over the attack rhythm (unchanged)', () => {
  const a = actor(JSHOOT, false);
  a.attack(2.7);
  assert.equal(track(a).loop, true);
  assert.ok(Math.abs(track(a).timeScale - 1 / 2.7) < 1e-9);
  run(a, 2);
  assert.equal(a.current, 'Attack', 'still in attack mode 2 s later (1.4 × the interval)');
});

test('UnitView: enemy and operator models play one clip per confirmed attack', async () => {
  const entry = entryOf(JSHOOT);
  const store = { picture: () => null, image: async () => null, spineEntry: () => entry, spine: { acquire: async () => dataOf(entry), release() {} } };
  const cam = () => presetCamera('normal', { width: 1280, height: 720 });
  const tick = () => new Promise((r) => setImmediate(r));
  const make = async (side) => {
    const v = new UnitView(fakeViewCtx(fake.P, { assets: store, cam }), { id: side === 'enemy' ? 7 : 8, side, kind: side === 'enemy' ? 'enemy' : 'op', defId: JSHOOT, spine: JSHOOT, tier: 1, x: 8, y: 9, maxHp: 1000, facing: -1 });
    await tick(); await tick();
    assert.ok(v.actor, 'model built');
    return v;
  };
  const e = await make('enemy');
  assert.equal(e.actor.clipPerAttack, true);
  e.sync({ x: 8, y: 9, hp: 1000, maxHp: 1000, sp: 0, spMax: 0, flags: 0, anim: ANIM.MOVE, vx: 0 }, 1);
  e.onAttack(null, 1);
  assert.equal(e.actor.current, 'Attack');
  assert.equal(e.actor.spine.state.tracks[0].loop, false);
  const o = await make('ally');
  assert.equal(o.actor.clipPerAttack, true);
});

test('selected skill without a dedicated clip never borrows a different skill animation', () => {
  const entry={animations:{Idle:1,Attack:1,Skill_3_Loop:1},anims:{idle:'Idle',attack:{loop:'Attack'},skill:{loop:'Skill_3_Loop'},skills:{'2':{loop:'Skill_3_Loop'}}}};
  const a=new SpineActor(dataOf(entry),entry);
  a.setSkillIndex(0);a.setSkill(true);
  assert.equal(a.roles.skill,null);
  a.setSkill(false);a.setSkillIndex(2);a.setSkill(true);
  assert.equal(a.roles.skill.loop,'Skill_3_Loop');
});

test('state skins compose with the default body and restore it when the status ends', () => {
  const a=actor(JSHOOT,true);
  class Skin {constructor(name){this.name=name;this.parts=[];}addSkin(s){this.parts.push(s.name);}}
  const base=new Skin('default'),ice=new Skin('frozen');let active;
  a.spine.skeleton={data:{defaultSkin:base,skins:[base,ice]},setSkin(s){active=s;},setSlotsToSetupPose(){}};
  assert.equal(a.setVisualStates(['freeze']),true);
  assert.deepEqual(active.parts,['default','frozen']);
  a.setVisualStates([]);assert.deepEqual(active.parts,['default']);
});

test('instant skill keeps its full cast animation after the same-frame skill-off and blends into idle',()=>{
 const entry={animations:{Idle:1,Skill:2},anims:{idle:'Idle',skill:{loop:'Skill'}}};
 const a=new SpineActor(dataOf(entry),entry);a.setSkill(true,{instant:true});a.setSkill(false);
 assert.equal(a.current,'Skill');a.update(1.9);assert.equal(a.current,'Skill');
 a.update(.2);assert.equal(a.current,'Idle');assert.ok(a.spine.state.tracks[0].mixDuration>0);
});
test('Blemishine S3 uses Skill_3 for attacks, without a 1.2-second activation lock',()=>{
 const entry=assets.chars.char_423_blemsh.spine.front,a=new SpineActor(dataOf(entry),entry);
 a.setSkillIndex(2);a.setSkill(true,{instant:false});
 assert.equal(a.mode,'base');assert.equal(a.current,'Idle');
 assert.equal(a.beginAttack(1.2,.567),true);
 assert.equal(a.current,'Skill_3');assert.equal(a.mode,'attack');
});
test('operator recovery uses the authored speed and rests only when the real interval exceeds clip duration',()=>{
 const a=actor(JSHOOT,true);a.continuousAttacks=true;a.setBase('idle');
 a.beginAttack(2.7,.533);run(a,.533);a.attack(2.7);
 const before=a.clock;run(a,.3);assert.equal(a.current,'Attack');assert.equal(track(a).loop,false);
 assert.ok(a.clock>before);assert.equal(track(a).timeScale,1,'native recovery never crawls');
 run(a,.2);assert.equal(a.current,'Idle','a genuinely longer cooldown permits an idle pose');
 a.beginAttack(2.7,.533);assert.equal(a.current,'Attack');assert.equal(track(a).trackTime,0);
 a.cancelAttack();assert.equal(a.current,'Idle');
});

test('skill ending after its strike preserves the complete recovery before End',()=>{
 const entry={animations:{Idle:1,Attack:1,Skill:1,Skill_End:.2},hits:{Skill:[.4]},anims:{idle:'Idle',attack:{loop:'Attack'},skill:{loop:'Skill',end:'Skill_End'}}};
 const a=new SpineActor(dataOf(entry),entry);a.clipPerAttack=true;a.setSkill(true);
 a.beginAttack(1,.4);run(a,.4);a.attack(1);a.setSkill(false);
 assert.equal(a.current,'Skill');run(a,.5);assert.equal(a.current,'Skill');run(a,.15);assert.equal(a.current,'Skill_End');
});
test('consecutive attacks at the authored clip interval never insert idle',()=>{
 const a=actor(JSHOOT,true);a.continuousAttacks=true;a.setBase('idle');
 const seen=[];const original=a.spine.state.setAnimation;
 a.spine.state.setAnimation=(i,n,l)=>{seen.push(n);return original(i,n,l);};
 for(let n=0;n<4;n++){a.beginAttack(1,.533);run(a,.533);a.attack(1);run(a,.45);}
 assert.ok(seen.length>=4);assert.ok(seen.every(n=>n==='Attack'),seen.join(','));
});
test('multi-target strikes preserve facing and freeze pauses the entire actor clock',async()=>{
 const entry=entryOf(JSHOOT),cam=()=>presetCamera('normal',{width:1280,height:720});
 const store={picture:()=>null,image:async()=>null,spineEntry:()=>entry,spine:{acquire:async()=>dataOf(entry),release(){}}};
 const v=new UnitView(fakeViewCtx(fake.P,{assets:store,cam}),{id:8,side:'ally',kind:'op',spine:JSHOOT,defId:JSHOOT,x:8,y:9,maxHp:1000});
 await new Promise(r=>setImmediate(r));await new Promise(r=>setImmediate(r));
 v.onAttackStart({x:7,y:9},.533,1);v.onAttack({x:7,y:9},1,'none');v.onAttack({x:9,y:9},1,'none');assert.equal(v.visFacing,-1);
 v.onAttackStart({x:9,y:9},.533,1,true);assert.equal(v.visFacing,-1,'untargeted full-area attack does not flip');
 const {UF}=await import('../../shared/constants.js');const before=v.actor.clock,current=v.actor.current;
 v.sync({x:8,y:9,hp:1000,maxHp:1000,sp:0,spMax:0,flags:UF.FROZEN,anim:ANIM.STUN},2);v.update(.4,cam(),2);
 assert.equal(v.actor.clock,before);assert.equal(v.actor.current,current);
 v.sync({x:8,y:9,hp:1000,maxHp:1000,sp:0,spMax:0,flags:0,anim:ANIM.IDLE},2.4);v.update(.1,cam(),2.5);assert.ok(v.actor.clock>before);v.destroy();
});


test('movement pace follows speed modifiers without retiming attack or idle',()=>{
 const a=actor(JSHOOT,true);a.moveRate=.2;a.update(.01);assert.equal(track(a).timeScale,.2);
 const moving=track(a);a.moveRate=1.7;a.update(.01);assert.equal(track(a),moving);assert.equal(track(a).timeScale,1.7);
 a.attack(2.7);const attackRate=track(a).timeScale;a.moveRate=.1;a.update(.01);assert.equal(track(a).timeScale,attackRate);
 a.mode='base';a.setBase('idle');a.update(.01);assert.equal(track(a).timeScale,1);
 a.setBase('move');a.moveRate=0;a.update(.01);assert.equal(track(a).timeScale,0);a.destroy();
});

test('Big Bob uses the authored heavy swing and strikes at its longer OnAttack marker',()=>{
 const a=actor('enemy_1001_bigbo',true);assert.equal(a.roles.attack.loop,'Attack2');
 a.windUp(6,.733);assert.equal(a.current,'Attack2');run(a,.733);a.attack(6);assert.equal(track(a).timeScale,1);
 run(a,1.2);assert.equal(a.current,a.roles.move.loop);
});
test('an ability gesture completes once and restores the permanent empty-barrel form',()=>{
 const a=actor('enemy_10044_wintun',true);
 a.setForm({idle:'B_Idle',move:{begin:null,loop:'B_Move',end:null},die:'B_Die',attack:{begin:null,loop:'B_Attack',end:null}});
 a.setBase('move');a.playAbility('Attack',1.467);assert.equal(a.current,'Attack');run(a,1.5);assert.equal(a.current,'B_Move');
 a.attack(3);assert.equal(a.current,'B_Attack');
 assert.equal(a.playAbility('not_an_animation',1),false);
});
test('Liskarm S1 retains ordinary attacks, while S2 uses its skill attack clip',()=>{
 const sp=assets.chars.char_107_liskam.spine.front;const a=new SpineActor(dataOf(sp),sp);
 a.setSkillIndex(0);assert.equal(a.roles.skill.loop,sp.anims.attack.loop);assert.equal(a.roles.skill.via,'attack');
 a.setSkillIndex(1);assert.equal(a.roles.skill.loop,'Skill');
});
test('an ability gesture does not release an existing freeze',()=>{
 const a=actor('enemy_10087_hlchgr',true);a.frozen=true;assert.equal(a.playAbility('Skill',1),true);const time=track(a).trackTime;run(a,.5);assert.equal(a.frozen,true);assert.equal(track(a).trackTime,time);
 a.frozen=false;run(a,1.1);assert.equal(a.current,a.roles.move.loop||a.roles.move);
});
