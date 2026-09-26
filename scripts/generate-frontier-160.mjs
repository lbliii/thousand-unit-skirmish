import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT_PATH = path.join(ROOT, 'maps', 'frontier-160.json');
const WIDTH = 160;
const HEIGHT = 160;
const CELL_COUNT = WIDTH * HEIGHT;
const obstaclesByCell = new Array(CELL_COUNT).fill(null);
const lowStoneCells = new Uint8Array(CELL_COUNT);
const groundByCell = new Array(CELL_COUNT).fill(null);

function index(column, row) {
  return row * WIDTH + column;
}

function inside(column, row) {
  return column >= 0 && column < WIDTH && row >= 0 && row < HEIGHT;
}

function addObstacleCell(column, row, material) {
  if (!inside(column, row)) return;
  const cell = index(column, row);
  assert.equal(obstaclesByCell[cell], null,
    `Obstacle overlap at ${column},${row}: ${obstaclesByCell[cell]} and ${material}`);
  obstaclesByCell[cell] = material;
}

function addObstacleRectangle(column, row, width, height, material) {
  for (let y = row; y < row + height; y++) {
    for (let x = column; x < column + width; x++) addObstacleCell(x, y, material);
  }
}

function mirrorRectangle(column, row, width, height, material) {
  addObstacleRectangle(column, row, width, height, material);
  addObstacleRectangle(WIDTH - column - width, row, width, height, material);
}

function setGround(column, row, material) {
  if (inside(column, row)) groundByCell[index(column, row)] = material;
}

function paintGroundRectangle(column, row, width, height, material) {
  for (let y = row; y < row + height; y++) {
    for (let x = column; x < column + width; x++) setGround(x, y, material);
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

// A broad blocked stream widens into a lake north of the three open fords.
const fordRows = [[43, 58], [74, 90], [102, 119]];
for (let row = 0; row < HEIGHT; row++) {
  const isFord = fordRows.some(([start, end]) => row >= start && row < end);
  if (!isFord) {
    const width = row % 29 < 5 ? 6 : 4;
    const startColumn = (WIDTH - width) / 2;
    for (let column = startColumn; column < startColumn + width; column++) {
      addObstacleCell(column, row, 'water');
    }
  }
  const normalizedZ = (row - 26) / 9;
  if (normalizedZ * normalizedZ <= 1) {
    for (let column = 0; column < WIDTH; column++) {
      const dx = Math.abs(column - 79.5) / 11;
      const dz = (row - 26) / 9;
      if (dx * dx + dz * dz <= 1 && obstaclesByCell[index(column, row)] === null) {
        addObstacleCell(column, row, 'water');
      }
    }
  }
}

// Eight lobes form four irregular woodlands. Each mass has small inner
// clearings and a sinuous boundary instead of a filled rectangle.
const westernWoodlandLobes = [
  { column: 25, row: 29, radiusX: 15, radiusZ: 12 },
  { column: 51, row: 34, radiusX: 14, radiusZ: 13 },
  { column: 25, row: 131, radiusX: 15, radiusZ: 12 },
  { column: 51, row: 126, radiusX: 14, radiusZ: 13 },
];
for (const lobe of westernWoodlandLobes) {
  for (const column of [lobe.column, WIDTH - 1 - lobe.column]) {
    for (let row = 0; row < HEIGHT; row++) {
      for (let cellColumn = 0; cellColumn < WIDTH; cellColumn++) {
        const dx = (cellColumn - column) / lobe.radiusX;
        const dz = (row - lobe.row) / lobe.radiusZ;
        const symmetricColumn = Math.min(cellColumn, WIDTH - 1 - cellColumn);
        const edge = 0.065 * Math.sin(symmetricColumn * 0.43 + row * 0.21)
          + 0.045 * Math.cos(symmetricColumn * 0.19 - row * 0.37);
        const clearing = ((cellColumn - column) ** 2 / 16) + ((row - lobe.row) ** 2 / 9) < 1;
        if (dx * dx + dz * dz <= 1 + edge && !clearing
          && obstaclesByCell[index(cellColumn, row)] === null) {
          addObstacleCell(cellColumn, row, 'forest');
        }
      }
    }
  }
}

// Matched highland shelves use medium ridges; outer pairs stay low enough for boulder scatter.
for (const [column, row, width, height] of [
  [67, 36, 3, 5], [67, 120, 3, 5], [13, 57, 3, 5], [13, 98, 3, 5],
]) {
  mirrorRectangle(column, row, width, height, 'stone');
  if (column === 13) {
    for (const startColumn of [column, WIDTH - column - width]) {
      for (let y = row; y < row + height; y++) {
        for (let x = startColumn; x < startColumn + width; x++) lowStoneCells[index(x, y)] = 1;
      }
    }
  }
}

const terrainBase = 'meadow';
paintGroundRectangle(0, 0, WIDTH, 15, 'long-grass');
paintGroundRectangle(0, HEIGHT - 15, WIDTH, 15, 'long-grass');
for (const [column, row] of [[24, 80], [WIDTH - 1 - 24, 80]]) {
  paintGroundRectangle(column - 10, row - 10, 21, 20, 'short-grass');
}
for (const row of [51, 77, 104]) paintGroundRectangle(0, row, WIDTH, 5, 'dirt');
for (const [column, row] of [[13, 15], [146, 15], [13, 144], [146, 144]]) {
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const dx = (x - column) / 10;
      const dz = (y - row) / 8;
      if (dx * dx + dz * dz <= 1) setGround(x, y, 'scree');
    }
  }
}
for (let row = 13; row < 39; row++) {
  for (let column = 64; column < 96; column++) {
    const dx = Math.abs(column - 79.5) / 13;
    const dz = (row - 26) / 11;
    const lakeDistance = (dx * dx + dz * dz) ** 0.5;
    if (lakeDistance >= 0.87 && lakeDistance <= 1.28) setGround(column, row, 'sand');
  }
}

