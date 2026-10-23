// Verified artwork corrections only; range decals keep their authored footprint.
export function effectArtScale(original, resolved = original) {
  if (resolved === original && /^blkkgt_skill_03_(?:start_01|end)$/.test(original)) return .5;
  if (/^ascln_attack_start_0[13]_iteration#4$/.test(resolved)) return .5;
  return 1;
}
