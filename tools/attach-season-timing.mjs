// The 맹약 season's battle timing for another season's data (data/versions/<slug>/): attackTiming (attack clip damage
// frame, skill clips, deploy clip length — shared/attackTiming.js attachAttackTimings, read from the Spine animations of
// content/production/data/assets.json) written into its chess / enemies / tokens / backups files. The season's data
// folder has no asset manifest of its own, so the server and every browser read the same precomputed values.
// Idempotent. Usage: node tools/attach-season-timing.mjs data/versions/<slug>
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { attachAttackTimings } from '../shared/attackTiming.js';
const dir = process.argv[2];
const assets = JSON.parse(await readFile('content/production/data/assets.json', 'utf8'));
const read = async (n) => (existsSync(`${dir}/${n}.json`) ? { raw: await readFile(`${dir}/${n}.json`, 'utf8'), n } : null);
const files = Object.fromEntries((await Promise.all(['chess', 'enemies', 'tokens', 'backups'].map(read))).filter(Boolean).map((f) => [f.n, { ...f, data: JSON.parse(f.raw) }]));
attachAttackTimings({ chess: files.chess?.data, enemies: files.enemies?.data, tokens: files.tokens?.data }, assets);
if (files.backups?.data?.units) attachAttackTimings({ chess: files.backups.data.units }, assets);
for (const f of Object.values(files)) {
  const out = JSON.stringify(f.data, null, f.raw.includes('\n  ') ? 2 : f.raw.includes('\n ') ? 1 : 0) + (f.raw.endsWith('\n') ? '\n' : '');
  if (out !== f.raw) await writeFile(`${dir}/${f.n}.json`, out);
  const recs = f.n === 'backups' ? f.data.units : f.data;
  console.log(f.n, Object.values(recs || {}).filter((r) => r && r.attackTiming).length, '/', Object.keys(recs || {}).length);
}
