#!/usr/bin/env node

import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer as createNetServer } from 'node:net';
import { link, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resourceVisualStage } from '../src/resource-visual-state.mjs';
import { constructionGroundStage } from '../src/building-visual-state.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SERVER_ENTRY = path.join(ROOT, 'server.mjs');
const QA_EVIDENCE_ROOT = path.join(ROOT, 'docs/qa-evidence/environment-state-pack-v1');
const ENVIRONMENT_PACK_ROOT = path.join(ROOT, 'assets/environment/frontier-interactive-v1');
const ENVIRONMENT_MANIFEST_PATH = path.join(ENVIRONMENT_PACK_ROOT, 'manifest.json');
const GAME_DEV_RUN_DIR = process.env.GAME_DEV_RUN_DIR;
const GAME_DEV_RUN_ID = process.env.GAME_DEV_RUN_ID;
const GAME_DEV_ADAPTER_ID = process.env.GAME_DEV_ADAPTER_ID;
const GAME_DEV_SCENARIO_ID = process.env.GAME_DEV_SCENARIO_ID;
const HEALTH_TIMEOUT_MS = 15_000;
const PAGE_TIMEOUT_MS = 20_000;
const STATE_TIMEOUT_MS = 180_000;
const CHILD_EXIT_TIMEOUT_MS = 2500;
const INITIAL_ZOOM = 0.91;
const ZOOM_WHEEL_SCALE = 0.001;
const ZOOM_SETTLE_MS = 250;
const VIEWPORT_WIDTH = 1280;
const VIEWPORT_HEIGHT = 720;
const DEVICE_PIXEL_RATIO = 2;
const PNG_PIXEL_WIDTH = VIEWPORT_WIDTH * DEVICE_PIXEL_RATIO;
const PNG_PIXEL_HEIGHT = VIEWPORT_HEIGHT * DEVICE_PIXEL_RATIO;
const TEAMS = Object.freeze(['azure', 'ember']);
const RESOURCE_FAMILIES = Object.freeze([
  { id: 'oak', nodeType: 'wood', workerSlot: 0 },
  { id: 'berries', nodeType: 'food', workerSlot: 1 },
]);
const STOCK_STAGES = Object.freeze([
  { id: 'full', minimum: 67, maximum: 100 },
  { id: 'worked', minimum: 34, maximum: 66 },
  { id: 'low', minimum: 1, maximum: 33 },
  { id: 'depleted', minimum: 0, maximum: 0 },
]);
const CONSTRUCTION_STAGES = Object.freeze([
  { id: 'construction-earthwork', groundStage: 'earthwork' },
  { id: 'construction-foundation', groundStage: 'foundation' },
]);
const REQUIRED_RUNTIME_FILES = Object.freeze([
  ...RESOURCE_FAMILIES.flatMap(({ id }) => STOCK_STAGES.map(({ id: stage }) => `${id}-${stage}.webp`)),
  'construction-earthwork.webp', 'construction-foundation.webp',
]);
const EXPECTED_FRAME_COUNT = (RESOURCE_FAMILIES.length * STOCK_STAGES.length + CONSTRUCTION_STAGES.length)
  * 2 * 2;
const ZOOMS = Object.freeze([
  { label: '091', value: 0.91 },
  { label: '048', value: 0.48 },
]);
const PILOT_FRAME_SPECS = Object.freeze([
  Object.freeze({ mapId: 'renderer-env-meadow', zoom: 0.91, familyId: 'oak', stageId: 'worked', sample: 50 }),
  Object.freeze({ mapId: 'renderer-env-meadow', zoom: 0.48, familyId: 'berries', stageId: 'worked', sample: 50 }),
  Object.freeze({ mapId: 'renderer-env-cinder', zoom: 0.91, familyId: 'oak', stageId: 'depleted', sample: 0 }),
  Object.freeze({ mapId: 'renderer-env-cinder', zoom: 0.48, familyId: 'berries', stageId: 'low', sample: 20 }),
]);

const children = new Set();
const capturedFrameKeys = [];
const capturedFrameEvidence = [];
let tempRoot = null;
let interruptSignal = null;
let resolveInterrupt;
const interruptPromise = new Promise((resolve) => { resolveInterrupt = resolve; });

function onSignal(signal) {
  interruptSignal = signal;
  resolveInterrupt(signal);
}

process.once('SIGINT', onSignal);
process.once('SIGTERM', onSignal);

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function checkInterrupted() {
  if (interruptSignal) throw new Error(`Interrupted by ${interruptSignal}`);
}

function assertGameDevContext(expectedScenario = 'renderer-environment-state') {
  assert.ok(GAME_DEV_RUN_DIR && GAME_DEV_RUN_ID && GAME_DEV_ADAPTER_ID && GAME_DEV_SCENARIO_ID,
    'run this opt-in capture through game-dev scenario run');
  assert.equal(GAME_DEV_ADAPTER_ID, 'thousand-unit-skirmish', 'unexpected adapter context');
  assert.equal(GAME_DEV_SCENARIO_ID, expectedScenario, 'unexpected adapter scenario context');
}

function startChild(label, command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: options.cwd || ROOT,
    env: options.env || process.env,
    detached: process.platform !== 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const record = {
    label, child, stdout: '', stderr: '', spawnError: null,
    exit: new Promise((resolve) => child.once('exit', (code, signal) => resolve({ code, signal }))),
  };
  const append = (key, chunk) => { record[key] = (record[key] + chunk.toString('utf8')).slice(-2 * 1024 * 1024); };
  child.stdout?.on('data', (chunk) => append('stdout', chunk));
  child.stderr?.on('data', (chunk) => append('stderr', chunk));
  child.once('error', (error) => { record.spawnError = error; });
  children.add(record);
  return record;
}

function childIsRunning(record) {
  return record.child.exitCode === null && record.child.signalCode === null && !record.spawnError;
}

function childFailure(record) {
  return `${record.label} exited (${record.child.signalCode || (record.child.exitCode ?? 'unknown')})\n`
    + `${record.stderr.trim()}\n${record.stdout.trim()}`.trim();
}

async function stopChild(record) {
  if (!record || !childIsRunning(record)) return;
  const signalGroup = (signal) => {
    try {
      if (process.platform === 'win32') record.child.kill(signal);
      else process.kill(-record.child.pid, signal);
    } catch (error) {
      if (error.code !== 'ESRCH') {
        try { record.child.kill(signal); } catch {}
      }
    }
  };
  signalGroup('SIGTERM');
  await Promise.race([record.exit, sleep(CHILD_EXIT_TIMEOUT_MS)]);
  if (childIsRunning(record)) {
    signalGroup('SIGKILL');
    await Promise.race([record.exit, sleep(1000)]);
  }
}

