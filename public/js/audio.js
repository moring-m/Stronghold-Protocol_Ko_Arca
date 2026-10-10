// Audio manager (Web Audio): BGM per phase, UI SFX, per-unit battle SFX, operator battle voice. Never throws.
//
// Sources: data/assets.json → audio (docs/ASSETS.md):
//   bgm { lobby, prep, combat, combatAlts?: [ {intro?, loop}, … ], boss: { intro?, loop } },
//   bossBgm { [bossId]: { intro?, loop } },
//   voice { [charId]: { start, faceEnemy, select, place, skill1…skill4, squad, squadFirst, result*, gacha } },
//   voiceJp { [charId]: { …the same slots } } (the Japanese dub, settings 语音语言 日本語; see voiceLine),
//   sfx.ui { click, buy, sell, refresh, freeze, levelup, merge, equip, ready, timer, yourTurn, … },
//   sfx.battle { deploy, tokenDeploy, charDie, tokenDie?, enemyDie, enemyHit, heal, killCoin, … },
//   sfx.units { [charId|tokenId|enemyId]: { attack?, hit?, skill?, die?, born?, mix?: { [role]: { p?, vol? } } } }.
//
// - The AudioContext is created on the first user gesture (pointerdown/keydown/touchend), so browsers
//   never block or warn; everything requested before that is remembered (BGM) or dropped (SFX).
// - Channels: master → { bgm, sfx, voice } gains; volumes from settings (0..1) + mute. Tab hidden ⇒ suspend.
// - BGM: `intro` then `loop` (1 s crossfade); switching tracks fades out/in (0.8 s). The same loop URL
//   keeps playing through repeated updates; rest selects its own track.
// - Battle SFX from `b.ev` tuples (`handleBattleEvents`): at most MAX_VOICES concurrent unit sounds, at most
//   MAX_PER_URL overlapping copies of one sound (the official banks' maxSoundAllowed 2), a per-unit cooldown and a
//   per-URL minimum gap (SfxLimiter), so a 60-unit fight stays listenable. A `['skill', id, 1]` that arrives before its
//   unit is known is held and played once the unit is tracked (`pendingSkill`): a unit that casts inside its own deploy
//   tick emits that first cue before its `['spawn', unitInfo]`, and dropping it left the one cast silent while every
//   later one played (GitHub PR #292 by @LimitlessHPPK).
// - Impact sounds (user playtest #4 item 6): a 'dmg' plays the `hit` sound of the unit whose hostile attack ('atk' on a
//   unit of the other side) aimed at the target — once, within IMPACT_WINDOW_MS, and only for phys / arts / true damage.
//   A heal "attack" ('atk' of a healer on an ally, chain heals) never makes the healer the author of the next damage
//   on that ally (纯烬艾雅法拉's heals made every later hit on a healed ally ring her impact sound), element gauge fills
//   and DoTs play none, and a chain bounce ('chain' / 'chainHeal': its first id is the previous target) plays no attack
//   sound of that target. An operator's attack / hit sound that is a skill-mode file of its own (official names end in
//   `_n` for the normal attack, `_d` / `_h` / `_s` for its skill modes — the manifest picked 纯烬艾雅法拉's S3 impact
//   p_imp_gtshpbrnch_s as her `hit`) never plays for a normal attack (normalAttackSfx).
// - The attack sound of the RUNNING skill (`attacks`, 技能1 / 2 / 3 = `_d` / `_h` / `_s`): an operator whose every attack
//   belongs to a skill mode has no normal attack bank at all — 司霆惊蛰 (解放者: she only attacks while a skill runs) was
//   completely silent when she attacked (report 「三技能攻击没有音效」). The manifest then carries that mode's own file
//   per skill index (`attacks`, tools/assets/audio.mjs pickModeAttacks) and it plays while the skill is active, from the
//   `['skill', id, 1]` / `0` events; a unit with a normal bank too (能天使 S2 过载模式, 史尔特尔 S2) keeps that bank
//   outside the skill. Being the official file of that very skill, it is not the normalAttackSfx case above.
// - …and its impact (`hits`): a mode's swing is not always the whole difference — 赤刃明霄陈 S3's slashes swing
//   p_atk_hljdswd_s AND land p_imp_hljdswd_s, while her normal attack uses p_atk_hljdswd_n / p_imp_hljdswd_n
//   (report 「开启三技能后斩击音效应该和普通攻击不一样」). Same mechanism and the same window: the `hit` of an attack
//   aimed while the skill ran — the attacker's state travels with `lastAttacker`.
// - The official bank mix of a unit's own attack / hit / die / born sound (`mix`, tools/assets/audio.mjs bankMix; community
//   report #30): it plays with chance `p` — 猎狗pro / 深池侦察犬's attack bank is 80 % silence, so they bark on about one
//   attack in five (never replaced by the generic enemy sound) — at its base gain × `vol`, capped at 1: an official volume
//   below 1 is quieter (妖怪's 0.7), none is louder than before (unitGain).
// - Deaths/deployments follow the official per-class defaults (unitSoundClass): only operators play the
//   operator-knocked-down sound; summons use the token sounds; a summon used up by its own effect (fx `consumed`,
//   香槟炸弹) plays its impact sound instead of a death sound.
// - Buffers are fetched once and cached (LRU); failed fetch/decode ⇒ silent (logged once as a warning).
//
// `bgmKeyFor(route, pub)` picks the track for the current screen/phase (main.js calls `audio.install()`,
// which follows the store).

import { sanitizeVoiceOverrides, voiceLangFor } from './voicePrefs.js';
import { PHASE } from '../../shared/constants.js';
import { mediaUrl } from './media.js';
import { chatNotificationSound, defaultChatCooldown } from './chatNotificationSounds.js';

const MAX_VOICES = 8;
const UNIT_COOLDOWN_MS = 160;
const URL_GAP_MS = 45;
const MAX_PER_URL = 2;
/**
 * 漏怪: the original Arknights exit alarm (`sfx.battle.leak`, `battle/b_ui/b_ui_alarmenter`) runs **1.44 s**, and the
 * official bank is a one-shot: `battle.ON_ENEMY_REACHED_EXIT` carries `maxSoundAllowed: 1` with `popOldest: true` on the
 * `Battle_UI_Important` mixer, i.e. **never two at once** (a new escape replaces the one still ringing). We keep the
 * "never two at once" half and leave the rest of the cue alone: leaks closer together than the cue is long are the same
 * disaster and share one alarm, so a line that breaks costs one clear ring per 1.5 s instead of a stutter of restarts.
 * (The SFX limiter still applies on top.)
 */
const LEAK_SFX_GAP_MS = 1500;
const BUFFER_CACHE = 180;
/** Decoded-PCM budget of the buffer cache beside its entry count: a voice line decodes to 0.4–1.3 MB (see _buffer). */
const BUFFER_BYTES = 64 * 1024 * 1024;
const XFADE_S = 1;
const FADE_S = 0.8;
/** Voice: shortest gap between two lines, and the crossfade of a higher-priority line taking the channel (official 0.1 s). */
const VOICE_GAP_MS = 0;
const VOICE_XFADE_S = 0.1;
/** 'atk' projectile kinds whose first id is the previous bounce target (sim ai.js), not the attacker. */
const CHAIN_KINDS = new Set(['chain', 'chainHeal']);
/** 'dmg' types that are an attack's impact (element gauge fills / 元素伤害 carry the element's name instead). */
const IMPACT_TYPES = new Set(['phys', 'arts', 'true']);
/** A 'dmg' later than this (real ms) after the attack aimed at the target is not that attack's impact. */
const IMPACT_WINDOW_MS = 2500;
/** Casts held for a unit that is not tracked yet (`pendingSkill`): a hold per unit of a field, never more than this. */
const PENDING_SKILL_MAX = 64;
/** Official operator sound files of a skill mode: `…_d` / `…_h` / `…_s` (+ digits) — the normal attack's end in `_n`. */
const SKILL_MODE_FILE = /_(d|h|s)\d*\.mp3$/i;

// ---- pure helpers (unit-tested) -----------------------------------------------------------------------

/**
 * BGM key for a route + match phase.
 * @param {'title'|'lobby'|'room'|'game'|string} route
 * @param {any} pub m.public (may be null)
 * @returns {string|null} 'lobby' | 'prep' | 'combat' | 'unite' | 'boss' | 'boss:<bossId>' | null
 */
export function bgmKeyFor(route, pub, combatTrack = null) {
  if (route !== 'game') return route === 'title' || route === 'lobby' || route === 'room' ? 'lobby' : null;
  const phase = pub?.phase;
  if (!phase) return 'lobby';
  switch (phase) {
    case PHASE.INFO_CHECK: case PHASE.BAND_DRAFT: case PHASE.BATTLE_CHECK: case PHASE.RESULT: case PHASE.LOBBY:
      return 'lobby';
    case PHASE.UNITE:
      // 联防 has its own track: the official `escaped_single` / `escaped_multi` levels declare
      // `bgmEvent = corrosion` (level_act1autochess_escaped_*.json), so the rescue phase is not the 作战's track.
      // resolveBgm falls back to `bgm.combat` when a manifest predates it.
      return 'unite';
    case PHASE.COMBAT:
      return combatTrack == null ? 'combat' : `combat:${combatTrack ? 1 : 0}`;
    case PHASE.FINAL_ASSAULT:
      return pub.bossId ? `boss:${pub.bossId}` : 'boss';
    case PHASE.HIDDEN_CORE:
      return pub.hiddenBossId ? `boss:${pub.hiddenBossId}` : pub.bossId ? `boss:${pub.bossId}` : 'boss';
    default:
      // Rest and drafts use the mode theme instead of retaining the round battle track.
      return 'prep';
  }
}

