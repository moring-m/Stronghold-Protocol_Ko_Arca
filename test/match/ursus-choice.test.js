import {test} from 'node:test';
import assert from 'node:assert/strict';
import {loadData} from '../../server/data.js';
import {makeMatch} from './harness.js';
import {applyCard,tacticCard,tacticDraftCards} from '../../server/match/choices.js';
import {applyCustomExtensions} from '../../shared/customExtensions.js';
import {customFactionData} from '../../shared/customFactions.js';
const data=loadData(new URL('../../content/production/data/',import.meta.url).pathname,{log:{info(){},warn(){}}});
const card=id=>data.choices.cards.tactic.find(c=>c.effectId===id);
test('Istina oath grants eight layers of Ursus, raid and indom to every teammate while inactive',()=>{
 const h=makeMatch({data,mode:'coop',humans:2,seed:71,fake:true,customFactions:true}).start();h.toPrep(1);
 const before=h.m.alivePlayers().map(p=>Object.fromEntries(['ursusShip','raidShip','indomShip'].map(b=>[b,p.layers[b]||0])));
 applyCard(h.m,h.ps('p_0'),tacticCard(card('allybuff_custom_ursus_oath')));
 h.m.alivePlayers().forEach((p,i)=>{for(const b of ['ursusShip','raidShip','indomShip'])assert.equal(p.layers[b],before[i][b]+8);});
});
test('Ursus support grants a single Ursus operator to the picker only',()=>{
 const h=makeMatch({data,mode:'coop',humans:2,seed:71,fake:true,customFactions:true}).start();h.toPrep(1);
 const p=h.ps('p_0'),ally=h.ps('p_1');const pieces=ps=>[...ps.board.values(),...ps.hand,...ps.temp].filter(x=>x?.kind==='chess');
 const before=new Set(pieces(p).map(x=>x.uid)),other=pieces(ally).map(x=>x.uid);
 applyCard(h.m,p,tacticCard(card('allybuff_custom_ursus_support')));
 const gained=pieces(p).filter(x=>!before.has(x.uid));assert.equal(gained.length,1);assert.ok(h.m.gd.chess(gained[0].id).bonds.includes('ursusShip'));assert.deepEqual(pieces(ally).map(x=>x.uid),other);
});
test('Ursus event cards disappear when the extension is off, without mutating the source',()=>{
 const filtered=customFactionData(data,false);assert.ok(!filtered.choices.cards.tactic.some(c=>c.effectId.includes('custom_ursus')));assert.ok(card('allybuff_custom_ursus_oath'));assert.ok(card('allybuff_custom_ursus_support'));
});

test('both new cards can be offered by the normal tactic draft at round eleven',()=>{
 const h=makeMatch({data,mode:'coop',humans:2,seed:71,fake:true,customFactions:true}).start();h.toPrep(1);
 const seen=new Set();for(let i=0;i<500;i++)for(const c of tacticDraftCards(h.m.gd,h.m.rngMeta,6,{round:11,bondAvailable:()=>true})||[])seen.add(c.id);
 assert.ok(seen.has('allybuff_custom_ursus_oath'));assert.ok(seen.has('allybuff_custom_ursus_support'));
});

test('both custom items are absent from every shop and equipment-event tier pool when Ursus is off',()=>{
 const h=makeMatch({data,mode:'solo',seed:71,fake:true,customFactions:false}).start();
 for(const ids of Object.values(h.m.gd.shopItemsByTier))for(const id of ['chess_item_custom_ursus_a','chess_item_custom_ursus_favor_a'])assert.ok(!ids.includes(id));
});

test('both Ursus items and event cards are removed when disabled, including explicit bond disabling',()=>{
 for(const selection of [{bonds:[],stages:[]},{bonds:['ursus'],stages:[],disabledBonds:['ursusShip']}]){
  const filtered=applyCustomExtensions(data,selection);
  assert.ok(!filtered.items.chess_item_custom_ursus_a);assert.ok(!filtered.items.chess_item_custom_ursus_favor_a);
  assert.ok(!filtered.choices.cards.tactic.some(c=>c.effectId.includes('custom_ursus')));
 }
 const enabled=applyCustomExtensions(data,{bonds:['ursus'],stages:[]});assert.ok(enabled.items.chess_item_custom_ursus_a);assert.ok(enabled.items.chess_item_custom_ursus_favor_a);
 assert.ok(enabled.choices.cards.tactic.some(c=>c.effectId==='allybuff_custom_ursus_oath'));
});
