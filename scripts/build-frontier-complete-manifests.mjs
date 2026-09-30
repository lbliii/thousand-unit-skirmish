import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

export function validateCaptureFamily(rows) {
  if (rows.length !== 8) throw new Error('Expected eight registered views');
  const first = rows[0];
  if (!/^[a-z][a-z-]*$/.test(first.asset)) throw new Error('Invalid asset identity');
  const seen = new Set();
  for (const row of rows) {
    if (row.asset !== first.asset || row.source !== first.source || row.state !== 'complete') throw new Error('Mixed capture identity/state');
    if (!Number.isInteger(row.viewIndex) || row.viewIndex < 0 || row.viewIndex > 7 || seen.has(row.viewIndex)) throw new Error('Duplicate or invalid view index');
    seen.add(row.viewIndex);
    if (row.camera?.azimuthDegrees !== row.viewIndex * 45) throw new Error('View index/azimuth mismatch');
    for (const key of ['projection', 'elevationDegrees', 'canvasWorldUnits', 'pixelsPerWorldUnit']) {
      if (row.camera[key] !== first.camera[key]) throw new Error(`Mixed camera ${key}`);
    }
    if (row.camera.projection !== 'orthographic' || !Number.isFinite(row.camera.pixelsPerWorldUnit) || row.camera.pixelsPerWorldUnit <= 0) throw new Error('Invalid capture density/projection');
    if (JSON.stringify(row.camera.canvasPixels) !== JSON.stringify(first.camera.canvasPixels)) throw new Error('Mixed canvas dimensions');
    const pivot = row.camera.groundOriginPixelFromTopLeft;
    if (!Array.isArray(pivot) || pivot.length !== 2 || pivot.some((value, index) => !Number.isFinite(value) || Math.abs(value - first.camera.groundOriginPixelFromTopLeft[index]) > 1e-6)) throw new Error('Mixed ground pivots');
    for (const key of ['uniformScale', 'measuredNativeBaseWidth', 'targetBaseWidthWorldUnits']) {
      if (!Number.isFinite(row[key]) || row[key] <= 0 || Math.abs(row[key] - first[key]) > 1e-9) throw new Error(`Mixed model ${key}`);
    }
    if (Math.abs(row.uniformScale * row.measuredNativeBaseWidth - row.targetBaseWidthWorldUnits) > 1e-9) throw new Error('Invalid measured scale');
    for (const key of ['groundingTranslationNative', 'measuredBaseCenterNativeXZ', 'lighting']) {
      if (JSON.stringify(row[key]) !== JSON.stringify(first[key])) throw new Error(`Mixed capture ${key}`);
    }
    const expected = `${row.asset}-complete-view-${String(row.viewIndex).padStart(2, '0')}.png`;
    if (row.file !== expected || !/^[a-f0-9]{64}$/.test(row.sha256)) throw new Error('Invalid frame path/hash');
  }
}

async function main() {
const packs = ['frontier-civilization-scale-pilot-v1', 'frontier-civilization-models-v1'];
for (const pack of packs) {
  const root = new URL(`../assets/buildings/${pack}/`, import.meta.url);
  const captures = JSON.parse(await readFile(new URL('captures/capture-manifest.json', root), 'utf8')).records;
  for (const asset of new Set(captures.map(record => record.asset))) {
    const rows = captures.filter(record => record.asset === asset).sort((a,b) => a.viewIndex-b.viewIndex);
    validateCaptureFamily(rows);
    for (const row of rows) {
      const bytes = await readFile(new URL(`captures/${row.file}`, root));
      if (createHash('sha256').update(bytes).digest('hex') !== row.sha256) throw new Error(`Frame hash differs: ${row.file}`);
    }
    const camera = rows[0].camera;
    const manifest = {
      schema: 'thousand-unit-skirmish.building-lifecycle-reference.v1', asset,
      status: 'complete-only-renderer-preview; lifecycle/team/runtime-match acceptance pending',
      camera: { projection: camera.projection, framePixels: camera.canvasPixels,
        pixelsPerWorldUnit: camera.pixelsPerWorldUnit, elevationDegrees: camera.elevationDegrees,
        azimuthDegrees: rows.map(row => row.camera.azimuthDegrees),
        anchorPixelFromTopLeft: camera.groundOriginPixelFromTopLeft, background: 'transparent' },
      stateOrder: ['complete'], states: [],
      completeState: { state: 'complete', views: rows.map(row => ({ index: row.viewIndex,
        azimuthDegrees: row.camera.azimuthDegrees, path: `captures/${row.file}`, sha256: row.sha256, bytes: row.bytes })) },
      limitations: ['No team masks', 'No construction or damage views', 'Source scale remains subject to doorway and unit review'],
    };
    await writeFile(new URL(`${asset}-complete-renderer.json`, root), JSON.stringify(manifest, null, 2)+'\n');
  }
}
console.log('Built six Complete-only manifests for the existing game renderer.');

}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) await main();