async function reservePort() {
  const socket = createNetServer();
  socket.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    socket.once('listening', resolve);
    socket.once('error', reject);
  });
  const { port } = socket.address();
  await new Promise((resolve, reject) => socket.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function waitForHealth(port, predicate, description, timeoutMs = HEALTH_TIMEOUT_MS) {
  const endpoint = `http://127.0.0.1:${port}/health`;
  const deadline = Date.now() + timeoutMs;
  let lastHealth = null;
  let lastError = null;
  while (Date.now() < deadline) {
    checkInterrupted();
    const server = [...children].find((record) => record.label === 'server');
    if (server && !childIsRunning(server)) throw new Error(childFailure(server));
    try {
      const response = await fetch(endpoint, { cache: 'no-store', signal: AbortSignal.timeout(1500) });
      if (!response.ok) throw new Error(`health returned HTTP ${response.status}`);
      lastHealth = await response.json();
      if (predicate(lastHealth)) return lastHealth;
    } catch (error) {
      lastError = error;
    }
    await sleep(100);
  }
  throw new Error(`Timed out waiting for ${description}; last health=${JSON.stringify(lastHealth)}; error=${lastError?.message || 'none'}`);
}

function makeReviewMap(id, name, terrainBase, terrainSeed) {
  return {
    id,
    name,
    summary: '64 × 64 · Fog-safe environment state capture',
    width: 64,
    height: 64,
    terrainSeed,
    terrainBase,
    fogOfWar: true,
    startingArmySize: 8,
    startingResources: { food: 1000, wood: 1000 },
    spawnPoints: [
      { team: 0, x: -2.2, z: 0 },
      { team: 1, x: 2.2, z: 0 },
    ],
    obstacles: [],
    resourceNodes: TEAMS.flatMap((teamId, team) => [
      { id: `oak-${teamId}`, type: 'wood', x: team === 0 ? -6 : 6, z: -2, stock: 100 },
      { id: `berries-${teamId}`, type: 'food', x: team === 0 ? -6 : 6, z: 2, stock: 100 },
    ]),
    triggers: [],
    scenarioEvents: [],
  };
}

async function writeReviewMaps(directory) {
  await mkdir(directory, { recursive: true });
  const maps = [
    makeReviewMap('renderer-env-meadow', 'Environment State Meadow', 'meadow', 881),
    makeReviewMap('renderer-env-cinder', 'Environment State Cinder', 'cinder', 517),
  ];
  for (const map of maps) {
    await writeFile(path.join(directory, `${map.id}.json`), `${JSON.stringify(map, null, 2)}\n`, {
      encoding: 'utf8', flag: 'wx', mode: 0o600,
    });
  }
  return maps;
}

function decodeImageDimensions(imagePath) {
  const source = 'from PIL import Image; import json,sys; image=Image.open(sys.argv[1]); image.load(); '
    + 'print(json.dumps({"width": image.width, "height": image.height, "format": image.format}))';
  const result = spawnSync(process.env.PYTHON || 'python3', ['-c', source, imagePath], { encoding: 'utf8' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Could not decode ${imagePath}: ${result.stderr.trim()}`);
  return JSON.parse(result.stdout);
}

async function verifyEnvironmentPack() {
  const manifest = JSON.parse(await readFile(ENVIRONMENT_MANIFEST_PATH, 'utf8'));
  assert.equal(manifest.schemaVersion, 1, 'environment pack must use schema version 1');
  assert.equal(manifest.packId, 'environment.frontier-interactive', 'unexpected environment pack ID');
  const runtimeEntries = (manifest.files || []).filter((entry) => entry.role === 'runtime-image');
  assert.equal(runtimeEntries.length, REQUIRED_RUNTIME_FILES.length,
    'environment manifest must list exactly ten runtime images');
  const byPath = new Map(runtimeEntries.map((entry) => [entry.path, entry]));
  assert.equal(byPath.size, REQUIRED_RUNTIME_FILES.length, 'environment runtime image paths must be unique');
  assert.deepEqual([...byPath.keys()].sort(), [...REQUIRED_RUNTIME_FILES].sort(),
    'environment manifest runtime paths must match the ten required state textures');
  const verified = [];
  for (const relativePath of REQUIRED_RUNTIME_FILES) {
    const entry = byPath.get(relativePath);
    assert.ok(entry && /^[a-f0-9]{64}$/i.test(entry.sha256 || ''), `${relativePath} must have a SHA-256`);
    const imagePath = path.resolve(ENVIRONMENT_PACK_ROOT, relativePath);
    assert.ok(imagePath.startsWith(`${ENVIRONMENT_PACK_ROOT}${path.sep}`), `${relativePath} escapes the pack root`);
    const bytes = await readFile(imagePath);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    assert.equal(sha256, entry.sha256.toLowerCase(), `${relativePath} must match its manifest SHA-256`);
    const dimensions = decodeImageDimensions(imagePath);
    assert.equal(dimensions.format, 'WEBP', `${relativePath} must decode as WebP`);
    assert.deepEqual(
      { width: dimensions.width, height: dimensions.height }, entry.dimensionsPx,
      `${relativePath} decoded dimensions must match the manifest`,
    );
    verified.push({ path: relativePath, sha256, dimensionsPx: dimensions });
  }
  return { manifest, verified };
}

async function findChromeExecutable() {
  const configured = process.env.CHROME_PATH || process.env.CHROME_BIN;
  const candidates = configured ? [configured] : process.platform === 'darwin'
    ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium']
    : process.platform === 'win32'
      ? [
        path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe'),
        path.join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Google', 'Chrome', 'Application', 'chrome.exe'),
      ]
      : ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/snap/bin/chromium'];
  for (const candidate of candidates) {
    try { await stat(candidate); return candidate; } catch {}
  }
  throw new Error(`Chrome was not found. Set CHROME_PATH to an installed Chrome/Chromium executable. Tried: ${candidates.join(', ')}`);
}

class CdpConnection {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
    this.open = new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true });
      this.socket.addEventListener('error', () => reject(new Error('Chrome DevTools WebSocket connection failed')), { once: true });
    });
    this.socket.addEventListener('message', (event) => this.receive(event.data));
    this.socket.addEventListener('close', () => {
      for (const { reject } of this.pending.values()) reject(new Error('Chrome DevTools connection closed'));
      this.pending.clear();
    });
  }

  receive(raw) {
    const message = JSON.parse(typeof raw === 'string' ? raw : Buffer.from(raw).toString('utf8'));
    if (message.id !== undefined) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      clearTimeout(pending.timeout);
      if (message.error) pending.reject(new Error(`CDP ${pending.method}: ${message.error.message}`));
      else pending.resolve(message.result || {});
      return;
    }
    for (const listener of this.listeners.get(message.method) || []) listener(message.params || {});
  }

  on(method, listener) {
    const listeners = this.listeners.get(method) || new Set();
    listeners.add(listener);
    this.listeners.set(method, listeners);
  }

  async call(method, params = {}, timeoutMs = 10_000) {
    await this.open;
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Timed out waiting for CDP ${method}`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timeout, method });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression, timeoutMs = 10_000) {
    const result = await this.call('Runtime.evaluate', {
      expression, awaitPromise: true, returnByValue: true, timeout: timeoutMs,
    }, timeoutMs + 1000);
    if (result.exceptionDetails) {
      throw new Error(`Browser evaluation failed: ${result.exceptionDetails.text || result.exceptionDetails.exception?.description}`);
    }
    return result.result?.value;
  }

  close() {
    if (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING) {
      try { this.socket.close(); } catch {}
    }
  }
}

async function waitForDevTools(profileDirectory, chromeRecord, timeoutMs = PAGE_TIMEOUT_MS) {
  const endpointFile = path.join(profileDirectory, 'DevToolsActivePort');
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    checkInterrupted();
    if (!childIsRunning(chromeRecord)) throw new Error(childFailure(chromeRecord));
    try {
      const [portLine, browserPath] = (await readFile(endpointFile, 'utf8')).trim().split(/\r?\n/);
      const port = Number(portLine);
      if (port > 0 && browserPath) return { port, browserPath };
    } catch {}
    await sleep(100);
  }
  throw new Error(`Chrome did not create DevToolsActivePort: ${chromeRecord.stderr.trim()}`);
}

