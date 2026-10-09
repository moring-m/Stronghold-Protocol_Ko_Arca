import {test} from 'node:test';
import assert from 'node:assert/strict';
import {bindPresetFaction,normalizePresetFactions,canApplyRecruitPreset,replaceRecruitEntries} from '../../public/js/ui/factionPresetModel.js';
import {normalizeFavorites,favoritesStore,applyFavoriteFaction} from '../../public/js/ui/favorites.js';
import {normalizeRecruitPresets,recruitPresetStore,applyRecruitPreset} from '../../public/js/ui/recruitPresets.js';
import {loadoutStore} from '../../public/js/ui/loadoutSync.js';

test('a faction has one preset owner; relinking releases the old owner',()=>{
 const p=[{id:'a',faction:'우르수스'},{id:'b',faction:'염국'},{id:'c',faction:null}];
 assert.deepEqual(bindPresetFaction(p,'c','우르수스').map(x=>x.faction),[null,'염국','우르수스']);
 assert.deepEqual(normalizePresetFactions([{id:'a',faction:'염국'},{id:'b',faction:'염국'},{id:'c',faction:'bad'}]).map(x=>x.faction),[null,'염국',null]);
 assert.equal(p[0].faction,'우르수스');
});
test('old favorites migrate without a link; selecting a faction applies its preset only',()=>{
 assert.equal(normalizeFavorites({presets:[{id:'a'}]}).presets[0].faction,null);
 const old=favoritesStore.get();try{
 favoritesStore.set(normalizeFavorites({active:'a',presets:[{id:'a'},{id:'b',name:'염국 계획',faction:'염국'}]}));
 assert.equal(applyFavoriteFaction('염국'),'염국 계획');assert.equal(favoritesStore.get().active,'b');
 assert.equal(applyFavoriteFaction(null),null);assert.equal(applyFavoriteFaction('우르수스'),null);assert.equal(favoritesStore.get().active,'b');
 }finally{favoritesStore.set(old);}
});
test('recruit preset replaces recruit settings only; absent picks clear and unavailable picks drop',()=>{
 const records={standard:{},old:{optionalRecruit:true},next:{optionalRecruit:true,visible:true},unreleased:{optionalRecruit:true,visible:true,globalReleased:false}};
 const out=replaceRecruitEntries({standard:{skill:1},old:{selected:true,skin:'old'}},{next:{selected:true,skill:2,skin:'new'},standard:{selected:true},unreleased:{selected:true}},id=>records[id]);
 assert.deepEqual(out,{standard:{skill:1},next:{selected:true,skill:2,skin:'new'}});
 assert.deepEqual(replaceRecruitEntries(out,{},id=>records[id]),{standard:{skill:1}});
});
test('recruit presets lock after strategy selection including final result and unknown match phases',()=>{
 assert.ok(canApplyRecruitPreset({}));
 for(const phase of ['LOBBY','INFO_CHECK','BAND_DRAFT'])assert.ok(canApplyRecruitPreset({room:{inMatch:true},match:{public:{phase}}}));
 for(const phase of ['BATTLE_CHECK','PREP','COMBAT','RESULT',null])assert.equal(canApplyRecruitPreset({room:{inMatch:true},match:{public:{phase}}}),false);
});
test('locked manual apply changes neither stored loadout nor active recruit preset',()=>{
 const r=recruitPresetStore.get(),l=loadoutStore.get();try{
 recruitPresetStore.set(normalizeRecruitPresets({active:'a',presets:[{id:'a',entries:{}},{id:'b',entries:{}}]}));loadoutStore.set({entries:{standard:{skill:2}}});
 assert.deepEqual(applyRecruitPreset('b',{room:{inMatch:true},match:{public:{phase:'PREP'}}}),{ok:false,locked:true});
 assert.deepEqual(loadoutStore.get().entries,{standard:{skill:2}});assert.equal(recruitPresetStore.get().active,'a');
 }finally{recruitPresetStore.set(r);loadoutStore.set(l);}
});

test('an obsolete nonempty preset cannot silently clear the current loadout',()=>{
 const r=recruitPresetStore.get(),l=loadoutStore.get();try{
 recruitPresetStore.set(normalizeRecruitPresets({active:'a',presets:[{id:'a',entries:{}},{id:'stale',entries:{missing:{selected:true}}}]}));
 loadoutStore.set({entries:{existing:{selected:true}}});
 const result=applyRecruitPreset('stale',{});assert.equal(result.ok,false);
 assert.deepEqual(loadoutStore.get().entries,{existing:{selected:true}});assert.equal(recruitPresetStore.get().active,'a');
 }finally{recruitPresetStore.set(r);loadoutStore.set(l);}
});
