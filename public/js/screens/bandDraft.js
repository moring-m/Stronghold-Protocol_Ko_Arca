import { RANDOM_BAND_ID } from '../../../shared/randomBand.js';
import { ChatPanel } from '../ui/chat.js';
// Band draft — BAND_DRAFT "2/2 选择策略" (research 06 §4.2, D1): left = draft order (avatar, name, state:
// … waiting / ⌛ 决策中 / chosen band ✓), current picker highlighted; centre = grid of every band allowed
// for the mode type (icon, name, LP); a band a teammate already picked carries the picker's avatar and is marked
// 다른 참가자가 선택함 — it cannot be chosen again (research 09 §5, guidebook 策略与轮选; the server refuses it too); right =
// detail pane (icon, 初始生命值, name, effect name + rich description) with 跳过 (co-op, once) and 确认选择.
// One countdown (user playtest #4 item 4): every turn has the same clock (Match BAND_TURN_SECONDS, m.public.draft
// turnSeconds) and the step header counts it down — m.public.deadline IS the turn's end, the same number as the
// current picker's row. The highlighted band (the detail pane's) is what a turn that runs out takes: every change of it
// is reported (g.bandFocus) and the server assigns it while it is free, else 「华法琳」, else the first free strategy
// (timeoutBand). It starts on that default, so the tip under the order list always names what a timeout gives.
// Solo, and a co-op match with a single human (the server's soloUntimed: draft.untimed): no clock at all.
// A strategy built around a bond the mode switches off (bands.json bondIds ∩ the mode's inactive bonds — 标准: 潘格尼尼
// 拉特兰, 克莱门莎 阿戈尔, 玛恩纳 卡西米尔; the bot never picks one) reads 本局禁用 on its card and in the detail pane
// (BandOffTag / BandOffNote, DESIGN §21.26, §21.7's look); it stays selectable — information only.
// 本局信息 (GitHub issue #8 item 1, "选策略时没法返回查看禁用的干员和盟约"): 查看禁用盟约与干员 under the order list opens the
// briefing's bond rows, legend and 本局禁用干员 again, read-only (ui/matchInfo.js MatchInfoDialog — the very blocks of the
// briefing). The draft runs on underneath: its status line repeats the current turn and the countdown (draftInfoStatus),
// a turn change (a pick, a skip, a turn that runs out, an AI pick) closes it, the end of the draft unmounts it, and it
// never touches the highlighted band or the buttons.

import { useEffect, useMemo, useRef, useState } from '../../vendor/hooks.module.js';
import { html, Button, Icon, MicroLabel, useTicker, secondsLeft } from '../ui/components.js';
import { useGameData, BandIcon, RichText, PlayerAvatar, LpTower, Sprite } from '../ui/gameComponents.js';
import { StepHeader, ExitModal } from '../ui/matchChrome.js';
<<<<<<< ours
import { LoadoutButton } from '../ui/loadoutEntry.js';
import { MatchInfoDialog, matchInfoModel } from '../ui/matchInfo.js';
import { BriefingOverview } from './briefing.js';
=======
import { MatchInfoDialog, matchInfoModel, MatchBondDialog, regulationCoreAbsent } from '../ui/matchInfo.js';
import { MatchEnemies } from '../ui/matchEnemies.js';
>>>>>>> theirs
import { actions, act } from '../ui/gameActions.js';
import { normalizeDraft, sortedPlayers, pregameStepCount, pregameStepIndex } from '../ui/gameLogic.js';
import { useStore } from '../store.js';
import { audio } from '../audio.js';
import { TurnBanner } from '../ui/turnBanner.js';
import { bootArtReady } from '../ui/protocolBoot.js';
import { reducedMotion } from '../ui/device.js';
import { modeOffBonds, bandOffBonds, bandOffLine } from '../ui/gameLogic.js';
<<<<<<< ours
=======
import { t, tParts, tName, N_ } from '../../../shared/i18n.js';
>>>>>>> theirs

const cx = (...p) => p.flat().filter(Boolean).join(' ');

/** 规程's strategy sections (activity_table bandDataListDict bandType) in the draft grid, with the official captions. */
const BAND_SECTIONS = Object.freeze({
  GENERAL: Object.freeze({ id: 'general', name: N_('泛用型策略'), icon: 'crown' }),
  BONDRELEVANT: Object.freeze({ id: 'bond', name: N_('盟约型策略'), icon: 'link' }),
});

/** 本局禁用 on a strategy card whose bonds `names` the mode switches off (bandOffBonds); nothing otherwise. */
export function BandOffTag({ names = [] }) {
  return names.length ? html`<span class="dband__off" title=${bandOffLine(names)}>本局禁用</span>` : null;
}

