// Real reflected hits against a scaled hit-count enemy must finish without recursive hook overflow.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {getDefaultSource} from '../../server/sim/simdata.js';
import { makeBattle, checkInvariants } from '../helpers/battleHarness.js';
const ECHO = 'enemy_9023_acdums';
for (const chessId of ['chess_char_1_06_b', 'chess_char_2_08_a']) {
  test(`${chessId}: a 67-hit echo resolves all counter pulses including its lethal hit`, () => {
    const raw=structuredClone(getDefaultSource().rawEnemy(ECHO));raw.stats.maxHp=67;raw.stats.hp=67;
    const h = makeBattle({defs:{enemies:{[ECHO]:raw}}, units: [{ chessId, row: 10, col: 4 }], autoFinish: false, captureNoisy: true, hooks: ['damaged'] });
    h.step();h.runUntil(()=>h.unit(chessId).deployRemaining<=1e-9,3);
    const u = h.unit(chessId);
    h.b.addBuff(u, { key: 'test:survive', persist: true, mods: { hpFlat: 1e8 } });
    u.hp = u.s.maxHp;
    u.skill.sp = u.skill.spCost; u.skill.charges = 1;
    assert.ok(u.skill.activate('manual'));
    const echo = h.spawn(ECHO, { pos: [10, 5], mods: { hpMul: 1, speedMul: 0 } });
    assert.equal(echo.s.maxHp, 67);
    const t = h.eventsOf('fx').length;
    h.b.dealDamage(u, echo, { amount: 1, type: 'arts', isAttack: true });
    assert.equal(echo.alive, false);
    assert.equal(h.b.errors.length, 0);
    assert.equal(h.eventsOf('fx').slice(t).filter((f) => f[1] === 'explode' && f[4]?.kind === 'echoPulse').length, 67);
    assert.equal(echo.mem.ab.pulsing, false);
    assert.deepEqual(echo.mem.ab.pulses, []);
    checkInvariants(h.b);
  });
}
