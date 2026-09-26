import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Keep this as a layout preview until the server accepts the agreed trade-node schema.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WIDTH = 129;
const HEIGHT = 97;
const CELL_COUNT = WIDTH * HEIGHT;
const obstacleByCell = new Array(CELL_COUNT).fill(null);
const groundByCell = new Array(CELL_COUNT).fill(null);
const levelsByCell = new Uint8Array(CELL_COUNT);

function index(column, row) {
  return row * WIDTH + column;
}

function inside(column, row) {
  return column >= 0 && column < WIDTH && row >= 0 && row < HEIGHT;
}

function setObstacle(column, row, material) {
  if (!inside(column, row)) return;
  const cell = index(column, row);
  assert.equal(obstacleByCell[cell], null,
    `Obstacle overlap at ${column},${row}: ${obstacleByCell[cell]} and ${material}`);
  obstacleByCell[cell] = material;
}

function mirrorColumn(column) {
  return WIDTH - 1 - column;
}

function addMirroredForestLobe(centerColumn, centerRow, radiusX, radiusY) {
  for (let row = Math.max(0, centerRow - radiusY); row <= Math.min(HEIGHT - 1, centerRow + radiusY); row++) {
    for (let column = Math.max(0, centerColumn - radiusX); column <= centerColumn + radiusX; column++) {
      const dx = (column - centerColumn) / radiusX;
      const dz = (row - centerRow) / radiusY;
      const edge = 0.06 * Math.sin(column * 0.47 + row * 0.19)
        + 0.05 * Math.cos(column * 0.21 - row * 0.31);
      if (dx * dx + dz * dz > 1 + edge) continue;
      setObstacle(column, row, 'forest');
      setObstacle(mirrorColumn(column), row, 'forest');
    }
  }
}

function setMirroredGround(column, row, material) {
  if (!inside(column, row)) return;
  groundByCell[index(column, row)] = material;
  groundByCell[index(mirrorColumn(column), row)] = material;
}

function paintMirroredRectangle(column, row, width, height, material) {
  for (let y = row; y < row + height; y++) {
    for (let x = column; x < column + width; x++) setMirroredGround(x, y, material);
  }
}

function paintEllipse(centerColumn, centerRow, radiusX, radiusY, material) {
  for (let row = Math.max(0, centerRow - radiusY); row <= Math.min(HEIGHT - 1, centerRow + radiusY); row++) {
    for (let column = Math.max(0, centerColumn - radiusX); column <= centerColumn + radiusX; column++) {
      const dx = (column - centerColumn) / radiusX;
      const dz = (row - centerRow) / radiusY;
      if (dx * dx + dz * dz <= 1) setMirroredGround(column, row, material);
    }
  }
}

function paintMirroredElevationRectangle(column, row, width, height, level) {
  for (let y = row; y < row + height; y++) {
    for (let x = column; x < column + width; x++) {
      levelsByCell[index(x, y)] = level;
      levelsByCell[index(mirrorColumn(x), y)] = level;
    }
  }
}

function compressCells(cells, include) {
  const visited = new Uint8Array(CELL_COUNT);
  const rectangles = [];
  for (let row = 0; row < HEIGHT; row++) {
    for (let column = 0; column < WIDTH; column++) {
      const start = index(column, row);
      const value = cells[start];
      if (!include(value) || visited[start]) continue;

      let width = 1;
      while (column + width < WIDTH) {
        const next = index(column + width, row);
        if (cells[next] !== value || visited[next]) break;
        width++;
      }
      let height = 1;
      while (row + height < HEIGHT) {
        let same = true;
        for (let dx = 0; dx < width; dx++) {
          const next = index(column + dx, row + height);
          if (cells[next] !== value || visited[next]) { same = false; break; }
        }
        if (!same) break;
        height++;
      }
      for (let dy = 0; dy < height; dy++) {
        for (let dx = 0; dx < width; dx++) visited[index(column + dx, row + dy)] = 1;
      }
      rectangles.push({ column, row, width, height, value });
    }
  }
  return rectangles;
}

// Mirrored woods make shaded clearings on both flanks without closing either approach.
for (const [column, row, radiusX, radiusY] of [
  [17, 19, 8, 6], [39, 19, 7, 5], [53, 23, 5, 6], [13, 33, 6, 5],
  [13, 63, 6, 5], [53, 73, 5, 6], [39, 77, 7, 5], [17, 77, 8, 6],
]) addMirroredForestLobe(column, row, radiusX, radiusY);

