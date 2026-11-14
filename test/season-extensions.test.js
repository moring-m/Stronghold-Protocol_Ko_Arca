// 커스텀 설정 of another season (shared/seasonExtensions.js): the 규정 season offers only its own data filters, and a
// match of that season (server/match/Match.js → match-upstream) plays with them applied.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getVersionData } from '../server/data.js';
import { SEASON_EXTENSION_CATEGORIES, seasonExtensionCatalog, seasonExtensionSelection, applySeasonExtensions, validateSeasonExtensions } from '../shared/seasonExtensions.js';
import { Match } from '../server/match/Match.js';

const VERSION = 'act3autochess@V3_1';
const raw = getVersionData(VERSION);

test('the catalogue lists only the season categories, from the season tables', () => {
  const cat = seasonExtensionCatalog(raw);
  for (const k of SEASON_EXTENSION_CATEGORIES) assert.ok(cat[k].length > 0, k);
  for (const k of ['rules', 'allies', 'enemyStats', 'bossStats', 'commonBands', 'bonds', 'stages', 'forcedBonds']) assert.deepEqual(cat[k] ?? [], [], k);
  assert.ok(cat.bannedOperators.every((e) => raw.chess[e.id]));
  assert.ok(cat.disabledStages.every((e) => raw.stages[e.id]));
});

test('a selection keeps the season ids only; applying it filters pool, bonds, maps, bosses and strategies', () => {
  const cat = seasonExtensionCatalog(raw);
  const op = cat.bannedOperators[0].id, bond = cat.disabledBonds[0].id, band = cat.disabledBands[0].id, boss = cat.disabledBosses[0].id, stage = cat.disabledStages.at(-1).id;
  const sel = seasonExtensionSelection({ bannedOperators: [op, 'no_such_chess'], disabledBonds: [bond], disabledBands: [band], disabledBosses: [boss], disabledStages: [stage], rules: ['augments'] }, raw);
  assert.deepEqual(sel.bannedOperators, [op]); assert.deepEqual(sel.rules, []);
  const d = applySeasonExtensions(raw, sel);
  assert.equal(d.chess[op].visible, false); assert.notEqual(raw.chess[op].visible, false, 'the input is not changed');
  assert.equal(d.bands[band], undefined);
  for (const m of Object.values(d.config.modes)) {
    assert.ok(!(m.stages || []).includes(stage));
    assert.ok((m.inactiveBondIds || []).includes(bond));
    assert.ok(!(boss in (m.bossWeights || {})) && !(boss in (m.hiddenBossWeights || {})));
  }
  assert.deepEqual(validateSeasonExtensions(raw, sel, { mode: 'solo', difficulty: 'FUNNY' }), []);
  const all = seasonExtensionSelection({ disabledStages: cat.disabledStages.map((e) => e.id) }, raw);
  assert.ok(validateSeasonExtensions(raw, all, { mode: 'solo', difficulty: 'FUNNY' }).includes('맵을 최소 1개 남겨야 합니다.'));
});

test('a custom 규정 match never offers a banned operator', () => {
  const op = seasonExtensionCatalog(raw).bannedOperators[0].id;
  const m = new Match({ roomCode: 'TEST', mode: 'solo', difficulty: 'FUNNY', seed: 7, version: VERSION, data: raw, gameplayMode: 'custom',
    customExtensions: { bannedOperators: [op] }, seats: [{ seat: 0, playerId: 'p1', name: 'P1', isBot: false, connected: true }],
    send: () => true, broadcast: () => {}, onEnd: () => {}, now: () => 0 });
  assert.equal(m.data.chess[op].visible, false);
  assert.ok(!m.gd.visibleChess.includes(op));
  m.dispose?.();
});
