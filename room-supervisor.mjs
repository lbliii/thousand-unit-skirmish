import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer, request as httpRequest } from 'node:http';
import { connect as connectTcp } from 'node:net';
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { configuredPublicOrigins, sameOriginRequest } from './origin-policy.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const WORKER_PATH = path.join(ROOT, 'server.mjs');
const HOST = process.env.RTS_HOST || '127.0.0.1';
const PORT = Number(process.env.PORT || 4173);
const MAX_ROOMS = Number(process.env.RTS_MAX_ROOMS || 4);
const ROOM_IDLE_TTL_MS = Number(process.env.RTS_ROOM_IDLE_TTL_MS || 6 * 60 * 60 * 1000);
const ROOM_ID_PATTERN = /^[A-Za-z0-9_-]{32}$/;
const RAILWAY_DEPLOYMENT = Boolean(process.env.RAILWAY_PROJECT_ID || process.env.RAILWAY_ENVIRONMENT);
const PUBLIC_ORIGINS = configuredPublicOrigins();
const VOLUME_MOUNT_PATH = process.env.RAILWAY_VOLUME_MOUNT_PATH || null;
const ACCESS_USER = process.env.RTS_ACCESS_USER || 'players';
const ACCESS_PASSWORD = process.env.RTS_ACCESS_PASSWORD || null;
const ACCESS_HASH = ACCESS_PASSWORD
  ? createHash('sha256').update(`${ACCESS_USER}:${ACCESS_PASSWORD}`).digest() : null;
const ROOM_DATA_DIRECTORY = path.resolve(ROOT, process.env.RTS_ROOM_DATA_DIRECTORY
  || (VOLUME_MOUNT_PATH ? path.join(VOLUME_MOUNT_PATH, 'room-data') : 'room-data'));
const ROOM_DIRECTORY = path.join(ROOM_DATA_DIRECTORY, 'rooms');
const ROOM_INDEX_PATH = path.join(ROOM_DATA_DIRECTORY, 'rooms.json');
const DEFAULT_MATCH_STATE_PATH = path.join(ROOM_DATA_DIRECTORY, 'default-match-state.json');
const DEFAULT_MAP_DIRECTORY = path.resolve(ROOT, process.env.RTS_CUSTOM_MAP_DIRECTORY
  || (VOLUME_MOUNT_PATH ? path.join(VOLUME_MOUNT_PATH, 'custom-maps') : 'custom-maps'));
const WORKER_START_TIMEOUT_MS = 15_000;
const WORKER_STOP_TIMEOUT_MS = 7_000;
const INDEX_SAVE_INTERVAL_MS = 20_000;
const ROOM_SWEEP_INTERVAL_MS = 60_000;

if (RAILWAY_DEPLOYMENT && !VOLUME_MOUNT_PATH) {
  throw new Error('Attach a Railway volume before starting the match service.');
}
if (VOLUME_MOUNT_PATH && !path.isAbsolute(VOLUME_MOUNT_PATH)) {
  throw new Error('RAILWAY_VOLUME_MOUNT_PATH must be an absolute path.');
}
if (RAILWAY_DEPLOYMENT && (!ACCESS_PASSWORD || ACCESS_PASSWORD.length < 16)) {
  throw new Error('Set RTS_ACCESS_PASSWORD to at least 16 characters before exposing the Railway service.');
}
if (RAILWAY_DEPLOYMENT && PUBLIC_ORIGINS.size === 0) {
  throw new Error('Set RAILWAY_PUBLIC_DOMAIN or RTS_PUBLIC_ORIGINS before exposing the match service.');
}
if (VOLUME_MOUNT_PATH) {
  const mount = path.resolve(VOLUME_MOUNT_PATH);
  const onVolume = (directory) => directory.startsWith(`${mount}${path.sep}`);
  if (!onVolume(ROOM_DATA_DIRECTORY) || !onVolume(DEFAULT_MAP_DIRECTORY)) {
    throw new Error('Room data and custom maps must both be stored on the attached volume.');
  }
}

if (!Number.isInteger(MAX_ROOMS) || MAX_ROOMS < 1 || MAX_ROOMS > 32) {
  throw new Error('RTS_MAX_ROOMS must be an integer between 1 and 32.');
}
if (!Number.isFinite(ROOM_IDLE_TTL_MS) || ROOM_IDLE_TTL_MS < 60_000 || ROOM_IDLE_TTL_MS > 30 * 24 * 60 * 60 * 1000) {
  throw new Error('RTS_ROOM_IDLE_TTL_MS must be between one minute and 30 days.');
}

