import { loadPref, savePref } from '../store.js';
import { EXTENSION_CATEGORIES, extensionSelectionShape } from '../../../shared/customExtensions.js';

const KEY = 'customExtensions';
const copySelection = selection => ({...(selection.ruleValues?{ruleValues:{...selection.ruleValues}}:{}),...Object.fromEntries(EXTENSION_CATEGORIES.map(({id}) => [id,[...(selection[id] || [])]]).filter(([id,ids])=>['bonds','stages'].includes(id)||ids.length))});
export function loadCustomExtensionPrefs() {
  const saved=loadPref(KEY,null);
  return copySelection(extensionSelectionShape(saved) ? saved : {});
}
export function saveCustomExtensionPrefs(selection) {
  if(extensionSelectionShape(selection)) savePref(KEY,copySelection(selection));
}
