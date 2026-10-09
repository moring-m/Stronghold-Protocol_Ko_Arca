// test/render/board3d.test.js — the official 3D board scene (DESIGN §15, public/js/render/board3d): the atlas surface
// table, the OBJ reader, the geometry builder (heights agree with the Pixi layers, areas per phase, gates, devices,
// fences, terrain, sane buffers), the board-space conversion of the official meshes, the asset pack loader (fake
// store), and the three.js scene graph built with the real three package and a stub renderer (no WebGL in Node).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { SURFACES, SOURCES, surfaceUV, resolveUvTable, cleanSurface, sideRect, tintRgb } from '../../public/js/render/board3d/atlas.js';
import { parseObj, mapMesh } from '../../public/js/render/board3d/obj.js';
import {
  buildBoard, classifyStage, heightOf, AREAS, areaFor, unionAreas, objToBoard, boxProjectUV, tube, Geom, uvAt, ROWS, COLS,
} from '../../public/js/render/board3d/layout.js';
import { BoardScene, gatePulse, DIR_TURNS, boxData, LIGHTING, geometryForArea, sceneryForArea, surfaceForArea } from '../../public/js/render/board3d/scene.js';
import { loadBoardPack, resetBoardPack, PACK_IMAGES } from '../../public/js/render/board3d/load.js';
import { parseStage } from '../../public/js/render/tiles.js';
import { TILE_H } from '../../public/js/render/style.js';
import { presetCamera, syncThreeCamera } from '../../public/js/render/projection.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const stages = JSON.parse(readFileSync(path.join(ROOT, 'data/stages.json'), 'utf8'));
const ACTIVE = Object.values(stages).filter((s) => s.active).map((s) => s.id);
const LOCAL = path.join(ROOT, 'public/assets/local');
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

describe('atlas surfaces', () => {
  test('every surface is valid and inside its source; tiles.json overrides merge, junk is ignored', () => {
    for (const [k, v] of Object.entries(SURFACES)) {
      const c = cleanSurface(v);
      assert.ok(c, k);
      const S = SOURCES[c.src];
      assert.ok(c.rect[0] + c.rect[2] <= S.w && c.rect[1] + c.rect[3] <= S.h, k);
    }
    const t = resolveUvTable({ board3d: { concrete: { src: 'D', rect: [0, 0, 64, 64], rot: 90 }, bogus: { src: 'X', rect: [0, 0, 1, 1] }, hatch: { src: 'D', rect: [2040, 0, 64, 64] } } });
    assert.deepEqual(t.concrete.rect, [0, 0, 64, 64]);
    assert.equal(t.concrete.rot, 90);
    assert.equal(t.bogus, undefined);
    assert.deepEqual(t.hatch.rect, SURFACES.hatch.rect, 'out-of-bounds override rejected');
    assert.deepEqual(Object.keys(resolveUvTable(null)).sort(), Object.keys(SURFACES).sort());
  });

  test('surfaceUV: corner order BL, BR, TR, TL with the texture top on the far edge; rotation and flip permute', () => {
    const s = { src: 'D', rect: [256, 512, 256, 256] };
    const uv = surfaceUV(s, null, 0);
    // BL = (x0, bottom) → v = 1 − 768/2048; TL = (x0, top) → v = 1 − 512/2048
    assert.deepEqual(uv.map((x) => +x.toFixed(6)), [0.125, 0.625, 0.25, 0.625, 0.25, 0.75, 0.125, 0.75]);
    const r90 = surfaceUV({ ...s, rot: 90 }, null, 0);
    assert.deepEqual(r90.slice(0, 2), uv.slice(2, 4), 'rot 90: BL samples the texture BR');
    const f = surfaceUV({ ...s, flipX: true }, null, 0);
    assert.deepEqual(f.slice(0, 2), uv.slice(2, 4));
    const inset = surfaceUV(s, null, 2);
    assert.ok(inset[0] > uv[0] && inset[2] < uv[2], 'mip inset');
    // side panels keep their aspect: a 1 × 0.42 face uses the top 0.42·272/384 of the gold panel
    const sr = sideRect(SURFACES.goldSide, 1, 0.42);
    assert.ok(near(sr[3], 0.42 / (384 / 272), 1e-9));
    assert.deepEqual(sideRect(SURFACES.goldSide, 1, 5), [0, 0, 1, 1]);
    assert.deepEqual(tintRgb('#ff0000'), [1, 0, 0]);
    assert.deepEqual(tintRgb('nope'), [1, 1, 1]);
    assert.deepEqual(uvAt([0, 0, 1, 0, 1, 1, 0, 1], 0.25, 0.5), [0.25, 0.5]);
  });
});

describe('OBJ reader', () => {
  test('polygons fan into triangles; relative indices; groups; per-corner de-duplication', () => {
    const m = parseObj(['# quad', 'v 0 0 0', 'v 1 0 0', 'v 1 1 0', 'v 0 1 0', 'vt 0 0', 'vt 1 0', 'vt 1 1', 'vt 0 1', 'vn 0 0 1',
      'g a', 'f 1/1/1 2/2/1 3/3/1 4/4/1', 'g b', 'f -4/-4/-1 -2/-2/-1 -1/-1/-1'].join('\n'));
    assert.equal(m.index.length, 9);
    assert.equal(m.position.length / 3, 4, 'shared corners reused');
    assert.deepEqual(m.groups.map((g) => [g.name, g.count]), [['a', 6], ['b', 3]]);
    assert.deepEqual(m.bounds, { min: [0, 0, 0], max: [1, 1, 0] });
    assert.ok(m.normal && m.uv);
    assert.equal(parseObj(''), null);
    assert.equal(parseObj('v 1 2 3\nf 1 2 9'), null, 'bad indices dropped');
    const moved = mapMesh(m, (x, y, z) => [x + 1, y, z]);
    assert.equal(moved.position[0], 1);
  });

  test('vertex colours (v x y z r g b) are read', () => {
    const m = parseObj('v 0 0 0 1 0 0\nv 1 0 0 0 1 0\nv 0 1 0 0 0 1\nf 1 2 3');
    assert.deepEqual([...m.color], [1, 0, 0, 0, 1, 0, 0, 0, 1]);
  });

  test('the extracted official meshes parse (when the local client was extracted)', { skip: !existsSync(path.join(LOCAL, 'mesh/s_common_box_01/pCube2.obj')) && 'not extracted' }, () => {
    const crate = parseObj(readFileSync(path.join(LOCAL, 'mesh/s_common_box_01/pCube2.obj'), 'utf8'));
    assert.deepEqual(crate.bounds.max.map(Math.round), [45, 68, 45]);
    const b = objToBoard(crate, 0.01);
    // Y-up Unity → board z-up: the crate stands 0.675 tall on the ground, 0.9 wide
    let z1 = -Infinity, z0 = Infinity;
    for (let i = 2; i < b.position.length; i += 3) { z1 = Math.max(z1, b.position[i]); z0 = Math.min(z0, b.position[i]); }
    assert.ok(near(z0, 0, 1e-6) && near(z1, 0.675, 1e-4), `${z0}..${z1}`);
    const blower = parseObj(readFileSync(path.join(LOCAL, 'mesh/s_wind_device/S_wild_wind_device.obj'), 'utf8'));
    assert.ok(blower.index.length > 100 && blower.uv);
    const gate = parseObj(readFileSync(path.join(LOCAL, 'map/fx/Start_up.obj'), 'utf8'));
    assert.deepEqual(gate.bounds.min.map(Math.round), [-50, -50, -50], 'the gate box is a 1-tile cube at scale 0.01');
  });
});

