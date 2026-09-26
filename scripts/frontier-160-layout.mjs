import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findUnreachableCaptureZone, findUnreachableResourceNode } from '../src/map-utils.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const map = JSON.parse(await readFile(path.join(ROOT, 'maps/frontier-160.json'), 'utf8'));
const { width, height } = map;
assert.equal(map.id, 'frontier-160');
assert.equal(width, 160);
assert.equal(height, 160);
assert.equal(map.elevationPatches, undefined,
  'the large-map pilot stays flat while leaving elevation to its separate scenario slice');

const cellCount = width * height;
const blocked = new Uint8Array(cellCount);
const forestCells = new Uint8Array(cellCount);
const waterByRow = new Uint16Array(height);
for (const obstacle of map.obstacles) {
  assert.ok(['stone', 'forest', 'water'].includes(obstacle.material));
  assert.ok([obstacle.column, obstacle.row, obstacle.width, obstacle.height].every(Number.isInteger));
  assert.ok(obstacle.column >= 0 && obstacle.row >= 0 && obstacle.width > 0 && obstacle.height > 0);
  assert.ok(obstacle.column + obstacle.width <= width && obstacle.row + obstacle.height <= height);
  for (let row = obstacle.row; row < obstacle.row + obstacle.height; row++) {
    for (let column = obstacle.column; column < obstacle.column + obstacle.width; column++) {
      const index = row * width + column;
      assert.equal(blocked[index], 0, `obstacles overlap at ${column},${row}`);
      blocked[index] = 1;
      if (obstacle.material === 'forest') forestCells[index] = 1;
      if (obstacle.material === 'water') waterByRow[row]++;
    }
  }
}

const forestCount = forestCells.reduce((sum, value) => sum + value, 0);
const forestPercent = forestCount / cellCount * 100;
assert.ok(forestPercent >= 12 && forestPercent <= 20,
  `woodland coverage ${forestPercent.toFixed(2)}% should stay within the 12–20% pilot range`);
assert.ok(Math.max(...waterByRow) >= 16,
  'the river basin should include a lake or widened reach with a visible shore');
assert.ok(map.obstacles.filter(obstacle => obstacle.material === 'forest').length > 80,
  'woodlands should be authored as shaped masses rather than a few filled rectangles');

const terrain = new Array(cellCount).fill(map.terrainBase);
const terrainMaterials = new Set([map.terrainBase]);
for (const patch of map.terrainPatches) {
  assert.ok([patch.column, patch.row, patch.width, patch.height].every(Number.isInteger));
  assert.ok(patch.column >= 0 && patch.row >= 0 && patch.width > 0 && patch.height > 0);
  assert.ok(patch.column + patch.width <= width && patch.row + patch.height <= height);
  terrainMaterials.add(patch.material);
  for (let row = patch.row; row < patch.row + patch.height; row++) {
    for (let column = patch.column; column < patch.column + patch.width; column++) {
      const index = row * width + column;
      assert.equal(terrain[index], map.terrainBase,
        `ground patches overlap at ${column},${row}`);
      terrain[index] = patch.material;
    }
  }
}
for (const material of ['long-grass', 'short-grass', 'dirt', 'sand', 'scree']) {
  assert.ok(terrainMaterials.has(material), `the map should use its ${material} region material`);
}

const byId = new Map(map.resourceNodes.map(node => [node.id, node]));
assert.equal(map.resourceNodes.length, 64);
assert.equal(map.resourceNodes.filter(node => node.type === 'food').length, 32);
assert.equal(map.resourceNodes.filter(node => node.type === 'wood').length, 32);
for (const region of ['start', 'expansion', 'contested']) {
  assert.ok(map.resourceNodes.some(node => node.id.startsWith(`${region}-azure-`)),
    `the Azure ${region} resource pocket should exist`);
  assert.ok(map.resourceNodes.some(node => node.id.startsWith(`${region}-ember-`)),
    `the Ember ${region} resource pocket should exist`);
}
assert.equal(map.resourceNodes.filter(node => node.id.startsWith('start-')).length, 16);
assert.equal(map.resourceNodes.filter(node => node.id.startsWith('expansion-')).length, 24);
assert.equal(map.resourceNodes.filter(node => node.id.startsWith('contested-')).length, 24);
for (let pair = 1; pair <= 4; pair++) {
  const node = byId.get(`expansion-azure-wood-${String(pair).padStart(2, '0')}`);
  assert.ok(node, `woodland-edge resource pair ${pair} should exist`);
  const [column, row] = cellForPoint(node);
  let nextToWoodland = false;
  for (let y = Math.max(0, row - 3); y <= Math.min(height - 1, row + 3); y++) {
    for (let x = Math.max(0, column - 3); x <= Math.min(width - 1, column + 3); x++) {
      if (forestCells[y * width + x]) nextToWoodland = true;
    }
  }
  assert.ok(nextToWoodland, `${node.id} should be harvestable beside the woodland edge`);
}

