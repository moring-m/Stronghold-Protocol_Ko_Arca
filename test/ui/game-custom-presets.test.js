import {test} from 'node:test';import assert from 'node:assert/strict';
import {customSettingsRows} from '../../public/js/ui/customSettingsInfo.js';
import {presetPayload,readPresetPayload} from '../../public/js/ui/presetFiles.js';
import {withLaboratoryDummy,LAB_DUMMY_BOSS} from '../../shared/laboratoryDummy.js';
import {laboratoryOptions} from '../../shared/laboratoryOptions.js';
import {loadData} from '../../server/data.js';
test('in-game custom info exposes selected rules, exclusions and modified numerical settings',()=>{
 const rows=customSettingsRows({bonds:['leithanien'],rules:['sharedHp'],disabledStages:['map1'],ruleValues:{deployCap:12}},{stages:{map1:{name:'테스트 맵'}},bonds:{leithanienShip:{name:'라이타니엔'}}});assert.ok(rows.some(r=>r.items.some(s=>s.includes('라이타니엔'))));assert.ok(rows.some(r=>r.items.includes('아군 HP 공유')));assert.ok(rows.some(r=>r.items.includes('테스트 맵')));assert.deepEqual(customSettingsRows({bonds:[],stages:[]},{}),[]);
});
test('favorites and recruit preset files round-trip independently and reject another kind',()=>{
 for(const kind of ['stronghold.favorites','stronghold.recruit-presets']){const original={presets:[{id:'a',name:'프리셋',entries:{op:{selected:true}},operators:['op'],items:['gear']}],active:'a'},payload=presetPayload(kind,original);assert.deepEqual(readPresetPayload(JSON.stringify(payload),kind).presets,original.presets);assert.throws(()=>readPresetPayload(JSON.stringify(payload),kind==='stronghold.favorites'?'stronghold.recruit-presets':'stronghold.favorites'));}assert.throws(()=>readPresetPayload('{}','stronghold.favorites'));
});
test('damage dummy is offered in the lab at all difficulties, and absent from ordinary data',()=>{
 const raw=loadData(new URL('../../content/production/data',import.meta.url).pathname),lab=withLaboratoryDummy(raw);assert.ok(!raw.bosses[LAB_DUMMY_BOSS]);for(const difficulty of ['FUNNY','NORMAL','HARD','ABYSS']){const p=laboratoryOptions(lab.config,lab.bosses,difficulty);assert.ok(p.bossIds.includes(LAB_DUMMY_BOSS));assert.ok(p.hiddenBossIds.includes(LAB_DUMMY_BOSS));}
});

test('preset codes preserve Korean names in one line and distinguish favorite/recruit collections',async()=>{
 const {presetCode}=await import('../../public/js/ui/presetFiles.js');
 for(const kind of ['stronghold.favorites','stronghold.recruit-presets']){
  const state={active:'한글',presets:[{id:'한글',name:'라이타니엔 🌟',operators:['char_4046_ebnhlz'],entries:{test:{selected:true,tiers:[5,6]}}}]},code=presetCode(kind,state);
  assert.ok(!/\s/.test(code));assert.deepEqual(readPresetPayload(code,kind),presetPayload(kind,state));
  assert.throws(()=>readPresetPayload(code,kind==='stronghold.favorites'?'stronghold.recruit-presets':'stronghold.favorites'));
  assert.throws(()=>readPresetPayload(code+'!',kind));
 }
});

test('stock selections and ally ratios have readable labels in game info and old unlimited presets migrate',async()=>{
 const rows=customSettingsRows({ruleValues:{stockPlayers:-1,allyAtk:150,allySpCost:80}},{});assert.ok(rows.some(r=>r.items.includes('상점 재고 무제한')));assert.ok(rows.some(r=>r.items.includes('아군 공격력 150%')));assert.ok(rows.some(r=>r.items.includes('아군 최대 SP 80%')));
 const {resolveExtensionPreset}=await import('../../public/js/ui/customExtensionPresets.js'),{customExtensionCatalog}=await import('../../shared/customExtensions.js');const preset=resolveExtensionPreset({selection:{rules:['unlimitedStock']}},customExtensionCatalog({}));assert.equal(preset.ruleValues.stockPlayers,-1);assert.ok(!preset.rules.includes('unlimitedStock'));
});
