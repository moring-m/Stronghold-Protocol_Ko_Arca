import { chatFaction } from '../../../shared/chat.js';

// One owner per faction. Assigning a new owner removes the old link.
export function bindPresetFaction(presets, id, faction) {
 if(!presets.some(p=>p.id===id))return presets;
 const selected=chatFaction(faction);const value=selected&&selected.presetLink!==false?selected.name:null;
 return presets.map(p=>p.id===id?{...p,faction:value}:value&&p.faction===value?{...p,faction:null}:p);
}
export function normalizePresetFactions(presets) {
 // A pasted/old collection can contain duplicate IDs. Keep every list, but give
 // each a distinct identity before applying faction links or selecting by ID.
 // Reserve later IDs too, so a repaired ID cannot steal another preset's identity.
 const reserved=new Set(presets.map(p=>p.id)),seen=new Set();
 const distinct=presets.map(p=>{
  let id=p.id;
  if(seen.has(id)){let n=2;do{id=`${p.id}~${n++}`;}while(seen.has(id)||reserved.has(id));}
  seen.add(id);return {...p,id};
 });
 let out=distinct.map(p=>({...p,faction:null}));
 for(const p of distinct)if(chatFaction(p.faction))out=bindPresetFaction(out,p.id,p.faction);
 return out;
}
export function canApplyRecruitPreset(state) {
 return !state.room?.inMatch || ['LOBBY','INFO_CHECK','BAND_DRAFT'].includes(state.match?.public?.phase);
}
export function replaceRecruitEntries(entries, preset, getChess) {
 const next={};for(const [id,e] of Object.entries(entries||{})){if(!getChess(id)?.optionalRecruit){next[id]=e;continue;}const config={...e};delete config.selected;if(Object.keys(config).length)next[id]=config;}
 for(const [id,entry] of Object.entries(preset||{})) {
  const c=getChess(id);
  if(c?.optionalRecruit&&c.visible&&!c.isGolden&&entry?.selected)next[id]={...(entries?.[id]||entry),selected:true};
 }
 return next;
}
