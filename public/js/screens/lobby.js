import {RichText} from '../ui/gameComponents.js';
import {lang}from'../i18n/i18n.js';
import {PublicRoomsScreen} from './publicRooms.js';
import { confirmDialog } from "../ui/components.js";
import { openStats } from '../ui/statsEntry.js';
import { lazyComponent, loadScreenStyles } from '../ui/lazyComponent.js';
const SweepReport = lazyComponent(() => Promise.all([import('./sweep.js'), loadScreenStyles(['/css/screens/sweep.css'])]).then(([module]) => module), 'SweepReport');

import { t } from '../../../shared/i18n.js';
// Lobby screen: pick 独立模拟 / 同盟模拟 and a difficulty (标准/险境/绝境/终极), create a room,
// or join one with a 同盟密钥 (recent codes remembered) — as a player (加入同盟) or in one of its MAX_SPECTATORS
// spectator seats (观战: room.spectate, also while its match runs; community report #26, a remake feature — the
// official room has none). Shows connection status + ping. The top bar opens the read-only S.W.E.E.P.报告
// (screens/sweep.js: 盟约 / 策略 / 敌方资料 and the enemy codex).
//
// Difficulty descriptions come from data/config.json `modes[modeId]` when present, else from the
// official act2autochess `modeDataDict` texts embedded below (desc + effectDescList), so the
// screen is complete before data is generated. Rounds: solo 标准 = 9, everything else 14 (+R15
// hidden core on 险境+), per research 00-INDEX §2. Battlefield pool (`modes[].stages`): 标准 always
// plays 战场#01, 险境 draws one of 8, 绝境 / 终极 one of 7 (m01 excluded).

import { TestMark } from '../ui/testConsole.js';
import { ResumeMatchButton } from '../ui/resumeMatch.js';
import { useEffect, useRef, useState } from '../../vendor/hooks.module.js';
import { DIFFICULTIES, DIFFICULTY_NAMES, DIFFICULTY_COLORS, ROOM_CODE_LEN, MAX_SEATS, MAX_SPECTATORS, MAX_SPECTATOR_SEATS, ERR, modeIdFor } from '../../../shared/constants.js';
import { html, Button, Icon, MicroLabel, Panel, TextField, PingPill, OnlinePill, AvatarFrame, Tooltip, Spinner, Modal, DifficultyIcon, doctorNo } from '../ui/components.js';
import { toast, toastError } from '../ui/toasts.js';
<<<<<<< ours
import { GuideButton } from '../ui/guide.js';
=======
import { GuideButton, openGuide } from '../ui/guide.js';
import { RadarScene, CreateArt, JoinArt } from '../ui/allyArt.js';
import { ProtocolScene } from '../ui/protocolScene.js';
import { AchievementDialog, useStatsOpen } from './stats.js';
import { SweepReport } from './sweep.js';
import { Emblem } from './title.js';
import { AllianceBackdrop, useLobbyArt } from '../ui/allianceScene.js';
import { RegulationBackdrop, REGULATION, REGULATION_ART } from '../ui/regulationBackdrop.js';
>>>>>>> theirs
import { SettingsButton } from '../ui/settings.js';
import { PatchNotesButton } from '../ui/patchNotes.js';
import { LoadoutButton } from '../ui/loadoutEntry.js';
import { net, identity } from '../net.js';
import { store, useStore, shallowEqual, loadPref, savePref } from '../store.js';
<<<<<<< ours
import { getConfig, getMode, getStage, useData } from '../data.js';
import { loadCustomExtensionPrefs } from '../ui/customExtensionPrefs.js';
=======
import { data, getConfig, getMode, getStage, localAsset, useData } from '../data.js';
import { t, tc, N_ } from '../../../shared/i18n.js';
import { scriptOf } from '../../../shared/i18nPacks.js';
import { NoticesButton } from '../ui/notices.js';
import { VersionSwitch } from '../ui/versionPicker.js';
import { contentSet, retryContentSet } from '../content.js';
import { DEFAULT_VERSION, lobbyVersion, offeredDifficulties, fallbackDifficulty, ladderModes, ladderPick, seasonOf, soloTimedOf, soloTimeMsgid, versionLabel } from '../versions.js';
>>>>>>> theirs

/** Official mode texts (activity_table act2autochess.modeDataDict), fallback when config.json is absent. */
export const MODE_TEXT = {
  single: {
    FUNNY: { code: 'AC-1', desc: '时长较短的模拟训练', effects: ['可以快速完成作战', '常规奖励'] },
    NORMAL: { code: 'AC-2', desc: '敌方攻击强度较高的模拟训练', effects: ['可使用盟约数增加', '大幅增加奖励'] },
    HARD: { code: 'AC-3', desc: '敌方攻击强度极高的模拟训练', effects: ['作战环境困难', '出现更加危险的敌人'] },
    ABYSS: { code: 'AC-4', desc: '敌方攻击强度到达极限的模拟训练', effects: ['作战环境无比困难', '出现极度危险的敌人'] },
  },
  multi: {
    FUNNY: { code: 'AC-1', desc: '敌方攻击强度较低的模拟训练', effects: ['作战环境较为温和', '常规奖励'] },
    NORMAL: { code: 'AC-2', desc: '敌方攻击强度较高的模拟训练', effects: ['可使用盟约数增加', '大幅增加奖励'] },
    HARD: { code: 'AC-3', desc: '敌方攻击强度极高的模拟训练', effects: ['作战环境困难', '出现更加危险的敌人'] },
    ABYSS: { code: 'AC-4', desc: '敌方攻击强度到达极限的模拟训练', effects: ['作战环境无比困难', '出现极度危险的敌人'] },
  },
};

/** Battlefield pool per difficulty when config.json is absent (the modes' `stages` lists; same for solo and co-op). */
export const STAGE_POOL = { FUNNY: ['act1autochess_m01'], NORMAL: 8, HARD: 7, ABYSS: 7 };

/**
 * Display name of a stage: stages.json when it is loaded, else derived from the id (act1 m0N → 战场#0N, act2 m0N → 战场#0(N+4)).
 * @param {string} id e.g. 'act1autochess_m01'
 */
export function stageLabel(id) {
  const rec = getStage(id);
  if (rec && typeof rec.name === 'string' && rec.name) return rec.name.split(/\s+/)[0];
  const m = String(id || '').match(/^act(\d)autochess_m(\d+)$/);
  return m ? `战场#${String(Number(m[2]) + (m[1] === '2' ? 4 : 0)).padStart(2, '0')}` : '';
}

/**
 * The battlefield note of a difficulty (official wording): a single-stage pool is fixed ("战场固定为 战场#01"), a larger
 * one is drawn at random ("战场随机（共8张）").
 * @param {string[] | number | null | undefined} stages the mode's `stages` list (or a count)
 * @returns {string} '' when unknown
 */
export function stageNote(stages) {
  if (Array.isArray(stages)) {
    const ids = stages.filter((s) => typeof s === 'string' && s);
    if (ids.length === 1) { const name = stageLabel(ids[0]); return name ? `战场固定为 ${name}` : '战场固定'; }
    return ids.length > 1 ? `战场随机（共${ids.length}张）` : '';
  }
  return Number.isInteger(stages) && stages > 1 ? `战场随机（共${stages}张）` : '';
}

const syncMode = (m) => m === 'sync' || m === 'sync8';

/** The simulation kinds of the left column; the other cards (laboratory, practice) are the right column's quick entries. */
const MAIN_MODES = ['solo', 'coop', 'sync'];

const MODE_CARDS = [
  {
    id: 'solo', name: '独立模拟', en: 'SOLO SIMULATION', icon: 'user',
    desc: '独自调配资金与干员，以自己的节奏完成整场模拟。',
    points: ['1 名博士', '休整期与机变阶段不限时'],
  },
  {
    id: 'coop', name: '同盟模拟', en: 'ALLIANCE SIMULATION', icon: 'users',
    desc: '최대 4명의 박사가 오퍼레이터 풀을 공유하며 함께 전투합니다.',
    points: [`1–${4} 名博士 · 可由 AI 队友补位`, '联防阶段 · 最终攻势合并生命值'],
  },
  {
    id: 'sync', name: '동기화 시뮬레이션', en: 'SYNC SIMULATION', icon: 'link',
    desc: '모든 전장에 같은 적이 나오고, 적의 HP를 함께 공유합니다.',
    points: ['박사 1–4명 · HP 공유', '연합 방어 없음 · HP 감소 상한 × 인원'],
  },
  { id: 'laboratory', name: '실험실', en: 'LABORATORY', icon: 'flask', desc: '맵·보스·전략을 직접 고르고 원하는 조합을 시험합니다.', points: ['솔로 플레이 · 밴 없음', '한 라운드 전투 · 결과 통계 기록'] },
  { id:'practice',name:'연습실',en:'PRACTICE',icon:'flask',desc:'원하는 라운드부터 일반 게임처럼 연습합니다.',points:['솔로 플레이 · 무제한 자금','라운드·적 특훈·맹약 밴 선택'] },
];

/**
 * Text for a difficulty card, preferring data/config.json.
 * @param {'solo'|'coop'} roomMode
 * @param {string} difficulty
 * @returns {{ code: string, desc: string, effects: string[], rounds: number, hidden: boolean, stageNote: string }}
 */
