// 커스텀 설정 in a battle of another season (shared/seasonExtensions.js): the match's config.customRules, carried by the
// BattleSpec flags (match-upstream gamedata.dp), so the server and every browser replica read the same values.
// Absent on every official battle: each reader then keeps the upstream value (×1, the official caps).
export function customRules(b) { return b?.flags?.customRules || b?.data?.raw?.config?.customRules || null; }
/** A percent rule as a factor (100 → 1). */
export function rulePct(rules, id) { const v = rules?.[id]; return Number.isFinite(v) ? v / 100 : 1; }