async function waitForPageTarget(debugPort, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    checkInterrupted();
    try {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`, { signal: AbortSignal.timeout(1000) });
      const targets = await response.json();
      const page = targets.find((target) => target.type === 'page' && target.webSocketDebuggerUrl);
      if (page) return page;
    } catch {}
    await sleep(100);
  }
  throw new Error('Could not find a Chrome page target');
}

async function createBrowser(teamLabel, profileDirectory, executable, gameUrl) {
  await mkdir(profileDirectory, { recursive: true });
  const chromeArgs = [
    '--headless=new', '--no-first-run', '--no-default-browser-check',
    '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding', '--enable-precise-memory-info',
    '--window-size=1280,720', '--force-device-scale-factor=2',
    '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0',
    '--remote-allow-origins=*', `--user-data-dir=${profileDirectory}`, 'about:blank',
  ];
  const chrome = startChild(`Chrome ${teamLabel}`, executable, chromeArgs);
  const { port, browserPath } = await waitForDevTools(profileDirectory, chrome);
  const browserCdp = new CdpConnection(`ws://127.0.0.1:${port}${browserPath}`);
  await browserCdp.open;
  const target = await waitForPageTarget(port);
  const cdp = new CdpConnection(target.webSocketDebuggerUrl);
  await cdp.open;
  await cdp.call('Runtime.enable');
  await cdp.call('Page.enable');
  await cdp.call('Network.enable');
  await cdp.call('Emulation.setDeviceMetricsOverride', {
    width: VIEWPORT_WIDTH,
    height: VIEWPORT_HEIGHT,
    deviceScaleFactor: DEVICE_PIXEL_RATIO,
    mobile: false,
  });
  const browser = {
    teamLabel, team: null, currentZoom: INITIAL_ZOOM, chrome, browserCdp, cdp,
    latestState: null, lastFrameError: null,
  };
  cdp.on('Network.webSocketFrameReceived', (event) => {
    if (event.response?.opcode !== 1 || typeof event.response.payloadData !== 'string') return;
    try {
      const message = JSON.parse(event.response.payloadData);
      if (message.type === 'welcome' && Number.isInteger(message.player?.team)) browser.team = message.player.team;
      const state = message.type === 'welcome' || message.type === 'mapChange' ? message.state
        : message.type === 'state' ? message : null;
      if (state?.type === 'state') browser.latestState = state;
    } catch (error) {
      browser.lastFrameError = error.message;
    }
  });
  await cdp.call('Page.navigate', { url: gameUrl });
  await waitForBrowserReady(browser);
  return browser;
}

async function waitForBrowserReady(browser, timeoutMs = PAGE_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  let lastPage = null;
  while (Date.now() < deadline) {
    checkInterrupted();
    if (!childIsRunning(browser.chrome)) throw new Error(childFailure(browser.chrome));
    try {
      lastPage = await browser.cdp.evaluate(`(() => ({
        boot: document.documentElement?.dataset.boot || null,
        team: document.querySelector('#player-team')?.textContent?.trim().toUpperCase() || null,
        canvas: Boolean(document.querySelector('#viewport canvas')),
        minimap: Boolean(document.querySelector('#minimap-canvas')),
        mapOptions: [...(document.querySelector('#map-select')?.options || [])].map((option) => option.value),
      }))()`);
      if (lastPage.boot === 'ready' && lastPage.canvas && lastPage.minimap && browser.team !== null) {
        const expectedTeam = browser.team === 0 ? 'AZURE' : 'EMBER';
        assert.equal(lastPage.team, expectedTeam, `${browser.teamLabel} browser should own the expected player seat`);
        return lastPage;
      }
    } catch {}
    await sleep(100);
  }
  throw new Error(`Browser did not become ready as ${browser.teamLabel}: ${JSON.stringify(lastPage)}`);
}

async function waitForSnapshot(browser, predicate, description, timeoutMs = STATE_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    checkInterrupted();
    if (!childIsRunning(browser.chrome)) throw new Error(childFailure(browser.chrome));
    const state = browser.latestState;
    if (state && predicate(state)) return state;
    await sleep(100);
  }
  throw new Error(`Timed out waiting for ${description}; latest state=${JSON.stringify(browser.latestState && {
    mapId: browser.latestState.mapId,
    units: browser.latestState.units?.length,
    team: browser.team,
    fogOfWar: browser.latestState.fogOfWar,
  })}; frame error=${browser.lastFrameError || 'none'}`);
}

function visibilityCode(state, x, z) {
  const visibility = state.visibility;
  if (!visibility || visibility.columns !== 64 || visibility.rows !== 64 || typeof visibility.data !== 'string') return null;
  const column = Math.floor(x + visibility.columns / 2);
  const row = Math.floor(z + visibility.rows / 2);
  if (column < 0 || column >= visibility.columns || row < 0 || row >= visibility.rows) return null;
  const packed = Buffer.from(visibility.data, 'base64');
  const cell = row * visibility.columns + column;
  if (packed.length !== Math.ceil(visibility.columns * visibility.rows / 4)) return null;
  return (packed[cell >> 2] >> ((cell & 3) * 2)) & 3;
}

function resourceNodeId(family, team) {
  return `${family.id}-${TEAMS[team]}`;
}

function stockIsSample(stock, sample) {
  if (sample === 100) return stock >= 67 && stock <= 100;
  if (sample === 50) return stock >= 45 && stock <= 55;
  if (sample === 20) return stock >= 15 && stock <= 25;
  return sample === 0 && stock === 0;
}

function validateResourceSnapshot(state, browser, map, family, stage, sample) {
  assert.equal(state.mapId, map.id, `${browser.teamLabel} should be on ${map.id}`);
  assert.equal(state.fogOfWar, true, `${browser.teamLabel} must receive a fog-filtered snapshot`);
  assert.ok(state.visibility, `${browser.teamLabel} must receive its own visibility mask`);
  const nodeId = resourceNodeId(family, browser.team);
  const definitionNode = map.resourceNodes.find((node) => node.id === nodeId);
  const row = state.resourceNodes?.find((node) => node.id === nodeId);
  assert.ok(definitionNode && row,
    `${browser.teamLabel} snapshot must include visible resource row ${nodeId}`);
  assert.equal(definitionNode.stock, 100, 'review maps use startingStock=100 for every resource state');
  assert.equal(resourceVisualStage(row.stock, definitionNode.stock), stage.id,
    `${nodeId} snapshot stock ${row.stock} should map to ${stage.id}`);
  assert.ok(stockIsSample(row.stock, sample),
    `${nodeId} should be captured near the ${sample}/100 stock sample; saw ${row.stock}`);
  assert.equal(visibilityCode(state, definitionNode.x, definitionNode.z), 2,
    `${browser.teamLabel} must have current sight on resource row ${nodeId}`);
  const workerId = browser.team * 4 + family.workerSlot;
  const worker = state.units?.find((unit) => unit[0] === workerId && unit[1] === browser.team
    && unit[4] > 0 && unit[5] === 'worker');
  assert.ok(worker, `${browser.teamLabel} snapshot must include worker ${workerId}`);
  assert.equal(visibilityCode(state, worker[2], worker[3]), 2,
    `${browser.teamLabel} must have current sight on worker ${workerId}`);
  const distance = Math.hypot(worker[2] - definitionNode.x, worker[3] - definitionNode.z);
  if (stage.id !== 'depleted') {
    assert.ok(distance <= 6, `worker ${workerId} should be near ${nodeId} during a non-depleted sample`);
    if (stage.id !== 'full') assert.ok(['gathering', 'returning'].includes(worker[9]),
      `worker ${workerId} should show an actual gather interaction; saw ${worker[9]}`);
  }
  return {
    viewer: browser.teamLabel, team: browser.team, nodeId, stock: row.stock,
    startingStock: definitionNode.stock, stage: stage.id, workerId,
    workerTask: worker[9] || 'idle', workerDistance: Number(distance.toFixed(2)),
    nodeVisibility: visibilityCode(state, definitionNode.x, definitionNode.z),
  };
}

async function waitForRuntimeAssets(browser, verifiedPack) {
  const deadline = Date.now() + PAGE_TIMEOUT_MS;
  let status = null;
  while (Date.now() < deadline) {
    checkInterrupted();
    status = await browser.cdp.evaluate('window.__rtsEnvironmentAssetStatus || null');
    if (status?.state === 'unavailable' || status?.state === 'load-failed') {
      throw new Error(`Environment art pack is not capture-ready: ${status.reason}`);
    }
    if (status?.ready === true) break;
    await sleep(100);
  }
  assert.ok(status?.ready === true, `${browser.teamLabel} did not load the exact environment state pack`);
  assert.equal(status.packId, verifiedPack.manifest.packId);
  assert.equal(status.packVersion, verifiedPack.manifest.packVersion);
  assert.deepEqual(status.loadedFiles.map((file) => file.path).sort(), [...REQUIRED_RUNTIME_FILES].sort(),
    `${browser.teamLabel} must fetch and decode all ten manifest-listed runtime textures`);
  const expectedByPath = new Map(verifiedPack.verified.map((file) => [file.path, file]));
  for (const file of status.loadedFiles) {
    const expected = expectedByPath.get(file.path);
    assert.ok(expected, `unexpected browser-loaded runtime file ${file.path}`);
    assert.equal(file.sha256, expected.sha256, `${file.path} browser digest must match the manifest`);
    assert.deepEqual(file.dimensionsPx, {
      width: expected.dimensionsPx.width, height: expected.dimensionsPx.height,
    }, `${file.path} browser-decoded dimensions must match the manifest`);
  }
  return status;
}

async function captureHook(browser) {
  return browser.cdp.evaluate('window.__rtsEnvironmentStateSnapshot || null');
}

async function sendCaptureCommand(browser, command) {
  const result = await browser.cdp.evaluate(`window.__rtsEnvironmentCaptureCommand?.(${JSON.stringify(command)}) ?? false`);
  assert.equal(result, true, `${browser.teamLabel} should send ${command.type} through its live game socket`);
}

async function selectMap(host, mapId) {
  const expression = `(() => {
    const select = document.querySelector('#map-select');
    if (!select || ![...select.options].some((option) => option.value === ${JSON.stringify(mapId)})) {
      throw new Error('review map is missing from the host map selector');
    }
    select.value = ${JSON.stringify(mapId)};
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return select.value;
  })()`;
  assert.equal(await host.cdp.evaluate(expression), mapId, 'host should select the requested review map');
}

