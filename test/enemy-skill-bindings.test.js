import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {ENEMY_SKILL_ROLES,applyRoleFix} from '../tools/assets/spine.mjs';
const assets=JSON.parse(fs.readFileSync(new URL('../data/assets.json',import.meta.url)));
test('explicit enemy skill bindings refer to real clips and remain in the generated manifest',()=>{
 for(const [id,roles]of Object.entries(ENEMY_SKILL_ROLES)){
  const spine=assets.enemies[id].spine;
  const result=applyRoleFix({},roles,spine.animations);
  assert.deepEqual(result.missing,[],id);
  for(const [key,value]of Object.entries(roles))assert.deepEqual(spine.anims[key],value,`${id}: ${key}`);
 }
});
test('a partial client skeleton retains its resolved role when a bound clip is absent',()=>{
 const old={skill:{loop:'Attack',via:'attack'}};
 const result=applyRoleFix(old,{skill:{begin:'Missing',loop:'Skill',end:null}},{Skill:1,Attack:1});
 assert.deepEqual(result.roles,old);
 assert.deepEqual(result.missing,['skill']);
});
