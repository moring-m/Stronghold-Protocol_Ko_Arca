


import { atPotential } from '../../../shared/potential.js';
import {diyTokenOwner} from '../../../shared/diy.js';
const posIntOr=(v,d)=>Number.isInteger(v)&&v>0?v:d;
const isObj=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
export function diyGameData(gd, records) {
  const view = Object.create(gd);
  const backups = isObj(gd.raw && gd.raw.backups) ? gd.raw.backups : null;
  const diyTokens = backups && isObj(backups.tokens) ? backups.tokens : {};
  const tokenOf = (id) => (typeof id === 'string' && Object.hasOwn(diyTokens, id) && isObj(diyTokens[id]) ? diyTokens[id] : null);
  Object.defineProperties(view, {
    /** the match's own GameData (the view is per player) */
    matchData: { value: gd },
    chess: { value: (id) => (typeof id === 'string' && records.has(id) ? records.get(id) : gd.chess(id)) },
    token: { value: (id) => gd.token(id) || tokenOf(id) },
    /**
     * GameData.placeableTokens for a slotted slot: the summons its record lists (the pick's skill and talents) that are
     * placeable, by the variant of the owner form (`bySkill[skillIndex]` sources) — the deploy limit as the count (PRTS
     * 卫戍协议/帮助 "根据召唤物部署数量上限（非初始持有量）"), the active module's own when its variant has one (`byModule`:
     * 望's TRP-X "可同时部署的陷阱数量提升", 6 → 7 棋子; SUM-Y stage 2+ 4 drones / summons). The data's deploy limit holds the
     * token's own talent additions (tools/build-data.mjs tokenTalentDeckBonus, 0.2.0): 麦哲伦 / 令 / 电弧 3, 白铁 2, 夜莺 3 幻影 —
     * at the owner's potential (`loadout.potential`, PlayerState.loadoutFor; 0.2.2: 望's 棋子 6 below 潜能3, 7 from it).
     */
    placeableTokens: {
      value: (chessId, loadout = null) => {
        const rec = typeof chessId === 'string' && records.has(chessId) ? records.get(chessId) : null;
        if (!rec) return gd.placeableTokens(chessId, loadout);
        const owner = diyTokenOwner(rec.charId, rec.status);
        const out = [];
        for (const tid of Array.isArray(rec.tokens) ? rec.tokens : []) {
          const t = tokenOf(tid);
          if (!t || t.kind !== 'summon' || t.placeable !== true) continue;
          const v = isObj(t.variants) ? atPotential(t.variants[owner] ?? null, loadout?.potential) : null;
          if (v) {
            const alt = loadout && Number.isInteger(loadout.skillIndex) && v.bySkill ? v.bySkill[loadout.skillIndex] : null;
            const src = Array.isArray(alt?.sources) ? alt.sources : Array.isArray(v.sources) ? v.sources : [];
            if (!src.includes('talent') && !src.includes('skill')) continue;
          }
          const mid = rec.module && rec.module.active ? rec.module.id : null;
          const vm = v && mid && isObj(v.byModule) ? v.byModule[mid] ?? null : null;
          out.push({ tokenId: tid, count: Math.min(posIntOr(vm?.stats?.deployLimit, posIntOr(v?.stats?.deployLimit, posIntOr(t.deployLimit, 1))), 9) });
        }
        return out;
      },
    },
  });
  return view;
}

