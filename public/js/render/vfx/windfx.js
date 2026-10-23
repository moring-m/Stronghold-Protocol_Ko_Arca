// Ho'olheyak's three independent, kit-managed winds are not snapshot projectiles.
import {projectileParts} from './flight.js';
export class WindFx {
 constructor(w){this.w=w;this.live=new Map();}
 simFx(kind,x,y,extra,owner){
  if(!this.w.ofx.active||extra?.skill!=='heyak:wind'||extra.windId==null)return false;
  const slot=`${extra.id}|${extra.windId}`,old=this.live.get(slot);
  if(kind==='tornadoPulse'){
   const source=owner||old?.owner,target=this.w.view(extra.target)||{x,y,z:0};
   return !!this.w.playOn('heyak_skill_03_hit_01',target,{flipFrom:source});
  }
  if(kind!=='tornado')return false;
  if(extra.phase==='end'){if(old){old.handle.stop();this.live.delete(slot);this.w.playOn('heyak_skill_03_trail_01_end',{x,y,z:0},{flipFrom:owner||old.owner});}return true;}
  let wind=old;
  if(!wind){
   if(!owner)return false;
   const p=this.w.projectileOf(this.w.idx.projectiles?.projectile_chr_heyak_s3,owner);
   const key=this.w.effectKey(projectileParts(p).main,owner);
   if(!key||!this.w.ofx.lib.has(key))return false;
   wind={x,y,dc:0,dr:0,at:this.w.ofx.time,owner,speed:Number(p?.movement?.speed)||1};const current=wind;
   wind.handle=this.w.ofx.spawn(key,{pos:[x-10,y-9,0],groundZ:0,rootRot:[0,0,0,1]},{loop:true,important:true,owner,track:fx=>{
    const t=Math.max(0,Math.min(.5,this.w.ofx.time-current.at));
    fx.anchor[0]=current.x-10+current.dc*current.speed*t;fx.anchor[1]=current.y-9+current.dr*current.speed*t;fx.anchor[2]=0;fx.groundZ=0;fx.yaw=Math.atan2(current.dr,current.dc);fx.pitch=0;
   }});
   if(!wind.handle)return false;this.live.set(slot,wind);
  }
  Object.assign(wind,{x,y,dc:Number(extra.dc)||0,dr:Number(extra.dr)||0,at:this.w.ofx.time});return true;
 }
 tick(){for(const [key,wind]of this.live)if(!this.w.ofx.active||this.w.ofx.time-wind.at>1.25){wind.handle.stop();this.live.delete(key);}}
 clear(){for(const wind of this.live.values())wind.handle.stop();this.live.clear();}
}
