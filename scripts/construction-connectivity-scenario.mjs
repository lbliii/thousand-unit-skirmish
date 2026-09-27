import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Placement preserves existing routes without requiring disconnected maps to become connected.
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SERVER_PATH = path.join(ROOT, 'server.mjs');
const TIMEOUT_MS = 40_000;

async function freePort() {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

function connect(port) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`, ['rts-v1']);
  const messages = [];
  const waiters = [];
  let latest = null;
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    messages.push(message);
    if (message.type === 'state') latest = message;
    if (message.type === 'welcome' || message.type === 'mapChange') latest = message.state;
    for (let index = waiters.length - 1; index >= 0; index--) {
      const waiter = waiters[index];
      if (!waiter.predicate(message)) continue;
      waiters.splice(index, 1);
      clearTimeout(waiter.timer);
      waiter.resolve(message);
    }
  });
  function wait(predicate) {
    const existing = messages.find(predicate);
    if (existing) return Promise.resolve(existing);
    return new Promise((resolve, reject) => {
      const waiter = { predicate, resolve, timer: setTimeout(() => {
        waiters.splice(waiters.indexOf(waiter), 1);
        reject(new Error('Timed out waiting for server message'));
      }, TIMEOUT_MS) };
      waiters.push(waiter);
    });
  }
  return { socket, wait, get latest() { return latest; } };
}

function send(client, command) {
  client.socket.send(JSON.stringify(command));
}

async function checkpointWith(checkpointPath, predicate) {
  const deadline = Date.now() + TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const checkpoint = JSON.parse(await readFile(checkpointPath, 'utf8'));
      if (predicate(checkpoint)) return checkpoint;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 35));
  }
  throw new Error('Timed out waiting for the expected match checkpoint');
}

const port = await freePort();
const temp = await mkdtemp(path.join(os.tmpdir(), 'rts-construction-connectivity-'));
const checkpointPath = path.join(temp, 'match.json');
let child = spawn(process.execPath, [SERVER_PATH], {
  cwd: ROOT,
  env: {
    ...process.env,
    PORT: String(port), RTS_HOST: '127.0.0.1', RTS_MAP: 'maps/open-field.json',
    RTS_MATCH_STATE_PATH: checkpointPath,
    RTS_CUSTOM_MAP_DIRECTORY: path.join(temp, 'custom-maps'),
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let logs = '';
child.stdout.on('data', (chunk) => { logs += chunk; });
child.stderr.on('data', (chunk) => { logs += chunk; });
const clients = [];

try {
  const readyBy = Date.now() + TIMEOUT_MS;
  while (Date.now() < readyBy) {
    if (child.exitCode !== null) throw new Error(`Server exited: ${logs}`);
    try { if ((await fetch(`http://127.0.0.1:${port}/health`)).ok) break; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.ok(Date.now() < readyBy, `Server did not start: ${logs}`);
  clients.push(connect(port), connect(port));
  await Promise.all(clients.map((client) => client.wait((m) => m.type === 'welcome')));
  const map = {
    id: 'construction-connectivity', name: 'Construction Connectivity', width: 64, height: 64,
    terrainSeed: 19, fogOfWar: false, startingArmySize: 20,
    startingResources: { food: 500, wood: 1000 },
    spawnPoints: [{ team: 0, x: -14, z: -10 }, { team: 1, x: 14, z: -10 }],
    obstacles: [
      { id: 'divider', column: 31, row: 0, width: 2, height: 64 },
      { id: 'left-outer', column: 0, row: 37, width: 20, height: 3 },
      { id: 'left-inner', column: 23, row: 37, width: 8, height: 3 },
      { id: 'right-inner', column: 33, row: 37, width: 8, height: 3 },
      { id: 'right-outer', column: 44, row: 37, width: 20, height: 3 },
    ],
    resourceNodes: [], triggers: [], scenarioEvents: [],
  };
  async function publish(definition) {
    send(clients[0], { type: 'publishMap', map: definition });
    await Promise.all(clients.map((client) => client.wait((m) => m.type === 'mapChange'
      && m.state.mapId === definition.id)));
  }
  let token = 1;
  async function build(team, x, z, expected, ids = null) {
    const client = clients[team];
    const workers = client.latest.units.filter((u) => u[1] === team && u[5] === 'worker'
      && (!ids || ids.includes(u[0])));
    const clientOrderToken = token++;
    send(client, { type: 'build', buildingType: 'barracks', ids: workers.map((u) => u[0]),
      unitGenerations: workers.map((u) => u[8]), x, z, clientOrderToken });
    const notice = await client.wait((m) => m.type === 'notice' && m.clientOrderToken === clientOrderToken
      && (m.message.startsWith('BUILD REJECTED') || m.message.startsWith('BARRACKS PLACED')));
    assert.ok(notice.message.startsWith(expected), `team ${team} at ${x},${z}: ${notice.message}`);
  }
  await publish(map);
  for (const team of [0, 1]) {
    const sign = team === 0 ? -1 : 1;
    await build(team, sign * 17, -10, 'BUILD REJECTED · SPACE BLOCKED');
    await build(team, sign * 5.5, -12.5, 'BARRACKS PLACED');
  }
  await Promise.all(clients.map((client) => client.wait((m) => m.type === 'state'
    && m.buildings.length === 2 && m.buildings.every((b) => b.complete))));
  const travelers = [0, 1].map((team) => clients[team].latest.units.find((u) => u[1] === team && u[5] === 'infantry'));
  for (const [team, traveler] of travelers.entries()) {
    const clientOrderToken = token++;
    send(clients[team], { type: 'move', ids: [traveler[0]], unitGenerations: [traveler[8]],
      x: team === 0 ? -10.5 : 10.5, z: 13.5, clientOrderToken });
    await clients[team].wait((m) => m.type === 'notice' && m.clientOrderToken === clientOrderToken
      && m.message === 'MOVE ORDER · 1 UNITS');
  }
  await checkpointWith(checkpointPath, (snapshot) => travelers.every((u) => snapshot.state.units[u[0]].z > 12));
  const woodBefore = [...clients[0].latest.wood];
  for (const team of [0, 1]) await build(team, team === 0 ? -10.5 : 10.5, 6.5,
    'BUILD REJECTED · WOULD BLOCK A ROUTE');
  const preserved = await checkpointWith(checkpointPath, (snapshot) => snapshot.state.units[travelers[0][0]].z > 13);
  assert.equal(preserved.state.buildings.length, 2, 'rejected footprints must not become buildings');
  assert.deepEqual(preserved.state.teamWood, woodBefore, 'rejected footprints must not charge wood');
  for (const [team, traveler] of travelers.entries()) {
    const clientOrderToken = token++;
    send(clients[team], { type: 'move', ids: [traveler[0]], unitGenerations: [traveler[8]],
      x: team === 0 ? -10.5 : 10.5, z: -3.5, clientOrderToken });
    await clients[team].wait((m) => m.type === 'notice' && m.clientOrderToken === clientOrderToken
      && m.message === 'MOVE ORDER · 1 UNITS');
  }
  await checkpointWith(checkpointPath, (snapshot) => travelers.every((u) => snapshot.state.units[u[0]].z < -2));

  // At the map edge the clamped Town Center occupies the authored spawn marker.
  // Use its existing walkable access rather than treating that marker as a route.
  await publish({ ...map, id: 'construction-edge-town-centers',
    spawnPoints: [{ team: 0, x: -30.5, z: -10 }, { team: 1, x: 30.5, z: -10 }],
    obstacles: [map.obstacles[0]] });
  for (const team of [0, 1]) {
    const sign = team === 0 ? -1 : 1;
    await build(team, sign * 30.5, -10, 'BUILD REJECTED · SPACE BLOCKED');
    await build(team, sign * 20.5, -4.5, 'BARRACKS PLACED');
  }
  await Promise.all(clients.map((client) => client.wait((m) => m.type === 'state'
    && m.mapId === 'construction-edge-town-centers' && m.buildings.length === 2
    && m.buildings.every((b) => b.complete))));
  console.log('Construction connectivity passed: both islands build, real route cuts reject without debit, routes remain usable, occupied Town Centers stay blocked, and clamped Town Center spawns build.');
} catch (error) {
  error.message += `\nServer logs:\n${logs}`;
  throw error;
} finally {
  await Promise.all(clients.map((client) => new Promise((resolve) => {
    if (client.socket.readyState === WebSocket.CLOSED) return resolve();
    client.socket.addEventListener('close', resolve, { once: true });
    client.socket.close();
  })));
  if (child.exitCode === null) {
    const exited = once(child, 'exit');
    child.kill('SIGINT');
    await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 3000))]);
    if (child.exitCode === null) child.kill('SIGKILL');
  }
  await rm(temp, { recursive: true, force: true });
}
