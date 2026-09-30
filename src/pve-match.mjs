/** Stable, server-owned launch rules for the curated Play vs AI map pool. */

export const PVE_MAP_IDS = Object.freeze(['bellweather-millrace', 'underbough-rootways']);

export function parseUint32Seed(value, label = 'seed') {
  const number = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
  if (!Number.isInteger(number) || number < 0 || number > 0xffff_ffff) {
    throw new TypeError(`${label} must be an unsigned 32-bit integer.`);
  }
  return number;
}

export function selectPveMapId(mapSeed, mapIds = PVE_MAP_IDS) {
  const seed = parseUint32Seed(mapSeed, 'PvE map seed');
  if (!Array.isArray(mapIds) || mapIds.length === 0
    || mapIds.some((id) => typeof id !== 'string' || id.length === 0)) {
    throw new TypeError('PvE map pool must contain at least one map ID.');
  }
  return mapIds[seed % mapIds.length];
}

export function readPveLaunchOptions(environment = process.env) {
  const mode = environment.RTS_GAME_MODE ?? 'pvp';
  if (mode === 'pvp') return null;
  if (mode !== 'pve') throw new TypeError('RTS_GAME_MODE must be "pvp" or "pve".');

  const mapSeed = parseUint32Seed(environment.RTS_PVE_MAP_SEED, 'RTS_PVE_MAP_SEED');
  const policySeed = parseUint32Seed(environment.RTS_PVE_POLICY_SEED, 'RTS_PVE_POLICY_SEED');
  return Object.freeze({
    mode,
    mapSeed,
    policySeed,
    mapId: selectPveMapId(mapSeed),
  });
}
