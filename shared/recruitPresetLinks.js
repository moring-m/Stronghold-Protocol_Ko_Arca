// A preset only replaces recruit selection; ordinary operators and existing per-operator settings remain.
export function replaceRecruitEntries(entries,preset,getChess){
 const next={};for(const[id,e]of Object.entries(entries||{})){if(!getChess(id)?.optionalRecruit){next[id]=e;continue;}const config={...e};delete config.selected;if(Object.keys(config).length)next[id]=config;}
 for(const[id,entry]of Object.entries(preset||{})){const c=getChess(id);if(c?.optionalRecruit&&c.visible&&!c.isGolden&&entry?.selected)next[id]={...(entries?.[id]||entry),selected:true};}
 return next;
}
export const validStrategyLink=id=>typeof id==='string'&&/^band_[a-zA-Z0-9_]+$/.test(id)&&id!=='band_random';
export function bindPresetStrategy(presets,id,strategy){
 if(!presets.some(p=>p.id===id))return presets;
 const value=validStrategyLink(strategy)?strategy:null;
 return presets.map(p=>p.id===id?{...p,strategy:value}:value&&p.strategy===value?{...p,strategy:null}:p);
}
export function normalizePresetStrategies(presets){let out=presets.map(p=>({...p,strategy:null}));for(const p of presets)if(validStrategyLink(p.strategy))out=bindPresetStrategy(out,p.id,p.strategy);return out;}
export function completedStrategy(state){
 if(!state.room?.inMatch||state.match?.public?.phase!=='BATTLE_CHECK')return null;
 const pub=state.match.public,priv=state.match.private,id=state.me?.playerId;
 const strategy=pub.players?.find(p=>p.playerId===id)?.bandId||priv?.bandId;
 return validStrategyLink(strategy)?{strategy,key:`${state.room.code}|${pub.seed??pub.matchNo??pub.startedAt??''}|${strategy}`} : null;
}
