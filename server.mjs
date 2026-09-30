import { validateMapRegion } from './src/regions.mjs';
import { validateScenarioRegions, validRegionEntryTrigger, regionEntryTeam, validCompletionTrigger, completionTeam } from './src/scenario-regions.mjs';
import { TERRAIN_MATERIALS } from './src/terrain-materials.mjs';
import { researchAction, researchOptions, emptyTechnologyCompletions } from './src/research-actions.mjs';
import { combatDamage, canCombatTarget, hasGameplayCapability } from './src/combat-rules.mjs';
import { creditResourceBalance } from './src/economy-ledger.mjs';
import { unfinishedRefund, buildingRepairStep } from './src/base-lifecycle.mjs';
import { productionAction } from './src/production-actions.mjs';
import { teamPopulation } from './src/population.mjs';
import { UNIT_DEFINITIONS, BUILDING_DEFINITIONS, TECHNOLOGY_DEFINITIONS, GAMEPLAY_RULESET_REVISION, DEFAULT_FACTION_ID, UNIT_WIRE_IDS, missingGameplayPrerequisites } from './src/gameplay-definitions.mjs';
import { validateMapAudioReference } from './src/audio-event-profile.mjs';
import { createServer } from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, open, readFile, readdir, rename, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateRawSync, inflateRawSync, constants as zlibConstants } from 'node:zlib';
import { configuredPublicOrigins, sameOriginRequest } from './origin-policy.mjs';
import {
  buildElevationGrid, capturePrerequisiteIds, findInvalidCapturePrerequisite,
  findInvalidScenarioEventChain, findUnreachableCaptureZone, findUnreachableResourceNode,
  scenarioEventSourceIds, validateElevationPatches,
} from './src/map-utils.mjs';
import {
  BASE_ELEVATION_PATH_COST, canTraverseElevation, elevationPathCost, hasElevation,
} from './src/elevation.mjs';
import { orderUnitsForFormation } from './src/formation-assignment.mjs';
import { createDeterministicPolicy, toOpponentObservation } from './src/pve-opponent.mjs';
import { readPveLaunchOptions } from './src/pve-match.mjs';
import { townCenterSpawnPosition, townCenterFootprintCells } from './src/town-center-spawn.mjs';
import { advanceTickDeadline } from './simulation-scheduler.mjs';
import { privateProductionView } from './src/snapshot-private-production.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const HOST = process.env.RTS_HOST || '127.0.0.1';
const PORT = Number(process.env.PORT || 4173);
const RAILWAY_DEPLOYMENT = Boolean(process.env.RAILWAY_PROJECT_ID || process.env.RAILWAY_ENVIRONMENT);
const PUBLIC_ORIGINS = configuredPublicOrigins();
const MAX_PEERS = Number(process.env.RTS_MAX_PEERS || 32);
const SESSION_GRACE_MS = Number(process.env.RTS_SESSION_GRACE_MS ?? 120_000);
const RECOVERY_SESSION_GRACE_MS = SESSION_GRACE_MS;
if (RAILWAY_DEPLOYMENT && PUBLIC_ORIGINS.size === 0) {
  throw new Error('Set RAILWAY_PUBLIC_DOMAIN or RTS_PUBLIC_ORIGINS before exposing the match server.');
}
// Bump schema for persisted-shape changes and rules for incompatible simulation semantics.
const MATCH_CHECKPOINT_SCHEMA_VERSION = 19;
// Older compatible checkpoints remain resumable after their persisted shape is migrated.
const MATCH_RULES_VERSION = 6;
const MATCH_CHECKPOINT_INTERVAL_TICKS = 30;
const HEARTBEAT_INTERVAL_MS = 15_000;
const HEARTBEAT_TIMEOUT_MS = 45_000;
const MAX_PEER_QUEUED_BYTES = 4 * 1024 * 1024;
const MAX_INBOUND_FRAME_BYTES = 1_000_000;
const MAX_INBOUND_MESSAGES_PER_SECOND = 120;
const MAX_INBOUND_BYTES_PER_SECOND = 2 * 1024 * 1024;
const MAX_INBOUND_DECODED_BYTES_PER_SECOND = 2 * 1024 * 1024;
const MAX_INBOUND_CONTROL_FRAMES_PER_SECOND = 120;
const MAX_PENDING_COMMANDS_PER_PEER = 64;
const MAX_PENDING_COMMAND_BYTES_PER_PEER = MAX_INBOUND_FRAME_BYTES;
const MIN_COMPRESS_FRAME_BYTES = 512;
const PERMESSAGE_DEFLATE_TRAILER = Buffer.from([0x00, 0x00, 0xff, 0xff]);
const MAX_RUNTIME_MAPS = 16;
const MAP_DIRECTORY = path.join(ROOT, 'maps');
const CUSTOM_MAP_DIRECTORY = path.resolve(ROOT, process.env.RTS_CUSTOM_MAP_DIRECTORY || 'custom-maps');
const MATCH_STATE_PATH = process.env.RTS_MATCH_STATE_PATH ? path.resolve(process.env.RTS_MATCH_STATE_PATH) : null;
const MAX_UNITS = 2000;
const DEFAULT_STARTING_ARMY_SIZE = 1000;
const MAX_QUEUED_WAYPOINTS = 8;
const MAX_MAP_OBSTACLES = 4096;
const MAX_RESOURCE_NODES = 128;
const MAX_BUILDINGS = 128;
const BUILDING_MAX_HIT_POINTS = 1800;
const MAX_OBJECTIVE_FOOD_REWARD = 10000;
const MAX_MAP_SCENARIO_EVENTS = 32;
const MAX_SCENARIO_EVENT_REPEATS = 20;
const MIN_SCENARIO_EVENT_REPEAT_SECONDS = 5;
const RESEARCH_RULES = Object.freeze(Object.fromEntries(
  Object.entries(TECHNOLOGY_DEFINITIONS).map(([id, rule]) => [id, Object.freeze({
    label: rule.label, buildingType: rule.building, upgradeKey: rule.upgradeKey,
    foodCost: rule.cost.food, woodCost: rule.cost.wood, durationSeconds: rule.durationSeconds,
  })]),
));
const SHARED_MOVE_PATHS = process.env.RTS_SHARED_MOVE_PATHS !== '0';
const SERVER_INSTANCE_ID = randomBytes(16).toString('base64url');
const pveLaunchOptions = readPveLaunchOptions();
const PVE_DECISION_INTERVAL_MS = 1_000;
let matchId = randomBytes(16).toString('base64url');
let recoveredFromCheckpoint = false;
let checkpointSequence = 0;
let nextCheckpointSequence = 0;
let checkpointWritePromise = null;
let pendingCheckpoint = null;
let checkpointFailures = 0;
let lastCheckpointAt = 0;
let checkpointWriteQueueDepth = 0;
let lastCheckpointBytes = 0;
let lastCheckpointWriteMs = 0;
let lastCheckpointCaptureMs = 0;
let lastCheckpointSerializeMs = 0;
const configuredMapPath = path.resolve(ROOT, process.env.RTS_MAP || 'maps/bellweather-millrace.json');
if (!Number.isInteger(MAX_PEERS) || MAX_PEERS < 2 || MAX_PEERS > 256) {
  throw new Error('RTS_MAX_PEERS must be an integer between 2 and 256.');
}
if (!Number.isInteger(SESSION_GRACE_MS) || SESSION_GRACE_MS < 1_000 || SESSION_GRACE_MS > 3_600_000) {
  throw new Error('RTS_SESSION_GRACE_MS must be an integer between 1000 and 3600000 milliseconds.');
}
if (!configuredMapPath.startsWith(`${MAP_DIRECTORY}${path.sep}`)) {
  throw new Error('RTS_MAP must point to a JSON map file inside the maps directory.');
}
if (CUSTOM_MAP_DIRECTORY === MAP_DIRECTORY || CUSTOM_MAP_DIRECTORY.startsWith(`${MAP_DIRECTORY}${path.sep}`)) {
  throw new Error('RTS_CUSTOM_MAP_DIRECTORY must be outside the shipped maps directory.');
}
if (MATCH_STATE_PATH && (MATCH_STATE_PATH === MAP_DIRECTORY || MATCH_STATE_PATH.startsWith(`${MAP_DIRECTORY}${path.sep}`)
  || MATCH_STATE_PATH === CUSTOM_MAP_DIRECTORY || MATCH_STATE_PATH.startsWith(`${CUSTOM_MAP_DIRECTORY}${path.sep}`))) {
  throw new Error('RTS_MATCH_STATE_PATH must remain separate from map directories.');
}

let shuttingDown = false;

function forestCellsForDefinition(definition) {
  const cells = new Uint8Array(definition.width * definition.height);
  for (const obstacle of definition.obstacles || []) {
    if (obstacle.material !== 'forest') continue;
    for (let row = obstacle.row; row < obstacle.row + obstacle.height; row++) {
      for (let column = obstacle.column; column < obstacle.column + obstacle.width; column++) {
        cells[row * definition.width + column] = 1;
      }
    }
  }
  return cells;
}

function validateMapDefinition(definition, filename) {
  if (!definition || typeof definition !== 'object' || Array.isArray(definition)) {
    throw new Error(`Map ${filename} must contain a JSON object.`);
  }
  validateMapAudioReference(definition.audio);
  validateMapRegion(definition.region);
  definition.victoryMode ??= 'any';
  if (!['any', 'all'].includes(definition.victoryMode)) {
    throw new Error(`Map ${filename} victoryMode must be "any" or "all".`);
  }
  if (definition.startingArmySize !== undefined
    && (!Number.isInteger(definition.startingArmySize)
      || definition.startingArmySize < 8
      || definition.startingArmySize > MAX_UNITS
      || definition.startingArmySize % 2 !== 0)) {
    throw new Error(`Map ${filename} startingArmySize must be an even total from 8 to ${MAX_UNITS}.`);
  }
  if (definition.startingResources !== undefined) {
    const resources = definition.startingResources;
    if (!resources || typeof resources !== 'object' || Array.isArray(resources)
      || Object.keys(resources).some((key) => !['food', 'wood'].includes(key))
      || (resources.food !== undefined && (!Number.isInteger(resources.food)
        || resources.food < 0 || resources.food > 100_000))
      || (resources.wood !== undefined && (!Number.isInteger(resources.wood)
        || resources.wood < 0 || resources.wood > 100_000))) {
      throw new Error(`Map ${filename} has invalid starting food or wood.`);
    }
  }
  definition.fogOfWar ??= false;
  if (typeof definition.fogOfWar !== 'boolean') {
    throw new Error(`Map ${filename} fogOfWar must be a boolean.`);
  }
  if (typeof definition.id !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(definition.id)) {
    throw new Error(`Map ${filename} needs a lowercase hyphenated id.`);
  }
  if (typeof definition.name !== 'string' || !definition.name.trim() || definition.name.length > 48) {
    throw new Error(`Map ${filename} needs a display name.`);
  }
  if (definition.summary !== undefined
    && (typeof definition.summary !== 'string' || definition.summary.length > 120)) {
    throw new Error(`Map ${filename} scenario brief must be 120 characters or fewer.`);
  }
  if (!Number.isInteger(definition.width) || !Number.isInteger(definition.height)
    || definition.width < 16 || definition.height < 16
    || definition.width > 256 || definition.height > 256) {
    throw new Error(`Map ${filename} width and height must be integers between 16 and 256.`);
  }
  const invalidElevationPatches = validateElevationPatches(
    definition.width, definition.height, definition.elevationPatches,
  );
  if (invalidElevationPatches) {
    const detail = invalidElevationPatches.patchIndex === undefined
      ? `reason ${invalidElevationPatches.reason}`
      : `patch ${invalidElevationPatches.patchIndex} ${invalidElevationPatches.reason}`;
    throw new Error(`Map ${filename} has invalid elevation patches: ${detail}.`);
  }
  const elevationLevels = buildElevationGrid(
    definition.width, definition.height, definition.elevationPatches,
  );
  const terrainMaterials = TERRAIN_MATERIALS;
  if (definition.terrainBase !== undefined && !terrainMaterials.includes(definition.terrainBase)) {
    throw new Error(`Map ${filename} has an invalid base terrain material.`);
  }
  const terrainPatches = definition.terrainPatches ?? [];
  if (!Array.isArray(terrainPatches) || terrainPatches.length > 4096) {
    throw new Error(`Map ${filename} has too many terrain paint patches.`);
  }
  const paintedCells = new Uint8Array(definition.width * definition.height);
  for (const patch of terrainPatches) {
    const { column, row, width, height, material } = patch || {};
    if (![column, row, width, height].every(Number.isInteger)
      || column < 0 || row < 0 || width < 1 || height < 1
      || column + width > definition.width || row + height > definition.height
      || !terrainMaterials.includes(material)) {
      throw new Error(`Map ${filename} has an invalid terrain paint patch.`);
    }
    for (let paintedRow = row; paintedRow < row + height; paintedRow++) {
      for (let paintedColumn = column; paintedColumn < column + width; paintedColumn++) {
        const index = paintedRow * definition.width + paintedColumn;
        if (paintedCells[index]) throw new Error(`Map ${filename} has overlapping terrain paint patches.`);
        paintedCells[index] = 1;
      }
    }
  }
  if (!Array.isArray(definition.obstacles) || definition.obstacles.length > MAX_MAP_OBSTACLES
    || !Array.isArray(definition.spawnPoints)) {
    throw new Error(`Map ${filename} must define obstacle and spawnPoints arrays.`);
  }
  const teams = new Set();
  const obstacleCells = new Uint8Array(definition.width * definition.height);
  for (const spawn of definition.spawnPoints) {
    if (!spawn || ![0, 1].includes(spawn.team) || teams.has(spawn.team)
      || !Number.isFinite(spawn.x) || !Number.isFinite(spawn.z)) {
      throw new Error(`Map ${filename} needs exactly one finite spawn point for teams 0 and 1.`);
    }
    teams.add(spawn.team);
    if (Math.abs(spawn.x) >= definition.width / 2 || Math.abs(spawn.z) >= definition.height / 2) {
      throw new Error(`Map ${filename} has a spawn point outside the playfield.`);
    }
  }
  if (teams.size !== 2) throw new Error(`Map ${filename} needs exactly one spawn point for teams 0 and 1.`);
  for (const obstacle of definition.obstacles) {
    const { column, row, width, height } = obstacle || {};
    if (![column, row, width, height].every(Number.isInteger)
      || column < 0 || row < 0 || width < 1 || height < 1
      || column + width > definition.width || row + height > definition.height
      || (obstacle?.material !== undefined && !['stone', 'forest', 'water'].includes(obstacle.material))
      || (obstacle?.elevation !== undefined && (!Number.isFinite(obstacle.elevation) || obstacle.elevation <= 0))) {
      throw new Error(`Map ${filename} has an obstacle outside the grid or with invalid dimensions.`);
    }
    for (let row = obstacle.row; row < obstacle.row + obstacle.height; row++) {
      for (let column = obstacle.column; column < obstacle.column + obstacle.width; column++) {
        const index = row * definition.width + column;
        if (obstacleCells[index]) throw new Error(`Map ${filename} has overlapping terrain blocks.`);
        obstacleCells[index] = 1;
      }
    }
  }
  for (const spawn of definition.spawnPoints) {
    const column = Math.floor(spawn.x + definition.width / 2);
    const row = Math.floor(spawn.z + definition.height / 2);
    if (obstacleCells[row * definition.width + column]) {
      throw new Error(`Map ${filename} team ${spawn.team} spawn must be on an open cell.`);
    }
  }
  const triggers = definition.triggers ?? [];
  if (!Array.isArray(triggers) || triggers.length > 32) {
    throw new Error(`Map ${filename} triggers must be an array with at most 32 entries.`);
  }
  const triggerIds = new Set();
  for (const trigger of triggers) {
    const zone = trigger?.zone;
    if (typeof trigger?.id !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(trigger.id)
      || triggerIds.has(trigger.id) || typeof trigger.name !== 'string' || !trigger.name.trim()
      || trigger.type !== 'capture-zone' || !zone
      || ![zone.column, zone.row, zone.width, zone.height].every(Number.isInteger)
      || zone.column < 0 || zone.row < 0 || zone.width < 1 || zone.height < 1
      || zone.column + zone.width > definition.width || zone.row + zone.height > definition.height
      || !Number.isInteger(trigger.requiredUnits) || trigger.requiredUnits < 1 || trigger.requiredUnits > MAX_UNITS / 2
      || !Number.isFinite(trigger.captureSeconds) || trigger.captureSeconds < 0.5 || trigger.captureSeconds > 60
      || (trigger.foodReward !== undefined && (!Number.isInteger(trigger.foodReward)
        || trigger.foodReward < 0 || trigger.foodReward > MAX_OBJECTIVE_FOOD_REWARD))
      || (trigger.woodReward !== undefined && (!Number.isInteger(trigger.woodReward)
        || trigger.woodReward < 0 || trigger.woodReward > MAX_OBJECTIVE_FOOD_REWARD))
      || (trigger.unitCount !== undefined && (!Number.isInteger(trigger.unitCount)
        || trigger.unitCount < 0 || trigger.unitCount > 25))
      || (trigger.unitKind !== undefined && !Object.hasOwn(UNIT_DEFINITIONS, trigger.unitKind))
      || (trigger.requires !== undefined && (typeof trigger.requires !== 'string'
        || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(trigger.requires)))
      || (trigger.requiresAll !== undefined && (trigger.requires !== undefined
        || !Array.isArray(trigger.requiresAll) || trigger.requiresAll.length < 2 || trigger.requiresAll.length > 31
        || trigger.requiresAll.some((id) => typeof id !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id))))
      || (trigger.victory !== undefined && typeof trigger.victory !== 'boolean')
      || (trigger.message !== undefined && (typeof trigger.message !== 'string' || trigger.message.length > 120))) {
      throw new Error(`Map ${filename} has an invalid scenario trigger.`);
    }
    triggerIds.add(trigger.id);
    let hasWalkableCell = false;
    for (let row = zone.row; row < zone.row + zone.height && !hasWalkableCell; row++) {
      for (let column = zone.column; column < zone.column + zone.width; column++) {
        if (!obstacleCells[row * definition.width + column]) { hasWalkableCell = true; break; }
      }
    }
    if (!hasWalkableCell) throw new Error(`Map ${filename} trigger ${trigger.id} covers no walkable cells.`);
  }
  if (definition.victoryHoldSeconds !== undefined
    && (!Number.isFinite(definition.victoryHoldSeconds) || definition.victoryHoldSeconds < 0
      || (definition.victoryHoldSeconds > 0 && definition.victoryHoldSeconds < 0.5)
      || definition.victoryHoldSeconds > 3600
      || (definition.victoryHoldSeconds > 0 && !triggers.some((trigger) => trigger.victory === true)))) {
    throw new Error(`Map ${filename} has an invalid victory hold duration or no marked victory zones.`);
  }
  const invalidPrerequisite = findInvalidCapturePrerequisite(triggers);
  if (invalidPrerequisite) {
    const detail = invalidPrerequisite.reason === 'missing'
      ? `requires missing capture zone ${invalidPrerequisite.requires}`
      : invalidPrerequisite.reason === 'self' ? 'cannot require itself'
        : invalidPrerequisite.reason === 'duplicate' ? 'lists the same prerequisite more than once'
          : invalidPrerequisite.reason === 'cycle' ? 'creates a prerequisite cycle'
            : 'creates an invalid prerequisite graph';
    throw new Error(`Map ${filename} capture zone ${invalidPrerequisite.triggerId} ${detail}.`);
  }
  const unreachableTrigger = findUnreachableCaptureZone(
    definition.width, definition.height, obstacleCells, definition.spawnPoints, triggers, elevationLevels,
  );
  if (unreachableTrigger) {
    throw new Error(`Map ${filename} capture zone ${unreachableTrigger.triggerId} is unreachable from team ${unreachableTrigger.team}.`);
  }
  if (definition.timedVictory !== undefined) {
    const rule = definition.timedVictory;
    if (!rule || typeof rule !== 'object' || Array.isArray(rule)
      || !Number.isFinite(rule.afterSeconds) || rule.afterSeconds < 0.5 || rule.afterSeconds > 3600
      || typeof rule.objectiveId !== 'string'
      || !triggers.some((trigger) => trigger.id === rule.objectiveId)) {
      throw new Error(`Map ${filename} has an invalid timed victory rule.`);
    }
  }
  const regions = validateScenarioRegions(definition);
  const scenarioEvents = definition.scenarioEvents ?? [];
  if (!Array.isArray(scenarioEvents) || scenarioEvents.length > MAX_MAP_SCENARIO_EVENTS) {
    throw new Error(`Map ${filename} scenarioEvents must be an array with at most ${MAX_MAP_SCENARIO_EVENTS} entries.`);
  }
  const allowsVictoryZoneCaptureDrops = (definition.victoryMode === 'all'
    && triggers.filter((trigger) => trigger.victory === true).length >= 2)
    || (definition.victoryHoldSeconds ?? 0) > 0;
  const scenarioEventIds = new Set();
  for (const event of scenarioEvents) {
    const eventTrigger = event?.trigger;
    const captureTriggered = eventTrigger?.type === 'capture';
    const eventTriggered = eventTrigger?.type === 'event';
    const validCaptureTrigger = captureTriggered
      && typeof eventTrigger === 'object' && !Array.isArray(eventTrigger)
      && Object.keys(eventTrigger).every((key) => ['type', 'objectiveId', 'occurrence'].includes(key))
      && typeof eventTrigger.objectiveId === 'string'
      && (eventTrigger.occurrence === undefined
        || ['first', 'recapture'].includes(eventTrigger.occurrence))
      && triggers.some((trigger) => trigger.id === eventTrigger.objectiveId
        && (trigger.victory !== true || allowsVictoryZoneCaptureDrops));
    const validEventChain = eventTriggered
      && typeof eventTrigger === 'object' && !Array.isArray(eventTrigger)
      && Object.keys(eventTrigger).every((key) => ['type', 'eventId', 'eventIds'].includes(key))
      && !(Object.hasOwn(eventTrigger, 'eventId') && Object.hasOwn(eventTrigger, 'eventIds'))
      && (typeof eventTrigger.eventId === 'string'
        ? /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(eventTrigger.eventId)
        : Array.isArray(eventTrigger.eventIds) && eventTrigger.eventIds.length >= 2
          && eventTrigger.eventIds.length <= MAX_MAP_SCENARIO_EVENTS - 1
          && eventTrigger.eventIds.every((id) => typeof id === 'string'
            && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)));
    if (['construction-complete', 'research-complete'].includes(eventTrigger?.type) && !validCompletionTrigger(eventTrigger)) {
      throw new Error(`Event ${event.id}: trigger.${eventTrigger.type === 'construction-complete' ? 'buildingType' : 'technologyId'} must be a registered ID and trigger.team must be 0, 1 or either.`);
    }
    if (eventTrigger?.type === 'region-entry' && !regions.some(region => region.id === eventTrigger.regionId)) {
      throw new Error(`Event ${event.id}: invalid timed supply event trigger.regionId; choose an existing named region.`);
    }
    const validEventTrigger = eventTrigger === undefined || validCaptureTrigger || validEventChain || validRegionEntryTrigger(eventTrigger, regions) || validCompletionTrigger(eventTrigger);
    if (typeof event?.id !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(event.id)
      || scenarioEventIds.has(event.id) || event.type !== 'timed-supply'
      || typeof event.name !== 'string' || !event.name.trim() || event.name.length > 48
      || !Number.isFinite(event.afterSeconds) || event.afterSeconds < 0.5 || event.afterSeconds > 3600
      || ((event.repeatCount === undefined) !== (event.repeatEverySeconds === undefined))
      || (event.repeatCount !== undefined && (!Number.isInteger(event.repeatCount)
        || event.repeatCount < 1 || event.repeatCount > MAX_SCENARIO_EVENT_REPEATS
        || !Number.isFinite(event.repeatEverySeconds)
        || event.repeatEverySeconds < MIN_SCENARIO_EVENT_REPEAT_SECONDS
        || event.repeatEverySeconds > 3600))
      || !validEventTrigger
      || (!['0', '1', 'both'].includes(event.team)
        && !(event.team === 'capturing' && (captureTriggered || eventTriggered)))
      || !Number.isInteger(event.foodReward) || event.foodReward < 0
      || event.foodReward > MAX_OBJECTIVE_FOOD_REWARD
      || (event.woodReward !== undefined && (!Number.isInteger(event.woodReward)
        || event.woodReward < 0 || event.woodReward > MAX_OBJECTIVE_FOOD_REWARD))
      || (event.unitCount !== undefined && (!Number.isInteger(event.unitCount)
        || event.unitCount < 0 || event.unitCount > 25))
      || (event.unitKind !== undefined && !Object.hasOwn(UNIT_DEFINITIONS, event.unitKind))
      || (event.technologyReward !== undefined && (typeof event.technologyReward !== 'string'
        || !researchRulesFor(event.technologyReward)))
      || (event.message !== undefined && (typeof event.message !== 'string' || event.message.length > 120))
      || (event.foodReward === 0 && (event.woodReward ?? 0) === 0
        && (event.unitCount ?? 0) === 0 && !event.technologyReward && !event.message?.trim())) {
      throw new Error(`Map ${filename} has an invalid timed supply event.`);
    }
    scenarioEventIds.add(event.id);
  }
  const invalidEventChain = findInvalidScenarioEventChain(scenarioEvents);
  if (invalidEventChain) {
    const detail = invalidEventChain.reason === 'missing'
      ? `references missing scenario event ${invalidEventChain.sourceId}`
      : invalidEventChain.reason === 'cycle' ? 'creates a scenario event cycle'
        : invalidEventChain.reason === 'duplicate' ? 'lists the same source event more than once'
        : 'uses the capturing team without a capture-triggered event in its chain';
    throw new Error(`Map ${filename} scenario event ${invalidEventChain.eventId} ${detail}.`);
  }
  const resourceNodes = definition.resourceNodes ?? [];
  if (!Array.isArray(resourceNodes) || resourceNodes.length > MAX_RESOURCE_NODES) {
    throw new Error(`Map ${filename} resourceNodes must be an array with at most ${MAX_RESOURCE_NODES} entries.`);
  }
  const resourceNodeIds = new Set();
  for (const node of resourceNodes) {
    if (typeof node?.id !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(node.id)
      || resourceNodeIds.has(node.id) || !['food', 'wood'].includes(node.type)
      || !Number.isFinite(node.x) || !Number.isFinite(node.z)
      || Math.abs(node.x) >= definition.width / 2 || Math.abs(node.z) >= definition.height / 2
      || !Number.isFinite(node.stock) || node.stock <= 0) {
      throw new Error(`Map ${filename} has an invalid or duplicate resource node.`);
    }
    resourceNodeIds.add(node.id);
    const column = Math.floor(node.x + definition.width / 2);
    const row = Math.floor(node.z + definition.height / 2);
    if (obstacleCells[row * definition.width + column]) {
      throw new Error(`Map ${filename} resource node ${node.id} must be on an open cell.`);
    }
  }
  const unreachableNode = findUnreachableResourceNode(
    definition.width, definition.height, obstacleCells, definition.spawnPoints, resourceNodes, elevationLevels,
  );
  if (unreachableNode) {
    throw new Error(`Map ${filename} resource node ${unreachableNode.nodeId} must be reachable from both team spawns.`);
  }
  return {
    ...definition,
    terrainSeed: Number.isInteger(definition.terrainSeed) ? definition.terrainSeed : 1,
    triggers,
    scenarioEvents,
    ...(definition.regions === undefined ? {} : { regions }),
    resourceNodes,
  };
}

const mapCatalog = new Map();
const shippedMapIds = new Set();
const runtimeMapIds = new Set();
const persistedMapIds = new Set();
let defaultMapId = null;
const mapFiles = (await readdir(MAP_DIRECTORY, { withFileTypes: true }))
  .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
  .sort((a, b) => a.name.localeCompare(b.name));
for (const entry of mapFiles) {
  const filePath = path.join(MAP_DIRECTORY, entry.name);
  const definition = validateMapDefinition(JSON.parse(await readFile(filePath, 'utf8')), entry.name);
  if (mapCatalog.has(definition.id)) throw new Error(`Duplicate map id: ${definition.id}`);
  mapCatalog.set(definition.id, definition);
  shippedMapIds.add(definition.id);
  if (filePath === configuredMapPath) defaultMapId = definition.id;
}
if (!defaultMapId) throw new Error(`RTS_MAP does not match a valid JSON file in ${MAP_DIRECTORY}.`);

await mkdir(CUSTOM_MAP_DIRECTORY, { recursive: true });
const persistedMapFiles = (await readdir(CUSTOM_MAP_DIRECTORY, { withFileTypes: true }))
  .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
  .sort((a, b) => a.name.localeCompare(b.name));
for (const entry of persistedMapFiles) {
  try {
    if (runtimeMapIds.size >= MAX_RUNTIME_MAPS) {
      throw new Error(`Only the first ${MAX_RUNTIME_MAPS} custom maps are loaded.`);
    }
    const filePath = path.join(CUSTOM_MAP_DIRECTORY, entry.name);
    const definition = validateMapDefinition(JSON.parse(await readFile(filePath, 'utf8')), entry.name);
    if (entry.name !== `${definition.id}.json`) {
      throw new Error(`File name must be ${definition.id}.json.`);
    }
    if (mapCatalog.has(definition.id)) throw new Error(`Map id "${definition.id}" is already in use.`);
    definition.summary ||= `${definition.width} × ${definition.height} · ${definition.obstacles.length} TERRAIN BLOCKS`;
    mapCatalog.set(definition.id, definition);
    runtimeMapIds.add(definition.id);
    persistedMapIds.add(definition.id);
  } catch (error) {
    console.warn(`Skipping saved custom map ${entry.name}: ${String(error?.message || error)}`);
  }
}

const TICK_RATE = 30;
const TICK_INTERVAL_MS = 1000 / TICK_RATE;
const STEP_SECONDS = 1 / TICK_RATE;
const STATE_EVERY_TICKS = 3;
const TICK_SAMPLE_WINDOW = TICK_RATE * 10;
const TICK_DIAGNOSTICS_ENABLED = process.env.RTS_TICK_DIAGNOSTICS === '1';
const SEPARATION_DIAGNOSTICS_ENABLED = process.env.RTS_SEPARATION_DIAGNOSTICS === '1';
const WALK_SPEED = Math.max(...Object.values(UNIT_DEFINITIONS).map(rule => rule.combat.moveSpeed));
const MOVE_START_BROADCAST_DISTANCE = WALK_SPEED * STEP_SECONDS * 0.5;
const SPATIAL_BUCKET_SIZE = 1.2;
const ARCHER_ATTACK_RANGE = UNIT_DEFINITIONS.archer.combat.range;
const ATTACK_MOVE_ACQUIRE_RADIUS = 4.8;
const ATTACK_MOVE_LEASH_RADIUS = 8;
const ATTACK_MOVE_SCAN_INTERVAL_TICKS = 6;
const ATTACK_MOVE_MAX_CANDIDATES = 64;
const ATTACK_MOVE_MAX_FLOW_BUILDS_PER_TICK = 1;
const MIN_SEPARATION = 0.56;
const GATHER_RATE = 1;
const FOREST_WOOD_PER_CELL = 6;
const WORKER_CARRY_CAPACITY = 10;
const WORKER_INTERACTION_RANGE = 1.5;
const BUILDER_INTERACTION_RANGE = 1.4;
const INFANTRY_FOOD_COST = UNIT_DEFINITIONS.infantry.cost.food;
const INFANTRY_TRAIN_SECONDS = UNIT_DEFINITIONS.infantry.trainSeconds;
const WORKER_FOOD_COST = UNIT_DEFINITIONS.worker.cost.food;
const WORKER_TRAIN_SECONDS = UNIT_DEFINITIONS.worker.trainSeconds;
const ARCHERY_RANGE_WOOD_COST = BUILDING_DEFINITIONS['archery-range'].cost.wood;
const BARRACKS_WOOD_COST = BUILDING_DEFINITIONS.barracks.cost.wood;
const ARCHER_FOOD_COST = UNIT_DEFINITIONS.archer.cost.food;
const ARCHER_WOOD_COST = UNIT_DEFINITIONS.archer.cost.wood;
const ARCHER_TRAIN_SECONDS = UNIT_DEFINITIONS.archer.trainSeconds;
const ARCHERY_RANGE_BUILD_SECONDS = BUILDING_DEFINITIONS['archery-range'].buildSeconds;
const BARRACKS_BUILD_SECONDS = BUILDING_DEFINITIONS.barracks.buildSeconds;
const MAX_BUILDING_QUEUE = 5;
const TOWN_CENTER_SPAWN_SEARCH_RADIUS = 12;
const ARCHERY_RANGE_FOOTPRINT = BUILDING_DEFINITIONS['archery-range'].footprint;
const BUILDING_RULES = Object.freeze(Object.fromEntries(Object.entries(BUILDING_DEFINITIONS).map(([id, definition]) => {
  const product = UNIT_DEFINITIONS[definition.products[0]];
  return [id, Object.freeze({
    label: definition.label.toUpperCase(), woodCost: definition.cost.wood,
    constructionFoodCost: definition.cost.food, buildSeconds: definition.buildSeconds,
    unitKind: definition.products[0], foodCost: product?.cost.food ?? 0,
    unitWoodCost: product?.cost.wood ?? 0, trainSeconds: product?.trainSeconds ?? 0,
    trainLabel: definition.products.map((kind) => UNIT_DEFINITIONS[kind].label.toUpperCase()).join(' / '),
    readyLabel: product ? `${product.label.toUpperCase()} READY` : '',
  })];
})));
function buildingRulesFor(type) {
  return Object.hasOwn(BUILDING_RULES, type) ? BUILDING_RULES[type] : null;
}
function researchRulesFor(type) {
  return Object.hasOwn(RESEARCH_RULES, type) ? RESEARCH_RULES[type] : null;
}
function definitionForEntity(entity) { return entity.type ? BUILDING_DEFINITIONS[entity.type] : UNIT_DEFINITIONS[entity.kind]; }
function unitHasCapability(unit, capability) { return hasGameplayCapability(UNIT_DEFINITIONS[unit.kind], capability); }
function damageForEntities(attacker, target) { return combatDamage(definitionForEntity(attacker), definitionForEntity(target), teamUpgrades[attacker.team], teamUpgrades[target.team]); }

const MAX_TEAM_ROSTER = 1000;
const VISION_RADIUS_CELLS = 8;
const HIGH_GROUND_VISION_BONUS_CELLS = 1;
const VISION_EYE_HEIGHT = 1.0;
function buildVisionRays(radius) {
  const offsets = [];
  for (let row = -radius; row <= radius; row++) {
    for (let column = -radius; column <= radius; column++) {
      if (column * column + row * row <= radius * radius) offsets.push([column, row]);
    }
  }
  return offsets.map(([dx, dz]) => [dx, dz, visionRayIntermediates(dx, dz)]);
}
function visionRayIntermediates(dx, dz) {
  const columns = Math.abs(dx);
  const rows = Math.abs(dz);
  const columnStep = Math.sign(dx);
  const rowStep = Math.sign(dz);
  const intermediates = [];
  let column = 0;
  let row = 0;
  let error = columns - rows;
  while (column !== dx || row !== dz) {
    const doubledError = error * 2;
    if (doubledError > -rows) {
      error -= rows;
      column += columnStep;
    }
    if (doubledError < columns) {
      error += columns;
      row += rowStep;
    }
    if (column !== dx || row !== dz) intermediates.push([column, row]);
  }
  return intermediates;
}
const VISION_RAYS = buildVisionRays(VISION_RADIUS_CELLS);
const HIGH_GROUND_VISION_RAYS = buildVisionRays(
  VISION_RADIUS_CELLS + HIGH_GROUND_VISION_BONUS_CELLS,
);
const WORKER_SPAWN_OFFSETS = [
  [-1.1, -0.9], [1.1, -0.9], [-1.1, 0.9], [1.1, 0.9],
];
const MAX_ATTACK_FLOW_FIELDS = 8;
const MOVE_PLANNING_SLICE_BUDGET_MS = 5;
const attackMoveBucketRadius = Math.ceil(ATTACK_MOVE_ACQUIRE_RADIUS / SPATIAL_BUCKET_SIZE);
const attackMoveBucketOffsets = [];
for (let row = -attackMoveBucketRadius; row <= attackMoveBucketRadius; row++) {
  for (let column = -attackMoveBucketRadius; column <= attackMoveBucketRadius; column++) {
    attackMoveBucketOffsets.push({ column, row, distance: column * column + row * row });
  }
}
attackMoveBucketOffsets.sort((left, right) => left.distance - right.distance
  || left.row - right.row || left.column - right.column);
// Hold acquisition covers the full supported weapon range, including siege.
const holdBucketRadius = Math.ceil(Math.max(...Object.values(UNIT_DEFINITIONS)
  .map(definition => definition.combat.range)) / SPATIAL_BUCKET_SIZE);
const holdBucketOffsets = [];
for (let row = -holdBucketRadius; row <= holdBucketRadius; row++) {
  for (let column = -holdBucketRadius; column <= holdBucketRadius; column++) {
    holdBucketOffsets.push({ column, row, distance: column * column + row * row });
  }
}
holdBucketOffsets.sort((left, right) => left.distance - right.distance
  || left.row - right.row || left.column - right.column);
const targetBucketCapacity = Math.max(holdBucketOffsets.length, attackMoveBucketOffsets.length);
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.mp3': 'audio/mpeg',
};

const configuredMatchMapId = pveLaunchOptions?.mapId ?? defaultMapId;
let mapDefinition = mapCatalog.get(configuredMatchMapId);
if (!mapDefinition) {
  throw new Error(`The selected PvE map "${pveLaunchOptions?.mapId}" is not shipped with this server.`);
}
let MAP_WIDTH = 0;
let MAP_HEIGHT = 0;
let MAP_HALF_X = 0;
let MAP_HALF_Z = 0;
let CELL_COUNT = 0;
let spawnByTeam = [];
let elevationLevelByCell = new Uint8Array(0);
let mapHasElevation = false;
let blocked = new Uint8Array(0);
let forestCellMask = new Uint8Array(0);
let forestWoodRemaining = new Float32Array(0);
let forestVisionBaseHeights = new Float32Array(0);
let forestEpoch = 0;
const pendingForestClears = new Set();
const forestStockChangedCells = new Set();
let buildingBlocked = new Uint8Array(0);
let townCenterBlocked = new Uint8Array(0);
let visionBlockers = new Uint8Array(0);
let visionBlockHeights = new Float32Array(0);
let visibleCellsByTeam = [new Uint8Array(0), new Uint8Array(0)];
let exploredCellsByTeam = [new Uint8Array(0), new Uint8Array(0)];
let processedVisionSourcesByTeam = [new Uint8Array(0), new Uint8Array(0)];
let visionCoverageBySourceCell = [];
let pathVisited = new Uint32Array(0);
let pathPrevious = new Int32Array(0);
let pathQueue = new Int32Array(0);
let pathGScore = new Uint32Array(0);
let pathFScore = new Uint32Array(0);
let pathHeuristic = new Uint16Array(0);
let pathHeapCells = new Int32Array(0);
let pathHeapPosition = new Int32Array(0);
let pathHeapPositionSearch = new Uint32Array(0);
let pathClosedSearch = new Uint32Array(0);
let pathHeapCount = 0;
let pathSearchId = 0;
let walkableComponents = new Int32Array(0);
let spatialBucketColumns = 0;
let spatialBucketRows = 0;
let spatialBucketHeads = new Int32Array(0);
const spatialBucketNext = new Int32Array(MAX_UNITS);
let spatialBucketTeamHeads = [new Int32Array(0), new Int32Array(0)];
let spatialBucketTeamTails = [new Int32Array(0), new Int32Array(0)];
let spatialBucketTeamCounts = [new Uint16Array(0), new Uint16Array(0)];
let spatialBucketTeamCursors = [new Int32Array(0), new Int32Array(0)];
const spatialBucketOfUnit = new Int32Array(MAX_UNITS);
const spatialBucketTeamNext = [new Int32Array(MAX_UNITS), new Int32Array(MAX_UNITS)];
const attackMoveCandidateBuckets = new Int32Array(targetBucketCapacity);
const attackMoveCandidateRemaining = new Uint16Array(targetBucketCapacity);
let attackFlowFields = new Map();
let triggerStates = new Map();
let scenarioEventStates = new Map();
let matchElapsedSeconds = 0;
let scenarioClockStarted = false;
let victoryHoldState = { activeTeams: [false, false], progressSeconds: [0, 0], triggerIds: [null, null] };
let teamFood = [0, 0];
let teamWood = [0, 0];
let teamUpgrades = [
  emptyTechnologyCompletions(),
  emptyTechnologyCompletions(),
];
let teamResearch = [null, null];
let workerProduction = [
  { queue: 0, trainingRemaining: 0, productionBlocked: false },
  { queue: 0, trainingRemaining: 0, productionBlocked: false },
];
const buildings = [];
const buildingsById = new Map();
const HOME_TOWN_CENTER_ID_BASE = 1_000_000_000;
let homeTownCenters = [];
let nextBuildingId = 1;
let resourceNodeStates = new Map();
let matchWinner = -1;
let matchWinnerTriggerId = null;
let matchWinnerReason = null;

function resetHomeTownCenters(records = null) {
  homeTownCenters = [0, 1].map((team) => {
    const point = townCenterSpawnPosition(spawnByTeam, team, MAP_WIDTH, MAP_HEIGHT);
    const center = { id: HOME_TOWN_CENTER_ID_BASE + team, team, type: 'town-center', home: true,
      ...point, hp: records?.[team]?.hp ?? BUILDING_DEFINITIONS['town-center'].maxHp,
      rallyCell: records?.[team]?.rallyCell ?? -1, progress: 1, complete: true,
      footprint: townCenterFootprintCells(spawnByTeam, team, MAP_WIDTH, MAP_HEIGHT) };
    const points = center.footprint.map(cellToWorld);
    center.bounds = { minX: Math.min(...points.map((p) => p.x)) - 0.5, maxX: Math.max(...points.map((p) => p.x)) + 0.5,
      minZ: Math.min(...points.map((p) => p.z)) - 0.5, maxZ: Math.max(...points.map((p) => p.z)) + 0.5 };
    for (const key of ['queue', 'trainingRemaining', 'productionBlocked']) Object.defineProperty(center, key, {
      enumerable: true, get: () => workerProduction[team][key], set: (value) => { workerProduction[team][key] = value; },
    });
    Object.defineProperty(center, 'productionQueue', { enumerable: true, get: () => Array(workerProduction[team].queue).fill('worker') });
    if (center.hp > 0) buildingsById.set(center.id, center);
    return center;
  });
  rebuildHomeTownCenterBlocking();
}
function rebuildHomeTownCenterBlocking() {
  townCenterBlocked.fill(0);
  for (const center of homeTownCenters) if (center.hp > 0) {
    for (const cell of center.footprint) townCenterBlocked[cell] = 1;
  }
}
function allMatchBuildings() { return [...buildings, ...homeTownCenters.filter((center) => center.hp > 0)]; }

function resetScenarioEventClock() {
  matchElapsedSeconds = 0;
  scenarioClockStarted = false;
  scenarioEventStates = new Map((mapDefinition?.scenarioEvents || []).map((event) => [
    event.id, ['capture', 'region-entry', 'construction-complete', 'research-complete'].includes(event.trigger?.type)
      ? {
        id: event.id, fired: false, activatedAtSeconds: null, triggeredByTeam: -1,
        ...(event.repeatCount === undefined ? {} : { fireCount: 0, nextFireAtSeconds: null }),
      }
      : event.trigger?.type === 'event'
        ? {
          id: event.id, fired: false, activatedAtSeconds: null, triggeredByTeam: -1,
          ...(event.repeatCount === undefined ? {} : { fireCount: 0, nextFireAtSeconds: null }),
        }
        : {
        id: event.id, fired: false,
        ...(event.repeatCount === undefined ? {} : { fireCount: 0, nextFireAtSeconds: event.afterSeconds }),
        },
  ]));
}

function resetVictoryHoldState() {
  victoryHoldState = { activeTeams: [false, false], progressSeconds: [0, 0], triggerIds: [null, null] };
}

function activateMap(definition) {
  mapDefinition = definition;
  MAP_WIDTH = definition.width;
  MAP_HEIGHT = definition.height;
  MAP_HALF_X = MAP_WIDTH / 2;
  MAP_HALF_Z = MAP_HEIGHT / 2;
  CELL_COUNT = MAP_WIDTH * MAP_HEIGHT;
  spawnByTeam = [0, 1].map((team) => definition.spawnPoints.find((point) => point.team === team));
  elevationLevelByCell = buildElevationGrid(MAP_WIDTH, MAP_HEIGHT, definition.elevationPatches);
  mapHasElevation = hasElevation(elevationLevelByCell);
  blocked = new Uint8Array(CELL_COUNT);
  forestCellMask = forestCellsForDefinition(definition);
  forestWoodRemaining = new Float32Array(CELL_COUNT);
  forestVisionBaseHeights = new Float32Array(CELL_COUNT);
  for (let cell = 0; cell < CELL_COUNT; cell++) {
    if (forestCellMask[cell]) forestWoodRemaining[cell] = FOREST_WOOD_PER_CELL;
  }
  pendingForestClears.clear();
  forestStockChangedCells.clear();
  forestEpoch++;
  buildingBlocked = new Uint8Array(CELL_COUNT);
  townCenterBlocked = new Uint8Array(CELL_COUNT);
  for (const team of [0, 1]) {
    for (const cell of townCenterFootprintCells(spawnByTeam, team, MAP_WIDTH, MAP_HEIGHT)) townCenterBlocked[cell] = 1;
  }
  visionBlockers = new Uint8Array(CELL_COUNT);
  visionBlockHeights = new Float32Array(CELL_COUNT);
  visibleCellsByTeam = [new Uint8Array(CELL_COUNT), new Uint8Array(CELL_COUNT)];
  exploredCellsByTeam = [new Uint8Array(CELL_COUNT), new Uint8Array(CELL_COUNT)];
  processedVisionSourcesByTeam = [new Uint8Array(CELL_COUNT), new Uint8Array(CELL_COUNT)];
  visionCoverageBySourceCell = new Array(CELL_COUNT);
  pathVisited = new Uint32Array(CELL_COUNT);
  pathPrevious = new Int32Array(CELL_COUNT);
  pathQueue = new Int32Array(CELL_COUNT);
  pathGScore = new Uint32Array(CELL_COUNT);
  pathFScore = new Uint32Array(CELL_COUNT);
  pathHeuristic = new Uint16Array(CELL_COUNT);
  pathHeapCells = new Int32Array(CELL_COUNT);
  pathHeapPosition = new Int32Array(CELL_COUNT);
  pathHeapPositionSearch = new Uint32Array(CELL_COUNT);
  pathClosedSearch = new Uint32Array(CELL_COUNT);
  pathHeapCount = 0;
  pathSearchId = 0;
  attackFlowFields.clear();
  buildings.length = 0;
  buildingsById.clear();
  workerProduction = [
    { queue: 0, trainingRemaining: 0, productionBlocked: false },
    { queue: 0, trainingRemaining: 0, productionBlocked: false },
  ];
  resetHomeTownCenters();
  spatialBucketColumns = Math.floor((MAP_WIDTH - 0.5) / SPATIAL_BUCKET_SIZE) + 1;
  spatialBucketRows = Math.floor((MAP_HEIGHT - 0.5) / SPATIAL_BUCKET_SIZE) + 1;
  const bucketCount = spatialBucketColumns * spatialBucketRows;
  spatialBucketHeads = new Int32Array(bucketCount);
  spatialBucketHeads.fill(-1);
  spatialBucketTeamHeads = [new Int32Array(bucketCount), new Int32Array(bucketCount)];
  spatialBucketTeamTails = [new Int32Array(bucketCount), new Int32Array(bucketCount)];
  spatialBucketTeamCounts = [new Uint16Array(bucketCount), new Uint16Array(bucketCount)];
  spatialBucketTeamCursors = [new Int32Array(bucketCount), new Int32Array(bucketCount)];
  spatialBucketTeamHeads[0].fill(-1);
  spatialBucketTeamHeads[1].fill(-1);
  spatialBucketTeamTails[0].fill(-1);
  spatialBucketTeamTails[1].fill(-1);
  spatialBucketTeamCursors[0].fill(-1);
  spatialBucketTeamCursors[1].fill(-1);
  for (const obstacle of definition.obstacles) {
    const blocksVision = ['stone', 'forest'].includes(obstacle.material ?? 'stone');
    const visionHeight = obstacle.elevation ?? 1.12;
    for (let z = obstacle.row; z < obstacle.row + obstacle.height; z++) {
      for (let x = obstacle.column; x < obstacle.column + obstacle.width; x++) {
        const cell = z * MAP_WIDTH + x;
        blocked[cell] = 1;
        if (blocksVision) {
          visionBlockers[cell] = 1;
          visionBlockHeights[cell] = visionHeight;
          if (forestCellMask[cell]) forestVisionBaseHeights[cell] = visionHeight;
        }
      }
    }
  }
  rebuildWalkableComponents();
  triggerStates = new Map(definition.triggers.map((trigger) => [trigger.id, {
    id: trigger.id, owner: -1, progressTeam: -1, progress: 0, unitCounts: [0, 0],
  }]));
  resetScenarioEventClock();
  resetVictoryHoldState();
  resourceNodeStates = new Map(definition.resourceNodes.map((node) => [node.id, {
    id: node.id, type: node.type, x: node.x, z: node.z, stock: node.stock,
  }]));
}

function mapCatalogPayload() {
  const regional = (map) => Boolean(map.region || map.audio?.packId?.startsWith('vaelora-'));
  return [...mapCatalog.values()].sort((a, b) => Number(regional(b)) - Number(regional(a)) || a.name.localeCompare(b.name)).map((map) => ({
    id: map.id, name: shippedMapIds.has(map.id) && !regional(map) ? `Lab · ${map.name}` : map.name, summary: map.summary || `${map.width} × ${map.height}`,
  }));
}

activateMap(mapDefinition);

const units = [];
const pendingUnitDamage = new Float64Array(MAX_UNITS);
const attackFlowLastGrant = new WeakMap();
const pendingBuildingDamage = new Map();
const unitGenerationCounters = new Uint32Array(MAX_UNITS);
unitGenerationCounters.fill(randomBytes(4).readUInt32LE(0));
const peers = new Set();
let outboundQueueLimitDisconnects = 0;
let peakOutboundQueuedBytes = 0;
let inboundControlFramesReceived = 0;
let inboundControlPingsReceived = 0;
let inboundControlPongsReceived = 0;
let inboundControlRateLimitDisconnects = 0;
let commandQueueLimitRejections = 0;
const sessions = new Map();
let pveOpponentActive = false;
let pvePolicy = pveLaunchOptions ? createDeterministicPolicy(pveLaunchOptions.policySeed) : null;
let pveCommandsIssued = 0;
let pveOpponentError = null;
let pveDecisionInFlight = false;
const pveOpponentPlayer = Object.freeze({ team: 1, sendJson() {} });
let currentArmySize = DEFAULT_STARTING_ARMY_SIZE;
let nextPlayerId = 1;
let tickNumber = 0;
let dirty = true;
const pendingMoveStartBroadcasts = new Set();
const tickDurationsMs = new Float32Array(TICK_SAMPLE_WINDOW);
const tickStartLagsMs = new Float32Array(TICK_SAMPLE_WINDOW);
const tickDiagnosticSamples = TICK_DIAGNOSTICS_ENABLED ? new Array(TICK_SAMPLE_WINDOW).fill(null) : null;
const separationWorkSamples = SEPARATION_DIAGNOSTICS_ENABLED ? {
  candidateVisits: new Uint32Array(TICK_SAMPLE_WINDOW),
  distanceChecks: new Uint32Array(TICK_SAMPLE_WINDOW),
  closeNeighborContributions: new Uint32Array(TICK_SAMPLE_WINDOW),
  moveVectorCalls: new Uint32Array(TICK_SAMPLE_WINDOW),
  maxCandidatesPerCall: new Uint32Array(TICK_SAMPLE_WINDOW),
} : null;
let tickDurationCursor = 0;
let tickDurationCount = 0;
let tickStartLagCursor = 0;
let tickStartLagCount = 0;
let skippedTickSlotsTotal = 0;
let lastOverloadSkippedSlots = 0;
let lastOverloadTick = null;
let separationWorkCursor = 0;
let separationWorkCount = 0;
let separationTickCandidateVisits = 0;
let separationTickDistanceChecks = 0;
let separationTickCloseNeighborContributions = 0;
let separationTickMoveVectorCalls = 0;
let separationTickMaxCandidatesPerCall = 0;
let lastSimulationTickStartedAt = null;
const movePlanningSamples = [];
const movePlanningQueue = [];
let activeMovePlanningJob = null;
let movePlanningEpoch = 0;
let nextMoveOrderId = 1;
let navigationRevision = 0;

function resetForestStocks() {
  let changed = false;
  pendingForestClears.clear();
  forestStockChangedCells.clear();
  for (let cell = 0; cell < CELL_COUNT; cell++) {
    if (!forestCellMask[cell]) continue;
    if (forestWoodRemaining[cell] < FOREST_WOOD_PER_CELL) changed = true;
    forestWoodRemaining[cell] = FOREST_WOOD_PER_CELL;
    blocked[cell] = 1;
    visionBlockers[cell] = 1;
    visionBlockHeights[cell] = forestVisionBaseHeights[cell] || 1.12;
  }
  forestEpoch++;
  if (changed) navigationRevision++;
  visionCoverageBySourceCell = new Array(CELL_COUNT);
  attackFlowFields.clear();
}

function recordTickDuration(durationMs, diagnostic = null) {
  tickDurationsMs[tickDurationCursor] = durationMs;
  if (tickDiagnosticSamples) tickDiagnosticSamples[tickDurationCursor] = diagnostic;
  tickDurationCursor = (tickDurationCursor + 1) % TICK_SAMPLE_WINDOW;
  tickDurationCount = Math.min(TICK_SAMPLE_WINDOW, tickDurationCount + 1);
}

function recordTickStartLag(lagMs) {
  tickStartLagsMs[tickStartLagCursor] = lagMs;
  tickStartLagCursor = (tickStartLagCursor + 1) % TICK_SAMPLE_WINDOW;
  tickStartLagCount = Math.min(TICK_SAMPLE_WINDOW, tickStartLagCount + 1);
}

function tickTimingPayload() {
  const count = tickDurationCount;
  const base = (tickDurationCursor - count + TICK_SAMPLE_WINDOW) % TICK_SAMPLE_WINDOW;
  let slowestTick = null;
  if (tickDiagnosticSamples) {
    for (let index = 0; index < count; index++) {
      const sample = tickDiagnosticSamples[(base + index) % TICK_SAMPLE_WINDOW];
      if (sample && (!slowestTick || sample.durationMs > slowestTick.durationMs)) slowestTick = sample;
    }
  }
  const samples = Array.from({ length: count }, (_, index) => (
    tickDurationsMs[(base + index) % TICK_SAMPLE_WINDOW]
  )).sort((a, b) => a - b);
  const valueAt = (quantile) => count
    ? Number(samples[Math.min(count - 1, Math.ceil(count * quantile) - 1)].toFixed(3))
    : null;
  const lagCount = tickStartLagCount;
  const lagBase = (tickStartLagCursor - lagCount + TICK_SAMPLE_WINDOW) % TICK_SAMPLE_WINDOW;
  const lags = Array.from({ length: lagCount }, (_, index) => (
    tickStartLagsMs[(lagBase + index) % TICK_SAMPLE_WINDOW]
  )).sort((a, b) => a - b);
  const lagAt = (quantile) => lagCount
    ? Number(lags[Math.min(lagCount - 1, Math.ceil(lagCount * quantile) - 1)].toFixed(3))
    : null;
  return {
    sampleCount: count,
    windowSeconds: Number((count / TICK_RATE).toFixed(1)),
    budgetMs: Number((1000 / TICK_RATE).toFixed(3)),
    p50Ms: valueAt(0.5),
    p95Ms: valueAt(0.95),
    maxMs: count ? Number(samples[count - 1].toFixed(3)) : null,
    startLagP95Ms: lagAt(0.95),
    startLagMaxMs: lagCount ? Number(lags[lagCount - 1].toFixed(3)) : null,
    scheduler: {
      policy: 'drop-elapsed-slots',
      skippedTickSlotsTotal,
      lastOverloadSkippedSlots,
      lastOverloadTick,
    },
    ...(tickDiagnosticSamples ? { slowestTick, scenarioTiming: (() => {
      const values = Array.from({ length: count }, (_, index) =>
        tickDiagnosticSamples[(base + index) % TICK_SAMPLE_WINDOW])
        .filter(sample => sample?.scenarioEvaluated).map(sample => sample.scenarioMs).sort((a, b) => a - b);
      const at = q => values.length ? values[Math.max(0, Math.ceil(values.length * q) - 1)] : null;
      return { sampleCount: values.length, p50Ms: at(.5), p95Ms: at(.95), maxMs: at(1) };
    })() } : {}),
  };
}

function recordSeparationWorkSample() {
  if (!separationWorkSamples) return;
  const index = separationWorkCursor;
  separationWorkSamples.candidateVisits[index] = separationTickCandidateVisits;
  separationWorkSamples.distanceChecks[index] = separationTickDistanceChecks;
  separationWorkSamples.closeNeighborContributions[index] = separationTickCloseNeighborContributions;
  separationWorkSamples.moveVectorCalls[index] = separationTickMoveVectorCalls;
  separationWorkSamples.maxCandidatesPerCall[index] = separationTickMaxCandidatesPerCall;
  separationWorkCursor = (index + 1) % TICK_SAMPLE_WINDOW;
  separationWorkCount = Math.min(TICK_SAMPLE_WINDOW, separationWorkCount + 1);
}

function summarizeSeparationSamples(samples) {
  const base = (separationWorkCursor - separationWorkCount + TICK_SAMPLE_WINDOW) % TICK_SAMPLE_WINDOW;
  const values = Array.from({ length: separationWorkCount }, (_, index) => (
    samples[(base + index) % TICK_SAMPLE_WINDOW]
  )).sort((a, b) => a - b);
  const at = (quantile) => values.length
    ? values[Math.min(values.length - 1, Math.ceil(values.length * quantile) - 1)] : null;
  return {
    p50: at(0.5), p95: at(0.95), max: values.length ? values.at(-1) : null,
  };
}

function separationWorkPayload() {
  if (!separationWorkSamples) return null;
  return {
    enabled: true,
    sampleCount: separationWorkCount,
    windowSeconds: Number((separationWorkCount / TICK_RATE).toFixed(1)),
    candidateVisitsPerTick: summarizeSeparationSamples(separationWorkSamples.candidateVisits),
    distanceChecksPerTick: summarizeSeparationSamples(separationWorkSamples.distanceChecks),
    closeNeighborContributionsPerTick: summarizeSeparationSamples(separationWorkSamples.closeNeighborContributions),
    moveVectorCallsPerTick: summarizeSeparationSamples(separationWorkSamples.moveVectorCalls),
    maxCandidatesPerCall: summarizeSeparationSamples(separationWorkSamples.maxCandidatesPerCall),
  };
}

function cellIndex(column, row) {
  return row * MAP_WIDTH + column;
}

function worldToCell(x, z) {
  const column = Math.max(0, Math.min(MAP_WIDTH - 1, Math.floor(x + MAP_HALF_X)));
  const row = Math.max(0, Math.min(MAP_HEIGHT - 1, Math.floor(z + MAP_HALF_Z)));
  return cellIndex(column, row);
}

function cellToWorld(cell) {
  const column = cell % MAP_WIDTH;
  const row = Math.floor(cell / MAP_WIDTH);
  return { x: column - MAP_HALF_X + 0.5, z: row - MAP_HALF_Z + 0.5 };
}

function isWalkable(cell) {
  return cell >= 0 && cell < CELL_COUNT && blocked[cell] === 0 && buildingBlocked[cell] === 0 && townCenterBlocked[cell] === 0;
}

function nearestOpenCell(cell) {
  if (isWalkable(cell)) return cell;
  const startX = cell % MAP_WIDTH;
  const startZ = Math.floor(cell / MAP_WIDTH);
  for (let radius = 1; radius < Math.max(MAP_WIDTH, MAP_HEIGHT); radius++) {
    for (let dz = -radius; dz <= radius; dz++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (Math.abs(dx) !== radius && Math.abs(dz) !== radius) continue;
        const x = startX + dx;
        const z = startZ + dz;
        if (x < 0 || x >= MAP_WIDTH || z < 0 || z >= MAP_HEIGHT) continue;
        const candidate = cellIndex(x, z);
        if (isWalkable(candidate)) return candidate;
      }
    }
  }
  return cell;
}

function nearestOpenCellInComponent(cell, componentId, reservedCells, fallbackCell) {
  const startX = cell % MAP_WIDTH;
  const startZ = Math.floor(cell / MAP_WIDTH);
  for (let radius = 0; radius < Math.max(MAP_WIDTH, MAP_HEIGHT); radius++) {
    for (let dz = -radius; dz <= radius; dz++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (Math.abs(dx) !== radius && Math.abs(dz) !== radius) continue;
        const x = startX + dx;
        const z = startZ + dz;
        if (x < 0 || x >= MAP_WIDTH || z < 0 || z >= MAP_HEIGHT) continue;
        const candidate = cellIndex(x, z);
        if (walkableComponents[candidate] === componentId && !reservedCells.has(candidate)) return candidate;
      }
    }
  }
  return fallbackCell;
}

function rebuildWalkableComponents() {
  walkableComponents = new Int32Array(CELL_COUNT);
  walkableComponents.fill(-1);
  const queue = new Int32Array(CELL_COUNT);
  let componentId = 0;
  for (let start = 0; start < CELL_COUNT; start++) {
    if (!isWalkable(start) || walkableComponents[start] >= 0) continue;
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    walkableComponents[start] = componentId;
    while (head < tail) {
      const current = queue[head++];
      const column = current % MAP_WIDTH;
      const row = Math.floor(current / MAP_WIDTH);
      if (column > 0) {
        const next = current - 1;
        if (isWalkable(next) && canTraverseElevation(elevationLevelByCell, current, next)
          && walkableComponents[next] < 0) {
          walkableComponents[next] = componentId;
          queue[tail++] = next;
        }
      }
      if (column + 1 < MAP_WIDTH) {
        const next = current + 1;
        if (isWalkable(next) && canTraverseElevation(elevationLevelByCell, current, next)
          && walkableComponents[next] < 0) {
          walkableComponents[next] = componentId;
          queue[tail++] = next;
        }
      }
      if (row > 0) {
        const next = current - MAP_WIDTH;
        if (isWalkable(next) && canTraverseElevation(elevationLevelByCell, current, next)
          && walkableComponents[next] < 0) {
          walkableComponents[next] = componentId;
          queue[tail++] = next;
        }
      }
      if (row + 1 < MAP_HEIGHT) {
        const next = current + MAP_WIDTH;
        if (isWalkable(next) && canTraverseElevation(elevationLevelByCell, current, next)
          && walkableComponents[next] < 0) {
          walkableComponents[next] = componentId;
          queue[tail++] = next;
        }
      }
    }
    componentId++;
  }
}

function findAvailableCellNear(startCell, componentId, reservedCells, maxRadius = 8) {
  if (componentId < 0) return -1;
  const startColumn = startCell % MAP_WIDTH;
  const startRow = Math.floor(startCell / MAP_WIDTH);
  for (let radius = 0; radius <= maxRadius; radius++) {
    for (let dz = -radius; dz <= radius; dz++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (radius > 0 && Math.max(Math.abs(dx), Math.abs(dz)) !== radius) continue;
        const column = startColumn + dx;
        const row = startRow + dz;
        if (column < 0 || column >= MAP_WIDTH || row < 0 || row >= MAP_HEIGHT) continue;
        const candidate = cellIndex(column, row);
        if (walkableComponents[candidate] === componentId && !reservedCells.has(candidate)) return candidate;
      }
    }
  }
  return -1;
}

function findTownCenterProductionSpawnCell(team) {
  const spawn = spawnByTeam[team];
  if (!spawn || homeTownCenters[team]?.hp <= 0) return -1;
  const townCenterPosition = townCenterSpawnPosition(spawnByTeam, team, MAP_WIDTH, MAP_HEIGHT);
  const townCenterCell = worldToCell(townCenterPosition.x, townCenterPosition.z);
  const teamSpawnCell = nearestOpenCell(worldToCell(spawn.x, spawn.z));
  const componentId = walkableComponents[teamSpawnCell];
  if (componentId < 0) return -1;
  const reserved = new Set([townCenterCell]);
  for (const unit of units) if (unit.hp > 0) reserved.add(worldToCell(unit.x, unit.z));
  for (const node of mapDefinition.resourceNodes) reserved.add(worldToCell(node.x, node.z));
  return findAvailableCellNear(townCenterCell, componentId, reserved, TOWN_CENTER_SPAWN_SEARCH_RADIUS);
}

function beginPathSearch() {
  let searchId = (pathSearchId + 1) >>> 0;
  if (searchId === 0) {
    pathVisited.fill(0);
    pathHeapPositionSearch.fill(0);
    pathClosedSearch.fill(0);
    searchId = 1;
  }
  pathSearchId = searchId;
  return searchId;
}

function pathHeapLess(leftCell, rightCell) {
  if (pathFScore[leftCell] !== pathFScore[rightCell]) {
    return pathFScore[leftCell] < pathFScore[rightCell];
  }
  if (pathHeuristic[leftCell] !== pathHeuristic[rightCell]) {
    return pathHeuristic[leftCell] < pathHeuristic[rightCell];
  }
  return leftCell < rightCell;
}

function siftPathHeapUp(index, cell, searchId) {
  while (index > 0) {
    const parent = (index - 1) >>> 1;
    const parentCell = pathHeapCells[parent];
    if (!pathHeapLess(cell, parentCell)) break;
    pathHeapCells[index] = parentCell;
    pathHeapPosition[parentCell] = index;
    index = parent;
  }
  pathHeapCells[index] = cell;
  pathHeapPosition[cell] = index;
  pathHeapPositionSearch[cell] = searchId;
}

function siftPathHeapDown(index, cell, searchId) {
  while (true) {
    const left = index * 2 + 1;
    if (left >= pathHeapCount) break;
    const right = left + 1;
    const best = right < pathHeapCount && pathHeapLess(pathHeapCells[right], pathHeapCells[left])
      ? right : left;
    const bestCell = pathHeapCells[best];
    if (!pathHeapLess(bestCell, cell)) break;
    pathHeapCells[index] = bestCell;
    pathHeapPosition[bestCell] = index;
    index = best;
  }
  pathHeapCells[index] = cell;
  pathHeapPosition[cell] = index;
  pathHeapPositionSearch[cell] = searchId;
}

function pushPathHeap(cell, searchId) {
  const index = pathHeapCount++;
  siftPathHeapUp(index, cell, searchId);
}

function popPathHeap(searchId) {
  const cell = pathHeapCells[0];
  const lastCell = pathHeapCells[--pathHeapCount];
  pathHeapPositionSearch[cell] = 0;
  if (pathHeapCount > 0) siftPathHeapDown(0, lastCell, searchId);
  return cell;
}

function relaxPathNeighbor(current, next, goalColumn, goalRow, searchId) {
  if (!isWalkable(next) || !canTraverseElevation(elevationLevelByCell, current, next)
    || pathClosedSearch[next] === searchId) return 0;
  const score = pathGScore[current] + elevationPathCost(elevationLevelByCell, current, next);
  const firstVisit = pathVisited[next] !== searchId;
  if (!firstVisit && score >= pathGScore[next]) return 0;

  const column = next % MAP_WIDTH;
  const row = Math.floor(next / MAP_WIDTH);
  const heuristic = (Math.abs(goalColumn - column) + Math.abs(goalRow - row))
    * BASE_ELEVATION_PATH_COST;
  pathVisited[next] = searchId;
  pathGScore[next] = score;
  pathFScore[next] = score + heuristic;
  pathHeuristic[next] = heuristic;
  pathPrevious[next] = current;
  if (pathHeapPositionSearch[next] === searchId) {
    siftPathHeapUp(pathHeapPosition[next], next, searchId);
  } else {
    pushPathHeap(next, searchId);
  }
  return firstVisit ? 1 : 0;
}

function buildDirectManhattanPath(start, goal, horizontalFirst) {
  const path = [];
  let column = start % MAP_WIDTH;
  let row = Math.floor(start / MAP_WIDTH);
  const goalColumn = goal % MAP_WIDTH;
  const goalRow = Math.floor(goal / MAP_WIDTH);
  const columnStep = Math.sign(goalColumn - column);
  const rowStep = Math.sign(goalRow - row);

  const walkHorizontal = (targetColumn) => {
    while (column !== targetColumn) {
      const previous = cellIndex(column, row);
      column += columnStep;
      const cell = cellIndex(column, row);
      if (!isWalkable(cell) || !canTraverseElevation(elevationLevelByCell, previous, cell)) return false;
      path.push(cell);
    }
    return true;
  };
  const walkVertical = (targetRow) => {
    while (row !== targetRow) {
      row += rowStep;
      const cell = cellIndex(column, row);
      const previous = cellIndex(column, row - rowStep);
      if (!isWalkable(cell) || !canTraverseElevation(elevationLevelByCell, previous, cell)) return false;
      path.push(cell);
    }
    return true;
  };

  const clear = horizontalFirst
    ? walkHorizontal(goalColumn) && walkVertical(goalRow)
    : walkVertical(goalRow) && walkHorizontal(goalColumn);
  return clear ? path : null;
}

function findDirectManhattanPath(start, goal) {
  if (!mapHasElevation) {
    return buildDirectManhattanPath(start, goal, true)
      || buildDirectManhattanPath(start, goal, false);
  }
  const candidates = [
    buildDirectManhattanPath(start, goal, true),
    buildDirectManhattanPath(start, goal, false),
  ].filter((path) => path !== null);
  for (const path of candidates) {
    let previous = start;
    let cost = 0;
    for (const cell of path) {
      cost += elevationPathCost(elevationLevelByCell, previous, cell);
      previous = cell;
    }
    if (cost === path.length * BASE_ELEVATION_PATH_COST) return path;
  }
  return null;
}

function findPathAStar(start, goal, diagnostics = null) {
  if (start === goal) return [];
  const directPath = findDirectManhattanPath(start, goal);
  if (directPath !== null) return directPath;
  const searchId = beginPathSearch();
  pathHeapCount = 0;
  const goalColumn = goal % MAP_WIDTH;
  const goalRow = Math.floor(goal / MAP_WIDTH);
  const startColumn = start % MAP_WIDTH;
  const startRow = Math.floor(start / MAP_WIDTH);
  const startHeuristic = (Math.abs(goalColumn - startColumn) + Math.abs(goalRow - startRow))
    * BASE_ELEVATION_PATH_COST;
  pathVisited[start] = searchId;
  pathGScore[start] = 0;
  pathFScore[start] = startHeuristic;
  pathHeuristic[start] = startHeuristic;
  pathPrevious[start] = -1;
  pushPathHeap(start, searchId);

  let expanded = 0;
  let discovered = 1;
  while (pathHeapCount > 0) {
    const current = popPathHeap(searchId);
    pathClosedSearch[current] = searchId;
    expanded++;
    if (current === goal) break;
    const column = current % MAP_WIDTH;
    const row = Math.floor(current / MAP_WIDTH);
    if (column > 0) discovered += relaxPathNeighbor(current, current - 1, goalColumn, goalRow, searchId);
    if (column + 1 < MAP_WIDTH) discovered += relaxPathNeighbor(current, current + 1, goalColumn, goalRow, searchId);
    if (row > 0) discovered += relaxPathNeighbor(current, current - MAP_WIDTH, goalColumn, goalRow, searchId);
    if (row + 1 < MAP_HEIGHT) discovered += relaxPathNeighbor(current, current + MAP_WIDTH, goalColumn, goalRow, searchId);
  }
  if (diagnostics) {
    diagnostics.searchCount++;
    diagnostics.expandedCells += expanded;
    diagnostics.discoveredCells += discovered;
  }
  if (pathClosedSearch[goal] !== searchId) return [];

  const reversed = [];
  for (let cell = goal; cell !== start; cell = pathPrevious[cell]) {
    if (cell < 0 || reversed.length >= CELL_COUNT) return [];
    reversed.push(cell);
  }
  reversed.reverse();
  return reversed;
}

function relaxAttackFlowNeighbor(current, next, searchId) {
  if (!isWalkable(next) || !canTraverseElevation(elevationLevelByCell, next, current)
    || pathClosedSearch[next] === searchId) return 0;
  const score = pathGScore[current] + elevationPathCost(elevationLevelByCell, next, current);
  const firstVisit = pathVisited[next] !== searchId;
  if (!firstVisit && score >= pathGScore[next]) return 0;
  pathVisited[next] = searchId;
  pathGScore[next] = score;
  pathFScore[next] = score;
  pathHeuristic[next] = 0;
  pathPrevious[next] = current;
  if (pathHeapPositionSearch[next] === searchId) {
    siftPathHeapUp(pathHeapPosition[next], next, searchId);
  } else {
    pushPathHeap(next, searchId);
  }
  return firstVisit ? 1 : 0;
}

function buildAttackFlowNextCells(goals) {
  const searchId = beginPathSearch();
  let head = 0;
  let tail = 0;
  if (mapHasElevation) {
    pathHeapCount = 0;
    for (const goal of goals) {
      pathVisited[goal] = searchId;
      pathGScore[goal] = 0;
      pathFScore[goal] = 0;
      pathHeuristic[goal] = 0;
      pathPrevious[goal] = -1;
      pathQueue[tail++] = goal;
      pushPathHeap(goal, searchId);
    }
    while (pathHeapCount > 0) {
      const current = popPathHeap(searchId);
      pathClosedSearch[current] = searchId;
      const column = current % MAP_WIDTH;
      const row = Math.floor(current / MAP_WIDTH);
      if (column > 0) {
        const next = current - 1;
        if (relaxAttackFlowNeighbor(current, next, searchId)) pathQueue[tail++] = next;
      }
      if (column + 1 < MAP_WIDTH) {
        const next = current + 1;
        if (relaxAttackFlowNeighbor(current, next, searchId)) pathQueue[tail++] = next;
      }
      if (row > 0) {
        const next = current - MAP_WIDTH;
        if (relaxAttackFlowNeighbor(current, next, searchId)) pathQueue[tail++] = next;
      }
      if (row + 1 < MAP_HEIGHT) {
        const next = current + MAP_WIDTH;
        if (relaxAttackFlowNeighbor(current, next, searchId)) pathQueue[tail++] = next;
      }
    }
  } else {
    for (const goal of goals) {
      pathVisited[goal] = searchId;
      pathPrevious[goal] = -1;
      pathQueue[tail++] = goal;
    }
    while (head < tail) {
      const current = pathQueue[head++];
      const column = current % MAP_WIDTH;
      const row = Math.floor(current / MAP_WIDTH);
      if (column > 0) {
        const next = current - 1;
        if (pathVisited[next] !== searchId && isWalkable(next)) {
          pathVisited[next] = searchId;
          pathPrevious[next] = current;
          pathQueue[tail++] = next;
        }
      }
      if (column + 1 < MAP_WIDTH) {
        const next = current + 1;
        if (pathVisited[next] !== searchId && isWalkable(next)) {
          pathVisited[next] = searchId;
          pathPrevious[next] = current;
          pathQueue[tail++] = next;
        }
      }
      if (row > 0) {
        const next = current - MAP_WIDTH;
        if (pathVisited[next] !== searchId && isWalkable(next)) {
          pathVisited[next] = searchId;
          pathPrevious[next] = current;
          pathQueue[tail++] = next;
        }
      }
      if (row + 1 < MAP_HEIGHT) {
        const next = current + MAP_WIDTH;
        if (pathVisited[next] !== searchId && isWalkable(next)) {
          pathVisited[next] = searchId;
          pathPrevious[next] = current;
          pathQueue[tail++] = next;
        }
      }
    }
  }
  const nextCell = new Int32Array(CELL_COUNT);
  nextCell.fill(-1);
  for (let index = 0; index < tail; index++) {
    const cell = pathQueue[index];
    nextCell[cell] = pathPrevious[cell];
  }
  return nextCell;
}

function getAttackFlowField(goalCell) {
  const goal = nearestOpenCell(goalCell);
  if (!isWalkable(goal)) return null;
  const cached = attackFlowFields.get(goal);
  if (cached) {
    attackFlowFields.delete(goal);
    attackFlowFields.set(goal, cached);
    return cached;
  }

  const nextCell = buildAttackFlowNextCells([goal]);
  const field = { goal, goals: null, nextCell };
  if (attackFlowFields.size >= MAX_ATTACK_FLOW_FIELDS) {
    attackFlowFields.delete(attackFlowFields.keys().next().value);
  }
  attackFlowFields.set(goal, field);
  return field;
}

function getAttackFlowFieldForGoals(goalCells, cacheKey) {
  const cached = attackFlowFields.get(cacheKey);
  if (cached) {
    attackFlowFields.delete(cacheKey);
    attackFlowFields.set(cacheKey, cached);
    return cached;
  }
  const goals = [...new Set(goalCells.filter((cell) => isWalkable(cell)))];
  if (goals.length === 0) return null;
  const nextCell = buildAttackFlowNextCells(goals);
  const field = { goal: goals[0], goals: new Set(goals), nextCell };
  if (attackFlowFields.size >= MAX_ATTACK_FLOW_FIELDS) {
    attackFlowFields.delete(attackFlowFields.keys().next().value);
  }
  attackFlowFields.set(cacheKey, field);
  return field;
}

function buildingAttackApproachCells(building, kind) {
  const combat = UNIT_DEFINITIONS[kind].combat;
  if (combat.mode !== 'ranged') return buildingAccessCells(building.footprint);
  // Check only the fixed weapon-range box around the footprint (13 x 13 cells).
  // A firing position can belong to another island than the building perimeter.
  const center = worldToCell(building.x, building.z);
  const column = center % MAP_WIDTH;
  const row = Math.floor(center / MAP_WIDTH);
  const radius = Math.ceil(combat.range + BUILDING_DEFINITIONS[building.type].footprint / 2);
  const goals = [];
  for (let z = Math.max(0, row - radius); z <= Math.min(MAP_HEIGHT - 1, row + radius); z++) {
    for (let x = Math.max(0, column - radius); x <= Math.min(MAP_WIDTH - 1, column + radius); x++) {
      const cell = cellIndex(x, z);
      if (isWalkable(cell) && distanceToBuildingEdge(cellToWorld(cell), building) <= combat.range) {
        goals.push(cell);
      }
    }
  }
  return goals;
}

function getBuildingAttackFlowField(building, componentId, kind) {
  const cacheKey = `building:${building.id}:${componentId}:${kind}`;
  const cached = attackFlowFields.get(cacheKey);
  if (cached) {
    attackFlowFields.delete(cacheKey);
    attackFlowFields.set(cacheKey, cached);
    return cached;
  }
  const goals = buildingAttackApproachCells(building, kind)
    .filter((cell) => walkableComponents[cell] === componentId);
  return goals.length > 0 ? getAttackFlowFieldForGoals(goals, cacheKey) : null;
}

function pathFromAttackFlow(startCell, field) {
  let cell = nearestOpenCell(startCell);
  const isGoal = (goalCell) => field.goals ? field.goals.has(goalCell) : goalCell === field.goal;
  if (!isWalkable(cell) || isGoal(cell)) return [];
  const path = [];
  for (let length = 0; !isGoal(cell) && length < CELL_COUNT; length++) {
    cell = field.nextCell[cell];
    if (cell < 0 || cell >= CELL_COUNT) return [];
    path.push(cell);
  }
  return isGoal(cell) ? path : [];
}

function nextUnitGeneration(id) {
  let generation = (unitGenerationCounters[id] + 1) >>> 0;
  if (generation === 0) generation = 1;
  unitGenerationCounters[id] = generation;
  return generation;
}

function makeUnit(id, team, x, z, kind, teamSlot) {
  return {
    id, generation: nextUnitGeneration(id), team, x, z, hp: UNIT_DEFINITIONS[kind].combat.maxHp, path: [], pathIndex: 0,
    attackTargetId: -1, attackBuildingTargetId: -1,
    // Mirror the opening attack cadence by roster slot, not the global unit ID.
    attackCooldown: ((teamSlot * 37) % 30) / 30,
    repathTimer: 0, lastAttackCell: -1, lastAttackTick: -1,
    lastAttackX: 0, lastAttackZ: 0, orderRevision: 0,
    holdingPosition: false, persistentOrder: null, attackMove: false, attackMoveRouteReady: false,
    attackMoveResumePath: null, attackMoveResumePathIndex: 0,
    movePlanningPending: false,
    attackMoveAnchorX: 0, attackMoveAnchorZ: 0,
    attackMoveScanTick: tickNumber + (id % ATTACK_MOVE_SCAN_INTERVAL_TICKS),
    attackMoveBucketScanOffset: id % attackMoveBucketOffsets.length,
    kind, cargo: 0, cargoType: null, gatherNodeId: null, gatherForestCell: -1, gatherPhase: '', dropoffBuildingId: null, dropoffNavigationRevision: -1,
    buildingTargetId: null, repairing: false, moveGoalCell: -1, queuedWaypoints: [],
  };
}

function spawnProducedUnit(team, kind, x, z) {
  let teamSlots = 0;
  for (const unit of units) if (unit.team === team) teamSlots++;

  let id = -1;
  if (teamSlots < MAX_TEAM_ROSTER && units.length < MAX_UNITS) id = units.length;
  else {
    const reusable = units.find((unit) => unit.team === team && unit.hp <= 0);
    if (reusable) id = reusable.id;
  }
  if (id < 0) return false;

  const unit = makeUnit(id, team, x, z, kind, teamSlots);
  if (id === units.length) units.push(unit);
  else {
    for (const other of units) {
      if (other.hp > 0 && other.attackTargetId === id) clearAttackTarget(other);
    }
    units[id] = unit;
  }
  dirty = true;
  return unit;
}

function commandUnitAt(idValue, generationValue = undefined) {
  const id = Number(idValue);
  if (!Number.isInteger(id) || id < 0 || id >= units.length) return null;
  const unit = units[id];
  if (generationValue !== undefined) {
    const generation = Number(generationValue);
    if (!Number.isInteger(generation) || generation !== unit.generation) return null;
  }
  return unit;
}

function commandUnits(command) {
  const seen = new Set();
  const resolved = [];
  const generations = Array.isArray(command.unitGenerations) ? command.unitGenerations : null;
  for (let index = 0; index < command.ids.length && resolved.length < MAX_UNITS; index++) {
    const unit = commandUnitAt(command.ids[index], generations ? generations[index] ?? null : undefined);
    if (!unit || seen.has(unit.id)) continue;
    seen.add(unit.id);
    resolved.push(unit);
  }
  return resolved;
}

function resetPvePolicy() {
  if (!pveLaunchOptions) return;
  pvePolicy = createDeterministicPolicy(pveLaunchOptions.policySeed);
  pveCommandsIssued = 0;
  pveOpponentError = null;
}

function resetArmy(count = currentArmySize) {
  cancelMovePlanningJobs('MATCH RESET');
  matchWinner = -1;
  matchWinnerTriggerId = null;
  matchWinnerReason = null;
  currentArmySize = Math.max(2, Math.min(MAX_UNITS, Math.floor(count / 2) * 2));
  resetScenarioEventClock();
  resetVictoryHoldState();
  const startingResources = mapDefinition.startingResources ?? {};
  teamFood = [startingResources.food ?? 0, startingResources.food ?? 0];
  teamWood = [startingResources.wood ?? 0, startingResources.wood ?? 0];
  teamUpgrades = [
    emptyTechnologyCompletions(),
    emptyTechnologyCompletions(),
  ];
  teamResearch = [null, null];
  workerProduction = [
    { queue: 0, trainingRemaining: 0, productionBlocked: false },
    { queue: 0, trainingRemaining: 0, productionBlocked: false },
  ];
  buildings.length = 0;
  buildingsById.clear();
  buildingBlocked.fill(0);
  resetHomeTownCenters();
  resetForestStocks();
  attackFlowFields.clear();
  rebuildWalkableComponents();
  for (const node of mapDefinition.resourceNodes) {
    const state = resourceNodeStates.get(node.id);
    if (state) state.stock = node.stock;
  }
  units.length = 0;
  resetPvePolicy();
  const firstTeamCount = currentArmySize / 2;
  const reservedSpawnCells = [new Set(), new Set()];
  const baseCells = spawnByTeam.map((spawn) => nearestOpenCell(worldToCell(spawn.x, spawn.z)));
  const baseComponents = baseCells.map((cell) => walkableComponents[cell]);
  for (let id = 0; id < currentArmySize; id++) {
    const team = id < firstTeamCount ? 0 : 1;
    const slot = team === 0 ? id : id - firstTeamCount;
    const teamCount = firstTeamCount;
    const columns = Math.ceil(Math.sqrt(teamCount * 1.3));
    const rows = Math.ceil(teamCount / columns);
    const column = slot % columns;
    const row = Math.floor(slot / columns);
    const spacing = currentArmySize > 1000 ? 0.68 : 0.88;
    const spawn = spawnByTeam[team];
    const offset = WORKER_SPAWN_OFFSETS[slot];
    let x = spawn.x + (offset?.[0] ?? (column - (columns - 1) / 2) * spacing);
    let z = spawn.z + (offset?.[1] ?? (row - (rows - 1) / 2) * spacing);
    const desiredCell = worldToCell(x, z);
    const reservedCells = reservedSpawnCells[team];
    const insideMap = Math.abs(x) < MAP_HALF_X && Math.abs(z) < MAP_HALF_Z;
    let spawnCell = desiredCell;
    if (!insideMap || walkableComponents[desiredCell] !== baseComponents[team]
      || (slot < WORKER_SPAWN_OFFSETS.length && reservedCells.has(desiredCell))) {
      spawnCell = nearestOpenCellInComponent(
        desiredCell, baseComponents[team], reservedCells, baseCells[team],
      );
      const safePosition = cellToWorld(spawnCell);
      x = safePosition.x;
      z = safePosition.z;
    }
    reservedCells.add(spawnCell);
    units.push(makeUnit(id, team, x, z, slot < 4 ? 'worker' : 'infantry', slot));
  }
  for (const state of triggerStates.values()) {
    state.owner = -1;
    state.progressTeam = -1;
    state.progress = 0;
    state.unitCounts = [0, 0];
  }
  exploredCellsByTeam[0].fill(0);
  exploredCellsByTeam[1].fill(0);
  updateVisionMasks();
  dirty = true;
}

function snapshotUnits(viewTeam = null) {
  const rows = [];
  const focusedByUnit = new Uint16Array(units.length);
  for (const attacker of units) {
    if (attacker.hp <= 0 || attacker.attackTargetId < 0
      || (mapDefinition.fogOfWar && [0, 1].includes(viewTeam) && attacker.team !== viewTeam)) continue;
    const target = units[attacker.attackTargetId];
    if (target?.hp > 0) focusedByUnit[target.id]++;
  }
  for (const unit of units) {
    if (mapDefinition.fogOfWar && [0, 1].includes(viewTeam) && unit.team !== viewTeam
      && !cellVisibleToTeam(viewTeam, worldToCell(unit.x, unit.z))) continue;
    const task = unit.kind === 'worker'
      && (!mapDefinition.fogOfWar || viewTeam === null || viewTeam === unit.team)
      ? workerTaskStatus(unit) : null;
    const row = [
      unit.id, unit.team, Math.round(unit.x * 100) / 100,
      Math.round(unit.z * 100) / 100, unit.hp, unit.kind, Math.round(unit.cargo * 100) / 100,
      unit.cargoType, unit.generation,
    ];
    row.push(task, focusedByUnit[unit.id] || 0);
    if (Number.isInteger(unit.lastAttackTick)
      && unit.lastAttackTick >= 0 && tickNumber - unit.lastAttackTick <= STATE_EVERY_TICKS) {
      const targetVisible = !mapDefinition.fogOfWar || viewTeam === null || unit.team === viewTeam;
      row.push(unit.lastAttackTick,
        targetVisible ? unit.lastAttackX : null,
        targetVisible ? unit.lastAttackZ : null);
    }
    const audioExecution = !mapDefinition.fogOfWar || unit.team === viewTeam ? workerAudioExecution(unit) : null;
    if (audioExecution) row[14] = audioExecution;
    rows.push(row);
  }
  return rows;
}

function workerAudioExecution(unit) {
  if (unit.hp <= 0 || unit.kind !== 'worker') return null;
  if (unit.gatherPhase === 'gathering') return unit.gatherForestCell >= 0 ? 'wood'
    : mapDefinition.resourceNodes.find((node) => node.id === unit.gatherNodeId)?.type || null;
  if (!unit.repairing || teamWood[unit.team] <= 0) return null;
  const building = buildingsById.get(unit.buildingTargetId);
  if (!building || !building.complete || building.hp >= BUILDING_DEFINITIONS[building.type].maxHp) return null;
  const dx = Math.max(0, Math.abs(unit.x - building.x) - BUILDING_DEFINITIONS[building.type].footprint / 2);
  const dz = Math.max(0, Math.abs(unit.z - building.z) - BUILDING_DEFINITIONS[building.type].footprint / 2);
  return dx * dx + dz * dz <= BUILDER_INTERACTION_RANGE ** 2 ? 'repair' : null;
}

function snapshotPersistentOrders(viewTeam = null) {
  return units.filter(unit => unit.hp > 0 && unit.persistentOrder
    && (viewTeam === null || unit.team === viewTeam)).map(unit => [
      unit.id, unit.persistentOrder.type, unit.persistentOrder.status,
      unit.persistentOrder.type === 'follow' ? unit.persistentOrder.targetId : null,
    ]);
}

function snapshotQueuedWaypointCounts(viewTeam = null) {
  const rows = [];
  for (const unit of units) {
    if (unit.hp <= 0 || unit.queuedWaypoints.length === 0) continue;
    if ([0, 1].includes(viewTeam) && unit.team !== viewTeam) continue;
    rows.push([unit.id, unit.queuedWaypoints.length]);
  }
  return rows;
}

function workerTaskStatus(unit) {
  if (unit.holdingPosition) return 'holding';
  if (unit.persistentOrder) return unit.persistentOrder.type === 'patrol' ? 'patrolling' : 'following';
  if (unit.gatherNodeId !== null || unit.gatherForestCell >= 0) {
    return unit.gatherPhase === 'to-base' ? 'returning' : 'gathering';
  }
  if (unit.buildingTargetId !== null) return unit.repairing ? 'repairing' : 'building';
  if (unit.attackTargetId >= 0 || unit.attackBuildingTargetId >= 0) return 'attacking';
  if (unit.movePlanningPending || unit.pathIndex < unit.path.length || unit.attackMove) return 'moving';
  return 'idle';
}

function aliveCounts() {
  const alive = [0, 0];
  for (const unit of units) if (unit.hp > 0) alive[unit.team]++;
  return alive;
}

const visionRaysByRadius = new Map([[VISION_RADIUS_CELLS, VISION_RAYS], [VISION_RADIUS_CELLS + HIGH_GROUND_VISION_BONUS_CELLS, HIGH_GROUND_VISION_RAYS]]);
function markVisionFrom(team, x, z, sight = VISION_RADIUS_CELLS) {
  const centerColumn = Math.floor(x + MAP_HALF_X);
  const centerRow = Math.floor(z + MAP_HALF_Z);
  const sourceCell = centerRow * MAP_WIDTH + centerColumn;
  const processedSources = processedVisionSourcesByTeam[team];
  if (processedSources[sourceCell] >= sight) return;
  processedSources[sourceCell] = sight;
  const visible = visibleCellsByTeam[team];
  const explored = exploredCellsByTeam[team];
  const sourceCoverages = visionCoverageBySourceCell[sourceCell] ||= new Map();
  let coverage = sourceCoverages.get(sight);
  if (!coverage) {
    const cells = [];
    const radius = sight + (elevationLevelByCell[sourceCell] > 0 ? HIGH_GROUND_VISION_BONUS_CELLS : 0);
    if (!visionRaysByRadius.has(radius)) visionRaysByRadius.set(radius, buildVisionRays(radius));
    const rays = visionRaysByRadius.get(radius);
    for (const [dx, dz, ray] of rays) {
      const column = centerColumn + dx;
      const row = centerRow + dz;
      if (column < 0 || column >= MAP_WIDTH || row < 0 || row >= MAP_HEIGHT) continue;
      let sightBlocked = false;
      for (const [rayX, rayZ] of ray) {
        const rayColumn = centerColumn + rayX;
        const rayRow = centerRow + rayZ;
        const rayCell = rayRow * MAP_WIDTH + rayColumn;
        if (visionBlockers[rayCell] && visionBlockHeights[rayCell] >= VISION_EYE_HEIGHT
          || buildingBlocked[rayCell]) {
          sightBlocked = true;
          break;
        }
      }
      if (!sightBlocked) cells.push(row * MAP_WIDTH + column);
    }
    coverage = Uint16Array.from(cells);
    sourceCoverages.set(sight, coverage);
  }
  for (let index = 0; index < coverage.length; index++) {
    const cell = coverage[index];
    visible[cell] = 1;
    explored[cell] = 1;
  }
}

function updateVisionMasks() {
  visibleCellsByTeam[0].fill(0);
  visibleCellsByTeam[1].fill(0);
  processedVisionSourcesByTeam[0].fill(0);
  processedVisionSourcesByTeam[1].fill(0);
  if (!mapDefinition.fogOfWar) return;
  for (const unit of units) {
    if (unit.hp > 0) markVisionFrom(unit.team, unit.x, unit.z, UNIT_DEFINITIONS[unit.kind].sight || VISION_RADIUS_CELLS);
  }
  for (const building of allMatchBuildings()) {
    for (const cell of buildingAccessCells(building.footprint)) {
      const source = cellToWorld(cell);
      markVisionFrom(building.team, source.x, source.z, building.complete ? BUILDING_DEFINITIONS[building.type].sight || VISION_RADIUS_CELLS : VISION_RADIUS_CELLS);
    }
  }
}

function cellVisibleToTeam(team, cell) {
  return !mapDefinition.fogOfWar || visibleCellsByTeam[team]?.[cell] === 1;
}

function forestStockEntries(viewTeam = null) {
  const fogView = mapDefinition.fogOfWar && [0, 1].includes(viewTeam);
  const entries = [];
  const changedCells = [...forestStockChangedCells].sort((left, right) => left - right);
  for (const cell of changedCells) {
    const stock = forestWoodRemaining[cell];
    if (!forestCellMask[cell] || stock >= FOREST_WOOD_PER_CELL) continue;
    if (fogView && !cellVisibleToTeam(viewTeam, cell)) continue;
    entries.push([cell, Math.round(stock * 1_000_000) / 1_000_000]);
  }
  return entries;
}

function buildingVisibleToTeam(team, building) {
  if (!mapDefinition.fogOfWar || ![0, 1].includes(team) || building.team === team) return true;
  const centerCell = worldToCell(building.x, building.z);
  if (cellVisibleToTeam(team, centerCell)) return true;
  const centerColumn = centerCell % MAP_WIDTH;
  const centerRow = Math.floor(centerCell / MAP_WIDTH);
  for (let dz = -2; dz <= 2; dz++) {
    for (let dx = -2; dx <= 2; dx++) {
      if (Math.abs(dx) <= 1 && Math.abs(dz) <= 1) continue;
      const column = centerColumn + dx;
      const row = centerRow + dz;
      if (column < 0 || column >= MAP_WIDTH || row < 0 || row >= MAP_HEIGHT) continue;
      if (cellVisibleToTeam(team, row * MAP_WIDTH + column)) return true;
    }
  }
  return false;
}

function snapshotVisibility(team) {
  if (!mapDefinition.fogOfWar || ![0, 1].includes(team)) return null;
  const packed = Buffer.alloc(Math.ceil(CELL_COUNT / 4));
  const visible = visibleCellsByTeam[team];
  const explored = exploredCellsByTeam[team];
  for (let cell = 0; cell < CELL_COUNT; cell++) {
    const state = visible[cell] ? 2 : explored[cell] ? 1 : 0;
    packed[cell >> 2] |= state << ((cell & 3) * 2);
  }
  return { columns: MAP_WIDTH, rows: MAP_HEIGHT, data: packed.toString('base64') };
}

function snapshotObjectives(viewTeam = null) {
  return mapDefinition.triggers.map((trigger) => {
    const state = triggerStates.get(trigger.id);
    let unitCounts = [...state.unitCounts];
    let progressTeam = state.progressTeam;
    let progress = Math.min(1, state.progress / trigger.captureSeconds);
    if (mapDefinition.fogOfWar && [0, 1].includes(viewTeam)) {
      unitCounts = [0, 0];
      let zoneFullyVisible = true;
      for (let row = trigger.zone.row; row < trigger.zone.row + trigger.zone.height && zoneFullyVisible; row++) {
        for (let column = trigger.zone.column; column < trigger.zone.column + trigger.zone.width; column++) {
          if (!visibleCellsByTeam[viewTeam][row * MAP_WIDTH + column]) {
            zoneFullyVisible = false;
            break;
          }
        }
      }
      for (const unit of units) {
        if (unit.hp <= 0 || unit.team !== viewTeam
          && !cellVisibleToTeam(viewTeam, worldToCell(unit.x, unit.z))) continue;
        const column = Math.floor(unit.x + MAP_HALF_X);
        const row = Math.floor(unit.z + MAP_HALF_Z);
        if (column >= trigger.zone.column && column < trigger.zone.column + trigger.zone.width
          && row >= trigger.zone.row && row < trigger.zone.row + trigger.zone.height) unitCounts[unit.team]++;
      }
      if (!zoneFullyVisible) {
        progressTeam = -1;
        progress = 0;
      }
    }
    const objective = {
      id: state.id, owner: state.owner, progressTeam,
      progress, unitCounts,
      victory: trigger.victory === true,
      requires: trigger.requires ?? null,
      requiredOwner: trigger.requires ? triggerStates.get(trigger.requires)?.owner ?? -1 : -1,
    };
    if (Array.isArray(trigger.requiresAll)) {
      objective.requiresAll = [...trigger.requiresAll];
      objective.requiredOwners = trigger.requiresAll.map((id) => triggerStates.get(id)?.owner ?? -1);
    }
    return objective;
  });
}

function reservedScenarioSpawnCells() {
  const reservedCells = new Set();
  for (const unit of units) {
    if (unit.hp > 0) reservedCells.add(worldToCell(unit.x, unit.z));
  }
  for (const node of mapDefinition.resourceNodes) reservedCells.add(worldToCell(node.x, node.z));
  return reservedCells;
}

function scenarioReinforcementRoster() {
  const alive = aliveCounts();
  const queued = [0, 0];
  for (const building of buildings) queued[building.team] += building.queue;
  for (let team = 0; team < workerProduction.length; team++) {
    queued[team] += workerProduction[team].queue;
  }
  return { alive, queued, totalQueued: queued[0] + queued[1] };
}

function deliverScenarioReinforcements(team, requestedCount, kind, reservedCells, roster) {
  if (requestedCount <= 0) return 0;
  const teamCapacity = Math.max(0, MAX_TEAM_ROSTER - roster.alive[team] - roster.queued[team]);
  const globalCapacity = Math.max(0,
    MAX_UNITS - roster.alive[0] - roster.alive[1] - roster.totalQueued);
  const limit = Math.min(requestedCount, teamCapacity, globalCapacity);
  if (limit <= 0) return 0;

  const base = spawnByTeam[team];
  const baseCell = nearestOpenCell(worldToCell(base.x, base.z));
  const component = walkableComponents[baseCell];
  if (component < 0) return 0;
  let delivered = 0;
  for (let index = 0; index < limit; index++) {
    const spawnCell = findAvailableCellNear(baseCell, component, reservedCells, 12);
    if (spawnCell < 0) break;
    reservedCells.add(spawnCell);
    const spawn = cellToWorld(spawnCell);
    if (!spawnProducedUnit(team, kind, spawn.x, spawn.z)) break;
    delivered++;
    roster.alive[team]++;
  }
  return delivered;
}

function evaluateScenarioTriggers(deltaSeconds) {
  if (matchWinner >= 0) return;
  const completedCaptures = [];
  let timedVictoryAnnouncement = null;
  const ownersAtTickStart = new Map([...triggerStates].map(([id, state]) => [id, state.owner]));
  let reservedCells = null;
  let reinforcementRoster = null;
  for (const trigger of mapDefinition.triggers) {
    const state = triggerStates.get(trigger.id);
    let azureCount = 0;
    let emberCount = 0;
    const { column, row, width, height } = trigger.zone;
    for (const unit of units) {
      if (unit.hp <= 0) continue;
      const unitColumn = Math.floor(unit.x + MAP_HALF_X);
      const unitRow = Math.floor(unit.z + MAP_HALF_Z);
      if (unitColumn < column || unitColumn >= column + width || unitRow < row || unitRow >= row + height) continue;
      if (unit.team === 0) azureCount++;
      else emberCount++;
    }
    const counts = [azureCount, emberCount];
    if (counts[0] !== state.unitCounts[0] || counts[1] !== state.unitCounts[1]) {
      state.unitCounts = counts;
      dirty = true;
    }

    let capturingTeam = -1;
    if (azureCount >= trigger.requiredUnits && azureCount > emberCount) capturingTeam = 0;
    else if (emberCount >= trigger.requiredUnits && emberCount > azureCount) capturingTeam = 1;
    if (capturingTeam >= 0 && capturePrerequisiteIds(trigger)
      .some((prerequisiteId) => ownersAtTickStart.get(prerequisiteId) !== capturingTeam)) capturingTeam = -1;

    if (capturingTeam >= 0 && capturingTeam !== state.owner) {
      if (state.progressTeam !== capturingTeam) {
        state.progressTeam = capturingTeam;
        state.progress = 0;
      }
      state.progress = Math.min(trigger.captureSeconds, state.progress + deltaSeconds);
      dirty = true;
      if (state.progress >= trigger.captureSeconds) {
        state.owner = capturingTeam;
        state.progressTeam = -1;
        state.progress = 0;
        const foodReward = trigger.foodReward ?? 0;
        const woodReward = trigger.woodReward ?? 0;
        if (foodReward > 0) {
          teamFood[capturingTeam] = Math.round((teamFood[capturingTeam] + foodReward) * 1_000_000) / 1_000_000;
          dirty = true;
        }
        if (woodReward > 0) {
          teamWood[capturingTeam] = Math.round((teamWood[capturingTeam] + woodReward) * 1_000_000) / 1_000_000;
          dirty = true;
        }
        const requestedUnitCount = trigger.unitCount ?? 0;
        const unitKind = trigger.unitKind ?? 'infantry';
        let deliveredUnitCount = 0;
        if (requestedUnitCount > 0) {
          reservedCells ??= reservedScenarioSpawnCells();
          reinforcementRoster ??= scenarioReinforcementRoster();
          deliveredUnitCount = deliverScenarioReinforcements(
            capturingTeam, requestedUnitCount, unitKind, reservedCells, reinforcementRoster,
          );
        }
        const teamName = capturingTeam === 0 ? 'AZURE' : 'EMBER';
        const messageTemplate = trigger.message?.trim() ? trigger.message
          : foodReward > 0 && woodReward > 0 ? '{team} SECURED {objective} · {reward} · {wood}'
            : foodReward > 0 ? '{team} SECURED {objective} · {reward}'
              : woodReward > 0 ? '{team} SECURED {objective} · {wood}'
                : '{team} SECURED {objective}';
        let message = messageTemplate
          .replaceAll('{team}', teamName)
          .replaceAll('{objective}', trigger.name)
          .replaceAll('{reward}', `+${foodReward} FOOD`)
          .replaceAll('{wood}', `+${woodReward} WOOD`);
        if (requestedUnitCount > 0) {
          message = message.replaceAll('{units}', String(deliveredUnitCount))
            .replaceAll('{kind}', unitKind.toUpperCase());
          if (!(messageTemplate.includes('{units}') && messageTemplate.includes('{kind}'))) {
            message += ` · ${deliveredUnitCount}/${requestedUnitCount} ${unitKind.toUpperCase()} UNITS DELIVERED`;
          }
        }
        completedCaptures.push({
          triggerId: trigger.id, team: capturingTeam, previousOwner: ownersAtTickStart.get(trigger.id),
          message, victory: trigger.victory === true,
        });
      }
    } else if (state.progressTeam !== -1 || state.progress !== 0) {
      state.progressTeam = -1;
      state.progress = 0;
      dirty = true;
    }
  }

  for (const capture of completedCaptures) {
    for (const event of mapDefinition.scenarioEvents) {
      if (event.trigger?.type !== 'capture' || event.trigger.objectiveId !== capture.triggerId) continue;
      if (event.trigger.occurrence === 'recapture' && capture.previousOwner < 0) continue;
      const state = scenarioEventStates.get(event.id);
      if (!state || state.fired || state.activatedAtSeconds !== null) continue;
      state.activatedAtSeconds = matchElapsedSeconds;
      state.triggeredByTeam = capture.team;
      if (event.repeatCount !== undefined) {
        state.nextFireAtSeconds = matchElapsedSeconds + event.afterSeconds;
      }
      dirty = true;
    }
  }

  const victoryCaptures = completedCaptures.filter((capture) => capture.victory);
  const victoryTriggers = mapDefinition.triggers.filter((trigger) => trigger.victory === true);
  const victoryHoldSeconds = mapDefinition.victoryHoldSeconds ?? 0;
  const usesVictoryHold = victoryHoldSeconds > 0 && victoryTriggers.length > 0;
  let winningTeam = -1;
  let winningTriggerId = null;
  let controlHoldAnnouncement = null;
  if (usesVictoryHold) {
    const completedTeams = [];
    for (const team of [0, 1]) {
      const controlsVictoryCondition = mapDefinition.victoryMode === 'all'
        ? victoryTriggers.every((trigger) => triggerStates.get(trigger.id)?.owner === team)
        : victoryTriggers.some((trigger) => triggerStates.get(trigger.id)?.owner === team);
      if (!controlsVictoryCondition) {
        if (victoryHoldState.activeTeams[team] || victoryHoldState.progressSeconds[team] > 0
          || victoryHoldState.triggerIds[team] !== null) {
          victoryHoldState.activeTeams[team] = false;
          victoryHoldState.progressSeconds[team] = 0;
          victoryHoldState.triggerIds[team] = null;
          dirty = true;
        }
      } else if (!victoryHoldState.activeTeams[team]) {
        victoryHoldState.activeTeams[team] = true;
        victoryHoldState.progressSeconds[team] = 0;
        victoryHoldState.triggerIds[team] = [...victoryCaptures].reverse()
          .find((capture) => capture.team === team)?.triggerId
          ?? (mapDefinition.victoryMode === 'any'
            ? victoryTriggers.find((trigger) => triggerStates.get(trigger.id)?.owner === team)?.id ?? null
            : null);
        dirty = true;
      } else if (scenarioClockStarted) {
        const previousProgress = victoryHoldState.progressSeconds[team];
        // The second seat can start the clock partway through this evaluation
        // interval, including after recovering a pre-start hold from disk.
        const elapsedHoldSeconds = Math.min(deltaSeconds, matchElapsedSeconds);
        victoryHoldState.progressSeconds[team] = Math.min(victoryHoldSeconds,
          previousProgress + elapsedHoldSeconds);
        if (victoryHoldState.progressSeconds[team] !== previousProgress) dirty = true;
        if (victoryHoldState.progressSeconds[team] >= victoryHoldSeconds) completedTeams.push(team);
      }
    }
    if (completedTeams.length > 0) {
      winningTeam = completedTeams.length === 1 ? completedTeams[0] : 2;
      if (winningTeam < 2) {
        winningTriggerId = victoryHoldState.triggerIds[winningTeam]
          ?? (mapDefinition.victoryMode === 'any'
            ? victoryTriggers.find((trigger) => triggerStates.get(trigger.id)?.owner === winningTeam)?.id ?? null
            : null);
        const winnerName = winningTeam === 0 ? 'AZURE' : 'EMBER';
        const heldRule = mapDefinition.victoryMode === 'all' ? 'ALL VICTORY ZONES' : 'A VICTORY ZONE';
        controlHoldAnnouncement = `${winnerName} WINS · HELD ${heldRule} FOR ${Math.ceil(victoryHoldSeconds)}S`;
      } else {
        controlHoldAnnouncement = 'DRAW · BOTH TEAMS COMPLETED THE VICTORY HOLD';
      }
      matchWinner = winningTeam;
      matchWinnerTriggerId = winningTriggerId;
      matchWinnerReason = 'capture-hold';
      dirty = true;
    }
  } else if (victoryCaptures.length > 0) {
    if (mapDefinition.victoryMode === 'all') {
      const teamsHoldingAll = [0, 1].filter((team) => victoryTriggers.every(
        (trigger) => triggerStates.get(trigger.id)?.owner === team,
      ));
      if (teamsHoldingAll.length === 1) {
        winningTeam = teamsHoldingAll[0];
        winningTriggerId = [...victoryCaptures].reverse()
          .find((capture) => capture.team === winningTeam)?.triggerId ?? null;
      }
    } else {
      const capturingTeams = new Set(victoryCaptures.map((capture) => capture.team));
      // Opposing wins completed on the same tick are simultaneous, so neither team wins yet.
      if (capturingTeams.size === 1) {
        winningTeam = victoryCaptures[0].team;
        winningTriggerId = victoryCaptures.find((capture) => capture.team === winningTeam).triggerId;
      }
    }
  }

  if (winningTeam >= 0 && !usesVictoryHold) {
    matchWinner = winningTeam;
    matchWinnerTriggerId = winningTriggerId;
    matchWinnerReason = 'capture';
    dirty = true;
  } else if (!mapDefinition.triggers.some((trigger) => trigger.victory === true)) {
    const alive = aliveCounts();
    if (alive[0] === 0 || alive[1] === 0) {
      const azureCanRecover = canTeamStillFieldUnits(0, alive);
      const emberCanRecover = canTeamStillFieldUnits(1, alive);
      if (azureCanRecover !== emberCanRecover) {
        matchWinner = azureCanRecover ? 0 : 1;
        matchWinnerReason = 'elimination';
        dirty = true;
        const winnerName = matchWinner === 0 ? 'AZURE' : 'EMBER';
        const loserName = matchWinner === 0 ? 'EMBER' : 'AZURE';
        broadcast({ type: 'victory', team: matchWinner, reason: 'elimination',
          message: `${winnerName} WINS · ${loserName} ELIMINATED` });
      } else if (!azureCanRecover && !emberCanRecover) {
        matchWinner = 2;
        matchWinnerReason = 'elimination';
        dirty = true;
        broadcast({ type: 'victory', team: 2, reason: 'elimination',
          message: 'DRAW · BOTH ARMIES ELIMINATED' });
      }
    }
  }
  if (matchWinner < 0 && scenarioClockStarted) {
    for (const event of mapDefinition.scenarioEvents) {
      const state = scenarioEventStates.get(event.id);
      const activationTriggered = ['capture', 'event', 'region-entry', 'construction-complete', 'research-complete'].includes(event.trigger?.type);
      if (state && event.trigger?.type === 'region-entry' && state.activatedAtSeconds === null) {
        const enteringTeam = regionEntryTeam(event.trigger, mapDefinition.regions, units, MAP_WIDTH, MAP_HEIGHT);
        if (enteringTeam >= 0) {
          state.activatedAtSeconds = matchElapsedSeconds;
          state.triggeredByTeam = enteringTeam;
          if (event.repeatCount !== undefined) state.nextFireAtSeconds = matchElapsedSeconds + event.afterSeconds;
          dirty = true;
        }
      }
      if (state && validCompletionTrigger(event.trigger) && state.activatedAtSeconds === null) {
        const team = completionTeam(event.trigger, allMatchBuildings(), teamUpgrades);
        if (team >= 0) {
          state.activatedAtSeconds = matchElapsedSeconds;
          state.triggeredByTeam = team;
          if (event.repeatCount !== undefined) state.nextFireAtSeconds = matchElapsedSeconds + event.afterSeconds;
          dirty = true;
        }
      }
      const repeating = event.repeatCount !== undefined;
      if (!state || state.fired
        || (activationTriggered && state.activatedAtSeconds === null)) continue;
      const dueAtSeconds = repeating ? state.nextFireAtSeconds
        : activationTriggered ? state.activatedAtSeconds + event.afterSeconds : event.afterSeconds;
      if (!Number.isFinite(dueAtSeconds)) continue;
      if (matchElapsedSeconds < dueAtSeconds) continue;
      const teams = event.team === 'both' ? [0, 1]
        : event.team === 'capturing' ? [state.triggeredByTeam] : [Number(event.team)];
      const woodReward = event.woodReward ?? 0;
      const technologyRules = event.technologyReward ? researchRulesFor(event.technologyReward) : null;
      for (const team of teams) {
        teamFood[team] = Math.round((teamFood[team] + event.foodReward) * 1_000_000) / 1_000_000;
        if (woodReward > 0) {
          teamWood[team] = Math.round((teamWood[team] + woodReward) * 1_000_000) / 1_000_000;
        }
        if (technologyRules) {
          if (teamResearch[team]?.type === event.technologyReward) teamResearch[team] = null;
          if (!teamUpgrades[team][technologyRules.upgradeKey]) {
            teamUpgrades[team][technologyRules.upgradeKey] = true;
          }
        }
      }
      const requestedUnitCount = event.unitCount ?? 0;
      const unitKind = event.unitKind ?? 'infantry';
      if (requestedUnitCount > 0) {
        reservedCells ??= reservedScenarioSpawnCells();
        reinforcementRoster ??= scenarioReinforcementRoster();
      }
      const deliveredByTeam = [0, 0];
      if (requestedUnitCount > 0) {
        for (const team of teams) {
          deliveredByTeam[team] = deliverScenarioReinforcements(
            team, requestedUnitCount, unitKind, reservedCells, reinforcementRoster,
          );
        }
      }
      const deliveredUnitCount = deliveredByTeam[0] + deliveredByTeam[1];
      const requestedTotal = requestedUnitCount * teams.length;
      const teamLabel = event.team === 'both' ? 'BOTH TEAMS'
        : teams[0] === 0 ? 'AZURE' : 'EMBER';
      const hasOtherReward = event.foodReward > 0 || woodReward > 0 || requestedUnitCount > 0;
      const messageTemplate = event.message?.trim()
        || (technologyRules && !hasOtherReward
          ? `${event.name} · {technology} TO {team}`
          : event.foodReward > 0 && woodReward > 0
          ? `${event.name} · +{reward} FOOD · +{wood} WOOD TO {team}`
          : event.foodReward > 0
            ? `${event.name} · +{reward} FOOD TO {team}`
            : woodReward > 0 ? `${event.name} · +{wood} WOOD TO {team}` : `${event.name} · {team}`);
      let message = messageTemplate
        .replaceAll('{team}', teamLabel)
        .replaceAll('{event}', event.name)
        .replaceAll('{reward}', String(event.foodReward))
        .replaceAll('{wood}', String(woodReward))
        .replaceAll('{units}', String(deliveredUnitCount))
        .replaceAll('{kind}', unitKind.toUpperCase())
        .replaceAll('{technology}', technologyRules?.label || '');
      if (requestedUnitCount > 0
        && !(messageTemplate.includes('{units}') && messageTemplate.includes('{kind}'))) {
        message += ` · ${deliveredUnitCount}/${requestedTotal} ${unitKind.toUpperCase()} UNITS DELIVERED`;
      }
      if (technologyRules && !messageTemplate.includes('{technology}')) {
        message += ` · ${technologyRules.label} AWARDED`;
      }
      broadcast({
        type: 'scenarioEvent', eventId: event.id, team: event.team, message,
        rewardTeams: teams, deliveredUnitCount, unitKind, technologyReward: event.technologyReward ?? null,
      });
      if (repeating) {
        state.fireCount++;
        state.fired = state.fireCount >= event.repeatCount + 1;
        state.nextFireAtSeconds = state.fired ? null : matchElapsedSeconds + event.repeatEverySeconds;
      } else {
        state.fired = true;
      }
      dirty = true;
    }
    for (const event of mapDefinition.scenarioEvents) {
      if (event.trigger?.type !== 'event') continue;
      const state = scenarioEventStates.get(event.id);
      const sourceStates = scenarioEventSourceIds(event.trigger)
        .map((sourceId) => scenarioEventStates.get(sourceId));
      if (!state || state.activatedAtSeconds !== null
        || sourceStates.length === 0 || sourceStates.some((sourceState) => !sourceState?.fired)) continue;
      state.activatedAtSeconds = matchElapsedSeconds;
      const sourceTeams = sourceStates.map((sourceState) => sourceState.triggeredByTeam ?? -1);
      state.triggeredByTeam = sourceTeams.every((team) => team === sourceTeams[0]) ? sourceTeams[0] : -1;
      if (event.repeatCount !== undefined) {
        state.nextFireAtSeconds = matchElapsedSeconds + event.afterSeconds;
      }
      dirty = true;
    }
  }
  const timedVictory = mapDefinition.timedVictory;
  if (matchWinner < 0 && scenarioClockStarted && timedVictory
    && matchElapsedSeconds >= timedVictory.afterSeconds) {
    const objective = mapDefinition.triggers.find((trigger) => trigger.id === timedVictory.objectiveId);
    const owner = triggerStates.get(timedVictory.objectiveId)?.owner ?? -1;
    matchWinner = owner >= 0 ? owner : 2;
    matchWinnerTriggerId = timedVictory.objectiveId;
    matchWinnerReason = 'timed-control';
    const totalSeconds = Math.ceil(timedVictory.afterSeconds);
    const timeMinutes = Math.floor(totalSeconds / 60);
    const timeSeconds = totalSeconds % 60;
    const timeLabel = `${timeMinutes}:${String(timeSeconds).padStart(2, '0')}`;
    timedVictoryAnnouncement = owner >= 0
      ? `${owner === 0 ? 'AZURE' : 'EMBER'} WINS · CONTROLLED ${objective.name.toUpperCase()} AT ${timeLabel}`
      : `DRAW · ${objective.name.toUpperCase()} UNCLAIMED AT ${timeLabel}`;
    dirty = true;
  }
  for (const capture of completedCaptures) {
    if (!usesVictoryHold && capture.team === winningTeam && capture.triggerId === winningTriggerId) {
      broadcast({ type: 'victory', triggerId: capture.triggerId, team: capture.team,
        reason: 'capture', message: capture.message });
    } else {
      broadcast({ type: 'trigger', triggerId: capture.triggerId, team: capture.team, message: capture.message });
    }
  }
  if (controlHoldAnnouncement) {
    broadcast({ type: 'victory', triggerId: winningTriggerId, team: winningTeam,
      reason: 'capture-hold', message: controlHoldAnnouncement });
  }
  if (timedVictoryAnnouncement) {
    broadcast({ type: 'victory', triggerId: timedVictory.objectiveId, team: matchWinner,
      reason: 'timed-control', message: timedVictoryAnnouncement });
  }
}

function connectedCount() {
  let count = 0;
  for (const peer of peers) if (peer.team !== null && !peer.closed) count++;
  return count + (pveOpponentActive ? 1 : 0);
}

function activatePveOpponent() {
  if (!pveLaunchOptions || pveOpponentActive) return;
  pveOpponentActive = true;
  resetPvePolicy();
}

function scenarioDiagnosticTrace() {
  return mapDefinition.scenarioEvents.map(event => {
    const state = scenarioEventStates.get(event.id);
    const deliveries = state?.fireCount ?? (state?.fired ? 1 : 0);
    const armed = event.trigger ? state?.activatedAtSeconds !== null : scenarioClockStarted;
    return {id: event.id, name: event.name,
      status: state?.fired ? 'completed' : deliveries > 0 ? 'delivered' : armed ? 'armed' : 'waiting',
      deliveries, reason: event.trigger ? {...event.trigger} : {type: 'clock'},
      activatedAtSeconds: state?.activatedAtSeconds ?? null, activatedByTeam: state?.triggeredByTeam ?? -1,
      recipients: event.team === 'both' ? [0, 1] : event.team === 'capturing' ? [state?.triggeredByTeam ?? -1] : [Number(event.team)]};
  });
}
function roomPayload(viewTeam = null, includeWaypointCounts = true) {
  const actualAlive = aliveCounts();
  const productionContexts = [0, 1].map((team) => productionContextForTeam(team, actualAlive));
  const fogView = mapDefinition.fogOfWar && [0, 1].includes(viewTeam);
  const alive = [...actualAlive];
  if (fogView) alive[1 - viewTeam] = null;
  const buildingAttackers = new Map();
  for (const unit of units) {
    if (unit.hp <= 0 || unit.attackBuildingTargetId < 0
      || (fogView && unit.team !== viewTeam)) continue;
    buildingAttackers.set(unit.attackBuildingTargetId,
      (buildingAttackers.get(unit.attackBuildingTargetId) || 0) + 1);
  }
  const viewBuildings = buildings.filter((building) => !fogView || buildingVisibleToTeam(viewTeam, building));
  const resourceNodes = mapDefinition.resourceNodes.filter((node) => !fogView
    || cellVisibleToTeam(viewTeam, worldToCell(node.x, node.z)));
  return {
    ...(viewTeam === 0 ? {scenarioTrace: scenarioDiagnosticTrace()} : {}),
    type: 'state', rulesetRevision: GAMEPLAY_RULESET_REVISION, factionId: DEFAULT_FACTION_ID, unitWireIds: UNIT_WIRE_IDS, tick: tickNumber, armySize: currentArmySize,
    matchElapsedSeconds: Number(matchElapsedSeconds.toFixed(1)), scenarioClockStarted,
    victoryHold: (mapDefinition.victoryHoldSeconds ?? 0) > 0 ? {
      durationSeconds: mapDefinition.victoryHoldSeconds,
      activeTeams: [...victoryHoldState.activeTeams],
      progressSeconds: victoryHoldState.progressSeconds.map((seconds) => Number(seconds.toFixed(2))),
    } : null,
    scenarioEvents: [...scenarioEventStates.values()].map((state) => {
      const event = mapDefinition.scenarioEvents.find((item) => item.id === state.id);
      const repeatState = event?.repeatCount === undefined ? {} : {
        fireCount: state.fireCount, nextFireAtSeconds: state.nextFireAtSeconds,
      };
      return ['capture', 'event', 'region-entry', 'construction-complete', 'research-complete'].includes(event?.trigger?.type)
        ? {
          id: state.id, fired: state.fired,
          ...repeatState,
          activatedAtSeconds: state.activatedAtSeconds,
          triggeredByTeam: state.triggeredByTeam,
        }
        : { id: state.id, fired: state.fired, ...repeatState };
    }),
    population: [0, 1].map((team) => viewTeam === null || team === viewTeam ? productionContexts[team].population : null),
    rosterSize: fogView ? actualAlive[viewTeam] : actualAlive[0] + actualAlive[1],
    mapId: mapDefinition.id, connected: connectedCount(), alive, winner: matchWinner,
    winnerTriggerId: matchWinnerTriggerId, winnerReason: matchWinnerReason,
    fogOfWar: mapDefinition.fogOfWar,
    visibility: fogView ? snapshotVisibility(viewTeam) : null,
    persistentOrders: snapshotPersistentOrders(viewTeam),
    units: snapshotUnits(fogView ? viewTeam : null), objectives: snapshotObjectives(fogView ? viewTeam : null),
    ...(includeWaypointCounts ? { queuedWaypointCounts: snapshotQueuedWaypointCounts(viewTeam) } : {}),
    food: fogView ? teamFood.map((amount, team) => team === viewTeam ? amount : null) : [...teamFood],
    wood: fogView ? teamWood.map((amount, team) => team === viewTeam ? amount : null) : [...teamWood],
    teamResearch: teamUpgrades.map((upgrades, team) => {
      if (fogView && team !== viewTeam) return null;
      const active = teamResearch[team];
      const rules = active ? researchRulesFor(active.type) : null;
      return {
        ...upgrades,
        active: active && rules ? {
          type: active.type, buildingId: active.buildingId, remaining: active.remaining,
          progress: Math.max(0, Math.min(1, 1 - active.remaining / rules.durationSeconds)),
        } : null,
      };
    }),
    workerProduction: workerProduction.map((production, team) => {
      if (fogView && team !== viewTeam) return null;
      return {
        team,
        queue: production.queue,
        trainingRemaining: production.trainingRemaining,
        productionBlocked: production.productionBlocked,
        trainingProgress: production.queue > 0
          ? Math.max(0, Math.min(1, 1 - production.trainingRemaining / WORKER_TRAIN_SECONDS)) : 0,
      };
    }),
    homeTownCenters: homeTownCenters.filter((center) => center.hp > 0 && (!fogView || buildingVisibleToTeam(viewTeam, center))).map((center) => ({
      id: center.id, team: center.team, type: center.type, home: true, x: center.x, z: center.z, hp: center.hp, maxHp: BUILDING_DEFINITIONS[center.type].maxHp,
      footprint: [...center.footprint], complete: true, progress: 1, queue: center.queue, trainingRemaining: center.trainingRemaining,
      productionBlocked: center.productionBlocked, rallyCell: !fogView || center.team === viewTeam ? center.rallyCell : -1,
      productionQueue: viewTeam === null || center.team === viewTeam ? center.productionQueue : [],
      researchOptions: viewTeam === null || center.team === viewTeam ? researchOptions(center, researchContextForTeam(center.team)) : [],
      productionOptions: viewTeam === null || center.team === viewTeam ? [productionAction(center, 'worker', productionContexts[center.team])] : [],
      trainingProgress: center.queue ? Math.max(0, Math.min(1, 1 - center.trainingRemaining / WORKER_TRAIN_SECONDS)) : 0,
      attackers: buildingAttackers.get(center.id) || 0,
    })),
    buildings: viewBuildings.map((building) => ({
      id: building.id, team: building.team, type: building.type,
      x: building.x, z: building.z, hp: building.hp, maxHp: BUILDING_DEFINITIONS[building.type].maxHp,
      attackers: buildingAttackers.get(building.id) || 0,
      lastAttackTick: building.lastAttackTick ?? -1,
      lastAttackX: !fogView || building.team === viewTeam ? building.lastAttackX ?? building.x : null,
      lastAttackZ: !fogView || building.team === viewTeam ? building.lastAttackZ ?? building.z : null,
      progress: building.progress,
      complete: building.complete, queue: building.queue,
      researchOptions: viewTeam === null || building.team === viewTeam ? researchOptions(building, researchContextForTeam(building.team)) : [],
      productionOptions: viewTeam === null || building.team === viewTeam
        ? BUILDING_DEFINITIONS[building.type].products.map((kind) => productionAction(building, kind, productionContexts[building.team])) : [],
      productionQueue: viewTeam === null || building.team === viewTeam ? [...building.productionQueue] : [],
      rallyCell: !fogView || building.team === viewTeam ? building.rallyCell : -1,
      trainingRemaining: building.trainingRemaining,
      productionBlocked: building.productionBlocked === true,
      trainingProgress: building.queue > 0
        ? Math.max(0, Math.min(1,
          1 - building.trainingRemaining / UNIT_DEFINITIONS[building.productionQueue[0]].trainSeconds)) : 0,
    })),
    resourceNodes: resourceNodes.map(({ id, type }) => ({
      id, type, stock: resourceNodeStates.get(id)?.stock ?? 0,
    })),
    forestEpoch,
    forestStocks: forestStockEntries(fogView ? viewTeam : null),
  };
}

function matchMapHash(definition) {
  return createHash('sha256').update(JSON.stringify(definition)).digest('base64url');
}

function captureMatchCheckpoint(sequence, savedAt = Date.now()) {
  const savedSessions = [];
  for (const session of sessions.values()) {
    const connected = Boolean(session.peer && !session.peer.closed);
    if (!connected && session.expiresAt <= savedAt) continue;
    savedSessions.push({
      tokenHash: session.tokenHash,
      team: session.team,
      id: session.id,
      expiresAt: connected ? savedAt + RECOVERY_SESSION_GRACE_MS : session.expiresAt,
      connected,
    });
  }
  return {
    schemaVersion: MATCH_CHECKPOINT_SCHEMA_VERSION,
    rulesVersion: MATCH_RULES_VERSION,
    rulesetRevision: GAMEPLAY_RULESET_REVISION,
    factionId: DEFAULT_FACTION_ID,
    sequence,
    savedAt,
    matchId,
    mapDefinition,
    mapHash: matchMapHash(mapDefinition),
    state: {
      tickNumber,
      currentArmySize,
    units: units.map((unit) => ({
      ...unit,
      persistentOrder: unit.persistentOrder ? { ...unit.persistentOrder } : null,
      path: [...unit.path],
      attackMoveResumePath: unit.attackMoveResumePath === null
        ? null : [...unit.attackMoveResumePath],
      queuedWaypoints: unit.queuedWaypoints.map((waypoint) => ({ ...waypoint })),
      })),
      unitGenerationCounters: Array.from(unitGenerationCounters),
      teamFood: [...teamFood],
      teamWood: [...teamWood],
      teamUpgrades: teamUpgrades.map((upgrades) => ({ ...upgrades })),
      teamResearch: teamResearch.map((research) => research ? { ...research } : null),
      workerProduction: workerProduction.map((production) => ({ ...production })),
      buildings: buildings.map((building) => ({ ...building, productionQueue: [...building.productionQueue], footprint: [...building.footprint] })),
      nextBuildingId,
      homeTownCenters: homeTownCenters.map((center) => ({ hp: center.hp, rallyCell: center.rallyCell })),
      resourceNodes: [...resourceNodeStates.values()].map((node) => ({ ...node })),
      forestStocks: forestStockEntries(),
      forestEpoch,
      triggerStates: [...triggerStates.values()].map((state) => ({ ...state, unitCounts: [...state.unitCounts] })),
      scenarioEventStates: [...scenarioEventStates.values()].map((state) => ({ ...state })),
      matchElapsedSeconds,
      scenarioClockStarted,
      victoryHoldState: {
        activeTeams: [...victoryHoldState.activeTeams],
        progressSeconds: [...victoryHoldState.progressSeconds],
        triggerIds: [...victoryHoldState.triggerIds],
      },
      matchWinner,
      matchWinnerTriggerId,
      matchWinnerReason,
      explored: exploredCellsByTeam.map((cells) => Buffer.from(cells).toString('base64')),
      nextPlayerId,
      seatSessions: savedSessions,
      navigationRevision,
      nextMoveOrderId,
    },
  };
}

function assertSnapshot(condition, message) {
  if (!condition) throw new Error(`Invalid match checkpoint: ${message}`);
}

function validCellPath(value, cellCount) {
  return Array.isArray(value) && value.length <= cellCount
    && value.every((cell) => Number.isInteger(cell) && cell >= 0 && cell < cellCount);
}

function validateMatchCheckpoint(snapshot) {
  assertSnapshot(snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot), 'expected an object');
  assertSnapshot(snapshot.schemaVersion === MATCH_CHECKPOINT_SCHEMA_VERSION, 'unsupported schema version');
  assertSnapshot(snapshot.rulesetRevision === GAMEPLAY_RULESET_REVISION, 'gameplay ruleset revision mismatch');
  assertSnapshot(snapshot.factionId === DEFAULT_FACTION_ID, 'unsupported faction');
  assertSnapshot([1, 2, 3, 4, MATCH_RULES_VERSION].includes(snapshot.rulesVersion),
    'unsupported game rules version');
  assertSnapshot(Number.isSafeInteger(snapshot.sequence) && snapshot.sequence >= 1, 'invalid sequence');
  assertSnapshot(Number.isFinite(snapshot.savedAt) && snapshot.savedAt > 0, 'invalid save time');
  assertSnapshot(typeof snapshot.matchId === 'string' && /^[A-Za-z0-9_-]{22}$/.test(snapshot.matchId), 'invalid match identity');
  const definition = validateMapDefinition(snapshot.mapDefinition, 'match checkpoint');
  assertSnapshot(snapshot.rulesVersion === MATCH_RULES_VERSION
    || !definition.elevationPatches?.some((patch) => patch.level > 0),
  'elevated map requires current game rules');
  assertSnapshot(snapshot.mapHash === matchMapHash(definition), 'map checksum mismatch');
  assertSnapshot(typeof snapshot.state === 'object' && snapshot.state !== null, 'missing simulation state');
  const state = snapshot.state;
  const cellCount = definition.width * definition.height;
  const finite = (value) => Number.isFinite(value);
  const integerIn = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;
  const checkpointForestMask = forestCellsForDefinition(definition);
  assertSnapshot(Array.isArray(state.forestStocks), 'invalid forest stock table');
  assertSnapshot(integerIn(state.forestEpoch, 0, Number.MAX_SAFE_INTEGER), 'invalid forest epoch');
  const savedForestStocks = new Map();
  let previousForestCell = -1;
  for (const row of state.forestStocks) {
    const [cell, stock] = Array.isArray(row) ? row : [];
    assertSnapshot(Array.isArray(row) && row.length === 2
      && integerIn(cell, 0, cellCount - 1) && cell > previousForestCell
      && checkpointForestMask[cell] === 1 && finite(stock)
      && stock >= 0 && stock < FOREST_WOOD_PER_CELL,
    'invalid forest stock entry');
    savedForestStocks.set(cell, stock);
    previousForestCell = cell;
  }
  assertSnapshot(integerIn(state.tickNumber, 0, Number.MAX_SAFE_INTEGER), 'invalid tick');
  assertSnapshot(integerIn(state.currentArmySize, 2, MAX_UNITS) && state.currentArmySize % 2 === 0, 'invalid army size');
  assertSnapshot(Array.isArray(state.units) && state.units.length <= MAX_UNITS, 'invalid unit table');
  assertSnapshot(Array.isArray(state.unitGenerationCounters)
    && state.unitGenerationCounters.length === MAX_UNITS
    && state.unitGenerationCounters.every((value) => integerIn(value, 0, 0xffffffff)), 'invalid unit generation table');
  const allowedKinds = new Set(Object.keys(UNIT_DEFINITIONS));
  for (let index = 0; index < state.units.length; index++) {
    const unit = state.units[index];
    assertSnapshot(unit && typeof unit === 'object' && unit.id === index, `invalid unit ${index}`);
    assertSnapshot(integerIn(unit.team, 0, 1) && integerIn(unit.generation, 1, 0xffffffff)
      && finite(unit.x) && finite(unit.z) && Math.abs(unit.x) < definition.width / 2
      && Math.abs(unit.z) < definition.height / 2 && finite(unit.hp) && unit.hp >= 0
      && allowedKinds.has(unit.kind) && unit.hp <= UNIT_DEFINITIONS[unit.kind].combat.maxHp, `invalid unit attributes ${index}`);
    assertSnapshot(validCellPath(unit.path, cellCount)
      && integerIn(unit.pathIndex, 0, unit.path.length)
      && (unit.attackMoveResumePath === null || validCellPath(unit.attackMoveResumePath, cellCount))
      && integerIn(unit.attackMoveResumePathIndex, 0, unit.attackMoveResumePath?.length ?? 0)
      && Array.isArray(unit.queuedWaypoints) && unit.queuedWaypoints.length <= MAX_QUEUED_WAYPOINTS
      && unit.queuedWaypoints.every((waypoint) => waypoint && integerIn(waypoint.destination, 0, cellCount - 1)
        && typeof waypoint.attackMove === 'boolean'), `invalid unit route ${index}`);
    assertSnapshot(integerIn(unit.attackTargetId, -1, state.units.length - 1)
      && integerIn(unit.attackBuildingTargetId, -1, Number.MAX_SAFE_INTEGER)
      && finite(unit.attackCooldown) && finite(unit.repathTimer)
      && integerIn(unit.lastAttackCell, -1, cellCount - 1)
      && (unit.lastAttackTick === undefined || integerIn(unit.lastAttackTick, -1, state.tickNumber))
      && (unit.lastAttackX === undefined || finite(unit.lastAttackX))
      && (unit.lastAttackZ === undefined || finite(unit.lastAttackZ))
      && integerIn(unit.orderRevision, 0, Number.MAX_SAFE_INTEGER), `invalid unit combat state ${index}`);
    const persistent = unit.persistentOrder;
    assertSnapshot(persistent === undefined || persistent === null || (
      ['patrol', 'follow'].includes(persistent.type)
      && ['active', 'blocked', 'following'].includes(persistent.status)
      && integerIn(persistent.nextTick, 0, Number.MAX_SAFE_INTEGER)
      && (persistent.type === 'patrol'
        ? integerIn(persistent.start, 0, cellCount - 1) && integerIn(persistent.end, 0, cellCount - 1)
          && [0, 1].includes(persistent.leg)
        : integerIn(persistent.targetId, 0, state.units.length - 1)
          && integerIn(persistent.targetGeneration, 1, 0xffffffff)
          && integerIn(persistent.lastTargetCell, -1, cellCount - 1))), `invalid persistent order ${index}`);
    assertSnapshot((unit.holdingPosition === undefined || typeof unit.holdingPosition === 'boolean')
      && typeof unit.attackMove === 'boolean' && typeof unit.attackMoveRouteReady === 'boolean'
      && typeof unit.movePlanningPending === 'boolean'
      && finite(unit.attackMoveAnchorX) && finite(unit.attackMoveAnchorZ)
      && integerIn(unit.attackMoveScanTick, 0, Number.MAX_SAFE_INTEGER)
      && integerIn(unit.attackMoveBucketScanOffset, 0, targetBucketCapacity - 1), `invalid unit order state ${index}`);
    assertSnapshot(finite(unit.cargo) && unit.cargo >= 0 && unit.cargo <= WORKER_CARRY_CAPACITY
      && (unit.cargoType === null || ['food', 'wood'].includes(unit.cargoType))
      && (unit.gatherNodeId === null || typeof unit.gatherNodeId === 'string')
      && (unit.gatherForestCell === undefined || integerIn(unit.gatherForestCell, -1, cellCount - 1))
      && (unit.dropoffBuildingId === undefined || unit.dropoffBuildingId === null || integerIn(unit.dropoffBuildingId, 1, Number.MAX_SAFE_INTEGER))
      && (unit.dropoffNavigationRevision === undefined || integerIn(unit.dropoffNavigationRevision, -1, Number.MAX_SAFE_INTEGER))
      && ['', 'to-node', 'gathering', 'to-base'].includes(unit.gatherPhase)
      && (unit.repairing === undefined || typeof unit.repairing === 'boolean')
      && (unit.buildingTargetId === null || integerIn(unit.buildingTargetId, 1, Number.MAX_SAFE_INTEGER))
      && integerIn(unit.moveGoalCell, -1, cellCount - 1), `invalid unit work state ${index}`);
    if (unit.lastMoveTick !== undefined) {
      assertSnapshot(integerIn(unit.lastMoveTick, 0, state.tickNumber), `invalid movement tick ${index}`);
    }
  }
  assertSnapshot(Array.isArray(state.teamFood) && state.teamFood.length === 2
    && state.teamFood.every((value) => finite(value) && value >= 0)
    && Array.isArray(state.teamWood) && state.teamWood.length === 2
    && state.teamWood.every((value) => finite(value) && value >= 0), 'invalid team economy');
  assertSnapshot(Array.isArray(state.teamUpgrades) && state.teamUpgrades.length === 2
    && Array.isArray(state.teamResearch) && state.teamResearch.length === 2,
  'invalid team research');
  for (let team = 0; team < 2; team++) {
    const upgrades = state.teamUpgrades[team];
    const research = state.teamResearch[team];
    assertSnapshot(upgrades && typeof upgrades === 'object' && !Array.isArray(upgrades)
      && Object.keys(upgrades).every((key) => Object.values(TECHNOLOGY_DEFINITIONS).some(technology => technology.upgradeKey === key))
      && Object.values(TECHNOLOGY_DEFINITIONS).every(technology => typeof upgrades[technology.upgradeKey] === 'boolean'),
    `invalid team ${team} upgrades`);
    if (research === null) continue;
    const rules = researchRulesFor(research?.type);
    assertSnapshot(research && typeof research === 'object' && !Array.isArray(research)
      && Object.keys(research).every((key) => ['type', 'buildingId', 'remaining'].includes(key))
      && rules && integerIn(research.buildingId, 1, Number.MAX_SAFE_INTEGER)
      && finite(research.remaining) && research.remaining > 0
      && research.remaining <= rules.durationSeconds
      && upgrades[rules.upgradeKey] === false, `invalid team ${team} research progress`);
  }
  assertSnapshot(Array.isArray(state.workerProduction) && state.workerProduction.length === 2,
    'invalid Town Center production');
  for (const production of state.workerProduction) {
    assertSnapshot(production && integerIn(production.queue, 0, MAX_BUILDING_QUEUE)
      && finite(production.trainingRemaining) && production.trainingRemaining >= 0
      && production.trainingRemaining <= WORKER_TRAIN_SECONDS
      && typeof production.productionBlocked === 'boolean'
      && (production.queue > 0 || (production.trainingRemaining === 0 && !production.productionBlocked))
      && (production.queue === 0 || production.trainingRemaining > 0 || production.productionBlocked),
    'invalid Town Center production state');
  }
  assertSnapshot(Array.isArray(state.homeTownCenters) && state.homeTownCenters.length === 2
    && state.homeTownCenters.every((center) => finite(center.hp) && center.hp >= 0 && center.hp <= BUILDING_DEFINITIONS['town-center'].maxHp
      && integerIn(center.rallyCell, -1, cellCount - 1)), 'invalid home Town Centers');
  for (const team of [0, 1]) assertSnapshot(state.homeTownCenters[team].hp > 0 || state.workerProduction[team].queue === 0, 'destroyed home Town Center retains a queue');
  assertSnapshot(Array.isArray(state.buildings) && state.buildings.length <= MAX_BUILDINGS, 'invalid buildings');
  const buildingIds = new Set();
  const occupiedFootprintCells = new Set();
  const staticBlocked = new Uint8Array(cellCount);
  for (const obstacle of definition.obstacles) {
    for (let row = obstacle.row; row < obstacle.row + obstacle.height; row++) {
      for (let column = obstacle.column; column < obstacle.column + obstacle.width; column++) {
        const cell = row * definition.width + column;
        if (!checkpointForestMask[cell]
          || (savedForestStocks.get(cell) ?? FOREST_WOOD_PER_CELL) > 0) staticBlocked[cell] = 1;
      }
    }
  }
  const resourceCells = new Set(definition.resourceNodes.map((node) => (
    Math.floor(node.z + definition.height / 2) * definition.width
      + Math.floor(node.x + definition.width / 2)
  )));
  for (const building of state.buildings) {
    const rules = buildingRulesFor(building?.type);
    assertSnapshot(building && integerIn(building.id, 1, Number.MAX_SAFE_INTEGER)
      && !buildingIds.has(building.id) && integerIn(building.team, 0, 1)
      && rules && finite(building.x) && finite(building.z)
      && integerIn(building.rallyCell, -1, cellCount - 1)
      && Array.isArray(building.footprint) && building.footprint.length > 0
      && building.footprint.every((cell) => integerIn(cell, 0, cellCount - 1))
      && (building.attackCooldown === undefined || (finite(building.attackCooldown) && building.attackCooldown >= 0 && building.attackCooldown <= (BUILDING_DEFINITIONS[building.type].combat?.period || 0)))
      && (building.attackScanOffset === undefined || integerIn(building.attackScanOffset, 0, Number.MAX_SAFE_INTEGER))
      && finite(building.progress) && building.progress >= 0 && building.progress <= 1
      && typeof building.complete === 'boolean' && integerIn(building.queue, 0, MAX_BUILDING_QUEUE)
      && finite(building.trainingRemaining) && building.trainingRemaining >= 0
      && finite(building.hp) && building.hp > 0 && building.hp <= BUILDING_DEFINITIONS[building.type].maxHp
      && Array.isArray(building.productionQueue) && building.productionQueue.length === building.queue
      && building.productionQueue.every((kind) => BUILDING_DEFINITIONS[building.type].products.includes(kind))
      && building.trainingRemaining <= (UNIT_DEFINITIONS[building.productionQueue[0]]?.trainSeconds ?? 0) && typeof building.productionBlocked === 'boolean'
      && (building.queue > 0
        ? building.complete && (building.trainingRemaining > 0 || building.productionBlocked)
        : building.trainingRemaining === 0 && !building.productionBlocked), 'invalid building record');
    buildingIds.add(building.id);
    const centerColumn = Math.floor(building.x + definition.width / 2);
    const centerRow = Math.floor(building.z + definition.height / 2);
    const expectedFootprint = new Set();
    const half = Math.floor(BUILDING_DEFINITIONS[building.type].footprint / 2);
    for (let row = centerRow - half; row <= centerRow + half; row++) {
      for (let column = centerColumn - half; column <= centerColumn + half; column++) {
        assertSnapshot(column >= 0 && column < definition.width && row >= 0 && row < definition.height,
          'building footprint is outside map');
        expectedFootprint.add(row * definition.width + column);
      }
    }
    assertSnapshot(building.footprint.length === expectedFootprint.size
      && building.footprint.every((cell) => expectedFootprint.has(cell)), 'invalid building footprint geometry');
    for (const cell of building.footprint) {
      assertSnapshot(!occupiedFootprintCells.has(cell) && !staticBlocked[cell] && !resourceCells.has(cell),
        'building overlaps a building, terrain, or resource');
      occupiedFootprintCells.add(cell);
    }
  }
  for (let team = 0; team < 2; team++) {
    const research = state.teamResearch[team];
    if (!research) continue;
    const rules = researchRulesFor(research.type);
    const building = state.buildings.find((item) => item.id === research.buildingId);
    const liveHome = research.buildingId === HOME_TOWN_CENTER_ID_BASE + team
      && state.homeTownCenters[team].hp > 0 && rules.buildingType === 'town-center';
    assertSnapshot(liveHome || (building && building.team === team && building.type === rules.buildingType
      && building.complete), `team ${team} research references an unavailable building`);
  }
  for (const unit of state.units) {
    assertSnapshot(unit.attackBuildingTargetId < 0 || buildingIds.has(unit.attackBuildingTargetId)
      || state.homeTownCenters[unit.attackBuildingTargetId - HOME_TOWN_CENTER_ID_BASE]?.hp > 0,
      'unit targets a missing building');
  }
  assertSnapshot(integerIn(state.nextBuildingId, 1, Number.MAX_SAFE_INTEGER)
    && state.nextBuildingId < HOME_TOWN_CENTER_ID_BASE && state.nextBuildingId > Math.max(0, ...buildingIds), 'invalid next building ID');
  assertSnapshot(Array.isArray(state.resourceNodes) && state.resourceNodes.length === definition.resourceNodes.length,
    'invalid resource nodes');
  const resourceIds = new Set();
  for (const node of state.resourceNodes) {
    const definitionNode = definition.resourceNodes.find((item) => item.id === node?.id);
    assertSnapshot(definitionNode && !resourceIds.has(node.id) && node.type === definitionNode.type
      && finite(node.stock) && node.stock >= 0 && node.stock <= definitionNode.stock, 'invalid resource node state');
    resourceIds.add(node.id);
  }
  assertSnapshot(Array.isArray(state.triggerStates) && state.triggerStates.length === definition.triggers.length,
    'invalid trigger states');
  const triggerIds = new Set();
  for (const trigger of state.triggerStates) {
    const triggerDefinition = definition.triggers.find((item) => item.id === trigger?.id);
    assertSnapshot(triggerDefinition && !triggerIds.has(trigger.id)
      && integerIn(trigger.owner, -1, 1) && integerIn(trigger.progressTeam, -1, 1)
      && finite(trigger.progress) && trigger.progress >= 0 && trigger.progress <= triggerDefinition.captureSeconds
      && Array.isArray(trigger.unitCounts) && trigger.unitCounts.length === 2
      && trigger.unitCounts.every((count) => integerIn(count, 0, MAX_UNITS)), 'invalid trigger state');
    triggerIds.add(trigger.id);
  }
  assertSnapshot(Array.isArray(state.scenarioEventStates)
    && state.scenarioEventStates.length === definition.scenarioEvents.length, 'invalid scenario event states');
  const eventIds = new Set();
  for (const event of state.scenarioEventStates) {
    const eventDefinition = definition.scenarioEvents.find((item) => item.id === event?.id);
    assertSnapshot(eventDefinition && !eventIds.has(event.id)
      && typeof event.fired === 'boolean', 'invalid scenario event state');
    if (eventDefinition.repeatCount !== undefined) {
      const awaitingActivation = ['capture', 'event', 'region-entry', 'construction-complete', 'research-complete'].includes(eventDefinition.trigger?.type)
        && event.activatedAtSeconds === null;
      assertSnapshot(Number.isInteger(event.fireCount)
        && event.fireCount >= 0 && event.fireCount <= eventDefinition.repeatCount + 1
        && event.fired === (event.fireCount >= eventDefinition.repeatCount + 1)
        && (event.nextFireAtSeconds === null
          || (finite(event.nextFireAtSeconds) && event.nextFireAtSeconds >= 0))
        && (event.fired || awaitingActivation
          ? event.nextFireAtSeconds === null : event.nextFireAtSeconds !== null),
      'invalid repeating scenario event state');
    } else {
      assertSnapshot(event.fireCount === undefined && event.nextFireAtSeconds === undefined,
        'unexpected repeating scenario event state');
    }
    if (['capture', 'event', 'region-entry', 'construction-complete', 'research-complete'].includes(eventDefinition.trigger?.type)) {
      assertSnapshot((event.activatedAtSeconds === null
        || (finite(event.activatedAtSeconds) && event.activatedAtSeconds >= 0
          && event.activatedAtSeconds <= state.matchElapsedSeconds))
        && integerIn(event.triggeredByTeam, -1, 1)
        && (event.activatedAtSeconds === null
          ? event.triggeredByTeam === -1
          : ['capture', 'region-entry', 'construction-complete', 'research-complete'].includes(eventDefinition.trigger.type)
            ? event.triggeredByTeam >= 0 : integerIn(event.triggeredByTeam, -1, 1))
        && (!event.fired || event.activatedAtSeconds !== null), 'invalid triggered scenario event state');
      if ((eventDefinition.trigger.type === 'region-entry' || validCompletionTrigger(eventDefinition.trigger)) && event.activatedAtSeconds !== null) {
        assertSnapshot(eventDefinition.trigger.team === 'either'
          || event.triggeredByTeam === Number(eventDefinition.trigger.team),
        'invalid region event entering team');
      }
      if (eventDefinition.trigger.type === 'event') {
        const sourceIds = scenarioEventSourceIds(eventDefinition.trigger);
        const sourceStates = sourceIds.map((sourceId) => (
          state.scenarioEventStates.find((item) => item.id === sourceId)
        ));
        const joined = sourceIds.length > 1;
        const commonSourceTeam = sourceStates[0]?.triggeredByTeam ?? -1;
        const inheritedTeam = sourceStates.every((sourceState) => (
          (sourceState?.triggeredByTeam ?? -1) === commonSourceTeam
        )) ? commonSourceTeam : -1;
        assertSnapshot(sourceStates.length === sourceIds.length
          && (event.activatedAtSeconds === null
            ? (joined || !sourceStates[0]?.fired) && !event.fired && event.triggeredByTeam === -1
            : sourceStates.every((sourceState) => sourceState?.fired)
              && event.triggeredByTeam === inheritedTeam),
        'invalid chained scenario event state');
      }
      if (eventDefinition.repeatCount !== undefined) {
        assertSnapshot((event.activatedAtSeconds === null
          ? event.fireCount === 0 && event.nextFireAtSeconds === null
          : event.nextFireAtSeconds === null || event.nextFireAtSeconds >= event.activatedAtSeconds),
        'invalid repeating triggered scenario event schedule');
      }
    }
    eventIds.add(event.id);
  }
  const savedVictoryHold = state.victoryHoldState ?? { activeTeams: [false, false], progressSeconds: [0, 0] };
  const holdDuration = definition.victoryHoldSeconds ?? 0;
  assertSnapshot(holdDuration === 0 || state.victoryHoldState !== undefined,
    'missing victory hold state');
  assertSnapshot(Array.isArray(savedVictoryHold.activeTeams) && savedVictoryHold.activeTeams.length === 2
    && savedVictoryHold.activeTeams.every((active) => typeof active === 'boolean')
    && Array.isArray(savedVictoryHold.progressSeconds) && savedVictoryHold.progressSeconds.length === 2
    && savedVictoryHold.progressSeconds.every((seconds, team) => finite(seconds)
      && seconds >= 0 && seconds <= holdDuration
      && (savedVictoryHold.activeTeams[team] || seconds === 0))
    && (savedVictoryHold.triggerIds === undefined
      || (Array.isArray(savedVictoryHold.triggerIds) && savedVictoryHold.triggerIds.length === 2
        && savedVictoryHold.triggerIds.every((id, team) => id === null
          || (savedVictoryHold.activeTeams[team]
            && definition.triggers.some((trigger) => trigger.id === id && trigger.victory === true))))),
  'invalid victory hold state');
  assertSnapshot(finite(state.matchElapsedSeconds) && state.matchElapsedSeconds >= 0
    && typeof state.scenarioClockStarted === 'boolean'
    && integerIn(state.matchWinner, -1, 2)
    && (state.matchWinnerTriggerId === null || typeof state.matchWinnerTriggerId === 'string')
    && (state.matchWinnerReason === null || ['capture', 'capture-hold', 'elimination', 'timed-control'].includes(state.matchWinnerReason)), 'invalid match result or clock');
  assertSnapshot(Array.isArray(state.explored) && state.explored.length === 2, 'invalid exploration data');
  const explored = state.explored.map((encoded) => {
    assertSnapshot(typeof encoded === 'string', 'invalid exploration data');
    const data = Buffer.from(encoded, 'base64');
    assertSnapshot(data.length === cellCount && data.toString('base64') === encoded
      && data.every((value) => value === 0 || value === 1), 'invalid exploration grid');
    return data;
  });
  assertSnapshot(integerIn(state.nextPlayerId, 1, Number.MAX_SAFE_INTEGER)
    && integerIn(state.navigationRevision, 0, Number.MAX_SAFE_INTEGER)
    && integerIn(state.nextMoveOrderId, 1, Number.MAX_SAFE_INTEGER), 'invalid match counters');
  assertSnapshot(Array.isArray(state.seatSessions) && state.seatSessions.length <= 2, 'invalid seat table');
  const sessionTeams = new Set();
  const sessionHashes = new Set();
  for (const session of state.seatSessions) {
    assertSnapshot(session && typeof session.tokenHash === 'string'
      && /^[A-Za-z0-9_-]{43}$/.test(session.tokenHash) && !sessionHashes.has(session.tokenHash)
      && integerIn(session.team, 0, 1) && !sessionTeams.has(session.team)
      && typeof session.id === 'string' && /^player-[1-9][0-9]*$/.test(session.id)
      && finite(session.expiresAt) && typeof session.connected === 'boolean', 'invalid seat session');
    sessionHashes.add(session.tokenHash);
    sessionTeams.add(session.team);
  }
  for (const unit of state.units) {
    assertSnapshot(unit.attackTargetId < state.units.length, 'unit target is out of range');
    const forestCell = unit.gatherForestCell ?? -1;
    if (unit.gatherNodeId !== null) {
      assertSnapshot(resourceIds.has(unit.gatherNodeId) && forestCell === -1,
        'unit references unknown or conflicting gather targets');
    }
    if (forestCell >= 0) {
      assertSnapshot(unitHasCapability(unit, 'gather') && unit.gatherNodeId === null
        && checkpointForestMask[forestCell] === 1,
      'unit references an invalid forest target');
    }
    if (unit.buildingTargetId !== null) assertSnapshot(buildingIds.has(unit.buildingTargetId) || state.homeTownCenters[unit.buildingTargetId - HOME_TOWN_CENTER_ID_BASE]?.hp > 0, 'unit references unknown building');
    if (unit.attackBuildingTargetId >= 0) {
      const homeTeam = unit.attackBuildingTargetId - HOME_TOWN_CENTER_ID_BASE;
      const home = state.homeTownCenters[homeTeam];
      const target = state.buildings.find((building) => building.id === unit.attackBuildingTargetId)
        || (home?.hp > 0 ? { ...home, team: homeTeam } : null);
      assertSnapshot(target && target.team !== unit.team, 'unit targets an unavailable building');
    }
  }
  for (const building of state.buildings) {
    assertSnapshot(building.footprint.length === new Set(building.footprint).size, 'duplicate footprint cell');
  }
  const aliveByTeam = [0, 0];
  const queuedByTeam = state.workerProduction.map((production) => production.queue);
  for (const unit of state.units) if (unit.hp > 0) aliveByTeam[unit.team]++;
  for (const building of state.buildings) queuedByTeam[building.team] += building.queue;
  assertSnapshot(aliveByTeam.every((alive, team) => alive + queuedByTeam[team] <= MAX_TEAM_ROSTER),
    'team population exceeds its living-unit and queued-production cap');
  assertSnapshot(aliveByTeam[0] + aliveByTeam[1] + queuedByTeam[0] + queuedByTeam[1] <= MAX_UNITS,
    'match population exceeds its living-unit and queued-production cap');
  return { definition, state, explored };
}

function restoreMatchCheckpoint(snapshot) {
  const { definition, state, explored } = validateMatchCheckpoint(snapshot);
  if (pveLaunchOptions && definition.id !== pveLaunchOptions.mapId) {
    throw new Error('PvE checkpoint map does not match its launch seed.');
  }
  if (shippedMapIds.has(definition.id)) {
    const shippedDefinition = mapCatalog.get(definition.id);
    assertSnapshot(matchMapHash(shippedDefinition) === snapshot.mapHash, 'shipped map changed since checkpoint');
  } else {
    mapCatalog.set(definition.id, definition);
    runtimeMapIds.add(definition.id);
  }
  activateMap(definition);
  for (const [cell, stock] of state.forestStocks) {
    forestWoodRemaining[cell] = stock;
    forestStockChangedCells.add(cell);
    if (stock === 0) {
      blocked[cell] = 0;
      visionBlockers[cell] = 0;
      visionBlockHeights[cell] = 0;
    }
  }
  forestEpoch = state.forestEpoch;
  currentArmySize = state.currentArmySize;
  tickNumber = state.tickNumber;
  units.length = 0;
  for (const record of state.units) {
    units.push({
      ...record,
      holdingPosition: record.holdingPosition ?? false,
      persistentOrder: record.persistentOrder ? { ...record.persistentOrder } : null,
      gatherForestCell: record.gatherForestCell ?? -1,
      path: [...record.path],
      attackMoveResumePath: record.attackMoveResumePath === null ? null : [...record.attackMoveResumePath],
      queuedWaypoints: record.queuedWaypoints.map((waypoint) => ({ ...waypoint })),
    });
  }
  unitGenerationCounters.set(state.unitGenerationCounters);
  teamFood = [...state.teamFood];
  teamWood = [...state.teamWood];
  teamUpgrades = state.teamUpgrades.map((upgrades) => ({ ...upgrades }));
  teamResearch = state.teamResearch.map((research) => research ? { ...research } : null);
  workerProduction = state.workerProduction.map((production) => ({ ...production }));
  buildings.length = 0;
  buildingsById.clear();
  buildingBlocked.fill(0);
  for (const record of state.buildings) {
    const building = { ...record, productionQueue: [...record.productionQueue], footprint: [...record.footprint] };
    for (const cell of building.footprint) {
      if (blocked[cell] || buildingBlocked[cell]) throw new Error('Invalid match checkpoint: building blocks invalid terrain.');
      buildingBlocked[cell] = 1;
    }
    buildings.push(building);
    buildingsById.set(building.id, building);
  }
  resetHomeTownCenters(state.homeTownCenters);
  rebuildWalkableComponents();
  // Older checkpoints allowed units inside decorative Town Centers.
  for (const unit of units) {
    if (!townCenterBlocked[worldToCell(unit.x, unit.z)]) continue;
    const safe = cellToWorld(nearestOpenCell(worldToCell(unit.x, unit.z)));
    unit.x = safe.x;
    unit.z = safe.z;
    unit.path = [];
    unit.pathIndex = 0;
    unit.attackMoveResumePath = null;
  }
  nextBuildingId = state.nextBuildingId;
  resourceNodeStates = new Map(definition.resourceNodes.map((node) => [node.id, {
    id: node.id, type: node.type, x: node.x, z: node.z, stock: node.stock,
  }]));
  for (const node of state.resourceNodes) resourceNodeStates.get(node.id).stock = node.stock;
  triggerStates = new Map(state.triggerStates.map((trigger) => [trigger.id, {
    ...trigger, unitCounts: [...trigger.unitCounts],
  }]));
  scenarioEventStates = new Map(state.scenarioEventStates.map((event) => [event.id, { ...event }]));
  matchElapsedSeconds = state.matchElapsedSeconds;
  scenarioClockStarted = state.scenarioClockStarted;
  const savedVictoryHold = state.victoryHoldState ?? { activeTeams: [false, false], progressSeconds: [0, 0] };
  victoryHoldState = {
    activeTeams: [...savedVictoryHold.activeTeams],
    progressSeconds: [...savedVictoryHold.progressSeconds],
    triggerIds: savedVictoryHold.triggerIds ? [...savedVictoryHold.triggerIds] : [null, null],
  };
  matchWinner = state.matchWinner;
  matchWinnerTriggerId = state.matchWinnerTriggerId;
  matchWinnerReason = state.matchWinnerReason;
  exploredCellsByTeam = explored.map((cells) => Uint8Array.from(cells));
  nextPlayerId = state.nextPlayerId;
  navigationRevision = state.navigationRevision;
  nextMoveOrderId = state.nextMoveOrderId;
  sessions.clear();
  const now = Date.now();
  for (const saved of state.seatSessions) {
    // An online seat receives a recovery window after the server comes back,
    // so downtime does not consume the player's chance to resume.
    const expiresAt = saved.connected ? now + RECOVERY_SESSION_GRACE_MS : saved.expiresAt;
    if (expiresAt <= now) continue;
    sessions.set(saved.tokenHash, {
      tokenHash: saved.tokenHash,
      team: saved.team,
      id: saved.id,
      peer: null,
      expiresAt,
      waitingPeers: new Set(),
    });
  }
  matchId = snapshot.matchId;
  checkpointSequence = snapshot.sequence;
  nextCheckpointSequence = snapshot.sequence;
  recoveredFromCheckpoint = true;
  lastCheckpointAt = snapshot.savedAt;
  attackFlowFields.clear();
  rebuildSpatialBuckets();
  updateVisionMasks();
  const pendingRepairs = [];
  for (const unit of units) {
    if (unit.attackTargetId >= 0 && (!units[unit.attackTargetId] || units[unit.attackTargetId].hp <= 0)) {
      clearAttackTarget(unit);
    }
    if (unit.attackBuildingTargetId >= 0 && !buildingsById.has(unit.attackBuildingTargetId)) {
      clearAttackTarget(unit);
    }
    if (unit.movePlanningPending) {
      // The route planner is transient and is not serialized. A checkpoint can
      // catch an attack-move unit after it acquired a target but before its
      // replacement route was applied; discard that combat detour and rebuild
      // the persisted move goal below.
      if (unit.attackTargetId >= 0) clearAttackTarget(unit);
      unit.attackMoveRouteReady = false;
      unit.movePlanningPending = false;
      if (unit.moveGoalCell >= 0 && unit.attackTargetId < 0) {
        pendingRepairs.push({ unit, destination: unit.moveGoalCell });
      }
    }
  }
  enqueueRouteRepairs(pendingRepairs);
  dirty = true;
}

async function writeMatchCheckpointAtomically(serialized, sequence) {
  if (!MATCH_STATE_PATH) return;
  await mkdir(path.dirname(MATCH_STATE_PATH), { recursive: true });
  const temporaryPath = `${MATCH_STATE_PATH}.${process.pid}.${sequence}.${randomBytes(6).toString('hex')}.tmp`;
  const handle = await open(temporaryPath, 'wx', 0o600);
  try {
    try {
      await handle.writeFile(serialized, 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temporaryPath, MATCH_STATE_PATH);
    try {
      const directory = await open(path.dirname(MATCH_STATE_PATH), 'r');
      try { await directory.sync(); } finally { await directory.close(); }
    } catch {}
  } catch (error) {
    await unlink(temporaryPath).catch(() => {});
    throw error;
  }
}

function migrateMatchCheckpoint(snapshot) {
  if (snapshot?.schemaVersion === 2 && Array.isArray(snapshot.state?.units)) {
    for (const unit of snapshot.state.units) {
      if (unit && typeof unit === 'object' && !Array.isArray(unit) && unit.queuedWaypoints === undefined) {
        unit.queuedWaypoints = [];
      }
    }
    snapshot.schemaVersion = 3;
  }
  if (snapshot?.schemaVersion === 3 && Array.isArray(snapshot.state?.buildings)) {
    for (const building of snapshot.state.buildings) {
      if (building && typeof building === 'object' && !Array.isArray(building)
        && building.rallyCell === undefined) building.rallyCell = -1;
    }
    snapshot.schemaVersion = 4;
  }
  if (snapshot?.schemaVersion === 4 && Array.isArray(snapshot.state?.units)
    && Array.isArray(snapshot.state?.buildings)) {
    for (const unit of snapshot.state.units) {
      if (unit && typeof unit === 'object' && !Array.isArray(unit)
        && unit.attackBuildingTargetId === undefined) unit.attackBuildingTargetId = -1;
    }
    for (const building of snapshot.state.buildings) {
      if (building && typeof building === 'object' && !Array.isArray(building)
        && building.hp === undefined) building.hp = BUILDING_MAX_HIT_POINTS;
    }
    snapshot.schemaVersion = 5;
  }
  if (snapshot?.schemaVersion === 5 && typeof snapshot.state === 'object' && snapshot.state !== null) {
    snapshot.state.victoryHoldState ??= { activeTeams: [false, false], progressSeconds: [0, 0] };
    snapshot.schemaVersion = 6;
  }
  if (snapshot?.schemaVersion === 6 && typeof snapshot.state === 'object' && snapshot.state !== null) {
    snapshot.state.teamUpgrades ??= [
      emptyTechnologyCompletions(),
      emptyTechnologyCompletions(),
    ];
    snapshot.state.teamResearch ??= [null, null];
    snapshot.schemaVersion = 7;
  }
  if (snapshot?.schemaVersion === 7 && typeof snapshot.state === 'object' && snapshot.state !== null) {
    snapshot.schemaVersion = 8;
  }
  if (snapshot?.schemaVersion === 8 && typeof snapshot.state === 'object' && snapshot.state !== null) {
    snapshot.schemaVersion = 9;
  }
  if (snapshot?.schemaVersion === 9 && typeof snapshot.state === 'object' && snapshot.state !== null) {
    snapshot.state.forestStocks ??= [];
    snapshot.state.forestEpoch ??= 0;
    if (Array.isArray(snapshot.state.units)) {
      for (const unit of snapshot.state.units) {
        if (unit && typeof unit === 'object' && !Array.isArray(unit)) unit.gatherForestCell ??= -1;
      }
    }
    snapshot.schemaVersion = 10;
  }
  if (snapshot?.schemaVersion === 10 && typeof snapshot.state === 'object' && snapshot.state !== null) {
    for (const building of snapshot.state.buildings || []) {
      if (building && Number.isInteger(building.queue) && building.queue >= 0 && building.queue <= MAX_BUILDING_QUEUE) {
        building.productionQueue = Array(building.queue).fill(buildingRulesFor(building.type)?.unitKind);
      }
    }
    snapshot.schemaVersion = 11;
  }
  if (snapshot?.schemaVersion === 11 && typeof snapshot.state === 'object' && snapshot.state !== null) {
    snapshot.rulesetRevision = GAMEPLAY_RULESET_REVISION;
    snapshot.factionId = DEFAULT_FACTION_ID;
    snapshot.schemaVersion = 12;
  }
  // Storehouse extends the same roster without changing existing saved stats or queues.
  if (snapshot?.schemaVersion === 12 && snapshot.rulesetRevision === 'v1:4a8f7db2ce7f694407489bee0923c19c20c52126176f57f972906aa1dd1dc254') snapshot.rulesetRevision = GAMEPLAY_RULESET_REVISION;
  // Cancel/refund and repair add optional worker state without changing paid queues.
  if (snapshot?.schemaVersion === 12 && [GAMEPLAY_RULESET_REVISION, 'v1:731ebf6916e9fa9f9ccc7d1f94fb444af745d22f78b64237caa9c30cdd2e5182'].includes(snapshot.rulesetRevision)) {
    snapshot.rulesetRevision = GAMEPLAY_RULESET_REVISION;
    snapshot.schemaVersion = 13;
  }
  if (snapshot?.schemaVersion === 13 && [GAMEPLAY_RULESET_REVISION, 'v1:f1e3b9aee2399187a2ab2f0d06bbb37cbd65d71004462536902b3da0c31c2e4d'].includes(snapshot.rulesetRevision)) {
    snapshot.rulesetRevision = GAMEPLAY_RULESET_REVISION;
    snapshot.state.homeTownCenters = [0, 1].map(() => ({ hp: BUILDING_DEFINITIONS['town-center'].maxHp, rallyCell: -1 }));
    snapshot.schemaVersion = 14;
  }
  if (snapshot?.schemaVersion === 14 && [GAMEPLAY_RULESET_REVISION, 'v1:7e0fe0db4cc8bdea4fac37424a3d92739c74eefa8f31f0080cc660128d8a31a1'].includes(snapshot.rulesetRevision)) {
    snapshot.rulesetRevision = GAMEPLAY_RULESET_REVISION;
    snapshot.schemaVersion = 15;
  }
  if (snapshot?.schemaVersion === 15 && [GAMEPLAY_RULESET_REVISION, 'v1:a5fe7992c78af9f94dc6210898d1e46a1582d7ac1d5bbd4141be3cb2407f0762'].includes(snapshot.rulesetRevision)) {
    snapshot.rulesetRevision = GAMEPLAY_RULESET_REVISION;
    snapshot.schemaVersion = 16;
  }
  if (snapshot?.schemaVersion === 16 && [GAMEPLAY_RULESET_REVISION, 'v1:36b333bbb92bb809369e64f5bcb8f04d46c7c4f42b85d65330b3480520e70fa5'].includes(snapshot.rulesetRevision)) {
    snapshot.rulesetRevision = GAMEPLAY_RULESET_REVISION;
    snapshot.schemaVersion = 17;
  }
  if (snapshot?.schemaVersion === 17 && [GAMEPLAY_RULESET_REVISION, 'v1:7b58530451f22c91bb46f4b3afa61f9c9978a7702e15a0b2e03f4d35533bb754'].includes(snapshot.rulesetRevision)) {
    snapshot.state.teamUpgrades = snapshot.state.teamUpgrades.map(upgrades => ({ ...emptyTechnologyCompletions(), ...upgrades }));
    snapshot.rulesetRevision = GAMEPLAY_RULESET_REVISION;
    snapshot.schemaVersion = 18;
  }
  if (snapshot?.schemaVersion === 18 && [GAMEPLAY_RULESET_REVISION, 'v1:a69d094a27f0df94c6b8404b7e9ee4f4632f42c5a68e0294883275f24ace89ca'].includes(snapshot.rulesetRevision)) {
    snapshot.state.teamUpgrades = snapshot.state.teamUpgrades.map(upgrades => ({ ...emptyTechnologyCompletions(), ...upgrades }));
    snapshot.rulesetRevision = GAMEPLAY_RULESET_REVISION;
    snapshot.schemaVersion = MATCH_CHECKPOINT_SCHEMA_VERSION;
  }
  if ([4, 5].includes(snapshot?.rulesVersion)) snapshot.rulesVersion = MATCH_RULES_VERSION;
  if ([1, 2, 3].includes(snapshot?.rulesVersion)
    && !snapshot?.mapDefinition?.elevationPatches?.some((patch) => patch.level > 0)) {
    snapshot.rulesVersion = MATCH_RULES_VERSION;
  }
  if (snapshot?.schemaVersion === MATCH_CHECKPOINT_SCHEMA_VERSION && Array.isArray(snapshot.state?.units)) {
    for (const unit of snapshot.state.units) if (unit && typeof unit === 'object') unit.persistentOrder ??= null;
  }
  return snapshot;
}

async function drainMatchCheckpointWrites() {
  while (pendingCheckpoint) {
    const next = pendingCheckpoint;
    pendingCheckpoint = null;
    checkpointWriteQueueDepth = 0;
    let serialized;
    try {
      serialized = await new Promise((resolve, reject) => {
        setImmediate(() => {
          const serializeStartedAt = performance.now();
          try {
            serialized = JSON.stringify(next.snapshot);
            lastCheckpointSerializeMs = Number((performance.now() - serializeStartedAt).toFixed(3));
            resolve(serialized);
          } catch (error) {
            reject(error);
          }
        });
      });
    } catch (error) {
      checkpointFailures++;
      console.error('Could not serialize match checkpoint:', String(error?.message || error));
      continue;
    }
    const writeStartedAt = performance.now();
    try {
      await writeMatchCheckpointAtomically(serialized, next.sequence);
      checkpointSequence = next.sequence;
      lastCheckpointAt = next.savedAt;
      lastCheckpointBytes = Buffer.byteLength(serialized);
      lastCheckpointWriteMs = Number((performance.now() - writeStartedAt).toFixed(3));
    } catch (error) {
      checkpointFailures++;
      console.error('Could not save match checkpoint:', String(error?.message || error));
    }
  }
}

function ensureMatchCheckpointDrain() {
  if (checkpointWritePromise) return checkpointWritePromise;
  checkpointWritePromise = drainMatchCheckpointWrites().finally(() => {
    checkpointWritePromise = null;
    if (pendingCheckpoint) void ensureMatchCheckpointDrain();
  });
  return checkpointWritePromise;
}

function queueMatchCheckpoint() {
  if (!MATCH_STATE_PATH) return Promise.resolve();
  const sequence = ++nextCheckpointSequence;
  const savedAt = Date.now();
  const captureStartedAt = performance.now();
  let snapshot;
  try {
    snapshot = captureMatchCheckpoint(sequence, savedAt);
    lastCheckpointCaptureMs = Number((performance.now() - captureStartedAt).toFixed(3));
    pendingCheckpoint = { sequence, savedAt, snapshot };
    checkpointWriteQueueDepth = checkpointWritePromise ? 1 : 0;
  } catch (error) {
    lastCheckpointCaptureMs = Number((performance.now() - captureStartedAt).toFixed(3));
    checkpointFailures++;
    console.error('Could not capture match checkpoint:', String(error?.message || error));
    return Promise.resolve();
  }
  return ensureMatchCheckpointDrain();
}

function initializeCleanMatch() {
  matchId = randomBytes(16).toString('base64url');
  recoveredFromCheckpoint = false;
  checkpointSequence = 0;
  nextCheckpointSequence = 0;
  lastCheckpointAt = 0;
  sessions.clear();
  nextPlayerId = 1;
  tickNumber = 0;
  navigationRevision = 0;
  nextMoveOrderId = 1;
  activateMap(mapCatalog.get(configuredMatchMapId));
  resetArmy(mapDefinition.startingArmySize ?? DEFAULT_STARTING_ARMY_SIZE);
}

async function initializeMatchFromCheckpoint() {
  if (!MATCH_STATE_PATH) {
    initializeCleanMatch();
    return;
  }
  let serialized;
  try {
    serialized = await readFile(MATCH_STATE_PATH, 'utf8');
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      console.warn('Match checkpoint could not be read; starting a fresh match:', String(error?.message || error));
    }
    initializeCleanMatch();
    return;
  }
  try {
    restoreMatchCheckpoint(migrateMatchCheckpoint(JSON.parse(serialized)));
    console.log(`Restored match ${matchId} from checkpoint ${checkpointSequence} at tick ${tickNumber}.`);
  } catch (error) {
    console.warn('Match checkpoint was rejected; starting a fresh match:', String(error?.message || error));
    const rejectedPath = `${MATCH_STATE_PATH}.rejected-${Date.now()}-${randomBytes(3).toString('hex')}`;
    await rename(MATCH_STATE_PATH, rejectedPath);
    console.warn(`Preserved rejected checkpoint at ${rejectedPath}.`);
    initializeCleanMatch();
  }
}

function broadcast(message) {
  if (shuttingDown) return;
  for (const peer of peers) peer.sendJson(message);
}

function broadcastGameplayNotice(team, x, z, message) {
  const notice = { type: 'notice', message };
  if (!mapDefinition.fogOfWar) {
    broadcast(notice);
    return;
  }
  if (shuttingDown) return;
  const cell = worldToCell(x, z);
  for (const peer of peers) {
    if (peer.team === null || peer.team === team || cellVisibleToTeam(peer.team, cell)) {
      peer.sendJson(notice);
    }
  }
}

function broadcastState() {
  if (shuttingDown) return;
  if (peers.size === 0) {
    dirty = false;
    return;
  }
  if (!mapDefinition.fogOfWar) {
    const publicPayload = roomPayload(null, false);
    const payloadsByTeam = new Map([[null, publicPayload]]);
    const framesByView = new Map();
    for (const peer of peers) {
      const team = [0, 1].includes(peer.team) ? peer.team : null;
      const key = `${team}:${peer.compressionEnabled}`;
      let frame = framesByView.get(key);
      if (!frame) {
        if (!payloadsByTeam.has(team)) payloadsByTeam.set(team, {...privateProductionView(publicPayload, team), ...(team === 0 ? {scenarioTrace: scenarioDiagnosticTrace()} : {})});
        frame = prepareJsonFrame(payloadsByTeam.get(team), peer.compressionEnabled);
        framesByView.set(key, frame);
      }
      peer.sendPreparedState(frame);
    }
    broadcastWaypointQueueCounts();
    dirty = false;
    return;
  }
  const payloadsByView = new Map();
  const framesByView = new Map();
  for (const peer of peers) {
    const viewTeam = [0, 1].includes(peer.team) ? peer.team : null;
    const frameKey = `${viewTeam}:${peer.compressionEnabled}`;
    let frame = framesByView.get(frameKey);
    if (!frame) {
      let payload = payloadsByView.get(viewTeam);
      if (!payload) {
        payload = roomPayload(viewTeam);
        payloadsByView.set(viewTeam, payload);
      }
      frame = prepareJsonFrame(payload, peer.compressionEnabled);
      framesByView.set(frameKey, frame);
    }
    peer.sendPreparedState(frame);
  }
  dirty = false;
}

const lastWaypointQueueCountsByTeam = [[], []];

function broadcastWaypointQueueCounts() {
  for (const team of [0, 1]) {
    const rows = snapshotQueuedWaypointCounts(team);
    const previous = lastWaypointQueueCountsByTeam[team];
    if (rows.length === previous.length && rows.every((row, index) => (
      row[0] === previous[index][0] && row[1] === previous[index][1]
    ))) continue;
    lastWaypointQueueCountsByTeam[team] = rows;
    const frame = prepareJsonFrame({ type: 'waypointQueueCounts', rows });
    // No-fog snapshots omit these owner-only counts. Coalesce them separately
    // and deliver them after the state that may recreate the client's roster.
    for (const peer of peers) if (peer.team === team) peer.sendPreparedWaypointCounts(frame);
  }
}

function broadcastMapChange() {
  if (shuttingDown) return;
  lastWaypointQueueCountsByTeam[0] = [];
  lastWaypointQueueCountsByTeam[1] = [];
  const maps = mapCatalogPayload();
  for (const peer of peers) {
    // mapChange includes the authoritative snapshot for the new map. A
    // backpressured peer must not receive an older coalesced state afterward.
    peer.pendingState = null;
    peer.pendingWaypointCounts = null;
    peer.sendJson({ type: 'mapChange', map: mapDefinition, maps, state: roomPayload(peer.team) });
  }
}

function clientOrderToken(command) {
  return Number.isSafeInteger(command?.clientOrderToken) && command.clientOrderToken > 0
    ? command.clientOrderToken : null;
}

function sendOrderNotice(player, commandOrToken, message) {
  const token = typeof commandOrToken === 'number'
    ? (Number.isSafeInteger(commandOrToken) && commandOrToken > 0 ? commandOrToken : null)
    : clientOrderToken(commandOrToken);
  const notice = { type: 'notice', message };
  if (token !== null) notice.clientOrderToken = token;
  player.sendJson(notice);
}

function recordMovePlanningSample(sample) {
  movePlanningSamples.push(sample);
  if (movePlanningSamples.length > 32) movePlanningSamples.shift();
}

function cancelMovePlanningJobs(reason = null) {
  const jobs = [...(activeMovePlanningJob ? [activeMovePlanningJob] : []), ...movePlanningQueue];
  for (const job of jobs) {
    if (job.firstMovementProbe) pendingMoveStartBroadcasts.delete(job.firstMovementProbe);
  }
  if (reason) {
    for (const job of jobs) {
      if (!job.silent && job.clientOrderToken !== null) {
        sendOrderNotice(job.player, job.clientOrderToken, `ORDER CANCELLED · ${reason}`);
      }
    }
  }
  movePlanningEpoch++;
  movePlanningQueue.length = 0;
  activeMovePlanningJob = null;
}

function scheduleNextMovePlanning() {
  if (activeMovePlanningJob || movePlanningQueue.length === 0) return;
  activeMovePlanningJob = movePlanningQueue.shift();
  const job = activeMovePlanningJob;
  if (!job.planningStarted) {
    job.queueWaitMs = Math.max(0, performance.now() - (job.queueEnteredAt ?? job.startedAt));
    job.planningStarted = true;
  }
  setImmediate(() => processMovePlanningSlice(job));
}

function applyPlannedMoveAssignment(job, assignment) {
  const { unit, revision } = assignment;
  if (unit.orderRevision !== revision || units[unit.id] !== unit || unit.hp <= 0) return false;
  const destination = nearestOpenCell(assignment.destination);
  const path = assignment.path || [];
  const alreadyInDestinationCell = path.length === 0
    && nearestOpenCell(worldToCell(unit.x, unit.z)) === destination;
  unit.path = path;
  unit.pathIndex = 0;
  unit.movePlanningPending = false;
  unit.buildingTargetId = job.preserveAssignmentBuildingTarget
    ? assignment.buildingTargetId : job.buildingTargetId;
  unit.moveGoalCell = destination;
  if (unit.attackMove) unit.attackMoveRouteReady = true;
  assignment.applied = true;
  assignment.routeOutcome = {
    nonEmptyPath: path.length > 0,
    alreadyInDestinationCell,
    routeFailure: path.length === 0 && !alreadyInDestinationCell,
  };
  if (path.length > 0 && !job.firstMovementProbe) {
    job.firstMovementProbe = {
      unit,
      revision,
      x: unit.x,
      z: unit.z,
      expiresAtTick: tickNumber + TICK_RATE * 2,
    };
    pendingMoveStartBroadcasts.add(job.firstMovementProbe);
  }
  dirty = true;
  return true;
}

function takeMoveStartBroadcastRequest() {
  let shouldBroadcast = false;
  for (const probe of pendingMoveStartBroadcasts) {
    const { unit, revision } = probe;
    if (tickNumber > probe.expiresAtTick || unit.orderRevision !== revision
      || units[unit.id] !== unit || unit.hp <= 0) {
      pendingMoveStartBroadcasts.delete(probe);
      continue;
    }
    if (Math.hypot(unit.x - probe.x, unit.z - probe.z) > MOVE_START_BROADCAST_DISTANCE) {
      pendingMoveStartBroadcasts.delete(probe);
      shouldBroadcast = true;
    }
  }
  return shouldBroadcast;
}

function completeMovePlanningJob(job) {
  const finalizationStartedAt = performance.now();
  let appliedCount = 0;
  let nonEmptyPaths = 0;
  let alreadyInDestinationCell = 0;
  let routeFailures = 0;
  for (const assignment of job.assignments) {
    const { unit, revision } = assignment;
    if (!assignment.applied || unit.orderRevision !== revision
      || units[unit.id] !== unit || unit.hp <= 0) continue;
    appliedCount++;
    if (assignment.routeOutcome.nonEmptyPath) nonEmptyPaths++;
    if (assignment.routeOutcome.alreadyInDestinationCell) alreadyInDestinationCell++;
    if (assignment.routeOutcome.routeFailure) routeFailures++;
  }
  const finalizationMs = performance.now() - finalizationStartedAt;
  job.finalizationMs = finalizationMs;
  job.planningWorkMs += finalizationMs;
  job.maxPlanningSliceMs = Math.max(job.maxPlanningSliceMs, finalizationMs);
  job.planningSliceCount++;
  if (appliedCount > 0) {
    const elapsedMs = Number((performance.now() - job.startedAt).toFixed(3));
    recordMovePlanningSample({
      orderId: job.orderId, team: job.player.team, mode: job.mode,
      unitCount: appliedCount, uniqueStartCells: job.groups.length,
      uniqueDestinationCells: job.reservedDestinations.size, nonEmptyPaths,
      alreadyInDestinationCell, routeFailures,
      searchCount: job.diagnostics.searchCount, expandedCells: job.diagnostics.expandedCells,
      discoveredCells: job.diagnostics.discoveredCells, elapsedMs,
      planningWorkMs: Number(job.planningWorkMs.toFixed(3)),
      maxPlanningSliceMs: Number(job.maxPlanningSliceMs.toFixed(3)),
      queueWaitMs: Number((job.queueWaitMs || 0).toFixed(3)),
      setupMs: Number((job.setupMs || 0).toFixed(3)),
      pathPlanningWorkMs: Number((job.pathPlanningWorkMs || 0).toFixed(3)),
      maxPathPlanningSliceMs: Number((job.maxPathPlanningSliceMs || 0).toFixed(3)),
      finalizationMs: Number((job.finalizationMs || 0).toFixed(3)),
      planningSliceCount: job.planningSliceCount,
    });
  }
  if (!job.silent) {
    const message = appliedCount > 0
      ? `${job.orderLabel} · ${appliedCount} UNITS`
      : 'ORDER SUPERSEDED · 0 UNITS';
    sendOrderNotice(job.player, job.clientOrderToken, message);
  }
  activeMovePlanningJob = null;
  scheduleNextMovePlanning();
}

function clearAttackMoveOrder(unit) {
  unit.persistentOrder = null;
  unit.holdingPosition = false;
  unit.attackMove = false;
  unit.attackMoveRouteReady = false;
  unit.attackMoveResumePath = null;
  unit.attackMoveResumePathIndex = 0;
}

function clearAttackTarget(unit) {
  unit.attackTargetId = -1;
  unit.attackBuildingTargetId = -1;
  unit.repathTimer = 0;
  unit.lastAttackCell = -1;
  if (unit.attackMove && unit.attackMoveResumePath !== null) {
    unit.path = unit.attackMoveResumePath;
    unit.pathIndex = unit.attackMoveResumePathIndex;
    unit.attackMoveResumePath = null;
    unit.attackMoveResumePathIndex = 0;
    // The next enemy can already be in reach when this one falls.
    unit.attackMoveScanTick = tickNumber;
    dirty = true;
  } else if (unit.attackMove && !unit.attackMoveRouteReady
    && unit.moveGoalCell >= 0 && !unit.movePlanningPending) {
    enqueueRouteRepairs([{ unit, destination: unit.moveGoalCell }]);
  } else if (!unit.attackMove) {
    unit.path = [];
    unit.pathIndex = 0;
    if (unit.queuedWaypoints.length > 0) {
      unit.moveGoalCell = nearestOpenCell(worldToCell(unit.x, unit.z));
    }
  }
}

function processMovePlanningSlice(job) {
  try {
    if (activeMovePlanningJob !== job) return;
    if (job.epoch !== movePlanningEpoch) {
      activeMovePlanningJob = null;
      scheduleNextMovePlanning();
      return;
    }

    const sliceStartedAt = performance.now();
    while ((job.currentGoalGroup || job.nextGroup < job.groups.length)
      && performance.now() - sliceStartedAt < MOVE_PLANNING_SLICE_BUDGET_MS) {
      if (!job.currentGoalGroup) {
        const [startCell, group] = job.groups[job.nextGroup++];
        const assignmentsByDestination = new Map();
        for (const assignment of group) {
          const { unit, revision } = assignment;
          if (unit.orderRevision !== revision || units[unit.id] !== unit || unit.hp <= 0) continue;
          const destination = nearestOpenCell(assignment.destination);
          const assignments = assignmentsByDestination.get(destination) || [];
          assignments.push(assignment);
          assignmentsByDestination.set(destination, assignments);
        }
        const goals = [...assignmentsByDestination.entries()];
        if (goals.length === 0) continue;
        job.currentGoalGroup = { startCell, goals, nextGoal: 0 };
      }

      const currentGroup = job.currentGoalGroup;
      const [destination, assignments] = currentGroup.goals[currentGroup.nextGoal++];
      const activeAssignments = assignments.filter(({ unit, revision }) => (
        unit.orderRevision === revision && units[unit.id] === unit && unit.hp > 0
      ));
      if (activeAssignments.length > 0) {
        const path = findPathAStar(nearestOpenCell(currentGroup.startCell), destination, job.diagnostics);
        for (const assignment of activeAssignments) {
          assignment.path = path;
          assignment.plannedNavigationRevision = navigationRevision;
          applyPlannedMoveAssignment(job, assignment);
        }
      }
      if (currentGroup.nextGoal >= currentGroup.goals.length) job.currentGoalGroup = null;
    }
    const sliceDurationMs = performance.now() - sliceStartedAt;
    job.pathPlanningWorkMs = (job.pathPlanningWorkMs || 0) + sliceDurationMs;
    job.maxPathPlanningSliceMs = Math.max(job.maxPathPlanningSliceMs || 0, sliceDurationMs);
    job.planningWorkMs += sliceDurationMs;
    job.maxPlanningSliceMs = Math.max(job.maxPlanningSliceMs, sliceDurationMs);
    job.planningSliceCount++;

    if (!job.currentGoalGroup && job.nextGroup >= job.groups.length) {
      completeMovePlanningJob(job);
    } else {
      activeMovePlanningJob = null;
      movePlanningQueue.push(job);
      scheduleNextMovePlanning();
    }
  } catch (error) {
    if (activeMovePlanningJob !== job) return;
    activeMovePlanningJob = null;
    for (const assignment of job.assignments) {
      if (assignment.unit.orderRevision !== assignment.revision) continue;
      assignment.unit.movePlanningPending = false;
    }
    console.error(`Move order planning failed (${job.orderId}):`, error);
    const partialCount = job.assignments.filter(({ unit, revision, applied }) => (
      applied && unit.orderRevision === revision && units[unit.id] === unit && unit.hp > 0
    )).length;
    try {
      sendOrderNotice(job.player, job.clientOrderToken, partialCount > 0
        ? `${job.orderLabel} PARTIAL · ${partialCount} UNITS`
        : `${job.orderLabel} FAILED · PLEASE RETRY`);
    } catch {}
    scheduleNextMovePlanning();
  }
}

function buildMoveFallbackPools(unitComponents, centerColumn, centerRow) {
  const cellsByComponent = new Map();
  for (const componentId of unitComponents) {
    if (componentId >= 0 && !cellsByComponent.has(componentId)) cellsByComponent.set(componentId, []);
  }
  for (let cell = 0; cell < CELL_COUNT; cell++) {
    const candidates = cellsByComponent.get(walkableComponents[cell]);
    if (candidates) candidates.push(cell);
  }
  for (const candidates of cellsByComponent.values()) {
    candidates.sort((left, right) => {
      const leftDistance = Math.abs(left % MAP_WIDTH - centerColumn)
        + Math.abs(Math.floor(left / MAP_WIDTH) - centerRow);
      const rightDistance = Math.abs(right % MAP_WIDTH - centerColumn)
        + Math.abs(Math.floor(right / MAP_WIDTH) - centerRow);
      return leftDistance - rightDistance || left - right;
    });
  }
  return { cellsByComponent, cursors: new Map() };
}

function cancelGatherOrder(unit) {
  const changed = unit.gatherNodeId !== null || unit.gatherForestCell >= 0 || unit.gatherPhase !== '';
  unit.gatherNodeId = null;
  unit.gatherForestCell = -1;
  unit.gatherPhase = '';
  if (changed) dirty = true;
}

function workerDropoffCandidates(unit) {
  return allMatchBuildings().filter((building) => building.team === unit.team && building.complete
      && BUILDING_DEFINITIONS[building.type].dropoff?.includes(unit.cargoType || 'food'))
      .map((building) => ({ ...building, goals: buildingAccessCells(building.footprint) }));
}

function routeWorkerToDropoff(unit) {
  const start = nearestOpenCell(worldToCell(unit.x, unit.z));
  const component = walkableComponents[start];
  let best = null;
  for (const candidate of workerDropoffCandidates(unit)) {
    const goals = candidate.goals.filter((cell) => walkableComponents[cell] === component);
    if (!goals.length) continue;
    const field = getAttackFlowFieldForGoals(goals, `dropoff:${unit.team}:${candidate.id ?? 'home'}:${component}`);
    const path = field ? pathFromAttackFlow(start, field) : [];
    if (!field || (!path.length && !field.goals.has(start))) continue;
    if (!best || path.length < best.path.length) best = { candidate, field, path };
  }
  unit.dropoffBuildingId = best?.candidate.id ?? null;
  unit.dropoffNavigationRevision = navigationRevision;
  unit.moveGoalCell = best?.field.goal ?? -1;
  unit.path = best?.path ?? [];
  unit.pathIndex = 0;
}

function workerAtDropoff(unit) {
  const building = unit.dropoffBuildingId === null || unit.dropoffBuildingId === undefined
    ? null : buildingsById.get(unit.dropoffBuildingId);
  const valid = unit.dropoffBuildingId != null && (building?.complete && building.team === unit.team
    && BUILDING_DEFINITIONS[building.type].dropoff?.includes(unit.cargoType || 'food'));
  if (!valid || unit.dropoffNavigationRevision !== navigationRevision) {
    unit.orderRevision++; unit.movePlanningPending = false;
    routeWorkerToDropoff(unit);
    return false;
  }
  if (unit.moveGoalCell < 0) return false;
  const distance = building ? distanceToBuildingEdge(unit, building)
    : Math.hypot(spawnByTeam[unit.team].x - unit.x, spawnByTeam[unit.team].z - unit.z);
  return distance <= WORKER_INTERACTION_RANGE;
}

function routeWorker(unit, phase, node) {
  unit.orderRevision++;
  unit.movePlanningPending = false;
  unit.gatherPhase = phase;
  if (phase === 'to-base') { routeWorkerToDropoff(unit); return; }
  const target = node;
  unit.moveGoalCell = worldToCell(target.x, target.z);
  const field = getAttackFlowField(worldToCell(target.x, target.z));
  unit.path = field ? pathFromAttackFlow(worldToCell(unit.x, unit.z), field) : [];
  unit.pathIndex = 0;
}

function forestOpenAccessCells(cell) {
  if (!Number.isInteger(cell) || cell < 0 || cell >= CELL_COUNT || !forestCellMask[cell]) return [];
  const column = cell % MAP_WIDTH;
  const row = Math.floor(cell / MAP_WIDTH);
  const access = [];
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dz === 0) continue;
      const x = column + dx;
      const z = row + dz;
      if (x < 0 || x >= MAP_WIDTH || z < 0 || z >= MAP_HEIGHT) continue;
      const candidate = cellIndex(x, z);
      if (isWalkable(candidate)) access.push(candidate);
    }
  }
  return access;
}

function routeForestWorker(unit, phase, cell) {
  unit.orderRevision++;
  unit.movePlanningPending = false;
  unit.gatherPhase = phase;
  let field = null;
  if (phase === 'to-node') {
    const start = nearestOpenCell(worldToCell(unit.x, unit.z));
    const componentId = walkableComponents[start];
    const goals = forestOpenAccessCells(cell)
      .filter((goal) => walkableComponents[goal] === componentId);
    if (goals.length > 0) field = getAttackFlowFieldForGoals(goals, `forest:${cell}:${componentId}`);
  } else {
    routeWorkerToDropoff(unit); return;
  }
  unit.moveGoalCell = field?.goal ?? -1;
  unit.path = field ? pathFromAttackFlow(worldToCell(unit.x, unit.z), field) : [];
  unit.pathIndex = 0;
}

function assignForestGather(player, command) {
  const cell = Number(command.forestCell);
  if (!Number.isInteger(cell) || cell < 0 || cell >= CELL_COUNT || !forestCellMask[cell]) {
    sendOrderNotice(player, command, 'GATHER REJECTED · FOREST CELL NOT FOUND');
    return;
  }
  if (mapDefinition.fogOfWar && !cellVisibleToTeam(player.team, cell)) {
    sendOrderNotice(player, command, 'GATHER REJECTED · FOREST CELL NOT VISIBLE');
    return;
  }
  if (forestWoodRemaining[cell] <= 0) {
    sendOrderNotice(player, command, 'FOREST CELL CLEARED');
    return;
  }

  const accessCells = forestOpenAccessCells(cell);
  const baseCell = nearestOpenCell(worldToCell(spawnByTeam[player.team].x, spawnByTeam[player.team].z));
  const componentId = walkableComponents[baseCell];
  if (componentId < 0 || !accessCells.some((candidate) => walkableComponents[candidate] === componentId)) {
    sendOrderNotice(player, command, 'FOREST CELL UNREACHABLE');
    return;
  }
  const selectedUnits = commandUnits(command)
    .filter((unit) => unit.hp > 0 && unit.team === player.team && unitHasCapability(unit, 'gather')
      && walkableComponents[nearestOpenCell(worldToCell(unit.x, unit.z))] === componentId);
  if (selectedUnits.length === 0) {
    sendOrderNotice(player, command, 'NO REACHABLE WORKERS SELECTED');
    return;
  }

  for (const unit of selectedUnits) {
    unit.orderRevision++;
    unit.queuedWaypoints.length = 0;
    clearAttackMoveOrder(unit);
    unit.movePlanningPending = false;
    unit.buildingTargetId = null; unit.repairing = false;
    unit.attackTargetId = -1;
    unit.attackBuildingTargetId = -1;
    unit.repathTimer = 0;
    unit.lastAttackCell = -1;
    unit.gatherNodeId = null;
    unit.gatherForestCell = cell;
    routeForestWorker(unit, unit.cargo > 0 && unit.cargoType !== 'wood'
      || unit.cargo >= WORKER_CARRY_CAPACITY ? 'to-base' : 'to-node', cell);
  }
  dirty = true;
  sendOrderNotice(player, command, `GATHER ORDER · ${selectedUnits.length} WORKERS`);
}

function assignGather(player, command) {
  if (player.team === null || !Array.isArray(command.ids)) {
    sendOrderNotice(player, command, 'GATHER REJECTED · NO VALID WORKERS');
    return;
  }
  if (Object.hasOwn(command, 'forestCell')) {
    assignForestGather(player, command);
    return;
  }
  const nodeId = String(command.nodeId ?? '');
  const node = resourceNodeStates.get(nodeId);
  if (!node) {
    sendOrderNotice(player, command, 'GATHER REJECTED · RESOURCE NODE NOT FOUND');
    return;
  }
  if (node.stock <= 0) {
    sendOrderNotice(player, command, `RESOURCE NODE EMPTY · ${nodeId.toUpperCase()}`);
    return;
  }

  const nodeCell = nearestOpenCell(worldToCell(node.x, node.z));
  const baseCell = nearestOpenCell(worldToCell(spawnByTeam[player.team].x, spawnByTeam[player.team].z));
  const componentId = walkableComponents[nodeCell];
  if (componentId < 0 || walkableComponents[baseCell] !== componentId) {
    sendOrderNotice(player, command, `RESOURCE NODE UNREACHABLE · ${nodeId.toUpperCase()}`);
    return;
  }

  const selectedUnits = commandUnits(command)
    .filter((unit) => unit.hp > 0 && unit.team === player.team && unitHasCapability(unit, 'gather')
      && walkableComponents[nearestOpenCell(worldToCell(unit.x, unit.z))] === componentId);
  if (selectedUnits.length === 0) {
    sendOrderNotice(player, command, 'NO REACHABLE WORKERS SELECTED');
    return;
  }

  for (const unit of selectedUnits) {
    unit.orderRevision++;
    unit.queuedWaypoints.length = 0;
    clearAttackMoveOrder(unit);
    unit.movePlanningPending = false;
    unit.buildingTargetId = null; unit.repairing = false;
    unit.attackTargetId = -1;
    unit.attackBuildingTargetId = -1;
    unit.repathTimer = 0;
    unit.lastAttackCell = -1;
    unit.gatherNodeId = nodeId;
    unit.gatherForestCell = -1;
    routeWorker(unit, unit.cargo > 0 && unit.cargoType !== node.type ? 'to-base'
      : unit.cargo >= WORKER_CARRY_CAPACITY ? 'to-base' : 'to-node', node);
  }
  dirty = true;
  sendOrderNotice(player, command, `GATHER ORDER · ${selectedUnits.length} WORKERS`);
}

function stopGathering(unit) {
  unit.orderRevision++;
  unit.gatherNodeId = null;
  unit.gatherForestCell = -1;
  unit.gatherPhase = '';
  unit.path = [];
  unit.pathIndex = 0;
  unit.movePlanningPending = false;
  unit.moveGoalCell = -1;
}

function updateForestWorkerEconomy(unit) {
  const cell = unit.gatherForestCell;
  const point = cellToWorld(cell);
  const targetDistance = Math.hypot(point.x - unit.x, point.z - unit.z);

  const stock = forestWoodRemaining[cell];
  if (unit.gatherPhase === 'to-node') {
    if ((unit.cargo > 0 && unit.cargoType !== 'wood')
      || unit.cargo >= WORKER_CARRY_CAPACITY || stock <= 0) {
      routeForestWorker(unit, 'to-base', cell);
    } else if (targetDistance <= WORKER_INTERACTION_RANGE) {
      unit.orderRevision++;
      unit.gatherPhase = 'gathering';
      unit.path = [];
      unit.pathIndex = 0;
      unit.movePlanningPending = false;
      unit.moveGoalCell = -1;
    }
  }

  if (unit.gatherPhase === 'gathering') {
    const remaining = forestWoodRemaining[cell];
    if ((unit.cargo > 0 && unit.cargoType !== 'wood')
      || unit.cargo >= WORKER_CARRY_CAPACITY || remaining <= 0) {
      routeForestWorker(unit, 'to-base', cell);
    } else if (targetDistance <= WORKER_INTERACTION_RANGE) {
      const amount = Math.min(
        GATHER_RATE * STEP_SECONDS,
        WORKER_CARRY_CAPACITY - unit.cargo,
        remaining,
      );
      const leftover = Math.max(0, remaining - amount);
      if (unit.cargo <= 0) unit.cargoType = 'wood';
      unit.cargo = Math.min(WORKER_CARRY_CAPACITY, unit.cargo + amount);
      forestWoodRemaining[cell] = leftover <= 1e-5 ? 0 : leftover;
      forestStockChangedCells.add(cell);
      if (forestWoodRemaining[cell] === 0) pendingForestClears.add(cell);
      dirty = true;
      if (unit.cargo >= WORKER_CARRY_CAPACITY || forestWoodRemaining[cell] === 0) {
        routeForestWorker(unit, 'to-base', cell);
      }
    }
  }

  if (unit.gatherPhase === 'to-base' && workerAtDropoff(unit)) {
    if (unit.cargo > 0) {
      const bank = unit.cargoType === 'wood' ? teamWood : teamFood;
      bank[unit.team] = creditResourceBalance(bank[unit.team], unit.cargo);
      unit.cargo = 0;
      unit.cargoType = null;
      dirty = true;
    }
    if (forestWoodRemaining[cell] > 0) routeForestWorker(unit, 'to-node', cell);
    else stopGathering(unit);
  }
}

function flushPendingForestClears() {
  if (pendingForestClears.size === 0) return;
  let changed = false;
  for (const cell of pendingForestClears) {
    if (forestWoodRemaining[cell] > 0 || !forestCellMask[cell] || blocked[cell] === 0) continue;
    blocked[cell] = 0;
    visionBlockers[cell] = 0;
    visionBlockHeights[cell] = 0;
    changed = true;
  }
  pendingForestClears.clear();
  if (!changed) return;
  navigationRevision++;
  visionCoverageBySourceCell = new Array(CELL_COUNT);
  attackFlowFields.clear();
  rebuildWalkableComponents();
  updateVisionMasks();
  dirty = true;
}

function updateWorkerEconomy() {
  for (const unit of units) {
    if (unit.hp <= 0 || !unitHasCapability(unit, 'gather')) continue;
    if (unit.gatherForestCell >= 0) {
      if (!forestCellMask[unit.gatherForestCell]) {
        stopGathering(unit);
        dirty = true;
      } else updateForestWorkerEconomy(unit);
      continue;
    }
    if (unit.gatherNodeId === null) continue;
    const node = resourceNodeStates.get(unit.gatherNodeId);
    if (!node) {
      stopGathering(unit);
      dirty = true;
      continue;
    }

    const nodeDistance = Math.hypot(node.x - unit.x, node.z - unit.z);

    if (unit.gatherPhase === 'to-node') {
      if ((unit.cargo > 0 && unit.cargoType !== node.type)
        || unit.cargo >= WORKER_CARRY_CAPACITY || node.stock <= 0) {
        routeWorker(unit, 'to-base', node);
      } else if (nodeDistance <= WORKER_INTERACTION_RANGE) {
        unit.orderRevision++;
        unit.gatherPhase = 'gathering';
        unit.path = [];
        unit.pathIndex = 0;
        unit.movePlanningPending = false;
        unit.moveGoalCell = -1;
      }
    }

    if (unit.gatherPhase === 'gathering') {
      if ((unit.cargo > 0 && unit.cargoType !== node.type)
        || unit.cargo >= WORKER_CARRY_CAPACITY || node.stock <= 0) {
        routeWorker(unit, 'to-base', node);
      } else if (nodeDistance <= WORKER_INTERACTION_RANGE) {
        const amount = Math.min(
          GATHER_RATE * STEP_SECONDS,
          WORKER_CARRY_CAPACITY - unit.cargo,
          node.stock,
        );
        const emptied = amount >= node.stock;
        if (unit.cargo <= 0) unit.cargoType = node.type;
        unit.cargo = Math.min(WORKER_CARRY_CAPACITY, unit.cargo + amount);
        node.stock = emptied ? 0 : node.stock - amount;
        dirty = true;
        if (emptied) broadcastGameplayNotice(unit.team, node.x, node.z,
          `RESOURCE NODE EMPTY · ${node.id.toUpperCase()}`);
        if (unit.cargo >= WORKER_CARRY_CAPACITY || emptied) routeWorker(unit, 'to-base', node);
      }
    }

    if (unit.gatherPhase === 'to-base') {
      if (workerAtDropoff(unit)) {
        if (unit.cargo > 0) {
          const bank = unit.cargoType === 'wood' ? teamWood : teamFood;
          bank[unit.team] = creditResourceBalance(bank[unit.team], unit.cargo);
          unit.cargo = 0;
          unit.cargoType = null;
          dirty = true;
        }
        if (node.stock > 0) routeWorker(unit, 'to-node', node);
        else stopGathering(unit);
      }
    }
  }
  flushPendingForestClears();
}

function researchContextForTeam(team) {
  return { team, food: teamFood[team], wood: teamWood[team], upgrades: teamUpgrades[team], active: teamResearch[team], matchOver: matchWinner >= 0 };
}

function queuedUnitsForTeam(team) {
  let queued = 0;
  for (const building of buildings) if (building.team === team) queued += building.queue;
  return queued + (workerProduction[team]?.queue || 0);
}

function canTeamStillFieldUnits(team, alive) {
  const queued = queuedUnitsForTeam(team);
  if (alive[team] + queued > 0) return true;
  const totalRoster = alive[0] + alive[1] + queuedUnitsTotal();
  if (queued >= MAX_TEAM_ROSTER || totalRoster >= MAX_UNITS) return false;
  if (teamFood[team] + 1e-9 >= WORKER_FOOD_COST
    && findTownCenterProductionSpawnCell(team) >= 0) return true;
  const upgrades = teamUpgrades[team];
  return buildings.some((building) => building.team === team && building.complete
    && BUILDING_DEFINITIONS[building.type].products.some((kind) => {
      const rule = UNIT_DEFINITIONS[kind];
      return teamFood[team] + 1e-9 >= rule.cost.food && teamWood[team] + 1e-9 >= rule.cost.wood
        && !missingGameplayPrerequisites(rule, upgrades).length && findProductionSpawnCell(building) >= 0;
    }));
}

function queuedUnitsTotal() {
  return buildings.reduce((sum, building) => sum + building.queue, 0)
    + workerProduction.reduce((sum, production) => sum + production.queue, 0);
}

function populationForTeam(team) {
  return teamPopulation({ units, buildings, workerProduction, openingArmySize: currentArmySize }, team);
}

function canReservePopulation(team, kind) {
  return populationForTeam(team).available >= UNIT_DEFINITIONS[kind].population;
}

function productionContextForTeam(team, alive = aliveCounts()) {
  const population = populationForTeam(team);
  return { team, population, populationAvailable: population.available,
    food: teamFood[team], wood: teamWood[team], upgrades: teamUpgrades[team],
    seatUnits: alive[team], seatReservedUnits: queuedUnitsForTeam(team),
    totalUnits: alive[0] + alive[1], totalReservedUnits: queuedUnitsTotal(),
    seatLimit: MAX_TEAM_ROSTER, totalLimit: MAX_UNITS, queueLimit: MAX_BUILDING_QUEUE,
    matchOver: matchWinner >= 0 };
}

function enqueueBuildingUnit(building, kind) {
  building.productionQueue.push(kind);
  building.queue = building.productionQueue.length;
  if (building.queue === 1) building.trainingRemaining = UNIT_DEFINITIONS[kind].trainSeconds;
}

function trainUnit(player, command) {
  if (player.team === null) return;
  const home = buildingsById.get(command.buildingId);
  if (home?.home && home.team === player.team && command.kind === 'worker') { trainWorker(player); return; }
  const building = buildingsById.get(Number(command.buildingId));
  const kind = command.kind;
  const definition = UNIT_DEFINITIONS[kind];
  if (!definition || !building || building.team !== player.team || !building.complete
    || !BUILDING_DEFINITIONS[building.type]?.products.includes(kind)) {
    sendOrderNotice(player, command, 'TRAINING REJECTED · SELECT A COMPLETED BUILDING THAT PRODUCES THIS UNIT');
    return;
  }
  const label = definition.label.toUpperCase();
  const action = productionAction(building, kind, productionContextForTeam(player.team));
  const rejection = action.available ? findProductionSpawnCell(building) < 0 ? 'NO SPAWN ROOM' : null : action.reason;
  if (rejection) {
    sendOrderNotice(player, command, `${label} TRAINING REJECTED · ${rejection}`);
    return;
  }
  teamFood[player.team] = Math.max(0, teamFood[player.team] - definition.cost.food);
  teamWood[player.team] = Math.max(0, teamWood[player.team] - definition.cost.wood);
  enqueueBuildingUnit(building, kind);
  building.productionBlocked = false;
  dirty = true;
  sendOrderNotice(player, command, `${label} QUEUED · ${building.queue}/${MAX_BUILDING_QUEUE}`);
}

function trainInfantry(player, command) {
  if (player.team === null) return;
  const alive = aliveCounts();
  if (alive[player.team] + queuedUnitsForTeam(player.team) >= MAX_TEAM_ROSTER
    || alive[0] + alive[1] + queuedUnitsTotal() >= MAX_UNITS) {
    player.sendJson({ type: 'notice', message: 'UNIT CAP REACHED · TRAINING BLOCKED' });
    return;
  }
  const building = buildingsById.get(Number(command.buildingId));
  if (!building || building.team !== player.team || building.type !== 'barracks' || !building.complete) {
    player.sendJson({ type: 'notice', message: 'INFANTRY TRAINING REJECTED · SELECT A COMPLETED BARRACKS' });
    return;
  }
  if (building.queue >= MAX_BUILDING_QUEUE) {
    player.sendJson({ type: 'notice', message: `INFANTRY TRAINING REJECTED · QUEUE FULL ${MAX_BUILDING_QUEUE}/${MAX_BUILDING_QUEUE}` });
    return;
  }
  if (teamFood[player.team] + 1e-9 < INFANTRY_FOOD_COST) {
    player.sendJson({ type: 'notice', message: `INFANTRY TRAINING REJECTED · NEED ${INFANTRY_FOOD_COST} FOOD` });
    return;
  }
  const missing = missingGameplayPrerequisites(UNIT_DEFINITIONS.infantry, teamUpgrades[player.team]);
  if (missing.length) {
    player.sendJson({ type: 'notice', message: `INFANTRY TRAINING REJECTED · REQUIRES ${missing.map((id) => TECHNOLOGY_DEFINITIONS[id].label).join(' + ')}` });
    return;
  }
  if (!canReservePopulation(player.team, 'infantry')) {
    player.sendJson({ type: 'notice', message: 'INFANTRY TRAINING REJECTED · POPULATION FULL · BUILD A HOUSE' });
    return;
  }
  if (findProductionSpawnCell(building) < 0) {
    player.sendJson({ type: 'notice', message: 'INFANTRY TRAINING REJECTED · NO SPAWN ROOM' });
    return;
  }
  teamFood[player.team] = Math.max(0, teamFood[player.team] - INFANTRY_FOOD_COST);
  enqueueBuildingUnit(building, 'infantry');
  building.productionBlocked = false;
  dirty = true;
  player.sendJson({ type: 'notice', message: `INFANTRY QUEUED · ${building.queue}/${MAX_BUILDING_QUEUE} · ${INFANTRY_FOOD_COST} FOOD` });
}

function trainWorker(player) {
  if (player.team === null) return;
  const production = workerProduction[player.team];
  if (production.queue >= MAX_BUILDING_QUEUE) {
    player.sendJson({ type: 'notice', message: `WORKER TRAINING REJECTED · QUEUE FULL ${MAX_BUILDING_QUEUE}/${MAX_BUILDING_QUEUE}` });
    return;
  }
  const alive = aliveCounts();
  const queued = queuedUnitsForTeam(player.team);
  if (alive[player.team] + queued >= MAX_TEAM_ROSTER
    || alive[0] + alive[1] + queuedUnitsTotal() >= MAX_UNITS) {
    player.sendJson({ type: 'notice', message: 'WORKER TRAINING REJECTED · UNIT CAP REACHED' });
    return;
  }
  if (teamFood[player.team] + 1e-9 < WORKER_FOOD_COST) {
    player.sendJson({ type: 'notice', message: `WORKER TRAINING REJECTED · NEED ${WORKER_FOOD_COST} FOOD` });
    return;
  }
  const missing = missingGameplayPrerequisites(UNIT_DEFINITIONS.worker, teamUpgrades[player.team]);
  if (missing.length) {
    player.sendJson({ type: 'notice', message: `WORKER TRAINING REJECTED · REQUIRES ${missing.map((id) => TECHNOLOGY_DEFINITIONS[id].label).join(' + ')}` });
    return;
  }
  if (!canReservePopulation(player.team, 'worker')) {
    player.sendJson({ type: 'notice', message: 'WORKER TRAINING REJECTED · POPULATION FULL · BUILD A HOUSE' });
    return;
  }
  if (findTownCenterProductionSpawnCell(player.team) < 0) {
    player.sendJson({ type: 'notice', message: 'WORKER TRAINING REJECTED · NO SPAWN ROOM' });
    return;
  }
  teamFood[player.team] = Math.max(0, teamFood[player.team] - WORKER_FOOD_COST);
  production.queue++;
  if (production.queue === 1) production.trainingRemaining = WORKER_TRAIN_SECONDS;
  production.productionBlocked = false;
  dirty = true;
  player.sendJson({ type: 'notice', message: `WORKER QUEUED · ${production.queue}/${MAX_BUILDING_QUEUE} · ${WORKER_FOOD_COST} FOOD` });
}

function researchUpgrade(player, command) {
  if (player.team === null) return;
  const rules = researchRulesFor(command.upgrade);
  if (!rules) {
    player.sendJson({ type: 'notice', message: 'RESEARCH REJECTED · UNKNOWN UPGRADE' });
    return;
  }
  const building = buildingsById.get(Number(command.buildingId));
  const option = researchAction(building, command.upgrade, {
    team: player.team, food: teamFood[player.team], wood: teamWood[player.team],
    upgrades: teamUpgrades[player.team], active: teamResearch[player.team], matchOver: matchWinner >= 0,
  });
  if (!option.available) {
    player.sendJson({ type: 'notice', message: `RESEARCH REJECTED · ${option.reason}` });
    return;
  }
  teamFood[player.team] = Math.max(0, teamFood[player.team] - rules.foodCost);
  teamWood[player.team] = Math.max(0, teamWood[player.team] - rules.woodCost);
  teamResearch[player.team] = {
    type: command.upgrade, buildingId: building.id, remaining: rules.durationSeconds,
  };
  dirty = true;
  player.sendJson({ type: 'notice', message: `${rules.label} STARTED · ${rules.durationSeconds}S` });
}

function creditRefund(team, refund) {
  teamFood[team] = Math.round((teamFood[team] + refund.food) * 1e6) / 1e6;
  teamWood[team] = Math.round((teamWood[team] + refund.wood) * 1e6) / 1e6;
  dirty = true;
}

function cancelConstruction(player, command) {
  const building = buildingsById.get(command.buildingId);
  if (player.team === null || !building || building.team !== player.team || building.complete) {
    sendOrderNotice(player, command, 'CANCEL REJECTED · SELECT YOUR UNFINISHED BUILDING'); return;
  }
  const refund = unfinishedRefund(BUILDING_DEFINITIONS[building.type].cost, 1 - building.progress, 1);
  destroyBuilding(building); creditRefund(player.team, refund);
  sendOrderNotice(player, command, `CONSTRUCTION CANCELLED · REFUND ${Math.round(refund.food)} FOOD + ${Math.round(refund.wood)} WOOD`);
}

function cancelTraining(player, command) {
  if (player.team === null) return;
  const building = command.buildingId == null ? null : buildingsById.get(command.buildingId);
  const legacyWorker = (command.buildingId == null && command.kind === 'worker') || (building?.home && building.team === player.team);
  const production = legacyWorker ? workerProduction[player.team] : building;
  if (!production || (!legacyWorker && (building.team !== player.team || !building.complete)) || production.queue <= 0) {
    sendOrderNotice(player, command, 'CANCEL REJECTED · SELECT YOUR PAID TRAINING QUEUE'); return;
  }
  const index = command.queueIndex ?? production.queue - 1;
  if (!Number.isInteger(index) || index < 0 || index >= production.queue) {
    sendOrderNotice(player, command, 'CANCEL REJECTED · QUEUE ENTRY NOT FOUND'); return;
  }
  const kind = legacyWorker ? 'worker' : production.productionQueue[index];
  const rule = UNIT_DEFINITIONS[kind];
  const refund = unfinishedRefund(rule.cost, index === 0 ? production.trainingRemaining : rule.trainSeconds, rule.trainSeconds);
  if (!legacyWorker) production.productionQueue.splice(index, 1);
  production.queue--;
  if (index === 0) {
    const next = legacyWorker ? 'worker' : production.productionQueue[0];
    production.trainingRemaining = production.queue ? UNIT_DEFINITIONS[next].trainSeconds : 0;
    production.productionBlocked = false;
  }
  creditRefund(player.team, refund);
  sendOrderNotice(player, command, `TRAINING CANCELLED · ${rule.label.toUpperCase()} · REFUND ${Math.round(refund.food)} FOOD + ${Math.round(refund.wood)} WOOD`);
}

function cancelResearch(player, command) {
  const research = player.team === null ? null : teamResearch[player.team];
  if (!research || research.buildingId !== command.buildingId) {
    sendOrderNotice(player, command, 'CANCEL REJECTED · SELECT YOUR ACTIVE RESEARCH BUILDING'); return;
  }
  const rule = TECHNOLOGY_DEFINITIONS[research.type];
  const refund = unfinishedRefund(rule.cost, research.remaining, rule.durationSeconds);
  teamResearch[player.team] = null; creditRefund(player.team, refund);
  sendOrderNotice(player, command, `RESEARCH CANCELLED · REFUND ${Math.round(refund.food)} FOOD + ${Math.round(refund.wood)} WOOD`);
}

function repairBuilding(player, command) {
  if (!Array.isArray(command.ids)) { sendOrderNotice(player, command, 'REPAIR REJECTED · SELECT WORKERS'); return; }
  const building = buildingsById.get(command.buildingId);
  if (player.team === null || !building || building.team !== player.team || !building.complete
    || building.hp >= BUILDING_DEFINITIONS[building.type].maxHp) {
    sendOrderNotice(player, command, 'REPAIR REJECTED · SELECT YOUR DAMAGED COMPLETED BUILDING'); return;
  }
  const workers = commandUnits(command).filter((unit) => unit.team === player.team && unit.hp > 0 && unitHasCapability(unit, 'repair'));
  const access = buildingAccessCells(building.footprint);
  const worker = workers.find((unit) => findBuildingAttackApproachCell(unit, access));
  const approach = worker && findBuildingAttackApproachCell(worker, access);
  if (!approach) { sendOrderNotice(player, command, 'REPAIR REJECTED · NO REACHABLE WORKERS'); return; }
  const point = cellToWorld(approach.goal);
  assignFormationMove(player, { ...command, ids: workers.map((unit) => unit.id), unitGenerations: workers.map((unit) => unit.generation), x: point.x, z: point.z }, building.id, 'REPAIR ORDER');
}

function buildingFootprint(centerCell, type) {
  const half = Math.floor(BUILDING_DEFINITIONS[type].footprint / 2);
  const centerColumn = centerCell % MAP_WIDTH;
  const centerRow = Math.floor(centerCell / MAP_WIDTH);
  const cells = [];
  for (let row = centerRow - half; row <= centerRow + half; row++) {
    for (let column = centerColumn - half; column <= centerColumn + half; column++) {
      if (column < 0 || column >= MAP_WIDTH || row < 0 || row >= MAP_HEIGHT) return null;
      cells.push(cellIndex(column, row));
    }
  }
  return cells;
}

function buildingAccessCells(footprint) {
  const footprintSet = new Set(footprint);
  const access = new Set();
  for (const cell of footprint) {
    const column = cell % MAP_WIDTH;
    const row = Math.floor(cell / MAP_WIDTH);
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dz === 0) continue;
        const x = column + dx;
        const z = row + dz;
        if (x < 0 || x >= MAP_WIDTH || z < 0 || z >= MAP_HEIGHT) continue;
        const candidate = cellIndex(x, z);
        if (!footprintSet.has(candidate) && isWalkable(candidate)) access.add(candidate);
      }
    }
  }
  return [...access];
}

function findBuildingAttackApproachCell(unit, accessCells) {
  const start = nearestOpenCell(worldToCell(unit.x, unit.z));
  const componentId = walkableComponents[start];
  if (componentId < 0) return null;
  let goal = -1;
  let bestDistance = Infinity;
  const startColumn = start % MAP_WIDTH;
  const startRow = Math.floor(start / MAP_WIDTH);
  for (const cell of accessCells) {
    if (walkableComponents[cell] !== componentId) continue;
    const distance = Math.abs(cell % MAP_WIDTH - startColumn)
      + Math.abs(Math.floor(cell / MAP_WIDTH) - startRow);
    if (distance < bestDistance) {
      bestDistance = distance;
      goal = cell;
    }
  }
  return goal < 0 ? null : { start, goal };
}

function distanceToBuildingEdge(unit, building) {
  if (building.home && building.bounds) {
    const b = building.bounds;
    return Math.hypot(Math.max(0, b.minX - unit.x, unit.x - b.maxX), Math.max(0, b.minZ - unit.z, unit.z - b.maxZ));
  }
  const dx = Math.max(0, Math.abs(building.x - unit.x) - BUILDING_DEFINITIONS[building.type].footprint / 2);
  const dz = Math.max(0, Math.abs(building.z - unit.z) - BUILDING_DEFINITIONS[building.type].footprint / 2);
  return Math.hypot(dx, dz);
}

function destroyBuilding(building) {
  if (!building || buildingsById.get(building.id) !== building) return false;
  const lostResearch = teamResearch[building.team]?.buildingId === building.id;
  if (lostResearch) teamResearch[building.team] = null;
  const index = buildings.indexOf(building);
  if (index >= 0) buildings.splice(index, 1);
  buildingsById.delete(building.id);
  if (building.home) {
    building.hp = 0; building.rallyCell = -1;
    workerProduction[building.team] = { queue: 0, trainingRemaining: 0, productionBlocked: false };
    rebuildHomeTownCenterBlocking();
  } else for (const cell of building.footprint) buildingBlocked[cell] = 0;
  for (const unit of units) {
    if (unit.hp <= 0) continue;
    if (unit.attackBuildingTargetId === building.id) clearAttackTarget(unit);
    if (unit.buildingTargetId !== building.id) continue;
    unit.orderRevision++;
    unit.buildingTargetId = null; unit.repairing = false;
    unit.movePlanningPending = false;
    unit.attackTargetId = -1;
    unit.attackBuildingTargetId = -1;
    unit.path = [];
    unit.pathIndex = 0;
    unit.queuedWaypoints.length = 0;
    unit.moveGoalCell = nearestOpenCell(worldToCell(unit.x, unit.z));
  }
  navigationRevision++;
  visionCoverageBySourceCell = new Array(CELL_COUNT);
  attackFlowFields.clear();
  rebuildWalkableComponents();
  dirty = true;
  const teamName = building.team === 0 ? 'AZURE' : 'EMBER';
  const label = buildingRulesFor(building.type)?.label || 'BUILDING';
  broadcastGameplayNotice(building.team, building.x, building.z,
    `${teamName} ${label} DESTROYED · PRODUCTION QUEUE LOST${lostResearch ? ' · RESEARCH LOST' : ''}`);
  return true;
}

function pendingMoveAssignmentsByUnit() {
  const pending = new Map();
  const jobs = activeMovePlanningJob ? [activeMovePlanningJob, ...movePlanningQueue] : movePlanningQueue;
  for (const job of jobs) {
    for (const assignment of job.assignments) {
      const { unit, revision } = assignment;
      if (unit.orderRevision === revision && units[unit.id] === unit && unit.hp > 0) {
        pending.set(unit.id, assignment);
      }
    }
  }
  return pending;
}

function routesShareWalkableComponent(startCell, goalCell) {
  const start = nearestOpenCell(startCell);
  const goal = nearestOpenCell(goalCell);
  return walkableComponents[start] >= 0 && walkableComponents[start] === walkableComponents[goal];
}

function activeMoveRoutesRemainConnected(previousComponents) {
  const pending = pendingMoveAssignmentsByUnit();
  for (const unit of units) {
    if (unit.hp <= 0) continue;
    const current = worldToCell(unit.x, unit.z);
    for (const waypoint of unit.queuedWaypoints) {
      if (!routesShareWalkableComponent(current, waypoint.destination)) return false;
    }
    const assignment = pending.get(unit.id);
    if (unit.attackTargetId >= 0) {
      const target = units[unit.attackTargetId];
      const targetCell = target ? worldToCell(target.x, target.z) : -1;
      if (target && target.hp > 0 && previousComponents[current] >= 0
        && previousComponents[current] === previousComponents[targetCell]
        && !routesShareWalkableComponent(current, targetCell)) return false;
      if (unit.attackMove && unit.moveGoalCell >= 0
        && !routesShareWalkableComponent(current, unit.moveGoalCell)) return false;
      continue;
    }
    if (unit.attackBuildingTargetId >= 0) {
      const target = buildingsById.get(unit.attackBuildingTargetId);
      const range = UNIT_DEFINITIONS[unit.kind].combat.range;
      if (target && distanceToBuildingEdge(unit, target) > range
        && !buildingAttackApproachCells(target, unit.kind)
          .some((cell) => walkableComponents[cell] === walkableComponents[current])) return false;
      continue;
    }

    if (unit.gatherForestCell >= 0 && unit.gatherPhase === 'to-node'
      && forestWoodRemaining[unit.gatherForestCell] > 0) {
      if (!forestOpenAccessCells(unit.gatherForestCell)
        .some((cell) => walkableComponents[cell] === walkableComponents[current])) return false;
      continue;
    }

    const hasPendingMove = Boolean(assignment);
    const hasActivePath = unit.pathIndex < unit.path.length;
    const hasAttackMoveGoal = unit.attackMove && unit.attackMoveRouteReady && unit.moveGoalCell >= 0;
    if (!hasPendingMove && !hasActivePath && !hasAttackMoveGoal) continue;
    const goal = hasPendingMove ? assignment.destination
      : unit.moveGoalCell >= 0 ? unit.moveGoalCell : unit.path[unit.path.length - 1];
    if (!routesShareWalkableComponent(current, goal)) return false;
  }
  return true;
}

function pathIntersectsCells(path, startIndex, cells) {
  if (!Array.isArray(path)) return false;
  for (let index = Math.max(0, startIndex); index < path.length; index++) {
    if (cells.has(path[index])) return true;
  }
  return false;
}

function revalidateBuildingRallyPoints() {
  const resourceCells = new Set(mapDefinition.resourceNodes.map((node) => worldToCell(node.x, node.z)));
  for (const building of allMatchBuildings()) {
    if (!Number.isInteger(building.rallyCell) || building.rallyCell < 0) continue;
    const access = buildingAccessCells(building.footprint);
    const teamComponent = access.length ? walkableComponents[access[0]] : -1;
    if (teamComponent >= 0 && walkableComponents[building.rallyCell] === teamComponent
      && !resourceCells.has(building.rallyCell)) continue;
    building.rallyCell = findAvailableCellNear(building.rallyCell, teamComponent, resourceCells, 12);
    dirty = true;
  }
}

function replanPathsBlockedBy(footprint) {
  const footprintSet = new Set(footprint);
  revalidateBuildingRallyPoints();
  const pending = pendingMoveAssignmentsByUnit();
  const repairs = [];
  for (const unit of units) {
    if (unit.hp <= 0) continue;
    const pendingAssignment = pending.get(unit.id);
    const pendingPathStale = pendingAssignment
      && pendingAssignment.plannedNavigationRevision !== undefined
      && pendingAssignment.plannedNavigationRevision < navigationRevision;

    if (unit.attackTargetId >= 0) {
      unit.path = [];
      unit.pathIndex = 0;
      unit.lastAttackCell = -1;
      unit.repathTimer = 0;
      const attackMoveGoalBlocked = unit.attackMove && footprintSet.has(unit.moveGoalCell);
      if (attackMoveGoalBlocked) {
        unit.moveGoalCell = nearestOpenCell(unit.moveGoalCell);
      }
      if (unit.attackMove && (pendingPathStale || attackMoveGoalBlocked
        || pathIntersectsCells(unit.attackMoveResumePath, unit.attackMoveResumePathIndex, footprintSet))) {
        // The combat detour can outlive the route saved underneath it. Keep
        // pursuing the current target, then rebuild the original move route.
        unit.attackMoveResumePath = null;
        unit.attackMoveResumePathIndex = 0;
        unit.attackMoveRouteReady = false;
      }
      continue;
    }
    if (unit.attackBuildingTargetId >= 0) {
      const target = buildingsById.get(unit.attackBuildingTargetId);
      unit.path = [];
      unit.pathIndex = 0;
      unit.lastAttackCell = -1;
      unit.repathTimer = 0;
      // A unit can be in firing range even when its cell center is outside it.
      // Preserve that shot before looking for walkable approach-cell centers.
      const range = UNIT_DEFINITIONS[unit.kind].combat.range;
      if (target && distanceToBuildingEdge(unit, target) <= range) continue;
      const approach = target
        ? findBuildingAttackApproachCell(unit, buildingAttackApproachCells(target, unit.kind)) : null;
      if (approach) unit.moveGoalCell = approach.goal;
      else clearAttackTarget(unit);
      continue;
    }

    const pendingDestinationBlocked = pendingAssignment
      && footprintSet.has(pendingAssignment.destination);
    const activeDestinationBlocked = unit.pathIndex < unit.path.length
      && footprintSet.has(unit.moveGoalCell);
    const activePathBlocked = pathIntersectsCells(unit.path, unit.pathIndex, footprintSet);
    const attackMoveResumePathBlocked = unit.attackMove
      && pathIntersectsCells(unit.attackMoveResumePath, unit.attackMoveResumePathIndex, footprintSet);
    if (!pendingPathStale && !pendingDestinationBlocked && !activeDestinationBlocked
      && !activePathBlocked && !attackMoveResumePathBlocked) continue;
    if (unit.gatherForestCell >= 0 && unit.gatherPhase === 'to-node') {
      // A generic nearest-open repair can finish outside harvesting range.
      // Rebuild this order against the tree's remaining approach cells.
      routeForestWorker(unit, 'to-node', unit.gatherForestCell);
      continue;
    }
    if (attackMoveResumePathBlocked) {
      unit.attackMoveResumePath = null;
      unit.attackMoveResumePathIndex = 0;
      unit.attackMoveRouteReady = false;
    }
    const requestedGoal = pendingAssignment?.destination
      ?? (unit.moveGoalCell >= 0 ? unit.moveGoalCell : unit.path[unit.path.length - 1] ?? -1);
    repairs.push({ unit, destination: requestedGoal });
  }
  enqueueRouteRepairs(repairs);
}

function enqueueRouteRepairs(repairs, { mode = 'blocked-route-repair', orderLabel = 'ROUTE REPAIR' } = {}) {
  const assignments = [];
  const groups = new Map();
  for (const { unit, destination: requestedDestination } of repairs) {
    if (!unit || unit.hp <= 0 || units[unit.id] !== unit) continue;
    const destination = nearestOpenCell(requestedDestination);
    if (destination < 0) continue;
    const startCell = nearestOpenCell(worldToCell(unit.x, unit.z));
    unit.orderRevision++;
    unit.movePlanningPending = true;
    unit.attackMoveRouteReady = false;
    unit.path = [];
    unit.pathIndex = 0;
    unit.attackMoveResumePath = null;
    unit.attackMoveResumePathIndex = 0;
    const assignment = {
      unit, destination, revision: unit.orderRevision, path: [],
      buildingTargetId: unit.buildingTargetId,
    };
    assignments.push(assignment);
    const group = groups.get(startCell) || [];
    group.push(assignment);
    groups.set(startCell, group);
  }
  if (!assignments.length) return;
  dirty = true;
  const pseudoPlayer = { team: -1, sendJson() {} };
  movePlanningQueue.push({
    orderId: nextMoveOrderId++, player: pseudoPlayer, epoch: movePlanningEpoch,
    orderLabel, mode, silent: true,
    preserveAssignmentBuildingTarget: true, buildingTargetId: null,
    startedAt: performance.now(), assignments, groups: [...groups.entries()],
    reservedDestinations: new Set(assignments.map((assignment) => assignment.destination)),
    diagnostics: { searchCount: 0, expandedCells: 0, discoveredCells: 0 },
    nextGroup: 0, planningWorkMs: 0, maxPlanningSliceMs: 0, planningSliceCount: 0,
  });
  scheduleNextMovePlanning();
}

function isResourceCell(cell) {
  for (const node of mapDefinition.resourceNodes) {
    if (worldToCell(node.x, node.z) === cell) return true;
  }
  return false;
}

// Record the routes that exist before a proposed footprint blocks any cells.
// A map may already have separate islands (including ones created by Town Centers).
function captureBuildingConnectivity() {
  const groups = new Map();
  const addAccess = (cells) => {
    const byComponent = new Map();
    for (const cell of cells) {
      const component = walkableComponents[cell];
      if (component < 0) continue;
      if (!byComponent.has(component)) byComponent.set(component, []);
      byComponent.get(component).push(cell);
    }
    for (const [component, access] of byComponent) {
      if (!groups.has(component)) groups.set(component, []);
      groups.get(component).push(access);
    }
  };
  for (const spawn of spawnByTeam) addAccess([nearestOpenCell(worldToCell(spawn.x, spawn.z))]);
  for (const node of mapDefinition.resourceNodes) addAccess([worldToCell(node.x, node.z)]);
  for (const unit of units) {
    if (unit.hp > 0) addAccess([nearestOpenCell(worldToCell(unit.x, unit.z))]);
  }
  for (const building of buildings) addAccess(buildingAccessCells(building.footprint));
  for (const center of homeTownCenters) if (center.hp > 0) addAccess(buildingAccessCells(center.footprint));
  return groups;
}

function canPlaceBuildingWithoutDisconnectingEntities(previousGroups) {
  for (const accesses of previousGroups.values()) {
    let sharedComponents = null;
    for (const cells of accesses) {
      const components = new Set(cells.map((cell) => walkableComponents[cell])
        .filter((component) => component >= 0));
      sharedComponents = sharedComponents === null ? components
        : new Set([...sharedComponents].filter((component) => components.has(component)));
      if (sharedComponents.size === 0) return false;
    }
  }
  return true;
}

function rejectBuild(player, reason, command) {
  sendOrderNotice(player, command, `BUILD REJECTED · ${reason}`);
}

function resumeBuildingConstruction(player, command) {
  if (player.team === null || !Array.isArray(command.ids)) return;
  const building = buildingsById.get(Number(command.buildingId));
  const rules = buildingRulesFor(building?.type);
  if (!building || building.team !== player.team || !rules) {
    rejectBuild(player, 'SELECT YOUR BUILDING', command);
    return;
  }
  if (building.complete) {
    rejectBuild(player, `${rules.label} IS ALREADY COMPLETE`, command);
    return;
  }
  const workers = commandUnits(command)
    .filter((unit) => unit.hp > 0 && unit.team === player.team && unitHasCapability(unit, 'build'));
  if (workers.length === 0) {
    rejectBuild(player, 'SELECT A WORKER', command);
    return;
  }

  const accessCells = buildingAccessCells(building.footprint);
  const workerCounts = new Map();
  for (const worker of workers) {
    const component = walkableComponents[nearestOpenCell(worldToCell(worker.x, worker.z))];
    workerCounts.set(component, (workerCounts.get(component) || 0) + 1);
  }
  const accessCounts = new Map();
  for (const cell of accessCells) {
    const component = walkableComponents[cell];
    accessCounts.set(component, (accessCounts.get(component) || 0) + 1);
  }
  let chosenComponent = -1;
  let chosenCount = 0;
  for (const [component, count] of workerCounts) {
    if (component >= 0 && (accessCounts.get(component) || 0) > 0 && count > chosenCount) {
      chosenComponent = component;
      chosenCount = count;
    }
  }
  if (chosenComponent < 0) {
    rejectBuild(player, 'NO REACHABLE WORKERS', command);
    return;
  }
  const builders = workers.filter((worker) => (
    walkableComponents[nearestOpenCell(worldToCell(worker.x, worker.z))] === chosenComponent
  ));
  const meanX = builders.reduce((sum, worker) => sum + worker.x, 0) / builders.length;
  const meanZ = builders.reduce((sum, worker) => sum + worker.z, 0) / builders.length;
  let accessCell = -1;
  let nearestDistance = Infinity;
  for (const cell of accessCells) {
    if (walkableComponents[cell] !== chosenComponent) continue;
    const point = cellToWorld(cell);
    const distance = (point.x - meanX) ** 2 + (point.z - meanZ) ** 2;
    if (distance < nearestDistance) {
      nearestDistance = distance;
      accessCell = cell;
    }
  }
  if (accessCell < 0) {
    rejectBuild(player, 'NO REACHABLE WORKERS', command);
    return;
  }
  const access = cellToWorld(accessCell);
  assignFormationMove(player, {
    type: 'move', ids: builders.map((worker) => worker.id), x: access.x, z: access.z,
    clientOrderToken: command.clientOrderToken,
  }, building.id, 'BUILD RESUME ORDER');
  dirty = true;
  sendOrderNotice(player, command, 'CONSTRUCTION RESUMED · WORKERS ROUTING');
}

function buildBuilding(player, command) {
  if (player.team === null || !Array.isArray(command.ids)) return;
  if (command.buildingId !== undefined && command.buildingId !== null) {
    resumeBuildingConstruction(player, command);
    return;
  }
  const rules = buildingRulesFor(command.buildingType);
  if (!rules) {
    rejectBuild(player, 'UNKNOWN BUILDING TYPE', command);
    return;
  }
  const missing = missingGameplayPrerequisites(BUILDING_DEFINITIONS[command.buildingType], teamUpgrades[player.team]);
  if (missing.length) {
    rejectBuild(player, `REQUIRES ${missing.map((id) => TECHNOLOGY_DEFINITIONS[id].label).join(' + ')}`, command);
    return;
  }
  if (buildings.length >= MAX_BUILDINGS) {
    rejectBuild(player, 'BUILDING LIMIT REACHED', command);
    return;
  }
  const selectedWorkers = commandUnits(command)
    .filter((unit) => unit.hp > 0 && unit.team === player.team && unitHasCapability(unit, 'build'));
  if (selectedWorkers.length === 0) {
    rejectBuild(player, 'SELECT A WORKER', command);
    return;
  }
  const x = Number(command.x);
  const z = Number(command.z);
  if (!Number.isFinite(x) || !Number.isFinite(z)
    || Math.abs(x) >= MAP_HALF_X || Math.abs(z) >= MAP_HALF_Z) {
    rejectBuild(player, 'OUTSIDE THE MAP', command);
    return;
  }
  const centerCell = worldToCell(x, z);
  const footprint = buildingFootprint(centerCell, command.buildingType);
  if (!footprint || footprint.some((cell) => blocked[cell] || buildingBlocked[cell] || townCenterBlocked[cell])) {
    rejectBuild(player, 'SPACE BLOCKED', command);
    return;
  }
  if (footprint.some(isResourceCell)) {
    rejectBuild(player, 'RESOURCE NODE IN FOOTPRINT', command);
    return;
  }
  for (const cell of footprint) {
    const column = cell % MAP_WIDTH;
    const row = Math.floor(cell / MAP_WIDTH);
    if (mapDefinition.triggers.some((trigger) => column >= trigger.zone.column
      && column < trigger.zone.column + trigger.zone.width
      && row >= trigger.zone.row && row < trigger.zone.row + trigger.zone.height)) {
      rejectBuild(player, 'OBJECTIVE IN FOOTPRINT', command);
      return;
    }
  }
  if (units.some((unit) => unit.hp > 0 && footprint.includes(worldToCell(unit.x, unit.z)))) {
    rejectBuild(player, 'UNITS IN FOOTPRINT', command);
    return;
  }

  const center = cellToWorld(centerCell);
  const id = nextBuildingId++;
  const building = {
    id, team: player.team, type: command.buildingType, x: center.x, z: center.z,
    footprint, hp: BUILDING_DEFINITIONS[command.buildingType].maxHp, progress: 0, complete: false, queue: 0, productionQueue: [], trainingRemaining: 0,
    productionBlocked: false, rallyCell: -1,
  };
  const previousConnectivity = captureBuildingConnectivity();
  const previousComponents = walkableComponents.slice();
  for (const cell of footprint) buildingBlocked[cell] = 1;
  rebuildWalkableComponents();
  const accessCells = buildingAccessCells(footprint);
  const teamComponent = walkableComponents[nearestOpenCell(
    worldToCell(spawnByTeam[player.team].x, spawnByTeam[player.team].z),
  )];
  if (!canPlaceBuildingWithoutDisconnectingEntities(previousConnectivity) || accessCells.length === 0
    || !accessCells.some((cell) => walkableComponents[cell] === teamComponent)
    || !activeMoveRoutesRemainConnected(previousComponents)) {
    for (const cell of footprint) buildingBlocked[cell] = 0;
    rebuildWalkableComponents();
    rejectBuild(player, 'WOULD BLOCK A ROUTE', command);
    return;
  }
  const workerCounts = new Map();
  for (const worker of selectedWorkers) {
    const component = walkableComponents[nearestOpenCell(worldToCell(worker.x, worker.z))];
    workerCounts.set(component, (workerCounts.get(component) || 0) + 1);
  }
  const accessCounts = new Map();
  for (const cell of accessCells) {
    const component = walkableComponents[cell];
    accessCounts.set(component, (accessCounts.get(component) || 0) + 1);
  }
  let chosenComponent = -1;
  let chosenCount = 0;
  for (const [component, count] of workerCounts) {
    if ((accessCounts.get(component) || 0) > 0 && count > chosenCount) {
      chosenComponent = component;
      chosenCount = count;
    }
  }
  if (chosenComponent < 0) {
    for (const cell of footprint) buildingBlocked[cell] = 0;
    rebuildWalkableComponents();
    rejectBuild(player, 'NO REACHABLE WORKERS', command);
    return;
  }
  const builders = selectedWorkers.filter((worker) => (
    walkableComponents[nearestOpenCell(worldToCell(worker.x, worker.z))] === chosenComponent
  ));
  const meanX = builders.reduce((sum, worker) => sum + worker.x, 0) / builders.length;
  const meanZ = builders.reduce((sum, worker) => sum + worker.z, 0) / builders.length;
  let accessCell = -1;
  let nearestDistance = Infinity;
  for (const cell of accessCells) {
    if (walkableComponents[cell] !== chosenComponent) continue;
    const point = cellToWorld(cell);
    const distance = (point.x - meanX) ** 2 + (point.z - meanZ) ** 2;
    if (distance < nearestDistance) {
      nearestDistance = distance;
      accessCell = cell;
    }
  }
  if (accessCell < 0) {
    for (const cell of footprint) buildingBlocked[cell] = 0;
    rebuildWalkableComponents();
    rejectBuild(player, 'NO REACHABLE WORKERS', command);
    return;
  }
  if (teamWood[player.team] + 1e-9 < rules.woodCost
    || teamFood[player.team] + 1e-9 < rules.constructionFoodCost) {
    for (const cell of footprint) buildingBlocked[cell] = 0;
    rebuildWalkableComponents();
    rejectBuild(player, `NEED ${rules.woodCost} WOOD${rules.constructionFoodCost ? ` + ${rules.constructionFoodCost} FOOD` : ''}`, command);
    return;
  }

  buildings.push(building);
  buildingsById.set(id, building);
  navigationRevision++;
  visionCoverageBySourceCell = new Array(CELL_COUNT);
  teamWood[player.team] = Math.max(0, teamWood[player.team] - rules.woodCost);
  teamFood[player.team] = Math.max(0, teamFood[player.team] - rules.constructionFoodCost);
  attackFlowFields.clear();
  replanPathsBlockedBy(building.footprint);
  const access = cellToWorld(accessCell);
  assignFormationMove(player, {
    type: 'move', ids: builders.map((worker) => worker.id), x: access.x, z: access.z,
    clientOrderToken: command.clientOrderToken,
  }, id, 'BUILD ORDER');
  dirty = true;
  sendOrderNotice(player, command, `${rules.label} PLACED · WORKERS BUILDING`);
}

function findProductionSpawnCell(building) {
  const accessCells = buildingAccessCells(building.footprint);
  if (accessCells.length === 0) return -1;
  const teamSpawn = spawnByTeam[building.team];
  const componentId = teamSpawn
    ? walkableComponents[nearestOpenCell(worldToCell(teamSpawn.x, teamSpawn.z))] : -1;
  if (componentId < 0) return -1;
  const occupied = new Set();
  for (const unit of units) if (unit.hp > 0) occupied.add(worldToCell(unit.x, unit.z));
  for (const node of mapDefinition.resourceNodes) occupied.add(worldToCell(node.x, node.z));
  for (const cell of accessCells) {
    const spawnCell = findAvailableCellNear(cell, componentId, occupied, 4);
    if (spawnCell >= 0) return spawnCell;
  }
  return -1;
}

function trainArcher(player, command) {
  if (player.team === null) return;
  const building = buildingsById.get(Number(command.buildingId));
  if (!building || building.team !== player.team || building.type !== 'archery-range' || !building.complete) {
    player.sendJson({ type: 'notice', message: 'ARCHER TRAINING REJECTED · SELECT A COMPLETED ARCHERY RANGE' });
    return;
  }
  if (building.queue >= MAX_BUILDING_QUEUE) {
    player.sendJson({ type: 'notice', message: `ARCHER TRAINING REJECTED · QUEUE FULL ${MAX_BUILDING_QUEUE}/${MAX_BUILDING_QUEUE}` });
    return;
  }
  const queued = queuedUnitsForTeam(player.team);
  const alive = aliveCounts();
  if (alive[player.team] + queued >= MAX_TEAM_ROSTER
    || alive[0] + alive[1] + queuedUnitsTotal() >= MAX_UNITS) {
    player.sendJson({ type: 'notice', message: 'ARCHER TRAINING REJECTED · UNIT CAP REACHED' });
    return;
  }
  if (teamFood[player.team] + 1e-9 < ARCHER_FOOD_COST
    || teamWood[player.team] + 1e-9 < ARCHER_WOOD_COST) {
    player.sendJson({ type: 'notice', message: `ARCHER TRAINING REJECTED · NEED ${ARCHER_FOOD_COST} FOOD + ${ARCHER_WOOD_COST} WOOD` });
    return;
  }
  const missing = missingGameplayPrerequisites(UNIT_DEFINITIONS.archer, teamUpgrades[player.team]);
  if (missing.length) {
    player.sendJson({ type: 'notice', message: `ARCHER TRAINING REJECTED · REQUIRES ${missing.map((id) => TECHNOLOGY_DEFINITIONS[id].label).join(' + ')}` });
    return;
  }
  if (!canReservePopulation(player.team, 'archer')) {
    player.sendJson({ type: 'notice', message: 'ARCHER TRAINING REJECTED · POPULATION FULL · BUILD A HOUSE' });
    return;
  }
  if (findProductionSpawnCell(building) < 0) {
    player.sendJson({ type: 'notice', message: 'ARCHER TRAINING REJECTED · NO SPAWN ROOM' });
    return;
  }
  teamFood[player.team] = Math.max(0, teamFood[player.team] - ARCHER_FOOD_COST);
  teamWood[player.team] = Math.max(0, teamWood[player.team] - ARCHER_WOOD_COST);
  enqueueBuildingUnit(building, 'archer');
  building.productionBlocked = false;
  dirty = true;
  player.sendJson({ type: 'notice', message: `ARCHER QUEUED · ${building.queue}/${MAX_BUILDING_QUEUE}` });
}

function setBuildingRallyPoint(player, command) {
  if (player.team === null) return;
  const building = buildingsById.get(Number(command.buildingId));
  if (!building || building.team !== player.team || !BUILDING_DEFINITIONS[building.type].products.length) {
    sendOrderNotice(player, command, 'RALLY POINT REJECTED · SELECT YOUR PRODUCTION BUILDING');
    return;
  }
  if (command.clear === true) {
    building.rallyCell = -1;
    dirty = true;
    sendOrderNotice(player, command, 'RALLY POINT CLEARED');
    return;
  }
  const x = Number(command.x);
  const z = Number(command.z);
  if (!Number.isFinite(x) || !Number.isFinite(z)
    || x < -MAP_HALF_X || x >= MAP_HALF_X || z < -MAP_HALF_Z || z >= MAP_HALF_Z) {
    sendOrderNotice(player, command, 'RALLY POINT REJECTED · CHOOSE GROUND ON THE MAP');
    return;
  }
  const teamComponent = walkableComponents[buildingAccessCells(building.footprint)[0]] ?? -1;
  const resourceCells = new Set(mapDefinition.resourceNodes.map((node) => worldToCell(node.x, node.z)));
  const destination = findAvailableCellNear(worldToCell(x, z), teamComponent, resourceCells, 8);
  if (destination < 0) {
    sendOrderNotice(player, command, 'RALLY POINT REJECTED · NO REACHABLE OPEN GROUND NEARBY');
    return;
  }
  building.rallyCell = destination;
  dirty = true;
  sendOrderNotice(player, command, 'RALLY POINT SET');
}

function routeProducedUnitToBuildingRally(unit, building) {
  if (!unit || !Number.isInteger(building.rallyCell) || building.rallyCell < 0) return;
  const teamComponent = walkableComponents[nearestOpenCell(worldToCell(unit.x, unit.z))];
  const resourceCells = new Set(mapDefinition.resourceNodes.map((node) => worldToCell(node.x, node.z)));
  const requested = building.rallyCell;
  const destination = teamComponent >= 0 && walkableComponents[requested] === teamComponent
    && !resourceCells.has(requested)
    ? requested : findAvailableCellNear(requested, teamComponent, resourceCells, 12);
  if (destination < 0) {
    building.rallyCell = -1;
    dirty = true;
    return;
  }
  if (destination !== requested) {
    building.rallyCell = destination;
    dirty = true;
  }
  unit.moveGoalCell = destination;
  if (worldToCell(unit.x, unit.z) !== destination) {
    enqueueRouteRepairs([{ unit, destination }], {
      mode: 'production-rally', orderLabel: 'PRODUCTION RALLY',
    });
  }
}

function updateBuildingAndProduction() {
  for (const unit of units) {
    if (unit.hp <= 0 || !unitHasCapability(unit, unit.repairing ? 'repair' : 'build') || unit.buildingTargetId === null) continue;
    const building = buildingsById.get(unit.buildingTargetId);
    if (!building || (building.complete && !unit.repairing) || (unit.repairing && !building.complete)) {
      unit.buildingTargetId = null; unit.repairing = false;
      continue;
    }
    const dx = Math.max(0, Math.abs(unit.x - building.x) - BUILDING_DEFINITIONS[building.type].footprint / 2);
    const dz = Math.max(0, Math.abs(unit.z - building.z) - BUILDING_DEFINITIONS[building.type].footprint / 2);
    if (dx * dx + dz * dz > BUILDER_INTERACTION_RANGE * BUILDER_INTERACTION_RANGE) continue;
    if (unit.repairing) {
      const repair = buildingRepairStep(building, teamWood[unit.team], STEP_SECONDS);
      if (repair.hp > 0) { building.hp += repair.hp; teamWood[unit.team] = Math.max(0, teamWood[unit.team] - repair.wood); dirty = true; }
      if (building.hp >= BUILDING_DEFINITIONS[building.type].maxHp - 1e-9) {
        building.hp = BUILDING_DEFINITIONS[building.type].maxHp; unit.buildingTargetId = null; unit.repairing = false;
      }
      continue;
    }
    const rules = buildingRulesFor(building.type);
    building.progress = Math.min(1, building.progress + STEP_SECONDS / rules.buildSeconds);
    dirty = true;
    if (building.progress >= 1) {
      building.complete = true;
      for (const builder of units) {
        if (builder.buildingTargetId === building.id) builder.buildingTargetId = null;
      }
      broadcastGameplayNotice(building.team, building.x, building.z,
        `${rules.label} COMPLETE${rules.trainLabel ? ` · TRAIN ${rules.trainLabel}` : ''}`);
    }
  }

  for (const building of buildings) {
    if (!building.complete || building.queue <= 0) continue;
    building.trainingRemaining = Math.max(0, building.trainingRemaining - STEP_SECONDS);
    if (building.trainingRemaining > 0) {
      dirty = true;
      continue;
    }
    const spawnCell = findProductionSpawnCell(building);
    if (spawnCell < 0) {
      if (!building.productionBlocked) {
        building.productionBlocked = true;
        dirty = true;
      }
      continue;
    }
    const spawn = cellToWorld(spawnCell);
    const producedUnit = spawnProducedUnit(building.team, building.productionQueue[0], spawn.x, spawn.z);
    if (!producedUnit) {
      if (!building.productionBlocked) {
        building.productionBlocked = true;
        dirty = true;
      }
      continue;
    }
    const producedKind = building.productionQueue.shift();
    building.queue = building.productionQueue.length;
    building.productionBlocked = false;
    building.trainingRemaining = building.queue > 0 ? UNIT_DEFINITIONS[building.productionQueue[0]].trainSeconds : 0;
    routeProducedUnitToBuildingRally(producedUnit, building);
    dirty = true;
    broadcastGameplayNotice(building.team, spawn.x, spawn.z,
      `${building.team === 0 ? 'AZURE' : 'EMBER'} ${UNIT_DEFINITIONS[producedKind].label.toUpperCase()} READY`);
  }

  for (let team = 0; team < workerProduction.length; team++) {
    const production = workerProduction[team];
    if (production.queue <= 0) continue;
    if (production.trainingRemaining > 0) {
      production.trainingRemaining = Math.max(0, production.trainingRemaining - STEP_SECONDS);
      dirty = true;
      if (production.trainingRemaining > 0) continue;
    }
    const spawnCell = findTownCenterProductionSpawnCell(team);
    if (spawnCell < 0) {
      if (!production.productionBlocked) {
        production.productionBlocked = true;
        dirty = true;
      }
      continue;
    }
    const spawn = cellToWorld(spawnCell);
    const producedWorker = spawnProducedUnit(team, 'worker', spawn.x, spawn.z);
    if (!producedWorker) {
      if (!production.productionBlocked) {
        production.productionBlocked = true;
        dirty = true;
      }
      continue;
    }
    routeProducedUnitToBuildingRally(producedWorker, homeTownCenters[team]);
    production.queue--;
    production.productionBlocked = false;
    production.trainingRemaining = production.queue > 0 ? WORKER_TRAIN_SECONDS : 0;
    dirty = true;
    broadcastGameplayNotice(team, spawn.x, spawn.z,
      `${team === 0 ? 'AZURE' : 'EMBER'} WORKER READY`);
  }
}

function updateTeamResearch() {
  for (let team = 0; team < teamResearch.length; team++) {
    const active = teamResearch[team];
    if (!active) continue;
    const rules = researchRulesFor(active.type);
    const building = buildingsById.get(active.buildingId);
    if (!rules || !building || building.team !== team || !building.complete) {
      teamResearch[team] = null;
      dirty = true;
      continue;
    }
    active.remaining = Math.max(0, active.remaining - STEP_SECONDS);
    dirty = true;
    if (active.remaining > 0) continue;
    teamUpgrades[team][rules.upgradeKey] = true;
    teamResearch[team] = null;
    broadcastGameplayNotice(team, building.x, building.z,
      `${team === 0 ? 'AZURE' : 'EMBER'} ${rules.label} COMPLETE · +20% ATTACK`);
  }
}

function buildFormationSlots(selectedUnits, centerCell, formation) {
  const count = selectedUnits.length;
  const slots = new Int32Array(count);
  if (formation === 'box') {
    const columns = Math.min(Math.ceil(Math.sqrt(count)), MAP_WIDTH);
    const rows = Math.min(Math.ceil(count / columns), MAP_HEIGHT);
    const centerColumn = centerCell % MAP_WIDTH;
    const centerRow = Math.floor(centerCell / MAP_WIDTH);
    const firstColumn = Math.max(0, Math.min(MAP_WIDTH - columns, centerColumn - Math.floor(columns / 2)));
    const firstRow = Math.max(0, Math.min(MAP_HEIGHT - rows, centerRow - Math.floor(rows / 2)));
    for (let index = 0; index < count; index++) {
      const column = firstColumn + (index % columns);
      const row = firstRow + Math.min(rows - 1, Math.floor(index / columns));
      slots[index] = cellIndex(column, row);
    }
    return { slots, columns, rows, direction: { x: 0, z: 1 }, side: { x: 1, z: 0 } };
  }

  const center = cellToWorld(centerCell);
  let averageX = 0;
  let averageZ = 0;
  for (const unit of selectedUnits) {
    averageX += unit.x;
    averageZ += unit.z;
  }
  averageX /= count;
  averageZ /= count;
  const forwardX = center.x - averageX;
  const forwardZ = center.z - averageZ;
  const forwardLength = Math.hypot(forwardX, forwardZ);
  const directionX = forwardLength > 0.001 ? forwardX / forwardLength : 0;
  const directionZ = forwardLength > 0.001 ? forwardZ / forwardLength : -1;
  const sideX = -directionZ;
  const sideZ = directionX;
  const targetAspect = formation === 'line' ? 4 : 0.25;
  const halfMapX = (MAP_WIDTH - 1) / 2;
  const halfMapZ = (MAP_HEIGHT - 1) / 2;
  let bestShape = null;
  let bestShapeScore = Infinity;

  for (let candidateColumns = 1; candidateColumns <= count; candidateColumns++) {
    const candidateRows = Math.ceil(count / candidateColumns);
    const lateralExtent = (candidateColumns - 1) / 2;
    const depthExtent = (candidateRows - 1) / 2;
    const extentX = Math.abs(sideX) * lateralExtent + Math.abs(directionX) * depthExtent;
    const extentZ = Math.abs(sideZ) * lateralExtent + Math.abs(directionZ) * depthExtent;
    if (extentX > halfMapX + 1e-6 || extentZ > halfMapZ + 1e-6) continue;

    const aspect = candidateColumns / candidateRows;
    const score = Math.abs(Math.log(aspect / targetAspect));
    if (score < bestShapeScore) {
      bestShape = { columns: candidateColumns, rows: candidateRows, extentX, extentZ };
      bestShapeScore = score;
    }
  }

  let columns;
  let rows;
  let spacing = 1;
  if (bestShape) {
    ({ columns, rows } = bestShape);
  } else {
    columns = Math.ceil(Math.sqrt(count * targetAspect));
    rows = Math.ceil(count / columns);
    const lateralExtent = (columns - 1) / 2;
    const depthExtent = (rows - 1) / 2;
    const extentX = Math.abs(sideX) * lateralExtent + Math.abs(directionX) * depthExtent;
    const extentZ = Math.abs(sideZ) * lateralExtent + Math.abs(directionZ) * depthExtent;
    spacing = Math.min(1, halfMapX / Math.max(extentX, 0.001), halfMapZ / Math.max(extentZ, 0.001));
  }

  const lateralExtent = (columns - 1) / 2;
  const depthExtent = (rows - 1) / 2;
  const extentX = (Math.abs(sideX) * lateralExtent + Math.abs(directionX) * depthExtent) * spacing;
  const extentZ = (Math.abs(sideZ) * lateralExtent + Math.abs(directionZ) * depthExtent) * spacing;
  const originX = Math.max(-halfMapX + extentX, Math.min(halfMapX - extentX, center.x));
  const originZ = Math.max(-halfMapZ + extentZ, Math.min(halfMapZ - extentZ, center.z));

  for (let index = 0; index < count; index++) {
    const row = Math.floor(index / columns);
    const rowStart = row * columns;
    const rowCount = Math.min(columns, count - rowStart);
    const lateral = index - rowStart - (rowCount - 1) / 2;
    const depth = row - (rows - 1) / 2;
    const x = originX + (sideX * lateral + directionX * depth) * spacing;
    const z = originZ + (sideZ * lateral + directionZ * depth) * spacing;
    slots[index] = worldToCell(x, z);
  }
  return { slots, columns, rows, direction: { x: directionX, z: directionZ }, side: { x: sideX, z: sideZ } };
}

function nearestBuilderAccessCell(unit, componentId, accessCells, reservedCells) {
  let nearestOpen = -1;
  let nearestOpenDistance = Infinity;
  let nearestShared = -1;
  let nearestSharedDistance = Infinity;
  for (const cell of accessCells) {
    if (walkableComponents[cell] !== componentId) continue;
    const point = cellToWorld(cell);
    const distance = (unit.x - point.x) ** 2 + (unit.z - point.z) ** 2;
    if (distance < nearestSharedDistance || (distance === nearestSharedDistance && cell < nearestShared)) {
      nearestShared = cell;
      nearestSharedDistance = distance;
    }
    if (!reservedCells.has(cell)
      && (distance < nearestOpenDistance || (distance === nearestOpenDistance && cell < nearestOpen))) {
      nearestOpen = cell;
      nearestOpenDistance = distance;
    }
  }
  return nearestOpen >= 0 ? nearestOpen : nearestShared;
}

function assignFormationMove(player, command, buildingTargetId = null, orderLabel = null) {
  if (player.team === null || !Array.isArray(command.ids)) {
    sendOrderNotice(player, command, 'MOVE REJECTED · NO VALID UNITS');
    return;
  }
  const attackMove = command.type === 'attackMove';
  const formation = ['line', 'column'].includes(command.formation) ? command.formation : 'box';
  const planningStartedAt = performance.now();
  const selectedUnits = commandUnits(command)
    .filter((unit) => unit.hp > 0 && unit.team === player.team
      && (buildingTargetId === null || unitHasCapability(unit, command.type === 'repairBuilding' ? 'repair' : 'build')));
  if (selectedUnits.length === 0) {
    sendOrderNotice(player, command, 'MOVE REJECTED · NO VALID UNITS');
    return;
  }

  const centerX = Number(command.x);
  const centerZ = Number(command.z);
  if (!Number.isFinite(centerX) || !Number.isFinite(centerZ)) {
    sendOrderNotice(player, command, 'MOVE REJECTED · INVALID DESTINATION');
    return;
  }
  const queueWaypoint = command.queue === true && buildingTargetId === null;
  const canQueueBehindCurrentRoute = (unit) => unit.queuedWaypoints.length > 0
    || (unit.gatherNodeId === null && unit.gatherForestCell < 0 && unit.buildingTargetId === null
      && (unit.movePlanningPending || unit.pathIndex < unit.path.length
        || unit.attackTargetId >= 0 || unit.attackBuildingTargetId >= 0 || unit.attackMove));
  if (queueWaypoint && selectedUnits.some((unit) => (
    canQueueBehindCurrentRoute(unit) && unit.queuedWaypoints.length >= MAX_QUEUED_WAYPOINTS
  ))) {
    sendOrderNotice(player, command, `WAYPOINT REJECTED · QUEUE LIMIT ${MAX_QUEUED_WAYPOINTS}`);
    return;
  }
  const center = worldToCell(centerX, centerZ);
  const centerColumn = center % MAP_WIDTH;
  const centerRow = Math.floor(center / MAP_WIDTH);
  const targetBuilding = buildingTargetId === null ? null : buildingsById.get(buildingTargetId);
  if (buildingTargetId !== null && !targetBuilding) {
    sendOrderNotice(player, command, 'BUILD REJECTED · BUILDING UNAVAILABLE');
    return;
  }
  const buildingAccess = targetBuilding ? buildingAccessCells(targetBuilding.footprint) : null;
  const formationLayout = buildingAccess ? null : buildFormationSlots(selectedUnits, center, formation);
  const orderedUnits = buildingAccess ? selectedUnits : orderUnitsForFormation(selectedUnits, formationLayout);
  const unitCells = orderedUnits.map((unit) => nearestOpenCell(worldToCell(unit.x, unit.z)));
  const unitComponents = unitCells.map((cell) => walkableComponents[cell]);
  let fallbackPools = null;
  const reservedDestinations = new Set();
  const assignments = [];
  const assignmentsByStart = new Map();
  let queuedCount = 0;

  orderedUnits.forEach((unit, index) => {
    const requestedCell = buildingAccess ? -1 : formationLayout.slots[index];
    const componentId = unitComponents[index];
    let destination = buildingAccess
      ? nearestBuilderAccessCell(unit, componentId, buildingAccess, reservedDestinations)
      : findAvailableCellNear(requestedCell, componentId, reservedDestinations);
    if (destination < 0 && !buildingAccess) {
      fallbackPools ||= buildMoveFallbackPools(unitComponents, centerColumn, centerRow);
      const candidates = fallbackPools.cellsByComponent.get(componentId) || [];
      let cursor = fallbackPools.cursors.get(componentId) || 0;
      while (cursor < candidates.length && reservedDestinations.has(candidates[cursor])) cursor++;
      destination = candidates[cursor] ?? candidates[0] ?? unitCells[index];
      fallbackPools.cursors.set(componentId, cursor + 1);
    }
    if (destination < 0) return;
    reservedDestinations.add(destination);
    if (queueWaypoint && canQueueBehindCurrentRoute(unit)) {
      unit.persistentOrder = null;
      unit.queuedWaypoints.push({ destination, attackMove });
      queuedCount++;
      dirty = true;
      return;
    }
    if (!queueWaypoint || unit.queuedWaypoints.length > 0) unit.queuedWaypoints.length = 0;
    unit.moveGoalCell = destination;
    cancelGatherOrder(unit);
    unit.buildingTargetId = buildingTargetId;
    unit.repairing = command.type === 'repairBuilding' && buildingTargetId !== null;
    unit.attackTargetId = -1;
    unit.attackBuildingTargetId = -1;
    unit.movePlanningPending = true;
    unit.repathTimer = 0;
    unit.lastAttackCell = -1;
    unit.holdingPosition = false;
    unit.persistentOrder = null;
    unit.attackMove = attackMove;
    unit.attackMoveRouteReady = false;
    unit.attackMoveResumePath = null;
    unit.attackMoveResumePathIndex = 0;
    unit.attackMoveAnchorX = unit.x;
    unit.attackMoveAnchorZ = unit.z;
    unit.attackMoveScanTick = tickNumber + (unit.id % ATTACK_MOVE_SCAN_INTERVAL_TICKS);
    unit.orderRevision++;
    unit.path = [];
    unit.pathIndex = 0;
    const assignment = { unit, destination, revision: unit.orderRevision, path: [] };
    assignments.push(assignment);
    const startCell = unitCells[index];
    const group = assignmentsByStart.get(startCell) || [];
    group.push(assignment);
    assignmentsByStart.set(startCell, group);
  });

  if (queuedCount > 0) sendOrderNotice(player, command, `WAYPOINT QUEUED · ${queuedCount} UNITS`);
  if (assignments.length === 0) return;

  const setupMs = performance.now() - planningStartedAt;
  const planningGroups = SHARED_MOVE_PATHS
    ? [...assignmentsByStart.entries()]
    : assignments.map((assignment) => [
      nearestOpenCell(worldToCell(assignment.unit.x, assignment.unit.z)),
      [assignment],
    ]);
  const job = {
    orderId: nextMoveOrderId++, player, epoch: movePlanningEpoch,
    clientOrderToken: clientOrderToken(command),
    orderLabel: orderLabel || (queueWaypoint ? 'WAYPOINT ORDER'
      : attackMove ? 'ATTACK MOVE ORDER' : 'MOVE ORDER'),
    buildingTargetId,
    mode: SHARED_MOVE_PATHS ? 'shared-start' : 'per-unit',
    startedAt: planningStartedAt,
    assignments,
    groups: planningGroups,
    reservedDestinations,
    diagnostics: { searchCount: 0, expandedCells: 0, discoveredCells: 0 },
    nextGroup: 0,
    setupMs,
    queueEnteredAt: performance.now(),
    queueWaitMs: 0,
    pathPlanningWorkMs: 0,
    maxPathPlanningSliceMs: 0,
    finalizationMs: 0,
    planningWorkMs: setupMs,
    maxPlanningSliceMs: setupMs,
    planningSliceCount: 1,
  };
  movePlanningQueue.push(job);
  const planningLabel = orderLabel
    ? orderLabel.replace(/ ORDER$/, '')
    : attackMove ? 'ATTACK MOVE' : 'MOVE';
  sendOrderNotice(player, job.clientOrderToken, `PLANNING ${planningLabel} · ${assignments.length} UNITS`);
  scheduleNextMovePlanning();
  return assignments;
}

// Persistent intent rides the existing revision-safe, sliced planning queue.
// Replanning is staggered and capped independently of army size; stalled routes
// retry slowly, while Follow uses a four-cell deadband around a two-cell offset.
const PERSISTENT_PLAN_BUDGET = 64;
function assignPatrolOrder(player, command) {
  if (!Array.isArray(command.ids)) { sendOrderNotice(player, command, 'PATROL REJECTED · NO VALID UNITS'); return; }
  const starts = new Map(commandUnits(command).map(unit => [unit.id, nearestOpenCell(worldToCell(unit.x, unit.z))]));
  const assignments = assignFormationMove(player, { ...command, type: 'attackMove', queue: false }, null, 'PATROL ORDER');
  for (const { unit, destination } of assignments || []) {
    unit.persistentOrder = { type: 'patrol', start: starts.get(unit.id), end: destination,
      leg: 1, status: 'active', nextTick: tickNumber + (unit.id % TICK_RATE) };
  }
}
function assignFollowOrder(player, command) {
  if (!Array.isArray(command.ids)) { sendOrderNotice(player, command, 'FOLLOW REJECTED · NO VALID UNITS'); return; }
  const target = units[command.targetId];
  if (player.team === null || !target || target.hp <= 0 || target.team !== player.team
    || !Number.isInteger(command.targetGeneration) || target.generation !== command.targetGeneration) {
    sendOrderNotice(player, command, 'FOLLOW REJECTED · LIVING FRIENDLY TARGET REQUIRED'); return;
  }
  const selectedUnits = commandUnits(command).filter(unit => unit.hp > 0 && unit.team === player.team && unit !== target);
  const selectedSet = new Set(selectedUnits.map(unit => unit.id));
  let leader = target; const visited = new Set();
  while (leader) {
    if (selectedSet.has(leader.id) || visited.has(leader.id)) {
      sendOrderNotice(player, command, 'FOLLOW REJECTED · FOLLOW CYCLE'); return;
    }
    visited.add(leader.id);
    leader = leader.persistentOrder?.type === 'follow' ? units[leader.persistentOrder.targetId] : null;
  }
  if (!selectedUnits.length) { sendOrderNotice(player, command, 'FOLLOW REJECTED · NO VALID UNITS'); return; }
  assignStationaryOrder({ ...player, sendJson() {} }, { type: 'stop', ids: selectedUnits.map(unit => unit.id) });
  for (const unit of selectedUnits) {
    unit.persistentOrder = { type: 'follow', targetId: target.id, targetGeneration: target.generation,
      status: 'following', nextTick: tickNumber + (unit.id % TICK_RATE), lastTargetCell: -1 };
  }
  dirty = true;
  sendOrderNotice(player, command, `FOLLOW ORDER · ${selectedUnits.length} UNITS`);
}
function updatePersistentOrders() {
  const repairs = [];
  for (const unit of units) {
    const order = unit?.persistentOrder;
    if (!order || unit.hp <= 0 || tickNumber < order.nextTick) continue;
    order.nextTick = tickNumber + TICK_RATE;
    let target = null;
    if (order.type === 'follow') {
      target = units[order.targetId];
      if (!target || target.hp <= 0 || target.team !== unit.team || target.generation !== order.targetGeneration) {
        // Losing a friendly leader stops safely; a recycled slot is never followed.
        assignStationaryOrder({ team: unit.team, sendJson() {} }, { type: 'stop', ids: [unit.id] });
        continue;
      }
    }
    if (unit.movePlanningPending || unit.attackTargetId >= 0 || unit.attackBuildingTargetId >= 0) continue;
    const start = nearestOpenCell(worldToCell(unit.x, unit.z));
    let destination;
    if (order.type === 'patrol') {
      destination = order.leg ? order.end : order.start;
      if (unit.pathIndex < unit.path.length) continue;
      if (start === destination) { order.leg = 1 - order.leg; destination = order.leg ? order.end : order.start; }
    } else {
      const targetCell = nearestOpenCell(worldToCell(target.x, target.z));
      if (walkableComponents[start] !== walkableComponents[targetCell]) {
        order.status = 'blocked'; order.nextTick = tickNumber + TICK_RATE * 2; dirty = true; continue;
      }
      const distance = Math.hypot(target.x - unit.x, target.z - unit.z);
      if (distance <= 4) {
        if (unit.pathIndex < unit.path.length) { unit.orderRevision++; unit.path = []; unit.pathIndex = 0; }
        order.status = 'following'; dirty = true; continue;
      }
      if (unit.pathIndex < unit.path.length && targetCell === order.lastTargetCell) continue;
      const angle = (unit.id * 2.399963229728653);
      destination = findAvailableCellNear(worldToCell(target.x + Math.cos(angle) * 2, target.z + Math.sin(angle) * 2),
        walkableComponents[targetCell], new Set());
      if (destination < 0) destination = targetCell;
      order.lastTargetCell = targetCell;
    }
    if (walkableComponents[start] !== walkableComponents[destination]) {
      order.status = 'blocked'; order.nextTick = tickNumber + TICK_RATE * 2; dirty = true; continue;
    }
    if (repairs.length >= PERSISTENT_PLAN_BUDGET) { order.nextTick = tickNumber + 1; continue; }
    order.status = order.type === 'follow' ? 'following' : 'active';
    repairs.push({ unit, destination });
  }
  enqueueRouteRepairs(repairs, { mode: 'persistent-order', orderLabel: 'PERSISTENT ROUTE' });
}

// Stationary orders invalidate sliced planning jobs by revision, preserve carried
// resources, and abandon work without canceling the shared construction itself.
function assignStationaryOrder(player, command) {
  const label = command.type === 'holdPosition' ? 'HOLD POSITION' : 'STOP';
  const selectedUnits = player.team === null || !Array.isArray(command.ids) ? []
    : commandUnits(command).filter(unit => unit.hp > 0 && unit.team === player.team);
  if (!selectedUnits.length) {
    sendOrderNotice(player, command, `${label} REJECTED · NO VALID UNITS`);
    return;
  }
  for (const unit of selectedUnits) {
    cancelGatherOrder(unit);
    clearAttackMoveOrder(unit);
    unit.holdingPosition = command.type === 'holdPosition';
    unit.orderRevision++;
    unit.movePlanningPending = false;
    unit.moveGoalCell = -1;
    unit.path = [];
    unit.pathIndex = 0;
    unit.queuedWaypoints.length = 0;
    unit.buildingTargetId = null;
    unit.repairing = false;
    unit.attackTargetId = -1;
    unit.attackBuildingTargetId = -1;
    unit.repathTimer = 0;
    unit.lastAttackCell = -1;
    unit.attackMoveScanTick = tickNumber;
  }
  dirty = true;
  sendOrderNotice(player, command, `${label} ORDER · ${selectedUnits.length} UNITS`);
}

function assignAttack(player, command) {
  if (player.team === null || !Array.isArray(command.ids)) {
    sendOrderNotice(player, command, 'ATTACK REJECTED · NO VALID UNITS');
    return;
  }
  const target = commandUnitAt(command.targetId, command.targetGeneration);
  if (!target || target.hp <= 0 || target.team === player.team) {
    sendOrderNotice(player, command, 'ATTACK REJECTED · TARGET UNAVAILABLE');
    return;
  }
  if (mapDefinition.fogOfWar
    && !cellVisibleToTeam(player.team, worldToCell(target.x, target.z))) {
    sendOrderNotice(player, command, 'ATTACK REJECTED · TARGET UNAVAILABLE');
    return;
  }
  const selectedUnits = commandUnits(command)
    .filter((unit) => unit.hp > 0 && unit.team === player.team && unitHasCapability(unit, 'attack')
      && canCombatTarget(UNIT_DEFINITIONS[unit.kind], UNIT_DEFINITIONS[target.kind]));
  if (selectedUnits.length === 0) {
    sendOrderNotice(player, command, 'ATTACK REJECTED · NO VALID UNITS');
    return;
  }
  const targetCell = worldToCell(target.x, target.z);
  const assignments = [];
  for (const unit of selectedUnits) {
    const approach = getUnitAttackPath(unit, target);
    if (!approach?.reachable) continue;
    assignments.push({ unit, path: approach.path });
  }
  if (assignments.length === 0) {
    sendOrderNotice(player, command, 'ATTACK REJECTED · TARGET UNREACHABLE');
    return;
  }
  for (const { unit, path } of assignments) {
    cancelGatherOrder(unit);
    unit.queuedWaypoints.length = 0;
    unit.buildingTargetId = null; unit.repairing = false;
    clearAttackMoveOrder(unit);
    unit.movePlanningPending = false;
    unit.moveGoalCell = targetCell;
    unit.orderRevision++;
    unit.attackTargetId = target.id;
    unit.attackBuildingTargetId = -1;
    unit.repathTimer = 0.6;
    unit.lastAttackCell = targetCell;
    unit.path = path;
    unit.pathIndex = 0;
  }
  const unreachableCount = selectedUnits.length - assignments.length;
  sendOrderNotice(player, command, `ATTACK ORDER · ${assignments.length} UNITS${unreachableCount ? ` · ${unreachableCount} UNREACHABLE` : ''}`);
  dirty = true;
}

function assignAttackBuilding(player, command) {
  if (player.team === null || !Array.isArray(command.ids)) {
    sendOrderNotice(player, command, 'ATTACK BUILDING REJECTED · NO VALID UNITS');
    return;
  }
  const buildingId = Number(command.buildingId);
  const target = buildingsById.get(buildingId);
  if (!Number.isInteger(buildingId) || !target || target.hp <= 0 || target.team === player.team) {
    sendOrderNotice(player, command, 'ATTACK BUILDING REJECTED · TARGET UNAVAILABLE');
    return;
  }
  if (mapDefinition.fogOfWar && !buildingVisibleToTeam(player.team, target)) {
    sendOrderNotice(player, command, 'ATTACK BUILDING REJECTED · TARGET UNAVAILABLE');
    return;
  }
  const selectedUnits = commandUnits(command)
    .filter((unit) => unit.hp > 0 && unit.team === player.team && unitHasCapability(unit, 'attack-structures') && canCombatTarget(UNIT_DEFINITIONS[unit.kind], BUILDING_DEFINITIONS[target.type]));
  if (selectedUnits.length === 0) {
    sendOrderNotice(player, command, 'ATTACK BUILDING REJECTED · SELECT MILITARY UNITS');
    return;
  }

  const assignments = [];
  const fieldsByComponentAndKind = new Map();
  for (const unit of selectedUnits) {
    const start = nearestOpenCell(worldToCell(unit.x, unit.z));
    // Range is sufficient to fire; terrain connectivity only matters for approach.
    // This matches unit-target attacks and the range check in simulateTick.
    const attackRange = UNIT_DEFINITIONS[unit.kind].combat.range;
    if (distanceToBuildingEdge(unit, target) <= attackRange) {
      assignments.push({ unit, start, goal: start, path: [] });
      continue;
    }
    const componentId = walkableComponents[start];
    if (componentId < 0) continue;
    const fieldKey = `${componentId}:${unit.kind}`;
    if (!fieldsByComponentAndKind.has(fieldKey)) {
      const field = getBuildingAttackFlowField(target, componentId, unit.kind);
      fieldsByComponentAndKind.set(fieldKey, field);
    }
    const field = fieldsByComponentAndKind.get(fieldKey);
    if (!field) continue;
    const path = pathFromAttackFlow(start, field);
    if (path.length === 0 && !field.goals.has(start)) continue;
    assignments.push({ unit, start, goal: path.at(-1) ?? start, path });
  }
  if (assignments.length === 0) {
    sendOrderNotice(player, command, 'ATTACK BUILDING REJECTED · TARGET UNREACHABLE');
    return;
  }

  const targetCell = worldToCell(target.x, target.z);
  for (const { unit, goal, path } of assignments) {
    cancelGatherOrder(unit);
    unit.queuedWaypoints.length = 0;
    unit.buildingTargetId = null; unit.repairing = false;
    clearAttackMoveOrder(unit);
    unit.movePlanningPending = false;
    unit.moveGoalCell = goal;
    unit.orderRevision++;
    unit.attackTargetId = -1;
    unit.attackBuildingTargetId = target.id;
    unit.repathTimer = 0.6;
    unit.lastAttackCell = targetCell;
    unit.path = path;
    unit.pathIndex = 0;
  }
  sendOrderNotice(player, command, `ATTACK BUILDING ORDER · ${assignments.length} UNITS`);
  dirty = true;
}

function advanceQueuedWaypoints() {
  const assignments = [];
  const assignmentsByStart = new Map();

  for (const unit of units) {
    if (unit.hp <= 0) {
      if (unit.queuedWaypoints.length > 0) {
        unit.queuedWaypoints.length = 0;
        dirty = true;
      }
      continue;
    }
    if (unit.queuedWaypoints.length === 0 || unit.movePlanningPending
      || unit.attackTargetId >= 0 || unit.attackBuildingTargetId >= 0
      || unit.gatherNodeId !== null || unit.gatherForestCell >= 0 || unit.buildingTargetId !== null
      || unit.pathIndex < unit.path.length
      || (unit.attackMoveResumePath !== null
        && unit.attackMoveResumePathIndex < unit.attackMoveResumePath.length)) continue;

    const currentCell = nearestOpenCell(worldToCell(unit.x, unit.z));
    const activeGoal = unit.moveGoalCell >= 0 ? nearestOpenCell(unit.moveGoalCell) : -1;
    if (activeGoal < 0 || currentCell !== activeGoal) continue;

    const waypoint = unit.queuedWaypoints.shift();
    const destination = nearestOpenCell(waypoint.destination);
    if (destination < 0) {
      dirty = true;
      continue;
    }
    unit.orderRevision++;
    unit.path = [];
    unit.pathIndex = 0;
    unit.attackTargetId = -1;
    unit.attackBuildingTargetId = -1;
    unit.movePlanningPending = true;
    unit.attackMove = waypoint.attackMove;
    unit.attackMoveRouteReady = false;
    unit.attackMoveResumePath = null;
    unit.attackMoveResumePathIndex = 0;
    unit.attackMoveAnchorX = unit.x;
    unit.attackMoveAnchorZ = unit.z;
    unit.attackMoveScanTick = tickNumber + (unit.id % ATTACK_MOVE_SCAN_INTERVAL_TICKS);
    unit.lastAttackCell = -1;
    unit.repathTimer = 0;
    unit.moveGoalCell = destination;
    const assignment = { unit, destination, revision: unit.orderRevision, path: [] };
    assignments.push(assignment);
    const startCell = nearestOpenCell(worldToCell(unit.x, unit.z));
    const group = assignmentsByStart.get(startCell) || [];
    group.push(assignment);
    assignmentsByStart.set(startCell, group);
    dirty = true;
  }

  if (assignments.length === 0) return;
  const player = { team: -1, sendJson() {} };
  const job = {
    orderId: nextMoveOrderId++, player, epoch: movePlanningEpoch,
    clientOrderToken: null, orderLabel: 'QUEUED WAYPOINT', mode: 'queued-waypoint', silent: true,
    buildingTargetId: null, startedAt: performance.now(), assignments,
    groups: SHARED_MOVE_PATHS ? [...assignmentsByStart.entries()]
      : assignments.map((assignment) => [nearestOpenCell(worldToCell(assignment.unit.x, assignment.unit.z)), [assignment]]),
    reservedDestinations: new Set(assignments.map((assignment) => assignment.destination)),
    diagnostics: { searchCount: 0, expandedCells: 0, discoveredCells: 0 },
    nextGroup: 0, planningWorkMs: 0, maxPlanningSliceMs: 0, planningSliceCount: 0,
  };
  movePlanningQueue.push(job);
  scheduleNextMovePlanning();
}

function selectMap(player, mapId) {
  if (player.team !== 0) return;
  if (pveLaunchOptions) {
    sendOrderNotice(player, 0, 'PLAY VS AI MAP IS LOCKED FOR THIS MATCH');
    return;
  }
  const nextMap = mapCatalog.get(String(mapId));
  if (!nextMap || nextMap.id === mapDefinition.id) return;
  activateMap(nextMap);
  resetArmy(nextMap.startingArmySize ?? DEFAULT_STARTING_ARMY_SIZE);
  broadcastMapChange();
  broadcast({ type: 'notice', message: `MAP LOADED · ${mapDefinition.name}` });
  dirty = false;
}

async function persistCustomMap(definition) {
  const destination = path.join(CUSTOM_MAP_DIRECTORY, `${definition.id}.json`);
  const temporary = path.join(CUSTOM_MAP_DIRECTORY,
    `.${definition.id}.${randomBytes(8).toString('hex')}.tmp`);
  try {
    await writeFile(temporary, `${JSON.stringify(definition, null, 2)}\n`, {
      encoding: 'utf8', flag: 'wx', mode: 0o600,
    });
    await rename(temporary, destination);
  } catch (error) {
    await unlink(temporary).catch(() => {});
    console.error('Could not persist custom map:', error);
    throw new Error('The custom map could not be saved. Check server storage permissions.');
  }
}

async function publishMap(player, rawDefinition, persist = false) {
  if (player.team !== 0 || !rawDefinition || typeof rawDefinition !== 'object') return;
  if (pveLaunchOptions) {
    player.sendJson({ type: 'mapRejected', message: 'Play vs AI uses the map selected by its launch seed.' });
    return;
  }
  try {
    const definition = validateMapDefinition(rawDefinition, 'custom map');
    if (shippedMapIds.has(definition.id)
      || (mapCatalog.has(definition.id) && !runtimeMapIds.has(definition.id))) {
      throw new Error('That map ID is already in the room. Choose another ID.');
    }
    if (!runtimeMapIds.has(definition.id) && runtimeMapIds.size >= MAX_RUNTIME_MAPS) {
      throw new Error(`Custom map limit reached. Restart the server, then remove saved files from custom-maps/ if needed.`);
    }
    if (persistedMapIds.has(definition.id) && !persist) {
      throw new Error('This map is saved in the custom map library. Use Map Studio to save changes.');
    }
    definition.summary ||= `${definition.width} × ${definition.height} · ${definition.obstacles.length} TERRAIN BLOCKS`;
    if (persist) await persistCustomMap(definition);
    mapCatalog.set(definition.id, definition);
    runtimeMapIds.add(definition.id);
    if (persist) persistedMapIds.add(definition.id);
    activateMap(definition);
    resetArmy(definition.startingArmySize ?? DEFAULT_STARTING_ARMY_SIZE);
    broadcastMapChange();
    broadcast({ type: 'notice', message: `${persist ? 'CUSTOM MAP SAVED' : 'CUSTOM MAP PUBLISHED'} · ${mapDefinition.name}` });
    player.sendJson({ type: 'mapPublished', mapId: mapDefinition.id, persisted: persist });
    dirty = false;
  } catch (error) {
    player.sendJson({ type: 'mapRejected', message: String(error?.message || 'Map validation failed').slice(0, 140) });
  }
}

async function handleCommand(player, command) {
  if (shuttingDown || !command || typeof command.type !== 'string') return;
  if (matchWinner >= 0 && ['stop', 'holdPosition', 'patrol', 'follow', 'move', 'attackMove', 'attack', 'attackBuilding', 'gather', 'train', 'build', 'trainArcher', 'trainUnit', 'trainWorker', 'setRallyPoint', 'researchUpgrade', 'cancelConstruction', 'cancelTraining', 'cancelResearch', 'repairBuilding'].includes(command.type)) {
    sendOrderNotice(player, command, player.team === 0
      ? 'MATCH OVER · RESET BATTLEFIELD TO PLAY AGAIN'
      : 'MATCH OVER · WAIT FOR HOST TO RESET');
    return;
  }
  if (command.type === 'stop' || command.type === 'holdPosition') assignStationaryOrder(player, command);
  if (command.type === 'patrol') assignPatrolOrder(player, command);
  if (command.type === 'follow') assignFollowOrder(player, command);
  if (command.type === 'move') assignFormationMove(player, command);
  if (command.type === 'attackMove') assignFormationMove(player, command);
  if (command.type === 'attack') assignAttack(player, command);
  if (command.type === 'attackBuilding') assignAttackBuilding(player, command);
  if (command.type === 'gather') assignGather(player, command);
  if (command.type === 'trainUnit') trainUnit(player, command);
  if (command.type === 'train') trainInfantry(player, command);
  if (command.type === 'trainWorker') trainWorker(player);
  if (command.type === 'build') buildBuilding(player, command);
  if (command.type === 'trainArcher') trainArcher(player, command);
  if (command.type === 'setRallyPoint') setBuildingRallyPoint(player, command);
  if (command.type === 'researchUpgrade') researchUpgrade(player, command);
  if (command.type === 'cancelConstruction') cancelConstruction(player, command);
  if (command.type === 'cancelTraining') cancelTraining(player, command);
  if (command.type === 'cancelResearch') cancelResearch(player, command);
  if (command.type === 'repairBuilding') repairBuilding(player, command);
  if (command.type === 'selectMap' && player.team === 0) selectMap(player, command.mapId);
  if (command.type === 'publishMap') await publishMap(player, command.map, command.persist === true);
  if (command.type === 'selectArmySize' && player.team === 0) {
    if (pveLaunchOptions) {
      sendOrderNotice(player, command, 'PLAY VS AI ARMY SIZE IS LOCKED FOR THIS MATCH');
      return;
    }
    const allowed = [250, 500, 1000, 2000];
    const count = Number(command.count);
    if (!allowed.includes(count)) return;
    resetArmy(count);
    broadcast({ type: 'notice', message: `BATTLEFIELD RESET · ${count.toLocaleString()} UNITS` });
    broadcastState();
  }
  if (command.type === 'reset') {
    if (player.team !== 0) {
      sendOrderNotice(player, command, 'RESET REJECTED · ONLY THE HOST CAN RESET THE MATCH');
      return;
    }
    resetArmy(currentArmySize);
    broadcast({ type: 'notice', message: 'BATTLEFIELD RESET' });
    broadcastState();
  }
}

async function drivePveOpponent() {
  if (!pveLaunchOptions || !pveOpponentActive || !pvePolicy || pveOpponentError
    || pveDecisionInFlight || matchWinner >= 0) return;
  pveDecisionInFlight = true;
  try {
    const observation = toOpponentObservation(roomPayload(1), 1, mapDefinition);
    const commands = pvePolicy.next(observation);
    for (const command of commands) {
      if (matchWinner >= 0) break;
      await handleCommand(pveOpponentPlayer, command);
      pveCommandsIssued++;
    }
  } catch (error) {
    pveOpponentError = String(error?.message || error).slice(0, 240);
    console.error('Deterministic PvE opponent stopped:', pveOpponentError);
  } finally {
    pveDecisionInFlight = false;
  }
}

function spatialBucketColumn(x) {
  return Math.max(0, Math.min(spatialBucketColumns - 1,
    Math.floor((x + MAP_HALF_X) / SPATIAL_BUCKET_SIZE)));
}

function spatialBucketRow(z) {
  return Math.max(0, Math.min(spatialBucketRows - 1,
    Math.floor((z + MAP_HALF_Z) / SPATIAL_BUCKET_SIZE)));
}

function rebuildSpatialBuckets() {
  spatialBucketHeads.fill(-1);
  spatialBucketTeamHeads[0].fill(-1);
  spatialBucketTeamHeads[1].fill(-1);
  spatialBucketTeamTails[0].fill(-1);
  spatialBucketTeamTails[1].fill(-1);
  spatialBucketTeamCounts[0].fill(0);
  spatialBucketTeamCounts[1].fill(0);
  spatialBucketOfUnit.fill(-1);
  for (let index = units.length - 1; index >= 0; index--) {
    const unit = units[index];
    if (unit.hp <= 0) continue;
    const bucket = spatialBucketRow(unit.z) * spatialBucketColumns + spatialBucketColumn(unit.x);
    spatialBucketOfUnit[unit.id] = bucket;
    spatialBucketNext[unit.id] = spatialBucketHeads[bucket];
    spatialBucketHeads[bucket] = unit.id;
    const teamHead = spatialBucketTeamHeads[unit.team];
    const teamTail = spatialBucketTeamTails[unit.team];
    const teamCount = spatialBucketTeamCounts[unit.team];
    if (teamCount[bucket] === 0) {
      teamHead[bucket] = unit.id;
      teamTail[bucket] = unit.id;
      spatialBucketTeamNext[unit.team][unit.id] = unit.id;
    } else {
      spatialBucketTeamNext[unit.team][unit.id] = teamHead[bucket];
      spatialBucketTeamNext[unit.team][teamTail[bucket]] = unit.id;
      teamHead[bucket] = unit.id;
    }
    teamCount[bucket]++;
  }
}

function findAttackMoveTarget(unit, acquireRadius = ATTACK_MOVE_ACQUIRE_RADIUS, offsets = attackMoveBucketOffsets) {
  if (!unitHasCapability(unit, 'attack')) return null;
  const targetTeam = 1 - unit.team;
  const unitCell = nearestOpenCell(worldToCell(unit.x, unit.z));
  const componentId = walkableComponents[unitCell];
  if (componentId < 0) return null;
  const centerColumn = spatialBucketColumn(unit.x);
  const centerRow = spatialBucketRow(unit.z);
  const rangeSquared = acquireRadius * acquireRadius;
  let bestDistanceSquared = rangeSquared;
  let bestTarget = null;
  let visited = 0;
  const targetHeads = spatialBucketTeamHeads[targetTeam];
  const targetCounts = spatialBucketTeamCounts[targetTeam];
  const targetNext = spatialBucketTeamNext[targetTeam];
  const targetCursors = spatialBucketTeamCursors[targetTeam];
  const offsetCount = offsets.length;
  const firstOffset = unit.attackMoveBucketScanOffset % offsetCount;
  let candidateBucketCount = 0;

  // Rotate bucket order between scans so a dense group of closer buckets
  // cannot permanently starve candidates in later buckets.
  unit.attackMoveBucketScanOffset = (firstOffset + 1) % offsetCount;
  for (let offsetIndex = 0; offsetIndex < offsetCount; offsetIndex++) {
    const offset = offsets[(firstOffset + offsetIndex) % offsetCount];
    const column = centerColumn + offset.column;
    const row = centerRow + offset.row;
    if (column < 0 || column >= spatialBucketColumns || row < 0 || row >= spatialBucketRows) continue;
    const bucket = row * spatialBucketColumns + column;
    if (targetCounts[bucket] === 0) continue;
    attackMoveCandidateBuckets[candidateBucketCount] = bucket;
    attackMoveCandidateRemaining[candidateBucketCount] = targetCounts[bucket];
    candidateBucketCount++;
  }

  // Round-robin non-empty buckets, advancing persistent per-bucket cursors.
  // The cursors survive the per-tick bucket rebuild and are checked against
  // current unit membership before use. Candidate checks remain hard-capped.
  let activeBuckets = candidateBucketCount;
  while (visited < ATTACK_MOVE_MAX_CANDIDATES && activeBuckets > 0) {
    for (let bucketIndex = 0; bucketIndex < candidateBucketCount
      && visited < ATTACK_MOVE_MAX_CANDIDATES; bucketIndex++) {
      const remaining = attackMoveCandidateRemaining[bucketIndex];
      if (remaining === 0) continue;
      const bucket = attackMoveCandidateBuckets[bucketIndex];
      let targetId = targetCursors[bucket];
      if (targetId < 0 || spatialBucketOfUnit[targetId] !== bucket
        || units[targetId]?.team !== targetTeam || units[targetId]?.hp <= 0) {
        targetId = targetHeads[bucket];
      }
      const target = units[targetId];
      targetCursors[bucket] = targetNext[targetId];
      attackMoveCandidateRemaining[bucketIndex] = remaining - 1;
      if (remaining === 1) activeBuckets--;
      visited++;
      if (!target || target.hp <= 0 || !canCombatTarget(UNIT_DEFINITIONS[unit.kind], UNIT_DEFINITIONS[target.kind])) continue;
      if (mapDefinition.fogOfWar
        && !cellVisibleToTeam(unit.team, worldToCell(target.x, target.z))) continue;

      const targetCell = nearestOpenCell(worldToCell(target.x, target.z));
      const dx = target.x - unit.x;
      const dz = target.z - unit.z;
      const distanceSquared = dx * dx + dz * dz;
      const attackRange = UNIT_DEFINITIONS[unit.kind].combat.range;
      if (walkableComponents[targetCell] === componentId || distanceSquared <= attackRange * attackRange) {
        if (distanceSquared <= bestDistanceSquared
          && (!bestTarget || distanceSquared < bestDistanceSquared || target.id < bestTarget.id)) {
          bestDistanceSquared = distanceSquared;
          bestTarget = target;
        }
      }
    }
  }
  return bestTarget;
}

function getUnitAttackPath(unit, target, flowBudget = null) {
  const targetCell = nearestOpenCell(worldToCell(target.x, target.z));
  const start = nearestOpenCell(worldToCell(unit.x, unit.z));
  const range = UNIT_DEFINITIONS[unit.kind].combat.range;
  if (Math.hypot(target.x - unit.x, target.z - unit.z) <= range) {
    return { targetCell, path: [], reachable: true };
  }
  const component = walkableComponents[start];
  let key = targetCell;
  let goals = null;
  if (component !== walkableComponents[targetCell]) {
    // The enemy's cell can be unreachable while a firing position is reachable.
    // This bounded local scan runs only for pursuit across disconnected regions.
    goals = [];
    const radius = Math.ceil(range);
    const column = targetCell % MAP_WIDTH;
    const row = Math.floor(targetCell / MAP_WIDTH);
    for (let dz = -radius; dz <= radius; dz++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const x = column + dx;
        const z = row + dz;
        if (x < 0 || x >= MAP_WIDTH || z < 0 || z >= MAP_HEIGHT) continue;
        const cell = cellIndex(x, z);
        if (component < 0 || walkableComponents[cell] !== component) continue;
        const point = cellToWorld(cell);
        if (Math.hypot(point.x - target.x, point.z - target.z) <= range) goals.push(cell);
      }
    }
    if (!goals.length) return { targetCell, path: [], reachable: false };
    key = `unit-range:${target.id}:${target.x}:${target.z}:${component}:${range}`;
  }
  if (flowBudget && !attackFlowFields.has(key)) {
    if (flowBudget.built >= ATTACK_MOVE_MAX_FLOW_BUILDS_PER_TICK) return null;
    flowBudget.built++;
  }
  const field = goals ? getAttackFlowFieldForGoals(goals, key) : getAttackFlowField(targetCell);
  const path = field ? pathFromAttackFlow(start, field) : [];
  const atGoal = Boolean(field) && (start === field.goal || field.goals?.has(start));
  // Being in a goal cell does not guarantee the unit's continuous position is
  // within range. Finish moving to that cell's center before attempting a shot.
  if (atGoal && path.length === 0) path.push(start);
  return { targetCell, path, reachable: Boolean(field) && path.length > 0 };
}

function prepareAttackMovePaths() {
  const budget = { built: 0 };
  const plans = new Map();
  // Least recently served requests go first. Physical position breaks initial
  // ties so relabelling an army cannot buy it earlier pathfinding service.
  const requesters = units.filter(unit => unit.hp > 0 && unit.attackMove);
  requesters.sort((a, b) => (attackFlowLastGrant.get(a) ?? -1) - (attackFlowLastGrant.get(b) ?? -1)
    || a.x - b.x || a.z - b.z || a.kind.localeCompare(b.kind));
  for (const unit of requesters) {
    let target = null;
    if (unit.attackTargetId >= 0) {
      if (unit.repathTimer > STEP_SECONDS) continue;
      target = units[unit.attackTargetId];
      if (!target || target.hp <= 0 || target.team === unit.team
        || !unitHasCapability(unit, 'attack') || !canCombatTarget(UNIT_DEFINITIONS[unit.kind], UNIT_DEFINITIONS[target.kind])
        || (mapDefinition.fogOfWar && !cellVisibleToTeam(unit.team, worldToCell(target.x, target.z)))
        || Math.hypot(target.x - unit.attackMoveAnchorX, target.z - unit.attackMoveAnchorZ) > ATTACK_MOVE_LEASH_RADIUS
        || Math.hypot(target.x - unit.x, target.z - unit.z) <= (UNIT_DEFINITIONS[unit.kind].combat.range)
        || (worldToCell(target.x, target.z) === unit.lastAttackCell && unit.pathIndex < unit.path.length)) continue;
    } else if (unit.attackMoveRouteReady && !unit.movePlanningPending
      && unit.attackBuildingTargetId < 0 && tickNumber >= unit.attackMoveScanTick) {
      target = findAttackMoveTarget(unit);
    }
    if (!target) continue;
    const previousBuilt = budget.built;
    const approach = getUnitAttackPath(unit, target, budget);
    if (budget.built > previousBuilt) attackFlowLastGrant.set(unit, tickNumber);
    plans.set(unit.id, { target, approach });
  }
  return plans;
}

function getMoveVector(unit, remainingStep = UNIT_DEFINITIONS[unit.kind].combat.moveSpeed * STEP_SECONDS) {
  if (unit.pathIndex >= unit.path.length || remainingStep <= 0) return null;
  const trackSeparationWork = SEPARATION_DIAGNOSTICS_ENABLED;
  let unitCandidateVisits = 0;
  if (trackSeparationWork) separationTickMoveVectorCalls++;
  const target = cellToWorld(unit.path[unit.pathIndex]);
  let dx = target.x - unit.x;
  let dz = target.z - unit.z;
  const distance = Math.hypot(dx, dz);
  if (distance <= remainingStep) {
    return { target, reachedWaypoint: true, stepDistance: distance };
  }
  dx /= distance;
  dz /= distance;

  let separationX = 0;
  let separationZ = 0;
  const minColumn = Math.max(0, Math.floor((unit.x - MIN_SEPARATION + MAP_HALF_X) / SPATIAL_BUCKET_SIZE));
  const maxColumn = Math.min(spatialBucketColumns - 1,
    Math.floor((unit.x + MIN_SEPARATION + MAP_HALF_X) / SPATIAL_BUCKET_SIZE));
  const minRow = Math.max(0, Math.floor((unit.z - MIN_SEPARATION + MAP_HALF_Z) / SPATIAL_BUCKET_SIZE));
  const maxRow = Math.min(spatialBucketRows - 1,
    Math.floor((unit.z + MIN_SEPARATION + MAP_HALF_Z) / SPATIAL_BUCKET_SIZE));
  for (let row = minRow; row <= maxRow; row++) {
    for (let column = minColumn; column <= maxColumn; column++) {
      let otherId = spatialBucketHeads[row * spatialBucketColumns + column];
      while (otherId !== -1) {
        const other = units[otherId];
        const nextId = spatialBucketNext[otherId];
        if (otherId === unit.id || other.hp <= 0) {
          otherId = nextId;
          continue;
        }
        if (trackSeparationWork) {
          unitCandidateVisits++;
          separationTickCandidateVisits++;
        }
        const sx = unit.x - other.x;
        const sz = unit.z - other.z;
        const distanceSquared = sx * sx + sz * sz;
        if (trackSeparationWork) separationTickDistanceChecks++;
        const idleFriendly = other.team === unit.team
          && other.pathIndex >= other.path.length
          && other.attackTargetId < 0 && other.attackBuildingTargetId < 0;
        if (unit.kind === 'worker' && idleFriendly) {
          otherId = nextId;
          continue;
        }
        if (distanceSquared >= 0.0001 && distanceSquared < MIN_SEPARATION * MIN_SEPARATION) {
          if (trackSeparationWork) separationTickCloseNeighborContributions++;
          const distance = Math.sqrt(distanceSquared);
          const force = (MIN_SEPARATION - distance) / MIN_SEPARATION;
          separationX += (sx / distance) * force;
          separationZ += (sz / distance) * force;
        }
        otherId = nextId;
      }
    }
  }
  if (trackSeparationWork) {
    separationTickMaxCandidatesPerCall = Math.max(separationTickMaxCandidatesPerCall, unitCandidateVisits);
  }
  let vx = dx + separationX * 0.62;
  let vz = dz + separationZ * 0.62;
  const length = Math.hypot(vx, vz) || 1;
  vx /= length;
  vz /= length;
  return { x: vx, z: vz, target, stepDistance: remainingStep };
}

// Units stop following paths while working or striking. Keep separating them
// at that point too, so a squad can occupy the edge of a target instead of
// collapsing into one position. The spatial query has a fixed work budget.
function spreadInteractingUnits() {
  const maxCandidates = 64;
  const searchRadius = MIN_SEPARATION + WALK_SPEED * STEP_SECONDS;
  for (const unit of units) {
    if (unit.hp <= 0 || unit.pathIndex < unit.path.length) continue;
    let target = null;
    let building = null;
    let range = 0;
    if (unit.attackTargetId >= 0) {
      target = units[unit.attackTargetId];
      range = UNIT_DEFINITIONS[unit.kind].combat.range;
    } else if (unit.attackBuildingTargetId >= 0) {
      building = buildingsById.get(unit.attackBuildingTargetId);
      range = UNIT_DEFINITIONS[unit.kind].combat.range;
    } else if (unit.gatherPhase === 'gathering' && unit.gatherForestCell >= 0) {
      target = cellToWorld(unit.gatherForestCell);
      range = WORKER_INTERACTION_RANGE;
    } else if (unit.gatherPhase === 'gathering' && unit.gatherNodeId !== null) {
      target = resourceNodeStates.get(unit.gatherNodeId);
      range = WORKER_INTERACTION_RANGE;
    } else if (unit.buildingTargetId !== null) {
      building = buildingsById.get(unit.buildingTargetId);
      range = BUILDER_INTERACTION_RANGE;
    }
    if ((!target || target.hp === 0) && !building) continue;
    if (target && Math.hypot(unit.x - target.x, unit.z - target.z) > range) continue;
    if (building && distanceToBuildingEdge(unit, building) > range) continue;

    let forceX = 0;
    let forceZ = 0;
    let visited = 0;
    const minColumn = spatialBucketColumn(unit.x - searchRadius);
    const maxColumn = spatialBucketColumn(unit.x + searchRadius);
    const minRow = spatialBucketRow(unit.z - searchRadius);
    const maxRow = spatialBucketRow(unit.z + searchRadius);
    for (let row = minRow; row <= maxRow && visited < maxCandidates; row++) {
      for (let column = minColumn; column <= maxColumn && visited < maxCandidates; column++) {
        const bucket = row * spatialBucketColumns + column;
        const count = spatialBucketTeamCounts[unit.team][bucket];
        if (count === 0) continue;
        const head = spatialBucketTeamHeads[unit.team][bucket];
        let otherId = spatialBucketOfUnit[unit.id] === bucket
          ? spatialBucketTeamNext[unit.team][unit.id] : head;
        for (let index = 0; index < count && visited < maxCandidates; index++) {
          const other = units[otherId];
          otherId = spatialBucketTeamNext[unit.team][otherId];
          if (other.id === unit.id || other.hp <= 0) continue;
          visited++;
          let dx = unit.x - other.x;
          let dz = unit.z - other.z;
          let distance = Math.hypot(dx, dz);
          if (distance >= MIN_SEPARATION) continue;
          if (distance < 0.0001) {
            const angle = (Math.min(unit.id, other.id) * 2.399963229728653) % (Math.PI * 2);
            const sign = unit.id < other.id ? 1 : -1;
            dx = Math.cos(angle) * sign;
            dz = Math.sin(angle) * sign;
            distance = 0;
          } else {
            dx /= distance;
            dz /= distance;
          }
          const strength = (MIN_SEPARATION - distance) / MIN_SEPARATION;
          forceX += dx * strength;
          forceZ += dz * strength;
        }
      }
    }
    if (target) {
      const dx = unit.x - target.x;
      const dz = unit.z - target.z;
      const distance = Math.hypot(dx, dz);
      if (distance < 0.62) {
        const angle = (unit.id * 2.399963229728653) % (Math.PI * 2);
        const radialX = distance > 0.0001 ? dx / distance : Math.cos(angle);
        const radialZ = distance > 0.0001 ? dz / distance : Math.sin(angle);
        forceX += radialX * (0.62 - distance) / 0.62;
        forceZ += radialZ * (0.62 - distance) / 0.62;
      }
    }
    const strength = Math.hypot(forceX, forceZ);
    if (strength < 0.01) continue;
    const step = Math.min(UNIT_DEFINITIONS[unit.kind].combat.moveSpeed * STEP_SECONDS, strength * 0.08);
    let x = unit.x + forceX / strength * step;
    let z = unit.z + forceZ / strength * step;
    if (target) {
      const dx = x - target.x;
      const dz = z - target.z;
      const distance = Math.hypot(dx, dz);
      if (distance > range - 0.02) {
        x = target.x + dx / distance * (range - 0.02);
        z = target.z + dz / distance * (range - 0.02);
      }
    } else if (distanceToBuildingEdge({ x, z }, building) > range - 0.02) {
      continue;
    }
    if (x <= -MAP_HALF_X + 0.5 || x >= MAP_HALF_X - 0.5
      || z <= -MAP_HALF_Z + 0.5 || z >= MAP_HALF_Z - 0.5
      || !isWalkable(worldToCell(x, z))) continue;
    unit.x = x;
    unit.z = z;
    unit.lastMoveTick = tickNumber;
    dirty = true;
  }
}

// Bounded, rotating enemy-bucket scans share unit visibility and simultaneous damage.
function findStationaryCombatTarget(building, range) {
  const team = 1 - building.team;
  const buckets = [];
  for (let row = spatialBucketRow(building.z - range); row <= spatialBucketRow(building.z + range); row++) {
    for (let column = spatialBucketColumn(building.x - range); column <= spatialBucketColumn(building.x + range); column++) {
      const bucket = row * spatialBucketColumns + column;
      if (spatialBucketTeamCounts[team][bucket]) buckets.push(bucket);
    }
  }
  if (!buckets.length) return null;
  const first = (building.attackScanOffset || 0) % buckets.length;
  building.attackScanOffset = (first + 1) % buckets.length;
  const remaining = buckets.map((bucket) => spatialBucketTeamCounts[team][bucket]);
  let visited = 0; let target = null; let best = range * range;
  while (visited < 64 && remaining.some((count) => count > 0)) {
    for (let index = 0; index < buckets.length && visited < 64; index++) {
      const slot = (first + index) % buckets.length;
      if (!remaining[slot]) continue;
      const bucket = buckets[slot]; remaining[slot]--; visited++;
      let id = spatialBucketTeamCursors[team][bucket];
      if (id < 0 || spatialBucketOfUnit[id] !== bucket || units[id]?.team !== team || units[id]?.hp <= 0) id = spatialBucketTeamHeads[team][bucket];
      const unit = units[id]; spatialBucketTeamCursors[team][bucket] = spatialBucketTeamNext[team][id];
      if (!unit || unit.hp <= 0 || !canCombatTarget(BUILDING_DEFINITIONS[building.type], UNIT_DEFINITIONS[unit.kind]) || (mapDefinition.fogOfWar && !cellVisibleToTeam(building.team, worldToCell(unit.x, unit.z)))) continue;
      const distance = (unit.x - building.x) ** 2 + (unit.z - building.z) ** 2;
      if (distance < best || (distance === best && (!target || unit.id < target.id))) { target = unit; best = distance; }
    }
  }
  return target;
}
function accumulateBuildingAttacks() {
  for (const building of buildings) {
    const combat = BUILDING_DEFINITIONS[building.type].combat;
    if (!combat || !building.complete || building.hp <= 0) continue;
    building.attackCooldown = Math.max(0, (building.attackCooldown || 0) - STEP_SECONDS);
    if (building.attackCooldown > 0) continue;
    const target = findStationaryCombatTarget(building, combat.range);
    if (!target) { building.attackCooldown = Math.min(combat.period, 0.25); continue; }
    pendingUnitDamage[target.id] += damageForEntities(building, target);
    building.attackCooldown = combat.period;
    building.lastAttackTick = tickNumber; building.lastAttackX = target.x; building.lastAttackZ = target.z;
    dirty = true;
  }
}

function simulateTick() {
  if (SEPARATION_DIAGNOSTICS_ENABLED) {
    separationTickCandidateVisits = 0;
    separationTickDistanceChecks = 0;
    separationTickCloseNeighborContributions = 0;
    separationTickMoveVectorCalls = 0;
    separationTickMaxCandidatesPerCall = 0;
  }
  tickNumber++;
  if (matchWinner >= 0) return;
  if (!scenarioClockStarted && connectedCount() >= 2) scenarioClockStarted = true;
  if (scenarioClockStarted) matchElapsedSeconds += STEP_SECONDS;
  rebuildSpatialBuckets();
  updatePersistentOrders();
  const attackMovePlans = prepareAttackMovePaths();
  // Resolve attacks together so a lethal hit cannot cancel a same-tick counterattack.
  pendingUnitDamage.fill(0, 0, units.length);
  pendingBuildingDamage.clear();

  for (const unit of units) {
    if (unit.hp <= 0) continue;
    if (unit.holdingPosition && tickNumber >= unit.attackMoveScanTick) {
      unit.attackMoveScanTick = tickNumber + ATTACK_MOVE_SCAN_INTERVAL_TICKS;
      const target = findAttackMoveTarget(unit, UNIT_DEFINITIONS[unit.kind].combat.range, holdBucketOffsets);
      unit.attackTargetId = target?.id ?? -1;
    }
    if (unit.attackTargetId >= 0) {
      const target = units[unit.attackTargetId];
      if (!target || target.hp <= 0 || !unitHasCapability(unit, 'attack') || !canCombatTarget(UNIT_DEFINITIONS[unit.kind], UNIT_DEFINITIONS[target.kind])) {
        clearAttackTarget(unit);
      } else if (mapDefinition.fogOfWar
        && !cellVisibleToTeam(unit.team, worldToCell(target.x, target.z))) {
        clearAttackTarget(unit);
      } else {
        const leashX = target.x - unit.attackMoveAnchorX;
        const leashZ = target.z - unit.attackMoveAnchorZ;
        if (unit.attackMove && leashX * leashX + leashZ * leashZ
          > ATTACK_MOVE_LEASH_RADIUS * ATTACK_MOVE_LEASH_RADIUS) {
          clearAttackTarget(unit);
          continue;
        }
        const dx = target.x - unit.x;
        const dz = target.z - unit.z;
        const distance = Math.hypot(dx, dz);
        const attackRange = UNIT_DEFINITIONS[unit.kind].combat.range;
        const attackDamage = damageForEntities(unit, target);
        const attackPeriod = UNIT_DEFINITIONS[unit.kind].combat.period;
        unit.attackCooldown -= STEP_SECONDS;
        unit.repathTimer -= STEP_SECONDS;
        const targetCell = worldToCell(target.x, target.z);
        if (distance <= attackRange) {
          unit.path = [];
          unit.pathIndex = 0;
          if (unit.attackCooldown <= 0) {
            pendingUnitDamage[target.id] += attackDamage;
            unit.attackCooldown = attackPeriod;
            unit.lastAttackTick = tickNumber;
            unit.lastAttackX = target.x;
            unit.lastAttackZ = target.z;
            dirty = true;
          }
          continue;
        }
        if (unit.holdingPosition) {
          clearAttackTarget(unit);
          continue;
        }
        if (unit.repathTimer <= 0
          && (targetCell !== unit.lastAttackCell || unit.pathIndex >= unit.path.length)) {
          const approach = unit.attackMove ? attackMovePlans.get(unit.id)?.approach : getUnitAttackPath(unit, target);
          if (!approach) {
            unit.repathTimer = STEP_SECONDS;
            continue;
          }
          if (!approach.reachable) {
            clearAttackTarget(unit);
            dirty = true;
            continue;
          }
          unit.path = approach.path;
          unit.pathIndex = 0;
          unit.lastAttackCell = targetCell;
          unit.repathTimer = 0.6;
        }
      }
    }

    if (unit.attackBuildingTargetId >= 0) {
      const target = buildingsById.get(unit.attackBuildingTargetId);
      if (!target || target.hp <= 0 || target.team === unit.team
        || !unitHasCapability(unit, 'attack-structures') || !canCombatTarget(UNIT_DEFINITIONS[unit.kind], BUILDING_DEFINITIONS[target.type])
        || (mapDefinition.fogOfWar && !buildingVisibleToTeam(unit.team, target))) {
        clearAttackTarget(unit);
        continue;
      }
      const distance = distanceToBuildingEdge(unit, target);
      const attackRange = UNIT_DEFINITIONS[unit.kind].combat.range;
      unit.attackCooldown -= STEP_SECONDS;
      unit.repathTimer -= STEP_SECONDS;
      const targetCell = worldToCell(target.x, target.z);
      if (distance <= attackRange) {
        unit.path = [];
        unit.pathIndex = 0;
        if (unit.attackCooldown <= 0) {
          pendingBuildingDamage.set(target,
            (pendingBuildingDamage.get(target) || 0)
              + damageForEntities(unit, target));
          unit.attackCooldown = UNIT_DEFINITIONS[unit.kind].combat.period;
          unit.lastAttackTick = tickNumber;
          unit.lastAttackX = target.x;
          unit.lastAttackZ = target.z;
          dirty = true;
        }
        continue;
      }
      if (unit.repathTimer <= 0
        && (targetCell !== unit.lastAttackCell || unit.pathIndex >= unit.path.length)) {
        const start = nearestOpenCell(worldToCell(unit.x, unit.z));
        const componentId = walkableComponents[start];
        const field = componentId >= 0 ? getBuildingAttackFlowField(target, componentId, unit.kind) : null;
        if (!field) {
          unit.repathTimer = STEP_SECONDS;
          continue;
        }
        unit.path = pathFromAttackFlow(start, field);
        if (unit.path.length === 0 && !field.goals.has(start)) {
          unit.repathTimer = STEP_SECONDS;
          continue;
        }
        unit.pathIndex = 0;
        unit.moveGoalCell = unit.path.at(-1) ?? start;
        unit.lastAttackCell = targetCell;
        unit.repathTimer = 0.6;
      }
    }

    if (unit.attackMove && unit.attackMoveRouteReady && !unit.movePlanningPending
      && unit.attackTargetId < 0 && unit.attackBuildingTargetId < 0
      && tickNumber >= unit.attackMoveScanTick) {
      unit.attackMoveScanTick = tickNumber + ATTACK_MOVE_SCAN_INTERVAL_TICKS;
      const plan = attackMovePlans.get(unit.id);
      const target = plan?.target;
      if (target) {
        const movePath = plan.approach;
        if (movePath?.reachable) {
          unit.attackMoveResumePath = unit.path;
          unit.attackMoveResumePathIndex = unit.pathIndex;
          unit.attackMoveAnchorX = unit.x;
          unit.attackMoveAnchorZ = unit.z;
          unit.attackTargetId = target.id;
          unit.repathTimer = 0.6;
          unit.lastAttackCell = movePath.targetCell;
          unit.path = movePath.path;
          unit.pathIndex = 0;
          dirty = true;
        }
      }
    }
  }

  accumulateBuildingAttacks();
  for (const target of units) {
    const damage = pendingUnitDamage[target.id];
    if (damage <= 0 || target.hp <= 0) continue;
    target.hp = Math.max(0, target.hp - damage);
    if (target.hp === 0) {
      broadcastGameplayNotice(target.team, target.x, target.z,
        `${target.team === 0 ? 'AZURE' : 'EMBER'} UNIT DEFEATED`);
    }
  }
  for (const [building, damage] of pendingBuildingDamage) {
    if (buildingsById.get(building.id) !== building) continue;
    building.hp = Math.max(0, building.hp - damage);
    if (building.hp === 0) destroyBuilding(building);
  }
  for (const unit of units) {
    if (unit.hp > 0 && unit.attackTargetId >= 0 && units[unit.attackTargetId]?.hp <= 0) {
      clearAttackTarget(unit);
    }
  }

  updateWorkerEconomy();
  updateBuildingAndProduction();
  updateTeamResearch();

  const blockedRouteRepairs = [];
  for (const unit of units) {
    if (unit.hp <= 0) continue;
    // A target can move within its current cell after the flow path ends.
    // Close that last gap directly so the attacker does not wait in place.
    if (!unit.holdingPosition && unit.pathIndex >= unit.path.length && unit.attackTargetId >= 0) {
      const target = units[unit.attackTargetId];
      const range = UNIT_DEFINITIONS[unit.kind].combat.range;
      if (target?.hp > 0 && worldToCell(unit.x, unit.z) === worldToCell(target.x, target.z)) {
        const dx = target.x - unit.x;
        const dz = target.z - unit.z;
        const distance = Math.hypot(dx, dz);
        if (distance > range && distance > 0) {
          const step = Math.min(UNIT_DEFINITIONS[unit.kind].combat.moveSpeed * STEP_SECONDS, distance - range + 0.02);
          const x = unit.x + dx / distance * step;
          const z = unit.z + dz / distance * step;
          if (isWalkable(worldToCell(x, z))) {
            unit.x = x;
            unit.z = z;
            unit.lastMoveTick = tickNumber;
            dirty = true;
          }
        }
      }
    }
    if (unit.holdingPosition || unit.pathIndex >= unit.path.length) continue;
    let remainingStep = UNIT_DEFINITIONS[unit.kind].combat.moveSpeed * STEP_SECONDS;
    while (remainingStep > 0 && unit.pathIndex < unit.path.length) {
      const move = getMoveVector(unit, remainingStep);
      if (!move) break;
      if (!isWalkable(worldToCell(move.target.x, move.target.z))) {
        if (unit.attackTargetId >= 0 || unit.attackBuildingTargetId >= 0) {
          unit.path = [];
          unit.pathIndex = 0;
          unit.lastAttackCell = -1;
          unit.repathTimer = 0;
        } else {
          const destination = unit.moveGoalCell >= 0
            ? unit.moveGoalCell : unit.path[unit.path.length - 1];
          blockedRouteRepairs.push({ unit, destination });
        }
        break;
      }
      if (move.reachedWaypoint) {
        unit.x = move.target.x;
        unit.z = move.target.z;
        unit.pathIndex++;
        remainingStep -= move.stepDistance;
        dirty = true;
        continue;
      }

      const nextX = unit.x + move.x * move.stepDistance;
      const nextZ = unit.z + move.z * move.stepDistance;
      const nextCell = worldToCell(nextX, nextZ);
      if (isWalkable(nextCell)) {
        unit.x = nextX;
        unit.z = nextZ;
      } else {
        const targetX = move.target.x - unit.x;
        const targetZ = move.target.z - unit.z;
        const length = Math.hypot(targetX, targetZ) || 1;
        const fallbackX = unit.x + (targetX / length) * move.stepDistance;
        const fallbackZ = unit.z + (targetZ / length) * move.stepDistance;
        if (isWalkable(worldToCell(fallbackX, fallbackZ))) {
          unit.x = fallbackX;
          unit.z = fallbackZ;
        }
      }
      unit.x = Math.max(-MAP_HALF_X + 0.5, Math.min(MAP_HALF_X - 0.5, unit.x));
      unit.z = Math.max(-MAP_HALF_Z + 0.5, Math.min(MAP_HALF_Z - 0.5, unit.z));
      unit.lastMoveTick = tickNumber;
      dirty = true;
      break;
    }
  }
  enqueueRouteRepairs(blockedRouteRepairs);
  spreadInteractingUnits();
  advanceQueuedWaypoints();
}

function encodeWebSocketFrame(opcode, payload, compressed = false) {
  let header;
  if (payload.length < 126) {
    header = Buffer.alloc(2);
    header[1] = payload.length;
  } else if (payload.length <= 0xffff) {
    header = Buffer.alloc(4);
    header[1] = 126;
    header.writeUInt16BE(payload.length, 2);
  } else {
    header = Buffer.alloc(10);
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(payload.length), 2);
  }
  header[0] = 0x80 | opcode | (compressed ? 0x40 : 0);
  return Buffer.concat([header, payload]);
}

function sendFrame(socket, opcode, payload = Buffer.alloc(0)) {
  if (socket.destroyed || !socket.writable) return false;
  return socket.write(encodeWebSocketFrame(opcode, payload));
}

function prepareJsonFrame(message, allowCompression = false) {
  const payload = Buffer.from(JSON.stringify(message));
  if (allowCompression && payload.length >= MIN_COMPRESS_FRAME_BYTES) {
    const deflated = deflateRawSync(payload, {
      level: 3,
      flush: zlibConstants.Z_SYNC_FLUSH,
      finishFlush: zlibConstants.Z_SYNC_FLUSH,
    });
    if (deflated.length > PERMESSAGE_DEFLATE_TRAILER.length
      && deflated.subarray(-PERMESSAGE_DEFLATE_TRAILER.length).equals(PERMESSAGE_DEFLATE_TRAILER)) {
      const compressedPayload = deflated.subarray(0, -PERMESSAGE_DEFLATE_TRAILER.length);
      if (compressedPayload.length < payload.length) {
        const frame = encodeWebSocketFrame(0x1, compressedPayload, true);
        frame.rtsPayloadBytes = payload.length;
        frame.rtsCompressed = true;
        return frame;
      }
    }
  }
  const frame = encodeWebSocketFrame(0x1, payload);
  frame.rtsPayloadBytes = payload.length;
  frame.rtsCompressed = false;
  return frame;
}

function websocketFrameBytes(payloadBytes) {
  const headerBytes = payloadBytes < 126 ? 2 : payloadBytes <= 0xffff ? 4 : 10;
  return payloadBytes + headerBytes;
}

function canQueuePeerFrame(peer, frameBytes) {
  if (peer.closed) return false;
  const queuedBytes = peer.socket.writableLength;
  if (frameBytes > MAX_PEER_QUEUED_BYTES || queuedBytes + frameBytes > MAX_PEER_QUEUED_BYTES) {
    outboundQueueLimitDisconnects++;
    peer.terminate();
    return false;
  }
  return true;
}

function sendPreparedPeerFrame(peer, frame) {
  if (!canQueuePeerFrame(peer, frame.length)) return false;
  peer.outboundJsonFrames++;
  peer.outboundJsonWireBytes += frame.length;
  peer.outboundJsonPayloadBytes += frame.rtsPayloadBytes ?? frame.length;
  peer.outboundJsonUncompressedWireBytes += websocketFrameBytes(frame.rtsPayloadBytes ?? frame.length);
  if (frame.rtsCompressed) {
    peer.outboundCompressedFrames++;
    peer.outboundCompressedWireBytes += frame.length;
    peer.outboundCompressedPayloadBytes += frame.rtsPayloadBytes;
  }
  return recordPeerWrite(peer, peer.socket.write(frame));
}

function recordPeerWrite(peer, writable) {
  peer.peakQueuedBytes = Math.max(peer.peakQueuedBytes, peer.socket.writableLength);
  peakOutboundQueuedBytes = Math.max(peakOutboundQueuedBytes, peer.socket.writableLength);
  if (peer.socket.writableLength > MAX_PEER_QUEUED_BYTES) {
    outboundQueueLimitDisconnects++;
    peer.terminate();
    return false;
  }
  if (!writable) peer.backpressured = true;
  return writable;
}

function sendPeerControlFrame(peer, opcode, payload) {
  const frameBytes = websocketFrameBytes(payload.length);
  if (!canQueuePeerFrame(peer, frameBytes)) return false;
  const writable = sendFrame(peer.socket, opcode, payload);
  return recordPeerWrite(peer, writable);
}

function pruneExpiredSessions(now = Date.now()) {
  for (const [tokenHash, session] of sessions) {
    if (!session.peer && session.expiresAt <= now) sessions.delete(tokenHash);
  }
}

function releasePeer(peer, graceful = false) {
  if (peer.closed) return;
  peer.closed = true;
  peer.pendingState = null;
  peer.pendingWaypointCounts = null;
  peers.delete(peer);
  if (peer.resumeWaitSession) {
    peer.resumeWaitSession.waitingPeers?.delete(peer);
    peer.resumeWaitSession = null;
  }
  if (peer.session?.peer === peer) {
    const releasedSession = peer.session;
    releasedSession.peer = null;
    releasedSession.expiresAt = Date.now() + SESSION_GRACE_MS;
    for (const waitingPeer of releasedSession.waitingPeers || []) {
      waitingPeer.resumeWaitSession = null;
      waitingPeer.sendJson({ type: 'resumeAvailable' });
    }
    releasedSession.waitingPeers?.clear();
  }
  dirty = true;
  if (graceful) {
    if (peer.socket.writableLength + websocketFrameBytes(2) <= MAX_PEER_QUEUED_BYTES) {
      try { sendFrame(peer.socket, 0x8, Buffer.from([0x03, 0xe8])); } catch {}
    }
    peer.socket.end();
  } else {
    peer.socket.destroy();
  }
  broadcast({ type: 'room', connected: connectedCount() });
}

function dispatchPeerTextMessage(peer, payload, compressed) {
  if (compressed) {
    try {
      payload = inflateRawSync(Buffer.concat([payload, PERMESSAGE_DEFLATE_TRAILER]), {
        finishFlush: zlibConstants.Z_SYNC_FLUSH,
        maxOutputLength: MAX_INBOUND_FRAME_BYTES,
      });
    } catch {
      peer.terminate();
      return;
    }
  }
  if (peer.inboundMessagesInWindow >= MAX_INBOUND_MESSAGES_PER_SECOND) {
    peer.terminate();
    return;
  }
  if (peer.inboundDecodedBytesInWindow + payload.length > MAX_INBOUND_DECODED_BYTES_PER_SECOND) {
    peer.terminate();
    return;
  }
  peer.inboundMessagesInWindow++;
  peer.inboundDecodedBytesInWindow += payload.length;
  try {
    const command = JSON.parse(payload.toString('utf8'));
    const commandBytes = payload.length;
    if (peer.pendingCommandCount >= MAX_PENDING_COMMANDS_PER_PEER
      || peer.pendingCommandBytes + commandBytes > MAX_PENDING_COMMAND_BYTES_PER_PEER) {
      commandQueueLimitRejections++;
      sendOrderNotice(peer, command, 'ORDER REJECTED · SERVER BUSY · TRY AGAIN');
      return;
    }
    peer.pendingCommandCount++;
    peer.pendingCommandBytes += commandBytes;
    peer.commandQueue = peer.commandQueue.then(async () => {
      try {
        if (!peer.closed) await handleCommand(peer, command);
      } finally {
        peer.pendingCommandCount--;
        peer.pendingCommandBytes -= commandBytes;
      }
    }).catch(() => {});
  } catch {}
}

function createPeer(socket, resumeToken, compressionEnabled = false) {
  const now = Date.now();
  pruneExpiredSessions(now);
  const resumeTokenHash = resumeToken ? createHash('sha256').update(resumeToken).digest('base64url') : null;
  const resumable = resumeTokenHash ? sessions.get(resumeTokenHash) : null;
  const activeResume = Boolean(resumable?.peer && !resumable.peer.closed && !resumable.peer.socket.destroyed);
  const peer = {
    socket,
    buffer: Buffer.alloc(0),
    compressionEnabled,
    inboundFragmentOpcode: null,
    inboundFragmentCompressed: false,
    inboundFragmentChunks: [],
    inboundFragmentBytes: 0,
    id: '',
    sessionToken: null,
    team: null,
    session: null,
    resumed: false,
    resumePending: false,
    resumeWaitSession: null,
    lastPongAt: now,
    closed: false,
    backpressured: false,
    pendingState: null,
    pendingWaypointCounts: null,
    coalescedStateSnapshots: 0,
    peakQueuedBytes: 0,
    inboundWindowStartedAt: now,
    inboundMessagesInWindow: 0,
    inboundBytesInWindow: 0,
    inboundDecodedBytesInWindow: 0,
    inboundControlFramesInWindow: 0,
    outboundJsonFrames: 0,
    outboundJsonWireBytes: 0,
    outboundJsonPayloadBytes: 0,
    outboundJsonUncompressedWireBytes: 0,
    outboundCompressedFrames: 0,
    outboundCompressedWireBytes: 0,
    outboundCompressedPayloadBytes: 0,
    pendingCommandCount: 0,
    pendingCommandBytes: 0,
    commandQueue: Promise.resolve(),
    sendJson(message) {
      if (peer.closed) return false;
      const frame = prepareJsonFrame(message, peer.compressionEnabled);
      if (message.type === 'state') return peer.sendPreparedState(frame);
      return sendPreparedPeerFrame(peer, frame);
    },
    sendPreparedState(frame) {
      if (peer.closed) return false;
      if (peer.backpressured) {
        if (peer.pendingState) peer.coalescedStateSnapshots++;
        peer.pendingState = frame;
        return false;
      }
      return sendPreparedPeerFrame(peer, frame);
    },
    sendPreparedWaypointCounts(frame) {
      if (peer.closed) return false;
      if (peer.backpressured) {
        peer.pendingWaypointCounts = frame;
        return false;
      }
      return sendPreparedPeerFrame(peer, frame);
    },
    close() { releasePeer(peer, true); },
    terminate() { releasePeer(peer, false); },
    consume(chunk) {
      peer.buffer = Buffer.concat([peer.buffer, chunk]);
      while (peer.buffer.length >= 2) {
        if (peer.closed) return;
        const first = peer.buffer[0];
        const second = peer.buffer[1];
        const opcode = first & 0x0f;
        const final = (first & 0x80) !== 0;
        const compressed = (first & 0x40) !== 0;
        const masked = (second & 0x80) !== 0;
        const controlFrame = opcode >= 0x8;
        if ((first & 0x30) !== 0 || !masked) {
          peer.terminate();
          return;
        }
        if (controlFrame) {
          if (![0x8, 0x9, 0x0a].includes(opcode) || !final || compressed) {
            peer.terminate();
            return;
          }
        } else if (opcode === 0x1) {
          if (peer.inboundFragmentOpcode !== null || (compressed && !peer.compressionEnabled)) {
            peer.terminate();
            return;
          }
        } else if (opcode === 0x0) {
          if (compressed || peer.inboundFragmentOpcode === null) {
            peer.terminate();
            return;
          }
        } else {
          peer.terminate();
          return;
        }
        let length = second & 0x7f;
        let offset = 2;
        if (length === 126) {
          if (peer.buffer.length < 4) return;
          length = peer.buffer.readUInt16BE(2);
          offset = 4;
        } else if (length === 127) {
          if (peer.buffer.length < 10) return;
          const longLength = peer.buffer.readBigUInt64BE(2);
          if (longLength > BigInt(MAX_INBOUND_FRAME_BYTES)) { peer.terminate(); return; }
          length = Number(longLength);
          offset = 10;
        }
        if (length > MAX_INBOUND_FRAME_BYTES) { peer.terminate(); return; }
        if (controlFrame && length > 125) { peer.terminate(); return; }
        offset += 4;
        if (peer.buffer.length < offset + length) return;
        let payload = peer.buffer.subarray(offset, offset + length);
        const maskOffset = offset - 4;
        const mask = peer.buffer.subarray(maskOffset, offset);
        payload = Buffer.from(payload);
        for (let index = 0; index < payload.length; index++) payload[index] ^= mask[index % 4];
        peer.buffer = peer.buffer.subarray(offset + length);
        const frameTime = Date.now();
        if (frameTime - peer.inboundWindowStartedAt >= 1000) {
          peer.inboundWindowStartedAt = frameTime;
          peer.inboundMessagesInWindow = 0;
          peer.inboundBytesInWindow = 0;
          peer.inboundDecodedBytesInWindow = 0;
          peer.inboundControlFramesInWindow = 0;
        }
        if (controlFrame) {
          peer.inboundControlFramesInWindow++;
          inboundControlFramesReceived++;
          if (opcode === 0x9) inboundControlPingsReceived++;
          else if (opcode === 0x0a) inboundControlPongsReceived++;
          if (peer.inboundControlFramesInWindow > MAX_INBOUND_CONTROL_FRAMES_PER_SECOND) {
            inboundControlRateLimitDisconnects++;
            peer.terminate();
            return;
          }
          if (opcode === 0x8) { peer.close(); return; }
          if (opcode === 0x9) sendPeerControlFrame(peer, 0x0a, payload);
          else peer.lastPongAt = Date.now();
          continue;
        }

        if (peer.inboundBytesInWindow + payload.length > MAX_INBOUND_BYTES_PER_SECOND) {
          peer.terminate();
          return;
        }
        peer.inboundBytesInWindow += payload.length;

        if (opcode === 0x1) {
          if (final) {
            dispatchPeerTextMessage(peer, payload, compressed);
            continue;
          }
          peer.inboundFragmentOpcode = opcode;
          peer.inboundFragmentCompressed = compressed;
          peer.inboundFragmentChunks = [payload];
          peer.inboundFragmentBytes = payload.length;
          continue;
        }

        if (peer.inboundFragmentBytes + payload.length > MAX_INBOUND_FRAME_BYTES) {
          peer.terminate();
          return;
        }
        peer.inboundFragmentChunks.push(payload);
        peer.inboundFragmentBytes += payload.length;
        if (final) {
          const completePayload = Buffer.concat(peer.inboundFragmentChunks, peer.inboundFragmentBytes);
          const completeCompressed = peer.inboundFragmentCompressed;
          peer.inboundFragmentOpcode = null;
          peer.inboundFragmentCompressed = false;
          peer.inboundFragmentChunks = [];
          peer.inboundFragmentBytes = 0;
          dispatchPeerTextMessage(peer, completePayload, completeCompressed);
        }
      }
    },
  };

  socket.on('drain', () => {
    if (peer.closed) return;
    peer.backpressured = false;
    const latestState = peer.pendingState;
    const latestWaypointCounts = peer.pendingWaypointCounts;
    peer.pendingState = null;
    peer.pendingWaypointCounts = null;
    if (latestState) peer.sendPreparedState(latestState);
    // The state may reset the client's roster. Its owner counts must follow it,
    // even if writing that state re-enters backpressure. The byte limit still
    // applies to this single metadata frame.
    if (latestWaypointCounts) sendPreparedPeerFrame(peer, latestWaypointCounts);
  });

  let session = resumable && !resumable.peer && resumable.expiresAt > now ? resumable : null;
  if (session) peer.resumed = true;
  if (!session) {
    if (activeResume) {
      peer.resumePending = true;
      peer.resumeWaitSession = resumable;
      resumable.waitingPeers.add(peer);
    } else {
      const taken = new Set([...sessions.values()]
        .filter((entry) => (entry.peer && !entry.peer.closed) || (!entry.peer && entry.expiresAt > now))
        .map((entry) => entry.team));
      if (pveLaunchOptions) taken.add(1);
      const team = [0, 1].find((candidate) => !taken.has(candidate)) ?? null;
      if (team !== null) {
        const token = randomBytes(32).toString('base64url');
        const tokenHash = createHash('sha256').update(token).digest('base64url');
        session = { tokenHash, team, id: `player-${nextPlayerId++}`, peer, expiresAt: 0, waitingPeers: new Set() };
        sessions.set(tokenHash, session);
        peer.sessionToken = token;
      }
    }
  }
  if (session) {
    session.peer = peer;
    session.expiresAt = 0;
    peer.id = session.id;
    peer.team = session.team;
    peer.session = session;
    if (!peer.sessionToken && resumeToken) peer.sessionToken = resumeToken;
  } else {
    peer.id = `spectator-${nextPlayerId++}`;
  }
  peers.add(peer);
  if (peer.team === 0) activatePveOpponent();
  return peer;
}

function isSameOriginWebSocketRequest(request) {
  return sameOriginRequest(request, {
    allowedOrigins: PUBLIC_ORIGINS,
    httpsTerminatedAtEdge: RAILWAY_DEPLOYMENT,
  });
}

function hasCompatiblePerMessageDeflateOffer(request) {
  const extensions = request.headers['sec-websocket-extensions'];
  if (typeof extensions !== 'string') return false;
  return extensions.split(',').some((offer) => {
    const [extensionName, ...parameters] = offer.split(';');
    if (extensionName.trim().toLowerCase() !== 'permessage-deflate') return false;
    const seen = new Set();
    for (const parameter of parameters) {
      const [rawName, rawValue] = parameter.trim().split('=', 2);
      const name = rawName.trim().toLowerCase();
      if (seen.has(name)) return false;
      seen.add(name);
      if (name === 'client_no_context_takeover' || name === 'server_no_context_takeover') {
        if (rawValue !== undefined) return false;
        continue;
      }
      if (name === 'client_max_window_bits') {
        if (rawValue !== undefined && !/^(?:8|9|1[0-5])$/.test(rawValue.trim())) return false;
        continue;
      }
      // The server uses the default 15-bit window and cannot honor a smaller server window.
      if (name === 'server_max_window_bits') return false;
      return false;
    }
    return true;
  });
}

const server = createServer(async (request, response) => {
  if (shuttingDown) {
    response.writeHead(503, { connection: 'close', 'cache-control': 'no-store' });
    response.end('Server is restarting');
    return;
  }
  let url;
  try {
    url = new URL(request.url || '/', `http://${request.headers.host || `${HOST}:${PORT}`}`);
  } catch {
    response.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Bad request');
    return;
  }
  if (url.pathname === '/health') {
    response.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    const peerTransport = [...peers];
    response.end(JSON.stringify({
      ok: true, tickRate: TICK_RATE, connected: connectedCount(), armySize: currentArmySize,
      matchId,
      map: mapDefinition.id, width: MAP_WIDTH, height: MAP_HEIGHT, maps: mapCatalog.size,
      pve: {
        enabled: Boolean(pveLaunchOptions), active: pveOpponentActive,
        mapSeed: pveLaunchOptions?.mapSeed ?? null,
        policySeed: pveLaunchOptions?.policySeed ?? null,
        mapId: pveLaunchOptions?.mapId ?? null,
        commandsIssued: pveCommandsIssued, error: pveOpponentError,
      },
      checkpoint: {
        enabled: Boolean(MATCH_STATE_PATH), sequence: checkpointSequence,
        intervalMs: MATCH_CHECKPOINT_INTERVAL_TICKS * (1000 / TICK_RATE),
        ageMs: lastCheckpointAt ? Math.max(0, Date.now() - lastCheckpointAt) : null,
        writing: Boolean(checkpointWritePromise), queued: checkpointWriteQueueDepth > 0,
        failures: checkpointFailures, recovered: recoveredFromCheckpoint,
        lastBytes: lastCheckpointBytes, lastWriteMs: lastCheckpointWriteMs,
        lastCaptureMs: lastCheckpointCaptureMs, lastSerializeMs: lastCheckpointSerializeMs,
      },
      tickTiming: tickTimingPayload(),
      separationWork: separationWorkPayload(),
      movePlanning: movePlanningSamples,
      transport: {
        activePeers: peerTransport.length,
        maxQueuedBytesPerPeer: MAX_PEER_QUEUED_BYTES,
        maxInboundControlFramesPerSecond: MAX_INBOUND_CONTROL_FRAMES_PER_SECOND,
        inboundControlFramesReceived,
        inboundControlPingsReceived,
        inboundControlPongsReceived,
        inboundControlRateLimitDisconnects,
        activeControlFramesInCurrentWindow: peerTransport.reduce(
          (total, peer) => total + peer.inboundControlFramesInWindow, 0,
        ),
        maxPendingCommandsPerPeer: MAX_PENDING_COMMANDS_PER_PEER,
        maxPendingCommandBytesPerPeer: MAX_PENDING_COMMAND_BYTES_PER_PEER,
        pendingCommands: peerTransport.reduce((total, peer) => total + peer.pendingCommandCount, 0),
        pendingCommandBytes: peerTransport.reduce((total, peer) => total + peer.pendingCommandBytes, 0),
        commandQueueLimitRejections,
        outboundQueueLimitDisconnects,
        peakOutboundQueuedBytes,
        backpressuredPeers: peerTransport.filter((peer) => peer.backpressured).length,
        queuedBytes: peerTransport.reduce((total, peer) => total + peer.socket.writableLength, 0),
        peakQueuedBytes: peerTransport.reduce((peak, peer) => Math.max(peak, peer.peakQueuedBytes), 0),
        coalescedStateSnapshots: peerTransport.reduce((total, peer) => total + peer.coalescedStateSnapshots, 0),
        compressionPeers: peerTransport.filter((peer) => peer.compressionEnabled).length,
        jsonFramesSent: peerTransport.reduce((total, peer) => total + peer.outboundJsonFrames, 0),
        jsonPayloadBytesSent: peerTransport.reduce((total, peer) => total + peer.outboundJsonPayloadBytes, 0),
        jsonWireBytesSent: peerTransport.reduce((total, peer) => total + peer.outboundJsonWireBytes, 0),
        jsonUncompressedWireBytesSent: peerTransport.reduce((total, peer) => total + peer.outboundJsonUncompressedWireBytes, 0),
        compressedFramesSent: peerTransport.reduce((total, peer) => total + peer.outboundCompressedFrames, 0),
        compressedPayloadBytesSent: peerTransport.reduce((total, peer) => total + peer.outboundCompressedPayloadBytes, 0),
        compressedWireBytesSent: peerTransport.reduce((total, peer) => total + peer.outboundCompressedWireBytes, 0),
      },
    }));
    return;
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405);
    response.end('Method not allowed');
    return;
  }
  let relative;
  try {
    relative = decodeURIComponent(url.pathname).replace(/^\/+/, '');
  } catch {
    response.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Bad request');
    return;
  }
  if (!relative) relative = 'index.html';
  const vendorThreeAsset = relative === 'vendor/three.module.js' || relative === 'vendor/three.core.js';
  const target = vendorThreeAsset
    ? path.join(ROOT, 'node_modules/three/build', path.basename(relative))
    : path.resolve(ROOT, relative);
  if (target !== ROOT && !target.startsWith(`${ROOT}${path.sep}`)) {
    response.writeHead(403);
    response.end('Forbidden');
    return;
  }
  const publicClientAsset = [
    'environment-review.html', 'src/environment-review.mjs', 'src/environment-pilot.mjs',
    'index.html', 'style.css', 'vendor/three.module.js', 'vendor/three.core.js', 'src/main.js',
    'src/building-sprites.mjs', 'src/battlefield-cursor.mjs', 'src/pve-entry.mjs', 'src/pve-match.mjs',
    'src/scenario-regions.mjs', 'src/scenario-authoring.mjs', 'src/map-utils.mjs', 'src/elevation.mjs', 'src/town-center-spawn.mjs', 'src/map-resize.mjs',
    'src/map-studio-viewport.mjs', 'src/order-feedback.mjs', 'src/resource-visual-state.mjs', 'src/resource-format.mjs', 'src/gameplay-definitions.mjs', 'src/gameplay-presentation.mjs', 'src/population.mjs', 'src/production-actions.mjs', 'src/research-actions.mjs',
    'src/building-visual-state.mjs', 'src/unit-lod-state.mjs', 'src/unit-selection.mjs',
    'src/selection-context.mjs', 'src/unit-visual-state.mjs', 'src/unit-sprite-runtime.mjs',
    'src/terrain-authoring.mjs', 'src/terrain-height.mjs', 'src/regions.mjs', 'src/audio.mjs', 'src/audio-policy.mjs', 'src/audio-event-profile.mjs',
    'src/audio-shipped-loader.mjs', 'src/audio-shipped-catalog.mjs',
    'src/audio-composition-player.mjs', 'src/audio-assets.mjs', 'src/audio-library-store.mjs',
    'src/audio-library-ui.mjs', 'src/audio-studio.mjs', 'src/audio-studio.css',
    'src/audio-composition.mjs', 'src/audio-composer.mjs', 'src/audio-composer.css',
    'audio-studio.html', 'audio-zones.html', 'src/audio-zones.mjs', 'src/audio-zones.css', 'src/audio-recognition-check.mjs', 'src/camera-controls.mjs',
    'src/navigation-settings.mjs', 'src/objective-summary.mjs', 'src/hud-layout.mjs',
    'src/resource-format.mjs', 'src/gameplay-definitions.mjs', 'src/gameplay-presentation.mjs', 'src/population.mjs', 'src/production-actions.mjs', 'src/research-actions.mjs',
    'src/captured-building-art.mjs', 'src/water-surface-geometry.mjs', 'src/terrain-blend.mjs', 'src/terrain-texture-sampling.mjs', 'src/terrain-atmosphere.mjs', 'src/terrain-materials.mjs',
  ].includes(relative);
  const publicUiAsset = [
    'assets/ui/cursors/select-add.png',
    'assets/ui/cursors/select-remove.png',
    'assets/ui/cursors/box-crossing.png',
    'assets/ui/cursors/move-queued.png',
    'assets/ui/cursors/attack.png',
    'assets/ui/cursors/attack-move-queued.png',
    'assets/ui/cursors/gather-wood.png',
    'assets/ui/cursors/rally.png',
    'assets/ui/cursors/unavailable.png',
    'assets/ui/preview.html', 'assets/ui/cursors/manifest.json',
    'assets/ui/cursors/select.png', 'assets/ui/cursors/select.svg',
    'assets/ui/cursors/box-select.png', 'assets/ui/cursors/box-select.svg',
    'assets/ui/cursors/move.png', 'assets/ui/cursors/move.svg',
    'assets/ui/cursors/attack-move.png', 'assets/ui/cursors/attack-move.svg',
    'assets/ui/cursors/gather.png', 'assets/ui/cursors/gather.svg',
    'assets/ui/cursors/build-valid.png', 'assets/ui/cursors/build-valid.svg',
    'assets/ui/cursors/build-blocked.png', 'assets/ui/cursors/build-blocked.svg',
    'assets/ui/icons/wood.svg', 'assets/ui/icons/food.svg', 'assets/ui/icons/move.svg',
    'assets/ui/icons/attack.svg', 'assets/ui/icons/gather.svg', 'assets/ui/icons/build.svg',
  ].includes(relative);
  const publicEnvironmentModule = relative === 'src/environment-art.mjs';
  const publicEnvironmentAtlasMetadata = ['bellweather', 'sereward', 'pale-meridian', 'siltmouths', 'vesperra', 'sombral-mere', 'underbough', 'underbough-bramble', 'veyrholds', 'ellionar', 'ellionar-hedge', 'sereward-acacia', 'sereward-scrub', 'bellweather-hedgerow'].some((region) =>
    relative === `assets/environment/frontier-v1/${region}-lifecycle-atlas.json`);
  const publicEnvironmentAsset = path.dirname(relative) === 'assets/environment/frontier-v1'
    && ['.png', '.webp'].includes(path.extname(relative))
    && ['oak', 'pine', 'silver-birch', 'field-maple', 'hazel-thicket',
      'bellweather-field-maple', 'bellweather-hedgerow', 'vesperra-shade-fern', 'siltmouths-silver-reed', 'pale-meridian-silver-moss', 'sombral-mere-lunewort',
      'bellweather-hedgerow-worked', 'bellweather-hedgerow-low', 'bellweather-hedgerow-depleted',
      'bellweather-lifecycle-atlas', 'bellweather-hedgerow-lifecycle-atlas', 'sereward-lifecycle-atlas', 'pale-meridian-lifecycle-atlas', 'siltmouths-lifecycle-atlas', 'vesperra-lifecycle-atlas', 'sombral-mere-lifecycle-atlas', 'underbough-lifecycle-atlas', 'underbough-bramble-lifecycle-atlas', 'veyrholds-lifecycle-atlas', 'ellionar-lifecycle-atlas', 'ellionar-hedge-lifecycle-atlas', 'sereward-scrub-lifecycle-atlas', 'sereward-acacia-lifecycle-atlas',
      'sombral-mere-merebloom', 'sombral-mere-merebloom-worked', 'sombral-mere-merebloom-low', 'sombral-mere-merebloom-depleted',
      'vesperra-mistbark', 'vesperra-mistbark-worked', 'vesperra-mistbark-low', 'vesperra-mistbark-depleted',
      'siltmouths-tidal-tree', 'siltmouths-tidal-tree-worked', 'siltmouths-tidal-tree-low', 'siltmouths-tidal-tree-depleted',
      'pale-meridian-conifer', 'pale-meridian-conifer-worked', 'pale-meridian-conifer-low', 'pale-meridian-conifer-depleted',
      'bellweather-field-maple-worked', 'bellweather-field-maple-low', 'bellweather-field-maple-depleted',
      'veyrholds-highpine-worked', 'veyrholds-highpine-low', 'veyrholds-highpine-depleted',
      'veyrholds-highpine', 'veyrholds-ironlichen-outcrop', 'ru-lora-fiendwood', 'ru-lora-stone-fern', 'ru-lora-broken-trunk',
      'underbough-copperleaf', 'underbough-bramble',
      'underbough-bramble-worked', 'underbough-bramble-low', 'underbough-bramble-depleted',
      'underbough-copperleaf-worked', 'underbough-copperleaf-low', 'underbough-copperleaf-depleted',
      'sereward-palm', 'sereward-acacia', 'sereward-scrub',
      'sereward-palm-worked', 'sereward-palm-low', 'sereward-palm-depleted',
      'sereward-scrub-worked', 'sereward-scrub-low', 'sereward-scrub-depleted',
      'sereward-acacia-worked', 'sereward-acacia-low', 'sereward-acacia-depleted',
      'ellionar-cultivated-palm', 'ellionar-garden-hedge',
      'ellionar-cultivated-palm-worked', 'ellionar-cultivated-palm-low', 'ellionar-cultivated-palm-depleted',
      'ellionar-garden-hedge-worked', 'ellionar-garden-hedge-low', 'ellionar-garden-hedge-depleted',
      'rock-boulder-cluster', 'basalt-ridge-cap', 'cliff-end-cap',
      'berries', 'rock-outcrop', 'basalt-ridge', 'cliff', 'seamstone',
      ...TERRAIN_MATERIALS].includes(path.basename(relative, path.extname(relative)));
  const publicInteractiveEnvironmentAsset = path.dirname(relative) === 'assets/environment/frontier-interactive-v1'
    && (relative === 'assets/environment/frontier-interactive-v1/manifest.json'
      || (path.extname(relative) === '.webp'
        && /^(?:(?:oak|berries)-(?:full|worked|low|depleted)|construction-(?:earthwork|foundation))$/
          .test(path.basename(relative, path.extname(relative)))));
  const publicMeshyResourceAsset = /^assets\/environment\/frontier-meshy-sprites-v1\/(oak|pine|berries)\/runtime\/\1-0[0-7]\.webp$/.test(relative);
  const publicEnvironmentPilotAsset = path.dirname(relative) === 'assets/environment/frontier-cliff-pilot-v1/runtime'
    && /^(cliff-color-0[0-7]\.webp|cliff-depth-0[0-7]\.png)$/.test(path.basename(relative));
  const publicBuildingSpriteAsset = (
    path.dirname(relative) === 'assets/buildings/town-center-meshy-review-v1/runtime'
    && /^town-center-view-0[0-7]\.webp$/.test(path.basename(relative))
  ) || ['barracks', 'archery-range'].some((kind) =>
    path.dirname(relative) === `assets/buildings/${kind === 'barracks' ? 'barracks-sprite-test-v1' : 'archery-range-sprite-v1'}/runtime`
    && new RegExp(`^${kind}-(foundation|frame|complete|damaged|critical)-(azure|ember)\\.webp$`).test(path.basename(relative)));
  const publicMapAsset = path.dirname(relative) === 'maps' && path.extname(relative) === '.json';
  const publicUnitSpriteAsset = [
    ...['worker', 'infantry', 'spearman', 'archer', 'scout', 'rider', 'siege-engine'].map(role => [`boughward-${role}`, 'v1']),
    ['worker', 'v1'], ['worker', 'v2'], ['worker', 'v3'],
    ['infantry', 'v1'], ['infantry', 'v2'], ['infantry', 'v3'], ['spearman', 'v1'], ['scout', 'v1'], ['rider', 'v1'], ['siege-engine', 'v1'], ['archer', 'v1'], ['archer', 'v2'],
    ...['human', 'orc', 'elf', 'troll'].map(role => [role, 'v1', 'cast']),
    ['human', 'v2', 'cast'], ['human', 'v3', 'cast'],
  ].some(([role, version, prefix]) => {
    const directory = `assets/units/${prefix ? `${prefix}-` : ''}${role}-sprite-${version}`;
    return [
      `${directory}/sprite-atlas-pack-v1.json`,
      `${directory}/${prefix || role}-atlas-runtime.png`,
      `${directory}/team-accent-mask.png`,
    ].includes(relative);
  });
  const buildingPackRoot = 'assets/buildings/town-center-lifecycle-meshy-v1';
  const publicBuildingLifecycleManifest = relative === `${buildingPackRoot}/lifecycle-grid.json`;
  const publicBuildingLifecycleRuntimeAsset = path.dirname(relative) === `${buildingPackRoot}/runtime`
    && /^(?:town-center-(?:foundation|frame|complete|damaged|critical)-view-\d{2}\.webp|team-mask-(?:foundation|frame|complete|damaged|critical)-view-\d{2}\.png)$/.test(path.basename(relative));
  const publicZoneAudioAsset = (relative === 'assets/audio/runtime/rts-feedback-test/v1/manifest.json'
    || /^assets\/audio\/runtime\/vaelora-(?:bellweather|underbough|sereward|ellionar|veyrholds|pale-meridian|siltmouths|vesperra|sombral-mere|ru-lora-fringe|ru-lora-interior)\/v[12]\/manifest\.json$/.test(relative))
    || relative === 'assets/audio/vaelora-zones-v1/catalog.json'
    || /^assets\/audio\/vaelora-zones-v1\/sources\/tus_(?:bellweather|underbough|sereward|ellionar|veyrholds|pale-meridian|siltmouths|vesperra|sombral-mere|ru-lora-fringe|ru-lora-interior)_(?:music|terrain|contrast|signature)_0[12]_v001\.mp3$/.test(relative)
    || /^assets\/audio\/vaelora-pilot-v1\/sources\/tus_ui_(?:wood-token|iron-latch|muted-pluck|horn-note)_01_v001\.mp3$/.test(relative);
  if (!publicZoneAudioAsset && !publicClientAsset && !publicEnvironmentModule && !publicEnvironmentAsset && !publicEnvironmentAtlasMetadata && !publicUiAsset
    && !publicMeshyResourceAsset && !publicInteractiveEnvironmentAsset && !publicEnvironmentPilotAsset && !publicBuildingSpriteAsset && !publicMapAsset
    && !publicUnitSpriteAsset && !publicBuildingLifecycleManifest && !publicBuildingLifecycleRuntimeAsset) {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Not found');
    return;
  }
  try {
    const metadata = await stat(target);
    if (!metadata.isFile()) throw new Error('not a file');
    const body = await readFile(target);
    response.writeHead(200, {
      'content-type': MIME_TYPES[path.extname(target)] || 'application/octet-stream',
      'content-length': body.length,
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    });
    response.end(request.method === 'HEAD' ? undefined : body);
  } catch {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Not found');
  }
});

server.on('upgrade', (request, socket, head) => {
  if (shuttingDown) {
    socket.end('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
    return;
  }
  if (!isSameOriginWebSocketRequest(request)) {
    socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
    return;
  }
  if (peers.size >= MAX_PEERS) {
    socket.end('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
    return;
  }
  const url = new URL(request.url || '/', `http://${request.headers.host || `${HOST}:${PORT}`}`);
  const key = request.headers['sec-websocket-key'];
  if (url.pathname !== '/ws' || typeof key !== 'string' || request.headers.upgrade?.toLowerCase() !== 'websocket') {
    socket.destroy();
    return;
  }
  pruneExpiredSessions();
  const requestedProtocols = String(request.headers['sec-websocket-protocol'] || '')
    .split(',').map((protocol) => protocol.trim());
  const resumeProtocol = requestedProtocols.find((protocol) => /^rts-resume\.[A-Za-z0-9_-]{43}$/.test(protocol));
  const resumeToken = resumeProtocol ? resumeProtocol.slice('rts-resume.'.length) : null;
  const selectedProtocol = requestedProtocols.includes('rts-v1') ? 'rts-v1' : null;
  const compressionEnabled = hasCompatiblePerMessageDeflateOffer(request);
  const accept = createHash('sha1').update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest('base64');
  const handshake = [
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Accept: ${accept}`,
    ...(selectedProtocol ? [`Sec-WebSocket-Protocol: ${selectedProtocol}`] : []),
    ...(compressionEnabled ? [
      'Sec-WebSocket-Extensions: permessage-deflate; server_no_context_takeover; client_no_context_takeover',
    ] : []),
    '\r\n',
  ].join('\r\n');
  socket.write(handshake);
  socket.setNoDelay(true);
  const peer = createPeer(socket, resumeToken, compressionEnabled);
  dirty = true;
  peer.sendJson({
    type: 'welcome',
    serverInstanceId: SERVER_INSTANCE_ID,
    matchId,
    recoveredFromCheckpoint,
    checkpointSequence,
    player: {
      id: peer.id, team: peer.team, isHost: peer.team === 0,
      sessionToken: peer.sessionToken || null, resumed: peer.resumed,
      resumePending: peer.resumePending,
    },
    map: mapDefinition, maps: mapCatalogPayload(),
    state: roomPayload(peer.team),
  });
  broadcast({ type: 'room', connected: connectedCount() });
  socket.on('data', (chunk) => peer.consume(chunk));
  socket.on('close', () => releasePeer(peer, false));
  socket.on('error', () => releasePeer(peer, false));
  if (head?.length) peer.consume(head);
});

const heartbeatTimer = setInterval(() => {
  const now = Date.now();
  for (const peer of peers) {
    if (now - peer.lastPongAt > HEARTBEAT_TIMEOUT_MS) {
      peer.terminate();
      continue;
    }
    sendPeerControlFrame(peer, 0x9, Buffer.from(String(now)));
  }
}, HEARTBEAT_INTERVAL_MS);
heartbeatTimer.unref();

await initializeMatchFromCheckpoint();
const pveOpponentTimer = pveLaunchOptions
  ? setInterval(() => { void drivePveOpponent(); }, PVE_DECISION_INTERVAL_MS)
  : null;
pveOpponentTimer?.unref();
let simulationDeadlineMs = performance.now() + TICK_INTERVAL_MS;
let simulationTimer = null;
function runSimulationTick() {
  const tickStartedAt = performance.now();
  const cpuStartedAt = tickDiagnosticSamples ? process.cpuUsage() : null;
  if (lastSimulationTickStartedAt !== null) {
    recordTickStartLag(Math.max(0, tickStartedAt - lastSimulationTickStartedAt - (1000 / TICK_RATE)));
  }
  lastSimulationTickStartedAt = tickStartedAt;
  simulateTick();
  recordSeparationWorkSample();
  const moveStartBroadcastRequested = takeMoveStartBroadcastRequest();
  const afterSimulation = tickDiagnosticSamples ? performance.now() : null;
  let afterVision = afterSimulation;
  let scenarioMs = 0;
  const scenarioEvaluated = tickNumber % STATE_EVERY_TICKS === 0;
  if (scenarioEvaluated) {
    updateVisionMasks();
    const scenarioStartedAt = tickDiagnosticSamples ? performance.now() : null;
    evaluateScenarioTriggers(STATE_EVERY_TICKS * STEP_SECONDS);
    if (tickDiagnosticSamples) {
      afterVision = performance.now();
      scenarioMs = afterVision - scenarioStartedAt;
    }
    if (dirty) broadcastState();
  } else if (moveStartBroadcastRequested && dirty) {
    updateVisionMasks();
    if (tickDiagnosticSamples) afterVision = performance.now();
    broadcastState();
  }
  const afterBroadcast = tickDiagnosticSamples ? performance.now() : null;
  if (tickNumber % MATCH_CHECKPOINT_INTERVAL_TICKS === 0) void queueMatchCheckpoint();
  const tickEndedAt = performance.now();
  const durationMs = tickEndedAt - tickStartedAt;
  let diagnostic = null;
  if (tickDiagnosticSamples) {
    const cpu = process.cpuUsage(cpuStartedAt);
    diagnostic = {
      tickNumber,
      durationMs: Number(durationMs.toFixed(3)),
      cpuMs: Number(((cpu.user + cpu.system) / 1000).toFixed(3)),
      simulationMs: Number((afterSimulation - tickStartedAt).toFixed(3)),
      visionMs: Number((afterVision - afterSimulation - scenarioMs).toFixed(3)),
      scenarioMs: Number(scenarioMs.toFixed(3)), scenarioEvaluated,
      broadcastMs: Number((afterBroadcast - afterVision).toFixed(3)),
      checkpointMs: Number((tickEndedAt - afterBroadcast).toFixed(3)),
    };
  }
  recordTickDuration(durationMs, diagnostic);
  const schedule = advanceTickDeadline(simulationDeadlineMs, tickEndedAt, TICK_INTERVAL_MS);
  if (schedule.skippedTickSlots > 0) {
    skippedTickSlotsTotal += schedule.skippedTickSlots;
    lastOverloadSkippedSlots = schedule.skippedTickSlots;
    lastOverloadTick = tickNumber;
  }
  simulationDeadlineMs = schedule.nextDeadlineMs;
  scheduleSimulationTick();
}

function scheduleSimulationTick() {
  const delayMs = Math.max(0, simulationDeadlineMs - performance.now());
  simulationTimer = setTimeout(() => {
    simulationTimer = null;
    runSimulationTick();
  }, delayMs);
  simulationTimer.unref();
}

scheduleSimulationTick();

let shutdownSockets = new Set();
let forcedShutdownTimer = null;
function shutdown(signal) {
  if (shuttingDown) {
    for (const peer of shutdownSockets) peer.socket.destroy();
    server.closeAllConnections?.();
    return;
  }
  shuttingDown = true;
  clearInterval(heartbeatTimer);
  if (pveOpponentTimer) clearInterval(pveOpponentTimer);
  if (simulationTimer) clearTimeout(simulationTimer);
  cancelMovePlanningJobs();
  const finalCheckpoint = queueMatchCheckpoint();
  shutdownSockets = new Set(peers);
  let httpClosed = false;
  let finishStarted = false;
  const finishIfDrained = () => {
    if (!httpClosed || shutdownSockets.size > 0 || finishStarted) return;
    finishStarted = true;
    void finalCheckpoint.finally(() => {
      clearTimeout(forcedShutdownTimer);
      console.log('RTS server shutdown complete.');
      if (process.connected) process.disconnect();
    });
  };
  for (const peer of shutdownSockets) {
    peer.socket.once('close', () => {
      shutdownSockets.delete(peer);
      finishIfDrained();
    });
    peer.close();
  }
  forcedShutdownTimer = setTimeout(() => {
    for (const peer of shutdownSockets) peer.socket.destroy();
    server.closeAllConnections?.();
  }, 5000);
  server.close(() => {
    httpClosed = true;
    finishIfDrained();
  });
  console.log(`RTS server draining after ${signal}.`);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

server.listen(PORT, HOST, () => {
  const address = server.address();
  console.log(`RTS prototype server listening at http://${HOST}:${address.port} · map ${mapDefinition.id}`);
  if (process.env.RTS_MANAGED_WORKER === '1' && process.connected) {
    process.send({ type: 'ready', port: address.port,
      ...(pveLaunchOptions ? { roomMetadata: { mapId: mapDefinition.id } } : {}) });
  }
});