describe('board geometry (layout.js)', () => {
  test('heights agree with the Pixi tile field (units stand on the same tops) on every stage', () => {
    for (const st of Object.values(stages)) {
      const G = classifyStage(st, AREAS.all);
      const P = parseStage(st, [0, 18], [0, 18]);
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        const a = G[r][c], b = P[r][c];
        assert.equal(a.glyph, b.glyph, `${st.id} ${r},${c}`);
        if (a.drawn) assert.ok(near(a.h, b.h), `${st.id} ${r},${c} h ${a.h} vs ${b.h}`);
      }
      assert.equal(heightOf(G, -1, 3), 0);
    }
    assert.equal(classifyStage(stages.act2autochess_m01)[10][4].h, TILE_H.wall, 'high ground');
  });

  test('areas: the normal phase builds the own field + pen, 联防 both halves, the Final Assault the boss field', () => {
    const st = stages.act2autochess_m01;
    const drawnRows = (area) => { const G = classifyStage(st, area); const rows = new Set(); for (const row of G) for (const t of row) if (t.drawn) rows.add(t.r); return [...rows].sort((a, b) => a - b); };
    const n = drawnRows(AREAS.normal), b = drawnRows(AREAS.boss);
    assert.ok(n.includes(7) && n.includes(12) && n.includes(16) && !n.includes(3), `normal rows ${n}`);
    assert.ok(b.includes(0) && b.includes(5) && !b.includes(9), `boss rows ${b}`);
    const G = classifyStage(st, AREAS.normal);
    assert.ok(!G[9][14].drawn, 'the partner half is not built in the normal phase');
    assert.ok(classifyStage(st, AREAS.unite)[9][14].drawn, '联防 builds the partner half');
    assert.equal(areaFor('prep'), AREAS.normal);
    assert.equal(areaFor('pen'), AREAS.normal);
    assert.equal(areaFor('unite'), AREAS.unite);
    assert.equal(areaFor('hidden'), AREAS.boss);
    assert.equal(unionAreas(AREAS.normal, AREAS.normal, AREAS.boss).length, 3);
  });

  test('every active stage: finite buffers, unit normals, UVs inside the atlas, gates / fences / devices / terrain', () => {
    for (const id of ACTIVE) {
      const st = stages[id];
      for (const area of [AREAS.normal, AREAS.unite, AREAS.boss]) {
        const b = buildBoard(st, { area });
        for (const [name, g] of Object.entries(b.buckets)) {
          const n = g.position.length / 3;
          assert.equal(g.normal.length, n * 3, `${id} ${name}`);
          for (const v of g.position) assert.ok(Number.isFinite(v), `${id} ${name} position`);
          for (let i = 0; i < g.normal.length; i += 3) assert.ok(near(Math.hypot(g.normal[i], g.normal[i + 1], g.normal[i + 2]), 1, 1e-4), `${id} ${name} normal`);
          for (const u of g.uv) assert.ok(u >= 0 && u <= 1, `${id} ${name} uv ${u}`);
          for (const i of g.index) assert.ok(i < n, `${id} ${name} index`);
        }
        // top faces wind counter-clockwise seen from above (front faces for three.js)
        const g = b.buckets.board, P = g.position, I = g.index;
        let tops = 0;
        for (let t = 0; t < I.length; t += 3) {
          const [a, bb, c] = [I[t], I[t + 1], I[t + 2]];
          if (g.normal[a * 3 + 2] < 0.99) continue;
          const ux = P[bb * 3] - P[a * 3], uy = P[bb * 3 + 1] - P[a * 3 + 1], vx = P[c * 3] - P[a * 3], vy = P[c * 3 + 1] - P[a * 3 + 1];
          assert.ok(ux * vy - uy * vx > 0, `${id}: top triangle faces up`);
          tops++;
        }
        assert.ok(tops > 100, `${id} tops`);
        const G = b.grid;
        const expected = [];
        for (const row of G) for (const t of row) if (t.drawn && (t.glyph === 'S' || t.glyph === 'E')) expected.push(`${t.r},${t.c}`);
        assert.deepEqual(b.gates.map((x) => `${x.r},${x.c}`).sort(), expected.sort(), `${id} gates`);
        const fenced = G.flat().some((t) => t.drawn && t.glyph === 'b');
        assert.equal(b.buckets.pipe.vertexCount > 0, fenced, `${id} railings iff fenced tiles`);
        for (const d of b.devices) assert.ok(G[d.r][d.c].drawn, `${id} device on a built tile`);
        assert.ok(b.edges.length > 0, `${id} field edge glow`);
      }
    }
    // terrain lists
    assert.ok(buildBoard(stages.act2autochess_m04).terrain.water.length > 0);
    assert.ok(buildBoard(stages.act2autochess_m02).terrain.mire.length > 0);
    assert.ok(buildBoard(stages.act2autochess_m03).terrain.smog.length > 0);
    assert.ok(buildBoard(stages.act1autochess_m04).terrain.infection.length > 0);
    // blowers are active devices of act2 m01; inactive crates of act1 m02 are not built
    assert.ok(buildBoard(stages.act2autochess_m01).devices.some((d) => d.kind === 'blower' && d.dir === 'DOWN'));
    assert.ok(!buildBoard(stages.act1autochess_m02).devices.some((d) => d.kind === 'crate'));
  });

  test('malformed stages never throw and still build an island', () => {
    for (const st of [null, {}, { rows: ['xyz'] }, { rows: Array(19).fill('r'.repeat(21)), devices: [{ role: 'crate', pos: [3, 3] }, { role: 'crate', pos: 'x' }] }]) {
      const b = buildBoard(st, { area: AREAS.all });
      assert.ok(b.buckets.board.index.length >= 0);
    }
  });

  test('objToBoard is a proper rotation (normals stay unit, outward); boxProjectUV maps tops and sides', () => {
    const box = { position: new Float32Array([0, 1, 0, 1, 1, 0, 1, 1, 1]), normal: new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0]), index: new Uint16Array([0, 1, 2]) };
    const b = objToBoard(box, 1);
    assert.deepEqual([...b.normal.slice(0, 3)], [-0, 0, 1], 'Unity +Y is board +z');
    assert.deepEqual([...b.position.slice(3, 6)], [-1, 0, 1]);
    const crate = boxProjectUV({ ...boxData(0.9, 0.675), color: null }, SURFACES.crateTop, SURFACES.crateSide);
    const top = surfaceUV(SURFACES.crateTop), side = surfaceUV(SURFACES.crateSide);
    const inRange = (u, v, uv) => u >= Math.min(uv[0], uv[2], uv[4]) - 1e-6 && u <= Math.max(uv[0], uv[2], uv[4]) + 1e-6 && v >= Math.min(uv[1], uv[5]) - 1e-6 && v <= Math.max(uv[1], uv[5]) + 1e-6;
    for (let i = 0; i < crate.uv.length / 2; i++) {
      const up = crate.normal[i * 3 + 2] > 0.6;
      assert.ok(inRange(crate.uv[i * 2], crate.uv[i * 2 + 1], up ? top : side), `vertex ${i}`);
    }
    const g = tube(new Geom(), [0, 0, 0], [1, 0, 0], 0.05);
    assert.ok(g.vertexCount > 0 && g.triangleCount > 0);
  });
});

