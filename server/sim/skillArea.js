import { absoluteRangeKeys } from './targeting.js';
import { unlimitedSkillRange } from '../../shared/skillRangeDisplay.js';
// Area effects and expanded attack ranges; ordinary stat buffs remain unmarked.
const AREA_SKILLS = new Set([
  'skchr_lisa_3', 'skchr_mostma_2', 'skchr_mostma_3',
  'skchr_demkni_2', 'skchr_demkni_3', 'skchr_shining_3', 'skchr_cgbird_3',
  'skchr_slbell_2', 'skchr_indigo_2', 'skchr_haini_2', 'skchr_rosesa_2',
  'skchr_skadi2_2', 'skchr_skadi2_3', 'skchr_sora_2', 'skchr_heidi_1', 'skchr_heidi_2',
  'skchr_mlynar_3', 'skchr_sbell2_3', 'skchr_mint_1', 'skchr_mint_2',
]);
export function showsSkillArea(u) {
  if (u?.side !== 'ally') return false;
  if (unlimitedSkillRange(u.def?.skill,u.skill?.spec?.targeting)) return false;
  // A queued next-attack effect is not a sustained area, even with its own grid.
  if (u.skill?.pending || (!u.skill?.isTimed && u.skill?.spec?.attack && ['instant','charges'].includes(u.skill.kind))) return false;
  // Compare live tiles with the permanent base range: also handles kit-generated
  // grids and skill buffs instead of relying on a growing operator-ID list.
  if (u.skill?.active && Array.isArray(u.rangeKeys) && Array.isArray(u.baseRangeKeys)) {
    const base = new Set(u.baseRangeKeys);
    if (u.rangeKeys.some(k => !base.has(k))) return true;
  }
  const grid = u.skill?.spec?.targeting?.rangeGrid || u.def?.skill?.rangeGrid;
  const own = new Set((u.rangeGrid || u.def?.rangeGrid || []).map(p => p.join(',')));
  if (grid?.length && grid.some(p => !own.has(p.join(',')))) return true;
  if (typeof u.skill?.spec?.areaEffect === 'boolean') return u.skill.spec.areaEffect;
  return AREA_SKILLS.has(u.def?.skill?.skillId ?? u.skill?.id);
}


// A dedicated skill grid need not be the operator's normal attack range.
export function skillAreaKeys(u) {
  const tg = u.skill?.spec?.targeting;
  if (tg?.rangeGrid || tg?.rangeExtend || (u.skill?.active && u.rangeKeys?.some(k => !(u.baseRangeKeys || []).includes(k)))) return u.rangeKeys || [];
  const grid = u.def?.skill?.rangeGrid;
  return grid?.length ? absoluteRangeKeys(grid,u.tileR,u.tileC,u.dir,0, u.battle?.grid) : u.rangeKeys || [];
}
export function visibleSkillAreaKeys(u, time) {
  if (!u.alive || !u.deployed) return null;
  if (unlimitedSkillRange(u.def?.skill,u.skill?.spec?.targeting)) return null;
  if (u.skill?.active && showsSkillArea(u)) return skillAreaKeys(u);
  const pulse = u.mem?.skillArea;
  return pulse && time < pulse.until ? pulse.keys : null;
}
