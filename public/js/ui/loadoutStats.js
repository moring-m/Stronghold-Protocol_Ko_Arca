import { html, MicroLabel } from './components.js';
import { RichText } from './gameComponents.js';
import { chessStatsBlock, traitText, chessTalents } from './detailPanel.js';
import { chessLoadout } from './gameLogic.js';
const getChessRec = id => data.lookup('chess', id);
import { data } from '../data.js';
const cx = (...p) => p.flat().filter(Boolean).join(' ');
export function statsPreview(base, golden, entries, level, getChess, opts = {}) {
  const elite = level === 'elite' && !!golden;
  const chess = elite ? golden : base;
  if (!chess) return null;
  const lo = chessLoadout(chess, entries, getChess, opts);
  const record = lo?.record || chess;
  // (the card's own rule: the 特性 line exists when the chess has one; its text follows the chosen module)
  return { elite, chess, lo, record, trait: chess.trait?.desc ? traitText(chess, !!chess.isGolden, lo) || '' : '', talents: chessTalents(record) };
}

/**
 * 局内数值: the stats, 攻击范围, 特性 and 天赋 of the selected chess under its chosen skill and module — the detail
 * card's stats block (ui/detailPanel.js chessStatsBlock) without live numbers, so what a player reads here is what the
 * shop / board card shows before a battle (not the equipment, bond or skill-cast changes of a running match). The
 * toggle picks the 普通 or the 精锐 record; 精锐 is the default because the module only exists there.
 * @param {{ base: any, golden: any, entries: Record<string, any>, level: 'normal'|'elite', onLevel: (l: 'normal'|'elite') => void, getChess?: (id: string) => any }} props
 */
export function LoadoutStats({ base, golden, entries, ops, level, onLevel, getChess = getChessRec }) {
  const pv = statsPreview(base, golden, entries, level, getChess, { ops, effects: data.get('effects') });
  if (!pv) return null;
  return html`<section class="lo-sec lo-sec--stats" aria-label="局内数值" data-variant=${pv.elite ? 'elite' : 'normal'}>
    <header class="lo-sec__head">
      <h3>局内数值<${MicroLabel}>STATS<//></h3>
      <div class="lo-seg" role="tablist" aria-label="数值版本">
        <button type="button" role="tab" aria-selected=${pv.elite ? 'false' : 'true'} class=${cx(!pv.elite && 'is-on')} data-variant="normal" onClick=${() => onLevel('normal')}>普通</button>
        <button type="button" role="tab" aria-selected=${pv.elite ? 'true' : 'false'} class=${cx(pv.elite && 'is-on')} data-variant="elite" disabled=${!golden} onClick=${() => onLevel('elite')}>精锐</button>
      </div>
    </header>
    ${chessStatsBlock({ rec: pv.record, chess: pv.chess })}
    ${pv.trait || pv.talents.length ? html`<div class="lo-minfo lo-minfo--kit">
      ${pv.trait ? html`<div class="lo-minfo__row"><span class="lo-minfo__k">特性</span><${RichText} class="lo-minfo__v" text=${pv.trait} /></div>` : null}
      ${pv.talents.map((t, i) => html`<div key=${i} class="lo-minfo__row"><span class="lo-minfo__k">天赋</span>
        <span class="lo-minfo__v"><b class="lo-minfo__tname">${t.name}</b><${RichText} text=${t.descRaw || t.desc || ''} /></span></div>`)}
    </div>` : null}
    <p class="lo-stats__cap">${pv.elite ? '数值含所选模组；' : golden ? '普通干员没有模组，所选模组在「精锐」中生效；' : ''}不含技能发动、装备、盟约等局内加成</p>
  </section>`;
}

