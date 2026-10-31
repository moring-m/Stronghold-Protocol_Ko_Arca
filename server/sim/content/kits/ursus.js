import { hypot } from '../../detmath.js';
// Ursus operators: explicit specs for every selectable skill; values come from each loadout's official record.
import { num, talentBb, traitBb, batMod } from './tier1.js';
import { performAttack, effectiveProfile, acquireTargets } from '../../ai.js';

import * as S from '../support/index.js';
const STUDENTS=new Set(['char_196_sunbr','char_195_glassb','char_197_poca','char_194_leto','char_115_headbr','char_1051_headb2']);
export const student=u=>STUDENTS.has(u.def?.raw?.charId);
const up=u=>u?.alive&&u.deployed&&!u.hidden;
const ownHit=(c,u)=>c.source===u&&c.target?.side==='enemy'&&c.dmg;
const heavy=(a,b)=>b.s.massLevel-a.s.massLevel||a.spawnSeq-b.spawnSeq;
const targets=(b,u,n=1)=>b.enemiesInKeys(u.rangeKeys,u,{canHitFly:true}).sort(heavy).slice(0,n);
const duration=(sk,extra={})=>({kind:'duration',duration:sk.duration,...extra});
const elemental=(b,u,t,n)=>{if(n>0&&t?.alive&&t.hp>0)b.dealDamage(u,t,{amount:n*(['ELITE','BOSS'].includes(t.def?.raw?.rank)?num(traitBb(u.def.raw).ep_damage_scale,1):1),type:'element',element:'erosion',tags:['skill','ursus']})};

/** Full chain heal, including Ukusik's self-hit boost and one extra bounce with no decay. */
export function ukusikChain({battle:b,unit:u,target,amount}){
 const skill=u.skill,bb=skill.bb||{},s1=skill.active&&skill.id==='skchr_turdus_1',s2=skill.active&&skill.id==='skchr_turdus_2';
 const h=u.profile.heal||{},tb=talentBb(u.def.raw);
 let left=Math.max(1,num(h.count,3))+(s1?num(bb['attack@chain.extra_value']):0),cur=target,scale=amount;
 const seen=new Set(),healed=[];
 while(cur&&left-->0){
  seen.add(cur.id);healed.push(cur);
  const self=cur===u;
  b.heal(u,cur,scale*(self?num(tb['chain.atk_scale_2'],1):1));
  if(s2){
   const dur=num(bb.bonus_duration,10),heal=u.s.atk*num(bb['turdus_s2[continues_heal].heal_scale']);
   b.applyStatus(cur,'camou',{duration:dur,source:u});
   b.addBuff(cur,{key:`skill:turdus:hot:${u.id}`,duration:dur,interval:1,onTick:({battle,unit})=>battle.heal(u,unit,heal,{hot:true,skillHeal:true})});
  }
  if(self)left++;
  else scale*=1-num(h.falloff,.25);
  const next=b.alliesInRadius(cur.x,cur.y,2.5,null).filter(a=>!seen.has(a.id)&&a.kind!=='device'&&a.hp<a.s.maxHp&&b.allySelectable(a,u)&&!a.s.flags.noHeal&&!a.profile?.noHeal).sort((a,b)=>a.hpRatio-b.hpRatio||a.deploySeq-b.deploySeq)[0];
  if(next)b._ev(['atk',cur.id,next.id,'chainHeal']);cur=next;
 }
 return healed;
}

