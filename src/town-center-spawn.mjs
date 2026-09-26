const TOWN_CENTER_OFFSET = 3;
const TOWN_CENTER_EDGE_MARGIN = 1.5;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function townCenterSpawnPosition(spawnPoints, team, width, height) {
  const spawn = spawnPoints?.find((point) => point.team === team);
  const opponent = spawnPoints?.find((point) => point.team === 1 - team);
  if (!spawn || !opponent || ![spawn.x, spawn.z, opponent.x, opponent.z, width, height].every(Number.isFinite)
    || ![0, 1].includes(team) || width <= TOWN_CENTER_EDGE_MARGIN * 2
    || height <= TOWN_CENTER_EDGE_MARGIN * 2) {
    throw new TypeError('Town Center placement needs two valid team spawns and map dimensions.');
  }

  let outwardX = spawn.x - opponent.x;
  let outwardZ = spawn.z - opponent.z;
  let outwardLength = Math.hypot(outwardX, outwardZ);
  if (outwardLength < 1e-9) {
    // Overlapping spawn markers are valid legacy map data. Keep their Town Centers apart.
    outwardX = team === 0 ? -1 : 1;
    outwardZ = 0;
    outwardLength = 1;
  }

  const halfWidth = width / 2;
  const halfHeight = height / 2;
  return {
    x: clamp(spawn.x + outwardX / outwardLength * TOWN_CENTER_OFFSET,
      -halfWidth + TOWN_CENTER_EDGE_MARGIN, halfWidth - TOWN_CENTER_EDGE_MARGIN),
    z: clamp(spawn.z + outwardZ / outwardLength * TOWN_CENTER_OFFSET,
      -halfHeight + TOWN_CENTER_EDGE_MARGIN, halfHeight - TOWN_CENTER_EDGE_MARGIN),
  };
}
