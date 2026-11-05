import {formatAugmentDescription} from './augmentDescription.js';
import { html, Icon } from './components.js';
import { Img, RichText } from './gameComponents.js';
import { data } from '../data.js';
import { bondIconUrl } from './assetUrls.js';
import { AUGMENT_GRADES } from '../../../shared/augments.js';
export function EnemyAugments({pub}){const cards=pub.augments?.selectedEnemies||[];return html`<section class="enemy-augments"><h3><${Icon} name="shield"/> 적 증강</h3>${cards.length?cards.map(a=>html`<article class="enemy-augment" style=${{'--augment-color':AUGMENT_GRADES[a.grade]?.color}}><${Img} src=${a.iconBond?bondIconUrl(data.get('assets'),a.iconBond):a.icon}/><div><small>${AUGMENT_GRADES[a.grade]?.name} · 모든 적에게 적용</small><h4>${a.name}</h4><${RichText} as="p" text=${formatAugmentDescription(a.description)}/></div></article>`):html`<p class="t-dim">아직 선택한 적 증강이 없습니다.</p>`}</section>`;}

/** 기본 증강 (custom options defaultAllyAugments / defaultEnemyAugments, m.public defaultAugments): active from the first battle. */
export function DefaultAugments({pub}){
 const d=pub.defaultAugments||{allies:[],enemies:[]};
 const card=(a,scope)=>html`<article class="enemy-augment" style=${{'--augment-color':AUGMENT_GRADES[a.grade]?.color}}><${Img} src=${a.iconBond?bondIconUrl(data.get('assets'),a.iconBond):a.icon}/><div><small>${AUGMENT_GRADES[a.grade]?.name} · ${scope}</small><h4>${a.name}</h4><${RichText} as="p" text=${formatAugmentDescription(a.description)}/></div></article>`;
 return html`<section class="enemy-augments"><p class="t-dim">커스텀 설정으로 첫 전투부터 적용되는 증강입니다.</p>
  ${d.allies?.length?html`<h3><${Icon} name="bolt"/> 아군 증강</h3>${d.allies.map(a=>card(a,'모든 참가자에게 적용'))}`:null}
  ${d.enemies?.length?html`<h3><${Icon} name="shield"/> 적 증강</h3>${d.enemies.map(a=>card(a,'모든 적에게 적용'))}`:null}
 </section>`;
}
