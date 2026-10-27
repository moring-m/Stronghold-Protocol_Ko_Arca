// 谬因 (char_4229_aphris, op-aphris.js): her attacks and S2 beam run along a path — straight ahead from her tile, turned
// by each of her 中继器 (token_10070_aphris_pc) it reaches (and, for the S2 beam, by every allied operator). The official
// AphrisEffectEmitter draws it from four prefabs: a line along the path (_lineEffectKey), a point at her
// (_startPointEffectKey), one on every 中继器 it passes (_waypointEffectKey) and one at its end (_endPointEffectKey).
// The sim keeps the path to itself (her range grid), so the client follows the same rule from the board it shows
// (op-aphris.js aphrisPath; her reach: the farthest forward tile of her data range grid, +2 per 中继器).
// [ASSUMED] the line is one segment per straight run; an attack's path shows ATTACK_S (the client draws it
// progressively over the attack clip); the waypoint point sits at the emitter's fixed height.
import { unitPoint } from './mounts.js';

const RELAY = 'token_10070_aphris_pc', APHRIS = 'char_4229_aphris', S2 = 'skchr_aphris_2';
const RELAY_REACH = 2, ATTACK_S = 0.5, BEAM_REFRESH_S = 0.25;
const ROWS = 19, COLS = 21;
const DIR = { UP: [1, 0], RIGHT: [0, 1], DOWN: [-1, 0], LEFT: [0, -1] };
const S2_KEYS = { line: 'aphris_skill_02_line_01', start: 'aphris_skill_02_start_01', waypoint: 'token_aphris_pc_skill_02_buff_01', end: 'aphris_skill_02_line_point_01', height: 0.65 };

const tileOf = (v) => [Math.round(v.y), Math.round(v.x)];
const idOf = (v) => v?.id ?? v?.info?.id;
const isRelayOf = (t, owner) => !!t && t.alive !== false && (t.info?.defId === RELAY || t.info?.spine === RELAY) && t.info?.ownerId === idOf(owner);

/** The emitter's keys (index modes[].attack.emitters[] AphrisEffectEmitter). */
export function pathKeys(em) {
  if (!em || em.class !== 'AphrisEffectEmitter') return null;
  return { line: em.lineEffectKey, start: em.startPointEffectKey, waypoint: em.waypointEffectKey, end: em.endPointEffectKey,
    height: em.waypointUseFixedHeight ? Number(em.waypointFixedHeight) || 0 : 0 };
}

/**
 * Her path over the shown board (op-aphris.js aphrisPath): tiles from her own in order, the indexes of the 中继器 tiles it
 * passed, the corners where it turned. `beam` (S2): no length limit, every allied operator turns it too.
 */
export function aphrisPath(unit, views, reach, bounds, beam = false) {
  const [r0, c0] = tileOf(unit);
  const at = new Map();
  for (const v of views) if (v !== unit && v.alive !== false && !v.prep) at.set(tileOf(v).join(','), v);
  const tiles = [[r0, c0]], seen = new Set([`${r0},${c0}`]), relays = [], corners = [0];
  let [dr, dc] = DIR[unit.dir] || DIR.RIGHT, r = r0, c = c0, left = beam ? Infinity : reach;
  while (left-- > 0) {
    const nr = r + dr, nc = c + dc, k = `${nr},${nc}`;
    if (nr < bounds.r0 || nr > bounds.r1 || nc < bounds.c0 || nc > bounds.c1 || seen.has(k)) break;
    seen.add(k); tiles.push([nr, nc]); r = nr; c = nc;
    const o = at.get(k);
    const turn = o && (isRelayOf(o, unit) || (beam && !o.isEnemy && o.info?.kind === 'op')) ? DIR[o.dir] || null : null;
    if (o && isRelayOf(o, unit)) { left += RELAY_REACH; relays.push(tiles.length - 1); }
    if (turn && (turn[0] !== dr || turn[1] !== dc)) { [dr, dc] = turn; corners.push(tiles.length - 1); }
  }
  if (corners[corners.length - 1] !== tiles.length - 1) corners.push(tiles.length - 1);
  return { tiles, relays, corners };
}

const ground = ([r, c], h = 0) => [c - 10, r - 9 + h * 0.866, -h * 0.5];

export class AphrisFx {
  constructor(w) { this.w = w; this.live = []; this.beams = new Map(); this.views = []; }

  sync(views) { this.views = views; }

  /** The S2 beam's prefabs, to preload with her other effects. */
  keys(views) { for (const v of views) if (this.w.unitKeyOf?.(v) === APHRIS) return [S2_KEYS.line, S2_KEYS.start, S2_KEYS.waypoint, S2_KEYS.end]; return []; }

