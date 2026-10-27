// Verified artwork corrections only; range decals keep their authored footprint. Compared with the official client's
// recordings (2026-10-27), 阿斯卡纶 迭代's attack blades and 锏's S3 finisher draw at their authored size once a
// billboard's 3D start rotation is applied (geom.js). 锏's S3 dash slashes (blkkgt_skill_03_start_01: stretched
// billboards, which that rotation does not turn) draw about twice the recording's length (its streaks span ~4 tiles,
// ours ~7) — they are halved; skins that resolve to their own prefab keep theirs.
export function effectArtScale(original, resolved = original) {
  if (resolved === original && original === 'blkkgt_skill_03_start_01') return .5;
  return 1;
}
