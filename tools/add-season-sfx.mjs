// Battle SFX for the operators and enemies of another season's data that the fork's manifest lacks: the upstream
// release's own audio.sfx.units / pools entries (same shape as the fork's), copied for the missing ids only, and their
// files added to content/production/resources.json from the pinned official audio source (sources.mjs RAW.aa2voice).
// Never changes an id the fork already has. Usage:
//   node tools/add-season-sfx.mjs <upstream data/assets.json> data/versions/<slug>/chess.json data/versions/<slug>/enemies.json
import { readFile, writeFile } from 'node:fs/promises';
import { RAW } from './assets/sources.mjs';
const [upPath, chessPath, enemiesPath] = process.argv.slice(2);
const up = JSON.parse(await readFile(upPath, 'utf8')).audio.sfx;
const chess = JSON.parse(await readFile(chessPath, 'utf8')), enemies = JSON.parse(await readFile(enemiesPath, 'utf8'));
const prodPath = 'content/production/data/assets.json', prodRaw = await readFile(prodPath, 'utf8'), prod = JSON.parse(prodRaw);
const sfx = prod.audio.sfx;
const ids = [...new Set([...Object.values(chess).map((c) => c.charId), ...Object.values(enemies).map((e) => e.key || e.enemyId)].filter(Boolean))];
const files = new Set(); let units = 0, pools = 0;
const collect = (o) => { if (typeof o === 'string') { if (o.startsWith('/assets/audio/')) files.add(o); } else if (o && typeof o === 'object') Object.values(o).forEach(collect); };
const poolRefs = (o, out) => { if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) { if (k === 'pools' && v && typeof v === 'object') Object.values(v).forEach((p) => typeof p === 'string' ? out.add(p) : Object.values(p || {}).forEach((x) => typeof x === 'string' && out.add(x))); else poolRefs(v, out); } };
for (const id of ids) {
  if (sfx.units[id] || !up.units?.[id]) continue;
  sfx.units[id] = up.units[id]; units++;
  collect(up.units[id]);
  const refs = new Set(); poolRefs({ x: up.units[id] }, refs);
  for (const key of refs) if (!sfx.pools[key] && up.pools?.[key]) { sfx.pools[key] = up.pools[key]; pools++; for (const s of Object.keys(up.pools[key].sounds || {})) files.add('/assets/audio/sfx/' + s); }
}
await writeFile(prodPath, JSON.stringify(prod, null, prodRaw.includes('\n  ') ? 2 : prodRaw.includes('\n ') ? 1 : 0) + (prodRaw.endsWith('\n') ? '\n' : ''));
// resources: sizes from the pinned source
const res = JSON.parse(await readFile('content/production/resources.json', 'utf8'));
const known = new Set(res.files.map((f) => f.path)), add = [], missing = [];
await Promise.all([...files].filter((p) => !known.has(p)).map(async (path) => {
  const url = RAW.aa2voice + path.replace(/^\/assets\/audio\/(?:sfx\/)?/, ''); // the official banks have no sfx/ level
  try { const r = await fetch(url, { method: 'HEAD' }); if (r.ok) add.push({ path, sources: [url], bytes: Number(r.headers.get('content-length')) || 0 }); else missing.push(path); } catch { missing.push(path); }
}));
res.files.push(...add); res.files.sort((a, b) => (a.path < b.path ? -1 : 1));
const bytes = add.reduce((s, f) => s + f.bytes, 0); res.estimatedBytes += bytes; if (res.estimatedStorageBytes) res.estimatedStorageBytes += bytes;
await writeFile('content/production/resources.json', JSON.stringify(res) + '\n');
console.log(`units ${units}, pools ${pools}, files +${add.length}, unavailable ${missing.length}`, missing.slice(0, 5));
