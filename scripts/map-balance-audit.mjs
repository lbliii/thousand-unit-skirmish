#!/usr/bin/env node
import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { buildElevationGrid } from '../src/map-utils.mjs';
import { canTraverseElevation } from '../src/elevation.mjs';
import { UNIT_DEFINITIONS } from '../src/gameplay-definitions.mjs';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const MAPS_DIRECTORY = await realpath(path.join(PROJECT_ROOT, 'maps'));
const suppliedPath = process.argv[2];

if (!suppliedPath || process.argv.length > 3) {
  console.error('Usage: node scripts/map-balance-audit.mjs maps/<map-file>.json');
  process.exit(2);
}

const mapPath = await realpath(path.resolve(PROJECT_ROOT, suppliedPath));
const relativeMapPath = path.relative(MAPS_DIRECTORY, mapPath);
if (relativeMapPath === '' || relativeMapPath === '..'
  || relativeMapPath.startsWith(`..${path.sep}`) || path.isAbsolute(relativeMapPath)) {
  throw new Error('Map path must resolve to a file inside the maps directory.');
}

const definition = JSON.parse(await readFile(mapPath, 'utf8'));
const { width, height } = definition;
if (!Number.isInteger(width) || !Number.isInteger(height) || width < 16 || height < 16
  || width > 256 || height > 256) {
  throw new Error('Map width and height must each be integers from 16 to 256.');
}
if (!Array.isArray(definition.obstacles) || !Array.isArray(definition.spawnPoints)
  || !Array.isArray(definition.resourceNodes ?? []) || !Array.isArray(definition.triggers ?? [])) {
  throw new Error('Map must define obstacle, spawnPoints, resourceNodes, and triggers arrays.');
}

const walkSpeed = Math.max(...Object.values(UNIT_DEFINITIONS).map(rule => rule.combat.moveSpeed));

const cellCount = width * height;
const elevation = buildElevationGrid(width, height, definition.elevationPatches);
const blocked = new Uint8Array(cellCount);
const cellIndex = (column, row) => row * width + column;
const toCell = ({ x, z }) => {
  const column = Math.max(0, Math.min(width - 1, Math.floor(x + width / 2)));
  const row = Math.max(0, Math.min(height - 1, Math.floor(z + height / 2)));
  return cellIndex(column, row);
};

for (const obstacle of definition.obstacles) {
  const { column, row, width: obstacleWidth, height: obstacleHeight } = obstacle;
  if (![column, row, obstacleWidth, obstacleHeight].every(Number.isInteger)
    || column < 0 || row < 0 || obstacleWidth < 1 || obstacleHeight < 1
    || column + obstacleWidth > width || row + obstacleHeight > height) {
    throw new Error(`Invalid obstacle rectangle in ${path.basename(mapPath)}.`);
  }
  for (let z = row; z < row + obstacleHeight; z++) {
    for (let x = column; x < column + obstacleWidth; x++) blocked[cellIndex(x, z)] = 1;
  }
}

const spawnCounts = [0, 1].map((team) => definition.spawnPoints.filter((point) => point?.team === team).length);
if (spawnCounts.some((count) => count !== 1) || definition.spawnPoints.length !== 2) {
  throw new Error('Map must define exactly one spawn point for each team.');
}
const spawns = [0, 1].map((team) => definition.spawnPoints.find((point) => point.team === team));
if (spawns.some((point) => !point || !Number.isFinite(point.x) || !Number.isFinite(point.z)
  || Math.abs(point.x) >= width / 2 || Math.abs(point.z) >= height / 2)) {
  throw new Error('Map must define one finite spawn point for each team.');
}
const spawnCells = spawns.map(toCell);
if (spawnCells.some((cell) => blocked[cell])) throw new Error('A team spawn is on a blocked cell.');

function edgeKey(left, right) {
  return Math.min(left, right) * cellCount + Math.max(left, right);
}

function searchFrom(startCell, removedEdges = new Set()) {
  const distance = new Int32Array(cellCount);
  distance.fill(-1);
  const previous = new Int32Array(cellCount);
  previous.fill(-1);
  const queue = new Int32Array(cellCount);
  const neighbors = new Int32Array(4);
  let readIndex = 0;
  let writeIndex = 0;
  distance[startCell] = 0;
  queue[writeIndex++] = startCell;

  while (readIndex < writeIndex) {
    const current = queue[readIndex++];
    const column = current % width;
    const row = Math.floor(current / width);
    let neighborCount = 0;
    if (column > 0) neighbors[neighborCount++] = current - 1;
    if (column + 1 < width) neighbors[neighborCount++] = current + 1;
    if (row > 0) neighbors[neighborCount++] = current - width;
    if (row + 1 < height) neighbors[neighborCount++] = current + width;
    for (let index = 0; index < neighborCount; index++) {
      const next = neighbors[index];
      if (!canTraverseElevation(elevation, current, next) || blocked[next] || distance[next] >= 0 || removedEdges.has(edgeKey(current, next))) continue;
      distance[next] = distance[current] + 1;
      previous[next] = current;
      queue[writeIndex++] = next;
    }
  }
  return { distance, previous };
}

function pathToTargets(tree, targets) {
  let goal = -1;
  for (const candidate of targets) {
    if (tree.distance[candidate] < 0) continue;
    if (goal < 0 || tree.distance[candidate] < tree.distance[goal]
      || (tree.distance[candidate] === tree.distance[goal] && candidate < goal)) goal = candidate;
  }
  if (goal < 0) return null;
  const path = [];
  for (let cell = goal; cell >= 0; cell = tree.previous[cell]) {
    path.push(cell);
    if (tree.previous[cell] < 0) break;
  }
  path.reverse();
  return { cells: path.length - 1, path };
}