export function difficultyInfo(roomMode, difficulty) {
  const fallback = MODE_TEXT[roomMode === 'solo' ? 'single' : 'multi'][difficulty] || { code: '', desc: '', effects: [] };
  // modeIdFor() lower-cases the difficulty: never call it with a value the server did not validate.
  const m = DIFFICULTIES.includes(difficulty) ? getMode(modeIdFor(roomMode, difficulty)) : null;
  const effects = Array.isArray(m?.effectDescList)
    ? m.effectDescList.map((e) => String(e).replace(/^[·•\s]+/, '')).filter(Boolean)
    : fallback.effects;
  const rounds = Number.isFinite(m?.lastRound) ? m.lastRound : roomMode === 'solo' && difficulty === 'FUNNY' ? 9 : 14;
  return {
    code: typeof m?.code === 'string' ? m.code : fallback.code,
    desc: typeof m?.desc === 'string' ? m.desc : fallback.desc,
    effects,
    rounds,
    hidden: difficulty !== 'FUNNY',
    stageNote: stageNote(Array.isArray(m?.stages) && m.stages.length ? m.stages : STAGE_POOL[difficulty]),
  };
}

/**
 * Text for one official mode of a laddered room mode (规程's 极速模拟 / 规程等级 n: data/config.json `modes[modeId]`), in
 * difficultyInfo's shape plus its own name, colour and difficulty (FAST, 极速模拟's, shows as 标准 where a difficulty is needed).
 * @param {string} modeId
 * @returns {{ name: string, color: string, difficulty: string, code: string, desc: string, effects: string[], rounds: number, hidden: boolean, stageNote: string, offBonds: string[] }}
 */
export function modeInfo(modeId) {
  const m = getMode(modeId) || {};
  const difficulty = DIFFICULTIES.includes(m.difficulty) ? m.difficulty : 'FUNNY';
  // the rounds / battlefield fallbacks of the difficulty (its desc and effects are the mode's own below: a laddered solo's
  // mode_single_funny is 极速模拟, whose 「时长较短的模拟训练」 is no 规程等级's)
  const base = difficultyInfo('coop', difficulty);
  const off = Array.isArray(m.inactiveBondIds) ? m.inactiveBondIds : [];
  return {
    ...base,
    name: typeof m.name === 'string' ? m.name : modeId,
    color: typeof m.color === 'string' && /^#?[0-9a-f]{6}$/i.test(m.color) ? (m.color.startsWith('#') ? m.color : `#${m.color}`) : DIFFICULTY_COLORS[difficulty],
    difficulty,
    code: typeof m.code === 'string' ? m.code : '',
    // its own text (规程等级5 追加更多盟约, 9 追加更多敌人 …), else the difficulty's general one — never another mode's own,
    // which names that mode's unlocks (险境模拟: 「解锁时可开放至【规程等级3】」)
    desc: typeof m.desc === 'string' && m.desc ? m.desc : t(MODE_TEXT.multi[difficulty]?.desc || ''),
    effects: Array.isArray(m.effectDescList) ? m.effectDescList.map((e) => String(e).replace(/^[·•・･\s]+/, '')).filter(Boolean) : [],
    rounds: Number.isFinite(m.lastRound) ? m.lastRound : base.rounds,
    hidden: Number.isFinite(m.hiddenRound),
    stageNote: stageNote(Array.isArray(m.stages) ? m.stages : []),
    offBonds: off.map((id) => data.lookup('bonds', id)?.name || id),
  };
}

const CODE_RE = new RegExp(`^[A-Z0-9]{${ROOM_CODE_LEN}}$`);
/**
 * Normalise user input into a room code: accepts a pasted invite link (`…?room=ABCD`), keeps
 * upper-cased alphanumerics and clamps to the code length.
 * @param {string} v
 * @returns {string}
 */
export function normalizeCode(v) {
  let s = String(v ?? '');
  const m = s.match(/[?&]room=([A-Za-z0-9]+)/);
  if (m) s = m[1];
  const jamo='ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎㅏㅐㅑㅒㅓㅔㅕㅖㅗㅛㅜㅠㅡㅣ';
  const keys='rRseEfaqQtTdwWczxvgkoiOjpuPhynbml';
  // Decompose completed Korean syllables as well as uncombined IME consonants/vowels.
  const initials='ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
  const vowels=['ㅏ','ㅐ','ㅑ','ㅒ','ㅓ','ㅔ','ㅕ','ㅖ','ㅗ','ㅗㅏ','ㅗㅐ','ㅗㅣ','ㅛ','ㅜ','ㅜㅓ','ㅜㅔ','ㅜㅣ','ㅠ','ㅡ','ㅡㅣ','ㅣ'];
  const finals=['','ㄱ','ㄲ','ㄱㅅ','ㄴ','ㄴㅈ','ㄴㅎ','ㄷ','ㄹ','ㄹㄱ','ㄹㅁ','ㄹㅂ','ㄹㅅ','ㄹㅌ','ㄹㅍ','ㄹㅎ','ㅁ','ㅂ','ㅂㅅ','ㅅ','ㅆ','ㅇ','ㅈ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];
  s=[...s].map(ch=>{
    const n=ch.codePointAt(0)-0xAC00;
    const text=n>=0&&n<11172?initials[Math.floor(n/588)]+vowels[Math.floor(n%588/28)]+finals[n%28]:ch;
    return [...text].map(c=>{
      const compat=c;
      const idx=jamo.indexOf(compat);return idx>=0?keys[idx]:c;
    }).join('');
  }).join('');
  return s.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, ROOM_CODE_LEN);
}

/**
 * A handler that Preact binds as `onClick=${fn}` receives the click EVENT as its first argument, and a default
 * parameter only applies to `undefined` — so `fn(c = code)` would normalise the event target into a nonsense code
 * (`String(el)` → `"[object HTMLElement]"` → "OBJE"). Only a string is ever a code; anything else falls back to the
 * input field. Returns null when neither yields a well-formed code.
 * @param {unknown} arg the argument a handler was called with
 * @param {string} field the current input-field value
 * @returns {string|null}
 */
export function codeArg(arg, field) {
  const k = normalizeCode(typeof arg === 'string' ? arg : field);
  return CODE_RE.test(k) ? k : null;
}

/**
 * Room code from a deep link query string (`?room=CODE`), or null when absent/malformed.
 * Accepts ROOM_CODE_LEN..ROOM_CODE_LEN+2 alphanumerics (the protocol's join limit).
 * @param {string} search e.g. location.search
 * @returns {string|null}
 */
export function parseRoomParam(search) {
  try {
    const raw = new URLSearchParams(search || '').get('room');
    if (!raw) return null;
    const code = raw.trim().toUpperCase();
    if (!/^[A-Z0-9]+$/.test(code)) return null;
    return code.length >= ROOM_CODE_LEN && code.length <= ROOM_CODE_LEN + 2 ? code : null;
  } catch {
    return null;
  }
}

/** Recently joined/created co-op room codes (most recent first). */
export function recentRooms() {
  const list = loadPref('recentRooms', []);
  return Array.isArray(list) ? list.filter((c) => typeof c === 'string' && CODE_RE.test(c)).slice(0, 4) : [];
}

/** @param {string} code */
export function rememberRoom(code, test = false) {
  if (!CODE_RE.test(code)) return;
  const recent = [code, ...recentRooms().filter((c) => c !== code)].slice(0, 4);
  const marks = loadPref('recentTestRooms', []);
  savePref('recentTestRooms', recent.filter(c => c === code ? test : Array.isArray(marks) && marks.includes(c)));
  savePref('recentRooms', recent);
}

export async function joinKnown(type, key) {
  try { return await net.request(type, { code: key }); } catch (err) {
    if (err?.code !== ERR.TEST_CONFIRM) throw err;
    const text = type === 'room.spectate'
      ? t('这是测试房间，不计入任何记录。确认观战？')
      : t('这是测试房间，不计入任何记录。确认加入？');
    if (await confirmDialog({ title: t('测试'), text })) {
      return net.request(type, { code: key, testAck: true });
    }
  }
}

const FALLBACK_TIPS = [
  '联合模拟在选择策略时可以进行一次跳过',
  '调度中心即使冻结，依然可以主动刷新',
  '两件同名装备可以合成一件更强力的装备',
  '只有达成完美作战的队友可以进行联防',
];
const TIP_ROTATE_MS = 5000; // matchingTipRotateInterval

/** Rotating tactical tips (config.json `tips`, weighted list of { tip, weight }). */
function TipsPanel() {
  const cfg = getConfig();
  const tips = Array.isArray(cfg?.tips)
    ? cfg.tips.map((t) => (typeof t === 'string' ? t : t?.tip)).filter((t) => typeof t === 'string' && t)
    : FALLBACK_TIPS;
  const list = tips.length ? tips : FALLBACK_TIPS;
  const [idx, setIdx] = useState(() => Math.floor(Math.random() * list.length));
  useEffect(() => {
    const id = setInterval(() => setIdx((i) => i + 1), TIP_ROTATE_MS);
    return () => clearInterval(id);
  }, []);
  const i = ((idx % list.length) + list.length) % list.length;
  return html`<div class="tips brackets">
    <div class="tips__head">
      <${Icon} name="info" />
      <span>作战提示</span>
      <${MicroLabel}>TACTICAL TIPS<//>
      <span class="tips__idx num">${String(i + 1).padStart(2, '0')}<span class="t-dim">/${String(list.length).padStart(2, '0')}</span></span>
      <button type="button" class="tips__nav" onClick=${() => setIdx(i - 1 + list.length)} aria-label="上一条"><${Icon} name="chevronLeft" /></button>
      <button type="button" class="tips__nav" onClick=${() => setIdx(i + 1)} aria-label="下一条"><${Icon} name="chevronRight" /></button>
    </div>
    <p key=${i} class="tips__text">${list[i]}</p>
  </div>`;
}

