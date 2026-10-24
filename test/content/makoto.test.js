import {test} from 'node:test';
import assert from 'node:assert/strict';
import {loadData} from '../../server/data.js';
import {makeBattle,enemyRec,checkInvariants} from '../helpers/battleHarness.js';
import {setGameData} from '../../server/sim/content/support/index.js';
const data=loadData(new URL('../../content/production/data/',import.meta.url).pathname);
const id=(tier=6,elite=false)=>`chess_custom_recruit_makoto_${tier}_${elite?'b':'a'}`;
function combat(index=2,{tier=6,elite=false,hp=1e8}={}){
 const raw={...data,enemies:{...data.enemies,dummy:enemyRec({key:'dummy',hp,speed:0,atk:0,mass:4})}};
 const h=makeBattle({data:raw,autoFinish:false,captureNoisy:true,units:[{chessId:id(tier,elite),row:10,col:3,skillIndex:index}],enemies:[{key:'dummy',time:0,route:{motion:'WALK',start:[10,4],end:[10,2],checkpoints:[]}}]});
 h.step();h.run(Math.max(0,...h.b.allyUnits.map(u=>u.deployRemaining)));return h;
}
test('Makoto tiers, skills, module and cooperation-defense membership resolve without a generic kit',()=>{
 setGameData(data);try{for(const tier of [5,6])for(const elite of [false,true])for(const skill of [0,1,2]){
  const r=data.chess[id(tier,elite)];assert.deepEqual(r.bonds,['emptyShip']);assert.equal(r.optionalRecruit,true);assert.equal(r.skills.length,3);
  const h=combat(skill,{tier,elite}),u=h.unit(id(tier,elite));assert.ok(u.mem.makoto);u.skill.gainSp(1000);if(!u.mem.makoto.phase){u.skill.activate('test');h.runUntil(()=>!!u.mem.makoto.phase,5);assert.ok(u.mem.makoto.phase);}h.run(25);assert.equal(h.b.errorCount,0);checkInvariants(h.b);
 }}finally{setGameData(null)}
});
for(const entry of ['skill','fatal'])test(`S3 ${entry} entry ignores full SP and flips only on lethal damage`,()=>{
 setGameData(data);try{const h=combat(),u=h.unit(id());
  if(!u.mem.makoto.phase){if(entry==='skill'){u.skill.gainSp(1000);u.skill.activate('test');h.runUntil(()=>!!u.mem.makoto.phase,5);}else h.b.loseHp(u,u.hp+100,{source:null});}
  assert.equal(u.mem.makoto.phase,'s3a');h.run(2.1);
  u.skill.gainSp(1000,'test',false,{ignoreLock:true});assert.equal(u.skill.activate('DEFAULT'),false);h.run(.5);assert.equal(u.mem.makoto.phase,'s3a');
  h.b.loseHp(u,u.hp+100,{source:null});assert.equal(u.alive,true);assert.equal(u.mem.makoto.phase,'changing');h.run(1.6);assert.equal(u.mem.makoto.phase,'s3b');assert.equal(u.s.blockCnt,2);
  h.b.loseHp(u,u.hp+100,{source:null});assert.equal(u.alive,false,'second persona may be defeated');assert.equal(u.mem.makoto.phase,null);assert.equal(h.b.errorCount,0);
 }finally{setGameData(null)}
});
test('persona expiry restores base stats and clears invulnerability after all-out attack',()=>{
 setGameData(data);try{const h=combat(),u=h.unit(id());u.skill.gainSp(1000);if(!u.mem.makoto.phase){u.skill.activate('test');h.runUntil(()=>!!u.mem.makoto.phase,5);}h.run(2.1);const atk=u.s.atk;assert.ok(atk>u.base.atk);h.run(24);assert.equal(u.mem.makoto.phase,null);assert.equal(!!u.s.flags.invulnerable,false);assert.equal(u.trait.doll,false);assert.ok(h.hooksOf('hit').some(c=>c.dmg.tags?.includes('makoto-total')));assert.equal(h.b.errorCount,0);}finally{setGameData(null)}
});