  /** Her reach: the farthest forward tile of her record's range grid (5 at E2). */
  _reach(v) {
    const rec = this.w.opts?.record?.(v.info) || null, grid = rec?.rangeGrid || rec?.skill?.rangeGrid || null;
    let n = 0;
    for (const p of Array.isArray(grid) ? grid : []) if (Array.isArray(p) && p[0] === 0 && p[1] > n) n = p[1];
    return n || 5;
  }

  _bounds() {
    const f = this.w.ofx.ctx?.fieldRect?.();
    return f && Number.isFinite(f.r0) ? { r0: f.r0, r1: f.r1, c0: f.c0, c1: f.c1 } : { r0: 0, r1: ROWS - 1, c0: 0, c1: COLS - 1 };
  }

  /** Spawn the path's prefabs; returns their handles. */
  _draw(v, keys, path, loop) {
    const ofx = this.w.ofx, lib = ofx.lib, out = [], h = keys.height || 0;
    const opt = { loop, important: true };
    const put = (key, pos) => { if (key && lib.has(key)) { const x = ofx.spawn(key, { pos, groundZ: 0, rootRot: [0, 0, 0, 1] }, opt); if (x) out.push(x); } };
    const skin = this.w.skinOf?.(this.w.unitOf(v)), start = unitPoint(skin, 'hit', this.w.pose ? this.w.pose(v) : v);
    put(keys.start, start);
    // the line runs level at her muzzle height from her own tile, so a long or turned path stays straight on the board
    const g0 = ground(path.tiles[0]), dy = start[1] - g0[1], dz = start[2] - g0[2];
    const level = (t) => { const g = ground(t); g[1] += dy; g[2] += dz; return g; };
    const pts = path.corners.map((i) => level(path.tiles[i]));
    if (keys.line && lib.has(keys.line)) for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      const x = ofx.spawn(keys.line, { pos: a.slice(), groundZ: 0 }, { ...opt, track: (fx) => { fx.anchor[0] = a[0]; fx.anchor[1] = a[1]; fx.anchor[2] = a[2]; fx.linkLines(a, b); } });
      if (x) out.push(x);
    }
    for (const i of path.relays) put(keys.waypoint, ground(path.tiles[i], h));
    if (path.tiles.length > 1) put(keys.end, level(path.tiles[path.tiles.length - 1]));
    return out;
  }

  /** One attack of hers (wiring.attack with the mode's AphrisEffectEmitter): its path for ATTACK_S. */
  attack(v, em) {
    const keys = pathKeys(em);
    if (!keys || !this.w.ofx.active) return false;
    const path = aphrisPath(v, this.views, this._reach(v), this._bounds());
    const hs = this._draw(v, keys, path, false);
    if (hs.length) this.live.push({ hs, until: this.w.ofx.time + ATTACK_S });
    return hs.length > 0;
  }

  /** S2 临界瞬爆 on / off: the beam's path held while it lasts (redrawn when the board turns it elsewhere). */
  skill(v, on, skillId) {
    const id = idOf(v);
    if (!on) { this._stopBeam(id); return false; }
    if (skillId !== S2 || this.w.unitKeyOf?.(v) !== APHRIS) return false;
    this._stopBeam(id);
    this.beams.set(id, { v, sig: null, hs: [], next: 0 });
    this._beam(this.beams.get(id));
    return true;
  }

  _beam(b) {
    const path = aphrisPath(b.v, this.views, Infinity, this._bounds(), true), sig = `${b.v.dir}|${path.tiles.map((t) => t.join(',')).join(';')}`;
    b.next = this.w.ofx.time + BEAM_REFRESH_S;
    if (sig === b.sig) return;
    for (const h of b.hs) h.stop();
    b.sig = sig; b.hs = this._draw(b.v, S2_KEYS, path, true);
  }

  _stopBeam(id) { const b = this.beams.get(id); if (b) { for (const h of b.hs) h.stop(); this.beams.delete(id); } }

  release(v) { this._stopBeam(idOf(v)); }

  tick() {
    const now = this.w.ofx.time;
    this.live = this.live.filter((e) => { if (now < e.until && this.w.ofx.active) return true; for (const h of e.hs) h.stop(); return false; });
    for (const [id, b] of this.beams) {
      if (!this.w.ofx.active || b.v.destroyed || b.v.alive === false) { this._stopBeam(id); continue; }
      if (now >= b.next) this._beam(b);
    }
  }

  clear() { for (const e of this.live) for (const h of e.hs) h.stop(); this.live = []; for (const id of [...this.beams.keys()]) this._stopBeam(id); }
}
