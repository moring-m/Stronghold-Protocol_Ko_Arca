import {loadPref,savePref} from '../store.js';
import {EXTENSION_CATEGORIES,extensionSelectionShape} from '../../../shared/customExtensions.js';
const KEY='customExtensionPresets';
export function copyExtensionSelection(selection={}) {
  if(selection.rules?.includes('unlimitedStock'))selection={...selection,rules:selection.rules.filter(id=>id!=='unlimitedStock'),ruleValues:{...selection.ruleValues,stockPlayers:-1}};
  return {...(selection.ruleValues?{ruleValues:{...selection.ruleValues}}:{}),...Object.fromEntries(EXTENSION_CATEGORIES.map(({id})=>[id,[...new Set(selection[id]||[])]]))};
}
export function normalizeExtensionPresets(raw) {
  const seen=new Set();
  return (Array.isArray(raw)?raw:[]).map(p=>{if(p?.selection?.disabledAugments!==undefined){const {disabledAugments,...selection}=p.selection;return {...p,selection};}return p;}).filter(p=>p&&typeof p.id==='string'&&!seen.has(p.id)&&seen.add(p.id)&&extensionSelectionShape(p.selection)).slice(0,30).map(p=>({id:p.id,name:String(p.name||'확장 프리셋').trim().slice(0,40)||'확장 프리셋',selection:copyExtensionSelection(p.selection)}));
}
export const loadExtensionPresets=()=>normalizeExtensionPresets(loadPref(KEY,[]));
export function saveExtensionPresets(presets){const saved=normalizeExtensionPresets(presets);savePref(KEY,saved);return saved;}
/** Drop stale IDs against the current catalog without changing the saved preset. */
export function resolveExtensionPreset(preset,catalog) {
 const selection=copyExtensionSelection(preset?.selection);
 return {...(selection.ruleValues?{ruleValues:{...selection.ruleValues}}:{}),...Object.fromEntries(EXTENSION_CATEGORIES.map(({id})=>{const allowed=new Set((catalog[id]||[]).map(e=>e.id));return [id,selection[id].filter(key=>allowed.has(key))];}))};
}