const resources = [];
const resourceCellKeys = new Set();
const pairCounters = { start: { food: 0, wood: 0 }, expansion: { food: 0, wood: 0 }, contested: { food: 0, wood: 0 } };
function addResourcePair(region, type, column, row, stock) {
  const pair = String(++pairCounters[region][type]).padStart(2, '0');
  const mirroredColumn = WIDTH - 1 - column;
  for (const [teamName, cellColumn] of [['azure', column], ['ember', mirroredColumn]]) {
    const cellKey = `${cellColumn},${row}`;
    assert.equal(resourceCellKeys.has(cellKey), false, `Duplicate resource cell ${cellKey}`);
    assert.equal(obstaclesByCell[index(cellColumn, row)], null,
      `Resource ${region}-${teamName}-${type}-${pair} is on ${obstaclesByCell[index(cellColumn, row)]}`);
    resourceCellKeys.add(cellKey);
    resources.push({
      id: `${region}-${teamName}-${type}-${pair}`,
      type,
      x: cellColumn + 0.5 - WIDTH / 2,
      z: row + 0.5 - HEIGHT / 2,
      stock,
    });
  }
}

for (const [type, stock, points] of [
  ['food', 360, [[34, 72], [40, 75], [34, 88], [42, 89]]],
  ['wood', 360, [[34, 82], [42, 80], [38, 93], [45, 74]]],
]) {
  for (const [column, row] of points) addResourcePair('start', type, column, row, stock);
}
for (const [type, stock, points] of [
  ['food', 300, [[22, 55], [45, 57], [59, 64], [45, 96], [59, 95], [22, 105]]],
  ['wood', 320, [[24, 44], [51, 48], [25, 117], [52, 112], [62, 60], [62, 99]]],
]) {
  for (const [column, row] of points) addResourcePair('expansion', type, column, row, stock);
}
for (const [type, stock, points] of [
  ['food', 260, [[67, 46], [68, 63], [72, 70], [72, 93], [68, 116], [67, 105]]],
  ['wood', 260, [[65, 51], [70, 64], [74, 69], [74, 94], [70, 115], [65, 110]]],
]) {
  for (const [column, row] of points) addResourcePair('contested', type, column, row, stock);
}
resources.sort((a, b) => a.id.localeCompare(b.id));

