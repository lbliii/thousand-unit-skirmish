import { canTraverseElevation } from './elevation.mjs';

function findWalkableComponents(width, height, blockedCells, elevationLevels) {
  const cellCount = width * height;
  const components = new Int32Array(cellCount);
  components.fill(-1);
  const queue = new Int32Array(cellCount);
  let nextComponent = 0;

  for (let start = 0; start < cellCount; start++) {
    if (blockedCells[start] || components[start] >= 0) continue;
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    components[start] = nextComponent;
    while (head < tail) {
      const cell = queue[head++];
      const column = cell % width;
      const row = Math.floor(cell / width);
      const neighbours = [
        column > 0 ? cell - 1 : -1,
        column + 1 < width ? cell + 1 : -1,
        row > 0 ? cell - width : -1,
        row + 1 < height ? cell + width : -1,
      ];
      for (const neighbour of neighbours) {
        if (neighbour < 0 || blockedCells[neighbour]
          || (elevationLevels && !canTraverseElevation(elevationLevels, cell, neighbour))
          || components[neighbour] >= 0) continue;
        components[neighbour] = nextComponent;
        queue[tail++] = neighbour;
      }
    }
    nextComponent++;
  }

  return components;
}

function getTeamSpawnComponents(width, height, components, spawnPoints) {
  return [0, 1].map((team) => {
    const spawn = spawnPoints.find((point) => point.team === team);
    const column = Math.floor(spawn.x + width / 2);
    const row = Math.floor(spawn.z + height / 2);
    return components[row * width + column];
  });
}

export function findUnreachableResourceNode(
  width, height, blockedCells, spawnPoints, resourceNodes, elevationLevels,
) {
  if (!resourceNodes.length) return null;

  const components = findWalkableComponents(width, height, blockedCells, elevationLevels);
  const teamSpawnComponents = getTeamSpawnComponents(width, height, components, spawnPoints);
  for (const node of resourceNodes) {
    const column = Math.floor(node.x + width / 2);
    const row = Math.floor(node.z + height / 2);
    const nodeComponent = components[row * width + column];
    for (let team = 0; team < teamSpawnComponents.length; team++) {
      if (nodeComponent < 0 || teamSpawnComponents[team] !== nodeComponent) {
        return { nodeId: node.id, team };
      }
    }
  }
  return null;
}

export function findUnreachableCaptureZone(
  width, height, blockedCells, spawnPoints, triggers, elevationLevels,
) {
  if (!triggers.length) return null;

  const components = findWalkableComponents(width, height, blockedCells, elevationLevels);
  const teamSpawnComponents = getTeamSpawnComponents(width, height, components, spawnPoints);
  for (const trigger of triggers) {
    const { column: zoneColumn, row: zoneRow, width: zoneWidth, height: zoneHeight } = trigger.zone;
    const reachableTeams = [false, false];
    for (let row = zoneRow; row < zoneRow + zoneHeight; row++) {
      for (let column = zoneColumn; column < zoneColumn + zoneWidth; column++) {
        const cell = row * width + column;
        if (blockedCells[cell]) continue;
        const component = components[cell];
        for (let team = 0; team < teamSpawnComponents.length; team++) {
          if (component >= 0 && component === teamSpawnComponents[team]) reachableTeams[team] = true;
        }
      }
    }
    const unreachableTeam = reachableTeams.findIndex((reachable) => !reachable);
    if (unreachableTeam >= 0) return { triggerId: trigger.id, team: unreachableTeam };
  }
  return null;
}

export function capturePrerequisiteIds(trigger) {
  if (Array.isArray(trigger?.requiresAll)) return trigger.requiresAll;
  return trigger?.requires === undefined ? [] : [trigger.requires];
}

export function scenarioEventSourceIds(trigger) {
  if (trigger?.type !== 'event') return [];
  if (Array.isArray(trigger.eventIds)) return trigger.eventIds;
  return typeof trigger.eventId === 'string' ? [trigger.eventId] : [];
}