function ModeCard({ card, selected, onSelect, coopSize=4, onCoopSize, publicOn, onPublicChange, full=false }) {
  if(card.id==='coop'&&coopSize===8)card={...card,desc:'최대 8명의 박사가 오퍼레이터 풀을 공유하며 함께 전투합니다.',points:['박사 1–8명 · 빈자리는 AI 팀원으로','협력방어 최대 4명']};
  if(card.id==='sync'&&coopSize===8)card={...card,points:['박사 1–8명 · HP 공유','연합 방어 없음 · HP 감소 상한 × 인원']};
  const sized=card.id==='coop'||card.id==='sync';
  return html`<div class="mode-card-tip"><div role="button" tabindex="0" class=${`mode-card brackets${['laboratory','practice'].includes(card.id)&&!full?' mode-card--lab':''}${selected ? ' is-selected' : ''}`} onClick=${() => onSelect(sized&&coopSize===8?card.id+'8':card.id)} onKeyDown=${e=>{if(e.target===e.currentTarget&&['Enter',' '].includes(e.key)){e.preventDefault();onSelect(sized&&coopSize===8?card.id+'8':card.id);}}}
      aria-pressed=${selected ? 'true' : 'false'}>
    <span class="mode-card__bg" aria-hidden="true"></span>
    <span class="mode-card__icon"><${Icon} name=${card.icon} /></span>
    <span class="mode-card__text">
      <${MicroLabel} tone=${selected ? 'mint' : undefined}>${card.en}<//>
      <span class="mode-card__name">${card.name}</span>
      <${RichText} class="mode-card__desc" text=${card.desc} />
      <span class="mode-card__points">${card.points.map((p) => html`<span key=${p}>${p}</span>`)}</span>
    </span>
    <span class="mode-card__check" aria-hidden="true"><${Icon} name="check" />已选定</span>
    ${sized?html`<div class="mode-card__controls">
      <span class="mode-card__sizes" role="group" aria-label="협동 인원">${[4,8].map(n=>html`<button type="button" aria-pressed=${coopSize===n} onClick=${e=>{e.stopPropagation();onCoopSize(n);}}>${t('{0}인',[n])}</button>`)}</span>
      <label class="mode-card__spectate mode-card__public create-box__check" onClick=${e=>e.stopPropagation()} onKeyDown=${e=>e.stopPropagation()}>
        <input type="checkbox" role="switch" class="ui-switch" aria-label="공개" checked=${publicOn} onChange=${e=>onPublicChange(!!e.currentTarget.checked)}/><${Icon} name="users"/><span>공개</span>
      </label>
    </div>`:null}
  </div></div>`;
}

<<<<<<< ours
function DifficultyCard({ roomMode, difficulty, selected, onSelect }) {
  const info = difficultyInfo(['laboratory','practice'].includes(roomMode)?'solo':syncMode(roomMode)?roomMode.replace('sync','coop'):roomMode, difficulty);
  return html`<button type="button" class=${`diff-card${selected ? ' is-selected' : ''}`}
      style=${`--d-color:${DIFFICULTY_COLORS[difficulty]}`} onClick=${() => onSelect(difficulty)} aria-pressed=${selected ? 'true' : 'false'}>
    <span class="diff-card__bar" aria-hidden="true"></span>
    <span class="diff-card__head">
      <${DifficultyIcon} difficulty=${difficulty} class="diff-card__glyph" />
      <span class="diff-card__name">${DIFFICULTY_NAMES[difficulty]}</span>
      <span class="diff-card__code num">${info.code}</span>
      <span class="diff-card__meta">
        ${roomMode==='laboratory'?html`<span>1회 전투</span>`:html`<span class="num">${info.rounds}</span> 回合${info.hidden ? html`<span class="diff-card__hidden">+ 隐秘核心</span>` : null}`}
      </span>
    </span>
    <${RichText} class="diff-card__desc" text=${info.desc} />
    <span class="diff-card__effects">${(roomMode==='laboratory'?['밴 없음','일반·히든 보스 선택 가능']:info.effects).map((e) => html`<span key=${e}>${e}</span>`)}${roomMode!=='laboratory'&&info.stageNote ? html`<span key="stage" class="diff-card__stage"><${Icon} name="rook" />${info.stageNote}</span>` : null}</span>
    <span class="diff-card__check" aria-hidden="true"><${Icon} name="check" /><span>已选定</span></span>
  </button>`;
}

=======
/**
 * A laddered room mode's choice (规程's solo, instead of the four difficulty cards): 极速模拟 — its modes outside the ladder —
 * as a card, then 规程等级 1–20 as numbered cells in rows by difficulty, each row named and coloured by its difficulty.
 * `disabled`: shown, not chosen (a room's other doctors).
 */
function LadderList({ ladder, modeId, onMode, disabled = false }) {
  const side = ladder.filter((m) => !DIFFICULTIES.includes(m.difficulty));
  const rows = DIFFICULTIES.map((d) => ({ d, modes: ladder.filter((m) => m.difficulty === d) })).filter((r) => r.modes.length);
  const num = (m) => /(\d+)$/.exec(m.name)?.[1] ?? m.code;
  return html`<div class="ladder" data-testid="proto-ladder">
    ${side.map((m) => { const info = modeInfo(m.id); return html`<button key=${m.id} type="button" class=${`pcard diff-card ladder__side${m.id === modeId ? ' is-on is-selected' : ''}`}
        style=${`--d-color:${info.color}`} disabled=${disabled} onClick=${() => onMode(m.id)} aria-pressed=${m.id === modeId ? 'true' : 'false'} data-mode=${m.id}>
      <span class="pcard__glow" aria-hidden="true"></span>
      <span class="pcard__head"><span class="pcard__name">${info.name}</span></span>
      <span class="pcard__desc">${info.desc}</span>
      <span class="pcard__meta">${info.code ? html`<span class="num">${info.code}</span>` : null}<${DifficultyRounds} info=${info} /></span>
      <span class="pcard__stamp" aria-hidden="true"><${StampRing} /><span class="pcard__tick"><${Icon} name="check" /></span><span class="pcard__ok">${t('已选定')}</span></span>
    </button>`; })}
    <div class="ladder__grid" role="group" aria-label=${t('规程等级')}>
      ${rows.map(({ d, modes }) => html`<div key=${d} class="ladder__row" style=${`--d-color:${DIFFICULTY_COLORS[d]}`}>
        <span class="ladder__tier"><${DifficultyIcon} difficulty=${d} />${t(DIFFICULTY_NAMES[d])}</span>
        <span class="ladder__cells">${modes.map((m) => html`<button key=${m.id} type="button" class=${`ladder__cell num${m.id === modeId ? ' is-on' : ''}`}
            disabled=${disabled} onClick=${() => onMode(m.id)} aria-pressed=${m.id === modeId ? 'true' : 'false'} title=${`${m.name} · ${m.code}`} data-mode=${m.id}>${num(m)}</button>`)}</span>
      </div>`)}
    </div>
  </div>`;
}

/**
 * How much 选择模拟协议's cards show on a screen taller than 520 px (§35.18's leftover there: at 大 / 特大, in a small
 * window or a long language the four cards ran under 开始独立模拟, 终极模拟 out of view, even at 小 in 16:9 by a few px):
 * the first level at which they fit their column — 'full' (the name, the description, the effects, the rounds), 'brief'
 * (the description only in the brief at the left, where the chosen difficulty's already is), 'names' (a line each, as on
 * a phone; the brief adds the chosen difficulty's effects and rounds). A list that still does not fit scrolls.
 * `overflows(level)` lays the cards out at that level and says whether they spill. [ASSUMED] the levels and their order
 */
export const CARD_FIT_LEVELS = ['full', 'brief', 'names'];
export function pickCardFit(overflows) {
  return CARD_FIT_LEVELS.find((level) => !overflows(level)) || CARD_FIT_LEVELS[CARD_FIT_LEVELS.length - 1];
}

/**
 * Sets 选择模拟协议's `data-fit` (pickCardFit; css/screens/lobby.css) before the screen paints: at every render (a new
 * difficulty, language or label), when the list's box changes (the window, 文字大小 through the header and the button) and
 * whenever a font finishes loading (a web font that arrives late — after a resize, say — makes the lines taller). A level
 * only changes what the cards show, never the list's box, so measuring cannot loop.
 */
function ProtoFit() {
  const ref = useRef(null);
  const fit = () => {
    const body = ref.current?.closest('.proto__body');
    const list = body?.querySelector('.proto-list');
    if (!list) return;
    body.dataset.fit = pickCardFit((level) => { body.dataset.fit = level; return list.scrollHeight > list.clientHeight + 1; });
  };
  useLayoutEffect(fit);
  useLayoutEffect(() => {
    const list = ref.current?.closest('.proto__body')?.querySelector('.proto-list');
    if (!list) return undefined;
    let live = true;
    const refit = () => { if (live) fit(); };
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(refit) : null;
    ro?.observe(list);
    const fonts = document.fonts;
    fonts?.ready?.then(refit);
    fonts?.addEventListener?.('loadingdone', refit);
    return () => { live = false; ro?.disconnect(); fonts?.removeEventListener?.('loadingdone', refit); };
  }, []);
  return html`<i ref=${ref} class="proto__fit" hidden></i>`;
}

