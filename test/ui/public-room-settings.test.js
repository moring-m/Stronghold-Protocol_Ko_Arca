import{test}from'node:test';import assert from'node:assert/strict';import{roomSettingsGroups}from'../../public/js/ui/publicRoomSettings.js';
test('public settings viewer includes changed values only and omits empty categories',()=>{
 assert.deepEqual(roomSettingsGroups({},{}),[]);
 const groups=roomSettingsGroups({rules:['augments'],ruleValues:{enemyHp:150,augmentEnemyVote:2,bossHp:250,bossHpByAugment:1}},{});
 assert.deepEqual(groups.map(g=>g.id).sort(),['rules','enemyStats','bossStats','augmentSettings'].sort());
 const entries=groups.flatMap(g=>g.entries);assert.ok(entries.some(e=>e.name==='적 최대 HP'&&e.value==='150%'));assert.ok(entries.some(e=>e.value==='가중치 투표'));assert.ok(entries.some(e=>e.value==='증강 등급 누적'));
 assert.equal(entries.some(e=>e.name==='보스 최대 HP'),false,'unused fixed HP is not an applied change');assert.equal(entries.some(e=>e.name==='보스 라운드 전투 시간'),false);
});
