export const ENEMY_SKILL_ROLES = {"enemy_1511_mdrock":{"skill":{"begin":null,"loop":"Skill_2","end":null,"index":0,"idle":null},"skills":{"0":{"begin":null,"loop":"Skill_2","end":null,"index":0,"idle":null},"1":{"begin":null,"loop":"Skill_1","end":null,"index":1,"idle":null}}},"enemy_1517_xi":{"skill":{"begin":null,"loop":"Skill_01_02","end":null,"index":0,"idle":null},"skills":{"0":{"begin":null,"loop":"Skill_01_02","end":null,"index":0,"idle":null},"1":{"begin":"Skill_02_Begin","loop":"Skill_02_Loop","end":"Skill_02_End","index":1,"idle":null},"2":{"begin":"Skill_02_Begin","loop":"Skill_02_Loop","end":"Skill_02_End","index":2,"idle":null}}},"enemy_9014_acstma":{"skill":{"begin":null,"loop":"Launch_Begin","end":null,"index":0,"idle":null},"skills":{"0":{"begin":null,"loop":"Launch_Begin","end":null,"index":0,"idle":null},"1":{"begin":null,"loop":"Back_End","end":null,"index":1,"idle":null}}},"enemy_9015_acstmb":{"skill":{"begin":null,"loop":"Launch_Begin","end":null,"index":0,"idle":null},"skills":{"0":{"begin":null,"loop":"Launch_Begin","end":null,"index":0,"idle":null},"1":{"begin":null,"loop":"Back_End","end":null,"index":1,"idle":null}}},"enemy_1525_blkswb":{"skill":{"begin":null,"loop":"A_Attack","end":null,"via":"attack","index":0,"idle":null},"skills":{"0":{"begin":null,"loop":"A_Skill2","end":null,"index":0,"idle":null},"1":{"begin":null,"loop":"A_Attack","end":null,"index":1,"idle":null,"via":"attack"},"2":{"begin":null,"loop":"B_Skill2","end":null,"index":2,"idle":null},"3":{"begin":null,"loop":"B_Attack","end":null,"index":3,"idle":null,"via":"attack"}}},"enemy_1516_jakill":{"skill":{"begin":null,"loop":"C1_Attack","end":null,"via":"attack","index":0,"idle":null},"skills":{"0":{"begin":null,"loop":"C1_Skill","end":null,"index":0,"idle":null,"strike":true},"1":{"begin":null,"loop":"C2_Skill","end":null,"index":1,"idle":null,"strike":true}}},"enemy_9019_actrpb":{"skill":{"begin":null,"loop":"Attack","end":null,"via":"attack","index":0,"idle":null},"skills":{"0":{"begin":null,"loop":"Skill_b","end":null,"index":0,"idle":null,"strike":true}}},"enemy_9020_actrpc":{"skill":{"begin":null,"loop":"Attack","end":null,"via":"attack","index":0,"idle":null},"skills":{"0":{"begin":null,"loop":"Skill_c","end":null,"index":0,"idle":null,"strike":true}}},"enemy_9013_acstmk":{"skill":{"begin":null,"loop":"Skill_1","end":null,"index":0,"idle":null},"skills":{"0":{"begin":null,"loop":"Skill_1","end":null,"index":0,"idle":null},"1":{"begin":null,"loop":"Skill_3","end":null,"index":1,"idle":null},"2":{"begin":null,"loop":"Revive","end":null,"index":2,"idle":null}}},"enemy_9013_acstmk_2":{"skill":{"begin":null,"loop":"Skill_1","end":null,"index":0,"idle":null},"skills":{"0":{"begin":null,"loop":"Skill_1","end":null,"index":0,"idle":null},"1":{"begin":null,"loop":"Skill_3","end":null,"index":1,"idle":null},"2":{"begin":null,"loop":"Revive","end":null,"index":2,"idle":null}}},"enemy_9032_aclionk":{"skill":{"begin":null,"loop":"Skill_1","end":null,"index":0,"idle":null},"skills":{"0":{"begin":null,"loop":"Skill_1","end":null,"index":0,"idle":null},"1":{"begin":null,"loop":"Skill_2","end":null,"index":1,"idle":null},"2":{"begin":null,"loop":"Skill_2","end":null,"index":2,"idle":null},"3":{"begin":null,"loop":"Skill_1","end":null,"index":3,"idle":null},"4":{"begin":null,"loop":"Skill_3","end":null,"index":4,"idle":null}}}};
import {quintusRoles} from '../../shared/quintus.js';
// Spine model pipeline: download skel/atlas/page PNGs, fetch extra atlas pages,
// normalize atlases (size:/pma:), parse skeletons and resolve animation roles.
// Produces the per-model `spine` entries of data/assets.json.
//
// Enemy models that no dump carries but the local client has (tools/local-extract/
// extract.py ENEMY_SPINES → public/assets/local/spine/enemy/<id>/, optional and
// git-ignored) are an overlay, never the manifest's `spine`: their metadata lives
// in the committed tools/assets/local-enemy-spines.json (loadLocalEnemySpines),
// refreshed from the extracted files by `fetch-assets --local-spines`
// (findLocalEnemyModels + localEnemySpineMeta, read only), so data/assets.json
// is the same with or without the extraction (ASSETS.md "Enemy aliases").

