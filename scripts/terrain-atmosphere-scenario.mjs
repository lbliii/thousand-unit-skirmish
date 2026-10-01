import assert from 'node:assert/strict';
import { buildGroundMistMask, createGroundMistStudy, groundMistProfile, groundMistEnabled } from '../src/terrain-atmosphere.mjs';

const dry = { width: 16, height: 16, terrainBase: 'meadow', obstacles: [] };
assert.equal(buildGroundMistMask(dry), null, 'ordinary dry fields allocate no mist mask');
const map = {
  ...dry, terrainSeed: 7,
  terrainPatches: [{ column: 0, row: 0, width: 8, height: 16, material: 'tidal-mud' }],
  obstacles: [{ column: 12, row: 12, width: 2, height: 2, material: 'water' }],
};
const original = JSON.stringify(map);
const mask = buildGroundMistMask(map);
const coverage = (x, y) => mask.pixels[(y * mask.width + x) * 4 + 1];
assert.equal(coverage(2, 2), 255, 'wet interior supports haze');
assert.equal(coverage(28, 2), 0, 'dry interior remains clear');
assert.ok(coverage(25, 25) > 0, 'water obstacles support haze without changing their bounds');
assert.equal(JSON.stringify(map), original, 'atmosphere cannot edit terrain or water rules');

const entirelyWet = buildGroundMistMask({ ...dry, terrainBase: 'lunar-soil' });
assert.ok(entirelyWet.pixels.every((value) => value === 255), 'wet base fills its entire coverage mask');
const cleared = buildGroundMistMask({ ...dry, terrainBase: 'jungle-loam',
  terrainPatches: [{ column: 0, row: 0, width: 16, height: 16, material: 'dirt' }],
});
assert.equal(cleared, null, 'a dry painted clearing replaces wet base coverage');

assert.equal(groundMistEnabled({terrainBase:'jungle-loam'}), true);
assert.equal(groundMistEnabled({terrainBase:'lunar-soil'}), true);
assert.equal(groundMistEnabled({terrainBase:'meadow'}), false);
assert.equal(groundMistEnabled({terrainBase:'tidal-mud'}), false);
assert.equal(groundMistEnabled({terrainBase:'jungle-loam'}, 'clear'), false);
assert.equal(groundMistEnabled({terrainBase:'meadow'}, 'mist'), true);
assert.equal(groundMistEnabled({terrainBase:'jungle-loam',id:'meshy-resource-review'}), false);
const jungleProfile = groundMistProfile({ terrainBase: 'jungle-loam' });
const moonProfile = groundMistProfile({ terrainBase: 'lunar-soil' });
assert.notDeepEqual(jungleProfile.tint, moonProfile.tint, 'wet regions retain distinct atmosphere palettes');
assert.ok(jungleProfile.opacity <= 0.1 && moonProfile.opacity <= 0.1, 'regional haze stays restrained');
const seeded = createGroundMistStudy({ ...map, terrainSeed: 8 }, 12);
const mesh = createGroundMistStudy(map, 12);
assert.notDeepEqual(seeded.material.uniforms.seedOffset.value, mesh.material.uniforms.seedOffset.value, 'map seeds vary mist pockets');
const repeat = createGroundMistStudy(map, 12);
assert.deepEqual(repeat.material.uniforms.seedOffset.value, mesh.material.uniforms.seedOffset.value, 'reloads preserve mist pockets');
for (const extra of [seeded, repeat]) { extra.geometry.dispose(); extra.material.dispose(); for (const t of extra.userData.ownedGroundTextures) t.dispose(); }
assert.equal(mesh.renderOrder, -1, 'haze draws before transparent units and props');
assert.equal(mesh.material.depthWrite, false, 'decorative mist cannot obstruct scene depth');
mesh.onBeforeRender();
assert.equal(mesh.material.uniforms.time.value, 12, 'captures support a reproducible phase');
assert.equal(mesh.userData.ownedGroundTextures.length, 1, 'the normal map teardown owns mask disposal');
mesh.geometry.dispose(); mesh.material.dispose();
for (const texture of mesh.userData.ownedGroundTextures) texture.dispose();
console.log('Terrain atmosphere passed: wet-only coverage, dry clearings, unchanged rules, foreground order, fixed-phase capture, teardown ownership.');
