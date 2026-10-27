// tools/audit-skill-motion-sfx.mjs — per operator and selectable skill, compare what the game plays against the official
// client data (read-only):
//   * the skill's official attack mode: the FX index unit's skills[skillId].mode (index into its modes; null = the
//     default mode), extracted from the charpack (tools/local-extract fx.py);
//   * motion: that mode's attack animKey (modes[m].attack.animKey) against the clip the game resolved for the skill
//     (data/assets.json chars[id].spine.front.anims.skills[i]) and the model's own clip list;
//   * SFX: the CN audio_data banks battle.ON_ABILITY_START / ON_ABILITY_HIT.<charId>.attack.<m> (the mode's strike and
//     impact) and battle.ON_SKILL_START.<skillId> (activation) against data/assets.json audio.sfx.units[charId]
//     attacks[i] / hits[i] / skills[i] (a skill without a mode bank must not borrow another mode's sound).
//
// Usage: node tools/audit-skill-motion-sfx.mjs --fx <fx index.json> --audio <CN audio_data.json> [--json out.json]
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const J = (p) => JSON.parse(readFileSync(p, 'utf8'));
const fx = J(arg('--fx', resolve(ROOT, 'public/assets/local/fx/index.json')));
const audio = J(arg('--audio'));
const chess = J(resolve(ROOT, 'content/production/data/chess.json'));
const assets = J(resolve(ROOT, 'content/production/data/assets.json'));

const banks = new Map(audio.soundFXBanks.map((b) => [b.name.toLowerCase(), b]));
const base = (p) => (p ? String(p).toLowerCase().replace(/\\/g, '/').split('/').pop().replace(/\.(mp3|wav|ogg)$/, '') : null);
const bankFiles = (name) => (banks.get(name.toLowerCase())?.sounds || []).map((s) => base(s.asset)).filter(Boolean);
// a mode's strike may sit in numbered sub-banks (attack.<m>.1, attack.<m>.2 — a random group)
const modeFiles = (prefix) => { const k = prefix.toLowerCase(), out = new Set(bankFiles(k));
  for (const [name, b] of banks) if (name.startsWith(k + '.')) for (const s of b.sounds || []) out.add(base(s.asset));
  return [...out].filter(Boolean); };
// generic buff cues (b_char_*) are the buff templates' own sounds, not a skill-specific activation bank
const GENERIC_START = /^b_char_/;

// one record per (charId, skill slot): the chess records name the selectable skills of each operator
const ops = new Map();
for (const c of Object.values(chess)) {
  if (!c?.charId || !Array.isArray(c.skills)) continue;
  const o = ops.get(c.charId) ?? ops.set(c.charId, { name: c.name, skills: new Map() }).get(c.charId);
  c.skills.forEach((s, i) => { const id = s?.skillId || s?.prefabId; if (id && !o.skills.has(i)) o.skills.set(i, id); });
}

const rows = [];
for (const [cid, op] of ops) {
  const unit = fx.units?.[cid], sfx = assets.audio?.sfx?.units?.[cid] || {};
  const anims = assets.chars?.[cid]?.spine?.front?.anims, clips = new Set(Object.keys(assets.chars?.[cid]?.spine?.front?.animations || {}));
  for (const [i, sid] of op.skills) {
    const r = { charId: cid, name: op.name, slot: i, skillId: sid, issues: [] };
    const m = unit?.skills?.[sid]?.mode ?? null;
    r.mode = m == null ? null : unit?.modes?.[m]?.name ?? m;
    // motion
    const animKey = m == null ? null : unit?.modes?.[m]?.attack?.animKey ?? null;
    const clip = anims?.skills?.[i];
    r.animKey = animKey; r.clip = clip ? [clip.begin, clip.loop, clip.end].filter(Boolean).join('/') : null;
    if (!unit) r.issues.push('motion: no official unit record (FX index)');
    if (animKey && /^skill/i.test(animKey)) {
      const fam = animKey.toLowerCase();
      const names = clip ? [clip.begin, clip.loop, clip.end, clip.idle].filter(Boolean).map((n) => n.toLowerCase()) : [];
      if (![...clips].some((c) => c.toLowerCase().startsWith(fam))) r.issues.push(`motion: model has no ${animKey} clip`);
      else if (!names.some((n) => n.startsWith(fam))) r.issues.push(`motion: official ${animKey}, game ${r.clip || 'none'}`);
    }
    // SFX: the mode's strike / impact, the activation
    // a mode's strike: ON_ABILITY_START or ON_ABILITY_ON (continuous fire) of attack.<m> (and its numbered sub-banks), or
    // the skill's own ability bank (ON_ABILITY_START.<skillId>) when it holds a strike — each is an official sound of this skill
    const strike = m == null ? [] : [...modeFiles(`battle.ON_ABILITY_START.${cid}.attack.${m}`), ...modeFiles(`battle.ON_ABILITY_ON.${cid}.attack.${m}`)];
    const own = modeFiles(`battle.ON_ABILITY_START.${sid}`).filter((f) => f.startsWith('p_atk_'));   // not its buff / field cues
    const want = { attack: [...new Set([...strike, ...own])],
      hit: m == null ? [] : modeFiles(`battle.ON_ABILITY_HIT.${cid}.attack.${m}`), start: bankFiles(`battle.ON_SKILL_START.${sid}`) };
    // every sound of this operator's banks, to tell a borrowed sound from one the data does not name
    const anyOf = (re) => { const out = new Set(); for (const [name, b] of banks) if (re.test(name)) for (const x of b.sounds || []) out.add(base(x.asset)); return out; };
    const opSounds = anyOf(new RegExp(`\\.(?:${cid}|skchr_${cid.replace(/^char_\d+_/, '')}_\\d)(?:\\.|$)`));
    // a slot without its own strike / impact plays the unit's default one
    const have = { attack: base(sfx.attacks?.[i]) || base(sfx.attack), hit: base(sfx.hits?.[i]) || base(sfx.hit), start: base(sfx.skills?.[i]) };
    const slotOwn = { attack: !!sfx.attacks?.[i], hit: !!sfx.hits?.[i], start: !!sfx.skills?.[i] };
    r.sfx = { want, have };
    for (const role of ['attack', 'hit', 'start']) {
      const w = want[role], h = have[role];
      if (w.length && !h) r.issues.push(`sfx ${role}: official ${w[0]}, game none`);
      else if (w.length && !w.includes(h)) r.issues.push(`sfx ${role}: official ${w.join('|')}, game ${h}`);
      else if (!w.length && h && slotOwn[role] && role !== 'start' && opSounds.has(h)) r.issues.push(`sfx ${role}: no official bank for this skill's mode, game borrows ${h}`);
      else if (!w.length && h && role === 'start' && !GENERIC_START.test(h)) r.issues.push(`sfx start: no official activation bank, game plays ${h}`);
    }
    rows.push(r);
  }
}
const bad = rows.filter((r) => r.issues.length);
const kinds = {};
for (const r of bad) for (const s of r.issues) { const k = s.replace(/:.*$/, '').replace(/ (official|no|model).*/, ''); kinds[k] = (kinds[k] || 0) + 1; }
const out = { operators: ops.size, skills: rows.length, skillsWithIssues: bad.length, byKind: kinds, issues: bad };
if (arg('--json')) writeFileSync(arg('--json'), JSON.stringify(out, null, 1));
console.log(JSON.stringify({ operators: out.operators, skills: out.skills, skillsWithIssues: out.skillsWithIssues, byKind: kinds }, null, 1));