// ---- the three.js scene with a stub renderer ---------------------------------------------------------------------

function stubRenderer() {
  const calls = [];
  return {
    calls,
    domElement: { addEventListener() {}, removeEventListener() {} },
    shadowMap: { enabled: true, needsUpdate: false },
    capabilities: { getMaxAnisotropy: () => 8 },
    info: { render: { calls: 7, triangles: 1234 }, memory: { textures: 3, geometries: 5 } },
    setClearColor() {}, setPixelRatio(d) { calls.push(['dpr', d]); }, setSize(w, h) { calls.push(['size', w, h]); },
    render(scene, camera) { calls.push(['render', scene, camera]); },
    dispose() { calls.push(['dispose']); },
  };
}

function fakePack() {
  const img = { width: 4, height: 4 };
  const crate = existsSync(path.join(LOCAL, 'mesh/s_common_box_01/pCube2.obj')) ? parseObj(readFileSync(path.join(LOCAL, 'mesh/s_common_box_01/pCube2.obj'), 'utf8')) : null;
  const cube = parseObj(['v -50 -50 -50', 'v 50 -50 -50', 'v 50 50 -50', 'v -50 50 -50', 'vt 0 0', 'vt 1 0', 'vt 1 1', 'vt 0 1', 'vn 0 0 -1', 'f 1/1/1 2/2/1 3/3/1 4/4/1'].join('\n'));
  return {
    key: 'test', images: { D: img, N: img, R: img, E: img, common: img, gate: img, BG: img, wind: img },
    meshes: { crate, blower: cube, bgPlane: null, gate: { startDown: { mesh: cube }, startUp: { mesh: cube }, startBack: { mesh: cube }, endDown: { mesh: cube }, endUp: { mesh: cube } } },
    tiles: null, uv: resolveUvTable(null), materials: {},
  };
}

describe('BoardScene (three.js scene graph, stub renderer)', () => {
  test('builds merged meshes per material, few draw objects, shadows once; areas rebuild', () => {
    const R = stubRenderer();
    const board = new BoardScene(THREE, fakePack(), { renderer: R });
    board.setStage(stages.act2autochess_m01);
    const meshes = board.root.children;
    assert.ok(meshes.length >= 5 && meshes.length <= 16, `draw objects ${meshes.length}`);
    for (const m of meshes) assert.ok(m.geometry.getAttribute('position').count > 0);
    assert.ok(board.meshes.board && board.meshes.gateStart && board.meshes.gateEndAb && board.meshes.blowers && board.meshes.bg, Object.keys(board.meshes).join());
    assert.equal(R.shadowMap.needsUpdate, true);
    const before = board.meshes.board.geometry.getAttribute('position').count;
    assert.equal(board.setArea(AREAS.boss), true);
    assert.notEqual(board.meshes.board.geometry.getAttribute('position').count, before);
    assert.equal(board.setArea(AREAS.boss), false, 'same area: no rebuild');
    board.destroy();
    assert.ok(R.calls.some((c) => c[0] === 'dispose'));
  });

  test('battle rect hides the static crates inside it (the sim spawns them); device handles follow DeviceView', () => {
    const board = new BoardScene(THREE, fakePack(), { renderer: stubRenderer() });
    board.setStage(stages.act1autochess_m01);
    const crates = () => board.meshes.crates ? board.meshes.crates.geometry.getAttribute('position').count : 0;
    const all = crates();
    assert.ok(all > 0);
    board.setBattleRect({ r0: 9, r1: 12, c0: 0, c1: 10 });
    assert.ok(crates() < all, 'field crates hidden in battle');
    board.setBattleRect(null);
    assert.equal(crates(), all);
    const h = board.createDevice();
    assert.equal(h.mesh, null, 'DeviceView adds nothing to Pixi');
    h.update(null, { x: 5, y: 10, z: 0, size: 0.45, height: 0.3, alpha: 0.5 });
    const m = [...board.dynamic.children].at(-1);
    assert.ok(near(m.position.x, 5) && near(m.scale.x, 0.5, 0.02) && m.material.opacity === 0.5);
    h.destroy();
    assert.equal(board.devices.size, 0);
    board.destroy();
  });

  test('render syncs the three camera from the projection camera (identical pixels) and animates the gates', () => {
    const R = stubRenderer();
    const board = new BoardScene(THREE, fakePack(), { renderer: R });
    board.setStage(stages.act2autochess_m03);
    board.resize(1280, 720, 2);
    const cam = presetCamera('normal', { width: 1280, height: 720 });
    assert.equal(board.render(cam, 1.25), true);
    const ref = syncThreeCamera(cam, new THREE.PerspectiveCamera(), 1280, 720);
    board.camera.updateMatrixWorld(true);
    for (const [x, y, z] of [[2, 9, 0], [10, 12, 0.42], [6, 10.5, 0]]) {
      const a = new THREE.Vector3(x, y, z).project(board.camera), b = new THREE.Vector3(x, y, z).project(ref);
      assert.ok(near(a.x, b.x, 1e-9) && near(a.y, b.y, 1e-9));
    }
    const p0 = board.mat.gateStartAdd.uniforms.uPulse.value;
    board.render(cam, 2.25);
    assert.notEqual(board.mat.gateStartAdd.uniforms.uPulse.value, p0, 'gate pulse animates');
    board.flashObjective(9, 2);
    board.render(cam, 2.4);
    assert.ok(board.mat.gateEndAb.uniforms.uFlash.value.r > 0.5, 'leak flash');
    board.setFocus({ r0: 9, r1: 12, c0: 0, c1: 10 });
    for (let i = 0; i < 60; i++) board.render(cam, 2.4 + i / 30);
    const F = board.focus.uFocus.value;
    assert.ok(near(F.x, -0.5, 0.05) && near(F.w, 12.5, 0.05), 'focus eases to the field rect');
    assert.equal(R.calls.filter((c) => c[0] === 'render').length, 63);
    assert.deepEqual(board.stats().calls, 7);
    board.lost = true;
    assert.equal(board.render(cam, 5), false, 'lost context: no draw');
    board.destroy();
  });

  test('gate pulse follows the official 2 s curve; device outlets turn with their dir', () => {
    let lo = Infinity, hi = -Infinity;
    for (let t = 0; t < 2; t += 0.01) { const v = gatePulse(t); lo = Math.min(lo, v); hi = Math.max(hi, v); }
    assert.ok(near(lo, 0.134, 1e-3) && near(hi, 0.229, 1e-3));
    assert.ok(near(gatePulse(0.3), gatePulse(2.3), 1e-9), 'periodic');
    assert.deepEqual(new Set(Object.values(DIR_TURNS)), new Set([0, 1, 2, 3]));
    assert.ok(LIGHTING.key.intensity > 0 && LIGHTING.bg.z < 0);
  });
});

