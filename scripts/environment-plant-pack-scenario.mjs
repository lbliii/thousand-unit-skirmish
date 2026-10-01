import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, copyFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePlantManifest } from './validate-environment-plants.mjs';
const base = fileURLToPath(new URL('../assets/environment/frontier-v1/', import.meta.url));
const manifest = JSON.parse(await readFile(path.join(base, 'vesperra-understory-manifest.json'), 'utf8'));
const dir = await mkdtemp(path.join(os.tmpdir(), 'rts-plant-validation-'));
try {
  for (const f of manifest.files) await copyFile(path.join(base, f.path), path.join(dir, f.path));
  await copyFile(path.join(base, manifest.prompts), path.join(dir, manifest.prompts));
  manifest.reference = path.resolve(base, manifest.reference);
  const target = path.join(dir, 'manifest.json');
  await writeFile(target, JSON.stringify(manifest));
  assert.equal((await validatePlantManifest(target)).asset, 'vesperra-shade-fern');
  const runtime = path.join(dir, manifest.files.find(f => f.role === 'runtime-image').path);
  const bytes = await readFile(runtime), corrupted = Buffer.from(bytes); corrupted[corrupted.length - 1] ^= 1;
  await writeFile(runtime, corrupted);
  await assert.rejects(validatePlantManifest(target), /file hash mismatch/);
  await writeFile(runtime, bytes);
  for (const [mutate, reason] of [
    [m => { m.asset.worldWidth *= 1.2; }, /world aspect/],
    [m => { m.asset.worldWidth *= 1.2; m.asset.worldHeight *= 1.2; }, /runtime contract mismatch/],
    [m => { m.asset.pivot = [0.5, 0.5]; }, /pivot/],
    [m => { m.referenceSha256 = '0'.repeat(64); }, /reference hash/],
    [m => { m.files[0].dimensionsPx.width -= 1; }, /encoded dimensions/],
    [m => { m.cropPx[2] = m.files[0].dimensionsPx.width + 1; }, /crop outside/],
    [m => { m.asset.kind = 'unregistered'; }, /unsupported surface/],
  ]) {
    const changed = structuredClone(manifest); mutate(changed);
    await writeFile(target, JSON.stringify(changed));
    await assert.rejects(validatePlantManifest(target), reason);
  }
  console.log('Environment plant validation rejects corrupted bytes, stale reference/dimensions, wrong crop/aspect/pivot, uniform runtime scale drift and unsupported surfaces.');
} finally { await rm(dir, { recursive: true, force: true }); }
