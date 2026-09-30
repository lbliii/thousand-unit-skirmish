import { BUILDING_DEFINITIONS } from '../src/gameplay-definitions.mjs';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { connect, createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SUPERVISOR_PATH = path.join(ROOT, 'room-supervisor.mjs');
const READY_TIMEOUT_MS = 15_000;
const SESSION_GRACE_MS = 120_000;
const WORKER_FOOD_COST = 50;
const WORKER_TRAIN_SECONDS = 25;
const INFANTRY_FOOD_COST = 50;
const INFANTRY_TRAIN_SECONDS = 12;
const HOUSE_COST = BUILDING_DEFINITIONS.house?.cost.wood ?? 0;
const publicBuildings = (rows) => rows.map(({ productionQueue, productionOptions, researchOptions, ...publicState }) => publicState);

async function reservePort() {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function startSupervisor(port, dataDirectory, maxRooms = 2) {
  const child = spawn(process.execPath, [SUPERVISOR_PATH], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      RTS_HOST: '127.0.0.1',
      RTS_CUSTOM_MAP_DIRECTORY: path.join(dataDirectory, 'default-maps'),
      RTS_ROOM_DATA_DIRECTORY: path.join(dataDirectory, 'room-data'),
      RTS_MAX_ROOMS: String(maxRooms),
      RTS_MAX_PEERS: '2',
      RTS_SESSION_GRACE_MS: String(SESSION_GRACE_MS),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child._scenarioOutput = () => output;
  child.stdout.on('data', (chunk) => { output += chunk.toString(); });
  child.stderr.on('data', (chunk) => { output += chunk.toString(); });
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Supervisor exited during startup:\n${output}`);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`, { cache: 'no-store' });
      if (response.ok) return child;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  child.kill('SIGKILL');
  throw new Error(`Supervisor did not become healthy within ${READY_TIMEOUT_MS} ms:\n${output}`);
}

async function stopSupervisor(child) {
  if (!child || child.exitCode !== null) return;
  const exited = once(child, 'exit');
  child.kill('SIGINT');
  await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 10_000))]);
  if (child.exitCode === null) {
    const killed = once(child, 'exit');
    child.kill('SIGKILL');
    await killed;
  }
}

async function runScenarioScript(scriptPath, port) {
  const child = spawn(process.execPath, [scriptPath, String(port)], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk.toString(); });
  child.stderr.on('data', (chunk) => { output += chunk.toString(); });
  const [code] = await once(child, 'exit');
  if (code !== 0) throw new Error(`Scenario ${path.basename(scriptPath)} failed:\n${output}`);
  return JSON.parse(output);
}

async function waitForDefaultPeerCount(port, expected) {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  let lastHealth = null;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`, { cache: 'no-store' });
      if (response.ok) {
        lastHealth = await response.json();
        if (lastHealth.transport?.activePeers === expected) return;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Default match did not reach ${expected} active peers: ${JSON.stringify(lastHealth)}`);
}

async function waitForWorkerPid(supervisor, label) {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`\\[${escapedLabel}\\] worker pid=(\\d+)`);
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const matches = [...(supervisor._scenarioOutput?.() || '').matchAll(new RegExp(pattern.source, 'g'))];
    if (matches.length) return Number(matches[matches.length - 1][1]);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Supervisor did not log the ${label} worker process ID.`);
}

async function waitForCheckpoint(checkpointPath, predicate, timeoutMs = READY_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  let lastCheckpoint = null;
  while (Date.now() < deadline) {
    try {
      lastCheckpoint = JSON.parse(await readFile(checkpointPath, 'utf8'));
      if (predicate(lastCheckpoint)) return lastCheckpoint;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for match checkpoint ${checkpointPath}: ${JSON.stringify(lastCheckpoint?.state && {
    sequence: lastCheckpoint.sequence, tick: lastCheckpoint.state.tickNumber,
    mapId: lastCheckpoint.mapDefinition?.id, armySize: lastCheckpoint.state.currentArmySize,
    food: lastCheckpoint.state.teamFood, wood: lastCheckpoint.state.teamWood,
    workerProduction: lastCheckpoint.state.workerProduction,
    buildings: lastCheckpoint.state.buildings?.map(({ id, type, team, complete, queue, trainingRemaining }) => (
      { id, type, team, complete, queue, trainingRemaining }
    )),
    triggerStates: lastCheckpoint.state.triggerStates?.map(({ id, owner }) => ({ id, owner })),
    scenarioEventStates: lastCheckpoint.state.scenarioEventStates,
    route: lastCheckpoint.state.units?.[20] && ({
      x: lastCheckpoint.state.units[20].x,
      moveGoalCell: lastCheckpoint.state.units[20].moveGoalCell,
      pathLength: lastCheckpoint.state.units[20].path?.length,
      pathIndex: lastCheckpoint.state.units[20].pathIndex,
    }),
  })}`);
}