/** The detail pane's note for such a strategy: "本局禁用【拉特兰】盟约，此策略效果可能无法发挥" (the bond names struck through). */
export function BandOffNote({ names = [] }) {
  if (!names.length) return null;
  return html`<p class="draft-detail__off" role="note" aria-label=${bandOffLine(names)}><${Icon} name="info" /><span data-i18n-ctx="bandoff">本局禁用${names.map((n, i) => html`<span key=${i}>【<s class="draft-detail__offname">${n}</s>】</span>`)}盟约，此策略效果可能无法发挥</span></p>`;
}

/**
 * Bands selectable in a mode (modeTypeList contains the mode's type), sorted by sortId.
 * @param {any[]} bands
 * @param {string|null} modeType 'SINGLE'|'MULTI'
 */
export function allowedBands(bands, modeType, customFactions = false) {
  const sid = (b) => (Number.isFinite(b.sortId) ? b.sortId : 99);
  return (Array.isArray(bands) ? bands : [])
    .filter((b) => b && (customFactions || !/custom_ursus/.test(b.bandId)) && (!modeType || !Array.isArray(b.modeTypeList) || b.modeTypeList.includes(modeType)))
    .sort((a, b) => sid(a) - sid(b) || (a.bandId < b.bandId ? -1 : a.bandId > b.bandId ? 1 : 0));
}

/** The official default strategy of an automatic assignment (data/config.json bandDraft.timeoutBandId). */
export const DEFAULT_TIMEOUT_BAND = 'band_bldsk';

/**
 * The strategy the server assigns me when my turn times out (server/match/Match.js defaultBand): the official default
 * 「华法琳」 while no teammate holds it, else the first free strategy in draft order (sortId) — never one a teammate
 * already picked (다른 참가자가 선택함).
 * @param {any[]} bands allowedBands(...) (sortId order)
 * @param {Map<string, any>} taken teammateBands(...)
 * @param {string} [defaultId]
 * @returns {string|null}
 */
export function timeoutBand(bands, taken, defaultId = DEFAULT_TIMEOUT_BAND) {
  const list = Array.isArray(bands) ? bands : [];
  const has = (id) => !!(taken && typeof taken.has === 'function' && id!==RANDOM_BAND_ID&&taken.has(id));
  if (defaultId && !has(defaultId) && (!list.length || list.some((b) => b.bandId === defaultId))) return defaultId;
  return list.find((b) => !has(b.bandId))?.bandId || defaultId || null;
}

/**
 * Bands taken by teammates (다른 참가자가 선택함): bandId → the picking players (never the viewer).
 * @param {Map<string, string>} picks normalizeDraft(...).picks (playerId → bandId)
 * @param {string} myId
 */
export function teammateBands(picks, myId) {
  const out = new Map();
  for (const [pid, bid] of picks instanceof Map ? picks : []) {
    if (pid === myId || bid===RANDOM_BAND_ID || typeof bid !== 'string') continue;
    if (!out.has(bid)) out.set(bid, []);
    out.get(bid).push(pid);
  }
  return out;
}

/**
 * The band the detail pane shows (= the highlighted band a turn that runs out takes): the current one, else my pick,
 * else the band a timeout would give me (timeoutBand: 「华法琳」 while free, else the first free one). When it is my
 * turn and the shown band was taken meanwhile (다른 참가자가 선택함), that default instead (confirm would be disabled).
 * @param {string|null} sel
 * @param {{ bands: any[], taken: Map<string, any>, myPick: string|null, myTurn: boolean, defaultId?: string }} o
 */
export function draftSelection(sel, { bands, taken, myPick, myTurn, defaultId = DEFAULT_TIMEOUT_BAND }) {
  if (myPick) return myPick;
  if (!Array.isArray(bands) || !bands.length) return sel;
  const free = timeoutBand(bands, taken, defaultId) || bands[0].bandId;
  if (!sel) return myPick || free;
  if (!myPick && myTurn && sel!==RANDOM_BAND_ID&&taken.has(sel)) return free;
  return sel;
}

/**
 * The strategy a turn that runs out assigns me (server Match.timeoutBand): the highlighted band while it is one of
 * the mode's and no teammate holds it, else timeoutBand. Null after my pick.
 * @param {string|null} sel the highlighted band
 * @param {{ bands: any[], taken: Map<string, any>, myPick?: string|null, defaultId?: string }} o
 */
