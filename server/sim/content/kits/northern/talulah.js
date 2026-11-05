// PRTS 塔露拉 + local char_4247_oxi data, 2026-11-01. All tunable values are blackboard values.
import {acquireTargets} from '../../../ai.js';
import {skillMotionSpeed} from '../../../motionSpeed.js';
import {dirVec} from '../../../dir.js';
import {canTargetEnemy} from '../../../targeting.js';
import {alive,num,talentBb,keyOf,fx,groundProfile,inCells} from './common.js';

// Match the fired lanes, including their rear origin and travel beyond the far edge.
function wavePaths(b,u,bb,half){
 const paths=[],[dr,dc]=dirVec(u.dir);
 for(let lane=-half;lane<=half;lane++){
  const row=u.tileR+dc*lane,col=u.tileC-dr*lane;if(!b.grid.inRect(row,col))continue;
  let back=0;while(back<11&&b.grid.inRect(row-dr*(back+1),col-dc*(back+1)))back++;
  const x=col-dc*back,y=row-dr*back,edge=dr?(dr>0?b.rect.r1+.5:b.rect.r0-.5):(dc>0?b.rect.c1+.5:b.rect.c0-.5);
  paths.push({x,y,dr,dc,left:Math.abs(edge-(dr?y:x))+num(bb.wave_exit_distance,5),lane});
 }
 return paths;
}
function hasWaveTargets(b,u,bb){
 // A cast includes both its normal and overdrive volleys. Use their complete footprint,
 // while retaining identification rules. Flying enemies also qualify for activation.
 const paths=wavePaths(b,u,bb,Math.floor(Math.max(num(bb.normal_half_width),num(bb.overload_half_width)))),radius=num(bb.projectile_range,.5);
 return b.enemies.some(e=>canTargetEnemy(u,e,{canHitFly:true})&&paths.some(p=>{
  const along=Math.max(0,Math.min(p.left,(e.x-p.x)*p.dc+(e.y-p.y)*p.dr));
  const dx=e.x-p.x-p.dc*along,dy=e.y-p.y-p.dr*along;
  return dx*dx+dy*dy<=radius*radius;
 }));
}

