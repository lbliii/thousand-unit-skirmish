import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { chmod, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

assert.ok(process.getuid && process.getuid() !== 0,
  'storage permission fixture requires an unprivileged POSIX user');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temp = await mkdtemp(path.join(os.tmpdir(), 'rts-storage-recovery-'));
const saveDirectory = path.join(temp, 'save');
const checkpointPath = path.join(saveDirectory, 'match.json');
await mkdir(saveDirectory);
const reservation = createServer();
reservation.listen(0, '127.0.0.1');
await once(reservation, 'listening');
const port = reservation.address().port;
await new Promise((resolve) => reservation.close(resolve));
let child;
let logs = '';
let clients = [];
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check, description) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const result = await check();
    if (result) return result;
    await delay(30);
  }
  throw new Error(`Timed out: ${description}\n${logs.slice(-2500)}`);
}
async function health() {
  const response = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(1000) });
  assert.equal(response.status, 200);
  return response.json();
}
async function start() {
  child = spawn(process.execPath, ['server.mjs'], { cwd: root, env: {
    ...process.env, PORT: String(port), RTS_HOST: '127.0.0.1', RTS_MAP: 'maps/open-field.json',
    RTS_ACCESS_PASSWORD: '', RTS_MATCH_STATE_PATH: checkpointPath,
    RTS_CUSTOM_MAP_DIRECTORY: path.join(temp, 'maps'),
  }, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', (chunk) => { logs += chunk; });
  child.stderr.on('data', (chunk) => { logs += chunk; });
  await until(async () => { try { return await health(); } catch { return false; } }, 'server ready');
}
async function stop(signal = 'SIGINT') {
  for (const client of clients) client.socket.close();
  clients = [];
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, 'exit');
  child.kill(signal);
  const timer = setTimeout(() => child.kill('SIGKILL'), 3000);
  try { await exited; } finally { clearTimeout(timer); }
}
function connect(token) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`, token ? ['rts-v1', `rts-resume.${token}`] : ['rts-v1']);
  const client = { socket, messages: [], latest: null };
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    client.messages.push(message);
    if (message.type === 'state') client.latest = message;
    if (message.type === 'welcome') client.latest = message.state;
  });
  client.wait = (predicate, description) => until(() => client.messages.find(predicate), description);
  clients.push(client);
  return client;
}
async function saved() {
  try { return JSON.parse(await readFile(checkpointPath, 'utf8')); } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

try {
  await start();
  const seats = [connect(), connect()];
  const welcomes = await Promise.all(seats.map((client) => client.wait((m) => m.type === 'welcome', 'seat welcome')));
  assert.deepEqual(welcomes.map((m) => m.player.team).sort(), [0, 1]);
  const before = await until(async () => {
    const record = await saved();
    return record?.state?.seatSessions?.length === 2 ? record : null;
  }, 'both seats saved');
  const beforeHealth = await health();
  await chmod(saveDirectory, 0o500);
  const retainedBytes = await readFile(checkpointPath, 'utf8');
  const retained = JSON.parse(retainedBytes);
  const failedHealth = await until(async () => {
    const status = await health();
    return status.checkpoint.failures > beforeHealth.checkpoint.failures ? status : null;
  }, 'real checkpoint permission failure');
  assert.match(logs, /Could not save match checkpoint:.*EACCES/);

  const moved = [];
  for (let index = 0; index < seats.length; index++) {
    const client = seats[index];
    const team = welcomes[index].player.team;
    const unit = client.latest.units.find((u) => u[1] === team && u[4] > 0);
    assert.ok(unit);
    const token = 900 + team;
    client.socket.send(JSON.stringify({ type: 'move', ids: [unit[0]], x: unit[2], z: unit[3] + 8,
      formation: 'line', clientOrderToken: token }));
    await client.wait((m) => m.type === 'notice' && m.clientOrderToken === token
      && m.message.startsWith('MOVE ORDER'), `team ${team} move accepted during storage failure`);
    await until(() => {
      const current = client.latest.units.find((u) => u[0] === unit[0]);
      return current && Math.hypot(current[2] - unit[2], current[3] - unit[3]) > 1;
    }, `team ${team} moves during storage failure`);
    moved.push({ id: unit[0], x: unit[2], z: unit[3], team });
  }
  assert.equal(await readFile(checkpointPath, 'utf8'), retainedBytes,
    'failed writes must preserve the last valid checkpoint byte for byte');
  assert.ok(seats.every((client) => client.socket.readyState === WebSocket.OPEN));
  await chmod(saveDirectory, 0o700);
  const recovered = await until(async () => {
    const record = await saved();
    return record?.sequence > retained.sequence && record.state.tickNumber > retained.state.tickNumber ? record : null;
  }, 'fresh checkpoint after storage recovery');
  assert.equal(recovered.matchId, before.matchId);
  for (const initial of moved) {
    const unit = recovered.state.units.find((entry) => entry.id === initial.id);
    assert.ok(unit && Math.hypot(unit.x - initial.x, unit.z - initial.z) > 1,
      'new checkpoint must retain movement accepted while storage was unavailable');
  }
  const tokens = welcomes.map((m) => m.player.sessionToken);
  await stop('SIGKILL');
  await start();
  const restoredSeats = tokens.map((token) => connect(token));
  const restored = await Promise.all(restoredSeats.map((client) => client.wait((m) => m.type === 'welcome', 'recovered seat')));
  for (let index = 0; index < restored.length; index++) {
    assert.equal(restored[index].matchId, recovered.matchId);
    assert.equal(restored[index].recoveredFromCheckpoint, true);
    assert.equal(restored[index].player.team, welcomes[index].player.team);
    assert.equal(restored[index].player.resumed, true);
    assert.ok(restored[index].state.tick >= recovered.state.tickNumber);
    const own = moved.find((unit) => unit.team === welcomes[index].player.team);
    const restoredUnit = restored[index].state.units.find((unit) => unit[0] === own.id);
    assert.ok(restoredUnit && Math.hypot(restoredUnit[2] - own.x, restoredUnit[3] - own.z) > 1,
      'recovered seat must retain movement from the recovered write');
  }
  console.log(JSON.stringify({ scenario: 'checkpoint permission failure and recovery',
    retainedSequence: retained.sequence, recoveredSequence: recovered.sequence,
    observedFailures: failedHealth.checkpoint.failures, movedUnits: moved.map((unit) => unit.id),
    lastSavePreserved: true, bothSeatsRecovered: true }, null, 2));
} finally {
  await chmod(saveDirectory, 0o700).catch(() => {});
  await stop();
  await rm(temp, { recursive: true, force: true });
}
