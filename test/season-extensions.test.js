// 커스텀 설정 of another season (shared/seasonExtensions.js): the 규정 season offers only its own data filters, and a
// match of that season (server/match/Match.js → match-upstream) plays with them applied.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getVersionData } from '../server/data.js';
import { SEASON_EXTENSION_CATEGORIES, SEASON_RULES, seasonExtensionCatalog, seasonExtensionSelection, applySeasonExtensions, validateSeasonExtensions } from '../shared/seasonExtensions.js';
import { Match } from '../server/match/Match.js';

const VERSION = 'act3autochess@V3_1';
const raw = getVersionData(VERSION);

test('the catalogue lists only the season categories, from the season tables', () => {
  const cat = seasonExtensionCatalog(raw);
  for (const k of SEASON_EXTENSION_CATEGORIES) assert.ok(cat[k].length > 0, k);
  assert.deepEqual(cat.rules.map((r) => r.id).sort(), [...SEASON_RULES].sort());
  for (const k of ['allies', 'enemyStats', 'bossStats', 'commonBands', 'bonds', 'stages']) assert.deepEqual(cat[k] ?? [], [], k);
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

test('rules and values reach config.customRules; the round count rebuilds the rounds; no setting = the season tables', () => {
  assert.equal(applySeasonExtensions(raw, seasonExtensionSelection({}, raw)), raw);
  const sel = seasonExtensionSelection({ rules: ['sharedHp', 'duplicateBands', 'augments'], ruleValues: { roundCount: 5, deployCap: 10, stockPlayers: -1, bossBattleSpeed: 1, maxDamage: 1 },
    forcedAuxBonds: [Object.keys(raw.bonds).find((id) => !raw.bonds[id].isCore && raw.bonds[id].weight > 0)] }, raw);
  assert.deepEqual(sel.rules, ['sharedHp', 'duplicateBands']);
  assert.deepEqual(sel.ruleValues, { stockPlayers: -1, roundCount: 5, deployCap: 10 }, 'default and non-season values dropped');
  const d = applySeasonExtensions(raw, sel);
  assert.equal(d.config.customRules.sharedHp, true); assert.equal(d.config.customRules.deployCap, 10); assert.equal(d.config.customRules.unlimitedStock, true);
  assert.deepEqual(d.config.bondPolicy.forcedAuxBonds, sel.forcedAuxBonds);
  const m = d.config.modes.mode_single_1;
  assert.equal(m.bossRound, 6); assert.equal(m.lastRound, 6); assert.deepEqual(Object.keys(m.rounds).map(Number), [1, 2, 3, 4, 5, 6]);
  assert.equal(m.rounds[6].isBoss, true);
});

test('match-upstream reads the rules: deploy cap, stock, duplicate strategies, add-on 항상 밴', () => {
  const addon = Object.keys(raw.bonds).filter((id) => !raw.bonds[id].isCore && raw.bonds[id].weight > 0);
  const make = (ext) => new Match({ roomCode: 'TEST', mode: 'coop', difficulty: 'HARD', seed: 11, version: VERSION, data: raw, gameplayMode: 'custom', customExtensions: ext,
    seats: [0, 1].map((i) => ({ seat: i, playerId: 'p' + i, name: 'P' + i, isBot: false, connected: true })), send: () => true, broadcast: () => {}, onEnd: () => {}, now: () => 0 });
  const plain = make({});
  const m = make({ rules: ['duplicateBands'], ruleValues: { deployCap: 11, stockPlayers: -1 }, forcedAuxBonds: [addon[0]], protectedAuxBonds: [addon[1]] });
  assert.equal(m.gd.deployCap, 11); assert.notEqual(plain.gd.deployCap, 11);
  assert.ok(m.gd.poolCopies(m.gd.visibleChess[0]) > 1e9);
  m.draft = { picks: { p0: 'band_amiya' } }; assert.equal(m.bandTaken('band_amiya', 'p1'), false);
  plain.draft = { picks: { p0: 'band_amiya' } }; assert.equal(plain.bandTaken('band_amiya', 'p1'), true);
  const off = new Set(m.disabledBonds);
  assert.ok(off.has(addon[0])); assert.ok(!off.has(addon[1]));
  assert.equal(m.disabledBonds.filter((id) => !raw.bonds[id].isCore).length, plain.disabledBonds.filter((id) => !raw.bonds[id].isCore).length, 'same add-on quota');
  m.dispose?.(); plain.dispose?.();
});
