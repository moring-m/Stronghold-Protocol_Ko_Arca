// Custom augment schedule (augmentFirstRound / augmentInterval / augmentCount) and default augments
// (defaultAllyAugments / defaultEnemyAugments — combat augments only, active from the first battle).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Match } from '../../server/match/Match.js';
import { loadData } from '../../server/data.js';
import { VirtualScheduler } from '../../server/match/scheduler.js';
import { augmentScheduleRounds, augmentPoolRound, combatAugmentCatalog, COMBAT_AUGMENT_KINDS, createAugmentCatalog } from '../../shared/augments.js';
import { customExtensionCatalog } from '../../shared/customExtensions.js';

const data = loadData('content/production/data');
function match(t, customExtensions) {
  const sched = new VirtualScheduler();
  const m = new Match({ data, mode: 'coop', difficulty: 'NORMAL', seed: 3, customExtensions, seats: [0, 1].map((i) => ({ seat: i, playerId: 'p' + i, name: 'P' + i, connected: true })), getHostId: () => 'p0', scheduler: sched, send: () => true, broadcast: () => {}, onEnd: () => {} });
  t.after(() => m.dispose());
  return m;
}

test('schedule: defaults are 4·7·10; first 1 / interval 1 / count 3 = rounds 1, 2, 3; never at or past the boss round', () => {
  assert.deepEqual(augmentScheduleRounds({}), [4, 7, 10]);
  assert.deepEqual(augmentScheduleRounds({ augmentFirstRound: 4, augmentInterval: 3, augmentCount: 3 }), [4, 7, 10]);
  assert.deepEqual(augmentScheduleRounds({ augmentFirstRound: 1, augmentInterval: 1, augmentCount: 3 }), [1, 2, 3]);
  assert.deepEqual(augmentScheduleRounds({ augmentFirstRound: 10, augmentInterval: 2, augmentCount: 5 }, 14), [10, 12]);
});

test('pool round: an offer draws from the first of 4·7·10 at or after it (a 7-round augment at 5–7, a 4-round one at 1–4)', () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 13].map(augmentPoolRound), [4, 4, 4, 4, 7, 7, 7, 10, 10, 10, 10, 10]);
});

test('a match offers augments at the custom rounds, from the matching pool', (t) => {
  const m = match(t, { rules: ['augments'], ruleValues: { augmentFirstRound: 1, augmentInterval: 1, augmentCount: 3 } });
  assert.deepEqual(m.augments.rounds(), [1, 2, 3]);
  m.round = 2; m.afterRoundStart();
  assert.ok(m.augments.current, 'an augment at round 2');
  const pool4 = new Set(createAugmentCatalog(m.data, 4).map((a) => a.id));
  const slot = m.augments.current.slots.get('p0');
  assert.ok(slot.cards.filter(Boolean).every((c) => pool4.has(c.id)), 'round 2 draws the round-4 pool');
});

test('default augment catalogs hold only combat augments of their side', () => {
  const c = customExtensionCatalog(data);
  for (const [side, list] of [['ally', c.defaultAllyAugments], ['enemy', c.defaultEnemyAugments]]) {
    assert.ok(list.length > 0);
    const full = new Map(combatAugmentCatalog(data, side).map((a) => [a.id, a]));
    for (const e of list) { const a = full.get(e.id); assert.ok(a, e.id); assert.equal(a.side, side); assert.ok(COMBAT_AUGMENT_KINDS.has(a.effect.kind), `${e.id} ${a.effect.kind}`); }
  }
  const allAlly = new Set([4, 7, 10].flatMap((r) => createAugmentCatalog(data, r)).filter((a) => a.side === 'ally' && !COMBAT_AUGMENT_KINDS.has(a.effect.kind)).map((a) => a.id));
  assert.ok(allAlly.size > 0 && c.defaultAllyAugments.every((e) => !allAlly.has(e.id)), 'no non-combat augment (funds, items, operators …) can be chosen');
});

test('default augments reach the battle from round 1 without augment mode, and are never offered', (t) => {
  const ally = combatAugmentCatalog(data, 'ally')[0], enemy = combatAugmentCatalog(data, 'enemy')[0];
  const m = match(t, { rules: [], defaultAllyAugments: [ally.id], defaultEnemyAugments: [enemy.id] });
  assert.equal(m.augments.enabled, false);
  assert.equal(m.augments.active(), true);
  const st = m.augments.battleState();
  for (const id of ['p0', 'p1']) assert.deepEqual(st.allies[id].map((a) => a.id), [ally.id]);
  assert.deepEqual(st.enemies.map((a) => a.id), [enemy.id]);
  assert.equal(m.augments.enter(), false, 'no offer without augment mode');

  const on = match(t, { rules: ['augments'], defaultAllyAugments: [ally.id] });
  on.round = 4; on.augments.current = { grade: ally.grade };
  assert.ok(!on.augments.catalog('ally', on.players.get('p0')).some((a) => a.id === ally.id), 'a default augment is not offered again');
});
