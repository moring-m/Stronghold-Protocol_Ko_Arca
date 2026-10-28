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
import { html, Button, Icon, MicroLabel, Panel, TextField, PingPill, AvatarFrame, Tooltip, Spinner, Modal, DifficultyIcon, doctorNo } from '../ui/components.js';
import { toast, toastError } from '../ui/toasts.js';
import { GuideButton } from '../ui/guide.js';
import { SettingsButton } from '../ui/settings.js';
import { PatchNotesButton } from '../ui/patchNotes.js';
import { LoadoutButton } from '../ui/loadoutEntry.js';
import { net, identity } from '../net.js';
import { store, useStore, shallowEqual, loadPref, savePref } from '../store.js';
import { getConfig, getMode, getStage, useData } from '../data.js';
import { loadCustomExtensionPrefs } from '../ui/customExtensionPrefs.js';

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

function ModeCard({ card, selected, onSelect, coopSize=4, onCoopSize, publicOn, onPublicChange }) {
  if(card.id==='coop'&&coopSize===8)card={...card,desc:'최대 8명의 박사가 오퍼레이터 풀을 공유하며 함께 전투합니다.',points:['박사 1–8명 · 빈자리는 AI 팀원으로','협력방어 최대 4명']};
  return html`<div class="mode-card-tip"><div role="button" tabindex="0" class=${`mode-card brackets${['laboratory','practice'].includes(card.id)?' mode-card--lab':''}${selected ? ' is-selected' : ''}`} onClick=${() => onSelect(card.id==='coop'&&coopSize===8?'coop8':card.id)} onKeyDown=${e=>{if(e.target===e.currentTarget&&['Enter',' '].includes(e.key)){e.preventDefault();onSelect(card.id==='coop'&&coopSize===8?'coop8':card.id);}}}
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
    ${card.id==='coop'?html`<div class="mode-card__controls">
      <span class="mode-card__sizes" role="group" aria-label="협동 인원">${[4,8].map(n=>html`<button type="button" aria-pressed=${coopSize===n} onClick=${e=>{e.stopPropagation();onCoopSize(n);}}>${t('{0}인',[n])}</button>`)}</span>
      <label class="mode-card__spectate mode-card__public create-box__check" onClick=${e=>e.stopPropagation()} onKeyDown=${e=>e.stopPropagation()}>
        <input type="checkbox" role="switch" class="ui-switch" aria-label="공개" checked=${publicOn} onChange=${e=>onPublicChange(!!e.currentTarget.checked)}/><${Icon} name="users"/><span>공개</span>
      </label>
    </div>`:null}
  </div></div>`;
}

