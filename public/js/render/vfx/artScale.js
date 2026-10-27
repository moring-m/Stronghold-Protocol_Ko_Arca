// Verified artwork corrections only; range decals keep their authored footprint. Compared with the official client's
// recordings (2026-10-27), 阿斯卡纶 迭代's attack blades and 锏's S3 finisher draw at their authored size once a
// billboard's 3D start rotation is applied (geom.js) — no uniform scale stands.
export function effectArtScale(original, resolved = original) {
  return 1;
}

// The length of an effect's stretched billboards (× each renderer's lengthScale; their width stays): 锏's S3 dash slashes
// (blkkgt_skill_03_start_01) draw ~7 tiles long against the recording's ~4 at the same width — halving the whole
// prefab thinned them too (user report, 2026-10-27). Skins that resolve to their own prefab keep theirs.
export function effectStretchScale(original, resolved = original) {
  if (resolved === original && original === 'blkkgt_skill_03_start_01') return .6;
  return 1;
}