async function setZoom(browser, targetZoom) {
  const current = browser.currentZoom;
  if (Math.abs(current - targetZoom) < 0.0005) return;
  const rect = await browser.cdp.evaluate(`(() => {
    const canvas = document.querySelector('#viewport canvas');
    if (!canvas) return null;
    const bounds = canvas.getBoundingClientRect();
    return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
  })()`);
  assert.ok(rect && rect.width > 0 && rect.height > 0, 'battlefield canvas should have a visible rectangle');
  const deltaY = -Math.log(targetZoom / current) / ZOOM_WHEEL_SCALE;
  await browser.cdp.call('Input.dispatchMouseEvent', {
    type: 'mouseWheel',
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2,
    deltaX: 0,
    deltaY,
  });
  browser.currentZoom = targetZoom;
  await sleep(ZOOM_SETTLE_MS);
}

async function writeFrame(browser, runDirectory, frameIndex, mapLabel, stateId, zoom, evidence) {
  const viewerLabel = TEAMS[browser.team];
  const frameLabel = `${mapLabel}-${stateId}-${viewerLabel}-zoom-${zoom.label}`;
  const relativePath = `frames/${String(frameIndex + 1).padStart(2, '0')}-${frameLabel}.png`;
  const destination = path.join(runDirectory, relativePath);
  await mkdir(path.dirname(destination), { recursive: true });
  const composition = await browser.cdp.evaluate(`(() => {
    const team = document.querySelector('#player-team');
    const minimap = document.querySelector('#minimap-canvas');
    const title = document.querySelector('#map-label-title');
    const bounds = (element) => {
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height,
        visible: style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0 };
    };
    return {
      width: window.innerWidth,
      height: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio,
      team: team?.textContent?.trim().toUpperCase() || null,
      teamBounds: bounds(team),
      minimapBounds: bounds(minimap),
      mapTitle: title?.textContent?.trim() || null,
    };
  })()`);
  assert.equal(composition.width, VIEWPORT_WIDTH, `review viewport width should be ${VIEWPORT_WIDTH}`);
  assert.equal(composition.height, VIEWPORT_HEIGHT, `review viewport height should be ${VIEWPORT_HEIGHT}`);
  assert.equal(composition.devicePixelRatio, DEVICE_PIXEL_RATIO,
    `review viewport device pixel ratio should be ${DEVICE_PIXEL_RATIO}`);
  assert.equal(composition.team, browser.team === 0 ? 'AZURE' : 'EMBER',
    `full review image should identify its ${browser.teamLabel} player view`);
  assert.ok(composition.teamBounds?.visible, `team HUD label should be visible for ${frameLabel}`);
  assert.ok(composition.minimapBounds?.visible, `minimap should be visible for ${frameLabel}`);
  assert.ok(composition.mapTitle, `map title should be visible for ${frameLabel}`);
  const screenshot = await browser.cdp.call('Page.captureScreenshot', {
    format: 'png', fromSurface: true, captureBeyondViewport: false,
  });
  const pngBytes = Buffer.from(screenshot.data, 'base64');
  assert.equal(pngBytes.toString('hex', 0, 8), '89504e470d0a1a0a',
    `screenshot should be a PNG for ${frameLabel}`);
  assert.equal(pngBytes.toString('ascii', 12, 16), 'IHDR',
    `screenshot should include a PNG IHDR chunk for ${frameLabel}`);
  const pngPixelDimensions = {
    width: pngBytes.readUInt32BE(16),
    height: pngBytes.readUInt32BE(20),
  };
  assert.deepEqual(pngPixelDimensions, { width: PNG_PIXEL_WIDTH, height: PNG_PIXEL_HEIGHT },
    `screenshot should be ${PNG_PIXEL_WIDTH}x${PNG_PIXEL_HEIGHT} pixels for ${frameLabel}`);
  await writeFile(destination, pngBytes);
  capturedFrameKeys.push(`${mapLabel}:${stateId}:${zoom.value}`);
  capturedFrameEvidence.push({
    index: frameIndex, mapLabel, stateId, zoom: zoom.value, viewer: viewerLabel,
    viewport: {
      cssWidth: composition.width, cssHeight: composition.height,
      devicePixelRatio: composition.devicePixelRatio, pngPixelDimensions,
    },
    evidence,
  });
  return {
    index: frameIndex,
    label: frameLabel,
    attachments: [{
      kind: 'color', path: relativePath, encoding: 'png',
      description: `${mapLabel} ${stateId} 1280x720 CSS viewport at DPR 2 (2560x1440 PNG) from the ${viewerLabel} fog-filtered client at zoom ${zoom.value}; HUD and minimap are included.`,
    }],
  };
}

async function writeCaptureManifest(frames, renderer, runDirectory, { pilotPlan = null, qaEvidence = null } = {}) {
  const isPilot = pilotPlan !== null;
  if (!isPilot) {
    assert.ok(qaEvidence?.complete === true && qaEvidence.frameCount === EXPECTED_FRAME_COUNT,
      'full-matrix capture manifest requires its 40-file QA evidence handoff');
  }
  const manifest = {
    schema: 'game_dev.capture.v1',
    runId: GAME_DEV_RUN_ID,
    adapterId: GAME_DEV_ADAPTER_ID,
    scenarioId: GAME_DEV_SCENARIO_ID,
    sourceFormat: 'game-dev-capture-v1',
    frames,
    measurements: [],
    adapterEvidence: {
      windowless: true,
      graphicsApi: renderer.webglVersion === 2 ? 'WebGL2' : 'WebGL1',
      hardwarePerformanceReported: false,
      gpuExecutionReported: false,
      gpuCompletionIdentityReported: false,
      pixelVisualInspectionPerformed: false,
      notes: isPilot ? [
        'Four-frame environment pilot preview only; it does not satisfy final 40-frame evidence requirements.',
        'No performance measurements were collected.',
        'Every image was captured from an in-game client with a server-provided fog visibility mask.',
        'All ten runtime images were fetched, SHA-256 checked, decoded, and dimension-matched before capture.',
        'Resource stock changed through normal gathering from startingStock 100.',
        'The pilot includes active wood and food gathering frames.',
        'Human review is required to assess authored art appearance.',
      ] : [
        'Environment appearance capture; no performance measurements were collected.',
        'Every image state was captured from an in-game client with a server-provided fog visibility mask.',
        'All ten runtime images were fetched, SHA-256 checked, decoded, and dimension-matched before capture.',
        'Resource stock changed through normal gathering from startingStock 100.',
        'Construction clear was asserted to have no decal or instance and has no screenshot frame.',
        `All 40 full-matrix PNGs were copied to ${qaEvidence?.directory || 'the documented QA evidence directory'}.`,
        'Human review is required to assess authored art appearance.',
      ],
      environmentStateCoverage: isPilot ? {
        mode: 'pilot-preview',
        acceptanceStatus: 'preview-only',
        satisfiesFinalEvidenceRequirement: false,
        tuples: pilotPlan,
      } : {
        mode: 'full-matrix',
        acceptanceStatus: 'awaiting-human-art-review',
        resourceFamilies: RESOURCE_FAMILIES.map(({ id }) => id),
        stockSamples: [100, 50, 20, 0],
        constructionImages: ['earthwork', 'foundation'],
        constructionClearImage: null,
        constructionClearAssertedWithoutScreenshot: true,
        qaEvidence,
      },
      screenshotViewport: {
        cssWidth: VIEWPORT_WIDTH,
        cssHeight: VIEWPORT_HEIGHT,
        devicePixelRatio: DEVICE_PIXEL_RATIO,
        pngPixelWidth: PNG_PIXEL_WIDTH,
        pngPixelHeight: PNG_PIXEL_HEIGHT,
      },
      environmentFrameEvidence: capturedFrameEvidence,
    },
  };
  await writeFile(path.join(runDirectory, 'capture.json'), JSON.stringify(manifest, null, 2));
  return manifest;
}

async function waitForMapState(browser, map, predicate, description) {
  return waitForSnapshot(browser, (state) => state.mapId === map.id
    && state.fogOfWar === true && typeof state.visibility?.data === 'string'
    && Array.isArray(state.units) && predicate(state), description);
}