const rooms = new Map();
const workerProcesses = new Set();
const proxySockets = new Set();
let stopping = false;
let defaultWorker = null;
let defaultWorkerStarting = null;
let indexSaveQueue = Promise.resolve();

function makeRoom(id, timestamps = {}) {
  const directory = path.join(ROOM_DIRECTORY, id);
  return {
    id,
    directory,
    customMapDirectory: path.join(directory, 'custom-maps'),
    matchStatePath: path.join(directory, 'match-state.json'),
    createdAt: Number.isFinite(timestamps.createdAt) ? timestamps.createdAt : Date.now(),
    lastActiveAt: Number.isFinite(timestamps.lastActiveAt) ? timestamps.lastActiveAt : Date.now(),
    lastIndexWriteAt: 0,
    activeConnections: 0,
    worker: null,
    starting: null,
  };
}

function persistRoomIndex() {
  const operation = indexSaveQueue.catch(() => {}).then(async () => {
    const payload = {
      version: 1,
      rooms: [...rooms.values()].map(({ id, createdAt, lastActiveAt }) => ({ id, createdAt, lastActiveAt })),
    };
    await mkdir(ROOM_DATA_DIRECTORY, { recursive: true });
    const temporaryPath = `${ROOM_INDEX_PATH}.${process.pid}.tmp`;
    await writeFile(temporaryPath, JSON.stringify(payload), { mode: 0o600 });
    await rename(temporaryPath, ROOM_INDEX_PATH);
  });
  indexSaveQueue = operation;
  return operation;
}

async function loadRooms() {
  await mkdir(ROOM_DIRECTORY, { recursive: true });
  let savedRooms = [];
  let validIndex = false;
  let indexState = 'missing';
  try {
    const index = JSON.parse(await readFile(ROOM_INDEX_PATH, 'utf8'));
    indexState = 'invalid';
    if (index?.version === 1 && Array.isArray(index.rooms)) {
      const seenIds = new Set();
      validIndex = index.rooms.every((entry) => {
        const valid = entry && typeof entry === 'object'
          && ROOM_ID_PATTERN.test(entry.id || '')
          && Number.isFinite(entry.createdAt)
          && Number.isFinite(entry.lastActiveAt)
          && !seenIds.has(entry.id);
        if (valid) seenIds.add(entry.id);
        return valid;
      });
      if (validIndex) {
        savedRooms = index.rooms;
        indexState = 'valid';
      }
    }
  } catch (error) {
    if (error.code !== 'ENOENT') indexState = 'invalid';
  }
  const now = Date.now();
  const retained = new Set();
  if (validIndex) {
    savedRooms.sort((a, b) => b.lastActiveAt - a.lastActiveAt);
    for (const entry of savedRooms) {
      const directory = path.join(ROOM_DIRECTORY, entry.id);
      if (now - entry.lastActiveAt >= ROOM_IDLE_TTL_MS) {
        await rm(directory, { recursive: true, force: true });
        continue;
      }
      try {
        if (!(await stat(directory)).isDirectory()) continue;
      } catch { continue; }
      rooms.set(entry.id, makeRoom(entry.id, {
        createdAt: entry.createdAt,
        lastActiveAt: entry.lastActiveAt,
      }));
      retained.add(entry.id);
    }
  } else {
    if (indexState === 'invalid') {
      console.warn('Room index is malformed or unsupported; preserving room directories and rebuilding the index.');
    }
  }

  let recoveredCount = 0;
  for (const entry of await readdir(ROOM_DIRECTORY, { withFileTypes: true })) {
    if (!entry.isDirectory() || !ROOM_ID_PATTERN.test(entry.name) || retained.has(entry.name)) continue;
    try {
      if (!(await stat(path.join(ROOM_DIRECTORY, entry.name))).isDirectory()) continue;
    } catch { continue; }
    // Keep directories omitted by an old index. Without trustworthy activity
    // timestamps, restarting their idle window is safer than deleting player data.
    rooms.set(entry.name, makeRoom(entry.name, { createdAt: now, lastActiveAt: now }));
    retained.add(entry.name);
    recoveredCount++;
  }
  if (recoveredCount > 0) {
    console.warn(`Recovered ${recoveredCount} room director${recoveredCount === 1 ? 'y' : 'ies'} missing from the index.`);
  }

  if (rooms.size > MAX_ROOMS) {
    console.warn(`Recovered ${rooms.size} saved rooms above the current limit of ${MAX_ROOMS}; new room creation is disabled until capacity is available.`);
  }
  await persistRoomIndex();
}

