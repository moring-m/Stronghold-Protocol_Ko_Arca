import {sakikoNoteProjectile} from '../../../../shared/sakikoNotes.js';
import { hypot, sin, cos, atan2 } from '../../detmath.js';
// Opt-in recruits. Skill, talent and module numbers are read from the selected official record.
import { num, talentBb, traitBb, moduleBb, batMod } from './tier1.js';
import { COLS } from '../../constants.js';
import { canTargetEnemy } from '../../targeting.js';
import { weaknessRetype } from '../items/battle.js';
import * as S from '../support/index.js';
const up=u=>u?.alive&&u.deployed&&!u.hidden;
const foes=(b,u)=>b.enemiesInKeys(u.rangeKeys,u,u.profile);
const nearby=(a,e)=>Math.max(Math.abs(a.x-e.x),Math.abs(a.y-e.y))<=1.01;
const duration=(s,x={})=>({kind:'duration',duration:s.duration,...x});
const damage=(b,u,e,scale,type='phys',tags=['recruit-skill'])=>{if(up(e))b.dealDamage(u,e,{amount:u.s.atk*scale,type,isSkill:true,tags})};
const heal=(b,u,n)=>b.heal(u,u,n,{talent:true});
function asclnPoison(b,u,e){
 if(!up(e))return;const t=talentBb(u.def.raw),key=`ascln:poison:${u.id}`,old=e.findBuff(key),stacks=Math.min(num(t.max_stack_cnt,3),(old?.stacks||0)+1);
 const poison=b.addBuff(e,{key,duration:num(t.debuff_duration,25),stacks,maxStacks:num(t.max_stack_cnt,3),refresh:'replace',mods:{moveMul:Math.max(.05,1+num(t.move_speed)*stacks)**(1/stacks)},interval:num(t.interval,1),onTick:({unit})=>{if(!up(unit))return;b.emit('attack',{attacker:u,targets:[unit],isSkill:false,periodic:true,profile:{dmgType:'arts',tags:['ascln-poison']}});b.dealDamage(u,unit,{amount:u.s.atk*num(t.atk_ratio)*stacks,type:'arts',isAttack:true,isSkill:false,tags:['ascln-poison']})}});
 if(old)poison._acc=old._acc;
}
function wisdelShadows(b,u,count){
 const list=(u.mem.wisdelShadows||=[]).filter(up);u.mem.wisdelShadows=list;
 const targetCount=Math.min(3,list.length+count);
 for(let i=list.length;i<targetCount;i++){
  const p=u.rangeKeys.map(k=>[Math.floor(k/(b.grid?.cols ?? COLS)),k%(b.grid?.cols ?? COLS)]).find(([r,c])=>!b.isReservedTile(r,c)&&b.grid.inRect(r,c));
  if(!p)break;
  const token=b.spawnToken(u,'token_10035_wisdel_wward',p[0],p[1]);
  if(token){list.push(token);token.name='레버넌트의 그림자';token.profile.noHeal=true;token.rangeGrid=u.rangeGrid;token.profile.dmgType='arts';token.profile.projectile='arts';token.profile.canHitFly=true;b._refreshRange(token);
   token.profile.noAttackUnlessSkill=true;token.skill.spec={kind:'instant',attack:{dmgType:'arts',onEachHit({battle,target,skill}){target.mem.wisdelMark=u.id;battle.applyStatus(target,'sluggish',{duration:num(skill.bb.sluggish,1),source:token});token.skill.gainSp(Math.floor(battle.rng()*num(skill.bb.sp_max,3)),'shadow')}}};
   token.skill.kind='instant';
   b.on('tick',()=>{if(up(token)){token.rangeGrid=u.rangeGrid;token.rangeKeys=u.rangeKeys;token.rangeKeySet=u.rangeKeySet}},{owner:token});
  }
 }
}
function skill(raw,s){
 const bb=s.bb||{},cid=raw.charId,i=s.index;
 if(cid==='char_4132_ascln'){
  if(i===0)return{kind:'charges',attack:{hits:2,atkScale:num(bb.atk_scale,1)}};
  return duration(s,{mods:{atkPct:num(bb.atk),batPct:batMod(bb.base_attack_time,raw,s.desc),taunt:num(bb.taunt_level)},...(i===2?{targeting:{rangeGrid:s.rangeGrid}}:{})});
 }
 if(cid==='char_1050_chen3'){
  if(i===0)return duration(s,{mods:{atkPct:num(bb.atk)},attack:{hits:2,onEachHit({battle,unit,target}){battle.applyStatus(target,'silence',{duration:unit.skill.timeLeft,source:unit})}}});
  if(i===1)return duration(s,{onStart({battle,unit}){
   const seq=unit.deploySeq;unit.profile.noAttack=true;battle.addBuff(unit,{key:'chen3:slashing',flags:{invulnerable:true},duration:2});const finish=()=>{unit.profile.noAttack=false;battle.removeBuff(unit,'chen3:slashing');if(up(unit)){unit.skill.timeLeft=unit.skill.duration;battle.addBuff(unit,{key:unit.skill._buffKey,mods:{atkPct:num(bb['chen3_s2[respawn_buff].atk']),dodgePhys:num(bb['chen3_s2[respawn_buff].prob']),dodgeArts:num(bb['chen3_s2[respawn_buff].prob'])},tags:['skill']})}};let target=battle.foesInRadius(unit.x,unit.y,3).sort((a,b)=>hypot(a.x-unit.x,a.y-unit.y)-hypot(b.x-unit.x,b.y-unit.y))[0];
   let remaining=10;const slash=()=>{if(!up(unit)||unit.deploySeq!==seq)return;
    if(!up(target)){target=battle.foesInRadius(unit.x,unit.y,3).sort((a,b)=>a.hp-b.hp)[0];if(!target){finish();return;}}
    battle._ev(['atk',unit.id,target.id,'none']);damage(battle,unit,target,num(bb.atk_scale),'arts',['chen3-slash']);remaining--;if(!up(target))remaining++;
    if(remaining>0)battle.after(.1,slash);else if(up(target)&&battle.grid.inRect(Math.round(target.y),Math.round(target.x))&&battle.grid.tile(Math.round(target.y),Math.round(target.x)).height!=='HIGH'){battle.relocate(unit,Math.round(target.y),Math.round(target.x));finish()}else finish();
   };slash();
  }});
  return duration(s,{triggerProfile:{canHitFly:true,groundOnly:false},targeting:{rangeGrid:s.rangeGrid,maxTargets:num(bb['attack@max_target'],3),canHitFly:false},attack:{hits:3,atkScale:num(bb['attack@atk_scale']),dmgType:'arts'},onStart({battle,unit}){
   battle.fx('chenDragonWave',{x:unit.x,y:unit.y,id:unit.id});
   for(const e of battle.enemiesInKeys(unit.rangeKeys,unit,{...unit.profile,canHitFly:true,groundOnly:false}))if(e.hp*num(bb.hp_ratio)<=300000)battle.dealDamage(unit,e,{amount:Math.max(e.hp*num(bb.hp_ratio),unit.s.atk*num(bb.projectile_min_atk_scale)),type:'arts',isSkill:true,tags:['chen3-sword-wave']});
  }});
 }
 if(cid==='char_1035_wisdel'){
  if(i===0)return{kind:'instant',attack:{splashRadius:1.3,onEachHit({battle,unit,target}){battle.applyStatus(target,'stun',{duration:num(bb.stun_duration),source:unit})},afterHit(b,u,target,info){
   const atk=u.s.atk,count=u.profile.shockTimes+1;for(let n=1;n<=count;n++)b.after(.3*n,()=>{for(const e of b.foesInRadius(info.x,info.y,1.3).filter(e=>!e.isFlying)){b.dealDamage(u,e,{amount:atk*num(bb.append_atk_scale),type:'phys',isSplash:true,isSkill:true,tags:['aftershock']});b.applyStatus(e,'stun',{duration:num(bb.stun_duration),source:u})}});
  }}};
  if(i===1)return duration(s,{duration:s.duration*2,mods:{atkPct:num(bb.atk),batPct:batMod(bb.base_attack_time,raw,s.desc)},targeting:{maxTargets:3},onTick({battle,unit,skill}){if(skill.timeLeft<=skill.duration/2){skill.spec.targeting.maxTargets=1;skill.spec.attack={hits:1,randomStrikeTargets:4,atkScale:num(bb['attack@atk_scale_ol'])}}},onEnd({skill}){skill.spec.targeting.maxTargets=3;delete skill.spec.attack}});
  return{kind:'ammo',ammo:num(bb['attack@trigger_time'],6),targeting:{canHitFly:true},mods:{atkPct:num(bb.atk),batPct:batMod(bb.base_attack_time,raw,s.desc)},attack:{atkScale:num(bb['attack@atk_scale_3']),splashRadius:2,tags:['wisdel-s3']},onStart({battle,unit}){wisdelShadows(battle,unit,num(bb.max_cnt,2))}};
 }
 if(cid==='char_4138_narant'){
  if(i===0)return{kind:'instant',onStart({battle,unit}){unit.mem.narantToggle=!unit.mem.narantToggle;unit.mem.narantBaseRange||=unit.rangeGrid;const grid=unit.mem.narantBaseRange,max=new Map();for(const [r,c]of grid)max.set(r,Math.max(max.get(r)??-Infinity,c));unit.rangeGrid=unit.mem.narantToggle?grid.filter(([r,c])=>c<=max.get(r)+num(bb.ability_range_forward_extend,-1)):grid;battle._refreshRange(unit)}};
  return duration(s,{attack:{atkScale:num(bb['attack@atk_scale']),...(i===2?{hits:num(bb.cnt,3)}:{}),onEachHit({battle,unit,target}){if(i===1)battle.applyStatus(target,'sluggish',{duration:num(bb['attack@sluggish'],1),source:unit})}}});
 }
 if(cid==='char_4182_oblvns'){
  if(i===0)return{kind:'charges',onStart({battle,unit}){for(let n=0;n<8;n++)note(battle,unit,n===0?num(bb.atk_scale):num(bb[`atk_scale_${n+1}`]),'arts',false,n+1)}};
  if(i===1)return{kind:'instant',onStart({battle,unit}){if((battle._recruitFever?.value||0)>=450||battle.time<(battle._recruitFever?.until||0))return;unit.mem.sakikoOrgan=!unit.mem.sakikoOrgan;S.passiveBuff(battle,unit,'sakiko:instrument',unit.mem.sakikoOrgan?{aspd:num(bb['attack@attack_speed'])}:{atkPct:num(bb['attack@atk'])});unit.profile.dmgType=unit.mem.sakikoOrgan?'arts':'phys'}};
  return duration(s,{targeting:{rangeGrid:s.rangeGrid},attack:{noAttack:true},onTick({battle,unit,dt}){unit.mem.sakikoSkillTick=(unit.mem.sakikoSkillTick||0)+dt;if(unit.mem.sakikoSkillTick>=unit.s.interval){unit.mem.sakikoSkillTick=0;for(const type of ['phys','arts'])for(let n=0;n<2;n++)laterNote(battle,unit,n*0.1,()=>note(battle,unit,num(bb['attack@atk_scale']),type,true))}}});
 }
 throw Error(`Unauthored recruit skill ${s.skillId}`);
}
// 连击间隔: S3's pair of notes and S2's fever second note go out `_triggerDelta` apart (char_4182_oblvns S3 MultiRangedAttack
// +1 / 0.1 s, S2_Fever +1 / 0.2 s), a later one only while she stays on the field.
function laterNote(b,u,delay,fn){if(!(delay>0))return fn();const seq=u.deploySeq;b.after(delay,()=>{if(u.alive&&u.deployed&&u.deploySeq===seq)fn()},{owner:u})}
function note(b,u,scale=1,type='phys',high=false,ordinal=0){
 const projectile=sakikoNoteProjectile(u.def.raw.skill.index,u.skill.active,type,ordinal);
 b.fx('sakikoNoteSound',{id:u.id,x:u.x,y:u.y,projectile,phase:'launch'});
 const list=foes(b,u);if(high)list.sort((a,b)=>type==='phys'?b.s.res-a.s.res:b.s.def-a.s.def);
 const target=list[0];if(target&&u.skill.active&&u.def.raw.skill.index===2)b._ev(['atk',u.id,target.id,type==='arts'?'arts':'bolt']);const angle={UP:-Math.PI/2,RIGHT:0,DOWN:Math.PI/2,LEFT:Math.PI}[u.dir]??0;
 (u.mem.sakikoNotes||=[]).push({id:(u.mem.sakikoNoteSeq=(u.mem.sakikoNoteSeq||0)+1),x:u.x,y:u.y,angle:angle+(b.rng()-.5)*Math.PI*40/180,target,type,amount:u.s.atk*scale,age:0,outside:0,seek:0,hit:false,tail:0,seen:new Set(),seq:u.deploySeq,high,projectile});
}
function advanceNotes(b,u,dt){
 const kept=[];for(const n of u.mem.sakikoNotes){
  n.age+=dt;n.seek+=dt;
  if(!n.hit&&!up(n.target)&&n.seek>=.4){n.seek=0;n.target=b.foesInRadius(n.x,n.y,1).filter(e=>up(e)&&!e.s.flags.untargetable).sort((a,b)=>hypot(a.x-n.x,a.y-n.y)-hypot(b.x-n.x,b.y-n.y))[0]||n.target;}
  const seek=up(n.target)&&!n.hit;
  if(seek&&n.age>=.1)n.angle=atan2(n.target.y-n.y,n.target.x-n.x);
  const speed=u.def.raw.skill.index===1?(n.type==='phys'?3.5:1):2;
  n.x+=cos(n.angle)*speed*dt;n.y+=sin(n.angle)*speed*dt;
  const hit=e=>{const mod=!!u.def.raw.module?.active&&u.skill.active;const scale=!u.blocking.includes(e)?(mod?1:num(traitBb(u.def.raw).atk_scale,.8)):1;b.dealDamage(u,e,{amount:n.amount*scale,type:n.type,isAttack:true,isSkill:u.skill.active,tags:['sakiko-note']});n.seen.add(e.id);b.fx('sakikoNoteHit',{id:u.id,target:e.id,x:e.x,y:e.y,projectile:n.projectile});};
  if(seek&&hypot(n.target.x-n.x,n.target.y-n.y)<=Math.max(.16,speed*dt)){hit(n.target);n.hit=true;n.tail=u.def.raw.skill.index===1&&n.type==='phys'?.5:0;}
  if(n.hit){n.tail-=dt;if(n.tail<=0)continue;for(const e of b.foesInRadius(n.x,n.y,.8))if(up(e)&&!n.seen.has(e.id))hit(e);}
  const r=Math.round(n.y),c=Math.round(n.x),inside=b.grid.inRect(r,c)&&u.rangeKeySet.has(r*(b.grid?.cols ?? COLS)+c);n.outside=inside?0:n.outside+dt;
  if(n.outside>=1||n.age>30)continue;kept.push(n);
 }
 u.mem.sakikoNotes=kept;
}
function kit(bb,raw){
 const cid=raw.charId,t=talentBb(raw),t2=talentBb(raw,1),tb=traitBb(raw),mb=moduleBb(raw),skills=Object.fromEntries(raw.skills.map(s=>[s.skillId,skill(raw,s)]));
 return{skills,skill:skills[raw.skill.skillId],install(b,u){
  if(cid==='char_1050_chen3'){
   S.passiveBuff(b,u,'chen3:talent',{atkPct:num(t.atk),aspd:num(t.attack_speed)});u.mem.chenQuiet=0;
   b.on('hit',c=>{if(c.source===u)weaknessRetype(c.dmg,u,c.target);if(c.target===u&&u.mem.chenDodge&&['phys','arts'].includes(c.dmg.type)&&c.dmg.canDodge){u.mem.chenDodge=false;c.dmg.cancel=true;b.emit('dodge',{source:c.source,target:u,dmg:c.dmg})}},{owner:u});
   b.on('damaged',c=>{if(c.target===u)u.mem.chenQuiet=0},{owner:u});
   b.on('tick',({dt})=>{if(!up(u))return;S.passiveBuff(b,u,'chen3:module',{aspd:u.blocking.length?0:num(tb.attack_speed)});if(!num(t2.stack_time))return;u.mem.chenQuiet+=dt;if(u.mem.chenQuiet>=t2.stack_time){u.mem.chenQuiet=0;heal(b,u,u.s.atk*(num(t2.heal_atk_scale_min)+(num(t2.heal_atk_scale_max)-num(t2.heal_atk_scale_min)-1)*b.rng())/100);u.mem.chenDodge=true}},{owner:u});
  }
  if(cid==='char_4132_ascln'){
   b.on('damaged',c=>{if(c.source===u&&c.dmg.isAttack&&!c.dmg.tags?.includes('ascln-poison'))asclnPoison(b,u,c.target)},{owner:u});
   b.on('tick',()=>{if(!up(u)){for(const e of b.enemies){b.removeBuff(e,`ascln:poison:${u.id}`);b.removeBuff(e,`ascln:aura:${u.id}`)}return;}const high=[[1,0],[-1,0],[0,1],[0,-1]].some(([r,c])=>b.grid.inRect(u.tileR+r,u.tileC+c)&&b.grid.tile(u.tileR+r,u.tileC+c).height==='HIGH');S.passiveBuff(b,u,'ascln:aspd',{aspd:num(t2.attack_speed)+(high?num(t2.attack_speed_add):0)});
    for(const e of b.enemies)if(up(e)){const inside=S.bodyInKeys(e,u.rangeKeySet),i=u.def.raw.skill.index,bb=u.skill.bb;b.addBuff(e,{key:`ascln:aura:${u.id}`,duration:.15,mods:{moveMul:inside?Math.max(.05,(1+num(mb.move_speed))*(1+(u.skill.active&&i===1?num(bb.move_speed):0))):1}})}
   },{owner:u});
   b.on('hit',c=>{if(!up(u)||!u.skill.active||u.def.raw.skill.index!==2||c.source?.side!=='enemy'||c.source.isFlying||!S.bodyInKeys(c.source,u.rangeKeySet)||!['phys','arts'].includes(c.dmg.type)||!c.dmg.canDodge)return;
    if(b.rng()<-num(u.skill.bb[`attack@damage_hitrate_${c.dmg.type==='phys'?'physical':'magical'}`])){c.dmg.cancel=true;b.emit('dodge',{source:c.source,target:c.target,dmg:c.dmg})}},{owner:u});
   b.on('dodge',c=>{if(c.target===u&&u.skill.active&&u.def.raw.skill.index===2)heal(b,u,u.s.maxHp*num(u.skill.bb['attack@hp_ratio']))},{owner:u});
   b.on('death',c=>{const e=c.unit;if(e?.side!=='enemy')return;if(e.findBuff(`ascln:poison:${u.id}`)&&num(t.hp_ratio)&&up(u))heal(b,u,u.s.maxHp*num(t.hp_ratio));if(up(u)&&u.skill.active&&u.def.raw.skill.index===1&&!e.isFlying&&S.bodyInKeys(e,u.rangeKeySet))for(const x of b.foesInRadius(e.x,e.y,num(u.skill.bb.range_radius,1.3)))asclnPoison(b,u,x)},{owner:u});
  }
  if(cid==='char_4138_narant'){
   u.mem.narantSteal={atk:0,def:0};u.mem.narantQuiet=0;u.mem.narantReturns=0;S.passiveBuff(b,u,'narant:dodge',{dodgePhys:num(t2.prob),dodgeArts:num(t2.prob)});
   u.profile.onBoomerangReturn=()=>{u.mem.narantReturns++;if(num(tb.come_back_cnt)&&u.mem.narantReturns%tb.come_back_cnt===0)u.skill.gainSp(num(tb.sp,1),'narant-module');if(u.skill.active&&u.def.raw.skill.index===2){const bb=u.skill.bb;for(const e of b.foesInRadius(u.x,u.y,1.42).filter(e=>nearby(u,e)).slice(0,num(bb['attack@aoe.max_target'],3))){damage(b,u,e,num(bb.atk_scale_aoe));b.applyStatus(e,'sluggish',{duration:num(bb.sluggish,1),source:u})}}};
   u.profile.onBoomerangTurn=({x,y})=>{if(u.skill.active&&u.def.raw.skill.index===1){const bb=u.skill.bb,dx=u.x-x,dy=u.y-y,len=hypot(dx,dy);for(const e of b.enemies){const f=len?((e.x-x)*dx+(e.y-y)*dy)/(len*len):0;if(up(e)&&canTargetEnemy(u,e,u.profile)&&f>=0&&f<=1&&hypot(e.x-(x+f*dx),e.y-(y+f*dy))<=num(bb['attack@projectile_range'],1)/2)damage(b,u,e,num(bb['attack@atk_scale_comeback']))}}};
   b.on('hit',c=>{if(c.source===u&&c.dmg.isAttack&&nearby(u,c.target))c.dmg.mul*=num(tb.atk_scale,1);if(up(u)&&c.source?.side==='enemy'&&nearby(u,c.source)&&['phys','arts'].includes(c.dmg.type)&&c.dmg.canDodge&&b.rng()<-num(t2[`damage_hitrate_${c.dmg.type==='phys'?'physical':'magical'}`])){c.dmg.cancel=true;b.emit('dodge',{source:c.source,target:c.target,dmg:c.dmg})}},{owner:u});
   b.on('damaged',c=>{if(c.target===u)u.mem.narantQuiet=0;if(c.source!==u||!c.dmg.isAttack)return;const twice=raw.module?.active&&raw.module?.id==='uniequip_002_narant'&&nearby(u,c.target)?2:1,st=u.mem.narantSteal;const atk=Math.min(num(t['attack@steal_atk_max'])-st.atk,num(t['attack@steal_atk'])*twice),def=Math.min(num(t['attack@steal_def_max'])-st.def,num(t['attack@steal_def'])*twice);st.atk+=Math.max(0,atk);st.def+=Math.max(0,def);S.passiveBuff(b,u,'narant:steal',{atkFlat:st.atk,defFlat:st.def});const key=`narant:loss:${u.id}`,old=c.target.findBuff(key)?.mods||{};b.addBuff(c.target,{key,mods:{atkFlat:num(old.atkFlat)-Math.max(0,atk),defFlat:num(old.defFlat)-Math.max(0,def)},persist:true})},{owner:u});
   b.on('tick',({dt})=>{if(!up(u))return;u.mem.narantQuiet+=dt;S.passiveBuff(b,u,'narant:quiet',{atkPct:u.mem.narantQuiet>=num(mb.interval,Infinity)?num(mb.atk):0});if(u.mem.narantToggle){u.profile.atkScale=num(raw.skills[0].bb['attack@atk_scale']);u.profile.chain={count:num(raw.skills[0].bb['attack@times']),radius:1.5,falloff:0,repeat:true}}else{u.profile.atkScale=1;delete u.profile.chain}},{owner:u});
  }
  if(cid==='char_1035_wisdel'){
   u.profile.shockTimes=num(tb['attack@enable_third_attack'])?3:2;
   b.on('beforeAttack',c=>{if(c.attacker===u&&u.skill.active&&u.def.raw.skill.index===1&&u.skill.timeLeft<=u.skill.duration/2){const pool=foes(b,u);if(pool.length)c.targets=Array.from({length:4},()=>pool[Math.floor(b.rng()*pool.length)]);c.profile.hits=1;c.profile.atkScale=num(u.skill.bb['attack@atk_scale_ol'])}},{owner:u});
   b.on('deploy',c=>{if(c.unit===u&&raw.talents.some(t=>t.tokenKey==='token_10035_wisdel_wward'))wisdelShadows(b,u,1)},{owner:u});
   b.on('tick',()=>{if(up(u)&&(u.mem.wisdelShadows||[]).some(e=>up(e)&&hypot(e.x-u.x,e.y-u.y)<=1.5))b.applyStatus(u,'camou',{duration:.15,source:u})},{owner:u});
   b.on('hit',c=>{if(c.source!==u||!up(c.target))return;const d=c.dmg,e=c.target;if(d.isAttack&&!d.isSplash){d.mul*=num(t['attack@main_atk_scale'],1);e.mem.wisdelMark=u.id}
    if(d.tags?.includes('aftershock')&&e.mem.wisdelMark===u.id&&b.rng()<((d.tags?.includes('wisdel-s3')||u.skill.active&&u.def.raw.skill.index===2)?num(u.skill.bb['attack@prob'],1):num(t['attack@prob']))){delete e.mem.wisdelMark;for(const x of b.foesInRadius(e.x,e.y,num(t['attack@range_radius'],1.1))){damage(b,u,x,num(t['attack@bomb_atk_scale']),'phys',['wisdel-mark']);b.applyStatus(x,'stun',{duration:num(t['attack@stun']),source:u})}}
    if(u.skill.active&&u.def.raw.skill.index===0)b.applyStatus(e,'stun',{duration:num(u.skill.bb.stun_duration),source:u});
   },{owner:u});
  }
  if(cid==='char_4182_oblvns'){
   u.mem.sakikoNotes=[];u.mem.sakikoEmptyTick=0;u.profile.deferHit=true;u.profile.projectile='bolt';
   const fever=b._recruitFever||(b._recruitFever={value:0,until:0});
   if(u.def.raw.skill.index===1)S.passiveBuff(b,u,'sakiko:instrument',{atkPct:num(u.skill.bb['attack@atk'])});
   b.on('skillStart',c=>{if(c.unit!==u||c.reason==='fever'||c.reason==='full-charge')return;if(fever.value>=450&&b.time>=fever.until){fever.value=0;fever.until=b.time+20;for(const a of b.allyUnits)if(a.def?.raw?.charId===cid&&a.skill.active&&a.skill.isTimed)a.mem.sakikoPausedSkill=a.skill.id;b.fx('buff',{id:u.id,x:u.x,y:u.y})}},{owner:u});
   b.on('damaged',c=>{if(c.source===u&&c.target?.side==='enemy'&&b.time>=fever.until)fever.value=Math.min(450,fever.value+num(t2.cnt,1))},{owner:u});
   b.on('attack',c=>{if(c.attacker===u){note(b,u,1,u.mem.sakikoOrgan?'arts':'phys');if(u.def.raw.skill.index===1&&b.time<fever.until)laterNote(b,u,0.2,()=>note(b,u,1,u.profile.dmgType))}},{owner:u});
   b.on('fatal',c=>{if(c.unit===u&&u.skill.active&&u.def.raw.skill.index===2&&b.time<fever.until){c.prevented=true;u.hp=1;u.mem.sakikoDoom=true}},{owner:u});
   b.on('tick',({dt})=>{if(!up(u))return;if(u.mem.sakikoDoom&&b.time>=fever.until){b.loseHp(u,u.hp,{source:u,reason:'fever-end'});return;}
    advanceNotes(b,u,dt);
    if(b.time<fever.until){if(u.skill.isTimed&&u.skill.active&&u.mem.sakikoPausedSkill===u.skill.id)u.skill.timeLeft+=dt;else if(u.def.raw.skill.index!==1&&!u.skill.active){u.skill.activate('fever',{free:true});u.mem.sakikoFeverSkill=true;}}
    else if(u.mem.sakikoFeverSkill){u.mem.sakikoFeverSkill=false;if(u.skill.active)u.skill.end('fever-end');}
    if(u.def.raw.skill.index===0&&u.skill.charges>=u.skill.maxCharges&&!u.skill.active)u.skill.activate('full-charge');
    const n=Math.min(num(t.max_cnt,10),u.mem.sakikoNotes.length);S.passiveBuff(b,u,'sakiko:notes',{defIgnorePct:n*num(t.def_penetrate_ratio),resIgnorePct:n*num(t.magic_resist_penetrate_ratio),aspd:foes(b,u).length>=2?num(tb.attack_speed):0});
    for(const a of b.allyUnits)if(a.kind==='op')S.passiveBuff(b,a,`sakiko:aura:${u.id}`,{aspd:up(u)&&S.bodyInKeys(a,u.rangeKeySet)?num(t2.attack_speed):0});
    if(!foes(b,u).length&&u.canAct){u.mem.sakikoEmptyTick+=dt;if(u.mem.sakikoEmptyTick>=u.s.interval){u.mem.sakikoEmptyTick=0;note(b,u,1,u.mem.sakikoOrgan?'arts':'phys');u.skill.gainSp(1,'attack')}}
   },{owner:u});
  }
 }};
}
// Optional recruits resolve their kit by character ID, including saved loadouts and DIY bodies.
export default {...Object.fromEntries(['oblvns','chen3','wisdel','narant','ascln'].flatMap(k=>[5,6].map(t=>[`chess_custom_recruit_${k}_${t}_a`,kit]))),char_4182_oblvns:kit};
