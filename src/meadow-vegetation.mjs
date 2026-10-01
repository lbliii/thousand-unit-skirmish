const grass = new Set(['meadow', 'short-grass', 'long-grass', 'dry-grass']);
const sand = new Set(['sand']);
const snow = new Set(['snow']);

function seededRandom(seed) {
  return (cell, salt) => {
    let value = (cell ^ seed ^ salt) >>> 0;
    value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
    value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
    return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
  };
}

// Choose a specimen per coarse bed, preserving every accepted root and gap.
export function meadowPlantGroups(definition, base = definition.terrainBase) {
  return specimenGroups(definition, meadowPlantPositions(definition, base), ['bellweather-meadow-herbs', 'bellweather-meadow-clover', 'bellweather-wild-barley'], 4);
}

export function drylandPlantPositions(definition, base = definition.terrainBase) {
  return landPlantPositions(definition, base, sand, 6, 0.18, 0.08);
}

export function drylandPlantGroups(definition, base = definition.terrainBase) {
  return specimenGroups(definition, drylandPlantPositions(definition, base), ['sereward-succulent', 'sereward-succulent-02'], 6);
}

export function snowPlantPositions(definition, base = definition.terrainBase) {
  return landPlantPositions(definition, base, snow, 6, 0.14, 0.09);
}

export function snowPlantGroups(definition, base = definition.terrainBase) {
  return specimenGroups(definition, snowPlantPositions(definition, base), ['pale-meridian-silver-moss', 'pale-meridian-frostberry'], 6);
}

function specimenGroups(definition, positions, names, patchSize) {
  const groups = names.map(name => ({ name, positions: [] }));
  const random = seededRandom(Math.trunc(definition.terrainSeed || 0) >>> 0);
  for (const point of positions) {
    const row = Math.floor(point.cell / definition.width), column = point.cell % definition.width;
    const patch = Math.floor(row / patchSize) * Math.ceil(definition.width / patchSize) + Math.floor(column / patchSize);
    groups[Math.floor(random(patch, 439) * groups.length)].positions.push(point);
  }
  return groups.filter(group => group.positions.length);
}

// Sparse decoration only: map obstacles and economic markers retain precedence.
export function meadowPlantPositions(definition, base = definition.terrainBase) {
  return landPlantPositions(definition, base, grass, 4, 0.24, 0.18);
}

function landPlantPositions(definition, base, acceptedMaterials, patchSize, patchShare, cellShare) {
  if (!acceptedMaterials.has(base) || definition.id === 'meshy-resource-review') return [];
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
  const random = seededRandom(seed);
  const positions = [];
  for (let row = 1; row < height - 1; row++) for (let column = 1; column < width - 1; column++) {
    const cell = row * width + column;
    // Coarse patches leave broad breathing room rather than uniform scatter.
    const patch = Math.floor(row / patchSize) * Math.ceil(width / patchSize) + Math.floor(column / patchSize);
    if (blocked[cell] || !acceptedMaterials.has(materials[cell]) || random(patch, 401) >= patchShare || random(cell, 409) >= cellShare) continue;
    const x = column + 0.5 - width / 2 + (random(cell, 419) - 0.5) * 0.3;
    const z = row + 0.5 - height / 2 + (random(cell, 421) - 0.5) * 0.3;
    if ((definition.spawnPoints || []).some(p => Math.hypot(x - p.x, z - p.z) < 8)) continue;
    if ((definition.resourceNodes || []).some(p => Math.hypot(x - p.x, z - p.z) < 2.5)) continue;
    positions.push({ cell, x, z, scale: 0.5 + random(cell, 431) * 0.22, flip: random(cell, 433) < 0.5 });
  }
  return positions;
}