const forestCells = obstaclesByCell.filter(material => material === 'forest').length;
const waterCells = obstaclesByCell.filter(material => material === 'water').length;
const forestPercent = forestCells / CELL_COUNT * 100;
assert.ok(forestPercent >= 12 && forestPercent <= 20,
  `Forest coverage ${forestPercent.toFixed(1)}% must be within the 12–20% pilot target.`);
assert.equal(resources.length, 64, 'Frontier Reach should contain 64 food and wood sites.');
assert.equal(resources.filter(node => node.type === 'food').length, 32);
assert.equal(resources.filter(node => node.type === 'wood').length, 32);

const obstacles = compressCells(obstaclesByCell, value => value !== null)
  .map(({ column, row, width, height, value: material }) => {
    const obstacle = { column, row, width, height, material };
    if (material === 'stone') {
      obstacle.elevation = lowStoneCells[index(column, row)] ? 0.72 : 1.12;
    }
    return obstacle;
  });
const terrainPatches = compressCells(groundByCell, value => value !== null)
  .map(({ column, row, width, height, value: material }) => ({ column, row, width, height, material }));
const map = {
  id: 'frontier-160',
  name: 'FRONTIER REACH',
  summary: 'Expand through shaped woodlands, harvest the river basin, and contest three wide crossings.',
  width: WIDTH,
  height: HEIGHT,
  terrainSeed: 4187,
  terrainBase,
  terrainPatches,
  startingArmySize: 1000,
  startingResources: { food: 200, wood: 150 },
  fogOfWar: true,
  victoryMode: 'any',
  victoryHoldSeconds: 20,
  spawnPoints: [
    { team: 0, x: 24.5 - WIDTH / 2, z: 80.5 - HEIGHT / 2 },
    { team: 1, x: WIDTH - 1 - 24 + 0.5 - WIDTH / 2, z: 80.5 - HEIGHT / 2 },
  ],
  resourceNodes: resources,
  obstacles,
  triggers: [
    {
      id: 'north-crossing', name: 'North Crossing', type: 'capture-zone',
      zone: { column: 74, row: 47, width: 12, height: 11 },
      requiredUnits: 16, captureSeconds: 8, foodReward: 100, woodReward: 75,
      victory: true, message: '{team} SECURED THE NORTH CROSSING',
    },
    {
      id: 'river-ford', name: 'River Ford', type: 'capture-zone',
      zone: { column: 74, row: 76, width: 12, height: 11 },
      requiredUnits: 16, captureSeconds: 8, foodReward: 100, woodReward: 75,
      victory: true, message: '{team} SECURED THE RIVER FORD',
    },
    {
      id: 'south-crossing', name: 'South Crossing', type: 'capture-zone',
      zone: { column: 74, row: 103, width: 12, height: 11 },
      requiredUnits: 16, captureSeconds: 8, foodReward: 100, woodReward: 75,
      victory: true, message: '{team} SECURED THE SOUTH CROSSING',
    },
  ],
};

await writeFile(OUTPUT_PATH, `${JSON.stringify(map, null, 2)}\n`);
console.log(JSON.stringify({
  status: 'generated',
  map: map.id,
  output: path.relative(ROOT, OUTPUT_PATH),
  cells: CELL_COUNT,
  forestCells,
  forestPercent: Number(forestPercent.toFixed(2)),
  waterCells,
  foodNodes: 32,
  woodNodes: 32,
  resourceNodes: resources.length,
  obstacles: obstacles.length,
  groundPatches: terrainPatches.length,
  objectives: map.triggers.map(trigger => trigger.id),
}, null, 2));
