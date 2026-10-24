// Share visual slot availability without changing the talent's collision or damage rules.
export function emitMotes(battle, unit, slots, radius, speed = 30, mode = 0) {
  battle.fx('moteState', { x: unit.x, y: unit.y, id: unit.id, src: unit.id,
    mode, dir: unit.dir, slots: slots.map(t => t <= battle.time + 1e-9), radius, speed,
    phase: (battle.time - (unit.deployedAt || 0)) * speed * Math.PI / 180 });
}
