import{test}from'node:test';import assert from'node:assert/strict';
import{loadData}from'../../server/data.js';import{validateData,validateReferences}from'../../shared/plugins/validate.js';
const raw=loadData('content/production/data');
test('the prepared custom catalogue remains valid under v0.3 plugin validation',()=>{assert.deepEqual(validateData(raw),[])});
test('UI locked flags do not mask a different default skill mechanic',()=>{
 const data=structuredClone(raw),rec=Object.values(data.chess).find(c=>c.skills?.length&&c.skill&&c.stats);
 rec.skills.find(s=>s.isDefault).locked=true;assert.deepEqual(validateData(data),[]);
 rec.skill.spCost+=1;assert.ok(validateData(data).some(e=>e.code==='PLUGIN_RECORD_SKILLS'));
});
test('overlapping summon variants allow identical mechanics and reject divergent stats',()=>{
 const data=structuredClone(raw);const match=Object.entries(data.backups.tokens).flatMap(([id,t])=>Object.keys(t.variants||{}).filter(owner=>data.tokens[id]?.variants?.[owner]).map(owner=>[id,owner]))[0];
 assert.ok(match,'the custom catalogue has an official overlapping summon');
 assert.deepEqual(validateReferences(data),[]);
 const[id,owner]=match;data.backups.tokens[id].variants[owner].stats.atk+=1;
 assert.ok(validateReferences(data).some(e=>e.includes('overlapping owner variant')));
});
