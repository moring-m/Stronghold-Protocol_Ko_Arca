// logCapture.js — the page's recent console warnings / errors and uncaught errors, kept for 인게임 버그 제보
// (ui/bugReport.js). Installed first thing by main.js so early failures are kept too; the console works as before.

const MAX_LINES = 300;
const MAX_LINE = 1200;
/** @type {string[]} the newest last */
const lines = [];
let installed = false;

function textOf(a) {
  if (a instanceof Error) return a.stack || a.message || String(a);
  if (typeof a === 'string') return a;
  try { return JSON.stringify(a); } catch { return String(a); }
}
function push(level, args) {
  const at = new Date().toISOString().slice(11, 23);
  let s;
  try { s = `${at} ${level} ${Array.from(args, textOf).join(' ')}`; } catch { s = `${at} ${level} (unprintable)`; }
  lines.push(s.length > MAX_LINE ? s.slice(0, MAX_LINE - 1) + '…' : s);
  if (lines.length > MAX_LINES) lines.splice(0, lines.length - MAX_LINES);
}

/** Keep the last console warnings / errors and uncaught errors of this page (once; the console keeps working). */
export function installLogCapture(target = globalThis) {
  if (installed || !target?.console) return;
  installed = true;
  for (const level of ['warn', 'error']) {
    const orig = target.console[level]?.bind(target.console);
    if (!orig) continue;
    target.console[level] = (...args) => { push(level.toUpperCase(), args); orig(...args); };
  }
  target.addEventListener?.('error', (e) => push('UNCAUGHT', [e?.error || e?.message || 'error', e?.filename ? `@${e.filename}:${e.lineno}` : '']));
  target.addEventListener?.('unhandledrejection', (e) => push('REJECTION', [e?.reason ?? 'rejection']));
}

/** The captured lines (a copy). */
export const capturedLogs = () => lines.slice();
/** Tests only. */
export function _resetLogCapture() { lines.length = 0; }

