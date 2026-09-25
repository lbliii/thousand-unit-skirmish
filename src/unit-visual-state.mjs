export function unitActionPoseAllowed(hp, defeatStartedAt) {
  return hp > 0 && !(defeatStartedAt > 0);
}

export function unitCargoVisualState(kind, hp, visible, cargo, cargoType) {
  if (kind !== 'worker' || !(hp > 0) || visible === false
    || !Number.isFinite(cargo) || cargo <= 0) return 'none';
  return cargoType === 'wood' || cargoType === 'food' ? cargoType : 'unknown';
}
