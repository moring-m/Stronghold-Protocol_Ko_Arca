import {AUGMENT_ROUNDS} from '../../../shared/augments.js';
import {GAMEPLAY_MODES,GAMEPLAY_MODE_NAMES,normalizeGameplayMode,canSwitchPublicMode} from '../../../shared/gameplayModes.js';
import { TestMark } from "../ui/testConsole.js";
import { extensionSelectionCount } from '../../../shared/customExtensions.js';
import { t } from '../../../shared/i18n.js';
import { openStats } from '../ui/statsEntry.js';
import { ChatPanel } from '../ui/chat.js';
// Room screen (同盟等待室): 4 seat cards (avatar frame, name, ready state, AI badge, host crown),
// host controls (difficulty picker, add/remove AI and the 「AI 队友最后选择」 switch in co-op, start), invite code with
// copy code / copy link, ready toggle and leave.
//
// Start rule (server/lobby.js): room.start needs every *other* human connected and ready; the
// host's start counts as the host's ready. So 开始模拟 is enabled exactly then and sends room.start
// alone (no separate room.ready round trip that could leave the host "ready" after a failed start).
// Solo rooms show a single seat.
// Spectator seats (community report #26, a remake feature): a co-op room with spectators shows the 观战席 strip under
// the seats — names, offline marks, the host's ✕ (room.removeSpectator) — and a spectator's own view swaps the ready
// button for 观战中 and offers 入座 (room.join of the room) while a player seat is free.
// Plugins (DESIGN §32 P1a): the tag under the title — 「原版」 or 「插件 ×N」 — opens the 插件 panel (ui/pluginPanel.js:
// the host switches the room's plugins, everybody else reads them). With gameplay plugins (§32.6: a content set of its
// own — the tag reads 「非官方」 too) every seat shows whether its page has loaded and checked the room's content
// (seats[].content: 载入中 / 就绪 / 校验失败), 准备就绪 and 开始模拟 wait for it (the server refuses them before:
// CONTENT_NOT_READY), and a plugin mode the host chose shows beside the difficulty.
// Texts go through t() (docs/I18N.md).

import { useEffect, useRef, useState } from '../../vendor/hooks.module.js';
import { DIFFICULTIES, DIFFICULTY_NAMES, DIFFICULTY_COLORS, MAX_SEATS, roomSeatCap, MAX_SPECTATORS } from '../../../shared/constants.js';
import { html, Button, Icon, MicroLabel, PingPill, AvatarFrame, DifficultyTag, DifficultyIcon, Tooltip, confirmDialog, doctorNo, Modal } from '../ui/components.js';
import { toast, toastError } from '../ui/toasts.js';
import { tr } from '../i18n/i18n.js';
import { copyText } from '../ui/clipboard.js';
import { FactionBadge } from '../ui/chatFaction.js';
import { PatchNotesButton } from '../ui/patchNotes.js';
import { GuideButton } from '../ui/guide.js';

import { SettingsButton } from '../ui/settings.js';
import { LoadoutButton } from '../ui/loadoutEntry.js';
import { CustomExtensionsDialog } from '../ui/customExtensions.js';
import { saveCustomExtensionPrefs } from '../ui/customExtensionPrefs.js';
import { isModdedRoom } from '../ui/pluginTag.js';
import { hasScriptConsent, rememberScriptConsent } from '../content.js';
import { net } from '../net.js';
import { store, useStore, shallowEqual, emptyMatch, isSpectating, savePref } from '../store.js';
import { difficultyInfo } from './lobby.js';

/**
 * Seats padded to the room's capacity (co-op 4, solo 1), each null or a seat record.
 * @param {any} room room.state payload
 * @returns {(null | {seat:number, playerId:any, name:string, isBot:boolean, ready:boolean, connected:boolean})[]}
 */
export function normalizeSeats(room) {
  const cap = roomSeatCap(room?.mode);
  const src = Array.isArray(room?.seats) ? room.seats : [];
  const out = [];
  for (let i = 0; i < cap; i++) {
    const s = src[i];
    out.push(s && typeof s === 'object' ? { ...s, seat: Number.isInteger(s.seat) ? s.seat : i } : null);
  }
  return out;
}

/**
 * Derived room facts for the local player.
 * @param {any} room
 * @param {any} myId
 */
