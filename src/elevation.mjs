export const BASE_ELEVATION_PATH_COST = 100;
export const UPHILL_ELEVATION_PATH_COST = 115;

export function canTraverseElevation(levels, fromCell, toCell) {
  return Math.abs(levels[toCell] - levels[fromCell]) <= 1;
}

export function elevationPathCost(levels, fromCell, toCell) {
  return levels[toCell] > levels[fromCell]
    ? UPHILL_ELEVATION_PATH_COST : BASE_ELEVATION_PATH_COST;
}

export function hasElevation(levels) {
  return levels.some((level) => level > 0);
}