/**
 * Resolve a BGM key to { intro?, loop } URLs from the manifest: `boss:<id>` falls back to the generic boss track and
 * `unite` (联防's own track) to `bgm.combat` when the manifest predates it.
 * @param {any} manifest
 * @param {string|null} key
 * @returns {{ intro: string|null, loop: string }|null}
 */
export function resolveBgm(manifest, key) {
  const a = manifest?.audio;
  if (!a || !key) return null;
  let t = null;
  if (key.startsWith('boss:')) t = a.bossBgm?.[key.slice(5)] || a.bgm?.boss;
  else if (key.startsWith('combat:')) t = a.bgm?.combatAlts?.[Number(key.slice(7))] || a.bgm?.combat;
  else if (key === 'unite') t = a.bgm?.unite || a.bgm?.combat;
  else t = a.bgm?.[key];
  if (!t || typeof t.loop !== 'string') return null;
  return { intro: typeof t.intro === 'string' ? t.intro : null, loop: t.loop };
}

/**
 * The last round that plays 无畏者 (1–7); from the next round on it is 骑士之日 (8–13) — the official schedule
 * (docs/ASSETS.md "BGM"; the two tracks are the 塞壬唱片 act13side battle themes).
 */
export const COMBAT_TRACK_SWITCH_ROUND = 7;

/**
 * The round's own 开战 track index into `bgm.combatAlts` (plan.mjs order: 0 = `m_bat_kazimierz2_1` 骑士之日,
 * 1 = `m_bat_kazimierz2_2` 无畏者). The mode does not draw these: the official schedule plays one per round, 无畏者
 * through the early rounds (1–7) and 骑士之日 from round 8 to the last normal round (8–13). Everything after that is
 * the boss rounds (最终攻势 / 隐秘核心), which have their own tracks and never ask for `combat:<i>`.
 * @param {number|null|undefined} round m.public.round
 * @returns {0|1|null} null when the round is unknown ⇒ the manifest's plain `combat` track
 */
export function combatTrackFor(round) {
  const r = Number(round);
  if (!Number.isFinite(r) || r < 1) return null;
  return r <= COMBAT_TRACK_SWITCH_ROUND ? 1 : 0;
}

/**
 * Official sound class of a battle unit (audio_data `battle.ON_UNIT_DEAD|BORN.<class>` defaults):
 * 'enemy' | 'char' (operators: b_char_dead “干员被击倒” / b_char_set) | 'token' (summons: b_char_tokendead /
 * b_char_tokenset) | 'device' (stage devices: the act crate trap_1105 dies with b_char_tokendead, no born sound).
 * Band map characters (预备干员-医疗 / Touch, `char_*` ids) are characters although the sim runs them as tokens.
 * @param {{ side?: string, kind?: string, defId?: string, def?: string }|null} info tracked unit (UnitInfo subset)
 */
export function unitSoundClass(info) {
  if (!info) return 'char';
  if (info.side === 'enemy') return 'enemy';
  const id = String(info.defId ?? info.def ?? '');
  if (info.kind === 'device') return 'device';
  if (info.kind === 'token') return /^char_/.test(id) ? 'char' : 'token';
  return 'char';
}

/** URL of the generic token death sound (b_char_tokendead): sfx.battle.tokenDie, else next to charDie. */
function tokenDieUrl(manifest) {
  const b = manifest?.audio?.sfx?.battle;
  if (typeof b?.tokenDie === 'string') return b.tokenDie;
  return typeof b?.charDie === 'string' && /b_char_dead\.mp3$/.test(b.charDie) ? b.charDie.replace(/b_char_dead\.mp3$/, 'b_char_tokendead.mp3') : null;
}

/**
 * Death sound of a battle unit ('die' event): the unit's own ON_UNIT_DEAD sound, else its class default — only
 * operators play the operator-knocked-down sound (charDie). A summon that fired and was used up (香槟炸弹: its
 * explosion is the sound) is silent, and so is an operator leaving without being knocked out, when the event says so
 * (`reason` ≠ 'killed').
 * @param {any} manifest data/assets.json
 * @param {{ side?: string, kind?: string, defId?: string, def?: string, boss?: boolean }|null} info
 * @param {{ consumed?: boolean, reason?: string|null }} [o]
 * @returns {string|null} sound URL
 */
export function deathSfxUrl(manifest, info, { consumed = false, reason = null } = {}) {
  if (!info || consumed) return null;
  const cls = unitSoundClass(info);
  if (cls === 'char' && reason && reason !== 'killed') return null;
  const own = manifest?.audio?.sfx?.units?.[info.def]?.die;
  if (typeof own === 'string') return own;
  const b = manifest?.audio?.sfx?.battle ?? {};
  if (cls === 'enemy') return (info.boss ? b.enemyDieHeavy : null) ?? b.enemyDie ?? null;
  if (cls === 'char') return typeof b.charDie === 'string' ? b.charDie : null;
  return tokenDieUrl(manifest);
}

/**
 * Deployment sound of an allied unit ('deploy' event): its own ON_UNIT_BORN sound, else operators b_char_set
 * (sfx.battle.deploy), summons b_char_tokenset (tokenDeploy); stage devices have none.
 * @returns {string|null}
 */
export function deploySfxUrl(manifest, info) {
  if (!info || info.side === 'enemy') return null;
  const own = manifest?.audio?.sfx?.units?.[info.def]?.born;
  if (typeof own === 'string') return own;
  const b = manifest?.audio?.sfx?.battle ?? {};
  const cls = unitSoundClass(info);
  if (cls === 'device') return null;
  const url = cls === 'token' ? (b.tokenDeploy ?? b.deploy) : b.deploy;
  return typeof url === 'string' ? url : null;
}

/**
 * Whether a unit's manifest `attack` / `hit` sound may play for its normal attacks: an operator's (`char_*`) sound file
 * of one of its skill modes (`_d` / `_h` / `_s`, see header) may not. Enemy files use `_h` for heavy weapons (always
 * allowed), and so may summons.
 * @param {string} defId the unit's model id (sfx.units key)
 * @param {string} url
 */
export function normalAttackSfx(defId, url) {
  return typeof url === 'string' && !(typeof defId === 'string' && defId.startsWith('char_') && SKILL_MODE_FILE.test(url));
}

/**
 * Voice priorities — the official battle voice types (`audio_data.json battleVoice.voiceTypeOptions`) mapped onto the
 * manifest's slots: BATTLE_START 100, BATTLE_FACE_ENEMY 90, SKILL_ACTIVE 70, PASSIVE_IMP 60, PASSIVE_NOR 50,
 * PLACE_CHAR 20, FOCUS_CHAR 10 (选中干员). The settlement lines are no battle voice of the official scheduler: they sit at
 * 85, above 作战中 (70) but below 接敌 (90), so a battle's last word is never cut off by an ordinary line. The three
 * prep-only slots (编入队伍 / 任命队长 / 干员报到) keep their levels although nothing plays them (see the header).
 */
export const VOICE_PRIORITY = Object.freeze({
  start: 100, faceEnemy: 90, passiveImp:60, passiveNor:50,
  skill1: 70, skill2: 70, skill3: 70, skill4: 70,
  resultFour: 85, resultThree: 85, resultTwo: 85, resultLose: 85,
  gacha: 60, squadFirst: 45, squad: 30, place: 20, select: 10,
});

/**
 * Per-unit per-slot cooldowns (ms): the official 10 s of the 作战中 (passive skill) lines, 3 s between 接敌 lines. 选中干员
 * has none — official FOCUS_CHAR `cooldown: 0` (it was 1.5 s until 0.2.2, when a tap in the prep made it audible).
 */
export const VOICE_COOLDOWN_MS = Object.freeze({
  start: 0, faceEnemy: 3000, passiveImp:10000, passiveNor:10000,
  skill1: 0, skill2: 0, skill3: 0, skill4: 0,
  resultFour: 0, resultThree: 0, resultTwo: 0, resultLose: 0,
  gacha: 0, squadFirst: 0, squad: 0, place: 0, select: 0,
});

/**
 * The slot a player's tap asks for: 选中干员 (official FOCUS_CHAR — priority 10, cooldown 0, `overlapIfSamePriority:
 * true`). The battle lines are timed by the gate's global gap; a tap is the player's own request and answers at once:
 * on an idle channel it always plays (no gap, no cooldown), a newer tap replaces the 选中 line still on air (the same
 * priority, overlapIfSamePriority), and it still never interrupts a higher-priority line (部署, 作战中, 开战 …). Nor does
 * it start a gap of its own: the battle lines keep the gap of the last battle line (a tap restarting it dropped a 部署 /
 * 技能 / 接敌, which the battle asks for once, after a 选中 line shorter than the gap had already ended — many are).
 */