describe('asset pack loader (fake store)', () => {
  test('loads images through the store and meshes through fetch; null without the diffuse atlas', async () => {
    resetBoardPack();
    const manifest = { groups: {} };
    for (const [slot, [g, n]] of Object.entries(PACK_IMAGES)) (manifest.groups[g] ||= {})[n] = { path: `/assets/local/${g}/${n}.png` };
    manifest.groups['mesh/s_common_box_01'] = { pCube2: { path: '/assets/local/mesh/s_common_box_01/pCube2.obj' } };
    manifest.groups['map/fx'] = { ...manifest.groups['map/fx'], Start_up: { path: '/assets/local/map/fx/Start_up.obj' }, prefab: { path: '/assets/local/map/fx/prefab.json' } };
    manifest.groups['map/original'] = Object.fromEntries(['one','two','three'].map(id => [id,{path:`/assets/local/map/original/${id}.json`,kind:'original-unity-scene'}]));
    const warmed = [], decoded = [];
    let releaseWarm; const warmGate = new Promise(resolve => {releaseWarm=resolve;});
    const requested = [];
    const store = {
      local: async () => manifest,
      localUrl: (g, n) => manifest.groups[g]?.[n]?.path || null,
      image: async (u) => { requested.push(u); return { width: 8, height: 8 }; },
    };
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (u, options) => {
      const s = String(u);
      if(s.includes('/map/original/')) {
        const id = s.split('/').pop().replace('.json','');
        assert.equal(options.cache,'force-cache');
        return {ok:true,arrayBuffer:async()=>{await warmGate;warmed.push(id);return new ArrayBuffer(0);},json:async()=>{decoded.push(id);return {stageId:id,buckets:{}};}};
      }
      if (s.endsWith('.obj')) return { ok: true, text: async () => 'v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3' };
      if (s.endsWith('prefab.json')) return { ok: true, json: async () => [{ name: 'Start_up', parent: 'Start', mesh: 'Start_up', materials: ['[opt]start_end_add'] }] };
      return { ok: false, json: async () => null, text: async () => '' };
    };
    try {
      const pack = await loadBoardPack(store);
      assert.ok(pack && pack.images.D && pack.images.gate, 'images');
      assert.ok(requested.some((u) => u.includes('%5Bopt%5Dmerged_textures')), 'bracketed names are URL-encoded');
      assert.ok(pack.meshes.crate && pack.meshes.gate.startUp, 'meshes');
      assert.equal(pack.meshes.gate.startUp.material, '[opt]start_end_add');
      assert.ok(pack.uv.concrete);
      assert.deepEqual(warmed,[],'slow optional maps do not block the fallback board pack');
      releaseWarm();await pack.original.warm;
      assert.deepEqual(warmed.sort(),['one','three','two'],'scene files finish warming in the background');
      assert.deepEqual(decoded,[],'preloading does not decode all maps into mobile RAM');
      await pack.original.loadStage('one');await pack.original.loadStage('two');await pack.original.loadStage('one');await pack.original.loadStage('three');
      assert.deepEqual(decoded,['one','two','three'],'cached scene reuse does not fetch/decode again');
      assert.deepEqual(Object.keys(pack.original.scenes).sort(),['one','three'],'two-scene LRU retains recently used map');
      resetBoardPack();
      delete manifest.groups['map/autochess'].TX_autochessi_D;
      assert.equal(await loadBoardPack(store), null, 'no diffuse atlas → no 3D board');
      resetBoardPack();
      assert.equal(await loadBoardPack(null), null);
    } finally {
      globalThis.fetch = realFetch;
      resetBoardPack();
    }
  });
});

