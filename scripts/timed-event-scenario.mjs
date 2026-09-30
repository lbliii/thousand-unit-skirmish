import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SERVER_PATH = path.join(ROOT, 'server.mjs');
const READY_TIMEOUT_MS = 10_000;
const MESSAGE_TIMEOUT_MS = 30_000;
let stage = 'initialization';

async function reservePort() {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function startServer(port, customMapDirectory, matchStatePath = null) {
  const child = spawn(process.execPath, [SERVER_PATH], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      RTS_HOST: '127.0.0.1',
      RTS_CUSTOM_MAP_DIRECTORY: customMapDirectory,
      ...(matchStatePath ? { RTS_MATCH_STATE_PATH: matchStatePath } : {}),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk.toString(); });
  child.stderr.on('data', (chunk) => { output += chunk.toString(); });
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Server exited during startup:\n${output}`);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`, { cache: 'no-store' });
      if (response.ok) return child;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  child.kill('SIGKILL');
  throw new Error(`Server did not become healthy within ${READY_TIMEOUT_MS} ms:\n${output}`);
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  const exited = once(child, 'exit');
  child.kill('SIGINT');
  await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 3000))]);
  if (child.exitCode === null) {
    const forcedExit = once(child, 'exit');
    child.kill('SIGKILL');
    await forcedExit;
  }
}

