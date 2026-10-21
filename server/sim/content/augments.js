import { attackClipTiming } from '../../../shared/attackTiming.js';
import { weaknessRetype } from './items/battle.js';
export function install(b){
 const state=b.flags.augments;if(!state)return;
 const empty=[],allied=Object.fromEntries(Object.entries(state.allies||{}).map(([id,cards])=>[id,cards.map(a=>a.effect)])),enemyEffects=(state.enemies||[]).map(a=>a.effect);
 if(!enemyEffects.length&&!Object.values(allied).some(list=>list.length))return;
 const normalOwner=b.kind==='normal'&&b.players.length===1?b.players[0].playerId:null;
 const forUnit=u=>allied[u.ownerId||u.ownerUnit?.ownerId||u.player?.playerId||normalOwner]||empty;
 const add=(u,key,mods,extra={})=>b.addBuff(u,{key:'augment:'+key,mods,persist:true,refresh:'replace',...extra});
 const initialize=u=>{
  const oldMax=u.s.maxHp,ratio=oldMax>0?u.hp/oldMax:1;
  const effects=u.side==='enemy'?enemyEffects:forUnit(u);
  if(u.s.flags.hitCount||u.s.flags.hitCountArts){const hpBonus=effects.reduce((n,e)=>n+(e.mods?.hpPct||0),0);if(hpBonus){u.mem.augmentFrequencyHpBase??=u.base.maxHp;u.base.maxHp=u.mem.augmentFrequencyHpBase*(1+hpBonus);u.markDirty();}}
  effects.forEach((e,i)=>{
   if(e.kind==='equipmentAtk'&&u.kind==='op')add(u,`${i}:equipment-atk`,{atkPct:e.amount*(u.items?.length||0)});
   if(e.mods&&e.kind!=='normalEnemy'&&e.kind!=='alliedDebuff'&&(!e.opsOnly||u.kind==='op'))add(u,`${i}:stats`,e.mods);
   if(u.side==='enemy'){
    if(e.kind==='shields'&&!u.mem['augment:shields:'+i]){b.addBuff(u,{key:'augment:shields:'+i,shieldHits:e.count,visible:true,persist:true});u.mem['augment:shields:'+i]=true;}
    if(e.kind==='regen'&&!u.s.flags.hitCount&&!u.s.flags.hitCountArts)add(u,`${i}:regen`,{hpRegen:e.amount});
    if(e.kind==='silenceImmune')u.def={...u.def,immune:new Set([...(u.def.immune||[]),'silence'])};
   }else{
    if(e.kind==='stealth'&&u.kind==='op')add(u,`${i}:stealth`,{},{flags:{stealth:true}});
    if(e.kind==='deployAspd'&&u.kind==='op')add(u,`${i}:deploy`,{aspd:e.amount},{duration:e.duration??30,persist:false});
   }
  });
  if(u.side==='ally'){
   enemyEffects.forEach((e,i)=>{if(e.kind==='alliedDebuff'){const mods={...e.mods};if(u.kind==='device'&&mods.hpPct<0)delete mods.hpPct;if(Object.keys(mods).length)add(u,`enemy-ally:${i}`,mods);}});
   u.mem.augmentAttackUntil=0;
   const aspd=effects.find(e=>e.kind==='skillAspd'),owner=u.ownerId;if(aspd&&b._augmentAspd?.has(owner))refreshAspd(owner,aspd);
   u.mem.augmentSpCost=effects.filter(e=>e.kind==='spCost').reduce((n,e)=>n*e.multiplier,1);u.skill?._normalize();
  }else if(b.kind==='normal'){
   // Solo-field reductions belong only to the field's player; shared fields never inherit these.
   if(normalOwner)for(const [i,e]of (allied[normalOwner]||empty).entries())if(e.kind==='normalEnemy')add(u,'normal:'+i,e.mods||{},{flags:e.flags});
  }
  if(u.s.maxHp!==oldMax)u.hp=Math.min(u.s.maxHp,u.s.maxHp*ratio);
 };
 b.on('deploy',({unit})=>initialize(unit));
 b.on('skillActivating',({unit:u})=>{
  if(u.side!=='ally'||u.kind!=='op')return;
  const effects=forUnit(u).filter(e=>e.kind==='skillAtk');if(effects.length)add(u,'skillAtk',{atkPct:effects.reduce((n,e)=>n+e.amount,0)},{duration:Math.max(...effects.map(e=>e.duration)),persist:false});
 });
 b.on('skillStart',({unit:u})=>{
  if(u.side!=='ally'||u.kind!=='op')return;
  for(const e of forUnit(u)){
   if(e.kind==='skillSp')b.after(0,()=>{if(u.alive&&u.deployed)u.skill?.gainSp(e.amount,'augment',false,{duringSkill:true});},{owner:u});
   if(e.kind==='skillAspd'){
    const owner=u.ownerId;let map=b._augmentAspd;if(!map)map=b._augmentAspd=new Map();const list=map.get(owner)||[];list.push(b.time+e.duration);map.set(owner,list);refreshAspd(owner,e);
   }
  }
 });
 function refreshAspd(owner,e){const list=(b._augmentAspd.get(owner)||[]).filter(end=>end>b.time+1e-9);b._augmentAspd.set(owner,list);for(const u of b.allyUnits)if(u.ownerId===owner&&u.kind==='op'&&u.deployed&&u.alive){if(list.length)add(u,'skillAspd',{aspd:Math.min(e.cap,list.length*e.amount)});else b.removeBuff(u,'augment:skillAspd');}}
 const extraRecovery=Object.fromEntries(Object.entries(allied).map(([owner,effects])=>[owner,effects.reduce((n,e)=>n+(e.mods?.spRecoveryFlat||0),0)]));
 const hpDrain=enemyEffects.filter(e=>e.kind==='alliedDrain').reduce((n,e)=>n+e.amount,0);
 b.on('tick',({dt})=>{
  if(hpDrain>0)for(const u of b.allyUnits)if(u.alive&&u.deployed&&u.kind!=='device')b.loseHp(u,hpDrain*dt,{silent:true,tags:['augment:alliedDrain']});
  for(const u of b.allyUnits)if(u.alive&&u.deployed&&!u.hidden&&u.skill&&u.skill.spType!=='time'){
   const rate=extraRecovery[u.ownerId||u.ownerUnit?.ownerId||u.player?.playerId||normalOwner]||0;
   if(rate>0)u.skill.gainSp(rate*dt,'time');
  }
  if(b._augmentAspd)for(const [owner,list]of b._augmentAspd)if(list.length&&list[0]<=b.time+1e-9){const e=(allied[owner]||empty).find(e=>e.kind==='skillAspd');if(e)refreshAspd(owner,e);}
 });
 b.on('hit',c=>{
  if(c.source?.side==='ally'&&c.source.kind==='op'&&c.target?.side==='enemy'&&(c.target.s.flags.cold||c.target.s.flags.freeze)){const e=forUnit(c.source).find(e=>e.kind==='kjerag');if(e){const base=c.dmg.kjeragScale||1;c.dmg.mul*=(base+e.bonus)/base;}}
  if(c.source?.side==='ally'&&forUnit(c.source).some(e=>e.kind==='weakness'))weaknessRetype(c.dmg,c.source,c.target);
  if(c.source?.side==='ally'&&c.dmg.type==='true')for(const e of forUnit(c.source))if(e.kind==='trueDamage')c.dmg.mul*=e.multiplier;
  if(c.source?.side==='enemy'&&c.dmg.type==='arts')for(const e of enemyEffects)if(e.kind==='artsDamage')c.dmg.mul*=e.multiplier;
  if(c.source?.side==='enemy')for(const e of enemyEffects)if(e.kind==='elemental'&&(c.dmg.type==='element'||c.dmg.type==='elemental'))c.dmg.amount*=e.multiplier;
 });
 // Element buildup exits the HP damage pipeline before hit; scale it at creation too (damage.js invokes this).
 b.augmentElementMultiplier=source=>source?.side==='enemy'?enemyEffects.filter(e=>e.kind==='elemental').reduce((n,e)=>n*e.multiplier,1):1;
 b.on('beforeStatus',c=>{if(c.source?.side==='enemy'&&c.target?.side==='ally'&&Number.isFinite(c.duration))for(const e of enemyEffects)if(e.kind==='statusDuration')c.duration*=e.multiplier;});
 b.on('attack',({attacker:u,attackInterval,targets=[]})=>{
  if(u.side!=='ally'||!u.alive)return;
  if(u.kind==='op')for(const e of forUnit(u))if(e.kind==='kjerag')for(const target of targets)if(target?.alive&&target.side==='enemy'&&b.rng()<e.chance)b.applyStatus(target,'cold',{duration:e.duration,source:u});
  if(u.kind==='op')for(const effect of forUnit(u))if(effect.kind==='attackHeal')b.heal(u,u,effect.amount,{self:true});
  const e=forUnit(u).find(e=>e.kind==='extraAttack');if(!e||u.profile?.heal||b.rng()>=e.probability)return;
  const clip=attackClipTiming(u),interval=attackInterval||u.s.interval;
  const speed=clip?.dur>0?(attackInterval?clip.dur/interval:Math.max(1,Math.min(4,clip.dur/Math.max(.08,interval)))):1;
  const recovery=clip?.dur>0?Math.max(0,clip.dur-clip.hit)/speed:interval/2;
  const start=Math.max(b.time+recovery,u.mem.augmentAttackUntil||0),seq=u.deploySeq;
  u.mem.augmentAttackUntil=start+.18;
  const run=()=>{
   if(!u.alive||!u.deployed||u.deploySeq!==seq||!u.canAct)return;
   // An automatic skill cast triggered by this hit also retains its authored animation.
   if(u.mem.skillCastUntil>b.time+1e-9){const wait=u.mem.skillCastUntil-b.time;u.mem.augmentAttackUntil=Math.max(u.mem.augmentAttackUntil,u.mem.skillCastUntil+.18);b.after(wait,run,{owner:u});return;}
   b.forceAttack(u,null,{castImpact:true,attackInterval:.18});
  };
  b.after(Math.max(b.dt,start-b.time),run,{owner:u});
 });
 b.on('damaged',c=>{
  const u=c.source,t=c.target;if(u?.side!=='ally'||u.kind!=='op'||t?.side!=='enemy'||!(c.amount>0)||!t.alive)return;
  const e=forUnit(u).find(e=>e.kind==='corrosion');if(!e)return;
  const n=t.mem.augmentCorrosion=Math.min(50,(t.mem.augmentCorrosion||0)+1),scale=1-Math.min(e.cap,n*e.perHit);add(t,'corrosion',{defMul:scale,resMul:scale});
 });
 // Initial units are configured before deploy; deploy also handles spawned tokens, enemies and redeployments.
 for(const u of b.allyUnits)if(u.deployed)initialize(u);
}
