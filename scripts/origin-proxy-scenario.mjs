import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { connect, createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SUPERVISOR_PATH = path.join(ROOT, 'room-supervisor.mjs');
const STAGING_DOMAIN = 'game-staging-21f9.up.railway.app';
const READY_TIMEOUT_MS = 15_000;

async function reservePort() {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function waitForHealth(child, port) {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error('Origin-proxy supervisor exited before becoming healthy.');
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`, { cache: 'no-store' });
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('Origin-proxy supervisor did not become healthy.');
}

function upgradeStatus(port, origin, forwardedHeaders = {}) {
  const socket = connect({ host: '127.0.0.1', port });
  return new Promise((resolve, reject) => {
    let response = Buffer.alloc(0);
    let settled = false;
    const finish = (error, status) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      socket.off('data', onData);
      socket.off('error', onError);
      socket.destroy();
      if (error) reject(error);
      else resolve(status);
    };
    const onError = (error) => finish(error);
    const onData = (chunk) => {
      response = Buffer.concat([response, chunk]);
      const end = response.indexOf('\r\n\r\n');
      if (end < 0) return;
      const status = Number(response.subarray(0, end).toString('latin1').match(/^HTTP\/1\.1 (\d+)/)?.[1]);
      if (!Number.isInteger(status)) return finish(new Error('Malformed WebSocket handshake response.'));
      finish(null, status);
    };
    const timeout = setTimeout(() => finish(new Error('Origin-proxy handshake timed out.')), 5_000);
    socket.on('data', onData);
    socket.once('error', onError);
    socket.once('connect', () => {
      const headers = [
        'GET /ws HTTP/1.1',
        `Host: 127.0.0.1:${port}`,
        'Upgrade: websocket',
        'Connection: Upgrade',
        `Sec-WebSocket-Key: ${randomBytes(16).toString('base64')}`,
        'Sec-WebSocket-Version: 13',
        `Origin: ${origin}`,
        ...Object.entries(forwardedHeaders).map(([name, value]) => `${name}: ${value}`),
      ];
      socket.write(`${headers.join('\r\n')}\r\n\r\n`);
    });
  });
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

const directory = await mkdtemp(path.join(os.tmpdir(), 'rts-origin-proxy-'));
const port = await reservePort();
const environment = { ...process.env };
for (const name of [
  'RAILWAY_PROJECT_ID', 'RAILWAY_ENVIRONMENT', 'RAILWAY_ENVIRONMENT_ID',
  'RAILWAY_ENVIRONMENT_NAME', 'RAILWAY_VOLUME_MOUNT_PATH', 'RTS_ACCESS_PASSWORD',
  'RTS_PUBLIC_ORIGINS',
]) delete environment[name];
Object.assign(environment, {
  PORT: String(port),
  RTS_HOST: '127.0.0.1',
  RAILWAY_PUBLIC_DOMAIN: STAGING_DOMAIN,
  RTS_CUSTOM_MAP_DIRECTORY: path.join(directory, 'custom-maps'),
  RTS_ROOM_DATA_DIRECTORY: path.join(directory, 'room-data'),
  RTS_MAX_ROOMS: '1',
});

let supervisor;
try {
  supervisor = spawn(process.execPath, [SUPERVISOR_PATH], {
    cwd: ROOT,
    env: environment,
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  await waitForHealth(supervisor, port);

  const acceptedAllowedOrigin = await upgradeStatus(port, `https://${STAGING_DOMAIN}`, {
    'X-Forwarded-Host': 'attacker.example',
    'X-Forwarded-Proto': 'http',
  });
  assert.equal(acceptedAllowedOrigin, 101,
    'the configured staging origin should complete an upgrade through both local proxy layers');

  const rejectedSpoofedOrigin = await upgradeStatus(port, 'https://attacker.example', {
    'X-Forwarded-Host': 'attacker.example',
    'X-Forwarded-Proto': 'https',
  });
  assert.equal(rejectedSpoofedOrigin, 403,
    'forwarded-header spoofing must not admit an unlisted Origin');

  console.log(JSON.stringify({
    status: 'passed',
    mode: 'local supervisor and worker with Railway staging domain configured',
    acceptedAllowedOrigin,
    rejectedSpoofedOrigin,
    deploymentChanged: false,
  }, null, 2));
} finally {
  await stopSupervisor(supervisor);
  await rm(directory, { recursive: true, force: true });
}
