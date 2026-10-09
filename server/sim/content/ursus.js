import { hypot } from '../detmath.js';
// Local experiment: inert unless the explicitly selected data directory contains the drone token.
import * as S from './support/index.js';
import {attackClipTiming} from '../../../shared/attackTiming.js';
import {tileFree} from './tokens.js';
import {MOVE_SCALE,COLS,ROWS} from '../constants.js';
import {canTargetEnemy} from '../targeting.js';
import {bodyDist} from '../body.js';
export const DRONE_ID='token_custom_ursus_drone';
export const DRONE_RANGE=2,DRONE_FLIGHT=3,DRONE_BLAST=1.2;
export function droneCenter(battle,pid){
 const R=battle.rect,p=battle.getPlayer(pid);let c0=R.c0,c1=R.c1;
 if(battle.players.length>1){if(p?.half==='R')c0=Math.max(11,c0);else c1=Math.min(10,c1)}
 return [(R.r0+R.r1)/2,Math.min(c1,(c0+c1)/2+1)];
}
export function droneTile(battle,pid){
 const R=battle.rect,[centerR,centerC]=droneCenter(battle,pid),tiles=[];
 for(let r=R.r0;r<=R.r1;r++)for(let c=R.c0;c<=R.c1;c++)if(tileFree(battle,r,c)&&(battle.players.length===1||(battle.getPlayer(pid)?.half==='R'?c>=11:c<=10)))tiles.push([r,c]);
 return tiles.sort((a,b)=>hypot(a[0]-centerR,a[1]-centerC)-hypot(b[0]-centerR,b[1]-centerC)||a[0]-b[0]||a[1]-b[1])[0]||null;
}
export function droneRange(u){return u?.mem?.attackRangeRadius ?? DRONE_RANGE;}
export const DRONE_FALL=.44;
export function installDroneBombardment(battle,u){
 u.profile.deferHit=true;u.profile.projectile='mortar';u.profile.visibleRangeRadius=DRONE_RANGE;
 u.profile.windupNeedsRange=true;
 u.profile.refundWindupCooldown=true;
 let sequence=0;
 battle.on('attack',({attacker,targets})=>{if(attacker!==u)return;
  const atk=u.s.atk,flight=DRONE_FLIGHT*100/Math.max(10,u.s.aspd);
  for(const target of targets){
   const shot=++sequence,fall=Math.min(DRONE_FALL,flight),lockAt=battle.time+flight-fall;
   const aim={target,x:target.x,y:target.y,shown:target.id};let locked=false;
   battle.fx('bombardShell',{x:aim.x,y:aim.y,id:u.id,shot,target:target.id,r:DRONE_BLAST,t:flight,fall,vertical:true});
   const update=()=>{
    if(locked)return;
    const valid=canTargetEnemy(u,aim.target,u.profile)&&bodyDist(aim.target,u.x,u.y)<=droneRange(u)+1e-9;
    if(!valid){
     const next=droneTargets(battle,u,true)[0];
     if(next)aim.target=next;
    }
    const follows=canTargetEnemy(u,aim.target,u.profile)&&bodyDist(aim.target,u.x,u.y)<=droneRange(u)+1e-9;
    if(follows){aim.x=aim.target.x;aim.y=aim.target.y;}
    const shown=follows?aim.target.id:null;
    if(shown!==aim.shown){aim.shown=shown;battle.fx('bombardAim',{id:u.id,shot,target:shown,x:aim.x,y:aim.y});}
    if(battle.time+1e-9>=lockAt){locked=true;battle.fx('bombardAim',{id:u.id,shot,target:null,x:aim.x,y:aim.y});}
   };
   const off=battle.on('tick',update);
   battle.after(flight,()=>{
    update();battle.off(off);
    battle.fx('bombard',{x:aim.x,y:aim.y,id:u.id,r:DRONE_BLAST,kind:'emppnt'});
    for(const e of battle.foesInRadius(aim.x,aim.y,DRONE_BLAST))if(e.alive&&!e.s.flags.untargetable&&!e.s.flags.sleep)battle.dealDamage(u,e,{amount:atk,type:'phys',isAttack:true,isSkill:false,isSplash:true,sourceless:true,tags:['ursus-shell']});
   });
  }
 },{owner:u});
}

export function droneTargets(b,u,inRange=false){
 const inside=e=>bodyDist(e,u.x,u.y)<=droneRange(u)+1e-9;
 // Only the field's main leader gets boss priority; bounty bosses retain ordinary targeting.
 const priority=e=>e.tag==='boss'?0:e.blockedBy?(inside(e)?1:2):3;
 return b.enemies.filter(e=>canTargetEnemy(u,e,u.profile)&&(!inRange||inside(e))).sort((a,c)=>{
  const bossA=priority(a)===0,bossC=priority(c)===0;
  if(bossA!==bossC)return bossA?-1:1;
  if(bossA && bossC)return bodyDist(a,u.x,u.y)-bodyDist(c,u.x,u.y)||a.spawnSeq-c.spawnSeq||a.id-c.id;
  return b.remainingDistance(a)-b.remainingDistance(c)||priority(a)-priority(c)||a.spawnSeq-c.spawnSeq||a.id-c.id;
 });
}

