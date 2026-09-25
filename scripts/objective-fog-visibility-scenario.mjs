import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'objective-fog-visibility-'));
const portProbe = createServer();
portProbe.listen(0, '127.0.0.1');
await once(portProbe, 'listening');
const port = portProbe.address().port;
await new Promise((resolve, reject) => portProbe.close(error => error ? reject(error) : resolve()));

const child = spawn(process.execPath, ['server.mjs'], {
  cwd: root,
  env: {
    ...process.env,
    PORT: String(port),
    RTS_HOST: '127.0.0.1',
    RTS_MAP: 'maps/open-field.json',
    RTS_MATCH_STATE_PATH: path.join(tempRoot, 'match.json'),
    RTS_CUSTOM_MAP_DIRECTORY: path.join(tempRoot, 'maps'),
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let serverLog = '';
child.stdout.on('data', chunk => { serverLog += chunk.toString(); });
child.stderr.on('data', chunk => { serverLog += chunk.toString(); });

const clients = [];
const timeoutMs = 90_000;
const mapId = 'objective-fog-visibility-scenario';
const objectiveId = 'fog-capture';
const objectiveZone = { column: 26, row: 6, width: 12, height: 10 };

function createClient() {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`, ['rts-v1']);
  const messages = [];
  const stateWaiters = [];
  const messageWaiters = [];
  let latestState = null;

  socket.addEventListener('message', event => {
    let message;
    try { message = JSON.parse(event.data); } catch { return; }
    messages.push(message);
    if (message.type === 'welcome' || message.type === 'mapChange') latestState = message.state;
    else if (message.type === 'state') latestState = message;

    if (latestState) {
      for (let index = stateWaiters.length - 1; index >= 0; index--) {
        const waiter = stateWaiters[index];
        if (!waiter.predicate(latestState)) continue;
        stateWaiters.splice(index, 1);
        clearTimeout(waiter.timeout);
        waiter.resolve(latestState);
      }
    }
    for (let index = messageWaiters.length - 1; index >= 0; index--) {
      const waiter = messageWaiters[index];
      if (!waiter.predicate(message)) continue;
      messageWaiters.splice(index, 1);
      clearTimeout(waiter.timeout);
      waiter.resolve(message);
    }
  });

  function waitForMessage(predicate) {
    const existing = messages.find(predicate);
    if (existing) return Promise.resolve(existing);
    return new Promise((resolve, reject) => {
      const waiter = { predicate, resolve, reject, timeout: setTimeout(() => {
        messageWaiters.splice(messageWaiters.indexOf(waiter), 1);
        reject(new Error('Timed out waiting for a server message.'));
      }, timeoutMs) };
      messageWaiters.push(waiter);
    });
  }

  function waitForState(predicate) {
    if (latestState && predicate(latestState)) return Promise.resolve(latestState);
    return new Promise((resolve, reject) => {
      const waiter = { predicate, resolve, reject, timeout: setTimeout(() => {
        stateWaiters.splice(stateWaiters.indexOf(waiter), 1);
        reject(new Error('Timed out waiting for an authoritative state.'));
      }, timeoutMs) };
      stateWaiters.push(waiter);
    });
  }

  const client = { socket, waitForMessage, waitForState };
  clients.push(client);
  return client;
}

function send(socket, message) {
  socket.send(JSON.stringify(message));
}

function unitById(state, id) {
  return state.units.find(unit => unit[0] === id);
}

function objectiveById(state, id) {
  return state.objectives.find(objective => objective.id === id);
}

function visibleObjectiveCells(state) {
  const packed = Buffer.from(state.visibility.data, 'base64');
  let visible = 0;
  for (let row = objectiveZone.row; row < objectiveZone.row + objectiveZone.height; row++) {
    for (let column = objectiveZone.column; column < objectiveZone.column + objectiveZone.width; column++) {
      const cell = row * state.visibility.columns + column;
      if (((packed[cell >> 2] >> ((cell & 3) * 2)) & 3) === 2) visible++;
    }
  }
  return visible;
}

async function waitForServer() {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Server exited before health check: ${serverLog}`);
    try {
      if ((await fetch(`http://127.0.0.1:${port}/health`)).ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Server health check timed out: ${serverLog}`);
}

async function closeClient(client) {
  if (client.socket.readyState === WebSocket.CLOSED) return;
  await new Promise(resolve => {
    client.socket.addEventListener('close', resolve, { once: true });
    client.socket.close(1000, 'objective fog scenario complete');
  });
}

async function stopServer() {
  if (child.exitCode === null) {
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    await Promise.race([exited, new Promise(resolve => setTimeout(resolve, 5_000))]);
  }
  if (child.exitCode === null) child.kill('SIGKILL');
}

try {
  await waitForServer();
  const azure = createClient();
  const azureWelcome = await azure.waitForMessage(message => message.type === 'welcome');
  assert.equal(azureWelcome.player.team, 0);
  const ember = createClient();
  const emberWelcome = await ember.waitForMessage(message => message.type === 'welcome');
  assert.equal(emberWelcome.player.team, 1);

  const map = {
    ...JSON.parse(await readFile(new URL('../maps/open-field.json', import.meta.url), 'utf8')),
    id: mapId,
    name: 'OBJECTIVE FOG VISIBILITY SCENARIO',
    fogOfWar: true,
    spawnPoints: [{ team: 0, x: -14, z: 0 }, { team: 1, x: 14, z: 0 }],
    obstacles: [],
    resourceNodes: [],
    triggers: [{
      id: objectiveId,
      name: 'Hidden Capture Activity',
      type: 'capture-zone',
      zone: objectiveZone,
      requiredUnits: 2,
      captureSeconds: 60,
      foodReward: 0,
      woodReward: 0,
      unitCount: 0,
      unitKind: 'infantry',
      victory: false,
      message: '{team} captured the test objective.',
    }],
  };

  const published = azure.waitForMessage(message => message.type === 'mapPublished' && message.mapId === mapId);
  const mapChanges = [azure, ember].map(client => client.waitForMessage(message => (
    message.type === 'mapChange' && message.map.id === mapId
  )));
  send(azure.socket, { type: 'publishMap', map });
  await Promise.all([published, ...mapChanges]);

  const initialStates = [azure, ember].map(client => client.waitForState(state => (
    state.mapId === mapId && state.armySize === 250 && state.winner === -1
  )));
  send(azure.socket, { type: 'selectArmySize', count: 250 });
  const [azureInitial, emberInitial] = await Promise.all(initialStates);
  assert.equal(objectiveById(azureInitial, objectiveId)?.owner, -1);
  assert.equal(objectiveById(emberInitial, objectiveId)?.owner, -1);

  const azurePartial = azure.waitForState(state => {
    const scout = unitById(state, 0);
    const visibleCells = visibleObjectiveCells(state);
    return state.mapId === mapId && scout
      && Math.hypot(scout[2], scout[3] + 12) < 1.5
      && visibleCells > 0 && visibleCells < objectiveZone.width * objectiveZone.height;
  });
  const emberCapturing = ember.waitForState(state => {
    const objective = objectiveById(state, objectiveId);
    return state.mapId === mapId && objective?.owner === -1
      && objective.unitCounts?.[1] === 2
      && visibleObjectiveCells(state) < objectiveZone.width * objectiveZone.height;
  });
  send(azure.socket, { type: 'move', ids: [0], x: 0, z: -12 });
  send(ember.socket, { type: 'move', ids: [129, 130], x: 4.5, z: -24.5 });
  const [azurePartialState, emberCaptureState] = await Promise.all([azurePartial, emberCapturing]);

  const azureHiddenProgress = azure.waitForState(state => {
    const objective = objectiveById(state, objectiveId);
    return state.mapId === mapId && state.tick >= emberCaptureState.tick + 5
      && objective?.owner === -1
      && visibleObjectiveCells(state) > 0
      && visibleObjectiveCells(state) < objectiveZone.width * objectiveZone.height;
  });
  const azurePartialCaptureState = await azureHiddenProgress;
  const azureObjective = objectiveById(azurePartialCaptureState, objectiveId);
  const emberObjective = objectiveById(emberCaptureState, objectiveId);

  assert.ok(visibleObjectiveCells(azurePartialState) > 0,
    'Azure sees part of the objective while its capturing force remains unseen');
  assert.equal(azureObjective?.owner, -1, 'current objective ownership remains public');
  assert.equal(azureObjective?.unitCounts?.[1], 0,
    'Azure counts only individually visible Ember units');
  assert.equal(azureObjective?.progressTeam, -1,
    'partial objective visibility does not reveal the hidden capturing team');
  assert.equal(azureObjective?.progress, 0,
    'partial objective visibility does not reveal hidden capture progress');
  assert.deepEqual(emberObjective?.unitCounts, [0, 2],
    'Ember still sees its two individually visible units in the objective');
  assert.equal(emberObjective?.progressTeam, -1,
    'the capturing player also gets unknown progress while other zone cells remain hidden');
  assert.equal(emberObjective?.progress, 0);

  const azureFullObjective = azure.waitForState(state => {
    const scout = unitById(state, 0);
    const objective = objectiveById(state, objectiveId);
    return state.mapId === mapId && scout
      && Math.hypot(scout[2], scout[3] + 21) < 1.5
      && visibleObjectiveCells(state) === objectiveZone.width * objectiveZone.height
      && objective?.owner === -1
      && objective.unitCounts?.[0] === 1 && objective.unitCounts?.[1] === 2
      && objective.progressTeam === 1 && objective.progress > 0;
  });
  send(azure.socket, { type: 'move', ids: [0], x: 0, z: -21 });
  const fullyObservedCapture = await azureFullObjective;
  assert.equal(objectiveById(fullyObservedCapture, objectiveId)?.progressTeam, 1);
  assert.ok(objectiveById(fullyObservedCapture, objectiveId)?.progress > 0,
    'capture team and progress are revealed once every objective cell is visible');

  process.stdout.write(`${JSON.stringify({
    passed: ['public objective ownership', 'partial-zone unit-count redaction',
      'capture-progress hidden for partially visible zones', 'capture-progress visible at full zone vision'],
    objectiveCells: objectiveZone.width * objectiveZone.height,
    azureVisibleCellsBefore: visibleObjectiveCells(azurePartialState),
    revealedProgress: objectiveById(fullyObservedCapture, objectiveId).progress,
  }, null, 2)}\n`);
} catch (error) {
  console.error(error);
  console.error(serverLog);
  process.exitCode = 1;
} finally {
  await Promise.all(clients.map(client => closeClient(client).catch(() => {})));
  await stopServer();
  await rm(tempRoot, { recursive: true, force: true });
}
