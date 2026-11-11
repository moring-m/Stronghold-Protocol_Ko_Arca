// 팀 전체 보기: one row per player — name, the active bonds (glyph + layers + name) and the operators on the board
// (m.public players[].bonds / lineup). Opened from the search button above the team panel in multiplayer.

import { html, Icon, Modal } from './components.js';
import { useGameData, UnitThumb, BondGlyph, PlayerAvatar } from './gameComponents.js';
import { sortedPlayers } from './gameLogic.js';

const cx = (...p) => p.flat().filter(Boolean).join(' ');

/** The bonds a row shows: active ones first (then by layers), the inactive ones with layers after them. */
export function overviewBonds(bonds) {
  return (Array.isArray(bonds) ? bonds : []).filter((b) => b && !b.off && (b.active || b.layers > 0))
    .sort((a, b) => (b.active ? 1 : 0) - (a.active ? 1 : 0) || (b.layers || 0) - (a.layers || 0));
}

export function TeamOverviewButton({ onOpen }) {
  return html`<button type="button" class="team__overview-btn" onClick=${onOpen} title="팀 전체 보기" aria-label="팀 전체 보기"><${Icon} name="search" /></button>`;
}

export function TeamOverview({ open, onClose, pub, myId }) {
  const gd = useGameData();
  if (!open) return null;
  const players = sortedPlayers(pub);
  return html`<${Modal} open=${open} title="팀 전체 보기" micro="TEAM OVERVIEW" onClose=${onClose} width="min(96vw, 13.6rem)" class="team-overview">
    <div class="tov">
      ${players.map((p) => {
        const bonds = overviewBonds(p.bonds);
        const lineup = Array.isArray(p.lineup) ? p.lineup : [];
        return html`<div key=${p.playerId} class=${cx('tov__row', p.playerId === myId && 'is-self', p.alive === false && 'is-dead')}>
          <div class="tov__who">
            <${PlayerAvatar} player=${p} self=${p.playerId === myId} size="sm" />
            <span class="tov__name">${p.name || '박사'}</span>
          </div>
          <div class="tov__bonds">
            ${bonds.length ? bonds.map((b) => html`<span key=${b.bondId} class=${cx('tov__bond', b.active && 'is-on')} title=${gd.bond(b.bondId)?.name || b.bondId}>
              <${BondGlyph} bondId=${b.bondId} /><b class="num">${b.layers ?? 0}</b><small>${gd.bond(b.bondId)?.name || ''}</small></span>`)
              : html`<span class="tov__none">—</span>`}
          </div>
          <div class="tov__lineup">
            ${lineup.length ? lineup.map((u, i) => html`<${UnitThumb} key=${i} kind="chess" id=${u.id} size="sm" badge=${u.items > 0 ? html`<span class="tov__items">${u.items}</span>` : null} />`)
              : html`<span class="tov__none">${p.alive === false ? '탈락' : '배치 없음'}</span>`}
          </div>
        </div>`;
      })}
    </div>
  <//>`;
}