// Original scenes must replace, rather than sit on top of, the reconstructed board.
test('original stage geometry is used with its UVs and disposed with the scene', () => {
  const pack = fakePack();
  const mesh = { position: [0, 0, 0, 1, 0, 0, 0, 1, 0], normal: [0, 0, 1, 0, 0, 1, 0, 0, 1], uv: [0.13, 0.22, 0.61, 0.22, 0.13, 0.87], index: [0, 1, 2] };
  pack.original = { scenes: { act1autochess_m01: { stageId: 'act1autochess_m01', buckets: { original: mesh } } }, images: { atlas: { width: 4, height: 4 } }, materials: { original: { textures: { _MainTex: { name: 'atlas' } } } } };
  const scene = new BoardScene(THREE, pack, { renderer: stubRenderer() });
  scene.setArea(AREAS.all);scene.setStage(stages.act1autochess_m01);
  assert.equal(scene.stats().originalStage, 'act1autochess_m01');
  assert.ok(scene.meshes['original:original']);
  assert.equal(scene.meshes.board, undefined, 'no procedural board underneath original meshes');
  assert.deepEqual([...scene.meshes['original:original'].geometry.attributes.uv.array].map(x => +x.toFixed(2)), mesh.uv);
  let disposed = false; scene.originalMaterials.original.addEventListener('dispose', () => { disposed = true; });
  scene.destroy(); assert.equal(disposed, true);
});

test('an asynchronously loaded original scene replaces only the current stage', async () => {
  const pack = fakePack(); let done;
  const id = 'act1autochess_m01';
  pack.original = { scenes: {}, images: {}, materials: {}, loadStage: () => new Promise(resolve => { done = resolve; }) };
  const scene = new BoardScene(THREE, pack, { renderer: stubRenderer() });
  scene.setStage(stages[id]);
  pack.original.scenes[id] = { stageId: id, buckets: {} };
  done(pack.original.scenes[id]); await Promise.resolve();
  assert.equal(scene.stats().originalStage, id);
  scene.destroy();
});

test('unavailable original materials retain the working grid board', () => {
  const pack = fakePack();
  pack.original = { scenes: { act1autochess_m01: { stageId: 'act1autochess_m01', buckets: { absent: { index: [0, 1, 2] } } } }, materials: {}, images: {} };
  const scene = new BoardScene(THREE, pack, { renderer: stubRenderer() });
  scene.setArea(AREAS.all);scene.setStage(stages.act1autochess_m01);
  assert.equal(scene.stats().originalStage, null);
  assert.ok(scene.meshes.board, 'keep visible tiles when material metadata is missing');
  scene.destroy();
});

test('original water planes use the water effect instead of the stored green texture', () => {
  const pack = fakePack();
  pack.original = { images: {}, materials: { MT_Dosshore_UI: {} }, scenes: { act1autochess_m05: { stageId: 'act1autochess_m05', buckets: { MT_Dosshore_UI: { position: [0,0,0, 1,0,0, 0,1,0], index: [0,1,2] } } } } };
  const scene = new BoardScene(THREE, pack, { renderer: stubRenderer() });
  scene.setArea(AREAS.all);
  scene.setStage(stages.act1autochess_m05);
  assert.equal(scene.meshes['original:MT_Dosshore_UI'].material, scene.mat.water);
  assert.equal(scene.meshes['original:MT_Dosshore_UI'].castShadow, false);
  scene.destroy();
});

test('original data textures stay linear and native device UVs are used in prep and battle', () => {
  const pack = fakePack();
  const image = { width: 4, height: 4 };
  const crate = { position: [-0.5,0,0, 0.5,0,0, 0,0,0.7], normal: [0,-1,0, 0,-1,0, 0,-1,0], uv: [0.1,0.2, 0.8,0.2, 0.4,0.9], index: [0,1,2], bounds: {x0:-0.5,x1:0.5,z0:0,z1:0.7} };
  pack.original = { crate, scenes: {}, images: { diffuse:image, normal:image, gloss:image }, materials: {
    MT_trap_1105_accrate: { textures: { _MainTex:{name:'diffuse'} } },
    floor: { textures: { _MainTex:{name:'diffuse',scale:[2,3],offset:[0.1,0.2]}, _BumpMap:{name:'normal'}, _MetallicGlossMap:{name:'gloss'} }, floats:{_BumpScale:0.6} },
  } };
  const scene = new BoardScene(THREE, pack, { renderer:stubRenderer() });
  const floor = scene.originalMaterials.floor;
  assert.equal(floor.map.colorSpace, THREE.SRGBColorSpace);
  assert.equal(floor.normalMap.colorSpace, THREE.NoColorSpace);
  assert.equal(floor.roughnessMap.colorSpace, THREE.NoColorSpace);
  assert.deepEqual(floor.map.repeat.toArray(), [2,3]);
  assert.deepEqual(floor.map.offset.toArray(), [0.1,0.2]);
  assert.deepEqual(floor.normalScale.toArray(), [0.6,0.6]);
  assert.equal(scene.crateGeometry(), crate, 'do not reproject native UVs onto the wooden tile');
  scene.setArea(AREAS.all);scene.setStage(stages.act1autochess_m01);
  assert.equal(scene.meshes.crates.material, scene.originalMaterials.MT_trap_1105_accrate);
  const device = scene.createDevice();
  const dynamicMesh = scene.dynamic.children.at(-1);
  assert.equal(dynamicMesh.material.map, scene.originalMaterials.MT_trap_1105_accrate.map);
  assert.deepEqual([...dynamicMesh.geometry.attributes.uv.array].map(x=>+x.toFixed(2)), crate.uv);
  device.destroy(); scene.destroy();
});

test('original RGBM lightmaps use separate baked UVs and release stage textures/materials', () => {
  const pack = fakePack();
  const geometry = { material:'floor', lightMap:'baked', position:[0,0,0, 1,0,0, 0,1,0], normal:[0,0,1, 0,0,1, 0,0,1], uv:[0,0, 1,0, 0,1], uv1:[0.2,0.3, 0.4,0.3, 0.2,0.5], index:[0,1,2] };
  pack.original = { images:{baked:{width:4,height:4}}, materials:{floor:{}}, scenes:{act1autochess_m01:{stageId:'act1autochess_m01',buckets:{'floor@lightmap0':geometry}}} };
  const scene = new BoardScene(THREE,pack,{renderer:stubRenderer()});scene.setArea(AREAS.all);scene.setStage(stages.act1autochess_m01);
  const mesh = scene.meshes['original:floor@lightmap0'];
  assert.equal(scene.originalStage,'act1autochess_m01');
  assert.equal(mesh.material.lightMap.channel,1);
  assert.equal(mesh.castShadow,true,'native scenery retains realtime shadows');
  assert.equal(mesh.receiveShadow,true,'native tiles receive realtime shadows');
  assert.deepEqual([...mesh.geometry.attributes.uv1.array].map(x=>+x.toFixed(2)),geometry.uv1);
  assert.equal(mesh.material.lightMapIntensity,Math.PI);
  const shader={uniforms:{},vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader};
  mesh.material.onBeforeCompile(shader);
  assert.ok(shader.fragmentShader.includes('pow(lightMapTexel.a, 2.2)'), 'decode RGBM alpha instead of treating encoded RGB as ordinary illumination');
  let md=false,td=false;mesh.material.addEventListener('dispose',()=>md=true);mesh.material.lightMap.addEventListener('dispose',()=>td=true);
  scene.setStage(stages.act1autochess_m02);
  assert.ok(md&&td,'old map lighting releases GPU resources');scene.destroy();
});