/** Each struck elevated tile pulses its four orthogonal ground neighbours; S3 spreads through elevated tiles. */
export function imperialPlatforms(b,u,x,y,{radius=1,depth=0,multiplier=1,bind=0,sp=0}={}){
 const t=talentBb(u.def.raw),queue=[],seen=new Set();
 const high=(r,c)=>b.grid.inRect(r,c)&&b.grid.tile(r,c).height==='HIGH';
 for(let r=Math.floor(y-radius);r<=Math.ceil(y+radius);r++)for(let c=Math.floor(x-radius);c<=Math.ceil(x+radius);c++)if(hypot(c-x,r-y)<=radius+1e-9&&high(r,c))queue.push([r,c,0]);
 let hits=0;
 for(let i=0;i<queue.length;i++){
  const [r,c,d]=queue[i],key=r*(b.grid?.cols??S.COLS)+c;if(seen.has(key))continue;seen.add(key);hits++;
  for(const [dr,dc]of [[1,0],[-1,0],[0,1],[0,-1]]){
   const rr=r+dr,cc=c+dc;
   for(const e of b.enemies)if(up(e)&&!e.isFlying&&!e.s.flags.untargetable&&!e.s.flags.sleep&&S.bodyOnTile(e,rr,cc)){
    b.dealDamage(u,e,{amount:u.s.atk*num(t['attack@splash_atk_scale'])*multiplier,type:'phys',isSkill:!!u.skill.active,tags:['zima-platform']});
    if(e.alive)b.applyStatus(e,bind?'bind':'sluggish',{duration:bind||num(t['attack@sluggish'],.5),source:u});
   }
   if(d<depth&&high(rr,cc))queue.push([rr,cc,d+1]);
  }
  b.fx('aoe',{x:c,y:r,id:u.id,radius:1});
 }
 if(sp&&hits)u.skill.gainSp(sp*hits,'zima-platform');return hits;
}