export const VOICE_TAP_SLOTS = Object.freeze(['select']);

/**
 * Pick Korean/Japanese operator dialogue. Missing Korean slots fall back to
 * Japanese; Chinese preferences and legacy Chinese banks are never played.
 * @returns {{url:string, fallback:string|null}|null}
 */
export function voiceLine(audio, charId, slot, lang = 'kr', random = Math.random) {
  const lines = line => (Array.isArray(line) ? line : [line]).filter(u => typeof u === 'string' && u && !/\/voice\/(cn|voice_cn)\//.test(u));
  const draw = list => list.length ? list[Math.min(list.length - 1, Math.floor(random() * list.length))] : null;
  const base = audio?.voice || {};
  const jp = lines((base.jp || audio?.voiceJp)?.[charId]?.[slot]);
  const selected = draw(lang === 'jp' ? jp : lines(base.kr?.[charId]?.[slot]));
  if (selected) {
    const file = u => u.slice(u.lastIndexOf('/') + 1);
    const fallback = lang === 'jp' ? null : jp.find(u => file(u) === file(selected)) ?? draw(jp);
    return {url:selected, fallback:fallback === selected ? null : fallback};
  }
  const url = draw(jp);return url ? {url, fallback:null} : null;
}

/**
 * The settlement slot of a finished 作战: 完美作战 ⇒ 3星结束行动 (绝境 / 终极 ⇒ 完成高难行动 instead), a leaked enemy
 * ⇒ 非3星结束行动, nothing killed at all ⇒ 行动失败.
 * @param {{perfect?:boolean, leaked?:number, killed?:number, total?:number, hard?:boolean}} [o]
 * @returns {'resultFour'|'resultThree'|'resultTwo'|'resultLose'}
 */
export function resultVoiceSlot(o = {}) {
  const leaked = Number.isFinite(o.leaked) ? o.leaked : 0;
  const killed = Number.isFinite(o.killed) ? o.killed : 0;
  const total = Number.isFinite(o.total) ? o.total : 0;
  if (o.perfect) return o.hard ? 'resultFour' : 'resultThree';
  if (total > 0 && killed <= 0) return 'resultLose';
  if (leaked > 0) return 'resultTwo';
  return o.hard ? 'resultFour' : 'resultThree';
}


/**
 * Gain of a unit's own sound with its manifest mix (sfx.units[id].mix[role]: the official bank's volume): `base` × `vol`,
 * never above `base` (a bank louder than 1 plays as before — community report #30 asked for quieter, not louder).
 * @param {number} base the role's base gain (attack / hit 0.55, die / born / skill 0.8)
 * @param {{ vol?: number }|null|undefined} mix
 */
export function unitGain(base, mix) {
  const v = mix && Number(mix.vol);
  return Number.isFinite(v) && v >= 0 ? base * Math.min(1, v) : base;
}

/**
 * Whether a unit's own sound plays this time: its official bank's chance `mix.p` (sounds with a file over all the weights;
 * 猎狗pro's attack bank 20 of 100). `roll` ∈ [0, 1).
 */
export function unitSoundPlays(mix, roll) {
  const p = mix && Number(mix.p);
  return !(Number.isFinite(p) && p >= 0 && p < 1) || roll < p;
}

/**
 * Who says a battle's **result** line (结算): an operator of THAT battle's own field. Never the field the player happens
 * to be looking at (review on #73): reading the tracked units of the field on screen made a teammate's operator say the
 * viewer's 作战结束 line while the viewer was watching them.
 * `pp` is that battle's own `perPlayer` entry (BattleResult, sim/Battle.js): `unitsEnd` lists what stood on its field
 * when the battle ended. Its `defId` names the CHESS (`chess_char_*`) or a summon piece (`token_*`, which does not talk);
 * the voice bank belongs to the operator (`char_*`), so `charOf` maps a chess id to its charId (the chess record's
 * `charId`). Without it only ids that already are a charId count — a real result then has no speaker, which is how the
 * line stayed silent in every battle until 0.1.4's fix.
 * Survivors speak first — the line reports how the battle went, and a wiped-out squad is the only case where a fallen
 * operator ends up saying it. Ties are drawn like every other unit sound.
 * @param {{ unitsEnd?: Array<{ defId?: string|null, alive?: boolean }> } | null | undefined} pp that battle's perPlayer
 * @param {() => number} [random]
 * @param {((defId: string) => string|null|undefined) | null} [charOf] chess id → charId
 * @returns {string|null} charId, or null when that battle fielded no operator at all
 */
export function resultSpeaker(pp, random = Math.random, charOf = null) {
  const ops = [];
  for (const u of Array.isArray(pp?.unitsEnd) ? pp.unitsEnd : []) {
    if (!u || typeof u.defId !== 'string') continue;
    const id = u.defId.startsWith('char_') ? u.defId : charOf ? charOf(u.defId) : null;
    if (typeof id === 'string' && id.startsWith('char_')) ops.push({ id, alive: !!u.alive });
  }
  const standing = ops.filter((o) => o.alive);
  const pool = standing.length ? standing : ops;   // only a wiped-out squad is spoken for by a fallen operator
  if (!pool.length) return null;
  return pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))].id;
}

/** Concurrency + cooldown gate for battle SFX. Pure (time is passed in). */
/** Gestures that may unlock audio: iOS Safari only accepts touchend / click / keydown; pointerdown covers the rest. */
const UNLOCK_EVENTS = ['pointerdown', 'touchend', 'click', 'keydown'];

export class SfxLimiter {
  /** @param {{ maxVoices?: number, unitCooldownMs?: number, urlGapMs?: number, maxPerUrl?: number }} [o] */
  constructor(o = {}) {
    this.maxVoices = o.maxVoices ?? MAX_VOICES;
    this.unitCooldownMs = o.unitCooldownMs ?? UNIT_COOLDOWN_MS;
    this.urlGapMs = o.urlGapMs ?? URL_GAP_MS;
    // the official battle banks (attack, impact, heal, born, dead…) allow at most 2 overlapping copies of a sound
    // (audio_data maxSoundAllowed 2): a heal / impact heard on every tick of a crowd never piles up
    this.maxPerUrl = o.maxPerUrl ?? MAX_PER_URL;
    this.active = 0;
    this.lastByUnit = new Map();
    this.lastByUrl = new Map();
    this.activeByUrl = new Map();
  }

  /**
   * Whether a sound may start now; records it when allowed (call `release(url)` when it ends).
   * @param {number} now ms
   * @param {string|number|null} unitKey e.g. `${unitId}:atk`
   * @param {string} url
   */
  tryAcquire(now, unitKey, url) {
    if (this.active >= this.maxVoices) return false;
    if ((this.activeByUrl.get(url) || 0) >= this.maxPerUrl) return false;
    if (unitKey != null) {
      const t = this.lastByUnit.get(unitKey);
      if (t != null && now - t < this.unitCooldownMs) return false;
    }
    const u = this.lastByUrl.get(url);
    if (u != null && now - u < this.urlGapMs) return false;
    if (unitKey != null) this.lastByUnit.set(unitKey, now);
    this.lastByUrl.set(url, now);
    if (this.lastByUnit.size > 600) this.lastByUnit.clear();
    if (this.lastByUrl.size > 400) this.lastByUrl.clear();
    this.active += 1;
    this.activeByUrl.set(url, (this.activeByUrl.get(url) || 0) + 1);
    return true;
  }

  /** A sound started by tryAcquire ended. */
  release(url) {
    this.active = Math.max(0, this.active - 1);
    const n = this.activeByUrl.get(url) || 0;
    if (n <= 1) this.activeByUrl.delete(url); else this.activeByUrl.set(url, n - 1);
  }
}

/**
 * Voice gate: one line at a time, a global gap between two lines, a per-unit per-slot cooldown, and takeover by a
 * clearly more important line (the caller fades the playing one out first). A tap's 选中干员 skips the gap and the
 * cooldown on an idle channel, replaces a 选中 line on air and starts no gap itself (VOICE_TAP_SLOTS). Pure — the clock
 * is passed in.
 */
export class VoiceGate {
  /** @param {{ gapMs?: number, preemptMargin?: number, maxUnits?: number }} [o] */
  constructor(o = {}) {
    this.gapMs = Number.isFinite(o.gapMs) ? o.gapMs : VOICE_GAP_MS;
    // a line only takes the channel over when its priority beats the playing one by this margin: an equal-priority
    // line (two 作战中 of different operators) waits for its turn instead of cutting the other off
    this.preemptMargin = Number.isFinite(o.preemptMargin) ? o.preemptMargin : 0;
    this.maxUnits = Number.isFinite(o.maxUnits) ? o.maxUnits : 400;
    this.playing = null;      // { slot, pri } of the line on air
    this.lastAt = -Infinity;
    this.unitUntil = new Map();
  }

  /** Drop all state (a new field must not inherit the previous battle's cooldowns). */
  reset() {
    this.playing = null;
    this.lastAt = -Infinity;
    this.unitUntil.clear();
    this.encounterAt=-Infinity;
  }