test('native gamma stages avoid a second sRGB transform and decode RGBM in their own colour space', () => {
  const pack = fakePack();
  pack.original = { images:{albedo:{width:4,height:4},baked:{width:4,height:4}}, materials:{floor:{gammaLighting:true,textures:{_MainTex:{name:'albedo'}}}}, scenes:{act1autochess_m01:{stageId:'act1autochess_m01',lighting:{intensity:1.1,color:[1,0.93,0.87]},buckets:{floor:{material:'floor',lightMap:'baked',position:[0,0,0,1,0,0,0,1,0],uv:[0,0,1,0,0,1],uv1:[0,0,1,0,0,1],index:[0,1,2]}}}} };
  const scene = new BoardScene(THREE,pack,{renderer:stubRenderer()});scene.setArea(AREAS.all);scene.setStage(stages.act1autochess_m01);
  const m=scene.meshes['original:floor'].material;
  assert.equal(scene.key.intensity,1.1 * LIGHTING.nativeDirectGain);
  assert.equal(scene.hemi.intensity,LIGHTING.hemi.intensity,'brightness compensation does not lift the whole shadow floor');
  assert.deepEqual(scene.key.color.toArray(),[1,0.93,0.87]);
  assert.equal(m.map.colorSpace,THREE.NoColorSpace);
  assert.equal(m.lightMap.colorSpace,THREE.NoColorSpace);
  assert.equal(m.lightMapIntensity,1);
  const shader={uniforms:{},vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader};m.onBeforeCompile(shader);
  assert.ok(shader.fragmentShader.includes('5.0 * lightMapTexel.a'));
  assert.ok(shader.fragmentShader.includes('0.220916301'));
  assert.ok(shader.fragmentShader.includes('uniform vec4 uFocus;'),'focus declarations survive the colour-space adaptation');
  assert.ok(!shader.fragmentShader.includes('#include <colorspace_fragment>'),'the native gamma result is not encoded a second time');
  const sourceDir=[-.3646601835779002,.9159545584072459,.16749254321147067];
  const source=pack.original.scenes.act1autochess_m01;
  source.lighting.dir=sourceDir;
  pack.original.scenes.act2autochess_m01={...source,stageId:'act2autochess_m01'};
  scene.setStage({...stages.act1autochess_m01,id:'act2autochess_m01'});
  assert.deepEqual(scene.stageLightDir,[sourceDir[0],sourceDir[1],1.05],'city floor uses the short-shadow runtime elevation');
  assert.deepEqual(source.lighting.dir,sourceDir,'the source light metadata remains intact');
  scene.setStage(stages.act1autochess_m01);
  assert.deepEqual(scene.stageLightDir,sourceDir,'other themes keep their native direction after leaving city');
  scene.setStage(stages.act1autochess_m02);assert.equal(scene.key.intensity,LIGHTING.key.intensity,'fallback boards retain their linear rig');scene.destroy();
});

 test('native platforms follow phase areas while preserving scenery and source UVs', () => {
  const src = {position:[2,9,0, 3,9,0, 2,10,0, 14,9,0, 15,9,0, 14,10,0, -2,9,0, -1,9,0, -2,10,0], index:[0,1,2,3,4,5,6,7,8], uv:[0,0]};
  assert.deepEqual(geometryForArea(src, AREAS.normal).index, [0,1,2]);
  assert.deepEqual(geometryForArea(src, AREAS.unite).index, [0,1,2,3,4,5]);
  assert.equal(geometryForArea(src, AREAS.normal).uv, src.uv);
  assert.equal(src.index.length, 9);
 });


test('inactive field sub-floor geometry is excluded regardless of its depth, preserving the right scenic surroundings',()=>{
 const src={position:[12,10,-1,13,10,-1,12,11,-1, 24,10,-1,25,10,-1,24,11,-1],index:[0,1,2,3,4,5]};
 assert.deepEqual(geometryForArea(src,AREAS.normal).index,[]);
 assert.deepEqual(geometryForArea(src,AREAS.unite).index,[0,1,2]);
});

test('native scenery props inside an inactive cooperative half follow the same area rule as platforms',()=>{
 const src={platform:false,position:[12,10,.3,13,10,.3,12,11,.3, 2,10,.3,3,10,.3,2,11,.3],index:[0,1,2,3,4,5]};
 assert.deepEqual(geometryForArea(src,AREAS.normal).index,[3,4,5]);
 assert.deepEqual(geometryForArea(src,AREAS.unite).index,src.index);
});

test('decorative components crossing a field edge stay whole while inactive isolated props are hidden',()=>{
 const src={position:[10,9,0,12,9,0,10,11,0,12,11,0,14,9,0,15,9,0,14,10,0],index:[0,1,2,1,3,2,4,5,6]};
 assert.deepEqual(sceneryForArea(src,AREAS.normal).index,[0,1,2,1,3,2]);
 assert.deepEqual(sceneryForArea(src,AREAS.unite).index,src.index);
});

 test('connected water sheets clip at the active field boundary with UV and lightmap interpolation',()=>{
 const src={position:[9,9,0,13,9,0,13,12,0,9,12,0],normal:[0,0,1,0,0,1,0,0,1,0,0,1],uv:[0,0,1,0,1,1,0,1],uv1:[0,0,1,0,1,1,0,1],color:Array(12).fill(1),index:[0,1,2,0,2,3]};
 const out=surfaceForArea(src,AREAS.normal);assert.ok(out.index.length>0);
 for(let i=0;i<out.position.length;i+=3){assert.ok(out.position[i]<=10.5);assert.ok(Math.abs(out.uv[i/3*2]-(out.position[i]-9)/4)<1e-6);}
 assert.equal(out.color.length,out.position.length);assert.equal(out.uv1.length,out.uv.length);
 const full=surfaceForArea(src,AREAS.unite);assert.equal(Math.max(...full.position.filter((_,i)=>i%3===0)),13);
 const inactive={position:[13,9,0,15,9,0,14,12,0],index:[0,1,2]};assert.deepEqual(surfaceForArea(inactive,AREAS.normal).index,[]);
 });