// Like the existing flying Yan summon, keep its spawn tile reserved but move the airborne world position.
export function installDroneFlight(battle,u){
 u.profile.fixedFacing=true;
 u.profile.noHeal=true;
 u.profile.attackSpeedDebuffImmune=true;u.markDirty();
 u.profile.acquireTargets=(b,unit)=>droneTargets(b,unit,true).slice(0,1);
 const speed=(u.def.raw.stats.moveSpeed??.5)*MOVE_SCALE*1.5;
 const refresh=()=>{const radius=droneRange(u),keys=[];for(let r=Math.max(0,Math.floor(u.y-radius));r<=Math.min(ROWS-1,Math.ceil(u.y+radius));r++)for(let c=Math.max(0,Math.floor(u.x-radius));c<=Math.min(COLS-1,Math.ceil(u.x+radius));c++)if(hypot(c-u.x,r-u.y)<=radius+1e-9)keys.push(r*COLS+c);u.rangeKeys=keys;u.rangeKeySet=new Set(keys);u.baseRangeKeys=keys;};
 u.motion='FLY';u.ground=false;for(const key of ['terrain:mire','terrain:smog','terrain:deepsea','terrain:infection'])battle.removeBuff(u,key);u.mem.terrain=0;refresh();
 battle.on('tick',({dt})=>{
  if(!u.alive||!u.deployed)return;
  // Keep pursuing the leading enemy even when other enemies are already in firing range.
  // Ally AI fires first each tick; the movement hook respects its wind-up and recovery.
  const clip=attackClipTiming(u),scale=clip?Math.max(1,Math.min(4,clip.dur/Math.max(.08,u.s.interval))):1;
  const recovery=clip?Math.max(0,clip.dur-clip.hit)/scale:.45;
  if(u.mem.attackWindup || battle.time-u.lastAttackAt<recovery-1e-9){refresh();return;}
  const target=droneTargets(battle,u)[0];
  if(target&&u.canAct&&!u.s.flags.noMove&&!u.s.flags.bind&&speed>0){
   const dx=target.x-u.x,dy=target.y-u.y,d=hypot(dx,dy),stop=droneRange(u)-.25;
   if(d>stop){const step=Math.min(d-stop,speed*dt),R=battle.rect;u.x=Math.max(R.c0,Math.min(R.c1,u.x+dx/d*step));u.y=Math.max(R.r0,Math.min(R.r1,u.y+dy/d*step));}
  }
  refresh();
 },{owner:u});
}
export function install(battle){
 if(!battle.data.rawToken?.(DRONE_ID))return;
 for(const p of battle.players){
  const pid=p.playerId;
  let drone=null;
  const active=()=>S.bondActive(battle,pid,'ursusShip');
  const six=()=>active()&&(S.bondState(battle,pid,'ursusShip').count>=6||S.bondTier(battle,pid,'ursusShip')>=2);
  const refresh=()=>{
   const layers=S.bondLayers(battle,pid,'ursusShip'),bonus=active() ? .2+.01*layers : 0,hpBonus=active() ? .2+.008*layers : 0;
   const members=battle.allyUnits.filter(u=>u.ownerId===pid&&u.kind==='op'&&S.unitBonds(u).includes('ursusShip'));
   // Apply the faction bonus first; donations use current total ATK of live, deployed operators only.
   // The drone is not an operator and cannot recursively contribute its own donation.
   for(const u of members){
    const old=u.findBuff('bond:ursus:stats');
    if(!bonus){if(old)battle.removeBuff(u,'bond:ursus:stats');continue;}
    if(old?.mods?.atkPct!==bonus||old?.mods?.hpPct!==hpBonus)S.passiveBuff(battle,u,'bond:ursus:stats',S.directMods({atk:bonus,hp:hpBonus}));
   }
   if(drone){
    drone.mem.visualScale=.85*(1+.002*layers);
    drone.mem.attackRangeRadius=DRONE_RANGE*(1+.001*layers);
    drone.profile.visibleRangeRadius=drone.mem.attackRangeRadius;
    const atkFlat=six()?members.filter(u=>u.alive&&u.deployed&&!u.hidden).reduce((sum,u)=>sum+u.s.atk,0)*(.1+.00015*layers):0;
    const aspd=six()?50:0,old=drone.findBuff('bond:ursus:drone');
    if(old?.mods?.atkPct!==bonus||old?.mods?.hpPct!==hpBonus||old?.mods?.atkFlat!==atkFlat||old?.mods?.aspd!==aspd)
     S.passiveBuff(battle,drone,'bond:ursus:drone',S.directMods({atk:bonus,hp:hpBonus},{atkFlat,aspd}));
   }
  };
  battle.on('battleStart',()=>{
   if(active()){
    const tile=droneTile(battle,pid);
    if(tile){drone=battle.spawnToken(pid,DRONE_ID,...tile,{dir:p.dir,anySource:true,kit:{trait:{visibleRangeRadius:DRONE_RANGE,fixedFacing:true}}});if(drone){const [r,c]=droneCenter(battle,pid);drone.x=c;drone.y=r;installDroneFlight(battle,drone);installDroneBombardment(battle,drone);refresh();drone.hp=drone.s.maxHp;}}
   }
   refresh();
  },{once:true});
  battle.on('deploy',refresh);
  battle.on('tick',()=>{
   refresh();
   if(!six()||!drone?.alive||!drone.deployed)return;
   for(const e of battle.enemies)if(e.alive&&e.deployed&&!e.hidden&&bodyDist(e,drone.x,drone.y)<=droneRange(drone)+1e-9)
    battle.addBuff(e,{key:`ursus:reveal:${drone.id}`,duration:.12,flags:{reveal:true},source:drone});
  },{owner:`ursus:${pid}`});
  // Layer state is committed after the event; refresh on the next simulation tick.
  battle.on('layerGain',c=>{if(c.playerId===pid&&c.bondId==='ursusShip')battle.after(0,refresh)},{priority:-100});
 }
}
