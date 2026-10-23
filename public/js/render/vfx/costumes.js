// Official per-outfit replacement tables. Base unit identity/gameplay plans remain unchanged.
const lc = value => typeof value === 'string' ? value.toLowerCase() : null;
export function costumeFor(index, view, baseKey) {
  const key = view?.info?.skin || view?.info?.skinId || view?.info?.spine;
  const costume = key && index?.costumes?.[key];
  return costume && costume.charId === baseKey ? costume : null;
}
export function costumeEffect(index, costume, key) {
  const original = lc(key), replacement = original && costume?.effects?.[original];
  return replacement && index?.prefabs?.[replacement] ? replacement : original;
}
function rewrite(value, mapping) {
  if (typeof value === 'string') return mapping[lc(value)] || value;
  if (Array.isArray(value)) return value.map(v => rewrite(v, mapping));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,rewrite(v,mapping)]));
  return value;
}
export function costumeProjectile(index, costume, projectile, key) {
  if (!costume || !projectile) return projectile;
  const fake = key && costume.projectiles?.[key];
  const graphic = fake && index.projectiles?.[fake.graphic];
  const source = graphic || projectile;
  const effects = Object.fromEntries(Object.entries(costume.effects || {}).filter(([,to])=>index.prefabs?.[to]));
  const out = rewrite(source, effects);
  if (graphic && Number.isInteger(fake.mount)) out.costumeMount = fake.mount;
  return out;
}
export function costumePreloadKeys(index, costume) {
  const keys = new Set(Object.values(costume?.effects || {}));
  for (const entry of Object.values(costume?.projectiles || {})) {
    for (const key of index.projectiles?.[entry.graphic]?.effects || []) keys.add(costumeEffect(index,costume,key));
  }
  return [...keys].filter(key=>index.prefabs?.[key]);
}
