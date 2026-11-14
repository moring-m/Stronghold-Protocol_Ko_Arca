// 커스텀 설정 for another season (규정, data/versions/<slug>/): only the categories that are plain data filters of that
// season's own tables. The 맹약 season's rule switches, stat multipliers, augments, added factions/maps and the random
// core-bond ban draw have no counterpart in the season's match code (server/match-upstream), so they are not offered.
//
//   bannedOperators  the operator never enters the shared pool (its chess records are hidden)
//   disabledBonds    the core bond is off in every mode (mode.inactiveBondIds): its operators leave the pool as in a draw
//   disabledStages   the map leaves every mode's stage list
//   disabledBosses   the boss leaves every mode's boss / hidden-boss weights
//   disabledBands    the strategy leaves the draft
import { customExtensionCatalog } from './customExtensions.js';

export const SEASON_EXTENSION_CATEGORIES = Object.freeze(['bannedOperators', 'disabledBonds', 'disabledStages', 'disabledBosses', 'disabledBands']);

const EMPTY = Object.freeze({ bonds: [], stages: [], rules: [] });

/** The season's catalogue: the same entry shapes as customExtensionCatalog, only the supported categories filled. */
export function seasonExtensionCatalog(raw = {}) {
  const full = customExtensionCatalog(raw);
  const out = {};
  for (const [k, v] of Object.entries(full)) out[k] = SEASON_EXTENSION_CATEGORIES.includes(k) ? v : [];
  return out;
}

/** A selection reduced to the season's categories and ids (unknown ids dropped). */
export function seasonExtensionSelection(value, raw = {}) {
  const cat = seasonExtensionCatalog(raw);
  const out = { ...EMPTY };
  for (const k of SEASON_EXTENSION_CATEGORIES) {
    const known = new Set((cat[k] || []).map((e) => e.id));
    const ids = Array.isArray(value?.[k]) ? value[k].filter((id) => known.has(id)) : [];
    out[k] = [...new Set(ids)];
  }
  return out;
}

/** The season's tables with the selection applied (a new object; `raw` is not changed). */
export function applySeasonExtensions(raw, sel) {
  if (!raw || !sel) return raw;
  const banned = new Set(sel.bannedOperators || []), bonds = new Set(sel.disabledBonds || []);
  const stages = new Set(sel.disabledStages || []), bosses = new Set(sel.disabledBosses || []), bands = new Set(sel.disabledBands || []);
  if (!banned.size && !bonds.size && !stages.size && !bosses.size && !bands.size) return raw;
  const chess = banned.size ? Object.fromEntries(Object.entries(raw.chess || {}).map(([id, c]) => [id, banned.has(id) ? { ...c, visible: false } : c])) : raw.chess;
  const dropKeys = (o, set) => (o && typeof o === 'object' ? Object.fromEntries(Object.entries(o).filter(([k]) => !set.has(k))) : o);
  const modes = Object.fromEntries(Object.entries(raw.config?.modes || {}).map(([id, m]) => [id, {
    ...m,
    ...(Array.isArray(m.stages) ? { stages: m.stages.filter((s) => !stages.has(s)) } : {}),
    ...(bonds.size ? { inactiveBondIds: [...new Set([...(m.inactiveBondIds || []), ...bonds])], ...(Array.isArray(m.activeBondIds) ? { activeBondIds: m.activeBondIds.filter((b) => !bonds.has(b)) } : {}) } : {}),
    ...(m.bossWeights ? { bossWeights: dropKeys(m.bossWeights, bosses) } : {}),
    ...(m.hiddenBossWeights ? { hiddenBossWeights: dropKeys(m.hiddenBossWeights, bosses) } : {}),
  }]));
  return { ...raw, chess, bands: dropKeys(raw.bands, bands), config: { ...raw.config, modes } };
}

/** Korean reasons a selection cannot start (empty when it can), per the room's mode type and difficulty. */
export function validateSeasonExtensions(raw, sel, { mode = 'coop', difficulty = 'NORMAL', modeId = null } = {}) {
  const data = applySeasonExtensions(raw, sel);
  const type = mode === 'solo' ? 'SINGLE' : 'MULTI';
  const modes = Object.entries(data.config?.modes || {}).filter(([id, m]) => (modeId ? id === modeId : m.type === type && m.difficulty === difficulty)).map(([, m]) => m);
  const errors = [];
  for (const m of modes) {
    if (!(m.stages || []).some((id) => data.stages?.[id])) errors.push('맵을 최소 1개 남겨야 합니다.');
    if (m.bossWeights && !Object.keys(m.bossWeights).length) errors.push('일반 보스를 최소 1개 남겨야 합니다.');
    if (m.hiddenBossWeights && m.hiddenRound && !Object.keys(m.hiddenBossWeights).length) errors.push('히든 보스를 최소 1개 남겨야 합니다.');
    const core = Object.entries(data.bonds || {}).filter(([id, b]) => b.isCore && Number(b.weight) > 0 && !(m.inactiveBondIds || []).includes(id));
    if (core.length < 5) errors.push('핵심 맹약을 최소 5개 남겨야 합니다.');
  }
  const bandCount = Object.keys(data.bands || {}).length;
  if (bandCount < (mode === 'solo' ? 1 : 4)) errors.push(`전략을 최소 ${mode === 'solo' ? 1 : 4}개 남겨야 합니다.`);
  return [...new Set(errors)];
}