/**
 * One of the two entries at the bottom right of the hub (独立模拟 / 同盟模拟), with its line above it: opens its dialog.
 * `timePoint` (the solo card only): the version's time rule after 「1 名博士」. Absent, the markup is today's — the
 * co-op card's long/short pair, or the solo card's single line. `timeShort` replaces the phone line; absent, the phone
 * keeps points[0] (「1 名博士」).
 */
export function HubEntry({ card, onOpen, timePoint = null, timeShort = null }) {
  const line = timePoint
    ? html`<span class="hub-entry__long">${t(card.points[0], card.pointParams)} · ${t(timePoint)}</span><span class="hub-entry__short">${timeShort ? t(timeShort) : t(card.points[0], card.pointParams)}</span>`
    : card.pointShort
      ? html`<span class="hub-entry__long">${t(card.points[0], card.pointParams)}</span><span class="hub-entry__short">${t(card.pointShort, card.pointParams)}</span>`
      : t(card.points[0], card.pointParams);
  return html`<div class="hub-entry-wrap">
    <span class="hub-entry__group"><${Icon} name=${card.icon} />${line}</span>
    <button type="button" class=${`mode-card hub-entry hub-entry--${card.id}`} data-mode=${card.id} onClick=${() => onOpen(card.id)}
        title=${t(card.desc, card.params)}>
      <span class="hub-entry__icon" aria-hidden="true"><${Icon} name=${card.icon} /></span>
      <span class="hub-entry__en">${card.en}</span>
      <span class="hub-entry__name">${t(card.name)}</span>
      <span class="hub-entry__corner" aria-hidden="true"></span>
    </button>
  </div>`;
}

/**
 * The hub's top-left 成就统计 card (#643's, from the event video) — the lobby's statistics entry: a dusk scene with the
 * emblem, the trophy medal and count, and the label strip with the LV, all from this browser's records (ui/stats.js
 * peekStatsRecords, read only; no account). The LV is counted as the settlement counts it (screens/settle.js
 * levelProgress), the trophies as the window it opens counts them (ui/stats.js aggregateStats, the same number as its
 * 获得奖杯 and 统计数据's). Read again whenever 统计数据 closes (an import or 清空 there changes them). Opens the 成就统计
 * window (screens/stats.js AchievementDialog; its 查看完整统计 opens 统计数据).
 */
function AchievementCard({ onOpen }) {
  useData('config'); useData('assets');
  const cfg = data.get('config');
  const statsOpen = useStatsOpen();
  // the LV of the season shown (DESIGN §35.23: 第一期's records count toward 第一期's levels)
  const season = useStore((s) => seasonOf(lobbyVersion(s)));
  const { prog, trophies } = useMemo(() => {
    const records = recordsOfSeason(peekStatsRecords(), season);
    return { prog: levelProgress(records, { counted: false, rewards: cfg?.rewards }), trophies: aggregateStats(records).trophies };
  }, [cfg, statsOpen, season]);
  const lv = levelOf(prog.before, cfg?.rewards?.milestones);
  const medal = trophyMedalOf(trophies, cfg?.trophies?.medals);
  return html`<button type="button" class="hub-ach" onClick=${onOpen} title=${t('成就统计（本机记录）')}>
    <span class="hub-ach__scene" aria-hidden="true">
      <svg class="hub-ach__land" viewBox="0 0 320 110" preserveAspectRatio="none">
        <defs><linearGradient id="hubAchSky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#2a2114" /><stop offset=".5" stop-color="#b8741c" /><stop offset="1" stop-color="#f0a636" /></linearGradient></defs>
        <rect width="320" height="110" fill="url(#hubAchSky)" />
        <path d="M0 110V80l28-12 22 9 34-27 27 18 30-13 41 23 27-11 31 17 33-21 47 25V110z" fill="#3a2a16" />
        <path d="M0 110V94l46-11 41 8 50-15 44 13 50-9 40 11 49-7V110z" fill="#18120b" />
        <path d="M262 110V70M262 80l-9-8M262 76l8-7M262 86l10-6" stroke="#18120b" stroke-width="2.5" fill="none" />
      </svg>
      <span class="hub-ach__mark"><${Emblem} /></span>
      <span class="hub-ach__rank">
        <${Img} src=${medal ? uiUrl(data.get('assets'), `medalIcon/${medal.iconId}`) : null} class="hub-ach__medal" fallback=${html`<${Icon} name="rook" />`} />
        <small><${Icon} name="crown" /><b class="num">${trophies}</b></small>
      </span>
    </span>
    <span class="hub-ach__label">
      <${AchBadge} class="hub-ach__badge" />
      <span>${t('成就统计')}</span><b class="hub-ach__lv num">LV.${lv.lv}</b>
    </span>
  </button>`;
}

/** The 成就统计 label's badge (original drawing). */
function AchBadge({ class: cls }) {
  return html`<svg class=${cls} viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 3h14v12l-7 6-7-6zm4 5v2h2V8zm4 0v2h2V8zm-4.5 4.2a4.5 4.5 0 0 0 7 0l-1.3-1a3 3 0 0 1-4.4 0z" fill-rule="evenodd" /></svg>`;
}

/**
 * 成就统计 on short screens (≤ 520 px tall, a phone in landscape), where the left column with the card gives way: a plate
 * under S.W.E.E.P. and 干员调配 that opens the same window, so the lobby keeps its statistics entry there too [ASSUMED: a
 * remake layout for small screens; css/screens/lobby.css shows it only then].
 */
function AchievementPlate({ onOpen }) {
  return html`<button type="button" class="hub-plate hub-plate--ach" onClick=${onOpen} title=${t('成就统计（本机记录）')}>
    <span class="hub-plate__glyph"><${AchBadge} /></span>
    <span class="hub-plate__label">${t('成就统计')}</span>
  </button>`;
}

/** A tile of the hub's left column (密钥加入). */
function HubTile({ icon, label, en, onClick, class: cls = '' }) {
  return html`<button type="button" class=${`hub-tile ${cls}`} onClick=${onClick}>
    <span class="hub-tile__icon" aria-hidden="true"><${Icon} name=${icon} /></span>
    <span class="hub-tile__text"><span class="hub-tile__label">${label}</span><span class="hub-tile__en">${en}</span></span>
  </button>`;
}

/** Crossed blades in a hexagon: the S.W.E.E.P. plate's glyph (original drawing). */
function SweepGlyph() {
  return html`<svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">
    <path d="M16 2.5 27.7 9.2v13.6L16 29.5 4.3 22.8V9.2z" fill="none" stroke="currentColor" stroke-width="1.5" />
    <path d="M9 9l12.5 12.5M23 9 10.5 21.5" stroke="currentColor" stroke-width="2.2" />
    <path d="M19.2 23.8l4.6-4.6M8.2 19.2l4.6 4.6M21.6 21.6l2.2 2.2M10.4 21.6l-2.2 2.2" stroke="currentColor" stroke-width="1.8" />
  </svg>`;
}

/** S.W.E.E.P.报告: a light plate with bracket marks; opens the report (screens/sweep.js). */
function SweepPlate({ onClick }) {
  return html`<button type="button" class="hub-plate hub-plate--sweep lobby-sweep" onClick=${onClick} title=${t('S.W.E.E.P.报告：盟约、策略与敌方资料')}>
    <span class="hub-plate__glyph"><${SweepGlyph} /></span>
    <span class="hub-plate__label">${t('S.W.E.E.P.报告')}</span>
    <span class="hub-plate__tag">REPORT</span>
  </button>`;
}

/**
 * The event's lobby backdrop: its night map giving way to the dusk dunes on a 20 s cycle, as the recording of the
 * official event shows it (ui/allianceScene.js; still under reduced motion). Until those sprites have loaded — a
 * listed URL whose file fails never counts — the entry's glow (`entry/entry_bkg_01`) and Rhodes Island hologram
 * (`entry/entry_bkg_02`) over a dark field with a faint grid; without the art pack only the field and the grid.
 */
function HubBackdrop({ season = null }) {
  const alliance = useLobbyArt();
  return html`<div class="hub-bg" aria-hidden="true">
    ${season === REGULATION ? html`<${RegulationBackdrop} />` : alliance ? html`<${AllianceBackdrop} />` : html`
    <${Sprite} k="entry/entry_bkg_01" class="hub-bg__glow" />
    <${Sprite} k="entry/entry_bkg_02" class="hub-bg__ship" />
    <span class="hub-bg__grid"></span>`}
    <${LobbyScene} />
    <${OwnBackdrop} />
  </div>`;
}

/** The radar rings behind the emblem (original drawing; the sweep stops under 减少动态效果). */
function HubRadar() {
  return html`<div class="hub-radar" aria-hidden="true">
    <svg viewBox="-240 -240 480 480">
      <circle r="92" /><circle r="152" /><circle class="hub-radar__ticks" r="214" />
      <path d="M-236 0H-176M176 0H236M0 -236V-176M0 176V236" />
    </svg>
    <i class="hub-radar__sweep"></i>
  </div>`;
}

/**
 * 规程's emblem and title: the official raised-fist season logo in the radar (recoloured red), the glowing РЕГЛАМЕНТ
 * wordmark above and the official 「卫戍协议【规程】」 title lockup — in a Chinese script; elsewhere the title as text in the
 * same frame. Without the local-client art: the dot emblem and text.
 */