function buildSkill(raw,sk){
 const bb=sk.bb||{},cid=raw.charId,i=sk.index;
 switch(cid){
  case 'char_137_brownb': return i===0?{kind:'passive',mods:{dodgePhys:num(bb.prob)}}:duration(sk,{mods:{batPct:num(bb.base_attack_time)}});
  case 'char_4224_turdus': return i===0?duration(sk,{heal:true,mods:{aspd:num(bb.attack_speed)},attack:{dmgType:'heal'}}):{
   kind:'instant',heal:true,attack:{dmgType:'heal'},onStart:({battle,unit})=>battle.loseHp(unit,unit.hp*num(bb['turdus_s2[self_damage].hp_ratio']),{source:unit,reason:'turdus-s2'})};
  case 'char_188_helage':
   if(i===0)return{kind:'instant',attack:{hits:2,atkScale:num(bb.atk_scale,1)}};
   if(i===1)return duration(sk,{mods:{atkPct:num(bb.atk),dodgePhys:num(bb.prob)},attack:{hits:2}});
   return duration(sk,{mods:{atkPct:num(bb.atk)},targeting:{rangeExtend:num(bb.ability_range_forward_extend),maxTargets:3}});
  case 'char_195_glassb': return i===0?duration(sk,{mods:{batPct:batMod(bb.base_attack_time,raw,sk.desc)}}):duration(sk,{mods:{atkPct:num(bb.atk)},targeting:{rangeGrid:sk.rangeGrid,maxTargets:num(bb['attack@max_target'],3)}});
  case 'char_197_poca':
   if(i<2)return duration(sk,{mods:{atkPct:num(bb.atk)},...(i===1?{targeting:{maxTargets:num(bb['attack@max_target'],2)}}:{})});
   return duration(sk,{mods:{atkPct:num(bb.atk)},attack:{noAttack:true},onStart({battle,unit,skill}){
    unit.mem.rosaLocks=targets(battle,unit,num(bb.max_target,3));unit.mem.rosaPulse=0;
    for(const e of unit.mem.rosaLocks)battle.applyStatus(e,'bind',{duration:skill.duration,source:unit});
   },onTick({battle,unit,dt}){
    unit.mem.rosaPulse+=dt;const iv=Math.max(.05,num(bb.hit_interval,1));
    while(unit.mem.rosaPulse>=iv-1e-9){unit.mem.rosaPulse-=iv;for(const e of unit.mem.rosaLocks||[])if(up(e)){battle.dealDamage(unit,e,{amount:unit.s.atk,type:'phys',isSkill:true,isAttack:true,tags:['rosa-harpoon']});battle._ev(['atk',unit.id,e.id,'bolt']);}}
   },onEnd:({unit})=>{unit.mem.rosaLocks=[]}});
  case 'char_194_leto':
   if(i===0)return duration(sk,{mods:{atkPct:num(bb.atk),aspd:num(bb.attack_speed)}});
   return duration(sk,{mods:{atkPct:num(bb.atk)},targeting:{maxTargets:num(bb['attack@max_target'],2)},attack:{dmgMul:()=>1},onStart({battle,unit}){
    for(const a of battle.allyUnits)if(a!==unit&&up(a)&&student(a)&&a.skill.ready)a.skill.activate('leto-linked');
   }});
  case 'char_4223_botany':
   if(i===0)return{kind:'instant',attack:{atkScale:num(bb.atk_scale,.7),onEachHit({battle,unit,target}){
    if(!up(target))return;
    const extra=!(target.elem.erosion>0)&&!target.s.flags.burstLock;
    if(extra)battle.dealDamage(unit,target,{amount:unit.s.atk*num(bb['botany_s1_extra.atk_scale']),type:'arts',isSkill:true,tags:['botany-extra']});
    elemental(battle,unit,target,unit.s.atk*(num(bb.ep_damage_ratio)+(extra?num(bb['botany_s1_extra.ep_damage_ratio']):0)));
   }}};
   return duration(sk,{targeting:{rangeGrid:sk.rangeGrid,maxTargets:num(bb['attack@max_target'],2)},attack:{onEachHit({battle,unit,target}){
    if(!up(target))return;battle.dealDamage(unit,target,{amount:unit.s.atk*num(bb['attack@extra_atk_scale']),type:'phys',isSkill:true,tags:['botany-extra']});elemental(battle,unit,target,unit.s.atk*num(bb['attack@ep_damage_ratio']));
   }}});
  case 'char_1051_headb2':
   if(i===0)return duration(sk,{mods:{atkPct:num(bb.atk),aspd:num(bb.attack_speed)}});
   if(i===1)return duration(sk,{mods:{atkPct:num(bb.atk),defPct:num(bb.def)},targeting:{rangeGrid:sk.rangeGrid},trigger:{rule:'SP_FULL'},onStart({battle,unit,skill}){
    if(skill.activations>=2){skill.kind='toggle';skill.timeLeft=Infinity;battle.addBuff(unit,{key:skill._buffKey,mods:{atkPct:num(bb['headb2_s_2[second].atk']),defPct:num(bb['headb2_s_2[second].def'])},tags:['skill']});}
   },onEnd({skill}){skill.kind='duration'}});
   // Client tables give five strikes but omit the enlarged splash radius; use a documented 2-tile radius.
   return{kind:'ammo',ammo:5,mods:{atkPct:num(bb.atk_base)},targeting:{rangeGrid:[[0,1]],canHitFly:false},attack:{noAttack:true,atkScale:num(bb.atk_scale),splashRadius:2,allowEmptyAttack:true},onStart({unit}){unit.mem.zimaStrikes=0;unit.mem.zimaSkillClock=0},onTick({battle,unit,skill,dt}){
    if(!unit.canAct || unit.s.flags.disarm)return;
    unit.mem.zimaSkillClock+=dt;
    const marks=[1.1,2.8,4.433,6.067,7.767];
    if(skill.active && unit.mem.zimaStrikes<5 && unit.mem.zimaSkillClock+1e-9>=marks[unit.mem.zimaStrikes]){
     const profile={...effectiveProfile(unit),noAttack:false};const hits=acquireTargets(battle,unit,profile);
     if(!hits.length)battle._ev(['atk',unit.id,unit.id,'none',true]);
     performAttack(battle,unit,profile,hits);
    }
   },onAttack({battle,unit,skill}){
    unit.mem.zimaStrikes++;battle.addBuff(unit,{key:skill._buffKey,mods:{atkPct:num(bb.atk_base)+unit.mem.zimaStrikes*num(bb.atk_step)},tags:['skill']});
   }};
 }
 throw Error(`Unauthored Ursus skill ${sk.skillId}`);
}

