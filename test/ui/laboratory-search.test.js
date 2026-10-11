import {test} from 'node:test';import assert from 'node:assert/strict';
import {matchesKoreanSearch,laboratoryEquipment} from '../../shared/search.js';
import {getData} from '../../server/data.js';
test('laboratory searches Korean names and their initials',()=>{
 assert.ok(matchesKoreanSearch('텍사스','ㅌㅅㅅ'));
 assert.ok(matchesKoreanSearch('스펙터 디 언체인드','ㅅㅍㅌㄷ'));
 assert.ok(matchesKoreanSearch('텍사스','텍사'));assert.equal(matchesKoreanSearch('텍사스','ㅍㅇ'),false);
});
test('laboratory excludes economy and recruitment equipment while keeping battle equipment',()=>{
 const gd=getData({dataDir:'content/production/data'});
 for(const item of Object.values(gd.items))if(['ECONOMY','RECRUIT'].includes(item.category)&&item.trapId!=='trap_1070_acarm070')assert.equal(laboratoryEquipment(item),false);
 assert.ok(laboratoryEquipment(gd.items.chess_item_1_02_e_a));
 assert.ok(laboratoryEquipment(gd.items.chess_item_6_08_e_a));
});
