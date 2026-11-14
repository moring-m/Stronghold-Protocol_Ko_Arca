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

const [cmd, ...args] = process.argv.slice(2);
if (cmd === 'stage') await stage(...args.map((a, i) => (i < 3 ? resolve(a) : a)));
else if (cmd === 'connect') await connect(resolve(args[0]), args[1], args[2]);
else throw Error('usage: stage RECOVERY MODELS ASSETS_REPO TAG | connect ASSETS_REPO TAG COMMIT');
