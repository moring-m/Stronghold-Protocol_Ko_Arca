// 점검 안내 banner (global chrome, mounted once by main.js): the server's maintenance notice (server/maintenance.js —
// welcome.maintenance, sys.maintenance). Before the start: the time range and a countdown; during it: "점검 중" and the
// planned end. A player can close it; it comes back when the notice changes or the maintenance starts.

import { html, Icon, useTicker } from './components.js';
import { useState } from '../../vendor/hooks.module.js';
import { useStore } from '../store.js';
import { net } from '../net.js';
import { useDocClass } from './device.js';

/** A notice from the wire, or null when it is missing or malformed. */
export function maintenanceNotice(n) {
  if (!n || typeof n !== 'object' || !Number.isFinite(n.start) || !Number.isFinite(n.end) || n.end <= n.start) return null;
  return { id: typeof n.id === 'string' ? n.id : `${n.start}-${n.end}`, start: n.start, end: n.end, message: typeof n.message === 'string' ? n.message.slice(0, 200) : '' };
}

/** "H:MM:SS" (or "M:SS" under an hour) of a positive duration. */
export function countdownText(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const two = (v) => String(v).padStart(2, '0');
  return h > 0 ? `${h}:${two(m)}:${two(sec)}` : `${m}:${two(sec)}`;
}

const DISMISS_KEY = 'sp.maintenanceDismissed';
function readDismissed() { try { return localStorage.getItem(DISMISS_KEY) || ''; } catch { return ''; } }
function writeDismissed(v) { try { localStorage.setItem(DISMISS_KEY, v); } catch { /* private mode */ } }

const clock = (ms) => new Date(ms).toLocaleString(undefined, { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });

export function MaintenanceBanner() {
  const notice = useStore((s) => s.maintenance);
  const [dismissed, setDismissed] = useState(readDismissed);
  useTicker(notice ? 1000 : 0);
  const now = typeof net.serverNow === 'function' ? net.serverNow() : Date.now();
  const live = !!notice && now < notice.end;
  const started = live && now >= notice.start;
  const key = live ? `${notice.id}:${started ? 'on' : 'soon'}` : '';
  const visible = live && dismissed !== key;
  useDocClass('sp-maint', visible);
  if (!visible) return null;
  const close = () => { writeDismissed(key); setDismissed(key); };
  return html`<div class=${`maint-banner${started ? ' is-active' : ''}`} role="status">
    <${Icon} name="warn" />
    <strong>${started ? '점검 중' : '점검 예정'}</strong>
    <span class="maint-banner__time" data-i18n-skip>${clock(notice.start)} – ${clock(notice.end)}</span>
    ${started ? null : html`<span class="maint-banner__left"><span>시작까지</span> <b data-i18n-skip>${countdownText(notice.start - now)}</b></span>`}
    ${notice.message ? html`<span class="maint-banner__msg" data-i18n-skip>${notice.message}</span>` : null}
    <button type="button" class="maint-banner__close" aria-label="점검 안내 닫기" onClick=${close}><${Icon} name="close" /></button>
  </div>`;
}
