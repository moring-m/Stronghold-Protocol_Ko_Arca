// Compact per-operator battle metrics, shared by the sim, validated reports and result UI.
export const COMBAT_METRICS=Object.freeze(['dmg','physicalDamage','artsDamage','trueDamage','elementalDamage','heal','taken','takenPhysical','takenArts','takenTrue','takenElemental','shieldAbsorbed','kills','attacks','skillUses','redeploys','deaths','activeTime']);
const COUNTS=new Set(['kills','attacks','skillUses','redeploys','deaths']);
export function combatMetrics(value={}) {
  if(!value||typeof value!=='object')value={};
  return Object.fromEntries(COMBAT_METRICS.map(k=>{const n=Number(value[k]);return [k,Number.isFinite(n)?(COUNTS.has(k)?Math.trunc(Math.max(0,Math.min(1e13,n))):Math.max(0,Math.min(1e13,n))):0];}));
}
export function sumCombatMetrics(units=[]) {
  const out=combatMetrics();for(const u of units){const metrics=combatMetrics(u);for(const k of COMBAT_METRICS)out[k]+=metrics[k];}return out;
}
export function combatRound(value={}) {
  if(!value||typeof value!=='object')value={};
  return {round:value.round,kind:value.kind,fieldId:value.fieldId,duration:value.duration,available:value.available!==false,
    units:(Array.isArray(value.units)?value.units:[]).filter(u=>u&&typeof u==='object').slice(0,160).map(u=>({uid:u.uid??null,defId:u.defId,name:u.name,kind:u.kind,...combatMetrics(u)})),
    totals:combatMetrics(value.totals)};
}
