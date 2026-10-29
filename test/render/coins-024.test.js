// test/render/hud-readouts.test.js — the HP-bar readouts, client side (R22-HUD; PR #303 and #378 by @IceCodeNew, PR #383
// by @Convey123, folded into one change): render/interp.js carries b.snap `ammo` [[id, left, magazine]], `wolves`
// [[id, left, max]] and `neg` [[id, fill]] beside the unit tuples and samples them from the older snapshot; render/units.js
// draws the ammo skill's segmented yellow bar in place of the SP bar, 伺夜's 狼影 as a row of diamonds and the 我执 pool
// as the red bar over the drained HP bar; an ammo skill has no standing aura (headless fake PIXI, test/render/fakepixi.js).
// The server side is test/sim/hud-readouts.test.js and test/content/op_hsgma2.test.js.
// Run: node --test test/render/hud-readouts.test.js

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { installFakePixi, fakeViewCtx } from './fakepixi.js';
import { presetCamera } from '../../public/js/render/projection.js';
import { SnapshotBuffer, normalizeSnapshot } from '../../public/js/render/interp.js';
import { renderInfo } from '../../public/js/render/app/info.js';
import { UF } from '../../shared/constants.js';
import { makeBattle, enemyRec } from '../helpers/battleHarness.js';
import { unitInfo } from '../../server/sim/snapshot.js';

let fake, FX, UnitView, COLORS, AMMO_BAR, WOLF_PIPS;
before(async () => {
  fake = installFakePixi();
  FX = await import('../../public/js/render/fx.js');
  ({ UnitView, AMMO_BAR, WOLF_PIPS } = await import('../../public/js/render/units.js'));
  ({ COLORS } = await import('../../public/js/render/style.js'));
});
after(() => { FX?.setSimProjectileSpeeds(null); fake.restore(); });

const cam = () => presetCamera('normal', { width: 1280, height: 720 });
const tuple = (id, hp = 1000, extra = {}) => [id, 5, 10, hp, 1000, extra.sp ?? 0, extra.spMax ?? 0, extra.flags ?? 0, 0];
const view = (info = {}, extra = {}) => new UnitView(fakeViewCtx(fake.P, { cam, ...extra }),
  { id: 1, side: 'ally', kind: 'op', defId: 'char_x', tier: 3, x: 5, y: 10, maxHp: 1000, dir: 'RIGHT', ...info });
const sample = (o = {}) => ({ x: 5, y: 10, hp: 1000, maxHp: 1000, sp: 0, spMax: 0, flags: 0, anim: 0, vx: 0, vy: 0, ...o });

test('Swire purse snapshots include zero and the selected skill cap; death removes the readout', () => {
  for (const skillIndex of [0, 1, 2]) {
    const h = makeBattle({ autoFinish: false, units: [{ uid: 1, chessId: 'chess_char_3_04_a', row: 10, col: 4, skillIndex }] });
    h.b.start(); const u = h.unit(1); const cap = u.skill.bb.sp;
    assert.deepEqual(h.b.snapshot().coins, [[u.id, u.mem.coins, cap]]);
    u.mem.coins = 0; assert.deepEqual(h.b.snapshot().coins, [[u.id, 0, cap]]);
    h.b.retreat(u, { reason: 'test' }); assert.equal(h.b.snapshot().coins, undefined);
  }
});

test('coin balance is snapshot-owned: preserves zero, rejects malformed entries and clears when absent', () => {
  const first = normalizeSnapshot({ t: 0, units: [tuple(1)], coins: [[1, 0, 10], [2, 3, 10], [1, -1, 10], [1, 3.5, 10]] });
  assert.deepEqual([...first.coins], [[1, [0, 10]]]);
  const b = new SnapshotBuffer();
  b.push({ t: 0, units: [tuple(1)], coins: [[1, 3, 10]] });
  b.push({ t: 1, units: [tuple(1)] });
  assert.deepEqual(b.sample(0).get(1).coins, [3, 10]);
  assert.equal(b.sample(1).get(1).coins, null);
});

test('the purse reads as ammo in the SP bar (balance / cap segments), no separate coin HUD, gone with its snapshot entry', () => {
  const v = view();
  try {
    v.sync(sample({ coins: [4, 10] }), 0); v.update(0.02, cam(), 0);
    assert.ok(!v.coinHud?.root.visible, 'no coin HUD');
    assert.equal(v.spFill.visible, true); assert.equal(v.ammoDividers.visible, true);
    assert.ok(Math.abs(v.spFill.width / (v.spBg.width - 2) - 0.4) < 1e-6);
    v.sync(sample(), 1); v.update(0.02, cam(), 1); assert.equal(v.ammoDividers.visible, false);
  } finally { v.destroy(); }
});
const frames = (v, n = 2) => { for (let i = 0; i < n; i++) v.update(1 / 60, cam(), i / 60); };
const barWidth = (v) => v.hpBg.width - 2;

