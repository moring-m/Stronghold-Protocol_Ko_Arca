import {UnofficialMark} from "../ui/pluginTag.js";
import {t} from "../../../shared/i18n.js";
import { ChatPanel } from '../ui/chat.js';
// Briefing — INFO_CHECK "1/2 确认本局信息" (research 06 §4.1, D1): enemy leader (silhouette, name,
// abilities), stage (+ its pool: 战场固定 / 战场随机（共N张）), 特训敌人 factions (icon, name, description), the difficulty
// tag, the ready count x/N with person pips, the 准备就绪 button (g.infoReady) and the countdown. The right column — 核心盟约
// / 附加盟约 rows of bond discs (disabled bonds greyed with the banned-member badge), the legend and the 本局禁用干员
// avatars — is ui/matchInfo.js MatchInfo, the same blocks the strategy draft's 本局信息 dialog shows (screens/bandDraft.js).

import { useState } from '../../vendor/hooks.module.js';
import { html, Button, Icon, MicroLabel, BondDisc } from '../ui/components.js';
import { useGameData, Img, RichText, BondGlyph } from '../ui/gameComponents.js';
import { StepHeader, ExitModal } from '../ui/matchChrome.js';
import { MatchInfo, matchInfoModel } from '../ui/matchInfo.js';
import { LoadoutButton } from '../ui/loadoutEntry.js';
import { SetupReroll } from '../ui/setupReroll.js';
import { actions } from '../ui/gameActions.js';
import { factionTypes, sortedPlayers, phaseTotalSeconds } from '../ui/gameLogic.js';
import { enemyIconUrl, factionIconUrl, bondIconUrl } from '../ui/assetUrls.js';
import { matchData as data } from '../data.js';
import { useStore } from '../store.js';
import { mapPreviewUrl } from '../ui/mapPreviews.js';

const cx = (...p) => p.flat().filter(Boolean).join(' ');

/** INFO_CHECK screen. */
export function BriefingScreen() {
  const pub = useStore((s) => s.match.public);
  const myId = useStore((s) => s.me.playerId);

  const solo = useStore((s) => s.room?.mode === 'solo') || String(pub?.modeId || '').includes('single');
  // gameplay plugins (DESIGN §32.6): the briefing says the match is unofficial
  const room = useStore((s) => s.room);
  const gd = useGameData();
  const [exit, setExit] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!pub) return null;

  const players = sortedPlayers(pub);
  const me = players.find((p) => p.playerId === myId);
  const readyN = players.filter((p) => p.ready).length;
  const mode = gd.config?.modes?.[pub.modeId];
  const info = matchInfoModel(pub, { bonds: gd.list('bonds'), chess: gd.chess, mode });

  // 규정 단독: the core-bond group must be picked before the briefing ends
  const needGroup = !!(solo && Array.isArray(pub.bondChoice?.groups) && pub.bondChoice.picked == null);
  const ready = async () => {
    if (busy || me?.ready || needGroup) return;
    setBusy(true);
    await actions.infoReady(pub.setupRevision ?? 0);
    setBusy(false);
  };

  return html`<div class="screen brief">
    <div class="brief__bg" aria-hidden="true"></div>
    <${StepHeader} step=${1} of=${2} title="确认本局信息" micro="BRIEFING // INFO CHECK" pub=${pub}
      total=${phaseTotalSeconds(pub, gd.config)} onExit=${() => setExit(true)} />
    <${UnofficialMark} room=${room} class="brief__modmark" />
    <main class="brief__main">
      <section class="brief__left">
        <${BriefingOverview} pub=${pub} />
      </section>
      <section class="brief__right">
        <${BondGroupPicker} pub=${pub} canPick=${!!me && !me.ready} />
        <${MatchInfo} model=${info} />
      </section>
    </main>
    <footer class="brief__foot">
      <div class="brief__reroll-group"><${SetupReroll} pub=${pub} />
      <span>리롤 ${room?.rerollLimit === -1 ? '무제한' : `${Math.max(0, (room?.rerollLimit ?? 0) - (room?.rerollsUsed ?? 0))}회 남음`}</span></div>
      <${LoadoutButton} from="briefing" size="lg" class="brief-loadout" />
      <div class="brief-ready">
        <span class="brief-ready__txt">已就绪 <b class="num">${readyN}</b><span class="num">/${players.length}</span></span>
        <span class="brief-ready__pips">${players.map((p) => html`<i key=${p.playerId} class=${cx(p.ready && 'on', p.playerId === myId && 'me')} title=${p.name}><${Icon} name="user" /></i>`)}</span>
      </div>
      <${Button} variant="primary" size="xl" icon=${me?.ready ? 'check' : me ? 'play' : 'eye'} active=${!!me?.ready} loading=${busy}
        disabled=${!!me?.ready || !me || !!pub.rerollVote || needGroup} title=${needGroup ? t('핵심 맹약 그룹을 먼저 고르세요') : null} onClick=${ready}>${me?.ready ? '已就绪' : me ? '准备就绪' : '观战中'}<//>
    </footer>
    ${solo ? null : html`<${ChatPanel} />`}
    <${ExitModal} open=${exit} onClose=${() => setExit(false)} solo=${solo} />
  </div>`;
}

/**
 * 규정 단독: the two groups of core bonds the match drew (pub.bondChoice); the player plays the one picked and the other
 * is banned (g.bondGroup). Unpicked at the end of the briefing, the first group plays.
 */