function DifficultyCard({ roomMode, difficulty, selected, onSelect }) {
  const info = difficultyInfo(['laboratory','practice'].includes(roomMode)?'solo':roomMode, difficulty);
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

/** Lobby screen component. */
export function LobbyScreen() {
  const me = useStore((s) => s.me, shallowEqual);
  const conn = useStore((s) => s.connection, shallowEqual);
  useData('config');
  const [coopSize,setCoopSize]=useState(()=>loadPref('lobby.mode','coop')==='coop8'?8:4);
  const [roomMode, setRoomMode] = useState(() => (['solo','coop','coop8','laboratory','practice'].includes(loadPref('lobby.mode','coop'))?loadPref('lobby.mode','coop'):'coop'));
  const [difficulty, setDifficulty] = useState(() => {
    const d = loadPref('lobby.difficulty', 'FUNNY');
    return DIFFICULTIES.includes(d) ? d : 'FUNNY';
  });
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

  const pickMode = (m) => { setRoomMode(m); savePref('lobby.mode', m); };
  const pickDifficulty = (d) => { setDifficulty(d); savePref('lobby.difficulty', d); };

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
  const create = () => ['laboratory','practice'].includes(roomMode) ? store.patch('ui', { laboratorySetup: { difficulty,practice:roomMode==='practice' } }) : run('create',()=>net.request('room.create',{
    mode:roomMode,difficulty,gameplayMode:'custom',titleLocale:lang,
    customExtensions:loadCustomExtensionPrefs(),
    ...(['coop','coop8'].includes(roomMode)?{isPublic:publicOn,spectators:MAX_SPECTATOR_SEATS}:{})
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

  const headerLeft=onBack=>html`      <div class="topbar__left">
        <${Button} variant="ghost" size="sm" icon="chevronLeft" class="nav-back" onClick=${onBack} title="返回标题">返回<//>
        <${PingPill} ms=${conn.ping} online=${online} />
        <${PatchNotesButton} autoOpen=${true} />
        <${Button} variant="secondary" size="sm" icon="report" class="lobby-sweep" onClick=${() => setSweepOpen(true)}>S.W.E.E.P. 리포트<//>
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
  if(publicOpen)return html`<${PublicRoomsScreen} headerLeft=${headerLeft(()=>setPublicOpen(false))} headerRight=${headerRight} onJoin=${join} onSpectate=${spectate}/>${sweepOpen?html`<${SweepReport} onClose=${()=>setSweepOpen(false)}/>`:null}`;
  const summary=[roomMode==='solo'?'단독':roomMode==='coop'?'연합 4인':roomMode==='coop8'?'연합 8인':roomMode==='laboratory'?'실험실':'연습실',DIFFICULTY_NAMES[difficulty],...(['coop','coop8'].includes(roomMode)?[publicOn?'공개':'비공개']:[])];
  return html`<div class="screen lobby-screen">
    <header class="topbar app-topbar">
      ${headerLeft(backToTitle)}
      <div class="topbar__center">
        <${MicroLabel} tone="mint">SIMULATION PROTOCOL SELECT<//>
        <h1 class="topbar__title">选择模拟协议</h1>
      </div>
      ${headerRight}
    </header>

    <div class="lobby-body screen__scroll">
      <section class="lobby-left">
        <div class="section-label"><span class="section-label__idx num">01</span>模拟方式<${MicroLabel}>MODE<//></div>
        <div class="mode-cards">
          ${MODE_CARDS.map((c) => html`<${ModeCard} key=${c.id} card=${c} selected=${roomMode === c.id || c.id==='coop'&&roomMode==='coop8'} onSelect=${pickMode} coopSize=${coopSize} onCoopSize=${n=>{setCoopSize(n);pickMode(n===8?'coop8':'coop');}} publicOn=${publicOn} onPublicChange=${on=>{setPublicOn(on);savePref('lobby.publicOn',on);}} />`)}
        </div>

        <div class="section-label lobby-join-label"><span class="section-label__idx section-label__idx--alt"><${Icon} name="key"/></span>참가 · 탐색<${MicroLabel}>JOIN OR BROWSE<//></div>
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
            <button type="button" class="public-rooms-entry" onClick=${()=>setPublicOpen(true)}><${Icon} name="users"/><span class="public-rooms-entry__label">공개 방 탐색</span><span class="public-rooms-entry__stat"><small>참가 가능</small><b class="public-rooms-entry__count num" aria-label="참가 가능한 방 수">${conn.status==='online'&&publicRoomCount!==null?publicRoomCount.joinable:'—'}</b></span><span class="public-rooms-entry__stat"><small>전체</small><b class="public-rooms-entry__all num" aria-label="전체 방 수">${conn.status==='online'&&publicRoomCount!==null?publicRoomCount.total:'—'}</b></span><${Icon} name="chevronRight"/></button>
            ${recent.length ? html`<span class="t-lo">最近的同盟</span>
              ${recent.map((c) => html`<button key=${c} type="button" class="code-chip num" title="填入密钥（不会直接加入）"
                onClick=${() => setCode(c)}>${c}</button>`)}`
              : html`<span class="t-dim">${`向同伴索取 ${ROOM_CODE_LEN} 位同盟密钥，或直接打开邀请链接`}</span>`}
          </div>
        <//>
      </section>

      <section class="lobby-right">
        <div class="section-label"><span class="section-label__idx num">02</span>模拟难度<${MicroLabel}>DIFFICULTY<//></div>
        <div class="diff-list">
          ${DIFFICULTIES.map((d) => html`<${DifficultyCard} key=${d} roomMode=${roomMode} difficulty=${d} selected=${difficulty === d} onSelect=${pickDifficulty} />`)}
        </div>
        <div class="create-box">
          <${Tooltip} block=${true} text=${online || ['laboratory','practice'].includes(roomMode) ? null : '正在连接服务器…'}>
            <${Button} class="lobby-create" variant="primary" size="xl" block=${true} iconRight="chevrons" loading=${busy === 'create'} disabled=${!['laboratory','practice'].includes(roomMode)&&!online} onClick=${create}>
              ${roomMode==='practice'?'연습실 진입':roomMode==='laboratory'?'실험실 진입':roomMode === 'solo' ? '开始独立模拟' : '创建同盟'}
            <//>
          <//>
          <div class="create-box__hint">
            <span class="create-box__summary" aria-live="polite"><span class="t-lo">선택</span>${summary.map((x,i)=>html`${i?html`<i aria-hidden="true">·</i>`:null}<b key=${x}>${x}</b>`)}</span>
            ${['laboratory','practice'].includes(roomMode)?html`<span>${roomMode==='practice'?'진입 후 라운드·전장·전략·적 특훈·맹약 밴을 선택합니다.':'진입 후 맵·보스·전략을 선택합니다.'}</span>`:online
              ? html`<span>${roomMode === 'solo' ? '创建后即可开始模拟' : '创建后可邀请好友或添加 AI 队友'}</span>`
              : html`<${Spinner} size="sm" label="CONNECTING" />`}
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
}
