import {test} from 'node:test';import assert from 'node:assert/strict';import {operatorBanRoster} from '../../public/js/ui/customExtensions.js';
const tables={chess:{a:{visible:true,chessId:'a',charId:'aa',name:'첫번째',tier:1,profession:'GUARD',bonds:['one']},b:{visible:true,chessId:'b',charId:'bb',name:'두번째',tier:6,profession:'CASTER',bonds:['two']},g:{visible:true,isGolden:true,charId:'aa',name:'승급',tier:1},r:{visible:true,optionalRecruit:true,charId:'cc',name:'선발',tier:2}},bonds:{one:{name:'맹약 하나'},two:{name:'맹약 둘'}}},catalog=[{id:'aa'},{id:'bb'},{id:'cc'}];
test('operator ban exclusion uses tier, profession, bond and name filters, retaining selected IDs independent of filters',()=>{
 assert.deepEqual(operatorBanRoster(tables,catalog,{}).map(c=>c.charId),['aa','bb']);
 for(const filters of [{tier:6},{prof:'CASTER'},{bond:'two'},{query:'두번째'}])assert.deepEqual(operatorBanRoster(tables,catalog,filters).map(c=>c.charId),['bb']);
 assert.deepEqual(operatorBanRoster(tables,catalog,{query:'없는 이름'}),[]);
});
