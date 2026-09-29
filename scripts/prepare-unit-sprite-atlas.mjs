#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { deflateSync } from 'node:zlib';
import { decodeRgba8 } from './sprite-pixel-bounds.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const DEFAULT_MANIFESTS = [
  'assets/units/worker-sprite-v1/manifest.json',
  'assets/units/infantry-sprite-v1/manifest.json',
  'assets/units/archer-sprite-v1/manifest.json',
];
const ALPHA_RECT_THRESHOLD = 8;
const PIVOT_ALPHA_THRESHOLD = 96;
const ACCENT_HUE_MIN = 180;
const ACCENT_HUE_MAX = 250;
const ACCENT_SATURATION_MIN = 0.24;
const WORKER_PANEL_HUE_MIN = 34;
const WORKER_PANEL_HUE_MAX = 62;
const WORKER_PANEL_X_RANGE = Object.freeze([0.3, 0.71]);
const WORKER_PANEL_Y_RANGE = Object.freeze([0.4, 0.78]);
const FOOT_HUE_MIN = 8;
const FOOT_HUE_MAX = 62;
// Keep the Worker aligned with the authored-unit contract; the other roles are pilot candidates.
const REFERENCE_HEIGHT_WORLD = Object.freeze({ worker: 0.8, infantry: 1.0, archer: 0.78 });
const TEAM_MASK_PATH = 'team-accent-mask.png';

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}


