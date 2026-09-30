import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { findUnreachableResourceNode, findUnreachableCaptureZone,
  findInvalidCapturePrerequisite, findInvalidScenarioEventChain } from '../src/map-utils.mjs';
import { validateScenarioRegions } from '../src/scenario-regions.mjs';
import { townCenterFootprintCells } from '../src/town-center-spawn.mjs';

const map = JSON.parse(await readFile(new URL('../maps/fortified-crossing.json', import.meta.url)));
const { width, height } = map;
const terrain = new Uint8Array(width * height);
for (const obstacle of map.obstacles) {
  for (let y = obstacle.row; y < obstacle.row + obstacle.height; y++) {
    for (let x = obstacle.column; x < obstacle.column + obstacle.width; x++) {
      assert.equal(terrain[y * width + x], 0, 'authored obstacles must not overlap');
      terrain[y * width + x] = 1;
    }
  }
}
for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
  assert.equal(terrain[y * width + x], terrain[y * width + width - x - 1], 'routes must mirror');
}
const occupied = terrain.slice();
for (const team of [0, 1]) for (const cell of townCenterFootprintCells(map.spawnPoints, team, width, height)) {
  assert.equal(terrain[cell], 0, 'home footprint must fit open terrain'); occupied[cell] = 1;
}
assert.equal(findUnreachableResourceNode(width, height, occupied, map.spawnPoints, map.resourceNodes), null);
assert.equal(findUnreachableCaptureZone(width, height, occupied, map.spawnPoints, map.triggers), null);
assert.equal(findInvalidCapturePrerequisite(map.triggers), null);
assert.equal(findInvalidScenarioEventChain(map.scenarioEvents), null);
validateScenarioRegions(map);
for (const node of map.resourceNodes) assert.ok(map.resourceNodes.some(other =>
  other.id !== node.id && other.x === -node.x && other.z === node.z
  && other.type === node.type && other.stock === node.stock), 'resource opportunities must mirror');
function distanceTo(zone, spawn) {
  const start = Math.floor(spawn.z + height / 2) * width + Math.floor(spawn.x + width / 2);
  const distances = new Int32Array(width * height).fill(-1); distances[start] = 0;
  const queue = [start];
  for (let at = 0; at < queue.length; at++) {
    const cell = queue[at], x = cell % width, y = Math.floor(cell / width);
    if (x >= zone.column && x < zone.column + zone.width && y >= zone.row && y < zone.row + zone.height) return distances[cell];
    for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
      const next = ny * width + nx;
      if (nx < 0 || nx >= width || ny < 0 || ny >= height || occupied[next] || distances[next] !== -1) continue;
      distances[next] = distances[cell] + 1; queue.push(next);
    }
  }
  return Infinity;
}
const routes = [...map.triggers, ...map.regions].map(item => {
  const distances = map.spawnPoints.map(spawn => distanceTo(item.zone, spawn));
  assert.ok(Number.isFinite(distances[0]), `${item.id} is reachable with home collision`);
  assert.equal(distances[0], distances[1], `${item.id} offers equal route distance`);
  return { id: item.id, distances };
});
assert.ok(map.summary.length <= 120);
console.log(JSON.stringify({ map: map.id, result: 'pass', routes, homeCollisionIncluded: true }));
