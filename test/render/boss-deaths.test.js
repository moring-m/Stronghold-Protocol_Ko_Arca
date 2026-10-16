import {test} from 'node:test';import assert from 'node:assert/strict';
import {BossDeaths} from '../../public/js/render/app/bossDeaths.js';
const field={fieldId:'boss:0',kind:'boss',battleId:'round14'};
test('a dead boss remains gone through repeated field metadata, even if refreshed metadata omits battleId',()=>{
 const deaths=new BossDeaths();deaths.enter(field);deaths.note({id:7,side:'enemy',boss:true});assert.equal(deaths.has(7),true);
 deaths.enter({...field});assert.equal(deaths.has(7),true);deaths.enter({fieldId:'boss:0',kind:'boss'});assert.equal(deaths.has(7),true);
 deaths.enter({...field,battleId:'round15'});assert.equal(deaths.has(7),false);
});
test('new fields, prep and explicit spawn permit a new boss while ordinary units do not become terminal',()=>{
 const deaths=new BossDeaths();deaths.enter(field);
 for(const info of [{id:1,side:'ally',boss:false},{id:2,side:'enemy',boss:false}]){deaths.note(info);assert.equal(deaths.has(info.id),false);}
 deaths.note({id:7,side:'enemy',boss:true});deaths.spawn(7);assert.equal(deaths.has(7),false);
 deaths.note({id:7,side:'enemy',boss:true});deaths.enter({...field,prep:true});assert.equal(deaths.has(7),false);
 deaths.note({id:7,side:'enemy',boss:true});deaths.enter({...field,fieldId:'boss:1'});assert.equal(deaths.has(7),false);
});
