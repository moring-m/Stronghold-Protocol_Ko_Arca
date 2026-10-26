// Add freshly extracted effects to the resource repository's additive FX supplement (never replacing a key or a file).
//
//   node tools/add-fx-supplement.mjs EXTRACT_FX_DIR LOCAL_FX_JSON ASSET_REPO [--keys k1,k2] [--units u1,u2]
//
// EXTRACT_FX_DIR is an `extract.py --only fx` / fx.export_fx output (index.json, textures.json, prefabs/, tex/, mesh/),
// LOCAL_FX_JSON its file list. The prefabs named by --keys (default: every prefab of the extract), the units named by
// --units (their skins / skills / projectiles / costumes too), and everything they reference that the game's base
// (content/production/data/local-fx.json, the repository's metadata/costume-supplement.json) does not hold yet are
// copied under ASSET_REPO/public/assets/local/fx and listed in metadata/costume-supplement.json and inventory.json —
// tools/install-hosted-resources.mjs merges them at build time (tools/fx-supplement.mjs installSupplement).
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = async (p) => JSON.parse(await readFile(p, 'utf8'));
const sha = (b) => createHash('sha256').update(b).digest('hex');
const lc = (s) => String(s).toLowerCase();

export async function addSupplement(extractDir, localFxPath, repo, { keys = null, units = [] } = {}) {
  const idx = await read(resolve(extractDir, 'index.json')), tex = (await read(resolve(extractDir, 'textures.json'))).textures;
  const im = (await read(localFxPath)).groups, base = (await read(resolve(ROOT, 'content/production/data/local-fx.json'))).groups;
  const supPath = resolve(repo, 'metadata/costume-supplement.json'), invPath = resolve(repo, 'inventory.json');
  const sup = await read(supPath), inv = await read(invPath);
  const known = (group, key) => !!(base[group]?.[key] || sup.groups?.[group]?.[key]);
  const added = { prefabs: [], textures: 0, meshes: 0, units: [], files: 0, bytes: 0 };
  // units first: their records name the prefabs they need
  const wanted = new Set((keys || (units.length ? [] : Object.keys(idx.prefabs))).map(lc));
  for (const id of units) {
    const u = idx.units?.[id];
    if (!u) throw Error('No such unit in the extract: ' + id);
    (sup.units ??= {})[id] = u; added.units.push(id);
    if (u.skin && idx.skins?.[u.skin]) (sup.skins ??= {})[u.skin] = idx.skins[u.skin];
    for (const s of Object.keys(u.skills || {})) if (idx.skills?.[s]) (sup.skills ??= {})[s] = idx.skills[s];
    for (const k of u.refs || []) wanted.add(lc(k));
    for (const p of u.projectiles || []) { const name = typeof p === 'string' ? p : p?.key || p?.name; if (idx.projectiles?.[name]) (sup.projectiles ??= {})[name] = idx.projectiles[name]; }
  }
  const prefabs = new Map(Object.entries(idx.prefabs).map(([k, v]) => [lc(k), [k, v]]));
  const files = new Map(sup.files.map((f) => [f.path, f])), rows = new Map(inv.inventory.map((f) => [f.path, f]));
  async function file(path) {
    if (files.has(path)) return;
    const rel = path.slice('/assets/local/fx/'.length), from = resolve(extractDir, rel), to = resolve(repo, 'public' + path);
    const bytes = await readFile(from);
    let prior = null; try { prior = await readFile(to); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    if (prior && sha(prior) !== sha(bytes)) throw Error('Refusing to replace a different payload: ' + path);
    if (!prior) { await mkdir(dirname(to), { recursive: true }); await copyFile(from, to); added.files++; added.bytes += bytes.length; }
    const row = { path, bytes: bytes.length, sha256: sha(bytes) };
    files.set(path, row); rows.set(path, row);
  }
  const done = new Set(), todo = [...wanted];
  while (todo.length) {
    const key = todo.pop();
    if (done.has(key)) continue;
    done.add(key);
    const hit = prefabs.get(key);
    if (!hit) { if (!known('fx/prefabs', key)) throw Error('Prefab not in the extract: ' + key); continue; }
    const [name, entry] = hit, desc = await read(resolve(extractDir, entry.file));
    for (const r of desc.refs || []) todo.push(lc(r));
    if (!known('fx/prefabs', name)) {
      sup.prefabs[name] = entry; sup.groups['fx/prefabs'][name] = im['fx/prefabs'][name]; added.prefabs.push(name);
      await file(im['fx/prefabs'][name].path);
    }
    for (const t of desc.textures || []) if (!known('fx/tex', t)) {
      if (!im['fx/tex']?.[t] || !tex[t]) throw Error('Texture not in the extract: ' + t);
      sup.textures[t] = tex[t]; sup.groups['fx/tex'][t] = im['fx/tex'][t]; added.textures++;
      for (const p of [im['fx/tex'][t].path, im['fx/tex'][t].half]) if (p) await file(p);
    }
    for (const m of desc.meshes || []) if (!m.startsWith('builtin:') && !known('fx/mesh', m)) {
      if (!im['fx/mesh']?.[m]) throw Error('Mesh not in the extract: ' + m);
      sup.groups['fx/mesh'][m] = im['fx/mesh'][m]; added.meshes++;
      await file(im['fx/mesh'][m].path);
    }
  }
  sup.files = [...files.values()];
  inv.inventory = [...rows.values()]; inv.files = rows.size; inv.bytes = inv.inventory.reduce((n, f) => n + f.bytes, 0);
  await writeFile(supPath, JSON.stringify(sup));
  await writeFile(invPath, JSON.stringify(inv, null, 2) + '\n');
  return added;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [extractDir, localFx, repo, ...rest] = process.argv.slice(2);
  const opt = (name) => { const i = rest.indexOf(name); return i >= 0 ? rest[i + 1].split(',').filter(Boolean) : null; };
  if (!repo) throw Error('Usage: add-fx-supplement.mjs EXTRACT_FX_DIR LOCAL_FX_JSON ASSET_REPO [--keys k1,k2] [--units u1,u2]');
  const r = await addSupplement(resolve(extractDir), resolve(localFx), resolve(repo), { keys: opt('--keys'), units: opt('--units') || [] });
  console.log(JSON.stringify({ ...r, prefabs: r.prefabs.length }));
}
