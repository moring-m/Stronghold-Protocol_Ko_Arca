import {chatFaction} from '../../../shared/chat.js';

// One owner per faction. Assigning a new owner removes the old link.
export function bindPresetFaction(presets, id, faction) {
 const value=chatFaction(faction)?.name || null;
 return presets.map(p=>p.id===id?{...p,faction:value}:value&&p.faction===value?{...p,faction:null}:p);
}
export function normalizePresetFactions(presets) {
 let out=presets.map(p=>({...p,faction:null}));
 for(const p of presets)if(chatFaction(p.faction))out=bindPresetFaction(out,p.id,p.faction);
 return out;
}
export function canApplyRecruitPreset(state) {
 return !state.room?.inMatch || ['LOBBY','INFO_CHECK','BAND_DRAFT'].includes(state.match?.public?.phase);
}
export function replaceRecruitEntries(entries, preset, getChess) {
 const next=Object.fromEntries(Object.entries(entries||{}).filter(([id])=>!getChess(id)?.optionalRecruit));
 for(const [id,entry] of Object.entries(preset||{})) {
  const c=getChess(id);
  if(c?.optionalRecruit&&c.globalReleased!==false&&c.visible&&!c.isGolden&&entry?.selected)next[id]={...entry,selected:true};
 }
 return next;
}
