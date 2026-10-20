import { modeExtensionSelection, normalizeCustomExtensions } from './customExtensions.js';

export const GAMEPLAY_MODES = Object.freeze(['classic','augment','custom']);
export const GAMEPLAY_MODE_NAMES = Object.freeze({classic:'클래식',augment:'증강',custom:'커스텀'});
export const isGameplayMode = value => GAMEPLAY_MODES.includes(value);
// Missing mode belongs to existing clients/records; preserve their previous custom behaviour.
export const normalizeGameplayMode = value => isGameplayMode(value) ? value : 'custom';
export const AUGMENT_MODE_VALUES = Object.freeze({enemyHp:140,enemyAtk:120,enemyDef:120,enemyRes:150,bossHp:400,bossAtk:120,bossDef:120,bossRes:150});
export function gameplayExtensions(saved, raw, roomMode, gameplayMode, legacy=false) {
 const mode=normalizeGameplayMode(gameplayMode);
 const selection=mode==='classic'?{}:mode==='augment'?{rules:['augments'],ruleValues:{...AUGMENT_MODE_VALUES}}:saved;
 return modeExtensionSelection(normalizeCustomExtensions(selection,raw,mode==='custom'&&legacy),roomMode);
}