export class PlayerDiy {
  /**
   * Fix the 自选 picks for the match (see the header): the seat's picks re-checked against this match's data and kits;
   * a slot whose record cannot be composed is left empty. With picks, `this.gd` becomes the player's data view.
   * @param {any} picks `{ [slotBaseId]: { charId, skillIndex?, uniEquipId? } | null }`
   * @param {{ kitted?: Iterable<string> }} [opts] the operators with a kit (default: the registry's KITTED_CHARS; tests may
   *   widen it to slot an operator whose kit is still being written)
   * @returns {boolean} false when the picks are malformed (nothing changes) or the player is a bot
   */
  setDiy(picks, { kitted = KITTED_CHARS } = {}) {
    if (this.isBot) return false;
    const gd = this.m.gd;
    const data = gd.raw;
    const res = checkDiyPicks(picks, { data, kitted });
    if (!res || !('ok' in res)) {
      this.m.log?.warn?.(`[match ${this.m.roomCode}] 自选 picks of ${this.playerId} ignored: ${res && res.detail}`);
      return false;
    }
    const kept = {};
    const records = new Map();
    for (const [slotId, pick] of Object.entries(res.picks)) {
      const slot = diySlot(slotId, data);
      let normal;
      let golden;
      try {
        normal = diyRecord(slotId, pick, { elite: false, data });
        golden = diyRecord(slotId, pick, { elite: true, data });
      } catch { normal = null; golden = null; }
      if (!slot || !normal || !golden) continue;
      records.set(slot.baseId, Object.freeze(normal));
      records.set(slot.goldenId, Object.freeze(golden));
      kept[slot.baseId] = Object.freeze({ charId: pick.charId, skillIndex: pick.skillIndex, uniEquipId: pick.uniEquipId ?? null });
    }
    this.diy = Object.freeze(kept);
    this._diyRecords = records;
    this.gd = records.size ? diyGameData(gd, records) : gd;
    return true;
  }

  /**
   * The stock of each slotted DIY piece (see the header), once the match has drawn its bans: `off` = the bonds switched
   * off this match (drawn + the mode's static list). A piece all of whose bonds are off gets none (`diyBanned`).
   * @param {Set<string>} off
   */
  initDiyStock(off = new Set()) {
    const { stock, banned } = this.buildDiyStock(off);
    this.diyStock = stock;
    this.diyBanned = banned;
  }

  /** Prepare stock without mutating this player, so setup rerolls can commit all players together. */
  buildDiyStock(off = new Set()) {
    const stock = new DiyStock();
    const banned = [];
    const gd = this.m.gd;
    for (const slotId of Object.keys(this.diy || {})) {
      const rec = this._diyRecords.get(slotId);
      const slot = diySlot(slotId, gd.raw);
      if (!rec || !slot) continue;
      const bonds = Array.isArray(rec.bonds) ? rec.bonds : [];
      if (bonds.length > 0 && bonds.every((b) => off.has(b))) { banned.push(slotId); continue; }
      const cap = gd.poolCopies(slotId);
      if (!(cap > 0)) continue;
      stock.entries.set(slotId, { cap, left: cap, tier: gd.tierOf(slotId), shopLevel: slot.shopLevel });
    }
    return { stock, banned: Object.freeze(banned) };
  }

  /** The copy accounting of base chess `baseId` for this player: its own stock for a slotted DIY slot, else the shared pool. */
  poolOf(baseId) {
    return this.diyStock && this.diyStock.has(baseId) ? this.diyStock : this.m.pool;
  }

  /**
   * The stock entries this player's ordinary shop draws from now ([baseId, entry] with copies left and the 调度中心 at
   * the slot's shopLevel), or null (none — the shared pool's roll alone, exactly as without picks). The promotion
   * reward does not use this gate (`diyStockEntries`).
   * @returns {Array<[string, { cap: number, left: number, tier: number, shopLevel: number }]> | null}
   */
  diyRollEntries() {
    if (!this.diyStock || !this.diyStock.entries.size) return null;
    const out = [];
    for (const [id, e] of this.diyStock.entries) if (e.left > 0 && this.shop.level >= e.shopLevel) out.push([id, e]);
    return out.length ? out : null;
  }

  /**
   * The stock entries a random grant, and the promotion reward's temporary refresh, draw besides the shared pool
   * (see the header): every slotted piece with copies left, whatever the 调度中心 level (the roll's own tier rules
   * apply), or null (none).
   * @returns {Array<[string, { cap: number, left: number, tier: number, shopLevel: number }]> | null}
   */
  diyStockEntries() {
    if (!this.diyStock || !this.diyStock.entries.size) return null;
    const out = [...this.diyStock.entries].filter(([, e]) => e.left > 0);
    return out.length ? out : null;
  }

  /**
   * The 自选 pick a chess id (normal or elite) of this player fields — its slot's — or null (not a slotted slot).
   * @param {string} id
   * @returns {{ charId: string, skillIndex: number, uniEquipId: string|null } | null}
   */
  diyPickOf(id) {
    const rec = this._diyRecords && typeof id === 'string' ? this._diyRecords.get(id) : null;
    return rec ? this.diy[rec.diyFor] ?? null : null;
  }
}
