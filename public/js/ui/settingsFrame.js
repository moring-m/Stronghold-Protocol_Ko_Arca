import { useEffect, useRef, useState } from '../../vendor/hooks.module.js';
import { html, Button, Icon } from './components.js';
import { PresetFiles } from './presetFiles.js';
import { PresetLinkIcons } from './presetLinks.js';
import { data } from '../data.js';
import { tr } from '../i18n/i18n.js';
import { chatFaction } from '../../../shared/chat.js';

/** "염국 · 와파린" style summary of what a preset is linked to. */
const linkText = (p) => [chatFaction(p.faction)?.name, data.lookup('bands', p.strategy)?.name].filter(Boolean).map((n) => tr(n)).join(' · ');

/** Toggle rendered as a switch; keeps a real checkbox for forms, tests and screen readers. */
export function Switch({ checked, disabled, label, onChange }) {
  return html`<input type="checkbox" role="switch" class="ui-switch" aria-label=${label} checked=${!!checked} disabled=${disabled} onChange=${onChange}/>`;
}

/** Number field with -/+ buttons; the inner input keeps its aria-label for direct entry. */
export function Stepper({ value, min, max, step = 1, disabled, label, onChange }) {
  const clamp = (n) => Math.max(min ?? -Infinity, Math.min(max ?? Infinity, n));
  const bump = (dir) => onChange(clamp(Number(value || 0) + dir * step));
  return html`<span class=${`ui-stepper${disabled ? ' is-disabled' : ''}`}>
    <button type="button" aria-label=${label + ' 감소'} disabled=${disabled || value <= min} onClick=${(e) => { e.preventDefault(); bump(-1); }}>−</button>
    <input type="number" aria-label=${label} min=${min} max=${max} step=${step} value=${value} disabled=${disabled} onChange=${(e) => onChange(clamp(Number(e.target.value)))}/>
    <button type="button" aria-label=${label + ' 증가'} disabled=${disabled || value >= max} onClick=${(e) => { e.preventDefault(); bump(1); }}>+</button>
  </span>`;
}

/** Count chip for navigation entries; hidden while there is nothing to report. */
export function NavCount({ n, title }) {
  return n > 0 ? html`<span class="num" title=${title}>${n}</span>` : html`<span class="num is-empty" aria-hidden="true"></span>`;
}

export function ChangeCount({ count }) {
  return html`<span class=${`settings-change-count${count ? ' is-dirty' : ''}`} aria-live="polite">${count ? `변경 ${count}개` : '변경 없음'}</span>`;
}

/** Small dropdown attached to a trigger button; closes on outside click and Escape. */
export function MenuButton({ label, icon, disabled, class: cls = '', children }) {
  const [open, setOpen] = useState(false), ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const key = (e) => { if (e.key === 'Escape') { e.stopImmediatePropagation(); setOpen(false); } };
    document.addEventListener('pointerdown', away); document.addEventListener('keydown', key, true);
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', key, true); };
  }, [open]);
  return html`<span class=${`ui-menu ${cls}`} ref=${ref}>
    <${Button} variant="secondary" size="sm" icon=${icon} disabled=${disabled} aria-haspopup="menu" aria-expanded=${open} onClick=${() => setOpen(!open)}>${label} ▾<//>
    ${open ? html`<div class="ui-menu__pop" role="menu" onClick=${(e) => { if (e.target.closest('[data-close]')) setOpen(false); }}>${children}</div>` : null}
  </span>`;
}

/**
 * Shared preset list for favorites and recruit presets: select, create, rename,
 * duplicate and delete live in one place so both dialogs behave identically.
 */
export function PresetManager({ kind, state, presets, active, manifest, disabled, max = 30, createLabel = '새 프리셋', onSelect, onCreate, onDuplicate, onDelete, onImport }) {
  const [confirm, setConfirm] = useState(null);
  useEffect(() => setConfirm(null), [active]);
  const full = presets.length >= max;
  return html`<aside class="favorites-presets preset-manager">
    <div class="preset-manager__head"><h3>프리셋</h3><span class="preset-manager__count">${presets.length}/${max}</span></div>
    <${Button} icon="plus" disabled=${disabled || full} onClick=${onCreate}>${createLabel}<//>
    <${PresetFiles} kind=${kind} state=${state} disabled=${disabled} onImport=${onImport}/>
    <div class="favorites-preset-list" role="listbox" aria-label="프리셋 목록">${presets.map((x) => html`<div key=${x.id} class=${`preset-manager__row${active === x.id ? ' is-on' : ''}`}>
      <button type="button" role="option" class=${`favorites-preset ${active === x.id ? 'is-on' : ''}`} aria-pressed=${active === x.id} aria-selected=${active === x.id} onClick=${() => onSelect(x.id)}><strong class="preset-name-row"><span>${x.name}</span></strong>${linkText(x)?html`<small class="preset-manager__links" title=${linkText(x)}><${PresetLinkIcons} preset=${x} manifest=${manifest}/><span>${linkText(x)}</span></small>`:null}</button>
      ${active === x.id ? html`<span class="preset-manager__tools">
        <button type="button" class="preset-manager__tool" title="복제" aria-label=${x.name + ' 복제'} disabled=${disabled || full} onClick=${() => onDuplicate(x)}><${Icon} name="copy"/>복제</button>
        ${confirm === x.id
          ? html`<button type="button" class="preset-manager__tool is-danger is-confirm" aria-label=${x.name + ' 삭제 확인'} onClick=${() => { setConfirm(null); onDelete(x); }}>삭제 확인</button>`
          : html`<button type="button" class="preset-manager__tool is-danger" title="삭제" aria-label=${x.name + ' 삭제'} disabled=${disabled} onClick=${() => setConfirm(x.id)}><${Icon} name="close"/>삭제</button>`}
      </span>` : null}
    </div>`)}${!presets.length ? html`<p class="preset-manager__empty">저장된 프리셋이 없습니다.</p>` : null}</div>
  </aside>`;
}

/** Inline name field shown above the editor of the active preset. */
export function PresetNameField({ preset, label = '프리셋 이름', onRename }) {
  return html`<label class="preset-name-field"><${Icon} name="edit"/><input aria-label=${label} maxlength="40" value=${preset.name} onInput=${(e) => onRename(e.target.value)}/></label>`;
}
