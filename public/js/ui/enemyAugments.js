import { html, Icon } from './components.js';
import { Img, RichText } from './gameComponents.js';
import { data } from '../data.js';
import { bondIconUrl } from './assetUrls.js';
import { AUGMENT_GRADES } from '../../../shared/augments.js';
export function EnemyAugments({pub}){const cards=pub.augments?.selectedEnemies||[];return html`<section class="enemy-augments"><h3><${Icon} name="shield"/> 적 증강</h3>${cards.length?cards.map(a=>html`<article class="enemy-augment" style=${{'--augment-color':AUGMENT_GRADES[a.grade]?.color}}><${Img} src=${a.iconBond?bondIconUrl(data.get('assets'),a.iconBond):a.icon}/><div><small>${AUGMENT_GRADES[a.grade]?.name} · 모든 적에게 적용</small><h4>${a.name}</h4><${RichText} as="p" text=${a.description}/></div></article>`):html`<p class="t-dim">아직 선택한 적 증강이 없습니다.</p>`}</section>`;}
