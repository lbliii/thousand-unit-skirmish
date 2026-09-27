import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDeterministicPolicy, toOpponentObservation } from '../src/pve-opponent.mjs';

const mapId = process.argv[2] || 'forked-vale';
assert.ok(['forked-vale', 'woodland-expanse'].includes(mapId));
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const temporary = await mkdtemp(path.join(os.tmpdir(), 'pve-production-'));
const listener = createServer();
listener.listen(0, '127.0.0.1');
await once(listener, 'listening');
const port = listener.address().port;
await new Promise((resolve) => listener.close(resolve));
const child = spawn(process.execPath, [path.join(root, 'server.mjs')], {
  cwd: root,
  env: { ...process.env, PORT: String(port), RTS_HOST: '127.0.0.1',
    RTS_GAME_MODE: 'pvp', RTS_MAP: `maps/${mapId}.json`, RTS_MATCH_STATE_PATH: path.join(temporary, 'match.json'),
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
  await connect();
  await connect();
  const runs = clients.map((client, index) => ({
    client, team: client.welcome.player.team, seed: index === 0 ? 20260925 : 0xffff_ffff,
    policy: createDeterministicPolicy(index === 0 ? 20260925 : 0xffff_ffff),
    lastTick: -Infinity, commands: [], buildingIds: new Set(), trained: new Set(),
    initialSoldiers: new Set(client.state.units.filter((unit) => unit[1] === index && unit[5] !== 'worker')
      .map((unit) => `${unit[0]}:${unit[8]}`)),
  }));
  const deadline = Date.now() + 120_000;
  const complete = (run) => run.trained.size > 0 && run.commands.some(({ command }) => command.type === 'attackMove'
    && command.ids.some((id) => run.trained.has(id)));
  while (!runs.every(complete)) {
    assert.ok(Date.now() < deadline, `production timeout: ${JSON.stringify(runs.map(({ team, commands, client }) => ({ team,
      commands, notices: client.messages.filter((message) => message.type === 'notice').slice(-8) })))}`);
    for (const run of runs) {
      const state = run.client.state;
      if (state.tick - run.lastTick < 30) continue;
      run.lastTick = state.tick;
      const observation = toOpponentObservation(state, run.team, run.client.welcome.map);
      const barracks = observation.buildings.friendly.filter((building) => building.type === 'barracks');
      for (const building of barracks) {
        run.buildingIds.add(building.id);
        assert.ok(building.queue <= 1, 'at most one queued Infantry');
      }
      assert.ok(run.buildingIds.size <= 1, 'at most one accepted Barracks per match');
      for (const unit of observation.units.friendly) {
        if (unit.kind === 'infantry' && !run.initialSoldiers.has(`${unit.id}:${unit.generation}`)) run.trained.add(unit.id);
      }
      for (const command of run.policy.next(observation)) {
        run.commands.push({ tick: observation.tick, command });
        run.client.socket.send(JSON.stringify({ ...command, clientOrderToken: run.commands.length }));
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  for (const run of runs) {
    assert.equal(run.buildingIds.size, 1);
    assert.deepEqual(run.commands.slice(0, 3).map(({ command }) => command.type), ['gather', 'gather', 'attackMove']);
    assert.ok(run.client.state.buildings.some((building) => building.team === run.team && building.complete));
    assert.ok(run.client.messages.some((message) => message.type === 'notice' && message.message.startsWith('INFANTRY QUEUED')));
    console.log(JSON.stringify({ map: mapId, team: run.team, seed: run.seed,
      buildingIds: [...run.buildingIds], trainedAndOrdered: [...run.trained],
      production: run.commands.filter(({ command }) => ['build', 'train'].includes(command.type)) }));
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
