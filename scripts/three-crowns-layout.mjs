import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const map = JSON.parse(await readFile(path.join(root, 'maps/three-crowns.json'), 'utf8'));
assert.equal(map.id, 'three-crowns');
const { width, height } = map;
assert.deepEqual([width, height], [64, 64]);
const blocked = new Uint8Array(width * height);

for (const obstacle of map.obstacles) {
  for (let row = obstacle.row; row < obstacle.row + obstacle.height; row++) {
    for (let column = obstacle.column; column < obstacle.column + obstacle.width; column++) {
      const index = row * width + column;
      assert.equal(blocked[index], 0, 'terrain blocks must not overlap');
      blocked[index] = 1;
    }
  }
}

for (let row = 0; row < height; row++) {
  for (let column = 0; column < width; column++) {
    assert.equal(blocked[row * width + column],
      blocked[row * width + width - column - 1],
      'terrain must mirror across the team axis at ' + column + ',' + row);
  }
}

function cell(x, z) {
  const column = Math.floor(x + width / 2);
  const row = Math.floor(z + height / 2);
  assert.ok(column >= 0 && column < width && row >= 0 && row < height,
    'map marker must be inside the grid');
  return { column, row };
}

const spawns = [...map.spawnPoints].sort((left, right) => left.team - right.team);
assert.deepEqual(spawns.map((spawn) => [spawn.team, spawn.x, spawn.z]),
  [[0, -20.5, 0.5], [1, 20.5, 0.5]]);
const spawnCells = spawns.map((spawn) => cell(spawn.x, spawn.z));
assert.equal(spawnCells[0].column + spawnCells[1].column, width - 1,
  'team spawn cells must be mirrored');
assert.equal(spawnCells[0].row, spawnCells[1].row,
  'team spawn rows must match');

function distanceToZone(start, zone) {
  const distances = new Int32Array(width * height).fill(-1);
  const startIndex = start.row * width + start.column;
  assert.equal(blocked[startIndex], 0, 'spawn cell must be open');
  const queue = new Int32Array(width * height);
  queue[0] = startIndex;
  distances[startIndex] = 0;
  let tail = 1;

  for (let head = 0; head < tail; head++) {
    const index = queue[head];
    const column = index % width;
    const row = Math.floor(index / width);
    if (column >= zone.column && column < zone.column + zone.width
      && row >= zone.row && row < zone.row + zone.height) return distances[index];

    for (const [nextColumn, nextRow] of [
      [column - 1, row], [column + 1, row], [column, row - 1], [column, row + 1],
    ]) {
      if (nextColumn < 0 || nextColumn >= width || nextRow < 0 || nextRow >= height) continue;
      const next = nextRow * width + nextColumn;
      if (blocked[next] || distances[next] >= 0) continue;
      distances[next] = distances[index] + 1;
      queue[tail++] = next;
    }
  }
  return Infinity;
}

const objectiveRoutes = map.triggers.map((trigger) => {
  const routes = spawnCells.map((spawn) => distanceToZone(spawn, trigger.zone));
  assert.ok(routes.every(Number.isFinite), trigger.name + ' must be reachable from both starts');
  assert.equal(routes[0], routes[1], trigger.name + ' must have equal route distance');
  return { id: trigger.id, team0: routes[0], team1: routes[1] };
});

const homeNodes = {
  azure: ['azure-berries', 'azure-timber'],
  ember: ['ember-berries', 'ember-timber'],
};
const resourceById = new Map(map.resourceNodes.map((node) => [node.id, node]));
for (const [azureId, emberId] of [
  ['azure-berries', 'ember-berries'],
  ['azure-timber', 'ember-timber'],
]) {
  const azure = resourceById.get(azureId);
  const ember = resourceById.get(emberId);
  assert.ok(azure && ember, 'both mirrored home resources must exist');
  assert.equal(azure.type, ember.type, 'mirrored home resources must have the same type');
  assert.equal(azure.stock, 350, 'home resources must retain 350 stock');
  assert.equal(ember.stock, 350, 'home resources must retain 350 stock');
  const azureCell = cell(azure.x, azure.z);
  const emberCell = cell(ember.x, ember.z);
  assert.equal(azureCell.column + emberCell.column, width - 1,
    'home resource cells must be mirrored');
  assert.equal(azureCell.row, emberCell.row,
    'home resource rows must match');
}
const homeResourceRoutes = {};
for (const type of ['food', 'wood']) {
  const routes = spawns.map((_, team) => {
    const id = homeNodes[team === 0 ? 'azure' : 'ember'][type === 'food' ? 0 : 1];
    const node = resourceById.get(id);
    assert.ok(node && node.type === type, 'expected home resource ' + id);
    const nodeCell = cell(node.x, node.z);
    return distanceToZone(spawnCells[team], {
      column: nodeCell.column, row: nodeCell.row, width: 1, height: 1,
    });
  });
  assert.ok(routes.every(Number.isFinite), 'home ' + type + ' resources must be reachable');
  assert.equal(routes[0], routes[1], 'home ' + type + ' routes must match');
  homeResourceRoutes[type] = routes;
}

