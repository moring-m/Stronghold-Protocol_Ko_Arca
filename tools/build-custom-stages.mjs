// Add the fork's own battlefields to the production stages (content/production/data/stages.json).
// Each custom stage copies a same-shaped official stage (rows 0–1 Final Assault bench, 2–5 unite / boss field, 7–8 own
// bench, 9–12 the normal field, 14–18 the enemy preview pen) and replaces its layout; ground paths and deployment lists
// are derived with the sim's own Grid (server/sim/groundPaths.js), the way plugin stages get them.
// Usage: node tools/build-custom-stages.mjs   (idempotent: rewrites the custom entries only)
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { computeGroundPaths, computeDeployTiles } from '../server/sim/groundPaths.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const file = join(root, 'content/production/data/stages.json');

/** Mirror of a left-half string around the field's centre column. */
const mirror = (s) => [...s].reverse().join('');

/**
 * 설원 덤불 전장 (custom_snowfield): read off the owner's screenshots of the snow battlefield. Normal field, columns
 * 2–10 (row 9 at the bottom of the screen), with the owner's tile notes: k = 덤불 (thicket: 隐匿 for operators and enemies
 * on it), b = 울타리 (the blue-rimmed square), h = 언덕 (the ice hill: high ground), # = rocks, f = 차단 공사 (the
 * hazard-framed column). Enemy routes (owner's sketch): the upper gate runs along row 12 and down column 3; the lower
 * one climbs the thicket column 7 to row 11, crosses to column 5 and comes down to row 9.
 */
function snowfield() {
  // columns 3–8 of each normal-field row, bottom (row 9) to top (row 12)
  const L = { 9: 'rrr#kr', 10: 'r#rhk#', 11: 'rbrkk#', 12: 'rrrrrr' };
  const rows = [
    'aaaaaaaaaa#aaaaaaaaaa',
    '###IAAAAA###AAAAAI###',
    `##E${L[9]}rOr${mirror(L[9])}E##`,
    // the boss field: the tiles either side of the works ((3,8) / (4,8) and (3,12) / (4,12)) are a fence there (the
    // owner's notes), not a wall
    `###${L[10].slice(0, 5)}bfffb${mirror(L[10]).slice(1)}###`,
    `###${L[11].slice(0, 5)}bfffb${mirror(L[11]).slice(1)}###`,
    `###${L[12]}fOf${mirror(L[12])}###`,
    'XXXXXXXXXXXXXXXXXXXXX',
    'aaaaaaaaaa###########',
    '####AAAAA##I#########',
    `##E${L[9]}rS${L[9]}rS##`,
    `###${L[10]}f#${L[10]}f###`,
    `###${L[11]}f#${L[11]}f###`,
    `###${L[12]}fS${L[12]}fS##`,
    'XXXXXXXXXXXXXXXXXXXXX',
    '#######fffffff#######',
    '#######Sffffff#######',
    '#######ppppppp#######',
    '#######fffffff#######',
    '#######Sffffff#######',
  ];
  for (const r of rows) if (r.length !== 21) throw Error(`custom_snowfield: row "${r}" is ${r.length} wide`);
  return {
    base: 'act1autochess_m02',
    id: 'custom_snowfield',
    name: '설원',
    // 차단 공사 (阻隔工事 crates): two per normal field on its hazard-framed column, off the enemy route (row 12); the boss field (rows 2–5) has none, as on the
    // official maps
    crates: [[10, 9], [11, 9], [10, 17], [11, 17]],
    boardTheme: 'snow',
    // the boss field's fence tiles (rows 3–4, cols 8 and 12): the cooperative defense keeps its wall there (render/pen.js)
    bossOnlyTiles: [[3, 8], [4, 8], [3, 12], [4, 12]],
    rows,
    tiles: {
      k: { tileKey: 'tile_custom_thicket', height: 'LOW', buildable: 'ALL', passable: 'ALL', groundPassable: true, flyPassable: true, special: 'thicket', bb: {} },
      h: { tileKey: 'tile_wall', height: 'HIGH', buildable: 'RANGED', passable: 'FLY_ONLY', groundPassable: false, flyPassable: true, special: null, bb: {} },
    },
  };
}

const stages = JSON.parse(await readFile(file, 'utf8'));
for (const def of [snowfield()]) {
  const base = stages[def.base];
  if (!base) throw Error(`${def.id}: base stage ${def.base} missing`);
  const stage = {
    ...structuredClone(base),
    id: def.id, name: def.name, rows: def.rows,
    tiles: { ...structuredClone(base.tiles), ...def.tiles },
    weight: 50, active: true,
    // the chapter 8 snow tileset on the procedural board (render/board3d/load.js BOARD_THEMES)
    boardTheme: def.boardTheme,
    ...(def.bossOnlyTiles ? { bossOnlyTiles: def.bossOnlyTiles } : {}),
    // a custom stage joins a mode's pool only when the room picks it (shared/customExtensions.js)
    customExtension: { category: 'stages' },
    // the base's band / card devices (turrets, crates, platforms) sit on its own layout: only the field-wide ones stay
    devices: [
      ...structuredClone(base.devices || []).filter((d) => d.role === 'coldWind'),
      ...(def.crates || []).map((pos) => ({ ...structuredClone(base.devices.find((d) => d.role === 'crate')), pos, active: true, hidden: false })),
    ],
    special: {},
  };
  delete stage.legend;
  Object.assign(stage, computeGroundPaths(stage), { deployTiles: computeDeployTiles(stage) });
  stages[def.id] = stage;
  console.log(`${def.id}: ${Object.keys(stage.groundPaths).length} ground paths, ${stage.deployTiles.normal.melee.length} melee / ${stage.deployTiles.normal.rangedOnly.length} ranged tiles`);
}
// 규정 battlefields with no 맹약 counterpart (m09–m12: the snow / church maps, m10's 盐坨子炮, m12's 加速 tiles) as
// 맹약 "전장 추가" options: the season's record as is (its own layout, devices, tiles and special), the 맹약 modes of a base
// stage, drawn by its converted native map (render/board3d/scene.js nativeStageId → map/original act3autochess_m*).
// m01–m06 are 맹약 maps with small changes and are left out.
const REGULATION = JSON.parse(await readFile(join(root, 'data/versions/act3autochess-v3_1/stages.json'), 'utf8'));
const REGULATION_EXTRA = ['act3autochess_m09', 'act3autochess_m10', 'act3autochess_m11', 'act3autochess_m12'];
for (const id of REGULATION_EXTRA) {
  const src = Object.values(REGULATION).find((s) => s.id === id);
  if (!src) throw Error(`${id}: missing from the 규정 stages`);
  const stage = {
    ...structuredClone(src),
    modes: structuredClone(stages.act1autochess_m01.modes),
    weight: 50, active: true,
    customExtension: { category: 'stages', description: '규정 시즌의 전장입니다. 선택하면 이번 게임의 전장 추첨 목록에 추가됩니다.' },
  };
  Object.assign(stage, computeGroundPaths(stage), { deployTiles: computeDeployTiles(stage) });
  stages[id] = stage;
  console.log(`${id}: ${Object.keys(stage.groundPaths).length} ground paths, ${stage.deployTiles.normal.melee.length} melee tiles`);
}
await writeFile(file, JSON.stringify(stages));