test('S3 personas share the original deadline; lethal transition never restarts its duration',()=>{
 setGameData(data);try{for(const wait of [2.2,8,17,21.5]){
  const h=combat(),u=h.unit(id());u.skill.gainSp(1000);if(!u.mem.makoto.phase){u.skill.activate('test');h.runUntil(()=>!!u.mem.makoto.phase,5);}const deadline=u.mem.makoto.until;h.run(wait);
  h.b.loseHp(u,u.hp+100,{source:null});assert.equal(u.mem.makoto.until,deadline);h.run(Math.max(0,deadline-h.b.time)+.1);assert.equal(u.mem.makoto.phase,'exiting');h.run(2.7);assert.equal(u.mem.makoto.phase,null);assert.equal(h.b.errorCount,0);
 }}finally{setGameData(null)}
});

test('persona range and attack impact follow the official diamond and Spine markers',()=>{
 setGameData(data);try{const h=combat(0),u=h.unit(id());u.mem.makoto.enter();h.run(2.1);assert.equal(u.rangeGrid.length,13);assert.ok(u.rangeGrid.some(([r,c])=>r===2&&c===0));assert.deepEqual(u.def.attackTiming.forms.makoto_s1.attack,{dur:1.8,hit:.8});assert.deepEqual(u.def.attackTiming.forms.makoto_s3a.attack,{dur:1.8,hit:.8});}finally{setGameData(null)}
});
test('S1 prioritizes a half-health ally and excludes healing-blocked targets',()=>{
 setGameData(data);try{const h=combat(0),u=h.unit(id());u.mem.makoto.enter();h.run(2.1);u.hp=u.s.maxHp*.4;h.run(.1);assert.equal(u.profile.dmgType,'heal');const before=u.hp;h.run(2.5);assert.ok(u.hp>before);{h.b.addBuff(u,{key:'test-no-heal',flags:{noHeal:true}});u.hp=u.s.maxHp*.2;h.run(.1);assert.equal(u.profile.dmgType,'arts');}assert.equal(u.profile.canHitFly,false);assert.equal(h.b.errorCount,0);}finally{setGameData(null)}
});
test('S2 attempts execution once per range entry even if the target survives',()=>{
 setGameData(data);try{const h=combat(1),u=h.unit(id());u.mem.makoto.enter();h.run(2.1);const e=h.enemies()[0];h.b.addBuff(e,{key:'test-shield',shield:30000000});e.hp=1;h.b.applyStatus(e,'fear',{duration:10,source:u});h.run(.4);const count=()=>h.eventsOf('fx').filter(e=>e[1]==='makotoExecute').length;assert.equal(count(),1);h.run(.6);assert.equal(count(),1);assert.ok(e.alive);assert.equal(u.mem.makoto.attempted.has(e.id),true);assert.equal(h.b.errorCount,0);}finally{setGameData(null)}
});
test('S3 second persona heals after half a second and clears its dodge aura at expiry',()=>{
 setGameData(data);try{const h=combat(),u=h.unit(id());u.mem.makoto.enter();h.run(2.1);h.b.loseHp(u,u.hp+100,{source:null});h.run(1.6);assert.equal(u.mem.makoto.phase,'s3b');u.hp=u.s.maxHp*.3;h.run(u.mem.makoto.healAt-h.b.time+.05);assert.ok(u.s.dodgePhys>0);const hp=u.hp;h.run(.2);assert.equal(u.hp,hp);h.run(.3);assert.ok(u.hp>hp);h.run(u.mem.makoto.until-h.b.time+2.8);assert.equal(u.mem.makoto.phase,null);assert.equal(u.s.dodgePhys||0,0);assert.equal(h.b.errorCount,0);}finally{setGameData(null)}
});
test('Makoto is selectable in the real recruit roster and shares skill/module/skin choices across tiers',async()=>{
 const{rosterOf,setRecruitSelection,setRecruitChoice}=await import('../../public/js/ui/loadoutModel.js');const get=k=>data.chess[k],base=get(id(5));assert.ok(rosterOf(Object.values(data.chess)).some(c=>c.chessId===id(5)));const skin=base.skins.find(s=>s.id.includes('makoto_p3r')).id;let entries=setRecruitSelection({},base,5,get);entries=setRecruitChoice(entries,base,{skill:1,module:'uniequip_002_makoto',skin},get);assert.equal(entries[id(5)].selected,true);for(const tier of[5,6]){assert.equal(entries[id(tier)].skill,1);const {effectiveChoice}=await import('../../public/js/ui/loadoutModel.js');assert.equal(effectiveChoice(entries,get(id(tier)),get(id(tier,true))).module,'uniequip_002_makoto');assert.equal(entries[id(tier)].skin,skin);}
});
test('Makoto uses community wording for every skill and is first in both recruit tiers',async()=>{
 const {rosterOf}=await import('../../public/js/ui/loadoutModel.js');
 for(const tier of [5,6]){
  const recruits=rosterOf(Object.values(data.chess)).filter(c=>c.optionalRecruit&&c.tier===tier);
  assert.equal(recruits[0].charId,'char_4217_makoto');
  for(const elite of [false,true]){
   const r=data.chess[id(tier,elite)];
   assert.ok(r.trait.desc.includes('교체 투입'));assert.ok(r.talents[0].desc.includes('공격 딜레이 증가'));
   assert.ok(r.talents[1].desc.includes('본체로 교체 시 총공격'));
   for(const skill of r.skills){assert.ok(skill.desc.includes('패시브 효과:'));assert.ok(skill.desc.includes('액티브 효과: 즉시 <대역>으로 교체'));assert.ok(!/\{[^}]+\}/.test(skill.descRaw));}
   assert.ok(r.skills[1].desc.includes('공격력의'));assert.ok(!r.skills[1].desc.includes('자신의 HP'));
   assert.ok(r.skills[2].desc.includes('타나토스가 소환된 동안 스킬을 재사용하거나 치명상을 입을 시'));
  }
 }
});

