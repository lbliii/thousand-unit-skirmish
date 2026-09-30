export const UNIT_LOD_ROLES = Object.freeze(['worker', 'infantry', 'archer', 'mounted', 'siege']);
export const UNIT_LOD_ROLE_BITS = Object.freeze({ worker: 1, infantry: 2, archer: 4, mounted: 8, siege: 16 });
const ALL_UNIT_LOD_ROLE_BITS = UNIT_LOD_ROLES.reduce((mask, role) => mask | UNIT_LOD_ROLE_BITS[role], 0);

export function unitLodRoleMatrixUpdateMask(previousRole, currentRole) {
  const currentBit = UNIT_LOD_ROLE_BITS[currentRole] || 0;
  if (!currentBit) return 0;
  const previousBit = UNIT_LOD_ROLE_BITS[previousRole] || 0;
  return previousBit ? previousBit | currentBit : ALL_UNIT_LOD_ROLE_BITS;
}

export function shouldUpdateUnitFullDetailTint(lowDetailActive) {
  return !lowDetailActive;
}

export function shouldUpdateUnitTransformForFrame(
  lowDetailActive, transformChanged, fullDetailAnimationDue,
) {
  return transformChanged || (!lowDetailActive && fullDetailAnimationDue);
}

export function shouldUpdateUnitFocusMatrix(
  initialized, previousFocused, focused, previousX, previousZ, previousScale, x, z, scale,
) {
  if (!initialized) return true;
  if (!focused && !previousFocused) return false;
  return previousFocused !== focused || previousX !== x || previousZ !== z || previousScale !== scale;
}
