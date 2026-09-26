import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Two-client integration scenario for team research, combat bonuses, fog privacy,
// active/completed checkpoint recovery, and migration from a schema-v6 save.
// Run with Node 24 and no other server process on the selected port:
//   node scripts/research-scenario.mjs [port]
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SERVER_PATH = path.join(ROOT, 'server.mjs');
const READY_TIMEOUT_MS = 30_000;
const ACTION_TIMEOUT_MS = 45_000;
const RESEARCH_TIMEOUT_MS = 38_000;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function reservePort() {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function startServer(port, customMapDirectory, checkpointPath) {
  const child = spawn(process.execPath, [SERVER_PATH], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      RTS_HOST: '127.0.0.1',
      RTS_MAP: 'maps/stone-pass.json',
      RTS_CUSTOM_MAP_DIRECTORY: customMapDirectory,
      RTS_MATCH_STATE_PATH: checkpointPath,
      RTS_SESSION_GRACE_MS: '120000',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  let spawnError = null;
  child.stdout.on('data', (chunk) => { output += chunk.toString(); });
  child.stderr.on('data', (chunk) => { output += chunk.toString(); });
  child.on('error', (error) => {
    spawnError = error;
    output += `${String(error?.stack || error)}\n`;
  });
  child.getOutput = () => output;
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (spawnError) throw new Error(`Could not start the server process:\n${output}`);
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`Server exited during startup:\n${output}`);
    }
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`, { cache: 'no-store' });
      if (response.ok) return child;
    } catch {}
    await delay(50);
  }
  const killed = once(child, 'exit');
  child.kill('SIGKILL');
  await Promise.race([killed, delay(1_500)]);
  throw new Error(`Server did not become healthy within ${READY_TIMEOUT_MS} ms:\n${output}`);
}

async function stopServer(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, 'exit');
  child.kill('SIGINT');
  const gracefulExit = await Promise.race([exited.then(() => true), delay(3_000).then(() => false)]);
  if (!gracefulExit && child.exitCode === null && child.signalCode === null) {
    const forcedExit = once(child, 'exit');
    child.kill('SIGKILL');
    await Promise.race([forcedExit, delay(1_500)]);
  }
}

async function crashServer(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, 'exit');
  child.kill('SIGKILL');
  await exited;
}

function createClient(port, protocols = ['rts-v1']) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`, protocols);
  const feed = { messages: [], latest: null, messageWaiters: [], stateWaiters: [] };
  socket.addEventListener('message', (event) => {
    let message;
    try { message = JSON.parse(event.data); } catch { return; }
    feed.messages.push(message);
    const state = message.type === 'state' ? message
      : message.type === 'welcome' || message.type === 'mapChange' ? message.state : null;
    if (state?.type === 'state') {
      feed.latest = state;
      for (let index = feed.stateWaiters.length - 1; index >= 0; index--) {
        const waiter = feed.stateWaiters[index];
        if (state.tick <= waiter.afterTick || !waiter.predicate(state)) continue;
        feed.stateWaiters.splice(index, 1);
        clearTimeout(waiter.timeout);
        waiter.resolve(state);
      }
    }
    for (let index = feed.messageWaiters.length - 1; index >= 0; index--) {
      const waiter = feed.messageWaiters[index];
      if (feed.messages.length - 1 <= waiter.afterIndex || !waiter.predicate(message)) continue;
      feed.messageWaiters.splice(index, 1);
      clearTimeout(waiter.timeout);
      waiter.resolve(message);
    }
  });
  const opened = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timed out opening a WebSocket.')), READY_TIMEOUT_MS);
    socket.addEventListener('open', () => { clearTimeout(timeout); resolve(); }, { once: true });
    socket.addEventListener('error', () => { clearTimeout(timeout); reject(new Error('WebSocket connection failed.')); }, { once: true });
  });
  return { socket, feed, opened };
}

function waitForMessage(client, predicate, description, afterIndex = -1, timeoutMs = READY_TIMEOUT_MS) {
  const foundIndex = client.feed.messages.findIndex((message, index) => index > afterIndex && predicate(message));
  if (foundIndex >= 0) return Promise.resolve(client.feed.messages[foundIndex]);
  return new Promise((resolve, reject) => {
    const waiter = { predicate, afterIndex, resolve, timeout: null };
    waiter.timeout = setTimeout(() => {
      client.feed.messageWaiters.splice(client.feed.messageWaiters.indexOf(waiter), 1);
      reject(new Error(`Timed out waiting for ${description}.`));
    }, timeoutMs);
    client.feed.messageWaiters.push(waiter);
  });
}