export function autoPickBand(sel, { bands, taken, myPick = null, defaultId = DEFAULT_TIMEOUT_BAND }) {
  if (myPick) return null;
  const list = Array.isArray(bands) ? bands : [];
  const has = (id) => !!(taken && typeof taken.has === 'function' && id!==RANDOM_BAND_ID&&taken.has(id));
  if (sel && !has(sel) && list.some((b) => b.bandId === sel)) return sel;
  return timeoutBand(list, taken, defaultId);
}

/**
 * The tip under the co-op draft order: the one skip, the turn clock and what a turn that runs out assigns me (the
 * highlighted band while free — autoPickBand). Untimed drafts (a single human) name no clock.
 * @param {{ timed: boolean, turnSeconds?: number|null, autoName?: string|null, selected?: boolean }} o
 *   selected: the auto pick is the highlighted band (not the default standing in for a band a teammate holds)
 */
export function draftTip({ timed, turnSeconds = null, autoName = null, selected = true }) {
  const skip = '联合模拟在选择策略时可以进行一次跳过';
  if (!timed) return `${skip}；本局不限时`;
  const clock = Number(turnSeconds) > 0 ? `每位博士有 ${Math.round(turnSeconds)} 秒` : '每位博士限时决策';
  if (!autoName) return `${skip}；${clock}`;
  return `${skip}；${clock}，超时将自动选择${selected ? '当前选中的' : ''}「${autoName}」`;
}

/**
 * The step header's countdown during the draft: the current turn's (m.public.deadline = draft.turnDeadline) with a
 * turn's length as the gauge total — null when the draft is untimed.
 * @param {any} pub m.public
 * @returns {{ deadline: number, total: number|null } | null}
 */
export function draftClock(pub) {
  const d = pub && typeof pub.draft === 'object' ? pub.draft : null;
  if (!d || d.untimed) return null;
  const deadline = Number(pub.deadline) > 0 ? Number(pub.deadline) : Number(d.turnDeadline) || 0;
  if (!(deadline > 0)) return null;
  return { deadline, total: Number(d.turnSeconds) > 0 ? Number(d.turnSeconds) : null };
}

/**
 * The status line of the 本局信息 dialog: what the draft does while the dialog covers it — my pick, else whose turn it is
 * with the turn's seconds left (the step header's number; none when untimed), warning at ≤ 10 s like the countdown.
 * @param {{ myPick?: string|null, pickName?: string|null, myTurn: boolean, turnName?: string|null, secs?: number|null,
 *   waiting?: boolean }} o waiting: teammates still have to pick after my pick
 * @returns {{ text: string, secs: number|null, tone: 'mint'|'gold'|'warn'|'dim' }}
 */
export function draftInfoStatus({ myPick = null, pickName = null, myTurn, turnName = null, secs = null, waiting = false }) {
  if (myPick) return { text: `선택 완료「${pickName || ''}」${waiting ? ' · 다른 참가자 선택 대기 중' : ''}`, secs: null, tone: 'mint' };
  const s = Number.isFinite(secs) ? Math.max(0, Math.round(secs)) : null;
  const tone = s != null && s <= 10 ? 'warn' : 'gold';
  if (myTurn) return { text: '轮到你决策', secs: s, tone };
  return { text: turnName ? `${turnName} 决策中` : '等待轮到你', secs: s, tone: s != null ? tone : 'dim' };
}

