import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// A recovered pre-start hold must accrue only ticks actually spent on the match clock.
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

function connect(port, token = null) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`, token ? ['rts-v1', `rts-resume.${token}`] : ['rts-v1']);
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
  function wait(predicate, timeoutMs = TIMEOUT_MS) {
    const existing = messages.find(predicate);
    if (existing) return Promise.resolve(existing);
    return new Promise((resolve, reject) => {
      const waiter = { predicate, resolve, timer: setTimeout(() => {
        waiters.splice(waiters.indexOf(waiter), 1);
        reject(new Error('Timed out waiting for server message'));
      }, timeoutMs) };
      waiters.push(waiter);
    });
  }
  return { socket, wait, get latest() { return latest; } };
}

function send(client, command) {
  client.socket.send(JSON.stringify(command));
}

const team = Number(process.argv[2] || 0);
assert.ok(team === 0 || team === 1);
const port = await freePort();
const temp = await mkdtemp(path.join(os.tmpdir(), 'rts-hold-clock-'));
const checkpointPath = path.join(temp, 'match.json');
let child;
let logs = '';
const clients = [];
const tokens = [];
async function start() {
  child = spawn(process.execPath, [SERVER_PATH], { cwd: ROOT, env: { ...process.env,
    PORT: String(port), RTS_HOST: '127.0.0.1', RTS_MATCH_STATE_PATH: checkpointPath,
    RTS_CUSTOM_MAP_DIRECTORY: path.join(temp, 'maps') }, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', x => logs += x); child.stderr.on('data', x => logs += x);
  const deadline = Date.now() + TIMEOUT_MS;
  while (Date.now() < deadline) {
    try { if ((await fetch(`http://127.0.0.1:${port}/health`)).ok) return; } catch {}
    await new Promise(r => setTimeout(r, 20));
  }
  throw new Error(logs);
}
async function join(seat) {
  const client = connect(port, tokens[seat]); clients[seat] = client;
  const welcome = await client.wait(m => m.type === 'welcome');
  assert.equal(welcome.player.team, seat);
  tokens[seat] = welcome.player.sessionToken;
  return client;
}
async function stop() {
  if (child?.exitCode === null) { const exited = once(child, 'exit'); child.kill('SIGINT'); await exited; }
  clients.splice(0).forEach(c => c?.socket.close());
}
try {
  await start();
  const host = await join(0);
  send(host, { type: 'publishMap', map: {
    id: 'hold-clock-recovery', name: 'Hold Clock Recovery', width: 40, height: 40,
    startingArmySize: 8, fogOfWar: false, victoryHoldSeconds: 7.5,
    spawnPoints: [{ team: 0, x: -12, z: 0 }, { team: 1, x: 12, z: 0 }],
    obstacles: [], resourceNodes: [],
    triggers: [{ id: 'crown', name: 'Crown', type: 'capture-zone', victory: true,
      zone: { column: team ? 30 : 6, row: 17, width: 5, height: 6 }, requiredUnits: 1,
      captureSeconds: .5, foodReward: 7 }],
    timedVictory: { afterSeconds: 10, objectiveId: 'crown' },
    scenarioEvents: [{ id: 'rations', name: 'Rations', type: 'timed-supply',
      afterSeconds: .5, team: 'both', foodReward: 3, repeatCount: 1, repeatEverySeconds: 5 }],
  } });
  const publication = await host.wait(m => m.type === 'mapChange' || m.type === 'mapRejected');
  assert.equal(publication.type, 'mapChange', publication.message);
  await host.wait(m => m.type === 'state' && m.victoryHold?.activeTeams[team]);
  await stop();
  const paused = JSON.parse(await readFile(checkpointPath, 'utf8'));
  assert.equal(paused.state.scenarioClockStarted, false);
  assert.equal(paused.state.victoryHoldState.progressSeconds[team], 0);
  assert.equal(paused.state.teamFood[team], 7);
  await start();
  const recoveredHost = await join(0);
  // A move-start snapshot can occur between the three-tick scenario evaluations.
  // Join the opponent from that snapshot, so the first clock interval is partial.
  let aligned = false;
  for (let attempt = 0; attempt < 8 && !aligned; attempt++) {
    const after = recoveredHost.latest.tick;
    send(recoveredHost, { type: 'move', ids: [1], x: attempt % 2 ? -11 : -8, z: 5 });
    aligned = await recoveredHost.wait(m => m.type === 'state' && m.tick > after && m.tick % 3 !== 0, 120)
      .then(() => true, () => false);
  }
  assert.ok(aligned, 'must exercise a partial initial scenario interval');
  await join(1);
  await clients[0].wait(m => m.type === 'state' && m.scenarioEvents?.some(e => e.id === 'rations' && e.fireCount === 1));
  await stop();
  const active = JSON.parse(await readFile(checkpointPath, 'utf8'));
  assert.equal(active.state.scenarioEventStates[0].fireCount, 1);
  assert.equal(active.state.matchWinner, -1);
  assert.ok(active.state.victoryHoldState.progressSeconds[team] <= active.state.matchElapsedSeconds + 1e-9,
    `Hold progress ${active.state.victoryHoldState.progressSeconds[team]} exceeds elapsed clock ${active.state.matchElapsedSeconds}`);
  const due = active.state.scenarioEventStates[0].nextFireAtSeconds;
  await start();
  await join(0); await join(1);
  assert.equal(clients[0].latest.scenarioEvents[0].nextFireAtSeconds, due,
    'restart must retain the active repeating-event deadline');
  assert.deepEqual(clients[0].latest.food, team ? [3, 10] : [10, 3],
    'restart must not replay either the capture or first event reward');
  await clients[0].wait(m => m.type === 'state' && m.winner === team);
  await stop();
  const final = JSON.parse(await readFile(checkpointPath, 'utf8'));
  assert.ok(final.state.matchElapsedSeconds >= 7.5 - 1e-9, 'hold must not award victory early');
  assert.ok(final.state.matchElapsedSeconds >= due, 'second supply deadline must elapse');
  assert.equal(final.state.scenarioEventStates[0].fireCount, 2);
  assert.deepEqual(final.state.teamFood, team ? [6, 13] : [13, 6], 'capture and repeat rewards must occur exactly once');
  assert.equal(final.state.matchWinnerReason, 'capture-hold');
  console.log(`Seat ${team}: paused/active checkpoint recovery preserves hold duration and repeat rewards`);
} finally { await stop(); await rm(temp, { recursive: true, force: true }); }