function resourceSampleReady(state, map, family, stage, sample, team) {
  const nodeId = resourceNodeId(family, team);
  const definitionNode = map.resourceNodes.find((node) => node.id === nodeId);
  const row = state.resourceNodes?.find((node) => node.id === nodeId);
  if (!definitionNode || !row || visibilityCode(state, definitionNode.x, definitionNode.z) !== 2) return false;
  if (resourceVisualStage(row.stock, definitionNode.stock) !== stage.id || !stockIsSample(row.stock, sample)) return false;
  if (stage.id === 'depleted' || stage.id === 'full') {
    const workerId = team * 4 + family.workerSlot;
    const worker = state.units?.find((unit) => unit[0] === workerId && unit[1] === team && unit[5] === 'worker');
    return Boolean(worker && visibilityCode(state, worker[2], worker[3]) === 2
      && Math.hypot(worker[2] - definitionNode.x, worker[3] - definitionNode.z) <= 6);
  }
  const workerId = team * 4 + family.workerSlot;
  const worker = state.units?.find((unit) => unit[0] === workerId && unit[1] === team && unit[5] === 'worker');
  if (!worker || !['gathering', 'returning'].includes(worker[9])) return false;
  return Math.hypot(worker[2] - definitionNode.x, worker[3] - definitionNode.z) <= 6;
}

async function validateCaptureHook(browser, map, expected) {
  const hook = await captureHook(browser);
  assert.ok(hook, `${browser.teamLabel} app should expose capture-only environment diagnostics`);
  assert.equal(hook.mapId, map.id);
  assert.equal(hook.team, browser.team);
  assert.equal(hook.fogOfWar, true);
  if (expected.family && expected.stage) {
    const nodeId = resourceNodeId(expected.family, browser.team);
    const row = hook.resourceNodes?.find((node) => node.id === nodeId);
    assert.ok(row, `capture-only app snapshot must include visible row ${nodeId}`);
    assert.equal(row.stage, expected.stage.id);
    assert.equal(visibilityCode({ visibility: hook.visibility }, row.x, row.z), 2,
      `capture-only app snapshot must mark ${nodeId} visible under fog`);
  }
  return hook;
}

async function captureResourceState({ map, family, stage, sample, browsers, frames, runDirectory, evidence, zooms = ZOOMS }) {
  const states = await Promise.all(browsers.map((browser) => waitForMapState(
    browser, map,
    (state) => resourceSampleReady(state, map, family, stage, sample, browser.team),
    `${browser.teamLabel} visible ${family.id}-${stage.id} resource sample on ${map.id}`,
  )));
  const validated = states.map((state, index) => validateResourceSnapshot(
    state, browsers[index], map, family, stage, sample,
  ));
  for (const zoom of zooms) {
    checkInterrupted();
    await Promise.all(browsers.map((browser) => setZoom(browser, zoom.value)));
    const currentStates = await Promise.all(browsers.map((browser) => waitForMapState(
      browser, map,
      (state) => resourceSampleReady(state, map, family, stage, sample, browser.team),
      `${browser.teamLabel} visible ${family.id}-${stage.id} sample at zoom ${zoom.value}`,
    )));
    const frameEvidence = currentStates.map((state, index) => validateResourceSnapshot(
      state, browsers[index], map, family, stage, sample,
    ));
    await Promise.all(browsers.map((browser) => validateCaptureHook(browser, map, {
      family, stage,
    })));
    frames.push(await writeFrame(browsers[0], runDirectory, frames.length,
      map.terrainBase, `${family.id}-${stage.id}`, zoom, {
        targetStockSample: sample,
        observedClients: frameEvidence,
        bothTeamViewsVerified: true,
      }));
  }
  evidence.push(...validated);
}

async function captureConstructionState({ map, stage, browsers, frames, runDirectory, evidence }) {
  const host = browsers[0];
  const buildingId = await waitForSnapshot(host, (state) => state.mapId === map.id
    && state.fogOfWar === true
    && state.buildings?.some((building) => building.team === host.team
      && constructionGroundStage(building.progress, building.complete) === stage.groundStage
      && visibilityCode(state, building.x, building.z) === 2),
  `${stage.id} building row visible under fog on ${map.id}`)
    .then((state) => state.buildings.find((building) => building.team === host.team
      && constructionGroundStage(building.progress, building.complete) === stage.groundStage));
  assert.ok(buildingId, `${stage.id} must have a visible server building row`);
  const building = await waitForSnapshot(host, (state) => state.mapId === map.id
    && state.buildings?.some((row) => row.id === buildingId.id
      && constructionGroundStage(row.progress, row.complete) === stage.groundStage
      && visibilityCode(state, row.x, row.z) === 2),
  `${stage.id} building remains in the visible ${map.id} snapshot`)
    .then((state) => state.buildings.find((row) => row.id === buildingId.id));
  for (const zoom of ZOOMS) {
    checkInterrupted();
    await Promise.all(browsers.map((browser) => setZoom(browser, zoom.value)));
    const state = await waitForSnapshot(host, (snapshot) => snapshot.mapId === map.id
      && snapshot.fogOfWar === true
      && snapshot.buildings?.some((row) => row.id === building.id
        && constructionGroundStage(row.progress, row.complete) === stage.groundStage
        && visibilityCode(snapshot, row.x, row.z) === 2),
    `${stage.id} visible building at zoom ${zoom.value} on ${map.id}`);
    const currentBuilding = state.buildings.find((row) => row.id === building.id);
    const hook = await validateCaptureHook(host, map, {});
    const hookBuilding = hook.buildings?.find((row) => row.id === currentBuilding.id);
    assert.ok(hookBuilding, `${stage.id} should be reflected in the renderer capture snapshot`);
    assert.equal(hookBuilding.groundStage, stage.groundStage);
    const draw = hook.constructionDraws?.find((row) => row.stage === stage.groundStage);
    assert.ok(draw?.visible && draw.count > 0 && draw.buildingIds.includes(currentBuilding.id),
      `${stage.id} should render a ground instance under its visible building footprint`);
    const sample = {
      buildingId: currentBuilding.id, team: currentBuilding.team,
      progress: currentBuilding.progress, groundStage: hookBuilding.groundStage,
      groundInstanceCount: draw.count,
      buildingVisibility: visibilityCode(state, currentBuilding.x, currentBuilding.z),
    };
    evidence.push(sample);
    frames.push(await writeFrame(host, runDirectory, frames.length, map.terrainBase,
      stage.id, zoom, sample));
  }
}

async function assertConstructionClearWithoutImage(map, host) {
  const state = await waitForSnapshot(host, (snapshot) => snapshot.mapId === map.id
    && snapshot.buildings?.some((building) => building.team === host.team && building.complete === true
      && constructionGroundStage(building.progress, building.complete) === 'clear'),
  `completed building clear state on ${map.id}`);
  const clearBuilding = state.buildings.find((building) => building.team === host.team && building.complete === true);
  assert.equal(constructionGroundStage(clearBuilding.progress, clearBuilding.complete), 'clear');
  assert.equal(visibilityCode(state, clearBuilding.x, clearBuilding.z), 2,
    'completed building footprint must remain visible under fog for the clear-state assertion');
  const hook = await captureHook(host);
  const hookBuilding = hook?.buildings?.find((building) => building.id === clearBuilding.id);
  assert.ok(hookBuilding && hookBuilding.groundStage === 'clear',
    'completed building must be clear in the renderer state snapshot');
  const drawnIds = (hook.constructionDraws || []).flatMap((draw) => draw.buildingIds || []);
  assert.ok(!drawnIds.includes(clearBuilding.id),
    'completed building footprint must have no construction decal or instance');
  assert.ok((hook.constructionDraws || []).every((draw) => draw.count === 0 && draw.visible === false),
    'the completed-only review map must have no construction ground instances');
  return { buildingId: clearBuilding.id, groundStage: 'clear', image: null, screenshotFrames: 0, decalInstances: 0 };
}