export function roomFacts(room, myId) {
  const seats = normalizeSeats(room);
  const occupied = seats.filter(Boolean);
  const humans = occupied.filter((s) => !s.isBot);
  const mine = occupied.find((s) => s.playerId === myId) || null;
  const isHost = room?.hostId != null && room.hostId === myId;
  const others = humans.filter((s) => s.playerId !== myId);
  // The host never readies: starting the match is the host's ready (server rule), so the count
  // treats the host as ready — "已就绪 0/1" next to "准许进入模拟" would contradict itself.
  const isReady = (s) => !!s.ready || s.playerId === room?.hostId;
  const readyHumans = humans.filter(isReady).length;
  const othersReady = others.every((s) => s.ready && s.connected !== false);
  // a room with gameplay plugins (DESIGN §32.6): every player's page has loaded and checked its content (the host's too)
  const modded = isModdedRoom(room);
  const contentReady = !modded || humans.every((s) => s.content === 'ready');
  return {
    seats, occupied, humans, mine, isHost, readyHumans, isReady,
    emptySeats: seats.filter((s) => !s).length,
    canStart: isHost && othersReady && !!mine && contentReady && (!room?.content?.trusted || humans.every(s => room.content.trusted.consent[s.seat])),
    othersReady,
    modded,
    contentReady,
    myContent: modded ? (mine?.content || 'loading') : 'ready',
    // spectator seats (never players: not in `humans`, never counted for ready / start)
    spectators: Array.isArray(room?.spectators) ? room.spectators.filter((s) => s && typeof s === 'object') : [],
    spectatorCap: Number.isInteger(room?.spectatorCap) && room.spectatorCap >= 0 ? room.spectatorCap : MAX_SPECTATORS,
    spectating: isSpectating(room, myId),
  };
}

/**
 * The co-op room option 「AI 队友最后选择」 (GitHub #338; room.setAiPicksLast, room.state.aiPicksLast): in the strategy and
 * 机变 drafts every human picks before the AI teammates. null in a solo room (no AI teammates); otherwise its state (off
 * when the server sends none) and whether this player may switch it — the host only, the others see it read-only.
 * @param {any} room room.state payload
 * @param {any} myId
 * @returns {{ on: boolean, editable: boolean } | null}
 */
export function aiLastOption(room, myId) {
  if (!room || room.mode === 'solo') return null;
  return { on: room.aiPicksLast === true, editable: room.hostId != null && room.hostId === myId };
}

/** Invite link for a room code (current page URL with ?room=CODE). */
export function inviteLink(code) {
  const loc = globalThis.location;
  const base = loc ? `${loc.origin}${loc.pathname}` : '';
  return `${base}?room=${encodeURIComponent(code)}`;
}

/**
 * Copy text to the clipboard (async API with a textarea fallback for insecure contexts). Moved to ui/clipboard.js so
 * 干员调配 can use it without importing this screen (which imports loadout.js): re-exported here for existing callers.
 * @param {string} text
 * @returns {Promise<boolean>}
 */
export { copyText };

