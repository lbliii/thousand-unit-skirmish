import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { shoreReedPositions } from '../src/shore-vegetation.mjs';

const map = JSON.parse(readFileSync(new URL('../maps/siltmouths-reed-crossings.json', import.meta.url)));
const original = JSON.stringify(map);
const plants = shoreReedPositions(map);
assert.ok(plants.length > 0 && plants.length < 150, 'the shipped channels need sparse visible reeds');
assert.equal(JSON.stringify(map), original, 'decoration must not alter passability or resources');
assert.deepEqual(shoreReedPositions(map), plants, 'reloads retain seeded placement');
assert.notDeepEqual(shoreReedPositions({ ...map, terrainSeed: map.terrainSeed + 1 }), plants,
  'different map seeds vary placement');
assert.equal(new Set(plants.map(p => p.cell)).size, plants.length, 'a water cell holds at most one clump');
const wet = (column, row) => map.obstacles.some(o => o.material === 'water'
  && column >= o.column && column < o.column + o.width && row >= o.row && row < o.row + o.height);
for (const p of plants) {
  const column = Math.floor(p.x + map.width / 2), row = Math.floor(p.z + map.height / 2);
  assert.ok(wet(column, row), 'roots must remain in existing blocked water');
  assert.equal(row * map.width + column, p.cell);
  assert.ok(map.obstacles.some(o => o.material === 'water' && column >= o.column && column < o.column + o.width
    && row > o.row && row < o.row + o.height - 1), 'channel end cells stay clear beside dry crossings');
}
const pond = { width: 20, height: 20, terrainSeed: 12,
  obstacles: [{ column: 3, row: 3, width: 14, height: 14, material: 'water' }] };
const pondPlants = shoreReedPositions(pond);
assert.ok(pondPlants.length > 0);
assert.ok(pondPlants.every(p => {
  const x = p.cell % 20, z = Math.floor(p.cell / 20);
  return x === 3 || x === 16 || z === 3 || z === 16;
}), 'open water interiors stay undecorated');
assert.deepEqual(shoreReedPositions({ ...pond, obstacles: [...pond.obstacles, ...pond.obstacles] }), pondPlants,
  'overlapping water patches do not duplicate decoration');
assert.deepEqual(shoreReedPositions({ width: 10, height: 10, obstacles: [] }), []);
assert.deepEqual(shoreReedPositions({ width: 10, height: 10,
  obstacles: [{ column: 0, row: 0, width: 10, height: 10, material: 'water' }] }), [],
  'map boundaries alone are not shores');
assert.deepEqual(shoreReedPositions({ width: 10, height: 10,
  obstacles: [{ column: 3, row: 3, width: 1, height: 1, material: 'water' }] }), [],
  'tiny water endpoints remain uncluttered');
console.log(`Shore vegetation passed: ${plants.length} seeded clumps inside existing Siltmouths water cells.`);