function formatDistance(cells) {
  if (cells === null) return 'unreachable';
  return `${cells} cells / ${(cells / walkSpeed).toFixed(1)}s nominal walk`;
}

function triggerTargets(trigger) {
  const zone = trigger?.zone;
  if (!zone || ![zone.column, zone.row, zone.width, zone.height].every(Number.isInteger)
    || zone.column < 0 || zone.row < 0 || zone.width < 1 || zone.height < 1
    || zone.column + zone.width > width || zone.row + zone.height > height) {
    throw new Error(`Trigger ${trigger?.id ?? '(unknown)'} has an invalid zone.`);
  }
  const targets = [];
  for (let row = zone.row; row < zone.row + zone.height; row++) {
    for (let column = zone.column; column < zone.column + zone.width; column++) {
      const cell = cellIndex(column, row);
      if (!blocked[cell]) targets.push(cell);
    }
  }
  return targets;
}

const spawnTrees = spawnCells.map((cell) => searchFrom(cell));
const stockTotals = [0, 0].map(() => ({ food: 0, wood: 0 }));
const contestedStock = { food: 0, wood: 0 };
const resourceRows = [];
for (const node of definition.resourceNodes ?? []) {
  if (!['food', 'wood'].includes(node.type) || !Number.isFinite(node.stock) || node.stock <= 0
    || !Number.isFinite(node.x) || !Number.isFinite(node.z)
    || Math.abs(node.x) >= width / 2 || Math.abs(node.z) >= height / 2) {
    throw new Error(`Resource node ${node.id ?? '(unknown)'} is invalid.`);
  }
  const cell = toCell(node);
  if (blocked[cell]) throw new Error(`Resource node ${node.id} is on a blocked cell.`);
  const distances = spawnTrees.map((tree) => tree.distance[cell]);
  if (distances.some((distance) => distance < 0)) {
    throw new Error(`Resource node ${node.id} is unreachable from a team spawn.`);
  }
  const column = cell % width;
  const row = Math.floor(cell / width);
  const nearestSpawn = distances[0] < distances[1] ? 0
    : distances[1] < distances[0] ? 1 : null;
  if (nearestSpawn === null) contestedStock[node.type] += node.stock;
  else stockTotals[nearestSpawn][node.type] += node.stock;
  resourceRows.push({
    id: node.id,
    type: node.type,
    stock: node.stock,
    column,
    row,
    nearestSpawn: nearestSpawn === null ? 'tied' : `team ${nearestSpawn}`,
    travel: distances.map(formatDistance),
  });
}

const triggerRows = [];
for (const trigger of definition.triggers ?? []) {
  const targets = triggerTargets(trigger);
  if (targets.length === 0) throw new Error(`Trigger ${trigger.id} has no walkable cells in its zone.`);
  const teamRoutes = [];
  for (let team = 0; team < 2; team++) {
    const primary = pathToTargets(spawnTrees[team], targets);
    if (!primary) {
      teamRoutes.push({ primary: null, alternate: null });
      continue;
    }
    const removedEdges = new Set();
    for (let index = 1; index < primary.path.length; index++) {
      removedEdges.add(edgeKey(primary.path[index - 1], primary.path[index]));
    }
    const alternate = primary.cells > 0
      ? pathToTargets(searchFrom(spawnCells[team], removedEdges), targets) : null;
    teamRoutes.push({ primary, alternate });
  }
  triggerRows.push({ id: trigger.id, name: trigger.name, teamRoutes });
}

const spawnToSpawn = spawnTrees[0].distance[spawnCells[1]];
const startingResources = definition.startingResources ?? {};

console.log(`${definition.name ?? definition.id ?? path.basename(mapPath)} (${width} × ${height})`);
console.log(`Nominal single-unit walk speed: ${walkSpeed} cells/s; excludes uphill cost, formation, congestion, and command delay.`);
console.log(`Spawn-to-spawn geometry: ${formatDistance(spawnToSpawn < 0 ? null : spawnToSpawn)} (not an observed first-contact time).`);
console.log(`Starting resources per team: food ${startingResources.food ?? 0}, wood ${startingResources.wood ?? 0}.`);
console.log(`Initial map stock by nearest spawn: team 0 food ${stockTotals[0].food}, wood ${stockTotals[0].wood}; team 1 food ${stockTotals[1].food}, wood ${stockTotals[1].wood}; tied food ${contestedStock.food}, wood ${contestedStock.wood}.`);

if (triggerRows.length > 0) {
  console.log('\nObjective travel and passable route alternatives:');
  for (const trigger of triggerRows) {
    console.log(`- ${trigger.name} (${trigger.id})`);
    for (const team of [0, 1]) {
      const { primary, alternate } = trigger.teamRoutes[team];
      console.log(`  team ${team}: primary ${formatDistance(primary?.cells ?? null)}; edge-disjoint alternate after excluding it ${formatDistance(alternate?.cells ?? null)}.`);
    }
  }
} else {
  console.log('\nNo capture objectives are defined on this map.');
}

if (resourceRows.length > 0) {
  console.log('\nResource travel by spawn (map stock only; harvesting/use requires a match):');
  for (const node of resourceRows) {
    console.log(`- ${node.id} ${node.type} stock ${node.stock} at (${node.column}, ${node.row}), nearest ${node.nearestSpawn}; team 0 ${node.travel[0]}, team 1 ${node.travel[1]}.`);
  }
} else {
  console.log('\nNo resource nodes are defined on this map.');
}

console.log('\nStatic map-layout estimates only. Confirm opening, expansion, route viability, and resource use in two-seat matches.');