const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let value = n;
    for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[n] = value >>> 0;
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
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 0;
  const scanlines = Buffer.alloc(height * (width + 1));
  for (let y = 0; y < height; y++) {
    const offset = y * (width + 1);
    scanlines[offset] = 0;
    Buffer.from(pixels.buffer, pixels.byteOffset + y * width, width).copy(scanlines, offset + 1);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(scanlines, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function encodeRgba8(width, height, pixels) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const stride = width * 4;
  const scanlines = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    const offset = y * (stride + 1);
    scanlines[offset] = 0;
    Buffer.from(pixels.buffer, pixels.byteOffset + y * stride, stride).copy(scanlines, offset + 1);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(scanlines, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function bleedTransparentRgbByCell(image, frameGrid) {
  const pixels = new Uint8Array(image.pixels);
  for (let row = 0; row < frameGrid.rows; row++) {
    for (let column = 0; column < frameGrid.columns; column++) {
      const x0 = frameGrid.columnEdgesPx[column];
      const y0 = frameGrid.rowEdgesPx[row];
      const width = frameGrid.columnEdgesPx[column + 1] - x0;
      const height = frameGrid.rowEdgesPx[row + 1] - y0;
      const cellLength = width * height;
      const visited = new Uint8Array(cellLength);
      const queue = new Int32Array(cellLength);
      let head = 0;
      let tail = 0;
      for (let localY = 0; localY < height; localY++) {
        for (let localX = 0; localX < width; localX++) {
          const local = localY * width + localX;
          const alphaOffset = ((y0 + localY) * image.width + x0 + localX) * 4 + 3;
          if (image.pixels[alphaOffset] === 0) continue;
          visited[local] = 1;
          queue[tail++] = local;
        }
      }
      if (tail === 0) throw new Error(`cannot bleed an empty frame cell ${row}/${column}`);
      while (head < tail) {
        const sourceLocal = queue[head++];
        const localX = sourceLocal % width;
        const localY = Math.floor(sourceLocal / width);
        const neighbors = [
          localY > 0 ? sourceLocal - width : -1,
          localX + 1 < width ? sourceLocal + 1 : -1,
          localY + 1 < height ? sourceLocal + width : -1,
          localX > 0 ? sourceLocal - 1 : -1,
        ];
        const sourceOffset = ((y0 + localY) * image.width + x0 + localX) * 4;
        for (const neighbor of neighbors) {
          if (neighbor < 0 || visited[neighbor]) continue;
          visited[neighbor] = 1;
          const targetX = neighbor % width;
          const targetY = Math.floor(neighbor / width);
          const targetOffset = ((y0 + targetY) * image.width + x0 + targetX) * 4;
          if (image.pixels[targetOffset + 3] === 0) {
            pixels[targetOffset] = pixels[sourceOffset];
            pixels[targetOffset + 1] = pixels[sourceOffset + 1];
            pixels[targetOffset + 2] = pixels[sourceOffset + 2];
          }
          queue[tail++] = neighbor;
        }
      }
    }
  }
  return pixels;
}

function rgbToHsv(red, green, blue) {
  const r = red / 255;
  const g = green / 255;
  const b = blue / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let hue = 0;
  if (delta > 0) {
    if (max === r) hue = 60 * (((g - b) / delta) % 6);
    else if (max === g) hue = 60 * ((b - r) / delta + 2);
    else hue = 60 * ((r - g) / delta + 4);
  }
  if (hue < 0) hue += 360;
  return { hue, saturation: max > 0 ? delta / max : 0, value: max };
}

function smoothstep(min, max, value) {
  const t = Math.max(0, Math.min(1, (value - min) / (max - min)));
  return t * t * (3 - 2 * t);
}

function accentMaskValue(red, green, blue, alpha, workerGarmentPanel) {
  if (alpha < 8) return 0;
  const { hue, saturation, value } = rgbToHsv(red, green, blue);
  let blueAccent = 0;
  if (hue >= ACCENT_HUE_MIN && hue <= ACCENT_HUE_MAX && value >= 0.045) {
    const hueCoverage = Math.min(
      smoothstep(ACCENT_HUE_MIN, ACCENT_HUE_MIN + 14, hue),
      1 - smoothstep(ACCENT_HUE_MAX - 14, ACCENT_HUE_MAX, hue),
    );
    const saturationCoverage = smoothstep(ACCENT_SATURATION_MIN, 0.43, saturation);
    blueAccent = Math.round(255 * (alpha / 255) * hueCoverage * saturationCoverage);
  }
  if (!workerGarmentPanel || hue < WORKER_PANEL_HUE_MIN || hue > WORKER_PANEL_HUE_MAX || value < 0.12) {
    return blueAccent;
  }
  const panelHueCoverage = Math.min(
    smoothstep(WORKER_PANEL_HUE_MIN, WORKER_PANEL_HUE_MIN + 7, hue),
    1 - smoothstep(WORKER_PANEL_HUE_MAX - 7, WORKER_PANEL_HUE_MAX, hue),
  );
  const panelSaturationCoverage = smoothstep(0.2, 0.42, saturation);
  const panelValueCoverage = smoothstep(0.16, 0.34, value);
  const garmentAccent = Math.round(255 * (alpha / 255)
    * panelHueCoverage * panelSaturationCoverage * panelValueCoverage);
  return Math.max(blueAccent, garmentAccent);
}

function alphaBounds(image, x0, y0, x1, y1, threshold) {
  let minX = x1;
  let minY = y1;
  let maxX = -1;
  let maxY = -1;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      if (image.pixels[(y * image.width + x) * 4 + 3] < threshold) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  return maxX < 0 ? null : { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

function standingFootAnchor(image, cell, fallbackBounds) {
  const footBandY = cell.y + Math.floor(cell.height * 0.74);
  let weightedX = 0;
  let weightTotal = 0;
  let candidateCount = 0;
  for (let y = footBandY; y < cell.y + cell.height; y++) {
    for (let x = cell.x; x < cell.x + cell.width; x++) {
      const offset = (y * image.width + x) * 4;
      const alpha = image.pixels[offset + 3];
      if (alpha < PIVOT_ALPHA_THRESHOLD) continue;
      const { hue, saturation, value } = rgbToHsv(image.pixels[offset], image.pixels[offset + 1], image.pixels[offset + 2]);
      if (hue < FOOT_HUE_MIN || hue > FOOT_HUE_MAX || saturation < 0.16 || value > 0.68) continue;
      const weight = alpha / 255;
      weightedX += x * weight;
      weightTotal += weight;
      candidateCount++;
    }
  }

  let x = weightTotal > 0 ? Math.round(weightedX / weightTotal) :
    fallbackBounds.x + Math.floor((fallbackBounds.width - 1) / 2);
  if (candidateCount < 12) x = cell.x + Math.floor((cell.width - 1) / 2);
  let y = -1;
  const searchRadius = Math.max(12, Math.floor(cell.width * 0.18));
  for (let sampleX = Math.max(cell.x, x - searchRadius); sampleX <= Math.min(cell.x + cell.width - 1, x + searchRadius); sampleX++) {
    for (let sampleY = footBandY; sampleY < cell.y + cell.height; sampleY++) {
      const alpha = image.pixels[(sampleY * image.width + sampleX) * 4 + 3];
      if (alpha >= PIVOT_ALPHA_THRESHOLD) y = Math.max(y, sampleY);
    }
  }
  if (y < footBandY) y = fallbackBounds.y + fallbackBounds.height - 1;
  return { x, y, candidateCount };
}

function defeatedGroundAnchor(cell, opaqueBounds) {
  return {
    x: cell.x + Math.floor((cell.width - 1) / 2),
    y: opaqueBounds.y + opaqueBounds.height - 1,
  };
}

function frameStateSequences(unitRole) {
  if (unitRole === 'worker') return [
    { state: 'idle', rowId: 'idle-ready', loop: true, frameDurationMs: 0 },
    { state: 'walk', rowIds: ['walk-step-a', 'walk-step-b'], loop: true, frameDurationMs: 167 },
    { state: 'gather', rowId: 'gather-chop', loop: true, frameDurationMs: 0 },
    { state: 'build', rowId: 'build-strike', loop: true, frameDurationMs: 0 },
    { state: 'defeat', rowId: 'defeated-corpse', loop: false, frameDurationMs: 0 },
  ];
  return [
    { state: 'idle', rowId: 'idle-ready', loop: true, frameDurationMs: 0 },
    { state: 'walk', rowIds: ['walk-step-a', 'walk-step-b'], loop: true, frameDurationMs: 167 },
    { state: 'attack', rowIds: unitRole === 'infantry'
      ? ['attack-windup', 'attack-strike'] : ['bow-draw', 'arrow-release'],
    loop: false, frameDurationMs: 135 },
    { state: 'defeat', rowId: 'defeated-corpse', loop: false, frameDurationMs: 0 },
  ];
}

function animationBindings(unitRole) {
  if (unitRole === 'worker') return {
    default: 'idle', walking: 'walk', defeated: 'defeat',
    tasks: { gathering: 'gather', building: 'build' },
  };
  return { default: 'idle', walking: 'walk', attacking: 'attack', defeated: 'defeat' };
}

function buildFrameData(manifest, image) {
  const grid = manifest.atlas.frameGrid;
  const rows = manifest.rows;
  const facings = manifest.facingColumns;
  const frames = [];
  const frameByRowAndDirection = new Map();
  const cellsByRowAndDirection = new Map();
  const opaqueByRowAndDirection = new Map();
  const idleHeights = [];
  let maxWidthWorld = 0;
  let maxHeightWorld = 0;

  for (const row of rows) {
    for (const facing of facings) {
      const column = facing.column;
      const rowIndex = row.row;
      const cell = {
        x: grid.columnEdgesPx[column],
        y: grid.rowEdgesPx[rowIndex],
        width: grid.columnEdgesPx[column + 1] - grid.columnEdgesPx[column],
        height: grid.rowEdgesPx[rowIndex + 1] - grid.rowEdgesPx[rowIndex],
      };
      const outer = alphaBounds(image, cell.x, cell.y, cell.x + cell.width, cell.y + cell.height,
        ALPHA_RECT_THRESHOLD);
      const opaque = alphaBounds(image, cell.x, cell.y, cell.x + cell.width, cell.y + cell.height,
        PIVOT_ALPHA_THRESHOLD);
      if (!outer || !opaque) throw new Error(`${manifest.unitRole} ${row.id}/${facing.direction} is empty`);
      const id = `${row.id}@${facing.direction}`;
      cellsByRowAndDirection.set(`${row.id}\0${facing.direction}`, cell);
      opaqueByRowAndDirection.set(`${row.id}\0${facing.direction}`, opaque);
      const frame = {
        id,
        state: row.state,
        pose: row.id,
        facing: facing.direction,
        rectPx: outer,
        alphaBoundsPx: opaque,
        sourceCell: { column, row: rowIndex },
      };
      frames.push(frame);
      frameByRowAndDirection.set(`${row.id}\0${facing.direction}`, id);
      if (row.id === 'idle-ready') idleHeights.push(opaque.height);
    }
  }

  const standingAnchorsByDirection = new Map();
  for (const facing of facings) {
    const key = `idle-ready\0${facing.direction}`;
    const cell = cellsByRowAndDirection.get(key);
    const bounds = opaqueByRowAndDirection.get(key);
    if (!cell || !bounds) throw new Error(`No idle root frame for ${facing.direction}`);
    standingAnchorsByDirection.set(facing.direction, standingFootAnchor(image, cell, bounds));
  }
  for (const frame of frames) {
    const cellKey = `${frame.pose}\0${frame.facing}`;
    const cell = cellsByRowAndDirection.get(cellKey);
    const poseBounds = opaqueByRowAndDirection.get(cellKey);
    if (frame.state === 'defeated') {
      frame.groundPivotPx = defeatedGroundAnchor(cell, poseBounds);
      frame.groundAnchorMode = 'defeated-body-ground';
      continue;
    }
    const standingAnchor = standingAnchorsByDirection.get(frame.facing);
    const idleCell = cellsByRowAndDirection.get(`idle-ready\0${frame.facing}`);
    frame.groundPivotPx = {
      x: cell.x + (standingAnchor.x - idleCell.x),
      y: cell.y + (standingAnchor.y - idleCell.y),
    };
    frame.groundAnchorMode = 'standing-feet-root-shared-across-poses';
  }

  idleHeights.sort((a, b) => a - b);
  const referenceStandingHeightPx = idleHeights[Math.floor(idleHeights.length / 2)];
  const referenceHeightWorld = REFERENCE_HEIGHT_WORLD[manifest.unitRole];
  const worldPerPixel = referenceHeightWorld / referenceStandingHeightPx;
  for (const frame of frames) {
    const widthWorld = frame.rectPx.width * worldPerPixel;
    const heightWorld = frame.rectPx.height * worldPerPixel;
    const pivotOffsetX = (frame.groundPivotPx.x - (frame.rectPx.x + (frame.rectPx.width - 1) / 2)) * worldPerPixel;
    maxWidthWorld = Math.max(maxWidthWorld, widthWorld + Math.abs(pivotOffsetX) * 2);
    maxHeightWorld = Math.max(maxHeightWorld, heightWorld);
  }

  const animations = [];
  for (const direction of facings.map((entry) => entry.direction)) {
    for (const sequence of frameStateSequences(manifest.unitRole)) {
      const rowIds = sequence.rowIds || [sequence.rowId];
      const frameIds = rowIds.map((rowId) => {
        const id = frameByRowAndDirection.get(`${rowId}\0${direction}`);
        if (!id) throw new Error(`No frame ${rowId}/${direction}`);
        return id;
      });
      animations.push({
        id: `${sequence.state}@${direction}`,
        state: sequence.state,
        facing: direction,
        loop: sequence.loop,
        fps: sequence.frameDurationMs > 0 ? 1000 / sequence.frameDurationMs : 0,
        frameDurationMs: sequence.frameDurationMs,
        frameIds,
      });
    }
  }

  return {
    frames,
    animations,
    presentation: {
      referenceStandingHeightWorld: referenceHeightWorld,
      referenceStandingHeightPx,
      referenceStandingHeightSource: 'Worker follows the 0.8-world-unit character baseline in docs/renderer-state-contract.md; Infantry and Archer are pilot candidates for game-zoom review',
      artBoundsWorld: {
        maxWidth: Number(maxWidthWorld.toFixed(4)),
        maxHeight: Number(maxHeightWorld.toFixed(4)),
        includesToolsAndWeapons: true,
      },
      visibleGroundSpanWorld: {
        width: 0.78,
        depth: 0.78,
        unit: 'world-unit',
        purpose: 'visual size cue only; map movement and occupancy remain point-based',
      },
      cullingBoundsWorld: {
        shape: 'sphere',
        center: [0, Number((maxHeightWorld / 2).toFixed(4)), 0],
        radius: Number(Math.hypot(maxWidthWorld / 2, maxHeightWorld / 2).toFixed(4)),
        coversAllFrames: true,
      },
      selectionBoundsWorld: { shape: 'circle', innerRadius: 0.31, outerRadius: 0.39 },
      renderLayers: [{ id: 'character', type: 'single-cutout', plane: 'camera-facing' }],
    },
    bindings: animationBindings(manifest.unitRole),
  };
}

function canonicalFrame(frame, grid, pageId) {
  const { column, row } = frame.sourceCell;
  const cell = {
    x: grid.columnEdgesPx[column],
    y: grid.rowEdgesPx[row],
    width: grid.columnEdgesPx[column + 1] - grid.columnEdgesPx[column],
    height: grid.rowEdgesPx[row + 1] - grid.rowEdgesPx[row],
  };
  return {
      id: frame.id,
      canvasPx: { width: cell.width, height: cell.height },
      groundPivotPx: { x: frame.groundPivotPx.x - cell.x, y: frame.groundPivotPx.y - cell.y },
      groundPivotStatus: 'unreviewed-estimate',
    alphaBoundsPx: {
      x: frame.alphaBoundsPx.x - cell.x,
      y: frame.alphaBoundsPx.y - cell.y,
      width: frame.alphaBoundsPx.width,
      height: frame.alphaBoundsPx.height,
    },
    fallbackRectPx: {
      pageId,
      rectPx: { x: cell.x, y: cell.y, width: cell.width, height: cell.height },
    },
    frameRectsPx: [{
      layerId: 'actor',
      pageId,
      rectPx: frame.rectPx,
      offsetPx: { x: frame.rectPx.x - cell.x, y: frame.rectPx.y - cell.y },
    }],
  };
}

function canonicalWorldBounds(manifest, frameData) {
  const grid = manifest.atlas.frameGrid;
  const worldPerPixel = frameData.presentation.referenceStandingHeightWorld
    / frameData.presentation.referenceStandingHeightPx;
  let minPlaneX = Infinity;
  let maxPlaneX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const frame of frameData.frames) {
    const column = frame.sourceCell.column;
    const row = frame.sourceCell.row;
    const cellX = grid.columnEdgesPx[column];
    const cellY = grid.rowEdgesPx[row];
    const pivotX = frame.groundPivotPx.x - cellX;
    const pivotY = frame.groundPivotPx.y - cellY;
    const left = frame.rectPx.x - cellX;
    const top = frame.rectPx.y - cellY;
    const right = left + frame.rectPx.width;
    const bottom = top + frame.rectPx.height;
    minPlaneX = Math.min(minPlaneX, (left - pivotX) * worldPerPixel);
    maxPlaneX = Math.max(maxPlaneX, (right - pivotX) * worldPerPixel);
    minY = Math.min(minY, (pivotY - bottom) * worldPerPixel);
    maxY = Math.max(maxY, (pivotY - top) * worldPerPixel);
  }
  const horizontalExtent = Math.max(Math.abs(minPlaneX), Math.abs(maxPlaneX));
  const worldBounds = {
    min: [-horizontalExtent, minY, -horizontalExtent].map((value) => Number(value.toFixed(4))),
    max: [horizontalExtent, maxY, horizontalExtent].map((value) => Number(value.toFixed(4))),
  };
  return { worldBounds, heightWorld: Number((maxY - minY).toFixed(4)) };
}

function buildCanonicalPack(manifest, frameData, image, runtimeBytes, maskBytes) {
  const role = manifest.unitRole;
  const pageId = `${role}-color`;
  const sourceFileId = `${role}-atlas-source`;
  const runtimeFileId = `${role}-atlas-runtime`;
  const maskFileId = `${role}-team-accent-mask`;
  const sourcePath = manifest.atlas.path;
  const runtimePath = basename(sourcePath).replace(/-source\.png$/i, '-runtime.png');
  const bounds = canonicalWorldBounds(manifest, frameData);
  const pageDimensions = { width: image.width, height: image.height };
  const files = [
    { id: sourceFileId, path: sourcePath, usage: 'source', format: 'png', sha256: manifest.atlas.sha256, dimensionsPx: pageDimensions },
    { id: runtimeFileId, path: runtimePath, usage: 'runtime', format: 'png', sha256: sha256(runtimeBytes), dimensionsPx: pageDimensions },
    { id: maskFileId, path: TEAM_MASK_PATH, usage: 'team-mask', format: 'png', sha256: sha256(maskBytes), dimensionsPx: pageDimensions },
  ];
  const clips = frameData.animations.map((animation) => ({
    stateId: animation.state,
    directionId: animation.facing,
    loop: animation.loop,
    sequence: animation.frameIds.map((frameId) => ({
      frameId,
      durationMs: animation.frameDurationMs > 0 ? animation.frameDurationMs : 1000,
    })),
  }));

  return {
    schemaVersion: 1,
    packId: manifest.packId,
    packVersion: manifest.packVersion,
    maturity: 'runtime-candidate',
    provenance: manifest.provenance,
    files,
    pages: [{
      id: pageId,
      sourceFileId,
      runtimeFileId,
      maskFileId,
      dimensionsPx: pageDimensions,
      colorSpace: 'srgb',
      pixelFormat: 'rgba8',
      alphaMode: 'straight',
      edgeRule: 'bleed-rgb-under-transparent',
      gutterRule: 'none',
      gutterPx: manifest.atlas.frameGrid.gutterPx,
      wrapMode: 'clamp',
      sampling: {
        generateMipmaps: false,
        minFilter: 'linear',
        magFilter: 'linear',
        uvInsetPx: 0.5,
        maxMipLevel: 0,
      },
    }],
    assets: [{
      id: role,
      kind: 'unit',
      artBoundsWorld: bounds.worldBounds,
      heightWorld: bounds.heightWorld,
      sortAnchorWorld: [0, 0, 0],
      cullingBoundsWorld: bounds.worldBounds,
      selectionBoundsWorld: {
        min: [-0.39, 0, -0.39],
        max: [0.39, 0.04, 0.39],
      },
      layers: [{ id: 'actor', drawLayer: 'actor', batchKey: `unit.${role}` }],
      frames: frameData.frames.map((frame) => canonicalFrame(frame, manifest.atlas.frameGrid, pageId)),
      clips,
    }],
  };
}

async function prepare(manifestArgument) {
  const manifestPath = resolve(ROOT, manifestArgument);
  const manifestDirectory = dirname(manifestPath);
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (!['worker', 'infantry', 'archer'].includes(manifest.unitRole)) {
    throw new Error(`${manifestPath}: expected a Worker, Infantry, or Archer pack`);
  }
  const atlasPath = resolve(manifestDirectory, manifest.atlas.path);
  const atlasBytes = await readFile(atlasPath);
  const image = decodeRgba8(atlasBytes);
  if (image.width !== manifest.atlas.dimensionsPx.width || image.height !== manifest.atlas.dimensionsPx.height) {
    throw new Error(`${atlasPath}: decoded size ${image.width}x${image.height} differs from manifest`);
  }

  const maskPixels = new Uint8Array(image.width * image.height);
  let maskedPixelCount = 0;
  const frameGrid = manifest.atlas.frameGrid;
  for (let pixel = 0; pixel < maskPixels.length; pixel++) {
    const source = pixel * 4;
    const x = pixel % image.width;
    const y = Math.floor(pixel / image.width);
    const column = Math.min(frameGrid.columns - 1, Math.floor(x * frameGrid.columns / image.width));
    const row = Math.min(frameGrid.rows - 1, Math.floor(y * frameGrid.rows / image.height));
    const cellX = frameGrid.columnEdgesPx[column];
    const cellY = frameGrid.rowEdgesPx[row];
    const cellWidth = frameGrid.columnEdgesPx[column + 1] - cellX;
    const cellHeight = frameGrid.rowEdgesPx[row + 1] - cellY;
    const localX = (x - cellX) / cellWidth;
    const localY = (y - cellY) / cellHeight;
    const workerGarmentPanel = manifest.unitRole === 'worker'
      && localX >= WORKER_PANEL_X_RANGE[0] && localX <= WORKER_PANEL_X_RANGE[1]
      && localY >= WORKER_PANEL_Y_RANGE[0] && localY <= WORKER_PANEL_Y_RANGE[1];
    const mask = accentMaskValue(image.pixels[source], image.pixels[source + 1], image.pixels[source + 2],
      image.pixels[source + 3], workerGarmentPanel);
    maskPixels[pixel] = mask;
    if (mask > 0) maskedPixelCount++;
  }
  if (maskedPixelCount < 100) throw new Error(`${manifest.unitRole}: accent mask is unexpectedly sparse`);
  const maskBytes = encodeGray8(image.width, image.height, maskPixels);
  const maskPath = resolve(manifestDirectory, TEAM_MASK_PATH);
  await writeFile(maskPath, maskBytes);

  const frameData = buildFrameData(manifest, image);
  const runtimePixels = bleedTransparentRgbByCell(image, manifest.atlas.frameGrid);
  let bledTransparentPixels = 0;
  for (let pixel = 0; pixel < image.width * image.height; pixel++) {
    const offset = pixel * 4;
    if (image.pixels[offset + 3] === 0
      && (image.pixels[offset] !== runtimePixels[offset]
        || image.pixels[offset + 1] !== runtimePixels[offset + 1]
        || image.pixels[offset + 2] !== runtimePixels[offset + 2])) bledTransparentPixels++;
  }
  const runtimeBytes = encodeRgba8(image.width, image.height, runtimePixels);
  const sourceName = basename(manifest.atlas.path);
  const runtimeName = sourceName.replace(/-source\.png$/i, '-runtime.png');
  const runtimePath = resolve(manifestDirectory, runtimeName);
  await writeFile(runtimePath, runtimeBytes);
  manifest.atlas.runtimePath = runtimeName;
  manifest.atlas.runtimeSha256 = sha256(runtimeBytes);
  const canonicalPack = buildCanonicalPack(manifest, frameData, image, runtimeBytes, maskBytes);
  const canonicalManifestPath = resolve(manifestDirectory, 'sprite-atlas-pack-v1.json');
  await writeFile(canonicalManifestPath, `${JSON.stringify(canonicalPack, null, 2)}\n`);

  manifest.spriteRuntime = {
    contractVersion: 1,
    imageOrigin: 'top-left',
    pivotAlphaThreshold: PIVOT_ALPHA_THRESHOLD,
    alphaRectThreshold: ALPHA_RECT_THRESHOLD,
    frameRectSemantics: 'visible-alpha-rectangle-in-atlas-pixels',
    framePoseBoundsSemantics: 'alpha-bounds-in-atlas-pixels-at-or-above-pivotAlphaThreshold',
    groundPivotSemantics: 'per-facing standing-foot root shared across upright poses; defeated poses use a separate body-ground anchor',
    anchorCalibration: {
      standing: 'per-facing root estimated from dark warm pixels in the lower 26% of the idle pose, then shared in cell-local coordinates across upright action and walk frames',
      footColorFilter: { hueDegrees: [FOOT_HUE_MIN, FOOT_HUE_MAX], saturationMin: 0.16, valueMax: 0.68 },
      footBandStartFraction: 0.74,
      defeated: 'separate cell-center x and opaque-body lower-edge y; not used to calibrate standing frames',
      status: 'heuristic-anchor-candidate; requires visual turn/step review in game',
    },
    animations: frameData.animations,
    frames: frameData.frames,
    bindings: frameData.bindings,
    presentation: frameData.presentation,
  };
  manifest.teamTreatment = {
    ...manifest.teamTreatment,
    accent: manifest.unitRole === 'worker'
      ? 'sky-blue sash and warm linen tunic panel'
      : manifest.teamTreatment.accent,
    emberVariant: 'runtime accent-mask recolor',
    tintMask: TEAM_MASK_PATH,
    accentMask: {
      path: TEAM_MASK_PATH,
      role: 'team-accent-mask',
      dimensionsPx: { width: image.width, height: image.height },
      format: 'PNG',
      channels: 'gray8',
      maskChannel: 'red',
      colorSpace: 'linear-data',
      tintPolicy: 'white applies full team hue while preserving source luminance and alpha; gray applies proportional tint; black preserves source RGB',
      values: { fullTeamTint: 255, preserveSource: 0 },
      source: manifest.unitRole === 'worker'
        ? `deterministic blue sash classification plus warm linen pixels in the cell-local torso ROI x=${WORKER_PANEL_X_RANGE.join('-')}, y=${WORKER_PANEL_Y_RANGE.join('-')}`
        : 'deterministic blue-hue/saturation classification of the Azure accent pixels',
      sha256: sha256(maskBytes),
      classifiedPixels: maskedPixelCount,
    },
  };
  manifest.anchors = {
    status: 'heuristic-anchor-candidate; requires visual turn/step review in game',
    standingProposal: 'per-facing standing-foot root shared across upright poses',
    defeatedNote: 'each defeated pose uses a separate body-ground anchor; it does not calibrate standing poses',
  };
  manifest.integration = {
    ...manifest.integration,
    runtime: false,
    rendererChanges: false,
    notes: 'Canonical sprite-atlas-pack-v1.json, an alpha-preserving edge-bled runtime page, frame metadata, pivots, clips, bounds, and a team-accent mask are prepared; renderer integration is pending.',
  };
  manifest.runtimeReady = false;
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`PREPARED ${manifest.packId}: ${frameData.frames.length} frames, ${frameData.animations.length} clips, ${maskedPixelCount} mask pixels, ${bledTransparentPixels} transparent edge pixels bled`);
  console.log(`PACK ${canonicalManifestPath}`);
  console.log(`RUNTIME ${runtimeName} sha256 ${sha256(runtimeBytes)}`);
}

const manifestArguments = process.argv.slice(2);
for (const manifest of manifestArguments.length ? manifestArguments : DEFAULT_MANIFESTS) {
  try {
    await prepare(manifest);
  } catch (error) {
    console.error(`FAILED ${manifest}: ${error.message}`);
    process.exitCode = 1;
  }
}
