import { readFile, writeFile } from 'node:fs/promises';
const packs = ['frontier-civilization-scale-pilot-v1', 'frontier-civilization-models-v1'];
for (const pack of packs) {
  const root = new URL(`../assets/buildings/${pack}/`, import.meta.url);
  const captures = JSON.parse(await readFile(new URL('captures/capture-manifest.json', root), 'utf8')).records;
  for (const asset of new Set(captures.map(record => record.asset))) {
    const rows = captures.filter(record => record.asset === asset).sort((a,b) => a.viewIndex-b.viewIndex);
    if (rows.length !== 8) throw new Error(`Incomplete views: ${asset}`);
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
