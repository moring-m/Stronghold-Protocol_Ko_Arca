import {RichText} from '../ui/gameComponents.js';
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
<<<<<<< ours
// CONTENT_NOT_READY), and a plugin mode the host chose shows beside the difficulty.
=======
// CONTENT_NOT_READY), and a plugin mode the host chose shows beside the mode name in the top bar (the orange chip).
// 名片干员 (PR #643 split 6): a doctor's seat card shows an operator's portrait — the one the player picked (更换立绘 on
// one's own seat opens the picker: search, rarity, 默认; kept as a pref — ui/seatArt.js cardStore — and sent as
// room.card by ui/loadoutSync.js installCardSync, so the room sees it as seats[].card), else one of the 5★/6★ operators
// chosen by the player id (ui/seatArt.js), the same on every client. [ASSUMED] The pick made here and kept in this
// browser stands in for the event's account assistant (名片形象); [ASSUMED] the default by player id is a remake rule.
// Outfits (docs/SKINS.md; the maintainer's decision 4 of 2026-10-21): the portrait wears the player's outfit — one's own
// card this browser's choice at once, another doctor's the map that seat published (room.state seats[].skins) unless
// 「显示其他玩家的皮肤」 is off; an outfit this page's appearance plugins do not have draws the default art (ui/seatArt.js
// seatCardSkin). The picker is one's own picker, so its tiles wear one's own outfits too (like 干员调配's).
// Without the art pack the card keeps its avatar frame; a bot keeps its robot frame.
// Official versions (DESIGN §35.23, M1; versions.js): a room plays one version (room.state.version; absent = 第二期下半).
// Another version's name shows beside the mode in the top bar (ui/pluginTag.js VersionTag) and every page loads and checks
// its data like a gameplay plugin's content set (content.js) — the seat tags read 版本数据载入中 / 就绪 / 校验失败 and
// 准备就绪 / 开始模拟 wait for it (needsContent: gameplay plugins or another version; 非官方 stays the plugins' alone).
// The version pill beside the difficulty (and ⚙'s 版本 row in co-op) opens the version picker (ui/versionPicker.js): the
// host's pick proposes the switch (room.proposeVersion: a lone human's room switches at once; otherwise the seated humans
// vote — ui/versionVote.js, the strip between the 观战席 and the footer); everybody else reads it (由创建者发起). It is off
// during a vote and offline; gameplay plugins must support the target. A switch is told to everybody (a toast,
// never on entering a room), and a room whose version is not this browser's lobby choice says that leaving restores it.
>>>>>>> theirs
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
<<<<<<< ours
import { LoadoutButton } from '../ui/loadoutEntry.js';
import { CustomExtensionsDialog } from '../ui/customExtensions.js';
import { saveCustomExtensionPrefs } from '../ui/customExtensionPrefs.js';
import { isModdedRoom } from '../ui/pluginTag.js';
import { hasScriptConsent, rememberScriptConsent } from '../content.js';
import { net } from '../net.js';
import { store, useStore, shallowEqual, emptyMatch, isSpectating, savePref } from '../store.js';
import { difficultyInfo } from './lobby.js';
=======
import { LoadoutButton } from './loadout.js';
import { PluginTag, VersionTag, isModdedRoom } from '../ui/pluginTag.js';
import { VersionVote, versionVoteOf } from '../ui/versionVote.js';
import { VersionPicker } from '../ui/versionPicker.js';
import { DEFAULT_VERSION, ladderModes, lobbyVersion, needsContent, offeredDifficulties, roomVersion, seasonOf, serverDefaultVersion, soloTimedOf, soloTimeMsgid, versionLabel } from '../versions.js';
import { hasScriptConsent, rememberScriptConsent, pageVersion } from '../content.js';
import { net } from '../net.js';
import { store, useStore, shallowEqual, emptyMatch, isSpectating, savePref } from '../store.js';
import { data, useData, getConfig } from '../data.js';
import { chessAvatarUrl, chessPortraitUrl } from '../ui/assetUrls.js';
import { CARD_KEY, cardStore, setCard, cardOperators, cardContext, seatOperator, seatCardSkin, seatArtSrc } from '../ui/seatArt.js';
import { skinsStore, SKINS_KEY, ownerSkin } from '../ui/skins.js';
import { settingsStore } from '../ui/settingsStore.js';
import { difficultyInfo, modeInfo, ProtocolSelect } from './lobby.js';
import { useRise } from '../ui/transitions.js';
import { t, tc } from '../../../shared/i18n.js';
>>>>>>> theirs

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
 * Why 「转为观战」 is disabled, or '' when a seated player may switch.
 * The same predicates as server/lobby.js becomeSpectator: another seated human must be connected
 * (`s.connected`); a full spectator strip and a running match refuse on their own.
 * @param {any} room
 * @param {{ humans?: { playerId: any, connected?: boolean }[], spectators?: unknown[] }} facts
 * @param {any} myId
 * @returns {string}
 */