  /**
   * May a `slot` line from `unitKey` start now?
   * @param {string} slot
   * @param {string|number|null} unitKey the cooldown key (a battle unit id; null = no per-unit cooldown)
   * @param {number} now ms
   * @returns {'play'|'preempt'|'drop'}
   */
  request(slot, unitKey, now) {
    if (unitKey != null && now < (this.unitUntil.get(`${unitKey}:${slot}`) || 0)) return 'drop';
    const pri = VOICE_PRIORITY[slot] ?? 0;
    const tap = VOICE_TAP_SLOTS.includes(slot);
    if (this.playing) {
      if (tap && this.playing.slot === slot) return 'preempt';
      if (pri < this.playing.pri + this.preemptMargin || (pri === this.playing.pri && slot === 'faceEnemy')) return 'drop';
      return 'preempt';                       // a clearly more important line takes the channel
    }
    if (tap) return 'play';
    if (slot === 'faceEnemy' && now - (this.encounterAt ?? -Infinity) < 3000) return 'drop';
    if (now - this.lastAt < this.gapMs) return 'drop';
    if (unitKey != null && now < (this.unitUntil.get(`${unitKey}:${slot}`) || 0)) return 'drop';
    return 'play';
  }

  /** Record a line that started (call right after request() answered play / preempt). */
  start(slot, unitKey, now) {
    this.playing = { slot, pri: VOICE_PRIORITY[slot] ?? 0 };
    if (!VOICE_TAP_SLOTS.includes(slot)) this.lastAt = now;
    if(slot === 'faceEnemy')this.encounterAt=now;
    const cd = VOICE_COOLDOWN_MS[slot] ?? 0;
    if (unitKey != null && cd > 0) {
      if (this.unitUntil.size > this.maxUnits) this.unitUntil.clear();
      this.unitUntil.set(`${unitKey}:${slot}`, now + cd);
    }
  }

  /** The line ended (naturally, by takeover or by a stop). */
  release() { this.playing = null; }
}

// ---- manager -----------------------------------------------------------------------------------------------

/**
 * Could Web Audio decode this response? A host without the `/media/` route answers 404; some static hosts answer a
 * missing path with 200 + the SPA's index.html instead, and fetching *that* would fail to decode as silently as a
 * 404 would — so the fallback looks at the declared type too.
 *
 * A response that declares no type at all is not treated as wrong: absence of a header is not evidence of an HTML
 * page, and fetch stubs / minimal hosts legitimately omit it.
 * @param {{ ok?: boolean, headers?: { get?: (n: string) => string | null } }} res
 */
function isAudioResponse(res) {
  if (!res || !res.ok) return false;
  const type = res.headers?.get?.('content-type');
  return !type || /^\s*audio\//i.test(type);
}
export class AudioManager {
  /**
   * @param {{ getManifest?: () => any, win?: any }} [opts]
   */
  constructor(opts = {}) {
    this.getManifest = typeof opts.getManifest === 'function' ? opts.getManifest : () => null;
    this.random = typeof opts.random === 'function' ? opts.random : Math.random;   // a unit sound's chance (mix.p)
    this.win = opts.win ?? (typeof window !== 'undefined' ? window : null);
    this.ctx = null;
    this.master = null;
    this.bgmGain = null;
    this.sfxGain = null;
    this.voiceGain = null;
    this.chatGain = null;
    this.chatNode = null;
    this.chatPending = false;
    this.chatGeneration = 0;
    this.chatNextAt = 0;
    this.chatLastStartedAt = null;
    this.chatLastDurationMs = 0;
    this.chatCooldown = defaultChatCooldown('emote');
    this.volumes = { bgm: 0.6, sfx: 0.8, voice: 0.6, voiceLanguage:'kr', chatVolume: 0.5, muted: false };
    this.buffers = new Map(); // url → Promise<AudioBuffer|null> (insertion order = LRU)
    this.bufBytes = new Map(); // url → decoded PCM bytes (the byte budget of the LRU, see _buffer)
    this.warned = new Set();
    this.limiter = new SfxLimiter();
    this.voiceGate = new VoiceGate();
    this.voiceNode = null;    // { src, gain, url, token } of the line on air
    this.voiceToken = 0;
    this.voiceOverrides={};
    this.startVoiceDone = false; // One randomly selected deployed operator per field.
    this.uiVoices = 0;
    this.wantBgm = null;      // desired key (kept while locked)
    this.bgm = null;          // { key, loopUrl, nodes: [{src, gain}], gain }
    this.bgmToken = 0;
    this.pendingBgm = null;
    this.units = new Map();   // battle unit id → defId
    this.pendingSkill = new Map(); // unit id → the 'skill' tuple that arrived before the unit was known (see _track)
    this.lastAttacker = new Map(); // target id → { def, at, skillIndex, skillActive } of the hostile attack aimed at it (its impact sound,
                                   // including the running skill's own `hits` — 赤刃明霄陈 S3's slash)
    this.consumed = new Set();     // summons used up by their own effect (香槟炸弹 exploded): no death sound
    this.installed = false;
    this._unlock = this._unlock.bind(this);
    this._onVis = this._onVis.bind(this);
  }

  /** Attach gesture unlock + visibility handling. Idempotent. */
  install() {
    if (this.installed || !this.win) return;
    this.installed = true;
    try {
      for (const ev of UNLOCK_EVENTS) this.win.addEventListener(ev, this._unlock, { capture: true, passive: true });
      this.win.document?.addEventListener?.('visibilitychange', this._onVis);
      // iOS / iPadOS: a phone call, Siri or another app puts the context into 'interrupted'; coming back to the page
      // (pageshow / focus) resumes it (plus the next gesture, below)
      this.win.addEventListener?.('pageshow', this._onVis);
      this.win.addEventListener?.('focus', this._onVis);
    } catch { /* ignore */ }
  }

  get unlocked() { return !!this.ctx; }

  /**
   * First user gesture: create the context. The gesture listeners stay until the context actually runs — iOS Safari
   * only counts touchend / click (not pointerdown / touchstart) as activation, so a context created on pointerdown can
   * stay 'suspended' until the finger lifts. A 1-sample silent buffer is played inside the gesture (older WebKit only
   * unlocks output after something was started in a gesture).
   */
  _unlock() {
    if (this.ctx) {
      const st = this.ctx.state;
      if (st === 'running') { this._dropUnlock(); return; }
      if (!this.win?.document?.hidden) {
        this._primeOutput();
        const p = this.ctx.resume?.();
        if (p && typeof p.then === 'function') p.then(() => { if (this.ctx?.state === 'running') this._dropUnlock(); }, () => {});
      }
      return;
    }
    try {
      const AC = this.win?.AudioContext || this.win?.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.bgmGain = this.ctx.createGain();
      this.sfxGain = this.ctx.createGain();
      this.voiceGain = this.ctx.createGain();
      this.chatGain = this.ctx.createGain();
      this.bgmGain.connect(this.master);
      this.sfxGain.connect(this.master);
      this.voiceGain.connect(this.master);
      this.chatGain.connect(this.master);
      this.master.connect(this.ctx.destination);
      // iOS / iPadOS: a call, Siri or another app's audio moves a running context to 'interrupted' (or 'suspended');
      // a resume without a gesture may then be refused — listen for the next gesture again (dropped once it runs)
      try {
        this.ctx.addEventListener?.('statechange', () => {
          const s = this.ctx?.state;
          if (s && s !== 'running' && s !== 'closed' && !this.win?.document?.hidden) this._armUnlock();
        });
      } catch { /* ignore */ }
      this._applyVolumes();
      this._primeOutput();
      if (this.ctx.state === 'running') this._dropUnlock();
      else {
        const p = this.ctx.resume?.();
        if (p && typeof p.then === 'function') p.then(() => { if (this.ctx?.state === 'running') this._dropUnlock(); }, () => {});
      }
      this.warmVoices([]);
      this.warmChatNotification();
      if (this.wantBgm) { const k = this.wantBgm; this.wantBgm = null; this.playBgm(k); }
    } catch (err) {
      this._warn('ctx', err);
      this.ctx = null;
    }
  }

  /** (Re-)attach the gesture listeners after the context stopped running while visible (see _unlock / _onVis). */
  _armUnlock() {
    if (!this._unlockDropped || !this.win) return;
    this._unlockDropped = false;
    try { for (const ev of UNLOCK_EVENTS) this.win.addEventListener(ev, this._unlock, { capture: true, passive: true }); } catch { /* ignore */ }
  }

  /** Remove the first-gesture listeners (the context runs). */
  _dropUnlock() {
    if (this._unlockDropped || !this.win) return;
    this._unlockDropped = true;
    try { for (const ev of UNLOCK_EVENTS) this.win.removeEventListener(ev, this._unlock, { capture: true }); } catch { /* ignore */ }
  }

  /** Start a silent 1-sample buffer (inside a user gesture: unlocks output on older WebKit). */
  _primeOutput() {
    try {
      const c = this.ctx;
      if (!c || typeof c.createBuffer !== 'function') return;
      const src = c.createBufferSource();
      src.buffer = c.createBuffer(1, 1, c.sampleRate || 44100);
      src.connect(c.destination);
      src.start ? src.start(0) : src.noteOn?.(0);
    } catch { /* ignore */ }
  }

