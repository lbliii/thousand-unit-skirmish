const grass = new Set(['meadow', 'short-grass', 'long-grass', 'dry-grass']);

// Sparse decoration only: map obstacles and economic markers retain precedence.
export function meadowPlantPositions(definition, base = definition.terrainBase) {
  if (!grass.has(base) || definition.id === 'meshy-resource-review') return [];
  const { width, height } = definition;
  const materials = Array(width * height).fill(base);
  const blocked = new Uint8Array(width * height);
  const paint = (rect, callback, padding = 0) => {
    for (let r = Math.max(0, rect.row - padding); r < Math.min(height, rect.row + rect.height + padding); r++) {
      for (let c = Math.max(0, rect.column - padding); c < Math.min(width, rect.column + rect.width + padding); c++) callback(r * width + c);
    }
  };
  for (const patch of definition.terrainPatches || []) paint(patch, cell => { materials[cell] = patch.material; });
  for (const obstacle of definition.obstacles || []) paint(obstacle, cell => { blocked[cell] = 1; }, 1);
  for (const trigger of definition.triggers || []) if (trigger.zone) paint(trigger.zone, cell => { blocked[cell] = 1; }, 1);
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
    // Coarse patches leave broad breathing room rather than uniform scatter.
    const patch = Math.floor(row / 4) * Math.ceil(width / 4) + Math.floor(column / 4);
    if (blocked[cell] || !grass.has(materials[cell]) || random(patch, 401) >= 0.24 || random(cell, 409) >= 0.18) continue;
    const x = column + 0.5 - width / 2 + (random(cell, 419) - 0.5) * 0.3;
    const z = row + 0.5 - height / 2 + (random(cell, 421) - 0.5) * 0.3;
    if ((definition.spawnPoints || []).some(p => Math.hypot(x - p.x, z - p.z) < 8)) continue;
    if ((definition.resourceNodes || []).some(p => Math.hypot(x - p.x, z - p.z) < 2.5)) continue;
    positions.push({ cell, x, z, scale: 0.5 + random(cell, 431) * 0.22, flip: random(cell, 433) < 0.5 });
  }
  return positions;
}
