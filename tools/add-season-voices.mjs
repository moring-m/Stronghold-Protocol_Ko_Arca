// Battle voices for operators of another season's chess data that the fork's manifest lacks (same slots, languages
// and pinned sources as tools/build-battle-voices.mjs). Adds audio.voice / voiceAvailability / voiceConditions entries
// to content/production/data/assets.json (the fork's voice format) and the files to content/production/resources.json.
// Never changes an operator that already has voices. Usage: node tools/add-season-voices.mjs data/versions/<slug>/chess.json
import { readFile, writeFile } from 'node:fs/promises';
import { indexVoice, VOICE_BATTLE_SLOTS, VOICE_DIRS } from './assets/audio.mjs';
import { RAW } from './assets/sources.mjs';
import { voiceLanguageFor } from './assets/voiceAvailability.mjs';
const table = JSON.parse(await readFile('.cache/gamedata/excel/charword_table.json', 'utf8'));
const records = JSON.parse(await readFile(process.argv[2], 'utf8'));
const prod = JSON.parse(await readFile('content/production/data/assets.json', 'utf8'));
const have = prod.audio.voice;
const ids = [...new Set(Object.values(records).map((c) => c.charId).filter((id) => id && !have.kr[id] && !have.jp[id]))];
const index = indexVoice(table, 'CN', VOICE_BATTLE_SLOTS);
const add = { voice: { kr: {}, jp: {} }, availability: {}, conditions: {} }, files = new Map(), none = [];
for (const id of ids) {
  const slots = index.get(id); if (!slots) { none.push(id); continue; }
  const metadataKR = !!table.voiceLangDict?.[id]?.dict?.KR;
  for (const lang of ['kr', 'jp']) {
    let kr = 0, jp = 0;
    add.voice[lang][id] = Object.fromEntries(Object.entries(slots).map(([slot, lines]) => [slot, lines.map((asset) => {
      const actual = voiceLanguageFor(lang, asset, { krFiles: null, metadataKR });
      if (actual === 'kr') kr++; else jp++;
      const sub = `${VOICE_DIRS[actual]}/${asset.toLowerCase()}.mp3`, path = `/assets/audio/voice/${sub}`;
      files.set(path, { path, sources: [RAW.aa2voice + sub] }); return path;
    })]));
    if (lang === 'kr') add.availability[id] = { krLines: kr, jpFallback: jp };
  }
  add.conditions[id] = Object.fromEntries(Object.values(records).filter((c) => c.charId === id)
    .flatMap((c) => (c.skills || [c.skill]).filter(Boolean).map((sk) => [sk.index, { passive: sk.skillType !== 'MANUAL', spCost: sk.spCost }])));
}
// sizes (a file the pinned source lacks is left out, and so is its line)
const ok = new Map();
await Promise.all([...files.values()].map(async (f) => { try { const r = await fetch(f.sources[0], { method: 'HEAD' }); if (r.ok) ok.set(f.path, { ...f, bytes: Number(r.headers.get('content-length')) || 0 }); } catch {} }));
for (const lang of ['kr', 'jp']) for (const v of Object.values(add.voice[lang])) for (const k of Object.keys(v)) { v[k] = v[k].filter((p) => ok.has(p)); if (!v[k].length) delete v[k]; }
for (const file of ['content/production/data/assets.json']) {
  const raw = await readFile(file, 'utf8'); const a = JSON.parse(raw);
  for (const lang of ['kr', 'jp']) for (const [id, v] of Object.entries(add.voice[lang])) if (Object.keys(v).length && !a.audio.voice[lang][id]) a.audio.voice[lang][id] = v;
  for (const [id, v] of Object.entries(add.availability)) a.audio.voiceAvailability[id] ??= v;
  for (const [id, v] of Object.entries(add.conditions)) a.audio.voiceConditions[id] ??= v;
  await writeFile(file, JSON.stringify(a, null, raw.includes('\n  ') ? 2 : raw.includes('\n ') ? 1 : 0) + (raw.endsWith('\n') ? '\n' : ''));
}
const res = JSON.parse(await readFile('content/production/resources.json', 'utf8'));
const known = new Set(res.files.map((f) => f.path)); const neu = [...ok.values()].filter((f) => !known.has(f.path));
res.files.push(...neu); res.files.sort((a, b) => (a.path < b.path ? -1 : 1));
const bytes = neu.reduce((s, f) => s + f.bytes, 0); res.estimatedBytes += bytes; if (res.estimatedStorageBytes) res.estimatedStorageBytes += bytes;
await writeFile('content/production/resources.json', JSON.stringify(res) + '\n');
console.log(`operators ${ids.length} (no voice table: ${none.join(',') || '-'}), files ${neu.length}/${files.size}`);
