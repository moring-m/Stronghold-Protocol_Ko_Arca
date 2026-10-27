#!/usr/bin/env node
// tools/vfx-op-skill-audit.mjs — which operator skills' official effects never play in a real battle. Every visible
// chess (elite form) × each selectable skill fights a short duel in the sim (test/helpers/battleHarness.js: the
// operator in front facing each of the four directions in turn, an ally behind, a stream of melee attackers that hit
// back); the battle's events go to
// render/vfx/wiring.js as the client sends them (render/app.js event switch) with a stand-in effect system, and the
// skill plan's own keys (render/vfx/skills.js skillPlan) are compared with the keys spawned. Read-only.
//
// Usage: node tools/vfx-op-skill-audit.mjs [--index <path>] [--seconds 60] [--only <charId|chessId>] [--json]
// Rows: `no cast` (the skill never started in the duel — no verdict on its effects), `none` (it ran, none of its own
// keys played), `partial` (some did; the missing ones listed). Keys the plan marks unmapped are not counted.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { skillPlan, resolveSkill } from '../public/js/render/vfx/skills.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (name, d) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : d; };
const INDEX = opt('--index', path.join(ROOT, 'public/assets/local/fx/index.json'));
const SECONDS = Number(opt('--seconds', 60));
const ONLY = opt('--only', null);
const JSON_OUT = args.includes('--json');

if (!fs.existsSync(INDEX)) { console.log(`no index at ${INDEX}`); process.exit(0); }
const idx = JSON.parse(fs.readFileSync(INDEX, 'utf8'));
const chess = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/chess.json'), 'utf8'));
const { makeBattle, enemyRec } = await import('../test/helpers/battleHarness.js');
const { FxWiring } = await import('../public/js/render/vfx/wiring.js');

const ownKeys = (plan) => {
  const out = new Set();
  for (const g of ['start', 'loop', 'end', 'ready', 'range', 'trigger']) for (const e of plan[g]) out.add(e.key);
  for (const a of plan.attacks) { for (const e of [...a.cast, ...a.range, ...a.aim]) out.add(e.key); for (const h of a.hit) for (const e of h) out.add(e.key); }
  for (const e of plan.each.cast) out.add(e.key);
  for (const h of plan.each.hit) for (const e of h) out.add(e.key);
  return out;
};

