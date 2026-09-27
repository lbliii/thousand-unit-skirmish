import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { connect } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const temporary = await mkdtemp(path.join(os.tmpdir(), 'rts-room-expiry-'));
const pendingId = 'p'.repeat(32);
const expiredId = 'e'.repeat(32);
const data = path.join(temporary, 'data');
const deadline = Date.now() + 4000;
const sockets = [];
let supervisor;
let pausedPid;
let output = '';
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(predicate, label) {
  const end = Date.now() + 12_000;
  while (Date.now() < end) {
    const result = await predicate();
    if (result) return result;
    await delay(20);
  }
  throw new Error(`Timed out: ${label}\n${output}`);
}
function upgrade(port, id) {
  const socket = connect(port, '127.0.0.1');
  sockets.push(socket);
  let received = '';
  const result = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Upgrade timed out')), 12_000);
    socket.on('error', (error) => { clearTimeout(timer); reject(error); });
    socket.on('data', (chunk) => {
      received += chunk.toString('latin1');
      if (!received.includes('\r\n\r\n')) return;
      clearTimeout(timer);
      resolve(Number(received.match(/^HTTP\/1\.1 (\d+)/)?.[1]));
    });
    socket.on('connect', () => socket.write([
      `GET /ws?room=${id} HTTP/1.1`, `Host: 127.0.0.1:${port}`,
      'Connection: Upgrade', 'Upgrade: websocket', 'Sec-WebSocket-Version: 13',
      'Sec-WebSocket-Key: AAECAwQFBgcICQoLDA0ODw==', `Origin: http://127.0.0.1:${port}`, '', '',
    ].join('\r\n')));
  });
  // The paused startup deliberately delays awaiting the response.
  result.catch(() => {});
  return result;
}
try {
  for (const id of [pendingId, expiredId]) {
    await mkdir(path.join(data, 'rooms', id, 'custom-maps'), { recursive: true });
    await writeFile(path.join(data, 'rooms', id, 'custom-maps', 'preserved.txt'), 'player map');
  }
  await writeFile(path.join(data, 'rooms.json'), JSON.stringify({ version: 2, rooms: [pendingId, expiredId].map((id) => ({
    id, createdAt: deadline - 60_000, lastActiveAt: deadline - 60_000, launchOptions: { mode: 'pvp' },
  })) }));
  supervisor = spawn(process.execPath, [path.join(ROOT, 'room-supervisor.mjs')], {
    cwd: ROOT, env: { ...process.env, PORT: '0', RTS_HOST: '127.0.0.1', RTS_ROOM_DATA_DIRECTORY: data,
      RTS_CUSTOM_MAP_DIRECTORY: path.join(temporary, 'maps'), RTS_ROOM_IDLE_TTL_MS: '60000' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  supervisor.stdout.on('data', (chunk) => {
    output += chunk;
    const match = output.match(/\[room pppppppp\] worker pid=(\d+)/);
    if (match && !pausedPid) {
      pausedPid = Number(match[1]);
      process.kill(pausedPid, 'SIGSTOP');
    }
  });
  supervisor.stderr.on('data', (chunk) => { output += chunk; });
  const port = await until(() => output.match(/listening at http:\/\/127\.0\.0\.1:(\d+)/)?.[1], 'listen');
  assert.ok(Date.now() < deadline, 'fixture must admit the pending join before its original expiry');
  const joining = upgrade(Number(port), pendingId);
  await until(() => pausedPid, 'paused starting worker');
  await delay(Math.max(0, deadline - Date.now() + 100));
  const lookup = await fetch(`http://127.0.0.1:${port}/api/rooms/${pendingId}`);
  assert.equal(lookup.status, 200, 'a join admitted before expiry must protect its starting worker and saved maps');
  assert.equal(await readFile(path.join(data, 'rooms', pendingId, 'custom-maps', 'preserved.txt'), 'utf8'), 'player map');
  process.kill(pausedPid, 'SIGCONT');
  assert.equal(await joining, 101, 'the admitted join should finish after the old expiry deadline');
  assert.equal(await upgrade(Number(port), expiredId), 404, 'direct WebSocket joins must reject expired rooms');
  assert.equal(output.includes('[room eeeeeeee] worker pid='), false, 'an expired invite must not start a worker');
  assert.equal((await fetch(`http://127.0.0.1:${port}/api/rooms/${expiredId}`)).status, 404);
  const status = await fetch(`http://127.0.0.1:${port}/api/rooms/status`).then((response) => response.json());
  assert.equal(status.roomCount, 1, 'expiry should reclaim room capacity');
  console.log(JSON.stringify({ passed: ['pending join retains room and maps across idle deadline', 'expired direct WebSocket rejected before worker launch', 'expired room capacity reclaimed'] }));
} finally {
  if (pausedPid) { try { process.kill(pausedPid, 'SIGCONT'); } catch {} }
  for (const socket of sockets) socket.destroy();
  if (supervisor && supervisor.exitCode === null) {
    const exited = once(supervisor, 'exit');
    supervisor.kill('SIGTERM');
    const timer = setTimeout(() => supervisor.kill('SIGKILL'), 10_000);
    await exited;
    clearTimeout(timer);
  }
  await rm(temporary, { recursive: true, force: true });
}
