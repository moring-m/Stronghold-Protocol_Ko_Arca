// server/sim/motionSpeed.js — custom rule skillMotionAspd (shared/customExtensions.js)
/**
 * Custom rule skillMotionAspd: the speed a skill's fixed-time motion plays at — the unit's ASPD / 100 (clamped to
 * 0.2–6, 0.2–30 with unlimitedAspd) while the rule is on, else 1. Used by the fixed-motion casts (skills.js), 结城真's persona switches, and the
 * skills that strike or lock on their own fixed timer instead of attacking: 塔露拉 S3 waves, 异客 S3 storm, 罗莎 S3 harpoons, 蕾缪安 S3 locks, 隐德来希 S2 sickles,
 * 锏 S3 slashes. Timers that are not strikes (damage over time, buff ramps, slow / aura pulses) keep their time.
 */
export function skillMotionSpeed(b, u) {
  if (!b?.data?.raw?.config?.customRules?.skillMotionAspd) return 1;
  // (6 = the 600 ASPD cap; with the unlimitedAspd rule the cap is gone — 30, i.e. ASPD 3000, keeps the timers sane)
  const max = b.data.raw.config.customRules.unlimitedAspd ? 30 : 6;
  return Math.max(.2, Math.min(max, (Number(u?.s?.aspd) || 100) / 100));
}
