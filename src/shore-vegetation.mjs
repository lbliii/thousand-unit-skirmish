// Decorative roots occupy existing blocked water, never a new land obstacle.
export function shorePlantPositions(definition) {
  const { width, height } = definition;
  const water = new Uint8Array(width * height);
  for (const obstacle of definition.obstacles || []) {
    if (obstacle.material !== 'water') continue;
    for (let row = Math.max(0, obstacle.row); row < Math.min(height, obstacle.row + obstacle.height); row++) {
      for (let column = Math.max(0, obstacle.column); column < Math.min(width, obstacle.column + obstacle.width); column++) {
        water[row * width + column] = 1;
      }
    }
  }
  const wet = (column, row) => column >= 0 && row >= 0 && column < width && row < height
    && water[row * width + column] === 1;
  const seed = Math.trunc(definition.terrainSeed || 0) >>> 0;
  const random = (cell, salt) => {
    let value = (cell ^ seed ^ salt) >>> 0;
    value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
    value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
    return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
  };
  const positions = [];
  for (let row = 0; row < height; row++) for (let column = 0; column < width; column++) {
    const cell = row * width + column;
    if (!water[cell] || random(cell, 107) >= 0.38) continue;
    const edges = [[-1, 0], [1, 0], [0, -1], [0, 1]].filter(([dx, dz]) => {
      const x = column + dx, z = row + dz;
      // Do not fringe map boundaries or the last wet cell before a crossing.
      return x >= 0 && z >= 0 && x < width && z < height && !wet(x, z)
        && wet(column + dz, row + dx) && wet(column - dz, row - dx)
        && wet(column + dz * 2, row + dx * 2) && wet(column - dz * 2, row - dx * 2);
    });
    if (!edges.length) continue;
    const [dx, dz] = edges[Math.floor(random(cell, 113) * edges.length)];
    const along = (random(cell, 127) - 0.5) * 0.18;
    positions.push({ cell,
      x: column + 0.5 - width / 2 + dx * 0.1 + dz * along,
      z: row + 0.5 - height / 2 + dz * 0.1 + dx * along,
      scale: 0.55 + random(cell, 131) * 0.2,
      flip: random(cell, 149) < 0.5,
    });
  }
  return positions;
}

// Compatibility for the original reed-placement scenario.
export const shoreReedPositions = shorePlantPositions;
