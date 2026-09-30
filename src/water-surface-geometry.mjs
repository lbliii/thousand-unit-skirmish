import * as THREE from 'three';

export const WATER_LEVEL = 0.032;
const SHORE_LIFT = 0.004;
const SHORE_WIDTH = 0.22;

const DEEP_WATER = new THREE.Color(0x304f62);
const OPEN_WATER = new THREE.Color(0x4d7982);
const COOL_SHORE = new THREE.Color(0x82968e);
const SAND_SHORE = new THREE.Color(0xac936d);

function terrainMaterials(definition, cellCount) {
  const cells = new Array(cellCount).fill(definition.terrainBase || 'meadow');
  for (const patch of definition.terrainPatches || []) {
    for (let row = patch.row; row < patch.row + patch.height; row++) {
      for (let column = patch.column; column < patch.column + patch.width; column++) {
        cells[row * definition.width + column] = patch.material;
      }
    }
  }
  return cells;
}

function appendQuad(buffer, points, colors) {
  const first = buffer.positions.length / 3;
  for (let index = 0; index < points.length; index++) {
    buffer.positions.push(...points[index]);
    buffer.colors.push(colors[index].r, colors[index].g, colors[index].b);
  }
  buffer.indices.push(first, first + 3, first + 1, first, first + 2, first + 3);
}

function waterColorAt(x, z) {
  const ripple = 0.5 + 0.5 * Math.sin(x * 1.17 + z * 0.56) * Math.cos(z * 0.93 - x * 0.41);
  return DEEP_WATER.clone().lerp(OPEN_WATER, 0.07 + ripple * 0.1);
}

function appendShoreBand(buffer, edge, x0, z0, x1, z1, shorelineColor, edgeIndex) {
  const y = WATER_LEVEL + SHORE_LIFT + edgeIndex * 0.00025;
  const waterColor = (x, z) => waterColorAt(x, z);
  if (edge === 'left') {
    const inner = x0 + SHORE_WIDTH;
    appendQuad(buffer,
      [[x0, y, z0], [inner, y, z0], [x0, y, z1], [inner, y, z1]],
      [shorelineColor, waterColor(inner, z0), shorelineColor, waterColor(inner, z1)]);
  } else if (edge === 'right') {
    const inner = x1 - SHORE_WIDTH;
    appendQuad(buffer,
      [[inner, y, z0], [x1, y, z0], [inner, y, z1], [x1, y, z1]],
      [waterColor(inner, z0), shorelineColor, waterColor(inner, z1), shorelineColor]);
  } else if (edge === 'top') {
    const inner = z0 + SHORE_WIDTH;
    appendQuad(buffer,
      [[x0, y, z0], [x1, y, z0], [x0, y, inner], [x1, y, inner]],
      [shorelineColor, shorelineColor, waterColor(x0, inner), waterColor(x1, inner)]);
  } else {
    const inner = z1 - SHORE_WIDTH;
    appendQuad(buffer,
      [[x0, y, inner], [x1, y, inner], [x0, y, z1], [x1, y, z1]],
      [waterColor(x0, inner), waterColor(x1, inner), shorelineColor, shorelineColor]);
  }
}

export function buildWaterSurfaceGeometry(definition) {
  if (!definition || !Number.isInteger(definition.width) || !Number.isInteger(definition.height)
    || definition.width <= 0 || definition.height <= 0) return null;

  const { width, height } = definition;
  const cellCount = width * height;
  const waterCells = new Uint8Array(cellCount);
  for (const obstacle of definition.obstacles || []) {
    if (obstacle?.material !== 'water') continue;
    for (let row = obstacle.row; row < obstacle.row + obstacle.height; row++) {
      for (let column = obstacle.column; column < obstacle.column + obstacle.width; column++) {
        if (column >= 0 && column < width && row >= 0 && row < height) {
          waterCells[row * width + column] = 1;
        }
      }
    }
  }

  let waterCellCount = 0;
  for (const isWater of waterCells) waterCellCount += isWater;
  if (waterCellCount === 0) return null;

  const halfX = width / 2;
  const halfZ = height / 2;
  const landMaterials = terrainMaterials(definition, cellCount);
  const buffer = { positions: [], colors: [], indices: [] };
  let shorelineEdgeCount = 0;
  let sandyShorelineEdgeCount = 0;
  const edges = [
    { name: 'left', column: -1, row: 0 },
    { name: 'right', column: 1, row: 0 },
    { name: 'top', column: 0, row: -1 },
    { name: 'bottom', column: 0, row: 1 },
  ];

  for (let row = 0; row < height; row++) {
    for (let column = 0; column < width; column++) {
      const index = row * width + column;
      if (!waterCells[index]) continue;
      const x0 = column - halfX;
      const x1 = x0 + 1;
      const z0 = row - halfZ;
      const z1 = z0 + 1;
      appendQuad(buffer,
        [[x0, WATER_LEVEL, z0], [x1, WATER_LEVEL, z0],
          [x0, WATER_LEVEL, z1], [x1, WATER_LEVEL, z1]],
        [waterColorAt(x0, z0), waterColorAt(x1, z0), waterColorAt(x0, z1), waterColorAt(x1, z1)]);

      for (let edgeIndex = 0; edgeIndex < edges.length; edgeIndex++) {
        const edge = edges[edgeIndex];
        const neighborColumn = column + edge.column;
        const neighborRow = row + edge.row;
        if (neighborColumn < 0 || neighborColumn >= width || neighborRow < 0 || neighborRow >= height) continue;
        const neighborIndex = neighborRow * width + neighborColumn;
        if (waterCells[neighborIndex]) continue;
        shorelineEdgeCount++;
        const isSand = landMaterials[neighborIndex] === 'sand';
        if (isSand) sandyShorelineEdgeCount++;
        appendShoreBand(buffer, edge.name, x0, z0, x1, z1,
          (isSand ? SAND_SHORE : COOL_SHORE), edgeIndex + 1);
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(buffer.positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(buffer.colors, 3));
  geometry.setIndex(buffer.indices);
  geometry.computeVertexNormals();
  geometry.userData.waterCellCount = waterCellCount;
  geometry.userData.shorelineEdgeCount = shorelineEdgeCount;
  geometry.userData.sandyShorelineEdgeCount = sandyShorelineEdgeCount;
  return geometry;
}
