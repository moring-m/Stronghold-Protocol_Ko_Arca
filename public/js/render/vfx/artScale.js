// Verified artwork corrections only; range decals keep their authored footprint.
// 阿斯卡纶 迭代 (char_4132_ascln@iteration#4): the outfit's slash and hit bursts are authored at twice the size of the
// operator's own (rendered side by side, 2026-10-26: 1.8–2.2× for every one below, 1.0× for the range decals and the
// deploy effect), the same scale the attack slash was first corrected for — they are halved; the decals stay.
const ASCLN_ITERATION_BURSTS = /^ascln_(?:attack_(?:start_0[13]|hit_01)|buff_01|skill_01_(?:hit_02|start_04)|skill_0[23]_(?:hit_01|start_01))_iteration#4$/;
export function effectArtScale(original, resolved = original) {
  if (resolved === original && /^blkkgt_skill_03_(?:start_01|end)$/.test(original)) return .5;
  if (ASCLN_ITERATION_BURSTS.test(resolved)) return .5;
  return 1;
}
