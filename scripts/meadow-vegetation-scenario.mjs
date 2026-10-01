import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { meadowPlantPositions, meadowPlantGroups } from '../src/meadow-vegetation.mjs';

const map = JSON.parse(readFileSync(new URL('../maps/bellweather-millrace.json', import.meta.url)));
const original = JSON.stringify(map);
const plants = meadowPlantPositions(map);
assert.ok(plants.length > 20 && plants.length < 180, 'the shipped meadow needs sparse flowers');
assert.equal(JSON.stringify(map), original);
assert.deepEqual(meadowPlantPositions(map), plants);
assert.notDeepEqual(meadowPlantPositions({ ...map, terrainSeed: map.terrainSeed + 1 }), plants);
assert.equal(new Set(plants.map(p => p.cell)).size, plants.length);
const groups = meadowPlantGroups(map);
assert.equal(groups.length, 2, 'shipped meadow needs both specimens');
assert.deepEqual(groups, meadowPlantGroups(map));
assert.deepEqual(groups.flatMap(g => g.positions).sort((a,b) => a.cell-b.cell), [...plants].sort((a,b) => a.cell-b.cell), 'specimen selection must preserve roots, scale and gaps');
const beds = new Map();
for (const group of groups) for (const p of group.positions) {
  const bed = `${Math.floor(Math.floor(p.cell/map.width)/4)}:${Math.floor((p.cell%map.width)/4)}`;
  assert.ok(!beds.has(bed) || beds.get(bed) === group.name, 'a coarse bed must keep one specimen');
  beds.set(bed, group.name);
}
for (const p of plants) {
  const c = Math.floor(p.x + map.width / 2), r = Math.floor(p.z + map.height / 2);
  assert.equal(r * map.width + c, p.cell);
  assert.ok(c > 0 && c < map.width - 1 && r > 0 && r < map.height - 1);
  assert.ok(!map.obstacles.some(o => c >= o.column - 1 && c < o.column + o.width + 1 && r >= o.row - 1 && r < o.row + o.height + 1));
  assert.ok(!map.triggers.some(t => t.zone && c >= t.zone.column - 1 && c < t.zone.column + t.zone.width + 1 && r >= t.zone.row - 1 && r < t.zone.row + t.zone.height + 1));
  let material = map.terrainBase;
  for (const t of map.terrainPatches) if (c >= t.column && c < t.column + t.width && r >= t.row && r < t.row + t.height) material = t.material;
  assert.ok(['meadow','short-grass','long-grass','dry-grass'].includes(material));
  assert.ok(map.spawnPoints.every(s => Math.hypot(p.x - s.x, p.z - s.z) >= 8));
  assert.ok(map.resourceNodes.every(s => Math.hypot(p.x - s.x, p.z - s.z) >= 2.5));
}
const bare = { width: 32, height: 32, terrainBase: 'meadow', terrainSeed: 93000 };
assert.ok(meadowPlantPositions(bare).length > 0);
for (const material of ['water','forest','stone']) assert.equal(meadowPlantPositions({ ...bare, obstacles: [{ column: 0, row: 0, width: 32, height: 32, material }] }).length, 0);
assert.equal(meadowPlantPositions({ ...bare, terrainPatches: [{ column: 0, row: 0, width: 32, height: 32, material: 'dirt' }] }).length, 0);
for (const terrainBase of ['sand','snow','ice','lunar-soil','jungle-loam','salt-crust']) assert.equal(meadowPlantPositions({ ...bare, terrainBase }).length, 0);
assert.equal(meadowPlantPositions({ ...bare, id: 'meshy-resource-review' }).length, 0);
assert.deepEqual(meadowPlantGroups({ ...bare, id: 'meshy-resource-review' }), []);
console.log(JSON.stringify({ map: map.id, plants: plants.length, seeded: true, protectedMarkers: true, noMutation: true }));