function BondGroupPicker({ pub, canPick }) {
  const gd = useGameData();
  const [busy, setBusy] = useState(false);
  const choice = pub?.bondChoice;
  if (!choice || !Array.isArray(choice.groups)) return null;
  const pick = async (idx) => {
    if (busy || !canPick || choice.picked === idx) return;
    setBusy(true);
    await actions.bondGroup(idx, pub.setupRevision ?? 0);
    setBusy(false);
  };
  return html`<div class="brief-groups" data-testid="bond-groups">
    <h3 class="brief-h"><span>${t('핵심 맹약 그룹 선택')}</span><${MicroLabel}>CORE BOND GROUP<//></h3>
    <p class="t-dim brief-groups__hint">${t('고른 그룹의 핵심 맹약만 이번 시뮬레이션에 등장합니다. 그룹을 골라야 시작할 수 있습니다.')}</p>
    <div class="brief-groups__row">
      ${choice.groups.map((g, idx) => html`<button key=${idx} type="button" class=${cx('brief-group', choice.picked === idx && 'is-on')}
          aria-pressed=${choice.picked === idx} disabled=${busy || !canPick} onClick=${() => pick(idx)}>
        <span class="brief-group__label">${t('그룹')} ${idx === 0 ? 'A' : 'B'}</span>
        <span class="brief-group__bonds">${g.map((b) => html`<span key=${b} class="brief-group__bond brief-bond"><${BondDisc} name=${gd.bond?.(b)?.name || b} icon=${bondIconUrl(data.get('assets'), b)} active=${choice.picked === idx} disabled=${choice.picked != null && choice.picked !== idx} tier=${choice.picked === idx ? (gd.bond?.(b)?.thresholds?.length || 1) : 0} maxTier=${Math.max(1, gd.bond?.(b)?.thresholds?.length || 1)} size="md" /></span>`)}</span>
        ${choice.picked === idx ? html`<span class="brief-group__mark"><${Icon} name="check" /></span>` : null}
      </button>`)}
    </div>
  </div>`;
}

/**
 * The briefing's left column — the enemy leader, the battlefield (name, pool, map image) and the 特训 factions — shared
 * with the strategy draft's 시뮬레이션 정보 dialog (screens/bandDraft.js).
 */
export function BriefingOverview({ pub }) {
  const gd = useGameData();
  if (!pub) return null;
  const mode = gd.config?.modes?.[pub.modeId];
  const boss = pub.bossId ? gd.boss(pub.bossId) : null;
  const bossEnemy = boss ? gd.enemy(boss.enemyKey) : null;
  const stage = pub.stageId ? gd.stage(pub.stageId) : null;
  const poolN = Array.isArray(mode?.stages) ? mode.stages.length : 0;
  const pool = poolN > 1 ? `战场随机（共${poolN}张）` : poolN === 1 ? '战场固定' : '';
  const types = factionTypes(pub.factions);
  const factions = gd.factions?.types || {};
  const m = gd.m;
  return html`<div class="brief-overview">
        <div class="brief-boss brackets">
          <${MicroLabel} tone="gold">ENEMY LEADER // 敌方领袖</${MicroLabel}>
          <div class="brief-boss__art">
            <div class="brief-boss__ring" aria-hidden="true"></div>
            ${bossEnemy ? html`<${Img} src=${enemyIconUrl(m, boss.enemyKey)} class="brief-boss__sil" fallback=${html`<span class="brief-boss__q">?</span>`} />`
              : html`<span class="brief-boss__q">?</span>`}
          </div>
          <div class="brief-boss__text">
            <h2 class="brief-boss__name">${boss?.name || bossEnemy?.name || '未知领袖'}</h2>
            <span class="brief-boss__when">第 <b class="num">${mode?.bossRound ?? pub.lastRound ?? 14}</b> 回合 · 最终攻势</span>
            ${Array.isArray(boss?.abilities) && boss.abilities.length ? html`<ul class="brief-boss__abil">
              ${boss.abilities.slice(0, 3).map((a, i) => html`<li key=${i}><${RichText} text=${a} /></li>`)}
            </ul>` : null}
          </div>
        </div>
        <div class="brief-stage">
          <span class="brief-stage__k"><${MicroLabel}>BATTLEFIELD</${MicroLabel}>${pool ? html`<span class="brief-stage__pool">${pool}</span>` : null}</span>
          <span class="brief-stage__name"><${Icon} name="rook" />${stage?.name || pub.stageId || '—'}</span>
        </div>
        ${mapPreviewUrl(pub.stageId) ? html`<div class="brief-map"><img src=${mapPreviewUrl(pub.stageId)} alt=${stage?.name || ''} loading="lazy" onError=${(e) => { e.currentTarget.parentElement.hidden = true; }} /></div>` : null}
        <div class="brief-factions">
          <h3 class="brief-h"><span>特训敌人</span><${MicroLabel}>SPECIAL ENEMIES</${MicroLabel}></h3>
          ${types.length ? types.map((t) => html`<div key=${t} class="brief-faction">
            <span class="brief-faction__icon"><${Img} src=${factionIconUrl(m, factions[t]?.icon)} /></span>
            <span class="brief-faction__text"><b>${factions[t]?.name || t}</b><${RichText} text=${factions[t]?.descRaw || factions[t]?.desc || ''} /></span>
          </div>`) : html`<p class="t-dim">本局没有特训敌人</p>`}
        </div>
  </div>`;
}
