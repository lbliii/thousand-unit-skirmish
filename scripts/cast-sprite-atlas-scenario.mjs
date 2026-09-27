import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateSpriteAtlas } from './sprite-atlas-contract.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const roles = ['human', 'elf', 'troll', 'orc'];

for (const role of roles) {
  const packRoot = path.join(root, 'assets/units', `cast-${role}-sprite-v1`);
  const validation = await validateSpriteAtlas(path.join(packRoot, 'sprite-atlas-pack-v1.json'));
  assert.deepEqual(validation.errors, [], `${role} cast pack should satisfy the sprite-atlas contract`);
  assert.equal(validation.manifest.packId, `cast-${role}-sprite`);
  assert.equal(validation.manifest.maturity, 'runtime-candidate');

  const asset = validation.manifest.assets.find((candidate) => candidate.id === role);
  assert.ok(asset, `${role} cast pack should declare its unit asset`);
  assert.equal(asset.frames.length, 264, `${role} should contain the full cast frame set`);
  assert.equal(asset.clips.length, 32, `${role} should contain eight directions for four states`);
  assert.equal(asset.layers[0].drawLayer, 'actor');
  assert.ok(asset.clips.every((clip) => ['idle', 'walk', 'gather', 'defeat'].includes(clip.stateId)));
}

console.log('Cast sprite atlas scenario passed: four opt-in cast packs, hashes, masks, bounds, frames, clips, and actor layers.');
