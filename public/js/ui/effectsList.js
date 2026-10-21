import {formatAugmentDescription} from './augmentDescription.js';
// Active effects list (m.private.effects: band / 机变 / team / item / garrison effects with counters):
// compact icon column at the right edge, rich-text tooltip per effect. `counterText` (a 悬赏's "还剩 N 场作战", user
// playtest #6 item 4) replaces the bare counter in the tooltip's kind line.

import { AUGMENT_GRADES, augmentEffectEntries } from '../../../shared/augments.js';
import { html, Tooltip } from './components.js';
import { Img, RichText, GIcon } from './gameComponents.js';
import { effectIconUrl, bondIconUrl } from './assetUrls.js';
import { data } from '../data.js';

const KIND = { band: '策略', choice: '机变', team: '团队增益', item: '道具', garrison: '特质',augment:'증강' };

/** @param {{ effects: any[] }} props */
export function EffectsList({ effects,pub=null,ownerId=null,augmentsOnly=false }) {
  const list = augmentsOnly?augmentEffectEntries(pub?.augments?.selectedAllies?.[ownerId]||[]):(Array.isArray(effects)?effects:[]).filter(e=>e&&e.iconKind!=='augment'&&(e.name||e.desc));
  if (!list.length) return null;
  const m = data.get('assets');
  return html`<div class="effects" aria-label="生效中的效果">
    <div class="effects__icons" style=${{'--effect-rows':Math.min(6,list.length)}}>${list.map((e, i) => html`<${Tooltip} key=${e.id ?? i} placement="bottom" text=${html`<div class="efftip">
        <b>${e.name || '效果'}</b><span class="efftip__kind">${e.grade?AUGMENT_GRADES[e.grade]?.name+' ':''}${KIND[e.iconKind] || ''}${e.counterText ? ` · ${e.counterText}` : e.counter != null ? ` · ${e.counter}` : ''}</span>
        <${RichText} as="p" text=${e.iconKind==='augment'?formatAugmentDescription(e.desc):e.desc||''} />
      </div>`}>
      <span class=${`effect effect--${e.iconKind || 'x'}`} style=${e.grade?{'--augment-color':AUGMENT_GRADES[e.grade]?.color}:null}>
        <${Img} src=${e.iconBond?bondIconUrl(m,e.iconBond):effectIconUrl(m, e)} fallback=${html`<${GIcon} name="bolt" />`} />
        ${e.counter != null && e.counter !== '' ? html`<b class="effect__n num">${e.counter}</b>` : null}
      </span>
    <//>`)}
  </div></div>`;
}
