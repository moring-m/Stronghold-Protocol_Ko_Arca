// 전략 명령 (규정 시즌, server/match/bandCommands.js commandView): the player's strategy has a command — its cost,
// cooldown / uses and why it cannot be used now — and the valid targets the server lists (`targets`: {} = no target,
// { uid } = an owned operator, { slot } = a shop slot, { row, col } = a tile). Using it sends g.command { effectId,
// target }. A pending command draft (strategy upgrade / 交换, commandDraftView) offers its cards (g.commandChoice).
// Only shown when the private view carries a command (a 맹약 season never does).

import { useState } from '../../vendor/hooks.module.js';
import { html, Button, Icon, MicroLabel } from './components.js';
import { RichText, useGameData } from './gameComponents.js';
import { actions } from './gameActions.js';
import { t } from '../../../shared/i18n.js';

const REASON = {
  locked: '아직 해금되지 않았습니다', passive: '상시 효과', cooldown: '재사용 대기 중', exhausted: '사용 횟수를 모두 썼습니다',
  specialRecruit: '특별 모집 중에는 사용할 수 없습니다', funds: '자금이 부족합니다',
};

/** A readable label of one server target. */
function targetLabel(target, pieces, gd) {
  if (target.uid != null) {
    const p = pieces.find((x) => x && x.uid === target.uid);
    return p ? (gd.chess(p.id)?.name || p.id) : `#${target.uid}`;
  }
  if (target.slot != null) return `${t('상점')} ${target.slot + 1}`;
  if (target.row != null) return `${t('타일')} ${target.row + 1}-${target.col + 1}`;
  return t('사용');
}

export function CommandPanel({ priv, editable }) {
  const gd = useGameData();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const view = priv?.command;
  const draft = priv?.commandDraft;
  if (!view && !draft) return null;
  const pieces = [...(priv?.board || []), ...(priv?.hand || []), ...(priv?.temp || [])].filter(Boolean);
  const send = async (fn) => { if (busy) return; setBusy(true); await fn(); setBusy(false); };
  const targets = Array.isArray(view?.targets) ? view.targets : [];
  const plain = targets.some((x) => Object.keys(x).length === 0);
  const choices = targets.filter((x) => Object.keys(x).length > 0);
  return html`<div class=${`cmdp${open ? ' is-open' : ''}`} data-testid="command-panel">
    <button type="button" class="cmdp__head" onClick=${() => setOpen(!open)} aria-expanded=${open}>
      <${Icon} name="sword" /><span>${t('전략 명령')}</span>
      ${view ? html`<b class="num cmdp__cost">${view.currentCost ?? view.baseCost ?? 0}</b>` : null}
      ${draft ? html`<span class="cmdp__badge">!</span>` : null}
    </button>
    ${open ? html`<div class="cmdp__body">
      ${view ? html`<div class="cmdp__desc"><${RichText} text=${view.descRaw || view.desc || ''} /></div>
        <div class="cmdp__meta">
          ${view.cooldown ? html`<span>${t('재사용 대기')} <b class="num">${view.cooldown}</b>${t('라운드')}</span>` : null}
          ${view.usesLeft != null ? html`<span>${t('남은 횟수')} <b class="num">${view.usesLeft}</b></span>` : null}
          ${view.reason ? html`<span class="cmdp__why">${t(REASON[view.reason] || view.reason)}</span>` : null}
        </div>
        ${view.type === 'ACTIVE' ? html`<div class="cmdp__acts">
          ${plain ? html`<${Button} size="sm" variant="primary" disabled=${busy || !editable || !view.usable}
            onClick=${() => send(() => actions.command(view.effectId, {}))}>${t('사용')}<//>` : null}
          ${choices.length ? html`<${MicroLabel}>TARGET<//>
            <div class="cmdp__targets">${choices.map((tg, i) => html`<${Button} key=${i} size="sm" variant="secondary"
              disabled=${busy || !editable || !view.usable} onClick=${() => send(() => actions.command(view.effectId, tg))}>${targetLabel(tg, pieces, gd)}<//>`)}</div>` : null}
        </div>` : null}` : null}
      ${draft ? html`<div class="cmdp__draft"><${MicroLabel}>${t('명령 선택')}<//>
        ${(draft.cards || []).map((c, idx) => html`<button key=${c.effectId} type="button" class="cmdp__card" disabled=${busy}
            onClick=${() => send(() => actions.commandChoice(draft.id, idx))}>
          <${RichText} text=${c.descRaw || c.desc || c.effectId} /><b class="num">${c.cost ?? ''}</b>
        </button>`)}
      </div>` : null}
    </div>` : null}
  </div>`;
}
