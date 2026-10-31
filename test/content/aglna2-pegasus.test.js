// test/content/aglna2-pegasus.test.js — 予愿安洁莉娜 with 天马之盔 + 天马之枪: her T1 arts addition and the lance's true
// damage are both 附加伤害; each took the other's hit as an output and they chained (589 of each over 19 attacks).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, enemyRec } from '../helpers/battleHarness.js';

const AG = 'chess_custom_recruit_aglna2_5_a';
test('予愿安洁莉娜 + 天马 set: one T1 addition per attack, the lance adds once to the attack and once to that addition', () => {
  const h = makeBattle({ defs: { enemies: { e: enemyRec({ key: 'e', hp: 1e9, speed: 0, atk: 0 }) } },
    units: [{ chessId: AG, row: 10, col: 4, dir: 'RIGHT', items: ['chess_item_5_09_e_a', 'chess_item_6_01_e_a'] }],
    enemies: [{ key: 'e', pos: [10, 5] }], autoFinish: false, timeLimit: 100 });
  const u = h.unit(AG), n = { phys: 0, extra: 0, peg: 0 };
  h.b.on('damaged', (c) => {
    if (c.source !== u) return;
    const t = c.dmg?.tags || [];
    if (t.includes('aglna2:extra')) n.extra++; else if (t.includes('item:pegasus')) n.peg++; else n.phys++;
  });
  h.run(30);
  assert.ok(n.phys > 5, 'she attacks');
  assert.equal(n.extra, n.phys, 'one addition per attack');
  assert.equal(n.peg, 2 * n.phys, 'the lance on the attack and on the addition, never on its own hit');
});
