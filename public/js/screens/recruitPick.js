// 선발 선택 — RECRUIT_PICK (after the strategy draft, shared/recruitPick.js): the player's recruit candidates (up to 6 per
// tier, set in 오퍼레이터 설정) as cards by tier; a tap picks or drops one (≤ 2 per tier), 선택 완료 confirms
// (g.recruitPick { picks, ready }). Only the picked operators appear in the player's recruits and rewards. The left
// column lists the players and whether each is done; the phase ends when everyone is, or when the countdown runs out
// (the picks made so far count).

import { useEffect, useState } from '../../vendor/hooks.module.js';
import { html, Button, Icon, MicroLabel } from '../ui/components.js';
import { useGameData, UnitThumb, PlayerAvatar } from '../ui/gameComponents.js';
import { StepHeader, ExitModal } from '../ui/matchChrome.js';
import { ChatPanel } from '../ui/chat.js';
import { sortedPlayers, phaseTotalSeconds } from '../ui/gameLogic.js';
import { actions } from '../ui/gameActions.js';
import { useStore } from '../store.js';
import { RECRUIT_PICKS, RECRUIT_TIERS, checkRecruitPicks } from '../../../shared/recruitPick.js';

const cx = (...p) => p.flat().filter(Boolean).join(' ');

/** Toggle `id` in `picks` when the result is still a valid pick list (else the list unchanged). */
export function togglePick(picks, id, candidates, getChess) {
  const next = picks.includes(id) ? picks.filter((x) => x !== id) : [...picks, id];
  return checkRecruitPicks(next, candidates, getChess).ok ? next : picks;
}

export function RecruitPickScreen() {
  const pub = useStore((s) => s.match.public);
  const priv = useStore((s) => s.match.private);
  const myId = useStore((s) => s.me.playerId);
  const solo = useStore((s) => s.room?.mode === 'solo');
  const gd = useGameData();
  const [exit, setExit] = useState(false);
  const [busy, setBusy] = useState(false);
  const serverPicks = Array.isArray(priv?.selectedRecruits) ? priv.selectedRecruits : [];
  const [picks, setPicks] = useState(serverPicks);
  const ready = !!priv?.recruit?.ready;
  useEffect(() => { setPicks(serverPicks); }, [serverPicks.join('|')]);
  if (!pub) return null;
  const candidates = Array.isArray(priv?.recruit?.candidates) ? priv.recruit.candidates : [];
  const getChess = (id) => gd.chess(id);
  const send = async (next, done) => {
    setBusy(true);
    const ok = await actions.recruitPick(next, done);
    if (!ok) setPicks(serverPicks);
    setBusy(false);
  };
  const tap = (id) => {
    if (busy) return;
    const next = togglePick(picks, id, candidates, getChess);
    if (next === picks) return;
    setPicks(next);
    send(next, false);
  };
  const players = sortedPlayers(pub);
  return html`<div class="screen rpick">
    <div class="brief__bg" aria-hidden="true"></div>
    <${StepHeader} step=${3} of=${3} title="선발 선택" micro="RECRUIT // SELECTION" pub=${pub}
      total=${phaseTotalSeconds(pub, gd.config) ?? 30} onExit=${() => setExit(true)} />
    <main class="rpick__main">
      <aside class="rpick__players" aria-label="참가자">
        ${players.map((p) => html`<div key=${p.playerId} class=${cx('rpick__player', p.playerId === myId && 'is-self')}>
          <${PlayerAvatar} player=${p} self=${p.playerId === myId} size="sm" />
          <span class="rpick__pname">${p.name || '박사'}</span>
          ${p.status === 'ready' ? html`<span class="rpick__state is-done"><${Icon} name="check" />완료</span>` : html`<span class="rpick__state">선택 중…</span>`}
        </div>`)}
      </aside>
      <section class="rpick__body">
        <p class="rpick__hint"><${Icon} name="info" />후보 중 각 단계에서 최대 ${RECRUIT_PICKS}명을 선발합니다. 선발한 오퍼레이터만 본인의 모집·보상에 등장합니다.</p>
        ${!candidates.length ? html`<p class="t-dim">선발 후보가 없습니다. 다른 참가자를 기다리는 중입니다.</p>` : RECRUIT_TIERS.map((t) => {
          const list = candidates.filter((id) => getChess(id)?.tier === t);
          const n = picks.filter((id) => getChess(id)?.tier === t).length;
          return html`<div key=${t} class="rpick__tier">
            <h2 class="brief-h"><span>${t}단계</span><b class="num rpick__count">${n}/${RECRUIT_PICKS}</b><${MicroLabel}>TIER ${t}</${MicroLabel}></h2>
            ${list.length ? html`<div class="rpick__grid" role="listbox" aria-multiselectable="true" aria-label=${t + '단계 선발 후보'}>
              ${list.map((id) => {
                const c = getChess(id);
                const on = picks.includes(id);
                const full = !on && togglePick(picks, id, candidates, getChess) === picks;
                return html`<button key=${id} type="button" role="option" aria-selected=${on} disabled=${busy || ready || full}
                    class=${cx('rpick__card', on && 'is-on', full && 'is-full')} onClick=${() => tap(id)}>
                  <${UnitThumb} kind="chess" id=${id} size="lg" />
                  <span class="rpick__name">${c?.name || id}</span>
                  ${on ? html`<span class="rpick__mark"><${Icon} name="check" /></span>` : null}
                </button>`;
              })}
            </div>` : html`<p class="t-dim">이 단계의 후보가 없습니다.</p>`}
          </div>`;
        })}
      </section>
    </main>
    <footer class="rpick__foot">
      ${ready ? html`<${Button} variant="secondary" size="lg" icon="refresh" disabled=${busy} onClick=${() => send(picks, false)}>다시 선택<//>`
        : html`<${Button} variant="primary" size="lg" icon="check" disabled=${busy || !candidates.length} onClick=${() => send(picks, true)}>선택 완료<//>`}
    </footer>
    ${solo ? null : html`<${ChatPanel} />`}
    <${ExitModal} open=${exit} onClose=${() => setExit(false)} solo=${solo} />
  </div>`;
}
