import { useEffect, useState } from '../../vendor/hooks.module.js';
import { html, Icon } from './components.js';
import { Img } from './gameComponents.js';
import { data, localAsset } from '../data.js';
import { useStore } from '../store.js';
import { loadoutStore, openLoadout } from './loadoutSync.js';
import { changedCount } from './loadoutModel.js';
const cx=(...parts)=>parts.flat().filter(Boolean).join(' ');
export function badgeCount(entries, getChess) {
  return getChess ? changedCount(entries, getChess) : Object.keys(entries || {}).length;
}
export function LoadoutButton({ from, size = 'md', variant = 'secondary', class: cls, label = '干员调配', disabled = false }) {
  const [,setRevision]=useState(0);
  useEffect(()=>data.subscribe(()=>setRevision(n=>n+1)),[]); // Observe data loaded elsewhere; never fetch a roster for the entry button.
  const entries = useStore((s) => s.entries, Object.is, loadoutStore);
  const n = badgeCount(entries, data.status('chess') === 'ready' ? (id) => data.lookup('chess', id) : null);
  return html`<button type="button" class=${cx('btn', `btn--${variant}`, `btn--${size}`, 'lo-entry', cls)} data-testid="loadout-open" disabled=${disabled}
      onClick=${() => openLoadout(from)} title="调整干员携带的技能与模组">
    <${Img} src=${localAsset('ui/outer', 'operator_preset')} class="lo-entry__icon" fallback=${html`<${Icon} name="edit" class="btn__icon" />`} />
    <span class="btn__label">${label}</span>
    ${n ? html`<span class="lo-entry__n num" aria-label=${`${n} 名干员已调整`}>${n}</span>` : null}
  </button>`;
}
