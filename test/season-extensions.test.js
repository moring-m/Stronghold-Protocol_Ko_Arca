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
  for (const k of SEASON_EXTENSION_CATEGORIES.filter((k) => !['allies', 'enemyStats', 'bossStats', 'augmentSettings'].includes(k))) assert.ok(cat[k].length > 0, k);
  assert.deepEqual(cat.rules.map((r) => r.id).sort(), [...SEASON_RULES].sort());
  for (const k of ['bonds', 'stages']) assert.deepEqual(cat[k] ?? [], [], k);
  assert.ok(cat.defaultAllyAugments.length > 0 && cat.defaultEnemyAugments.length > 0);
  assert.ok(cat.bannedOperators.every((e) => raw.chess[e.id]));
  assert.ok(cat.disabledStages.every((e) => raw.stages[e.id]));
});

test('a selection keeps the season ids only; applying it filters pool, bonds, maps, bosses and strategies', () => {
  const cat = seasonExtensionCatalog(raw);
  const op = cat.bannedOperators[0].id, bond = cat.disabledBonds[0].id, band = cat.disabledBands[0].id, boss = cat.disabledBosses[0].id, stage = cat.disabledStages.at(-1).id;
  const sel = seasonExtensionSelection({ bannedOperators: [op, 'no_such_chess'], disabledBonds: [bond], disabledBands: [band], disabledBosses: [boss], disabledStages: [stage], rules: ['augments'] }, raw);
  assert.deepEqual(sel.bannedOperators, [op]); assert.deepEqual(sel.rules, ['augments']);
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
  const sel = seasonExtensionSelection({ rules: ['sharedHp', 'duplicateBands', 'augments'], ruleValues: { roundCount: 5, deployCap: 10, stockPlayers: -1, bossBattleSpeed: 1, maxDamage: 1, augmentGold: 9, enemyHpByAugment: 1 },
    forcedAuxBonds: [Object.keys(raw.bonds).find((id) => !raw.bonds[id].isCore && raw.bonds[id].weight > 0)] }, raw);
  assert.deepEqual(sel.rules, ['sharedHp', 'duplicateBands', 'augments']);
  assert.deepEqual(sel.ruleValues, { stockPlayers: -1, roundCount: 5, deployCap: 10, maxDamage: 1, augmentGold: 9, enemyHpByAugment: 1 }, 'default values dropped');
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

// ---- battle stats (sim-upstream reads the match's customRules from the BattleSpec flags) ----
import { makeBattle, chessRec, enemyRec } from './helpers/battleHarnessUpstream.js';

const statBattle = (customRules, kind = 'normal') => makeBattle({
  kind, units: [{ chessId: 'c1', row: 10, col: 4 }],
  defs: { chess: { c1: chessRec({ id: 'c1', stats: { maxHp: 2000, atk: 500, aspd: 100, bat: 1 } }) }, enemies: { enemy_t: enemyRec({ key: 'enemy_t', hp: 5000, atk: 100 }) } },
  enemies: [{ key: 'enemy_t', time: 0 }], flags: customRules ? { customRules } : {},
});

test('sim-upstream: ally / enemy stat percentages from customRules; none = the upstream stats', () => {
  const plain = statBattle(null); plain.runUntil(() => plain.enemies().length > 0, 10);
  const h = statBattle({ allyHp: 200, allyAtk: 50, enemyHp: 300, enemySpeed: 50 }); h.runUntil(() => h.enemies().length > 0, 10);
  const a0 = plain.allies()[0], a1 = h.allies()[0], e0 = plain.enemies()[0], e1 = h.enemies()[0];
  assert.ok(a0 && a1 && e0 && e1);
  assert.equal(a1.base.maxHp, a0.base.maxHp * 2); assert.equal(a1.base.atk, a0.base.atk / 2);
  assert.equal(e1.base.maxHp, e0.base.maxHp * 3); assert.equal(e1.base.moveSpeed, e0.base.moveSpeed / 2);
});

test('sim-upstream: unlimitedAspd lifts the 600 cap; the boss hit limit follows maxDamage', async () => {
  const { leaderHitCancelled } = await import('../server/sim-upstream/attack/health.js');
  const boss = { isBoss: true, x: 0, y: 0, id: 1 };
  const b = (rules) => ({ kind: 'boss', flags: rules ? { customRules: rules } : {}, fx: () => {} });
  assert.equal(leaderHitCancelled(b(null), boss, 300000), true);
  assert.equal(leaderHitCancelled(b({ maxDamage: 1000 }), boss, 2000), true);
  assert.equal(leaderHitCancelled(b({ maxDamage: 0 }), boss, 9e9), false);
  const h = statBattle({ unlimitedAspd: true, allyAspd: 1000 }); h.runUntil(() => h.allies().length > 0, 10);
  assert.ok(h.allies()[0].s.aspd > 600);
  const c = statBattle({ allyAspd: 1000 }); c.runUntil(() => c.allies().length > 0, 10);
  assert.equal(c.allies()[0].s.aspd, 600);
});

// ---- 증강 (custom 증강 모드) in a 규정 match ----
test('augments: the season catalogue maps items by name and names bonds in Korean', async () => {
  const { createAugmentCatalog } = await import('../shared/augments.js');
  const cat = [4, 7, 10].flatMap((r) => createAugmentCatalog(raw, r));
  for (const a of cat) for (const id of a.effect.items || []) assert.ok(raw.items[id], `${a.name}: ${id}`);
  const gamble = cat.find((a) => a.name === '도박 I');
  assert.equal(raw.items[gamble.effect.items[0]].name, '驮兽储蓄罐', '기사 저금통 → 버든비스트 저금통');
  assert.ok(cat.some((a) => a.name === '이베리아 지원 I'));
  assert.ok(!cat.some((a) => /[一-鿿]/.test(a.name + a.description)));
  const egir = cat.find((a) => a.name === '에기르 장비 지원 II');
  assert.deepEqual(egir.effect.counts, [3]);
});

test('augments: a custom 규정 match offers them at round 4 before the season draft, and the battles carry them', () => {
  const m = new Match({ roomCode: 'TEST', mode: 'solo', difficulty: 'FUNNY', seed: 5, version: VERSION, data: raw, gameplayMode: 'augment',
    customExtensions: seasonExtensionSelection({ rules: ['augments'] }, raw), seats: [{ seat: 0, playerId: 'p1', name: 'P1', isBot: false, connected: true }],
    send: () => true, broadcast: () => {}, onEnd: () => {}, now: () => 0 });
  assert.ok(m.augments?.enabled);
  const off = new Match({ roomCode: 'TEST', mode: 'solo', difficulty: 'FUNNY', seed: 5, version: VERSION, data: raw,
    seats: [{ seat: 0, playerId: 'p1', name: 'P1', isBot: false, connected: true }], send: () => true, broadcast: () => {}, onEnd: () => {}, now: () => 0 });
  assert.equal(off.augments, null, 'no augments on an official match');
  m.round = 4;
  assert.equal(m.augments.enter(), true);
  assert.equal(m.phase, 'SP_DRAFT');
  const slot = m.augments.current.slots.get('p1');
  assert.equal(slot.cards.length, 3);
  for (const c of slot.cards) for (const id of c?.effect?.items || []) assert.ok(raw.items[id]);
  assert.equal(m.playerStatus?.(m.players.get('p1')) ?? 'deciding', 'deciding');
  const pub = m.publicView(); assert.ok(pub.augments);
  m.dispose?.(); off.dispose?.();
});

test('sim-upstream: augment effects reach the battle (ally stats, enemy grade HP); none = upstream', () => {
  const run = (augments) => { const h = makeBattle({ units: [{ chessId: 'c1', row: 10, col: 4 }],
    defs: { chess: { c1: chessRec({ id: 'c1', stats: { maxHp: 2000, atk: 500 } }) }, enemies: { enemy_t: enemyRec({ key: 'enemy_t', hp: 5000 }) } },
    enemies: [{ key: 'enemy_t', time: 0 }], flags: augments ? { augments } : {} }); h.runUntil(() => h.enemies().length > 0, 10); return h; };
  const plain = run(null);
  const h = run({ allies: { p1: [{ effect: { kind: 'stats', mods: { atkPct: 0.5 } } }] }, enemies: [], enemyHpMultiplier: 2 });
  assert.equal(h.allies()[0].s.atk, plain.allies()[0].s.atk * 1.5);
  assert.equal(h.enemies()[0].s.maxHp, plain.enemies()[0].s.maxHp * 2);
});

test('common strategies: kept in the selection, carried as customRules.commonBands', () => {
  const band = Object.keys(raw.bands)[0];
  const sel = seasonExtensionSelection({ commonBands: [band, 'no_such_band'] }, raw);
  assert.deepEqual(sel.commonBands, [band]);
  assert.deepEqual(applySeasonExtensions(raw, sel).config.customRules.commonBands, [band]);
});
