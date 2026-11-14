// Copy the fork's operator skins (chess[].skins, docs/SKINS.md) onto another season's chess data, by operator id
// (charId), so a skin chosen for an operator is worn in every season. Only `skins` is copied: the season's own
// stats, kits and timings stay the upstream ones. Idempotent.
// Usage: node tools/merge-season-skins.mjs [data/versions/<slug>/chess.json ...]
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
const fork = JSON.parse(readFileSync('content/production/data/chess.json', 'utf8'));
const byChar = new Map();
for (const c of Object.values(fork)) if (c?.charId && Array.isArray(c.skins) && c.skins.length && !byChar.has(c.charId)) byChar.set(c.charId, c.skins);
const targets = process.argv.slice(2).length ? process.argv.slice(2)
  : readdirSync('data/versions').map((d) => `data/versions/${d}/chess.json`).filter(existsSync);
for (const file of targets) {
  const raw = readFileSync(file, 'utf8'); const chess = JSON.parse(raw); let n = 0;
  for (const c of Object.values(chess)) {
    const skins = c?.charId && byChar.get(c.charId);
    if (skins && JSON.stringify(c.skins) !== JSON.stringify(skins)) { c.skins = skins; n++; }
  }
  if (n) writeFileSync(file, JSON.stringify(chess, null, raw.includes('\n  ') ? 2 : raw.includes('\n ') ? 1 : 0) + (raw.endsWith('\n') ? '\n' : ''));
  console.log(file, n);
}
