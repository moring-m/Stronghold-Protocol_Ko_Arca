// server/sim/motionSpeed.js — custom rule skillMotionAspd (shared/customExtensions.js)
/**
 * Custom rule skillMotionAspd: the speed a skill's fixed-time motion plays at — the unit's ASPD / 100 (clamped to
 * 0.2–6) while the rule is on, else 1. Used by the fixed-motion casts (skills.js), 结城真's persona switches, and the
 * skills that strike on their own fixed timer instead of attacking: 塔露拉 S3 waves, 异客 S3 storm, 罗莎 S3 harpoons,
 * 锏 S3 slashes. Timers that are not strikes (damage over time, buff ramps, slow / aura pulses) keep their time.
 */
export function skillMotionSpeed(b, u) {
  if (!b?.data?.raw?.config?.customRules?.skillMotionAspd) return 1;
  return Math.max(.2, Math.min(6, (Number(u?.s?.aspd) || 100) / 100));
}