function cellForPoint(point) {
  return [Math.floor(point.x + width / 2), Math.floor(point.z + height / 2)];
}
function distancesFrom(point) {
  const [column, row] = cellForPoint(point);
  const distances = new Int32Array(cellCount).fill(-1);
  const queue = new Int32Array(cellCount);
  let head = 0;
  let tail = 0;
  const start = row * width + column;
  assert.equal(blocked[start], 0, `team ${point.team} spawn should be open`);
  distances[start] = 0;
  queue[tail++] = start;
  while (head < tail) {
    const cell = queue[head++];
    const x = cell % width;
    const y = Math.floor(cell / width);
    for (const next of [
      x > 0 ? cell - 1 : -1,
      x + 1 < width ? cell + 1 : -1,
      y > 0 ? cell - width : -1,
      y + 1 < height ? cell + width : -1,
    ]) {
      if (next < 0 || blocked[next] || distances[next] >= 0) continue;
      distances[next] = distances[cell] + 1;
      queue[tail++] = next;
    }
  }
  return distances;
}

const spawns = [...map.spawnPoints].sort((a, b) => a.team - b.team);
assert.equal(spawns.length, 2);
assert.equal(spawns[0].x, -spawns[1].x);
assert.equal(spawns[0].z, spawns[1].z);
const unitsPerTeam = map.startingArmySize / 2;
const armyColumns = Math.ceil(Math.sqrt(unitsPerTeam * 1.3));
const armyRows = Math.ceil(unitsPerTeam / armyColumns);
const armyHalfWidth = (armyColumns - 1) * 0.68 / 2;
const armyHalfHeight = (armyRows - 1) * 0.68 / 2;
for (const spawn of spawns) {
  const [column, row] = cellForPoint(spawn);
  for (let y = row - 5; y <= row + 5; y++) {
    for (let x = column - 5; x <= column + 5; x++) {
      assert.equal(blocked[y * width + x], 0,
        `team ${spawn.team} needs a clear base and initial formation area`);
    }
  }
  for (const node of map.resourceNodes) {
    assert.ok(Math.abs(node.x - spawn.x) > armyHalfWidth + 0.5
      || Math.abs(node.z - spawn.z) > armyHalfHeight + 0.5,
    `${node.id} should sit outside team ${spawn.team}'s starting army footprint`);
  }
}

assert.equal(findUnreachableResourceNode(
  width, height, blocked, spawns, map.resourceNodes,
), null, 'both starts should reach every food and wood site');
assert.equal(findUnreachableCaptureZone(
  width, height, blocked, spawns, map.triggers,
), null, 'both starts should reach all three contested crossings');
const spawnDistances = spawns.map(spawn => distancesFrom(spawn));
for (const node of map.resourceNodes) {
  const mirrorId = node.id.includes('-azure-')
    ? node.id.replace('-azure-', '-ember-') : node.id.replace('-ember-', '-azure-');
  const mirror = byId.get(mirrorId);
  assert.ok(mirror, `${node.id} should have a matching other-seat resource`);
  assert.equal(mirror.type, node.type);
  assert.equal(mirror.stock, node.stock);
  assert.equal(mirror.x, -node.x);
  assert.equal(mirror.z, node.z);
  const ownTeamIndex = node.id.includes('-azure-') ? 0 : 1;
  const otherTeamIndex = 1 - ownTeamIndex;
  const [column, row] = cellForPoint(node);
  const [mirrorColumn, mirrorRow] = cellForPoint(mirror);
  assert.equal(spawnDistances[ownTeamIndex][row * width + column],
    spawnDistances[otherTeamIndex][mirrorRow * width + mirrorColumn],
    `${node.id} and ${mirrorId} should provide equal travel from their home starts`);
}

function distanceToZone(distances, zone) {
  let best = Infinity;
  for (let row = zone.row; row < zone.row + zone.height; row++) {
    for (let column = zone.column; column < zone.column + zone.width; column++) {
      const distance = distances[row * width + column];
      if (distance >= 0) best = Math.min(best, distance);
    }
  }
  return best;
}
const objectiveDistances = map.triggers.map(trigger => (
  spawnDistances.map(distances => distanceToZone(distances, trigger.zone))
));
for (const [index, [azureDistance, emberDistance]] of objectiveDistances.entries()) {
  assert.ok(Number.isFinite(azureDistance), `${map.triggers[index].id} should be reachable`);
  assert.equal(azureDistance, emberDistance,
    `${map.triggers[index].id} should have equal shortest travel from both starts`);
  const { zone } = map.triggers[index];
  for (let row = zone.row; row < zone.row + zone.height; row++) {
    for (let column = zone.column; column < zone.column + zone.width; column++) {
      assert.equal(blocked[row * width + column], 0,
        `${map.triggers[index].id} should be a fully open contest area`);
    }
  }
}

for (const row of [51, 52, 53, 54, 55, 77, 78, 79, 80, 81, 104, 105, 106, 107, 108]) {
  for (let column = 0; column < width; column++) {
    assert.equal(blocked[row * width + column], 0,
      `wide route row ${row} should stay open from one map edge to the other`);
  }
}

console.log(JSON.stringify({
  status: 'passed',
  map: map.id,
  dimensions: `${width} × ${height}`,
  forestCells: forestCount,
  forestPercent: Number(forestPercent.toFixed(2)),
  waterCells: waterByRow.reduce((sum, count) => sum + count, 0),
  resources: { total: map.resourceNodes.length, food: 32, wood: 32, byRegion: { start: 16, expansion: 24, contested: 24 } },
  objectiveDistances,
  wideRoutes: [51, 77, 104],
  startingArmyFootprint: { unitsPerTeam, columns: armyColumns, rows: armyRows },
}, null, 2));
