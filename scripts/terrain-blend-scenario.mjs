import assert from 'node:assert/strict';
import { buildTerrainBlendMasks } from '../src/terrain-blend.mjs';

const materials = ['meadow', 'sand', 'ice'];
const map = {
  width: 16, height: 16, terrainSeed: 42,
  terrainPatches: [
    { column: 0, row: 0, width: 8, height: 16, material: 'sand' },
    { column: 8, row: 8, width: 8, height: 8, material: 'ice' },
  ],
};
const original = JSON.stringify(map);
const masks = buildTerrainBlendMasks(map, materials, 'meadow');
assert.equal(JSON.stringify(map), original, 'visual blending must not alter authoritative map cells');
assert.deepEqual(masks, buildTerrainBlendMasks(map, materials, 'meadow'), 'reopening a seeded map must reproduce its edges');
assert.deepEqual(buildTerrainBlendMasks({ width: 16, height: 16 }, materials, 'meadow'), [], 'uniform base needs no mask or overlay');

function mixture(layers, x, y) {
  const weights = { meadow: 1, sand: 0, ice: 0 };
  for (const layer of layers) {
    const alpha = layer.pixels[(y * layer.width + x) * 4 + 1] / 255;
    for (const material of materials) weights[material] *= 1 - alpha;
    weights[layer.material] += alpha;
  }
  return weights;
}

assert.deepEqual(mixture(masks, 2, 2), { meadow: 0, sand: 1, ice: 0 }, 'material interiors retain their full color');
const boundary = mixture(masks, 15, 5);
assert.ok(boundary.sand > 0 && boundary.sand < 1 && boundary.meadow > 0, 'boundaries mix materials rather than switch at cell edges');
const junction = mixture(masks, 15, 15);
assert.ok(materials.every(material => junction[material] > 0), 'three-way joins blend all neighboring materials');

const reordered = buildTerrainBlendMasks(map, ['ice', 'sand', 'meadow'], 'meadow');
for (let y = 0; y < 32; y++) {
  for (let x = 0; x < 32; x++) {
    const first = mixture(masks, x, y), second = mixture(reordered, x, y);
    assert.ok(Math.abs(Object.values(first).reduce((a, b) => a + b, 0) - 1) < 1e-6);
    for (const material of materials) {
      assert.ok(Math.abs(first[material] - second[material]) < 0.008,
        'catalog order must not dominate the mix (allowing 8-bit mask rounding)');
    }
  }
}

const whole = buildTerrainBlendMasks({
  width: 16, height: 16,
  terrainPatches: [{ column: 0, row: 0, width: 16, height: 16, material: 'sand' }],
}, materials, 'meadow');
const split = buildTerrainBlendMasks({
  width: 16, height: 16,
  terrainPatches: [
    { column: 0, row: 0, width: 8, height: 16, material: 'sand' },
    { column: 8, row: 0, width: 8, height: 16, material: 'sand' },
  ],
}, materials, 'meadow');
assert.deepEqual(whole, split, 'compression boundaries must not produce visible seams');
assert.deepEqual(mixture(split, 15, 15), { meadow: 0, sand: 1, ice: 0 });

console.log('Terrain blend passed: soft boundaries, normalized three-way joins, catalog-order independence, compression independence, deterministic masks, unchanged map rules.');

const { buildForestGroundMask } = await import('../src/terrain-blend.mjs');
const { forestGroundForBase, TERRAIN_MATERIALS } = await import('../src/terrain-materials.mjs');
const woods = { width: 16, height: 16, terrainSeed: 42,
  terrainPatches: [{ column: 0, row: 0, width: 16, height: 16, material: 'sand' }],
  obstacles: [{ column: 4, row: 4, width: 8, height: 8, material: 'forest' },
    { column: 0, row: 0, width: 2, height: 2, material: 'stone' }] };
const woodSource = JSON.stringify(woods);
const cover = buildForestGroundMask(woods, 'garden-loam');
const alpha = (x, y) => cover.pixels[(y * cover.width + x) * 4 + 1];
assert.equal(alpha(16, 16), 255, 'forest interior has full regional root cover');
assert.equal(alpha(0, 0), 0, 'stone and clear terrain receive no root cover');
assert.ok(alpha(8, 16) > 0 && alpha(8, 16) < 255, 'forest boundary blends rather than forming a hard rectangle');
assert.equal(JSON.stringify(woods), woodSource, 'root cover cannot alter authoritative obstacles or paint');
assert.equal(buildForestGroundMask({ width: 16, height: 16, obstacles: [] }), null);
const splitWoods = { ...woods, obstacles: [
  { column: 4, row: 4, width: 4, height: 8, material: 'forest' },
  { column: 8, row: 4, width: 4, height: 8, material: 'forest' } ] };
assert.deepEqual(buildForestGroundMask(splitWoods, 'garden-loam'), cover,
  'equivalent forest row spans cannot introduce internal ground seams');
for (const [base, expected] of Object.entries({ meadow: 'forest-floor', sand: 'dirt',
  'garden-loam': 'garden-loam', scree: 'scree', snow: 'snow', ice: 'snow',
  'tidal-mud': 'tidal-mud', 'jungle-loam': 'jungle-loam', 'lunar-soil': 'lunar-soil' })) {
  assert.equal(forestGroundForBase(base), expected);
}
assert.ok(TERRAIN_MATERIALS.every(base => TERRAIN_MATERIALS.includes(forestGroundForBase(base))),
  'every regional root cover uses an admitted ground texture');
console.log('Regional forest root cover: interior, feathering, no mutation, decomposition and palette checks passed.');