export function spectateSwitchReason(room, facts, myId) {
  if (room?.inMatch) return t('模拟已开始');
  if ((facts?.spectators?.length || 0) >= MAX_SPECTATORS) return t('观战席已满');
  if (!facts?.humans?.some((s) => s.playerId !== myId && s.connected)) return t('至少保留一名参赛博士');
  return '';
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

<<<<<<< ours
=======
/** Spectator handover in an original-content co-op room of any official version, with a host opt-in. */
export function aiTakeoverOption(room, myId) {
  if (!room || room.mode === 'solo' || room.content?.vanilla === false) return null;
  return { on: room.aiTakeoverEnabled === true, editable: room.hostId != null && room.hostId === myId && !room.inMatch };
}

/**
 * The solo room option 「不限时」 (DESIGN §35.23.10; room.setSoloUnlimited). null unless the room is solo AND `timed`
 * is exactly true (a version whose solo is timed, and whose data is on screen). Off when room.state omits the key.
 * The host switches it; everybody else sees it read-only.
 * @param {any} room room.state payload
 * @param {any} myId
 * @param {boolean | null} timed soloTimedOf(config, room version)
 * @returns {{ on: boolean, editable: boolean } | null}
 */
export function soloUnlimitedOption(room, myId, timed) {
  if (!room || room.mode !== 'solo' || timed !== true) return null;
  return { on: room.soloUnlimited === true, editable: room.hostId != null && room.hostId === myId };
}

/**
 * An AI teammate's name split into its 「AI·」 prefix and the rest, for the plate (room.css hides the prefix on a phone:
 * the avatar's badge and the card's AI 队友 tag say it, and at 特大 the prefix left one character of the name,
 * 「AI·华…」). Null for a human seat and for a name that is only a number after the prefix (`AI·2`).
 * @param {{ isBot?: boolean, name?: string } | null | undefined} seat
 * @returns {[string, string] | null}
 */
export function botNameParts(seat) {
  const m = seat?.isBot ? /^(AI\s*·\s*)(\D.*)$/su.exec(seat.name || '') : null;
  return m ? [m[1], m[2]] : null;
}

>>>>>>> theirs
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

<<<<<<< ours
function SeatCard({ seat, index, room, facts, myId, busy, onAddBot, onRemoveBot, onKick }) {
=======
/** A picker tile's avatar; the name's first character when the art pack has none or it fails to load. */
function CardThumb({ src, name }) {
  const [bad, setBad] = useState(false);
  return html`<span class="cardpick__img">${src && !bad
    ? html`<img src=${src} alt="" loading="lazy" draggable=${false} onError=${() => setBad(true)} />`
    : html`<span class="cardpick__glyph">${[...(name || '?')][0]}</span>`}</span>`;
}

/**
 * 名片干员 picker (更换立绘 on one's own seat card): the operators a seat card can show (ui/seatArt.js cardOperators —
 * search by name, rarity tabs) and 默认, no pick: the card shows the operator chosen by the player id. Picking closes it;
 * the current choice takes the focus (no on-screen keyboard on a phone). A local picker: each tile wears this browser's
 * outfit for that operator (`localSkins`, docs/SKINS.md), as the card will.
 */
/** A name with a Latin word of 12 or more characters (「Miss.Christine」, English 「Leizi the Thunderbringer」) is set smaller
 *  in the picker's tiles (room.css `.cardpick__name.is-long`): such a word is about as wide as the tile. */
const longWord = (name) => String(name || '').split(/\s+/).some((w) => w.length >= 12 && /^[\x21-\x7e]+$/.test(w));

function CardPicker({ current, list, m, localSkins = {}, onPick, onClose }) {
  const [q, setQ] = useState('');
  const [star, setStar] = useState(0);
  const stars = useMemo(() => [...new Set(list.map((c) => c.rarity).filter((r) => r > 0))].sort((a, b) => b - a), [list]);
  const known = !!current && list.some((c) => c.charId === current);
  const needle = q.trim().toLowerCase();
  const shown = list.filter((c) => (!star || c.rarity === star)
    && (!needle || [c.name, c.appellation].some((v) => String(v || '').toLowerCase().includes(needle))));
  return html`<${Modal} open=${true} class="cardpick" micro="SEAT CARD OPERATOR" title=${t('名片干员')} width="min(10.4rem, 96vw)"
      onClose=${onClose} actions=${html`<${Button} variant="ghost" onClick=${onClose}>${t('关闭')}<//>`}>
    <div class="cardpick__bar">
      <${TextField} class="cardpick__search" size="sm" icon="search" value=${q} onInput=${setQ} placeholder=${t('搜索干员')} />
      <div class="cardpick__stars" role="radiogroup" aria-label=${t('稀有度')}>
        ${[0, ...stars].map((v) => html`<button key=${v} type="button" role="radio" aria-checked=${star === v ? 'true' : 'false'}
          class=${star === v ? 'is-on' : ''} onClick=${() => setStar(v)}>${v ? html`<span class="num">${v}★</span>` : t('全部')}</button>`)}
      </div>
    </div>
    <div class="cardpick__grid" data-testid="card-picker">
      <button type="button" class=${`cardpick__op cardpick__op--auto${known ? '' : ' is-on'}`} aria-pressed=${known ? 'false' : 'true'}
          data-char="" data-autofocus=${known ? undefined : ''} title=${t('按博士编号自动分配')} onClick=${() => onPick('')}>
        <span class="cardpick__img"><${Icon} name="refresh" /></span><span class="cardpick__name">${t('默认')}</span>
      </button>
      ${shown.map((c) => {
        const src = chessAvatarUrl(m, c, { skin: ownerSkin(c.charId, { localSkins }) });
        const on = known && c.charId === current;
        return html`<button key=${c.charId} type="button" class=${`cardpick__op r${c.rarity}${on ? ' is-on' : ''}`} aria-pressed=${on ? 'true' : 'false'}
            data-char=${c.charId} data-autofocus=${on ? '' : undefined} title=${c.name} onClick=${() => onPick(c.charId)}>
          <${CardThumb} src=${src} name=${c.name} />
          <span class=${`cardpick__name${longWord(c.name) ? ' is-long' : ''}`}>${c.name}</span>${c.rarity ? html`<span class="cardpick__star num">${c.rarity}★</span>` : null}
        </button>`;
      })}
    </div>
    ${shown.length ? null : html`<p class="cardpick__empty">${t('没有符合条件的干员')}</p>`}
    <p class="cardpick__note"><${Icon} name="info" />${t('选择后，同盟里的博士都会看到这张立绘')}</p>
  <//>`;
}

/**
 * One seat: a tall card — the top strip (P#), the 名片干员 portrait (or the avatar frame: a bot, no art pack), 创建者, the
 * state at the bottom (准备中 / 待命中 / 已就绪 with its box) — and the name plate under it. The art's text sits in two
 * groups in flow, `.rseat__top` (the badge, 更换立绘, the tags) and `.rseat__low` (the operator's name, the state), so a
 * larger 文字大小 wraps and pushes them apart rather than drawing one over another (§35.18 review). One's own card offers 更换立绘
 * (`onPickCard`); the host gets 移出 / 移除 AI 队友 at the top right. One's own card in a co-op room carries 转为观战 at
 * that corner too (`onSpectate`), shown only on a short screen, where the 观战席 bar gives its line up (room.css). An
 * empty seat: 邀请 (copies the key) and, for the host of a co-op room, 添加 AI 队友. `portrait` is the outfit's picture,
 * `portraitDefault` the operator's default one (given when an outfit is worn): a picture that fails to load gives way to
 * the next, the last to the avatar frame.
 */
function SeatCard({ seat, index, room, facts, myId, busy, onAddBot, onRemoveBot, onKick, onInvite, portrait = null, portraitDefault = null, operator = null, onPickCard = null, onSpectate = null, fresh = false }) {
  const [badArt, setBadArt] = useState([]);
>>>>>>> theirs
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
<<<<<<< ours
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
=======
  const state = offline ? 'offline' : isHostSeat ? 'host' : seat.ready || seat.isBot ? 'ready' : 'waiting';
  const lit = state === 'ready' || state === 'host';
  const art = seat.isBot ? null : seatArtSrc([portrait, portraitDefault], badArt);
  const canPick = isMe && !seat.isBot && !!onPickCard;
  // an AI teammate's name without its 「AI·」 prefix on a phone (room.css; botNameParts)
  const botPrefix = botNameParts(seat);
  return html`<article class=${`seat rseat${isMe ? ' is-me' : ''}${isHostSeat ? ' is-host' : ''}${seat.isBot ? ' is-bot' : ''}${art ? ' has-art' : ''}${lit ? ' is-lit' : ''}${flash ? ' is-flash' : ''} is-${state}`}
      style=${`--i:${index}`}>
    <span class="rseat__clip" aria-hidden="true"></span>
    <header class="rseat__strip"><i></i><span class="num">P${index + 1}</span></header>
    <div class="seat__art rseat__art">
      ${art
        ? html`<img key=${art} class="seat__portrait" src=${art} alt="" draggable=${false} onError=${() => setBadArt((b) => (b.includes(art) ? b : [...b, art]))} />`
        : html`<${AvatarFrame} size="xl" name=${seat.name} seat=${index} bot=${seat.isBot} self=${isMe} ready=${state === 'ready'} offline=${offline} />`}
      <div class="rseat__top">
        ${isHostSeat ? html`<span class="rseat__host"><${Icon} name="crown" />${t('创建者')}</span>` : null}
        ${seat.isBot ? html`<span class="rseat__bot"><${Icon} name="robot" />${t('AI 队友')}</span>` : null}
        ${canPick ? html`<button type="button" class="rseat__pick" data-testid="seat-card-pick" onClick=${onPickCard}
          title=${t('更换名片干员')} aria-label=${t('更换名片干员')}><${Icon} name="edit" /><span>${t('更换立绘')}</span></button>` : null}
        ${consent ? html`<span class="rseat__tag" data-testid="script-consented">${t('已同意')}</span>` : null}
        ${facts.needsContent && !seat.isBot ? html`<span class=${`rseat__tag seat__content is-${seat.content || 'loading'}`} data-testid="seat-content">
          ${facts.versionRoom
            ? seat.content === 'ready' ? t('版本数据就绪') : seat.content === 'failed' ? t('版本数据校验失败') : t('版本数据载入中')
            : seat.content === 'ready' ? t('插件内容就绪') : seat.content === 'failed' ? t('插件内容校验失败') : t('插件内容载入中')}
        </span>` : null}
      </div>
      ${offline ? html`<span class="rseat__lost"><${Icon} name="wifiOff" />${t('连接中断')}</span>` : null}
      <div class="rseat__low">
        ${art ? html`<span class="seat__op">${operator?.name || ''}</span>` : null}
        <span class=${`rseat__state seat__state--${state}`}>
          <span class="rseat__box">${lit ? html`<${Icon} name="check" />` : null}</span>
          <span class="rseat__said">${state === 'ready' ? t('已就绪') : state === 'host' ? t('待命中') : state === 'offline' ? t('连接中断') : t('准备中')}</span>
        </span>
      </div>
    </div>
    ${seat.isBot && facts.isHost ? html`<button type="button" class="rseat__kick" disabled=${busy === `rm${index}`} onClick=${() => onRemoveBot(index)}
      title=${t('移除该 AI 队友')} aria-label=${t('移除 AI 队友')}><${Icon} name="robot" /><${Icon} name="close" /></button>` : null}
    ${!seat.isBot && !isMe && facts.isHost ? html`<button type="button" class="rseat__kick" disabled=${busy === `kick${index}`}
      onClick=${() => onKick(index, seat.name, seat.playerId)} title=${t('将该博士移出同盟')} aria-label=${t('移出该博士')}><${Icon} name="user" /><${Icon} name="close" /></button>` : null}
    ${isMe && coop && onSpectate ? (() => {
      const why = spectateSwitchReason(room, facts, myId);
      return html`<button type="button" class="rseat__spectate" data-testid="seat-spectate" disabled=${!!why || !!busy}
        onClick=${onSpectate} title=${why || t('转为观战')} aria-label=${t('转为观战')}><${Icon} name="eye" /></button>`;
    })() : null}
    <div class="rseat__plate">
      ${isMe ? html`<span class="rseat__me" role="img" aria-label=${t('你')} title=${t('你')}><${Icon} name="info" /></span>` : null}
      <${AvatarFrame} size="sm" name=${seat.name} seat=${index} bot=${seat.isBot} self=${isMe} />
      <span class="rseat__who"><b class="seat__name">${botPrefix ? html`<span class="seat__name-pre">${botPrefix[0]}</span>${botPrefix[1]}` : seat.name || t('博士')}</b>${isMe ? html`<span class="seat__you" aria-hidden="true">${t('你')}</span>` : null}</span>
      <small class="rseat__doc">${seat.isBot ? 'AUTONOMOUS UNIT' : `DOCTOR #${doctorNo(seat.playerId)}`}</small>
>>>>>>> theirs
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

<<<<<<< ours
/** 观战席: the room's spectators (host: ✕ frees a seat), and 入座 for a spectator while a player seat is free.
 *  The host's own cap (`facts.spectatorCap`, room.create {spectators}) labels the counter; a cap of 0 hides the strip. */
function SpectatorBar({ facts, myId, busy, onRemove, onSit, onSpectate, roleCooling }) {
  if (!facts.spectators.length && facts.spectatorCap <= 0) return null;
  return html`<section class="specbar" aria-label="观战席">
    <span class="specbar__label"><${Icon} name="eye" />观战席<b class="num">${facts.spectators.length}</b><span class="num t-dim">/${facts.spectatorCap}</span></span>
    ${facts.spectatorCap <= 0 ? html`<span class="specbar__off t-dim">本局不接受观战</span>` : null}
=======
/** 观战席: the room's spectators (host: ✕ frees a seat), and 入座 for a spectator while a player seat is free. */
function SpectatorBar({ room, facts, myId, busy, onRemove, onSit, onSpectate }) {
  if (room.mode === 'solo') return null;
  const reason = spectateSwitchReason(room, facts, myId);
  // an empty bar (no spectator yet: only the count and 转为观战) gives its line up on a short screen (room.css)
  return html`<section class=${`specbar${facts.spectators.length ? '' : ' specbar--empty'}`} aria-label=${t('观战席')}>
    <span class="specbar__label"><${Icon} name="eye" />${t('观战席')}<b class="num">${facts.spectators.length}</b><span class="num t-dim">/${MAX_SPECTATORS}</span></span>
>>>>>>> theirs
    ${facts.spectators.map((s) => html`<span key=${s.playerId} class=${`specbar__who${s.playerId === myId ? ' is-me' : ''}${s.connected === false ? ' is-offline' : ''}`}>
      ${s.connected === false ? html`<${Icon} name="wifiOff" />` : null}${s.name || '博士'}${s.playerId === myId ? html`<span class="seat__you">你</span>` : null}
      ${facts.isHost ? html`<${Button} variant="ghost" size="sm" square=${true} icon="close" loading=${busy === `rs${s.playerId}`}
        onClick=${() => onRemove(s.playerId)} aria-label=${`移出观战者 ${s.name || ''}`} title="移出该观战者" />` : null}
    </span>`)}
<<<<<<< ours
    ${!facts.spectating && facts.spectators.length < facts.spectatorCap ? html`<${Button} size="sm" icon="eye" loading=${busy === 'spectate'} disabled=${roleCooling || !!busy} onClick=${onSpectate}>관전으로 전환<//>` : null}
    ${facts.spectating && facts.emptySeats > 0 ? html`<${Button} size="sm" icon="user" loading=${busy === 'sit'} disabled=${roleCooling || !!busy} onClick=${onSit}>入座<//>` : null}
=======
    ${facts.spectating && facts.emptySeats > 0 ? html`<${Button} size="sm" icon="user" loading=${busy === 'sit'} onClick=${onSit}>${t('入座')}<//>` : null}
    ${facts.mine ? html`<${Button} variant="secondary" size="sm" icon="eye" disabled=${!!reason || !!busy} loading=${busy === 'spectate'}
      title=${reason || t('转为观战')} data-testid="room-spectate" onClick=${onSpectate}>${t('转为观战')}<//>` : null}
>>>>>>> theirs
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
  const [syncInfoOpen,setSyncInfoOpen] = useState(false); // 동기화 시뮬레이션: the mode's rules
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
<<<<<<< ours

=======
  // 名片干员: the operators a seat card can show and the default pool (ui/seatArt.js), one's own pick (a pref the sync
  // engine sends: ui/loadoutSync.js installCardSync), and the outfits the cards wear — this browser's choices and the
  // 「显示其他玩家的皮肤」 switch (docs/SKINS.md)
  useData('chess', 'assets', 'config', 'backups');
  const chess = data.get('chess');
  const backups = data.get('backups');
  // the room version's chess records and 自选编队 pool (ui/seatArt.js cardOperators — the server's cardCharIds)
  const cardList = useMemo(() => cardOperators(data.list('chess'), backups), [chess, backups]);
  const cards = useMemo(() => cardContext(cardList, { pending: !backups }), [cardList, backups]);
  const myCard = useStore((s) => s[CARD_KEY], Object.is, cardStore);
  const localSkins = useStore((s) => s[SKINS_KEY], Object.is, skinsStore);
  const otherSkins = useStore((s) => s.otherSkins !== false, Object.is, settingsStore);
  const [picking, setPicking] = useState(false);
  // the room whose seats are on screen: a seat card that mounts after its first render is new (an AI teammate added)
  const shownRoom = useRef('');
  useEffect(() => { shownRoom.current = room?.code || ''; });
  // 选择模拟协议 over the room — open, and the host's pick before 确认 (the others read it: the room's difficulty) — and
  // the ⚙ menu
  const [protoOpen, setProtoOpen] = useState(false);
  const [protoPick, setProtoPick] = useState(null);
  const [opts, setOpts] = useState(false);
  // the host's change of difficulty, told to the others (see the header); never on entering a room or switching rooms
  const seenDiff = useRef(room ? `${room.code}|${room.difficulty}` : '');
  useEffect(() => {
    if (!room) return;
    const key = `${room.code}|${room.difficulty}`;
    const before = seenDiff.current;
    seenDiff.current = key;
    if (!before || before === key || !before.startsWith(`${room.code}|`) || room.hostId === me.playerId) return;
    const name = DIFFICULTY_NAMES[room.difficulty] ? t(DIFFICULTY_NAMES[room.difficulty]) : room.difficulty;
    toast(t('创建者已将模拟难度改为「{name}」', { name }), 'info');
  }, [room?.code, room?.difficulty]);
  // official versions (DESIGN §35.23): the room's switch is told to everybody (the host's own page included — a vote's
  // result arrives later than the pick); never on entering a room or switching rooms
  const versions = useStore((s) => s.versions);
  const myLobby = useStore(lobbyVersion);
  const serverDefault = useStore(serverDefaultVersion);
  const [versionOpen, setVersionOpen] = useState(false);
  const seenVersion = useRef(room ? `${room.code}|${roomVersion(room)}` : '');
>>>>>>> theirs
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
  // a laddered room (规程's solo) shows its official mode (规程等级 n · AC-SP-n) instead of the difficulty
  const info = room.modeId ? modeInfo(room.modeId) : difficultyInfo(room.mode, room.difficulty);

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
<<<<<<< ours
  const switchRole=(kind,type)=>{
    if(Date.now()<roleCooldown.current || inFlight.current || !online)return;
    roleCooldown.current=Date.now()+2000;setRoleCooling(true);
    clearTimeout(roleTimer.current);roleTimer.current=setTimeout(()=>{if(alive.current)setRoleCooling(false)},2000);
    return run(kind,()=>net.request(type,{code:room.code}));
  };
  const spectate = () => switchRole('spectate','room.spectate');
  const sit = () => switchRole('sit','room.join');
=======
  const sit = () => run('sit', () => net.request('room.join', { code: room.code, ...(room.test ? { testAck: true } : {}) }));
  const spectate = async () => {
    if (inFlight.current) return;
    const ok = await confirmDialog({ title: t('转为观战'),
      text: facts.isHost ? t('转入观战席后，创建者身份将移交给其他博士。有空位时可以重新入座。')
        : t('转入观战席后仅观看模拟，有空位时可以重新入座。'), okText: t('转为观战') });
    if (ok) run('spectate', () => net.request('room.spectate', { code: room.code, ...(room.test ? { testAck: true } : {}) }));
  };
>>>>>>> theirs
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
<<<<<<< ours
        ? html`<span class="t-mint">已就绪 · 等待创建者开始模拟</span>`
        : html`<span class="t-lo">准备就绪后，创建者即可开始模拟</span>`;

  return html`<div class="screen room-screen">
    <header class="topbar app-topbar">
      <div class="topbar__left">
        <${Tooltip} text="离开同盟" placement="bottom">
          <${Button} variant="danger" size="lg" square=${true} icon="exit" loading=${busy === 'leave'} onClick=${leave} aria-label="离开同盟" />
=======
        ? html`<span class="t-mint">${t('已就绪 · 等待创建者开始模拟')}</span>`
        : html`<span class="t-lo">${t('准备就绪后，创建者即可开始模拟')}</span>`;

  const copy = async (what) => {
    // the copied link carries an invitation line (#103): 「{name}邀请你加入卫戍协议：盟约【{difficulty}】」 — with the
    // version's name for another official version (DESIGN §35.23)
    const params = { name: me.name ?? '', difficulty: DIFFICULTY_NAMES[room.difficulty] ? t(DIFFICULTY_NAMES[room.difficulty]) : '' };
    const invite = roomVersion(room) !== DEFAULT_VERSION
      ? t('{name}邀请你加入卫戍协议：盟约·{version}【{difficulty}】', { ...params, version: versionLabel(roomVersion(room)) })
      : t('{name}邀请你加入卫戍协议：盟约【{difficulty}】', params);
    const ok = await copyText(what === 'code' ? room.code : `${inviteLink(room.code)} ${invite}`);
    if (ok) toast(what === 'code' ? t('已复制同盟密钥 {code}', { code: room.code }) : t('已复制邀请链接'), 'success');
    else toast(t('复制失败，请手动复制'), 'warn');
  };
  // 选择模拟协议 over the room: the host picks and sends the difficulty on 确认 (nothing to send when it did not change —
  // unless a plugin mode is on, which picking a difficulty leaves: server/lobby.js setDifficulty); it closes only once the
  // server took it, and the accepted pick becomes the remembered difficulty (`lobby.difficulty`, the one 创建同盟 and
  // 独立模拟's 选择模拟协议 start from — README / PLAYING 难度沿用上次选的). Everybody else opens it read-only.
  // a laddered room (规程's solo) picks its official mode (room.modeId) instead of a difficulty
  const ladder = room.modeId ? ladderModes(pageVersion() === roomVersion(room) ? getConfig() : null, room.mode) : null;
  const openProto = () => { setOpts(false); setProtoPick(ladder ? room.modeId : room.difficulty); setProtoOpen(true); };
  const closeProto = () => { setProtoOpen(false); setProtoPick(null); };
  const pluginMode = room.content?.modeId ? (room.content.modes || []).find((m) => m.id === room.content.modeId)?.name || room.content.modeId : null;
  const confirmDifficulty = async () => {
    if (ladder) {
      const id = protoPick || room.modeId;
      if (id === room.modeId) { closeProto(); return; }
      if (!(await run('diff', () => net.request('room.setMode', { modeId: id })))) return;
      savePref('lobby.ladderMode', id);
      if (alive.current) closeProto();
      return;
    }
    const d = protoPick || room.difficulty;
    if (d === room.difficulty && !pluginMode) { closeProto(); return; }
    if (!(await setDifficulty(d))) return;
    savePref('lobby.difficulty', d);
    // the plugin mode is gone: said, as a same-difficulty 确认 changes nothing else the host sees (§35.51; §35.18's nit)
    if (pluginMode) toast(t('已退出插件模式「{name}」', { name: pluginMode }), 'info');
    if (alive.current) closeProto();
  };
  // the difficulties the room's version offers (its config's modes, versions.js) — the page shows that version's data
  // once it is loaded; until then (or for a gameplay plugin room's own modes) all four
  const protoDifficulties = offeredDifficulties(pageVersion() === roomVersion(room) ? getConfig() : null, room.mode);
  const protoHint = pluginMode
    ? t('确认后将退出插件模式「{name}」', { name: pluginMode })
    : facts.humans.length > 1 ? t('更改难度后，其他博士需要重新准备就绪') : '';
  const aiLast = aiLastOption(room, me.playerId);
  const soloTimed = soloTimedOf(pageVersion() === roomVersion(room) ? getConfig() : null, roomVersion(room));
  const soloOpt = soloUnlimitedOption(room, me.playerId, soloTimed);
  const soloBrief = soloTimeMsgid('brief', { timed: soloTimed, unlimited: room.soloUnlimited === true });
  const modeName = coop ? t('同盟模拟') : t('独立模拟');
  // the room's version (DESIGN §35.23): the pill and ⚙'s row on a server that enables versions (or in a version room)
  const vote = versionVoteOf(room);
  const curVersion = roomVersion(room);
  const showVersion = Array.isArray(versions) || curVersion !== DEFAULT_VERSION;
  const versionWhy = !online ? t('连接中断，请稍候重试')
    : vote ? t('切换版本投票进行中，请等投票结束')
    : !Array.isArray(versions) || versions.length < 2 ? t('本服务器只启用了这一个版本') : null;
  const versionEditable = facts.isHost && !facts.spectating && !room.inMatch;
  // the room's version is not this browser's lobby choice: the banner says leaving restores it (on a short screen, where
  // the banner gives its room to the seats, the pill's tooltip says it)
  const bannerText = curVersion !== myLobby && Array.isArray(versions) ? t('本房间为「{room}」，离开后恢复你的大厅版本「{mine}」', { room: versionLabel(curVersion), mine: versionLabel(myLobby) }) : null;
  const versionCtl = showVersion ? {
    id: curVersion, editable: versionEditable, why: [versionEditable ? versionWhy : t('由创建者发起'), bannerText].filter(Boolean).join(' · ') || null,
    disabled: versionEditable ? !!versionWhy || !!busy : !Array.isArray(versions),
    onOpen: () => { setOpts(false); setVersionOpen(true); },
  } : null;
  // (a switch makes every page send its settings again, which share the server's budget of heavy messages with
  // room.proposeVersion: a RATE right after one is tried once more a moment later; the server's own 5 s pause after a
  // declined or expired vote answers RATE again and is told)
  const proposeVersion = async (version) => {
    const send = () => net.request('room.proposeVersion', { version });
    const sent = await run('version', async () => {
      try { await send(); } catch (err) {
        if (err?.code !== 'RATE') throw err;
        await new Promise((r) => setTimeout(r, PROPOSE_RETRY_MS));
        await send();
      }
    });
    if (sent && alive.current) setVersionOpen(false);
  };

  // the room wears its version's season look like the lobby (规程: data-season="act3autochess", room.css)
  return html`<div class=${`screen room-screen rs${coop ? '' : ' rs--solo'}`} data-season=${seasonOf(roomVersion(room))} style=${`--d-color:${room.modeId ? info.color : DIFFICULTY_COLORS[room.difficulty] || 'var(--amber)'}; --n:${facts.seats.length}`}>
    <div class="rs__bg" aria-hidden="true"></div>
    <header class="topbar rs-top">
      <div class="topbar__left rs-top__left">
        <${Tooltip} text=${t('离开同盟')} placement="bottom">
          <button type="button" class="rs-exit" disabled=${busy === 'leave'} onClick=${leave} aria-label=${t('离开同盟')}><${Icon} name="exit" /></button>
>>>>>>> theirs
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
        <h1 class="topbar__title">${room.sync ? html`<${Tooltip} placement="bottom" text=${t('동기화 시뮬레이션 소개')}><${Button} variant="secondary" size="sm" square=${true} icon="info" class="sync-info-btn" aria-label=${t('동기화 시뮬레이션 소개')} onClick=${()=>setSyncInfoOpen(true)} /><//>` : null}${room.sync ? t('동기화 시뮬레이션') : coop ? t('同盟模拟') : t('独立模拟')}${room.test ? html` <${TestMark} />` : null}<span class="topbar__sep"></span><${DifficultyTag} difficulty=${room.difficulty} size="lg" />
          ${room.content?.modeId ? html`<span class="room-mode" data-testid="room-mode">${(room.content.modes || []).find((m) => m.id === room.content.modeId)?.name || room.content.modeId}</span>` : null}</h1>

      </div>
      <div class="topbar__right">
        ${coop?html`<${Tooltip} placement="bottom" text=${room.isPublic?'비공개로 전환':'공개 방 목록에 표시합니다.'}><button class="room-publish" disabled=${!facts.isHost||!!busy||!online} onClick=${()=>run('publish',async()=>{const isPublic=!room.isPublic;await net.request('room.publish',{isPublic});savePref('lobby.publicOn',isPublic);})}><${Icon} name="users" />${room.isPublic?'공개 방':'비공개 방'}</button><//>`:null}
        <div class="room-gameplay-modes" role="radiogroup" aria-label="게임 모드">${GAMEPLAY_MODES.map(mode=>html`<${Tooltip} placement="bottom" text=${({classic:"기본 규칙으로 진행합니다. 커스텀 설정과 증강은 적용하지 않습니다.",augment:html`<div class="gameplay-mode-tip"><p>증강으로 조합을 강화하고, 더 강한 적에 도전합니다.</p><ul><li>${AUGMENT_ROUNDS.join('·')}라운드에 아군 증강 → 적 증강 선택·투표 (보스전 이전까지)</li><li>일반 적: 기본 HP 100% × 등장 등급 배율 (실버 1.1 · 골드 1.15 · 프리즘 1.2) · 공격력/방어력 기본 100%, 증강 선택마다 공격력·방어력 각각 +5% · 원래 마법 저항에 증강 선택마다 +3 합산</li><li>보스: 기본 HP 100% × 등장 등급 배율 (실버 1.3 · 골드 1.5 · 프리즘 1.7) · 공격력/방어력 120% · 마법 저항 120%</li><li>실버/골드/프리즘 가중치 2/5/3 · 커스텀 변경 불가</li></ul></div>`,custom:"저장한 커스텀 설정으로 진행합니다. 규칙을 자유롭게 변경할 수 있습니다."})[mode]}><button type="button" role="radio" data-gameplay-mode=${mode} aria-checked=${normalizeGameplayMode(room.gameplayMode)===mode} disabled=${!facts.isHost||!!busy||!online||!canSwitchPublicMode(room.gameplayMode,mode,room.isPublic)} onClick=${()=>run('gameplayMode',async()=>{await net.request('room.setGameplayMode',{gameplayMode:mode});setExtensionsOpen(false);})}>${GAMEPLAY_MODE_NAMES[mode]}</button><//>`)}</div>
        ${coop ? html`<${InviteBox} code=${room.code} name=${me.name} difficulty=${room.difficulty} />` : html`<div class="solo-note"><${MicroLabel}>SINGLE OPERATOR<//><span>仅限 1 名博士</span></div>`}
      </div>
    </header>

<<<<<<< ours
    ${coop?html`<${RoomTitleEditor} title=${room.title||''} disabled=${!facts.isHost||!!busy||!online} onSave=${title=>run('title',()=>net.request('room.setTitle',{title}))}/>`:null}
    <main ref=${seatsRef} class=${`seats${coop ? room.mode==='coop8'?' seats--eight':'' : ' seats--solo'}`}>
      ${facts.seats.map((s, i) => html`<${SeatCard} key=${s ? `p${s.playerId}` : `e${i}`} seat=${s} index=${i} room=${room} facts=${facts}
        myId=${me.playerId} busy=${busy} onAddBot=${addBot} onRemoveBot=${removeBot} onKick=${kick} />`)}
      ${coop ? null : html`<aside class="solo-brief brackets">
        <${MicroLabel} tone="mint">BRIEFING<//>
        <h2>${DIFFICULTY_NAMES[room.difficulty] || ''}<span class="num t-dim"> ${info.code}</span></h2>
        <${RichText} as="p" text=${info.desc} />
=======
    <main class=${`seats rs-seats${coop ? '' : ' seats--solo'}`}>
      ${facts.seats.map((s, i) => {
        const op = seatOperator(s, cards, { myId: me.playerId, myCard });
        // the player's outfit for that operator (header "Outfits"); null = the default art
        const skin = op ? seatCardSkin(s, op.chess.charId, { myId: me.playerId, localSkins, players: facts.occupied, otherSkins }) : null;
        return html`<${SeatCard} key=${s ? `p${s.playerId}` : `e${i}`} seat=${s} index=${i} room=${room} facts=${facts}
          myId=${me.playerId} busy=${busy} onAddBot=${addBot} onRemoveBot=${removeBot} onKick=${kick} onInvite=${() => copy('code')} onSpectate=${spectate}
          portrait=${op ? chessPortraitUrl(data.get('assets'), op.chess, { skin }) : null}
          portraitDefault=${op && skin ? chessPortraitUrl(data.get('assets'), op.chess) : null} operator=${op?.chess} onPickCard=${() => setPicking(true)}
          fresh=${shownRoom.current === room.code} />`;
      })}
      ${coop ? null : html`<aside class="solo-brief rs-brief brackets">
        <${MicroLabel} tone="mint">BRIEFING<//>
        <h2>${room.modeId ? info.name : DIFFICULTY_NAMES[room.difficulty] ? t(DIFFICULTY_NAMES[room.difficulty]) : ''} <span class="num t-dim">${info.code}</span></h2>
        <p>${info.desc}</p>
>>>>>>> theirs
        <ul>
          ${info.effects.map((e) => html`<li key=${e}>${e}</li>`)}
          <li>共 <b class="num">${info.rounds}</b> 回合${info.hidden ? '，满足条件时进入隐秘核心' : ''}</li>
          <li>独立模拟中休整期与机变阶段不限时</li>
        </ul>
      </aside>`}
    </main>
<<<<<<< ours
    <${SpectatorBar} facts=${facts} myId=${me.playerId} busy=${busy} onRemove=${removeSpectator} onSit=${sit} onSpectate=${spectate} roleCooling=${roleCooling} />

    <${CustomExtensionsDialog} open=${extensionsOpen} room=${room} isHost=${facts.isHost} disabled=${!!busy || !online || normalizeGameplayMode(room.gameplayMode)!=='custom'} onClose=${()=>setExtensionsOpen(false)}
      onSave=${selection=>run('extensions',async()=>{await net.request('room.setCustomExtensions',{selection});saveCustomExtensionPrefs(selection);setExtensionsOpen(false);})} />
      <${SyncInfoDialog} open=${syncInfoOpen} onClose=${()=>setSyncInfoOpen(false)} />
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
=======
    <${SpectatorBar} room=${room} facts=${facts} myId=${me.playerId} busy=${busy} onRemove=${removeSpectator} onSit=${sit} onSpectate=${spectate} />
    <${VersionVote} room=${room} />
    ${bannerText ? html`<p class="rs-verbanner" data-testid="version-banner"><${Icon} name="info" />${bannerText}</p>` : null}

    <footer class="room-bar rs-foot">
      <div class="rs-foot__left" aria-hidden="true"></div>
      <div class="rs-foot__center">
        <p class="rs-hint">${coop ? html`<span class="rs-ready num" title=${t('已就绪')}>${facts.humans.map((s) => html`<${Icon} key=${s.playerId} name="user" class=${facts.isReady(s) ? 'is-on' : ''} />`)}<b>${facts.readyHumans}</b>/${facts.humans.length}</span>` : null}<span class="room-bar__status">${statusLine}</span></p>
        <div class="rs-pill">
          <button type="button" class=${`rs-pill__diff${facts.isHost ? '' : ' is-ro'}`} disabled=${facts.isHost && !!busy} onClick=${openProto}
            title=${facts.isHost ? t('更改模拟难度') : t('由创建者选择')}><${DifficultyIcon} difficulty=${room.difficulty} />${room.modeId ? info.name : DIFFICULTY_NAMES[room.difficulty] ? t(DIFFICULTY_NAMES[room.difficulty]) : ''}<span class="num rs-pill__code">${info.code}</span></button>
          ${versionCtl ? html`<${Tooltip} text=${versionCtl.why} class="rs-pill__version"><button type="button" class=${`rs-pill__ver${versionCtl.editable ? '' : ' is-ro'}`} data-testid="room-version"
            disabled=${versionCtl.disabled} onClick=${versionCtl.onOpen} aria-label=${t('游戏版本：{name}', { name: versionLabel(curVersion) })}><${Icon} name="book" /><span class="rs-pill__vername">${versionLabel(curVersion)}</span></button><//>` : null}
          ${aiLast || soloOpt ? html`<button type="button" class=${`rs-pill__gear${opts ? ' is-on' : ''}`} onClick=${() => setOpts((v) => !v)} title=${aiLast ? t('同盟设置') : t('模拟设置')} aria-label=${aiLast ? t('同盟设置') : t('模拟设置')}
            aria-expanded=${opts ? 'true' : 'false'}><${GearGlyph} /></button>` : null}
          ${opts && (aiLast || soloOpt) ? html`<${RoomOptions} takeoverOption=${aiTakeoverOption(room, me.playerId)} onAiTakeover=${setAiTakeover} option=${aiLast} soloOption=${soloOpt} room=${room} isHost=${facts.isHost} busy=${busy} onAiLast=${setAiLast}
            onSoloUnlimited=${setSoloUnlimited} onDifficulty=${openProto} onClose=${() => setOpts(false)} version=${versionCtl} />` : null}
>>>>>>> theirs
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
<<<<<<< ours
    ${coop ? html`<${ChatPanel} room=${true} />` : null}
=======
    ${picking ? html`<${CardPicker} current=${myCard} list=${cardList} m=${data.get('assets')} localSkins=${localSkins} onPick=${pickCard} onClose=${() => setPicking(false)} />` : null}
    ${protoOpen ? facts.isHost
      ? html`<${ProtocolSelect} roomMode=${room.mode} difficulty=${ladder ? room.difficulty : protoPick || room.difficulty} onDifficulty=${setProtoPick} onClose=${closeProto}
          onCreate=${confirmDifficulty} busy=${busy === 'diff' ? 'create' : null} online=${online} action=${t('确认')} hint=${protoHint} difficulties=${protoDifficulties}
          ladder=${ladder} modeId=${ladder ? protoPick || room.modeId : null} onMode=${setProtoPick} season=${seasonOf(roomVersion(room))} />`
      : html`<${ProtocolSelect} roomMode=${room.mode} difficulty=${room.difficulty} onDifficulty=${() => {}} onClose=${closeProto}
          online=${online} readOnly=${true} difficulties=${protoDifficulties} ladder=${ladder} modeId=${room.modeId || null} season=${seasonOf(roomVersion(room))} />` : null}
    ${versionOpen && versionCtl ? html`<${VersionPicker} mode="room" versions=${versions || [{ id: curVersion, roomModes: [room.mode] }]} current=${curVersion}
      serverDefault=${serverDefault} roomMode=${room.mode} editable=${versionEditable && !versionWhy} busy=${busy === 'version'}
      note=${versionEditable ? versionWhy || (facts.humans.length > 1 ? t('其他博士同意后才会切换；切换后需要重新准备。') : null) : t('由创建者发起')}
      onPick=${proposeVersion} onClose=${() => setVersionOpen(false)} />` : null}
>>>>>>> theirs
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

/** 동기화 시뮬레이션 소개 (room topbar ⓘ): the rules of a sync room. */
function SyncInfoDialog({ open, onClose }) {
  const rules = [
    '모든 인원이 HP를 공유합니다. 라운드당 HP 감소 상한은 설정값 × 인원수이며, 인원별이 아니라 라운드 전체에 적용됩니다.',
    '연합 방어 단계가 없습니다.',
    '라운드마다 모든 전장에 같은 적이 등장합니다. 모든 인원의 수배 적도 포함됩니다.',
    '같은 적은 모든 전장에서 HP를 공유합니다. 어느 전장에서든 처치하면 모든 전장에서 사라집니다.',
    '적이 방어 포인트에 들어간 전장마다 팀 HP가 감소하며, 그 적이 어느 전장에서든 처치되면 감소 횟수가 1(8인은 최대 2) 줄어듭니다. 전투를 포기하면 남은 적은 그 전장에서 놓친 것으로 처리합니다. (예: 2개 전장에서 놓친 적이 처치되면 1회분만 감소)',
    '적 HP는 생존 인원수에 비례해 증가합니다. 수배 적은 1인당 +50%입니다.',
    '수배 적을 처치하면 그 수배를 고른 사람과 처치한 사람이 각각 같은 자금을 받습니다.',
    '보스 라운드는 연합 시뮬레이션과 같습니다.',
  ];
  return html`<${Modal} open=${open} title=${t('동기화 시뮬레이션')} micro="SYNC SIMULATION" onClose=${onClose} width=${520}>
    <ul class="sync-info-list">${rules.map(r=>html`<li>${t(r)}</li>`)}</ul>
  <//>`;
}
