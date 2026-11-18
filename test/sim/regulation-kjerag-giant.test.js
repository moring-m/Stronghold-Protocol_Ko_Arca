// 6 谢拉格 (bondeffect_kjerag_2): the 雪山巨人 "可自主行动" — awake it walks towards the enemies, next to one it sits down
// and blocks (user report 2026-11-17: it never moved).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadData } from '../../server/data.js';
import { DataSource } from '../../server/sim-upstream/simdata.js';
import { makeBattle } from '../helpers/battleHarnessUpstream.js';
import { setGameData } from '../../server/sim-upstream/content/support/index.js';

test('the 雪山巨人 of 6 谢拉格 walks to a distant enemy and sits down next to it', () => {
  const V3 = loadData(new URL('../../data/versions/act3autochess-v3_1', import.meta.url).pathname, { log: { warn() {}, error() {}, info() {} } });
  setGameData(V3);
  const kjerag = Object.entries(V3.chess).filter(([id, c]) => /_a$/.test(id) && (c.bonds || []).includes('kjeragShip') && !c.isDiy).map(([id]) => id);
  const seen = new Set(), picks = [];
  for (const id of kjerag) { const base = V3.chess[id].charId; if (!seen.has(base)) { seen.add(base); picks.push(id); } if (picks.length === 6) break; }
  assert.equal(picks.length, 6);
  const units = picks.map((chessId, i) => ({ uid: i + 1, kind: 'chess', chessId, row: 9 + (i % 2), col: 2 + Math.floor(i / 2), skillIndex: 0 }));
  const h = makeBattle({ seed: 1, autoFinish: false, timeLimit: 120, data: new DataSource(V3), flags: { dpInit: 0, dpPerSec: 0 },
    players: [{ playerId: 'p1', seat: 0, side: 'L', colOffset: 0, units, bonds: { kjeragShip: { layers: 30, active: true, count: 6 } }, bandId: null, playerEffects: [] }] });
  h.step();
  const giant = h.battle.allyUnits.find((u) => u.defId === 'enemy_9024_acsgnt');
  assert.ok(giant, 'summoned');
  const start = [giant.tileR, giant.tileC];
  const far = [giant.tileR, Math.min(h.battle.rect.c1, giant.tileC + 8)];
  const e = h.spawn('enemy_1007_slime', { pos: far, route: { motion: 'WALK', start: far, end: far, steps: [{ t: 'wait', s: 99999 }] } });
  e.hp = e.s.maxHp = 1e9;
  h.step(30 * 30); // 30 s
  assert.notDeepEqual([giant.tileR, giant.tileC], start, 'it moved');
  assert.ok(Math.abs(giant.tileC - far[1]) < Math.abs(start[1] - far[1]), 'towards the enemy');
  // it attacks as the record says, not as a 1-tile physical melee unit (user report 2026-11-18)
  assert.equal(giant.profile.dmgType, 'arts');
  assert.ok(giant.rangeGrid.length > 2, 'a reach beyond the tile in front');
  assert.ok(e.hp < e.s.maxHp, 'it hit the enemy');
});