test('persona SP gauge drains across both S3 forms without resetting its shared duration',async()=>{
 const {unitTuple}=await import('../../server/sim/snapshot.js');
 setGameData(data);try{
  const h=combat(),u=h.unit(id());u.mem.makoto.enter();
  const duration=u.mem.makoto.duration,deadline=u.mem.makoto.until;
  const gauge=()=>unitTuple(u,h.b.time);
  assert.equal(gauge()[6],duration);assert.ok(Math.abs(gauge()[5]-duration)<.11);
  assert.equal(duration,20);h.run(1);assert.equal(gauge()[5],20);h.run(4);assert.ok(Math.abs(gauge()[5]-17)<.11);
  h.b.loseHp(u,u.hp+100,{source:null});
  assert.equal(u.mem.makoto.until,deadline);assert.equal(gauge()[6],duration);
  h.run(1.6);assert.equal(u.mem.makoto.phase,'s3b');
  assert.ok(Math.abs(gauge()[5]-(deadline-h.b.time))<.11);
  h.run(deadline-h.b.time+2.8);assert.equal(u.mem.makoto.phase,null);
  assert.equal(gauge()[6],u.skill.spCost);
 }finally{setGameData(null)}
});

for(const fill of ['windup','recovery'])test(`Makoto skill filled during ${fill} waits for attack recovery; fatal substitution stays immediate`,()=>{
 setGameData(data);try{
  const h=combat(2),u=h.unit(id());
  u.skill.sp=0;u.skill.charges=0;
  h.runUntil(()=>fill==='windup'?!!u.mem.attackWindup:(u.mem.makoto.recoveryUntil||0)>h.b.time,5);
  assert.ok(fill==='windup'?u.mem.attackWindup:u.mem.makoto.recoveryUntil>h.b.time);
  u.skill.gainSp(1000);
  assert.equal(u.skill.activate('test'),false);assert.equal(u.mem.makoto.phase,null);
  h.runUntil(()=>!!u.mem.makoto.phase,5);assert.equal(u.mem.makoto.phase,'s3a');
  assert.ok(h.b.time+1e-8>=u.mem.makoto.recoveryUntil);
  const other=combat(2),v=other.unit(id());other.runUntil(()=>!!v.mem.attackWindup,5);
  other.b.loseHp(v,v.hp+100,{source:null});assert.equal(v.mem.makoto.phase,'s3a');assert.equal(v.alive,true);
 }finally{setGameData(null)}
});

