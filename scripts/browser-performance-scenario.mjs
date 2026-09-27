#!/usr/bin/env node

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SERVER_ENTRY = path.join(ROOT, 'server.mjs');
const LOAD_SCENARIO = path.join(ROOT, 'scripts', 'performance-scenario.mjs');
const DEFAULT_DURATION_SECONDS = 10;
const MOVEMENT_WAVES = 3;
const MAX_CAPTURED_OUTPUT_BYTES = 16 * 1024 * 1024;
const CHILD_EXIT_TIMEOUT_MS = 2500;
const HEALTH_TIMEOUT_MS = 15_000;
const PAGE_TIMEOUT_MS = 20_000;
const FRAME_INTERVAL_P95_BUDGET_MS = Number(process.env.RTS_FRAME_P95_BUDGET_MS ?? 33.333);
const ANIMATE_CALLBACK_P95_BUDGET_MS = Number(process.env.RTS_ANIMATE_P95_BUDGET_MS ?? 8);
const LONG_TASK_COUNT_BUDGET = Number(process.env.RTS_LONG_TASK_COUNT_BUDGET ?? 0);

const durationSeconds = Number(process.argv[2] || DEFAULT_DURATION_SECONDS);
assert.ok(Number.isInteger(durationSeconds) && durationSeconds >= 10 && durationSeconds <= 40,
  'duration must be an integer between 10 and 40 seconds per movement wave');
assert.ok(Number.isFinite(FRAME_INTERVAL_P95_BUDGET_MS)
  && FRAME_INTERVAL_P95_BUDGET_MS > 0 && FRAME_INTERVAL_P95_BUDGET_MS <= 1000,
  'RTS_FRAME_P95_BUDGET_MS must be greater than 0 and no more than 1000 ms');
assert.ok(Number.isFinite(ANIMATE_CALLBACK_P95_BUDGET_MS)
  && ANIMATE_CALLBACK_P95_BUDGET_MS > 0 && ANIMATE_CALLBACK_P95_BUDGET_MS <= 1000,
  'RTS_ANIMATE_P95_BUDGET_MS must be greater than 0 and no more than 1000 ms');
assert.ok(Number.isInteger(LONG_TASK_COUNT_BUDGET)
  && LONG_TASK_COUNT_BUDGET >= 0 && LONG_TASK_COUNT_BUDGET <= 1000,
  'RTS_LONG_TASK_COUNT_BUDGET must be an integer between 0 and 1000');

const children = new Set();
let cdp = null;
let browserCdp = null;
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

function checkInterrupted() {
  if (interruptSignal) throw new Error(`Interrupted by ${interruptSignal}`);
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function appendBounded(record, key, chunk) {
  const text = chunk.toString('utf8');
  record[key] = (record[key] + text).slice(-MAX_CAPTURED_OUTPUT_BYTES);
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
  child.stdout?.on('data', (chunk) => appendBounded(record, 'stdout', chunk));
  child.stderr?.on('data', (chunk) => appendBounded(record, 'stderr', chunk));
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
    try {
      await stat(candidate);
      return candidate;
    } catch {}
  }
  throw new Error(`Chrome was not found. Set CHROME_PATH to an installed Chrome/Chromium executable. Tried: ${candidates.join(', ')}`);
}