async function captureEnvironmentMap({ map, browsers, frames, runDirectory, verifiedPack, evidence }) {
  await selectMap(browsers[0], map.id);
  await Promise.all(browsers.map((browser) => waitForSnapshot(browser, (state) => (
    state.mapId === map.id && state.fogOfWar === true
      && state.units?.filter((unit) => unit[1] === browser.team && unit[5] === 'worker').length === 4
      && RESOURCE_FAMILIES.every((family) => state.resourceNodes?.some((node) => (
        node.id === resourceNodeId(family, browser.team) && node.stock === 100
      )))
  ), `${browser.teamLabel} resource map snapshot on ${map.id}`)));
  await Promise.all(browsers.map((browser) => waitForRuntimeAssets(browser, verifiedPack)));

  for (const family of RESOURCE_FAMILIES) {
    await captureResourceState({ map, family, stage: STOCK_STAGES[0], sample: 100,
      browsers, frames, runDirectory, evidence });
  }

  for (const browser of browsers) {
    for (const family of RESOURCE_FAMILIES) {
      await sendCaptureCommand(browser, {
        type: 'gather', ids: [browser.team * 4 + family.workerSlot],
        nodeId: resourceNodeId(family, browser.team),
      });
    }
  }

  await sendCaptureCommand(browsers[0], {
    type: 'build', buildingType: 'barracks', ids: [2], x: -10, z: -6,
  });
  await captureConstructionState({ map, stage: CONSTRUCTION_STAGES[0],
    browsers, frames, runDirectory, evidence });
  await captureConstructionState({ map, stage: CONSTRUCTION_STAGES[1],
    browsers, frames, runDirectory, evidence });

  for (const [stageIndex, stage] of STOCK_STAGES.entries()) {
    if (stageIndex === 0) continue;
    const sample = [100, 50, 20, 0][stageIndex];
    for (const family of RESOURCE_FAMILIES) {
      await captureResourceState({ map, family, stage, sample,
        browsers, frames, runDirectory, evidence });
    }
  }
  const clearAssertion = await assertConstructionClearWithoutImage(map, browsers[0]);
  evidence.push({ mapId: map.id, constructionClear: clearAssertion });
  return clearAssertion;
}

async function captureEnvironmentPilot({ maps, browsers, frames, runDirectory, verifiedPack, evidence }) {
  const plan = buildPilotFramePlan(maps);
  let activeMapId = null;
  for (const frame of plan) {
    checkInterrupted();
    const map = maps.find((candidate) => candidate.id === frame.mapId);
    const family = RESOURCE_FAMILIES.find((candidate) => candidate.id === frame.resourceFamily);
    const stage = STOCK_STAGES.find((candidate) => candidate.id === frame.stage);
    const zoom = ZOOMS.find((candidate) => candidate.value === frame.zoom);
    assert.ok(map && family && stage && zoom, `pilot frame ${frame.index} should resolve before capture`);

    if (activeMapId !== map.id) {
      await selectMap(browsers[0], map.id);
      activeMapId = map.id;
    }
    await Promise.all(browsers.map((browser) => waitForSnapshot(browser, (state) => (
      state.mapId === map.id && state.fogOfWar === true
        && state.units?.filter((unit) => unit[1] === browser.team && unit[5] === 'worker').length === 4
        && state.resourceNodes?.some((node) => (
          node.id === resourceNodeId(family, browser.team) && node.stock === 100
        ))
    ), `${browser.teamLabel} initial ${family.id} stock on ${map.id}`)));
    await Promise.all(browsers.map((browser) => waitForRuntimeAssets(browser, verifiedPack)));

    await Promise.all(browsers.map((browser) => sendCaptureCommand(browser, {
      type: 'gather', ids: [browser.team * 4 + family.workerSlot],
      nodeId: resourceNodeId(family, browser.team),
    })));
    await captureResourceState({
      map, family, stage, sample: frame.targetStockSample, browsers, frames, runDirectory, evidence,
      zooms: [zoom],
    });
  }
  const expectedKeys = plan.map((frame) => `${frame.mapLabel}:${frame.resourceFamily}-${frame.stage}:${frame.zoom}`);
  assert.deepEqual([...capturedFrameKeys].slice(-plan.length).sort(), [...expectedKeys].sort(),
    'pilot screenshots should match the declared four-tuple plan');
  return plan;
}

function buildFramePlan(maps) {
  const frames = [];
  for (const map of maps) {
    for (const family of RESOURCE_FAMILIES) {
      for (const stage of STOCK_STAGES) {
        for (const zoom of ZOOMS) frames.push({
          mapId: map.id, mapLabel: map.terrainBase,
          stateId: `${family.id}-${stage.id}`, familyId: family.id, stageId: stage.id,
          zoom: zoom.value, zoomLabel: zoom.label,
        });
      }
    }
    for (const stage of CONSTRUCTION_STAGES) {
      for (const zoom of ZOOMS) frames.push({
        mapId: map.id, mapLabel: map.terrainBase,
        stateId: stage.id, stageId: stage.groundStage,
        zoom: zoom.value, zoomLabel: zoom.label,
      });
    }
  }
  return frames;
}

