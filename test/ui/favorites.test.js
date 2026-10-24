import {test} from 'node:test';import assert from 'node:assert/strict';
import {normalizeFavorites,isFavorite,favoritesStore} from '../../public/js/ui/favorites.js';
test('favorite presets retain separate operators and items, deduplicate and fall back after deletion',()=>{
 const s=normalizeFavorites({active:'deleted',presets:[{id:'one',name:'계획',operators:['op','op'],items:['gear']},{id:'two',operators:'bad',items:null}]});
 assert.equal(s.active,'one');assert.deepEqual(s.presets[0].operators,['op']);assert.deepEqual(s.presets[1].operators,[]);
});
test('only the active preset marks shop cards; elite cards share the base operator preference',()=>{
 const before=favoritesStore.get();try{favoritesStore.set({active:'one',presets:[{id:'one',operators:['base'],items:['gear']},{id:'two',operators:['other'],items:[]}]});
 assert.equal(isFavorite('chess','elite',()=>({baseId:'base'})),true);assert.equal(isFavorite('chess','other',()=>null),false);assert.equal(isFavorite('item','gear'),true);
 favoritesStore.set({active:'two'});assert.equal(isFavorite('item','gear'),false);assert.equal(isFavorite('chess','other',()=>null),true);
 }finally{favoritesStore.set(before);}
});
test('operator search combines bond, tier and name filters without changing presets',async()=>{
 const {filterFavoriteOperators}=await import('../../public/js/ui/favorites.js');
 const rows=[{name:'헬라그',tier:6,bonds:['ursusShip','raidShip']},{name:'굼',tier:2,bonds:['ursusShip']},{name:'다른 사람',tier:6,bonds:['yanShip']}];
 assert.deepEqual(filterFavoriteOperators(rows,{bond:'ursusShip',tier:'6'}),[rows[0]]);
 assert.deepEqual(filterFavoriteOperators(rows,{query:'굼',bond:'ursusShip',tier:'6'}),[]);
 assert.equal(filterFavoriteOperators(rows).length,3);
});

test('optional recruits never appear in favorite filters or receive a favorite marker',async()=>{
 const {filterFavoriteOperators}=await import('../../public/js/ui/favorites.js');
 assert.deepEqual(filterFavoriteOperators([{name:'선발',optionalRecruit:true},{name:'일반'}]),[{name:'일반'}]);
 const old=favoritesStore.get();try{favoritesStore.set({active:'p',presets:[{id:'p',operators:['recruit'],items:[]}]});assert.equal(isFavorite('chess','recruit',()=>({optionalRecruit:true})),false);}finally{favoritesStore.set(old);}
});


test('release status does not hide playable operators from selection lists',async()=>{
 const {rosterOf,isLoadoutSlot}=await import('../../public/js/ui/loadoutModel.js');
 const {filterFavoriteOperators}=await import('../../public/js/ui/favorites.js');
 const released={chessId:'released',baseId:'released',name:'출시',visible:true};
 const unreleased={chessId:'unreleased',baseId:'unreleased',name:'미출시',visible:true,globalReleased:false};
 assert.deepEqual(rosterOf([released,unreleased]),[released,unreleased]);assert.deepEqual(filterFavoriteOperators([released,unreleased]),[released,unreleased]);assert.ok(isLoadoutSlot(unreleased),'existing battle/loadout records remain valid');
});
