import { modeExtensionSelection, normalizeCustomExtensions } from './customExtensions.js';

export const GAMEPLAY_MODES = Object.freeze(['classic','augment','custom']);
export const GAMEPLAY_MODE_NAMES = Object.freeze({classic:'클래식',augment:'증강',custom:'커스텀'});
export const isGameplayMode = value => GAMEPLAY_MODES.includes(value);
// Missing mode belongs to existing clients/records; preserve their previous custom behaviour.
export const normalizeGameplayMode = value => isGameplayMode(value) ? value : 'custom';
export const AUGMENT_MODE_VALUES = Object.freeze({enemyHp:100,enemyAtk:100,enemyDef:100,enemyRes:100,bossHp:100,augmentEnemyVote:1,bossAtk:120,bossDef:120,bossRes:150});
export const AUGMENT_BOSS_HP_FACTORS=Object.freeze({silver:1.3,gold:1.5,prism:1.7});
export function augmentBossHpMultiplier(history=[]){return history.reduce((n,g)=>n*(AUGMENT_BOSS_HP_FACTORS[g]||1),1);}
export function gameplayExtensions(saved, raw, roomMode, gameplayMode, legacy=false) {
 const mode=normalizeGameplayMode(gameplayMode);
 const selection=mode==='classic'?{}:mode==='augment'?{rules:['augments'],ruleValues:{...AUGMENT_MODE_VALUES}}:saved;
 return modeExtensionSelection(normalizeCustomExtensions(selection,raw,mode==='custom'&&legacy),roomMode);
}

export function canSwitchPublicMode(current,next,isPublic){return !isPublic;}

export const AUGMENT_ENEMY_HP_FACTORS=Object.freeze({silver:1.1,gold:1.15,prism:1.2});
export function augmentEnemyHpMultiplier(history=[]){return history.reduce((n,g)=>n*(AUGMENT_ENEMY_HP_FACTORS[g]||1),1);}
