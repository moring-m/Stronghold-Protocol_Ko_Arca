// test/content/aglna2-shot-timing.test.js — 予愿安洁莉娜's airborne skill attacks are the client's RangedAttack
// (projectile_chr_aglna2_s1 / _s2 / _s3, speed 10): the damage lands when the shot arrives, not as it leaves (user report).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, enemyRec } from '../helpers/battleHarness.js';

const AG = 'chess_custom_recruit_aglna2_5_a';
test('予愿安洁莉娜: a skill shot at a target 3 tiles off hits ~0.3 s after the attack', () => {
  // S1 极速送达 takes off at deployment: her airborne attacks are the skill shots
  const h = makeBattle({ defs: { enemies: { e: enemyRec({ key: 'e', hp: 1e9, speed: 0, atk: 0 }) } },
    units: [{ chessId: AG, row: 10, col: 3, dir: 'RIGHT', skillIndex: 0 }], enemies: [{ key: 'e', pos: [10, 5] }], autoFinish: false, timeLimit: 60 });
  const u = h.unit(AG), atks = [], hits = [];
  h.b.on('attack', (c) => { if (c.attacker === u) atks.push(h.b.time); });
  h.b.on('damaged', (c) => { if (c.source === u && !(c.dmg?.tags || []).includes('aglna2:extra')) hits.push(h.b.time); });
  h.run(10);
  assert.ok(u.skill.active, 'airborne');
  assert.ok(atks.length && hits.length, `attacks ${atks.length}, hits ${hits.length}`);
  assert.ok(hits[0] - atks[0] > 0.12, `the hit waits for the shot (${atks[0]} → ${hits[0]})`);
});
