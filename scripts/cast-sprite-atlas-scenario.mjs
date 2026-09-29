import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { decodeRgba8, assertFrameUnclipped } from './sprite-pixel-bounds.mjs';
import { fileURLToPath } from 'node:url';
import { castRoleForUnit, spriteDirectory } from '../src/unit-sprite-runtime.mjs';
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
  const image = decodeRgba8(await readFile(path.join(packRoot, 'cast-atlas-runtime.png')));
  for (const frame of asset.frames) assertFrameUnclipped(image, frame, 4, !frame.id.startsWith('idle-'));
  for (const clip of asset.clips) assert.equal(new Set(clip.sequence.map(item => asset.frames.find(frame => frame.id === item.frameId).groundPivotPx.y)).size, 1, 'clip ground baseline must preserve motion');
  assert.ok(asset.clips.every((clip) => ['idle', 'walk', 'gather', 'defeat'].includes(clip.stateId)));
}

console.log('Cast sprite atlas scenario passed: four opt-in cast packs, hashes, masks, bounds, frames, clips, and actor layers.');

assert.deepEqual([0, 1, 2, 3].map(slot => castRoleForUnit({kind: 'worker', slot})), ['human', 'orc', 'elf', 'troll']);
assert.equal(castRoleForUnit({kind: 'infantry', slot: 2}), 'infantry');
assert.equal(castRoleForUnit({kind: 'archer', slot: 3}), 'archer');
for (const role of roles) assert.equal(spriteDirectory(role, 'v1'), `cast-${role}-sprite-v1`);
