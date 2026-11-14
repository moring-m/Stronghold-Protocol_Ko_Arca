// 전략 명령 (규정 시즌, server/match-upstream/bandCommands.js commandView): the strategy's command, in the right-hand
// effects column (game.js .gm__effects) instead of a panel over the shop.
//   - The tile is the strategy itself (the effects list leaves its band entry out while a command exists): its tooltip
//     has the strategy's effect and the command's text, cost, cooldown / uses and why it cannot be used.
//   - 돋보기 button on top: shows that tooltip as a hover would (again / anywhere else: hides it); while a command draft
//     (strategy upgrade / 交换, commandDraftView → g.commandChoice) waits it pulses and opens the draft instead.
//   - The command tile: a glowing frame while it can be used (ACTIVE, usable, own prep). Click: a command without a target
//     is used at once; one with targets highlights them (board / bench tiles through the render view, shop cards through
//     their data-shop-slot) and the next click on a highlighted target uses it (anything else cancels, as Esc does).
//     Drag: the tile follows the pointer and is used on the highlighted target it is dropped on.
// The server's `targets` are the only valid ones: {} = no target, { uid } = an owned operator, { slot } = a shop slot,
// { row, col } = a tile. Only shown when the private view carries a command (a 맹약 season never does).

import { useEffect, useRef, useState } from '../../vendor/hooks.module.js';
import { html, Button, Icon, MicroLabel, Modal, Tooltip, showTooltipAt } from './components.js';
import { tr } from '../i18n/i18n.js';
import { RichText, Img, GIcon } from './gameComponents.js';
import { actions } from './gameActions.js';
import { bandIconUrl } from './assetUrls.js';
import { data } from '../data.js';
import { GEO } from '../../../shared/constants.js';
import { t } from '../../../shared/i18n.js';

const REASON = {
  locked: '아직 해금되지 않았습니다', passive: '상시 효과', cooldown: '재사용 대기 중', exhausted: '사용 횟수를 모두 썼습니다',
  specialRecruit: '특별 모집 중에는 사용할 수 없습니다', funds: '자금이 부족합니다',
};
const DRAG_PX = 6;
const sameTarget = (a, b) => (a.uid != null ? a.uid === b.uid : a.slot != null ? a.slot === b.slot : a.row === b.row && a.col === b.col);

/** The tile a target sits on (for the render view's highlight), or null for a shop slot. */
function targetTile(target, priv) {
  if (target.row != null) return [target.row, target.col];
  if (target.uid == null) return null;
  const b = (priv?.board || []).find((p) => p && p.uid === target.uid);
  if (b) return [b.row, b.col];
  const h = (priv?.hand || []).findIndex((p) => p && p.uid === target.uid);
  if (h >= 0) return [GEO.HAND_ROW, h];
  const tIdx = (priv?.temp || []).findIndex((p) => p && p.uid === target.uid);
  return tIdx >= 0 ? [GEO.TEMP_ROW, GEO.TEMP_C0 + tIdx] : null;
}

/** The server target under a client point, among `targets` (shop card → slot; canvas → operator, then tile). */
function targetAt(x, y, targets, view) {
  const el = document.elementFromPoint(x, y);
  const card = el?.closest?.('[data-shop-slot]');
  if (card) { const slot = Number(card.getAttribute('data-shop-slot')); return targets.find((tg) => tg.slot === slot) || null; }
  const uid = view?.pieceAtClientPoint?.(x, y);
  if (uid != null) { const hit = targets.find((tg) => tg.uid === uid); if (hit) return hit; }
  const tile = view?.tileAtClientPoint?.(x, y);
  return tile ? targets.find((tg) => tg.row === tile.row && tg.col === tile.col) || null : null;
}

