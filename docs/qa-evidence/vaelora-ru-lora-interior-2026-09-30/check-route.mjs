import { readFile, writeFile } from 'node:fs/promises';
const root = new URL('./', import.meta.url);
const map = JSON.parse(await readFile(new URL('ru-lora-interior-study.json', root), 'utf8'));
const blocked = new Set();
for (const obstacle of map.obstacles) {
  for (let row = obstacle.row; row < obstacle.row + obstacle.height; row++) {
    for (let column = obstacle.column; column < obstacle.column + obstacle.width; column++) {
      const cell = row * map.width + column;
      if (blocked.has(cell)) throw new Error('Overlapping obstacle cells');
      blocked.add(cell);
    }
  }
}
const spawnCell = (spawn) => Math.floor(spawn.z + map.height / 2) * map.width
  + Math.floor(spawn.x + map.width / 2);
const start = spawnCell(map.spawnPoints[0]), end = spawnCell(map.spawnPoints[1]);
if (blocked.has(start) || blocked.has(end)) throw new Error('Blocked spawn');
const seen = new Set([start]), queue = [start];
for (let i = 0; i < queue.length; i++) {
  const cell = queue[i], row = Math.floor(cell / map.width), column = cell % map.width;
  for (const [x, y] of [[column-1,row],[column+1,row],[column,row-1],[column,row+1]]) {
    if (x < 0 || y < 0 || x >= map.width || y >= map.height) continue;
    const neighbor = y * map.width + x;
    if (!blocked.has(neighbor) && !seen.has(neighbor)) { seen.add(neighbor); queue.push(neighbor); }
  }
}
if (!seen.has(end)) throw new Error('Spawns disconnected');
for (let column = 3; column < 61; column++) {
  const center = 32 + Math.round(3 * Math.sin(column / 9));
  for (let row = center - 4; row <= center + 4; row++) {
    if (blocked.has(row * map.width + column)) throw new Error('Reserved corridor blocked');
  }
}
const proof = { seed: map.terrainSeed, stoneCells: blocked.size,
  forestCells: map.obstacles.filter(o => o.material === 'forest').length,
  resourceNodes: map.resourceNodes.length, reachableCells: seen.size,
  spawnRouteConnected: true, minReservedCorridorWidthCells: 9 };
await writeFile(new URL('route-proof.json', root), JSON.stringify(proof, null, 2) + '\n');
console.log(JSON.stringify(proof));