async function waitForProcessExit(pid) {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try { process.kill(pid, 0); } catch (error) {
      if (error?.code === 'ESRCH') return;
      throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Worker PID ${pid} did not exit after SIGKILL.`);
}

function unitRow(state, id) {
  return state.units.find((unit) => unit[0] === id);
}

function workerProductionForTeam(state, team) {
  const production = state?.workerProduction || [];
  return production.find((record) => record?.team === team) ?? production[team] ?? null;
}

function aliveWorkerIds(state, team) {
  return state.units.filter((unit) => unit[1] === team && unit[4] > 0 && unit[5] === 'worker')
    .map((unit) => unit[0]);
}

function waitForSocketClose(socket) {
  if (socket.readyState === WebSocket.CLOSED) return Promise.resolve();
  return new Promise((resolve) => socket.addEventListener('close', resolve, { once: true }));
}

function maskedTextFrame(text) {
  const payload = Buffer.from(text);
  const mask = randomBytes(4);
  let header;
  if (payload.length < 126) header = Buffer.from([0x81, 0x80 | payload.length]);
  else if (payload.length <= 0xffff) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 0xfe;
    header.writeUInt16BE(payload.length, 2);
  } else throw new Error('Scenario frame is unexpectedly large.');
  const masked = Buffer.from(payload);
  for (let index = 0; index < masked.length; index++) masked[index] ^= mask[index % 4];
  return Buffer.concat([header, mask, masked]);
}

function maskedCloseFrame() {
  const payload = Buffer.from([0x03, 0xe8]);
  const mask = randomBytes(4);
  const frame = Buffer.alloc(2 + mask.length + payload.length);
  frame[0] = 0x88;
  frame[1] = 0x80 | payload.length;
  mask.copy(frame, 2);
  for (let index = 0; index < payload.length; index++) frame[2 + mask.length + index] = payload[index] ^ mask[index % mask.length];
  return frame;
}

async function verifyEarlyUpgradeFrame(port, resumeToken) {
  const socket = connect({ host: '127.0.0.1', port });
  const expectedState = new Promise((resolve, reject) => {
    let buffer = Buffer.alloc(0);
    let upgraded = false;
    let completed = false;
    const timeout = setTimeout(() => finish(new Error('Timed out waiting for the early WebSocket command.')), READY_TIMEOUT_MS);
    const finish = (error, value, destroy = true) => {
      if (completed) return;
      completed = true;
      clearTimeout(timeout);
      socket.off('data', onData);
      socket.off('error', onError);
      if (destroy) socket.destroy();
      if (error) reject(error);
      else resolve(value);
    };
    const onError = (error) => finish(error);
    const onData = (chunk) => {
      if (completed) return;
      buffer = Buffer.concat([buffer, chunk]);
      if (!upgraded) {
        const end = buffer.indexOf('\r\n\r\n');
        if (end < 0) return;
        const status = buffer.subarray(0, end).toString('latin1').match(/^HTTP\/1\.1 (\d+)/)?.[1];
        if (status !== '101') return finish(new Error(`Expected WebSocket upgrade, received ${status || 'malformed response'}.`));
        buffer = buffer.subarray(end + 4);
        upgraded = true;
      }
      while (buffer.length >= 2) {
        const opcode = buffer[0] & 0x0f;
        const masked = (buffer[1] & 0x80) !== 0;
        let payloadLength = buffer[1] & 0x7f;
        let offset = 2;
        if (payloadLength === 126) {
          if (buffer.length < 4) return;
          payloadLength = buffer.readUInt16BE(2);
          offset = 4;
        } else if (payloadLength === 127) {
          if (buffer.length < 10) return;
          const longLength = buffer.readBigUInt64BE(2);
          if (longLength > 4_000_000n) return finish(new Error('Server frame exceeded the test limit.'));
          payloadLength = Number(longLength);
          offset = 10;
        }
        const maskOffset = offset;
        if (masked) offset += 4;
        if (buffer.length < offset + payloadLength) return;
        let payload = buffer.subarray(offset, offset + payloadLength);
        if (masked) {
          const mask = buffer.subarray(maskOffset, maskOffset + 4);
          payload = Buffer.from(payload);
          for (let index = 0; index < payload.length; index++) payload[index] ^= mask[index % 4];
        }
        buffer = buffer.subarray(offset + payloadLength);
        if (opcode !== 0x1) continue;
        let message;
        try { message = JSON.parse(payload.toString('utf8')); } catch { continue; }
        if (message.type === 'state' && message.armySize === 250) return finish(null, message, false);
      }
    };
    socket.on('error', onError);
    socket.on('data', onData);
    socket.once('connect', () => {
      const key = randomBytes(16).toString('base64');
      const handshake = [
        'GET /ws HTTP/1.1',
        `Host: 127.0.0.1:${port}`,
        'Upgrade: websocket',
        'Connection: Upgrade',
        `Sec-WebSocket-Key: ${key}`,
        'Sec-WebSocket-Version: 13',
        `Origin: http://127.0.0.1:${port}`,
        `Sec-WebSocket-Protocol: rts-v1, rts-resume.${resumeToken}`,
        '',
        '',
      ].join('\r\n');
      const earlyCommand = maskedTextFrame(JSON.stringify({ type: 'selectArmySize', count: 250 }));
      socket.write(Buffer.concat([Buffer.from(handshake), earlyCommand]));
    });
  });
  const state = await expectedState;
  const socketClosed = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.destroy();
      reject(new Error('Timed out closing the early-frame WebSocket.'));
    }, READY_TIMEOUT_MS);
    socket.once('close', () => { clearTimeout(timeout); resolve(); });
    socket.once('error', (error) => { clearTimeout(timeout); reject(error); });
  });
  socket.write(maskedCloseFrame());
  await socketClosed;
  return state;
}