const marketResources = [
  { id: 'north-market-food', type: 'food' },
  { id: 'south-market-wood', type: 'wood' },
];
const marketRoutes = marketResources.map(({ id, type }) => {
  const node = resourceById.get(id);
  assert.ok(node && node.type === type, 'missing neutral market resource ' + id);
  assert.equal(node.stock, 500, 'neutral market resources must retain 500 stock');
  const nodeCell = cell(node.x, node.z);
  const teams = spawnCells.map((spawn) => distanceToZone(spawn, {
    column: nodeCell.column, row: nodeCell.row, width: 1, height: 1,
  }));
  assert.ok(teams.every(Number.isFinite), 'neutral market resources must be reachable');
  return { id, teams };
});
const marketTotals = spawnCells.map((spawn, team) => marketRoutes.reduce(
  (total, route) => total + route.teams[team], 0,
));
assert.equal(marketTotals[0], marketTotals[1],
  'the two central market resources must have equal combined route cost');

const armySize = map.startingArmySize ?? 1000;
assert.equal(armySize, 1000, 'Three Crowns retains its 1,000-unit opening');
const teamSize = armySize / 2;
const columns = Math.ceil(Math.sqrt(teamSize * 1.3));
const rows = Math.ceil(teamSize / columns);
const spacing = armySize > 1000 ? 0.68 : 0.88;
const workerOffsets = [[-1.1, -0.9], [1.1, -0.9], [-1.1, 0.9], [1.1, 0.9]];
const roundHundredth = (value) => Math.round(value * 100) / 100;
const formations = [];
for (const spawn of spawns) {
  const points = [];
  for (let slot = 0; slot < teamSize; slot++) {
    const column = slot % columns;
    const row = Math.floor(slot / columns);
    const offset = workerOffsets[slot];
    const x = spawn.x + (offset?.[0] ?? (column - (columns - 1) / 2) * spacing);
    const z = spawn.z + (offset?.[1] ?? (row - (rows - 1) / 2) * spacing);
    assert.ok(Math.abs(x) < width / 2 && Math.abs(z) < height / 2,
      'initial team formation must fit inside the playfield');
    const position = cell(x, z);
    assert.equal(blocked[position.row * width + position.column], 0,
      'initial team formation must begin on open terrain');
    points.push({ x, z });
  }
  formations.push({
    minX: roundHundredth(Math.min(...points.map((point) => point.x))),
    maxX: roundHundredth(Math.max(...points.map((point) => point.x))),
    minZ: roundHundredth(Math.min(...points.map((point) => point.z))),
    maxZ: roundHundredth(Math.max(...points.map((point) => point.z))),
  });
}
const [azureFormation, emberFormation] = formations;
const hundredth = (value) => Math.round(value * 100);
assert.equal(hundredth(azureFormation.minX), -hundredth(emberFormation.maxX),
  'the team formation envelopes must mirror across the map');
assert.equal(hundredth(azureFormation.maxX), -hundredth(emberFormation.minX),
  'the team formation envelopes must mirror across the map');
assert.equal(hundredth(azureFormation.minZ), hundredth(emberFormation.minZ),
  'the team formation rows must match');
assert.equal(hundredth(azureFormation.maxZ), hundredth(emberFormation.maxZ),
  'the team formation rows must match');

console.log(JSON.stringify({
  status: 'passed',
  map: map.id,
  spawnCells,
  armySize,
  armyFormation: {
    columns, rows,
    worldBounds: {
      team0: azureFormation,
      team1: emberFormation,
    },
  },
  objectiveRoutes,
  homeResourceRoutes,
  marketRoutes,
  marketTotals,
}, null, 2));
