import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PLANT_ASSETS } from '../src/environment-plant-assets.mjs';
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const PACK_ROOT = path.join(ROOT, 'assets/environment/frontier-v1');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
function dimensions(bytes, extension) {
  if (extension === '.png') {
    assert.ok(bytes.length >= 26 && bytes.subarray(0, 8).toString('hex') === '89504e470d0a1a0a', 'invalid PNG header');
    assert.equal(bytes[25], 6, 'source must retain RGBA');
    return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
  }
  assert.ok(bytes.length >= 30 && bytes.toString('ascii', 0, 4) === 'RIFF'
    && bytes.toString('ascii', 8, 12) === 'WEBP', 'invalid WebP header');
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const kind = bytes.toString('ascii', offset, offset + 4), size = bytes.readUInt32LE(offset + 4), data = offset + 8;
    assert.ok(data + size <= bytes.length, 'truncated WebP chunk');
    if (kind === 'VP8X') {
      assert.ok(size >= 10 && (bytes[data] & 16), 'runtime must retain an alpha channel');
      return [1 + bytes.readUIntLE(data + 4, 3), 1 + bytes.readUIntLE(data + 7, 3)];
    }
    offset = data + size + size % 2;
  }
  throw new Error('Expected alpha-preserving extended WebP');
}
export async function validatePlantManifest(manifestPath) {
  const m = JSON.parse(await readFile(manifestPath, 'utf8')), base = path.dirname(manifestPath);
  assert.equal(m.schemaVersion, 1); assert.ok(m.packId?.startsWith('environment.'));
  assert.ok(/^\d+\.\d+\.\d+$/.test(m.packVersion) && m.provenance); assert.equal(m.maturity, 'source-sample');
  const reference = await readFile(path.resolve(base, m.reference));
  assert.ok(/^[a-f0-9]{64}$/.test(m.referenceSha256), 'reference hash missing');
  assert.equal(sha256(reference), m.referenceSha256, 'reference hash mismatch');
  JSON.parse(await readFile(path.resolve(base, m.prompts), 'utf8'));
  assert.equal(m.files.length, 2, 'one selected source and one runtime export required');
  const sizes = new Map();
  for (const f of m.files) {
    assert.equal(path.basename(f.path), f.path, 'file must be local to the pack');
    const extension = f.role === 'source-image' ? '.png' : f.role === 'runtime-image' ? '.webp' : null;
    assert.ok(extension && f.path === m.asset.id + extension, 'asset ID/role/file mismatch');
    assert.ok(!sizes.has(f.role), 'duplicate file role');
    const bytes = await readFile(path.join(base, f.path));
    assert.equal(bytes.length, f.bytes, 'file byte count mismatch');
    assert.equal(sha256(bytes), f.sha256, 'file hash mismatch');
    const size = dimensions(bytes, extension);
    assert.deepEqual(size, [f.dimensionsPx.width, f.dimensionsPx.height], 'encoded dimensions mismatch');
    sizes.set(f.role, size);
  }
  const source = sizes.get('source-image'), runtime = sizes.get('runtime-image'), crop = m.cropPx;
  assert.ok(source && runtime && crop?.length === 4 && crop.every(Number.isInteger), 'crop/file roles missing');
  assert.ok(crop[0] >= 0 && crop[1] >= 0 && crop[2] <= source[0] && crop[3] <= source[1]
    && crop[2] > crop[0] && crop[3] > crop[1], 'crop outside source');
  assert.ok(Math.max(...runtime) <= 1024 && runtime[0] <= crop[2] - crop[0] && runtime[1] <= crop[3] - crop[1], 'runtime size exceeds export bounds');
  assert.ok(['decorative-forest-understory', 'decorative-land-scenery', 'decorative-stone-scenery', 'decorative-water-decal'].includes(m.asset.kind), 'unsupported surface type');
  const depth = m.asset.kind === 'decorative-water-decal' ? m.asset.worldDepth : m.asset.worldHeight;
  assert.ok(m.asset.worldWidth > 0 && depth > 0, 'world dimensions missing');
  assert.ok(Math.abs(m.asset.worldWidth / depth - runtime[0] / runtime[1]) < 0.00003, 'world aspect differs from runtime image');
  assert.deepEqual(m.asset.pivot, m.asset.kind === 'decorative-water-decal' ? [0.5, 0.5] : [0.5, 1], 'pivot incompatible with surface type');
  if (m.asset.kind === 'decorative-forest-understory') assert.equal(m.asset.parentStockClears, true);
  const registered = PLANT_ASSETS[m.asset.id];
  assert.ok(registered, 'plant missing runtime registration');
  for (const [key, value] of Object.entries(registered)) {
    assert.deepEqual(m.asset[key], value, `plant runtime contract mismatch: ${key}`);
  }
  return { packId: m.packId, asset: m.asset.id, runtimePx: runtime, referenceHashRecorded: !!m.referenceSha256 };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const files = process.argv.slice(2);
  const manifests = files.length ? files.map(f => path.resolve(f)) : (await readdir(PACK_ROOT))
    .filter(f => /(?:understory|variation|water-plants|god-bone)-manifest\.json$/.test(f)).sort().map(f => path.join(PACK_ROOT, f));
  assert.ok(manifests.length, 'no environment plant manifests found');
  const results = [];
  for (const file of manifests) {
    try { results.push(await validatePlantManifest(file)); }
    catch (error) { throw new Error(`${path.basename(file)}: ${error.message}`, { cause: error }); }
  }
  assert.equal(new Set(results.map(r => r.packId)).size, results.length, 'duplicate pack ID');
  if (!files.length) assert.deepEqual(results.map(r => r.asset).sort(), Object.keys(PLANT_ASSETS).sort(),
    'runtime plant registration and selected manifests differ');
  console.log(JSON.stringify({ checked: results.length, packs: results }, null, 2));
}