export function findInvalidScenarioEventChain(events) {
  const byId = new Map(events.map((event) => [event?.id, event]));
  const dependencies = new Map();
  for (const event of events) {
    if (event?.trigger?.type !== 'event') continue;
    const sourceIds = scenarioEventSourceIds(event.trigger);
    if (Object.hasOwn(event.trigger, 'eventId') && Object.hasOwn(event.trigger, 'eventIds')) {
      return { eventId: event.id, reason: 'shape' };
    }
    if (Object.hasOwn(event.trigger, 'eventIds')
      && (!Array.isArray(event.trigger.eventIds) || sourceIds.length < 2 || sourceIds.length > 31)) {
      return { eventId: event.id, reason: 'shape' };
    }
    if (!Object.hasOwn(event.trigger, 'eventIds') && sourceIds.length !== 1) {
      return { eventId: event.id, reason: 'shape' };
    }
    if (new Set(sourceIds).size !== sourceIds.length) {
      return { eventId: event.id, reason: 'duplicate' };
    }
    for (const sourceId of sourceIds) {
      if (typeof sourceId !== 'string' || !byId.has(sourceId)) {
        return { eventId: event.id, sourceId, reason: 'missing' };
      }
    }
    dependencies.set(event.id, sourceIds);
  }

  const visiting = new Set();
  const visited = new Set();
  function hasCycle(id) {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    for (const sourceId of dependencies.get(id) || []) {
      if (hasCycle(sourceId)) return true;
    }
    visiting.delete(id);
    visited.add(id);
    return false;
  }
  for (const event of events) {
    if (hasCycle(event.id)) return { eventId: event.id, reason: 'cycle' };
  }

  const captureRootCache = new Map();
  function captureRootEventId(id) {
    if (captureRootCache.has(id)) return captureRootCache.get(id);
    const event = byId.get(id);
    let captureRootId = event?.trigger?.type === 'capture' ? event.id : null;
    if (event?.trigger?.type === 'event') {
      const roots = (dependencies.get(id) || []).map(captureRootEventId);
      if (roots.length > 0 && roots[0] && roots.every((rootId) => rootId === roots[0])) {
        captureRootId = roots[0];
      }
    }
    captureRootCache.set(id, captureRootId);
    return captureRootId;
  }
  for (const event of events) {
    if (event?.team === 'capturing' && !captureRootEventId(event.id)) {
      return { eventId: event.id, reason: 'capturing-team-without-capture-root' };
    }
  }
  return null;
}

export function findInvalidCapturePrerequisite(triggers) {
  const byId = new Map(triggers.map((trigger) => [trigger?.id, trigger]));
  const dependencies = new Map();
  for (const trigger of triggers) {
    if (trigger?.requires !== undefined && trigger?.requiresAll !== undefined) {
      return { triggerId: trigger.id, reason: 'both' };
    }
    if (trigger?.requiresAll !== undefined
      && (!Array.isArray(trigger.requiresAll) || trigger.requiresAll.length < 2 || trigger.requiresAll.length > 31)) {
      return { triggerId: trigger.id, reason: 'shape' };
    }
    const prerequisiteIds = capturePrerequisiteIds(trigger);
    if (new Set(prerequisiteIds).size !== prerequisiteIds.length) {
      return { triggerId: trigger.id, reason: 'duplicate' };
    }
    dependencies.set(trigger.id, prerequisiteIds);
    for (const prerequisiteId of prerequisiteIds) {
      if (prerequisiteId === trigger.id) return { triggerId: trigger.id, reason: 'self' };
      if (typeof prerequisiteId !== 'string' || !byId.has(prerequisiteId)) {
        return { triggerId: trigger.id, requires: prerequisiteId, reason: 'missing' };
      }
    }
  }

  const visiting = new Set();
  const visited = new Set();
  function hasCycle(id) {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    for (const prerequisiteId of dependencies.get(id) || []) {
      if (hasCycle(prerequisiteId)) return true;
    }
    visiting.delete(id);
    visited.add(id);
    return false;
  }

  for (const trigger of triggers) {
    if (hasCycle(trigger.id)) return { triggerId: trigger.id, reason: 'cycle' };
  }
  return null;
}

// Keep the old export for clients and saved scripts that still use the food-only name.
export const findUnreachableFoodNode = findUnreachableResourceNode;