function createClient(port, token = null) {
  const protocols = token ? ['rts-v1', `rts-resume.${token}`] : ['rts-v1'];
  const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`, protocols);
  const messages = [];
  const messageWaiters = [];
  const stateWaiters = [];
  let latestState = null;
  socket.addEventListener('message', (event) => {
    let message;
    try { message = JSON.parse(event.data); } catch { return; }
    messages.push(message);
    if (message.type === 'state' || message.type === 'mapChange') {
      const state = message.type === 'mapChange' ? message.state : message;
      if (state?.type === 'state') {
        latestState = state;
        for (let index = stateWaiters.length - 1; index >= 0; index--) {
          const waiter = stateWaiters[index];
          if (!waiter.predicate(state)) continue;
          stateWaiters.splice(index, 1);
          clearTimeout(waiter.timeout);
          waiter.resolve(state);
        }
      }
    }
    for (let index = messageWaiters.length - 1; index >= 0; index--) {
      const waiter = messageWaiters[index];
      if (messages.length - 1 < waiter.afterIndex || !waiter.predicate(message)) continue;
      messageWaiters.splice(index, 1);
      clearTimeout(waiter.timeout);
      waiter.resolve(message);
    }
  });
  function waitForMessage(predicate, afterIndex = -1) {
    const existing = messages.find((message, index) => index > afterIndex && predicate(message));
    if (existing) return Promise.resolve(existing);
    return new Promise((resolve, reject) => {
      const waiter = { predicate, afterIndex, resolve, reject, timeout: setTimeout(() => {
        messageWaiters.splice(messageWaiters.indexOf(waiter), 1);
        reject(new Error('Timed out waiting for a server message.'));
      }, MESSAGE_TIMEOUT_MS) };
      messageWaiters.push(waiter);
    });
  }
  function waitForState(predicate) {
    if (latestState && predicate(latestState)) return Promise.resolve(latestState);
    return new Promise((resolve, reject) => {
      const waiter = { predicate, resolve, reject, timeout: setTimeout(() => {
        stateWaiters.splice(stateWaiters.indexOf(waiter), 1);
        const summary = latestState ? {
          tick: latestState.tick, mapId: latestState.mapId,
          armySize: latestState.armySize, units: latestState.units?.length,
          scenarioClockStarted: latestState.scenarioClockStarted,
          connected: latestState.connected, winner: latestState.winner,
          unit0: latestState.units?.find((unit) => unit[0] === 0),
          objectives: latestState.objectives?.map((objective) => ({
            id: objective.id, owner: objective.owner, progressTeam: objective.progressTeam,
            progress: objective.progress, unitCounts: objective.unitCounts,
          })),
          captureEvents: latestState.scenarioEvents?.filter((event) => event.activatedAtSeconds !== undefined),
        } : null;
        reject(new Error(`Timed out waiting for an authoritative state. Latest: ${JSON.stringify(summary)}`));
      }, MESSAGE_TIMEOUT_MS) };
      stateWaiters.push(waiter);
    });
  }
  const opened = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timed out opening WebSocket.')), MESSAGE_TIMEOUT_MS);
    socket.addEventListener('open', () => { clearTimeout(timeout); resolve(); }, { once: true });
    socket.addEventListener('error', () => { clearTimeout(timeout); reject(new Error('WebSocket connection failed.')); }, { once: true });
  });
  return { socket, messages, opened, waitForMessage, waitForState };
}

function send(client, message) {
  client.socket.send(JSON.stringify(message));
}

async function closeClient(client) {
  if (!client || client.socket.readyState === WebSocket.CLOSED) return;
  await new Promise((resolve) => {
    client.socket.addEventListener('close', resolve, { once: true });
    client.socket.close(1000, 'timed event scenario complete');
  });
}

function eventFired(state, id, fired = true) {
  return state.scenarioEvents?.find((event) => event.id === id)?.fired === fired;
}

function liveUnitCount(state, team, kind) {
  return state.units.filter((unit) => unit[1] === team && unit[4] > 0 && unit[5] === kind).length;
}

function cellKey(x, z, width, height) {
  const column = Math.floor(x + width / 2);
  const row = Math.floor(z + height / 2);
  return { column, row, key: `${column},${row}` };
}

const port = await reservePort();
const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'rts-timed-events-'));
const customMapDirectory = path.join(tempRoot, 'custom-maps');
const checkpointPath = path.join(tempRoot, 'match-state.json');
const clients = [];
let server = null;

try {
  stage = 'start isolated test server';
  server = await startServer(port, customMapDirectory, checkpointPath);
  stage = 'connect Azure';
  let azure = createClient(port);
  clients.push(azure);
  await azure.opened;
  const azureWelcome = await azure.waitForMessage((message) => message.type === 'welcome');
  assert.equal(azureWelcome.player.team, 0, 'first client should claim Azure');

  const baseMap = JSON.parse(await readFile(new URL('../maps/open-field.json', import.meta.url), 'utf8'));
  const map = {
    ...baseMap,
    id: 'timed-event-scenario',
    name: 'Timed Event Scenario',
    victoryMode: 'all',
    fogOfWar: false,
    triggers: [
      {
        id: 'home-cache-zone', name: 'Home Crown', type: 'capture-zone',
        zone: { column: 12, row: 29, width: 6, height: 6 },
        requiredUnits: 1, captureSeconds: 0.5, victory: true,
      },
      {
        id: 'frontier-crown', name: 'Frontier Crown', type: 'capture-zone',
        zone: { column: 22, row: 42, width: 6, height: 6 },
        requiredUnits: 1, captureSeconds: 0.5, victory: true,
      },
    ],
    scenarioEvents: [
      {
        id: 'azure-cache', type: 'timed-supply', name: 'Azure Cache',
        afterSeconds: 0.6, team: '0', foodReward: 25, woodReward: 8,
        message: '{event} · +{reward} FOOD · +{wood} WOOD TO {team}',
        unitCount: 2, unitKind: 'worker',
      },
      {
        id: 'shared-rations', type: 'timed-supply', name: 'Shared Rations',
        afterSeconds: 1.4, team: 'both', foodReward: 10, woodReward: 10,
        unitCount: 1, unitKind: 'archer',
        message: '{event} · {units} {kind} TO {team} · +{reward} FOOD · +{wood} WOOD',
      },
      {
        id: 'legacy-food-drop', type: 'timed-supply', name: 'Legacy Food Drop',
        afterSeconds: 2.2, team: 'both', foodReward: 5,
      },
      {
        id: 'unit-only-drop', type: 'timed-supply', name: 'Unit Only Drop',
        afterSeconds: 2.8, team: '0', foodReward: 0, unitCount: 1, unitKind: 'infantry',
      },
      {
        id: 'ember-wood-drop', type: 'timed-supply', name: 'Ember Wood Drop',
        afterSeconds: 3.2, team: '1', foodReward: 0, woodReward: 7,
      },
      {
        id: 'capture-cache', type: 'timed-supply', name: 'Captured Cache',
        trigger: { type: 'capture', objectiveId: 'home-cache-zone' },
        afterSeconds: 6, team: 'capturing', foodReward: 13, woodReward: 4,
        unitCount: 1, unitKind: 'worker',
        message: '{event} · {team} · +{reward} FOOD · +{wood} WOOD · {units} {kind}',
      },
      {
        id: 'final-crown-cache', type: 'timed-supply', name: 'Final Crown Cache',
        trigger: { type: 'capture', objectiveId: 'frontier-crown' },
        afterSeconds: 0.6, repeatCount: 2, repeatEverySeconds: 5,
        team: 'capturing', foodReward: 19,
      },
    ],
  };
  stage = 'validate event map definitions';
  const invalidMap = {
    ...map,
    id: 'timed-event-invalid',
    scenarioEvents: [{ ...map.scenarioEvents[0], id: 'invalid-team', team: 'spectators' }],
  };
  const invalidNotice = azure.waitForMessage((message) => message.type === 'mapRejected'
    && /invalid timed supply event/i.test(message.message));
  send(azure, { type: 'publishMap', map: invalidMap });
  await invalidNotice;
  for (const [invalidId, fields] of [
    ['invalid-unit-count', { unitCount: 26, unitKind: 'infantry' }],
    ['invalid-unit-kind', { unitCount: 1, unitKind: 'cavalry' }],
    ['invalid-wood-reward', { woodReward: 10001 }],
    ['empty-event', { foodReward: 0, woodReward: 0, unitCount: 0, message: '' }],
    ['capturing-team-on-clock', { team: 'capturing' }],
    ['missing-capture-zone', { trigger: { type: 'capture', objectiveId: 'missing-zone' } }],
    ['invalid-capture-occurrence', {
      trigger: { type: 'capture', objectiveId: 'home-cache-zone', occurrence: 'continuous' },
    }],
    ['missing-repeat-interval', { repeatCount: 1 }],
    ['repeat-interval-without-count', { repeatEverySeconds: 5 }],
    ['too-many-repeats', { repeatCount: 21, repeatEverySeconds: 5 }],
    ['repeat-interval-too-short', { repeatCount: 1, repeatEverySeconds: 4 }],
  ]) {
    const invalidUnitNotice = azure.waitForMessage((message) => message.type === 'mapRejected'
      && /invalid timed supply event/i.test(message.message));
    send(azure, {
      type: 'publishMap',
      map: {
        ...map,
        id: `timed-event-${invalidId}`,
        scenarioEvents: [{ ...map.scenarioEvents[0], ...fields, id: invalidId }],
      },
    });
    await invalidUnitNotice;
  }
  for (const [invalidId, scenarioEvents, expectedMessage] of [
    ['chain-missing-source', [
      { id: 'chain-child', type: 'timed-supply', name: 'Chain Child', afterSeconds: 1,
        trigger: { type: 'event', eventId: 'missing-source' }, team: 'both', foodReward: 1 },
    ], /missing scenario event/i],
    ['chain-cycle', [
      { id: 'chain-a', type: 'timed-supply', name: 'Chain A', afterSeconds: 1,
        trigger: { type: 'event', eventId: 'chain-b' }, team: 'both', foodReward: 1 },
      { id: 'chain-b', type: 'timed-supply', name: 'Chain B', afterSeconds: 1,
        trigger: { type: 'event', eventId: 'chain-a' }, team: 'both', foodReward: 1 },
    ], /scenario event cycle/i],
    ['chain-capturing-team-clock-root', [{
      id: 'chain-clock-source', type: 'timed-supply', name: 'Clock Source', afterSeconds: 1,
      team: 'both', foodReward: 1,
    }, {
      id: 'chain-capturing', type: 'timed-supply', name: 'Invalid Capturing Team', afterSeconds: 1,
      trigger: { type: 'event', eventId: 'chain-clock-source' }, team: 'capturing', foodReward: 1,
    }], /without a capture-triggered event/i],
    ['join-missing-source', [{
      id: 'join-known', type: 'timed-supply', name: 'Known Source', afterSeconds: 1,
      team: 'both', foodReward: 1,
    }, {
      id: 'join-missing', type: 'timed-supply', name: 'Missing Join Source', afterSeconds: 1,
      trigger: { type: 'event', eventIds: ['join-known', 'missing-source'] }, team: 'both', foodReward: 1,
    }], /missing scenario event/i],
    ['join-duplicate-source', [{
      id: 'join-known', type: 'timed-supply', name: 'Known Source', afterSeconds: 1,
      team: 'both', foodReward: 1,
    }, {
      id: 'join-duplicate', type: 'timed-supply', name: 'Duplicate Join Source', afterSeconds: 1,
      trigger: { type: 'event', eventIds: ['join-known', 'join-known'] }, team: 'both', foodReward: 1,
    }], /same source event more than once/i],
    ['join-cycle', [{
      id: 'join-clock', type: 'timed-supply', name: 'Join Clock Source', afterSeconds: 1,
      team: 'both', foodReward: 1,
    }, {
      id: 'join-a', type: 'timed-supply', name: 'Join A', afterSeconds: 1,
      trigger: { type: 'event', eventIds: ['join-b', 'join-clock'] }, team: 'both', foodReward: 1,
    }, {
      id: 'join-b', type: 'timed-supply', name: 'Join B', afterSeconds: 1,
      trigger: { type: 'event', eventId: 'join-a' }, team: 'both', foodReward: 1,
    }], /scenario event cycle/i],
    ['join-ambiguous-capturing-team', [{
      id: 'join-capture-home', type: 'timed-supply', name: 'Home Capture Source', afterSeconds: 1,
      trigger: { type: 'capture', objectiveId: 'home-cache-zone' }, team: 'capturing', foodReward: 1,
    }, {
      id: 'join-capture-frontier', type: 'timed-supply', name: 'Frontier Capture Source', afterSeconds: 1,
      trigger: { type: 'capture', objectiveId: 'frontier-crown' }, team: 'capturing', foodReward: 1,
    }, {
      id: 'join-capture-ambiguous', type: 'timed-supply', name: 'Ambiguous Capture Join', afterSeconds: 1,
      trigger: { type: 'event', eventIds: ['join-capture-home', 'join-capture-frontier'] },
      team: 'capturing', foodReward: 1,
    }], /without a capture-triggered event/i],
  ]) {
    stage = `reject invalid event chain ${invalidId}`;
    const invalidChainNotice = azure.waitForMessage((message) => message.type === 'mapRejected'
      && expectedMessage.test(message.message));
    send(azure, { type: 'publishMap', map: { ...map, id: `timed-event-${invalidId}`, scenarioEvents } });
    await invalidChainNotice;
  }
  const invalidVictoryCaptureNotice = azure.waitForMessage((message) => message.type === 'mapRejected'
    && /invalid timed supply event/i.test(message.message));
  send(azure, {
    type: 'publishMap',
    map: {
      ...map,
      id: 'timed-event-victory-capture',
      victoryMode: 'any',
      triggers: map.triggers.map((trigger) => ({ ...trigger, victory: true })),
    },
  });
  await invalidVictoryCaptureNotice;
  const invalidSingleVictoryCaptureNotice = azure.waitForMessage((message) => message.type === 'mapRejected'
    && /invalid timed supply event/i.test(message.message));
  send(azure, {
    type: 'publishMap',
    map: {
      ...map,
      id: 'timed-event-single-victory-capture',
      victoryMode: 'all',
      triggers: [{ ...map.triggers[0] }],
      scenarioEvents: [map.scenarioEvents.find((event) => event.id === 'capture-cache')],
    },
  });
  await invalidSingleVictoryCaptureNotice;

  const mapChanged = azure.waitForMessage((message) => message.type === 'mapChange'
    && message.map.id === map.id);
  stage = 'publish Hold all scenario';
  send(azure, { type: 'publishMap', map });
  const published = await mapChanged;
  assert.deepEqual(published.map.scenarioEvents, map.scenarioEvents,
    'the published map should preserve event definitions');
  assert.equal(Object.hasOwn(published.map.scenarioEvents[2], 'unitCount'), false,
    'legacy food-only maps should retain omitted reinforcement defaults');
  assert.equal(Object.hasOwn(published.map.scenarioEvents[2], 'unitKind'), false,
    'validation must not insert defaults into the map definition');
  assert.equal(Object.hasOwn(published.map.scenarioEvents[2], 'woodReward'), false,
    'validation must not add a zero wood field to legacy food-only map JSON');
  assert.equal(published.map.scenarioEvents[3].foodReward, 0,
    'a unit-only event with no announcement should be valid');
  assert.equal(published.map.scenarioEvents[4].foodReward, 0,
    'a wood-only event should be valid with no units or custom announcement');
  const waitingState = published.state;
  assert.equal(waitingState.mapId, map.id,
    'the map publication should include its authoritative initial state');
  assert.equal(waitingState.scenarioClockStarted, false,
    'the scenario clock should wait until both teams join');
  await new Promise((resolve) => setTimeout(resolve, 800));
  assert.equal(azure.messages.some((message) => message.type === 'scenarioEvent'), false,
    'events should not fire before both teams join');
  assert.ok(waitingState.scenarioEvents.every((event) => !event.fired));

  stage = 'connect Ember';
  let ember = createClient(port);
  clients.push(ember);
  await ember.opened;
  const emberWelcome = await ember.waitForMessage((message) => message.type === 'welcome');
  assert.equal(emberWelcome.player.team, 1, 'second client should claim Ember');
  stage = 'wait for both-team clock start';
  const [azureStarted, emberStarted] = await Promise.all([
    azure.waitForState((state) => state.mapId === map.id && state.scenarioClockStarted),
    ember.waitForState((state) => state.mapId === map.id && state.scenarioClockStarted),
  ]);
  assert.equal(azureStarted.scenarioClockStarted, true);
  assert.equal(emberStarted.scenarioClockStarted, true);
  assert.equal(azureStarted.units.length, 1000, 'the default army should have 1,000 units before reinforcements');
  stage = 'arm first-crown capture drop';
  const armedStates = await Promise.all([azure, ember].map((client) => client.waitForState((state) => {
    const event = state.scenarioEvents?.find((item) => item.id === 'capture-cache');
    return state.mapId === map.id && Number.isFinite(event?.activatedAtSeconds) && !event.fired;
  })));
  const armedEvent = armedStates[0].scenarioEvents.find((event) => event.id === 'capture-cache');
  assert.equal(armedEvent.triggeredByTeam, 0,
    'the first completed capture should arm the drop for the team that captured the selected zone');
  assert.equal(armedStates[0].winner, -1,
    'capturing the first of multiple victory zones should leave the match active');
  assert.equal(armedStates[0].objectives.find((objective) => objective.id === 'home-cache-zone')?.owner, 0);
  assert.equal(armedStates[0].objectives.find((objective) => objective.id === 'frontier-crown')?.owner, -1);

  stage = 'wait for timed rewards';
  const firstNoticeWaits = [azure, ember].map((client) => client.waitForMessage((message) => (
    message.type === 'scenarioEvent' && message.eventId === 'azure-cache'
  )));
  await Promise.all(firstNoticeWaits);
  const firstRewardStates = await Promise.all([azure, ember].map((client) => client.waitForState((state) => (
    state.mapId === map.id && state.food?.[0] === 25 && state.food?.[1] === 0
      && state.wood?.[0] === 8 && state.wood?.[1] === 0
      && eventFired(state, 'azure-cache') && !eventFired(state, 'shared-rations')
      && liveUnitCount(state, 0, 'worker') === 6 && liveUnitCount(state, 1, 'worker') === 4
  ))));
  assert.ok(firstRewardStates.every((state) => state.food[0] === 25 && state.food[1] === 0
    && state.wood[0] === 8 && state.wood[1] === 0),
  'team-targeted event should reward Azure with food and wood only');
  const azureNotice = azure.messages.find((message) => message.type === 'scenarioEvent'
    && message.eventId === 'azure-cache');
  assert.deepEqual(azureNotice.rewardTeams, [0], 'team-targeted rewards identify only the affected team');
  assert.equal(azureNotice.message, 'Azure Cache · +25 FOOD · +8 WOOD TO AZURE · 2/2 WORKER UNITS DELIVERED',
    'food and wood placeholders should resolve alongside actual reinforcement delivery');
  assert.equal(azureNotice.deliveredUnitCount, 2,
    'the authoritative event notice should report actual reinforcements');
  assert.equal(Object.hasOwn(azureNotice, 'deliveredByTeam'), false,
    'event notices must not leak per-team delivery shortfalls in fog-of-war games');
  const reinforcedWorkers = firstRewardStates[0].units.filter((unit) => (
    unit[0] >= 1000 && unit[1] === 0 && unit[5] === 'worker'
  ));
  assert.equal(reinforcedWorkers.length, 2);
  const oldUnitCells = new Set(azureStarted.units
    .filter((unit) => unit[4] > 0)
    .map((unit) => cellKey(unit[2], unit[3], map.width, map.height).key));
  const reinforcedCells = new Set();
  const base = map.spawnPoints.find((spawn) => spawn.team === 0);
  for (const unit of reinforcedWorkers) {
    const { column, row, key } = cellKey(unit[2], unit[3], map.width, map.height);
    assert.ok(Math.max(Math.abs(column - Math.floor(base.x + map.width / 2)),
      Math.abs(row - Math.floor(base.z + map.height / 2))) <= 12,
    'reinforcements should arrive near their team spawn');
    assert.equal(oldUnitCells.has(key), false, 'reinforcements should use open cells');
    assert.equal(reinforcedCells.has(key), false, 'units in one drop should use distinct cells');
    reinforcedCells.add(key);
    assert.equal(map.obstacles.some((obstacle) => column >= obstacle.column
      && column < obstacle.column + obstacle.width && row >= obstacle.row
      && row < obstacle.row + obstacle.height), false, 'reinforcements should not spawn in blocked terrain');
  }

  const secondNoticeWaits = [azure, ember].map((client) => client.waitForMessage((message) => (
    message.type === 'scenarioEvent' && message.eventId === 'shared-rations'
  )));
  await Promise.all(secondNoticeWaits);
  const secondRewardStates = await Promise.all([azure, ember].map((client) => client.waitForState((state) => (
    state.mapId === map.id && state.food?.[0] === 35 && state.food?.[1] === 10
      && state.wood?.[0] === 18 && state.wood?.[1] === 10
      && eventFired(state, 'azure-cache') && eventFired(state, 'shared-rations')
  ))));
  assert.ok(secondRewardStates.every((state) => state.food[0] === 35 && state.food[1] === 10
    && state.wood[0] === 18 && state.wood[1] === 10),
  'both-team event should award both resources exactly once');
  assert.equal(secondRewardStates[0].units.length, 1004,
    'team-targeted and both-team drops should add the requested units');
  assert.equal(liveUnitCount(secondRewardStates[0], 0, 'archer'), 1);
  assert.equal(liveUnitCount(secondRewardStates[0], 1, 'archer'), 1);
  const sharedNotice = azure.messages.find((message) => message.type === 'scenarioEvent'
    && message.eventId === 'shared-rations');
  assert.deepEqual(sharedNotice.rewardTeams, [0, 1], 'shared rewards identify both affected teams');
  assert.equal(sharedNotice.deliveredUnitCount, 2,
    'both-team reinforcement event should report its total delivered count');
  assert.equal(Object.hasOwn(sharedNotice, 'deliveredByTeam'), false,
    'both-team notices must keep actual delivery counts aggregate-only');
  assert.equal(sharedNotice.message, 'Shared Rations · 2 ARCHER TO BOTH TEAMS · +10 FOOD · +10 WOOD',
    'food, wood, and unit placeholders should resolve without duplicating delivery summaries');

  const legacyNoticeWaits = [azure, ember].map((client) => client.waitForMessage((message) => (
    message.type === 'scenarioEvent' && message.eventId === 'legacy-food-drop'
  )));
  const legacyRewardStates = await Promise.all([
    azure.waitForState((state) => state.mapId === map.id && state.food?.[0] === 40
      && state.food?.[1] === 15 && eventFired(state, 'legacy-food-drop')),
    ember.waitForState((state) => state.mapId === map.id && state.food?.[0] === 40
      && state.food?.[1] === 15 && eventFired(state, 'legacy-food-drop')),
  ]);
  const legacyNotices = await Promise.all(legacyNoticeWaits);
  assert.equal(legacyNotices[0].message, 'Legacy Food Drop · +5 FOOD TO BOTH TEAMS',
    'a legacy food-only event should keep its original default announcement');
  assert.equal(legacyNotices[0].deliveredUnitCount, 0);
  assert.equal(legacyRewardStates[0].units.length, 1004,
    'legacy food-only delivery should not create units');

  const unitOnlyNoticeWaits = [azure, ember].map((client) => client.waitForMessage((message) => (
    message.type === 'scenarioEvent' && message.eventId === 'unit-only-drop'
  )));
  const unitOnlyStates = await Promise.all([azure, ember].map((client) => client.waitForState((state) => (
    state.mapId === map.id && state.food?.[0] === 40 && state.food?.[1] === 15
      && eventFired(state, 'unit-only-drop') && liveUnitCount(state, 0, 'infantry') === 497
  ))));
  const unitOnlyNotices = await Promise.all(unitOnlyNoticeWaits);
  assert.equal(unitOnlyNotices[0].message, 'Unit Only Drop · AZURE · 1/1 INFANTRY UNITS DELIVERED',
    'unit-only events should report reinforcements without implying a zero-food reward');
  assert.equal(unitOnlyNotices[0].deliveredUnitCount, 1);
  assert.ok(unitOnlyStates.every((state) => state.units.length === 1005));

  const woodOnlyNoticeWaits = [azure, ember].map((client) => client.waitForMessage((message) => (
    message.type === 'scenarioEvent' && message.eventId === 'ember-wood-drop'
  )));
  const woodOnlyStates = await Promise.all([azure, ember].map((client) => client.waitForState((state) => (
    state.mapId === map.id && state.food?.[0] === 40 && state.food?.[1] === 15
      && state.wood?.[0] === 18 && state.wood?.[1] === 17
      && eventFired(state, 'ember-wood-drop')
  ))));
  const woodOnlyNotices = await Promise.all(woodOnlyNoticeWaits);
  assert.deepEqual(woodOnlyNotices[0].rewardTeams, [1], 'opponent-only rewards identify the opponent team');
  assert.equal(woodOnlyNotices[0].message, 'Ember Wood Drop · +7 WOOD TO EMBER',
    'wood-only events should use their default wood announcement without implying food');
  assert.deepEqual(woodOnlyStates[0].wood, [18, 17]);

  stage = 'checkpoint pending capture drop';
  const azureToken = azureWelcome.player.sessionToken;
  const emberToken = emberWelcome.player.sessionToken;
  await stopServer(server);
  server = null;
  const checkpoint = JSON.parse(await readFile(checkpointPath, 'utf8'));
  assert.deepEqual(checkpoint.state.teamWood, [18, 17],
    'checkpoints should serialize the authoritative wood rewards');
  const checkpointCaptureEvent = checkpoint.state.scenarioEventStates.find((event) => event.id === 'capture-cache');
  assert.equal(checkpointCaptureEvent.fired, false,
    'the capture-triggered drop should still be pending before its delay expires');
  assert.equal(checkpointCaptureEvent.triggeredByTeam, 0,
    'the checkpoint should preserve which team first captured the linked zone');
  assert.ok(Number.isFinite(checkpointCaptureEvent.activatedAtSeconds)
    && checkpointCaptureEvent.activatedAtSeconds + 6 > checkpoint.state.matchElapsedSeconds,
  'the checkpoint should preserve the remaining delay while the event is armed');
  assert.equal(Object.hasOwn(checkpoint.mapDefinition.scenarioEvents[2], 'unitCount'), false,
    'the checkpoint should retain legacy event JSON without new optional fields');
  assert.equal(Object.hasOwn(checkpoint.mapDefinition.scenarioEvents[2], 'unitKind'), false);
  server = await startServer(port, customMapDirectory, checkpointPath);
  stage = 'restore checkpoint and reconnect both players';
  const checkpointAzure = createClient(port, azureToken);
  const checkpointEmber = createClient(port, emberToken);
  clients.push(checkpointAzure, checkpointEmber);
  await Promise.all([checkpointAzure.opened, checkpointEmber.opened]);
  const [recoveredAzureWelcome, recoveredEmberWelcome] = await Promise.all([
    checkpointAzure.waitForMessage((message) => message.type === 'welcome'),
    checkpointEmber.waitForMessage((message) => message.type === 'welcome'),
  ]);
  assert.equal(recoveredAzureWelcome.recoveredFromCheckpoint, true,
    'a checkpoint with legacy event definitions should pass its unchanged map hash');
  assert.equal(recoveredEmberWelcome.recoveredFromCheckpoint, true);
  const recoveredCaptureEvent = recoveredAzureWelcome.state.scenarioEvents
    .find((event) => event.id === 'capture-cache');
  assert.equal(recoveredCaptureEvent.fired, false);
  assert.equal(recoveredCaptureEvent.triggeredByTeam, 0);
  assert.equal(recoveredCaptureEvent.activatedAtSeconds, checkpointCaptureEvent.activatedAtSeconds,
    'worker recovery should keep the original capture time instead of restarting the delay');
  assert.equal(recoveredAzureWelcome.state.units.length, 1005,
    'checkpoint recovery should preserve delivered reinforcement units');
  assert.equal(liveUnitCount(recoveredAzureWelcome.state, 0, 'worker'), 6);
  assert.equal(liveUnitCount(recoveredAzureWelcome.state, 0, 'infantry'), 497);
  assert.equal(liveUnitCount(recoveredAzureWelcome.state, 0, 'archer'), 1);
  assert.ok(eventFired(recoveredAzureWelcome.state, 'unit-only-drop'));
  assert.ok(eventFired(recoveredAzureWelcome.state, 'ember-wood-drop'));
  assert.deepEqual(recoveredAzureWelcome.state.food, [40, 15]);
  assert.deepEqual(recoveredAzureWelcome.state.wood, [18, 17]);
  assert.equal(checkpointAzure.messages.filter((message) => message.type === 'scenarioEvent').length, 0,
    'checkpoint recovery should restore event state without replaying announcements');
  azure = checkpointAzure;
  ember = checkpointEmber;

  await closeClient(ember);
  const resumedEmber = createClient(port, emberToken);
  clients.push(resumedEmber);
  await resumedEmber.opened;
  const resumedWelcome = await resumedEmber.waitForMessage((message) => message.type === 'welcome');
  assert.equal(resumedWelcome.player.resumed, true, 'the Ember seat should resume');
  assert.equal(eventFired(resumedWelcome.state, 'azure-cache'), true,
    'reconnect welcome should include the fired first event');
  assert.equal(eventFired(resumedWelcome.state, 'shared-rations'), true,
    'reconnect welcome should include the fired second event');
  assert.equal(eventFired(resumedWelcome.state, 'legacy-food-drop'), true,
    'reconnect welcome should include the fired legacy event');
  assert.equal(eventFired(resumedWelcome.state, 'unit-only-drop'), true,
    'reconnect welcome should include the fired unit-only event');
  assert.equal(eventFired(resumedWelcome.state, 'ember-wood-drop'), true,
    'reconnect welcome should include the fired wood-only event');
  const resumedCaptureEvent = resumedWelcome.state.scenarioEvents
    .find((event) => event.id === 'capture-cache');
  assert.equal(resumedCaptureEvent.fired, false,
    'a reconnect while the capture drop is pending should not mark it delivered');
  assert.equal(resumedCaptureEvent.triggeredByTeam, 0,
    'a reconnect should retain the capturing team for a capturing-team reward');
  assert.deepEqual(resumedWelcome.state.food, [40, 15], 'reconnect should include current rewards');
  assert.deepEqual(resumedWelcome.state.wood, [18, 17], 'reconnect should include current wood rewards');

  stage = 'deliver first-crown delayed drop';
  const captureNoticeWaits = [azure, resumedEmber].map((client) => client.waitForMessage((message) => (
    message.type === 'scenarioEvent' && message.eventId === 'capture-cache'
  )));
  const captureRewardStates = await Promise.all([azure, resumedEmber].map((client) => client.waitForState((state) => (
    state.mapId === map.id && state.food?.[0] === 53 && state.food?.[1] === 15
      && state.wood?.[0] === 22 && state.wood?.[1] === 17
      && eventFired(state, 'capture-cache') && liveUnitCount(state, 0, 'worker') === 7
  ))));
  const captureNotices = await Promise.all(captureNoticeWaits);
  assert.deepEqual(captureNotices.map((message) => message.rewardTeams), [[0], [0]],
    'capture-triggered rewards identify the actual capturing team');
  assert.ok(captureRewardStates.every((state) => state.units.length === 1006),
    'the capture-triggered drop should deliver its worker after the configured delay');
  assert.equal(captureNotices[0].team, 'capturing');
  assert.equal(captureNotices[0].deliveredUnitCount, 1);
  assert.equal(captureNotices[0].message,
    'Captured Cache · AZURE · +13 FOOD · +4 WOOD · 1 WORKER',
  'capture-team placeholders and rewards should resolve from the first capture');

  stage = 'capture final crown and suppress its pending drop';
  const finalCrownMoveNotice = azure.waitForMessage((message) => message.type === 'notice'
    && message.message?.startsWith('MOVE ORDER'));
  const allVictoryStates = [azure, resumedEmber].map((client) => client.waitForState((state) => (
    state.mapId === map.id && state.winner === 0
      && state.objectives?.every((objective) => objective.owner === 0)
      && state.scenarioEvents?.some((event) => event.id === 'final-crown-cache'
        && Number.isFinite(event.activatedAtSeconds) && !event.fired)
  )));
  send(azure, { type: 'move', ids: [0], x: -7, z: 13 });
  await finalCrownMoveNotice;
  const finalCrownVictory = await Promise.all(allVictoryStates);
  assert.ok(finalCrownVictory.every((state) => state.food[0] === 53 && state.food[1] === 15
    && state.wood[0] === 22 && state.wood[1] === 17),
  'the final capture should end the match without paying its still-pending drop');
  assert.equal(azure.messages.some((message) => message.type === 'scenarioEvent'
    && message.eventId === 'final-crown-cache'), false,
  'a final victory capture should suppress its own delayed supply drop');
  await new Promise((resolve) => setTimeout(resolve, 800));
  const postVictoryState = azure.messages.filter((message) => message.type === 'state').at(-1);
  assert.ok(postVictoryState?.scenarioEvents?.some((event) => event.id === 'final-crown-cache'
    && !event.fired), 'the pending drop should stay suppressed after its delay elapses');
  assert.deepEqual(postVictoryState.food, [53, 15]);

  const azureEventCount = azure.messages.filter((message) => message.type === 'scenarioEvent').length;
  const resumedEventMessages = resumedEmber.messages.filter((message) => message.type === 'scenarioEvent');
  assert.deepEqual(resumedEventMessages.map((message) => message.eventId), ['capture-cache'],
    'reconnect should not replay old announcements, but should receive the pending drop when it fires');
  stage = 'reset match';
  const resetStates = [azure, resumedEmber].map((client) => client.waitForState((state) => (
    state.mapId === map.id && state.food?.[0] === 0 && state.food?.[1] === 0
      && state.wood?.[0] === 0 && state.wood?.[1] === 0
      && state.scenarioEvents?.every((event) => !event.fired)
  )));
  send(azure, { type: 'reset' });
  await Promise.all(resetStates);
  const replayWaits = [azure, resumedEmber].map((client, index) => client.waitForMessage(
    (message) => message.type === 'scenarioEvent' && message.eventId === 'azure-cache',
    index === 0 ? azureEventCount - 1 : -1,
  ));
  await Promise.all(replayWaits);
  await Promise.all([azure, resumedEmber].map((client) => client.waitForState((state) => (
    state.mapId === map.id && state.food?.[0] === 25 && state.food?.[1] === 0
      && state.wood?.[0] === 8 && state.wood?.[1] === 0
      && eventFired(state, 'azure-cache') && !eventFired(state, 'shared-rations')
  ))));
  assert.equal(azure.messages.filter((message) => message.type === 'scenarioEvent'
    && message.eventId === 'azure-cache').length, 1,
  'after checkpoint recovery, reset should replay each one-shot event once on the new connection');
  assert.equal(resumedEmber.messages.filter((message) => message.type === 'scenarioEvent'
    && message.eventId === 'azure-cache').length, 1, 'reconnected client should see the replay once');

  const capEventIndices = [azure, resumedEmber].map((client) => client.messages.length);
  const cappedStateWaits = [azure, resumedEmber].map((client) => client.waitForState((state) => (
    state.mapId === map.id && state.armySize === 2000 && state.units.length === 2000
      && eventFired(state, 'ember-wood-drop') && state.food?.[0] === 40 && state.food?.[1] === 15
      && state.wood?.[0] === 18 && state.wood?.[1] === 17
  )));
  const eventIds = ['azure-cache', 'shared-rations', 'legacy-food-drop', 'unit-only-drop', 'ember-wood-drop'];
  const capNoticeWaits = [azure, resumedEmber].flatMap((client, index) => eventIds.map((eventId) => (
    client.waitForMessage((message) => message.type === 'scenarioEvent' && message.eventId === eventId,
      capEventIndices[index] - 1)
  )));
  send(azure, { type: 'selectArmySize', count: 2000 });
  const [cappedStates, capNotices] = await Promise.all([
    Promise.all(cappedStateWaits),
    Promise.all(capNoticeWaits),
  ]);
  assert.ok(cappedStates.every((state) => liveUnitCount(state, 0, 'worker') === 4
    && liveUnitCount(state, 1, 'worker') === 4
    && liveUnitCount(state, 0, 'archer') === 0
    && liveUnitCount(state, 1, 'archer') === 0),
  'reinforcement events must not exceed the 1,000-unit per-team cap');
  assert.deepEqual(capNotices.map((message) => message.deliveredUnitCount), Array(10).fill(0),
    'full team/global roster caps should report zero units actually delivered');
  const cappedCaptureNotices = await Promise.all([azure, resumedEmber].map((client, index) => (
    client.waitForMessage((message) => message.type === 'scenarioEvent' && message.eventId === 'capture-cache',
      capEventIndices[index] - 1)
  )));
  const cappedCaptureStates = await Promise.all([azure, resumedEmber].map((client) => client.waitForState((state) => (
    state.mapId === map.id && state.armySize === 2000 && eventFired(state, 'capture-cache')
      && state.food?.[0] === 53 && state.food?.[1] === 15
      && state.wood?.[0] === 22 && state.wood?.[1] === 17
  ))));
  assert.ok(cappedCaptureStates.every((state) => state.units.length === 2000),
    'a full roster should preserve event resources while blocking extra units');
  assert.deepEqual(cappedCaptureNotices.map((message) => message.deliveredUnitCount), [0, 0],
    'a second capture-triggered event should respect full roster caps');
  assert.ok(cappedCaptureNotices.every((message) => message.message
    === 'Captured Cache · AZURE · +13 FOOD · +4 WOOD · 0 WORKER'),
  'capture-triggered reward text should report actual capped delivery');
  assert.equal(azure.messages.filter((message) => message.type === 'scenarioEvent'
    && message.eventId === 'capture-cache').length - 1, 1,
  'the event should fire only once per match, even after its capture zone is already held');
  assert.equal(resumedEmber.messages.filter((message) => message.type === 'scenarioEvent'
    && message.eventId === 'capture-cache').length, 2,
  'the reconnecting player should receive the first drop and one reset replay');

  stage = 'verify recapture-only supply drop';
  const recaptureMap = {
    ...baseMap,
    id: 'recapture-event-scenario',
    name: 'Recapture Event Scenario',
    fogOfWar: false,
    spawnPoints: [{ team: 0, x: -12, z: 0 }, { team: 1, x: 12, z: 0 }],
    triggers: [{
      id: 'middle-ground', name: 'Middle Ground', type: 'capture-zone',
      zone: { column: 28, row: 28, width: 8, height: 8 },
      requiredUnits: 1, captureSeconds: 0.5, victory: false,
    }],
    scenarioEvents: [{
      id: 'recapture-cache', type: 'timed-supply', name: 'Recapture Cache',
      trigger: { type: 'capture', objectiveId: 'middle-ground', occurrence: 'recapture' },
      afterSeconds: 0.6, repeatCount: 1, repeatEverySeconds: 5,
      team: 'capturing', foodReward: 7,
      message: '{event} · {team} · +{reward} FOOD TO {team}',
    }, {
      id: 'recapture-followup', type: 'timed-supply', name: 'Recapture Follow-up',
      trigger: { type: 'event', eventId: 'recapture-cache' },
      afterSeconds: 0.6, team: 'capturing', foodReward: 0,
      message: '{event} · {team} · CHAIN COMPLETE',
    }, {
      id: 'clock-checkpoint', type: 'timed-supply', name: 'Clock Checkpoint',
      afterSeconds: 0.5, team: '1', foodReward: 0, message: 'CLOCK SOURCE COMPLETE',
    }, {
      id: 'joined-followup', type: 'timed-supply', name: 'Joined Follow-up',
      trigger: { type: 'event', eventIds: ['recapture-cache', 'clock-checkpoint'] },
      afterSeconds: 0.6, team: '1', foodReward: 0,
      message: '{event} · {team} · JOIN COMPLETE',
    }],
  };
  const recaptureMapChanged = azure.waitForMessage((message) => message.type === 'mapChange'
    && message.map.id === recaptureMap.id);
  send(azure, { type: 'publishMap', map: recaptureMap });
  const recapturePublished = await recaptureMapChanged;
  assert.deepEqual(recapturePublished.map.scenarioEvents, recaptureMap.scenarioEvents,
    'the custom map should preserve the recapture condition');
  const smallArmyStates = [azure, resumedEmber].map((client) => client.waitForState((state) => (
    state.mapId === recaptureMap.id && state.armySize === 250 && state.units.length === 250
  )));
  send(azure, { type: 'selectArmySize', count: 250 });
  await Promise.all(smallArmyStates);

  const firstCaptureMoveNotice = azure.waitForMessage((message) => message.type === 'notice'
    && message.message?.startsWith('MOVE ORDER'));
  send(azure, { type: 'move', ids: [0], x: 0, z: 0 });
  await firstCaptureMoveNotice;
  const firstCaptureStates = await Promise.all([azure, resumedEmber].map((client) => client.waitForState((state) => (
    state.mapId === recaptureMap.id && state.objectives?.some((objective) => (
      objective.id === 'middle-ground' && objective.owner === 0
    ))
  ))));
  assert.ok(firstCaptureStates.every((state) => {
    const event = state.scenarioEvents?.find((item) => item.id === 'recapture-cache');
    return event?.activatedAtSeconds === null && !event.fired;
  }), 'the initial neutral capture must not satisfy a recapture trigger');

  const azureOutsideZoneStates = [azure, resumedEmber].map((client) => client.waitForState((state) => {
    const unit = state.units.find((row) => row[0] === 0);
    return state.mapId === recaptureMap.id && unit && (Math.abs(unit[2]) >= 4 || Math.abs(unit[3]) >= 4);
  }));
  const azureLeaveNotice = azure.waitForMessage((message) => message.type === 'notice'
    && message.message?.startsWith('MOVE ORDER'));
  send(azure, { type: 'move', ids: [0], x: -12, z: 0 });
  await azureLeaveNotice;
  await Promise.all(azureOutsideZoneStates);

  const recaptureMoveNotice = resumedEmber.waitForMessage((message) => message.type === 'notice'
    && message.message?.startsWith('MOVE ORDER'));
  send(resumedEmber, { type: 'move', ids: [125], x: 0, z: 0 });
  await recaptureMoveNotice;
  const recaptureNotices = await Promise.all([azure, resumedEmber].map((client) => client.waitForMessage(
    (message) => message.type === 'scenarioEvent' && message.eventId === 'recapture-cache',
  )));
  const recaptureStates = await Promise.all([azure, resumedEmber].map((client) => client.waitForState((state) => (
    state.mapId === recaptureMap.id && state.food?.[0] === 0 && state.food?.[1] === 7
      && state.objectives?.some((objective) => objective.id === 'middle-ground' && objective.owner === 1)
      && state.scenarioEvents?.some((event) => event.id === 'recapture-cache' && !event.fired
        && event.fireCount === 1 && event.triggeredByTeam === 1)
  ))));
  assert.ok(recaptureStates.every((state) => state.food[1] === 7),
    'the first opposing recapture should pay the first supply delivery to Ember');
  assert.ok(recaptureNotices.every((message) => message.message
    === 'Recapture Cache · EMBER · +7 FOOD TO EMBER'),
  'the recapture announcement should identify the team that took ownership');
  const firstRepeatStates = await Promise.all([azure, resumedEmber].map((client) => client.waitForState((state) => {
    const event = state.scenarioEvents?.find((item) => item.id === 'recapture-cache');
    const child = state.scenarioEvents?.find((item) => item.id === 'recapture-followup');
    const clockSource = state.scenarioEvents?.find((item) => item.id === 'clock-checkpoint');
    const joinedChild = state.scenarioEvents?.find((item) => item.id === 'joined-followup');
    return state.mapId === recaptureMap.id && event?.fireCount === 1 && event.fired === false
      && Number.isFinite(event.nextFireAtSeconds) && event.nextFireAtSeconds > state.matchElapsedSeconds
      && child?.activatedAtSeconds === null && child.triggeredByTeam === -1 && child.fired === false
      && clockSource?.fired === true && joinedChild?.activatedAtSeconds === null
      && joinedChild.triggeredByTeam === -1 && joinedChild.fired === false;
  })));
  assert.ok(firstRepeatStates.every((state) => state.food[1] === 7),
    'the first delivery should leave one scheduled repeat and must not mark the event complete');

  stage = 'checkpoint and restore a partially delivered repeat schedule';
  await stopServer(server);
  server = null;
  const repeatCheckpoint = JSON.parse(await readFile(checkpointPath, 'utf8'));
  assert.equal(repeatCheckpoint.schemaVersion, 19);
  assert.deepEqual(repeatCheckpoint.mapDefinition.scenarioEvents[0], recaptureMap.scenarioEvents[0],
    'the checkpoint should preserve the authored repeat schedule');
  const savedRepeatState = repeatCheckpoint.state.scenarioEventStates
    .find((event) => event.id === 'recapture-cache');
  assert.equal(savedRepeatState.fireCount, 1);
  assert.equal(savedRepeatState.fired, false);
  assert.ok(savedRepeatState.nextFireAtSeconds > repeatCheckpoint.state.matchElapsedSeconds,
    'the checkpoint should retain the interval after the first delivery');
  const savedFollowupState = repeatCheckpoint.state.scenarioEventStates
    .find((event) => event.id === 'recapture-followup');
  assert.equal(savedFollowupState.activatedAtSeconds, null,
    'the chained event should remain unarmed until its repeating source finishes');
  assert.equal(savedFollowupState.triggeredByTeam, -1);
  const savedClockSourceState = repeatCheckpoint.state.scenarioEventStates
    .find((event) => event.id === 'clock-checkpoint');
  const savedJoinedFollowupState = repeatCheckpoint.state.scenarioEventStates
    .find((event) => event.id === 'joined-followup');
  assert.equal(savedClockSourceState.fired, true,
    'the checkpoint should retain the finished branch while the repeated source remains incomplete');
  assert.equal(savedJoinedFollowupState.activatedAtSeconds, null,
    'an all-of join must remain unarmed until its unfinished source reaches its final delivery');
  assert.equal(savedJoinedFollowupState.triggeredByTeam, -1);

  server = await startServer(port, customMapDirectory, checkpointPath);
  const recoveredAzure = createClient(port, azureToken);
  const recoveredEmber = createClient(port, emberToken);
  clients.push(recoveredAzure, recoveredEmber);
  await Promise.all([recoveredAzure.opened, recoveredEmber.opened]);
  const [repeatRecoveredAzureWelcome, repeatRecoveredEmberWelcome] = await Promise.all([
    recoveredAzure.waitForMessage((message) => message.type === 'welcome'),
    recoveredEmber.waitForMessage((message) => message.type === 'welcome'),
  ]);
  for (const welcome of [repeatRecoveredAzureWelcome, repeatRecoveredEmberWelcome]) {
    assert.equal(welcome.recoveredFromCheckpoint, true);
    const event = welcome.state.scenarioEvents.find((item) => item.id === 'recapture-cache');
    assert.equal(event.fireCount, 1);
    assert.equal(event.fired, false);
    assert.equal(event.nextFireAtSeconds, savedRepeatState.nextFireAtSeconds);
    const child = welcome.state.scenarioEvents.find((item) => item.id === 'recapture-followup');
    assert.equal(child.activatedAtSeconds, null);
    assert.equal(child.triggeredByTeam, -1);
    assert.equal(child.fired, false);
    const joinedChild = welcome.state.scenarioEvents.find((item) => item.id === 'joined-followup');
    assert.equal(joinedChild.activatedAtSeconds, null,
      'recovery should preserve a join that has one complete branch and one pending branch');
    assert.equal(joinedChild.triggeredByTeam, -1);
    assert.equal(joinedChild.fired, false);
  }
  assert.equal(recoveredAzure.messages.filter((message) => message.type === 'scenarioEvent').length, 0,
    'recovery should not replay the first repeat delivery announcement');
  assert.deepEqual(repeatRecoveredAzureWelcome.state.food, [0, 7],
    'recovery should preserve the resources from the first delivery');

  const secondRepeatNotices = [recoveredAzure, recoveredEmber].map((client) => client.waitForMessage(
    (message) => message.type === 'scenarioEvent' && message.eventId === 'recapture-cache',
  ));
  const secondRepeatStates = [recoveredAzure, recoveredEmber].map((client) => client.waitForState((state) => {
    const event = state.scenarioEvents?.find((item) => item.id === 'recapture-cache');
    return state.mapId === recaptureMap.id && state.food?.[0] === 0 && state.food?.[1] === 14
      && event?.fireCount === 2 && event.fired && event.nextFireAtSeconds === null;
  }));
  const secondRepeatResults = await Promise.all([
    Promise.all(secondRepeatNotices), Promise.all(secondRepeatStates),
  ]);
  assert.ok(secondRepeatResults[0].every((message) => message.message
    === 'Recapture Cache · EMBER · +7 FOOD TO EMBER'));
  assert.ok(secondRepeatResults[1].every((state) => state.food[1] === 14),
    'the repeat interval should award the next bundle and finish after its configured delivery count');
  const followupActivationStates = await Promise.all([recoveredAzure, recoveredEmber].map((client) => (
    client.waitForState((state) => {
      const event = state.scenarioEvents?.find((item) => item.id === 'recapture-followup');
      return state.mapId === recaptureMap.id && event && Number.isFinite(event.activatedAtSeconds)
        && event.triggeredByTeam === 1 && !event.fired;
    })
  )));
  assert.ok(followupActivationStates.every((state) => state.food[1] === 14),
    'the child delay should arm only after the source event’s final delivery');
  const joinedActivationStates = await Promise.all([recoveredAzure, recoveredEmber].map((client) => (
    client.waitForState((state) => {
      const joined = state.scenarioEvents?.find((event) => event.id === 'joined-followup');
      const source = state.scenarioEvents?.find((event) => event.id === 'recapture-cache');
      return state.mapId === recaptureMap.id && source?.fired === true
        && joined && Number.isFinite(joined.activatedAtSeconds)
        && joined.triggeredByTeam === -1 && !joined.fired;
    })
  )));
  assert.ok(joinedActivationStates.every((state) => state.scenarioEvents
    .find((event) => event.id === 'clock-checkpoint').fired),
  'the join should arm only after both the clock branch and final repeated delivery complete');
  const followupNotices = await Promise.all([recoveredAzure, recoveredEmber].map((client) => (
    client.waitForMessage((message) => message.type === 'scenarioEvent'
      && message.eventId === 'recapture-followup')
  )));
  const followupStates = await Promise.all([recoveredAzure, recoveredEmber].map((client) => (
    client.waitForState((state) => state.mapId === recaptureMap.id && state.food?.[1] === 14
      && eventFired(state, 'recapture-followup'))
  )));
  assert.ok(followupNotices.every((message) => message.message
    === 'Recapture Follow-up · EMBER · CHAIN COMPLETE'),
  'a chained capturing-team event should inherit Ember through the source event');
  assert.ok(followupStates.every((state) => state.food[1] === 14),
    'an announcement-only chained event should fire without changing resources');
  const joinedFollowupNotices = await Promise.all([recoveredAzure, recoveredEmber].map((client) => (
    client.waitForMessage((message) => message.type === 'scenarioEvent'
      && message.eventId === 'joined-followup')
  )));
  assert.ok(joinedFollowupNotices.every((message) => message.message
    === 'Joined Follow-up · EMBER · JOIN COMPLETE'),
  'a joined event should fire once, after its delay begins at the later branch completion');

  stage = 'reset repeat event delivery progress';
  const repeatResetStates = [recoveredAzure, recoveredEmber].map((client) => client.waitForState((state) => {
    const event = state.scenarioEvents?.find((item) => item.id === 'recapture-cache');
    return state.mapId === recaptureMap.id && state.food?.[0] === 0 && state.food?.[1] === 0
      && event?.fireCount === 0 && event.fired === false && event.nextFireAtSeconds === null
      && event.activatedAtSeconds === null && event.triggeredByTeam === -1
      && state.scenarioEvents?.some((child) => child.id === 'recapture-followup'
        && child.fired === false && child.activatedAtSeconds === null && child.triggeredByTeam === -1)
      && state.scenarioEvents?.some((child) => child.id === 'joined-followup'
        && child.fired === false && child.activatedAtSeconds === null && child.triggeredByTeam === -1);
  }));
  send(recoveredAzure, { type: 'reset' });
  await Promise.all(repeatResetStates);

  stage = 'cancel repeat deliveries after timed victory';
  const cancellationMap = {
    ...baseMap,
    id: 'repeat-cancel-scenario',
    name: 'Repeat Cancellation Scenario',
    fogOfWar: false,
    triggers: [{
      id: 'unclaimed-deadline', name: 'Deadline Zone', type: 'capture-zone',
      zone: { column: 28, row: 28, width: 8, height: 8 },
      requiredUnits: 1, captureSeconds: 0.5, victory: false,
    }],
    timedVictory: { afterSeconds: 1.5, objectiveId: 'unclaimed-deadline' },
    scenarioEvents: [{
      id: 'deadline-rations', type: 'timed-supply', name: 'Deadline Rations',
      afterSeconds: 0.6, repeatCount: 2, repeatEverySeconds: 5,
      team: 'both', foodReward: 5,
    }],
  };
  const cancellationMapChanged = recoveredAzure.waitForMessage((message) => message.type === 'mapChange'
    && message.map.id === cancellationMap.id);
  send(recoveredAzure, { type: 'publishMap', map: cancellationMap });
  await cancellationMapChanged;
  const deadlineRationNotices = [recoveredAzure, recoveredEmber].map((client) => client.waitForMessage(
    (message) => message.type === 'scenarioEvent' && message.eventId === 'deadline-rations',
  ));
  const cancelVictoryStates = [recoveredAzure, recoveredEmber].map((client) => client.waitForState((state) => {
    const event = state.scenarioEvents?.find((item) => item.id === 'deadline-rations');
    return state.mapId === cancellationMap.id && state.winner === 2
      && state.food?.[0] === 5 && state.food?.[1] === 5
      && event?.fireCount === 1 && event.fired === false;
  }));
  const [deadlineNotices, deadlineStates] = await Promise.all([
    Promise.all(deadlineRationNotices), Promise.all(cancelVictoryStates),
  ]);
  assert.equal(deadlineNotices.length, 2);
  assert.ok(deadlineStates.every((state) => state.winner === 2 && state.food[0] === 5 && state.food[1] === 5),
    'the deadline draw should end the match after the first repeat delivery');
  await new Promise((resolve) => setTimeout(resolve, 5_500));
  const postDeadlineState = recoveredAzure.messages.filter((message) => message.type === 'state').at(-1);
  const canceledRepeatState = postDeadlineState?.scenarioEvents?.find((event) => event.id === 'deadline-rations');
  assert.deepEqual(postDeadlineState?.food, [5, 5],
    'a final timed result must suppress later scheduled repeat rewards');
  assert.equal(canceledRepeatState?.fireCount, 1);
  assert.equal(canceledRepeatState?.fired, false);

  console.log(JSON.stringify({
    passed: [
      'event definitions validated and synchronized with published maps',
      'clock waits until both teams join',
      'team-targeted, both-team, legacy food-only, unit-only, and wood-only rewards fire once with resolved announcements',
      'first capture of a Hold all victory zone arms a delayed supply while play continues; the final crown suppresses its pending drop',
      'invalid victory-zone capture drops are rejected outside Hold all and when there is only one victory zone',
      'capture delay and recipient survive checkpoint recovery and reconnect',
      'reinforcements spawn near bases in distinct walkable cells and obey roster caps',
      'checkpoint recovery preserves reinforced units and validates legacy event map hashes',
      'reconnect welcome restores event state and rewards without replaying old announcements',
      'match reset clears and replays one-shot events',
      'a recapture trigger ignores the first neutral capture and pays the team that takes an owned objective',
      'repeat schedules validate paired bounds, preserve their next due time through recovery, deliver exactly the configured bundles, and reset cleanly',
      'event chains reject missing, duplicate, cyclic, and ambiguous sources; children wait for final repeats and preserve both single-source and joined progress through recovery',
      'all-of joins start their delay after every branch finishes and remain pending through a partial-branch checkpoint',
      'a timed victory cancels future deliveries from a partially completed repeat schedule',
    ],
    mapId: map.id,
    firstReward: firstRewardStates[0].food,
    sharedReward: secondRewardStates[0].food,
    firstWoodReward: firstRewardStates[0].wood,
    sharedWoodReward: secondRewardStates[0].wood,
    resetReplayCount: 2,
    captureTriggeredDrops: cappedCaptureNotices.map((message) => message.deliveredUnitCount),
  }, null, 2));
} catch (error) {
  console.error(`Timed event scenario failed during "${stage}":`, error);
  process.exitCode = 1;
} finally {
  await Promise.all(clients.map((client) => closeClient(client).catch(() => {})));
  await stopServer(server);
  await rm(tempRoot, { recursive: true, force: true });
}
