// tools/fix-skill-sfx.mjs — set every selectable skill's strike / impact sound to the official one of the skill's attack
// mode (the fix of docs/skill-motion-sfx-audit-2026-10-26, tools/audit-skill-motion-sfx.mjs reports what is left).
//
//   node tools/fix-skill-sfx.mjs --fx <fx index.json> --audio <CN audio_data.json> [--dry]
//
// Per operator (chess.json) and skill slot i, with m = the skill's official attack mode (FX index unit skills[id].mode):
//   * strike: battle.ON_ABILITY_START / ON_ABILITY_ON.<charId>.attack.<m> (or its first numbered sub-bank), else the
//     skill's own strike bank ON_ABILITY_START.<skillId> (p_atk_ files only); impact: ON_ABILITY_HIT.<charId>.attack.<m>;
//     activation: ON_SKILL_START.<skillId> when the game has none.
//   * a slot whose sound is already one of the official ones is left as it is; one without a bank of its mode that
//     plays another of the operator's sounds is only listed (REVIEW): an unnumbered bank can be a skill's own.
// Writes content/production/data/assets.json (audio.sfx.units, audio.sfx.pools) and adds the new files to
// content/production/resources.json (their size measured from the public audio mirror).
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { indexAudio, assetToPath } from './assets/audio.mjs';
import { RAW } from './assets/sources.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const J = (p) => JSON.parse(readFileSync(p, 'utf8'));
const dry = process.argv.includes('--dry');
const fx = J(arg('--fx', resolve(ROOT, 'public/assets/local/fx/index.json')));
const raw = J(arg('--audio'));
const audio = indexAudio(raw);
const banks = new Map(raw.soundFXBanks.map((b) => [b.name.toLowerCase(), b]));
const assetsPath = resolve(ROOT, 'content/production/data/assets.json'), resPath = resolve(ROOT, 'content/production/resources.json');
const assets = J(assetsPath), chess = J(resolve(ROOT, 'content/production/data/chess.json'));
const units = assets.audio.sfx.units, pools = (assets.audio.sfx.pools ??= {});

/** the first bank of `prefix` itself or its numbered sub-banks (attack.<m>.1 …), by name */
function firstBank(prefix) {
  const k = prefix.toLowerCase();
  if (banks.get(k)?.sounds?.length) return banks.get(k);
  const subs = [...banks.keys()].filter((n) => n.startsWith(k + '.')).sort();
  return subs.length ? banks.get(subs[0]) : null;
}
const filesOf = (prefix) => { const k = prefix.toLowerCase(), out = new Set();
  for (const [n, b] of banks) if (n === k || n.startsWith(k + '.')) for (const s of b.sounds || []) { const p = assetToPath(s.asset); if (p) out.add(p); }
  return out; };
