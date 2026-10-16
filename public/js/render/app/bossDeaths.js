/** Terminal boss deaths survive stale snapshots and metadata refreshes of the same battle. */
export class BossDeaths {
 constructor(){this.reset();}
 reset(){this.ids=new Set();this.fieldId=null;this.kind=null;this.battleId=null;}
 enter(meta){
  const sameField=this.fieldId===meta.fieldId&&this.kind===meta.kind;
  const sameBattle=!this.battleId||!meta.battleId||this.battleId===meta.battleId;
  if(!sameField||!sameBattle||meta.prep)this.reset();
  this.fieldId=meta.fieldId;this.kind=meta.kind;if(meta.battleId)this.battleId=meta.battleId;
 }
 note(info){if(info?.side==='enemy'&&info.boss===true)this.ids.add(info.id);}
 has(id){return this.ids.has(id);}
 spawn(id){this.ids.delete(id);}
}