function waitForState(client, predicate, description, afterTick = -1, timeoutMs = ACTION_TIMEOUT_MS) {
  const latest = client.feed.latest;
  if (latest && latest.tick > afterTick && predicate(latest)) return Promise.resolve(latest);
  return new Promise((resolve, reject) => {
    const waiter = { predicate, afterTick, resolve, timeout: null };
    waiter.timeout = setTimeout(() => {
      client.feed.stateWaiters.splice(client.feed.stateWaiters.indexOf(waiter), 1);
      reject(new Error(`Timed out waiting for ${description}.`));
    }, timeoutMs);
    client.feed.stateWaiters.push(waiter);
  });
}

async function openClient(port, token = null) {
  const protocols = token ? ['rts-v1', `rts-resume.${token}`] : ['rts-v1'];
  const client = createClient(port, protocols);
  await client.opened;
  client.welcome = await waitForMessage(client, (message) => message.type === 'welcome', 'welcome');
  return client;
}

function send(client, command) {
  assert.equal(client.socket.readyState, WebSocket.OPEN, 'client WebSocket should be open');
  client.socket.send(JSON.stringify(command));
}

function unit(state, id) {
  return state?.units?.find((row) => row[0] === id) || null;
}

function building(state, type) {
  return state?.buildings?.find((row) => row.team === 0 && row.type === type) || null;
}

async function waitForCheckpoint(checkpointPath, predicate, description, timeoutMs = 12_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const checkpoint = JSON.parse(await readFile(checkpointPath, 'utf8'));
      if (predicate(checkpoint)) return checkpoint;
    } catch (error) { lastError = error; }
    await delay(100);
  }
  throw new Error(`Timed out waiting for ${description}${lastError ? `: ${lastError.message}` : ''}`);
}

async function closeClient(client) {
  if (!client || client.socket.readyState === WebSocket.CLOSED) return;
  await new Promise((resolve) => {
    const timeout = setTimeout(resolve, 500);
    client.socket.addEventListener('close', () => { clearTimeout(timeout); resolve(); }, { once: true });
    if (client.socket.readyState === WebSocket.OPEN) client.socket.close(1000, 'research scenario complete');
  });
}

function assertTeamResearch(state, team, condition, description) {
  assert.ok(state?.teamResearch?.[team], `${description}: the team's research status should be visible`);
  assert.ok(condition(state.teamResearch[team]), description);
}

const port = Number(process.argv[2] || await reservePort());
const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'rts-research-'));
const customMapDirectory = path.join(tempRoot, 'custom-maps');
const checkpointPath = path.join(tempRoot, 'match.json');
await mkdir(customMapDirectory, { recursive: true });
const clients = [];
let child = null;
let stage = 'startup';