const ATTACKER = enemyRec({ key: 'enemy_audit', hp: 1e8, atk: 250, speed: 0.6, bat: 1.5 });
const rows = [];
for (const [id, rec] of Object.entries(chess)) {
  if (!rec.isGolden || rec.isHidden || rec.isDiy || rec.visible === false || !rec.charId) continue;
  if (ONLY && ONLY !== id && ONLY !== rec.charId) continue;
  (rec.skills || []).forEach((srec, skillIndex) => {
    const sid = String(srec.skillId || '').replace(/\[\d+\]$/, '');
    const r = resolveSkill(idx, { info: { spine: rec.charId, skillIndex }, rec: { ...rec, skill: srec }, unitKey: rec.charId, skillIndex });
    const unitKey = idx.units?.[rec.charId] ? rec.charId : null;
    const plan = unitKey ? skillPlan(idx, unitKey, r?.skillId || sid, { rec: srec }) : null;
    const keys = plan ? ownKeys(plan) : new Set();
    // the attack mode the skill switches to (its plan's modeName, else S<n> / Sk<n> / s<n>): its casts and hits play on the
    // skill's attacks — of the unit the client draws (a skin's own index unit when the chess wears one)
    const canon = (n) => String(n || '').toLowerCase().replace(/^sk(?=\d)/, 's').replace(/[([].*$/, '');
    // as wiring.js mode(): the plan's mode, else S<n> only when a buff of the skill switches the mode (`…[mode]`)
    const switches = !!plan && [...plan.start, ...plan.loop].some((e) => /\[mode\]$/.test(e.buff || ''));
    // …or, with neither, the facing variants of S<n> (灰烬 S2: S2(U) / S2(D) / S2(LR)) — not a plain S<n>
    const facingOnly = !plan?.modeName && !switches;
    const want = plan?.modeName ? canon(plan.modeName) : `s${skillIndex + 1}`;
    const modeKeys = (key) => {
      const out = new Set();
      for (const m of idx.units?.[key]?.modes || []) {
        if (canon(m.name) !== want || !m.attack || (facingOnly && !/[([](?:down|d|up|u|lr)[)\]]$/i.test(m.name))) continue;
        for (const c of [...(m.attack.cast || []), ...(m.attack.hit || [])]) for (const k of c.effects || []) if (k) out.add(k);
      }
      return out;
    };
    let drawnKey = unitKey;
    if (!keys.size && !modeKeys(unitKey).size) return;
    const played = new Set();
    let started = 0, error = null;
    for (const DIR of ['RIGHT', 'UP', 'DOWN', 'LEFT']) try {
      const ofx = { active: true, time: 0, lite: false, tier: 'full', timers: [], ctx: { fieldRect: () => ({ r0: 9, r1: 12, c0: 2, c1: 18 }) },
        lib: { has: (k) => !!idx.prefabs[k], def: (k) => (idx.prefabs[k] ? { isLoop: idx.prefabs[k].looping, spawn: 2, stats: {} } : null), index: async () => idx, preload: async () => 0, defs: new Map(), mesh: () => null },
        spawn(k) { played.add(k); return { alive: true, anchor: [0, 0, 0], stop() { this.alive = false; }, kill() { this.alive = false; }, linkLines() {} }; } };
      const views = new Map();
      const w = new FxWiring(ofx, { speed: () => 1, record: (info) => (info.side === 'enemy' ? ATTACKER : chess[info.defId] || null), view: (vid) => views.get(vid) || null });
      w.idx = idx;
      const h = makeBattle({ timeLimit: 600, autoFinish: false, seed: 3, flags: { dpPerSec: 0, dpMax: 999 },
        units: [{ uid: 1, chessId: id, row: 9, col: 6, dir: DIR, skillIndex }, { uid: 2, chessId: 'chess_char_1_02_a', row: 9, col: 4, dir: 'RIGHT' }],
        enemies: [{ key: 'enemy_audit', time: 0, route: 0, count: 6, interval: 4 }], defs: { enemies: { enemy_audit: ATTACKER } } });
      const viewOf = (x) => {
        let v = views.get(x.id);
        if (!v) {
          v = { id: x.id, x: x.x, y: x.y, z: 0, alive: true, isEnemy: x.side === 'enemy', visFacing: 1, flags: 0, dir: x.dir,
            info: { id: x.id, kind: x.kind, side: x.side, defId: x.defId, spine: x.def?.charId || x.defId, charId: x.def?.charId, skillIndex: x.def?.skill?.index ?? (x.uid === 1 ? skillIndex : undefined) } };
          views.set(x.id, v);
        }
        return v;
      };
      for (let tick = 0; tick < SECONDS * 30; tick++) {
        h.step();
        const now = h.b.time;
        for (const x of h.b.units) if (x.alive) { const v = viewOf(x); v.x = x.x; v.y = x.y; v.dir = x.dir; if (x.uid === 1) drawnKey = w.unitKeyOf(v) || drawnKey; }
        for (const e of h.events.splice(0)) {
          const v = views.get(e[1]);
          switch (e[0]) {
            case 'deploy': if (v) w.deploy(v); break;
            case 'spawn': if (v) w.spawned(v); break;
            case 'atkStart': { const t = views.get(e[2]); if (v && typeof e[7] === 'string') w.attackStart(v, t, e[7], { lead: e[3], left: e[3], speed: 1 }); break; }
            case 'atkCancel': if (v) w.cancelAttack(v); break;
            case 'atk': { const t = views.get(e[2]); if (v) w.attack(v, t, e[3], now); break; }
            case 'dmg': if (v) w.damage(v, e[3], e[4]?.sourceId != null ? views.get(e[4].sourceId) : null, now, e[4] || null); break;
            case 'heal': if (v) w.heal(v, now); break;
            case 'skill': if (v) { if (e[2] && v.id === h.b.units.find((u) => u.uid === 1)?.id) started++; w.skill(v, !!e[2], e[3]); } break;
            case 'skillImpact': if (v) w.skillImpact(v); break;
            case 'status': if (v) w.status(v, e[2], !!e[3]); break;
            case 'fx': w.simFx(e[1], Number(e[2]), Number(e[3]), e[4]); break;
            case 'die': if (v) { v.alive = false; w.release(v); } break;
          }
        }
        for (const t of h.b.snapshot().units) { const v = views.get(t[0]); if (v) { v.hp = t[3]; v.maxHp = t[4]; v.sp = t[5]; v.spMax = t[6]; v.flags = t[7]; v.anim = t[8]; } }
        w.sync(views.values());
        w.tick();
        ofx.time += 1 / 30;
      }
    } catch (e) { error = String(e && e.message || e).slice(0, 160) + (process.env.STACK ? "\n" + e.stack : ""); }
    for (const k of modeKeys(drawnKey)) keys.add(k);
    for (const k of [...played]) if (!keys.has(k)) played.delete(k);
    // a controller that spawns other prefabs and is never drawn itself (余 S3's wall source: render/vfx/yuwall.js)
    keys.delete('yu_skill3_range_01_source');
    const missing = [...keys].filter((k) => !played.has(k));
    const verdict = error ? 'error' : !started ? 'no cast' : !played.size ? 'none' : missing.length ? 'partial' : 'ok';
    rows.push({ chess: id, charId: rec.charId, drawn: drawnKey, skill: sid, skillIndex, verdict, played: [...played], missing, error });
  });
}

if (JSON_OUT) console.log(JSON.stringify(rows, null, 1));
else {
  const by = (v) => rows.filter((r) => r.verdict === v);
  console.log(`${rows.length} (operator, skill) pairs with official keys — ok ${by('ok').length}, partial ${by('partial').length}, none ${by('none').length}, no cast ${by('no cast').length}, error ${by('error').length}`);
  for (const v of ['none', 'partial', 'no cast', 'error']) {
    if (!by(v).length) continue;
    console.log(`\n${v}:`);
    for (const r of by(v)) console.log(`  ${r.charId} ${r.skill}${r.missing.length && v !== 'no cast' ? ` — missing ${r.missing.join(', ')}` : ''}${r.error ? ` — ${r.error}` : ''}`);
  }
}