export function CommandPanel({ priv, editable, getView }) {
  const [info, setInfo] = useState(false);
  const [busy, setBusy] = useState(false);
  const [aiming, setAiming] = useState(false); // targets highlighted, waiting for the click on one
  const [ghost, setGhost] = useState(null);    // { x, y } while dragging
  const press = useRef(null);
  const tileRef = useRef(null);
  const pinned = useRef(null); // hide() of the tooltip the 돋보기 shows
  const dragEnded = useRef(0); // the click the browser fires after a drag's pointerup is not a tap
  const view = priv?.command;
  const draft = priv?.commandDraft;
  const targets = Array.isArray(view?.targets) ? view.targets : [];
  const plain = targets.some((x) => Object.keys(x).length === 0);
  const choices = targets.filter((x) => Object.keys(x).length > 0);
  const usable = !!(view && view.type === 'ACTIVE' && view.usable && editable && !busy);
  const send = async (fn) => { if (busy) return; setBusy(true); try { await fn(); } finally { setBusy(false); } };
  const use = (target) => send(() => actions.command(view.effectId, target));

  // highlight the valid targets while aiming or dragging
  const showing = (aiming || !!ghost) && usable && choices.length > 0;
  useEffect(() => {
    if (!showing) return undefined;
    const v = getView?.();
    const tiles = choices.map((tg) => targetTile(tg, priv)).filter(Boolean);
    try { v?.highlightTiles?.(tiles, 'target'); } catch { /* cosmetic */ }
    const cards = choices.filter((tg) => tg.slot != null).map((tg) => document.querySelector(`[data-shop-slot="${tg.slot}"]`)).filter(Boolean);
    for (const c of cards) c.classList.add('is-cmd-target');
    return () => {
      try { v?.highlightTiles?.([], 'target'); } catch { /* cosmetic */ }
      for (const c of cards) c.classList.remove('is-cmd-target');
    };
  }, [showing, priv, targets.length]);

  // aiming: the next click anywhere picks a target (a highlighted one is used; anything else cancels)
  useEffect(() => {
    if (!aiming) return undefined;
    const onClick = (e) => {
      if (e.target.closest?.('[data-testid="command-tile"]')) return;
      const hit = targetAt(e.clientX, e.clientY, choices, getView?.());
      e.preventDefault(); e.stopPropagation();
      setAiming(false);
      if (hit) use(hit);
    };
    const onKey = (e) => { if (e.key === 'Escape') setAiming(false); };
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('click', onClick, true); document.removeEventListener('keydown', onKey); };
  }, [aiming, priv]);
  useEffect(() => { if (!usable) setAiming(false); }, [usable]);
  // the 돋보기's tooltip goes away with the next click anywhere else, or when the panel goes
  useEffect(() => {
    const away = (e) => { if (pinned.current && !e.target.closest?.('.cmdx__info')) { pinned.current(); pinned.current = null; } };
    document.addEventListener('pointerdown', away, true);
    return () => { document.removeEventListener('pointerdown', away, true); pinned.current?.(); };
  }, []);

  if (!view && !draft) return null;
  const m = data.get('assets');
  const tap = () => {
    if (!usable) { setInfo(true); return; }
    if (plain && !choices.length) { use({}); return; }
    if (choices.length) setAiming(!aiming);
    else if (plain) use({});
  };
  const onPointerDown = (e) => {
    if (!usable || !choices.length || e.button !== 0) return;
    press.current = { x: e.clientX, y: e.clientY, id: e.pointerId, dragging: false };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e) => {
    const p = press.current;
    if (!p || p.id !== e.pointerId) return;
    if (!p.dragging && Math.hypot(e.clientX - p.x, e.clientY - p.y) < DRAG_PX) return;
    p.dragging = true;
    setGhost({ x: e.clientX, y: e.clientY });
  };
  const onPointerUp = (e) => {
    const p = press.current; press.current = null;
    if (!p || p.id !== e.pointerId) return;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    if (!p.dragging) return; // a click: handled by onClick
    dragEnded.current = Date.now();
    setGhost(null);
    // the pointer capture makes the tile the event target: hit-test under the pointer instead
    const hit = targetAt(e.clientX, e.clientY, choices, getView?.());
    if (hit) use(hit);
  };
  const onClick = (e) => { if (ghost || Date.now() - dragEnded.current < 400) { e.preventDefault(); return; } tap(); };
  const cost = view ? (view.currentCost ?? view.baseCost ?? 0) : null;
  const band = (Array.isArray(priv?.effects) ? priv.effects : []).find((e) => e && e.iconKind === 'band');
  const tip = view ? html`<div class="efftip">
    ${band ? html`<b>${tr(band.name || '')}</b><span class="efftip__kind">${tr('策略')}</span><${RichText} as="p" text=${band.desc || ''} />` : null}
    <b>${t('전략 명령')}</b>
    <span class="efftip__kind">${view.type === 'ACTIVE' ? `${t('비용')} ${cost}` : t(REASON.passive)}${view.cooldown ? ` · ${t('재사용 대기')} ${view.cooldown}${t('라운드')}` : ''}${view.usesLeft != null ? ` · ${t('남은 횟수')} ${view.usesLeft}` : ''}</span>
    <${RichText} as="p" text=${view.descRaw || view.desc || ''} />
    ${view.reason && view.reason !== 'passive' ? html`<span class="efftip__kind cmdp__why">${t(REASON[view.reason] || view.reason)}</span>` : null}</div>` : null;
  const onInfo = () => {
    if (!view) { setInfo(true); return; }
    if (pinned.current) { pinned.current(); pinned.current = null; return; }
    pinned.current = showTooltipAt(tileRef.current, tip, 'bottom');
  };
  return html`<div class="cmdx" data-testid="command-panel">
    <button type="button" class=${`cmdx__info${draft ? ' is-pending' : ''}`} aria-label=${t('전략 명령 효과 보기')} title=${t('전략 명령 효과 보기')}
      onClick=${onInfo}><${Icon} name="search" />${draft ? html`<span class="cmdx__badge">!</span>` : null}</button>
    ${view ? html`<${Tooltip} placement="bottom" text=${tip}>
      <button type="button" ref=${tileRef} data-testid="command-tile" class=${`cmdx__tile effect${usable ? ' is-usable' : ''}${aiming ? ' is-aiming' : ''}${ghost ? ' is-dragging' : ''}`}
        aria-label=${t('전략 명령')} aria-pressed=${aiming} disabled=${view.type !== 'ACTIVE'}
        onClick=${onClick} onPointerDown=${onPointerDown} onPointerMove=${onPointerMove} onPointerUp=${onPointerUp}
        onPointerCancel=${() => { press.current = null; setGhost(null); }}>
        <${Img} src=${bandIconUrl(m, priv?.bandId)} fallback=${html`<${GIcon} name="bolt" />`} />
        ${cost != null && view.type === 'ACTIVE' ? html`<b class="effect__n num">${cost}</b>` : null}
      </button>
    <//>` : null}
    ${ghost ? html`<div class="cmdx__ghost" style=${`left:${ghost.x}px;top:${ghost.y}px`} aria-hidden="true">
      <${Img} src=${bandIconUrl(m, priv?.bandId)} fallback=${html`<${GIcon} name="bolt" />`} /></div>` : null}
    ${aiming ? html`<div class="cmdx__hint" role="status">${t('강조된 대상을 선택하세요 (Esc: 취소)')}</div>` : null}
    <${Modal} open=${info} onClose=${() => setInfo(false)} title=${t('전략 명령')} micro="COMMAND" class="cmdx-dlg"
      actions=${html`<${Button} variant="secondary" icon="close" data-autofocus onClick=${() => setInfo(false)}>${t('닫기')}<//>`}>
      ${view ? html`<div class="cmdp__desc"><${RichText} text=${view.descRaw || view.desc || ''} /></div>
        <div class="cmdp__meta">
          ${view.type === 'ACTIVE' ? html`<span>${t('비용')} <b class="num">${cost}</b></span>` : null}
          ${view.cooldown ? html`<span>${t('재사용 대기')} <b class="num">${view.cooldown}</b>${t('라운드')}</span>` : null}
          ${view.usesLeft != null ? html`<span>${t('남은 횟수')} <b class="num">${view.usesLeft}</b></span>` : null}
          ${view.reason ? html`<span class="cmdp__why">${t(REASON[view.reason] || view.reason)}</span>` : null}
        </div>
        ${view.type === 'ACTIVE' ? html`<p class="t-dim cmdx-dlg__how">${choices.length
          ? t('전략 표시의 명령 아이콘을 대상으로 드래그하거나, 클릭한 뒤 강조된 대상을 선택해 사용합니다.')
          : t('전략 표시의 명령 아이콘을 클릭해 사용합니다.')}</p>` : null}` : null}
    <//>
    ${draft && editable ? html`<${Modal} open=${true} onClose=${null} closeOnBackdrop=${false} title=${t('명령 선택')} micro="COMMAND" class="cmdx-pick"
      tone="gold">
      <p class="t-dim cmdx-pick__lead">${t('새 명령을 하나 선택하세요. 선택하면 현재 명령이 교체됩니다.')}</p>
      <div class="cmdx-pick__cards">
        ${(draft.cards || []).map((c, idx) => { const full = tr(c.descRaw || c.desc || c.effectId); const head = /^\s*[【\[]([^】\]]+)[】\]]\s*\n?/.exec(full); const name = head?.[1] || (c.name ? tr(c.name) : ''); return html`<button key=${c.effectId} type="button" class="cmdx-pick__card" disabled=${busy}
            data-testid="command-choice" onClick=${() => send(() => actions.commandChoice(draft.id, idx))}>
          <span class="cmdx-pick__icon"><${Img} src=${bandIconUrl(m, c.bandId)} fallback=${html`<${GIcon} name="bolt" />`} /></span>
          <span class="cmdx-pick__body">
            ${name ? html`<b class="cmdx-pick__name">${name}</b>` : null}
            <span class="cmdx-pick__meta">${c.type === 'ACTIVE' ? `${t('비용')} ${c.cost ?? 0}` : t(REASON.passive)}</span>
            <${RichText} as="p" text=${head ? full.slice(head[0].length) : full} />
          </span>
        </button>`; })}
      </div>
    <//>` : null}
  </div>`;
}