function createClient(port, pathAndQuery = '/ws', protocols = ['rts-v1']) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}${pathAndQuery}`, protocols);
  const messages = [];
  const waiters = [];
  socket.addEventListener('message', (event) => {
    let message;
    try { message = JSON.parse(event.data); } catch { return; }
    messages.push(message);
    for (let index = waiters.length - 1; index >= 0; index--) {
      const waiter = waiters[index];
      if (!waiter.predicate(message)) continue;
      waiters.splice(index, 1);
      clearTimeout(waiter.timeout);
      waiter.resolve(message);
    }
  });
  function waitForMessage(predicate, timeoutMs = READY_TIMEOUT_MS) {
    const existing = messages.find(predicate);
    if (existing) return Promise.resolve(existing);
    return new Promise((resolve, reject) => {
      const waiter = { predicate, resolve, reject, timeout: setTimeout(() => {
        waiters.splice(waiters.indexOf(waiter), 1);
        reject(new Error(`Timed out waiting for a room message after ${timeoutMs} ms.`));
      }, timeoutMs) };
      waiters.push(waiter);
    });
  }
  const opened = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timed out opening the room WebSocket.')), READY_TIMEOUT_MS);
    socket.addEventListener('open', () => { clearTimeout(timeout); resolve(); }, { once: true });
    socket.addEventListener('error', () => { clearTimeout(timeout); reject(new Error('Room WebSocket connection failed.')); }, { once: true });
  });
  return { socket, opened, waitForMessage, messages };
}

async function welcome(client) {
  await client.opened;
  return client.waitForMessage((message) => message.type === 'welcome');
}

async function closeClient(client) {
  if (!client || client.socket.readyState === WebSocket.CLOSED) return;
  await new Promise((resolve) => {
    client.socket.addEventListener('close', resolve, { once: true });
    client.socket.close(1000, 'room supervisor scenario complete');
  });
}

const port = await reservePort();
const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'rts-room-supervisor-'));
let supervisor;
let clients = [];
const roomIds = [];

try {
  supervisor = await startSupervisor(port, dataDirectory);

  const rootAzure = createClient(port);
  clients.push(rootAzure);
  const rootWelcome = await welcome(rootAzure);
  assert.equal(rootWelcome.player.team, 0, 'the default match should assign its first player to Azure');
  assert.equal(rootWelcome.state.mapId, 'bellweather-millrace');
  assert.equal(rootWelcome.state.armySize, 24);
  assert.deepEqual(rootWelcome.state.food, [150, null]);
  assert.deepEqual(rootWelcome.state.wood, [250, null]);

  const crossOriginCreate = await fetch(`http://127.0.0.1:${port}/api/rooms`, {
    method: 'POST', headers: { Origin: 'https://other-site.example', 'Content-Type': 'application/json' }, body: '{}',
  });
  assert.equal(crossOriginCreate.status, 403, 'cross-origin room creation should be rejected');

  const forwardedOriginCreate = await fetch(`http://127.0.0.1:${port}/api/rooms`, {
    method: 'POST',
    headers: {
      Origin: 'https://attacker.example',
      'X-Forwarded-Host': 'attacker.example',
      'X-Forwarded-Proto': 'https',
      'Content-Type': 'application/json',
    },
    body: '{}',
  });
  assert.equal(forwardedOriginCreate.status, 403,
    'client-controlled forwarded headers must not make cross-origin room creation appear same-origin');

  const created = [];
  for (let index = 0; index < 2; index++) {
    const response = await fetch(`http://127.0.0.1:${port}/api/rooms`, {
      method: 'POST', headers: { Origin: `http://127.0.0.1:${port}`, 'Content-Type': 'application/json' }, body: '{}',
    });
    assert.equal(response.status, 201, 'room creation should return a new invite');
    const body = await response.json();
    assert.match(body.roomId, /^[A-Za-z0-9_-]{32}$/, 'room IDs should be opaque 192-bit codes');
    roomIds.push(body.roomId);
    created.push(body.roomId);
  }

  const full = await fetch(`http://127.0.0.1:${port}/api/rooms`, { method: 'POST', body: '{}' });
  assert.equal(full.status, 429, 'the configured room cap should be enforced');

  const roomAzure = createClient(port, `/ws?room=${created[0]}`);
  clients.push(roomAzure);
  const roomWelcome = await welcome(roomAzure);
  assert.equal(roomWelcome.player.team, 0, 'the invite room should have an independent Azure seat');
  assert.equal(roomWelcome.state.mapId, 'bellweather-millrace');
  assert.equal(roomWelcome.state.armySize, 24);
  assert.notEqual(roomWelcome.player.sessionToken, rootWelcome.player.sessionToken,
    'seat tokens should be scoped to the match process');

  const secondRoom = createClient(port, `/ws?room=${created[1]}`);
  clients.push(secondRoom);
  const secondRoomWelcome = await welcome(secondRoom);
  assert.equal(secondRoomWelcome.player.team, 0, 'a second invite room should also start with an independent Azure seat');

  const rootEmber = createClient(port);
  clients.push(rootEmber);
  const rootEmberWelcome = await welcome(rootEmber);
  assert.equal(rootEmberWelcome.player.team, 1, 'the default room should retain its own Ember seat');

  const roomState = roomAzure.waitForMessage((message) => message.type === 'state' && message.armySize === 250);
  roomAzure.socket.send(JSON.stringify({ type: 'selectArmySize', count: 250 }));
  await roomState;
  assert.equal(secondRoom.messages.some((message) => message.type === 'state' && message.armySize === 250), false,
    'changing one invite room must not change another room');
  assert.equal(rootAzure.messages.some((message) => message.type === 'state' && message.armySize === 250), false,
    'changing an invite room must not change the default match');

  const roomSeatToken = roomWelcome.player.sessionToken;
  await closeClient(roomAzure);
  const resumedRoom = createClient(port, `/ws?room=${created[0]}`, ['rts-v1', `rts-resume.${roomSeatToken}`]);
  clients.push(resumedRoom);
  const resumedRoomWelcome = await welcome(resumedRoom);
  assert.equal(resumedRoomWelcome.player.team, 0);
  assert.equal(resumedRoomWelcome.player.resumed, true, 'the resume subprotocol should survive the room proxy');

  const health = await fetch(`http://127.0.0.1:${port}/health`).then((response) => response.json());
  assert.equal(health.roomCount, 2);
  assert.equal(health.liveRoomProcesses, 2, 'each active invite room should own a separate match process');

  await Promise.allSettled(clients.map(closeClient));
  clients = [];
  await waitForDefaultPeerCount(port, 0);
  const earlyState = await verifyEarlyUpgradeFrame(port, rootWelcome.player.sessionToken);
  assert.equal(earlyState.armySize, 250, 'the first WebSocket frame must survive a same-packet upgrade proxy');
  await waitForDefaultPeerCount(port, 0);
  const hardening = await runScenarioScript(path.join(ROOT, 'scripts/server-hardening-scenario.mjs'), port);
  assert.ok(hardening.passed.includes('same-origin guard'));
  assert.ok(hardening.passed.includes('peer cap'));
  await stopSupervisor(supervisor);
  supervisor = null;

  supervisor = await startSupervisor(port, dataDirectory);
  const persistedInvite = await fetch(`http://127.0.0.1:${port}/api/rooms/${created[0]}`);
  assert.equal(persistedInvite.status, 200, 'room invite identity should survive supervisor restart');
  const roomCheckpointPath = path.join(dataDirectory, 'room-data', 'rooms', created[0], 'match-state.json');
  const restartedRoom = createClient(port, `/ws?room=${created[0]}`, [
    'rts-v1', `rts-resume.${roomSeatToken}`,
  ]);
  clients.push(restartedRoom);
  const restartedWelcome = await welcome(restartedRoom);
  assert.equal(restartedWelcome.player.team, 0);
  assert.equal(restartedWelcome.state.armySize, 250,
    'a clean supervisor restart should restore the last custom army size');
  assert.equal(restartedWelcome.recoveredFromCheckpoint, true,
    'a graceful supervisor shutdown should flush a checkpoint before worker exit');
  assert.equal(restartedWelcome.matchId, resumedRoomWelcome.matchId,
    'clean shutdown should preserve the same stable match identity');
  assert.equal(restartedWelcome.state.mapId, resumedRoomWelcome.state.mapId,
    'clean shutdown should preserve the active map');
  const secondInviteRoom = createClient(port, `/ws?room=${created[1]}`, [
    'rts-v1', `rts-resume.${secondRoomWelcome.player.sessionToken}`,
  ]);
  clients.push(secondInviteRoom);
  const secondInviteWelcome = await welcome(secondInviteRoom);
  assert.equal(secondInviteWelcome.player.team, 0);

  const restartedRoomEmber = createClient(port, `/ws?room=${created[0]}`);
  clients.push(restartedRoomEmber);
  const restartedEmberWelcome = await welcome(restartedRoomEmber);
  assert.equal(restartedEmberWelcome.player.team, 1);
  assert.equal(restartedEmberWelcome.matchId, restartedWelcome.matchId);
  const recoveryMap = {
    id: 'checkpoint-recovery-arena', name: 'Checkpoint Recovery Arena', width: 32, height: 32,
    obstacles: [], spawnPoints: [{ team: 0, x: -10, z: 0 }, { team: 1, x: 10, z: 0 }],
    resourceNodes: [
      { id: 'recovery-food', type: 'food', x: -5, z: -8, stock: 500 },
      { id: 'recovery-wood', type: 'wood', x: 5, z: 8, stock: 500 },
    ],
    triggers: [{
      id: 'recovery-control-zone', name: 'Recovery Control Zone', type: 'capture-zone',
      zone: { column: 4, row: 14, width: 5, height: 5 }, requiredUnits: 1,
      unitCount: 2, unitKind: 'worker',
      captureSeconds: 0.5, foodReward: 0, woodReward: 30, victory: false, message: 'ZONE RECOVERED',
    }],
    scenarioEvents: [{
      id: 'recovery-supply-drop', type: 'timed-supply', name: 'Recovery Supply Drop',
      afterSeconds: 0.5, team: 'both', foodReward: 123, woodReward: 200 + HOUSE_COST, message: 'SUPPLY DROP RECOVERED',
    }],
    fogOfWar: false, victoryMode: 'any', terrainSeed: 13,
  };
  const mapPublished = restartedRoom.waitForMessage((message) => message.type === 'mapPublished'
    && message.mapId === recoveryMap.id);
  const recoveryMapChanged = restartedRoom.waitForMessage((message) => message.type === 'mapChange'
    && message.map.id === recoveryMap.id);
  restartedRoom.socket.send(JSON.stringify({ type: 'publishMap', map: recoveryMap }));
  const [publishedRecoveryMap, recoveryMapFrame] = await Promise.all([mapPublished, recoveryMapChanged]);
  assert.equal(publishedRecoveryMap.persisted, false, 'the crash test should cover a session-only custom map');
  assert.equal(recoveryMapFrame.map.id, recoveryMap.id);
  const nonDefaultArmyState = restartedRoom.waitForMessage((message) => message.type === 'state'
    && message.armySize === 250 && message.mapId === recoveryMap.id);
  restartedRoom.socket.send(JSON.stringify({ type: 'selectArmySize', count: 250 }));
  await nonDefaultArmyState;

  const emberUnitBeforeMove = unitRow(restartedRoom.messages.filter((message) => message.type === 'state').at(-1), 20);
  assert.ok(emberUnitBeforeMove);
  const moveState = restartedRoom.waitForMessage((message) => {
    if (message.type !== 'state' || message.mapId !== recoveryMap.id) return false;
    const unit = unitRow(message, 20);
    return unit && Math.abs(unit[2] - emberUnitBeforeMove[2]) + Math.abs(unit[3] - emberUnitBeforeMove[3]) > 0.08;
  });
  restartedRoom.socket.send(JSON.stringify({ type: 'move', ids: [20], x: -2, z: -12, formation: 'line' }));
  const movedState = await moveState;
  const eventAndCaptureState = await restartedRoom.waitForMessage((message) => message.type === 'state'
    && message.mapId === recoveryMap.id && message.scenarioClockStarted
    && message.food?.[0] === 123 && message.food?.[1] === 123
    && message.wood?.[0] === 230 + HOUSE_COST && message.wood?.[1] === 200 + HOUSE_COST
    && message.units?.filter((unit) => unit[0] >= 250 && unit[1] === 0 && unit[5] === 'worker').length === 2
    && message.objectives?.some((objective) => objective.id === 'recovery-control-zone' && objective.owner === 0));
  assert.ok(eventAndCaptureState.tick >= movedState.tick);
  const captureGrantedWorkerIds = new Set(aliveWorkerIds(eventAndCaptureState, 0)
    .filter((id) => id >= eventAndCaptureState.armySize));
  assert.equal(captureGrantedWorkerIds.size, 2,
    'the capture reward should provide two Azure workers before worker production begins');

  const workersBeforeProduction = aliveWorkerIds(eventAndCaptureState, 0);
  const unitsBeforeProduction = new Set(eventAndCaptureState.units.map((unit) => unit[0]));
  const barracksSite = { x: 0.5, z: -13.5 };
  const barracksBuildAccepted = (state) => state.type === 'state' && state.mapId === recoveryMap.id
    && state.wood?.[0] === 230 + HOUSE_COST - 175
    && state.buildings?.length === 1 && state.buildings[0].type === 'barracks'
    && state.buildings[0].team === 0 && state.buildings[0].progress > 0;
  const barracksBuildAck = restartedRoom.waitForMessage((message) => message.type === 'notice'
    && (message.message?.startsWith('BARRACKS PLACED')
      || message.message?.startsWith('BUILD REJECTED')));
  const barracksBuildStates = Promise.all([
    restartedRoom.waitForMessage(barracksBuildAccepted),
    restartedRoomEmber.waitForMessage(barracksBuildAccepted),
  ]);
  restartedRoom.socket.send(JSON.stringify({
    type: 'build', buildingType: 'barracks', ids: workersBeforeProduction, ...barracksSite,
  }));
  const [barracksBuildNotice] = await Promise.all([barracksBuildAck, barracksBuildStates]);
  assert.ok(barracksBuildNotice.message?.startsWith('BARRACKS PLACED'),
    `Barracks test placement should be accepted, received: ${barracksBuildNotice.message}`);
  const barracksId = restartedRoom.messages.filter((message) => message.type === 'state'
    && message.mapId === recoveryMap.id && message.buildings?.length === 1)
    .at(-1).buildings[0].id;
  const completedBarracks = (state) => state.type === 'state' && state.mapId === recoveryMap.id
    && state.buildings?.some((building) => building.id === barracksId && building.complete);
  const [completedBarracksAzure, completedBarracksEmber] = await Promise.all([
    restartedRoom.waitForMessage(completedBarracks, 45_000),
    restartedRoomEmber.waitForMessage(completedBarracks, 45_000),
  ]);
  assert.equal(completedBarracksAzure.buildings.find((building) => building.id === barracksId).type, 'barracks');
  assert.ok(completedBarracksAzure.buildings.find((building) => building.id === barracksId).researchOptions.length > 0,
    'the owning seat receives legal research choices');
  assert.deepEqual(completedBarracksEmber.buildings.find((building) => building.id === barracksId).researchOptions, [],
    'the enemy seat receives no private research choices');
  assert.deepEqual(publicBuildings(completedBarracksAzure.buildings), publicBuildings(completedBarracksEmber.buildings),
    'both players should see the completed Barracks before production begins');

  if (HOUSE_COST) {
    const completeHouse = restartedRoom.waitForMessage((message) => message.type === 'state'
      && message.buildings?.some((building) => building.type === 'house' && building.team === 0 && building.complete), 45_000);
    restartedRoom.socket.send(JSON.stringify({ type: 'build', buildingType: 'house', ids: workersBeforeProduction, x: 3.5, z: -6.5 }));
    await completeHouse;
  }
  const acceptedWorkerQueue = (state) => state.type === 'state' && state.mapId === recoveryMap.id
    && state.food?.[0] === 123 - WORKER_FOOD_COST - INFANTRY_FOOD_COST
    && state.buildings?.find((building) => building.id === barracksId)?.queue === 1
    && state.buildings.find((building) => building.id === barracksId)?.trainingRemaining > 0
    && workerProductionForTeam(state, 0)?.queue === 1
    && workerProductionForTeam(state, 0)?.trainingRemaining > 0;
  const azureWorkerQueueState = restartedRoom.waitForMessage(acceptedWorkerQueue);
  const emberWorkerQueueState = restartedRoomEmber.waitForMessage(acceptedWorkerQueue);
  restartedRoom.socket.send(JSON.stringify({ type: 'trainWorker' }));
  restartedRoom.socket.send(JSON.stringify({ type: 'train', buildingId: barracksId }));
  const [queuedWorkerAzure, queuedWorkerEmber] = await Promise.all([
    azureWorkerQueueState, emberWorkerQueueState,
  ]);
  assert.equal(workerProductionForTeam(queuedWorkerAzure, 0).queue, 1,
    'Azure should reserve one Town Center worker');
  assert.equal(workerProductionForTeam(queuedWorkerEmber, 0).queue, 1,
    'Ember should receive the authoritative Azure worker queue');
  assert.equal(queuedWorkerAzure.food[0], 23,
    'worker and Infantry training should debit 50 food each before the crash');
  assert.equal(queuedWorkerAzure.buildings.find((building) => building.id === barracksId).queue, 1,
    'Azure should reserve one Infantry in its completed Barracks');
  assert.equal(queuedWorkerEmber.buildings.find((building) => building.id === barracksId).queue, 1,
    'Ember should receive the authoritative Azure Infantry queue');
  assert.deepEqual(publicBuildings(queuedWorkerAzure.buildings), publicBuildings(queuedWorkerEmber.buildings),
    'both online seats should agree on the queued Barracks production before the crash');
  assert.deepEqual(queuedWorkerAzure.buildings.find((building) => building.id === barracksId).productionQueue, ['infantry']);
  assert.deepEqual(queuedWorkerEmber.buildings.find((building) => building.id === barracksId).productionQueue, [], 'enemy product identities stay private during recovery');
  assert.deepEqual(queuedWorkerAzure.workerProduction, queuedWorkerEmber.workerProduction,
    'both online seats should agree on the queued worker production before the crash');

  const unitTwentyBeforeRecoveryRoute = unitRow(queuedWorkerAzure, 20);
  const recoveryRouteAdvancing = restartedRoom.waitForMessage((message) => {
    if (message.type !== 'state' || message.mapId !== recoveryMap.id) return false;
    const unit = unitRow(message, 20);
    return unit && unit[2] > unitTwentyBeforeRecoveryRoute[2] + 0.1;
  }, 15_000);
  restartedRoom.socket.send(JSON.stringify({ type: 'move', ids: [20], x: 8, z: -12, formation: 'line' }));
  await recoveryRouteAdvancing;

  const otherRoomMatchId = secondInviteWelcome.matchId;
  const otherRoomTick = secondInviteWelcome.state.tick;
  const roomCheckpoint = await waitForCheckpoint(roomCheckpointPath, (snapshot) => (
    snapshot.mapDefinition?.id === recoveryMap.id
      && snapshot.state?.currentArmySize === 250
      && snapshot.state?.teamFood?.[0] === 123 - WORKER_FOOD_COST - INFANTRY_FOOD_COST
      && snapshot.state?.teamFood?.[1] === 123
      && snapshot.state?.teamWood?.[0] === 55 && snapshot.state?.teamWood?.[1] === 200 + HOUSE_COST
      && snapshot.state?.triggerStates?.some((trigger) => trigger.id === 'recovery-control-zone' && trigger.owner === 0)
      && snapshot.state?.units?.filter((unit) => unit.id >= 250 && unit.team === 0 && unit.kind === 'worker').length === 2
      && snapshot.state?.scenarioEventStates?.some((event) => event.id === 'recovery-supply-drop' && event.fired)
      && workerProductionForTeam({ workerProduction: snapshot.state?.workerProduction }, 0)?.queue === 1
      && workerProductionForTeam({ workerProduction: snapshot.state?.workerProduction }, 0)?.trainingRemaining > 0
      && workerProductionForTeam({ workerProduction: snapshot.state?.workerProduction }, 0)?.trainingRemaining
        < WORKER_TRAIN_SECONDS - 1
      && snapshot.state?.buildings?.some((building) => building.id === barracksId
        && building.type === 'barracks' && building.complete && building.queue === 1
        && building.trainingRemaining > 0 && building.trainingRemaining < INFANTRY_TRAIN_SECONDS - 1)
      && snapshot.state?.units?.[20]?.moveGoalCell >= 0
      && snapshot.state?.units?.[20]?.path?.length > snapshot.state?.units?.[20]?.pathIndex
      && snapshot.state?.seatSessions?.some((session) => session.team === 0 && session.connected)
      && snapshot.state?.seatSessions?.some((session) => session.team === 1 && session.connected)
  ));
  const serializedCheckpoint = await readFile(roomCheckpointPath, 'utf8');
  for (const token of [restartedWelcome.player.sessionToken, restartedEmberWelcome.player.sessionToken]) {
    assert.ok(token && !serializedCheckpoint.includes(token), 'checkpoint files must not contain bearer resume tokens');
  }
  assert.equal(roomCheckpoint.sequence > 0, true);
  const checkpointWorkerProduction = workerProductionForTeam(
    { workerProduction: roomCheckpoint.state.workerProduction }, 0,
  );
  assert.ok(checkpointWorkerProduction.trainingRemaining > 0
    && checkpointWorkerProduction.trainingRemaining < WORKER_TRAIN_SECONDS,
  'the crash checkpoint should preserve an in-progress Town Center worker');
  const checkpointBarracks = roomCheckpoint.state.buildings.find((building) => building.id === barracksId);
  assert.ok(checkpointBarracks?.complete && checkpointBarracks.queue === 1
    && checkpointBarracks.trainingRemaining > 0
    && checkpointBarracks.trainingRemaining < INFANTRY_TRAIN_SECONDS,
  'the crash checkpoint should preserve an in-progress Barracks Infantry');
  const checkpointUnit = roomCheckpoint.state.units[20];
  const checkpointStaticUnit = roomCheckpoint.state.units[120];
  const workerBeforeCrash = await waitForWorkerPid(supervisor, `room ${created[0].slice(0, 8)}`);
  const azureClosed = waitForSocketClose(restartedRoom.socket);
  const emberClosed = waitForSocketClose(restartedRoomEmber.socket);
  process.kill(workerBeforeCrash, 'SIGKILL');
  await Promise.all([azureClosed, emberClosed]);
  await waitForProcessExit(workerBeforeCrash);
  const staleSavedAt = Date.now() - SESSION_GRACE_MS * 3;
  const staleExpiry = staleSavedAt + SESSION_GRACE_MS;
  const staleRecoveryCheckpoint = {
    ...roomCheckpoint,
    savedAt: staleSavedAt,
    state: {
      ...roomCheckpoint.state,
      seatSessions: roomCheckpoint.state.seatSessions.map((session) => ({
        ...session,
        expiresAt: session.connected ? staleExpiry : session.expiresAt,
      })),
    },
  };
  assert.ok(staleRecoveryCheckpoint.state.seatSessions.every((session) => (
    session.connected && session.expiresAt < Date.now()
  )), 'the downtime recovery case should start with expired connected-seat deadlines');
  await writeFile(roomCheckpointPath, JSON.stringify(staleRecoveryCheckpoint), 'utf8');
  const recoveredRoom = createClient(port, `/ws?room=${created[0]}`, [
    'rts-v1', `rts-resume.${restartedWelcome.player.sessionToken}`,
  ]);
  clients.push(recoveredRoom);
  const recoveredEmber = createClient(port, `/ws?room=${created[0]}`, [
    'rts-v1', `rts-resume.${restartedEmberWelcome.player.sessionToken}`,
  ]);
  clients.push(recoveredEmber);
  const [recoveredRoomWelcome, recoveredEmberWelcome] = await Promise.all([
    welcome(recoveredRoom), welcome(recoveredEmber),
  ]);
  for (const recovered of [recoveredRoomWelcome, recoveredEmberWelcome]) {
    assert.equal(recovered.recoveredFromCheckpoint, true, 'worker startup must restore before accepting clients');
    assert.equal(recovered.matchId, roomCheckpoint.matchId, 'worker recovery must preserve match identity');
    assert.equal(recovered.map.id, recoveryMap.id, 'session-only map definition must survive worker crash');
    assert.equal(recovered.state.mapId, recoveryMap.id);
    assert.equal(recovered.state.armySize, 250);
    assert.deepEqual(recovered.state.food, [23, 123],
      'checkpoint recovery should preserve both production food debits exactly once');
    assert.deepEqual(recovered.state.wood, [55, 200 + HOUSE_COST]);
    assert.equal(recovered.state.objectives.find((objective) => objective.id === 'recovery-control-zone')?.owner, 0);
    assert.equal([...captureGrantedWorkerIds].filter((id) => {
      const unit = unitRow(recovered.state, id);
      return unit && unit[1] === 0 && unit[4] > 0 && unit[5] === 'worker';
    }).length, 2,
    'checkpoint recovery should preserve the capture-granted units exactly once');
    const restoredProduction = workerProductionForTeam(recovered.state, 0);
    assert.equal(restoredProduction?.queue, 1,
      'checkpoint recovery should restore the pending Town Center worker');
    assert.ok(restoredProduction.trainingRemaining > 0,
      'checkpoint recovery should restore positive remaining worker-training time');
    assert.ok(restoredProduction.trainingRemaining <= checkpointWorkerProduction.trainingRemaining + 0.1
      && restoredProduction.trainingRemaining >= checkpointWorkerProduction.trainingRemaining - 5,
    'recovered training time should remain close to the checkpointed value');
    const restoredBarracks = recovered.state.buildings.find((building) => building.id === barracksId);
    assert.equal(restoredBarracks?.queue, 1,
      'checkpoint recovery should restore the pending Infantry queue');
    assert.ok(restoredBarracks.trainingRemaining > 0,
      'checkpoint recovery should restore positive remaining Barracks training time');
    assert.ok(restoredBarracks.trainingRemaining <= checkpointBarracks.trainingRemaining + 0.1
      && restoredBarracks.trainingRemaining >= checkpointBarracks.trainingRemaining - 5,
    'recovered Infantry training time should remain close to the checkpointed value');
    assert.equal(recovered.state.scenarioEvents.find((event) => event.id === 'recovery-supply-drop')?.fired, true);
    assert.ok(recovered.state.tick >= roomCheckpoint.state.tickNumber);
    assert.ok(Math.abs(unitRow(recovered.state, 120)[2] - Math.round(checkpointStaticUnit.x * 100) / 100) < 0.011,
      'static unit position should match the authoritative checkpoint');
  }
  assert.equal(recoveredRoomWelcome.player.team, 0);
  assert.equal(recoveredEmberWelcome.player.team, 1);
  assert.equal(recoveredRoomWelcome.player.resumed, true, 'Azure should reclaim its saved seat token');
  assert.equal(recoveredEmberWelcome.player.resumed, true, 'Ember should reclaim its saved seat token');
  assert.notEqual(recoveredRoomWelcome.serverInstanceId, restartedWelcome.serverInstanceId,
    'diagnostic process IDs should change after worker recovery');
  assert.equal(recoveredRoom.socket.readyState, WebSocket.OPEN);
  assert.equal(recoveredEmber.socket.readyState, WebSocket.OPEN);

  const completedInfantryProductionState = (state) => state.type === 'state' && state.mapId === recoveryMap.id
    && state.units.some((unit) => !unitsBeforeProduction.has(unit[0])
      && unit[1] === 0 && unit[4] > 0 && unit[5] === 'infantry')
    && state.buildings?.find((building) => building.id === barracksId)?.queue === 0;
  const [completedInfantryAzure, completedInfantryEmber] = await Promise.all([
    recoveredRoom.waitForMessage(completedInfantryProductionState, 40_000),
    recoveredEmber.waitForMessage(completedInfantryProductionState, 40_000),
  ]);
  const producedInfantry = completedInfantryAzure.units.filter((unit) => !unitsBeforeProduction.has(unit[0])
    && unit[1] === 0 && unit[4] > 0 && unit[5] === 'infantry');
  assert.equal(producedInfantry.length, 1,
    'recovered Barracks production should spawn exactly one Azure Infantry');
  assert.deepEqual(publicBuildings(completedInfantryAzure.buildings), publicBuildings(completedInfantryEmber.buildings),
    'both reconnected seats should observe the same completed Barracks queue');
  assert.deepEqual(completedInfantryAzure.units, completedInfantryEmber.units,
    'both reconnected seats should observe exactly the same spawned Infantry');

  const completedWorkerProductionState = (state) => state.type === 'state' && state.mapId === recoveryMap.id
    && workerProductionForTeam(state, 0)?.queue === 0
    && state.buildings?.find((building) => building.id === barracksId)?.queue === 0
    && aliveWorkerIds(state, 0).length === workersBeforeProduction.length + 1;
  const [completedWorkerAzure, completedWorkerEmber] = await Promise.all([
    recoveredRoom.waitForMessage(completedWorkerProductionState, 40_000),
    recoveredEmber.waitForMessage(completedWorkerProductionState, 40_000),
  ]);
  for (const state of [completedWorkerAzure, completedWorkerEmber]) {
    const newlyProducedWorkers = aliveWorkerIds(state, 0)
      .filter((id) => !workersBeforeProduction.includes(id));
    assert.equal(newlyProducedWorkers.length, 1,
      'restored worker production should spawn exactly one new Azure worker');
    assert.equal(workerProductionForTeam(state, 0)?.queue, 0,
      'restored Town Center queue should drain after spawning the worker');
  }
  assert.deepEqual(completedWorkerAzure.workerProduction, completedWorkerEmber.workerProduction,
    'both reconnected seats should observe the same completed worker queue');
  assert.deepEqual(completedWorkerAzure.units, completedWorkerEmber.units,
    'both reconnected seats should observe exactly the same spawned worker');
  for (const recovered of [recoveredRoom, recoveredEmber]) {
    assert.equal(recovered.messages.filter((message) => message.type === 'trigger'
      && message.triggerId === 'recovery-control-zone').length, 0,
    'checkpoint recovery should not replay a completed capture announcement');
  }
  assert.equal(secondInviteRoom.socket.readyState, WebSocket.OPEN,
    'recovering one room must not disconnect another invite room');
  assert.equal(secondInviteWelcome.matchId, otherRoomMatchId);
  assert.ok(secondInviteRoom.messages.some((message) => message.type === 'state' && message.tick > otherRoomTick),
    'the other invite match should keep advancing during recovery');
  const resumedMovementCheckpoint = await waitForCheckpoint(roomCheckpointPath, (snapshot) => (
    snapshot.matchId === roomCheckpoint.matchId && snapshot.sequence > roomCheckpoint.sequence
      && snapshot.state.tickNumber > roomCheckpoint.state.tickNumber
    && snapshot.state.units[20].moveGoalCell === checkpointUnit.moveGoalCell
    && snapshot.state.units[20].x > checkpointUnit.x + 0.1
    && snapshot.state.units.filter((unit) => captureGrantedWorkerIds.has(unit.id)
      && unit.team === 0 && unit.hp > 0 && unit.kind === 'worker').length === 2
  ));
  assert.ok(resumedMovementCheckpoint.state.tickNumber > roomCheckpoint.state.tickNumber,
    'simulation ticks should advance after restoring the saved unit route');

  const secondRoomWorkerPid = await waitForWorkerPid(supervisor, `room ${created[1].slice(0, 8)}`);
  const secondRoomClosed = waitForSocketClose(secondInviteRoom.socket);
  process.kill(secondRoomWorkerPid, 'SIGKILL');
  await secondRoomClosed;
  await waitForProcessExit(secondRoomWorkerPid);
  const secondRoomCheckpointPath = path.join(dataDirectory, 'room-data', 'rooms', created[1], 'match-state.json');
  await writeFile(secondRoomCheckpointPath, '{"schemaVersion":999,"rulesVersion":1,"broken":true}', 'utf8');
  const fallbackRoom = createClient(port, `/ws?room=${created[1]}`, [
    'rts-v1', `rts-resume.${secondInviteWelcome.player.sessionToken}`,
  ]);
  clients.push(fallbackRoom);
  const fallbackWelcome = await welcome(fallbackRoom);
  assert.equal(fallbackWelcome.recoveredFromCheckpoint, false,
    'malformed or incompatible snapshots must be rejected instead of partially applied');
  assert.notEqual(fallbackWelcome.matchId, otherRoomMatchId,
    'rejected snapshots should start an explicitly new match');
  assert.equal(fallbackWelcome.player.team, 0);
  assert.equal(fallbackWelcome.player.resumed, false);
  assert.equal(fallbackWelcome.state.mapId, 'bellweather-millrace');
  assert.equal(fallbackWelcome.state.armySize, 24);
  assert.ok(!await readFile(secondRoomCheckpointPath, 'utf8').then(() => true, () => false),
    'rejected checkpoint should be removed so subsequent restarts do not loop on it');

  const fallbackCheckpoint = await waitForCheckpoint(secondRoomCheckpointPath, (snapshot) => (
    snapshot.matchId === fallbackWelcome.matchId
      && snapshot.state?.currentArmySize === 24
      && snapshot.state?.seatSessions?.some((session) => session.team === 0 && session.connected)
  ));
  const fallbackWorkerPid = await waitForWorkerPid(supervisor, `room ${created[1].slice(0, 8)}`);
  const fallbackSocketClosed = waitForSocketClose(fallbackRoom.socket);
  process.kill(fallbackWorkerPid, 'SIGKILL');
  await Promise.all([fallbackSocketClosed, waitForProcessExit(fallbackWorkerPid)]);
  const overCapacityCheckpoint = structuredClone(fallbackCheckpoint);
  const overCapacityState = overCapacityCheckpoint.state;
  const templateUnit = structuredClone(overCapacityState.units.find((unit) => unit.hp > 0));
  for (let team = 0; team < 2; team++) {
    const living = overCapacityState.units.filter((unit) => unit.team === team && unit.hp > 0).length;
    const additionalUnits = 1000 - living;
    for (let index = 0; index < additionalUnits; index++) {
      const id = overCapacityState.units.length;
      overCapacityState.units.push({
        ...structuredClone(templateUnit),
        id, generation: 1, team, x: -10, z: 0, hp: 100,
        path: [], pathIndex: 0, attackTargetId: -1, attackCooldown: 0, repathTimer: 0,
        lastAttackCell: -1, orderRevision: 0, attackMove: false, attackMoveRouteReady: false,
        attackMoveResumePath: null, attackMoveResumePathIndex: 0, movePlanningPending: false,
        attackMoveAnchorX: 0, attackMoveAnchorZ: 0, attackMoveScanTick: 0,
        attackMoveBucketScanOffset: 0, kind: 'infantry', cargo: 0, cargoType: null,
        gatherNodeId: null, gatherPhase: '', buildingTargetId: null, moveGoalCell: -1,
        queuedWaypoints: [],
      });
      overCapacityState.unitGenerationCounters[id] = 1;
    }
  }
  overCapacityState.currentArmySize = 2000;
  overCapacityState.workerProduction[0] = {
    ...overCapacityState.workerProduction[0], queue: 1,
    trainingRemaining: WORKER_TRAIN_SECONDS, productionBlocked: false,
  };
  const mapWidth = overCapacityCheckpoint.mapDefinition.width;
  const mapHeight = overCapacityCheckpoint.mapDefinition.height;
  const barracksX = -10;
  const barracksZ = 0;
  const barracksColumn = Math.floor(barracksX + mapWidth / 2);
  const barracksRow = Math.floor(barracksZ + mapHeight / 2);
  const barracksFootprint = [];
  for (let row = barracksRow - 1; row <= barracksRow + 1; row++) {
    for (let column = barracksColumn - 1; column <= barracksColumn + 1; column++) {
      barracksFootprint.push(row * mapWidth + column);
    }
  }
  overCapacityState.buildings.push({
    id: overCapacityState.nextBuildingId,
    team: 0,
    type: 'barracks',
    x: barracksX,
    z: barracksZ,
    footprint: barracksFootprint,
    progress: 1,
    complete: true,
    queue: 1,
    trainingRemaining: INFANTRY_TRAIN_SECONDS,
    productionBlocked: false,
  });
  overCapacityState.nextBuildingId++;
  assert.equal(overCapacityState.units.length, 2000);
  assert.equal(overCapacityState.units.filter((unit) => unit.team === 0 && unit.hp > 0).length, 1000);
  assert.equal(overCapacityState.units.filter((unit) => unit.team === 1 && unit.hp > 0).length, 1000);
  assert.equal(overCapacityState.workerProduction[0].queue + overCapacityState.buildings[0].queue, 2,
    'the invalid checkpoint should aggregate Town Center and Barracks queues for the same team');
  await writeFile(secondRoomCheckpointPath, JSON.stringify(overCapacityCheckpoint), 'utf8');
  const fallbackOverCapacityRoom = createClient(port, `/ws?room=${created[1]}`, [
    'rts-v1', `rts-resume.${fallbackWelcome.player.sessionToken}`,
  ]);
  clients.push(fallbackOverCapacityRoom);
  const fallbackOverCapacityWelcome = await welcome(fallbackOverCapacityRoom);
  assert.equal(fallbackOverCapacityWelcome.recoveredFromCheckpoint, false,
    'a checkpoint with 1,000 living units plus queued Town Center and Barracks units must be rejected');
  assert.notEqual(fallbackOverCapacityWelcome.matchId, fallbackWelcome.matchId,
    'an over-cap checkpoint should start a new match');
  assert.equal(fallbackOverCapacityWelcome.player.resumed, false);
  assert.equal(fallbackOverCapacityWelcome.state.armySize, 24);
  assert.equal(fallbackOverCapacityWelcome.state.units.filter((unit) => unit[1] === 0 && unit[4] > 0).length, 12);
  assert.equal(fallbackOverCapacityWelcome.state.units.filter((unit) => unit[1] === 1 && unit[4] > 0).length, 0,
    'the fresh Forked Vale match should preserve fog for the opposing army');

  const defaultAzure = createClient(port, '/ws', [
    'rts-v1', `rts-resume.${rootWelcome.player.sessionToken}`,
  ]);
  clients.push(defaultAzure);
  const defaultAzureWelcome = await welcome(defaultAzure);
  assert.equal(defaultAzureWelcome.matchId, rootWelcome.matchId,
    'the default match should keep its stable identity across supervisor restart');
  const defaultEmber = createClient(port, '/ws', [
    'rts-v1', `rts-resume.${rootEmberWelcome.player.sessionToken}`,
  ]);
  clients.push(defaultEmber);
  const defaultEmberWelcome = await welcome(defaultEmber);
  const instanceBeforeCrash = defaultAzureWelcome.serverInstanceId;
  assert.equal(typeof instanceBeforeCrash, 'string', 'welcome should identify the running match process');
  assert.equal(defaultEmberWelcome.serverInstanceId, instanceBeforeCrash);
  const defaultCheckpointPath = path.join(dataDirectory, 'room-data', 'default-match-state.json');
  await waitForCheckpoint(defaultCheckpointPath, (snapshot) => (
    snapshot.matchId === defaultAzureWelcome.matchId
      && snapshot.state?.seatSessions?.some((session) => session.team === 0 && session.connected)
      && snapshot.state?.seatSessions?.some((session) => session.team === 1 && session.connected)
  ));
  const defaultWorkerPid = await waitForWorkerPid(supervisor, 'default room');
  const defaultAzureClosed = waitForSocketClose(defaultAzure.socket);
  const defaultEmberClosed = waitForSocketClose(defaultEmber.socket);
  process.kill(defaultWorkerPid, 'SIGKILL');
  await Promise.all([defaultAzureClosed, defaultEmberClosed]);

  const recoveredAzure = createClient(port, '/ws', [
    'rts-v1', `rts-resume.${defaultAzureWelcome.player.sessionToken}`,
  ]);
  clients.push(recoveredAzure);
  const recoveredDefaultEmber = createClient(port, '/ws', [
    'rts-v1', `rts-resume.${defaultEmberWelcome.player.sessionToken}`,
  ]);
  clients.push(recoveredDefaultEmber);
  const [recoveredAzureWelcome, recoveredDefaultEmberWelcome] = await Promise.all([
    welcome(recoveredAzure), welcome(recoveredDefaultEmber),
  ]);
  assert.equal(recoveredAzureWelcome.serverInstanceId, recoveredDefaultEmberWelcome.serverInstanceId,
    'concurrent reconnects should share the recovered default worker');
  assert.notEqual(recoveredAzureWelcome.serverInstanceId, instanceBeforeCrash,
    'the recovered worker should have a new instance ID');
  assert.deepEqual([recoveredAzureWelcome.player.team, recoveredDefaultEmberWelcome.player.team].sort(), [0, 1],
    'the recovered match should assign both team seats');
  assert.equal(recoveredAzureWelcome.player.resumed, true, 'Azure should reclaim its old token after default worker crash');
  assert.equal(recoveredDefaultEmberWelcome.player.resumed, true, 'Ember should reclaim its old token after default worker crash');
  assert.equal(recoveredAzureWelcome.matchId, defaultAzureWelcome.matchId);
  assert.equal(recoveredAzureWelcome.state.armySize, 250, 'the default match should restore its custom army size');
  assert.equal(recoveredAzureWelcome.recoveredFromCheckpoint, true);
  assert.equal(recoveredRoom.socket.readyState, WebSocket.OPEN,
    'the recovered invite match should stay connected while the default worker recovers');
  assert.equal(recoveredDefaultEmber.socket.readyState, WebSocket.OPEN);
  assert.equal(fallbackOverCapacityRoom.socket.readyState, WebSocket.OPEN,
    'a room that fell back from an over-cap checkpoint should stay connected during another room recovery');
  const recoveredHealthResponse = await fetch(`http://127.0.0.1:${port}/health`, { cache: 'no-store' });
  assert.equal(recoveredHealthResponse.status, 200, 'health should recover with the default worker');
  const recoveredHealth = await recoveredHealthResponse.json();
  assert.equal(recoveredHealth.transport.activePeers, 2);
  assert.equal(recoveredHealth.liveRoomProcesses, 2, 'default recovery should not restart invite workers');
  assert.equal(recoveredHealth.connectedInvitePeers, 3);

  const roomDataDirectory = path.join(dataDirectory, 'room-data');
  const roomIndexPath = path.join(roomDataDirectory, 'rooms.json');
  const preservedMapPath = path.join(roomDataDirectory, 'rooms', created[0], 'custom-maps', `${recoveryMap.id}.json`);
  await writeFile(preservedMapPath, JSON.stringify(recoveryMap), 'utf8');
  await Promise.allSettled(clients.map(closeClient));
  clients = [];
  await stopSupervisor(supervisor);
  supervisor = null;
  const preservedCheckpoint = JSON.parse(await readFile(roomCheckpointPath, 'utf8'));
  const preservedMapContents = await readFile(preservedMapPath, 'utf8');

  async function verifyRecoverableRoomDirectories(label, maxRooms = 2) {
    supervisor = await startSupervisor(port, dataDirectory, maxRooms);
    const recoveredHealthResponse = await fetch(`http://127.0.0.1:${port}/health`, { cache: 'no-store' });
    assert.equal(recoveredHealthResponse.status, 200, `${label}: default match should start successfully`);
    const recoveredIndexHealth = await recoveredHealthResponse.json();
    assert.equal(recoveredIndexHealth.roomCount, 2, `${label}: both saved rooms should be indexed again`);
    assert.equal(recoveredIndexHealth.roomLimit, maxRooms, `${label}: configured room cap should remain active`);
    if (recoveredIndexHealth.roomCount > maxRooms) {
      const atCapacity = await fetch(`http://127.0.0.1:${port}/api/rooms`, { method: 'POST' });
      assert.equal(atCapacity.status, 429,
        `${label}: a lowered room cap should block new rooms without deleting saved ones`);
    }
    for (const roomId of created) {
      const invite = await fetch(`http://127.0.0.1:${port}/api/rooms/${roomId}`);
      assert.equal(invite.status, 200, `${label}: invite ${roomId} should remain resolvable`);
    }

    const restoredCheckpoint = JSON.parse(await readFile(roomCheckpointPath, 'utf8'));
    assert.equal(restoredCheckpoint.matchId, preservedCheckpoint.matchId,
      `${label}: room checkpoint identity should remain intact`);
    assert.equal(restoredCheckpoint.mapDefinition.id, recoveryMap.id,
      `${label}: checkpoint map should remain intact`);
    assert.equal(await readFile(preservedMapPath, 'utf8'), preservedMapContents,
      `${label}: authored custom-map file should remain intact`);

    const restoredMapClient = createClient(port, `/ws?room=${created[0]}`, [
      'rts-v1', `rts-resume.${recoveredRoomWelcome.player.sessionToken}`,
    ]);
    clients.push(restoredMapClient);
    const restoredMapWelcome = await welcome(restoredMapClient);
    assert.equal(restoredMapWelcome.player.resumed, true,
      `${label}: saved player seat should be reclaimable`);
    assert.equal(restoredMapWelcome.state.mapId, recoveryMap.id,
      `${label}: room should resume on its checkpointed map`);
    assert.ok(restoredMapWelcome.maps.some((map) => map.id === recoveryMap.id),
      `${label}: map catalog should load the preserved custom map`);

    await closeClient(restoredMapClient);
    clients = [];
    await stopSupervisor(supervisor);
    supervisor = null;
  }

  await writeFile(roomIndexPath, '{"version":1,"rooms":[', 'utf8');
  await verifyRecoverableRoomDirectories('corrupt room index');
  await rm(roomIndexPath, { force: true });
  await verifyRecoverableRoomDirectories('missing room index', 1);

  console.log(JSON.stringify({
    passed: [
      'same-origin room creation and bounded room cap',
      'WebSocket origin and peer checks survive the room proxy',
      'resume subprotocol and early WebSocket frame survive upgrade forwarding',
      'independent seats and resume tokens per room',
      'state changes remain isolated across match processes',
      'clean supervisor restart restores the prior match and valid resume seats',
      'SIGKILL recovery restores match state and both hashed seats after their connected-seat deadlines expired during downtime',
      'recovered Barracks Infantry and Town Center production complete exactly once on both seats',
      'checkpoint files contain no bearer tokens and an isolated room keeps advancing',
      'malformed or incompatible checkpoint safely starts a fresh match',
      'checkpoint validation rejects queued production that would exceed the population cap',
      'default worker SIGKILL recovery restores state and session seats without interrupting invite rooms',
      'corrupt or missing room index preserves invite IDs, checkpoints, custom maps, and reclaimable seats even above a lowered room cap',
    ],
    roomCount: health.roomCount,
    liveInviteProcesses: health.liveRoomProcesses,
    defaultTeam: rootWelcome.player.team,
    inviteTeams: [roomWelcome.player.team, secondRoomWelcome.player.team],
    websocketHardening: hardening.passed,
  }, null, 2));
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await Promise.allSettled(clients.map(closeClient));
  await stopSupervisor(supervisor);
  await rm(dataDirectory, { recursive: true, force: true });
}
