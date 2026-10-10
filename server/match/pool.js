// server/match/pool.js — the SHARED chess pool (copies per base chess, across all players), per-match bans,
// copy-weighted shop rolls (research 00-INDEX §3, §6; DESIGN §6.2).
//
// Model:
//   * Every visible (non-hidden, non-DIY) base chess that is not banned this match has `cap` copies
//     (config.economy.poolCopies[tier], overrides e.g. 缪尔赛思 4). `left[baseId]` = copies not owned by anyone.
//   * Owning a piece takes copies: a normal piece holds 1, an elite holds 3 (merge of 3 normals). Shop displays
//     do NOT reserve copies; buying fails (SOLD_OUT) when left = 0.
//   * Pieces remember how many copies they hold (`piece.poolCopies`), so selling / elimination / temp wipes return
//     exactly what was taken — chess granted by effects while the pool is empty (or hidden/banned chess) hold 0.
//   * Invariant (tests): 0 ≤ left ≤ cap and left + Σ held copies == cap for every base chess.
//
// Rolls: each chess slot draws ONE copy uniformly from all remaining copies of eligible chess with tier ≤ shop level
// ("copy-weighted"; duplicates within a roll allowed). The item slot picks a tier with the same tier shares, then a
// uniform shop-eligible item of that tier (falling back to lower tiers).

/**
 * Per-match disabled bond set D and banned chess (research 01 A2): D = uniform sample of `core` core bonds and `addon`
 * add-on bonds among weight > 0 bonds that are active in the mode. A visible chess is banned iff every one of its
 * bonds is in D ∪ mode.inactiveBondIds.
 * @param {import('./gamedata.js').GameData} gd
 * @param {Function} rng seeded rng (createRng)
 * @returns {{ drawn: string[], staticOff: string[], banned: string[] }}
 */
export function drawDisabledBonds(gd, rng, policy = {}) {
  const { core: nCore, addon: nAddon } = gd.bans(gd.difficulty);
  const staticOff = [...gd.modeInactiveBonds].filter((b) => gd.bond(b)).sort();
  const eligible = gd.bondIds.filter((b) => {
    const bond = gd.bond(b);
    return bond && Number(bond.weight) > 0 && !gd.modeInactiveBonds.has(b);
  });
  const core = eligible.filter((b) => gd.bond(b).isCore);
  const addon = eligible.filter((b) => !gd.bond(b).isCore);
  const extraCore = core.includes('ursusShip') ? 1 : 0;
  const forced = core.filter(id=>(policy.forcedBonds||[]).includes(id));
  const protectedIds = new Set(policy.protectedBonds||[]);
  const quota = Math.min(Math.max(nCore + extraCore,forced.length),Math.max(0,core.length-5));
  const randomCore = core.filter(id=>!forced.includes(id)&&!protectedIds.has(id));
  const drawn = [...forced, ...sample(randomCore,Math.max(0,quota-forced.length),rng)].sort();
  const forcedAux=addon.filter(id=>(policy.forcedAuxBonds||[]).includes(id));
  const protectedAux=new Set(policy.protectedAuxBonds||[]);
  // Forced auxiliary bans can exceed the random quota; protected entries never enter it.
  const auxQuota=Math.min(Math.max(nAddon,forcedAux.length),addon.length);
  const auxDraw=[...forcedAux,...sample(addon.filter(id=>!forcedAux.includes(id)&&!protectedAux.has(id)),Math.max(0,auxQuota-forcedAux.length),rng)];
  drawn.push(...auxDraw);drawn.sort();
  const off = new Set([...drawn, ...staticOff]);
  const banned = [];
  for (const id of gd.visibleChess) {
    const c = gd.chess(id);
    const allBonds = Array.isArray(c.bonds) ? c.bonds : [];
    // Personal recruitment does not bypass core bans; auxiliary bonds cannot rescue a banned single-core recruit.
    const cores = c.optionalRecruit ? allBonds.filter(b => gd.bond(b)?.isCore) : [];
    const bonds = cores.length ? cores : allBonds;
    if (bonds.length > 0 && bonds.every((b) => off.has(b))) banned.push(id);
  }
  return { drawn, staticOff, banned };
}

function sample(arr, n, rng) {
  const a = arr.slice();
  rng.shuffle(a);
  return a.slice(0, Math.max(0, Math.min(n, a.length)));
}

export class SharedPool {
  /**
   * @param {import('./gamedata.js').GameData} gd
   * @param {{ banned?: Iterable<string> }} [opts]
   */
  constructor(gd, { banned = [] } = {}) {
    this.gd = gd;
    const ban = new Set(banned);
    /** @type {Map<string, { cap: number, left: number, tier: number }>} */
    this.entries = new Map();
    for (const id of gd.visibleChess) {
      if (ban.has(id) || gd.chess(id)?.optionalRecruit) continue;
      const cap = gd.poolCopies(id);
      if (cap <= 0) continue;
      this.entries.set(id, { cap, left: cap, tier: gd.tierOf(id) });
    }
    this.banned = [...ban].sort();
  }

