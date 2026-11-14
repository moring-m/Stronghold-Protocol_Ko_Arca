// The 맹약 battlefields as 규정 "전장 추가" options (data/versions/act3autochess-v3_1/stages.json): every active 맹약 map
// (act1 m01–m04, act2 m01–m04, the fork's 설원), copied from content/production/data/stages.json with
// customExtension { category: 'stages' }. A copy joins the season's draw only when a room picks it
// (shared/seasonExtensions.js applySeasonExtensions); the 규정 m01–m06 that are versions of these maps stay as they are.
// Usage: node tools/build-season-extra-stages.mjs   (idempotent: rewrites the copies only)
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const target = join(root, 'data/versions/act3autochess-v3_1/stages.json');
const covenant = JSON.parse(await readFile(join(root, 'content/production/data/stages.json'), 'utf8'));
const season = JSON.parse(await readFile(target, 'utf8'));
const IDS = ['act1autochess_m01', 'act1autochess_m02', 'act1autochess_m03', 'act1autochess_m04',
  'act2autochess_m01', 'act2autochess_m02', 'act2autochess_m03', 'act2autochess_m04', 'custom_snowfield'];
for (const id of Object.keys(season)) if (season[id]?.customExtension?.source === 'covenant') delete season[id];
for (const id of IDS) {
  const s = covenant[id];
  if (!s) throw Error(`${id}: missing from the 맹약 stages`);
  season[id] = { ...structuredClone(s), weight: 50, active: true,
    customExtension: { category: 'stages', source: 'covenant', description: '맹약 시즌의 전장입니다. 선택하면 이번 게임의 전장 추첨 목록에 추가됩니다.' } };
}
await writeFile(target, JSON.stringify(season));
console.log('added', IDS.length);
