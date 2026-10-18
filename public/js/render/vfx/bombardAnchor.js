/** Ground aim follows the live view until the simulation sends its lock point. */
export function bombardAnchor(x, y, targetId, view, now, lockAt) {
  let id = targetId, px = x, py = y;
  const sample = () => {
    if (id == null) return;
    const v = view(id);
    if (v && !v.destroyed && v.alive !== false) { px = v.x; py = v.y; }
    if (now() >= lockAt) id = null;
  };
  return {
    z: 0, alive: true,
    get x() { sample(); return px; }, get y() { sample(); return py; },
    update(ex) { if(Number.isFinite(ex.x))px=ex.x;if(Number.isFinite(ex.y))py=ex.y;id=ex.target ?? null; },
  };
}
