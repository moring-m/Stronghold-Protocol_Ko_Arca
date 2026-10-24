import {sakikoNoteProjectile} from '../../../../shared/sakikoNotes.js';
import {projectileParts} from './flight.js';
// These notes are kit-managed entities, not generic homing attack flights.
export class NoteFx {
 constructor(w){this.w=w;this.live=new Map();}
 sync(notes){
  const fallback=[],seen=new Set(),w=this.w;
  for(const note of notes){
   const [id,nid,x,y,type,projectile]=note,slot=`${id}:${nid}`,owner=w.view(id);
   if(!w.ofx.active||!owner){fallback.push(note);continue;}
   const index=w.skills.of(owner)?.index??owner.info?.skillIndex??2;
   const key=projectile||sakikoNoteProjectile(index,!!owner.skillOn,type);
   const p=w.projectileOf(w.idx?.projectiles?.[key],owner),main=w.effectKey(projectileParts(p).main,owner);
   if(!main||!w.ofx.lib.has(main)){fallback.push(note);continue;}
   seen.add(slot);let rec=this.live.get(slot);
   if(!rec){
    rec={x,y,yaw:0};const at=rec;
    rec.handle=w.ofx.spawn(main,{pos:[x-10,y-9,-.55],groundZ:0,rootRot:[0,0,0,1]},{loop:true,important:true,owner,track:fx=>{fx.anchor[0]=at.x-10;fx.anchor[1]=at.y-9;fx.anchor[2]=-.55;fx.yaw=at.yaw;}});
    if(!rec.handle){seen.delete(slot);fallback.push(note);continue;}
    this.live.set(slot,rec);
   }
   if(x!==rec.x||y!==rec.y)rec.yaw=Math.atan2(y-rec.y,x-rec.x);
   rec.x=x;rec.y=y;
  }
  for(const [slot,rec]of this.live)if(!seen.has(slot)){rec.handle.stop({hit:true});this.live.delete(slot);}
  return fallback;
 }
 hit(x,y,extra,owner){
  if(!this.w.ofx.active)return false;
  const p=this.w.projectileOf(this.w.idx?.projectiles?.[extra.projectile],owner);
  const target=this.w.view(extra.target)||{x,y,z:0};let drew=false;
  for(const key of p?.onHit||[])drew=!!this.w.playOn(key,target,{flipFrom:owner})||drew;
  return drew;
 }
 clear(){for(const rec of this.live.values())rec.handle.stop();this.live.clear();}
}
