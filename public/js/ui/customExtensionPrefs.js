import { loadPref, savePref } from '../store.js';
import { EXTENSION_CATEGORIES, extensionSelectionShape } from '../../../shared/customExtensions.js';
import { DEFAULT_VERSION } from '../../../shared/versions.js';

const KEY = 'customExtensions';
const copySelection = selection => ({...(selection.ruleValues?{ruleValues:{...selection.ruleValues}}:{}),...Object.fromEntries(EXTENSION_CATEGORIES.map(({id}) => [id,[...(selection[id] || [])]]).filter(([id,ids])=>['bonds','stages'].includes(id)||ids.length))});
// another season keeps its own copy (its chess ids name other operators): `version` other than the default season
const keyFor=(version)=>version&&version!==DEFAULT_VERSION?`${KEY}.${version}`:KEY;
export function loadCustomExtensionPrefs(version=null) {
  let saved=loadPref(keyFor(version),null);
  if(saved?.disabledAugments!==undefined){const {disabledAugments,...selection}=saved;saved=selection;}
  return copySelection(extensionSelectionShape(saved) ? saved : {});
}
export function saveCustomExtensionPrefs(selection, version=null) {
  if(extensionSelectionShape(selection)) savePref(keyFor(version),copySelection(selection));
}