async function preserveFullMatrixEvidence({ maps, frames, runDirectory }) {
  assert.equal(frames.length, EXPECTED_FRAME_COUNT,
    'persistent QA evidence should only be copied after all 40 frames exist');
  const evidenceRows = capturedFrameEvidence.slice(-frames.length);
  assert.equal(evidenceRows.length, EXPECTED_FRAME_COUNT, 'all full-matrix frames need capture evidence');
  assert.equal(new Set(frames.map((frame) => frame.index)).size, EXPECTED_FRAME_COUNT,
    'full-matrix frame indexes must be unique');

  const expectedFrames = buildFramePlan(maps);
  const expectedDestinations = expectedFrames.map(({ mapLabel, stateId, zoom }) => (
    path.posix.join(mapLabel, `zoom-${zoom.toFixed(2)}`, `${stateId}.png`)
  ));
  const expectedKeys = new Set(expectedFrames.map((frame) => `${frame.mapLabel}:${frame.stateId}:${frame.zoom}`));
  const evidenceByIndex = new Map(evidenceRows.map((row) => [row.index, row]));
  const files = frames.map((frame) => {
    const evidence = evidenceByIndex.get(frame.index);
    assert.ok(evidence, `frame ${frame.index} must have its map, state, and zoom evidence`);
    const key = `${evidence.mapLabel}:${evidence.stateId}:${evidence.zoom}`;
    assert.ok(expectedKeys.has(key), `frame ${frame.index} is outside the full-matrix plan`);
    const attachment = frame.attachments?.find((item) => item.kind === 'color' && item.encoding === 'png');
    assert.ok(attachment, `frame ${frame.index} must include a PNG attachment`);
    const sourcePath = path.resolve(runDirectory, attachment.path);
    assert.ok(sourcePath.startsWith(`${runDirectory}${path.sep}`),
      `frame ${frame.index} attachment should stay inside the game-dev run directory`);
    return {
      key,
      sourcePath,
      relativePath: path.posix.join(
        evidence.mapLabel,
        `zoom-${evidence.zoom.toFixed(2)}`,
        `${evidence.stateId}.png`,
      ),
    };
  });
  const destinationNames = files.map((file) => file.relativePath);
  assert.equal(new Set(destinationNames).size, EXPECTED_FRAME_COUNT,
    'the 40 documented destination names must be unique');
  assert.deepEqual([...destinationNames].sort(), [...expectedDestinations].sort(),
    'destination files must cover every state, theme, and zoom in the full matrix');
  assert.equal(new Set(files.map((file) => file.key)).size, EXPECTED_FRAME_COUNT,
    'each full-matrix state/theme/zoom tuple must map to exactly one destination');

  await mkdir(QA_EVIDENCE_ROOT, { recursive: true });
  const destinationPaths = files.map((file) => path.join(QA_EVIDENCE_ROOT, ...file.relativePath.split('/')));
  const assertDestinationsAvailable = async () => {
    const occupied = [];
    for (const [index, destinationPath] of destinationPaths.entries()) {
      try {
        await stat(destinationPath);
        occupied.push(files[index].relativePath);
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }
    assert.deepEqual(occupied, [],
      `refusing to overwrite existing environment QA evidence: ${occupied.join(', ')}`);
  };
  await assertDestinationsAvailable();
  const stagingRoot = await mkdtemp(path.join(QA_EVIDENCE_ROOT, '.environment-state-pack-v1-pending-'));
  const publishedPaths = [];
  try {
    for (const file of files) {
      const stagedPath = path.join(stagingRoot, ...file.relativePath.split('/'));
      await mkdir(path.dirname(stagedPath), { recursive: true });
      const imageBytes = await readFile(file.sourcePath);
      file.sha256 = createHash('sha256').update(imageBytes).digest('hex');
      await writeFile(stagedPath, imageBytes);
    }
    await assertDestinationsAvailable();
    try {
      for (const [index, file] of files.entries()) {
        const destinationPath = destinationPaths[index];
        await mkdir(path.dirname(destinationPath), { recursive: true });
        await link(path.join(stagingRoot, ...file.relativePath.split('/')), destinationPath);
        publishedPaths.push(destinationPath);
      }
    } catch (error) {
      const rollbackErrors = [];
      for (const destinationPath of publishedPaths.reverse()) {
        try { await rm(destinationPath, { force: true }); } catch (rollbackError) { rollbackErrors.push(rollbackError); }
      }
      if (rollbackErrors.length > 0) {
        throw new AggregateError([error, ...rollbackErrors],
          'environment QA evidence publish failed and could not fully roll back');
      }
      throw error;
    }
  } finally {
    await rm(stagingRoot, { recursive: true, force: true });
  }

  return {
    complete: true,
    directory: 'docs/qa-evidence/environment-state-pack-v1',
    runId: GAME_DEV_RUN_ID,
    frameCount: files.length,
    files: files.map(({ relativePath, sha256 }) => ({ path: relativePath, sha256 })),
  };
}

function buildPilotFramePlan(maps) {
  const frames = PILOT_FRAME_SPECS.map((spec, index) => {
    const map = maps.find((candidate) => candidate.id === spec.mapId);
    const family = RESOURCE_FAMILIES.find((candidate) => candidate.id === spec.familyId);
    const stage = STOCK_STAGES.find((candidate) => candidate.id === spec.stageId);
    const zoom = ZOOMS.find((candidate) => candidate.value === spec.zoom);
    assert.ok(map && family && stage && zoom, `pilot tuple ${index + 1} must resolve to a map, resource, stage, and zoom`);
    assert.equal(resourceVisualStage(spec.sample, 100), stage.id,
      `pilot tuple ${index + 1} sample should map to ${stage.id}`);
    const stateId = `${family.id}-${stage.id}`;
    const frameLabel = `${map.terrainBase}-${stateId}-azure-zoom-${zoom.label}`;
    return {
      index: index + 1,
      mapId: map.id,
      mapName: map.terrainBase === 'meadow' ? 'Meadow' : 'Cinder',
      mapLabel: map.terrainBase,
      zoom: zoom.value,
      zoomLabel: zoom.label,
      resourceFamily: family.id,
      resourceType: family.nodeType,
      stage: stage.id,
      targetStockSample: spec.sample,
      stockSampleTolerance: spec.sample === 0 ? 0 : 5,
      stockScope: 'per-team-resource-node',
      gatherOrder: {
        type: 'gather',
        teamClients: ['azure', 'ember'],
        workerSlotsPerTeam: [family.workerSlot],
        workerIds: [family.workerSlot, 4 + family.workerSlot],
      },
      verifiedTeamViews: ['azure', 'ember'],
      screenshotViewer: 'azure',
      workerInteraction: stage.id === 'depleted'
        ? 'worker-visible-near-node-after-depletion'
        : 'active-gathering-or-returning',
      fogOfWarRequired: true,
      outputPath: `frames/${String(index + 1).padStart(2, '0')}-${frameLabel}.png`,
    };
  });
  assert.equal(frames.length, 4, 'the pilot must contain exactly four frames');
  assert.deepEqual([...new Set(frames.map((frame) => frame.mapName))].sort(), ['Cinder', 'Meadow']);
  assert.deepEqual([...new Set(frames.map((frame) => frame.zoom))].sort((a, b) => b - a), [0.91, 0.48]);
  assert.ok(frames.some((frame) => frame.resourceFamily === 'oak' && frame.stage === 'worked'
    && frame.workerInteraction === 'active-gathering-or-returning'),
  'the pilot must include an active wood gathering interaction');
  assert.ok(frames.some((frame) => frame.resourceFamily === 'berries' && frame.stage === 'worked'
    && frame.workerInteraction === 'active-gathering-or-returning'),
  'the pilot must include an active food gathering interaction');
  return frames;
}

async function runStaticPilotPlan() {
  const maps = [
    makeReviewMap('renderer-env-meadow', 'Environment State Meadow', 'meadow', 881),
    makeReviewMap('renderer-env-cinder', 'Environment State Cinder', 'cinder', 517),
  ];
  const frames = buildPilotFramePlan(maps);
  const report = {
    ok: true,
    mode: 'pilot-plan-only',
    acceptanceStatus: 'preview-only',
    scenarioId: 'renderer-environment-state-pilot',
    captureExecuted: false,
    serverLaunched: false,
    browserLaunched: false,
    webglContextCreated: false,
    framesCaptured: 0,
    tuples: frames,
    output: {
      gameDevCaptureManifest: 'capture.json',
      framePaths: frames.map((frame) => frame.outputPath),
    },
    runtimeAssets: {
      packRoot: 'assets/environment/frontier-interactive-v1',
      expectedFiles: REQUIRED_RUNTIME_FILES,
      verifiedDuringPlan: false,
    },
    captureGate: {
      requiredFlags: ['--confirm', '--allow-gpu'],
      excludedFlags: ['--allow-performance'],
    },
    captureCommand: 'game-dev scenario run renderer-environment-state-pilot --project . --confirm --allow-gpu --jsonl',
  };
  if (GAME_DEV_RUN_DIR) {
    assertGameDevContext('renderer-environment-state-pilot-plan');
    const runDirectory = path.resolve(GAME_DEV_RUN_DIR);
    await mkdir(runDirectory, { recursive: true });
    await writeFile(path.join(runDirectory, 'capture.json'), JSON.stringify({
      schema: 'game_dev.capture.v1',
      runId: GAME_DEV_RUN_ID,
      adapterId: GAME_DEV_ADAPTER_ID,
      scenarioId: GAME_DEV_SCENARIO_ID,
      sourceFormat: 'game-dev-capture-v1',
      frames: [],
      measurements: [],
      adapterEvidence: {
        pilotPlan: report,
        notes: [
          'Plan-only output; no server, browser, WebGL context, or screenshots were started.',
          'The GPU capture command is opt-in and is not executed by this plan scenario.',
        ],
      },
    }, null, 2));
  }
  console.log(JSON.stringify(report, null, 2));
}

async function runStaticPreflight() {
  const maps = [
    makeReviewMap('renderer-env-meadow', 'Environment State Meadow', 'meadow', 881),
    makeReviewMap('renderer-env-cinder', 'Environment State Cinder', 'cinder', 517),
  ];
  assert.deepEqual(maps.map((map) => map.terrainBase), ['meadow', 'cinder']);
  assert.ok(maps.every((map) => map.fogOfWar === true && map.startingArmySize === 8));
  assert.equal(new Set(maps.map((map) => map.id)).size, maps.length);
  for (const map of maps) {
    assert.deepEqual(map.spawnPoints.map((spawn) => spawn.team).sort(), [0, 1]);
    assert.ok(map.spawnPoints.every((spawn) => Math.abs(spawn.x) <= 2.2 && spawn.z === 0));
    assert.equal(map.resourceNodes.length, 4, `${map.id} should include one wood and food node per team`);
    assert.ok(map.resourceNodes.every((node) => node.stock === 100),
      `${map.id} resource stages must begin at startingStock 100`);
    assert.equal(map.resourceNodes.filter((node) => node.type === 'wood').length, 2);
    assert.equal(map.resourceNodes.filter((node) => node.type === 'food').length, 2);
    assert.deepEqual(map.scenarioEvents, [], 'capture maps must not inject resource stock or unit states');
  }
  const plan = buildFramePlan(maps);
  assert.equal(plan.length, EXPECTED_FRAME_COUNT);
  assert.equal(EXPECTED_FRAME_COUNT, 40, 'capture matrix is ten image states × two maps × two zooms');
  assert.equal(new Set(plan.map((frame) => `${frame.mapId}:${frame.stateId}:${frame.zoom}`)).size, 40);
  assert.deepEqual(REQUIRED_RUNTIME_FILES.filter((file) => file.includes('construction-clear')), [],
    'construction-clear has no image and must not create extra frames');
  assert.equal(constructionGroundStage(0.2, false), 'earthwork');
  assert.equal(constructionGroundStage(0.6, false), 'foundation');
  assert.equal(constructionGroundStage(1, true), 'clear');
  const { manifest, verified } = await verifyEnvironmentPack();
  const report = {
    ok: true,
    mode: 'static-preflight',
    serverLaunched: false,
    browserLaunched: false,
    maps: maps.map((map) => ({ id: map.id, terrainBase: map.terrainBase, fogOfWar: map.fogOfWar })),
    stockSamples: [100, 50, 20, 0],
    resourceNodeStocksStartAt: 100,
    constructionClear: { image: null, screenshotFrames: 0, assertionRequired: true },
    screenshotViewport: {
      cssWidth: VIEWPORT_WIDTH,
      cssHeight: VIEWPORT_HEIGHT,
      devicePixelRatio: DEVICE_PIXEL_RATIO,
      pngPixelWidth: PNG_PIXEL_WIDTH,
      pngPixelHeight: PNG_PIXEL_HEIGHT,
    },
    runtimeAssets: {
      packId: manifest.packId, packVersion: manifest.packVersion,
      count: verified.length, paths: verified.map((file) => file.path),
      sha256AndDecodedDimensionsVerifiedLocally: true,
      browserFetchAndFogSnapshotCheck: 'required before every runtime screenshot',
    },
    frames: plan.length,
  };
  if (GAME_DEV_RUN_DIR) {
    assertGameDevContext('renderer-environment-state-preflight');
    const runDirectory = path.resolve(GAME_DEV_RUN_DIR);
    await mkdir(runDirectory, { recursive: true });
    await writeFile(path.join(runDirectory, 'capture.json'), JSON.stringify({
      schema: 'game_dev.capture.v1',
      runId: GAME_DEV_RUN_ID,
      adapterId: GAME_DEV_ADAPTER_ID,
      scenarioId: GAME_DEV_SCENARIO_ID,
      sourceFormat: 'game-dev-capture-v1',
      frames: [],
      measurements: [],
      adapterEvidence: {
        preflight: report,
        notes: [
          'CPU-only static preflight; no server, browser, WebGL context, or screenshots were started.',
          'The 40-frame plan is a declaration only and is not capture evidence.',
          'The GPU capture scenario separately verifies browser fetches and fog-visible map rows before every screenshot.',
        ],
      },
    }, null, 2));
  }
  console.log(JSON.stringify(report, null, 2));
}

async function run({ pilot = false } = {}) {
  const scenarioId = pilot ? 'renderer-environment-state-pilot' : 'renderer-environment-state';
  assertGameDevContext(scenarioId);
  const verifiedPack = await verifyEnvironmentPack();
  const runDirectory = path.resolve(GAME_DEV_RUN_DIR);
  await mkdir(runDirectory, { recursive: true });
  tempRoot = await mkdtemp(path.join(os.tmpdir(), 'rts-renderer-environment-state-'));
  const customMapDirectory = path.join(tempRoot, 'custom-maps');
  const profileRoot = path.join(tempRoot, 'chrome-profiles');
  const browsers = [];
  const frames = [];
  const evidence = [];
  let server = null;
  try {
    const maps = await writeReviewMaps(customMapDirectory);
    const serverPort = await reservePort();
    const gameUrl = `http://127.0.0.1:${serverPort}/?rendererCapture=environment-state`;
    server = startChild('server', process.execPath, [SERVER_ENTRY], {
      env: {
        ...process.env,
        PORT: String(serverPort),
        RTS_HOST: '127.0.0.1',
        RTS_MAP: 'maps/open-field.json',
        RTS_CUSTOM_MAP_DIRECTORY: customMapDirectory,
        RTS_MATCH_STATE_PATH: path.join(tempRoot, 'match-state.json'),
      },
    });
    await waitForHealth(serverPort, (health) => health.ok === true, 'isolated appearance server startup');
    const chromeExecutable = await findChromeExecutable();
    browsers.push(await createBrowser('Azure', path.join(profileRoot, 'azure'), chromeExecutable, gameUrl));
    assert.equal(browsers[0].team, 0, 'the first browser should own Azure');
    browsers.push(await createBrowser('Ember', path.join(profileRoot, 'ember'), chromeExecutable, gameUrl));
    assert.equal(browsers[1].team, 1, 'the second browser should own Ember');
    await waitForHealth(serverPort, (health) => health.connected === 2, 'both fog-filtered player clients');

    const renderer = await browsers[0].cdp.evaluate(`(() => {
      const canvas = document.querySelector('#viewport canvas');
      if (!canvas) return { webglVersion: 0 };
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      return { webglVersion: gl instanceof WebGL2RenderingContext ? 2 : 1 };
    })()`);
    assert.ok(renderer.webglVersion === 1 || renderer.webglVersion === 2,
      'environment renderer should expose WebGL');

    if (pilot) {
      const pilotPlan = await captureEnvironmentPilot({
        maps, browsers, frames, runDirectory, verifiedPack, evidence,
      });
      assert.equal(frames.length, pilotPlan.length, 'pilot capture should contain exactly four planned frames');
      const manifest = await writeCaptureManifest(frames, renderer, runDirectory, { pilotPlan });
      assert.equal(manifest.measurements.length, 0, 'environment appearance capture must not report performance metrics');
      console.log(JSON.stringify({
        scenario: GAME_DEV_SCENARIO_ID,
        mode: 'pilot-capture',
        captureExecuted: true,
        acceptanceStatus: 'preview-only',
        maps: maps.map((map) => ({ id: map.id, terrainBase: map.terrainBase, fogOfWar: map.fogOfWar })),
        environmentPack: {
          packId: verifiedPack.manifest.packId,
          packVersion: verifiedPack.manifest.packVersion,
          browserClients: browsers.length,
          runtimeImagesFetchedAndDecodedPerClient: REQUIRED_RUNTIME_FILES.length,
        },
        stateChecks: evidence,
        pilotPlan,
        frames: frames.map((frame) => frame.label),
        capturePath: path.join(runDirectory, 'capture.json'),
        humanArtReviewPending: true,
      }, null, 2));
    } else {
      const clearAssertions = [];
      for (const map of maps) {
        clearAssertions.push(await captureEnvironmentMap({
          map, browsers, frames, runDirectory, verifiedPack, evidence,
        }));
      }
      assert.equal(frames.length, EXPECTED_FRAME_COUNT,
        'environment capture should contain all ten image states across both maps and zooms');
      const actualFrameKeys = capturedFrameKeys;
      const expectedFrameKeys = buildFramePlan(maps).map((frame) => (
        `${frame.mapLabel}:${frame.stateId}:${frame.zoom}`
      ));
      assert.deepEqual([...actualFrameKeys].sort(), [...expectedFrameKeys].sort(),
        'captured frame roster must exactly match the 40-state matrix');
      assert.equal(clearAssertions.length, 2, 'clear-state assertions should pass on both maps');
      const qaEvidence = await preserveFullMatrixEvidence({ maps, frames, runDirectory });
      const manifest = await writeCaptureManifest(frames, renderer, runDirectory, { qaEvidence });
      assert.equal(manifest.measurements.length, 0, 'environment appearance capture must not report performance metrics');
      console.log(JSON.stringify({
        scenario: GAME_DEV_SCENARIO_ID,
        maps: maps.map((map) => ({ id: map.id, terrainBase: map.terrainBase, fogOfWar: map.fogOfWar })),
        environmentPack: {
          packId: verifiedPack.manifest.packId,
          packVersion: verifiedPack.manifest.packVersion,
          browserClients: browsers.length,
          runtimeImagesFetchedAndDecodedPerClient: REQUIRED_RUNTIME_FILES.length,
        },
        stateChecks: evidence,
        constructionClearAssertions: clearAssertions,
        frames: frames.map((frame) => frame.label),
        acceptanceStatus: 'awaiting-human-art-review',
        qaEvidence,
        capturePath: path.join(runDirectory, 'capture.json'),
        humanArtReviewPending: true,
      }, null, 2));
    }
  } finally {
    for (const browser of browsers) {
      browser.cdp?.close();
      if (browser.browserCdp) {
        try { await browser.browserCdp.call('Browser.close', {}, 3000); } catch {}
        browser.browserCdp.close();
      }
    }
    await Promise.allSettled([...children].map((record) => stopChild(record)));
    if (tempRoot) await rm(tempRoot, { recursive: true, force: true });
    process.removeListener('SIGINT', onSignal);
    process.removeListener('SIGTERM', onSignal);
  }
}

if (process.argv[2] === '--pilot-plan') {
  runStaticPilotPlan().catch((error) => {
    console.error(error.stack || error.message || error);
    process.exitCode = 1;
  });
} else if (process.argv[2] === '--pilot') {
  run({ pilot: true }).catch((error) => {
    console.error(error.stack || error.message || error);
    process.exitCode = interruptSignal ? 130 : 1;
  });
} else if (process.argv[2] === '--preflight') {
  runStaticPreflight().catch((error) => {
    console.error(error.stack || error.message || error);
    process.exitCode = 1;
  });
} else {
  run().catch((error) => {
    console.error(error.stack || error.message || error);
    process.exitCode = interruptSignal ? 130 : 1;
  });
}
