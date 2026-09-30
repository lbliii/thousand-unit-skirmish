import { UNIT_DEFINITIONS, BUILDING_DEFINITIONS } from './gameplay-definitions.mjs';

/** One fragile scout explores a bounded frontier using only its filtered observation. */
export function createReconnaissancePolicy(seed) {
  let order = null;
  const failedPoints = [];
  let rotation = (seed >>> 0) % 8;
  const directions = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
  return {
    next(observation) {
      const scout = observation.units.friendly.filter(unit => unit.hp > 0
        && UNIT_DEFINITIONS[unit.kind]?.tags.includes('scout')).sort((a, b) => a.id - b.id)[0];
      const width = observation.map?.width, height = observation.map?.height;
      if (!scout || !Number.isInteger(width) || !Number.isInteger(height)) { order = null; return { ids: [], commands: [] }; }
      const key = `${scout.id}:${scout.generation}`;
      const clamp = (point) => ({ x: Math.max(-width / 2 + 1.5, Math.min(width / 2 - 1.5, Math.floor(point.x) + .5)),
        z: Math.max(-height / 2 + 1.5, Math.min(height / 2 - 1.5, Math.floor(point.z) + .5)) });
      const enemies = [...observation.units.visibleEnemies.filter(unit => unit.hp > 0),
        ...(observation.buildings?.visibleEnemies || []).filter(building => building.hp > 0 && BUILDING_DEFINITIONS[building.type]?.combat)]
        .slice(0, 64);
      const threat = enemies.find(unit => Math.hypot(unit.x - scout.x, unit.z - scout.z) < 9);
      const mode = threat ? 'retreat' : 'explore';
      if (order?.key !== key) failedPoints.length = 0;
      if (order?.key === key && order.mode === mode) {
        if (Math.hypot(scout.x - order.x, scout.z - order.z) > .25) {
          order.x = scout.x; order.z = scout.z; order.progressTick = observation.tick;
        }
        const arrived = Math.hypot(scout.x - order.point.x, scout.z - order.point.z) < 1;
        if ((!arrived || mode === 'retreat') && observation.tick - order.progressTick < 300) return { ids: [scout.id], commands: [] };
        if (!arrived && mode === 'explore') { failedPoints.push(order.point); if (failedPoints.length > 4) failedPoints.shift(); }
      }
      let point;
      if (threat) {
        const homes = (observation.buildings?.friendly || []).filter(building => building.hp > 0 && building.complete && building.type === 'town-center');
        homes.sort((a, b) => (a.x - scout.x) ** 2 + (a.z - scout.z) ** 2 - (b.x - scout.x) ** 2 - (b.z - scout.z) ** 2 || a.id - b.id);
        point = homes[0] || { x: scout.x + (scout.x - threat.x) * 2, z: scout.z + (scout.z - threat.z) * 2 };
      } else {
        const mask = observation.visibility;
        const bytes = mask?.data ? atob(mask.data) : '';
        const explored = candidate => {
          if (!observation.fogOfWar || !bytes) return false;
          const column = Math.floor(candidate.x + width / 2), row = Math.floor(candidate.z + height / 2);
          const cell = row * width + column;
          return ((bytes.charCodeAt(cell >> 2) >> ((cell & 3) * 2)) & 3) !== 0;
        };
        const goals = (observation.objectives || []).filter(objective => objective.zone && objective.owner !== observation.team).slice(0, 16)
          .map(({ zone }) => ({ x: zone.column + zone.width / 2 - width / 2, z: zone.row + zone.height / 2 - height / 2 }));
        const sight = UNIT_DEFINITIONS[scout.kind].sight || 8;
        const candidates = [];
        for (const distance of [sight + 1, sight + 4]) for (let index = 0; index < 8; index++) {
          const [dx, dz] = directions[(index + rotation) % 8]; const length = Math.hypot(dx, dz);
          const candidate = clamp({ x: scout.x + dx / length * distance, z: scout.z + dz / length * distance });
          if (Math.hypot(candidate.x - scout.x, candidate.z - scout.z) < 2 || explored(candidate)
            || failedPoints.some(point => Math.hypot(candidate.x - point.x, candidate.z - point.z) < 1)
            || enemies.some(enemy => Math.hypot(candidate.x - enemy.x, candidate.z - enemy.z) < 9)) continue;
          const score = goals.length ? Math.min(...goals.map(goal => (candidate.x - goal.x) ** 2 + (candidate.z - goal.z) ** 2)) : index;
          candidates.push({ point: candidate, score });
        }
        candidates.sort((a, b) => a.score - b.score);
        point = candidates[0]?.point;
        rotation = (rotation + 1) % 8;
      }
      if (!point) { order = null; return { ids: [scout.id], commands: [] }; }
      point = clamp(point);
      order = { key, mode, point, x: scout.x, z: scout.z, progressTick: observation.tick };
      return { ids: [scout.id], commands: [{ type: 'move', ids: [scout.id], unitGenerations: [scout.generation], ...point }] };
    },
  };
}
