// Cultivated channel-side flowers are decoration, independent of forest stock.
export function gardenPlantPositions(definition, base = definition.terrainBase) {
  if (base !== 'garden-loam' || definition.id === 'meshy-resource-review') return [];
  const { width, height } = definition;
  const materials = Array(width * height).fill(base);
  const water = new Uint8Array(width * height), blocked = new Uint8Array(width * height);
  const paint = (rect, callback, padding = 0) => {
    for (let r = Math.max(0, rect.row - padding); r < Math.min(height, rect.row + rect.height + padding); r++) {
      for (let c = Math.max(0, rect.column - padding); c < Math.min(width, rect.column + rect.width + padding); c++) callback(r * width + c);
    }
  };
  for (const patch of definition.terrainPatches || []) paint(patch, cell => { materials[cell] = patch.material; });
  for (const obstacle of definition.obstacles || []) {
    if (obstacle.material === 'water') paint(obstacle, cell => { water[cell] = 1; });
    else paint(obstacle, cell => { blocked[cell] = 1; }, 1);
  }
  for (const trigger of definition.triggers || []) if (trigger.zone) paint(trigger.zone, cell => { blocked[cell] = 1; }, 1);
  const wet = (c, r) => c >= 0 && c < width && r >= 0 && r < height && water[r * width + c] === 1;
  const seed = Math.trunc(definition.terrainSeed || 0) >>> 0;
  const random = (cell, salt) => {
    let value = (cell ^ seed ^ salt) >>> 0;
    value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
    value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
    return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
  };
  const positions = [];
  for (let row = 1; row < height - 1; row++) for (let column = 1; column < width - 1; column++) {
    const cell = row * width + column;
    if (water[cell] || blocked[cell] || materials[cell] !== 'garden-loam') continue;
    // Require a continuous bank; five wet cells keep channel ends/crossings bare.
    const banks = [[-1, 0], [1, 0], [0, -1], [0, 1]].filter(([dx, dz]) =>
      [-2, -1, 0, 1, 2].every(offset => wet(column + dx + dz * offset, row + dz + dx * offset)));
    if (!banks.length) continue;
    const bed = Math.floor(row / 6) * Math.ceil(width / 6) + Math.floor(column / 6);
    if (random(bed, 503) >= 0.6 || random(cell, 509) >= 0.7) continue;
    const x = column + 0.5 - width / 2 + (random(cell, 521) - 0.5) * 0.12;
    const z = row + 0.5 - height / 2 + (random(cell, 523) - 0.5) * 0.12;
    if ((definition.spawnPoints || []).some(p => Math.hypot(x - p.x, z - p.z) < 8)) continue;
    if ((definition.resourceNodes || []).some(p => Math.hypot(x - p.x, z - p.z) < 2.5)) continue;
    positions.push({ cell, x, z, scale: 0.65 + random(cell, 541) * 0.2, flip: random(cell, 547) < 0.5 });
  }
  return positions;
}
