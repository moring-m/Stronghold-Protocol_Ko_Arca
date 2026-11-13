// 선택자편 — CUSTOM_CHECK (규정 시즌, config.diyBringLimits): after the strategy draft the player chooses which of the
// lobby's 자선 편성 slots enter the match (0–2 per tier), in the fork's 선발 선택 layout (screens/recruitPick.js, `.rsel`).
// A slot whose core bond is banned, or whose every add-on is banned, is grey (the server's diyBanned list). Confirming
// none brings none (g.diyBring { slots }). The screen opens with the server's timeout default: the first legal slots of
// each tier, in data order, up to the cap.

import { useState } from '../../vendor/hooks.module.js';
import { html, Button, Icon, MicroLabel } from '../ui/components.js';
import { useGameData, UnitThumb, PlayerAvatar } from '../ui/gameComponents.js';
import { StepHeader, ExitModal } from '../ui/matchChrome.js';
import { ChatPanel } from '../ui/chat.js';
import { sortedPlayers, phaseTotalSeconds } from '../ui/gameLogic.js';
import { actions } from '../ui/gameActions.js';
import { useStore } from '../store.js';
import { data } from '../data.js';
import { defaultDiyBring } from '../../../shared/diyBring.js';
import { diySlot, diySlotIds } from '../../../shared/diy.js';
import { t } from '../../../shared/i18n.js';

const cx = (...p) => p.flat().filter(Boolean).join(' ');

export function DiyCheckScreen() {
  const pub = useStore((s) => s.match.public);
  const priv = useStore((s) => s.match.private);
  const myId = useStore((s) => s.me.playerId);
  const solo = useStore((s) => s.room?.mode === 'solo');
  const gd = useGameData();
  const [exit, setExit] = useState(false);
  const [busy, setBusy] = useState(false);
  // null: untouched, so the shown selection is the server's timeout default
  const [picked, setPicked] = useState(null);
  if (!pub) return null;
  const pack = { chess: data.get('chess'), backups: data.get('backups') };
  const roster = priv?.diy && typeof priv.diy === 'object' ? priv.diy : {};
  const banned = new Set(Array.isArray(priv?.diyBanned) ? priv.diyBanned : []);
  const limits = pub.diyCheck?.limits || {};
  const order = diySlotIds(pack).filter((id) => Object.hasOwn(roster, id));
  const tierOf = (id) => diySlot(id, pack)?.tier ?? gd.chess(id)?.tier ?? null;
  const defaults = defaultDiyBring(diySlotIds(pack), { roster, banned: [...banned], limits, tierOf });
  const mine = pub.diyCheck?.picks?.[myId];
  const confirmed = Array.isArray(mine) ? mine : null;
  const shown = confirmed ?? picked ?? defaults;
  const canEdit = confirmed == null && !busy;
  const tiers = [...new Set(order.map(tierOf).filter((x) => x != null))].sort((a, b) => a - b);
  const capOf = (tier) => Math.max(0, Number(limits[tier] ?? limits[String(tier)] ?? 0) || 0);
  const tap = (id) => {
    if (!canEdit || banned.has(id)) return;
    const cur = shown.slice();
    const on = cur.includes(id);
    const tier = tierOf(id);
    if (!on && cur.filter((x) => tierOf(x) === tier).length >= capOf(tier)) return;
    setPicked(on ? cur.filter((x) => x !== id) : [...cur, id]);
  };
  const confirm = async () => {
    setBusy(true);
    await actions.diyBring(shown);
    setBusy(false);
  };
  const players = sortedPlayers(pub);
  return html`<div class="screen rsel">
    <div class="brief__bg" aria-hidden="true"></div>
    <${StepHeader} step=${3} of=${3} title=${t('선택자편')} micro="CUSTOM // CHECK" pub=${pub}
      total=${phaseTotalSeconds(pub, gd.config) ?? 30} onExit=${() => setExit(true)} />
    <main class="rsel__main">
      <aside class="rsel__players" aria-label=${t('참가자')}>
        ${players.map((p) => html`<div key=${p.playerId} class=${cx('rsel__player', p.playerId === myId && 'is-self')}>
          <${PlayerAvatar} player=${p} self=${p.playerId === myId} size="sm" />
          <span class="rsel__pname">${p.name || t('박사')}</span>
          ${p.status === 'ready' ? html`<span class="rsel__state is-done"><${Icon} name="check" />${t('완료')}</span>` : html`<span class="rsel__state">${t('선택 중…')}</span>`}
        </div>`)}
      </aside>
      <section class="rsel__body">
        <p class="rsel__hint"><${Icon} name="info" /><span>${t('자선 편성 중 이번 시뮬레이션에 데려갈 오퍼레이터를 단계별로 고릅니다. 아무도 고르지 않으면 자선 오퍼레이터 없이 진행합니다.')}</span></p>
        ${!order.length ? html`<p class="t-dim">${t('자선 편성이 비어 있습니다. 확인을 누르면 진행합니다.')}</p>` : tiers.map((tier) => {
          const list = order.filter((id) => tierOf(id) === tier);
          const n = shown.filter((id) => tierOf(id) === tier).length;
          return html`<div key=${tier} class="rsel__tier">
            <h2 class="brief-h"><span>${tier}${t('단계')}</span><b class="num rsel__count">${n}/${capOf(tier)}</b><${MicroLabel}>TIER ${tier}<//></h2>
            <div class="rsel__grid" role="listbox" aria-multiselectable="true">
              ${list.map((id) => {
                const on = shown.includes(id);
                const grey = banned.has(id);
                const full = !on && n >= capOf(tier);
                return html`<button key=${id} type="button" role="option" aria-selected=${on} disabled=${!canEdit || grey || full}
                    class=${cx('rsel__card', on && 'is-on', (grey || full) && 'is-full')} onClick=${() => tap(id)}
                    title=${grey ? t('금지된 맹약의 오퍼레이터입니다') : null}>
                  <${UnitThumb} kind="chess" id=${id} size="lg" />
                  <span class="rsel__name">${gd.chess(id)?.name || id}</span>
                  ${on ? html`<span class="rsel__mark"><${Icon} name="check" /></span>` : null}
                </button>`;
              })}
            </div>
          </div>`;
        })}
      </section>
    </main>
    <footer class="rsel__foot">
      ${confirmed ? html`<span class="rsel__state is-done"><${Icon} name="check" />${t('완료')}</span>`
        : html`<${Button} variant="primary" size="lg" icon="check" disabled=${busy} onClick=${confirm}>${t('선택 완료')}<//>`}
    </footer>
    ${solo ? null : html`<${ChatPanel} />`}
    <${ExitModal} open=${exit} onClose=${() => setExit(false)} solo=${solo} />
  </div>`;
}