function touchRoom(room) {
  room.lastActiveAt = Date.now();
}

function sameOrigin(request) {
  return sameOriginRequest(request, {
    allowedOrigins: PUBLIC_ORIGINS,
    httpsTerminatedAtEdge: RAILWAY_DEPLOYMENT,
  });
}

function hasAccess(request) {
  if (!ACCESS_HASH) return true;
  const header = request.headers.authorization;
  if (typeof header !== 'string' || header.length > 1024 || !/^Basic [A-Za-z0-9+/]+={0,2}$/.test(header)) return false;
  const supplied = createHash('sha256').update(Buffer.from(header.slice(6), 'base64')).digest();
  return timingSafeEqual(supplied, ACCESS_HASH);
}

function requireAccess(response) {
  response.writeHead(401, {
    'www-authenticate': 'Basic realm="Thousand Unit Skirmish", charset="UTF-8"',
    'cache-control': 'no-store',
    'content-type': 'text/plain; charset=utf-8',
  });
  response.end('Authentication required.');
}

function sendJson(response, status, value) {
  const body = Buffer.from(JSON.stringify(value));
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': body.length,
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  response.end(body);
}

async function createRoom() {
  if (rooms.size >= MAX_ROOMS) {
    const error = new Error('Room capacity reached. Close an idle invite room and try again later.');
    error.statusCode = 429;
    throw error;
  }
  let id;
  do { id = randomBytes(24).toString('base64url'); } while (rooms.has(id));
  const room = makeRoom(id);
  rooms.set(id, room);
  try {
    await mkdir(room.customMapDirectory, { recursive: true });
    await persistRoomIndex();
    return room;
  } catch (error) {
    rooms.delete(id);
    await rm(room.directory, { recursive: true, force: true });
    throw error;
  }
}

function logWorkerOutput(label, stream, isError = false) {
  let pending = '';
  stream.setEncoding('utf8');
  stream.on('data', (chunk) => {
    pending += chunk;
    const lines = pending.split(/\r?\n/);
    pending = lines.pop() || '';
    for (const line of lines) {
      if (!line) continue;
      (isError ? console.error : console.log)(`[${label}] ${line}`);
    }
  });
  stream.on('end', () => {
    if (pending) (isError ? console.error : console.log)(`[${label}] ${pending}`);
  });
}

function startWorker(customMapDirectory, matchStatePath, label) {
  return new Promise((resolve, reject) => {
    const { RTS_ACCESS_PASSWORD: _accessPassword, ...workerEnvironment } = process.env;
    const child = spawn(process.execPath, [WORKER_PATH], {
      cwd: ROOT,
      env: {
        ...workerEnvironment,
        PORT: '0',
        RTS_HOST: '127.0.0.1',
        RTS_CUSTOM_MAP_DIRECTORY: customMapDirectory,
        RTS_MATCH_STATE_PATH: matchStatePath,
        RTS_MANAGED_WORKER: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    });
    workerProcesses.add(child);
    console.log(`[${label}] worker pid=${child.pid}`);
    logWorkerOutput(label, child.stdout);
    logWorkerOutput(label, child.stderr, true);

    let settled = false;
    const timeout = setTimeout(() => fail(new Error(`${label} did not become ready in time.`)), WORKER_START_TIMEOUT_MS);
    const fail = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      child.kill('SIGTERM');
      reject(error);
    };
    child.on('message', (message) => {
      if (settled || message?.type !== 'ready' || !Number.isInteger(message.port) || message.port < 1) return;
      settled = true;
      clearTimeout(timeout);
      resolve({ child, port: message.port });
    });
    child.once('error', fail);
    child.once('exit', (code, signal) => {
      workerProcesses.delete(child);
      if (!settled) fail(new Error(`${label} exited before startup (code ${code ?? 'null'}, signal ${signal ?? 'none'}).`));
    });
  });
}

async function ensureRoomWorker(room) {
  if (room.worker?.child.exitCode === null) return room.worker;
  if (room.starting) return room.starting;
  room.starting = (async () => {
    await mkdir(room.customMapDirectory, { recursive: true });
    const worker = await startWorker(room.customMapDirectory, room.matchStatePath, `room ${room.id.slice(0, 8)}`);
    room.worker = worker;
    worker.child.once('exit', () => {
      if (room.worker !== worker) return;
      room.worker = null;
      touchRoom(room);
      void persistRoomIndex().catch((error) => console.error('Could not save room index:', error));
    });
    return worker;
  })();
  try { return await room.starting; }
  finally { room.starting = null; }
}

