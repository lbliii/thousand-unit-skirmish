import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import assert from 'node:assert/strict';

const directory = path.resolve(process.argv[2] ?? 'assets/buildings/frontier-civilization-scale-pilot-v1/captures');
const manifest = JSON.parse(await readFile(path.join(directory, 'capture-manifest.json'), 'utf8'));
assert.equal(manifest.records.length, 16, 'Pilot requires eight views for each of two sources');
const seen = new Set();
for (const record of manifest.records) {
  assert.ok(['town-center', 'house'].includes(record.source));
  const azimuth = record.camera.azimuthDegrees;
  assert.ok(Number.isInteger(azimuth / 45) && azimuth >= 0 && azimuth <= 315);
  const key = `${record.source}:${azimuth}`;
  assert.ok(!seen.has(key), `Duplicate view ${key}`);
  seen.add(key);
  assert.equal(record.camera.projection, 'orthographic');
  assert.equal(record.camera.elevationDegrees, 46);
  assert.equal(record.camera.pixelsPerWorldUnit, 128);
  assert.equal(record.camera.canvasWorldUnits, 8);
  assert.deepEqual(record.camera.canvasPixels, [1024, 1024]);
  const [x, y] = record.camera.groundOriginPixelFromTopLeft;
  assert.ok(Math.abs(x - 512) < 1e-6 && Math.abs(y - 647.152732556503) < 1e-6);
  assert.equal(record.targetBaseWidthWorldUnits, record.source === 'house' ? 2.3 : 4.4);
  assert.ok(Math.abs(record.uniformScale * record.measuredNativeBaseWidth - record.targetBaseWidthWorldUnits) < 1e-9);
  const filename = `${record.source}-complete-view-${String(azimuth / 45).padStart(2, '0')}`;
  const individual = JSON.parse(await readFile(path.join(directory, `${filename}.json`), 'utf8'));
  const { alphaBounds, ...captureRecord } = record;
  assert.deepEqual(individual, captureRecord, `Manifest differs from ${filename}.json`);
  assert.ok(alphaBounds.length === 4 && alphaBounds[0] > 0 && alphaBounds[1] > 0 && alphaBounds[2] < 1024 && alphaBounds[3] < 1024, 'Recorded silhouette must have canvas margins');
  const png = await readFile(path.join(directory, `${filename}.png`));
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(png.readUInt32BE(16), 1024);
  assert.equal(png.readUInt32BE(20), 1024);
  assert.equal(png[25], 6, 'PNG must retain RGBA transparency');
  assert.equal(createHash('sha256').update(png).digest('hex'), record.sha256);
}
console.log('Validated 16 registered Complete source views, shared scale/pivots and PNG hashes. Runtime and lifecycle coverage are not validated.');
