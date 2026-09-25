import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { request as httpRequest } from 'node:http';
import { createServer } from 'node:net';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const entry = path.join(root, 'room-supervisor.mjs');
const dockerfile = await readFile(path.join(root, 'Dockerfile'), 'utf8');
assert.match(dockerfile, /^\s*COPY\b[^\n]*\borigin-policy\.mjs\b/m,
  'the shared origin policy must be included in the Railway image');
const secret = 'test-release-password-please-change';
const volume = await mkdtemp(path.join(os.tmpdir(), 'rts-railway-release-'));
const environment = {
  ...process.env,
  RAILWAY_ENVIRONMENT: 'production',
  RAILWAY_PUBLIC_DOMAIN: 'game-production.up.railway.app',
  RAILWAY_VOLUME_MOUNT_PATH: volume,
  RTS_ACCESS_USER: 'players',
  RTS_ACCESS_PASSWORD: secret,
  RTS_PUBLIC_ORIGINS: '',
  RTS_HOST: '127.0.0.1',
};
delete environment.RTS_ROOM_DATA_DIRECTORY;
delete environment.RTS_CUSTOM_MAP_DIRECTORY;

function rejectsMissingConfiguration(override, expected) {
  const result = spawnSync(process.execPath, [entry], {
    cwd: root,
    env: { ...environment, ...override },
    encoding: 'utf8',
    timeout: 5000,
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, expected);
}

async function availablePort() {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

function upgrade(port, authorization) {
  return new Promise((resolve, reject) => {
    const headers = {
      connection: 'Upgrade', upgrade: 'websocket',
      'sec-websocket-version': '13',
      'sec-websocket-key': randomBytes(16).toString('base64'),
      origin: `https://${environment.RAILWAY_PUBLIC_DOMAIN}`,
    };
    if (authorization) headers.authorization = authorization;
    const request = httpRequest({ hostname: '127.0.0.1', port, path: '/ws', headers });
    request.setTimeout(5000, () => request.destroy(new Error('WebSocket upgrade timed out')));
    request.on('upgrade', (_response, socket) => { socket.destroy(); resolve(101); });
    request.on('response', (response) => { response.resume(); response.on('end', () => resolve(response.statusCode)); });
    request.on('error', reject);
    request.end();
  });
}

let child;
try {
  rejectsMissingConfiguration({ RAILWAY_VOLUME_MOUNT_PATH: '' }, /Attach a Railway volume/);
  rejectsMissingConfiguration({ RTS_ACCESS_PASSWORD: '' }, /RTS_ACCESS_PASSWORD/);
  rejectsMissingConfiguration({ RAILWAY_PUBLIC_DOMAIN: '' }, /RAILWAY_PUBLIC_DOMAIN or RTS_PUBLIC_ORIGINS/);

  const port = await availablePort();
  child = spawn(process.execPath, [entry], {
    cwd: root, env: { ...environment, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let childOutput = '';
  child.stdout.on('data', (chunk) => { childOutput += chunk; });
  child.stderr.on('data', (chunk) => { childOutput += chunk; });
  const base = `http://127.0.0.1:${port}`;
  const authorization = `Basic ${Buffer.from(`players:${secret}`).toString('base64')}`;
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (child.exitCode !== null) throw new Error(`Supervisor exited: ${childOutput}`);
    try {
      const response = await fetch(`${base}/ready`, { signal: AbortSignal.timeout(500) });
      if (response.status === 200 && (await response.json()).ok === true) { ready = true; break; }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.ok(ready, `Supervisor did not become ready: ${childOutput}`);

  assert.equal((await fetch(`${base}/`)).status, 401);
  assert.equal((await fetch(`${base}/health`)).status, 401);
  assert.equal((await fetch(`${base}/api/rooms`, { method: 'POST' })).status, 401);
  assert.equal((await fetch(`${base}/`, { headers: { authorization: 'Basic bad' } })).status, 401);
  assert.equal((await fetch(`${base}/`, { headers: { authorization } })).status, 200);
  assert.equal((await fetch(`${base}/health`, { headers: { authorization } })).status, 200);
  const three = await fetch(`${base}/vendor/three.module.js`, { headers: { authorization } });
  assert.equal(three.status, 200);
  assert.match(three.headers.get('content-type'), /javascript/);
  assert.match(await three.text(), /class WebGLRenderer/);
  const threeCore = await fetch(`${base}/vendor/three.core.js`, { headers: { authorization } });
  assert.equal(threeCore.status, 200);
  assert.match(threeCore.headers.get('content-type'), /javascript/);
  const environmentModule = await fetch(`${base}/src/environment-art.mjs`, { headers: { authorization } });
  assert.equal(environmentModule.status, 200);
  assert.match(environmentModule.headers.get('content-type'), /javascript/);
  const environmentTexture = await fetch(`${base}/assets/environment/frontier-v1/meadow.webp`, {
    headers: { authorization },
  });
  assert.equal(environmentTexture.status, 200);
  assert.match(environmentTexture.headers.get('content-type'), /image\/webp/);
  assert.ok((await environmentTexture.arrayBuffer()).byteLength > 0);
  assert.equal(await upgrade(port), 401);
  assert.equal(await upgrade(port, authorization), 101);

  assert.ok((await stat(path.join(volume, 'room-data', 'rooms.json'))).isFile());
  assert.ok((await stat(path.join(volume, 'custom-maps'))).isDirectory());
  console.log('Railway release scenario passed: guarded startup, Basic Auth HTTP/WebSocket, local Three.js, environment assets, and volume paths.');
} finally {
  if (child && child.exitCode === null) {
    child.kill('SIGTERM');
    await Promise.race([
      new Promise((resolve) => child.once('exit', resolve)),
      new Promise((resolve) => setTimeout(resolve, 8000)),
    ]);
    if (child.exitCode === null) child.kill('SIGKILL');
  }
  await rm(volume, { recursive: true, force: true });
}
