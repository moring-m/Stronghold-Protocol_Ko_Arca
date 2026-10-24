import {MAKOTO_RANGE} from '../../../shared/makoto.js';
const CYAN=0x62d9ff,PURPLE=0xb38aff,RED=0xff526b,GREEN=0x70efb1,GOLD=0xffd76b;
/** null = unrelated event; false = preserve the simplified fallback. */
export function makotoOfficialFx(w,owner,kind,x,y,extra={}) {
  if(owner?.info?.charId!=='char_4217_makoto')return null;
  const known=kind.startsWith('makoto')||(kind==='swap'&&extra.form==null);
  if(!known)return null;
  if(!w.ofx.active)return false;
  const play=(key,v,follow=false)=>!!v&&!!w.playOn(key,v,{...(v!==owner?{flipFrom:owner}:{}),follow});
  if(kind==='makotoPersonaReady'||kind==='swap')return play('makoto_change_01',owner,true);
  if(kind==='makotoHeal')return (extra.targets||[]).map(id=>play('makoto_skill_03_p2_heal_01',w.view(id))).some(Boolean);
  if(kind==='makotoExecute')return play('makoto_skill_02_hit_01_finish',w.view(extra.target));
  if(kind==='makotoAllOut')return (extra.members||[]).map(id=>play('makoto_talent_chance_01',w.view(id))).some(Boolean);
  if(kind==='makotoPhysicalHit'||kind==='makotoArtsHit')return play(kind==='makotoPhysicalHit'?'makoto_skill_03_p1_hit_01':'makoto_skill_03_p1_hit_02',w.view(extra.target));
  if(['makotoAllOutStart','makotoAllOutFlash','makotoAttackRange','makotoHealRange'].includes(kind))return true;
  return null;
}

/** Uses existing pooled procedural particles/rings: no additional resource download. */
export function makotoSimpleFx(fx,kind,x,y,extra={}) {
  if(!kind.startsWith('makoto')&&kind!=='swap')return false;
  const owner=fx._viewOf(extra.src??extra.id);
  if(!kind.startsWith('makoto')&&!(kind==='swap'&&owner?.info?.charId==='char_4217_makoto'))return false;
  const ts=fx._ts(),view=id=>fx._viewOf(id);
  const at=v=>v&&Number.isFinite(v.x)&&Number.isFinite(v.y)?v:{x,y,z:fx._groundZ(x,y)};
  const pulse=(unit,color,r=.7,n=7)=>{
    const v=at(unit),z=v.z??fx._groundZ(v.x,v.y);
    fx.ring(v.x,v.y,z+.015,.08,r,color,.4/ts);
    fx._anchored(v.x,v.y,z,()=>{const p=fx.ctx.cam().project(v.x,v.y,z+.55,{});fx.burst(p.x,p.y,p.s,n,color,{life:.28/ts,speed:1.5*ts,size:.27});});
  };
  const area=(unit,color,duration=.45)=>{
    const v=at(unit);fx.tileFlash(MAKOTO_RANGE.map(([r,c])=>[Math.round(v.y)+r,Math.round(v.x)+c]),color,duration/ts);
  };
  if(kind==='makotoPersonaReady'||kind==='swap'){pulse(owner,CYAN,.8,10);return true;}
  if(kind==='makotoAttackRange'||kind==='makotoHealRange'){area(owner,kind==='makotoHealRange'?GREEN:PURPLE);return true;}
  if(kind==='makotoHeal'){for(const id of extra.targets||[]){const v=view(id);if(v)pulse(v,GREEN,.4,3);}return true;}
  if(kind==='makotoExecute'){
    const target=view(extra.target);if(!target)return true;
    pulse(target,RED,.6,12);
    const z=target.z??fx._groundZ(target.x,target.y),p=fx.ctx.cam().project(target.x,target.y,z+.55,{});
    fx._anchored(target.x,target.y,z,()=>{for(const rot of [-Math.PI/4,Math.PI/4])fx.particle('spark',p.x,p.y,{tint:RED,rot,life:.3/ts,s0:p.s/64*1.6,sx:.12,s1:0,a0:1});});return true;
  }
  if(kind==='makotoPhysicalHit'||kind==='makotoArtsHit'){const target=view(extra.target);if(target)pulse(target,kind==='makotoPhysicalHit'?GOLD:PURPLE,.35,4);return true;}
  if(kind==='makotoAllOutStart'){pulse(owner,RED,1,12);return true;}
  if(kind==='makotoAllOutFlash'){pulse(owner,GOLD,1.2,10);return true;}
  if(kind==='makotoAllOut'){for(const id of extra.members||[]){const member=view(id);if(member){area(member,RED,.55);pulse(member,GOLD,1.35,15);}}return true;}
  return false;
}