function chromeLaunch(executable, profileDirectory) {
  const chromeArgs = [
    '--headless=new',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--enable-precise-memory-info',
    '--remote-debugging-address=127.0.0.1',
    '--remote-debugging-port=0',
    '--remote-allow-origins=*',
    `--user-data-dir=${profileDirectory}`,
    'about:blank',
  ];
  // Direct launch is important for reliable process-group cleanup. The caller
  // tracks Chrome as its own child and closes its isolated profile over CDP.
  return { command: executable, args: chromeArgs };
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
    this.socket.addEventListener('message', (event) => this.#receive(event.data));
    this.socket.addEventListener('close', () => {
      for (const { reject } of this.pending.values()) reject(new Error('Chrome DevTools connection closed'));
      this.pending.clear();
    });
  }

  #receive(raw) {
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

async function waitForDevTools(profileDirectory, chromeRecord, timeoutMs = 15_000) {
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
  throw new Error(`Chrome did not create DevToolsActivePort. Chrome stderr: ${chromeRecord.stderr.trim()}`);
}

async function waitForPageTarget(debugPort, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    checkInterrupted();
    try {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`, { signal: AbortSignal.timeout(1000) });
      const targets = await response.json();
      const page = targets.find((target) => target.type === 'page' && target.webSocketDebuggerUrl);
      if (page) return page;
    } catch (error) {
      lastError = error;
    }
    await sleep(100);
  }
  throw new Error(`Could not find Chrome page target: ${lastError?.message || 'timed out'}`);
}

function installBrowserInstrumentationExpression() {
  return `(() => {
    if (window.__rtsBrowserPerf) return;
    const nativeRequestAnimationFrame = window.requestAnimationFrame.bind(window);
    const frames = [];
    const longTasks = [];
    const preWindowLongTasks = [];
    const longAnimationFrames = [];
    const maximumSamples = 120000;
    let previousAnimateTimestamp = null;
    let measuring = false;
    let longTaskObserverAvailable = false;
    let longAnimationFrameObserverAvailable = false;
    let measurementStartedAt = null;
    const record = (array, value) => {
      array.push(value);
      if (array.length > maximumSamples) array.splice(0, array.length - maximumSamples);
    };
    window.__rtsBrowserPerf = {
      begin() {
        frames.length = 0; longTasks.length = 0; preWindowLongTasks.length = 0; longAnimationFrames.length = 0;
        previousAnimateTimestamp = null; measurementStartedAt = performance.now(); measuring = true;
      },
      end() { measuring = false; },
      frames,
      longTasks,
      preWindowLongTasks,
      longAnimationFrames,
      get measurementStartedAt() { return measurementStartedAt; },
      get longAnimationFrameObserverAvailable() { return longAnimationFrameObserverAvailable; },
      get longTaskObserverAvailable() { return longTaskObserverAvailable; },
      get renderer() {
        const canvas = document.querySelector('#viewport canvas');
        if (!canvas) return { available: false };
        const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
        if (!gl) return { available: false };
        const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
        const vendor = debugInfo ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR);
        const renderer = debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
        const value = renderer.toLowerCase();
        const backend = /swiftshader|llvmpipe|softpipe|software/.test(value) ? 'software'
          : /metal/.test(value) ? 'metal'
            : /vulkan/.test(value) ? 'vulkan'
              : /direct3d|d3d/.test(value) ? 'direct3d'
                : /angle/.test(value) ? 'angle (backend not identified)' : 'unknown';
        return { available: true, vendor, renderer, backend, webglVersion: gl instanceof WebGL2RenderingContext ? 2 : 1 };
      },
    };
    window.requestAnimationFrame = (callback) => {
      if (callback?.name !== 'animate') return nativeRequestAnimationFrame(callback);
      return nativeRequestAnimationFrame((timestamp) => {
        const startedAt = performance.now();
        try { callback(timestamp); }
        finally {
          const callbackMs = performance.now() - startedAt;
          if (measuring) {
            if (previousAnimateTimestamp !== null) {
              record(frames, {
                timestampMs: timestamp,
                intervalMs: timestamp - previousAnimateTimestamp,
                callbackMs,
              });
            }
            previousAnimateTimestamp = timestamp;
          }
        }
      });
    };
    try {
      new PerformanceObserver((list) => {
        if (!measuring) return;
        for (const entry of list.getEntries()) {
          const destination = entry.startTime + entry.duration <= measurementStartedAt ? preWindowLongTasks : longTasks;
          record(destination, { durationMs: entry.duration, startTime: entry.startTime });
        }
      }).observe({ type: 'longtask', buffered: true });
      longTaskObserverAvailable = true;
    } catch {}
    if (PerformanceObserver.supportedEntryTypes?.includes('long-animation-frame')) {
      try {
        new PerformanceObserver((list) => {
          if (!measuring) return;
          for (const entry of list.getEntries()) {
            record(longAnimationFrames, {
              startTimeMs: entry.startTime, durationMs: entry.duration,
              measurementPhase: entry.startTime + entry.duration <= measurementStartedAt ? 'before-window'
                : entry.startTime < measurementStartedAt ? 'overlaps-window' : 'within-window',
              blockingDurationMs: entry.blockingDuration, renderStartMs: entry.renderStart,
              styleAndLayoutStartMs: entry.styleAndLayoutStart,
              scripts: Array.from(entry.scripts || [], (script) => ({
                durationMs: script.duration, executionStartMs: script.executionStart,
                forcedStyleAndLayoutDurationMs: script.forcedStyleAndLayoutDuration,
                invoker: script.invoker, invokerType: script.invokerType,
                sourceURL: script.sourceURL, sourceFunctionName: script.sourceFunctionName,
                sourceCharPosition: script.sourceCharPosition,
              })),
            });
          }
        }).observe({ type: 'long-animation-frame', buffered: true });
        longAnimationFrameObserverAvailable = true;
      } catch {}
    }
  })()`;
}

async function waitForBrowserReady(debugConnection, capture, timeoutMs = PAGE_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  let lastPage = null;
  let lastEvaluationError = null;
  while (Date.now() < deadline) {
    checkInterrupted();
    try {
      lastPage = await debugConnection.evaluate(`(() => {
        const root = document.documentElement;
        return {
          boot: root?.dataset.boot || null,
          units: document.querySelector('#unit-total')?.textContent?.trim() || null,
          error: document.querySelector('#runtime-error')?.textContent?.trim() || null,
          canvas: Boolean(document.querySelector('#viewport canvas')),
          status: document.querySelector('#network-status')?.textContent?.trim() || null,
        };
      })()`);
      lastEvaluationError = null;
    } catch (error) {
      // The document execution context can be replaced between navigation and
      // the first page poll. Retry until the page is ready or the bounded wait ends.
      lastEvaluationError = error.message;
      await sleep(100);
      continue;
    }
    if (lastPage?.error?.startsWith('CLIENT ERROR')) {
      throw new Error(`Browser client failed to load: ${lastPage.error}`);
    }
    const latestPageState = capture.latestPageState;
    const hasFullArmySnapshot = latestPageState?.units?.length === 2000
      && latestPageState?.armySize === 2000;
    if (lastPage?.boot === 'ready' && lastPage.canvas && hasFullArmySnapshot) return lastPage;
    await sleep(100);
  }
  const latestPageState = capture.latestPageState;
  throw new Error(`Browser did not reach a 2,000-unit rendered state: ${JSON.stringify({ page: lastPage, stateUnits: latestPageState?.units?.length, stateArmySize: latestPageState?.armySize, lastEvaluationError })}`);
}

function parsePageState(message, capture) {
  const state = message?.type === 'welcome' ? message.state : message;
  if (state?.type !== 'state' || !Array.isArray(state.units)) return;
  capture.latestPageState = state;
  capture.visiblePageUnits = Math.max(capture.visiblePageUnits, state.units.length);
  capture.stateSnapshotSamples++;
  if (capture.previousPositions) {
    let moved = 0;
    for (const row of state.units) {
      const prior = capture.previousPositions.get(row[0]);
      const distance = prior ? Math.hypot(row[2] - prior[0], row[3] - prior[1]) : 0;
      // Army resets teleport units back to their spawns; count ordinary motion
      // between server snapshots, not those reset jumps.
      if (distance > 0.01 && distance < 2) moved++;
    }
    capture.maxUnitsMovingBetweenStates = Math.max(capture.maxUnitsMovingBetweenStates, moved);
  }
  capture.previousPositions = new Map(state.units.map((row) => [row[0], [row[2], row[3]]]));
}

function percentile(values, quantile) {
  if (values.length === 0) return null;
  const sorted = values.toSorted((left, right) => left - right);
  return Number(sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * quantile) - 1)].toFixed(3));
}

function summarizeValues(values) {
  const maximum = values.reduce((peak, value) => Math.max(peak, value), -Infinity);
  return {
    samples: values.length,
    p50Ms: percentile(values, 0.50),
    p95Ms: percentile(values, 0.95),
    p99Ms: percentile(values, 0.99),
    maxMs: values.length ? Number(maximum.toFixed(3)) : null,
  };
}

async function readHeapUsage(debugConnection) {
  const result = await debugConnection.call('Runtime.getHeapUsage', {}, 5000);
  return {
    usedBytes: Number.isFinite(result.usedSize) ? result.usedSize : null,
    totalBytes: Number.isFinite(result.totalSize) ? result.totalSize : null,
    embedderHeapUsedBytes: Number.isFinite(result.embedderHeapUsedSize) ? result.embedderHeapUsedSize : null,
    backingStorageBytes: Number.isFinite(result.backingStorageSize) ? result.backingStorageSize : null,
  };
}

async function pollHeapUntilScenarioEnds(debugConnection, harness) {
  const samples = [];
  while (childIsRunning(harness)) {
    checkInterrupted();
    try { samples.push({ at: new Date().toISOString(), ...(await readHeapUsage(debugConnection)) }); }
    catch (error) { samples.push({ at: new Date().toISOString(), error: error.message }); }
    await sleep(1000);
  }
  try { samples.push({ at: new Date().toISOString(), ...(await readHeapUsage(debugConnection)) }); } catch {}
  return samples;
}

async function writeGameDevCapture(report) {
  const runDir = process.env.GAME_DEV_RUN_DIR;
  if (!runDir) return;
  const runId = process.env.GAME_DEV_RUN_ID;
  const adapterId = process.env.GAME_DEV_ADAPTER_ID;
  const scenarioId = process.env.GAME_DEV_SCENARIO_ID;
  if (!runId || !adapterId || !scenarioId) throw new Error('game-dev run context is incomplete');

  const screenshot = await cdp.call('Page.captureScreenshot', { format: 'png' });
  await writeFile(path.join(runDir, 'color.png'), Buffer.from(screenshot.data, 'base64'));
  const intervalP95 = report.rendering.rawAnimationFrameInterval.p95Ms;
  const callbackP95 = report.rendering.animateCallbackCpuDuration.p95Ms;
  const longTaskCount = report.rendering.longTasksOver50Ms.count;
  const measurements = [
    { metric: 'render.animation_frame_interval', value: intervalP95, unit: 'ms', aggregation: 'p95' },
    { metric: 'render.animate_callback_cpu', value: callbackP95, unit: 'ms', aggregation: 'p95' },
    { metric: 'render.long_task_count', value: longTaskCount, unit: 'count', aggregation: 'max' },
  ];
  if (!measurements.every((measurement) => Number.isFinite(measurement.value))) {
    throw new Error('browser performance report is missing finite capture measurements');
  }
  await writeFile(path.join(runDir, 'capture.json'), JSON.stringify({
    schema: 'game_dev.capture.v1', runId, adapterId, scenarioId,
    sourceFormat: 'game-dev-capture-v1',
    frames: [{ index: 0, label: 'performance-context-moving-2000-unit-match', attachments: [
      { kind: 'color', path: 'color.png', encoding: 'png' },
    ] }],
    measurements,
    adapterEvidence: {
      windowless: true,
      graphicsApi: report.browser.webgl.webglVersion === 2 ? 'WebGL2' : 'WebGL1',
      hardwarePerformanceReported: false,
      gpuExecutionReported: false,
      gpuCompletionIdentityReported: false,
      pixelVisualInspectionPerformed: false,
      notes: report.limitations,
    },
  }, null, 2));
}

async function main() {
  let browserCapture = {
    visiblePageUnits: 0,
    stateSnapshotSamples: 0,
    stateFramesObserved: 0,
    stateFramesParsed: 0,
    maxUnitsMovingBetweenStates: 0,
    latestPageState: null,
    previousPositions: null,
  };
  let heapSamples = [];
  let harness = null;
  let server = null;

  try {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), 'rts-browser-performance-'));
    const customMapDirectory = path.join(tempRoot, 'custom-maps');
    const chromeProfile = path.join(tempRoot, 'chrome-profile');
    const serverPort = await reservePort();
    const gameUrl = `http://127.0.0.1:${serverPort}/`;
    server = startChild('server', process.execPath, [SERVER_ENTRY], {
      env: {
        ...process.env,
        PORT: String(serverPort),
        RTS_HOST: '127.0.0.1',
        RTS_MAP: 'maps/open-field.json',
        RTS_CUSTOM_MAP_DIRECTORY: customMapDirectory,
        RTS_TICK_DIAGNOSTICS: '1',
      },
    });

    await waitForHealth(serverPort, (health) => health.ok === true, 'isolated server startup');
    const chromeExecutable = await findChromeExecutable();
    const launch = chromeLaunch(chromeExecutable, chromeProfile);
    const chrome = startChild('Chrome', launch.command, launch.args);
    const { port: debugPort, browserPath } = await waitForDevTools(chromeProfile, chrome);
    browserCdp = new CdpConnection(`ws://127.0.0.1:${debugPort}${browserPath}`);
    await browserCdp.open;
    const browserVersion = await browserCdp.call('Browser.getVersion');
    const target = await waitForPageTarget(debugPort);
    cdp = new CdpConnection(target.webSocketDebuggerUrl);
    await cdp.open;
    await cdp.call('Runtime.enable');
    await cdp.call('Page.enable');
    await cdp.call('Network.enable');
    await cdp.call('Emulation.setDeviceMetricsOverride', {
      width: 1280, height: 720, deviceScaleFactor: 1, mobile: false,
    });
    cdp.on('Network.webSocketFrameReceived', (event) => {
      if (event.response?.opcode !== 1 || typeof event.response.payloadData !== 'string') return;
      const payloadData = event.response.payloadData;
      const isWelcome = payloadData.startsWith('{"type":"welcome"');
      const isState = payloadData.startsWith('{"type":"state"');
      if (!isWelcome && !isState) return;
      if (isState) {
        browserCapture.stateFramesObserved++;
        if (browserCapture.stateFramesObserved % 4 !== 0) return;
        browserCapture.stateFramesParsed++;
      }
      try { parsePageState(JSON.parse(payloadData), browserCapture); } catch {}
    });
    await cdp.call('Page.addScriptToEvaluateOnNewDocument', {
      source: installBrowserInstrumentationExpression(),
    });

    harness = startChild('2,000-unit move scenario', process.execPath, [
      LOAD_SCENARIO, String(serverPort), String(durationSeconds), String(MOVEMENT_WAVES), 'move',
    ]);
    await waitForHealth(serverPort, (health) => health.connected === 2 && health.armySize === 2000,
      'both player seats and the 2,000-unit army');

    await cdp.call('Page.navigate', { url: gameUrl });
    const pageState = await waitForBrowserReady(cdp, browserCapture);
    assert.equal(pageState.boot, 'ready', 'the browser client should finish booting');
    assert.equal(browserCapture.visiblePageUnits, 2000,
      'the spectator browser should receive all 2,000 visible units');

    await cdp.evaluate('window.__rtsBrowserPerf.begin()');
    const rendererInfo = await cdp.evaluate('window.__rtsBrowserPerf.renderer');
    const viewportInfo = await cdp.evaluate(`(() => {
      const canvas = document.querySelector('#viewport canvas');
      return { width: innerWidth, height: innerHeight, devicePixelRatio,
        canvasWidth: canvas?.width ?? null, canvasHeight: canvas?.height ?? null };
    })()`);
    assert.equal(viewportInfo.width, 1280, 'desktop measurement viewport width');
    assert.equal(viewportInfo.height, 720, 'desktop measurement viewport height');
    const heapPolling = pollHeapUntilScenarioEnds(cdp, harness);
    const scenarioExit = await Promise.race([
      harness.exit,
      interruptPromise.then((signal) => { throw new Error(`Interrupted by ${signal}`); }),
    ]);
    heapSamples = await heapPolling;
    if (scenarioExit.code !== 0) throw new Error(childFailure(harness));

    const browserMetrics = await cdp.evaluate(`(() => {
      const frames = window.__rtsBrowserPerf?.frames || [];
      const tasks = window.__rtsBrowserPerf?.longTasks || [];
      return {
        measurementStartedAtMs: window.__rtsBrowserPerf?.measurementStartedAt,
        longAnimationFrameObserverAvailable: window.__rtsBrowserPerf?.longAnimationFrameObserverAvailable === true,
        longAnimationFrames: window.__rtsBrowserPerf?.longAnimationFrames || [],
        preWindowLongTasks: window.__rtsBrowserPerf?.preWindowLongTasks || [],
        longTaskObserverAvailable: window.__rtsBrowserPerf?.longTaskObserverAvailable === true,
        frameSamples: frames.map((sample) => ({
          timestampMs: sample.timestampMs,
          intervalMs: sample.intervalMs,
          callbackMs: sample.callbackMs,
        })),
        frameIntervalsMs: frames.map((sample) => sample.intervalMs),
        callbackDurationsMs: frames.map((sample) => sample.callbackMs),
        longTaskDurationsMs: tasks.map((task) => task.durationMs),
        longTaskSamples: tasks.map((task) => ({ durationMs: task.durationMs, startTimeMs: task.startTime })),
      };
    })()`);
    const scenarioOutput = JSON.parse(harness.stdout.slice(harness.stdout.indexOf('{')));
    assert.ok(browserMetrics.frameIntervalsMs.length > 0, 'browser should report animation-frame samples');
    assert.equal(browserMetrics.longTaskObserverAvailable, true,
      'browser should support long-task observation before applying the long-task budget');
    assert.equal(browserCapture.visiblePageUnits, 2000, 'browser should retain the full visible army during movement');
    assert.ok(browserCapture.maxUnitsMovingBetweenStates >= 1900,
      `the browser should receive at least 1,900 moving units in one state interval (saw ${browserCapture.maxUnitsMovingBetweenStates})`);
    assert.equal(browserMetrics.callbackDurationsMs.length, browserMetrics.frameIntervalsMs.length,
      'every animation-frame interval should include an animate callback CPU sample');
    const frameIntervalP95Ms = percentile(browserMetrics.frameIntervalsMs, 0.95);
    const animateCallbackP95Ms = percentile(browserMetrics.callbackDurationsMs, 0.95);
    const frameIntervalP95Passed = frameIntervalP95Ms !== null
      && frameIntervalP95Ms <= FRAME_INTERVAL_P95_BUDGET_MS;
    const animateCallbackP95Passed = animateCallbackP95Ms !== null
      && animateCallbackP95Ms <= ANIMATE_CALLBACK_P95_BUDGET_MS;
    const longTaskCountPassed = browserMetrics.longTaskDurationsMs.length <= LONG_TASK_COUNT_BUDGET;
    const renderBudgetsPassed = frameIntervalP95Passed && animateCallbackP95Passed && longTaskCountPassed;
    const slowFrameSamples = browserMetrics.frameSamples
      .filter((sample) => sample.intervalMs > FRAME_INTERVAL_P95_BUDGET_MS)
      .toSorted((left, right) => right.intervalMs - left.intervalMs)
      .slice(0, 10);

    const heapUsages = heapSamples.filter((sample) => Number.isFinite(sample.usedBytes));
    const lastHeap = heapUsages.at(-1) || null;
    const report = {
      workload: 'headless Chrome spectator rendering a moving 2,000-unit multiplayer match',
      requestedMovementWaveSeconds: durationSeconds,
      movementWaves: MOVEMENT_WAVES,
      nominalScenarioSeconds: durationSeconds * MOVEMENT_WAVES,
      measuredFrameWindowSeconds: Number((browserMetrics.frameIntervalsMs.reduce((sum, interval) => sum + interval, 0) / 1000).toFixed(2)),
      browser: {
        product: browserVersion.product || 'Chrome/Chromium',
        headless: true,
        pageUrl: gameUrl,
        viewport: viewportInfo,
        visiblePageUnits: browserCapture.visiblePageUnits,
        pageStateSamples: browserCapture.stateSnapshotSamples,
        stateFramesObserved: browserCapture.stateFramesObserved,
        stateFramesParsed: browserCapture.stateFramesParsed,
        maxUnitsMovingBetweenPageStates: browserCapture.maxUnitsMovingBetweenStates,
        webgl: rendererInfo,
      },
      rendering: {
        acceptance: {
          passed: renderBudgetsPassed,
          frameIntervalP95BudgetMs: FRAME_INTERVAL_P95_BUDGET_MS,
          frameIntervalP95Passed,
          animateCallbackP95BudgetMs: ANIMATE_CALLBACK_P95_BUDGET_MS,
          animateCallbackP95Passed,
          longTaskCountBudget: LONG_TASK_COUNT_BUDGET,
          longTaskCountPassed,
          longTaskObservationAvailable: browserMetrics.longTaskObserverAvailable,
        },
        rawAnimationFrameInterval: summarizeValues(browserMetrics.frameIntervalsMs),
        framesAboveConfiguredIntervalThreshold: {
          thresholdMs: FRAME_INTERVAL_P95_BUDGET_MS,
          count: browserMetrics.frameSamples.filter((sample) => sample.intervalMs > FRAME_INTERVAL_P95_BUDGET_MS).length,
          worstSamples: slowFrameSamples,
        },
        animateCallbackCpuDuration: summarizeValues(browserMetrics.callbackDurationsMs),
        longTasksOver50Ms: {
          count: browserMetrics.longTaskDurationsMs.length,
          maxMs: browserMetrics.longTaskDurationsMs.length
            ? Number(browserMetrics.longTaskDurationsMs.reduce((peak, value) => Math.max(peak, value), -Infinity).toFixed(3)) : null,
          samples: browserMetrics.longTaskSamples,
        },
        frameAttribution: {
          available: browserMetrics.longAnimationFrameObserverAvailable,
          measurementStartedAtMs: browserMetrics.measurementStartedAtMs,
          deferredPreWindowLongTasks: browserMetrics.preWindowLongTasks,
          samples: browserMetrics.longAnimationFrames,
        },
      },
      v8Heap: {
        samples: heapUsages.length,
        first: heapUsages[0] || null,
        last: lastHeap,
        peakUsedBytes: heapUsages.length
          ? heapUsages.reduce((peak, sample) => Math.max(peak, sample.usedBytes), -Infinity) : null,
      },
      serverScenario: scenarioOutput,
      limitations: [
        'Headless Chrome describes this browser/runtime setup; it is not a measurement of a windowed player session.',
        rendererInfo.backend === 'software'
          ? `This headless run used software WebGL rendering (${rendererInfo.renderer}); it does not establish hardware-GPU performance.`
          : `WebGL reported the ${rendererInfo.backend} backend (${rendererInfo.renderer}); headless timing still does not measure ordinary display presentation.`,
        'Animation callback duration is main-thread CPU time and does not measure GPU completion or display presentation latency.',
        'V8 heap is JavaScript heap usage, not total browser-process or GPU memory.',
      ],
    };
    await writeGameDevCapture(report);
    console.log(JSON.stringify(report, null, 2));
    assert.ok(frameIntervalP95Passed,
      `animation-frame interval p95 exceeded ${FRAME_INTERVAL_P95_BUDGET_MS} ms budget (measured ${frameIntervalP95Ms} ms)`);
    assert.ok(animateCallbackP95Passed,
      `animate callback p95 exceeded ${ANIMATE_CALLBACK_P95_BUDGET_MS} ms budget (measured ${animateCallbackP95Ms} ms)`);
    assert.ok(longTaskCountPassed,
      `long-task count exceeded ${LONG_TASK_COUNT_BUDGET} budget (observed ${browserMetrics.longTaskDurationsMs.length} tasks over 50 ms)`);
  } finally {
    cdp?.close();
    if (browserCdp) {
      try { await browserCdp.call('Browser.close', {}, 3000); } catch {}
      browserCdp.close();
    }
    await Promise.allSettled([
      stopChild(harness),
      stopChild([...children].find((record) => record.label === 'Chrome')),
      stopChild(server),
    ]);
    if (tempRoot) await rm(tempRoot, { recursive: true, force: true });
    process.removeListener('SIGINT', onSignal);
    process.removeListener('SIGTERM', onSignal);
  }
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = interruptSignal ? 130 : 1;
});
