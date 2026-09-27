import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { request as httpRequest } from 'node:http';
import { createServer } from 'node:net';
import { mkdtemp, readFile, rm, stat, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const sourceRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
// Exercise Docker COPY output so a source-only asset cannot hide a broken release.
const packed = spawnSync(process.execPath, ['scripts/pack-railway-release.mjs', '--allow-dirty'], {
  cwd: sourceRoot, encoding: 'utf8',
});
assert.equal(packed.status, 0, packed.stderr);
const root = JSON.parse(packed.stdout).directory;
await symlink(path.join(sourceRoot, 'node_modules'), path.join(root, 'node_modules'), 'dir');
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
  const interactiveManifestResponse = await fetch(
    `${base}/assets/environment/frontier-interactive-v1/manifest.json`, {
      headers: { authorization },
    });
  let interactiveManifestOnDisk = false;
  try {
    interactiveManifestOnDisk = (await stat(
      path.join(root, 'assets/environment/frontier-interactive-v1/manifest.json'))).isFile();
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  const interactiveAssetPaths = [
    ...['oak', 'berries'].flatMap((family) => ['full', 'worked', 'low', 'depleted']
      .map((stage) => `${family}-${stage}.webp`)),
    'construction-earthwork.webp', 'construction-foundation.webp',
  ];
  if (interactiveManifestResponse.status === 404) {
    assert.equal(interactiveManifestOnDisk, false,
      'an interactive manifest present on disk must be served rather than treated as an absent pack');
    for (const assetPath of interactiveAssetPaths) {
      const response = await fetch(`${base}/assets/environment/frontier-interactive-v1/${assetPath}`, {
        headers: { authorization },
      });
      assert.equal(response.status, 404, `${assetPath} should be absent with the optional manifest`);
    }
  } else {
    assert.equal(interactiveManifestResponse.status, 200);
    assert.match(interactiveManifestResponse.headers.get('content-type'), /application\/json/);
    const manifest = await interactiveManifestResponse.json();
    assert.equal(manifest.schemaVersion, 1);
    assert.equal(manifest.packId, 'environment.frontier-interactive');
    assert.ok(Array.isArray(manifest.files));
    const runtimeEntries = manifest.files.filter((entry) => entry?.role === 'runtime-image');
    assert.deepEqual(runtimeEntries.map((entry) => entry.path).sort(), [...interactiveAssetPaths].sort());
    for (const entry of runtimeEntries) {
      assert.match(entry.sha256 || '', /^[a-f0-9]{64}$/i, `${entry.path} must declare a SHA-256`);
      const response = await fetch(
        `${base}/assets/environment/frontier-interactive-v1/${entry.path}`, {
          headers: { authorization },
        });
      assert.equal(response.status, 200, `${entry.path} must be served when the manifest is present`);
      assert.match(response.headers.get('content-type'), /image\/webp/);
      const bytes = Buffer.from(await response.arrayBuffer());
      assert.ok(bytes.length > 0, `${entry.path} must not be empty`);
      assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.sha256.toLowerCase(),
        `${entry.path} must match its manifest hash`);
    }
  }
  // Every static browser import must survive the release pack and public allowlist.
  const pendingClientModules = ['/src/main.js'];
  const visitedClientModules = new Set();
  while (pendingClientModules.length) {
    const modulePath = pendingClientModules.pop();
    if (visitedClientModules.has(modulePath)) continue;
    visitedClientModules.add(modulePath);
    const response = await fetch(`${base}${modulePath}`, { headers: { authorization } });
    assert.equal(response.status, 200, `browser import ${modulePath} must be served`);
    assert.match(response.headers.get('content-type'), /javascript/, modulePath);
    const moduleSource = await response.text();
    const imports = moduleSource.matchAll(/(?:import|export)\s+(?:[^;'"`]*?\s+from\s*)?['"]([^'"]+)['"]/g);
    for (const [, specifier] of imports) {
      const dependency = specifier === 'three' ? '/vendor/three.module.js'
        : specifier.startsWith('.') ? new URL(specifier, `${base}${modulePath}`).pathname
          : specifier.startsWith('/') ? specifier : null;
      assert.ok(dependency, `unmapped browser import ${specifier} in ${modulePath}`);
      pendingClientModules.push(dependency);
    }
  }
  const resourceStateModule = await fetch(`${base}/src/resource-visual-state.mjs`, { headers: { authorization } });
  assert.equal(resourceStateModule.status, 200);
  assert.match(await resourceStateModule.text(), /resourceVisualStage/);
  for (const asset of [
    'src/building-sprites.mjs',
    'assets/buildings/town-center-meshy-review-v1/runtime/town-center-view-01.webp',
    'assets/buildings/barracks-sprite-test-v1/runtime/barracks-complete-azure.webp',
    'assets/buildings/archery-range-sprite-v1/runtime/archery-range-critical-ember.webp',
  ]) {
    const response = await fetch(`${base}/${asset}`, { headers: { authorization } });
    assert.equal(response.status, 200, asset);
    assert.ok((await response.arrayBuffer()).byteLength > 100, asset);
  }
  for (const family of ['oak', 'pine', 'berries']) {
    for (let view = 0; view < 8; view++) {
      const asset = `assets/environment/frontier-meshy-sprites-v1/${family}/runtime/${family}-0${view}.webp`;
      const response = await fetch(`${base}/${asset}`, { headers: { authorization } });
      assert.equal(response.status, 200, asset);
      assert.match(response.headers.get('content-type'), /image\/webp/);
      assert.ok((await response.arrayBuffer()).byteLength > 100, asset);
    }
  }
  for (const [role, version] of [
    ['worker', 'v1'], ['worker', 'v2'], ['worker', 'v3'],
    ['infantry', 'v1'], ['infantry', 'v2'], ['archer', 'v1'],
  ]) {
    const directory = `assets/units/${role}-sprite-${version}`;
    const manifestResponse = await fetch(`${base}/${directory}/sprite-atlas-pack-v1.json`, {
      headers: { authorization },
    });
    assert.equal(manifestResponse.status, 200, directory);
    const manifest = await manifestResponse.json();
    for (const name of [`${role}-atlas-runtime.png`, 'team-accent-mask.png']) {
      const entry = manifest.files.find(file => file.path === name);
      assert.ok(entry, `${directory}/${name} must be declared`);
      const response = await fetch(`${base}/${directory}/${name}`, { headers: { authorization } });
      assert.equal(response.status, 200, `${directory}/${name}`);
      assert.match(response.headers.get('content-type'), /image\/png/);
      const bytes = Buffer.from(await response.arrayBuffer());
      assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.sha256,
        `${directory}/${name} must match its manifest`);
    }
    assert.equal((await fetch(`${base}/${directory}/${role}-atlas-source.png`, {
      headers: { authorization },
    })).status, 404, 'source atlases must remain private');
  }
  assert.equal(await upgrade(port), 401);
  assert.equal(await upgrade(port, authorization), 101);

  assert.ok((await stat(path.join(volume, 'room-data', 'rooms.json'))).isFile());
  assert.ok((await stat(path.join(volume, 'custom-maps'))).isDirectory());
  console.log('Railway release scenario passed: guarded startup, Basic Auth HTTP/WebSocket, local Three.js, packaged environment and unit sprites, verified atlas hashes, environment states, and volume paths.');
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
  await rm(root, { recursive: true, force: true });
}
