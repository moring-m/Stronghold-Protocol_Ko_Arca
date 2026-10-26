// 谬因's path effects (render/vfx/aphrisfx.js): the client follows op-aphris.js aphrisPath over the shown board.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aphrisPath, pathKeys, AphrisFx } from '../../public/js/render/vfx/aphrisfx.js';

const BOUNDS = { r0: 0, r1: 8, c0: 0, c1: 12 };
const op = (x, y, dir = 'RIGHT', extra = {}) => ({ id: extra.id ?? `${x},${y}`, x, y, dir, alive: true, info: { kind: 'op', ...(extra.info || {}) }, ...extra });
const relay = (x, y, dir, owner) => op(x, y, dir, { id: `r${x},${y}`, info: { kind: 'token', defId: 'token_10070_aphris_pc', ownerId: owner } });

test('her path runs straight for her reach', () => {
  const her = op(2, 3, 'RIGHT', { id: 'a' });
  const p = aphrisPath(her, [her], 5, BOUNDS);
  assert.deepEqual(p.tiles, [[3, 2], [3, 3], [3, 4], [3, 5], [3, 6], [3, 7]]);
  assert.deepEqual(p.corners, [0, 5]);
  assert.deepEqual(p.relays, []);
});

test('a relay of hers turns the path and extends it by two', () => {
  const her = op(2, 3, 'RIGHT', { id: 'a' });
  const r = relay(4, 3, 'UP', 'a');
  const p = aphrisPath(her, [her, r], 5, BOUNDS);
  // 2 tiles to the relay, then 5 more (3 left + 2) upward (UP = +row)
  assert.deepEqual(p.tiles, [[3, 2], [3, 3], [3, 4], [4, 4], [5, 4], [6, 4], [7, 4], [8, 4]]);
  assert.deepEqual(p.relays, [2]);
  assert.deepEqual(p.corners, [0, 2, 7]);
});

test("another operator's relay and ordinary allies leave her normal path alone; the S2 beam turns at allies", () => {
  const her = op(2, 3, 'RIGHT', { id: 'a' });
  const other = relay(4, 3, 'UP', 'b'), ally = op(6, 3, 'DOWN', { id: 'x' });
  assert.deepEqual(aphrisPath(her, [her, other, ally], 5, BOUNDS).corners, [0, 5]);
  const beam = aphrisPath(her, [her, ally], Infinity, BOUNDS, true);
  assert.deepEqual(beam.tiles.slice(4), [[3, 6], [2, 6], [1, 6], [0, 6]]);
});

test('the attack draws start, one line per straight run, waypoints and the end', () => {
  const spawned = [];
  const ofx = { active: true, time: 0, lib: { has: () => true },
    spawn(key, place, opts) { const h = { key, place, opts, stop() { this.stopped = true; } }; spawned.push(h); return h; } };
  const her = op(2, 3, 'RIGHT', { id: 'a' }), r = relay(4, 3, 'UP', 'a');
  const w = { ofx, opts: { record: () => ({ rangeGrid: [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4], [0, 5]] }) }, unitOf: () => null, skinOf: () => null };
  const fx = new AphrisFx(w);
  fx.sync([her, r]);
  const em = { class: 'AphrisEffectEmitter', lineEffectKey: 'line', startPointEffectKey: 'start', waypointEffectKey: 'way', endPointEffectKey: 'end', waypointUseFixedHeight: 1, waypointFixedHeight: 0.65 };
  assert.deepEqual(pathKeys(em), { line: 'line', start: 'start', waypoint: 'way', end: 'end', height: 0.65 });
  assert.equal(fx.attack(her, em), true);
  assert.deepEqual(spawned.map((h) => h.key), ['start', 'line', 'line', 'way', 'end']);
  ofx.time = 1; fx.tick();
  assert.ok(spawned.every((h) => h.stopped), 'an attack path clears after it shows');
});
