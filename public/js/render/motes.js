// Civilight Eterna's official C_Eff_Moire_B attachment, rendered as a small sprite ring.
// The client normally activates these initially empty Spine slots from battle logic.
// Only visuals live here; slot availability, collisions, healing and damage stay in the simulation.
// Orbit: 30 degrees/second, 1.15 tiles normally and 2 tiles during S2.
export const MOTE_MAX = 9;
/**
 * 一圈用多少秒：官方 `talents.bb.dynamic_spd` = 30 度/秒（隐藏五星的同一组参数，维护者评审确认），360 / 30 = 12 秒。
 * S2 黑板里的 `dynamic_spd: 0.9` 含义不明，这里不采用（[ASSUMED]）。
 */
export const MOTE_PERIOD = 12;
/** 一格 = 多少骨架单位（`render/style.js` UNIT.modelScale = 1 / 320，干员的模型就按它画）。 */
export const MOTE_SKELETON_PER_TILE = 320;
/** 环绕半径（格）：T1 的 `range_radius` 与 S2 的 `outside_radius`。 */
export const MOTE_ORBIT_TILES = Object.freeze({ normal: 1.15, wide: 2 });
/** 环绕半径（骨架单位：环挂在她的 spine 容器里，坐标与模型同一套）。 */
export const MOTE_ORBIT = Object.freeze({ normal: MOTE_ORBIT_TILES.normal * MOTE_SKELETON_PER_TILE, wide: MOTE_ORBIT_TILES.wide * MOTE_SKELETON_PER_TILE });
/** 官方微尘的区域（`C_Eff_Moire_B`）与它在她身上的高度（骨架单位，y 从脚下算起）。 */
export const MOTE_ART = Object.freeze({ slot: 'C_Eff_Moire_B', name: 'C_Eff_Moire_B', w: 121, h: 172, y: 168 });

/** Orbit radius of one mote (skeleton units). */
export const moteOrbitRadius = (wide) => (wide ? MOTE_ORBIT.wide : MOTE_ORBIT.normal);

/**
 * Offsets of the motes of one frame, relative to the unit's feet origin (skeleton units, y up): `n` motes share the
 * circle evenly, the whole ring turned by `phase` radians.
 * @param {number} n mote count
 * @param {number} phase radians
 * @param {number|boolean} wide S2's wider radius
 * @returns {Array<[number, number]>}
 */
export function moteOffsets(n, phase = 0, wide = 0) {
  const k = Math.max(0, Math.min(MOTE_MAX, Math.floor(Number(n) || 0)));
  const r = moteOrbitRadius(wide);
  const out = [];
  for (let i = 0; i < k; i++) {
    const a = phase + (i * Math.PI * 2) / k;
    out.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return out;
}

/**
 * The ring of motes around one unit: `n` sprites of the official `C_Eff_Moire_B` region, evenly spread and turning.
 * Lives beside the skeleton (the caller copies its model scale/facing) and is driven from
 * the simulation's `moteState` event; without a texture it still draws the ring (an empty sprite shows nothing, the units.js
 * caller can pass a procedural fallback instead).
 */
export class MoteRing {
  /**
   * @param {{ PIXI: any, getTexture?: (() => any)|null, fallback?: boolean }} opts `getTexture` = the official region,
   *   asked for lazily (once) — null keeps whatever the sprites already have
   */
  constructor({ PIXI, getTexture = null, fallback = false } = {}) {
    this.P = PIXI;
    this.getTexture = getTexture;
    this.fallback = !!fallback;
    this.root = new PIXI.Container();
    this.root.label = 'motes';
    this.sprites = [];
    this.texture = null;
    this.n = 0;
    this.wide = 0;
    this.phase = 0;
  }

  /** Mote count / radius mode of this frame (`n` = 0 hides the ring). */
  setState(n, wide = 0) {
    const want = Math.max(0, Math.min(MOTE_MAX, Math.floor(Number(n) || 0)));
    this.wide = wide ? 1 : 0;
    if (want !== this.n) { this.n = want; this._resize(); }
    this._texture();
    this._place();
  }

  /** Advance the orbit (`dt` seconds) — the caller only draws, the phase lives here. */
  update(dt) {
    if (!(this.n > 0) || !(dt > 0)) return;
    const turn = (Math.PI * 2) / MOTE_PERIOD;
    this.phase = (this.phase + dt * turn) % (Math.PI * 2);
    this._place();
  }

  /** The official texture, asked for once; the empty texture keeps a sprite valid when there is none. */
  _texture() {
    if (this.texture) return this.texture;
    const t = this.getTexture ? this.getTexture() : null;
    if (t) {
      this.texture = t;
      for (const s of this.sprites) {
        s.texture = t;
        if (!this.fallback) { s.width = MOTE_ART.w; s.height = MOTE_ART.h; }
      }
    }
    return this.texture || this.P.Texture.EMPTY;
  }

  _resize() {
    this._texture();
    while (this.sprites.length < this.n) {
      const s = new this.P.Sprite(this.texture || this.P.Texture.EMPTY);
      if (!this.fallback) { s.width = MOTE_ART.w; s.height = MOTE_ART.h; }
      this.sprites.push(s);
      this.root.addChild(s);
    }
    while (this.sprites.length > this.n) {
      const s = this.sprites.pop();
      try { this.root.removeChild(s); } catch { /* ignore */ }
      try { s.destroy?.(); } catch { /* ignore */ }
    }
  }

  _place() {
    const pts = moteOffsets(this.n, this.phase, this.wide);
    for (let i = 0; i < this.n; i++) {
      const s = this.sprites[i];
      if (!s) continue;
      s.position.set(pts[i][0], -(pts[i][1] + MOTE_ART.y)); // Spine display coordinates have y down.
      s.rotation = 0;                    // the motes stay upright while the ring turns
      s.alpha = 1;
    }
  }

  get visible() { return this.n > 0; }

  destroy() {
    for (const s of this.sprites) { try { s.destroy?.(); } catch { /* ignore */ } }
    this.sprites = [];
    this.n = 0;
    try { this.root.destroy?.({ children: true }); } catch { /* ignore */ }
  }
}