function kit(bb,raw,def){
 const cid=raw.charId,t=talentBb(raw),t2=talentBb(raw,1),tb=traitBb(raw);
 const skills=Object.fromEntries(raw.skills.map(sk=>[sk.skillId,buildSkill(raw,sk)]));
 return{...(cid==='char_137_brownb'?{trait:{hits:2,hitDmgMul:.5}}:{}),skills,skill:skills[raw.skill.skillId],install(b,u){
  if(cid==='char_137_brownb'){
    b.on('beforeAttack',c=>{if(c.attacker!==u)return;const target=c.targets[0];if(!target)return;if(u.mem.brownbTarget!==target.id){u.mem.brownbTarget=target.id;u.mem.brownbStacks=0;}u.mem.brownbStacks=Math.min(num(t.max_stack_cnt,5),num(u.mem.brownbStacks)+1);S.passiveBuff(b,u,'talent:ursus:brownb',{atkPct:num(t.atk)*u.mem.brownbStacks});},{owner:u});
    b.on('tick',()=>{if(up(u))S.passiveBuff(b,u,'module:ursus:brownb',{aspd:u.hpRatio>.5?num(tb.attack_speed):0})},{owner:u});
    b.on('deploy',c=>{if(c.unit===u){u.mem.brownbTarget=null;u.mem.brownbStacks=0;S.passiveBuff(b,u,'talent:ursus:brownb',{atkPct:0})}},{owner:u});
  }
  if(cid==='char_4224_turdus')u.profile.heal={...u.profile.heal,resolve:ukusikChain};
  if(cid==='char_188_helage'){b.on('hit',c=>{if(c.target===u&&['phys','arts'].includes(c.dmg.type)&&u.hpRatio<num(t.hp_ratio))c.dmg.mul=(c.dmg.mul??1)*(1-num(t.damage_resistance))},{owner:u});b.on('deploy',c=>{if(c.unit===u)u.mem.hellagurRevived=false},{owner:u});b.on('fatal',c=>{if(c.unit===u&&u.def.raw.module?.type==='SBL-Y'&&!u.mem.hellagurRevived){u.mem.hellagurRevived=true;c.prevented=true;u.hp=u.s.maxHp*num(tb.hp_ratio,.3)}},{owner:u});b.on('tick',()=>{
   if(up(u))S.passiveBuff(b,u,'talent:ursus:hellagur',{aspd:num(t.min_attack_speed)*Math.min(1,(1-u.hp/u.s.maxHp)/Math.max(.01,1-num(t.min_hp_ratio,.3))),hpRegen:(!u.blocking.length||(u.def.raw.module?.type==='SBL-Y'&&u.hpRatio<num(tb.hp_ratio,.3)))?num(t2.hp_recovery_per_sec):0});
  },{owner:u});}
  if(cid==='char_195_glassb'){const refresh=()=>S.passiveBuff(b,u,'talent:ursus:istina',{defPct:num(t.def),aspd:num(t.attack_speed)+(u.skill.active?num(t['glassb_e_t_1[skill].attack_speed']):0)});refresh();b.on('skillStart',refresh,{owner:u});b.on('skillEnd',refresh,{owner:u});}
  if(cid==='char_194_leto')b.on('tick',()=>{if(up(u)){const mod=u.def.raw.talents.filter(t=>t.index===-1).reduce((a,t)=>Object.assign(a,t.bb),{});S.passiveBuff(b,u,'module:ursus:leto',{aspd:b.enemiesInKeys(u.rangeKeys,u,u.profile).length>=num(mod.cnt,Infinity)?num(mod.attack_speed):0})}},{owner:u});
  if(cid==='char_197_poca'){
   b.on('hit',c=>{if(ownHit(c,u)&&c.target.s.massLevel>=num(t.value,3)){c.dmg.defIgnorePct=Math.max(c.dmg.defIgnorePct||0,num(t.def_penetrate));if(c.dmg.isAttack)c.dmg.amount*=num(t.atk_scale,1)}},{owner:u});
   b.on('damaged',c=>{if(c.source===u&&c.dmg?.isAttack&&c.target.s.massLevel>=num(t.value,3)&&num(t.extra_atk_scale)>0&&c.target.alive)b.dealDamage(u,c.target,{amount:u.s.atk*num(t.extra_atk_scale),type:'phys',defIgnorePct:num(t.def_penetrate),tags:['rosa-module-extra']})},{owner:u});
   const atk=Math.max(0,...b.allyUnits.filter(a=>a.ownerId===u.ownerId&&a.def?.raw?.charId===cid).map(a=>num(talentBb(a.def.raw,1).atk)));
   for(const a of b.allyUnits)if(a.ownerId===u.ownerId&&student(a))S.passiveBuff(b,a,'talent:ursus:rosa',{atkPct:atk});
   b.on('beforeAttack',c=>{if(c.attacker===u&&(!u.skill.active||u.skill.id!=='skchr_poca_3')){const n=Math.max(1,c.targets.length);c.targets=b.enemiesInKeys(u.rangeKeys,u,c.profile).sort(heavy).slice(0,n)}},{owner:u});
  }
  if(cid==='char_194_leto'||cid==='char_1051_headb2'){
   const apply=()=>{for(const a of b.allyUnits)if(a.kind==='op'&&(cid==='char_1051_headb2'||student(a))){const active=up(u)&&u.skill.active;const v=active?(cid==='char_194_leto'?num(t.attack_speed):num(t2.atk)*(student(a)?num(t2.scale_bonus,2):1)):0;
    S.passiveBuff(b,a,`talent:ursus:${cid}:${u.id}`,cid==='char_194_leto'?{aspd:v}:{atkPct:v,defPct:active?num(t2.def)*(student(a)?num(t2.scale_bonus,2):1):0});}};
   b.on('skillStart',apply);b.on('skillEnd',apply);b.on('death',apply);b.on('deploy',apply);
   if(cid==='char_1051_headb2'){
    b.on('beforeAttack',c=>{if(c.attacker===u){const center=c.targets[0],radius=u.skill.active&&u.skill.id==='skchr_headb2_3'?2:num(tb['attack@ability_range_radius'],1);c.profile.atkScale=(u.skill.active?num(u.skill.bb.atk_scale,1):1)*(center&&b.enemiesInRadius(center.x,center.y,radius).length>=num(tb.cnt,Infinity)?num(tb.atk_scale_e,1):1)}},{owner:u});
    u.profile.splashScale=num(tb['attack@atk_scale_2'],.5)*num(t.damage_scale,1);
    b.on('attack',c=>{if(c.attacker!==u)return;const s3=u.skill.active&&u.skill.id==='skchr_headb2_3',sk=u.skill.bb;
     const W=b.grid?.cols??S.COLS,key=u.rangeKeys.find(k=>k!==u.tileR*W+u.tileC);
     const centers=c.targets.length?c.targets:(s3&&key!=null?[{x:key%W,y:Math.floor(key/W)}]:[]);
     for(const e of centers)imperialPlatforms(b,u,e.x,e.y,{radius:s3?2:num(tb['attack@ability_range_radius'],1),depth:s3?num(u.mem.zimaStrikes)+1:0,multiplier:s3?num(sk.splash_atk_scale_bonus,1):1,bind:s3?num(sk.unmovable):0,sp:u.skill.id==='skchr_headb2_2'?num(sk.sp_per_highland):0});
    },{owner:u});
   }
  }
  if(cid==='char_4223_botany'){
   b.on('deploy',c=>{if(c.unit===u){u.mem.botanyStacks=0;b.removeBuff(u,'talent:ursus:botany')}});
   b.on('elementBurst',c=>{if(c.element==='erosion'&&up(u)&&c.target?.side==='enemy'&&S.bodyInKeys(c.target,u.rangeKeySet)){
    u.mem.botanyStacks=Math.min(num(t.max_stack_cnt,3),num(u.mem.botanyStacks)+1);S.passiveBuff(b,u,'talent:ursus:botany',{aspd:num(u.mem.botanyStacks)*num(t.attack_speed)});
   }},{owner:u});
   b.on('tick',({dt})=>{
    if(!up(u)||!u.skill.active||u.skill.id!=='skchr_botany_2')return;
    for(const e of b.enemies)if(up(e)&&S.bodyInKeys(e,u.rangeKeySet)&&e.mem.botanyRecoveryTick!==b.tickCount){
     const lock=e.buffs.find(v=>v.key==='erosionBurst');if(!lock)continue;
     const rate=Math.max(0,...b.allyUnits.filter(a=>up(a)&&a.def?.raw?.charId===cid&&a.skill.active&&a.skill.id==='skchr_botany_2'&&S.bodyInKeys(e,a.rangeKeySet)).map(a=>num(a.skill.bb['attack@ep_break_recover_speed'])));
     lock.timeLeft=Math.max(0,lock.timeLeft-(dt||b.dt)*rate);e.mem.botanyRecoveryTick=b.tickCount;
    }
   },{owner:u});
  }
 }};
}
export default Object.fromEntries(['turdus','helage','headb2','glassb','poca','leto','brownb','botany'].map(key=>[`chess_custom_ursus_${key}_a`,kit]));
