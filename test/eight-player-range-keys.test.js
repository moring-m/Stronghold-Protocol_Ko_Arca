// test/eight-player-range-keys.test.js — the 8-player 联防 field is 37 columns wide: body.js keyed an enemy's tiles with
// the fixed 21 (bodyInRange), so range auras (银灰's 鹰眼视觉 reveal) and every range check through it found no enemy
// on any of the four fields, and 菲莱 S2's element damage never landed (user report after 0.3.3f2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DATA } from './match/harness.js';
import { eightUniteStage, EIGHT_UNITE_RECT } from '../shared/cooperativeEight.js';
import { makeBattle, enemyRec } from './helpers/battleHarness.js';

const stage = eightUniteStage(DATA.stages.act1autochess_m01);
const OFFS = [24, 16, 8, 0];
function field(owner, chessId, enemy) {
  const players = OFFS.map((colOffset, i) => ({ playerId: `p${i}`, colOffset, bonds: {}, units: i === owner ? [{ uid: 1, chessId, row: 12, col: 5, dir: 'RIGHT' }] : [] }));
  const h = makeBattle({ kind: 'unite', stage, rect: EIGHT_UNITE_RECT, autoFinish: false, timeLimit: 60, players,
    defs: { enemies: { e: enemyRec({ key: 'e', hp: 1e9, speed: 0, ...enemy }) } }, enemies: [{ key: 'e', pos: [12, 6 + OFFS[owner]], sourcePlayerId: 'p0' }] });
  h.step();
  return { h, u: h.b.allyUnits.find((x) => x.uid === 1), e: h.b.enemies[0] };
}

for (const owner of [0, 1, 2, 3]) test(`8-player 联防 field ${owner}: 银灰's 鹰眼视觉 reveals and he hits a 隐匿 enemy in range`, () => {
  const { h, e } = field(owner, 'chess_char_4_22_a', {});
  h.b.addBuff(e, { key: 't:stealth', duration: 999, flags: { stealth: true } });
  h.run(3);
  assert.equal(!!e.s.flags.reveal, true);
  assert.ok(e.stats.taken > 0);
});

for (const owner of [0, 3]) test(`8-player 联防 field ${owner}: 菲莱 S2's 凋亡 lands around her`, () => {
  const { h, u, e } = field(owner, 'chess_char_3_06_a', { atk: 200, range: 1.5 });
  u.skill.sp = u.skill.spCost;
  h.run(7);
  assert.ok(u.skill.active || u.skill.sp < u.skill.spCost, 'cast');
  assert.ok(e.elem.apoptosis > 0, '凋亡 gauge');
});

test('8-player 联防 act2 m01: every one of the four fields keeps its two blowers (on its bottom border row 13)', () => {
  const s = eightUniteStage(DATA.stages.act2autochess_m01);
  const blowers = s.devices.filter((d) => d.role === 'blower' && d.pos[0] === 13).map((d) => d.pos[1]);
  for (let f = 0; f < 4; f++) assert.equal(blowers.filter((c) => c >= 2 + 8 * f && c <= 9 + 8 * f).length, 2, `field ${f}`);
  assert.equal(new Set(s.devices.map((d) => d.alias)).size, s.devices.length, 'unique aliases');
});
