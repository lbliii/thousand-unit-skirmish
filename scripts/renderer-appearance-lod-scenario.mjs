#!/usr/bin/env node

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SERVER_ENTRY = path.join(ROOT, 'server.mjs');
const GAME_DEV_RUN_DIR = process.env.GAME_DEV_RUN_DIR;
const GAME_DEV_RUN_ID = process.env.GAME_DEV_RUN_ID;
const GAME_DEV_ADAPTER_ID = process.env.GAME_DEV_ADAPTER_ID;
const GAME_DEV_SCENARIO_ID = process.env.GAME_DEV_SCENARIO_ID;
const LOAD_AVERAGE_LIMIT = 2;
const HEALTH_TIMEOUT_MS = 15_000;
const PAGE_TIMEOUT_MS = 20_000;
const STATE_TIMEOUT_MS = 15_000;
const CHILD_EXIT_TIMEOUT_MS = 2500;
const INITIAL_ZOOM = 0.91;
const ZOOM_WHEEL_SCALE = 0.001;
const ZOOM_SETTLE_MS = 250;
const VIEWPORT_WIDTH = 1280;
const VIEWPORT_HEIGHT = 720;
const EXPECTED_ROLES = Object.freeze({ worker: 4, infantry: 1, archer: 1 });
const TEAMS = Object.freeze(['azure', 'ember']);
const ZOOMS = Object.freeze([
  { label: '091', value: 0.91 },
  { label: '048', value: 0.48 },
]);

const children = new Set();
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

function assertGameDevContext() {
  assert.ok(GAME_DEV_RUN_DIR && GAME_DEV_RUN_ID && GAME_DEV_ADAPTER_ID && GAME_DEV_SCENARIO_ID,
    'run this opt-in capture through game-dev scenario run');
  assert.equal(GAME_DEV_ADAPTER_ID, 'thousand-unit-skirmish', 'unexpected adapter context');
  assert.equal(GAME_DEV_SCENARIO_ID, 'renderer-appearance-lod', 'unexpected scenario context');
}

function assertLoadGate() {
  const oneMinuteLoad = os.loadavg()[0];
  if (Number.isFinite(oneMinuteLoad) && oneMinuteLoad > LOAD_AVERAGE_LIMIT) {
    throw new Error(`appearance capture requires 1-minute load average <= ${LOAD_AVERAGE_LIMIT}; saw ${oneMinuteLoad.toFixed(2)}`);
  }
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
    summary: '64 × 64 · Fog-safe LOD appearance review',
    width: 64,
    height: 64,
    terrainSeed,
    terrainBase,
    fogOfWar: true,
    startingArmySize: 8,
    startingResources: { food: 0, wood: 0 },
    spawnPoints: [
      { team: 0, x: -2.2, z: 0 },
      { team: 1, x: 2.2, z: 0 },
    ],
    obstacles: [],
    resourceNodes: [],
    triggers: [],
    scenarioEvents: [
      {
        id: 'seed-infantry', type: 'timed-supply', name: 'Review Infantry',
        afterSeconds: 0.5, team: 'both', foodReward: 0, woodReward: 0,
        unitCount: 1, unitKind: 'infantry',
      },
      {
        id: 'seed-archers', type: 'timed-supply', name: 'Review Archers',
        afterSeconds: 1, team: 'both', foodReward: 0, woodReward: 0,
        unitCount: 1, unitKind: 'archer',
      },
    ],
  };
}

