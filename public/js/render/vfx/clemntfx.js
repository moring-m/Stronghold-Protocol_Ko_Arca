// 克莱门莎 S2 风暴潮 (op-clemnt.js): the floating exile cabin and the vortex it leaves are the official
// clemnt_skill_02_bullet_* prefabs her S2's EmitProjectile ability fires — not referenced by the skill data, so the
// used-set extraction missed them (CN 2.7.81, 2026-10-26). The kit's 'anchor' event moves the cabin from its tile
// three tiles forward, 'tide' opens the vortex where it stopped for the rest of the skill.
// [ASSUMED] bullet_01 (side view) carries the cabin left / right, bullet_02 (front view) up / down: the client's
// choice between them lives in code the extraction does not read.
const CABIN_SIDE = 'clemnt_skill_02_bullet_01', CABIN_FRONT = 'clemnt_skill_02_bullet_02', VORTEX = 'clemnt_skill_02_bullet_range_01';

export class ClemntFx {
  constructor(w) { this.w = w; this.live = new Map(); }

  simFx(kind, x, y, extra, owner) {
    if (!this.w.ofx.active || extra?.skill !== 'clemnt:cabin' || (kind !== 'anchor' && kind !== 'tide')) return false;
    const lib = this.w.ofx.lib, now = this.w.ofx.time, dur = Math.max(0.01, Number(extra.dur) || 0.01);
    if (kind === 'anchor') {
      const sx = Number(extra.fromX), sy = Number(extra.fromY);
      if (!Number.isFinite(sx) || !Number.isFinite(sy)) return false;
      const dc = x - sx, dr = y - sy, side = Math.abs(dc) >= Math.abs(dr), key = side ? CABIN_SIDE : CABIN_FRONT;
      if (!lib.has(key)) return false;
      this._stop(`cabin:${extra.id}`);
      const cabin = { at: now, until: now + dur };
      cabin.handle = this.w.ofx.spawn(key, { pos: [sx - 10, sy - 9, 0], groundZ: 0, rootRot: [0, 0, 0, 1] }, { loop: true, important: true, owner, track: (fx) => {
        const k = Math.max(0, Math.min(1, (this.w.ofx.time - cabin.at) / dur));
        fx.anchor[0] = sx - 10 + dc * k; fx.anchor[1] = sy - 9 + dr * k; fx.anchor[2] = 0; fx.groundZ = 0;
        fx.yaw = side && dc < 0 ? Math.PI : 0; fx.pitch = 0;
      } });
      if (!cabin.handle) return false;
      this.live.set(`cabin:${extra.id}`, cabin);
      return true;
    }
    if (!lib.has(VORTEX)) return false;
    this._stop(`cabin:${extra.id}`);
    this._stop(`vortex:${extra.id}`);
    const handle = this.w.ofx.spawn(VORTEX, { pos: [x - 10, y - 9, 0], groundZ: 0, rootRot: [0, 0, 0, 1] }, { loop: true, important: true, owner });
    if (!handle) return false;
    this.live.set(`vortex:${extra.id}`, { handle, until: now + dur });
    return true;
  }

  /** The skill ended (or its unit left): the vortex ends with it. */
  skillOff(id) { this._stop(`cabin:${id}`); this._stop(`vortex:${id}`); }

  _stop(slot) { const e = this.live.get(slot); if (e) { e.handle.stop(); this.live.delete(slot); } }

  tick() { for (const [slot, e] of this.live) if (!this.w.ofx.active || this.w.ofx.time >= e.until) { e.handle.stop(); this.live.delete(slot); } }

  clear() { for (const e of this.live.values()) e.handle.stop(); this.live.clear(); }
}
