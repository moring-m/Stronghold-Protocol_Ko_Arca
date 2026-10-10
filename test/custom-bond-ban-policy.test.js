import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DATA,makeMatch} from './match/harness.js';
import {GameData} from '../server/match/gamedata.js';
import {drawDisabledBonds} from '../server/match/pool.js';
import {createRng} from '../server/sim/rng.js';
import {normalizeCustomExtensions,applyCustomExtensions,validateExtensionMinimums,customExtensionCatalog} from '../shared/customExtensions.js';
import {setBondBanPolicy} from '../public/js/ui/customExtensions.js';
const gd=new GameData(DATA,'mode_multi_normal');
const cores=gd.bondIds.filter(id=>gd.bond(id)?.isCore&&gd.bond(id).weight>0&&!gd.modeInactiveBonds.has(id));
test('always banned cores are included and protected cores never enter seeded random bans',()=>{
 for(let seed=1;seed<=50;seed++){
  const out=drawDisabledBonds(gd,createRng(seed),{forcedBonds:[cores[0]],protectedBonds:[cores[1]]});
  assert.ok(out.drawn.includes(cores[0]));assert.ok(!out.drawn.includes(cores[1]));
  assert.equal(out.drawn.filter(id=>gd.bond(id).isCore).length,drawDisabledBonds(gd,createRng(seed)).drawn.filter(id=>gd.bond(id).isCore).length);
 }
 assert.equal(drawDisabledBonds(gd,createRng(1),{protectedBonds:cores}).drawn.filter(id=>gd.bond(id).isCore).length,0);
});
test('forced bans above the normal quota still leave five cores, and constraints reject conflicting settings',()=>{
 const forced=cores.slice(0,-5);
 const selected=normalizeCustomExtensions({bonds:[],stages:[],forcedBonds:forced},DATA);
 const applied=applyCustomExtensions(DATA,selected);
 assert.ok(applied.bonds[forced[0]],'ban policy does not remove the content from the data tables');
 assert.deepEqual(drawDisabledBonds(gd,createRng(1),selected).drawn.filter(id=>gd.bond(id).isCore).sort(),forced.sort());
 assert.deepEqual(validateExtensionMinimums(DATA,selected,{mode:'coop',difficulty:'NORMAL'}),[]);
 assert.ok(validateExtensionMinimums(DATA,{...selected,forcedBonds:cores.slice(0,-4)},{mode:'coop',difficulty:'NORMAL'}).some(s=>s.includes('최소 5')));
 assert.ok(validateExtensionMinimums(DATA,{...selected,protectedBonds:[forced[0]]},{mode:'coop',difficulty:'NORMAL'}).some(s=>s.includes('함께')));
 assert.ok(validateExtensionMinimums(DATA,{bonds:[],stages:[],forcedBonds:[cores[0]],disabledBonds:[cores[0]]},{mode:'coop',difficulty:'NORMAL'}).length);
});
test('the real match applies the ban policy and legacy disabled presets retain their exclusion semantics',()=>{
 const selection=normalizeCustomExtensions({bonds:[],stages:[],forcedBonds:[cores[0]],protectedBonds:[cores[1]]},DATA);
 const h=makeMatch({customExtensions:selection});
 assert.ok(h.m.disabledBonds.includes(cores[0]));assert.ok(!h.m.disabledBonds.includes(cores[1]));h.m.dispose();
 const old=normalizeCustomExtensions({bonds:[],stages:[],disabledBonds:[cores[0]]},DATA);
 assert.deepEqual(old,{bonds:[],stages:[],disabledBonds:[cores[0]]});
 assert.equal(applyCustomExtensions(DATA,old).bonds[cores[0]],undefined);
 assert.ok(customExtensionCatalog(DATA).forcedBonds.every(e=>DATA.bonds[e.id].isCore));
});
test('UI changes between policies never leave contradictory selections or mutate saved presets',()=>{
 const before={bonds:[],stages:[],disabledBonds:[cores[0]],protectedBonds:[cores[0]]};
 const forced=setBondBanPolicy(before,cores[0],'forced');assert.deepEqual(forced.forcedBonds,[cores[0]]);assert.deepEqual(forced.protectedBonds,[]);assert.deepEqual(forced.disabledBonds,[]);
 const protectedValue=setBondBanPolicy(forced,cores[0],'protected');assert.deepEqual(protectedValue.forcedBonds,[]);assert.deepEqual(protectedValue.protectedBonds,[cores[0]]);
 assert.deepEqual(setBondBanPolicy(protectedValue,cores[0],'random').protectedBonds,[]);
 assert.deepEqual(before.disabledBonds,[cores[0]]);
});

test('auxiliary bans support forced/protected policies independently, including an explicit ban of every auxiliary bond',()=>{
 const aux=gd.bondIds.filter(id=>!gd.bond(id)?.isCore&&gd.bond(id)?.weight>0&&!gd.modeInactiveBonds.has(id));
 assert.ok(aux.length>3);
 const selection=normalizeCustomExtensions({bonds:[],stages:[],forcedAuxBonds:[aux[0]],protectedAuxBonds:[aux[1]]},DATA);
 for(let seed=1;seed<40;seed++){
  const out=drawDisabledBonds(gd,createRng(seed),selection);assert.ok(out.drawn.includes(aux[0]));assert.ok(!out.drawn.includes(aux[1]));
  assert.ok(aux.filter(id=>!out.drawn.includes(id)).length>=3);
 }
 const h=makeMatch({customExtensions:selection});assert.ok(h.m.disabledBonds.includes(aux[0]));assert.ok(!h.m.disabledBonds.includes(aux[1]));h.m.dispose();
 assert.deepEqual(validateExtensionMinimums(DATA,{bonds:[],stages:[],forcedAuxBonds:aux},{mode:'coop',difficulty:'NORMAL'}),[]);
 assert.deepEqual(drawDisabledBonds(gd,createRng(4),{forcedAuxBonds:aux}).drawn.filter(id=>aux.includes(id)).sort(),[...aux].sort());
 assert.ok(validateExtensionMinimums(DATA,{...selection,protectedAuxBonds:[aux[0]]},{mode:'coop',difficulty:'NORMAL'}).some(s=>s.includes('함께')));
 const ui=setBondBanPolicy(selection,aux[0],'protected',true);assert.deepEqual(ui.forcedAuxBonds,[]);assert.ok(ui.protectedAuxBonds.includes(aux[0]));
 assert.ok(customExtensionCatalog(DATA).forcedAuxBonds.every(e=>!DATA.bonds[e.id].isCore));
});
