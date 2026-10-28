import {test} from 'node:test';import assert from 'node:assert/strict';
import {applyCustomExtensions,customExtensionCatalog,normalizeCustomExtensions,extensionSelectionShape} from '../shared/customExtensions.js';
import {makeMatch,DATA} from './match/harness.js';
const stages={...DATA.stages,custom_map_a:{...DATA.stages.act2autochess_m01,id:'custom_map_a',name:'테스트 전장 A',weight:1,customExtension:true},custom_map_b:{...DATA.stages.act2autochess_m01,id:'custom_map_b',name:'테스트 전장 B',weight:1,customExtension:true}};
const raw={...DATA,stages};
test('independent extension selections isolate match data and add only the selected custom map',()=>{
 const selected=normalizeCustomExtensions({bonds:['ursus'],stages:['custom_map_b']},raw);
 const applied=applyCustomExtensions(raw,selected);
 assert.equal(applied.stages.custom_map_a,undefined);assert.ok(applied.stages.custom_map_b);assert.ok(raw.stages.custom_map_a);
 for(const m of Object.values(applied.config.modes)){assert.ok(!m.stages.includes('custom_map_a'));assert.ok(m.stages.includes('custom_map_b'));}
 const off=applyCustomExtensions(raw,{bonds:[],stages:[]});assert.equal(off.stages.custom_map_b,undefined);assert.equal(off.bonds.ursusShip,undefined);
 const h=makeMatch({data:raw,customExtensions:selected});assert.deepEqual(h.m.publicView().customExtensions,selected);assert.equal(h.m.customFactions,true);assert.equal(h.m.gd.stage('custom_map_a'),null);h.m.dispose();
});
test('selecting a custom map makes it reachable by the real weighted draw while unselected maps never enter it',()=>{
 const applied=applyCustomExtensions(raw,{bonds:[],stages:['custom_map_b']});
 const mode='mode_multi_normal';applied.config.modes[mode]={...applied.config.modes[mode],stages:['custom_map_b']};
 const h=makeMatch({data:applied,customExtensions:{bonds:[],stages:['custom_map_b']}}).start();
 assert.equal(h.m.stageId,'custom_map_b');h.m.dispose();
});
test('extension shape rejects unknown categories, duplicate entries and malformed selections',()=>{
 for(const value of [null,[],{bonds:['ursus','ursus']},{stages:[1]},{evil:[]}])assert.equal(extensionSelectionShape(value),false);
 assert.equal(extensionSelectionShape({bonds:['ursus'],stages:['custom_map_b']}),true);
 assert.deepEqual(normalizeCustomExtensions(undefined,raw,true),{bonds:['ursus'],stages:[]});
 assert.deepEqual(customExtensionCatalog(raw).stages.map(x=>x.id),['act1autochess_m01','custom_snowfield','custom_map_a','custom_map_b']);
});

test('multiple maps can coexist and switching extensions never mutates skill/skin preferences',()=>{
 const id=Object.keys(DATA.chess)[0];
 const prefs={[id]:{skill:0}};
 const before=structuredClone(prefs);
 for(const selection of [{bonds:[],stages:[]},{bonds:['ursus'],stages:['custom_map_a','custom_map_b']},{bonds:[],stages:['custom_map_a']}]){
  const applied=applyCustomExtensions(raw,selection);
  for(const map of selection.stages)assert.ok(applied.stages[map]);
  const h=makeMatch({data:raw,customExtensions:selection,seats:[{seat:0,playerId:'p_0',name:'P0',isBot:false,connected:true,loadout:prefs}]});
  assert.deepEqual(prefs,before);assert.equal(h.ps('p_0').loadout[id]?.skill,0);h.m.dispose();
 }
});


test('custom catalog does not include removed operator ban exclusions',()=>{assert.equal(customExtensionCatalog(raw).protectedOperators,undefined);});

test('operator ban catalog excludes optional recruits and keeps shop order',()=>{
 const normal=(tier,shopSortId,extra={})=>({name:'operator',visible:true,tier,shopSortId,...extra});
 const data={chess:{b:normal(2,1),a:normal(1,2),c:normal(1,1),recruit:normal(1,0,{optionalRecruit:true}),gold:normal(1,0,{isGolden:true}),hidden:normal(1,0,{isHidden:true}),unreleased:normal(1,0,{globalReleased:false})}};
 assert.deepEqual(customExtensionCatalog(data).bannedOperators.map(c=>c.id),['unreleased','c','a','b']);
 const selection=normalizeCustomExtensions({bannedOperators:['recruit','a']},data);
 assert.deepEqual(selection.bannedOperators,['a']);
});