function RegulationTitle() {
  const version = useStore(lobbyVersion);
  const art = (name) => localAsset(REGULATION_ART, name);
  const chinese = scriptOf(t('卫戍协议')) !== 'alphabetic' && /^zh/i.test(document.documentElement.lang || 'zh');
  const [logo, word, lockup] = [art('entry_anim_season_logo') || art('entry_anim_season_logo_2'), art('entry_anim_season_logo_text_2'), art('common_title')];
  return html`<div class="hub-center hub-center--reg">
    <div class="hub-center__mark"><${HubRadar} />${logo ? html`<img class="hub-center__logo hub-center__fist" src=${logo} alt="" />` : html`<${Emblem} />`}</div>
    ${word ? html`<img class="hub-reg__word" src=${word} alt="РЕГЛАМЕНТ · STRONGHOLD PROTOCOL REGULATION" />` : html`<div class="hub-reg__wordtext" lang="ru">РЕГЛАМЕНТ</div>`}
    ${chinese && lockup ? html`<h1 class="hub-reg__lockup"><img src=${lockup} alt=${t('卫戍协议·规程')} /></h1>`
      : html`<h1 class="hub-center__title hub-reg__title"><span class="hub-reg__brk">[</span>${t('卫戍协议·规程')}<span class="hub-reg__brk">]</span></h1>`}
    <div class="hub-center__ver" data-testid="hub-version">· ${versionLabel(version)}</div>
  </div>`;
}

/** The emblem (official `entry/season_logo`, the title's dot emblem without the art pack) in its radar, and the title. */
function HubTitle({ season = null }) {
  if (season === REGULATION) return html`<${RegulationTitle} />`;
  // a title in an alphabetic script (English …) is set like the title screen's: no wordmark above it, ": " between
  const alphabetic = scriptOf(t('卫戍协议')) === 'alphabetic';
  // another official version (DESIGN §35.23): its name under the title
  const version = useStore(lobbyVersion);
  return html`<div class="hub-center">
    <div class="hub-center__mark"><${HubRadar} /><${Sprite} k="entry/season_logo" class="hub-center__logo" fallback=${html`<${Emblem} />`} /></div>
    ${alphabetic ? null : html`<div class="hub-center__en">STRONGHOLD PROTOCOL <b>ALLIANCE</b></div>`}
    <h1 class=${`hub-center__title${alphabetic ? ' hub-center__title--latin' : ''}`}>${t('卫戍协议')}<span>${alphabetic ? ': ' : '：'}</span><em>${t('盟约')}</em></h1>
    ${version !== DEFAULT_VERSION ? html`<div class="hub-center__ver" data-testid="hub-version">· ${versionLabel(version)}</div>` : null}
  </div>`;
}

/** File names of the official 选择模拟协议 pictures (assets `modeChoice/<name>_rhodes_island`). */
const PROTOCOL_ART = { FUNNY: 'funny', NORMAL: 'normal', HARD: 'hard', ABYSS: 'abyss' };

/** The selected difficulty's scene (ui/protocolScene.js): the official picture on the drawn grid, squares and cable. */
function ProtocolArt({ difficulty, season = null }) {
  useData('assets', 'local');
  // 规程: its season key art (the 乌萨斯 monument) where 盟约 shows Rhodes Island's 选择模拟协议 picture, when extracted
  const reg = season === REGULATION ? localAsset(REGULATION_ART, 'bg_season_on') : null;
  if (reg) return html`<div class="proto-reg-art" data-difficulty=${difficulty}><img src=${reg} alt="" /></div>`;
  return html`<${ProtocolScene} difficulty=${difficulty} art=${uiUrl(data.get('assets'), `modeChoice/${PROTOCOL_ART[difficulty]}_rhodes_island`)} />`;
}

/** The ‹ + dotted rook plate at the top left of the full-screen dialogs: back to the hub (or the dialog below). */
function BackPlate({ onClick, class: cls = '' }) {
  return html`<button type="button" class=${`proto-back ${cls}`} onClick=${onClick} title=${t('返回')} aria-label=${t('返回')}>
    <${Icon} name="chevronLeft" /><span class="proto-back__home"><${Icon} name="rook" /></span>
  </button>`;
}

/**
 * 选择模拟协议 (laid out after the event's second screen): full screen — the selected difficulty's official picture and
 * brief at the left, the four difficulty cards down the right (the chosen one slides out with the 已选定 stamp), the hint
 * and 开始独立模拟 below them (with the test-room box while the server runs in test mode). The project's Modal (focus
 * trap, Esc, focus restored) styled to fill the screen. The lobby opens it for 独立模拟 only (a co-op room is created
 * from 选择同盟方式 and its difficulty changed in the room); the room (screens/room.js) opens it with `action` / `hint`
 * replacing the button's label and the hint (the host's 确认), or `readOnly` — the cards shown, not chosen, and no
 * button (the other doctors: the host chooses).
 */
export function ProtocolSelect({ roomMode, difficulty, onDifficulty, onClose, onCreate, busy, online, testMode, asTest, onTest, action = null, hint = null, readOnly = false,
  difficulties = DIFFICULTIES, loading = false, failed = false, soloTime = null, ladder = null, modeId = null, onMode = null, season = null }) {
  const card = MODE_CARDS.find((c) => c.id === roomMode) || MODE_CARDS[0];
  // a laddered room mode (规程's solo): the chosen official mode names, colours and describes the brief
  const mode = ladder && modeId ? modeInfo(modeId) : null;
  const info = mode || difficultyInfo(roomMode, difficulty);
  if (mode) difficulty = mode.difficulty;
  const label = action || (roomMode === 'solo' ? t('开始独立模拟') : t('创建同盟'));
  return html`<${Modal} open=${true} onClose=${onClose} class="proto" veilClass="proto-veil">
    <div class="proto__body" style=${`--d-color:${mode ? mode.color : DIFFICULTY_COLORS[difficulty]}`} data-difficulty=${difficulty} data-mode=${roomMode} data-season=${season}>
      <div class="proto__bg" aria-hidden="true"></div>
      <${ProtoFit} />
      <header class="proto-top">
        <${BackPlate} onClick=${onClose} class="proto__back" />
        <div class="proto-title">
          <h2 class="modal__title">${t('选择模拟协议')}</h2>
          <span class="proto-title__mode"><${Icon} name=${card.icon} />${t(card.name)}<i>${card.en}</i></span>
        </div>
      </header>
      <div class="proto-body">
        <section class="proto-stage">
          <div key=${difficulty} class="proto__pic"><${ProtocolArt} difficulty=${difficulty} season=${season} /></div>
          <div class="proto-brief">
            <span class="proto-brief__code num">${info.code}</span>
            <b class="proto-brief__name">${mode ? mode.name : t(DIFFICULTY_NAMES[difficulty])}</b>
            <p>${info.desc}</p>
            ${mode?.offBonds.length ? html`<p class="proto-brief__off" data-testid="proto-off-bonds">${t('本模式未载入的盟约：{names}', { names: mode.offBonds.join('、') })}</p>` : null}
            <div class="proto-brief__more" data-testid="proto-brief-more">
              <span class="proto-brief__effects">${info.effects.map((e) => html`<span key=${e}>${e}</span>`)}</span>
              <span class="proto-brief__meta"><${DifficultyRounds} info=${info} /></span>
            </div>
          </div>
        </section>
        <section class="proto-side">
          <div class="proto-list" role="group" aria-label=${t('模拟难度')} aria-busy=${loading ? 'true' : 'false'}>
            ${failed ? html`<p class="proto-list__wait is-failed" data-testid="proto-failed"><${Icon} name="warn" />${t('版本数据校验失败')}
                <${Button} size="sm" variant="secondary" data-testid="proto-retry" onClick=${retryContentSet}>${t('重试')}<//></p>`
              : loading ? html`<p class="proto-list__wait" data-testid="proto-loading"><${Spinner} size="sm" />${t('正在载入版本数据…')}</p>` : null}
            ${ladder ? html`<${LadderList} ladder=${ladder} modeId=${modeId} onMode=${onMode || (() => {})} disabled=${readOnly || loading} />`
              : difficulties.map((d) => html`<${DifficultyCard} key=${d} roomMode=${roomMode} difficulty=${d} selected=${difficulty === d} onSelect=${onDifficulty} disabled=${readOnly || loading} />`)}
          </div>
          ${readOnly ? html`<div class="proto-foot proto-foot--ro">
            <p class="proto-hint proto-hint--ro"><${Icon} name="info" />${hint || t('由创建者选择')}</p>
          </div>` : html`<div class="proto-foot create-box">
            ${soloTime && !readOnly ? html`<label class="create-box__test" data-testid="solo-unlimited">
              <input type="checkbox" role="switch" checked=${soloTime.on} onChange=${(e) => soloTime.onToggle(e.target.checked)} />
              <span>${t('不限时')}</span>
              <em class="t-dim">${t('关闭本局休整与机变的计时。官方为休整期每轮 300 秒、机变 150 秒。')}</em>
            </label>` : null}
            ${testMode ? html`<label class="create-box__test" data-testid="create-test">
              <input type="checkbox" checked=${asTest} onChange=${(e) => onTest(e.target.checked)} />
              <span>${t('测试房间')}</span>
              <em class="t-dim">${t('不计入战绩。房间会标明「测试」，只有房主能使用测试指令。')}</em>
            </label>` : null}
            <p class="proto-hint">
              ${online
                ? hint ?? (roomMode === 'solo' ? t('创建后即可开始模拟') : t('创建后可邀请好友或添加 AI 队友'))
                : html`<${Spinner} size="sm" label="CONNECTING" /> ${t('正在连接服务器…')}`}
            </p>
            <button type="button" class="proto-start" disabled=${!online || busy === 'create' || loading} aria-busy=${busy === 'create' ? 'true' : 'false'} onClick=${onCreate}>
              <span class="proto-start__mark" aria-hidden="true"><span class="proto-start__rook"><i>[</i><${Icon} name="rook" /><i>]</i></span><small>STRONGHOLD<br />PROTOCOL</small></span>
              <span class="proto-start__label">${busy === 'create' ? html`<${Spinner} size="sm" />` : null}${label}</span>
              <span class="proto-start__deco" aria-hidden="true"></span>
            </button>
          </div>`}
        </section>
      </div>
    </div>
  <//>`;
}