  /** Whether a base chess is part of this match's pool (visible, not banned). */
  has(baseId) { return this.entries.has(baseId); }
  cap(baseId) { return this.entries.get(baseId)?.cap ?? 0; }
  left(baseId) { return this.entries.get(baseId)?.left ?? 0; }

  /** Take up to n copies; returns the number actually taken (0 when not in the pool / empty). */
  take(baseId, n = 1) {
    const e = this.entries.get(baseId);
    if (!e || !(n > 0)) return 0;
    const k = Math.min(e.left, Math.floor(n));
    e.left -= k;
    return k;
  }

  /** Return n copies (clamped at the cap). Returns the number actually returned. */
  give(baseId, n = 1) {
    const e = this.entries.get(baseId);
    if (!e || !(n > 0)) return 0;
    const k = Math.min(e.cap - e.left, Math.floor(n));
    e.left += k;
    return k;
  }

  /** Remaining copies of eligible chess (tier ≤ maxTier, or exactly `tier`). */
  _eligible({ maxTier = 6, tier = null, filter = null } = {}) {
    const out = [];
    for (const [id, e] of this.entries) {
      if (e.left <= 0) continue;
      if (tier != null ? e.tier !== tier : e.tier > maxTier) continue;
      if (!filter && this.gd.chess(id)?.optionalRecruit) continue;
      if (filter && !filter(id, e)) continue;
      out.push([id, e.left]);
    }
    return out;
  }

  /**
   * Copy-weighted roll: one copy uniformly among remaining copies of eligible chess. Returns a base id or null.
   * @param {Function} rng
   * @param {{ maxTier?: number, tier?: number|null, filter?: (id: string, e: object) => boolean }} [opts]
   */
  roll(rng, opts = {}) {
    const el = this._eligible(opts);
    let total = 0;
    for (const [, n] of el) total += n;
    if (total <= 0) return null;
    let r = rng() * total;
    for (const [id, n] of el) { r -= n; if (r < 0) return id; }
    return el[el.length - 1][0];
  }

  /** Tier shares of a copy-weighted roll at shop level `maxTier` (current remaining copies). */
  tierShares(maxTier) {
    const t = {};
    let total = 0;
    for (const [, e] of this.entries) {
      if (e.tier > maxTier || e.left <= 0) continue;
      t[e.tier] = (t[e.tier] || 0) + e.left;
      total += e.left;
    }
    const out = {};
    for (const k of Object.keys(t)) out[k] = total > 0 ? t[k] / total : 0;
    return out;
  }

  /**
   * Item roll for the shop's item slot: tier by the chess tier shares at this level, uniform item within the tier,
   * falling back to lower tiers when a tier has no item. Returns an item id or null.
   */
  rollItem(rng, maxTier) {
    const shares = this.tierShares(maxTier);
    const tiers = Object.keys(shares).map(Number).sort((a, b) => a - b);
    let tier = null;
    if (tiers.length) {
      let r = rng();
      for (const t of tiers) { r -= shares[t]; if (r < 0) { tier = t; break; } }
      if (tier == null) tier = tiers[tiers.length - 1];
    } else {
      tier = 1 + Math.floor(rng() * Math.max(1, maxTier));
    }
    for (let t = tier; t >= 1; t--) {
      const list = this.gd.shopItemsByTier[t];
      if (list && list.length) return list[Math.floor(rng() * list.length)];
    }
    for (let t = tier + 1; t <= 6; t++) {
      const list = this.gd.shopItemsByTier[t];
      if (list && list.length) return list[Math.floor(rng() * list.length)];
    }
    return null;
  }

  /** { baseId: left } snapshot (tests / diagnostics). */
  snapshot() {
    const o = {};
    for (const [id, e] of this.entries) o[id] = e.left;
    return o;
  }

  totalLeft() {
    let n = 0;
    for (const e of this.entries.values()) n += e.left;
    return n;
  }
}

/** Standard copies share their entries with the match; optional recruits have independent per-player stock. */
export class RecruitPool extends SharedPool {
 constructor(shared, player){
  super(player.gd);this.entries=new Map(shared.entries);this.banned=shared.banned;
  this.personal=new Map();this.player=player;
 }
 sync(){
  for(const id of this.player.gd.visibleChess){const c=this.player.gd.chess(id);if(!c?.optionalRecruit)continue;
   if(!this.player.canRecruit(id)){this.entries.delete(id);continue;}
   if(!this.personal.has(id)){const cap=this.player.gd.poolCopies(id);this.personal.set(id,{cap,left:cap,tier:c.tier});}
   this.entries.set(id,this.personal.get(id));
  }
  return this;
 }
}