import { readFile, readdir, writeFile, stat, rename, mkdir, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { assetUrl, safeName, urlDir } from './sources.mjs';
import { kindOf, pngSize } from './formats.mjs';
import { atlasInfo, normalizeAtlas } from './atlas.mjs';
import { parseSkel } from './skel.mjs';
import { resolveRoles } from './anim-roles.mjs';

async function fileStat(p) { try { const s = await stat(p); return s.isFile() ? s : null; } catch { return null; } }

/** Where tools/local-extract/extract.py writes enemy Spine models, under public/assets. */
export const LOCAL_ENEMY_SPINE_DIR = 'local/spine/enemy/';
/** Its data/local-assets.json group of an enemy (`spine/enemy/<id>`; the client resolves the file names through it). */
export const localEnemySpineGroup = (id) => `spine/enemy/${id}`;

/**
 * Enemy Spine models extracted from the local client (tools/local-extract/extract.py ENEMY_SPINES): every
 * `local/spine/enemy/<enemyId>/` holding a skeleton, the atlas of the same stem and at least one page PNG.
 * @param {string} root absolute public/assets directory
 * @returns {Promise<Record<string, { dir: string, skel: string, atlas: string, pngs: string[] }>>} paths relative to root
 */
export async function findLocalEnemyModels(root) {
  const out = {};
  let ids = [];
  try { ids = (await readdir(join(root, LOCAL_ENEMY_SPINE_DIR), { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name); } catch { return out; }
  for (const id of ids.sort()) {
    if (!/^enemy_\d+_[a-z0-9_]+$/i.test(id)) continue;
    const dir = `${LOCAL_ENEMY_SPINE_DIR}${id}/`;
    let files = [];
    try { files = (await readdir(join(root, dir))).sort(); } catch { continue; }
    const skel = files.find((f) => f.endsWith('.skel'));
    const stem = skel ? skel.slice(0, -'.skel'.length) : null;
    const pngs = files.filter((f) => f.endsWith('.png'));
    if (!stem || !files.includes(`${stem}.atlas`) || !pngs.length) continue;
    out[id] = { dir, skel: dir + skel, atlas: `${dir}${stem}.atlas`, pngs: pngs.map((f) => dir + f) };
  }
  return out;
}

/**
 * @typedef {{ skel: string, atlas: string, textures: string[], pma: boolean, anims: any, animations: Record<string, number>,
 *   events: string[], hits: Record<string, number[]>, bounds: any }} LocalSpineMeta file names relative to the model's
 *   data/local-assets.json group (localEnemySpineGroup), the rest as a manifest SpineEntry
 */

/**
<<<<<<< ours
 * Spine metadata of the extracted enemy models (findLocalEnemyModels), parsed like processModels does — but read only:
 * the atlas is sized / pma-normalized in memory (extract.py already writes it so), nothing on disk changes.
=======
 * Role fixes of web models (enemies from their official battle prefabs; operators by character id) for skeletons whose clip
 * names mislead the resolver (by name): model id → roles replacing the resolved ones (the others are kept); processModels applies them, so
 * data/assets.json carries them. A fix naming a clip the skeleton lacks is dropped and reported. Source: the prefab's
 * animation table (its Graphic component: anim key → clip) and the clip its Spine starts on, read from the local client's
 * battle/enm_pfb_*.ab (tools/local-extract, UnityPy).
 * - 普通囚犯 / 老练囚犯 (enemy_1116_liprr / _2, 孤岛风云 prisoners): three clip sets whose collar light is red (Idle, Move …),
 *   blinking orange (Idle2 …) and grey (Idle3 …). The prefab maps its keys Idle / Move / Attack / Die to the grey *3 set
 *   and starts on Default3 — mode Default, 【禁锢】 —, the orange *2 set is its mode R (the warning before the last
 *   confined attack) and the red unnumbered set its mode L, 【解放】. The resolver took the unnumbered set, so they came out
 *   of the gate already freed (community report of 2026-10-06). The other prisoners' names already resolve to their grey
 *   set (强壮囚犯's Idle is its grey one; 拳师囚犯 / 重犯 / 传奇重犯 *_grey); every prisoner's later sets are the render/units.js
 *   FORMS 'warning' / 'liberty' the sim switches to (content/enemies/archetypes.js prisoner).
 */
/**
 * 宴 (char_337_utage): her skeleton has one unnumbered skill set, Skill_Start / Skill_Loop / Skill_End — she sits down and
 * rests: S1 分神's pose (停止攻击，防御力提升，每秒恢复生命). Her other skill, index 1 (S2, the 卫戍 default 落地斩·破门, an ATK
 * buff for its first seconds after every deployment), attacks with her ordinary clips. The resolver (by name) gave both
 * indices the unnumbered set, so she knelt through the opening seconds of every battle (the owner's playtest of
 * 2026-10-07). [ASSUMED: by the clips' pose and S1's text; the prefab's skill table was not read]
 */
const UTAGE_S1 = Object.freeze({ begin: 'Skill_Start', loop: 'Skill_Loop', end: 'Skill_End', index: 0, idle: null });
const UTAGE_S2 = Object.freeze({ ...clipOf('Attack', 'attack'), index: 1, idle: null });
/**
 * An enemy's skill slots (`anims.skills`: the slot = the skill's index in data/enemies.json `skills[]`, what a sim
 * ['cast', id, slot] event names) → the clip of that skill's official ability: the prefab's EnemySkill ability
 * `_animKey` (fx/index.json `units.<key>.skills.<prefabKey>.abilities[].animKey`, read from the same battle prefab). The
 * resolver pairs the numbered clips with the slots by name (Skill_n = slot n−1), which these prefabs do not follow.
 */
const slotClips = (clips) => Object.freeze(Object.fromEntries(clips.map((loop, index) => [index, Object.freeze({ begin: null, loop, end: null, index, idle: null })])));
// 假想敌：胄 (enm_pfb_28.ab; enemy_9013_acstmk_2 shares the model): skills "1" (灭顶之灾) Skill_1, "2" (死亡集群)
// Skill_3 — not Skill_2 —, "3" (_2 only) Revive
const HELM_SKILLS = slotClips(['Skill_1', 'Skill_3', 'Revive']);
// 盐风主教昆图斯 (enm_pfb_18.ab): Tidewater* (大潮) Skill_02, Rockfall* (崩坍) Skill_01, SummonTentac* (断裂生殖) Skill_03 in
// every form, Doom (物种爆发) Skill_04 — the slots run Tidewater, Rockfall, SummonTentac, …G1, …G2, Doom
const QUINTUS_SKILLS = slotClips(['Skill_02', 'Skill_01', 'Skill_03', 'Skill_02', 'Skill_01', 'Skill_03', 'Skill_02', 'Skill_01', 'Skill_03', 'Skill_04']);
// 阿利斯泰尔 (enm_pfb_29.ab): equip / equipA Skill_1, store / storeA Skill_2, Suicide Skill_3
const LION_SKILLS = slotClips(['Skill_1', 'Skill_2', 'Skill_2', 'Skill_1', 'Skill_3']);
/** One skill slot's clip: a clip name or `{ begin, loop, end }`; `extra` adds `via` / `strike`. */
const slotClip = (index, c, extra = null) => Object.freeze({ ...(typeof c === 'string' ? { begin: null, loop: c, end: null } : c), index, idle: null, ...extra });
const slotMap = (list) => Object.freeze(Object.fromEntries(list.map((c) => [c.index, c])));
// 泥岩 (Skills/RefreshShield, Skills/Occupy, AnimatedActionToTargetAbility): RefreshShield Skill_2, occupy Skill_1 — the
// names run the other way round (until 0.3.2 the 屏障 refresh played the 1.5 s Skill_1 for its 1.333 s Skill_2)
const MDROCK_SKILLS = slotMap([slotClip(0, 'Skill_2'), slotClip(1, 'Skill_1')]);
// “自在”: CrossAttack (纬地经天, RangedAttackWithExtraActions, both modes) Skill_01_02 — not Skill_01 —; ShieldBurst /
// ShieldBurstReborn (破桎而出, MeleeAttack) have an empty _animKey: the skeleton's one Skill_02 set for both [ASSUMED: by the
// clip names; until 0.3.2 the second form's ShieldBurstReborn, slot 2, had no clip and played the cross's Skill_01]; the
// two CrossAttackMark* slots are buffs the sim never casts
const XI_BURST = Object.freeze({ begin: 'Skill_02_Begin', loop: 'Skill_02_Loop', end: 'Skill_02_End' });
const XI_SKILLS = slotMap([slotClip(0, 'Skill_01_02'), slotClip(1, XI_BURST), slotClip(2, XI_BURST)]);
// “斩胄之剑” / “破胄之锤” (enm_pfb_28.ab, EmptyAnimatedAbility): skill "1" (掷剑 / 掷锤) Launch_Begin, "2" Back_End — not the
// name-resolved Skill clip
const HAND_SKILLS = slotMap([slotClip(0, 'Launch_Begin'), slotClip(1, 'Back_End')]);
// 锏 (Modes/Default CircleAttack A_Skill2, Modes/Reborn CircleAttack2 B_Skill2): 肆虐风雪 in each form — until 0.3.2 no clip
// (the attack role); Blink / Blink2 (速杀, ActiveBuffAbility) name no clip and keep that attack role (via 'attack': none)
const MACE_SKILLS = slotMap([slotClip(0, 'A_Skill2'), slotClip(1, 'A_Attack', { via: 'attack' }), slotClip(2, 'B_Skill2'), slotClip(3, 'B_Attack', { via: 'attack' })]);
// Attack-class skills the sim casts as one of the enemy's attacks (castSlot in a `before` hook: no skill window) — `strike`:
// that attack plays the slot's clip in place of the attack clip (render/units.js UnitView.onCast, render/spine.js
// castStrike). 杰斯顿·威廉姆斯: ironsandstorm (RangedAttack, Modes/Default) C1_Skill, armorpiercing (MultiMeleeAttack,
// Modes/R) C2_Skill; “碎铳之簧” 元素护盾 / 频次护盾: skill "1" (RangedAttack Skill_b / MultiRangedAttack Skill_c). Until 0.3.2
// every one of them swung its attack clip.
const WARDEN_SKILLS = slotMap([slotClip(0, 'C1_Skill', { strike: true }), slotClip(1, 'C2_Skill', { strike: true })]);
// 后兽 (enemy_2123_dyjsww, the tail 矩兽 summons; fx/index.json units.enemy_2123_dyjsww): the name rule pairs
// Skill_2_A with slot 1. The abilities name Blink Skill_B, SummonBranchEnemy Skill_B, Punishment Skill_A and
// GlobalDoom Skill_2_A. kitTail casts Blink, Punishment and GlobalDoom. DyjswwSwitch's animKey Translate is not a
// clip of the skeleton [ASSUMED: the body keeps Idle_A, the resolved attack, which is the idle]. Skill_2_B is
// named by no ability. 破城者 (SkyProjectile F_Skill; the attack role is F_Attack) and 神勇的帕拉杜利斯
// (rushEndNormal Skill_End, rushEndAdvance Stun_Begin) stay resolved: no kit casts those slots.
const TAIL_SKILLS = slotMap([
  slotClip(0, 'Idle_A', { via: 'attack' }),
  slotClip(1, 'Skill_B'),
  slotClip(2, 'Skill_B'),
  slotClip(3, 'Skill_A'),
  slotClip(4, 'Skill_2_A'),
]);
export const PREFAB_SPINE_ROLES = Object.freeze({
  enemy_1116_liprr: PRISONER_GREY_3,
  enemy_1116_liprr_2: PRISONER_GREY_3,
  enemy_9013_acstmk: { skills: HELM_SKILLS },
  enemy_1521_dslily: { skill: QUINTUS_SKILLS[0], skills: QUINTUS_SKILLS },
  enemy_9032_aclionk: { skills: LION_SKILLS },
  enemy_1511_mdrock: { skill: MDROCK_SKILLS[0], skills: MDROCK_SKILLS },
  enemy_1517_xi: { skill: XI_SKILLS[0], skills: XI_SKILLS },
  enemy_9014_acstma: { skill: HAND_SKILLS[0], skills: HAND_SKILLS },
  enemy_9015_acstmb: { skill: HAND_SKILLS[0], skills: HAND_SKILLS },
  enemy_1525_blkswb: { skills: MACE_SKILLS },
  enemy_1516_jakill: { skills: WARDEN_SKILLS },
  enemy_9019_actrpb: { skills: slotMap([slotClip(0, 'Skill_b', { strike: true })]) },
  enemy_9020_actrpc: { skills: slotMap([slotClip(0, 'Skill_c', { strike: true })]) },
  enemy_2123_dyjsww: { skill: TAIL_SKILLS[0], skills: TAIL_SKILLS },
  // operators by character id: both the front and the back model
  char_337_utage: { skill: UTAGE_S2, skills: { 0: UTAGE_S1, 1: UTAGE_S2 } },
});

/**
 * `roles` with the fix of LOCAL_SPINE_ROLES / PREFAB_SPINE_ROLES applied: each fixed role whose clips all exist in `durations` replaces the
 * resolved one; `missing` lists the roles left as resolved because a clip is missing.
 * @param {any} roles resolveRoles output
 * @param {Record<string, any>|undefined} fix
 * @param {Record<string, number>} durations the skeleton's clips
 * @returns {{ roles: any, missing: string[] }}
 */
export function applyRoleFix(roles, fix, durations) {
  if (!fix) return { roles, missing: [] };
  const out = { ...roles };
  const missing = [];
  const has = (n) => n == null || Object.hasOwn(durations || {}, n);
  const clipOk = (c) => !!c && typeof c === 'object' && [c.begin, c.loop, c.end, c.idle].every(has);
  for (const [role, v] of Object.entries(fix)) {
    // a clip name, a clip, null (no such role) — or for `skills` a map slot → clip, every slot's clips checked
    const ok = typeof v === 'string' ? has(v) : v == null ? true : role === 'skills' ? Object.values(v).every(clipOk) : clipOk(v);
    if (ok) out[role] = v;
    else missing.push(role);
  }
  return { roles: out, missing };
}

/**
 * Spine metadata of extracted models (findLocalEnemyModels / findLocalTokenModels), parsed like processModels does — but
 * read only: the atlas is sized in memory (extract.py already writes it so) and its `pma` line is read as it is
 * (a straight-page extraction writes none), nothing on disk changes.
 * Roles are resolved for skill index 0 (an enemy also for its numbered skill clips), like the web enemy and token models,
 * then LOCAL_SPINE_ROLES applied.
>>>>>>> theirs
 * @param {string} root absolute public/assets directory
 * @param {Record<string, { dir: string, skel: string, atlas: string, pngs: string[] }>} found
 * @returns {Promise<{ meta: Record<string, LocalSpineMeta>, problems: string[] }>}
 */
export async function localEnemySpineMeta(root, found) {
  const meta = {};
  const problems = [];
  const base = (rel) => rel.slice(rel.lastIndexOf('/') + 1);
  for (const id of Object.keys(found || {}).sort()) {
    const m = found[id];
    try {
      const text = await readFile(join(root, m.atlas), 'utf8');
      const sizes = new Map();
      for (const page of atlasInfo(text).pages) {
        const sz = pngSize(await readFile(join(root, m.dir + page)));
        if (!sz) throw new Error(`invalid page ${page}`);
        sizes.set(page, sz);
      }
      const norm = normalizeAtlas(text, { pageSize: (p) => sizes.get(p) || null, pma: true });
      if (norm.missingSize.length) throw new Error(`cannot size pages ${norm.missingSize.join(',')}`);
      const info = atlasInfo(norm.text);
      if (!info.pages.length) throw new Error('atlas without pages');
      const sk = parseSkel(await readFile(join(root, m.skel)), info.regions);
      if (!sk.animations.length) throw new Error('skeleton has no animations');
      if (sk.missingRegions?.length) problems.push(`${id}: ${sk.missingRegions.length} attachment(s) not in atlas (e.g. ${sk.missingRegions[0]})`);
      meta[id] = {
        skel: base(m.skel), atlas: base(m.atlas), textures: info.pages, pma: true,
        anims: resolveRoles(sk.animations, { skillIndices: [0], durations: sk.durations }),
        animations: sk.durations, events: sk.events, hits: sk.hits, bounds: sk.bounds,
      };
    } catch (e) {
      problems.push(`${id}: ${e.message}`);
    }
  }
  return { meta, problems };
}

/** Committed metadata of the local-client enemy models: tools/assets/local-enemy-spines.json. */
export const LOCAL_ENEMY_SPINES_FILE = 'tools/assets/local-enemy-spines.json';

/**
 * The `models` of tools/assets/local-enemy-spines.json (enemyId → LocalSpineMeta); {} when the file is missing or bad.
 * @param {string} path absolute path of the file
 * @returns {Promise<Record<string, LocalSpineMeta>>}
 */
export async function loadLocalEnemySpines(path) {
  try {
    const j = JSON.parse(await readFile(path, 'utf8'));
    return j && typeof j.models === 'object' && j.models && !Array.isArray(j.models) ? j.models : {};
  } catch { return {}; }
}

/**
 * @typedef {{ skel: string, atlas: string, textures: string[], pma: boolean, anims: any,
 *   animations: Record<string, number>, events: string[], hits: Record<string, number[]>, bounds: any }} SpineEntry
 */

/**
 * Run the whole Spine pipeline for every planned model.
 * @param {Map<string, any>} models plan.models
 * @param {object} o
 * @param {string} o.root absolute public/assets directory
 * @param {import('./downloader.mjs').Downloader} o.dl
 * @param {string} o.cachePath parse cache JSON path
 * @param {boolean} [o.download] false = only post-process what is on disk
 * @param {(m:string)=>void} [o.log]
 * @returns {Promise<{ entries: Map<string, SpineEntry>, problems: string[] }>}
 */
export async function processModels(models, { root, dl, cachePath, download = true, log = console.log }) {
  const problems = [];
  const list = [...models.values()];
  const available = (rel) => !dl?.verifier || dl.accepted.has(rel);
  if (download) {
    const jobs = [];
    for (const m of list) jobs.push(m.skel, m.atlas, ...m.pngs);
    await dl.run(jobs, 'spine');
    // Atlases may reference more pages than the index lists.
    const extra = [];
    for (const m of list) {
      if (!available(m.atlas.rel)) continue;
      const text = await readFile(join(root, m.atlas.rel), 'utf8').catch(() => null);
      if (!text) continue;
      for (const page of atlasInfo(text).pages) {
        const rel = m.dir + safeName(page);
        if (!m.pngs.some((p) => p.rel === rel)) {
          // Same folder as the atlas actually came from (ledger), then the planned folders.
          const got = dl.ledger.files[m.atlas.rel]?.url;
          const dirs = [...new Set([got ? urlDir(got) : null, m.baseUrl, ...m.atlas.urls.map(urlDir)].filter(Boolean))];
          const a = { rel, urls: dirs.map((d) => d + encodeURIComponent(page)), kind: kindOf(page) };
          m.pngs.push(a);
          extra.push(a);
        }
      }
    }
    if (extra.length) await dl.run(extra, 'spine pages');
  }

  let cache = {};
  try { cache = JSON.parse(await readFile(cachePath, 'utf8')) || {}; } catch { cache = {}; }
  const nextCache = {};
  const entries = new Map();
  let parsed = 0; let cached = 0;
  let ledgerDirty = false;
  const t0 = Date.now();
  for (const m of list) {
    if (!available(m.skel.rel) || !available(m.atlas.rel)) {
      problems.push(`${m.key}: unverified skel or atlas`);
      continue;
    }
    const skelAbs = join(root, m.skel.rel);
    const atlasAbs = join(root, m.atlas.rel);
    const skelSt = await fileStat(skelAbs);
    const atlasText = await readFile(atlasAbs, 'utf8').catch(() => null);
    if (!skelSt || !atlasText) { problems.push(`${m.key}: missing ${!skelSt ? 'skel' : 'atlas'}`); continue; }
    // Normalize the atlas against the real page sizes.
    const info0 = atlasInfo(atlasText);
    const sizes = new Map();
    let pagesOk = info0.pages.length > 0;
    for (const page of info0.pages) {
      if (!available(m.dir + safeName(page))) {
        pagesOk = false; problems.push(`${m.key}: unverified page ${page}`); continue;
      }
      const buf = await readFile(join(root, m.dir + safeName(page))).catch(() => null);
      const sz = buf ? pngSize(buf) : null;
      if (!sz) { pagesOk = false; problems.push(`${m.key}: missing/invalid page ${page}`); continue; }
      sizes.set(page, sz);
    }
    if (!pagesOk) continue;
    const norm = normalizeAtlas(atlasText, { pageSize: (p) => sizes.get(p) || null, pma: !!m.pma, renamePage: (p) => safeName(p) });
    if (norm.missingSize.length) { problems.push(`${m.key}: cannot size pages ${norm.missingSize.join(',')}`); continue; }
    if (norm.changed) {
      await writeFile(atlasAbs + '.tmp', norm.text);
      await rename(atlasAbs + '.tmp', atlasAbs);
    }
    const atlasSt = await fileStat(atlasAbs);
    const info = atlasInfo(norm.text);
    // Parse the skeleton (cached by file size + mtime).
    const ck = `${m.skel.rel}|${skelSt.size}|${Math.floor(skelSt.mtimeMs)}|${atlasSt?.size}|${Math.floor(atlasSt?.mtimeMs ?? 0)}`;
    let sk = cache[m.skel.rel]?.key === ck ? cache[m.skel.rel].info : null;
    if (sk) cached++;
    else {
      try {
        sk = parseSkel(await readFile(skelAbs), info.regions);
        parsed++;
      } catch (e) {
        // A corrupt skeleton would otherwise be kept forever (its size matches the ledger):
        // delete it and forget it so the next online run downloads it again.
        problems.push(`${m.key}: skel parse failed (${e.message}); deleted, re-run to re-download`);
        try { await unlink(skelAbs); } catch { /* ignore */ }
        if (dl?.ledger?.files) delete dl.ledger.files[m.skel.rel];
        ledgerDirty = true;
        continue;
      }
    }
    nextCache[m.skel.rel] = { key: ck, info: sk };
    if (sk.missingRegions?.length) problems.push(`${m.key}: ${sk.missingRegions.length} attachment(s) not in atlas (e.g. ${sk.missingRegions[0]})`);
    if (!sk.animations.length) { problems.push(`${m.key}: skeleton has no animations`); continue; }
    let anims = resolveRoles(sk.animations, { skillIndices: m.skillIndices, numberedSkills: String(m.key).startsWith('enemy_'), durations: sk.durations });
    if(ENEMY_SKILL_ROLES[m.key])anims=applyRoleFix(anims,ENEMY_SKILL_ROLES[m.key],sk.durations).roles;
    if(m.key==='enemy_1521_dslily')anims=quintusRoles(anims,sk.durations);
    entries.set(m.key, {
      skel: assetUrl(m.skel.rel),
      atlas: assetUrl(m.atlas.rel),
      textures: info.pages.map((p) => assetUrl(m.dir + p)),
      pma: !!m.pma,
      anims,
      animations: sk.durations,
      events: sk.events,
      hits: sk.hits,
      bounds: sk.bounds,
    });
    if (Date.now() - t0 > 0 && (parsed + cached) % 100 === 0) log(`[spine] processed ${parsed + cached}/${list.length}`);
  }
  // A failed model is still planned. Keep its directory, including old extra
  // pages, without reading a rejected atlas to rediscover those dependencies.
  if (dl?.verifier) for (const m of list) {
    if (entries.has(m.key)) continue;
    for (const file of await readdir(join(root, m.dir), { withFileTypes: true }).catch(() => [])) {
      if (file.isFile()) dl.preserved.add(m.dir + file.name);
    }
  }
  await mkdir(dirname(cachePath), { recursive: true });
  await writeFile(cachePath, JSON.stringify(nextCache));
  if (ledgerDirty && dl?.saveLedger) { try { await dl.saveLedger(); } catch { /* next run re-validates */ } }
  log(`[spine] models ok=${entries.size}/${list.length} (parsed ${parsed}, cached ${cached})`);
  return { entries, problems };
}

export function applyRoleFix(roles, fix, durations) {
  if (!fix) return { roles, missing: [] };
  const out = { ...roles };
  const missing = [];
  const has = (n) => n == null || Object.hasOwn(durations || {}, n);
  const clipOk = (c) => !!c && typeof c === 'object' && [c.begin, c.loop, c.end, c.idle].every(has);
  for (const [role, v] of Object.entries(fix)) {
    // a clip name, a clip, null (no such role) — or for `skills` a map slot → clip, every slot's clips checked
    const ok = typeof v === 'string' ? has(v) : v == null ? true : role === 'skills' ? Object.values(v).every(clipOk) : clipOk(v);
    if (ok) out[role] = v;
    else missing.push(role);
  }
  return { roles: out, missing };
}
