import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gardenPlantPositions } from '../src/garden-vegetation.mjs';

const map = JSON.parse(readFileSync(new URL('../maps/ellionar-channel-gardens.json', import.meta.url)));
const original = JSON.stringify(map), plants = gardenPlantPositions(map);
assert.ok(plants.length >= 10 && plants.length < 80, 'channel gardens need sparse beds');
assert.equal(JSON.stringify(map), original);
assert.deepEqual(gardenPlantPositions(map), plants);
assert.notDeepEqual(gardenPlantPositions({ ...map, terrainSeed: map.terrainSeed + 1 }), plants);
assert.equal(new Set(plants.map(p => p.cell)).size, plants.length);
const contains = (o, c, r, margin = 0) => c >= o.column - margin && c < o.column + o.width + margin
  && r >= o.row - margin && r < o.row + o.height + margin;
for (const p of plants) {
  const c = Math.floor(p.x + map.width / 2), r = Math.floor(p.z + map.height / 2);
  assert.equal(r * map.width + c, p.cell);
  assert.ok(!map.obstacles.some(o => contains(o, c, r, o.material === 'water' ? 0 : 1)));
  assert.ok(!map.triggers.some(t => t.zone && contains(t.zone, c, r, 1)));
  let material = map.terrainBase;
  for (const patch of map.terrainPatches) if (contains(patch, c, r)) material = patch.material;
  assert.equal(material, 'garden-loam');
  assert.ok(map.spawnPoints.every(s => Math.hypot(p.x - s.x, p.z - s.z) >= 8));
  assert.ok(map.resourceNodes.every(s => Math.hypot(p.x - s.x, p.z - s.z) >= 2.5));
}
const bank = { width: 32, height: 32, terrainBase: 'garden-loam', terrainSeed: 93004,
  obstacles: [{ column: 15, row: 2, width: 2, height: 28, material: 'water' }] };
const flowers = gardenPlantPositions(bank);
assert.ok(flowers.length > 0);
for (const p of flowers) {
  const c = p.cell % 32, r = Math.floor(p.cell / 32);
  assert.ok([14,17].includes(c) && r >= 4 && r <= 27, 'channel endpoints stay clear');
}
assert.equal(gardenPlantPositions({ ...bank, obstacles: [] }).length, 0);
assert.equal(gardenPlantPositions({ ...bank, terrainPatches: [{ column: 0, row: 0, width: 32, height: 32, material: 'dirt' }] }).length, 0);
assert.equal(gardenPlantPositions({ ...bank, triggers: [{ zone: { column: 0, row: 0, width: 32, height: 32 } }] }).length, 0);
assert.equal(gardenPlantPositions({ ...bank, id: 'meshy-resource-review' }).length, 0);
for (const terrainBase of ['meadow','sand','snow','lunar-soil','jungle-loam','salt-crust']) assert.equal(gardenPlantPositions({ ...bank, terrainBase }).length, 0);
console.log(JSON.stringify({ map: map.id, plants: plants.length, seeded: true, clearCrossings: true, protectedMarkers: true, noMutation: true }));