export function talulahKit(_bb,raw){
 const skills=Object.fromEntries(raw.skills.map(s=>{
  const bb=s.bb||{};
  if(s.index===0)return[s.skillId,{kind:'instant',trigger:'DEFAULT',onStart({battle:b,unit:u}){
   const target=acquireTargets(b,u,u.profile)[0];if(!target)return;
   const targets=inCells(b,u,new Set([keyOf(b,target)]));
   for(const enemy of targets){b.dealDamage(u,enemy,{amount:u.s.atk*num(bb.atk_scale),type:'arts',isSkill:true,tags:['talulah-s1']});if(alive(enemy))b.applyStatus(enemy,'fear',{source:u,duration:num(bb.fear)});}
   fx(b,u,'talulahS1',{target:target.id,x:target.x,y:target.y});
  }}];
  if(s.index===1)return[s.skillId,{kind:'instant',trigger:'NEVER',charges:5,onCastStart({battle:b,unit:u}){u.mem.talulah.counterAt=b.time;},onStart({battle:b,unit:u}){
   const st=u.mem.talulah,target=st.counterTarget;
   st.stacks=st.stacks.filter(end=>end>b.time);if(st.stacks.length>=num(bb.max_stack_cnt,5))st.stacks.shift();st.stacks.push(b.time+num(bb.stack_duration));
   if(alive(target)){
    let healed=0;
    for(const e of b.foesInRadius(target.x,target.y,num(bb.ability_range_radius,1),groundProfile))healed+=b.dealDamage(u,e,{amount:u.s.atk*num(bb.retaliate_atk_scale),type:'arts',isSkill:true,tags:['talulah-counter']});
    if(healed>0)b.heal(u,u,healed*num(bb.heal_ratio));
   }
   fx(b,u,'talulahGuard',{target:target?.id,dur:num(bb.skill_duration)});
  }}];
  return[s.skillId,{kind:'duration',duration:s.duration,hasTargets:({battle,unit})=>hasWaveTargets(battle,unit,bb),mods:{atkPct:num(bb.atk)},attack:{noAttack:true},onStart({battle:b,unit:u,skill}){
   const st=u.mem.talulah;st.waveClock=0;st.channelSeq=u.deploySeq;st.wavePhase=0;
   // Skill runtime retains its regular duration; overdrive starts exactly at its midpoint.
   st.waveDuration=skill.duration;fx(b,u,'talulahChannel',{dur:skill.duration});st.emitWave();
  },onEnd({battle:b,unit:u}){fx(b,u,'talulahChannelEnd');}}];
 }));
 return{skills,install(b,u){
  const t=talentBb(raw,0),trail=talentBb(raw,1),bb=u.skill.bb||{};
  const st=u.mem.talulah={arcane:0,attackArcane:0,lastAttack:b.time,arcaneClock:0,stacks:[],counterAt:-Infinity,fields:new Map(),burning:new Map(),fieldClock:0,waves:[],waveClock:0,waveSerial:0,wavePhase:0};
  u.profile.dmgType='arts';const original={...u.profile};
  u.profile.acquireTargets=(battle,unit)=>st.stacks.length?battle.blockedTargets(unit,unit.profile).length?battle.blockedTargets(unit,unit.profile):acquireTargets(battle,unit,original):acquireTargets(battle,unit,original);
  b.on('beforeAttack',c=>{if(c.attacker!==u)return;st.attackArcane=st.arcane;if(raw.skill.index===1)fx(b,u,'talulahAttackMode',{buffed:st.stacks.length>0});},{owner:u});
  b.on('attack',c=>{if(c.attacker!==u)return;st.arcane=Math.max(0,st.arcane-num(t.arcane_step));st.lastAttack=b.time;st.arcaneClock=0;},{owner:u});
  b.on('hit',c=>{
   if(c.source===u&&(c.dmg.type==='arts'||c.dmg.type==='elemental'))c.dmg.mul=(c.dmg.mul??1)*(1+(c.dmg.isAttack?st.attackArcane:st.arcane));
   // The native guard manager triggers before physical/arts mitigation. DoT/element/HP loss cannot consume a charge.
   if(c.target!==u||raw.skill.index!==1||!alive(u)||!alive(c.source)||c.source.side!=='enemy'||!c.dmg.isAttack||!['phys','arts'].includes(c.dmg.type))return;
   if(u.skill.ready&&!u.skill.active&&u.canAct&&!u.s.flags.silence){st.counterTarget=c.source;u.skill.activate('talulah-guard');}
   const left=num(bb.skill_duration,1.3)-(b.time-st.counterAt),hold=num(bb.shelter_hold_duration,.2);
   if(left>0){const factor=Math.min(1,left/Math.max(.001,num(bb.skill_duration,1.3)-hold));c.dmg.mul=(c.dmg.mul??1)*(1-num(bb.damage_resistance)*factor);}
  },{owner:u});
  b.on('damaged',c=>{if(c.source===u&&c.type==='arts'&&c.amount>0&&alive(c.target))b.dealDamage(u,c.target,{type:'element',element:'burn',amount:c.amount*num(t.ep_damage_ratio),tags:['talulah-burn']});},{owner:u});
  b.on('elementBurst',c=>{if(alive(u)&&c.element==='burn'&&c.target.side==='enemy'&&num(trail.max_count)>0)st.burning.set(c.target,b.time+5);},{owner:u});
  function wave(){
   const half=Math.floor(num(st.wavePhase?bb.overload_half_width:bb.normal_half_width)),serial=++st.waveSerial,seen=new Set();
   for(const path of wavePaths(b,u,bb,half)){
    const {x,y,dr,dc,left:range,lane}=path;
    st.waves.push({...path,serial,seen});
    fx(b,u,'talulahWave',{born:b.time,x,y,dx:dc,dy:dr,speed:num(bb.wave_speed),dur:range/num(bb.wave_speed),wave:serial,lane});
   }
  }
  st.emitWave=wave;
  // Fired projectiles keep flying after the channel ends, like the engine's projectile runtime.
  function advanceWaves(dt){
   for(const w of st.waves){const distance=num(bb.wave_speed)*dt;w.x+=w.dc*distance;w.y+=w.dr*distance;w.left-=distance;
    const hit=b.foesInRadius(w.x,w.y,num(bb.projectile_range,.5),groundProfile)[0];if(!hit)continue;w.left=0;
    for(const e of b.foesInRadius(w.x,w.y,num(bb.range_radius,1.5),groundProfile)){
     const scale=w.seen.has(e.id)?num(bb.same_wave_repeat_damage_scale,.15):1;w.seen.add(e.id);
     b.dealDamage(u,e,{amount:u.s.atk*num(bb.heatwave_atk_scale)*scale,type:e.findBuff('burnBurst')?'elemental':'arts',isSkill:true,tags:['talulah-wave']});
    }fx(b,u,'talulahWaveHit',{x:w.x,y:w.y,wave:w.serial,lane:w.lane});
   }st.waves=st.waves.filter(w=>w.left>0);
  }
  b.on('tick',({dt})=>{
   if(!alive(u)){advanceWaves(dt);return;}
   if(b.time-st.lastAttack>=num(t.arcane_idle_delay,3)){st.arcaneClock+=dt;const iv=num(t.arcane_step_interval,.5);while(st.arcaneClock+1e-9>=iv){st.arcaneClock-=iv;st.arcane=Math.min(num(t.arcane_max),st.arcane+num(t.arcane_step));}}
   st.stacks=st.stacks.filter(end=>end>b.time);
   if(raw.skill.index===1){const n=st.stacks.length,key='talulah:counter-stacks';if(n){const old=u.findBuff(key),mods={atkPct:num(bb.atk)*n,defPct:num(bb.def)*n};if(old){old.mods=mods;old.timeLeft=.15;u.markDirty();}else b.addBuff(u,{key,duration:.15,mods});}else b.removeBuff(u,key);}
   for(const [enemy,end]of st.burning){if(!alive(enemy)||end<=b.time){st.burning.delete(enemy);continue;}const row=Math.round(enemy.y),col=Math.round(enemy.x),key=row*b.grid.cols+col;
    if(!b.grid.inRect(row,col)||!b.grid.isLow(row,col)||b.grid.isObstacle(row,col))continue;
    if(!st.fields.has(key)){if(st.fields.size>=num(trail.max_count,25))st.fields.delete(st.fields.keys().next().value);fx(b,u,'talulahTrail',{x:col,y:row,dur:num(trail.field_duration)});}
    st.fields.set(key,b.time+num(trail.field_duration));
   }
   for(const [key,end]of st.fields)if(end<=b.time)st.fields.delete(key);
   st.fieldClock+=dt;const iv=num(trail.field_interval,.3);
   if(st.fieldClock+1e-9>=iv){st.fieldClock-=iv;for(const e of inCells(b,u,st.fields.keys()))b.dealDamage(u,e,{amount:u.s.atk*num(trail.field_atk_scale),type:'arts',isSkill:false,tags:['talulah-trail','dot']});}
   if(raw.skill.index===2&&u.skill.active&&u.canAct){const phase=u.skill.timeLeft<=st.waveDuration/2?1:0;if(phase&&!st.wavePhase)fx(b,u,'talulahOverdrive');st.wavePhase=phase;st.waveClock+=dt;const interval=num(st.wavePhase?bb.overload_interval:bb.normal_interval)/skillMotionSpeed(b,u);if(st.waveClock+1e-9>=interval){st.waveClock-=interval;wave();}}
   advanceWaves(dt);
  },{owner:u});
  b.on('deploy',c=>{if(c.unit===u){st.arcane=0;st.attackArcane=0;st.lastAttack=b.time;st.arcaneClock=0;st.stacks=[];st.counterAt=-Infinity;st.waveClock=0;}},{owner:u});
  b.on('death',c=>{if(c.unit===u){st.fields.clear();st.burning.clear();}},{owner:u});
 }};
}
