import { ADDITIONAL_SKILL_RANGE_PROFILES } from './skillRangeStyles.generated.js';
// Confirmed base-skin skill VFX, not colours inferred from operator portraits.
// Evidence: docs/LOCAL-SKILL-RANGE-VISUAL-AUDIT.md. Unconfirmed skills deliberately
// return null so the renderer uses the operator's representative colour.
export const SKILL_RANGE_PROFILES = {
  ...ADDITIONAL_SKILL_RANGE_PROFILES,
  skchr_lisa_3:{color:0x4d9bdd,fillAlpha:.13,glowAlpha:.10,pulse:.012,accent:'haze'},
  skchr_mint_1:{color:0x50d8ee,fillAlpha:.12,glowAlpha:.08,pulse:.014,accent:'vortex'},
  skchr_mint_2:{color:0x50d8ee,fillAlpha:.12,glowAlpha:.08,pulse:.014,accent:'vortex'},
  skchr_demkni_3:{color:0xc1bfbd,fillAlpha:.10,glowAlpha:.04,pulse:0,accent:'dust'},
  skchr_mlynar_3:{color:0xf1c64f,fillAlpha:.12,glowAlpha:.08,pulse:.008,accent:'gold'},
  skchr_mostma_2:{color:0x4989ed,fillAlpha:.12,glowAlpha:.07,pulse:.010,accent:'time'},
  skchr_mostma_3:{color:0x4989ed,fillAlpha:.12,glowAlpha:.07,pulse:.010,accent:'time'},
};
export function confirmedSkillRangeStyle(info) {
  // skillId is supplied by current snapshots; derive from char ID for older
  // snapshots and rendering demos. Never apply an S3 profile to S1/S2.
  const char=String(info.charId||'').match(/^char_\d+_(.+)$/)?.[1];
  const id=info.skillId || (char&&Number.isInteger(info.skillIndex)?`skchr_${char}_${info.skillIndex+1}`:null);
  const profile=SKILL_RANGE_PROFILES[id];return profile?{...profile,source:'original-skill'}:null;
}
