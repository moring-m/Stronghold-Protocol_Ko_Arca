#!/usr/bin/env node
// tools/import-skill-ability-sfx.mjs — the official skill-level ability banks of audio_data (battle.ON_ABILITY_ON /
// ON_ABILITY_START / ON_ABILITY_HIT.<skillId>[.n], ON_PROJECTILE_HIT / ON_PROJECTILE_REACH.<the skill's projectile>) as
// the skill's strike and impact sounds: data/assets.json audio.sfx.units[charId].skillCombat[slot] { attack, hit }
// (public/js/audio.js plays them on the attacks and hits while that skill runs). The curated banks of
// tools/assets/skill-combat-sounds.mjs (operator mode banks) and an existing entry are kept; only a missing role is
// filled. A role takes:
//   attack  a strike file (p_atk_*) of ON_ABILITY_ON / ON_ABILITY_START, else a p_skill_* file of ON_ABILITY_ON (an
//           ability's own cue — 焰尾 S2's p_skill_lightsword); never a generic buff cue (b_char_*) or the skill's
//           activation sound (skills[slot], ON_SKILL_START)
//   hit     the projectile's hit / reach file, else an impact file (p_imp_*) of ON_ABILITY_HIT / ON_ABILITY_ON
// Loops (_loop / _lp) are skipped; of a numbered bank's files the first. New files join content/production/resources.json
// with the voice repository source (HEAD-checked; a missing one is left out).
//
// Usage: node tools/import-skill-ability-sfx.mjs --audio <CN audio_data.json> --fx <fx index.json> [--dry]
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { RAW } from './assets/sources.mjs';
import { assetToPath } from './assets/audio.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const DRY = process.argv.includes('--dry');
const J = (p) => JSON.parse(readFileSync(p, 'utf8'));
const audio = J(arg('--audio'));
const idx = J(arg('--fx', resolve(ROOT, 'public/assets/local/fx/index.json')));
const ASSETS = resolve(ROOT, 'content/production/data/assets.json'), RES = resolve(ROOT, 'content/production/resources.json');
const assets = J(ASSETS), catalog = J(RES), chess = J(resolve(ROOT, 'content/production/data/chess.json'));

const banks = new Map(audio.soundFXBanks.map((b) => [b.name.toLowerCase(), (b.sounds || []).map((s) => assetToPath(s.asset)).filter(Boolean)]));
const LOOP = /(?:_loop|_lp)(?:_|\d|\.|$)/i;
const leaf = (p) => p.split('/').pop().replace(/\.mp3$/, '');
const files = (name) => (banks.get(name) || []).filter((p) => !LOOP.test(p));
const numbered = (prefix) => [...banks.keys()].filter((n) => n === prefix || (n.startsWith(prefix + '.') && /^\d+$/.test(n.slice(prefix.length + 1)))).sort();
const url = (p) => `/assets/audio/sfx/${p}`;

const units = assets.audio.sfx.units;
const known = new Set(catalog.files.map((f) => f.path));
const added = new Map(), report = [];
for (const [cid, recs] of Map.groupBy(Object.values(chess), (c) => c.charId)) {
  if (!cid) continue;
  const skills = new Map(recs.flatMap((c) => c.skills || [c.skill]).filter(Boolean).map((s) => [s.index, s]));
  for (const [i, s] of skills) {
    const sid = String(s.skillId || '').replace(/\[\d+\]$/, '').toLowerCase();
    const on = [...numbered(`battle.on_ability_on.${sid}`)].flatMap(files);
    const start = [...numbered(`battle.on_ability_start.${sid}`)].flatMap(files);
    const hitB = [...numbered(`battle.on_ability_hit.${sid}`)].flatMap(files);
    const projs = (idx.units?.[cid]?.skills?.[sid]?.projectiles || []).map((p) => p.toLowerCase());
    const projHit = projs.flatMap((p) => [...files(`battle.on_projectile_hit.${p}`), ...files(`battle.on_projectile_reach.${p}`)]);
    if (!on.length && !start.length && !hitB.length && !projHit.length) continue;
    const u = units[cid] || (units[cid] = {});
    const activation = typeof u.skills?.[i] === 'string' ? leaf(u.skills[i]) : null;
    const usable = (p) => !/^b_char_/.test(leaf(p)) && leaf(p) !== activation;
    const attack = [...on, ...start].find((p) => /^p_atk_/.test(leaf(p)) && usable(p)) || on.find((p) => /^p_skill_/.test(leaf(p)) && usable(p)) || null;
    const hit = projHit.find(usable) || [...hitB, ...on].find((p) => /^p_imp_/.test(leaf(p)) && usable(p)) || null;
    const cur = u.skillCombat?.[i] || {};
    const fill = {};
    if (attack && !cur.attack) fill.attack = url(attack);
    if (hit && !cur.hit) fill.hit = url(hit);
    if (!Object.keys(fill).length) continue;
    (u.skillCombat ||= {})[i] = { ...cur, ...fill };
    for (const p of Object.values(fill)) if (!known.has(p)) added.set(p, p.slice('/assets/audio/sfx/'.length));
    report.push({ charId: cid, name: recs[0].name, slot: i, skillId: sid, ...fill });
  }
}

// the new files: HEAD-check the voice repository source, record the size
const missing = new Set();
for (const [path, rel] of added) {
  const src = RAW.aa2voice + rel;
  let bytes = null;
  try {
    const head = execFileSync('curl', ['-sSIL', '--max-time', '20', src], { encoding: 'utf8' });
    if (!/^HTTP\/\S+ 200/m.test(head.split(/\r?\n\r?\n/).filter(Boolean).pop() || '')) throw Error('not 200');
    bytes = Number(/content-length:\s*(\d+)/i.exec(head.split(/\r?\n\r?\n/).filter(Boolean).pop())?.[1]) || null;
  } catch { missing.add(path); continue; }
  catalog.files.push({ path, sources: [src], ...(bytes ? { bytes } : {}) });
}
if (missing.size) for (const u of Object.values(units)) for (const c of Object.values(u.skillCombat || {})) for (const r of ['attack', 'hit']) if (missing.has(c[r])) delete c[r];

console.log(`skill ability sounds: ${report.length} skills filled, ${added.size - missing.size} new files, ${missing.size} unavailable`);
for (const r of report) console.log(`  ${r.charId} ${r.name} S${r.slot + 1}: ${[r.attack && 'attack ' + leaf(r.attack), r.hit && 'hit ' + leaf(r.hit)].filter(Boolean).join(', ')}${[r.attack, r.hit].some((p) => missing.has(p)) ? ' (part unavailable)' : ''}`);
if (!DRY) {
  if (added.size > missing.size) {
    catalog.version = createHash('sha256').update(JSON.stringify(catalog.files)).digest('hex').slice(0, 20);
    if (Number.isFinite(catalog.estimatedBytes)) catalog.estimatedBytes += catalog.files.filter((f) => added.has(f.path)).reduce((n, f) => n + (f.bytes ?? 0), 0);
  }
  writeFileSync(ASSETS, JSON.stringify(assets));
  writeFileSync(RES, JSON.stringify(catalog));
}