/**
 * 选择同盟方式 (laid out after the event's screen after 同盟模拟, research 06 §3.2): full screen — a radar at the left with
 * 玩法说明 under it, at the right the 创建同盟 card (creates the room at once at `difficulty`, the remembered one, which the
 * host changes in the room; the test-room box under it while the server runs in test mode; AI teammates are added in the
 * room) and the 加入同盟 card (the key field — the project's TextField — with 观战, the recent keys that only fill it,
 * 加入同盟). The project's Modal styled to fill the screen. `short`: the screen is at most 520 px tall (the lobby's
 * useMediaQuery(SHORT_SCREEN_QUERY)) — the key field, beside 观战 in a column about 300 px wide, is about 150 px there,
 * so its placeholder is the field's name alone (同盟密钥) instead of the whole 输入同盟密钥 / 粘贴邀请链接, which ran under
 * 观战 at 特大 in English and Japanese (§35.18's leftover); the line under the field still tells where a key comes from.
 * On a taller screen the field's name stands in too wherever the whole sentence does not fit the field (TextField
 * `placeholderShort`, by the field's width: English and Japanese at 特大 on every desktop, the default Chinese at 特大
 * in a 1024 px window — it ended in an ellipsis there).
 */
export function AllianceSelect({ onClose, onCreate, difficulty = 'FUNNY', code, onCode, codeOk, online, busy, onJoin, onSpectate, recent, marks, focusKey,
  testMode = false, asTest = false, onTest = () => {}, short = false }) {
  const diffName = DIFFICULTY_NAMES[difficulty] ? t(DIFFICULTY_NAMES[difficulty]) : '';
  return html`<${Modal} open=${true} onClose=${onClose} class="ally" veilClass="proto-veil">
    <div class="ally__body">
      <div class="proto__bg ally__bg" aria-hidden="true"></div>
      <header class="proto-top">
        <${BackPlate} onClick=${onClose} class="ally__back" />
        <div class="proto-title">
          <h2 class="modal__title">${t('选择同盟方式')}</h2>
          <span class="proto-title__mode ally__mode"><${Icon} name="users" />${t('同盟模拟')}<i>ALLIANCE SIMULATION</i></span>
        </div>
      </header>
      <div class="proto-body ally-body">
        <section class="ally-stage">
          <${RadarScene} />
          <button type="button" class="ally-guide" onClick=${() => openGuide(0)}><span class="ally-guide__icon"><${Icon} name="book" /></span>${t('玩法说明')}</button>
        </section>
        <section class="ally-side">
          <button type="button" class="ally-card ally-card--create ally-create" data-testid="alliance-create" data-difficulty=${difficulty}
              disabled=${!online || busy === 'create'} aria-busy=${busy === 'create' ? 'true' : 'false'} onClick=${() => onCreate()}>
            <span class="ally-card__art"><${CreateArt} /></span>
            <span class="ally-card__bar"><span class="ally-card__icon">${busy === 'create' ? html`<${Spinner} size="sm" />` : html`<${Icon} name="plus" />`}</span><span class="ally-card__name">${t('创建同盟')}</span>
              <small>${online ? t('难度：{name}（可在同盟内更改）', { name: diffName }) : t('正在连接服务器…')}</small></span>
          </button>
          ${testMode ? html`<label class="create-box__test ally-test" data-testid="create-test">
            <input type="checkbox" checked=${asTest} onChange=${(e) => onTest(e.target.checked)} />
            <span>${t('测试房间')}</span>
            <em class="t-dim">${t('不计入战绩。房间会标明「测试」，只有房主能使用测试指令。')}</em>
          </label>` : null}
          <div class="ally-card ally-card--join ally-join join-row">
            <span class="ally-card__art"><${JoinArt} /></span>
            <div class="ally-key">
              <${TextField} class="ally-key__field" size="key" icon="key" value=${code} transform=${normalizeCode} onInput=${onCode} onEnter=${() => onJoin()}
                placeholder=${short ? t('同盟密钥') : t('输入同盟密钥 / 粘贴邀请链接')} placeholderShort=${t('同盟密钥')} ariaLabel=${t('同盟密钥')}
                modalFocus=${!!focusKey} />
              <button type="button" class="ally-key__spec join-spectate" disabled=${!codeOk || !online || busy === 'spectate'} onClick=${() => onSpectate()}
                title=${t('以观战者身份进入：不占博士席位，只能观看（每个同盟最多 {MAX_SPECTATORS} 名，模拟进行中也可进入）', { MAX_SPECTATORS })}>
                ${busy === 'spectate' ? html`<${Spinner} size="sm" />` : html`<${Icon} name="eye" />`}${t('观战')}</button>
            </div>
            <span class="ally-recent join-foot">
              ${recent.length ? html`<span class="t-lo">${t('最近的同盟')}</span>
                ${recent.map((c) => html`<button key=${c} type="button" class="code-chip num" title=${t('填入密钥（不会直接加入）')}
                  onClick=${() => onCode(c)}>${c}${Array.isArray(marks) && marks.includes(c) ? html` <${TestMark} />` : null}</button>`)}`
                : html`<span class="t-dim">${t('向同伴索取 {ROOM_CODE_LEN} 位同盟密钥，或直接打开邀请链接', { ROOM_CODE_LEN })}</span>`}
            </span>
            <button type="button" class="ally-card__bar ally-card__bar--join" disabled=${!codeOk || !online || busy === 'join'} onClick=${() => onJoin()}>
              <span class="ally-card__icon"><${Icon} name="users" /></span>${t('加入同盟')}${busy === 'join' ? html`<${Spinner} size="sm" />` : null}
            </button>
          </div>
        </section>
      </div>
    </div>
  <//>`;
}

