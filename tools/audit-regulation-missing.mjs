#!/usr/bin/env node
// tools/audit-regulation-missing.mjs — what the 规程 (act3autochess) season references that the fork's art does not have.
//
// Compares data/versions/<version>/ against the served catalogues: content/production/data/assets.json (portraits, icons,
// Spine models, audio), the installed official effects index (public/assets/local/fx/index.json) and the extracted
// battlefield scenes (public/assets/local/scene/<stageId>/). Writes a JSON report the local extraction kit reads as its
// target list (tools/build-regulation-extract-kit.mjs).
//
// Usage: node tools/audit-regulation-missing.mjs [--version act3autochess-v3_1] [--out FILE] [--quiet]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name, dflt) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : dflt; };
const VERSION = arg('--version', 'act3autochess-v3_1');
const OUT = arg('--out', path.join(ROOT, '.cache/regulation-missing.json'));
const QUIET = process.argv.includes('--quiet');

const readJson = (rel, dflt) => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8')); } catch { return dflt; } };
const vals = (j) => (Array.isArray(j) ? j : Object.values(j || {})).filter((v) => v && typeof v === 'object');
const V = (f) => vals(readJson(`data/versions/${VERSION}/${f}`, {}));

const assets = readJson('content/production/data/assets.json', {});
const fxIndex = readJson('public/assets/local/fx/index.json', null);
const fxUnits = fxIndex?.units || {};
const sceneDir = path.join(ROOT, 'public/assets/local/scene');
const audioText = JSON.stringify(assets.audio || {});
const localGroups = readJson('content/production/data/local-assets.json', {}).groups || {};
const localSpine = (kind, id) => has(localGroups, `spine/${kind}/${id}`);

const uniq = (a) => [...new Set(a.filter(Boolean))].sort();
const has = (map, k) => !!(map && Object.prototype.hasOwnProperty.call(map, k));

// ---- 1. operators (chess + backups) ----
const chess = V('chess.json');
const backups = readJson(`data/versions/${VERSION}/backups.json`, {});
const backupChars = vals(backups).flatMap((g) => Object.keys(g)).filter((k) => /^char_/.test(k));
const charIds = uniq([...chess.map((c) => c.charId), ...backupChars]);
const skillIds = uniq(chess.flatMap((c) => [c.skill?.skillId, ...(c.skills || []).map((s) => s?.skillId || s)]).filter((s) => typeof s === 'string'));
const skins = uniq(chess.flatMap((c) => (c.skins || []).map((s) => (typeof s === 'string' ? s : s?.skinId))));

const operators = charIds.map((id) => {
  const a = assets.chars?.[id];
  const miss = [];
  if (!a) miss.push('all');
  else {
    if (!a.avatar) miss.push('avatar');
    if (!a.portrait) miss.push('portrait');
    if (!a.spine?.front) miss.push('spineFront');
    if (!a.spine?.back) miss.push('spineBack');
  }
  if (!has(fxUnits, id)) miss.push('fx');
  if (!audioText.includes(`"${id}"`) && !audioText.includes(`/${id}/`)) miss.push('voice');
  return { id, miss };
}).filter((o) => o.miss.length);

const skills = skillIds.filter((s) => !has(assets.skills, s));

// ---- 2. tokens / summons ----
const tokens = V('tokens.json').map((t) => {
  const id = t.tokenId; const a = assets.tokens?.[id]; const miss = [];
  if (!a && !localSpine('token', id)) miss.push('all'); else { if (!a?.spine && !localSpine('token', id)) miss.push('spine'); if (a && !a.avatar) miss.push('avatar'); }
  if (!has(fxUnits, id)) miss.push('fx');
  return { id, miss };
}).filter((t) => t.miss.length);

// ---- 3. enemies (incl. bosses) ----
const enemies = V('enemies.json').map((e) => {
  const id = e.key; const a = assets.enemies?.[id]; const miss = [];
  if (!a && !localSpine('enemy', id)) miss.push('all'); else { if (a && !a.icon) miss.push('icon'); if (!a?.spine && !a?.spineLocal && !localSpine('enemy', id)) miss.push('spine'); }
  if (!has(fxUnits, id)) miss.push('fx');
  if (!audioText.includes(id)) miss.push('sfx');
  return { id, miss };
}).filter((e) => e.miss.length);

// ---- 4. icons: items, bonds, bands (strategies), garrisons, effects ----
const itemIcons = uniq(V('items.json').map((i) => i.iconId)).filter((k) => !has(assets.items, k));
const bondIcons = uniq(V('bonds.json').map((b) => b.bondId)).filter((k) => !has(assets.bonds, k));
const bandIcons = uniq(V('bands.json').map((b) => b.bandId)).filter((k) => !has(assets.bands, k));
const uiKeys = Object.keys(assets.ui || {});
const uiHas = (icon) => uiKeys.some((k) => k === icon || k.endsWith('/' + icon));
const uiIcons = uniq([
  ...V('garrisons.json').map((g) => g.eventTypeIcon),
  ...V('effects.json').map((e) => e.decoIconId),
]).filter((k) => !uiHas(k));

// ---- 5. battlefields ----
const stages = V('stages.json').map((s) => s.id).filter((id) => !fs.existsSync(path.join(sceneDir, id, 'scene.json')));

// ---- 6. music ----
const bgms = uniq(V('waves.json').map((w) => w.bgm)).filter((b) => !audioText.includes(b));

const report = {
  version: VERSION,
  generated: new Date().toISOString(),
  fxIndexInstalled: !!fxIndex,
  counts: {
    operators: operators.length, skills: skills.length, skins: skins.length, tokens: tokens.length, enemies: enemies.length,
    itemIcons: itemIcons.length, bondIcons: bondIcons.length, bandIcons: bandIcons.length, uiIcons: uiIcons.length,
    stages: stages.length, bgms: bgms.length,
  },
  operators, skills, skins, tokens, enemies, itemIcons, bondIcons, bandIcons, uiIcons, stages, bgms,
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(report, null, 2));

if (!QUIET) {
  const tally = (list) => { const t = {}; for (const x of list) for (const m of x.miss) t[m] = (t[m] || 0) + 1; return t; };
  console.log(`version ${VERSION}${fxIndex ? '' : '  (official effects not installed: every fx counts as missing)'}`);
  console.log('operators', operators.length, tally(operators));
  console.log('tokens   ', tokens.length, tally(tokens));
  console.log('enemies  ', enemies.length, tally(enemies));
  console.log('skills', skills.length, '| item icons', itemIcons.length, '| bond icons', bondIcons.length, '| band icons', bandIcons.length, '| ui icons', uiIcons.length);
  console.log('stages', stages.length, stages.join(' '));
  console.log('bgm', bgms.length, bgms.join(' '));
  console.log('→', path.relative(ROOT, OUT));
}
