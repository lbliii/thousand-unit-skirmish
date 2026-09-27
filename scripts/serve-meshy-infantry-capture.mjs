#!/usr/bin/env node
import { createHash, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT_ROOT = path.join(ROOT, 'meshy_output', 'unit-sprite-captures');
const RUN_ID = `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`;
const RUN_ROOT = path.join(OUTPUT_ROOT, RUN_ID);
const OUTPUTS = Object.freeze([
  { role: 'infantry', directory: 'infantry-sprite-v2' },
  { role: 'worker', directory: 'worker-sprite-v3' },
].map((output) => ({ ...output, path: path.join(RUN_ROOT, output.directory) })));
const INPUTS = Object.freeze([
  ['infantry-model', 'infantry-model.glb', 'base-pose'],
  ['infantry-walking', 'infantry-walking.glb', 'Walk'],
  ['infantry-attack', 'infantry-attack.glb', 'Attack'],
  ['infantry-defeat', 'infantry-defeat.glb', 'Defeat'],
]);
const MIME_TYPES = Object.freeze({
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.glb': 'model/gltf-binary',
});

function argumentsFrom(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index++) {
    const key = argv[index];
    if (!key.startsWith('--')) continue;
    result[key.slice(2)] = argv[++index];
  }
  return result;
}

const args = argumentsFrom(process.argv.slice(2));
if (!args['pilot-dir']) {
  console.error('Usage: node scripts/serve-meshy-infantry-capture.mjs --pilot-dir <Meshy pilot output directory> [--port 8766]');
  process.exit(2);
}
const PILOT = path.resolve(args['pilot-dir']);
const PORT = Number(args.port || 8766);
if (!Number.isInteger(PORT) || PORT < 1024 || PORT > 65535) throw new Error('--port must be between 1024 and 65535');

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index++) {
    let value = index;
    for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) value = crcTable[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  typeBytes.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(chunk.subarray(4, 8 + data.length)), 8 + data.length);
  return chunk;
}