/** BAND_DRAFT screen. */
export function BandDraftScreen() {
  const pub = useStore((s) => s.match.public);
  const priv = useStore((s) => s.match.private);
  const myId = useStore((s) => s.me.playerId);
  const roomSolo = useStore((s) => s.room?.mode === 'solo');
  const gd = useGameData();
  const [selection, setSel] = useState(null);
  const [busy, setBusy] = useState(null);
  const [exit, setExit] = useState(false);
  const [skipped, setSkipped] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [bondId, setBondId] = useState(null);
  useEffect(() => { setBondId(null); }, [infoOpen]);

  const mode = gd.config?.modes?.[pub?.modeId];
  const offBonds = modeOffBonds(mode); // the bonds this mode never activates (标准: 10 of 23)
  const solo = roomSolo || mode?.type === 'SINGLE' || String(pub?.modeId || '').includes('single');
  const customFactions = !!pub?.customFactions;
  const bands = useMemo(() => allowedBands(gd.list('bands'), mode?.type || (solo ? 'SINGLE' : 'MULTI'), customFactions), [gd.ready, mode?.type, solo, customFactions]);
  const players = sortedPlayers(pub);
  const draft = normalizeDraft(pub?.draft, players);
  const myPick = draft.picks.get(myId) || priv?.bandId || null;
  const myTurn = !myPick && (solo || draft.turnPid === myId);
  const skipsLeft = draft.skipsLeft.has(myId) ? draft.skipsLeft.get(myId) : (skipped ? 0 : 1);
  const canSkip = !solo && myTurn && skipsLeft > 0 && draft.order.filter(pid => !draft.picks.has(pid)).length > 1;
  const taken = solo || pub?.customExtensions?.rules?.includes('duplicateBands') ? new Map() : teammateBands(draft.picks, myId);
  const pickers = new Map(); // bandId → players
  for (const [pid, bid] of draft.picks) {
    const p = players.find((x) => x.playerId === pid);
    if (!pickers.has(bid)) pickers.set(bid, []);
    pickers.get(bid).push(p || { playerId: pid, name: '?' });
  }

  // default selection: my pick, else what a timeout gives me (华法琳 while free); when my turn comes while the selected
  // band has been taken by a teammate meanwhile (다른 참가자가 선택함), move the selection back to that default
  const defaultId = gd.config?.bandDraft?.timeoutBandId || DEFAULT_TIMEOUT_BAND;
  const sel = draftSelection(selection, { bands, taken, myPick, myTurn, defaultId });
  useEffect(() => {
    if (selection !== sel) setSel(sel);
  }, [selection, sel]);
  // "your turn" cue
  useEffect(() => { if (myTurn && !solo) audio.sfx('yourTurn'); }, [myTurn]);
  const [turnBanner, setTurnBanner] = useState(0);
  useEffect(() => { if(myTurn && !solo && bootArtReady() && !reducedMotion()) setTurnBanner(n => n + 1); }, [myTurn]);
  // the 本局信息 dialog never outlives the turn it was opened in: a turn change (a pick, a skip, a turn that ran out, an
  // AI pick) or my pick closes it, so whoever's turn begins sees the draft
  const turnKey = `${draft.turnPid || ''}|${myPick || ''}`;
  useEffect(() => { setInfoOpen(false); }, [turnKey]);

  // one countdown (user playtest #4 item 4): the current turn's — m.public.deadline, the same clock as the picker's row
  const clock = solo ? null : draftClock(pub);
  // the highlighted band is what a turn that runs out takes (Match.timeoutBand): report every change before my pick
  const timed = !solo && !!pub?.draft && !pub.draft.untimed;
  const focusSent = useRef(null);
  useEffect(() => {
    // (a spectator seat — community report #26 — is in no draft order: it never reports)
    if (!timed || myPick || !sel || focusSent.current === sel || !draft.order.includes(myId)) return;
    focusSent.current = sel;
    act('g.bandFocus', { bandId: sel }, { sfx: false, quiet: true });
  }, [sel, timed, myPick]);

  // what a timeout gives me: the highlighted band while free, else the default (never 다른 참가자가 선택함 — Match.js timeoutBand)
  const autoId = autoPickBand(sel, { bands, taken, myPick, defaultId });
  const autoName = (autoId && gd.band(autoId)?.name) || gd.band(defaultId)?.name || '华法琳';

  const band = sel ? gd.band(sel) : null;
  const selTaken = !!band && band.bandId!==RANDOM_BAND_ID && taken.has(band.bandId);
  const confirm = async () => {
    if (!band || busy || !myTurn || selTaken) return;
    setBusy('pick');
    await actions.band(band.bandId);
    setBusy(null);
  };
  const skip = async () => {
    if (busy || !canSkip) return;
    setBusy('skip');
    if (await actions.bandSkip()) setSkipped(true);
    setBusy(null);
  };
  const turnName = players.find((p) => p.playerId === draft.turnPid)?.name;
  useTicker(clock ? 250 : 0);
  // the picker's row shows the step header's number (both read the one turn deadline)
  const turnSecs = clock ? secondsLeft(clock.deadline) : null;
  const turnLen = Number(pub?.draft?.turnSeconds) > 0 ? Math.round(pub.draft.turnSeconds) : null;
  // 本局信息: the briefing's blocks (built only while the dialog is open) and the draft's state under it
  const info = infoOpen ? matchInfoModel(pub, { bonds: gd.list('bonds'), chess: gd.chess, mode }) : null;
  const infoStatus = infoOpen ? draftInfoStatus({ myPick, pickName: myPick ? gd.band(myPick)?.name : null, myTurn, turnName, secs: turnSecs,
    waiting: !solo && !draft.done }) : null;

<<<<<<< ours
  return html`<div class="screen draft">
    <div class="brief__bg" aria-hidden="true"></div>
    <${StepHeader} step=${2} of=${2} title="选择策略" micro="STRATEGY // BAND CHECK" pub=${clock ? { ...pub, deadline: clock.deadline } : { ...pub, deadline: 0 }}
      total=${clock ? clock.total : null} onExit=${() => setExit(true)} />
=======
  // 名片干员 art of the order rows (as on the room's seat cards: the doctor's pick, else one chosen by the player id), in
  // the doctor's outfit for that operator (B6 picture-only outfits, docs/SKINS.md; the maintainer's decision 4 of 2026-10-21
  // for the seat cards; ui/seatArt.js seatCardSkin): one's own choice at once, a teammate's from the match's public
  // players (m.public.players[].skins), none for another seat while 「显示其他玩家的皮肤」 is off, the default art when the
  // outfit's pictures are not here (chessPortraitUrl) — or fail to load (the row falls back to them: §35.51)
  // (gd.backups: the room version's 自选编队 pool joins the card list, as on the room's seat cards)
  const cards = useMemo(() => cardContext(cardOperators(gd.list('chess'), gd.backups), { pending: !gd.backups }), [gd.ready, gd.backups]);
  const myCard = useStore((s) => s[CARD_KEY], Object.is, cardStore);
  const localSkins = useStore((s) => s[SKINS_KEY], Object.is, skinsStore);
  const otherSkins = useStore((s) => s.otherSkins !== false, Object.is, settingsStore);
  const artOf = (p) => {
    if (p.isBot) return null;
    const seat = (Array.isArray(roomSeats) && roomSeats.find((x) => x && x.playerId === p.playerId)) || { playerId: p.playerId };
    const op = seatOperator(seat, cards, { myId, myCard });
    const skin = op ? seatCardSkin(p, op.chess.charId, { myId, localSkins, players, otherSkins }) : null;
    return op ? [chessPortraitUrl(data.get('assets'), op.chess, { skin }), skin ? chessPortraitUrl(data.get('assets'), op.chess) : null] : null;
  };
  // this browser's records (up to the stats store's size): read once, after the screen and its entry are up, not while
  // it mounts
  const [local, setLocal] = useState(NO_RECORDS);
  useEffect(() => {
    const later = globalThis.requestIdleCallback ? (fn) => globalThis.requestIdleCallback(fn, { timeout: 1200 }) : (fn) => setTimeout(fn, 300);
    const cancel = globalThis.cancelIdleCallback && globalThis.requestIdleCallback ? (id) => globalThis.cancelIdleCallback(id) : (id) => clearTimeout(id);
    const id = later(() => setLocal(draftRecords(peekStatsRecords(), data.get('bands'))));
    return () => cancel(id);
  }, []);
  const myMedal = useMemo(() => {
    const medal = trophyMedalOf(local.trophies, gd.config?.trophies?.medals);
    return medal ? uiUrl(data.get('assets'), `medalIcon/${medal.iconId}`) : null;
  }, [gd.ready, local]);

  // what the right side shows: 已选定策略 after my pick, else the detail pane once opened, else only the wall
  const allPicked = !!draft.done || (draft.order.length > 0 && draft.order.every((pid) => draft.picks.has(pid)));
  const view = peek ? 'detail' : inOrder && myPick ? 'done' : open && band ? 'detail' : 'grid';
  const shownBand = peek ? gd.band(peek) : band;
  const rows = solo ? players.filter((p) => p.playerId === myId) : draft.order.map((pid) => players.find((p) => p.playerId === pid)).filter(Boolean);

  const head = allPicked ? html`<div class="dturn is-done"><span class="dturn__txt"><b>${t('策略选择完成')}</b><span>${t('正在进入模拟…')}</span></span><${Icon} name="hourglass" class="dturn__glass" /></div>`
    : myTurn ? html`<div class="dturn is-turn">
        <span class="dturn__go"><${Sprite} k="bandChoose/youturn_finger" class="dturn__finger" fallback=${html`<${Icon} name="chevronLeft" class="dturn__finger" />`} />
          <b>${t('请选择策略')}</b></span>
        ${!solo ? html`<button type="button" class="draft-skip" disabled=${!canSkip || !!busy} aria-busy=${busy === 'skip' ? 'true' : undefined} onClick=${skip}
            title=${skipsLeft > 0 ? t('跳过本轮，稍后再选') : t('跳过次数已用完')}>
          <svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 19v-5a7 7 0 0 1 7-7h7V3.5L22.5 9 17 14.5V11h-7a3 3 0 0 0-3 3v5z" /></svg>
          <span>${skipsLeft > 0 ? t('跳过选择') : t('无法跳过')}</span></button>` : null}
      </div>`
    : turnName ? html`<div class="dturn"><span class="dturn__txt"><b>${turnName}</b><span>${t('正在选择策略…')}</span></span><${Icon} name="hourglass" class="dturn__glass" /></div>`
    : null;

  // held after the draft (the server is already in BATTLE_CHECK): only to look at — 离开, 本局信息 and the 🔍 boxes would
  // open dialogs the match screen tears down a moment later
  return html`<div class=${cx('screen draft', `draft--${view}`, held && 'is-held', head && 'has-status')} inert=${held ? true : undefined} aria-busy=${held ? 'true' : undefined}>
    <div class="brief__bg" aria-hidden="true"></div>
    <${StepHeader} step=${pregameStepIndex(gd.config, 'BAND_CHECK')} of=${pregameStepCount(gd.config)} title=${t('选择策略')} micro="STRATEGY // BAND CHECK" pub=${clock ? { ...pub, deadline: clock.deadline } : { ...pub, deadline: 0 }}
      total=${clock ? clock.total : null} onExit=${() => setExit(true)}
      extra=${html`<button type="button" class="stephead__info" data-testid="match-info-open" aria-haspopup="dialog" onClick=${() => setInfoOpen(true)}
        title=${t('本局信息')}><${Icon} name="search" /><span>${t('本局信息')}</span></button>`}
      status=${head} />
>>>>>>> theirs
    <main class="draft__main">
      <aside class="draft-order">
        <div class="draft-order__settings"><${LoadoutButton} from="bandDraft" class="draft-order__loadout" /></div>
        <h3 class="brief-h"><span>${solo ? '独立模拟' : '决策顺序'}</span><${MicroLabel}>${solo ? 'FREE PICK' : 'RANDOM ORDER'}</${MicroLabel}></h3>
        ${(solo ? players.filter((p) => p.playerId === myId) : draft.order.map((pid) => players.find((p) => p.playerId === pid)).filter(Boolean)).map((p, i) => {
          const picked = draft.picks.get(p.playerId) || (p.playerId === myId ? myPick : p.bandId) || null;
          const cur = !picked && (solo || draft.turnPid === p.playerId);
          const pband = picked ? gd.band(picked) : null;
          return html`<div key=${p.playerId} class=${cx('dorder', cur && 'is-cur', picked && 'is-done', p.playerId === myId && 'is-self')}>
            ${!solo ? html`<span class="dorder__idx num">${i + 1}</span>` : null}
            <${PlayerAvatar} player=${p} self=${p.playerId === myId} />
            <div class="dorder__text">
              <b class="dorder__name">${p.name || '博士'}${p.isBot ? html`<span class="dorder__ai">AI</span>` : null}</b>
              <span class="dorder__state">${picked ? html`<span class="t-mint">${pband?.name || '선택 완료'}</span>`
                : cur ? html`<span class="t-gold"><${Icon} name="hourglass" />决策中${turnSecs != null ? html`<b class="num dorder__secs">${turnSecs}s</b>` : null}</span>`
                : html`<span class="t-dim"><${Icon} name="dots" />대기 중</span>`}</span>
            </div>
            <span class="dorder__box">
              ${picked ? html`<${BandIcon} bandId=${picked} size="sm" /><span class="dorder__check"><${Icon} name="check" /></span>`
                : cur && p.playerId === myId ? html`<${Sprite} k="bandChoose/youturn_finger" class="dorder__finger" fallback=${html`<${Icon} name="chevronLeft" />`} />`
                : null}
            </span>
          </div>`;
        })}
        <${Button} variant="secondary" icon="search" block=${true} class="draft-order__info" data-testid="match-info-open"
          aria-haspopup="dialog" onClick=${() => setInfoOpen(true)}>시뮬레이션 정보 보기<//>
        ${!solo ? html`<p class="draft-order__tip" data-testid="draft-tip">${draftTip({ timed, turnSeconds: turnLen, autoName: myPick ? null : autoName, selected: autoId === sel })}</p>` : null}
      </aside>

<<<<<<< ours
      <section class="draft-grid" role="listbox" aria-label="策略">
        ${bands.map((b) => {
          const who = pickers.get(b.bandId) || [];
          const isTaken = b.bandId!==RANDOM_BAND_ID&&taken.has(b.bandId);
          const offNames = bandOffBonds(b, offBonds).map((id) => gd.bond(id)?.name || id); // 本局禁用 (still selectable)
          return html`<button key=${b.bandId} type="button" role="option" aria-selected=${sel === b.bandId ? 'true' : 'false'} data-band=${b.bandId}
              aria-disabled=${isTaken ? 'true' : 'false'} title=${isTaken ? '다른 참가자가 선택함' : offNames.length ? bandOffLine(offNames) : undefined}
              class=${cx('dband', sel === b.bandId && 'is-sel', myPick === b.bandId && 'is-mine', isTaken && 'is-taken', offNames.length && 'is-off')} onClick=${() => { setSel(b.bandId); audio.sfx('tab', { volume: 0.5 }); }}>
            <${BandIcon} bandId=${b.bandId} size="lg" />
            <span class="dband__name">${b.name}</span>
            <span class="dband__lp num"><i></i>${b.randomChoice?'?':b.totalHp}</span>
            <${BandOffTag} names=${offNames} />
            ${who.length ? html`<span class="dband__who">${who.slice(0, 8).map((p) => html`<${PlayerAvatar} key=${p.playerId} player=${p} size="sm" />`)}</span>` : null}
            ${isTaken ? html`<span class="dband__taken">다른 참가자가 선택함</span>` : null}
          </button>`;
        })}
      </section>

      <aside class="draft-detail brackets">
        ${band ? html`
          <div class="draft-detail__art">
            <${BandIcon} bandId=${band.bandId} size="xl" />
=======
      ${view === 'done' ? html`<section class="draft-done" key=${myPick} aria-live="polite">
          <div class="draft-done__art"><${BandIcon} bandId=${myPick} size="xl" /></div>
          <div class="draft-done__head">
            <span class="draft-tag">STRATEGY</span>
            <h2 class="draft-done__title">${t('已选定策略')}</h2>
            <b class="draft-done__name">${gd.band(myPick)?.name || ''}</b>
          </div>
          <div class="draft-done__hp">${t('初始生命值')}<b class="num">${gd.band(myPick)?.totalHp ?? '--'}</b></div>
          ${gd.band(myPick) ? html`<${BandText} band=${gd.band(myPick)} class="draft-done__desc" />` : null}
          <p class="draft-detail__status t-mint"><${Icon} name="check" />${t('已选择「{name}」', { name: gd.band(myPick)?.name || '' })}${!solo && !allPicked ? t('，等待其他博士') : ''}</p>
        </section>` : html`
        <section class="draft-grid" role="listbox" aria-label=${t('策略')}>
          ${bands.flatMap((b, i) => {
            // 规程 sorts its strategies into 泛用型策略 (bandType GENERAL) and 盟约型策略 (BONDRELEVANT), each under a header,
            // as the official draft shows them (BV11NW869ELq part 4 0:28, BV13LWM6BEvY match 1 1:36); a version without
            // bandType has no header
            const sec = BAND_SECTIONS[b.bandType];
            const head = sec && bands[i - 1]?.bandType !== b.bandType
              ? [html`<div key=${`sec-${b.bandType}`} class="draft-grid__sec" role="presentation" data-testid=${`band-section-${sec.id}`}><${Icon} name=${sec.icon} /><span>${t(sec.name)}</span></div>`] : [];
            const isTaken = taken.has(b.bandId);
            const offNames = bandOffBonds(b, offBonds).map((id) => gd.bond(id)?.name || id); // 本局禁用 (still selectable)
            const on = view === 'detail' && !peek && sel === b.bandId;
            const badged = local.badges.has(b.bandId); // (the count is the detail pane's 已通过模拟 N 次)
            return [...head, html`<button key=${b.bandId} type="button" role="option" aria-selected=${on ? 'true' : 'false'} data-band=${b.bandId}
                aria-disabled=${isTaken ? 'true' : 'false'} title=${isTaken ? t('已被选择') : offNames.length ? bandOffLine(offNames) : b.name}
                class=${cx('dband', on && 'is-sel', myPick === b.bandId && 'is-mine', isTaken && 'is-taken', offNames.length && 'is-off')} style=${`--n:${Math.min(i, 15)}`}
                onClick=${() => pickTile(b.bandId)}>
              <span class="dband__frame"><${BandIcon} bandId=${b.bandId} size="lg" /></span>
              <span class="dband__name">${b.name}</span>
              ${badged ? html`<span class="dband__badge" data-testid="band-badge" aria-hidden="true">
                <${Sprite} k="statistics/strategyBadge" class="dband__badge-art" fallback=${html`<span class="dband__medal"><${Icon} name="rook" /></span>`} /></span>` : null}
              <${BandOffTag} names=${offNames} />
              ${isTaken ? html`<span class="dband__taken">${t('已被选择')}</span>` : null}
              ${on ? html`<span class="dband__selmark" aria-hidden="true">SELECTED</span>` : null}
            </button>`];
          })}
        </section>
        ${view === 'detail' && shownBand ? html`<aside class="draft-detail" key="detail">
          <div class="draft-detail__body" key=${shownBand.bandId}>
            <div class="draft-detail__art"><${BandIcon} bandId=${shownBand.bandId} size="xl" /></div>
            ${local.won[shownBand.bandId] ? html`<span class="draft-detail__medal">${t('已通过模拟{n}次', { n: local.won[shownBand.bandId] })}</span>` : null}
            <div class="draft-detail__hp">${t('初始生命值')}<b class="num">${shownBand.totalHp ?? '--'}</b></div>
            <span class="draft-tag">STRATEGY</span>
            <h2 class="draft-detail__name">${shownBand.name}</h2>
            <${BandOffNote} names=${bandOffBonds(shownBand, offBonds).map((id) => gd.bond(id)?.name || id)} />
            <span class="draft-tag">INTRO</span>
            <div class="draft-detail__eff"><${BandText} band=${shownBand} class="draft-detail__desc" /></div>
>>>>>>> theirs
          </div>
          <div class="draft-detail__hp"><span>初始生命值</span><${LpTower} value=${band.totalHp} size="lg" /></div>
          <h2 class="draft-detail__name">${band.name}</h2>
          <${BandOffNote} names=${bandOffBonds(band, offBonds).map((id) => gd.bond(id)?.name || id)} />
          <div class="draft-detail__eff">
            <${MicroLabel} tone="mint">EFFECT</${MicroLabel}>
            <b>${band.effectName || ''}</b>
            <${RichText} as="p" text=${band.descRaw || band.desc} class="draft-detail__desc" />
          </div>` : html`<p class="t-dim">选择一个策略查看详情</p>`}
        <div class="draft-detail__actions">
          ${myPick ? html`<p class="draft-detail__status t-mint"><${Icon} name="check" />선택 완료「${gd.band(myPick)?.name || ''}」${!solo && !draft.done ? ' · 다른 참가자 선택 대기 중' : ''}</p>`
            : selTaken ? html`<p class="draft-detail__status draft-detail__status--taken"><${Icon} name="close" />다른 참가자가 선택했습니다. 다른 전략을 선택하세요.</p>`
            : !myTurn ? html`<p class="draft-detail__status"><${Icon} name="hourglass" />${turnName ? `${turnName} 正在决策…` : '等待轮到你'}</p>` : null}
          <div class="draft-detail__btns">
            ${!solo ? html`<${Button} variant="secondary" size="lg" icon="chevrons" disabled=${!canSkip} loading=${busy === 'skip'} onClick=${skip}
              title=${skipsLeft > 0 ? '跳过本轮，稍后再选' : '跳过次数已用完'}>跳过${skipsLeft > 0 ? '' : '（已用）'}<//>` : null}
            <${Button} variant="primary" size="lg" icon="check" disabled=${!myTurn || !band || selTaken} loading=${busy === 'pick'} onClick=${confirm}>${selTaken ? '다른 참가자가 선택함' : '确认选择'}<//>
          </div>
        </div>
      </aside>
    </main>
    ${solo ? null : html`<${ChatPanel} />`}
    <${ExitModal} open=${exit} onClose=${() => setExit(false)} solo=${solo} />
<<<<<<< ours
    <${MatchInfoDialog} open=${infoOpen} onClose=${() => setInfoOpen(false)} model=${info} overview=${html`<${BriefingOverview} pub=${pub} />`}
=======
    <${MatchInfoDialog} open=${infoOpen} onClose=${() => setInfoOpen(false)} model=${info} onBond=${setBondId}
      enemies=${infoOpen ? html`<${MatchEnemies} pub=${pub} gd=${gd} idScope="minfo" />` : null}
>>>>>>> theirs
      status=${infoStatus ? html`<span class=${cx('minfo-dlg__turn', `is-${infoStatus.tone}`)}>
        <${Icon} name=${infoStatus.tone === 'mint' ? 'check' : 'hourglass'} />${infoStatus.text}${infoStatus.secs != null ? html`<b class="num">${infoStatus.secs}s</b>` : null}
      </span>` : null} />
    <${MatchBondDialog} bondId=${infoOpen ? bondId : null} onClose=${() => setBondId(null)} priv=${priv} banned=${info?.banned} off=${!!info?.sets.off.has(bondId)} coreAbsent=${regulationCoreAbsent(info, bondId)} />
    ${turnBanner ? html`<${TurnBanner} key=${turnBanner} onDone=${() => setTurnBanner(0)} />` : null}
  </div>`;
}
