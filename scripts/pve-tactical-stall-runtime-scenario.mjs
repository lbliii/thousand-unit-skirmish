import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDeterministicPolicy, toOpponentObservation } from '../src/pve-opponent.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const temporary = await mkdtemp(path.join(os.tmpdir(), 'pve-tactical-stall-'));
const listener = createServer();
listener.listen(0, '127.0.0.1');
await once(listener, 'listening');
const port = listener.address().port;
await new Promise((resolve) => listener.close(resolve));
const child = spawn(process.execPath, [path.join(root, 'server.mjs')], {
  cwd: root,
  env: { ...process.env, PORT: String(port), RTS_HOST: '127.0.0.1',
    RTS_MAP: 'maps/open-field.json', RTS_MATCH_STATE_PATH: path.join(temporary, 'match.json'),
    RTS_CUSTOM_MAP_DIRECTORY: path.join(temporary, 'maps') },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let logs = '';
child.stdout.on('data', (chunk) => { logs += chunk; });
child.stderr.on('data', (chunk) => { logs += chunk; });
const clients = [];
async function until(predicate, label, timeout = 40_000) {
  const deadline = Date.now() + timeout;
  while (!predicate()) {
    if (child.exitCode !== null || logs.includes('mapRejected') || Date.now() >= deadline) throw new Error(`${label}\n${logs}`);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}
async function connect() {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`, ['rts-v1']);
  const client = { socket, messages: [], state: null, welcome: null };
  clients.push(client);
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    client.messages.push(message);
    if (message.type === 'mapRejected') logs += JSON.stringify(message);
    if (message.type === 'welcome') client.welcome = message;
    if (['state', 'welcome', 'mapChange'].includes(message.type)) {
      client.state = message.type === 'state' ? message : message.state;
    }
  });
  await until(() => client.welcome, 'welcome');
  return client;
}
try {
  const readyBy = Date.now() + 10_000;
  while (true) {
    try { if ((await fetch(`http://127.0.0.1:${port}/health`)).ok) break; } catch {}
    assert.ok(Date.now() < readyBy, `server ready: ${logs}`);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  const azure = await connect();
  const ember = await connect();
  const map = {
    id: 'pve-stalled-advance', name: 'PvE Stalled Advance', width: 64, height: 64,
    terrainSeed: 19, fogOfWar: false, startingArmySize: 24,
    spawnPoints: [{ team: 0, x: -20, z: 0 }, { team: 1, x: 20, z: 0 }],
    obstacles: [
      { id: 'dividing-wall', column: 31, row: 0, width: 2, height: 64 },
    ], resourceNodes: [], scenarioEvents: [],
    triggers: [],
  };
  azure.socket.send(JSON.stringify({ type: 'publishMap', map }));
  await until(() => clients.every((client) => client.state?.mapId === map.id), 'map publication');
  const runs = clients.map((client) => ({ client, policy: createDeterministicPolicy(20260925),
    team: client.welcome.player.team, lastTick: -Infinity, commands: [], initial: null }));
  const deadline = Date.now() + 40_000;
  let patrolAt = 0;
  let patrolZ = 8;
  while (runs.some((run) => run.commands.length < 2)) {
    assert.ok(Date.now() < deadline, `both seats must retry stalled accepted orders: ${JSON.stringify(runs.map(({ commands }) => commands))}`);
    // WebSocket snapshots are dirty-only. An ordinary worker patrol keeps fresh
    // ticks observable; it does not move or issue orders to the policy's soldiers.
    if (Date.now() >= patrolAt) {
      patrolAt = Date.now() + 4000;
      patrolZ = -patrolZ;
      for (const run of runs) {
        const worker = run.client.state.units.find((unit) => unit[1] === run.team && unit[5] === 'worker');
        run.client.socket.send(JSON.stringify({ type: 'move', ids: [worker[0]],
          x: run.team === 0 ? -20 : 20, z: patrolZ }));
      }
    }
    for (const run of runs) {
      if (run.commands.length >= 2 || run.client.state.tick - run.lastTick < 30) continue;
      const observation = toOpponentObservation(run.client.state, run.team, map);
      run.lastTick = observation.tick;
      run.initial ??= observation;
      for (const command of run.policy.next(observation)) {
        if (command.type === 'gather') {
          run.client.socket.send(JSON.stringify(command));
          continue;
        }
        assert.equal(command.type, 'attackMove');
        run.commands.push({ tick: observation.tick, command });
        run.client.socket.send(JSON.stringify({ ...command, clientOrderToken: run.commands.length }));
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  for (const run of runs) {
    await until(() => run.client.messages.some((message) => message.type === 'notice'
      && message.clientOrderToken === 2 && message.message.startsWith('ATTACK MOVE ORDER')), 'retry accepted');
    assert.ok(run.client.messages.some((message) => message.type === 'notice'
      && message.clientOrderToken === 1 && message.message.startsWith('ATTACK MOVE ORDER')),
    'the original attack-move was accepted by the authority');
    assert.equal(run.commands.length, 2, 'one bounded retry');
    assert.ok(run.commands[1].tick - run.commands[0].tick >= 300, 'retry waits for observed stall');
    const soldiers = toOpponentObservation(run.client.state, run.team, map).units.friendly.filter((unit) => unit.kind !== 'worker');
    const target = run.commands[0].command;
    assert.ok(soldiers.every((unit) => Math.hypot(unit.x - target.x, unit.z - target.z) > 2),
      'army remains short of the inaccessible target');
    assert.ok(soldiers.some((unit) => {
      const initial = run.initial.units.friendly.find(({ id }) => id === unit.id);
      return Math.hypot(unit.x - initial.x, unit.z - initial.z) > 1;
    }), 'accepted order moved the army to reachable fallback positions first');
    console.log(JSON.stringify({ team: run.team, seed: 20260925,
      orderTicks: run.commands.map(({ tick }) => tick), outcome: 'accepted fallback movement followed by stalled-advance retry' }));
  }
} finally {
  for (const { socket } of clients) socket.close();
  if (child.exitCode === null) {
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    const timer = setTimeout(() => child.kill('SIGKILL'), 3000);
    await exited;
    clearTimeout(timer);
  }
  await rm(temporary, { recursive: true, force: true });
}
