import {num,talentBb,traitBb} from './shared/tier1.js';
import * as S from '../support/index.js';
const sk=(c,i)=>c.skills?.find(s=>s.index===i);
const burst=t=>!!t?.findBuff('necrosisBurst');
export default {
 char_183_skgoat:(bb,c)=>({
  skills:{[sk(c,0)?.skillId]:{kind:'duration',mods:{atkPct:num(sk(c,0)?.bb?.atk)}},[sk(c,1)?.skillId]:{kind:'duration',attack:{noAttack:true},onStart({battle:b,unit:u}){const pulse=()=>{if(!u.skill?.active||!S.onField(u))return;for(const e of b.enemiesInKeys(u.rangeKeys,u,{canHitFly:true}))b.applyStatus(e,'sluggish',{duration:num(sk(c,1).bb.sluggish)+num(talentBb(c).sluggish),source:u});};pulse();const cast=u.skill.activations,timer=b.every(num(sk(c,1).bb.interval,1.6),()=>{if(!u.skill?.active||u.skill.activations!==cast||!S.onField(u)){timer.cancel();return;}pulse();},{owner:u});}}},
  trait:{onHitStatus:{key:'sluggish',duration:num(traitBb(c).sluggish,1.2)+num(talentBb(c).sluggish)}},
 }),
 char_4047_pianst:(bb,c)=>({
  skills:{[sk(c,0)?.skillId]:{kind:'duration',mods:{atkPct:num(sk(c,0).bb.atk),resMul:1+num(sk(c,0).bb.magic_resistance)},attack:{dmgType:'arts'}}},
  skill:{kind:'duration',mods:{hpPct:num(bb.max_hp),taunt:num(bb.taunt_level)},attack:{dmgType:'arts'},
   onStart({unit:u}){u.mem.czernyStacks=0;},
   onEnd({battle:b,unit:u,reason}){if(reason==='end')for(const e of b.foesInRadius(u.x,u.y,1.5))b.dealDamage(u,e,{amount:u.s.atk*num(bb.atk_scale),type:'arts',isSkill:true,tags:['czerny:final']});b.removeBuff(u,'czerny:s2:atk');},
  },
  install(b,u){
   const tb=talentBb(c),tr=traitBb(c);S.passiveBuff(b,u,'czerny:res',{resFlat:num(tb.magic_resistance)});
   b.on('damaged',d=>{
    if(!u.alive||!u.deployed)return;
    if(d.target===u&&d.source?.side==='enemy'&&d.amount>0){
     if(u.skill?.active&&u.skill.id==='skchr_pianst_2'){u.mem.czernyStacks=Math.min(num(bb.max_stack_cnt,10),(u.mem.czernyStacks||0)+1);S.passiveBuff(b,u,'czerny:s2:atk',{atkPct:num(bb.atk)*u.mem.czernyStacks});}
     const scale=num(tr.atk_scale)+(d.type==='arts'?num(tb.atk_scale):0);
     if(scale)b.dealDamage(u,d.source,{amount:u.s.atk*scale,type:'arts',tags:['czerny:reflect']});
    }
    if(d.source===u&&d.dmg.isAttack&&d.target?.side==='enemy'&&num(tr.atk_scale))b.dealDamage(u,d.target,{amount:u.s.atk*num(tr.atk_scale),type:'arts',tags:['czerny:trait']});
   },{owner:u});
  },
 }),
 char_499_kaitou:(bb,c)=>({
  skills:{[sk(c,1)?.skillId]:{kind:'duration',mods:{aspd:num(sk(c,1).bb.attack_speed)},targeting:{maxTargets:2}}},
  skill:{kind:'duration',mods:{atkPct:num(bb.atk)}},
  install(b,u){
   const tb=talentBb(c),tr=traitBb(c);
   b.on('hit',d=>{if(d.source===u&&d.dmg.isAttack&&burst(d.target)){d.dmg.amount*=1+num(tb.atk);d.dmg.mul*=num(tr.damage_scale,1);}}, {owner:u});
   b.on('damaged',d=>{if(d.source!==u||!u.skill?.active||!d.dmg.isAttack||d.type!=='arts'||d.target?.side!=='enemy')return;
    const sk=u.skill.bb||{};
    if(burst(d.target))b.dealDamage(u,d.target,{amount:u.s.atk*num(sk['attack@extra_ep_damage_scale']),type:'elemental',tags:['diamante:elemental']});
    else b.dealDamage(u,d.target,{amount:d.amount*num(sk['attack@ep_damage_ratio']),type:'element',element:'necrosis',tags:['diamante:necrosis']});
   },{owner:u});
  },
 }),
 char_4109_baslin:(bb,c)=>({
  skills:{[sk(c,1)?.skillId]:{kind:'duration',heal:true,mods:{atkPct:num(sk(c,1).bb.atk),batPct:num(sk(c,1).bb.base_attack_time,1.3)/num(c.stats.bat,1.2)-1},trigger:{rule:'SKILL_RANGE',grid:sk(c,0).rangeGrid,allies:true},targeting:{rangeGrid:sk(c,0).rangeGrid},attack:{dmgType:'heal',heal:{mode:'single'},projectile:'none'}}},
  skill:{kind:'instant',heal:true,trigger:{rule:'SKILL_RANGE',grid:c.skill.rangeGrid,allies:true,hpAtMost:.5},targeting:{rangeGrid:c.skill.rangeGrid},attack:{dmgType:'heal',heal:{mode:'single',hpAtMost:.5},healScale:num(bb.heal_scale,1),projectile:'none'}},
  install(b,u){const tb=talentBb(c),tr=traitBb(c);S.passiveBuff(b,u,'bassline:base',{resFlat:num(tb['baslin_t[self].magic_resistance']),dmgTakenMul:1-num(tr.damage_resistance)});
   b.on('heal',d=>{if(d.source===u&&!d.opts?.regen&&u.skill?.active&&u.skill.id==='skchr_baslin_2')b.addBuff(d.target,{key:'bassline:barrier:'+u.id,duration:u.skill.timeLeft,shield:u.s.atk*num(u.skill.bb['attack@scale'],.5),shieldType:'arts',source:u,refresh:'replace'});},{owner:u});
   b.on('skillEnd',({unit})=>{if(unit===u)for(const a of b.allyUnits)b.removeBuff(a,'bassline:barrier:'+u.id);});
   let before='';b.on('tick',()=>{if(!S.onField(u)){if(before){before='';for(const a of b.allyUnits)b.removeBuff(a,'bassline:aura:'+u.id);}return;}const nearby=b.allyUnits.filter(a=>a.kind==='op'&&a!==u&&S.onField(a)&&Math.max(Math.abs(a.tileR-u.tileR),Math.abs(a.tileC-u.tileC))<=1);const key=nearby.map(a=>a.id).join('|');if(key===before)return;before=key;
    for(const a of b.allyUnits)b.removeBuff(a,'bassline:aura:'+u.id);
    if(nearby.length)for(const a of [u,...nearby])S.passiveBuff(b,a,'bassline:aura:'+u.id,{resFlat:num(tb['baslin_t[ally].magic_resistance'],5)});
   },{owner:u});
   b.on('death',({unit})=>{if(unit===u)for(const a of b.allyUnits)b.removeBuff(a,'bassline:aura:'+u.id);});
  },
 }),
};
