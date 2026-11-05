// public/dev/frame-stats.js — frame-time figures for the battle perf page (battle-perf.js) and tools/perfbench.mjs.

/** `x` rounded to `d` decimals (default 1). */
export function round(x, d = 1) {
  const k = 10 ** d;
  return Number.isFinite(x) ? Math.round(x * k) / k : null;
}

/**
 * Figures over a run of frame times (ms): average fps, P50 / P95 / P99 frame time, the worst frame and the share (%) of
 * frames over `stutterMs` (a stutter frame).
 * @param {number[]} deltas frame times in ms
 * @param {number} stutterMs
 */
export function frameFigures(deltas, stutterMs) {
  const n = deltas.length;
  if (!n) return { frames: 0, fps: 0, p50: null, p95: null, p99: null, worst: null, over33: 0 };
  const sorted = deltas.slice().sort((a, b) => a - b);
  const pct = (p) => sorted[Math.min(n - 1, Math.max(0, Math.ceil(p * n) - 1))];
  const total = deltas.reduce((a, b) => a + b, 0);
  return {
    frames: n,
    fps: round(total > 0 ? (n * 1000) / total : 0),
    p50: round(pct(0.5)), p95: round(pct(0.95)), p99: round(pct(0.99)), worst: round(sorted[n - 1]),
    over33: round((100 * deltas.filter((d) => d > stutterMs).length) / n),
  };
}