async function writeReviewMaps(directory) {
  await mkdir(directory, { recursive: true });
  const maps = [
    makeReviewMap('renderer-lod-meadow', 'Renderer LOD Meadow', 'meadow', 881),
    makeReviewMap('renderer-lod-cinder', 'Renderer LOD Cinder', 'cinder', 517),
  ];
  for (const map of maps) {
    await writeFile(path.join(directory, `${map.id}.json`), `${JSON.stringify(map, null, 2)}\n`, {
      encoding: 'utf8', flag: 'wx', mode: 0o600,
    });
  }
  return maps;
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
    '--window-size=1280,720', '--force-device-scale-factor=1',
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

function validateViewerSnapshot(state, viewerTeam, mapId) {
  assert.equal(state.mapId, mapId, `viewer ${viewerTeam} should be on ${mapId}`);
  assert.equal(state.fogOfWar, true, `viewer ${viewerTeam} must receive an active fog snapshot`);
  assert.ok(state.visibility, `viewer ${viewerTeam} must receive its own visibility mask`);
  assert.ok(Array.isArray(state.units), `viewer ${viewerTeam} snapshot must contain units`);
  assert.equal(state.units.length, 12, `viewer ${viewerTeam} should see the complete twelve-unit review roster`);
  for (const team of [0, 1]) {
    const rows = state.units.filter((unit) => unit[1] === team && unit[4] > 0);
    for (const [role, expected] of Object.entries(EXPECTED_ROLES)) {
      const count = rows.filter((unit) => unit[5] === role).length;
      assert.equal(count, expected,
        `viewer ${viewerTeam} snapshot should include ${expected} ${role} units for team ${team}`);
    }
  }
  for (const unit of state.units) {
    assert.equal(visibilityCode(state, unit[2], unit[3]), 2,
      `viewer ${viewerTeam} must have current sight on unit ${unit[0]} for team ${unit[1]}`);
  }
  const hiddenEnemyRows = state.units.filter((unit) => unit[1] !== viewerTeam
    && visibilityCode(state, unit[2], unit[3]) !== 2);
  assert.equal(hiddenEnemyRows.length, 0, `viewer ${viewerTeam} snapshot must omit every fog-hidden enemy`);
  return {
    viewerTeam,
    mapId,
    visibleUnits: state.units.length,
    roleCounts: Object.fromEntries([0, 1].map((team) => [team, Object.fromEntries(
      Object.keys(EXPECTED_ROLES).map((role) => [role,
        state.units.filter((unit) => unit[1] === team && unit[4] > 0 && unit[5] === role).length]),
    )])),
  };
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

async function writeFrame(browser, runDirectory, frameIndex, mapLabel, zoom) {
  const viewerLabel = TEAMS[browser.team];
  const frameLabel = `${mapLabel}-${viewerLabel}-zoom-${zoom.label}`;
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
      team: team?.textContent?.trim().toUpperCase() || null,
      teamBounds: bounds(team),
      minimapBounds: bounds(minimap),
      mapTitle: title?.textContent?.trim() || null,
    };
  })()`);
  assert.equal(composition.width, VIEWPORT_WIDTH, `review viewport width should be ${VIEWPORT_WIDTH}`);
  assert.equal(composition.height, VIEWPORT_HEIGHT, `review viewport height should be ${VIEWPORT_HEIGHT}`);
  assert.equal(composition.team, browser.team === 0 ? 'AZURE' : 'EMBER',
    `full review image should identify its ${browser.teamLabel} player view`);
  assert.ok(composition.teamBounds?.visible, `team HUD label should be visible for ${frameLabel}`);
  assert.ok(composition.minimapBounds?.visible, `minimap should be visible for ${frameLabel}`);
  assert.ok(composition.mapTitle, `map title should be visible for ${frameLabel}`);
  const screenshot = await browser.cdp.call('Page.captureScreenshot', {
    format: 'png', fromSurface: true, captureBeyondViewport: false,
  });
  await writeFile(destination, Buffer.from(screenshot.data, 'base64'));
  return {
    index: frameIndex,
    label: frameLabel,
    attachments: [{
      kind: 'color', path: relativePath, encoding: 'png',
      description: `${mapLabel} full 1280x720 game viewport from the ${viewerLabel} fog-filtered client at zoom ${zoom.value}; HUD labels and minimap are included.`,
    }],
  };
}

async function writeCaptureManifest(frames, renderer, runDirectory) {
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
      notes: [
        'Appearance-only capture; no performance measurements were collected.',
        'Frames were captured from Azure and Ember player clients with server-provided fog visibility masks.',
        'Human review is required to assess role silhouette and team-marker readability.',
      ],
    },
  };
  await writeFile(path.join(runDirectory, 'capture.json'), JSON.stringify(manifest, null, 2));
  return manifest;
}

async function captureMapMatrix({ map, browsers, frames, runDirectory, preflight }) {
  assertLoadGate();
  await selectMap(browsers[0], map.id);
  const states = await Promise.all(browsers.map((browser) => waitForSnapshot(browser, (state) => (
    state.mapId === map.id && state.fogOfWar === true && state.units?.length === 12
      && state.scenarioEvents?.every((event) => event.fired === true)
  ), `${browser.teamLabel} complete review roster on ${map.id}`)));
  for (const browser of browsers) {
    const state = states[browser.team];
    preflight.push(validateViewerSnapshot(state, browser.team, map.id));
  }
  assert.notEqual(states[0].visibility.data, states[1].visibility.data,
    `${map.id} should return distinct Azure and Ember visibility snapshots`);

  for (const browser of browsers) {
    for (const zoom of ZOOMS) {
      assertLoadGate();
      checkInterrupted();
      await setZoom(browser, zoom.value);
      const state = await waitForSnapshot(browser, (snapshot) => (
        snapshot.mapId === map.id && snapshot.fogOfWar === true && snapshot.units?.length === 12
      ), `${browser.teamLabel} capture-ready roster on ${map.id}`);
      preflight.push(validateViewerSnapshot(state, browser.team, map.id));
      frames.push(await writeFrame(browser, runDirectory, frames.length, map.terrainBase, zoom));
    }
  }
}

function runStaticPreflight() {
  const maps = [
    makeReviewMap('renderer-lod-meadow', 'Renderer LOD Meadow', 'meadow', 881),
    makeReviewMap('renderer-lod-cinder', 'Renderer LOD Cinder', 'cinder', 517),
  ];
  assert.deepEqual(maps.map((map) => map.terrainBase), ['meadow', 'cinder']);
  assert.ok(maps.every((map) => map.fogOfWar === true && map.startingArmySize === 8));
  assert.equal(new Set(maps.map((map) => map.id)).size, maps.length);
  for (const map of maps) {
    assert.deepEqual(map.spawnPoints.map((spawn) => spawn.team).sort(), [0, 1]);
    assert.ok(map.spawnPoints.every((spawn) => Math.abs(spawn.x) <= 2.2 && spawn.z === 0));
    assert.deepEqual(map.scenarioEvents.map((event) => event.unitKind), ['infantry', 'archer']);
    assert.ok(map.scenarioEvents.every((event) => event.type === 'timed-supply'
      && event.team === 'both' && event.unitCount === 1
      && event.afterSeconds >= 0.5 && event.foodReward === 0 && event.woodReward === 0));
  }
  const frameCount = maps.length * TEAMS.length * ZOOMS.length;
  const unitCountPerTeam = Object.values(EXPECTED_ROLES).reduce((sum, count) => sum + count, 0);
  assert.equal(frameCount, 8);
  assert.equal(unitCountPerTeam, 6);
  console.log(JSON.stringify({
    ok: true,
    mode: 'static-preflight',
    serverLaunched: false,
    browserLaunched: false,
    maps: maps.map((map) => ({ id: map.id, terrainBase: map.terrainBase, fogOfWar: map.fogOfWar })),
    roleCountsPerTeam: EXPECTED_ROLES,
    frames: frameCount,
  }, null, 2));
}

async function run() {
  assertGameDevContext();
  assertLoadGate();
  const runDirectory = path.resolve(GAME_DEV_RUN_DIR);
  tempRoot = await mkdtemp(path.join(os.tmpdir(), 'rts-renderer-appearance-lod-'));
  const customMapDirectory = path.join(tempRoot, 'custom-maps');
  const profileRoot = path.join(tempRoot, 'chrome-profiles');
  const browsers = [];
  const frames = [];
  const preflight = [];
  let server = null;
  try {
    const maps = await writeReviewMaps(customMapDirectory);
    const serverPort = await reservePort();
    const gameUrl = `http://127.0.0.1:${serverPort}/`;
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
      'appearance renderer should expose WebGL');

    await captureMapMatrix({ map: maps[0], browsers, frames, runDirectory, preflight });
    await captureMapMatrix({ map: maps[1], browsers, frames, runDirectory, preflight });
    assert.equal(frames.length, 8, 'appearance capture should contain all eight review frames');
    const manifest = await writeCaptureManifest(frames, renderer, runDirectory);
    assert.equal(manifest.measurements.length, 0, 'appearance capture must not report performance metrics');
    console.log(JSON.stringify({
      scenario: GAME_DEV_SCENARIO_ID,
      maps: maps.map((map) => ({ id: map.id, terrainBase: map.terrainBase, fogOfWar: map.fogOfWar })),
      viewerRosterChecks: preflight,
      frames: frames.map((frame) => frame.label),
      capturePath: path.join(runDirectory, 'capture.json'),
      humanAppearanceReviewPending: true,
    }, null, 2));
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

if (process.argv[2] === '--preflight') {
  runStaticPreflight();
} else {
  run().catch((error) => {
    console.error(error.stack || error.message || error);
    process.exitCode = interruptSignal ? 130 : 1;
  });
}