  _onVis() {
    try {
      if (!this.ctx) return;
      if (this.win?.document?.hidden) this.ctx.suspend().catch(() => {});
      else if (this.ctx.state !== 'running') {
        // back on the page: resume, and keep a gesture ready in case the browser wants one first (iOS after a call)
        this._armUnlock();
        this.ctx.resume().then(() => { if (this.ctx?.state === 'running') this._dropUnlock(); }, () => {});
      }
    } catch { /* ignore */ }
  }

  _warn(key, err) {
    if (this.warned.has(key)) return;
    this.warned.add(key);
    try { console.warn(`[audio] ${key} unavailable`, err?.message || err || ''); } catch { /* ignore */ }
  }

  /**
   * Set channel volumes (0..1) and mute.
   * @param {{ bgm?: number, sfx?: number, voice?: number, muted?: boolean }} v
   */
  setVolumes(v) {
    const previousLanguage=this.volumes.voiceLanguage;
    const n = (x, d) => (Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : d);
    if (Number.isFinite(v?.chatCooldown)) {
      this.chatCooldown = Math.max(1, Math.min(5, Math.round(v.chatCooldown)));
      if (this.chatLastStartedAt !== null) this.chatNextAt = this.chatLastStartedAt + Math.max(this.chatCooldown * 1000, this.chatLastDurationMs + 500);
    }
    this.volumes = {
      bgm: n(v?.bgm, this.volumes.bgm),
      sfx: n(v?.sfx, this.volumes.sfx),
      voice: n(v?.voice, this.volumes.voice),
      chatVolume: n(v?.chatVolume, this.volumes.chatVolume),
      voiceLanguage: ['jp','kr'].includes(v?.voiceLanguage) ? v.voiceLanguage : this.volumes.voiceLanguage,
      muted: typeof v?.muted === 'boolean' ? v.muted : this.volumes.muted,
    };
    if (previousLanguage !== this.volumes.voiceLanguage || v?.muted || v?.voice === 0) this._stopVoice();
    if (v?.muted || v?.chatVolume === 0 || v?.chatSound === 'off') this.stopChatNotification();
    this.chatSound = v?.chatSound ?? this.chatSound ?? 'emote';
    this.warmChatNotification();
    this._applyVolumes();
    this.warmVoices([...this.units.values()].filter(u=>u.kind==='op').map(u=>u.def));
  }

  /**
   * The voice dub (settings 语音语言): 'jp' plays `audio.voiceJp`, anything else `audio.voice` (中文, the default). The
   * line on air finishes in its own dub; the next one follows the setting.
   * @param {string} lang
   */
  setVoiceLang(lang, overrides = this.voiceOverrides) {
    this.voiceLang = ['kr','jp'].includes(lang)?lang:'kr';
    this.voiceOverrides = sanitizeVoiceOverrides(overrides);
  }

  _applyVolumes() {
    if (!this.ctx) return;
    try {
      const t = this.ctx.currentTime;
      this.master.gain.setTargetAtTime(this.volumes.muted ? 0 : 1, t, 0.03);
      // perceptual curve
      this.bgmGain.gain.setTargetAtTime(this.volumes.bgm ** 2 * 0.55, t, 0.05);
      this.sfxGain.gain.setTargetAtTime(this.volumes.sfx ** 2 * 0.9, t, 0.03);
      // no 0.9: a voice line is already mastered as loud as the rest of the official mix (settings 干员语音 tunes it)
      this.voiceGain.gain.setTargetAtTime(this.volumes.voice ** 2, t, 0.03);
      this.chatGain.gain.setTargetAtTime(this.volumes.chatVolume ** 2, t, 0.03);
    } catch { /* ignore */ }
  }

