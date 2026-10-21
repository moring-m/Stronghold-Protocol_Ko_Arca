import {test} from 'node:test';import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {customExtensionCatalog,additionalStagesForDifficulty,applyCustomExtensions,OPTIONAL_FIRST_STAGE} from '../shared/customExtensions.js';
const names=['chess','bonds','items','bands','bosses','stages','config','enemies'];
const data=Object.fromEntries(names.map(name=>[name,JSON.parse(readFileSync(`content/production/data/${name}.json`))]));
test('battlefield 01 is optional outside Standard without changing Standard baseline or game data',()=>{
 const before=JSON.stringify(data),catalog=customExtensionCatalog(data);
 assert.ok(catalog.stages.some(e=>e.id===OPTIONAL_FIRST_STAGE));
 assert.ok(!additionalStagesForDifficulty(catalog.stages,'FUNNY').some(e=>e.id===OPTIONAL_FIRST_STAGE));
 for(const difficulty of ['NORMAL','HARD','ABYSS'])assert.ok(additionalStagesForDifficulty(catalog.stages,difficulty).some(e=>e.id===OPTIONAL_FIRST_STAGE));
 const off=applyCustomExtensions(data,{stages:[],bonds:[]}),on=applyCustomExtensions(data,{stages:[OPTIONAL_FIRST_STAGE],bonds:[]});
 for(const id of ['mode_single_hard','mode_multi_hard','mode_single_abyss','mode_multi_abyss']){assert.ok(!off.config.modes[id].stages.includes(OPTIONAL_FIRST_STAGE));assert.ok(on.config.modes[id].stages.includes(OPTIONAL_FIRST_STAGE));}
 for(const id of ['mode_single_funny','mode_multi_funny']){assert.deepEqual(off.config.modes[id].stages,[OPTIONAL_FIRST_STAGE]);assert.deepEqual(on.config.modes[id].stages,[OPTIONAL_FIRST_STAGE]);}
 assert.equal(JSON.stringify(data),before);
});
