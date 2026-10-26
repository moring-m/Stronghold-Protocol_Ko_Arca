// Verified artwork corrections only; range decals keep their authored footprint.
// 阿斯卡纶 迭代 (char_4132_ascln@iteration#4) keeps its authored size: compared with the official client's recording
// (2026-10-27) its attack needles span about 3 tiles, as the unscaled prefabs draw them — no correction.
export function effectArtScale(original, resolved = original) {
  if (resolved === original && /^blkkgt_skill_03_(?:start_01|end)$/.test(original)) return .5;
  return 1;
}
