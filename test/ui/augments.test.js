import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';
import {augmentEffectEntries,createAugmentCatalog,augmentView,recordAugments} from '../../shared/augments.js';import {loadData} from '../../server/data.js';import {normalizeRecord,recordToResult} from '../../public/js/ui/stats.js';
const data=loadData('content/production/data'),c=createAugmentCatalog(data,4).find(a=>a.name==='공격력 증가 I'&&a.side==='ally');
test('augment icons are original CC resources, correctly indexed and checksum verified',()=>{
 const files=JSON.parse(readFileSync('content/custom/augments/icons.json')),indexed=new Set(JSON.parse(readFileSync('content/production/resources.json')).files.map(f=>f.path));for(const f of files){assert.ok(f.source.includes('crisisv2/runeicon'));assert.ok(indexed.has(f.path));const raw=readFileSync('public'+f.path);assert.equal(createHash('sha256').update(raw).digest('hex'),f.sha256);assert.equal(raw.subarray(0,8).toString('hex'),'89504e470d0a1a0a');}
});
test('selected augments appear in the effects column by owner, grade and target with repeated picks aggregated',()=>{
 const ally=c,enemy=createAugmentCatalog(data,4).find(a=>a.name==='공격력 증가 I'&&a.side==='enemy');const rows=augmentEffectEntries([ally,ally],[enemy]);assert.equal(rows.length,2);assert.equal(rows[0].counter,2);assert.equal(rows[0].grade,'silver');assert.equal(rows[1].counterText,'모든 적에게 적용');assert.ok(rows.every(r=>r.iconId.startsWith('/assets/custom/augments/')));
});
test('augments retain bounded choices in saved history and replay results without executable effects',()=>{
 const augment=augmentView(c),history={history:['silver'],picks:[{round:4,grade:'silver',side:'ally',playerId:'p',augment}]};
 const record=normalizeRecord({id:'r',players:[{playerId:'p',name:'박사',stats:{}}],augments:history});assert.deepEqual(record.augments,recordAugments(history));assert.deepEqual(recordToResult(record).augments,record.augments);
 const malformed=recordAugments({history:['bad'],picks:[{round:99,side:'ally',augment},{round:4,side:'ally',augment:{...augment,effect:()=>{},icon:'https://evil.invalid/x'},playerId:'p'}]});assert.deepEqual(malformed.history,[]);assert.equal(malformed.picks.length,1);assert.equal(malformed.picks[0].augment.icon,null);assert.equal(malformed.picks[0].augment.effect,undefined);
});
test('all dynamically expanded augment labels use Korean bond names',()=>{
 for(const round of [4,7,10])for(const a of createAugmentCatalog(data,round))assert.ok(!/[一-鿿]/.test(a.name+a.description),a.name);
});

test('bond-related augment names resolve to the corresponding existing bond icon',()=>{
 const manifest=JSON.parse(readFileSync('content/production/data/assets.json'));const names={swiftShip:'신속',raidShip:'기습',preciShip:'정밀',visiShip:'예견',sargonShip:'사르곤'};
 for(const round of [4,7,10])for(const a of createAugmentCatalog(data,round))if(a.iconBond){assert.ok(manifest.bonds[a.iconBond],a.name);if(a.bondId)assert.equal(a.iconBond,a.bondId);if(names[a.iconBond])assert.ok(a.name.startsWith(names[a.iconBond]),a.name);assert.equal(augmentEffectEntries([a])[0].iconBond,a.iconBond);}
});

test('augment configuration validates and survives custom setting records and presets',async()=>{
 const {normalizeCustomExtensions,recordCustomExtensions,extensionSelectionShape,validateExtensionMinimums}=await import('../../shared/customExtensions.js');
 const a=createAugmentCatalog(data,4).find(a=>a.side==='ally');const settings={bonds:[],stages:[],rules:['augments'],ruleValues:{augmentSilver:10,augmentGold:40,augmentPrism:50,augmentAllyRerolls:4,augmentEnemyRerolls:0}};assert.ok(extensionSelectionShape(settings));const normalized=normalizeCustomExtensions(settings,data);assert.equal(normalized.disabledAugments,undefined);const record=recordCustomExtensions(normalized);assert.equal(record.ruleValues.augmentAllyRerolls,4);assert.equal(record.ruleValues.augmentEnemyRerolls,0);assert.ok(!validateExtensionMinimums(data,normalized,{mode:'solo'}).some(e=>e.includes('확률')));assert.ok(validateExtensionMinimums(data,{...normalized,ruleValues:{...normalized.ruleValues,augmentPrism:0,augmentGold:0,augmentSilver:0}},{mode:'solo'}).some(e=>e.includes('가중치')));
});

test('removing individual augment exclusions preserves saved preset rules and weights',async()=>{
 const {normalizeExtensionPresets}=await import('../../public/js/ui/customExtensionPresets.js');const [preset]=normalizeExtensionPresets([{id:'old',name:'기존 설정',selection:{bonds:[],stages:[],rules:['augments'],disabledAugments:['augment_ally_prism_51'],ruleValues:{augmentGold:3,augmentAllyRerolls:2}}}]);assert.ok(preset);assert.deepEqual(preset.selection.rules,['augments']);assert.equal(preset.selection.ruleValues.augmentGold,3);assert.equal(preset.selection.disabledAugments,undefined);
});

test('renamed augments and equipment descriptions use actual Korean item names, without harmony support cards',async()=>{
 const {AUGMENT_ITEM_NAMES}=await import('../../shared/augmentItemNames.js');for(const round of[4,7,10]){const catalog=createAugmentCatalog(data,round);assert.ok(catalog.some(a=>a.name==='아츠 마스터 III'));assert.deepEqual(catalog.filter(a=>a.name.includes('조화')).map(a=>a.name),['조화']);assert.equal(catalog.find(a=>a.name==='조화').iconBond,'maniShip');assert.ok(!catalog.some(a=>['대마법사','영광스러운 진화'].includes(a.name)));for(const a of catalog.filter(a=>a.id.includes('equipment_')))for(const id of a.effect.items)assert.ok(a.description.includes(AUGMENT_ITEM_NAMES[id]||data.items[id].name),a.description);const sword=catalog.find(a=>a.name==='소드마스터 III');assert.ok(!sword.description.includes('간격'));assert.ok(sword.iconBond==null);assert.equal(augmentView(sword).icon,'/assets/custom/augments/g_char_atk_p1.png');}assert.ok(createAugmentCatalog(data,4).some(a=>a.name==='이샤믈라의 축복'));
});

test('every offered augment has an indexed or local icon, including newly added effects',()=>{
 const manifest=JSON.parse(readFileSync('content/production/data/assets.json')),indexed=new Set(JSON.parse(readFileSync('content/production/resources.json')).files.map(f=>f.path));
 for(const round of [4,7,10])for(const a of createAugmentCatalog(data,round)){
  const v=augmentView(a),path=v.iconBond?manifest.bonds[v.iconBond]:v.icon;assert.ok(path,a.name);
  if(!indexed.has(path))assert.ok(readFileSync('public'+path).length>0,a.name);
 }
});
