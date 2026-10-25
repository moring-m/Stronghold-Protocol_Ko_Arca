import { COSTUME_MOUNT_BINDINGS } from './costumeMountBindings.js';
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
  // Graphic prefabs supply the body, not the gameplay projectile's impact/reach lifecycle.
  const source = graphic ? {...projectile,...graphic, ...(graphic.onHit==null&&projectile.onHit!=null?{onHit:projectile.onHit}:{}), ...(graphic.onReached==null&&projectile.onReached!=null?{onReached:projectile.onReached}:{}), effects:[...new Set([...(projectile.effects||[]),...(graphic.effects||[])])]} : projectile;
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

// Bind animator slot identities rather than assuming that Transform names match their slots.
export function costumeSkin(index, costume) {
  const skin=index?.skins?.[costume?.mount];if(!skin)return null;
  const bindings=skin.mountBindings||COSTUME_MOUNT_BINDINGS[costume.mount];if(!bindings)return skin;
  const points={...skin.points};
  for(const [kind,faces]of Object.entries(bindings)){
    if(!/^s\d+$/.test(kind))continue;
    const n=kind.slice(1),names=['Special'+n,'SpecialPoint'+n,'Special_'+n];
    for(const [face,name]of Object.entries(faces)){
      const point=skin.points?.[name]?.[face]||skin.points?.[name]?.all;
      if(point)points[names[0]]={...points[names[0]],[face]:point};
    }
  }
  return {...skin,points};
}