>>>>>>> theirs
/** Lobby screen component. */
export function LobbyScreen() {
  const me = useStore((s) => s.me, shallowEqual);
  const conn = useStore((s) => s.connection, shallowEqual);
<<<<<<< ours
  useData('config');
  const [coopSize,setCoopSize]=useState(()=>/8$/.test(loadPref('lobby.mode','coop'))?8:4);
  const [roomMode, setRoomMode] = useState(() => (['solo','coop','coop8','sync','sync8','laboratory','practice'].includes(loadPref('lobby.mode','coop'))?loadPref('lobby.mode','coop'):'coop'));
=======
  useData('config', 'assets', 'local');
>>>>>>> theirs
  const [difficulty, setDifficulty] = useState(() => {
    const d = loadPref('lobby.difficulty', 'FUNNY');
    return DIFFICULTIES.includes(d) ? d : 'FUNNY';
  });
<<<<<<< ours
=======
  // 「不限时」 for the next timed solo (DESIGN §35.23.10; default off). The room's 模拟设置 is the authority once the
  // room exists; this pref is what the lobby card and the create message say before that.
  const [soloFree, setSoloFree] = useState(() => loadPref('lobby.soloUnlimited', false) === true);
  // a laddered version's solo mode (规程: 极速模拟 / 规程等级 n), remembered; the version's data decides what is shown
  const [ladderMode, setLadderMode] = useState(() => { const v = loadPref('lobby.ladderMode', null); return typeof v === 'string' ? v : null; });
  // the open dialogs: 选择同盟方式 (同盟模拟 / 密钥加入) and 选择模拟协议 (独立模拟)
  const [allyOpen, setAllyOpen] = useState(false);
  const [soloOpen, setSoloOpen] = useState(false);
>>>>>>> theirs
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(null);
  /** Set when an 加入同盟 was refused with ROOM_FULL: `{ code }` opens the "enter as a spectator?" prompt. */
  const [fullAsk, setFullAsk] = useState(null);
  const [recent] = useState(recentRooms);
  const marks = loadPref('recentTestRooms', []);
  const [sweepOpen, setSweepOpen] = useState(false);
  const [publicOpen,setPublicOpen]=useState(false);
  const [publicRoomCount,setPublicRoomCount]=useState(null);
  const [publicOn,setPublicOn]=useState(()=>loadPref('lobby.publicOn',true)!==false);
  useEffect(()=>{
    if(publicOpen||conn.status!=='online')return;
    let active=true,pending=false;
    const refresh=async()=>{if(pending)return;pending=true;try{const response=await net.request('room.list');if(active)setPublicRoomCount(response.counts||{joinable:response.rooms.filter(r=>!r.started&&r.players+r.bots<r.capacity).length,total:response.rooms.length});}catch{if(active)setPublicRoomCount(null);}finally{pending=false;}};
    refresh();const timer=setInterval(refresh,10000);return()=>{active=false;clearInterval(timer);};
  },[publicOpen,conn.status]);
  const alive = useRef(true);
  const inFlight = useRef(false); // synchronous guard against double clicks (state updates are async)
  useEffect(() => () => { alive.current = false; }, []);

  const online = conn.status === 'online';
  const codeOk = CODE_RE.test(code);
<<<<<<< ours
=======
  // official versions (DESIGN §35.23): the lobby's version, the difficulties it offers and the one shown — the remembered
  // one, or the server's fallback when the version lacks it (the pref is only overwritten when the player picks)
  const versions = useStore((s) => s.versions);
  const version = useStore(lobbyVersion);
  const versionLoading = useStore((c) => version !== DEFAULT_VERSION && (c.kind !== 'version' || c.version !== version || c.status !== 'ready'), Object.is, contentSet);
  // its set failed to load or its check (the chip's 重试 sits under the modal): 选择模拟协议 says so and offers 重试 too
  const versionFailed = useStore((c) => version !== DEFAULT_VERSION && c.kind === 'version' && c.version === version && c.status === 'failed', Object.is, contentSet);
  const cfg = getConfig();
  // null while that version's data is not on screen: the card states no time rule and the dialog hides the switch
  const soloTimed = soloTimedOf(versionLoading ? null : cfg, version);
  const solo = offeredDifficulties(versionLoading ? null : cfg, 'solo');
  const coop = offeredDifficulties(versionLoading ? null : cfg, 'coop');
  const shownSolo = fallbackDifficulty(solo, difficulty);
  const shownCoop = fallbackDifficulty(coop, difficulty);
  const ladder = ladderModes(versionLoading ? null : cfg, 'solo');
  const shownMode = ladder ? ladderPick(ladder, ladderMode, shownSolo) : null;
>>>>>>> theirs

  const pickMode = (m) => { setRoomMode(m); savePref('lobby.mode', m); };
  const pickDifficulty = (d) => { setDifficulty(d); savePref('lobby.difficulty', d); };
<<<<<<< ours
=======
  const pickMode = (id) => { setLadderMode(id); savePref('lobby.ladderMode', id); };
  const setSoloFreePref = (on) => { const next = on === true; setSoloFree(next); savePref('lobby.soloUnlimited', next); };
>>>>>>> theirs

  const run = async (kind, fn) => {
    if (inFlight.current) return;
    if (!online) { toast('尚未连接到服务器，请稍候', 'warn'); return; }
    inFlight.current = true;
    setBusy(kind);
    try { await fn(); } catch (err) { toastError(err); } finally {
      inFlight.current = false;
      if (alive.current) setBusy(null);
    }
  };
<<<<<<< ours
  const create = () => ['laboratory','practice'].includes(roomMode) ? store.patch('ui', { laboratorySetup: { difficulty,practice:roomMode==='practice' } }) : run('create',()=>net.request('room.create',{
    // 동기화 시뮬레이션: an alliance room (4 / 8 seats) with the sync rules
    mode:syncMode(roomMode)?roomMode.replace('sync','coop'):roomMode,difficulty,gameplayMode:'custom',titleLocale:lang,
    customExtensions:loadCustomExtensionPrefs(),
    ...(syncMode(roomMode)?{sync:true}:{}),
    ...(['coop','coop8','sync','sync8'].includes(roomMode)?{isPublic:publicOn,spectators:MAX_SPECTATOR_SEATS}:{})
=======
  // 独立模拟: at the difficulty picked on 选择模拟协议; 创建同盟: at the remembered one, changed in the room by the host
  // (`version`: the lobby's, only when welcome.versions is present — protocol §4; omitted when the server offers 第二期下半 alone)
  const create = (mode) => run('create', () => net.request('room.create', {
    mode, difficulty: mode === 'solo' ? shownSolo : shownCoop, ...(testMode && asTest ? { test: true } : {}), ...(versions ? { version } : {}),
    ...(mode === 'solo' && soloFree && soloTimed === true ? { soloUnlimited: true } : {}),
    ...(mode === 'solo' && shownMode ? { modeId: shownMode } : {}),
>>>>>>> theirs
  }));
  const join = (c = code) => {
    // `onClick=${join}` hands the click EVENT as the first argument, and a default parameter only applies to
    // `undefined` — codeArg keeps an event target out of the key and falls back to the input field
    const k = codeArg(c, code);
    if (!k) { toast(`同盟密钥为 ${ROOM_CODE_LEN} 位字母或数字`, 'warn'); return; }
    run('join', () => net.request('room.join', { code: k }).catch((err) => {
      // The room is full: ask before taking one of its spectator seats (only when the host left one free — the server
      // answers ROOM_FULL for both "no player seat" and "no spectator seat"). The prompt remembers the code it asked for.
      if (err?.code === ERR.ROOM_FULL) { setPublicOpen(false); setFullAsk({ code: k }); return; }
      throw err;
    }));
  };
  // a spectator seat: no player seat taken, nothing to do but watch (also a match already running)
  const spectate = (c = code) => {
    // same guard as join: `onClick=${spectate}` passes the click event, not a code
    const k = codeArg(c, code);
    if (!k) { toast(`同盟密钥为 ${ROOM_CODE_LEN} 位字母或数字`, 'warn'); return; }
    setFullAsk(null);
    run('spectate', () => net.request('room.spectate', { code: k }).catch((err) => {
      if (err?.code === ERR.ROOM_FULL && ['spectating off for this room','solo room'].includes(err.detail)) {
        toast('관전이 허용되지 않은 방입니다.', 'warn');
        return;
      }
      // Clearer than the bare ERR_TEXT: the usual cause is a code that is not the host's (a remembered one from an
      // earlier room, or another machine's) — the server can only answer "no such room".
      if (err?.code === ERR.ROOM_NOT_FOUND) {
        toast(`没有找到密钥 ${k} 对应的同盟：请和房主核对密钥（同盟结束后密钥即失效）`, 'warn');
        return;
      }
      if (err?.code === ERR.ALREADY) {
        toast('你已经是该同盟的博士：先离开同盟，才能以观战身份进入', 'warn');
        return;
      }
      throw err;
    }));
  };
  const backToTitle = () => {
    identity.setEntered(false);
    store.set((s) => ({ session: { ...s.session, entered: false } }));
  };

<<<<<<< ours
  const headerLeft=onBack=>html`      <div class="topbar__left">
        <${Button} variant="ghost" size="sm" icon="chevronLeft" class="nav-back" onClick=${onBack} title="返回标题">返回<//>
        <div class="lobby-presence"><${PingPill} ms=${conn.ping} online=${online} /><${OnlinePill} count=${online?publicRoomCount?.online:undefined} /></div>
        <${PatchNotesButton} autoOpen=${true} />
        <${Button} variant="secondary" size="sm" icon="report" class="lobby-sweep" onClick=${() => setSweepOpen(true)}>S.W.E.E.P. 리포트<//>
=======
  // the lobby wears the look of its version's season (规程: data-season="act3autochess", lobby.css)
  const season = seasonOf(version);
  return html`<div class="screen lobby-screen lobby-hub" data-season=${season}>
    <${HubBackdrop} season=${season} />
    <header class="topbar">
      <div class="topbar__left">
        <${Button} variant="ghost" size="sm" icon="chevronLeft" onClick=${backToTitle} title=${t('返回标题')}>${t('返回')}<//>
        <${PingPill} ms=${conn.ping} online=${online} />
        <span class="topbar__sep" aria-hidden="true"></span>
        <div class="topbar__tools">
          <${NoticesButton} />
          <${SettingsButton} class="lobby-settings" variant="secondary" square=${true} />
          <${GuideButton} class="lobby-guide" variant="secondary" square=${true} />
          <${LobbyMediaButton} />
          <${PwaInstallButton} class="lobby-pwa" square=${true} />
        </div>
>>>>>>> theirs
      </div>
`;
  const headerRight=html`      <div class="topbar__right">
        <${ResumeMatchButton} /><${SettingsButton} />
        <${GuideButton} class="lobby-guide" variant="secondary" square=${true} />
        <${LoadoutButton} from="lobby" size="sm" class="lobby-loadout" />
        <button type="button" class="me-chip me-chip--btn" onClick=${openStats} title="통계" aria-label="내 전투 통계 열기">
          <${AvatarFrame} size="sm" name=${me.name} seat=${0} self=${true} />
          <div class="me-chip__text">
            <span class="me-chip__name">${me.name || '博士'}</span>
            <${MicroLabel}>${me.playerId != null ? `DOCTOR #${doctorNo(me.playerId)}` : 'DOCTOR'}<//>
          </div>
          <${Icon} name="chart" class="me-chip__stats" />
        </button>
      </div>
`;
  if(publicOpen)return html`<${PublicRoomsScreen} onCounts=${setPublicRoomCount} headerLeft=${headerLeft(()=>setPublicOpen(false))} headerRight=${headerRight} onJoin=${join} onSpectate=${spectate}/>${sweepOpen?html`<${SweepReport} onClose=${()=>setSweepOpen(false)}/>`:null}`;
  return html`<div class="screen lobby-screen">
    <header class="topbar app-topbar">
      ${headerLeft(backToTitle)}
      <div class="topbar__center">
        <${MicroLabel} tone="mint">SIMULATION PROTOCOL SELECT<//>
        <h1 class="topbar__title">选择模拟协议</h1>
      </div>
      ${headerRight}
    </header>

<<<<<<< ours
    <div class="lobby-body screen__scroll">
      <section class="lobby-left">
        <div class="section-label lg-label lg-label--modes"><span class="section-label__idx num">01</span>模拟方式<${MicroLabel}>MODE<//></div>
        <div class="lg-modes">
        <div class="mode-cards mode-cards--main">
          ${MODE_CARDS.filter((c) => MAIN_MODES.includes(c.id)).map((c) => html`<${ModeCard} key=${c.id} card=${c} selected=${roomMode === c.id || roomMode===c.id+'8'} onSelect=${pickMode} coopSize=${coopSize} onCoopSize=${n=>{setCoopSize(n);pickMode((c.id==='sync'?'sync':'coop')+(n===8?'8':''));}} publicOn=${publicOn} onPublicChange=${on=>{setPublicOn(on);savePref('lobby.publicOn',on);}} />`)}
        </div>

        </div>
        <div class="section-label lg-label lg-label--join"><span class="section-label__idx num">02</span>加入同盟<${MicroLabel}>JOIN WITH ALLIANCE KEY<//></div>
        <div class="lg-join">
        <${Panel} class="join-panel" tone="amber">
          <div class="join-row">
            <${TextField} ascii=${true} size="code" icon="key" value=${code} placeholder="输入同盟密钥 / 粘贴邀请链接"
              transform=${normalizeCode} onInput=${(v) => setCode(normalizeCode(v))} onEnter=${() => join()} />
            <${Button} variant="amber" size="lg" icon="users" loading=${busy === 'join'} disabled=${!codeOk || !online} onClick=${() => join()}>加入同盟<//>
            <${Tooltip} text=${`관전자는 플레이어 자리를 차지하지 않습니다. 관전 허용 시 최대 ${MAX_SPECTATOR_SEATS}명까지 입장할 수 있으며, 진행 중에도 관전할 수 있습니다.`}>
              <${Button} variant="secondary" size="lg" icon="eye" class="join-spectate" loading=${busy === 'spectate'} disabled=${!codeOk || !online} onClick=${spectate}>观战<//>
            <//>
          </div>
          <div class="join-foot">
            ${recent.length ? html`<span class="t-lo">最近的同盟</span>
              ${recent.map((c) => html`<button key=${c} type="button" class="code-chip num" title="填入密钥（不会直接加入）"
                onClick=${() => setCode(c)}>${c}</button>`)}`
              : html`<span class="t-dim">${`向同伴索取 ${ROOM_CODE_LEN} 位同盟密钥，或直接打开邀请链接`}</span>`}
          </div>
        <//>
        </div>
=======
    <main class="hub-stage">
      <${HubTitle} season=${season} />
      <aside class="hub-side">
        <${AchievementCard} onOpen=${() => setAchOpen(true)} />
        <${HubTile} icon="key" label=${t('密钥加入')} en="JOIN WITH KEY" class="hub-tile--key" onClick=${() => setAllyOpen(true)} />
        <${TipsPanel} />
      </aside>
      <aside class="hub-right">
        <${SweepPlate} onClick=${() => setSweepOpen(true)} />
        <${LoadoutButton} from="lobby" size="lg" class="hub-plate hub-plate--loadout lobby-loadout" label=${t('干员调配')} />
        <${AchievementPlate} onOpen=${() => setAchOpen(true)} />
      </aside>
      <section class="hub-entries" aria-label=${t('模拟方式')}>
        ${MODE_CARDS.map((c) => {
          const timedCard = c.id === 'solo';
          const timePoint = timedCard ? soloTimeMsgid('card', { timed: soloTimed, unlimited: soloFree }) : '';
          const timeShort = timedCard ? soloTimeMsgid('short', { timed: soloTimed, unlimited: soloFree }) : '';
          return html`<${HubEntry} key=${c.id} card=${c} onOpen=${openMode} timePoint=${timePoint || null} timeShort=${timeShort || null} />`;
        })}
>>>>>>> theirs
      </section>

<<<<<<< ours
      <section class="lobby-right">
        <div class="lobby-quick lg-quick">
          <button type="button" class="public-rooms-entry mode-card brackets" onClick=${()=>setPublicOpen(true)}><span class="mode-card__bg" aria-hidden="true"></span><span class="mode-card__icon"><${Icon} name="users"/></span><span class="mode-card__text"><${MicroLabel}>PUBLIC ROOMS<//><span class="mode-card__name">탐색</span><span class="mode-card__desc">공개된 연합 방에 참가하거나 관전합니다.</span></span><span class="public-rooms-entry__total"><span class="public-rooms-entry__count" aria-label="참가 가능한 방 수">${conn.status==='online'&&publicRoomCount!==null?publicRoomCount.joinable:'—'}</span><span class="public-rooms-entry__all" aria-label="전체 방 수">/${conn.status==='online'&&publicRoomCount!==null?publicRoomCount.total:'—'}</span></span></button>
          <div class="lobby-quick__labs">
          ${MODE_CARDS.filter((c) => !MAIN_MODES.includes(c.id)).map((c) => html`<${ModeCard} key=${c.id} full=${true} card=${c} selected=${roomMode === c.id || roomMode===c.id+'8'} onSelect=${pickMode} coopSize=${coopSize} onCoopSize=${n=>{setCoopSize(n);pickMode((c.id==='sync'?'sync':'coop')+(n===8?'8':''));}} publicOn=${publicOn} onPublicChange=${on=>{setPublicOn(on);savePref('lobby.publicOn',on);}} />`)}
          </div>
        </div>
        <div class="lg-diff">
        <div class="diff-tabs" role="radiogroup" aria-label="난이도">
          ${DIFFICULTIES.map((d) => html`<button key=${d} type="button" role="radio" aria-checked=${difficulty === d} class=${`diff-tab${difficulty === d ? ' is-selected' : ''}`} style=${`--d-color:${DIFFICULTY_COLORS[d]}`} onClick=${() => pickDifficulty(d)}><${DifficultyIcon} difficulty=${d} class="diff-tab__glyph" /><span>${t(DIFFICULTY_NAMES[d]||'').replace(/\s*시뮬레이션$/,'')}</span></button>`)}
        </div>

        <div class="create-box">
          <${Tooltip} block=${true} text=${online || ['laboratory','practice'].includes(roomMode) ? null : '正在连接服务器…'}>
            <${Button} class="lobby-create" variant="primary" size="xl" block=${true} iconRight="chevrons" loading=${busy === 'create'} disabled=${!['laboratory','practice'].includes(roomMode)&&!online} onClick=${create}>
              ${roomMode==='practice'?'연습실 진입':roomMode==='laboratory'?'실험실 진입':roomMode === 'solo' ? '开始独立模拟' : '创建同盟'}
            <//>
          <//>
          <div class="create-box__hint">
            ${['laboratory','practice'].includes(roomMode)?html`<span>${roomMode==='practice'?'진입 후 라운드·전장·전략·적 특훈·맹약 밴을 선택합니다.':'진입 후 맵·보스·전략을 선택합니다.'}</span>`:online
              ? html`<span>${roomMode === 'solo' ? '创建后即可开始模拟' : '创建后可邀请好友或添加 AI 队友'}</span>`
              : html`<${Spinner} size="sm" label="CONNECTING" />`}
          </div>
        </div>
        </div>
      </section>
    </div>
  </div>
  ${sweepOpen ? html`<${SweepReport} onClose=${() => setSweepOpen(false)} />` : null}
  ${fullAsk ? html`<${Modal}
    open=${true}
    tone="amber"
    title="同盟已满"
    micro="ALLIANCE FULL"
    width="6.6rem"
    onClose=${() => setFullAsk(null)}
    actions=${html`
      <${Button} variant="secondary" onClick=${() => setFullAsk(null)}>取消<//>
      <${Button} variant="amber" icon="eye" loading=${busy === 'spectate'} onClick=${() => spectate(fullAsk.code)}>进入观战席<//>
    `}>
    <div class="full-ask">
      <p>同盟 <b class="num">${fullAsk.code}</b> 의 모든 박사 좌석이 가득 찼습니다.</p>
      <p class="t-lo">仍可以<b>观战者</b>身份进入：不占博士席位、只能观看，对局进行中也能切换观看各位博士。</p>
    </div>
  <//>` : null}`;
=======
    ${allyOpen ? html`<${AllianceSelect} onClose=${() => setAllyOpen(false)} onCreate=${() => create('coop')} difficulty=${shownCoop}
      code=${code} onCode=${(v) => setCode(normalizeCode(v))} codeOk=${codeOk} online=${online} busy=${busy}
      onJoin=${join} onSpectate=${spectate} recent=${recent} marks=${marks} focusKey=${!coarse}
      testMode=${testMode} asTest=${asTest} onTest=${setAsTest} short=${shortScreen} />` : null}
    ${soloOpen ? html`<${ProtocolSelect} roomMode="solo" difficulty=${shownSolo} onDifficulty=${pickDifficulty}
      onClose=${() => setSoloOpen(false)} onCreate=${() => create('solo')} busy=${busy} online=${online}
      testMode=${testMode} asTest=${asTest} onTest=${setAsTest} difficulties=${solo} loading=${versionLoading} failed=${versionFailed}
      soloTime=${soloTimed === true ? { on: soloFree, onToggle: setSoloFreePref } : null} ladder=${ladder} modeId=${shownMode} onMode=${pickMode} season=${season} />` : null}
    ${sweepOpen ? html`<${SweepReport} onClose=${() => setSweepOpen(false)} />` : null}
    ${achOpen ? html`<${AchievementDialog} onClose=${() => setAchOpen(false)} />` : null}
  </div>`;
>>>>>>> theirs
}
