import { inflateSync } from 'node:zlib';

function pngChunks(bytes) {
  if (!bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    throw new Error('source atlas is not a PNG');
  }
  let offset = 8;
  const idat = [];
  let header = null;
  while (offset < bytes.length) {
    const length = bytes.readUInt32BE(offset);
    offset += 4;
    const type = bytes.toString('ascii', offset, offset + 4);
    offset += 4;
    const data = bytes.subarray(offset, offset + length);
    offset += length + 4;
    if (type === 'IHDR') header = data;
    if (type === 'IDAT') idat.push(data);
    if (type === 'IEND') break;
  }
  if (!header || !idat.length) throw new Error('source atlas is missing PNG image data');
  return { header, compressed: Buffer.concat(idat) };
}

function paethPredictor(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

export function decodeRgba8(bytes) {
  const { header, compressed } = pngChunks(bytes);
  const width = header.readUInt32BE(0);
  const height = header.readUInt32BE(4);
  const bitDepth = header[8];
  const colorType = header[9];
  const interlace = header[12];
  if (bitDepth !== 8 || colorType !== 6 || interlace !== 0) {
    throw new Error('source atlas must be a non-interlaced 8-bit RGBA PNG');
  }
  const stride = width * 4;
  const raw = inflateSync(compressed);
  const pixels = new Uint8Array(height * stride);
  let input = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[input++];
    const rowStart = y * stride;
    const previousStart = rowStart - stride;
    for (let x = 0; x < stride; x++) {
      const encoded = raw[input++];
      const left = x >= 4 ? pixels[rowStart + x - 4] : 0;
      const above = y > 0 ? pixels[previousStart + x] : 0;
      const upperLeft = y > 0 && x >= 4 ? pixels[previousStart + x - 4] : 0;
      let predictor = 0;
      if (filter === 1) predictor = left;
      else if (filter === 2) predictor = above;
      else if (filter === 3) predictor = Math.floor((left + above) / 2);
      else if (filter === 4) predictor = paethPredictor(left, above, upperLeft);
      else if (filter !== 0) throw new Error(`unsupported PNG filter ${filter}`);
      pixels[rowStart + x] = (encoded + predictor) & 255;
    }
  }
  return { width, height, pixels };
}

export function measureFrameAlpha(image, rect, threshold = 8) {
  let minX = rect.width, minY = rect.height, maxX = -1, maxY = -1;
  for (let y = 0; y < rect.height; y++) for (let x = 0; x < rect.width; x++) {
    if (image.pixels[((rect.y+y)*image.width+rect.x+x)*4+3] < threshold) continue;
    minX = Math.min(minX,x); minY = Math.min(minY,y);
    maxX = Math.max(maxX,x); maxY = Math.max(maxY,y);
  }
  return maxX < 0 ? null : {x:minX,y:minY,width:maxX-minX+1,height:maxY-minY+1};
}
export function assertFrameUnclipped(image, frame, margin = 2, allowBelowGround = false) {
  const rect = frame.fallbackRectPx.rectPx;
  const box = measureFrameAlpha(image, rect);
  if (!box || box.x < margin || box.y < margin
    || box.x+box.width > rect.width-margin || box.y+box.height > rect.height-margin) {
    throw new Error(`${frame.id}: empty or edge-cut pose; recapture the complete motion envelope`);
  }
  if (!['x', 'y', 'width', 'height'].every(key => box[key] === frame.alphaBoundsPx?.[key])) {
    throw new Error(`${frame.id}: declared alpha bounds disagree with decoded pixels`);
  }
  if (!allowBelowGround && box.y+box.height > frame.groundPivotPx.y) {
    throw new Error(`${frame.id}: visible pixels below the shared ground baseline can intersect terrain`);
  }
  return box;
}
