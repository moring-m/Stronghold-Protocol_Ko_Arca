// 커스텀 설정 for another season (규정, data/versions/<slug>/): only the categories that are plain data filters of that
// season's own tables. The 맹약 season's rule switches, stat multipliers, augments, added factions/maps and the random
// core-bond ban draw have no counterpart in the season's match code (server/match-upstream), so they are not offered.
//
//   bannedOperators  the operator never enters the shared pool (its chess records are hidden)
//   disabledBonds    the core bond is off in every mode (mode.inactiveBondIds): its operators leave the pool as in a draw
//   stages           전장 추가: another season's maps copied into this season's stages as custom stages
//                    (tools/build-season-extra-stages.mjs) join the draw of every mode that draws among several maps
//   disabledStages   the map leaves every mode's stage list
//   disabledBosses   the boss leaves every mode's boss / hidden-boss weights
//   disabledBands    the strategy leaves the draft
//   forcedBonds / protectedBonds        core 항상 밴 / 밴 제외 of the random core draw (co-op; solo picks a group)
//   forcedAuxBonds / protectedAuxBonds  add-on ones (solo and co-op): config.bondPolicy, read by match-upstream/pool.js
//   rules            the match rules the season's code reads from config.customRules (SEASON_RULES)
//   ruleValues       the match values (SEASON_RULE_VALUES): round count, deploy cap, stock, battle times, boss speed,
//                    boss hit limit and the ally / enemy / boss stat percentages (allies, enemyStats, bossStats tabs)
import { customExtensionCatalog, normalizeRuleValues, RULE_VALUES } from './customExtensions.js';

export const SEASON_EXTENSION_CATEGORIES = Object.freeze(['stages', 'rules', 'augmentSettings', 'defaultAllyAugments', 'defaultEnemyAugments', 'commonBands', 'allies', 'enemyStats', 'bossStats', 'forcedBonds', 'forcedAuxBonds', 'bannedOperators', 'disabledBonds', 'disabledStages', 'disabledBosses', 'disabledBands']);
/** The rule switches a season match honours (match-upstream reads config.customRules). */
export const SEASON_RULES = Object.freeze(['augments', 'unlimitedHpLoss', 'sharedHp', 'defaultHarmony', 'duplicateBands', 'unlimitedLayers', 'unlimitedAspd']);
/** The rule values a season match honours. */
export const SEASON_RULE_VALUES = Object.freeze(['normalBattleTime', 'bossBattleTime', 'bossBattleSpeed', 'stockPlayers', 'roundCount', 'deployCap', 'maxDamage',
  // battle stats (sim-upstream reads them from the BattleSpec flags: customRules.js) and the augment settings
  ...RULE_VALUES.filter((r) => ['allies', 'enemyStats', 'bossStats', 'augments'].includes(r.category)).map((r) => r.id)]);
const BAN_KEYS = ['forcedBonds', 'protectedBonds', 'forcedAuxBonds', 'protectedAuxBonds'];
// 증강 (custom 증강 모드 / default augments): match-upstream/augments.js and sim-upstream/content/augments.js run them, on
// the season's own augment catalogue (shared/augments.js with shared/seasonAugments.js mapping the items)
const DEFAULT_VALUES = Object.freeze(Object.fromEntries(RULE_VALUES.map((r) => [r.id, r.default])));

const EMPTY = Object.freeze({ bonds: [], stages: [], rules: [] });

/** The season's catalogue: the same entry shapes as customExtensionCatalog, only the supported categories filled. */
export function seasonExtensionCatalog(raw = {}) {
  const full = customExtensionCatalog(raw);
  const out = {};
  for (const [k, v] of Object.entries(full)) out[k] = SEASON_EXTENSION_CATEGORIES.includes(k) || BAN_KEYS.includes(k) ? v : [];
  out.rules = (full.rules || []).filter((r) => SEASON_RULES.includes(r.id));
  return out;
}

/** A selection reduced to the season's categories and ids (unknown ids dropped). */
export function seasonExtensionSelection(value, raw = {}) {
  const cat = seasonExtensionCatalog(raw);
  const out = { ...EMPTY };
  for (const k of [...SEASON_EXTENSION_CATEGORIES, ...BAN_KEYS]) {
    const known = new Set((cat[k] || []).map((e) => e.id));
    const ids = Array.isArray(value?.[k]) ? value[k].filter((id) => known.has(id)) : [];
    out[k] = [...new Set(ids)];
  }
  // only the season's values, and only those that differ from the default (a default value changes nothing)
  const v = normalizeRuleValues(value?.ruleValues || {});
  const kept = Object.fromEntries(SEASON_RULE_VALUES.filter((id) => v[id] !== DEFAULT_VALUES[id]).map((id) => [id, v[id]]));
  if (Object.keys(kept).length) out.ruleValues = kept;
  return out;
}

