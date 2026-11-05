// Custom rules unlimitedAspd (no 600 ASPD cap; the attack interval floored at 0.1 s) and skillMotionAspd on 隐德来希 S2
// (blood sickles strike every interval / (ASPD / 100) — they replace her attacks).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadData } from '../../server/data.js';
import { makeBattle, enemyRec, checkInvariants } from '../helpers/battleHarness.js';

const data = loadData(new URL('../../content/production/data/', import.meta.url).pathname);
const rules = (h, r) => { h.b.data.raw = { ...(h.b.data.raw || {}), config: { ...(h.b.data.raw?.config || {}), customRules: r } }; };
const ETL = Object.keys(data.chess).find((id) => id.startsWith('chess_char_5_06') && !data.chess[id].isGolden);

function battle(id, skillIndex) {
  const raw = { ...data, enemies: { ...data.enemies, dummy: enemyRec({ key: 'dummy', hp: 1e9, speed: 0, atk: 0 }) } };
  const h = makeBattle({ data: raw, autoFinish: false, units: [{ chessId: id, row: 10, col: 3, skillIndex }], enemies: [{ key: 'dummy', pos: [10, 4] }] });
  h.step(); h.run(Math.max(0, ...h.b.allyUnits.map((u) => u.deployRemaining || 0)) + .1);
  return { h, u: h.unit(id) };
}

test('unlimitedAspd: off, ASPD stops at 600; on, it goes past 600 and the interval never drops below 0.1 s', () => {
  for (const on of [false, true]) {
    const { h, u } = battle(ETL, 0);
    rules(h, on ? { unlimitedAspd: true } : {});
    h.b.addBuff(u, { key: 'test:aspd', mods: { aspd: 900 } }); u.markDirty(); h.step();
    if (on) { assert.ok(u.s.aspd > 600, `ASPD ${u.s.aspd}`); assert.ok(u.s.interval >= 0.1 - 1e-12, `interval ${u.s.interval}`); }
    else assert.equal(u.s.aspd, 600);
    h.b.addBuff(u, { key: 'test:aspd2', mods: { aspd: 1e6 } }); u.markDirty(); h.step();
    if (on) assert.equal(u.s.interval, 0.1, 'floored at 0.1 s');
    checkInvariants(h.b);
  }
});

test('skillMotionAspd: 隐德来希 S2 sickles strike every interval / (ASPD / 100); off, every interval', () => {
  const hits = {};
  for (const on of [false, true]) {
    const { h, u } = battle(ETL, 1);
    rules(h, on ? { skillMotionAspd: true } : {});
    let n = 0; h.b.on('damaged', (c) => { if (c.source === u && c.dmg?.tags?.includes('bloodSickle')) n++; }, { priority: -999 });
    u.skill.gainSp(1000); assert.ok(u.skill.activate('test'), 'S2 cast');
    for (let t = 0; t < 2.01; t += h.b.dt) { u.s.aspd = 200; h.step(); }
    hits[on] = n;
    checkInvariants(h.b);
  }
  assert.ok(hits.false > 0, 'the sickles strike');
  assert.ok(Math.abs(hits.true - hits.false * 2) <= 2, `twice the strikes at ASPD 200: ${hits.false} -> ${hits.true}`);
});