try {
  stage = 'initial two-client research scenario';
  child = await startServer(port, customMapDirectory, checkpointPath);
  let azure = await openClient(port);
  clients.push(azure);
  let ember = await openClient(port);
  clients.push(ember);
  assert.equal(azure.welcome.player.team, 0, 'first client should own Azure');
  assert.equal(ember.welcome.player.team, 1, 'second client should own Ember');
  const azureToken = azure.welcome.player.sessionToken;
  const emberToken = ember.welcome.player.sessionToken;

  const resetStates = Promise.all([
    waitForState(azure, (state) => state.armySize === 250 && state.units.length === 250, 'Azure 250-unit reset'),
    waitForState(ember, (state) => state.armySize === 250 && state.units.length === 250, 'Ember 250-unit reset'),
  ]);
  send(azure, { type: 'selectArmySize', count: 250 });
  await resetStates;

  const mapId = `research-${Date.now().toString(36)}`;
  const map = {
    id: mapId, name: 'Research Scenario', width: 64, height: 64, terrainSeed: 91,
    fogOfWar: true, startingArmySize: 250, startingResources: { food: 1000, wood: 1000 },
    spawnPoints: [{ team: 0, x: -10, z: 0 }, { team: 1, x: 10, z: 0 }],
    obstacles: [], resourceNodes: [], triggers: [], scenarioEvents: [],
  };
  const published = waitForMessage(azure,
    (message) => message.type === 'mapPublished' && message.mapId === mapId,
    'custom map publish acknowledgement');
  const mapStates = Promise.all([
    waitForState(azure, (state) => state.mapId === mapId, 'Azure research map'),
    waitForState(ember, (state) => state.mapId === mapId, 'Ember research map'),
  ]);
  send(azure, { type: 'publishMap', map });
  await Promise.all([published, mapStates]);
  assert.deepEqual(azure.feed.latest.food, [1000, null]);
  assert.deepEqual(ember.feed.latest.food, [null, 1000]);
  assert.equal(azure.feed.latest.teamResearch[1], null, 'fog should hide Ember research from Azure');
  assert.equal(ember.feed.latest.teamResearch[0], null, 'fog should hide Azure research from Ember');

  const emberMoveTick = ember.feed.latest.tick;
  send(ember, { type: 'move', ids: [129], x: -5, z: 0 });
  await waitForState(ember, (state) => {
    const target = unit(state, 129);
    return target && Math.hypot(target[2] + 5, target[3]) < 1.5;
  }, 'Ember infantry to reach the test engagement point', emberMoveTick);
  const baselineAttackTick = azure.feed.latest.tick;
  send(azure, { type: 'attack', ids: [4], targetId: 129 });
  await waitForState(azure, (state) => unit(state, 129)?.[4] === 90,
    'base infantry hit to deal 10 damage', baselineAttackTick);
  send(azure, { type: 'move', ids: [4], x: -18, z: 0 });

  const buildTick = azure.feed.latest.tick;
  send(azure, { type: 'build', buildingType: 'barracks', ids: [0, 1], x: -18, z: -12 });
  send(azure, { type: 'build', buildingType: 'archery-range', ids: [2, 3], x: -18, z: 12 });
  const built = await waitForState(azure, (state) => state.buildings?.length === 2
    && state.buildings.every((item) => item.team === 0 && item.complete === true),
  'Barracks and Archery Range completion', buildTick);
  const barracks = building(built, 'barracks');
  const range = building(built, 'archery-range');
  assert.ok(barracks && range, 'the research scenario should create both required buildings');
  assert.equal(built.wood[0], 675, 'building placement should debit its normal 325 wood cost');

  const wrongOwnerIndex = ember.feed.messages.length - 1;
  const wrongOwnerRejected = waitForMessage(ember,
    (message) => message.type === 'notice' && message.message.startsWith('RESEARCH REJECTED · SELECT A FRIENDLY'),
    'wrong-owner research rejection', wrongOwnerIndex);
  const emberBefore = { food: [...ember.feed.latest.food], wood: [...ember.feed.latest.wood] };
  send(ember, { type: 'researchUpgrade', upgrade: 'infantry-attack', buildingId: barracks.id });
  await wrongOwnerRejected;
  assert.deepEqual(ember.feed.latest.food, emberBefore.food, 'wrong-owner research must not charge food');
  assert.deepEqual(ember.feed.latest.wood, emberBefore.wood, 'wrong-owner research must not charge wood');

  const researchStartTick = azure.feed.latest.tick;
  const startedNotice = waitForMessage(azure,
    (message) => message.type === 'notice' && message.message.startsWith('INFANTRY FORGING STARTED'),
    'Infantry Forging start notice', azure.feed.messages.length - 1);
  const researching = waitForState(azure,
    (state) => state.teamResearch?.[0]?.active?.type === 'infantry-attack',
    'Infantry Forging active state', researchStartTick);
  send(azure, { type: 'researchUpgrade', upgrade: 'infantry-attack', buildingId: barracks.id });
  await Promise.all([startedNotice, researching]);
  assert.deepEqual(azure.feed.latest.food, [900, null], 'Infantry Forging should debit 100 food once');
  assert.deepEqual(azure.feed.latest.wood, [600, null], 'Infantry Forging should debit 75 wood once');
  const activeResearch = azure.feed.latest.teamResearch[0].active;
  assert.ok(activeResearch.remaining > 0 && activeResearch.remaining <= 25);
  assert.equal(azure.feed.latest.teamResearch[1], null, 'fog must continue hiding the opponent technology row');

  const duplicateIndex = azure.feed.messages.length - 1;
  const duplicateRejected = waitForMessage(azure,
    (message) => message.type === 'notice' && message.message.startsWith('RESEARCH REJECTED · AN UPGRADE'),
    'duplicate research rejection', duplicateIndex);
  send(azure, { type: 'researchUpgrade', upgrade: 'infantry-attack', buildingId: barracks.id });
  await duplicateRejected;
  assert.deepEqual(azure.feed.latest.food, [900, null], 'duplicate research must not debit food again');
  assert.deepEqual(azure.feed.latest.wood, [600, null], 'duplicate research must not debit wood again');

  const parallelIndex = azure.feed.messages.length - 1;
  const parallelRejected = waitForMessage(azure,
    (message) => message.type === 'notice' && message.message.startsWith('RESEARCH REJECTED · AN UPGRADE'),
    'parallel research rejection', parallelIndex);
  send(azure, { type: 'researchUpgrade', upgrade: 'archer-attack', buildingId: range.id });
  await parallelRejected;

  let checkpoint = await waitForCheckpoint(checkpointPath, (saved) => (
    saved.schemaVersion === 9
      && saved.state?.teamResearch?.[0]?.type === 'infantry-attack'
      && saved.state.teamResearch[0].buildingId === barracks.id
      && saved.state.teamUpgrades?.[0]?.infantryAttack === false
  ), 'active research checkpoint');
  const savedResearchRemaining = checkpoint.state.teamResearch[0].remaining;
  assert.ok(savedResearchRemaining > 0 && savedResearchRemaining <= 25);

  await crashServer(child);
  child = await startServer(port, customMapDirectory, checkpointPath);
  azure = await openClient(port, azureToken);
  clients.push(azure);
  ember = await openClient(port, emberToken);
  clients.push(ember);
  assert.equal(azure.welcome.player.team, 0, 'Azure should reclaim its seat after worker recovery');
  assert.equal(azure.welcome.player.resumed, true);
  assert.equal(ember.welcome.player.team, 1, 'Ember should reclaim its seat after worker recovery');
  assert.equal(ember.welcome.player.resumed, true);
  assertTeamResearch(azure.welcome.state, 0,
    (state) => state.active?.type === 'infantry-attack' && state.active.remaining <= savedResearchRemaining,
    'active research should resume from its saved remaining time');
  assert.equal(azure.welcome.state.teamResearch[1], null, 'recovery should retain fog privacy');

  const infantryUpgrade = await waitForState(azure,
    (state) => state.teamResearch?.[0]?.infantryAttack === true && state.teamResearch[0].active === null,
    'Infantry Forging completion', azure.feed.latest.tick, RESEARCH_TIMEOUT_MS);
  assert.deepEqual(infantryUpgrade.food, [900, null]);
  assert.deepEqual(infantryUpgrade.wood, [600, null]);
  const upgradedInfantryTick = azure.feed.latest.tick;
  send(azure, { type: 'attack', ids: [4], targetId: 129 });
  const upgradedInfantryHit = await waitForState(azure,
    (state) => unit(state, 129)?.[4] === 78,
    'researched infantry hit to deal 12 damage', upgradedInfantryTick);
  assert.equal(unit(upgradedInfantryHit, 129)[4], 78,
    'Infantry Forging should increase Infantry damage from 10 to 12');

  const targetArcherTick = ember.feed.latest.tick;
  send(ember, { type: 'move', ids: [130], x: -13, z: 12 });
  await waitForState(ember, (state) => {
    const target = unit(state, 130);
    return target && Math.hypot(target[2] + 13, target[3] - 12) < 1.5;
  }, 'Ember infantry to reach the archer test point', targetArcherTick);

  const archerResearchTick = azure.feed.latest.tick;
  send(azure, { type: 'researchUpgrade', upgrade: 'archer-attack', buildingId: range.id });
  const archerResearchStarted = await waitForState(azure,
    (state) => state.teamResearch?.[0]?.active?.type === 'archer-attack',
    'Archer Fletching active state', archerResearchTick);
  assert.deepEqual(archerResearchStarted.food, [775, null], 'Archer Fletching should debit 125 food');
  assert.deepEqual(archerResearchStarted.wood, [475, null], 'Archer Fletching should debit 125 wood');

  send(azure, { type: 'trainArcher', buildingId: range.id });
  const archerSpawn = await waitForState(azure, (state) => state.units.some((row) => (
    row[1] === 0 && row[5] === 'archer'
  )), 'a newly trained Azure Archer');
  const archer = archerSpawn.units.find((row) => row[1] === 0 && row[5] === 'archer');
  assert.ok(archer, 'the test Archer should be present');
  assert.ok(archer[0] >= 250, 'the test Archer should use a newly allocated unit slot');
  assert.deepEqual(archerSpawn.food, [750, null]);
  assert.deepEqual(archerSpawn.wood, [430, null]);

  const archerUpgrade = await waitForState(azure,
    (state) => state.teamResearch?.[0]?.archerAttack === true && state.teamResearch[0].active === null,
    'Archer Fletching completion', azure.feed.latest.tick, RESEARCH_TIMEOUT_MS);
  const archerAttackTick = archerUpgrade.tick;
  stage = 'verify researched Archer combat damage';
  send(azure, { type: 'attack', ids: [archer[0]], targetId: 130 });
  const upgradedArcherHit = await waitForState(azure,
    (state) => Math.abs((unit(state, 130)?.[4] ?? 100) - 91.6) < 0.001,
    'researched Archer hit to deal 8.4 damage', archerAttackTick);
  assert.ok(Math.abs(unit(upgradedArcherHit, 130)[4] - 91.6) < 0.001,
    'Archer Fletching should increase Archer damage from 7 to 8.4');
  const strikeRow = unit(upgradedArcherHit, archer[0]);
  assert.ok(Number.isInteger(strikeRow?.[11]) && strikeRow[11] > archerAttackTick,
    'the authoritative Archer strike tick should accompany the damage snapshot');
  assert.ok(Number.isFinite(strikeRow[12]) && Number.isFinite(strikeRow[13]),
    'the owning team should receive the Archer strike target point');

  checkpoint = await waitForCheckpoint(checkpointPath, (saved) => (
    saved.schemaVersion === 9
      && saved.state?.teamUpgrades?.[0]?.infantryAttack === true
      && saved.state.teamUpgrades[0].archerAttack === true
      && saved.state.teamResearch?.[0] === null
  ), 'completed upgrades checkpoint');
  await crashServer(child);
  child = await startServer(port, customMapDirectory, checkpointPath);
  azure = await openClient(port, azureToken);
  clients.push(azure);
  ember = await openClient(port, emberToken);
  clients.push(ember);
  assertTeamResearch(azure.welcome.state, 0,
    (state) => state.infantryAttack && state.archerAttack && state.active === null,
    'completed attack upgrades should survive worker recovery');
  assert.equal(azure.welcome.state.teamResearch[1], null,
    'completed opponent upgrades should remain hidden under fog');

  stage = 'validate and persist technology event map';
  const eventMapId = `research-cache-${Date.now().toString(36)}`;
  const technologyEvent = {
    id: 'forging-cache', type: 'timed-supply', name: 'Forging Cache',
    trigger: { type: 'capture', objectiveId: 'forging-site' },
    afterSeconds: 0.6, team: 'capturing', foodReward: 0, unitCount: 0,
    technologyReward: 'infantry-attack',
    message: '{event} · {technology} TO {team}',
  };
  const eventMap = {
    id: eventMapId, name: 'Research Cache', width: 64, height: 64, terrainSeed: 93,
    fogOfWar: true, startingArmySize: 250, startingResources: { food: 0, wood: 0 },
    spawnPoints: [{ team: 0, x: -10, z: 0 }, { team: 1, x: 10, z: 0 }],
    obstacles: [], resourceNodes: [],
    triggers: [{
      id: 'forging-site', name: 'Forging Site', type: 'capture-zone',
      zone: { column: 31, row: 31, width: 2, height: 2 },
      requiredUnits: 1, captureSeconds: 0.5,
    }],
    scenarioEvents: [technologyEvent],
  };
  const invalidTechnologyRejected = waitForMessage(azure,
    (message) => message.type === 'mapRejected' && /invalid timed supply event/i.test(message.message),
    'unknown scenario technology reward rejection');
  send(azure, { type: 'publishMap', map: {
    ...eventMap, id: `${eventMapId}-invalid`, scenarioEvents: [{ ...technologyEvent, technologyReward: 'siege-engineering' }],
  } });
  await invalidTechnologyRejected;

  const eventMapPublished = waitForMessage(azure,
    (message) => message.type === 'mapPublished' && message.mapId === eventMapId,
    'technology reward map publish acknowledgement');
  const azureEventMap = waitForState(azure, (state) => state.mapId === eventMapId,
    'Azure technology reward map');
  const emberEventMap = waitForState(ember, (state) => state.mapId === eventMapId,
    'Ember technology reward map');
  send(azure, { type: 'publishMap', map: eventMap, persist: true });
  const [eventPublishAck, azureEventState, emberEventState] = await Promise.all([
    eventMapPublished, azureEventMap, emberEventMap,
  ]);
  assert.equal(eventPublishAck.mapId, eventMapId);
  assert.equal(azureEventState.teamResearch[0].infantryAttack, false,
    'a new map should clear the prior match research');
  assert.equal(azureEventState.teamResearch[1], null,
    'fog should hide Ember research from Azure before the event');
  assert.equal(emberEventState.teamResearch[0], null,
    'fog should hide Azure research from Ember before the event');
  const persistedEventMap = JSON.parse(await readFile(path.join(customMapDirectory, `${eventMapId}.json`), 'utf8'));
  assert.equal(persistedEventMap.scenarioEvents[0].technologyReward, 'infantry-attack',
    'Map Studio-compatible persistence should retain the optional technology reward');

  const eventNoticeIndex = azure.feed.messages.length - 1;
  stage = 'capture objective and award technology';
  const eventNotice = waitForMessage(azure,
    (message) => message.type === 'scenarioEvent' && message.eventId === 'forging-cache',
    'capture-triggered technology reward announcement', eventNoticeIndex);
  const eventCapture = waitForState(azure, (state) => (
    state.mapId === eventMapId
      && state.objectives?.some((objective) => objective.id === 'forging-site' && objective.owner === 0)
      && state.scenarioEvents?.some((event) => event.id === 'forging-cache' && event.fired)
      && state.teamResearch?.[0]?.infantryAttack === true
  ), 'capture event should award Infantry Forging');
  send(azure, { type: 'move', ids: [0], x: 0, z: 0 });
  const [awardedNotice, awardedState] = await Promise.all([eventNotice, eventCapture]);
  assert.equal(awardedNotice.message, 'Forging Cache · INFANTRY FORGING TO AZURE');
  assert.equal(awardedNotice.technologyReward, 'infantry-attack');
  const emberEventAward = await waitForState(ember, (state) => (
    state.mapId === eventMapId
      && state.scenarioEvents?.some((event) => event.id === 'forging-cache' && event.fired)
      && state.objectives?.some((objective) => objective.id === 'forging-site' && objective.owner === 0)
  ), 'Ember should receive the synchronized event state');
  assert.equal(awardedState.teamResearch[0].infantryAttack, true);
  assert.equal(awardedState.teamResearch[1], null,
    'fog should continue hiding the other team technology after the event');
  assert.equal(emberEventAward.teamResearch[0], null,
    'fog should keep Azure research private in Ember snapshots');
  assert.equal(emberEventAward.teamResearch[1].infantryAttack, false,
    'a capturing-team event should not award the opposing team');

  stage = 'verify the technology event stays one-shot on recapture';
  const azureClearTick = azure.feed.latest.tick;
  const azureClearedZone = waitForState(azure, (state) => (
    state.mapId === eventMapId && state.objectives?.some((objective) => (
      objective.id === 'forging-site' && objective.owner === 0 && objective.unitCounts[0] === 0
    ))
  ), 'Azure to leave the captured event zone', azureClearTick);
  send(azure, { type: 'move', ids: [0], x: -10, z: 0 });
  await azureClearedZone;
  const eventCountBeforeRecapture = azure.feed.messages.filter((message) => (
    message.type === 'scenarioEvent' && message.eventId === 'forging-cache'
  )).length;
  const emberRecapture = waitForState(ember, (state) => (
    state.mapId === eventMapId
      && state.objectives?.some((objective) => objective.id === 'forging-site' && objective.owner === 1)
      && state.scenarioEvents?.some((event) => event.id === 'forging-cache' && event.fired)
  ), 'opponent recapture should not repeat the one-shot technology reward');
  send(ember, { type: 'move', ids: [129], x: 0, z: 0 });
  await emberRecapture;
  assert.equal(azure.feed.messages.filter((message) => (
    message.type === 'scenarioEvent' && message.eventId === 'forging-cache'
  )).length, eventCountBeforeRecapture,
  'a later ownership change should not fire the one-shot technology event again');

  checkpoint = await waitForCheckpoint(checkpointPath, (saved) => (
    saved.schemaVersion === 9
      && saved.mapDefinition?.id === eventMapId
      && saved.state?.teamUpgrades?.[0]?.infantryAttack === true
      && saved.state.scenarioEventStates?.some((event) => event.id === 'forging-cache' && event.fired)
  ), 'technology event upgrade and fired state checkpoint');
  stage = 'restart with persisted technology event map';
  await crashServer(child);
  child = await startServer(port, customMapDirectory, checkpointPath);
  azure = await openClient(port, azureToken);
  clients.push(azure);
  ember = await openClient(port, emberToken);
  clients.push(ember);
  assert.equal(azure.welcome.map.id, eventMapId,
    'the persisted technology event map should load again after worker recovery');
  assert.equal(azure.welcome.map.scenarioEvents[0].technologyReward, 'infantry-attack',
    'server startup should validate and retain a saved technology event');
  assert.equal(azure.welcome.state.teamResearch[0].infantryAttack, true,
    'the event-granted attack upgrade should survive recovery');
  assert.equal(azure.welcome.state.scenarioEvents.find((event) => event.id === 'forging-cache').fired, true,
    'the one-shot event should remain fired after recovery');
  assert.equal(ember.welcome.state.teamResearch[0], null,
    'event-granted upgrades remain hidden from the opponent under fog');

  stage = 'migrate legacy checkpoint while retaining fired event state';
  await crashServer(child);
  child = null;
  const legacyCheckpoint = JSON.parse(await readFile(checkpointPath, 'utf8'));
  legacyCheckpoint.schemaVersion = 6;
  delete legacyCheckpoint.state.teamUpgrades;
  delete legacyCheckpoint.state.teamResearch;
  await writeFile(checkpointPath, `${JSON.stringify(legacyCheckpoint)}\n`, 'utf8');
  child = await startServer(port, customMapDirectory, checkpointPath);
  azure = await openClient(port, azureToken);
  clients.push(azure);
  assertTeamResearch(azure.welcome.state, 0,
    (state) => state.infantryAttack === false && state.archerAttack === false && state.active === null,
    'schema-v6 checkpoints should migrate without new attack upgrades');
  assert.equal(azure.welcome.state.scenarioEvents.find((event) => event.id === 'forging-cache').fired, true,
    'schema-v6 migration should preserve the one-shot scenario event state');

  console.log(JSON.stringify({
    passed: [
      'team-owned research and single-active-upgrade validation',
      'exact research costs and duplicate/wrong-owner rejection',
      'fog masks opponent research state',
      'base and upgraded Infantry/Archer damage',
      'active research and completed upgrades survive checkpoint recovery',
      'capture-triggered technology rewards follow the capturing team, stay one-shot, and survive recovery',
      'saved technology events survive server startup validation and fog masking',
      'schema-v6 checkpoints migrate to default technology state',
    ],
    mapId,
    eventMapId,
    infantryBuildingId: barracks.id,
    archerBuildingId: range.id,
    checkpointVersion: checkpoint.schemaVersion,
    upgradedInfantryHit: unit(upgradedInfantryHit, 129)[4],
    upgradedArcherHit: unit(upgradedArcherHit, 130)[4],
  }, null, 2));
} catch (error) {
  error.message += `\nScenario stage: ${stage}`;
  if (child) {
    error.message += `\nServer output:\n${child.getOutput()}`;
  }
  throw error;
} finally {
  await Promise.all(clients.map(closeClient));
  await stopServer(child);
  if (process.env.RTS_KEEP_SCENARIO_TEMP === '1') {
    console.log(`Scenario artifacts retained at ${tempRoot}`);
  } else {
    await rm(tempRoot, { recursive: true, force: true });
  }
}