function encodeGray8(width, height, pixels) {
  if (pixels.length !== width * height) throw new Error('team mask pixel count does not match atlas dimensions');
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 0;
  const scanlines = Buffer.alloc(height * (width + 1));
  for (let y = 0; y < height; y++) {
    const rowOffset = y * (width + 1);
    scanlines[rowOffset] = 0;
    pixels.copy(scanlines, rowOffset + 1, y * width, (y + 1) * width);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(scanlines, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function imageHeader(bytes) {
  if (bytes.length < 26 || !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    throw new Error('atlas must be a PNG image');
  }
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), colorType: bytes[25], bitDepth: bytes[24] };
}

function finitePositive(value, label) {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${label} must be a positive number`);
  return value;
}

function buildManifest(payload, atlasBytes, maskBytes, hashes, role = 'infantry') {
  if (!['infantry', 'worker'].includes(role)) throw new Error(`unsupported sprite preview role: ${role}`);
  const { width, height, cellSize, columns, rows, captureRecords, classifiedPixels } = payload;
  const pageId = `${role}-color`;
  const sourceFileId = `${role}-atlas-source`;
  const runtimeFileId = `${role}-atlas-runtime`;
  const maskFileId = `${role}-team-mask`;
  const sourceFileName = `${role}-atlas-source.png`;
  const runtimeFileName = `${role}-atlas-runtime.png`;
  const maskFileName = 'team-accent-mask.png';
  if (![width, height, cellSize, columns, rows].every(Number.isInteger)
    || width !== cellSize * columns || height !== cellSize * rows) {
    throw new Error('atlas dimensions and capture grid do not agree');
  }
  if (!Array.isArray(captureRecords) || captureRecords.length < 8 || captureRecords.length > columns * rows) {
    throw new Error('capture record count is invalid for the declared atlas');
  }
  if (!Number.isInteger(classifiedPixels) || classifiedPixels < 1) throw new Error('no team-accent pixels were detected');
  const atlasHeader = imageHeader(atlasBytes);
  if (atlasHeader.width !== width || atlasHeader.height !== height || atlasHeader.bitDepth !== 8 || atlasHeader.colorType !== 6) {
    throw new Error('atlas must be an 8-bit RGBA PNG with the declared dimensions');
  }

  const frames = captureRecords.map((record, index) => {
    const cellX = (index % columns) * cellSize;
    const cellY = Math.floor(index / columns) * cellSize;
    const alpha = record.alphaBoundsPx;
    if (!alpha || !['x', 'y', 'width', 'height'].every((key) => Number.isInteger(alpha[key]))
      || alpha.width < 1 || alpha.height < 1 || alpha.x < 0 || alpha.y < 0
      || alpha.x + alpha.width > cellSize || alpha.y + alpha.height > cellSize) {
      throw new Error(`${record.frameId}: alpha bounds are invalid`);
    }
    return {
      id: record.frameId,
      canvasPx: { width: cellSize, height: cellSize },
      groundPivotPx: { x: payload.anchorPixel.x, y: payload.anchorPixel.y },
      groundPivotStatus: 'unreviewed-estimate',
      alphaBoundsPx: alpha,
      fallbackRectPx: { pageId, rectPx: { x: cellX, y: cellY, width: cellSize, height: cellSize } },
      frameRectsPx: [{
        layerId: 'actor', pageId,
        rectPx: { x: cellX, y: cellY, width: cellSize, height: cellSize }, offsetPx: { x: 0, y: 0 },
      }],
    };
  });

  const clips = [];
  const states = role === 'worker'
    ? [
      { state: 'idle', sourceState: 'idle', loop: true },
      { state: 'walk', sourceState: 'walk', loop: true },
      { state: 'gather', sourceState: 'attack', loop: true },
      { state: 'build', sourceState: 'attack', loop: true },
      { state: 'defeat', sourceState: 'defeat', loop: false },
    ]
    : ['idle', 'walk', 'attack', 'defeat'].map((state) => ({
      state, sourceState: state, loop: state === 'idle' || state === 'walk',
    }));
  for (const { state, sourceState, loop } of states) {
    for (const direction of payload.directions) {
      const matching = captureRecords.filter((record) => record.stateId === sourceState && record.directionId === direction);
      if (matching.length === 0) throw new Error(`missing ${state}/${direction} capture frames`);
      clips.push({
        stateId: state,
        directionId: direction,
        loop,
        sequence: matching.map((record) => ({ frameId: record.frameId, durationMs: record.durationMs })),
      });
    }
  }

  const captureAssets = INPUTS.filter(([id]) => id !== 'infantry-model').map(([id, , clipId]) => ({
    id, sha256: hashes[id], animationClipId: payload.animationClipIds[id] || clipId,
  }));
  const workerNote = role === 'worker'
    ? 'Role-fit preview: the Meshy attack swing is reused as looping gather and build motion because the pilot did not include worker action clips. It is body-only and has no tools. Review at game zoom before keeping it.'
    : 'Exploratory body-only sprite. The pilot model omitted the source spear and shield.';
  const manifest = {
    schemaVersion: 1,
    packId: `${role}-meshy-sprite-pilot`,
    packVersion: '0.1.0',
    maturity: 'runtime-candidate',
    provenance: {
      license: 'Pending rights verification before promotion from local staging into tracked game assets. See README.md.',
      source: 'One-image Meshy Infantry pilot, baked locally from the textured model and generated action GLBs',
      authoringTool: 'Three.js 0.180.0 browser capture tool',
      notes: `${workerNote} The capture tool fits a shared camera envelope across every sampled pose and facing, and strips horizontal Hips travel while preserving vertical motion so simulation movement stays authoritative. Output is staged locally with rights pending; pivots and team mask still need visual review.`,
    },
    files: [
      { id: sourceFileId, path: sourceFileName, usage: 'source', format: 'png', sha256: sha256(atlasBytes), dimensionsPx: { width, height } },
      { id: runtimeFileId, path: runtimeFileName, usage: 'runtime', format: 'png', sha256: sha256(atlasBytes), dimensionsPx: { width, height } },
      { id: maskFileId, path: maskFileName, usage: 'team-mask', format: 'png', sha256: sha256(maskBytes), dimensionsPx: { width, height } },
    ],
    pages: [{
      id: pageId, sourceFileId, runtimeFileId, maskFileId, dimensionsPx: { width, height }, colorSpace: 'srgb', pixelFormat: 'rgba8',
      alphaMode: 'straight', edgeRule: 'zero-rgb-under-transparent', gutterPx: 0, gutterRule: 'none', wrapMode: 'clamp',
      sampling: { generateMipmaps: false, minFilter: 'linear', magFilter: 'linear', uvInsetPx: 0.5, maxMipLevel: 0 },
    }],
    assets: [{
      id: role, kind: 'unit',
      artBoundsWorld: { min: [-0.45, 0, -0.45], max: [0.45, 1.1, 0.45] },
      heightWorld: finitePositive(payload.unitHeightWorld, 'unitHeightWorld'),
      sortAnchorWorld: [0, 0, 0],
      cullingBoundsWorld: { min: [-0.5, 0, -0.5], max: [0.5, 1.2, 0.5] },
      selectionBoundsWorld: { min: [-0.4, 0, -0.4], max: [0.4, 0.8, 0.4] },
      layers: [{ id: 'actor', drawLayer: 'actor', batchKey: `unit.${role}` }],
      frames, clips,
    }],
    capture: {
      captureMode: 'model-pose',
      sourceModelSha256: hashes['infantry-model'],
      sourceAssets: captureAssets,
      projection: 'orthographic',
      fixedCameraAzimuthDegrees: 45,
      elevationDegrees: payload.elevationDegrees,
      framePixels: { width: cellSize, height: cellSize },
      frameWorldUnits: { width: payload.frameWorldUnits, height: payload.frameWorldUnits },
      pixelsPerWorldUnit: cellSize / payload.frameWorldUnits,
      anchorPixelFromTopLeft: payload.anchorPixel,
      frameRecords: captureRecords.map(({ frameId, stateId, directionId, sourceAssetId, modelYawDegrees, animationClipId, clipTimeSeconds }) => ({
        frameId, stateId, directionId, sourceAssetId, modelYawDegrees, animationClipId, clipTimeSeconds,
      })),
    },
  };
  return manifest;
}

async function readBody(request, maximumBytes = 48 * 1024 * 1024) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > maximumBytes) throw new Error('capture upload exceeds the local size limit');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function send(response, status, message, type = 'text/plain; charset=utf-8') {
  response.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
  response.end(message);
}

const handler = async (request, response) => {
  const url = new URL(request.url || '/', `http://127.0.0.1:${PORT}`);
  if (request.method === 'GET' && url.pathname === '/capture') {
    const html = await readFile(path.join(ROOT, 'scripts/meshy-infantry-sprite-capture.html'));
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    response.end(html);
    return;
  }
  if (request.method === 'GET' && url.pathname === '/__pilot__/manifest.json') {
    const assets = [];
    for (const [id, filename, clip] of INPUTS) {
      const metadata = await stat(path.join(PILOT, filename));
      assets.push({ id, filename, bytes: metadata.size, clip });
    }
    send(response, 200, JSON.stringify({ assets }), 'application/json; charset=utf-8');
    return;
  }
  if (request.method === 'GET' && url.pathname.startsWith('/__pilot__/')) {
    const filename = path.basename(url.pathname.slice('/__pilot__/'.length));
    if (!INPUTS.some(([, candidate]) => candidate === filename)) return send(response, 404, 'Not found');
    const bytes = await readFile(path.join(PILOT, filename));
    response.writeHead(200, { 'content-type': 'model/gltf-binary', 'content-length': bytes.length, 'cache-control': 'no-store' });
    response.end(bytes);
    return;
  }
  if (request.method === 'GET' && url.pathname.startsWith('/__three__/')) {
    const relative = url.pathname.slice('/__three__/'.length);
    const candidate = path.resolve(ROOT, 'node_modules/three', relative);
    const nodeModules = path.resolve(ROOT, 'node_modules/three');
    if (candidate !== nodeModules && !candidate.startsWith(`${nodeModules}${path.sep}`)) return send(response, 403, 'Forbidden');
    try {
      const bytes = await readFile(candidate);
      response.writeHead(200, { 'content-type': MIME_TYPES[path.extname(candidate)] || 'application/octet-stream', 'content-length': bytes.length, 'cache-control': 'no-store' });
      response.end(bytes);
    } catch {
      send(response, 404, 'Not found');
    }
    return;
  }
  if (request.method === 'POST' && url.pathname === '/__save__') {
    try {
      const payload = JSON.parse((await readBody(request)).toString('utf8'));
      const atlasBytes = Buffer.from(String(payload.atlasPngBase64 || ''), 'base64');
      const maskPixels = Buffer.from(String(payload.maskPixelsBase64 || ''), 'base64');
      const { width, height } = payload;
      const maskBytes = encodeGray8(width, height, maskPixels);
      const hashes = {};
      for (const [id, filename] of INPUTS) hashes[id] = sha256(await readFile(path.join(PILOT, filename)));
      const outputRecords = await Promise.all(OUTPUTS.map(async ({ role, path: outputPath }) => {
        const manifest = buildManifest(payload, atlasBytes, maskBytes, hashes, role);
        await mkdir(outputPath, { recursive: true });
        await Promise.all([
          writeFile(path.join(outputPath, `${role}-atlas-source.png`), atlasBytes),
          writeFile(path.join(outputPath, `${role}-atlas-runtime.png`), atlasBytes),
          writeFile(path.join(outputPath, 'team-accent-mask.png'), maskBytes),
          writeFile(path.join(outputPath, 'sprite-atlas-pack-v1.json'), `${JSON.stringify(manifest, null, 2)}\n`),
          writeFile(path.join(outputPath, 'README.md'), [
            `# Meshy ${role === 'worker' ? 'Worker / peasant' : 'Infantry'} sprite pilot`, '',
            'Eight-direction sprite bake from the approved one-image Meshy pilot.',
            role === 'worker'
              ? 'The attack swing is reused as looping gather and build motion. The body has no tools; review the role fit in a live match.'
              : 'The model has walk, attack, and defeat states and remains body-only; the source spear and shield are missing.',
            '## Rights and promotion',
            '',
            'Status: pending verification. This pack is in ignored local staging under `meshy_output/` and is not installed in the game. Before promotion, verify the plan and terms that applied when the source was generated, check any attribution requirements, and record the provider task IDs and evidence in its provenance. Meshy states that Free-plan outputs use CC BY 4.0 and paid-plan customers own their Customer Output; do not assume which applies without checking the source run.',
            '',
            'After rights are verified, manually promote only the reviewed pack into `assets/units/` and update its manifest and source documentation. See `docs/unit-character-meshy-pipeline.md`.',
            'Frame pivots and the blue team-accent mask are generated estimates awaiting in-game visual review.', '',
          ].join('\n')),
        ]);
        return {
          role, path: path.relative(ROOT, outputPath), frames: manifest.assets[0].frames.length,
          clips: manifest.assets[0].clips.length, atlasSha256: manifest.files[1].sha256,
        };
      }));
      send(response, 200, JSON.stringify({
        ok: true,
        rightsStatus: 'pending-verification',
        stagingRoot: path.relative(ROOT, RUN_ROOT),
        outputs: outputRecords,
        frames: outputRecords[0].frames,
        clips: outputRecords.map(({ role, clips }) => `${role}: ${clips} clips`).join(' · '),
        classifiedTeamPixels: payload.classifiedPixels,
        atlasSha256: outputRecords[0].atlasSha256,
      }), 'application/json; charset=utf-8');
    } catch (error) {
      send(response, 400, JSON.stringify({ error: error.message }), 'application/json; charset=utf-8');
    }
    return;
  }
  send(response, 404, 'Not found');
};

const server = createServer((request, response) => { void handler(request, response); });
server.listen(PORT, '127.0.0.1', () => {
  console.log(`Meshy Infantry sprite capture at http://127.0.0.1:${PORT}/capture`);
  console.log(`Ignored local staging root: ${path.relative(ROOT, RUN_ROOT)}`);
});