const pathOf = (b) => assetToPath((b?.sounds || []).find((s) => assetToPath(s.asset))?.asset);
const rel = (url) => (url ? String(url).replace(/^\/assets\/audio\/sfx\//, '') : null);

const ops = new Map();
for (const c of Object.values(chess)) {
  if (!c?.charId || !Array.isArray(c.skills)) continue;
  const o = ops.get(c.charId) ?? ops.set(c.charId, new Map()).get(c.charId);
  c.skills.forEach((s, i) => { const id = s?.skillId || s?.prefabId; if (id && !o.has(i)) o.set(i, id); });
}

const changes = [], review = [], added = new Set();
const use = (u, table, poolTable, mixTable, i, bank) => {
  const p = pathOf(bank);
  (u[table] ||= {})[i] = `/assets/audio/sfx/${p}`; added.add(p);
  (u[poolTable] ||= {})[i] = bank.name;
  pools[bank.name] ??= (() => { const pool = audio.poolOf(audio.bank(bank.name)); if (!pool) return undefined; const { id, ...rest } = pool; return rest; })();
  if (pools[bank.name] === undefined) delete pools[bank.name];
  const mix = audio.mixOf(audio.bank(bank.name));
  if (mix) (u[mixTable] ||= {})[i] = mix; else if (u[mixTable]) delete u[mixTable][i];
};

for (const [cid, slots] of ops) {
  const u = units[cid], unit = fx.units?.[cid];
  if (!u || !unit) continue;
  const mine = new Set(); // every sound this operator's banks name (to tell a borrowed sound)
  for (const [n, b] of banks) if (n.includes(`.${cid.toLowerCase()}.`) || n.endsWith(`.${cid.toLowerCase()}`)) for (const s of b.sounds || []) { const p = assetToPath(s.asset); if (p) mine.add(p); }
  for (const [i, sid] of slots) {
    // a sound recovered into the local pack (handoff 2026-10-26, /assets/local/audio) is a deliberate choice: kept
    const local = (v) => typeof v === 'string' && v.startsWith('/assets/local/');
    const m = unit.skills?.[sid]?.mode ?? null;
    // strike
    const modeStrike = m == null ? null : firstBank(`battle.ON_ABILITY_START.${cid}.attack.${m}`) || firstBank(`battle.ON_ABILITY_ON.${cid}.attack.${m}`);
    const skillStrike = firstBank(`battle.ON_ABILITY_START.${sid}`);
    // the skill's own bank also holds ready / loop / release cues: only a strike of the unit's own weapon (the stem of its
    // default attack sound, p_atk_<stem>_<letter>) stands for the skill's attack
    const stem = (p) => (p ? p.split('/').pop().replace(/\.mp3$/, '').replace(/^p_(?:atk|imp)_/, '').replace(/_[a-z]?\d*$/, '') : null);
    const strike = modeStrike || (pathOf(skillStrike)?.startsWith('player/p_atk/') && stem(pathOf(skillStrike)) === stem(rel(u.attack)) ? skillStrike : null);
    const okStrike = new Set([...(m == null ? [] : [...filesOf(`battle.ON_ABILITY_START.${cid}.attack.${m}`), ...filesOf(`battle.ON_ABILITY_ON.${cid}.attack.${m}`)]),
      ...[...filesOf(`battle.ON_ABILITY_START.${sid}`)].filter((p) => p.startsWith('player/p_atk/'))]);
    const curA = rel(u.attacks?.[i]) || rel(u.attack);
    if (strike && !local(u.attacks?.[i]) && !local(u.attack) && !okStrike.has(curA)) { changes.push({ cid, slot: i, role: 'attack', from: curA, to: pathOf(strike) }); use(u, 'attacks', 'attackPools', 'attackMix', i, strike); }
    else if (!strike && u.attacks?.[i] && mine.has(rel(u.attacks[i]))) review.push({ cid, slot: i, role: 'attack', sound: rel(u.attacks[i]) });
    // impact
    const hit = m == null ? null : firstBank(`battle.ON_ABILITY_HIT.${cid}.attack.${m}`);
    const okHit = m == null ? new Set() : filesOf(`battle.ON_ABILITY_HIT.${cid}.attack.${m}`);
    const curH = rel(u.hits?.[i]) || rel(u.hit);
    if (hit && !local(u.hits?.[i]) && !local(u.hit) && !okHit.has(curH)) { changes.push({ cid, slot: i, role: 'hit', from: curH, to: pathOf(hit) }); use(u, 'hits', 'hitPools', 'hitMix', i, hit); }
    else if (!hit && u.hits?.[i] && mine.has(rel(u.hits[i]))) review.push({ cid, slot: i, role: 'hit', sound: rel(u.hits[i]) });
    // activation the game lacks
    const start = firstBank(`battle.ON_SKILL_START.${sid}`);
    if (start && !u.skills?.[i]) { changes.push({ cid, slot: i, role: 'start', from: null, to: pathOf(start) }); (u.skills ||= {})[i] = `/assets/audio/sfx/${pathOf(start)}`; added.add(pathOf(start)); }
  }
}

const res = J(resPath), have = new Set(res.files.map((f) => f.path)), fresh = [...added].filter((p) => !have.has(`/assets/audio/sfx/${p}`));
console.log(JSON.stringify({ changes: changes.length, newFiles: fresh.length, review: review.length }));
for (const c of changes) console.log(`${c.cid} s${c.slot + 1} ${c.role}: ${c.from} -> ${c.to}`);
for (const r of review) console.log(`REVIEW ${r.cid} s${r.slot + 1} ${r.role}: no bank of the skill's mode, keeps ${r.sound}`);
if (!dry) {
  let bytes = 0;
  for (const p of fresh) {
    const url = RAW.aa2voice + p, r = await fetch(url);
    if (!r.ok) throw Error(`${r.status} ${url}`);
    const b = Buffer.from(await r.arrayBuffer()); bytes += b.length;
    res.files.push({ path: `/assets/audio/sfx/${p}`, sources: [url], bytes: b.length });
  }
  res.files.sort((a, b) => a.path.localeCompare(b.path));
  res.version = createHash('sha256').update(JSON.stringify(res.files)).digest('hex').slice(0, 20);
  res.estimatedBytes += bytes; res.estimatedStorageBytes = Math.ceil(res.estimatedBytes * 2.2); if (Number.isFinite(res.totalBytes)) res.totalBytes += bytes;
  writeFileSync(assetsPath, JSON.stringify(assets));
  if (fresh.length) writeFileSync(resPath, JSON.stringify(res));
}