  /** Fetch + decode (cached, LRU). Resolves null on failure. */
  _buffer(url) {
    if (!this.ctx || typeof url !== 'string' || !url) return Promise.resolve(null);
    const hit = this.buffers.get(url);
    if (hit) {
      this.buffers.delete(url);
      this.buffers.set(url, hit);
      return hit;
    }
    const p = (async () => {
      try {
        // Extension-less URL first so download managers leave the BGM alone; a host without /media/ still works.
        const media = mediaUrl(url);
        const voiceFile = /\/voice\//.test(url),chatFile=url.startsWith('/audio/chat-notification/');
        const cache = (voiceFile||chatFile) && globalThis.caches ? await globalThis.caches.open(chatFile?'stronghold-chat-notifications-v1':'stronghold-operator-voices-v1').catch(()=>null) : null;
        let res = await cache?.match(url) || await fetch(media);
        if (media !== url && !isAudioResponse(res)) {
          // Drop the unusable response (404, or a 200 that is really index.html) before trying the original URL.
          try { await res.body?.cancel?.(); } catch { /* the fallback request matters more than draining this one */ }
          res = await fetch(url);
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        if (cache && res.ok) await cache.put(url,res.clone()).catch(()=>{});
        const ab = await res.arrayBuffer();
        return await new Promise((resolve) => {
          try {
            const r = this.ctx.decodeAudioData(ab, resolve, () => resolve(null));
            if (r && typeof r.then === 'function') r.then(resolve, () => resolve(null));
          } catch { resolve(null); }
        });
      } catch (err) {
        this._warn(url, err);
        return null;
      }
    })();
    this.buffers.set(url, p);
    p.then((buf) => {
      if (!buf) { if (this.buffers.get(url) === p) this.buffers.delete(url); return; }
      try {
        this.bufBytes.set(url, (buf.length || 0) * (buf.numberOfChannels || 1) * 4);
        this._trimBuffers();
      } catch { /* ignore */ }
    }, () => {});
    this._trimBuffers();
    return p;
  }

  /**
   * Evict least-recently-used buffers until both the entry count and the decoded-PCM budget hold. The count alone is
   * not enough once voice lines are in the cache: 180 of them are ~100 MB of PCM (a voice decodes to 0.4–1.3 MB).
   */
  _trimBuffers() {
    let bytes = 0;
    for (const n of this.bufBytes.values()) bytes += n;
    if (this.buffers.size <= BUFFER_CACHE && bytes <= BUFFER_BYTES) return;
    for (const url of [...this.buffers.keys()]) {
      if (this.buffers.size <= BUFFER_CACHE && bytes <= BUFFER_BYTES) break;
      // never evict the playing BGM (a voice keeps its own reference to its buffer)
      if (this.bgm && url === this.bgm.loopUrl) continue;
      bytes -= this.bufBytes.get(url) || 0;
      this.buffers.delete(url);
      this.bufBytes.delete(url);
    }
  }

  /** Preload a list of URLs (e.g. UI SFX) once unlocked. */
  preload(urls) {
    if (!this.ctx) return;
    for (const u of Array.isArray(urls) ? urls : []) this._buffer(u);
  }

  /** Cache compressed voice files in the background, without keeping the whole voice bank in RAM. */
  cacheVoiceBank(bank) {
    if (!globalThis.caches || !bank || this.cachedVoiceBank === bank) return;
    this.cachedVoiceBank=bank;
    const urls=[...new Set(Object.values(bank).flatMap(slots=>Object.values(slots||{}).flat()).filter(u=>typeof u==='string'))];
    const run=async()=>{
      const cache=await globalThis.caches.open('stronghold-operator-voices-v1');
      const worker=async()=>{while(urls.length){const url=urls.shift();try{
        if(await cache.match(url))continue;
        const response=await fetch(url);
        if(response.ok)await cache.put(url,response);
      }catch{/* a failed file is retried by the normal playback path */}}};
      await Promise.all([worker(),worker()]);
    };
    run().catch(()=>{});
  }

  /** Prepare likely lines before their click/cast, bounded to two simultaneous downloads. */
  warmVoices(charIds) {
    const bank = this.getManifest()?.audio?.voice;
    const lang = bank?.[this.volumes.voiceLanguage] || bank;
    this.cacheVoiceBank(lang);
    this.voiceWarmQueue ||= [];
    this.voiceWarmSeen ||= new Set();
    for (const id of charIds || []) for (const slot of ['select','place','start','skill1','skill2','skill3']) {
      const line = lang?.[id]?.[slot];
      for (const url of Array.isArray(line) ? line : [line]) {
        if (typeof url !== 'string' || this.voiceWarmSeen.has(url) || this.voiceWarmQueue.length >= 64) continue;
        this.voiceWarmSeen.add(url); this.voiceWarmQueue.push(url);
      }
    }
    if (!this.ctx) return;
    const pump = () => {
      while ((this.voiceWarmActive || 0) < 2 && this.voiceWarmQueue.length) {
        const url = this.voiceWarmQueue.shift();
        this.voiceWarmActive = (this.voiceWarmActive || 0) + 1;
        this._buffer(url).finally(() => { this.voiceWarmActive--; pump(); });
      }
    };
    pump();
  }

  // ---- BGM ------------------------------------------------------------------------------------------------

  /**
   * Switch BGM (null stops). Same loop URL ⇒ no restart.
   * @param {string|null} key see bgmKeyFor
   */
  playBgm(key) {
    try {
      if (!this.ctx) { this.wantBgm = key; return; }
      const track = resolveBgm(this.getManifest(), key);
      if (this.bgm && track && this.bgm.loopUrl === track.loop) { this.bgm.key = key; if(this.pendingBgm){++this.bgmToken;this.pendingBgm=null;} return; }
      if (track && this.pendingBgm?.loop === track.loop) return;
      if (!track && key != null) { this.wantBgm = key; return; }
      const token = ++this.bgmToken;
      this.pendingBgm = track ? {loop:track.loop,token} : null;
      if (!track) { this._fadeOutBgm(); return; }
      this._startBgm(key, track, token).finally(() => {
        if (this.pendingBgm?.token === token) this.pendingBgm = null;
      });
    } catch (err) { this._warn('bgm', err); }
  }

  async _startBgm(key, track, token) {
    const [intro, loop] = await Promise.all([track.intro ? this._buffer(track.intro) : null, this._buffer(track.loop)]);
    if (token !== this.bgmToken || !this.ctx || !loop) return;
    try {
      this._fadeOutBgm();
      const ctx = this.ctx;
      const gain = ctx.createGain();
      gain.connect(this.bgmGain);
      const t0 = ctx.currentTime + 0.05;
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(1, t0 + FADE_S);
      const nodes = [];
      let loopAt = t0;
      if (intro) {
        const s = ctx.createBufferSource();
        s.buffer = intro;
        const g = ctx.createGain();
        s.connect(g); g.connect(gain);
        s.start(t0);
        const end = t0 + intro.duration;
        const xf = Math.min(XFADE_S, intro.duration / 2);
        g.gain.setValueAtTime(1, Math.max(t0, end - xf));
        g.gain.linearRampToValueAtTime(0, end);
        nodes.push({ src: s, gain: g });
        loopAt = end - xf;
      }
      const s = ctx.createBufferSource();
      s.buffer = loop;
      s.loop = true;
      s.loopStart = 0; s.loopEnd = loop.duration;
      const g = ctx.createGain();
      s.connect(g); g.connect(gain);
      if (intro) {
        g.gain.setValueAtTime(0, loopAt);
        g.gain.linearRampToValueAtTime(1, loopAt + Math.min(XFADE_S, intro.duration / 2));
      }
      s.start(loopAt);
      nodes.push({ src: s, gain: g });
      this.bgm = { key, loopUrl: track.loop, nodes, gain };
    } catch (err) { this._warn('bgm-start', err); }
  }

  _fadeOutBgm() {
    const cur = this.bgm;
    this.bgm = null;
    if (!cur || !this.ctx) return;
    try {
      const t = this.ctx.currentTime;
      cur.gain.gain.cancelScheduledValues(t);
      cur.gain.gain.setValueAtTime(cur.gain.gain.value, t);
      cur.gain.gain.linearRampToValueAtTime(0, t + FADE_S);
      for (const n of cur.nodes) { try { n.src.stop(t + FADE_S + 0.05); } catch { /* ignore */ } }
      setTimeout(() => { try { cur.gain.disconnect(); } catch { /* ignore */ } }, (FADE_S + 0.3) * 1000);
    } catch { /* ignore */ }
  }

  warmChatNotification() {
    if(this.ctx && chatNotificationSound(this.chatSound)) this._buffer(`/audio/chat-notification/${this.chatSound}.mp3`);
  }

  stopChatNotification() {
    this.chatGeneration++;
    this.chatPending = false;
    if (this.chatNode) { try { this.chatNode.stop(); } catch { /* already stopped */ } }
    this.chatNode = null;
  }

  /** Independent chat channel. Suppressed messages are dropped, never queued. */
  async chatNotification(id, { preview = false } = {}) {
    const sound = chatNotificationSound(id);
    const now = () => typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (!sound || !this.ctx || this.ctx.state !== 'running' || this.win?.document?.hidden ||
        this.volumes.muted || this.volumes.chatVolume <= 0) return false;
    if (preview) this.stopChatNotification();
    else if (this.chatPending || this.chatNode || now() < this.chatNextAt) return false;
    const generation = this.chatGeneration;
    this.chatPending = true;
    const requestedAt = now();
    try {
      const buffer = await this._buffer(`/audio/chat-notification/${sound.id}.mp3`);
      if (generation !== this.chatGeneration || !buffer || now() - requestedAt > 2000 ||
          this.ctx.state !== 'running' || this.win?.document?.hidden || this.volumes.muted || this.volumes.chatVolume <= 0) return false;
      const source = this.ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(this.chatGain);
      this.chatNode = source;
      source.onended = () => {
        if (this.chatNode === source) this.chatNode = null;
        try { source.disconnect(); } catch { /* ignore */ }
      };
      source.start();
      if (!preview) {
        this.chatLastStartedAt = now();
        this.chatLastDurationMs = buffer.duration * 1000;
        this.chatNextAt = this.chatLastStartedAt + Math.max(this.chatCooldown * 1000, this.chatLastDurationMs + 500);
      }
      return true;
    } catch (error) { this._warn(`chat:${id}`, error); return false; }
    finally { if (generation === this.chatGeneration) this.chatPending = false; }
  }

  // ---- SFX ------------------------------------------------------------------------------------------------

  _play(url, { volume = 1, rate = 1, limited = false, unitKey = null, maxDuration = null } = {}) {
    if (!this.ctx || !url || this.volumes.muted || this.volumes.sfx <= 0) return;
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (limited) { if (!this.limiter.tryAcquire(now, unitKey, url)) return; }
    else if (this.uiVoices >= 12) return;
    else this.uiVoices += 1;
    const deadline = Number.isFinite(maxDuration) ? this.ctx.currentTime + Math.max(0,maxDuration) : null;
    const release = () => { if (limited) this.limiter.release(url); else this.uiVoices = Math.max(0, this.uiVoices - 1); };
    this._buffer(url).then((buf) => {
      if (!buf || !this.ctx || (deadline !== null && this.ctx.currentTime >= deadline)) { release(); return; }
      try {
        const s = this.ctx.createBufferSource();
        s.buffer = buf;
        s.playbackRate.value = rate;
        const g = this.ctx.createGain();
        g.gain.value = Math.max(0, Math.min(1.5, volume));
        s.connect(g); g.connect(this.sfxGain);
        let done = false;
        const end = () => { if (!done) { done = true; release(); try { g.disconnect(); } catch { /* ignore */ } } };
        s.onended = end;
        setTimeout(end, (buf.duration / rate) * 1000 + 250); // safety if onended never fires
        s.start();
        if (deadline !== null) s.stop(deadline);
      } catch { release(); }
    }, release);
  }

  /**
   * UI sound by name (sfx.ui keys). Unknown names are ignored.
   * @param {string} name
   * @param {{ volume?: number }} [o]
   */
  restartNotification() {
    this.sfx('broadcast', { volume: .65 });
  }

  sfx(name, o = {}) {
    try {
      const url = this.getManifest()?.audio?.sfx?.ui?.[name];
      if (typeof url === 'string') this._play(url, { volume: o.volume ?? 0.9 });
    } catch { /* ignore */ }
  }

  /** Battle sound by name (sfx.battle keys), limited like unit sounds. */
  battle(name, o = {}) {
    try {
      const url = this.getManifest()?.audio?.sfx?.battle?.[name];
      if (typeof url === 'string') this._play(url, { volume: o.volume ?? 0.7, limited: true, unitKey: o.unitKey ?? `b:${name}`, maxDuration:o.maxDuration });
    } catch { /* ignore */ }
  }

  /**
   * Per-unit sound (attack/hit/skill/die/born), throttled.
   * @param {string} defId charId/tokenId/enemyId (or chess id — mapped via its spine/char id by the caller)
   * @param {'attack'|'hit'|'skill'|'die'|'born'} kind
   * @param {number|string} unitId battle unit id (cooldown key)
   * @param {number} [skillIndex] the unit's equipped skill slot (0-based)
   * @param {boolean} [skillActive] whether that skill runs right now (`attacks` / `hits` need it, see header)
   * @returns {boolean} whether a unit-specific sound exists
   */
  unit(defId, kind, unitId, skillIndex, skillActive = false) {
    try {
      const u = this.getManifest()?.audio?.sfx?.units?.[defId];
      // DESIGN §16: the equipped skill's own ON_SKILL_START sound (`skills[index]`) when the manifest has it
      const combat = (kind === 'attack' || kind === 'hit') && skillActive && Number.isInteger(skillIndex) ? u?.skillCombat?.[skillIndex] : null;
      const own = kind === 'skill' && Number.isInteger(skillIndex) && u?.skills ? u.skills[skillIndex] : null;
      const table=kind==='attack'?u?.attacks:kind==='hit'?u?.hits:null;
      const mode=skillActive&&Number.isInteger(skillIndex)?table?.[skillIndex]:null;
      const indexedSkill = kind === 'skill' && Number.isInteger(skillIndex) && u?.skills && Object.hasOwn(u.skills,skillIndex);
      const url = combat?.[kind] || (indexedSkill ? own : typeof own === 'string' ? own : typeof mode==='string'?mode:u?.[kind]);
      if (typeof url !== 'string') return false;
      if ((kind === 'attack' || kind === 'hit') && !combat?.[kind] && typeof mode!=='string' && !normalAttackSfx(defId, url)) return false;
      // the official bank's mix (header): a silent roll still counts as the unit's own sound (no generic fallback)
      const mix = kind === 'skill' ? null : combat?.[kind] ? combat.mix?.[kind] : typeof mode==='string'?(kind==='attack'?u?.attackMix:u?.hitMix)?.[skillIndex]:u?.mix?.[kind];
      if (!unitSoundPlays(mix, this.random())) return true;
      this._play(url, { volume: unitGain(kind === 'attack' || kind === 'hit' ? 0.55 : 0.8, mix), limited: true, unitKey: `${unitId}:${kind}` });
      return true;
    } catch { return false; }
  }

  /** Three short targeting beeps; uses the existing mute/volume channel. */
  droneWarning(maxDuration = Infinity) {
    try {
      const c=this.ctx;if(!c||c.state!=='running'||!this.sfxGain)return;
      for(const delay of [0,.16,.32]){
        if(delay >= maxDuration)continue;
        const o=c.createOscillator(),g=c.createGain(),t=c.currentTime+delay;
        o.type='square';o.frequency.value=1100;g.gain.setValueAtTime(.01,t);g.gain.exponentialRampToValueAtTime(.001,t+.09);
        o.connect(g);g.connect(this.sfxGain);o.onended=()=>{o.disconnect();g.disconnect()};o.start(t);o.stop(Math.min(t+.1,c.currentTime+maxDuration));
      }
    } catch { /* Audio remains optional. */ }
  }

  // ---- operator battle voice ----------------------------------------------------------------------------------

  /**
   * Play an operator's battle line (`audio.voice[charId][slot]`, or `audio.voiceJp` when the 语音语言 setting is 日本語 —
   * voiceLine; a slot with several lines draws one at random).
   * Every caller is a running battle's own event stream or its settlement, except 选中干员: the detail panel opening on
   * an operator the player tapped, in every phase (ui/detailPanel.js `voice`; the owner's request of 2026-10-08). The
   * line must pass VoiceGate: one at a time, a global gap, a per-unit cooldown, higher priority wins.
   * @param {string} charId e.g. 'char_263_skadi'
   * @param {'start'|'faceEnemy'|'select'|'place'|'skill1'|'skill2'|'skill3'|'skill4'|'squad'|'squadFirst'
   *   |'resultFour'|'resultThree'|'resultTwo'|'resultLose'|'gacha'} slot
   * @param {{ unitKey?: string|number|null, volume?: number }} [o] `unitKey` = the cooldown key (a battle unit id)
   * @returns {boolean} whether such a line exists and started
   */
  voice(charId, slot, o = {}) {
    try {
      if (!this.ctx || !this.voiceGain || this.volumes.muted || this.volumes.voice <= 0) return false;
      if (typeof charId !== 'string' || typeof slot !== 'string') return false;
      const lang=voiceLangFor(charId,this.volumes.voiceLanguage,this.voiceOverrides);
      const line=voiceLine(this.getManifest()?.audio,charId,slot,lang);
      if(!line)return false;
      const {url,fallback}=line;
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const gateSlot=o.gateSlot || slot;
      const verdict = this.voiceGate.request(gateSlot, o.unitKey ?? null, now);
      if (verdict === 'drop') return false;
      this._stopVoice();
      this.voiceGate.start(gateSlot, o.unitKey ?? null, now);
      const token = ++this.voiceToken;
      this._playVoice(url, token, o.volume, fallback);
      return true;
    } catch (err) { this._warn('voice', err); return false; }
  }

  /**
   * A deployed operator of the current field, for a line that belongs to the battle rather than to one unit (结算).
   * @returns {string|null} charId, or null while no operator is on the field
   */
  anyOperator() {
    const out = [];
    for (const u of this.units.values()) {
      if (u && u.side !== 'enemy' && typeof u.def === 'string' && u.def.startsWith('char_')) out.push(u.def);
    }
    return out.length ? out[Math.floor(Math.random() * out.length)] : null;
  }

  /** Fetch/decode and start one voice line through the voice channel. */
  _playVoice(url, token, volume, fallback = null) {
    const failed = () => {
      if (token !== this.voiceToken) return;
      if (fallback && fallback !== url && this.ctx && this.voiceGain) this._playVoice(fallback, token, volume);
      else this.voiceGate.release();
    };
    this._buffer(url).then((buf) => {
      // a line that was taken over (or stopped) while it decoded must not start afterwards
      if (token !== this.voiceToken) return;
      if (!buf) { failed(); return; }
      if (!this.ctx || !this.voiceGain) { this.voiceGate.release(); return; }
      try {
        const src = this.ctx.createBufferSource();
        src.buffer = buf;
        const gain = this.ctx.createGain();
        gain.gain.value = Math.max(0, Math.min(1.5, Number.isFinite(volume) ? volume : 1));
        src.connect(gain); gain.connect(this.voiceGain);
        const node = { src, gain, url, token };
        let done = false;
        const end = () => {
          if (done) return;
          done = true;
          if (token === this.voiceToken) {
            if (this.voiceNode === node) this.voiceNode = null;
            this.voiceGate.release();
          }
          try { gain.disconnect(); } catch { /* ignore */ }
        };
        src.onended = end;
        setTimeout(end, (buf.duration + 0.3) * 1000); // safety if onended never fires
        src.start();
        this.voiceNode = node;
      } catch (err) { this._warn('voice-play', err); if (token === this.voiceToken) this.voiceGate.release(); }
    }, failed);
  }

  /** Fade the line on air out (a higher priority line is taking the channel over). */
  _stopVoice() {
    const cur = this.voiceNode;
    this.voiceNode = null;
    this.voiceToken += 1;              // a line still decoding must not start afterwards
    this.voiceGate.release();
    if (!cur || !this.ctx) return;
    try {
      const t = this.ctx.currentTime;
      cur.gain.gain.cancelScheduledValues(t);
      cur.gain.gain.setValueAtTime(cur.gain.gain.value, t);
      cur.gain.gain.setValueAtTime(0, t);
      cur.src.stop(t);
    } catch { /* ignore */ }
  }


  // ---- battle events ------------------------------------------------------------------------------------------

  /** Reset the unit map for a new field (m.field.units = UnitInfo[]). */
  setFieldUnits(units) {
    this.units.clear();
    // unit ids belong to one battle: a cast still held for a unit of the field left must not sound for a unit of the new
    // one that happens to share its id
    this.pendingSkill.clear();
    this.lastAttacker.clear();
    this.consumed.clear();
    // A new battle draws its start speaker from the field lineup, never enemies or the bench.
    this.startVoiceDone = false;
    try { this.voiceGate.reset(); this._stopVoice(); } catch { /* ignore */ }
    for (const u of Array.isArray(units) ? units : []) this._track(u);
    if (this.ctx) for (const u of this.units.values()) { const url=deploySfxUrl(this.getManifest(),u); if(url)this._buffer(url).catch(()=>{}); }
    this.startVoicePool = [...this.units.values()].filter(u => u.side !== 'enemy' && unitSoundClass(u) === 'char').map(u => u.def);
    this.warmVoices([...this.units.values()].filter(u=>u.kind==='op').map(u=>u.def));
  }

  _track(u) {
    if (!u || typeof u !== 'object' || u.id == null) return;
    // UnitInfo.spine is the model id (charId / tokenId / enemyId) — the key of sfx.units; kind/defId pick the
    // official class sounds (operator vs summon vs device)
    this.units.set(u.id, { def: u.charId || u.spine || u.defId, defId: u.defId ?? null, kind: u.kind ?? null, side: u.side, boss: !!u.boss,
      skillIndex: Number.isInteger(u.skillIndex) ? u.skillIndex : null, skillActive: !!u.skillActive });
    const held=this.pendingSkill.get(u.id);
    if(held){this.pendingSkill.delete(u.id);this.handleBattleEvents([held]);}
  }

  /** Play a resolved battle sound for a unit event, limited like unit sounds. */
  _playUnitUrl(url, unitKey, volume = 0.8) {
    if (typeof url === 'string') this._play(url, { volume, limited: true, unitKey });
  }

  /**
   * React to `b.ev` tuples (DESIGN §8.2).
   * @param {any[]} ev
   */
  handleBattleEvents(ev, {rate = 1} = {}) {
    if (!this.ctx || !Array.isArray(ev)) return;
    try {
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      for (const e of ev) {
        if (!Array.isArray(e)) continue;
        const kind = e[0];
        if (kind === 'spawn') { this._track(e[1]); continue; }
        if (kind === 'atk') {
          // a chain bounce: its first id is the previous target, whose attack sound this is not (see header)
          if (CHAIN_KINDS.has(e[3])) { this.lastAttacker.delete(e[2]); continue; }
          const src = this.units.get(e[1]);
          if (!src) continue;
          // only a hostile attack authors the target's next impact (a heal — an ally aiming at an ally — never does)
          const tgt = this.units.get(e[2]);
          if (tgt && tgt.side !== src.side) this.lastAttacker.set(e[2], { def: src.def, at: now, skillIndex: src.skillIndex ?? null, skillActive: !!src.skillActive });
          if (!this.unit(src.def, 'attack', e[1], src.skillIndex ?? undefined, src.skillActive) && src.side === 'enemy') this.battle('enemyHit', { unitKey: `${e[1]}:atk`, volume: 0.35 });
        } else if (kind === 'dmg') {
          const by = this.lastAttacker.get(e[1]);
          if (!by || !IMPACT_TYPES.has(e[3])) continue;
          this.lastAttacker.delete(e[1]); // one impact per attack
          if (now - by.at <= IMPACT_WINDOW_MS) this.unit(by.def, 'hit', `h${e[1]}`, by.skillIndex ?? undefined, by.skillActive);
        } else if (kind === 'heal') {
          this.battle('heal', { unitKey: `heal:${e[1]}`, volume: 0.35 });
        } else if (kind === 'skill') {
          const u = this.units.get(e[1]);
          if (u) {
            u.skillActive = !!e[2];
            if (!e[2]) continue;
            this.unit(u.def, 'skill', e[1], u.skillIndex ?? undefined);
            // 作战中N: the equipped skill's own slot (0-based; 作战中4 is the fallback of a 4th slot)
            if (unitSoundClass(u) === 'char') {
              const banks=this.getManifest()?.audio?.voice;
              const bank=banks?.[this.volumes.voiceLanguage]?.[u.def] || banks?.jp?.[u.def] || this.getManifest()?.audio?.voiceJp?.[u.def];
              const slots=['skill1','skill2','skill3','skill4'].filter(k=>bank?.[k]?.length);
              const n=Number(slots[Math.floor(Math.random()*slots.length)]?.slice(-1)) || 1;
              const condition=this.getManifest()?.audio?.voiceConditions?.[u.def]?.[u.skillIndex];
              this.voice(u.def, `skill${n}`, { unitKey: e[1], gateSlot: condition?.passive ? (condition.spCost>=10?'passiveImp':'passiveNor') : undefined });
            }
          } else {
            // The unit is not tracked yet. The sim emits the cast of a deployment that fires inside its own first tick
            // (`initSp` already at `spCost`, 宴's deploy-timed skill) BEFORE the unit's `['spawn', unitInfo]` — the same
            // batch or the next one — so the cue waits here and `_track` plays it when the spawn arrives. Only a skill
            // turning ON is a cast; a hold for a unit that never appears goes with the field (`setFieldUnits`).
            if (this.pendingSkill.size >= PENDING_SKILL_MAX) this.pendingSkill.delete(this.pendingSkill.keys().next().value);
            this.pendingSkill.set(e[1], e);
          }
        } else if (kind === 'skill') {
          // ['skill', id, 0] = the skill ENDED (the sim's skills.js: `b._ev(['skill', u.id, 0])`): back to the unit's own
          // attack / impact. The end carries no sound of its own (the activation sound belongs to the start).
          const u = this.units.get(e[1]);
          if (u) u.skillActive = false;
          this.pendingSkill.delete(e[1]);
        } else if (kind === 'engage') {
          // 行动开始: the first attack a unit makes on an enemy (the sim's ENGAGE, official ENCOUNTER_ENEMY, 3 s apart)
          const u = this.units.get(e[1]);
          if (u && unitSoundClass(u) === 'char') this.voice(u.def, 'faceEnemy', { unitKey: e[1] });
        } else if (kind === 'die') {
          const u = this.units.get(e[1]);
          if (!u) continue;
          const consumed = this.consumed.delete(e[1]);
          const m = this.getManifest();
          const url = deathSfxUrl(m, u, { consumed, reason: typeof e[2] === 'string' ? e[2] : null });
          if (!url) continue;
          const own = url === m?.audio?.sfx?.units?.[u.def]?.die;
          const mix = own ? m.audio.sfx.units[u.def].mix?.die : null;
          if (!unitSoundPlays(mix, this.random())) continue;
          this._playUnitUrl(url, own ? `${e[1]}:die` : `die:${e[1]}`, own ? unitGain(0.8, mix) : 0.7);
        } else if (kind === 'leak') {
          // 漏怪: an enemy reached its goal (Battle.leak emits the sim's own EV.LEAK — it is NOT a `die`, so until now a
          // leak was completely silent, for the player's own field and for a 联防 the helpers could not hold alike).
          // The cue is the ORIGINAL Arknights stage alarm — the one an enemy entering the exit plays in any normal
          // stage (manifest `sfx.battle.leak`, bank battle.ON_ENEMY_REACHED_EXIT, file b_ui_alarmenter).
          // `LEAK_SFX_GAP_MS` keeps it to one alarm at a time (the official bank's own maxSoundAllowed 1).
          if (now - (this.lastLeakSfxAt ?? -Infinity) < LEAK_SFX_GAP_MS) continue;
          if (typeof this.getManifest()?.audio?.sfx?.battle?.leak !== 'string') continue;
          this.lastLeakSfxAt = now;
          this.battle('leak', { unitKey: 'leak', volume: 0.85 });
        } else if (kind === 'deploy') {
          const u = this.units.get(e[1]);
          if (!u || u.side === 'enemy') continue;
          const m = this.getManifest();
          const url = deploySfxUrl(m, u);
          // The first deployment triggers a random lineup member’s battle-start line; subsequent events use place.
          // (a knocked-out operator redeploying in the same battle is one of the others; a summon says nothing).
          // Kept ahead of the deploy-SFX guards below: the voice channel is independent of the unit sound's roll.
          if (unitSoundClass(u) === 'char') {
            if (!this.startVoiceDone) {
              this.startVoiceDone = true;
              const pool = this.startVoicePool?.length ? this.startVoicePool : [u.def];
              const speaker = pool[Math.min(pool.length - 1, Math.floor(this.random() * pool.length))];
              if (!this.voice(speaker, 'start')) this.voice(u.def, 'place', { unitKey: e[1] });
            } else this.voice(u.def, 'place', { unitKey: e[1] });
          }

          if (!url) continue;
          const own = url === m?.audio?.sfx?.units?.[u.def]?.born;
          const mix = own ? m.audio.sfx.units[u.def].mix?.born : null;
          if (!unitSoundPlays(mix, this.random())) continue;
          this._playUnitUrl(url, `${e[1]}:born`, own ? unitGain(0.8, mix) : 0.75);
        } else if (kind === 'fx') {
          // a summon used up by its own effect (香槟炸弹 exploding: `consumed`): its impact sound now, no death sound
          const ex = e[4];
          if(e[1]==='bombardShell'&&ex?.vertical){
            const warningDuration = Math.max(0,((Number(ex.t)||3)-(Number(ex.fall)||.44))/Math.max(.01,rate));
            if(this.getManifest()?.audio?.sfx?.battle?.droneAim)this.battle('droneAim',{unitKey:`${ex.id}:aim`,volume:.22,maxDuration:warningDuration});
            else this.droneWarning(warningDuration);
            this.battle('droneCast',{unitKey:`${ex.id}:cast`});
          }
          if(e[1]==='bombard'&&ex?.kind==='emppnt')this.battle('droneImpact',{unitKey:`${ex.id}:impact`});
          if (!ex || typeof ex !== 'object' || !ex.consumed || ex.id == null) continue;
          const u = this.units.get(ex.id);
          if (!u || u.side === 'enemy') continue;
          this.consumed.add(ex.id);
          if (this.consumed.size > 200) this.consumed.delete(this.consumed.values().next().value);
          this.unit(u.def, 'hit', `${ex.id}:boom`);
        } else if (kind === 'bounty') {
          this.battle('killCoin', { unitKey: 'coin' });
        }
      }
    } catch (err) { this._warn('events', err); }
  }
}

let manifestGetter = () => null;
/** App-wide audio manager. */
export const audio = new AudioManager({ getManifest: () => manifestGetter() });

/**
 * Wire the singleton to the app (called once by main.js): manifest source, settings and store-driven BGM.
 * @param {{ getManifest: () => any, subscribe: (fn: (s:any, prev:any) => void) => () => void, getState: () => any,
 *   selectRoute: (s:any) => string, settings?: { bgm:number, sfx:number, voice:number, muted:boolean, voiceLang?:string } }} deps
 */
export function installAudio(deps) {
  try {
    manifestGetter = typeof deps?.getManifest === 'function' ? deps.getManifest : manifestGetter;
    audio.install();
    if (deps?.settings) { audio.setVolumes(deps.settings); audio.setVoiceLang(deps.settings.voiceLang, deps.settings.voiceOverrides); }
    if (typeof deps?.subscribe === 'function' && typeof deps?.getState === 'function') {
      const sync = (s) => {
        const priv = s.match?.private;
        const pieces = [...(priv?.board || []), ...(priv?.hand || []), ...(priv?.shop?.slots || [])];
        audio.warmVoices(pieces.filter(p=>p?.kind==='chess').map(p=>deps.getOperator?.(p.id)?.charId).filter(Boolean));
        try { audio.playBgm(bgmKeyFor(deps.selectRoute(s), s.match?.public, combatTrackFor(s.match?.public?.round))); } catch { /* ignore */ }
      };
      sync(deps.getState());
      return deps.subscribe((s, prev) => {
        if (s.match?.private !== prev?.match?.private) sync(s);
        else if (s.match?.public?.phase !== prev?.match?.public?.phase || s.room !== prev?.room || s.session !== prev?.session
          || s.match?.public?.bossId !== prev?.match?.public?.bossId || s.match?.public?.round !== prev?.match?.public?.round) sync(s);
      });
    }
  } catch (err) { console.warn('[audio] install failed', err); }
  return () => {};
}
