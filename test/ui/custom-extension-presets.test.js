import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeExtensionPresets,copyExtensionSelection,resolveExtensionPreset} from '../../public/js/ui/customExtensionPresets.js';
test('extension presets copy additions and exclusions, reject malformed selections and duplicate IDs',()=>{
 const raw={bonds:['ursus'],stages:[],disabledBonds:['yanShip']};
 const ps=normalizeExtensionPresets([{id:'a',name:'  우르수스  ',selection:raw},{id:'a',selection:raw},{id:'bad',selection:{bonds:'wrong'}}]);
 assert.equal(ps.length,1);assert.equal(ps[0].name,'우르수스');ps[0].selection.bonds.push('other');assert.deepEqual(raw.bonds,['ursus']);assert.deepEqual(ps[0].selection.disabledBonds,['yanShip']);
 assert.deepEqual(copyExtensionSelection().bonds,[]);
});
test('loading extension presets filters stale IDs without changing stored values',()=>{
 const p={selection:{bonds:['ursus','removed'],stages:[],disabledBonds:['yanShip','addon']}};
 const next=resolveExtensionPreset(p,{bonds:[{id:'ursus'}],disabledBonds:[{id:'yanShip'}]});
 assert.deepEqual(next.bonds,['ursus']);assert.deepEqual(next.disabledBonds,['yanShip']);assert.deepEqual(p.selection.bonds,['ursus','removed']);
});

test('built-in augment preset is copied, cannot be overwritten, and cannot be deleted',async()=>{
 const {builtinExtensionPresets,saveExtensionPresets,BUILTIN_AUGMENT_PRESET_ID}=await import('../../public/js/ui/customExtensionPresets.js');
 const preset=builtinExtensionPresets().find(p=>p.id===BUILTIN_AUGMENT_PRESET_ID);assert.deepEqual(builtinExtensionPresets().map(p=>p.name),['클래식','증강 모드']);assert.equal(preset.builtIn,true);assert.equal(preset.selection.ruleValues.enemyHp,100);assert.equal(preset.selection.ruleValues.enemyHpByAugment,1);assert.equal(preset.selection.ruleValues.bossHpByAugment,1);
 preset.selection.ruleValues.enemyAtk=999;assert.equal(builtinExtensionPresets().find(p=>p.id===BUILTIN_AUGMENT_PRESET_ID).selection.ruleValues.enemyAtk,100);
 assert.equal(saveExtensionPresets([preset]).length,0);assert.equal(normalizeExtensionPresets([preset]).length,0);
});