async function ensureDefaultWorker() {
  if (defaultWorker?.child.exitCode === null) return defaultWorker;
  if (stopping) throw new Error('Room service is shutting down.');
  if (defaultWorkerStarting) return defaultWorkerStarting;
  defaultWorkerStarting = (async () => {
    await mkdir(DEFAULT_MAP_DIRECTORY, { recursive: true });
    const worker = await startWorker(DEFAULT_MAP_DIRECTORY, DEFAULT_MATCH_STATE_PATH, 'default room');
    defaultWorker = worker;
    worker.child.once('exit', (code, signal) => {
      if (defaultWorker !== worker) return;
      defaultWorker = null;
      if (!stopping) {
        console.error(`[default room] worker exited (code ${code ?? 'null'}, signal ${signal ?? 'none'}); it will restart on demand.`);
      }
    });
    return worker;
  })();
  try { return await defaultWorkerStarting; }
  finally { defaultWorkerStarting = null; }
}

function proxyHttp(request, response, worker) {
  const headers = { ...request.headers, host: `127.0.0.1:${worker.port}` };
  delete headers.connection;
  delete headers.authorization;
  delete headers['x-forwarded-host'];
  delete headers['x-forwarded-proto'];
  const upstream = httpRequest({
    hostname: '127.0.0.1', port: worker.port, path: request.url,
    method: request.method, headers,
  }, (upstreamResponse) => {
    response.writeHead(upstreamResponse.statusCode || 502, upstreamResponse.statusMessage, upstreamResponse.headers);
    upstreamResponse.pipe(response);
  });
  upstream.on('error', () => {
    if (response.headersSent) response.destroy();
    else sendJson(response, 502, { error: 'Match server is unavailable.' });
  });
  request.pipe(upstream);
}

function readWorkerHealth(worker) {
  return new Promise((resolve) => {
    if (!worker || worker.child.exitCode !== null) { resolve(null); return; }
    let settled = false;
    const finish = (health) => {
      if (settled) return;
      settled = true;
      resolve(health);
    };
    const upstream = httpRequest({
      hostname: '127.0.0.1', port: worker.port, path: '/health', method: 'GET',
      headers: { host: `127.0.0.1:${worker.port}`, connection: 'close' },
    }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => {
        try {
          const health = JSON.parse(body);
          finish(response.statusCode === 200 && health?.ok ? health : null);
        } catch { finish(null); }
      });
    });
    upstream.setTimeout(1500, () => upstream.destroy());
    upstream.on('error', () => finish(null));
    upstream.end();
  });
}

function rejectUpgrade(socket, status, phrase) {
  const body = Buffer.from(`${phrase}\n`);
  const challenge = status === 401 ? 'WWW-Authenticate: Basic realm="Thousand Unit Skirmish", charset="UTF-8"\r\n' : '';
  socket.end(`HTTP/1.1 ${status} ${phrase}\r\n${challenge}Connection: close\r\nContent-Length: ${body.length}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${body}`);
}

function proxyUpgrade(request, socket, head, worker, room = null) {
  const upstream = connectTcp(worker.port, '127.0.0.1');
  proxySockets.add(socket);
  let counted = false;
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    proxySockets.delete(socket);
    if (counted && room) {
      room.activeConnections = Math.max(0, room.activeConnections - 1);
      touchRoom(room);
      void persistRoomIndex().catch((error) => console.error('Could not save room index:', error));
    }
  };
  const rejectUnavailable = () => {
    if (!socket.destroyed) rejectUpgrade(socket, 503, 'Service Unavailable');
    finish();
  };
  const connectTimeout = setTimeout(() => {
    rejectUnavailable();
    upstream.destroy();
  }, 5000);
  upstream.once('connect', () => {
    clearTimeout(connectTimeout);
    if (socket.destroyed) { upstream.destroy(); finish(); return; }
    const headers = [];
    for (let index = 0; index < request.rawHeaders.length; index += 2) {
      const name = request.rawHeaders[index];
      const lower = name.toLowerCase();
      if (['authorization', 'x-forwarded-host', 'x-forwarded-proto', 'x-forwarded-for', 'forwarded'].includes(lower)) continue;
      headers.push(`${name}: ${request.rawHeaders[index + 1]}`);
    }
    upstream.write(`${request.method} ${request.url} HTTP/${request.httpVersion}\r\n${headers.join('\r\n')}\r\n\r\n`);
    if (head?.length) upstream.write(head);
    socket.pipe(upstream);
    upstream.pipe(socket);
    socket.on('data', () => { if (room) touchRoom(room); });
    upstream.on('data', () => { if (room) touchRoom(room); });
    if (room) {
      room.activeConnections++;
      touchRoom(room);
      counted = true;
    }
  });
  socket.on('close', () => { clearTimeout(connectTimeout); upstream.destroy(); finish(); });
  socket.on('error', () => { clearTimeout(connectTimeout); upstream.destroy(); finish(); });
  upstream.on('close', () => { clearTimeout(connectTimeout); if (!socket.destroyed) socket.destroy(); finish(); });
  upstream.on('error', () => {
    clearTimeout(connectTimeout);
    if (!counted) rejectUnavailable();
    else { socket.destroy(); finish(); }
  });
}

