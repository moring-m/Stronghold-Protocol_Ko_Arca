// Connect a CN costume batch (tools/build-all-season-skin-kit.py → skin_recovery.py) to every season.
//
//   stage:   node tools/import-skin-batch.mjs stage  RECOVERY_DIR MODELS_DIR ASSETS_REPO TAG
//            copies the battle models (FaceSwitcher Front/Back skeletons) and the shop avatar / portrait sprites of every
//            requested costume the fork cannot show yet into the resource repository (public/<url>) and writes
//            metadata/skin-batch-<TAG>.json (path, bytes, sha256, spine sides, sprite urls, names). Commit + push it there.
//   connect: node tools/import-skin-batch.mjs connect ASSETS_REPO TAG COMMIT
//            from that metadata: content/production/data/assets.json chars[mount] (spine side records as
//            tools/import-recovery-assets.mjs builds them: parsed animations, hits, bounds, roles), the costume choices
//            on the 맹약 chess records and on every season's chess.json by charId (tools/merge-season-skins.mjs; 규정-only
//            operators get theirs directly), and content/production/resources.json rows pinned to COMMIT.
//   RECOVERY_DIR  the first upload (requested-skins.json, sprites/sprites.json); MODELS_DIR the -ModelsOnly upload
//   (models/models.json, models/public). Costume names: the official Korean skin_table when the skin is out there
//   (.cache/skin-audit/kr_skin_table.json), else tools/i18n/skin-names-ko.json.
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { existsSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { parseSkel } from './assets/skel.mjs';
import { atlasInfo } from './assets/atlas.mjs';
import { resolveRoles } from './assets/anim-roles.mjs';
import { spineAttackTiming } from '../shared/attackTiming.js';

const root = process.cwd();
const read = async (p) => JSON.parse(await readFile(p, 'utf8'));
const mountOf = (s) => 'skin_' + s.battleSkin.skinOrPrefabId.replace(/[^A-Za-z0-9_]/g, '_');
const sha = (b) => createHash('sha256').update(b).digest('hex');
const SIDE = /FaceSwitcher\/(Front|Back)$/;

async function stage(recovery, models, repo, tag) {
  const requested = await read(resolve(recovery, 'requested-skins.json'));
  const modelIndex = await read(resolve(models, 'models/models.json'));
  const sprites = (await read(resolve(recovery, 'sprites/sprites.json'))).sprites;
  const assets = await read(resolve(root, 'content/production/data/assets.json'));
  const krPath = resolve(root, '.cache/skin-audit/kr_skin_table.json');
  const kr = existsSync(krPath) ? (await read(krPath)).charSkins : {};
  const manual = await read(resolve(root, 'tools/i18n/skin-names-ko.json'));
  const files = new Map();
  const put = async (url, from) => {
    const dest = resolve(repo, 'public' + url);
    await mkdir(dirname(dest), { recursive: true });
    await copyFile(from, dest);
    const bytes = await readFile(dest);
    files.set(url, { path: url, bytes: bytes.length, sha256: sha(bytes) });
    return url;
  };
  const skins = [];
  for (const s of requested) {
    if (!s.skinId.includes('@')) continue;                       // base outfits (Makoto #1/#2) are already connected
    const mount = mountOf(s);
    if (assets.chars[mount]?.spine?.front) continue;               // already connected (Makoto p3r)
    const rows = modelIndex.models.filter((r) => r.skinIds.includes(s.skinId));
    const sides = {};
    for (const r of rows) for (const sk of r.skeletons) {
      const m = sk.node.match(SIDE);
      if (!m || sides[m[1].toLowerCase()]) continue;
      for (const url of sk.files) await put(url, resolve(models, 'models/public' + url));
      sides[m[1].toLowerCase()] = { skel: sk.skeleton, atlas: sk.atlas, textures: sk.files.filter((x) => x.endsWith('.png')) };
    }
    if (!sides.front) { console.warn('no battle model', s.skinId); continue; }
    const take = (name, big) => sprites.filter((x) => x.name === name)
      .sort((a, b) => (big ? b.width * b.height - a.width * a.height : a.width * a.height - b.width * b.height))[0];
    const av = take(s.avatarId, false), po = take(s.portraitId, true);
    const sprite = {};
    for (const [key, v] of [['avatar', av], ['portrait', po]]) if (v) sprite[key] = await put('/assets/local/recovery/sprites/' + v.file, resolve(recovery, 'sprites', v.file));
    const name = kr[s.skinId]?.displaySkin?.skinName || manual[s.skinId];
    if (!name) throw Error(`no Korean name for ${s.skinId} (${s.displaySkin.skinName}): add it to tools/i18n/skin-names-ko.json`);
    skins.push({ skinId: s.skinId, charId: s.charId, mount, name, cnName: s.displaySkin.skinName, spine: sides, ...sprite });
  }
  const out = { tag, skins, files: [...files.values()] };
  await mkdir(resolve(repo, 'metadata'), { recursive: true });
  await writeFile(resolve(repo, `metadata/skin-batch-${tag}.json`), JSON.stringify(out, null, 1) + '\n');
  console.log(`staged ${skins.length} costumes, ${files.size} files, ${out.files.reduce((n, f) => n + f.bytes, 0)} bytes`);
}

async function connect(repo, tag, commit) {
  if (!/^[0-9a-f]{40}$/.test(commit)) throw Error('COMMIT must be the full resource repository commit');
  const batch = await read(resolve(repo, `metadata/skin-batch-${tag}.json`));
  const assetsPath = resolve(root, 'content/production/data/assets.json');
  const assets = await read(assetsPath);
  const chessPath = resolve(root, 'content/production/data/chess.json');
  const chess = await read(chessPath);
  const skillsByChar = {};
  for (const r of Object.values(chess)) if (r?.charId && !skillsByChar[r.charId]) skillsByChar[r.charId] = r.skills || [];
  const choices = {};
  for (const s of batch.skins) {
    const spine = {};
    for (const [side, v] of Object.entries(s.spine)) {
      const a = atlasInfo(await readFile(resolve(repo, 'public' + v.atlas), 'utf8'));
      const sk = parseSkel(await readFile(resolve(repo, 'public' + v.skel)), new Set(a.regions));
      if (sk.missingRegions.length) throw Error(`${s.skinId} ${side}: atlas lacks ${sk.missingRegions.slice(0, 3)}`);
      spine[side] = { ...v, pma: true, animations: sk.durations, hits: sk.hits, bounds: sk.bounds,
        anims: resolveRoles(sk.animations, { skillIndices: (skillsByChar[s.charId] || []).map((_, i) => i) }) };
    }
    assets.chars[s.mount] = { ...assets.chars[s.mount], spine, ...(s.avatar ? { avatar: s.avatar } : {}), ...(s.portrait ? { portrait: s.portrait } : {}) };
    (choices[s.charId] ||= []).push({ id: s.mount, name: s.name, assets: { spine: s.mount, avatar: s.mount, portrait: s.mount },
      attackTiming: { front: spineAttackTiming(spine.front), back: spineAttackTiming(spine.back || spine.front) } });
  }
  const add = (records) => {
    let n = 0;
    for (const r of Object.values(records)) {
      const list = r?.charId && choices[r.charId];
      if (!list) continue;
      const byId = new Map((r.skins || []).map((x) => [x.id, x]));
      for (const c of list) byId.set(c.id, c);
      r.skins = [...byId.values()]; n++;
    }
    return n;
  };
  const counts = { covenant: add(chess) };
  await writeFile(assetsPath, JSON.stringify(assets));
  await writeFile(chessPath, JSON.stringify(chess));
  // every other season by charId: operators also in the 맹약 roster through tools/merge-season-skins.mjs' rule, the rest here
  for (const d of readdirSync(resolve(root, 'data/versions'))) {
    const p = resolve(root, 'data/versions', d, 'chess.json');
    if (!existsSync(p)) continue;
    const raw = await readFile(p, 'utf8'), season = JSON.parse(raw);
    counts[d] = add(season);
    await writeFile(p, JSON.stringify(season) + (raw.endsWith('\n') ? '\n' : ''));
  }
  const resPath = resolve(root, 'content/production/resources.json');
  const res = await read(resPath);
  const rows = new Map(res.files.map((f) => [f.path, f]));
  const base = 'moring-m/Stronghold-Protocol_Ko_Arca_assets';
  for (const f of batch.files) rows.set(f.path, { path: f.path, sources: [
    `https://raw.githubusercontent.com/${base}/${commit}/public${f.path}`, `https://cdn.jsdelivr.net/gh/${base}@${commit}/public${f.path}`],
    sha256: f.sha256, bytes: f.bytes });
  res.files = [...rows.values()];
  res.version = createHash('sha256').update(JSON.stringify(res.files)).digest('hex').slice(0, 20);
  await writeFile(resPath, JSON.stringify(res) + '\n');
  console.log(`connected ${batch.skins.length} costumes`, counts, `resources ${batch.files.length}, catalogue ${res.version}`);
}

// ---- costume FX and SFX ------------------------------------------------------------------------------------------------
//   fx:        node tools/import-skin-batch.mjs fx RECOVERY_DIR ASSETS_REPO TAG
//              adds the batch's costume effects to the effects index the catalogue serves (its pinned
//              /assets/local/fx/index.json + textures.json, only new keys: preservesIndex holds), the costume →
//              effect / projectile replacements (index.costumes / skins, as tools/import-recovery-assets.mjs), the payload
//              files (fx/prefabs, fx/tex, fx/mesh) and the costume battle SFX (official banks of the costume, MP3), into the
//              resource repository; metadata/skin-fx-<TAG>.json lists what to connect. Commit + push it there.
//   connect-fx: node tools/import-skin-batch.mjs connect-fx ASSETS_REPO TAG COMMIT
//              catalogue rows for those files pinned to COMMIT, content/production/data/local-fx.json groups and
//              content/custom/audio/skin-sfx.json (units + aliases), then tools/build-skin-sfx.mjs into assets.json.
async function fx(recovery, repo, tag) {
  const { costumeMountBindings } = await import('./assets/costumeMounts.mjs');
  const { indexAudio } = await import('./assets/audio.mjs');
  const { unitCombatSounds } = await import('./assets/unit-combat-sounds.mjs');
  const { execFileSync } = await import('node:child_process');
  const batch = await read(resolve(repo, `metadata/skin-batch-${tag}.json`));
  const wanted = new Map(batch.skins.map((s) => [s.skinId, s]));
  const res = await read(resolve(root, 'content/production/resources.json'));
  const rows = new Map(res.files.map((f) => [f.path, f]));
  // the index / textures the catalogue serves now (its pinned source), not a locally diverged copy
  const pinned = async (path) => {
    const row = rows.get(path);
    const commit = row.sources[0].match(/\/([0-9a-f]{40})\//)[1];
    const { execFileSync: run } = await import('node:child_process');
    const text = run('git', ['-C', repo, 'show', `${commit}:public${path}`], { maxBuffer: 1 << 30 }).toString('utf8');
    if (sha(Buffer.from(text)) !== row.sha256) throw Error(`${path}: pinned bytes differ from the catalogue row`);
    return JSON.parse(text);
  };
  const index = await pinned('/assets/local/fx/index.json');
  const textures = await pinned('/assets/local/fx/textures.json');
  const files = new Map(), groups = {};
  const put = async (url, from) => {
    const dest = resolve(repo, 'public' + url);
    await mkdir(dirname(dest), { recursive: true });
    if (from) await copyFile(from, dest);
    const bytes = await readFile(dest);
    files.set(url, { path: url, bytes: bytes.length, sha256: sha(bytes) });
  };
  let prefabs = 0;
  for (const layer of ['unit-fx', 'costumes']) {
    const lr = resolve(recovery, layer);
    const idx = await read(lr + '/public/assets/local/fx/index.json'), tt = await read(lr + '/public/assets/local/fx/textures.json');
    const manifest = await read(lr + '/data/local-fx.json');
    for (const [key, v] of Object.entries(idx.prefabs || {})) if (!index.prefabs[key]) { index.prefabs[key] = v; prefabs++; }
    for (const [key, v] of Object.entries(tt.textures || {})) textures.textures[key] ??= v;
    for (const [group, entries] of Object.entries(manifest.groups)) {
      if (group === 'fx') continue;
      for (const [key, v] of Object.entries(entries)) {
        (groups[group] ??= {})[key] ??= v;
        for (const url of [v.path, v.half]) if (url && !rows.has(url)) await put(url, resolve(lr, 'public' + url));
      }
    }
  }
  const graph = await read(resolve(recovery, 'unit-skill-projectiles.json'));
  for (const section of ['units', 'skills', 'projectiles']) for (const [key, v] of Object.entries(graph[section] || {})) index[section][key] ??= v;
  const follow = await read(resolve(recovery, 'costume-wiring/skin-projectiles.json'));
  for (const [key, v] of Object.entries(follow.projectiles || {})) index.projectiles[key] ??= v;
  const effects = await read(resolve(recovery, 'costumes/skin-effects.json'));
  const catalog = new Map(effects.catalog.map((s) => [s.skinId, s]));
  let costumes = 0;
  for (const row of effects.skins) {
    if (!row.container.includes('/battle/prefabs/skins/character/')) continue;
    for (const id of row.skinIds) {
      const meta = catalog.get(id);
      if (!meta || !wanted.has(id)) continue;
      const mount = mountOf(meta), fxMap = {}, projectiles = {};
      for (const c of row.components || []) {
        for (const p of c.fields?._replaceEffectPairs || []) if (p.fromEffect && p.toEffect) fxMap[p.fromEffect.toLowerCase()] = p.toEffect.toLowerCase();
        if (c.fields?._useFakeProjectile) for (const p of c.fields._fakeProjectileConfigs || []) projectiles[p.originProjectileKey.toLowerCase()] = { graphic: p.graphicProjectileKey.toLowerCase(), mount: p._fakeMuzzlePoint };
      }
      index.skins[mount] = { source: row.container, graphic: row.graphic || index.units[meta.charId]?.graphic, points: row.points, mountBindings: costumeMountBindings(row) };
      index.costumes[mount] = index.costumes[id] = { charId: meta.charId, skinId: id, mount, effects: fxMap, projectiles };
      costumes++;
    }
  }
  for (const [path, value] of [['/assets/local/fx/index.json', index], ['/assets/local/fx/textures.json', textures]]) {
    const dest = resolve(repo, 'public' + path);
    await mkdir(dirname(dest), { recursive: true });
    await writeFile(dest, JSON.stringify(value));
    await put(path);
  }
  // costume SFX: the costume's own banks (battle.<event>.<key>.<suffix> / ..._<suffix>), as tools/import-cn-skin-sfx.mjs
  const raw = await read(resolve(root, '.cache/skin-audit/audio_data.json'));
  const report = await read(resolve(recovery, 'sfx/audio-report.json'));
  const clips = new Map(report.files.map((f) => [f.name.toLowerCase(), f]));
  const recordsByChar = {};
  for (const p of [resolve(root, 'content/production/data/chess.json'), ...readdirSync(resolve(root, 'data/versions')).map((d) => resolve(root, 'data/versions', d, 'chess.json')).filter(existsSync)])
    for (const r of Object.values(await read(p))) if (r?.charId) (recordsByChar[r.charId] ||= []).push(r);
  const sfx = { units: {}, aliases: {} };
  const encode = async (value) => {
    if (typeof value === 'string' && value.startsWith('/assets/audio/sfx/')) {
      if (rows.has(value)) return value;
      const leaf = value.split('/').pop().replace(/\.mp3$/, '').toLowerCase(), clip = clips.get(leaf);
      if (!clip) return null;
      const src = resolve(recovery, 'sfx', clip.file.replaceAll('\\', '/'));
      if (sha(await readFile(src)) !== clip.sha256) throw Error('audio hash mismatch ' + leaf);
      const url = '/assets/local/audio/sfx/' + leaf.replace(/[^a-z0-9_.-]/g, '_') + '.mp3', out = resolve(repo, 'public' + url);
      if (!files.has(url)) { await mkdir(dirname(out), { recursive: true }); execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', src, '-codec:a', 'libmp3lame', '-b:a', '160k', out]); await put(url); }
      return url;
    }
    if (Array.isArray(value)) return (await Promise.all(value.map(encode))).filter((x) => x != null);
    if (value && typeof value === 'object') { const o = {}; for (const [k, v] of Object.entries(value)) { const e = await encode(v); if (e != null && !(typeof e === 'object' && !Array.isArray(e) && !Object.keys(e).length)) o[k] = e; } return o; }
    return value;
  };
  const loop = /(?:_loop|_lp)(?:_|\d|\.)/i;
  for (const s of batch.skins) {
    const suffix = s.skinId.split('@')[1], code = s.charId.replace(/^char_\d+_/, '');
    const banks = raw.soundFXBanks.filter((b) => b.name.startsWith('battle.') && b.name.includes(suffix) && b.name.includes(code) && !b.name.includes('@'))
      .map((b) => ({ ...b, name: b.name.split('_' + suffix).join('').split('.' + suffix).join('') }));
    if (!banks.length) continue;
    const skills = [...new Map((recordsByChar[s.charId] || []).flatMap((c) => c.skills || [c.skill]).filter(Boolean).map((k) => [k.index, k])).values()];
    const { unit } = unitCombatSounds(indexAudio({ soundFXBanks: banks }), s.charId, skills, {});
    for (const [k, v] of Object.entries(unit.skills || {})) if (v == null || (typeof v === 'string' && loop.test(v))) delete unit.skills[k];
    for (const [slot, roles] of Object.entries(unit.skillCombat || {})) { for (const role of ['attack', 'hit']) if (typeof roles[role] === 'string' && loop.test(roles[role])) delete roles[role]; if (!roles.attack && !roles.hit) delete unit.skillCombat[slot]; }
    const patch = await encode(unit);
    if (!Object.keys(patch).length) continue;
    sfx.units[s.skinId] = { baseCharId: s.charId, ...patch };
    for (const key of [s.skinId, s.mount]) sfx.aliases[key] = s.skinId;
  }
  const out = { tag, groups, files: [...files.values()], sfx, counts: { prefabs, costumes, files: files.size, sfxCostumes: Object.keys(sfx.units).length } };
  await writeFile(resolve(repo, `metadata/skin-fx-${tag}.json`), JSON.stringify(out) + '\n');
  console.log('fx staged', out.counts);
}

async function connectFx(repo, tag, commit) {
  if (!/^[0-9a-f]{40}$/.test(commit)) throw Error('COMMIT must be the full resource repository commit');
  const { buildSkinSfx } = await import('./build-skin-sfx.mjs');
  const meta = await read(resolve(repo, `metadata/skin-fx-${tag}.json`));
  const resPath = resolve(root, 'content/production/resources.json'), res = await read(resPath);
  const rows = new Map(res.files.map((f) => [f.path, f]));
  const base = 'moring-m/Stronghold-Protocol_Ko_Arca_assets';
  // no `local`: tools/resource-origin.mjs rewrites a local row to the configured origin commit, which predates this batch
  for (const f of meta.files) rows.set(f.path, { path: f.path, sources: [
    `https://raw.githubusercontent.com/${base}/${commit}/public${f.path}`, `https://cdn.jsdelivr.net/gh/${base}@${commit}/public${f.path}`], sha256: f.sha256, bytes: f.bytes });
  res.files = [...rows.values()];
  res.version = createHash('sha256').update(JSON.stringify(res.files)).digest('hex').slice(0, 20);
  await writeFile(resPath, JSON.stringify(res) + '\n');
  const localPath = resolve(root, 'content/production/data/local-fx.json'), local = await read(localPath);
  for (const [group, entries] of Object.entries(meta.groups)) for (const [k, v] of Object.entries(entries)) (local.groups[group] ??= {})[k] ??= v;
  await writeFile(localPath, JSON.stringify(local));
  const sfxPath = resolve(root, 'content/custom/audio/skin-sfx.json'), sfx = await read(sfxPath);
  Object.assign(sfx.units, meta.sfx.units); Object.assign(sfx.aliases, meta.sfx.aliases);
  const files = new Map((sfx.files || []).map((f) => [f.path, f]));
  for (const f of meta.files) if (f.path.startsWith('/assets/local/audio/sfx/')) files.set(f.path, rows.get(f.path));
  sfx.files = [...files.values()];
  await writeFile(sfxPath, JSON.stringify(sfx, null, 2) + '\n');
  await buildSkinSfx(root, resolve(root, 'content/production/data'));
  console.log('fx connected', meta.counts, 'catalogue', res.version);
}

const [cmd, ...args] = process.argv.slice(2);
if (cmd === 'stage') await stage(...args.map((a, i) => (i < 3 ? resolve(a) : a)));
else if (cmd === 'connect') await connect(resolve(args[0]), args[1], args[2]);
else if (cmd === 'fx') await fx(resolve(args[0]), resolve(args[1]), args[2]);
else if (cmd === 'connect-fx') await connectFx(resolve(args[0]), args[1], args[2]);
else throw Error('usage: stage RECOVERY MODELS ASSETS_REPO TAG | connect ASSETS_REPO TAG COMMIT | fx RECOVERY ASSETS_REPO TAG | connect-fx ASSETS_REPO TAG COMMIT');
