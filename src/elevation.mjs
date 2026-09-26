export const MAX_ELEVATION_PATCHES = 4096;
export const MAX_ELEVATION_LEVEL = 2;
export const BASE_ELEVATION_PATH_COST = 100;
export const UPHILL_ELEVATION_PATH_COST = 115;

export function buildElevationLevelGrid(width, height, elevationPatches = []) {
  if (!Array.isArray(elevationPatches) || elevationPatches.length > MAX_ELEVATION_PATCHES) {
    throw new Error('Elevation patches must be an array with at most 4096 entries.');
  }
  const levels = new Uint8Array(width * height);
  const claimedCells = new Uint8Array(width * height);
  for (const patch of elevationPatches) {
    const { column, row, width: patchWidth, height: patchHeight, level } = patch || {};
    if (![column, row, patchWidth, patchHeight].every(Number.isInteger)
      || column < 0 || row < 0 || patchWidth < 1 || patchHeight < 1
      || column + patchWidth > width || row + patchHeight > height) {
      throw new Error('An elevation patch is outside the map grid or has invalid dimensions.');
    }
    if (!Number.isInteger(level) || level < 0 || level > MAX_ELEVATION_LEVEL) {
      throw new Error('Elevation levels must be integers from 0 through 2.');
    }
    for (let paintedRow = row; paintedRow < row + patchHeight; paintedRow++) {
      for (let paintedColumn = column; paintedColumn < column + patchWidth; paintedColumn++) {
        const cell = paintedRow * width + paintedColumn;
        if (claimedCells[cell]) throw new Error('Elevation patches cannot overlap.');
        claimedCells[cell] = 1;
        levels[cell] = level;
      }
    }
  }
  return levels;
}

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
