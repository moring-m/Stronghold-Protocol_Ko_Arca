// 규정 m09–m12 as 맹약 "전장 추가" options (tools/build-custom-stages.mjs): the fork sim (server/sim) runs their 加速 tiles
// and m10's 盐坨子炮 like the 규정 sim.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { loadData } from '../../server/data.js';
import { DataSource } from '../../server/sim/simdata.js';
import { setGameData } from '../../server/sim/content/support/index.js';
import { makeBattle, chessRec } from '../helpers/battleHarness.js';
import { customExtensionCatalog } from '../../shared/customExtensions.js';

const raw = loadData(new URL('../../content/production/data', import.meta.url).pathname);
after(() => setGameData(null));

test('the 맹약 custom settings offer 규정 m09–m12 as additional battlefields', () => {
  const ids = (customExtensionCatalog(raw).stages || []).map((s) => s.id);
  for (const id of ['act3autochess_m09', 'act3autochess_m10', 'act3autochess_m11', 'act3autochess_m12']) assert.ok(ids.includes(id), id);
});

test('m10 in the 맹약 sim: the cannon shells (9,6) every 6 s', () => {
  setGameData(raw);
  const data = new DataSource({ ...raw, chess: { ...raw.chess, test_a: chessRec({ id: 'test_a', skill: null, hp: 100000, def: 0 }) } }, null);
  const h = makeBattle({ data, content: 'full', autoFinish: false, timeLimit: 20, stageId: 'act3autochess_m10',
    players: [{ playerId: 'p1', seat: 0, side: 'L', units: [{ uid: 1, kind: 'chess', chessId: 'test_a', row: 9, col: 6 }], bonds: {} }] });
  h.step();
  const u = h.unit(1), hp0 = u.hp;
  h.run(6.5);
  assert.ok(u.hp < hp0);
});