async function handleRequest(request, response) {
  if (stopping) { sendJson(response, 503, { error: 'Room service is restarting.' }); return; }
  let url;
  try { url = new URL(request.url || '/', `http://${request.headers.host || `${HOST}:${PORT}`}`); }
  catch { sendJson(response, 400, { error: 'Bad request.' }); return; }

  if (url.pathname === '/ready' || url.pathname === '/health') {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      sendJson(response, 405, { error: 'Method not allowed.' });
      return;
    }
    if (url.pathname === '/health' && !hasAccess(request)) { requireAccess(response); return; }
    let worker = null;
    try { worker = await ensureDefaultWorker(); } catch {}
    const matchHealth = await readWorkerHealth(worker);
    const ok = Boolean(matchHealth);
    if (url.pathname === '/ready') {
      sendJson(response, ok ? 200 : 503, { ok });
      return;
    }
    sendJson(response, ok ? 200 : 503, {
      ...(matchHealth || {}),
      ok,
      roomCount: rooms.size,
      roomLimit: MAX_ROOMS,
      liveRoomProcesses: [...rooms.values()].filter((room) => room.worker?.child.exitCode === null).length,
      connectedInvitePeers: [...rooms.values()].reduce((total, room) => total + room.activeConnections, 0),
    });
    return;
  }

  if (!hasAccess(request)) { requireAccess(response); return; }

  if (url.pathname === '/api/rooms/status' && request.method === 'GET') {
    sendJson(response, 200, { enabled: true, roomCount: rooms.size, roomLimit: MAX_ROOMS });
    return;
  }

  if (url.pathname === '/api/rooms' && request.method === 'POST') {
    if (!sameOrigin(request)) { sendJson(response, 403, { error: 'Cross-origin room creation is not allowed.' }); return; }
    request.resume();
    try {
      const room = await createRoom();
      sendJson(response, 201, { roomId: room.id });
    } catch (error) {
      sendJson(response, Number.isInteger(error.statusCode) ? error.statusCode : 500, { error: String(error.message || error) });
    }
    return;
  }

  const roomMatch = url.pathname.match(/^\/api\/rooms\/([^/]+)$/);
  if (roomMatch && request.method === 'GET') {
    const id = roomMatch[1];
    const room = ROOM_ID_PATTERN.test(id) ? rooms.get(id) : null;
    if (!room) { sendJson(response, 404, { error: 'Room not found.' }); return; }
    if (room.activeConnections === 0 && Date.now() - room.lastActiveAt >= ROOM_IDLE_TTL_MS) {
      await deleteRoom(room);
      sendJson(response, 404, { error: 'Room expired.' });
      return;
    }
    sendJson(response, 200, { ok: true, roomId: room.id });
    return;
  }

  try {
    const worker = await ensureDefaultWorker();
    proxyHttp(request, response, worker);
  } catch {
    sendJson(response, 503, { error: 'Default match server is unavailable.' });
  }
}

