// Makoto's persona state is independent of the instant skill's active flag.
import {attackClipTiming} from '../../../../shared/attackTiming.js';
import {weaknessRetype} from '../items/battle.js';
import {talentBb,traitBb,num} from './tier1.js';
const alive=u=>u?.alive&&u.deployed&&!u.hidden;
import {MAKOTO_RANGE as AREA} from '../../../../shared/makoto.js';
const MARK='makoto:persona',SWITCH='makoto:transition';
export function makotoKit(_bb,raw){
 const skills=Object.fromEntries(raw.skills.map(s=>[s.skillId,{kind:'instant',hasTargets:({battle,unit})=>!unit.mem.makoto?.phase&&!unit.mem.attackWindup&&battle.time+1e-9>=(unit.mem.makoto?.recoveryUntil||0),onStart({unit}){unit.mem.makoto?.enter();}}]));
 return {skill:skills[raw.skill.skillId],skills,install(b,u){
  const bb=u.skill.bb,t=talentBb(raw),total=talentBb(raw,1),tb=traitBb(raw),index=raw.skill.index;
  const normal={...u.profile},normalGrid=u.rangeGrid,st=u.mem.makoto={phase:null,until:0,token:0,executeClock:0,attempted:new Set()};
  const canAttack=normal.canAttack;
  normal.canAttack=(battle,unit)=>!unit.trait.dollSwitching&&battle.time+1e-9>=(unit.deployUntil||0)&&(st.phase||!unit.skill.ready||battle.time+1e-9>=(st.recoveryUntil||0))&&(!canAttack||canAttack(battle,unit));
  u.profile.canAttack=normal.canAttack;
  b.on('attack',c=>{
   if(c.attacker!==u)return;
   const clip=attackClipTiming(u);
   if(!clip?.dur)return;
   const speed=Math.max(1,Math.min(4,clip.dur/Math.max(.08,u.s.interval)));
   st.recoveryUntil=b.time+Math.max(0,clip.dur-clip.hit)/speed;
  },{owner:u});
  const valid=token=>alive(u)&&st.token===token;
  const fx=(kind,extra={})=>b.fx(kind,{id:u.id,x:u.x,y:u.y,...extra});
  const form=(value,duration=Math.max(0,st.until-b.time))=>{u.form=value;fx('substitute',{form:value,dur:duration});};
  const enemies=()=>b.enemiesInKeys(u.rangeKeys,u,{...u.profile,canHitFly:true,groundOnly:false});
  const allies=()=>b.injuredAlliesInKeys(u.rangeKeys,u).filter(a=>!a.s.flags.healFree&&!a.s.flags.noHeal&&!a.profile?.noHeal);
  const clearAura=()=>{for(const a of b.allyUnits)b.removeBuff(a,`makoto:dodge:${u.id}`);};
  const silence=()=>{if(u.skill.active)u.skill.end('substitute');delete u.mem.attackWindup;b._ev(['atkCancel',u.id]);};
  const transition=(duration,done)=>{
   silence();for(const buff of u.buffs.slice())if(buff.status)b.removeBuff(u,buff);u.trait.dollSwitching=true;b.addBuff(u,{key:SWITCH,duration,flags:{invulnerable:true,noHeal:true,healFree:true,noSp:true,disarm:true,silence:true}});
   u.markDirty();u.hp=u.s.maxHp;const token=st.token;
   b.after(duration,()=>{if(!valid(token))return;u.trait.dollSwitching=false;b.removeBuff(u,SWITCH);u.hp=u.s.maxHp;done();},{owner:u});
  };
  const stance=phase=>{
   st.phase=phase;u.trait.doll=true;
   Object.assign(u.profile,normal,{canHitFly:phase==='s3a',groundOnly:phase!=='s3a',noAttack:phase==='s3b',maxTargets:index===0?1:num(bb['attack@max_target'],1),dmgType:'arts',projectile:phase==='s1'?'arts':'none',attack:phase==='s1'?'ranged':'melee',atkScale:num(bb['attack@atk_scale'],1)});
   delete u.profile.heal;
   u.rangeGrid=AREA;b._refreshRange(u);
   b.addBuff(u,{key:MARK,mods:{atkPct:num(t.atk)+num(tb.atk),hpPct:num(t.max_hp_t1)+num(tb.max_hp),batPct:num(t.base_attack_time)/u.base.bat,aspd:phase==='s3a'?num(bb['talent@attack_speed']):0,blockCnt:phase==='s3b'?num(bb['attack@block_cnt'],2)-u.base.blockCnt:-99},flags:{noSp:true,silence:true,...(phase==='s3b'?{disarm:true}:{})}});
   u.markDirty();form('makoto_'+phase);u.atkCd=0;
  };
  const healWave=()=>{
   const targets=allies().slice(0,num(bb['attack@max_target_heal'],4)),token=st.token;
   b.after(.5,()=>{if(!valid(token)||st.phase!=='s3b')return;for(const a of targets)if(alive(a))b.heal(u,a,u.s.atk*num(bb['attack@heal_scale']));fx('makotoHeal',{targets:targets.filter(alive).map(a=>a.id)});},{owner:u});
  };
  st.recast=()=>{
   if(index!==2||st.phase!=='s3a'||u.trait.dollSwitching||!alive(u))return false;
   // Both personas consume the same deadline, including this transition.
   st.phase='changing';form('makoto_change',1.5);transition(1.5,()=>{stance('s3b');fx('makotoPersonaReady');fx('makotoHealRange');healWave();st.healAt=b.time+1;});return true;
  };
  const restore=()=>{
   clearAura();b.removeBuff(u,MARK);b.removeBuff(u,SWITCH);u.profile={...normal};delete u.profile.heal;u.rangeGrid=normalGrid;b._refreshRange(u);u.trait.doll=false;u.trait.dollSwitching=false;u.form=null;st.phase=null;st.attempted.clear();u.markDirty();
  };
  const allOutAttack=()=>{
   fx('makotoAllOutStart');
   st.token++;clearAura();b.removeBuff(u,MARK);u.profile={...normal};u.rangeGrid=normalGrid;b._refreshRange(u);u.markDirty();st.phase='total';u.trait.doll=false;form('makoto_total');
   b.addBuff(u,{key:SWITCH,duration:1.6,flags:{invulnerable:true,noSp:true,disarm:true,silence:true}});u.trait.dollSwitching=true;const token=st.token;
   // All-out attacks use base form stats; other Makoto leaders never respond to this one.
   b.after(.167,()=>{if(valid(token))fx('makotoAllOutFlash');},{owner:u});
   const members=b.allyUnits.filter(a=>alive(a)&&(a===u||(a.def?.raw?.teamId==='sees'&&a.def.raw.charId!==raw.charId)));
   b.after(.3,()=>{if(!valid(token))return;const amount=u.s.atk*num(total.atk_scale,4.3);
    for(const member of members){if(!alive(member))continue;if(member!==u&&b.time<(member.mem.seesReadyAt||0))continue;member.mem.seesReadyAt=b.time+1.6;
     const keys=new Set(AREA.map(([r,c])=>(member.tileR+r)*(b.grid.cols)+(member.tileC+c)));
     for(const e of b.enemiesInKeys([...keys],u,{canHitFly:true,groundOnly:false}))b.dealDamage(u,e,{amount,type:'true',isSkill:false,tags:['makoto-total']});}
    fx('makotoAllOut',{members:members.filter(alive).map(a=>a.id)});
   },{owner:u});
   b.after(1.6,()=>{if(!valid(token))return;restore();u.atkCd=0;st.recoveryUntil=0;u.hp=u.s.maxHp;fx('swap',{form:null});},{owner:u});
  };
  const totalAttack=()=>{
   const phase=st.phase==='changing'?'s3b':st.phase;
   st.phase='exiting';clearAura();b.removeBuff(u,MARK);u.trait.doll=false;
   u.profile={...normal};u.rangeGrid=normalGrid;b._refreshRange(u);u.markDirty();
   form('makoto_exit_'+phase,1);transition(1,allOutAttack);
  };
  st.enter=()=>{
   if(st.phase||!alive(u))return false;st.token++;st.phase='entering';st.duration=num(tb.duration,20);st.readyAt=b.time+2;st.until=st.readyAt+st.duration;st.attempted.clear();
   // Only base -> persona activates T1's entry slow.
   for(const e of enemies())if(num(t.sluggish)>0)b.applyStatus(e,'sluggish',{duration:num(t.sluggish),source:u});
   const phase=index===0?'s1':index===1?'s2':'s3a';stance(phase);transition(2,()=>{st.phase=phase;fx('makotoPersonaReady');if(phase==='s2'||phase==='s3a')fx('makotoAttackRange');});
   b.releaseBlocked(u);b.emit('dollSwap',{unit:u,form:'doll'});return true;
  };
  // SP/skill automation never flips S3 persona; only lethal damage may do so.
  const activate=u.skill.activate.bind(u.skill);u.skill.activate=(reason,opts)=>st.phase||u.mem.attackWindup||b.time+1e-9<(u.deployUntil||0)||b.time+1e-9<(st.recoveryUntil||0)?false:activate(reason,opts);
  b.on('fatal',c=>{if(c.unit!==u||c.prevented)return;if(u.trait.dollSwitching){c.prevented=true;u.hp=Math.max(1,u.hp);return;}if(!st.phase)c.prevented=st.enter();else if(st.phase==='s3a')c.prevented=st.recast();},{owner:u,priority:-100});
  b.on('beforeStatus',c=>{if(c.target===u&&u.trait.dollSwitching&&['stun','freeze','sleep'].includes(c.status))c.cancel=true;},{owner:u});
  b.on('hit',c=>{if(c.source===u&&st.phase==='s3a'&&c.dmg.isAttack)weaknessRetype(c.dmg,u,c.target);},{owner:u});
  b.on('damaged',c=>{if(c.source===u&&st.phase==='s3a'&&c.dmg.isAttack)fx(c.dmg.type==='phys'?'makotoPhysicalHit':'makotoArtsHit',{target:c.target.id});if(c.source===u&&st.phase==='s2'&&c.dmg.isAttack&&b.rng()<num(bb['attack@prob']))b.applyStatus(c.target,'fear',{duration:num(bb['attack@fear']),source:u});},{owner:u});
  b.on('tick',({dt})=>{
   if(!alive(u)||!st.phase)return;
   if(!['exiting','total'].includes(st.phase)&&b.time>=st.until){totalAttack();return;}
   if(u.trait.dollSwitching||!u.canAct)return;
   if(st.phase==='s1'){
    const healing=allies().some(a=>a.hp/a.s.maxHp<=.5+1e-9);u.profile.heal=healing?{mode:'single',hpAtMost:.5}:null;u.profile.dmgType=healing?'heal':'arts';u.profile.atkScale=healing?1:num(bb['attack@atk_scale']);u.profile.healScale=healing?num(bb['attack@heal_scale']):1;
   }
   if(st.phase==='s2'){
    st.executeClock+=dt;if(st.executeClock>=.1-1e-9){st.executeClock%=.1;const inside=enemies(),ids=new Set(inside.map(e=>e.id));for(const id of st.attempted)if(!ids.has(id))st.attempted.delete(id);
     for(const e of inside)if(e.s.flags.fear&&e.hp<=u.s.atk*num(bb['attack@kill_atk_scale'])&&!st.attempted.has(e.id)){st.attempted.add(e.id);fx('makotoExecute',{target:e.id});b.dealDamage(null,e,{amount:num(bb['attack@kill_damage'],9999999),type:'true',sourceless:true,canDodge:false,tags:['execute','makoto-execute']});}}
   }
   if(st.phase==='s3b'){
    for(const a of b.allyUnits){const inside=alive(a)&&a.kind==='op'&&u.rangeKeySet.has(a.tileR*b.grid.cols+a.tileC);if(inside)b.addBuff(a,{key:`makoto:dodge:${u.id}`,duration:.12,mods:{dodgePhys:num(bb['attack@prob']),dodgeArts:num(bb['attack@prob'])}});else b.removeBuff(a,`makoto:dodge:${u.id}`);}
    if(b.time>=st.healAt){st.healAt+=1;healWave();}
   }
  },{owner:u});
  const reset=()=>{st.token++;restore();};b.on('death',c=>{if(c.unit===u)reset();},{owner:u});b.on('deploy',c=>{if(c.unit===u)reset();},{owner:u});
 }};
}
export default {char_4217_makoto:makotoKit};
