// Reduce only the background board resolution under sustained load. Unit
// textures, world coordinates, simulation time and attack animation clocks stay unchanged.
export function adaptiveElapsed(dt, hidden = false, resumed = false) {
  return !hidden && !resumed && Number.isFinite(dt) && dt > 0 ? Math.min(dt, 0.1) : 0;
}
export function adaptiveMapScale(level, enabled = true) {
  return enabled ? [1, 0.85, 0.7, 0.55][Math.max(0, Math.min(3, Math.floor(level || 0)))] : 1;
}