function SeatCard({ seat, index, room, facts, myId, busy, onAddBot, onRemoveBot, onKick }) {
  const coop = room.mode !== 'solo';
  if (!seat) {
    const canAdd = coop && facts.isHost;
    return html`<article class="seat seat--empty" style=${`--seat-i:${index}`}>
      <header class="seat__head"><span class="seat__no num">P${index + 1}</span><${MicroLabel}>SEAT ${String(index + 1).padStart(2, '0')}<//></header>
      <div class="seat__art seat__art--empty">
        <div class="seat__radar" aria-hidden="true"></div>
        <span class="seat__wait">等待博士加入</span>
        <${MicroLabel}>AWAITING DOCTOR<//>
      </div>
      <footer class="seat__foot">
        ${canAdd
          ? html`<${Button} variant="secondary" size="sm" icon="robot" block=${true} loading=${busy === `add`} onClick=${onAddBot}>添加 AI 队友<//>`
          : html`<span class="seat__state t-dim">空位</span>`}
      </footer>
    </article>`;
  }
  const consent = room.content?.trusted?.consent?.[seat.seat];
  const isMe = seat.playerId === myId;
  const isHostSeat = seat.playerId === room.hostId;
  const offline = seat.connected === false && !seat.isBot;
  // The host never needs to toggle ready: starting the match readies them (server rule).
  const state = offline ? 'offline' : seat.ready || seat.isBot ? 'ready' : isHostSeat ? 'host' : 'waiting';
  return html`<article class=${`seat brackets${isMe ? ' is-me' : ''}${isHostSeat ? ' is-host' : ''}${seat.isBot ? ' is-bot' : ''} is-${state}`}
      style=${`--seat-i:${index}`}>
    ${consent ? html`<span data-testid="script-consented">${t('已同意')}</span>` : null}
    <header class="seat__head">
      <span class="seat__no num">P${index + 1}</span>
      <${MicroLabel}>SEAT ${String(index + 1).padStart(2, '0')}<//>
      ${isHostSeat ? html`<span class="seat__host"><${Icon} name="crown" />创建者</span>` : null}
    </header>
    <div class="seat__art">
      <div class="seat__stripes" aria-hidden="true"></div>
      <${AvatarFrame} size=${room.mode==='coop8'?'md':'xl'} name=${seat.name} seat=${index} bot=${seat.isBot} self=${isMe} ready=${state === 'ready'} offline=${offline} badge=${html`<${FactionBadge} playerId=${seat.playerId} faction=${seat.chatFaction} />`} />
      ${seat.isBot ? html`<span class="seat__bot-label"><${Icon} name="robot" />AI 队友</span>` : null}
    </div>
    <div class="seat__who">
      <span class="seat__name">${seat.name || '博士'}</span>
      ${isMe ? html`<span class="seat__you">你</span>` : null}
    </div>
    <${MicroLabel}>${seat.isBot ? 'AUTONOMOUS UNIT' : `DOCTOR #${doctorNo(seat.playerId)}`}<//>
    ${facts.modded && !seat.isBot ? html`<span class=${`seat__content is-${seat.content || 'loading'}`} data-testid="seat-content">
      ${seat.content === 'ready' ? t('插件内容就绪') : seat.content === 'failed' ? t('插件内容校验失败') : t('插件内容载入中')}
    </span>` : null}
    <footer class="seat__foot">
      <span class=${`seat__state seat__state--${state}`}>
        ${state === 'ready' ? html`<${Icon} name="check" />已就绪`
          : state === 'offline' ? html`<${Icon} name="wifiOff" />连接中断`
          : state === 'host' ? html`<${Icon} name="crown" />待命中`
          : html`<${Icon} name="hourglass" />准备中`}
      </span>
      ${seat.isBot && facts.isHost ? html`<${Tooltip} text="移除该 AI 队友">
        <${Button} variant="ghost" size="sm" square=${true} icon="close" loading=${busy === `rm${index}`} onClick=${() => onRemoveBot(index)} aria-label="移除 AI 队友" />
      <//>` : null}
      ${!seat.isBot && !isMe && facts.isHost ? html`<${Tooltip} text="将该博士移出同盟">
        <${Button} variant="ghost" size="sm" square=${true} icon="close" loading=${busy === `kick${index}`} onClick=${() => onKick(index, seat.name, seat.playerId)} aria-label="移出该博士" />
      <//>` : null}
    </footer>
  </article>`;
}

/** 观战席: the room's spectators (host: ✕ frees a seat), and 入座 for a spectator while a player seat is free.
 *  The host's own cap (`facts.spectatorCap`, room.create {spectators}) labels the counter; a cap of 0 hides the strip. */
function SpectatorBar({ facts, myId, busy, onRemove, onSit, onSpectate, roleCooling }) {
  if (!facts.spectators.length && facts.spectatorCap <= 0) return null;
  return html`<section class="specbar" aria-label="观战席">
    <span class="specbar__label"><${Icon} name="eye" />观战席<b class="num">${facts.spectators.length}</b><span class="num t-dim">/${facts.spectatorCap}</span></span>
    ${facts.spectatorCap <= 0 ? html`<span class="specbar__off t-dim">本局不接受观战</span>` : null}
    ${facts.spectators.map((s) => html`<span key=${s.playerId} class=${`specbar__who${s.playerId === myId ? ' is-me' : ''}${s.connected === false ? ' is-offline' : ''}`}>
      ${s.connected === false ? html`<${Icon} name="wifiOff" />` : null}${s.name || '博士'}${s.playerId === myId ? html`<span class="seat__you">你</span>` : null}
      ${facts.isHost ? html`<${Button} variant="ghost" size="sm" square=${true} icon="close" loading=${busy === `rs${s.playerId}`}
        onClick=${() => onRemove(s.playerId)} aria-label=${`移出观战者 ${s.name || ''}`} title="移出该观战者" />` : null}
    </span>`)}
    ${!facts.spectating && facts.spectators.length < facts.spectatorCap ? html`<${Button} size="sm" icon="eye" loading=${busy === 'spectate'} disabled=${roleCooling || !!busy} onClick=${onSpectate}>관전으로 전환<//>` : null}
    ${facts.spectating && facts.emptySeats > 0 ? html`<${Button} size="sm" icon="user" loading=${busy === 'sit'} disabled=${roleCooling || !!busy} onClick=${onSit}>入座<//>` : null}
  </section>`;
}

function InviteBox({ code, name, difficulty }) {
  const copy = async (what) => {
    const ok = await copyText(what === 'code' ? code : `${inviteLink(code)} ${tr('{0}邀请你加入卫戍协议：盟约【{1}】').replace('{0}',name).replace('{1}',tr(DIFFICULTY_NAMES[difficulty]))}`);
    if (ok) toast(what === 'code' ? `已复制同盟密钥 ${code}` : '已复制邀请链接', 'success');
    else toast('复制失败，请手动复制', 'warn');
  };
  return html`<div class="invite brackets">
    <div class="invite__label"><${Icon} name="key" /><span>同盟密钥</span><${MicroLabel}>ALLIANCE KEY<//></div>
    <div class="invite__code num selectable" aria-label=${`同盟密钥 ${code}`}>${[...String(code)].map((ch, i) => html`<span key=${i}>${ch}</span>`)}</div>
    <div class="invite__btns">
      <${Button} size="sm" icon="copy" onClick=${() => copy('code')}>复制密钥<//>
      <${Button} size="sm" icon="link" onClick=${() => copy('link')}>复制链接<//>
    </div>
  </div>`;
}

function DifficultyPicker({ room, isHost, busy, onPick }) {
  if (!isHost) {
    return html`<div class="dpick dpick--ro">
      <${DifficultyTag} difficulty=${room.difficulty} size="lg" code=${difficultyInfo(room.mode, room.difficulty).code} />
      <span class="t-dim">由创建者选择</span>
    </div>`;
  }
  return html`<div class="dpick" role="radiogroup" aria-label="模拟难度">
    ${DIFFICULTIES.map((d) => html`<button key=${d} type="button" role="radio" aria-checked=${room.difficulty === d ? 'true' : 'false'}
        class=${`dpick__opt${room.difficulty === d ? ' is-active' : ''}`} style=${`--d-color:${DIFFICULTY_COLORS[d]}`}
        disabled=${!!busy} onClick=${() => room.difficulty !== d && onPick(d)}>
      <${DifficultyIcon} difficulty=${d} />${DIFFICULTY_NAMES[d].replace('模拟', '')}
    </button>`)}
  </div>`;
}

/** The 「AI 队友最后选择」 switch (co-op): the host toggles it, everybody else sees its state. */
function AiLastToggle({ option, busy, onToggle }) {
  if (!option) return null;
  return html`<div class="ailast">
    <${Tooltip} text=${t('策略与机变轮选时，所有博士先于 AI 队友选择')}>
      <button type="button" role="switch" aria-checked=${option.on ? 'true' : 'false'}
          class=${`dpick__opt ailast__opt${option.on ? ' is-active' : ''}`} disabled=${!option.editable || !!busy}
          onClick=${() => option.editable && onToggle(!option.on)}>
        <${Icon} name="check" class=${option.on ? 'is-on' : ''} />${t('AI 队友最后选择')}
      </button>
    <//>
    ${option.editable ? null : html`<span class="t-dim">${t('由创建者设置')}</span>`}
  </div>`;
}

/** Room screen component. */
export function RoomScreen() {
  const [extensionsOpen,setExtensionsOpen] = useState(false);
  const room = useStore((s) => s.room);
  const me = useStore((s) => s.me, shallowEqual);
  const conn = useStore((s) => s.connection, shallowEqual);
  const [busy, setBusy] = useState(null);
  const [roleCooling,setRoleCooling]=useState(false);
  const roleCooldown=useRef(0);
  const roleTimer=useRef(null);
  useEffect(()=>()=>clearTimeout(roleTimer.current),[]);
  const alive = useRef(true);
  const footerRef = useRef(null);
  const seatsRef = useRef(null);
  const inFlight = useRef(false); // synchronous guard against double clicks (state updates are async)
  useEffect(() => () => { alive.current = false; }, []);

  useEffect(() => {
    const footer=footerRef.current;
    if(!footer)return;
    const root=document.documentElement;
    const measure=()=>{
      root.style.setProperty('--room-bar-height',`${footer.getBoundingClientRect().height}px`);
      const card=seatsRef.current?.querySelector('.seat');
      const screen=footer.closest('.room-screen');
      if(card&&screen){
        const bounds=card.getBoundingClientRect();
        const bottom=room.mode==='coop8'?Math.max(...Array.from(seatsRef.current.querySelectorAll('.seat'),el=>el.getBoundingClientRect().bottom)):bounds.bottom;
        screen.style.setProperty('--room-seat-top',`${bounds.top}px`);
        screen.style.setProperty('--room-seat-height',`${bottom-bounds.top}px`);
      }
    };
    measure();
    const observer=typeof ResizeObserver==='function'?new ResizeObserver(measure):null;
    observer?.observe(footer);
    if(seatsRef.current)observer?.observe(seatsRef.current);
    const card=seatsRef.current?.querySelector('.seat');if(card)observer?.observe(card);
    card?.addEventListener('animationend',measure);
    window.addEventListener('resize',measure);
    return()=>{observer?.disconnect();card?.removeEventListener('animationend',measure);window.removeEventListener('resize',measure);root.style.removeProperty('--room-bar-height');};
  },[room?.code,room?.mode]);

  if (!room) return null;
  const online = conn.status === 'online';
  const coop = room.mode !== 'solo';
  const facts = roomFacts(room, me.playerId);
  const myReady = !!facts.mine?.ready;
  const info = difficultyInfo(room.mode, room.difficulty);

  const run = async (kind, fn) => {
    if (inFlight.current) return;
    if (!online) { toast('连接中断，请稍候重试', 'warn'); return; }
    inFlight.current = true;
    setBusy(kind);
    try { await fn(); } catch (err) { toastError(err); } finally {
      inFlight.current = false;
      if (alive.current) setBusy(null);
    }
  };

  const toggleReady = () => run('ready', () => net.request('room.ready', { ready: !myReady }));
  const start = () => run('start', () => net.request('room.start', {}));
  const addBot = () => run('add', () => net.request('room.addBot', {}));
  const removeBot = (seat) => run(`rm${seat}`, () => net.request('room.removeBot', { seat }));
  // the host removes a human before the match (community report #17): asked first; the player may join again. The
  // confirmed player's id goes along: if they left and someone else took the seat meanwhile, the server refuses it.
  const kick = async (seat, name, playerId) => {
    if (inFlight.current) return;
    const ok = await confirmDialog({ title: '移出同盟', text: `确定将「${name || '博士'}」移出同盟吗？对方可以凭同盟密钥重新加入。`, okText: '移出', danger: true });
    if (ok) run(`kick${seat}`, () => net.request('room.kick', { seat, playerId }));
  };
  const setDifficulty = (difficulty) => run('diff', () => net.request('room.setDifficulty', { difficulty }));
  const setAiLast = (on) => run('ailast', () => net.request('room.setAiPicksLast', { on }));
  // spectator seats: the host frees one; a spectator takes a free player seat with room.join of this room
  const removeSpectator = (playerId) => run(`rs${playerId}`, () => net.request('room.removeSpectator', { playerId }));
  const switchRole=(kind,type)=>{
    if(Date.now()<roleCooldown.current || inFlight.current || !online)return;
    roleCooldown.current=Date.now()+2000;setRoleCooling(true);
    clearTimeout(roleTimer.current);roleTimer.current=setTimeout(()=>{if(alive.current)setRoleCooling(false)},2000);
    return run(kind,()=>net.request(type,{code:room.code}));
  };
  const spectate = () => switchRole('spectate','room.spectate');
  const sit = () => switchRole('sit','room.join');
  const leave = async () => {
    if (inFlight.current) return;
    const othersHere = facts.humans.some((s) => s.playerId !== me.playerId);
    if (facts.isHost && othersHere) {
      const ok = await confirmDialog({ title: '离开同盟', text: '你是同盟的创建者，离开后创建者身份将移交或同盟解散。确定离开吗？', okText: '离开', danger: true });
      if (!ok) return;
    }
    inFlight.current = true;
    setBusy('leave');
    try {
      await net.request('room.leave', {});
    } catch (err) {
      if (err?.code !== 'NOT_IN_ROOM') toastError(err);
    } finally {
      // Leaving locally is always safe: the server either confirmed or no longer has us in the room.
      store.set({ room: null, match: emptyMatch() });
      inFlight.current = false;
      if (alive.current) setBusy(null);
    }
  };

  const statusLine = !online
    ? html`<span class="t-orange"><${Icon} name="wifiOff" />连接中断，正在重连…</span>`
    : facts.spectating
      ? null
    : !coop
      ? html`<span class="t-mint">${t('*模拟协议已就绪，准许进入模拟')}</span>`
    : facts.modded && !facts.contentReady
      ? html`<span class="t-lo">${t('等待所有博士载入房间的插件内容')}</span>`
    : facts.isHost
      ? facts.canStart
        ? html`<span class="t-mint">*同盟人数达标，准许进入模拟</span>`
        : html`<span class="t-lo">等待所有博士准备就绪</span>`
      : myReady
        ? html`<span class="t-mint">已就绪 · 等待创建者开始模拟</span>`
        : html`<span class="t-lo">准备就绪后，创建者即可开始模拟</span>`;

  return html`<div class="screen room-screen">
    <header class="topbar app-topbar">
      <div class="topbar__left">
        <${Tooltip} text="离开同盟" placement="bottom">
          <${Button} variant="danger" size="lg" square=${true} icon="exit" loading=${busy === 'leave'} onClick=${leave} aria-label="离开同盟" />
        <//>
        <div class="room-ping">
          <${PingPill} ms=${conn.ping} online=${online} />
          <${MicroLabel}>当前延迟<//>
        </div>
        <${GuideButton} class="room-guide" variant="secondary" />
        <${Button} variant="secondary" size="sm" onClick=${openStats}>통계<//><${PatchNotesButton} /><${SettingsButton} />
      </div>
      <div class="topbar__center">
        <${MicroLabel} tone="mint">${coop ? 'ALLIANCE LOBBY' : 'SOLO SIMULATION'}<//>
        <h1 class="topbar__title">${coop ? t('同盟模拟') : t('独立模拟')}${room.test ? html` <${TestMark} />` : null}<span class="topbar__sep"></span><${DifficultyTag} difficulty=${room.difficulty} size="lg" />
          ${room.content?.modeId ? html`<span class="room-mode" data-testid="room-mode">${(room.content.modes || []).find((m) => m.id === room.content.modeId)?.name || room.content.modeId}</span>` : null}</h1>

      </div>
      <div class="topbar__right">
        ${coop?html`<${Tooltip} placement="bottom" text=${room.isPublic?'비공개로 전환':'공개 방 목록에 표시합니다.'}><button class="room-publish" disabled=${!facts.isHost||!!busy||!online} onClick=${()=>run('publish',async()=>{const isPublic=!room.isPublic;await net.request('room.publish',{isPublic});savePref('lobby.publicOn',isPublic);})}><${Icon} name="users" />${room.isPublic?'공개 방':'비공개 방'}</button><//>`:null}
        <div class="room-gameplay-modes" role="radiogroup" aria-label="게임 모드">${GAMEPLAY_MODES.map(mode=>html`<${Tooltip} placement="bottom" text=${({classic:"기본 규칙으로 진행합니다. 커스텀 설정과 증강은 적용하지 않습니다.",augment:html`<div class="gameplay-mode-tip"><p>증강으로 조합을 강화하고, 더 강한 적에 도전합니다.</p><ul><li>${AUGMENT_ROUNDS.join('·')}라운드에 아군 증강 → 적 증강 선택·투표 (보스전 이전까지)</li><li>일반 적: 기본 HP 100% × 등장 등급 배율 (실버 1.1 · 골드 1.15 · 프리즘 1.2) · 공격력/방어력 기본 100%, 증강 선택마다 +8% · 원래 마법 저항에 증강 선택마다 +4 합산</li><li>보스: 기본 HP 100% × 등장 등급 배율 (실버 1.3 · 골드 1.5 · 프리즘 1.7) · 공격력/방어력 120% · 마법 저항 150%</li><li>실버/골드/프리즘 가중치 2/5/3 · 커스텀 변경 불가</li></ul></div>`,custom:"저장한 커스텀 설정으로 진행합니다. 규칙을 자유롭게 변경할 수 있습니다."})[mode]}><button type="button" role="radio" data-gameplay-mode=${mode} aria-checked=${normalizeGameplayMode(room.gameplayMode)===mode} disabled=${!facts.isHost||!!busy||!online||!canSwitchPublicMode(room.gameplayMode,mode,room.isPublic)} onClick=${()=>run('gameplayMode',async()=>{await net.request('room.setGameplayMode',{gameplayMode:mode});setExtensionsOpen(false);})}>${GAMEPLAY_MODE_NAMES[mode]}</button><//>`)}</div>
        ${coop ? html`<${InviteBox} code=${room.code} name=${me.name} difficulty=${room.difficulty} />` : html`<div class="solo-note"><${MicroLabel}>SINGLE OPERATOR<//><span>仅限 1 名博士</span></div>`}
      </div>
    </header>

    ${coop?html`<${RoomTitleEditor} title=${room.title||''} disabled=${!facts.isHost||!!busy||!online} onSave=${title=>run('title',()=>net.request('room.setTitle',{title}))}/>`:null}
    <main ref=${seatsRef} class=${`seats${coop ? room.mode==='coop8'?' seats--eight':'' : ' seats--solo'}`}>
      ${facts.seats.map((s, i) => html`<${SeatCard} key=${s ? `p${s.playerId}` : `e${i}`} seat=${s} index=${i} room=${room} facts=${facts}
        myId=${me.playerId} busy=${busy} onAddBot=${addBot} onRemoveBot=${removeBot} onKick=${kick} />`)}
      ${coop ? null : html`<aside class="solo-brief brackets">
        <${MicroLabel} tone="mint">BRIEFING<//>
        <h2>${DIFFICULTY_NAMES[room.difficulty] || ''}<span class="num t-dim"> ${info.code}</span></h2>
        <p>${info.desc}</p>
        <ul>
          ${info.effects.map((e) => html`<li key=${e}>${e}</li>`)}
          <li>共 <b class="num">${info.rounds}</b> 回合${info.hidden ? '，满足条件时进入隐秘核心' : ''}</li>
          <li>独立模拟中休整期与机变阶段不限时</li>
        </ul>
      </aside>`}
    </main>
    <${SpectatorBar} facts=${facts} myId=${me.playerId} busy=${busy} onRemove=${removeSpectator} onSit=${sit} onSpectate=${spectate} roleCooling=${roleCooling} />

    <${CustomExtensionsDialog} open=${extensionsOpen} room=${room} isHost=${facts.isHost} disabled=${!!busy || !online || normalizeGameplayMode(room.gameplayMode)!=='custom'} onClose=${()=>setExtensionsOpen(false)}
      onSave=${selection=>run('extensions',async()=>{await net.request('room.setCustomExtensions',{selection});saveCustomExtensionPrefs(selection);setExtensionsOpen(false);})} />
    <footer class="room-bar" ref=${footerRef}>
      <div class="room-bar__left">
        <div class="room-bar__difficulty">
          <span class="room-bar__label">模拟难度<${MicroLabel}>DIFFICULTY<//></span>
          <${DifficultyPicker} room=${room} isHost=${facts.isHost} busy=${busy} onPick=${setDifficulty} />
        </div>
        <div class="room-bar__reroll">
          <span class="room-bar__label">리롤 횟수<${MicroLabel}>REROLL LIMIT<//></span>
          ${facts.isHost ? html`<div class="dpick rpick" role="radiogroup" aria-label="리롤 허용 횟수">
            ${[0, 1, 3, 5, -1].map(limit => html`<button key=${limit} type="button" role="radio"
              aria-checked=${(room.rerollLimit ?? 0) === limit ? 'true' : 'false'}
              class=${`dpick__opt rpick__opt${(room.rerollLimit ?? 0) === limit ? ' is-active' : ''}`}
              disabled=${!!busy || !online}
              onClick=${() => run('rerollLimit', () => net.request('room.setRerollLimit', { limit }))}>
              ${limit === -1 ? '무제한' : `${limit}회`}
            </button>`)}
          </div>` : html`<div class="dpick dpick--ro">
            <strong class="rpick__value">${room.rerollLimit === -1 ? '무제한' : `${room.rerollLimit ?? 0}회`}</strong>
            <span class="t-dim">由创建者选择</span>
          </div>`}
        </div>
      </div>
      <div class="room-bar__center">
        <div class="ready-count" hidden=${!coop}>
          <span class="t-lo">已就绪</span>
          <b class="num">${facts.readyHumans}</b><span class="num t-dim">/${facts.humans.length}</span>
          <span class="ready-count__icons" aria-hidden="true">
            ${facts.humans.map((s) => html`<${Icon} key=${s.playerId} name="user" class=${facts.isReady(s) ? 'is-on' : ''} />`)}
          </span>
        </div>
        <div class="room-bar__status">${statusLine}</div>
        <${AiLastToggle} option=${aiLastOption(room, me.playerId)} busy=${busy} onToggle=${setAiLast} />
      </div>
      <div class="room-bar__right">
        <div class="room-bar__settings">
          <${LoadoutButton} from="room" size="lg" class="room-loadout" />
          <${Button} variant="secondary" size="lg" icon="settings" class="room-custom-extensions" disabled=${!!busy || !online || normalizeGameplayMode(room.gameplayMode)!=='custom'} title=${normalizeGameplayMode(room.gameplayMode)!=='custom'?'커스텀 모드에서만 변경할 수 있습니다.':'커스텀 설정'} onClick=${()=>setExtensionsOpen(true)}>커스텀 설정 <span class="lo-entry__n num">${extensionSelectionCount(room.customExtensions || {bonds:room.customFactions?['ursus']:[]})}</span><//>
        </div>
        ${facts.isHost
          ? html`<${Tooltip} text=${facts.canStart ? null : !facts.contentReady ? t('仍有博士未载入房间的插件内容') : t('仍有博士未准备就绪')}>
              <${Button} variant="primary" size="xl" icon="play" loading=${busy === 'start'} disabled=${!facts.canStart || !online} onClick=${start}>${t('开始模拟')}<//>
            <//>`
          : facts.spectating
            ? html`<${Button} variant="secondary" size="xl" icon="eye" disabled=${true}>${t('观战中')}<//>`
          : html`<${Tooltip} text=${!myReady && facts.myContent !== 'ready' ? t('房间的插件内容载入并通过校验后才能准备') : null}>
              <${Button} variant=${myReady ? 'primary' : 'secondary'} size="xl" icon=${myReady ? 'check' : 'hourglass'} active=${myReady}
              loading=${busy === 'ready'} disabled=${!online || !facts.mine || (!myReady && facts.myContent !== 'ready')} onClick=${toggleReady}>${myReady ? t('已就绪') : t('准备就绪')}<//>
            <//>`}
      </div>
    </footer>
    ${coop ? html`<${ChatPanel} room=${true} />` : null}
  </div>`;
}

/** Persistent across room/game routes, including spectators who never consent. */
export function TrustedNotice() {
  const state = useStore(s => s);
  const room = state.room, cs = room?.content?.cs, trusted = room?.content?.trusted;
  const seat = room?.seats?.find(s => s && s.playerId === state.me?.playerId);
  const [dismissed,setDismissed] = useState(null);
  const [busy,setBusy] = useState(false);
  const [review,setReview] = useState(false);
  const choose = async accept => {
    setBusy(true);
    try {
      if (seat) await net.request('room.consent',{cs,accept});
      rememberScriptConsent(cs,accept);
      setDismissed(cs); setReview(false);
      if (accept && trusted.plugins.some(p => p.permissions.includes('trusted.page'))) {
        const url = new URL(location.href); url.searchParams.set('cs',cs); url.searchParams.set('room',room.code);
        location.assign(url.href); return;
      }
      store.set({room:{...store.get().room}}); // wake the content loader after local persistence
    } catch (e) { toastError(e); }
    finally { setBusy(false); }
  };
  useEffect(() => {
    if (trusted && seat && hasScriptConsent(cs) && !trusted.consent?.[seat.seat] && !room.inMatch) {
      net.request('room.consent',{cs,accept:true}).catch(toastError);
    }
  },[cs,seat?.seat,!!trusted?.consent?.[seat?.seat]]);
  if (!trusted) return null;
  return html`<aside class="trusted-banner" data-testid="trusted-banner">
    <strong>${t('受信任插件')}</strong>
    <button onClick=${() => setReview(true)}>${t('查看风险与同意状态')}</button>
    <${Modal} open=${review || (dismissed !== cs && !hasScriptConsent(cs))} title=${t('受信任插件')} tone="red" closeOnBackdrop=${false}
      onClose=${() => room.inMatch ? setReview(false) : choose(false)} actions=${html`<${Button} disabled=${busy} onClick=${() => choose(false)} data-testid="script-decline">${t('拒绝')}<//>
        <${Button} disabled=${busy} onClick=${() => choose(true)} data-testid="script-accept">${t('同意运行')}<//>`}>
      <p>${t('它可以完全控制你的游戏页面')}</p>
      <p>${t('仅在你信任所有作者及以下代码时同意。换了内容组合需要重新同意。')}</p>
      <ul>${trusted.plugins.map(p => html`<li key=${p.id}><strong>${p.id} ${p.version}</strong>
        <p>${t('作者：{authors}',{authors:(p.authors || []).join(', ') || '—'})}</p>
        <p class="trusted-hash">SHA-256: ${p.hash}</p><p>${t('权限：{permissions}',{permissions:p.permissions.join(', ')})}</p></li>`)}</ul>
    <//>
  </aside>`;
}

function RoomTitleEditor({title,disabled,onSave}){
 const [value,setValue]=useState(title),[editing,setEditing]=useState(false),previousTitle=useRef(title);useEffect(()=>{if(previousTitle.current!==title){previousTitle.current=title;setValue(title);setEditing(false);}},[title]);
 return html`<form class="room-title-editor" onSubmit=${async e=>{e.preventDefault();if(!disabled&&value.trim()!==title)await onSave(value);setEditing(false);}}>
 ${editing?html`<input aria-label="방 제목" maxlength="15" value=${value} autoFocus onInput=${e=>setValue(e.target.value)} onKeyDown=${e=>{if(e.key==='Escape'){setValue(title);setEditing(false);}}}/><${Button} type="submit" size="sm" variant="secondary" icon="check" aria-label="방 제목 저장" title="방 제목 저장"/>`:html`<strong data-room-title data-i18n-skip>${title}</strong><${Button} size="sm" variant="ghost" icon="edit" aria-label="방 제목 수정" title="방 제목 수정" disabled=${disabled} onClick=${e=>{e.preventDefault();setEditing(true);}}/>`}
 </form>`;
}
