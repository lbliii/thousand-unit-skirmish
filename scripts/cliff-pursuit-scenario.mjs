import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// In-range cliff targets and unreachable retreats must share consistent combat rules.
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SERVER_PATH = path.join(ROOT, 'server.mjs');
const TIMEOUT_MS = 45_000;

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
  const last = JSON.parse(await readFile(checkpointPath, 'utf8'));
  throw new Error(`Timed out waiting for checkpoint: ${JSON.stringify(last.state.units.filter(u => u.id === 4 || u.id === 14))}`);
}

const direct = process.argv.includes('--direct');
const port = await freePort();
const temp = await mkdtemp(path.join(os.tmpdir(), 'rts-cliff-pursuit-'));
const checkpointPath = path.join(temp, 'match.json');
let child;
let logs = '';
const clients = [];
async function start() {
  child = spawn(process.execPath, [SERVER_PATH], { cwd: ROOT, env: { ...process.env,
    PORT: String(port), RTS_HOST: '127.0.0.1', RTS_MATCH_STATE_PATH: checkpointPath,
    RTS_CUSTOM_MAP_DIRECTORY: path.join(temp, 'maps') }, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', x => logs += x); child.stderr.on('data', x => logs += x);
  const deadline = Date.now() + TIMEOUT_MS;
  while (Date.now() < deadline) {
    try { if ((await fetch(`http://127.0.0.1:${port}/health`)).ok) break; } catch {}
    await new Promise(r => setTimeout(r, 50));
  }
  assert.ok(Date.now() < deadline, logs);
  clients.push(connect(port), connect(port));
  await Promise.all(clients.map(c => c.wait(m => m.type === 'welcome')));
}
async function stop() {
  clients.splice(0).forEach(c => c.socket.close());
  if (child?.exitCode === null) { const exited = once(child, 'exit'); child.kill('SIGINT'); await exited; }
}
try {
  await start();
  send(clients[0], { type: 'publishMap', map: {
    id: 'cliff-pursuit', name: 'Cliff Pursuit', width: 64, height: 64,
    startingArmySize: 20, fogOfWar: true, spawnPoints: [{ team: 0, x: -14, z: 0 }, { team: 1, x: 14, z: 0 }],
    elevationPatches: [{ column: 32, row: 0, width: 32, height: 64, level: 2 }],
    obstacles: [], resourceNodes: [], triggers: [], scenarioEvents: [],
  } });
  await Promise.all(clients.map(c => c.wait(m => m.type === 'mapChange' && m.map.id === 'cliff-pursuit')));
  await stop();
  const fixture = JSON.parse(await readFile(checkpointPath, 'utf8'));
  for (const team of [0, 1]) {
    const sign = team ? -1 : 1;
    const z = team ? 8.5 : -8.5;
    Object.assign(fixture.state.units[team * 10 + 4], { kind: 'archer', x: -.5 * sign, z });
    Object.assign(fixture.state.units[(1 - team) * 10], { x: .5 * sign, z });
    Object.assign(fixture.state.units[team * 10 + 1], { x: 6.5 * sign, z });
    Object.assign(fixture.state.units[(1 - team) * 10 + 2], { x: -3.5 * sign, z });
    Object.assign(fixture.state.units[(1 - team) * 10 + 3], { x: 3.5 * sign, z });
  }
  fixture.state.seatSessions = [];
  await writeFile(checkpointPath, JSON.stringify(fixture));
  await start();
  for (const [team, client] of clients.entries()) {
    const id = team * 10 + 4;
    send(client, { type: 'attack', ids: [team*10+5], targetId: (1-team)*10+3, clientOrderToken: 10 });
    assert.match((await client.wait(m => m.type === 'notice' && m.clientOrderToken === 10)).message,
      /ATTACK REJECTED · TARGET UNREACHABLE/, 'Infantry cannot pursue across the cliff');
    send(client, { type: 'attack', ids: [(1-team)*10+4], targetId: (1-team)*10, clientOrderToken: 11 });
    assert.match((await client.wait(m => m.type === 'notice' && m.clientOrderToken === 11)).message,
      /ATTACK REJECTED · NO VALID UNITS/, 'foreign units remain unauthorized');
    send(client, direct ? { type: 'attack', ids: [id], targetId: (1-team)*10, clientOrderToken: 1 }
      : { type: 'attackMove', ids: [id], x: team ? .5 : -.5, z: team ? 8.5 : -8.5, clientOrderToken: 1 });
    const notice = await client.wait(m => m.type === 'notice' && m.clientOrderToken === 1 && !m.message.startsWith('PLANNING'));
    assert.match(notice.message, direct ? /^ATTACK ORDER/ : /^ATTACK MOVE ORDER/);
  }
  const firing = await checkpointWith(checkpointPath, cp => [0, 1].every(team =>
    cp.state.units[team*10+4].attackTargetId === (1-team)*10 && cp.state.units[(1-team)*10].hp < 100));
  // A lateral retreat still leaves a firing position on the attacker's side.
  for (const [team, client] of clients.entries()) {
    send(client, { type: 'move', ids: [team*10], x: team ? .5 : -.5, z: team ? -3.5 : 3.5 });
  }
  const followed = await checkpointWith(checkpointPath, cp => [0, 1].every(team => {
    const archer = cp.state.units[team*10+4];
    return Math.abs(archer.z - (team ? 8.5 : -8.5)) > .5
      && archer.lastAttackTick > firing.state.tickNumber + 45;
  }));
  for (const [team, client] of clients.entries()) {
    send(client, { type: 'move', ids: [team*10], x: team ? 6.5 : -6.5, z: team ? -3.5 : 3.5 });
  }
  const recovered = await checkpointWith(checkpointPath, cp => cp.state.tickNumber > followed.state.tickNumber + 90
    && [0, 1].every(team => cp.state.units[team*10+4].attackTargetId === (direct ? -1 : (1-team)*10+2)));
  for (const team of [0, 1]) {
    const unit = recovered.state.units[team*10+4];
    assert.equal(unit.attackMove, !direct);
    assert.ok(team ? unit.x > 0 : unit.x < 0, 'pursuit must not cross the cliff');
  }
  console.log(`${direct ? 'Direct attack' : 'Attack-move'}: both seats fire across cliffs and recover after unreachable retreat`);
} finally { await stop(); await rm(temp, { recursive: true, force: true }); }
