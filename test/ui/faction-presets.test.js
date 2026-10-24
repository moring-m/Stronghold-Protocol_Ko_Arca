import {test} from 'node:test';
import assert from 'node:assert/strict';
import {bindPresetFaction,normalizePresetFactions,canApplyRecruitPreset,replaceRecruitEntries} from '../../public/js/ui/factionPresetModel.js';
import {normalizeFavorites,favoritesStore,applyFavoriteFaction,isFavorite} from '../../public/js/ui/favorites.js';
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
 assert.deepEqual(out,{standard:{skill:1},old:{skin:'old'},next:{selected:true,skill:2,skin:'new'},unreleased:{selected:true}});
 assert.deepEqual(replaceRecruitEntries(out,{},id=>records[id]),{standard:{skill:1},old:{skin:'old'},next:{skill:2,skin:'new'}});
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

test('recruit preset activation respects current operator skills including returning to default',()=>{
 const get=id=>({optionalRecruit:true,visible:true});
 assert.deepEqual(replaceRecruitEntries({op:{skill:1}},{op:{selected:true}},get),{op:{skill:1,selected:true}});
 assert.deepEqual(replaceRecruitEntries({op:{selected:true}},{op:{selected:true,skill:2}},get),{op:{selected:true}});
});

test('cooperative defense chat choice has a bond icon but cannot link favorites or recruit presets',async()=>{
 const{chatFaction}=await import('../../shared/chat.js');assert.equal(chatFaction('협동방어').bondId,'emptyShip');assert.equal(chatFaction('협동방어').presetLink,false);
 assert.deepEqual(bindPresetFaction([{id:'a',faction:null}],'a','협동방어'),[{id:'a',faction:null}]);
 assert.deepEqual(normalizePresetFactions([{id:'a',faction:'협동방어'}]),[{id:'a',faction:null}]);
});

test('duplicate preset IDs retain separate faction links and activate the matching favorite list',()=>{
 const before=favoritesStore.get();try{
 const normalized=normalizeFavorites({active:'same',presets:[
  {id:'same',name:'염국 목록',faction:'염국',operators:['yan']},
  {id:'same',name:'라이타니엔 목록',faction:'라이타니엔',operators:['leithanien']},
  {id:'same~2',name:'우르수스 목록',faction:'우르수스',operators:['ursus']},
 ]});
 assert.equal(new Set(normalized.presets.map(p=>p.id)).size,3);
 assert.deepEqual(normalized.presets.map(p=>p.faction),['염국','라이타니엔','우르수스']);
 assert.deepEqual(normalizeFavorites(normalized),normalized,'repair is stable across saves/reloads');
 favoritesStore.set(normalized);
 for(const [faction,op]of [['염국','yan'],['라이타니엔','leithanien'],['우르수스','ursus']]){
  assert.equal(applyFavoriteFaction(faction),faction+' 목록');
  assert.ok(isFavorite('chess',op,()=>null));
  for(const other of ['yan','leithanien','ursus'].filter(x=>x!==op))assert.equal(isFavorite('chess',other,()=>null),false);
 }
 }finally{favoritesStore.set(before);}
});

test('recruit presets also repair duplicate IDs without moving links or dropping entries',()=>{
 const raw={active:'same',presets:[{id:'same',faction:'염국',entries:{yan:{selected:true}}},{id:'same',faction:'라이타니엔',entries:{leithanien:{selected:true}}}]};
 const next=normalizeRecruitPresets(raw);
 assert.notEqual(next.presets[0].id,next.presets[1].id);
 assert.deepEqual(next.presets.map(p=>p.faction),['염국','라이타니엔']);
 assert.deepEqual(next.presets.map(p=>p.entries),raw.presets.map(p=>p.entries));
 assert.deepEqual(normalizeRecruitPresets(next),next);
});

test('a stale preset ID cannot remove another presets faction link',()=>{
 const presets=[{id:'a',faction:'염국'},{id:'b',faction:'라이타니엔'}];
 assert.deepEqual(bindPresetFaction(presets,'deleted','염국'),presets);
});

test('every linkable chat faction selects its own preset regardless of faction list order',async()=>{
 const {CHAT_FACTIONS}=await import('../../shared/chat.js');const before=favoritesStore.get();try{
 const presets=CHAT_FACTIONS.filter(f=>f.presetLink!==false).map(f=>({id:f.bondId,name:f.name,faction:f.name,operators:[f.bondId],items:[]}));
 favoritesStore.set(normalizeFavorites({presets:presets.toReversed()}));
 for(const faction of CHAT_FACTIONS.filter(f=>f.presetLink!==false)){
  assert.equal(applyFavoriteFaction(faction.name),faction.name);
  assert.equal(favoritesStore.get().active,faction.bondId);
 }
 const active=favoritesStore.get().active;assert.equal(applyFavoriteFaction('협동방어'),null);assert.equal(favoritesStore.get().active,active);
 }finally{favoritesStore.set(before);}
});

test('restored chat faction activates the linked favorite preset without requiring another button click',async()=>{
 const {store}=await import('../../public/js/store.js');const previous=store.get(),favorites=favoritesStore.get();
 try{store.set({chatFaction:null});favoritesStore.set(normalizeFavorites({active:'a',presets:[{id:'a'},{id:'b',faction:'라이타니엔'}]}));store.set({chatFaction:'라이타니엔'});assert.equal(favoritesStore.get().active,'b');}
 finally{store.set(previous);favoritesStore.set(favorites);}
});
test('linking a preset to the already selected faction immediately activates that preset',async()=>{
 const {store}=await import('../../public/js/store.js'),{saveFavorites}=await import('../../public/js/ui/favorites.js');const previous=store.get(),favorites=favoritesStore.get();
 try{store.set({chatFaction:'우르수스'});favoritesStore.set(normalizeFavorites({active:'a',presets:[{id:'a'},{id:'b'}]}));saveFavorites({active:'a',presets:[{id:'a'},{id:'b',faction:'우르수스'}]});assert.equal(favoritesStore.get().active,'b');saveFavorites({...favoritesStore.get(),active:'a'});assert.equal(favoritesStore.get().active,'a','manual preset selection remains possible');}
 finally{store.set(previous);favoritesStore.set(favorites);}
});