async function handleUpgrade(request, socket, head) {
  if (stopping) { rejectUpgrade(socket, 503, 'Service Unavailable'); return; }
  if (!hasAccess(request)) { rejectUpgrade(socket, 401, 'Unauthorized'); return; }
  let url;
  try { url = new URL(request.url || '/', `http://${request.headers.host || `${HOST}:${PORT}`}`); }
  catch { rejectUpgrade(socket, 400, 'Bad Request'); return; }
  if (url.pathname !== '/ws') { rejectUpgrade(socket, 404, 'Not Found'); return; }
  if (!sameOrigin(request)) { rejectUpgrade(socket, 403, 'Forbidden'); return; }

  const roomId = url.searchParams.get('room');
  if (roomId === null) {
    try {
      const worker = await ensureDefaultWorker();
      if (socket.destroyed || stopping) return;
      proxyUpgrade(request, socket, head, worker);
    } catch (error) {
      console.error('Could not start the default match:', error);
      rejectUpgrade(socket, 503, 'Service Unavailable');
    }
    return;
  }
  if (!ROOM_ID_PATTERN.test(roomId)) { rejectUpgrade(socket, 400, 'Bad Request'); return; }
  const room = rooms.get(roomId);
  if (!room) { rejectUpgrade(socket, 404, 'Not Found'); return; }
  try {
    const worker = await ensureRoomWorker(room);
    if (socket.destroyed || stopping) return;
    proxyUpgrade(request, socket, head, worker, room);
  } catch (error) {
    console.error(`Could not start room ${roomId.slice(0, 8)}:`, error);
    rejectUpgrade(socket, 503, 'Service Unavailable');
  }
}

async function deleteRoom(room) {
  if (rooms.get(room.id) !== room || room.activeConnections > 0) return;
  rooms.delete(room.id);
  await stopWorker(room.worker);
  room.worker = null;
  await rm(room.directory, { recursive: true, force: true });
  await persistRoomIndex();
}

async function stopWorker(worker) {
  const child = worker?.child;
  if (!child || child.exitCode !== null) return;
  const exited = once(child, 'exit').catch(() => {});
  child.kill('SIGTERM');
  await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, WORKER_STOP_TIMEOUT_MS))]);
  if (child.exitCode === null) {
    const killed = once(child, 'exit').catch(() => {});
    child.kill('SIGKILL');
    await killed;
  }
}

const SHIPPED_MAP_DIRECTORY = path.join(ROOT, 'maps');
if (ROOM_DATA_DIRECTORY === SHIPPED_MAP_DIRECTORY
  || ROOM_DATA_DIRECTORY.startsWith(`${SHIPPED_MAP_DIRECTORY}${path.sep}`)
  || ROOM_DATA_DIRECTORY === DEFAULT_MAP_DIRECTORY
  || ROOM_DATA_DIRECTORY.startsWith(`${DEFAULT_MAP_DIRECTORY}${path.sep}`)) {
  throw new Error('RTS_ROOM_DATA_DIRECTORY must remain separate from map directories.');
}
await mkdir(ROOM_DATA_DIRECTORY, { recursive: true });
await loadRooms();
await mkdir(DEFAULT_MAP_DIRECTORY, { recursive: true });
const server = createServer((request, response) => { void handleRequest(request, response); });
server.on('upgrade', (request, socket, head) => { void handleUpgrade(request, socket, head); });
await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(PORT, HOST, () => {
    const address = server.address();
    console.log(`RTS room supervisor listening at http://${HOST}:${address.port} · ${rooms.size} invite rooms`);
    resolve();
  });
});
await ensureDefaultWorker();

const indexTimer = setInterval(() => {
  void persistRoomIndex().catch((error) => console.error('Could not save room index:', error));
}, INDEX_SAVE_INTERVAL_MS);
indexTimer.unref();

const roomSweepTimer = setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) {
    if (room.activeConnections === 0 && now - room.lastActiveAt >= ROOM_IDLE_TTL_MS) {
      void deleteRoom(room).catch((error) => console.error(`Could not expire room ${room.id.slice(0, 8)}:`, error));
    }
  }
}, ROOM_SWEEP_INTERVAL_MS);
roomSweepTimer.unref();

async function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  clearInterval(indexTimer);
  clearInterval(roomSweepTimer);
  console.log(`RTS room supervisor draining after ${signal}.`);
  server.close();
  await persistRoomIndex().catch((error) => console.error('Could not save room index:', error));
  await Promise.all([...workerProcesses].map((child) => stopWorker({ child })));
  for (const socket of proxySockets) socket.destroy();
  server.closeAllConnections?.();
  console.log('RTS room supervisor shutdown complete.');
}

process.on('SIGTERM', () => { void shutdown('SIGTERM'); });
process.on('SIGINT', () => { void shutdown('SIGINT'); });