test('runtime platform geometry remains available beside an original baked map',async()=>{
 const {buildDeviceSlabs}=await import('../../public/js/render/board3d/layout.js');
 const stages=JSON.parse(readFileSync(new URL('../../data/stages.json',import.meta.url)));
 const b=buildBoard(stages.act1autochess_m03);
 const slabs=buildDeviceSlabs(b.devices,b.grid);
 assert.ok(slabs.board.position.length>0,'active shooting platforms have separate geometry');
 assert.ok([...slabs.board.position].every(Number.isFinite));
 const none=buildDeviceSlabs([],b.grid);assert.equal(none.board.position.length,0);
});

test('inactive platforms outside the board envelope never leak above a cooperative or boss field',()=>{
 const src={position:[-1,3,0,-2,3,0,-1,4,0, 2,9,0,3,9,0,2,10,0],index:[0,1,2,3,4,5]};
 assert.deepEqual(geometryForArea(src,AREAS.unite).index,[3,4,5]);
 assert.deepEqual(geometryForArea(src,AREAS.boss).index,[]);
 assert.deepEqual(sceneryForArea(src,AREAS.boss).index,[0,1,2],'decorative scenery remains independent of platform filtering');
});

test('original shooting platforms use their own mesh/material and omit the atlas replacement slab',()=>{
 const st={...stages.act1autochess_m03,id:'native-platform-test'};
 const geom={position:[-.4,-.4,0,.4,-.4,0,0,.4,.5],normal:[0,0,1,0,0,1,0,0,1],uv:[0,0,1,0,.5,1],index:[0,1,2],bounds:{z1:.5}};
 const pack={images:{D:{width:4,height:4}},original:{platform:geom,images:{},materials:{MT_trap_1106_achplat:{}},scenes:{'native-platform-test':{stageId:'native-platform-test',buckets:{}}}}};
 const scene=new BoardScene(THREE,pack,{width:800,height:600,renderer:stubRenderer()});
 scene.setStage(st);assert.ok(scene.meshes.platforms);assert.equal(scene.meshes.platforms.material,scene.originalMaterials.MT_trap_1106_achplat);
 assert.equal(scene.meshes.deviceSlabs,null);scene.destroy();
});

test('environmental replacement surfaces remain in fallback maps and disappear after native stage loads', () => {
 const scene=new BoardScene(THREE,fakePack(),{renderer:stubRenderer()});
 scene.meshes={};
 const board={terrain:{water:[[9,2]],mire:[[9,3]],infection:[[9,4]],smog:[]}};
 scene._buildTerrain(board);
 for(const k of ['water','mire','infection'])assert.ok(scene.meshes[k],k+' fallback retained');
 scene._clear();scene.originalStage='native';scene._buildTerrain(board);
 for(const k of ['water','mire','infection'])assert.equal(scene.meshes[k],undefined,k+' native surface not covered');
 scene.destroy();
});

test('native painted terrain uses red as a blend mask rather than multiplying the tile RGB',async()=>{
 const {applyNativeStageBlend,addFocus,focusUniforms}=await import('../../public/js/render/board3d/materials.js');
 const rec={shader:'Torappu/Scene/StandardRealtimeShadow',keywords:['_HG_VERTEX_COLOR_BLEND_ON'],floats:{_BlendStrength:1,_Glossiness2:.2},colors:{_BlendColor:[.5,.38,.2,1],_BlendRangeCtrl:[0,1,0,0]}};
 const m=addFocus(applyNativeStageBlend(THREE,new THREE.MeshStandardMaterial(),rec),focusUniforms(THREE));
 const shader={uniforms:{},vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader};m.onBeforeCompile(shader);
 assert.equal(m.vertexColors,true);assert.equal(m.defines.SP_NATIVE_BLEND,1);
 assert.equal(shader.uniforms.spBlendColor.value.r,.5);
 assert.ok(shader.fragmentShader.includes('vColor.r) * spBlendStrength'));
 assert.ok(!shader.fragmentShader.includes('#include <color_fragment>'));
 assert.ok(shader.fragmentShader.includes('!defined( SP_NATIVE_BLEND )'));
});

test('native material keywords control painted blending, emission, normals and metallic maps',()=>{
 const pack=fakePack();pack.original={scenes:{},images:{map:{width:4,height:4}},materials:{
  disabled:{gammaLighting:true,shader:'Torappu/Scene/StandardRealtimeShadow',keywords:[],floats:{_BlendStrength:1,_ShadowStrength:.5},colors:{_BlendColor:[1,1,1,1],_EmissionColor:[1,1,1,1]},textures:{_BumpMap:{name:'map'},_MetallicGlossMap:{name:'map'}}},
  enabled:{gammaLighting:true,shader:'Torappu/Scene/StandardRealtimeShadow',keywords:['_HG_VERTEX_COLOR_BLEND_ON','_NORMALMAP','_EMISSION','_METALLICGLOSSMAP'],floats:{_BlendStrength:1},colors:{_EmissionColor:[1,1,1,1]},textures:{_BumpMap:{name:'map'},_MetallicGlossMap:{name:'map'}}}
 }};
 const scene=new BoardScene(THREE,pack,{renderer:stubRenderer()});const a=scene.originalMaterials.disabled,b=scene.originalMaterials.enabled;
 assert.equal(a.userData.nativeBlend,undefined,'unused white blend does not erase the city tile texture');
 assert.equal(a.normalMap,null);assert.equal(a.emissive.getHex(),0);assert.equal(a.roughnessMap,null);
 assert.equal(b.userData.nativeBlend,true);assert.ok(b.normalMap);assert.equal(b.emissive.getHex(),0xffffff);assert.ok(b.metalnessMap);assert.equal(b.metalness,1);
 const shader={uniforms:{},vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader};a.onBeforeCompile(shader);
 assert.ok(shader.fragmentShader.includes('return diffuseColor * 0.779083729'));
 assert.ok(shader.fragmentShader.includes('max(loH,.32)'));
 assert.equal(shader.uniforms.spNativeShadowStrength.value,.5);
 assert.ok(shader.fragmentShader.includes('directionalLightShadow.shadowIntensity * spNativeShadowStrength'));
 assert.equal(a.defines.SP_NATIVE_LIGHTING,1,'approximate web sheen is disabled');scene.destroy();
});

