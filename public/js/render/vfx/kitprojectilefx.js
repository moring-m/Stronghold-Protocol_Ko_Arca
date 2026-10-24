import {unitPoint} from './mounts.js';
// Kit-managed entities have their own clock/position and never emit a generic attack flight.
const PROJECTILES = Object.freeze({char_1020_reed2:'projectile_chr_reed2_fire',char_1044_hsgma2:'projectile_chr_hsgma2_s2',char_4134_cetsyr:'projectile_chr_cetsyr_talent',char_1039_thorn2:'projectile_chr_thorn2_s2',char_4193_lemuen:'projectile_chr_lemuen_s3_attack',char_1034_jesca2:'projectile_chr_jesca2_s3_bomb'});
export class KitProjectileFx {
  constructor(w) { this.w=w; this.zones=new Map(); this.shells=new Set(); this.bombs=new Map(); this.motes=new Map(); }
  keys(views) {
    const keys=new Set();
    for(const v of views) {
      const id=this.w.unitKeyOf(v),names=id==='char_4134_cetsyr'?['projectile_chr_cetsyr_talent',...['1','2','3'].map(n=>'projectile_chr_cetsyr_talent_s'+n)]:[PROJECTILES[id]];
      for(const name of names){const p=this.w.projectileOf(this.w.idx?.projectiles?.[name],v);for(const k of p?.effects||[])keys.add(this.w.effectKey(k,v));}
    }
    return keys;
  }
  simFx(kind,x,y,extra,owner) {
    const w=this.w;
    owner ||= this.zones.get(extra?.key)?.owner;
    if(!w.ofx.active||!owner)return false;
    const id=w.unitKeyOf(owner);
    if(kind==='orbitProjectile'&&['char_1020_reed2','char_1044_hsgma2'].includes(id))return this.moteState(extra,owner);
    if(id==='char_4134_cetsyr'&&kind==='moteState')return this.moteState(extra,owner);
    if(id==='char_4134_cetsyr'&&kind==='mote'){const p=w.projectileOf(w.idx.projectiles?.['projectile_chr_cetsyr_talent'+(extra.mode?'_s'+extra.mode:'')],owner);let drew=false;for(const key of p?.onHit||[])drew=!!w.playOn(key,{x,y,z:0},{flipFrom:owner})||drew;return drew;}
    if(kind==='zone'&&id==='char_1039_thorn2'&&extra.key?.startsWith('thorn2:'))return this.zone(x,y,extra,owner);
    if(kind==='bombardShell'&&id==='char_4193_lemuen')return this.shell(x,y,extra,owner);
    if(id==='char_1034_jesca2'&&(kind==='bombardShell'||kind==='bombard'))return this.bomb(kind,x,y,extra,owner);
    return false;
  }
  moteState(extra,owner) {
    const w=this.w,projectile=extra.projectile||'projectile_chr_cetsyr_talent'+(extra.mode?'_s'+extra.mode:'');
    const center=w.view?.(extra.id)||owner,p=w.projectileOf(w.idx.projectiles?.[projectile],owner,projectile);
    const slot=extra.projectile?`${owner.id}:${extra.id}:${projectile}`:owner.id;
    const key=w.effectKey(p?.main,owner);
    if(!key||!w.ofx.lib.has(key))return false;
    let rec=this.motes.get(slot);
    if(rec&&rec.key!==key){for(const h of rec.handles)h?.stop();this.motes.delete(slot);rec=null;}
    if(!rec){rec={handles:[],owner,center,key};this.motes.set(slot,rec);}
    Object.assign(rec,{slots:extra.slots||[],radius:Number.isFinite(extra.radius)?extra.radius:1.15,phase:(Number(extra.phase)||0)+({RIGHT:0,DOWN:-Math.PI/2,LEFT:Math.PI,UP:Math.PI/2}[extra.dir]||0),speed:(Number.isFinite(extra.speed)?extra.speed:30)*Math.PI/180,at:w.ofx.time,until:w.ofx.time+(Number(extra.ttl)||.75)});
    for(let i=0;i<Math.max(rec.handles.length,rec.slots.length);i++){
      if(!rec.slots[i]){rec.handles[i]?.stop();rec.handles[i]=null;continue;}
      if(rec.handles[i])continue;
      rec.handles[i]=w.ofx.spawn(key,{pos:[owner.x-10,owner.y-9,0],groundZ:0,rootRot:[0,0,0,1]}, {
        loop:true,important:true,owner,track:fx=>{
          const a=rec.phase+(w.ofx.time-rec.at)*rec.speed+2*Math.PI*i/rec.slots.length;
          fx.anchor[0]=center.x-10+Math.cos(a)*rec.radius;
          fx.anchor[1]=center.y-9+Math.sin(a)*rec.radius;
          fx.anchor[2]=-(w.pose?.(center)?.z||0);fx.groundZ=fx.anchor[2];
        },
      });
    }
    return !rec.slots.some(Boolean)||rec.handles.some(Boolean);
  }
  release(view) {
    for(const [id,m]of this.motes)if(m.owner===view||m.center===view){for(const h of m.handles)h?.stop();this.motes.delete(id);}
  }
  zone(x,y,extra,owner) {
    const w=this.w,slot=extra.key,now=w.ofx.time;
    let z=this.zones.get(slot);
    if(!z) {
      const p=w.projectileOf(w.idx.projectiles?.projectile_chr_thorn2_s2,owner);
      const keys=[...(p?.onReached||[]),...(p?.effects||[]).filter(k=>/skill_02_range(?:_|$)/.test(k))];
      const token=keys.find(k=>/skill_02_token(?:_|$)/.test(k));
      // Never suppress the fallback just because only a splash or a range ring is installed.
      if(!token||!w.ofx.lib.has(w.effectKey(token,owner)))return false;
      z={owner,x,y,at:now,until:now,handles:[],vx:0,vy:0,r:extra.r};
      const current=z;
      for(const base of new Set(keys)) {
        const key=w.effectKey(base,owner);if(!key||!w.ofx.lib.has(key))continue;
        const loop=!/token_start(?:_|$)/.test(base);
        const h=w.ofx.spawn(key,{pos:[x-10,y-9,0],groundZ:0,rootRot:[0,0,0,1]}, {
          loop,important:true,owner,
          track:fx=>{
            const dt=Math.max(0,Math.min(1,w.ofx.time-current.at));
            fx.anchor[0]=current.x-10+current.vx*dt;fx.anchor[1]=current.y-9+current.vy*dt;
            fx.anchor[2]=0;fx.groundZ=0;
            if(/skill_02_range(?:_|$)/.test(base))fx.rootScale=Math.max(.01,(current.r+current.grow*dt)/current.r0);
          },
        });
        if(h)z.handles.push(h);
      }
      if(!z.handles.length)return false;
      this.zones.set(slot,z);
    }
    Object.assign(z,{x,y,at:now,until:now+Math.max(0,Number(extra.duration)||0),
      vx:Number(extra.vx)||0,vy:Number(extra.vy)||0,r:Number(extra.r)||1,
      r0:Number(extra.baseRadius)||Number(extra.r)||1,grow:Number(extra.grow)||0});
    return true;
  }
  shell(x,y,extra,owner) {
    const w=this.w,p=w.projectileOf(w.idx.projectiles?.projectile_chr_lemuen_s3_attack,owner);
    const key=w.effectKey(p?.main,owner),duration=Number(extra.t);
    if(!key||!w.ofx.lib.has(key)||!(duration>0))return false;
    const start=w.ofx.time,rec={until:start+duration};
    rec.handle=w.ofx.spawn(key,{pos:[x-10,y-9,0],groundZ:0,rootRot:[0,0,0,1]}, {
      loop:true,important:true,owner,track:fx=>{
        // The prefab's own animation already drops its emitter from 7.27 tiles up.
        // Moving/rotating the root again doubles that displacement and hides the shell.
        fx.anchor[0]=x-10;fx.anchor[1]=y-9;fx.anchor[2]=0;fx.groundZ=0;
        const length=Math.max(0,...(fx.def?.clips||[]).map(c=>Number(c.length)||0));
        if(length>0)fx.speed=length/duration;
      },
    });
    if(!rec.handle)return false;
    this.shells.add(rec);return true;
  }
  bomb(kind,x,y,extra,owner) {
    const w=this.w,slot=`${extra.id}:${extra.shellId}`;
    const p=w.projectileOf(w.idx.projectiles?.projectile_chr_jesca2_s3_bomb,owner);
    if(kind==='bombard') {
      const old=this.bombs.get(slot);if(old){old.handle.stop();this.bombs.delete(slot);}
      let drew=false;
      for(const key of p?.onStop||[])drew=!!w.playOn(key,{x,y,z:0},{flipFrom:owner})||drew;
      return drew;
    }
    const key=w.effectKey(p?.main,owner),duration=Number(extra.t);
    if(!key||!w.ofx.lib.has(key)||!(duration>0))return false;
    const sx=Number.isFinite(extra.fromX)?extra.fromX:owner.x,sy=Number.isFinite(extra.fromY)?extra.fromY:owner.y;
    const from=unitPoint(w.skinOf(w.unitOf(owner)),'muzzle',w.pose(owner));
    const start=w.ofx.time,rec={until:start+duration};
    rec.handle=w.ofx.spawn(key,{pos:from.slice(),groundZ:0,rootRot:[0,0,0,1]}, {
      loop:true,important:true,owner,track:fx=>{
        const elapsed=Math.max(0,w.ofx.time-start),t=Math.min(1,elapsed/duration),blend=Math.max(0,1-elapsed/.1);
        fx.anchor[0]=sx-10+(x-sx)*t+(from[0]-(sx-10))*blend;
        fx.anchor[1]=sy-9+(y-sy)*t+(from[1]-(sy-9))*blend;
        fx.anchor[2]=from[2];fx.groundZ=0;fx.yaw=Math.atan2(y-sy,x-sx);
      },
    });
    if(!rec.handle)return false;
    this.bombs.get(slot)?.handle.stop();this.bombs.set(slot,rec);return true;
  }
  tick() {
    const now=this.w.ofx.time;
    for(const [id,m]of this.motes)if(!this.w.ofx.active||now>=m.until||m.owner.alive===false||m.center.alive===false){for(const h of m.handles)h?.stop();this.motes.delete(id);}
    for(const [key,z]of this.zones)if(!this.w.ofx.active||now>=z.until){for(const h of z.handles)h.stop();this.zones.delete(key);}
    for(const [slot,b]of this.bombs)if(!this.w.ofx.active||now>=b.until){b.handle.stop();this.bombs.delete(slot);}
    for(const s of this.shells)if(!this.w.ofx.active||now>=s.until){s.handle.stop();this.shells.delete(s);}
  }
  clear() {for(const m of this.motes.values())for(const h of m.handles)h?.stop();this.motes.clear();for(const z of this.zones.values())for(const h of z.handles)h.stop();this.zones.clear();for(const s of this.shells)s.handle.stop();this.shells.clear();for(const b of this.bombs.values())b.handle.stop();this.bombs.clear();}
}