// Base clearings, a pair of dirt approaches, and a short-grass level-2 terrace.
paintEllipse(20, 48, 13, 10, 'short-grass');
paintMirroredRectangle(61, 33, 7, 7, 'dirt');
paintMirroredRectangle(61, 57, 7, 7, 'dirt');
paintMirroredRectangle(56, 40, 17, 17, 'short-grass');
for (const row of [0, 1, 2, 3, 4, 5, 6, 7, 8, 88, 89, 90, 91, 92, 93, 94, 95, 96]) {
  paintMirroredRectangle(0, row, WIDTH, 1, 'long-grass');
}
// Pale scree marks the cliff rim; the north and south gates remain dirt ramps.
for (const row of [39, 57]) {
  for (const column of [56, 57, 58, 59, 60, 68, 69, 70, 71, 72]) {
    setMirroredGround(column, row, 'scree');
  }
}
for (const row of [40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56]) {
  setMirroredGround(55, row, 'scree');
  setMirroredGround(73, row, 'scree');
}
paintMirroredElevationRectangle(56, 40, 17, 17, 2);
paintMirroredElevationRectangle(61, 33, 7, 7, 1);
paintMirroredElevationRectangle(61, 57, 7, 7, 1);

const resources = [];
const occupiedResourceCells = new Set();
const pairCounts = { start: { food: 0, wood: 0 }, expansion: { food: 0, wood: 0 } };
function addResourcePair(region, type, column, row, stock) {
  const pair = String(++pairCounts[region][type]).padStart(2, '0');
  for (const [teamName, cellColumn] of [['azure', column], ['ember', mirrorColumn(column)]]) {
    const cell = index(cellColumn, row);
    const cellKey = `${cellColumn},${row}`;
    assert.equal(occupiedResourceCells.has(cellKey), false, `Duplicate resource cell ${cellKey}`);
    assert.equal(obstacleByCell[cell], null,
      `Resource ${region}-${teamName}-${type}-${pair} is on ${obstacleByCell[cell]}`);
    assert.ok(levelsByCell[cell] === 0, `Ordinary ${type} sites should stay off the terrace ramps.`);
    occupiedResourceCells.add(cellKey);
    resources.push({
      id: `${region}-${teamName}-${type}-${pair}`,
      type,
      x: cellColumn + 0.5 - WIDTH / 2,
      z: row + 0.5 - HEIGHT / 2,
      stock,
    });
  }
}

for (const [type, points] of [
  ['food', [[20, 42], [21, 55], [28, 39], [25, 59]]],
  ['wood', [[22, 48], [30, 44], [30, 53], [24, 34]]],
]) {
  for (const [column, row] of points) addResourcePair('start', type, column, row, 360);
}
for (const [type, points] of [
  ['food', [[38, 39], [46, 46], [38, 56], [46, 61]]],
  ['wood', [[35, 47], [45, 37], [35, 58], [45, 65]]],
]) {
  for (const [column, row] of points) addResourcePair('expansion', type, column, row, 300);
}
resources.sort((a, b) => a.id.localeCompare(b.id));
const coffeeCell = index(64, 48);
assert.equal(obstacleByCell[coffeeCell], null, 'The coffee grove should sit on open ground.');
assert.equal(levelsByCell[coffeeCell], 2, 'The coffee grove should sit on the high terrace.');
resources.push({
  id: 'highland-coffee-grove',
  type: 'trade',
  species: 'coffee',
  x: 0,
  z: 0,
  stock: 60,
  capacity: 60,
});

const obstacles = compressCells(obstacleByCell, material => material !== null)
  .map(({ column, row, width, height, value: material }) => ({ column, row, width, height, material }));
const terrainPatches = compressCells(groundByCell, material => material !== null)
  .map(({ column, row, width, height, value: material }) => ({ column, row, width, height, material }));
const elevationPatches = compressCells(levelsByCell, level => level > 0)
  .map(({ column, row, width, height, value: level }) => ({ column, row, width, height, level }));
const forestCount = obstacleByCell.filter(material => material === 'forest').length;
const forestPercent = forestCount / CELL_COUNT * 100;
assert.ok(forestPercent >= 12 && forestPercent <= 20,
  `Forest coverage ${forestPercent.toFixed(1)}% must stay within the 12–20% map range.`);
assert.equal(resources.length, 33, 'Highland Grove should have 32 ordinary sites and one specialty site.');
assert.equal(resources.filter(node => node.type === 'food').length, 16);
assert.equal(resources.filter(node => node.type === 'wood').length, 16);
assert.equal(resources.filter(node => node.type === 'trade' && node.species === 'coffee').length, 1);
for (let row = 0; row < HEIGHT; row++) {
  for (let column = 0; column < WIDTH / 2; column++) {
    const left = index(column, row);
    const right = index(mirrorColumn(column), row);
    assert.equal(obstacleByCell[left], obstacleByCell[right], `Obstacle mismatch at ${column},${row}`);
    assert.equal(groundByCell[left], groundByCell[right], `Ground mismatch at ${column},${row}`);
    assert.equal(levelsByCell[left], levelsByCell[right], `Elevation mismatch at ${column},${row}`);
  }
}

function pointCell(point) {
  const column = Math.floor(point.x + WIDTH / 2);
  const row = Math.floor(point.z + HEIGHT / 2);
  return index(column, row);
}