test('persona expiry plays its full one-second SwitchOut before the all-out attack and body recovery',()=>{
 setGameData(data);try{for(const skill of [0,1,2]){
  const h=combat(skill),u=h.unit(id());u.mem.makoto.enter();const deadline=u.mem.makoto.until;
  h.run(deadline-h.b.time+.01);assert.equal(u.mem.makoto.phase,'exiting');assert.equal(u.form,'makoto_exit_'+['s1','s2','s3a'][skill]);
  assert.equal(h.eventsOf('fx').filter(e=>e[1]==='makotoAllOutStart').length,0);
  h.run(.9);assert.equal(u.mem.makoto.phase,'exiting');h.run(.15);assert.equal(u.mem.makoto.phase,'total');
  const total=h.eventsOf('fx').filter(e=>e[1]==='makotoAllOutStart');assert.equal(total.length,1);
  h.run(1.65);assert.equal(u.mem.makoto.phase,null);assert.equal(!!u.s.flags.invulnerable,false);assert.equal(h.b.errorCount,0);
 }}finally{setGameData(null)}
});

for(const skill of [0,1,2])test(`S${skill+1} deployment and every persona transition suppress attack starts and strikes`,()=>{
 setGameData(data);try{
  const rec={...data.chess[id()],attackTiming:{...data.chess[id()].attackTiming,front:{...data.chess[id()].attackTiming?.front,deploy:1.2}}};
  const h=makeBattle({data:{...data,chess:{...data.chess,[id()]:rec},enemies:{dummy:enemyRec({key:'dummy',hp:1e8,atk:0,speed:0})}},captureNoisy:true,autoFinish:false,units:[{chessId:id(),row:10,col:3,skillIndex:skill}],enemies:[{key:'dummy',pos:[10,4]}]});
  const u=h.unit(id());u.skill.sp=0;u.skill.charges=0;
  const attacks=()=>h.events.filter(x=>['atk','atkStart'].includes(x[0])&&x[1]===u.id).length;
  h.run(.8);assert.equal(attacks(),0,'deployment cannot begin an attack');
  h.runUntil(()=>!!u.mem.attackWindup,5);assert.ok(u.mem.attackWindup);
  h.b.loseHp(u,u.hp+100,{source:null});const before=attacks();assert.ok(!u.mem.attackWindup);
  h.run(1.9);assert.equal(attacks(),before,'entry cancels the existing windup and blocks new attacks');
  h.run(.2);assert.equal(u.mem.makoto.duration,20);assert.ok(Math.abs(u.mem.makoto.until-h.b.time-19.9)<.1);
  if(skill===2){h.b.loseHp(u,u.hp+100,{source:null});const changing=attacks();h.run(1.4);assert.equal(attacks(),changing);h.run(.2);}
  h.run(u.mem.makoto.until-h.b.time+.05);const exiting=attacks();h.run(2.4);assert.equal(attacks(),exiting,'exit and all-out cannot emit a basic attack');
  assert.equal(h.b.errorCount,0);
 }finally{setGameData(null)}
});

test('auto-cast persona entry does not continue the triggering normal attack in the same tick',()=>{
 setGameData(data);try{
  const h=combat(2),u=h.unit(id());u.skill.gainSp(1000);
  h.runUntil(()=>!!u.mem.makoto.phase,5);assert.ok(u.trait.dollSwitching);
  assert.equal(u.mem.attackWindup,undefined,'automatic entry owns the attack check');
  const offset=h.events.length;h.run(1.8);
  assert.ok(!h.events.slice(offset).some(x=>['atkStart','atk'].includes(x[0])&&x[1]===u.id));
 }finally{setGameData(null)}
});

for(const phase of ['s1','s2','s3a','s3b'])test(`${phase} returns to a fresh body attack without persona attack locks or cooldown`,()=>{
 setGameData(data);try{
  const h=combat(phase==='s1'?0:phase==='s2'?1:2),u=h.unit(id());u.mem.makoto.enter();h.run(2.1);
  if(phase==='s3b'){h.b.loseHp(u,u.hp+100,{source:null});h.run(1.6);}
  const deadline=u.mem.makoto.until;h.run(deadline-h.b.time+1.2);
  u.atkCd=7;u.mem.makoto.recoveryUntil=h.b.time+7;
  h.runUntil(()=>u.mem.makoto.phase===null,3);
  assert.ok(!u.profile.noAttack);assert.ok(!u.s.flags.disarm);assert.equal(u.mem.makoto.recoveryUntil,0);
  assert.ok(u.mem.attackWindup,'first body attack begins on the return tick');assert.ok(u.atkCd<=u.s.interval+.001);
  const before=u.stats.attacks;h.run(1);assert.ok(u.stats.attacks>before);assert.equal(h.b.errorCount,0);
 }finally{setGameData(null)}
});
