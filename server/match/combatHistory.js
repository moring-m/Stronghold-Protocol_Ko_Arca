import {combatMetrics,combatRound,sumCombatMetrics} from '../../shared/combatStats.js';
/** Called once per completed field, including normal, alliance and both boss phases. */
export function recordCombatField(match,field,result) {
  if(!field || !result || field.combatRecorded)return;
  field.combatRecorded=true;
  for(const pid of field.players||[]) {
    const ps=match.players.get(pid),pp=result.perPlayer?.[pid];if(!ps||!pp)continue;
    const units=(pp.unitStats||[]).map(u=>({...u,...combatMetrics(u)}));
    ps.combatRounds??=[];
    ps.combatRounds.push(combatRound({round:match.round,kind:field.kind||'normal',fieldId:field.fieldId||String(ps.combatRounds.length),duration:Math.max(0,Number(result.time)||0),available:!result.synthetic && Array.isArray(pp.unitStats),units,totals:sumCombatMetrics(units)}));
  }
}
