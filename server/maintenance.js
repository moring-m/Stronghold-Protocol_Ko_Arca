// Maintenance notice (점검 안내). The server owner sets it from the server machine (tools/maintenance.mjs → the
// release gateway's /__roll/admin/maintenance → every worker's /__release/maintenance). A worker keeps the notice,
// sends it to every connected page (`sys.maintenance`, and with every `welcome`), and posts system chat lines into
// every room 30 / 10 / 5 / 1 minutes before the start and at the start. The notice clears itself at its end.

export const MAINTENANCE_ALERT_MINUTES = Object.freeze([30, 10, 5, 1]);
export const MAINTENANCE_MESSAGE_MAX = 200;
const MINUTE = 60_000;
const MAX_AHEAD = 30 * 24 * 60 * MINUTE;
const MAX_LENGTH = 7 * 24 * 60 * MINUTE;

/** The system chat line of an alert (Korean source; the page translates it, public/i18n/<l>/fork.json). */
export function maintenanceAlertText(minutes) {
  return minutes > 0 ? `서버 점검이 ${minutes}분 후 시작됩니다.` : '서버 점검이 시작되었습니다.';
}

/**
 * Validate a notice from the admin request: { start, end, message } with start / end as epoch ms or a date string.
 * @returns {{ ok: true, notice: { id: string, start: number, end: number, message: string } } | { ok: false, error: string }}
 */
export function normalizeMaintenance(input, now = Date.now()) {
  if (!input || typeof input !== 'object') return { ok: false, error: 'Expected an object' };
  const time = (v) => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Date.parse(v) : NaN);
  const start = time(input.start), end = time(input.end);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return { ok: false, error: 'Invalid start or end' };
  if (end <= start) return { ok: false, error: 'End must be after start' };
  if (end <= now) return { ok: false, error: 'End is in the past' };
  if (start - now > MAX_AHEAD || end - start > MAX_LENGTH) return { ok: false, error: 'Too far ahead or too long' };
  const message = typeof input.message === 'string' ? input.message.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, MAINTENANCE_MESSAGE_MAX) : '';
  const s = Math.round(start), e = Math.round(end);
  return { ok: true, notice: { id: `${s}-${e}`, start: s, end: e, message } };
}

/**
 * One worker's notice.
 * @param {{ broadcast: (notice: object|null) => void, chat: (text: string, detail: string) => void, now?: () => number,
 *   setInterval?: typeof setInterval, clearInterval?: typeof clearInterval, tickMs?: number }} opts
 */
export class Maintenance {
  constructor({ broadcast, chat, now = Date.now, setInterval: si = globalThis.setInterval, clearInterval: ci = globalThis.clearInterval, tickMs = 5000 }) {
    this.broadcastNotice = broadcast;
    this.chat = chat;
    this.now = now;
    this.notice = null;
    this.sent = new Set();
    this._ci = ci;
    this.timer = si(() => this.tick(), tickMs);
    this.timer?.unref?.();
  }

  view() { return this.notice ? { ...this.notice } : null; }

  /** Set (or replace) the notice. Alerts whose time has already passed are not sent late. */
  set(input) {
    const r = normalizeMaintenance(input, this.now());
    if (!r.ok) return r;
    const same = this.notice && this.notice.id === r.notice.id;
    this.notice = r.notice;
    if (!same) {
      this.sent = new Set();
      const left = r.notice.start - this.now();
      for (const m of MAINTENANCE_ALERT_MINUTES) if (left < m * MINUTE - MINUTE) this.sent.add(m);
      if (left <= 0) this.sent.add(0);
    }
    this.broadcastNotice(this.view());
    this.tick();
    return { ok: true, notice: this.view() };
  }

  clear() {
    const had = !!this.notice;
    this.notice = null;
    this.sent = new Set();
    if (had) this.broadcastNotice(null);
    return { ok: true, notice: null };
  }

  tick() {
    const n = this.notice;
    if (!n) return;
    const now = this.now();
    if (now >= n.end) { this.clear(); return; }
    const left = n.start - now;
    if (left <= 0) {
      if (!this.sent.has(0)) { for (const m of MAINTENANCE_ALERT_MINUTES) this.sent.add(m); this.sent.add(0); this.chat(maintenanceAlertText(0), n.message); }
      return;
    }
    // the smallest threshold crossed; larger ones still unsent are skipped (one line per tick)
    const due = MAINTENANCE_ALERT_MINUTES.filter((m) => left <= m * MINUTE && !this.sent.has(m));
    if (!due.length) return;
    for (const m of due) this.sent.add(m);
    this.chat(maintenanceAlertText(Math.min(...due)), n.message);
  }

  close() { this._ci(this.timer); }
}
