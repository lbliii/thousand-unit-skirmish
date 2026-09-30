// Visual-only paint masks. Map cells still own collision, elevation and resources.
const KERNEL = [1, 4, 6, 4, 1];
const clamp = (value, maximum) => Math.max(0, Math.min(maximum, value));

function blur(source, width, height) {
  const horizontal = new Float32Array(source.length);
  const result = new Float32Array(source.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      for (let offset = -2; offset <= 2; offset++) {
        horizontal[y * width + x] += source[y * width + clamp(x + offset, width - 1)]
          * KERNEL[offset + 2] / 16;
      }
    }
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      for (let offset = -2; offset <= 2; offset++) {
        result[y * width + x] += horizontal[clamp(y + offset, height - 1) * width + x]
          * KERNEL[offset + 2] / 16;
      }
    }
  }
  return result;
}

function sample(field, width, height, x, y) {
  x = clamp(x, width - 1);
  y = clamp(y, height - 1);
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const x1 = Math.min(width - 1, x0 + 1), y1 = Math.min(height - 1, y0 + 1);
  const tx = x - x0, ty = y - y0;
  return (field[y0 * width + x0] * (1 - tx) + field[y0 * width + x1] * tx) * (1 - ty)
    + (field[y1 * width + x0] * (1 - tx) + field[y1 * width + x1] * tx) * ty;
}

export function buildTerrainBlendMasks(definition, materials, base) {
  const scale = 2;
  const width = definition.width * scale, height = definition.height * scale;
  const labels = new Uint8Array(definition.width * definition.height);
  const baseIndex = materials.indexOf(base);
  labels.fill(baseIndex);
  for (const patch of definition.terrainPatches || []) {
    const index = materials.indexOf(patch.material);
    if (index < 0) continue;
    for (let row = patch.row; row < patch.row + patch.height; row++) {
      for (let column = patch.column; column < patch.column + patch.width; column++) {
        labels[row * definition.width + column] = index;
      }
    }
  }
  const present = new Set(labels);
  if (present.size === 1 && present.has(baseIndex)) return [];
  // Base is drawn first; each subsequent alpha accounts for layers beneath it.
  // This reconstructs a normalized mixture rather than leaking base color into
  // every border or making the last catalog material dominate a three-way join.
  const order = [baseIndex, ...materials.map((_, i) => i).filter(i => i !== baseIndex && present.has(i))];
  const cumulative = new Float32Array(width * height);
  const masks = [];
  const displacedX = new Float32Array(width * height);
  const displacedY = new Float32Array(width * height);
  const seed = (definition.terrainSeed || 0) % 97;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pixel = y * width + x;
      displacedX[pixel] = x + Math.sin(x * 0.31 + seed) * Math.sin(y * 0.23) * 0.6;
      displacedY[pixel] = y + Math.sin(y * 0.29 + seed) * Math.sin(x * 0.19) * 0.6;
    }
  }
  for (const index of order) {
    const field = new Float32Array(width * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        field[y * width + x] = labels[Math.floor(y / scale) * definition.width + Math.floor(x / scale)] === index ? 1 : 0;
      }
    }
    const softened = blur(blur(field, width, height), width, height);
    const pixels = index === baseIndex ? null : new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const pixel = y * width + x;
        // Low-amplitude shared displacement breaks ruler-straight paint edges
        // without changing the sum of the sampled material weights.
        const weight = sample(softened, width, height, displacedX[pixel], displacedY[pixel]);
        cumulative[pixel] += weight;
        if (!pixels) continue;
        const opacity = cumulative[pixel] > 0 ? weight / cumulative[pixel] : 0;
        pixels[pixel * 4] = pixels[pixel * 4 + 1] = pixels[pixel * 4 + 2] = Math.round(opacity * 255);
        pixels[pixel * 4 + 3] = 255;
      }
    }
    if (pixels) masks.push({ material: materials[index], width, height, pixels });
  }
  return masks;
}