/** The season's tables with the selection applied (a new object; `raw` is not changed). */
export function applySeasonExtensions(raw, sel) {
  if (!raw || !sel) return raw;
  const banned = new Set(sel.bannedOperators || []), bonds = new Set(sel.disabledBonds || []);
  const stages = new Set(sel.disabledStages || []), bosses = new Set(sel.disabledBosses || []), bands = new Set(sel.disabledBands || []);
  const rules = (sel.rules || []).filter((id) => SEASON_RULES.includes(id));
  const values = Object.fromEntries(Object.entries(sel.ruleValues || {}).filter(([id]) => SEASON_RULE_VALUES.includes(id)));
  const policy = Object.fromEntries(BAN_KEYS.filter((k) => (sel[k] || []).length).map((k) => [k, [...sel[k]]]));
  const extraStages = (sel.stages || []).filter((id) => raw.stages?.[id]);
  if (!extraStages.length && !banned.size && !bonds.size && !stages.size && !bosses.size && !bands.size && !rules.length && !Object.keys(values).length && !Object.keys(policy).length && !(sel.commonBands || []).length) return raw;
  const chess = banned.size ? Object.fromEntries(Object.entries(raw.chess || {}).map(([id, c]) => [id, banned.has(id) ? { ...c, visible: false } : c])) : raw.chess;
  const dropKeys = (o, set) => (o && typeof o === 'object' ? Object.fromEntries(Object.entries(o).filter(([k]) => !set.has(k))) : o);
  const modes = Object.fromEntries(Object.entries(raw.config?.modes || {}).map(([id, m]) => [id, {
    ...m,
    // a mode drawing among several maps also draws the added ones (the one-map tutorial / 娱乐 modes keep theirs)
    ...(Array.isArray(m.stages) ? { stages: [...m.stages, ...(m.stages.length > 1 ? extraStages.filter((s) => !m.stages.includes(s)) : [])].filter((s) => !stages.has(s)) } : {}),
    ...(bonds.size ? { inactiveBondIds: [...new Set([...(m.inactiveBondIds || []), ...bonds])], ...(Array.isArray(m.activeBondIds) ? { activeBondIds: m.activeBondIds.filter((b) => !bonds.has(b)) } : {}) } : {}),
    ...(m.bossWeights ? { bossWeights: dropKeys(m.bossWeights, bosses) } : {}),
    ...(m.hiddenBossWeights ? { hiddenBossWeights: dropKeys(m.hiddenBossWeights, bosses) } : {}),
  }]));
  const roundCount = values.roundCount;
  if (Number.isInteger(roundCount) && roundCount !== DEFAULT_VALUES.roundCount) for (const [id, m] of Object.entries(modes)) modes[id] = withRoundCount(m, raw.config.modes, roundCount);
  const common = (sel.commonBands || []).filter((id) => raw.bands?.[id]);
  const customRules = { ...values, ...Object.fromEntries(rules.map((id) => [id, true])), ...(values.stockPlayers === -1 ? { unlimitedStock: true } : {}), ...(common.length ? { commonBands: common } : {}) };
  return { ...raw, chess, bands: dropKeys(raw.bands, bands), config: { ...raw.config, modes,
    ...(Object.keys(customRules).length ? { customRules } : {}),
    ...(Object.keys(policy).length ? { bondPolicy: policy } : {}),
    ...(rules.includes('unlimitedHpLoss') ? { lpCapPerRound: Number.MAX_SAFE_INTEGER } : {}) } };
}

/**
 * A mode with `n` normal rounds (the 맹약 season's 일반 라운드 수, shared/customExtensions.js applyCustomExtensions): round r
 * plays the season's round min(r, 13) (a boss / hidden round's slot plays round 13), then its boss and hidden rounds.
 */
function withRoundCount(m, allModes, n) {
  const fallback = Object.values(allModes).find((x) => x.type === m.type && x.rounds?.['13'] && !x.rounds['13'].isBoss);
  const regular = m.rounds?.['13'] || fallback?.rounds?.['13'];
  if (!regular || !m.bossRound) return m;
  const rounds = {}, enemyScale = {}, roundSource = {};
  const copy = (to, from, cfg) => { rounds[to] = { ...cfg }; enemyScale[to] = { ...(m.enemyScale?.[from] || fallback?.enemyScale?.[from] || {}) }; roundSource[to] = from; };
  for (let r = 1; r <= n; r++) { const from = Math.min(r, 13), cfg = m.rounds?.[from]; copy(r, from, cfg && !cfg.isBoss && !cfg.isHidden ? cfg : regular); }
  copy(n + 1, m.bossRound, m.rounds?.[m.bossRound]);
  if (m.hiddenRound) copy(n + 2, m.hiddenRound, m.rounds?.[m.hiddenRound]);
  return { ...m, rounds, enemyScale, roundSource, bossRound: n + 1, lastRound: n + 1, hiddenRound: m.hiddenRound ? n + 2 : null,
    spRounds: (m.spRounds || []).filter((r) => r <= n) };
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
  const bandCount = Object.keys(data.bands || {}).length, need = mode === 'solo' || (sel.rules || []).includes('duplicateBands') ? 1 : 4;
  if (bandCount < need) errors.push(`전략을 최소 ${need}개 남겨야 합니다.`);
  for (const [f, p, label] of [['forcedBonds', 'protectedBonds', '맹약'], ['forcedAuxBonds', 'protectedAuxBonds', '부가 맹약']]) {
    if ((sel[f] || []).some((id) => (sel[p] || []).includes(id))) errors.push(`같은 ${label}에 항상 밴과 밴 제외를 함께 설정할 수 없습니다.`);
  }
  return [...new Set(errors)];
}