test('native sunken water is not covered by the higher UI highlight plane',()=>{
 const pack=fakePack(),geom={position:[6,9,-.141,7,9,-.141,6,10,-.141],index:[0,1,2]};
 pack.original={images:{},materials:{MT_Dosshore_UI:{},MT_AutochessSand_water2:{shader:'StylizedWater'}},scenes:{act1autochess_m05:{stageId:'act1autochess_m05',buckets:{ui:{...geom,material:'MT_Dosshore_UI'},basin:{...geom,material:'MT_AutochessSand_water2'}}}}};
 const scene=new BoardScene(THREE,pack,{renderer:stubRenderer()});scene.setStage(stages.act1autochess_m05);
 assert.equal(scene.meshes['original:ui'],undefined);
 assert.ok(scene.meshes['original:basin']);
 assert.ok([...scene.meshes['original:basin'].geometry.attributes.position.array].filter((_,i)=>i%3===2).every(z=>Math.abs(z+.141)<1e-6));
 scene.destroy();
});

test('city preview surroundings retain native decoration without adding inactive platform tiles',()=>{
 const pack=fakePack(),geom={position:[2,15,0,3,15,0,2,16,0],index:[0,1,2]};
 pack.original={images:{},materials:{floor:{}},scenes:{act2autochess_m01:{stageId:'act2autochess_m01',buckets:{decor:{...geom,material:'floor'},platform:{...geom,material:'floor',platform:true}}}}};
 const scene=new BoardScene(THREE,pack,{renderer:stubRenderer()});scene.setStage({...stages.act1autochess_m01,id:'act2autochess_m01'});
 assert.ok(scene.meshes['original:decor']);assert.equal(scene.meshes['original:platform'],null);
 scene.setArea(AREAS.boss);assert.equal(scene.meshes['original:decor'],null);scene.destroy();
});

test('inactive field vertices are discarded before GPU geometry is created',async()=>{
 const {compactGeometry}=await import('../../public/js/render/board3d/scene.js');
 const src={position:[0,10,0,1,10,0,0,11,0,0,2,0,1,2,0,0,3,0],uv:[0,0,1,0,0,1,0,0,1,0,0,1],index:[0,1,2,3,4,5]};
 const filtered=compactGeometry(geometryForArea(src,AREAS.boss));
 assert.equal(filtered.position.length,9);assert.deepEqual(filtered.index,[0,1,2]);
 for(let i=1;i<filtered.position.length;i+=3)assert.ok(filtered.position[i]<=6.5);
 assert.equal(filtered.uv.length,6);
});

test('native preview floors remain visible without a procedural glass overlay; fallback retains its floor',()=>{
 const geom={position:[8,15,0,9,15,0,8,16,0],index:[0,1,2],platform:true,material:'floor'};
 const pack=fakePack();
 pack.original={images:{},materials:{floor:{}},scenes:{[stages.act1autochess_m01.id]:{stageId:stages.act1autochess_m01.id,buckets:{floor:geom}}}};
 const scene=new BoardScene(THREE,pack,{renderer:stubRenderer()});
 scene.setStage(stages.act1autochess_m01);
 assert.ok(scene.meshes['original:floor']);
 assert.equal(scene.meshes.previewGlass,undefined);
 scene.setArea([...AREAS.boss,{r0:14,r1:18,c0:6,c1:14}]);
 assert.ok(scene.meshes['original:floor']);
 assert.equal(scene.meshes.previewGlass,undefined);
 scene.destroy();
 const fallback=new BoardScene(THREE,fakePack(),{renderer:stubRenderer()});
 fallback.setStage(stages.act1autochess_m01);
 assert.ok(fallback.meshes.glass);
 fallback.destroy();
});

test('cooperative background translation preserves whole geometry and all render attributes',async()=>{
 const {translateEnvironment}=await import('../../public/js/render/board3d/scene.js');
 const src={position:[8,14,0,9,14,0,8,15,1,0,10,0,1,10,0,0,11,1],index:[0,1,2,3,4,5],uv:[0,0,1,0,0,1,0,0,1,0,0,1]};
 const out=translateEnvironment(src,6);
 assert.deepEqual(out.index,src.index);
 assert.deepEqual(out.position.slice(0,9),[8,8,0,9,8,0,8,9,1]);
 assert.deepEqual(out.uv,src.uv);
 assert.equal(src.position[1],14);
});

test('cooperative surroundings exclude combat decorations and retain the rear border',()=>{
 const src={position:[8,9,0,9,9,0,8,10,1, 8,13,0,9,13,0,8,14,1],index:[0,1,2,3,4,5]};
 const surroundings=sceneryForArea(src,AREAS.unite,{surroundOnly:true});
 assert.deepEqual(surroundings.index,[3,4,5]);
 const boss={position:[8,2,0,9,2,0,8,3,1, -2,9,0,-1,9,0,-2,10,1],index:[0,1,2,3,4,5]};
 assert.deepEqual(sceneryForArea(boss,AREAS.boss,{interiorOnly:true}).index,[0,1,2]);
});

test('rear terrain crossing the cooperative border remains whole to support both fields',()=>{
 const src={position:[14,12,-1,18,12,-1,14,16,.5],index:[0,1,2]};
 assert.deepEqual(sceneryForArea(src,AREAS.unite,{surroundOnly:true}).index,src.index);
});

test('native field support retains nearby underground faces but excludes inactive field tops',()=>{
 const src={position:[14,5,-.49,15,5,-.04,14,5.3,-.04,14,5,0,15,5,0,14,5.3,0,14,2,-1,15,2,-1,14,2.3,-1],index:[0,1,2,3,4,5,6,7,8]};
 assert.deepEqual(geometryForArea(src,AREAS.unite).index,[]);
 assert.deepEqual(geometryForArea(src,AREAS.unite,{support:true}).index,[0,1,2]);
});

 test('rear decoration selection preserves complete border props without copying terrain',()=>{
 const src={position:[3,12,0,4,12,0,3,13,1, -2,12,0,5,12,0,-2,15,1, 8,12,0,9,12,0,8,13,1],index:[0,1,2,3,4,5,6,7,8]};
 assert.deepEqual(sceneryForArea(src,[{c0:3,c1:5,r0:12,r1:13}],{decorationOnly:true}).index,[0,1,2]);
 });