function shortestPathCosts(start) {
  const distances = new Float64Array(CELL_COUNT).fill(Number.POSITIVE_INFINITY);
  const settled = new Uint8Array(CELL_COUNT);
  const heapCells = [];
  const heapCosts = [];
  const push = (cell, cost) => {
    let position = heapCells.length;
    heapCells.push(cell);
    heapCosts.push(cost);
    while (position > 0) {
      const parent = Math.floor((position - 1) / 2);
      if (heapCosts[parent] <= cost) break;
      heapCells[position] = heapCells[parent];
      heapCosts[position] = heapCosts[parent];
      position = parent;
    }
    heapCells[position] = cell;
    heapCosts[position] = cost;
  };
  const pop = () => {
    const cell = heapCells[0];
    const cost = heapCosts[0];
    const lastCell = heapCells.pop();
    const lastCost = heapCosts.pop();
    if (heapCells.length > 0) {
      let position = 0;
      while (true) {
        const left = position * 2 + 1;
        const right = left + 1;
        if (left >= heapCells.length) break;
        const child = right < heapCells.length && heapCosts[right] < heapCosts[left] ? right : left;
        if (heapCosts[child] >= lastCost) break;
        heapCells[position] = heapCells[child];
        heapCosts[position] = heapCosts[child];
        position = child;
      }
      heapCells[position] = lastCell;
      heapCosts[position] = lastCost;
    }
    return { cell, cost };
  };

  distances[start] = 0;
  push(start, 0);
  while (heapCells.length > 0) {
    const { cell, cost } = pop();
    if (settled[cell] || cost !== distances[cell]) continue;
    settled[cell] = 1;
    const column = cell % WIDTH;
    const row = Math.floor(cell / WIDTH);
    for (const neighbour of [
      column > 0 ? cell - 1 : -1,
      column + 1 < WIDTH ? cell + 1 : -1,
      row > 0 ? cell - WIDTH : -1,
      row + 1 < HEIGHT ? cell + WIDTH : -1,
    ]) {
      if (neighbour < 0 || obstacleByCell[neighbour]) continue;
      const levelDifference = levelsByCell[neighbour] - levelsByCell[cell];
      if (Math.abs(levelDifference) > 1) continue;
      const nextCost = cost + 100 + (levelDifference > 0 ? 15 : 0);
      if (nextCost >= distances[neighbour]) continue;
      distances[neighbour] = nextCost;
      push(neighbour, nextCost);
    }
  }
  return distances;
}

const definition = {
  id: 'highland-grove',
  name: 'Highland Grove',
  summary: 'Two shaded approaches rise to a shared central terrace.',
  width: WIDTH,
  height: HEIGHT,
  terrainSeed: 907,
  terrainBase: 'meadow',
  terrainPatches,
  elevationPatches,
  startingArmySize: 1000,
  startingResources: { food: 200, wood: 150 },
  fogOfWar: true,
  victoryMode: 'any',
  victoryHoldSeconds: 20,
  spawnPoints: [
    { team: 0, x: 20.5 - WIDTH / 2, z: 48.5 - HEIGHT / 2 },
    { team: 1, x: mirrorColumn(20) + 0.5 - WIDTH / 2, z: 48.5 - HEIGHT / 2 },
  ],
  resourceNodes: resources,
  obstacles,
  triggers: [],
  scenarioEvents: [],
};

const sortedSpawns = [...definition.spawnPoints].sort((a, b) => a.team - b.team);
const spawnCosts = sortedSpawns.map(spawn => shortestPathCosts(pointCell(spawn)));
const terraceCell = index(64, 48);
const northApproachCell = index(64, 36);
const southApproachCell = index(64, 60);
assert.ok(spawnCosts.every(costs => Number.isFinite(costs[terraceCell])),
  'Both spawns should reach the central terrace.');
assert.equal(spawnCosts[0][terraceCell], spawnCosts[1][terraceCell],
  'Central terrace travel cost should match between both seats.');
for (const [name, cell] of [['north', northApproachCell], ['south', southApproachCell]]) {
  assert.ok(spawnCosts.every(costs => Number.isFinite(costs[cell])),
    `Both spawns should reach the ${name} approach.`);
  assert.equal(spawnCosts[0][cell], spawnCosts[1][cell],
    `The ${name} approach travel cost should match between both seats.`);
}
for (const node of resources) {
  const cell = pointCell(node);
  assert.ok(spawnCosts.every(costs => Number.isFinite(costs[cell])),
    `${node.id} should be reachable from both seats.`);
}

if (process.argv.includes('--write')) {
  throw new Error('Highland Grove stays preview-only until Gameplay supports trade nodes on the server.');
}
console.log(JSON.stringify({
  map: definition.id,
  size: `${WIDTH} × ${HEIGHT}`,
  forestCells: forestCount,
  forestPercent: Number(forestPercent.toFixed(1)),
  ordinaryResources: resources.length - 1,
  specialtyNode: resources.find(node => node.species === 'coffee'),
  elevationPatches: elevationPatches.length,
  terrainCostToTerrace: [spawnCosts[0][terraceCell], spawnCosts[1][terraceCell]],
  terrainCostToNorthApproach: [spawnCosts[0][northApproachCell], spawnCosts[1][northApproachCell]],
  terrainCostToSouthApproach: [spawnCosts[0][southApproachCell], spawnCosts[1][southApproachCell]],
  output: 'preview only; map JSON not written',
}, null, 2));
