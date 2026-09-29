import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { request as httpsRequest } from 'node:https';
import { createOrderProbe, parseScaleProfile } from './hosted-scale-profile.mjs';

const scaleProfile = parseScaleProfile(process.argv.slice(2));
const baseUrl = new URL(process.argv[2] || '');
assert.equal(baseUrl.protocol, 'https:', 'pass the staging HTTPS origin');
assert.ok(process.env.RTS_ACCESS_PASSWORD, 'RTS_ACCESS_PASSWORD must be supplied through the staging environment');
const user = process.env.RTS_ACCESS_USER || 'players';
const authorization = `Basic ${Buffer.from(`${user}:${process.env.RTS_ACCESS_PASSWORD}`).toString('base64')}`;
const headers = { authorization };
const clients = [];
const stress = process.argv.includes('--stress');
const reuseRoomId = process.argv.find((argument) => argument.startsWith('--room-id='))?.slice('--room-id='.length);
if (reuseRoomId) assert.match(reuseRoomId, /^[A-Za-z0-9_-]{32}$/, 'invalid QA room ID');
let stage = 'readiness';

function percentile(values, fraction) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)] ?? 0;
}

async function request(path, options = {}) {
  return fetch(new URL(path, baseUrl), {
    signal: AbortSignal.timeout(10_000),
    ...options,
    headers: { ...headers, ...options.headers },
  });
}

// Node's built-in WebSocket does not pass a Basic Auth header to this server.
// Use a native HTTPS upgrade and masked client frames without adding a test dependency.
function maskedFrame(payload, opcode = 1) {
  const data = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
  const header = data.length < 126 ? Buffer.from([0x80 | opcode, 0x80 | data.length])
    : data.length <= 0xffff
      ? Buffer.from([0x80 | opcode, 0xfe, data.length >> 8, data.length & 0xff])
      : (() => { throw new Error('QA command frame is too large'); })();
  const mask = randomBytes(4);
  const masked = Buffer.from(data);
  for (let index = 0; index < masked.length; index++) masked[index] ^= mask[index % 4];
  return Buffer.concat([header, mask, masked]);
}

async function connect(roomId, resumeToken = null) {
  const url = new URL(baseUrl);
  url.pathname = '/ws';
  url.searchParams.set('room', roomId);
  const protocols = ['rts-v1'];
  if (resumeToken) protocols.push(`rts-resume.${resumeToken}`);
  const client = { socket: null, messages: [], waiters: [], failure: null, stateFrames: [],
    latestState: null, orderProbe: null, armyResetVersion: 0 };
  function failWaiters(error) {
    client.failure = error;
    for (const waiter of client.waiters.splice(0)) {
      clearTimeout(waiter.timer);
      waiter.reject(error);
    }
  }
  function acceptMessage(payload) {
    let message;
    try { message = JSON.parse(payload.toString('utf8')); } catch { return; }
    const at = performance.now();
    if (message.type === 'notice' && message.message?.startsWith('BATTLEFIELD RESET ·')) {
      client.armyResetVersion++;
    }
    client.orderProbe?.observe(message, at);
    if (['state', 'welcome', 'mapChange'].includes(message.type)) {
      client.latestState = message.type === 'state' ? message : message.state;
    }
    if (message.type === 'state') client.stateFrames.push({
      at, bytes: payload.length, tick: message.tick,
      armySize: message.armySize, connected: message.connected,
    });
    client.messages.push(message);
    // Retain recent protocol history, not every full roster in a sustained run.
    if (client.messages.length > 128) client.messages.shift();
    for (let index = client.waiters.length - 1; index >= 0; index--) {
      const waiter = client.waiters[index];
      if (!waiter.predicate(message)) continue;
      client.waiters.splice(index, 1);
      clearTimeout(waiter.timer);
      waiter.resolve(message);
    }
  }
  client.waitFor = (predicate, timeoutMs = 15_000) => {
    const existing = client.messages.find(predicate);
    if (existing) return Promise.resolve(existing);
    if (client.failure) return Promise.reject(client.failure);
    return new Promise((resolve, reject) => {
      const waiter = { predicate, resolve, reject, timer: setTimeout(() => {
        client.waiters.splice(client.waiters.indexOf(waiter), 1);
        reject(new Error('Timed out waiting for a staging WebSocket message'));
      }, timeoutMs) };
      client.waiters.push(waiter);
    });
  };
  client.waitNext = (predicate, timeoutMs = 15_000) => new Promise((resolve, reject) => {
    const waiter = { predicate, resolve, reject, timer: setTimeout(() => {
      client.waiters.splice(client.waiters.indexOf(waiter), 1);
      reject(new Error('Timed out waiting for a new staging WebSocket message'));
    }, timeoutMs) };
    client.waiters.push(waiter);
  });
  client.send = (message) => client.socket.write(maskedFrame(JSON.stringify(message)));
  const key = randomBytes(16).toString('base64');
  await new Promise((resolve, reject) => {
    const connection = httpsRequest(url, { headers: {
      authorization, origin: baseUrl.origin,
      connection: 'Upgrade', upgrade: 'websocket',
      'sec-websocket-version': '13', 'sec-websocket-key': key,
      'sec-websocket-protocol': protocols.join(', '),
    } });
    connection.setTimeout(10_000, () => connection.destroy(new Error('WebSocket upgrade timed out')));
    connection.once('response', (response) => {
      response.resume();
      reject(new Error(`WebSocket upgrade returned HTTP ${response.statusCode}`));
    });
    connection.once('error', reject);
    connection.once('upgrade', (response, socket, head) => {
      if (response.statusCode !== 101) {
        socket.destroy();
        reject(new Error(`WebSocket upgrade returned HTTP ${response.statusCode}`));
        return;
      }
      client.socket = socket;
      let buffer = Buffer.alloc(0);
      function consume(chunk) {
        buffer = Buffer.concat([buffer, chunk]);
        while (buffer.length >= 2) {
          const opcode = buffer[0] & 0x0f;
          const masked = (buffer[1] & 0x80) !== 0;
          let length = buffer[1] & 0x7f;
          let offset = 2;
          if (length === 126) {
            if (buffer.length < 4) return;
            length = buffer.readUInt16BE(2);
            offset = 4;
          } else if (length === 127) {
            if (buffer.length < 10) return;
            length = Number(buffer.readBigUInt64BE(2));
            offset = 10;
          }
          if (masked || !Number.isSafeInteger(length) || length > 8_000_000) {
            failWaiters(new Error('Invalid staging WebSocket frame'));
            socket.destroy();
            return;
          }
          if (buffer.length < offset + length) return;
          const payload = buffer.subarray(offset, offset + length);
          buffer = buffer.subarray(offset + length);
          if (opcode === 1) acceptMessage(payload);
          else if (opcode === 9) socket.write(maskedFrame(payload, 10));
          else if (opcode === 8) { socket.destroy(); return; }
        }
      }
      socket.on('data', consume);
      socket.once('error', (error) => failWaiters(error));
      socket.once('close', () => failWaiters(new Error('Staging WebSocket closed')));
      if (head.length) consume(head);
      resolve();
    });
    connection.end();
  });
  clients.push(client);
  return client;
}

async function close(client) {
  if (!client?.socket || client.socket.destroyed) return;
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 3000);
    client.socket.once('close', () => { clearTimeout(timer); resolve(); });
    client.socket.end(maskedFrame(Buffer.from([0x03, 0xe8]), 8));
  });
  if (!client.socket.destroyed) client.socket.destroy();
}

try {
  const ready = await fetch(new URL('/ready', baseUrl), { signal: AbortSignal.timeout(10_000) });
  assert.equal(ready.status, 200, 'public readiness should succeed');
  assert.equal((await ready.json()).ok, true);
  assert.equal((await fetch(baseUrl, { signal: AbortSignal.timeout(10_000) })).status, 401,
    'game should require access credentials');
  for (const asset of ['/', '/src/main.js', '/vendor/three.module.js', '/vendor/three.core.js']) {
    const response = await request(asset);
    assert.equal(response.status, 200, `${asset} should load with staging credentials`);
    await response.arrayBuffer();
  }

  stage = 'creating invite room';
  const roomResponse = reuseRoomId
    ? await request(`/api/rooms/${reuseRoomId}`)
    : await request('/api/rooms', { method: 'POST', headers: { origin: baseUrl.origin } });
  assert.equal(roomResponse.status, reuseRoomId ? 200 : 201,
    reuseRoomId ? 'the QA invite room should still exist' : 'a new invite room should be created');
  const { roomId } = reuseRoomId ? { roomId: reuseRoomId } : await roomResponse.json();
  assert.match(roomId, /^[A-Za-z0-9_-]{32}$/);

  stage = 'joining Azure';
  const azure = await connect(roomId);
  const azureWelcome = await azure.waitFor((message) => message.type === 'welcome');
  assert.equal(azureWelcome.player.team, 0);
  stage = 'joining Ember';
  let ember = await connect(roomId);
  const emberWelcome = await ember.waitFor((message) => message.type === 'welcome');
  assert.equal(emberWelcome.player.team, 1);
  assert.equal(emberWelcome.matchId, azureWelcome.matchId);
  assert.equal(emberWelcome.state.mapId, azureWelcome.state.mapId);

  stage = 'resuming Azure';
  await close(azure);
  const resumed = await connect(roomId, azureWelcome.player.sessionToken);
  const resumedWelcome = await resumed.waitFor((message) => message.type === 'welcome');
  assert.equal(resumedWelcome.player.team, 0);
  assert.equal(resumedWelcome.player.resumed, true);
  assert.equal(resumedWelcome.matchId, azureWelcome.matchId);

  stage = 'resuming Ember';
  await close(ember);
  ember = await connect(roomId, emberWelcome.player.sessionToken);
  const resumedEmberWelcome = await ember.waitFor((message) => message.type === 'welcome');
  assert.equal(resumedEmberWelcome.player.team, 1);
  assert.equal(resumedEmberWelcome.player.resumed, true);
  assert.equal(resumedEmberWelcome.matchId, azureWelcome.matchId);

  stage = 'saving an authored scenario';
  const baseMap = JSON.parse(await readFile(new URL('../maps/open-field.json', import.meta.url), 'utf8'));
  const map = {
    ...baseMap,
    id: `qa-staging-${Date.now().toString(36)}`,
    name: 'QA Staging Duel',
    spawnPoints: [{ team: 0, x: -5, z: 0 }, { team: 1, x: 5, z: 0 }],
    resourceNodes: [], obstacles: [], triggers: [], fogOfWar: false,
  };
  const mapSaved = resumed.waitNext((message) => message.type === 'mapPublished' && message.mapId === map.id);
  const initialMapChanges = [resumed, ember].map((client) => client.waitNext((message) => (
    message.type === 'mapChange' && message.map.id === map.id
  )));
  resumed.send({ type: 'publishMap', map, persist: true });
  const [saved] = await Promise.all([mapSaved, ...initialMapChanges]);
  assert.equal(saved.persisted, true);

  stage = 'reloading the authored scenario';
  const shippedMapChanges = [resumed, ember].map((client) => client.waitNext((message) => (
    message.type === 'mapChange' && message.map.id === 'stone-pass'
  )));
  resumed.send({ type: 'selectMap', mapId: 'stone-pass' });
  await Promise.all(shippedMapChanges);
  const restoredMapChanges = [resumed, ember].map((client) => client.waitNext((message) => (
    message.type === 'mapChange' && message.map.id === map.id
  )));
  resumed.send({ type: 'selectMap', mapId: map.id });
  await Promise.all(restoredMapChanges);

  stage = 'finishing the authored scenario';
  const resizedStates = [resumed, ember].map((client) => client.waitNext((message) => (
    message.type === 'state' && message.armySize === 250 && message.winner === -1
  )));
  resumed.send({ type: 'selectArmySize', count: 250 });
  await Promise.all(resizedStates);
  const victories = [resumed, ember].map((client) => client.waitNext((message) => (
    message.type === 'state' && message.winner === 0 && message.winnerReason === 'elimination'
  ), 90_000));
  resumed.send({ type: 'attackMove', ids: Array.from({ length: 125 }, (_, index) => index),
    x: 5, z: 0, formation: 'line' });
  await Promise.all(victories);

  stage = 'resetting both seats';
  const resetNoticeAzure = resumed.waitNext((message) => message.type === 'notice'
    && message.message === 'BATTLEFIELD RESET');
  const resetNoticeEmber = ember.waitNext((message) => message.type === 'notice'
    && message.message === 'BATTLEFIELD RESET');
  const resetStates = [resumed, ember].map((client) => client.waitNext((message) => (
    message.type === 'state' && message.winner === -1 && message.armySize === 250
  )));
  resumed.send({ type: 'reset' });
  await Promise.all([resetNoticeAzure, resetNoticeEmber, ...resetStates]);

  let stressResult = null;
  if (stress) {
    stage = 'running the hosted scale profile';
    const stressMapChanges = [resumed, ember].map((client) => client.waitNext((message) => (
      message.type === 'mapChange' && message.map.id === 'dense-clash'
    )));
    resumed.send({ type: 'selectMap', mapId: 'dense-clash' });
    await Promise.all(stressMapChanges);
    stressResult = [];
    for (const count of scaleProfile.counts) for (let wave = 0; wave < scaleProfile.waves; wave++) {
      stage = `hosted scale: ${count} units, wave ${wave + 1}`;
      const peers = [resumed, ember];
      const fullArmyStates = peers.map(client => {
        const version = client.armyResetVersion;
        return client.waitNext(message => client.armyResetVersion > version
          && message.type === 'state' && message.armySize === count && message.connected === 2);
      });
      resumed.send({ type: 'selectArmySize', count });
      await Promise.all(fullArmyStates);
      for (const client of peers) client.stateFrames.length = 0;
      const startedAt = performance.now();
      peers.forEach((client, team) => {
        const ids = Array.from({ length: count / 2 }, (_, index) => index + team * count / 2);
        const token = 10000 + stressResult.length * 2 + team;
        client.orderProbe = createOrderProbe({ token, ids, units: client.latestState.units,
          startedAt: performance.now() });
        client.send({ type: 'move', ids, x: team === 0 ? 18 : -18, z: 0,
          formation: 'box', clientOrderToken: token });
      });
      await new Promise(resolve => setTimeout(resolve, scaleProfile.seconds * 1000));
      const endedAt = performance.now();
      const elapsedSeconds = (endedAt - startedAt) / 1000;
      const clients = peers.map((client, team) => {
        const samples = client.stateFrames.filter(frame => frame.at >= startedAt
          && frame.at <= endedAt && frame.armySize === count);
        const gaps = samples.slice(1).map((frame, index) => frame.at - samples[index].at);
        assert.ok(samples.length / elapsedSeconds >= 5, `team ${team} received fewer than 5 snapshots per second`);
        assert.ok(samples.every((frame) => frame.connected === 2), `team ${team} lost a player seat`);
        return {
          team: team === 0 ? 'Azure' : 'Ember', snapshots: samples.length,
          snapshotsPerSecond: Number((samples.length / elapsedSeconds).toFixed(2)),
          payloadP95Bytes: percentile(samples.map((frame) => frame.bytes), 0.95),
          intervalP95Ms: percentile(gaps, 0.95),
          intervalMaxMs: Math.max(...gaps),
          order: client.orderProbe.report(),
        };
      });
      stressResult.push({ totalUnits: count, wave: wave + 1, durationSeconds: elapsedSeconds, clients });
      for (const client of peers) client.orderProbe = null;
    }
  }

  console.log(JSON.stringify({
    status: 'passed', origin: baseUrl.origin,
    checks: ['public readiness', 'authenticated browser assets',
      reuseRoomId ? 'closed QA invite-room reuse' : 'invite-room creation',
      'both 1v1 seats', 'both-seat reconnect', 'authored map save/reload',
      'two-seat elimination victory', 'synchronized rematch reset'],
    mapId: map.id, armySize: 250,
    ...(stressResult ? { stress: { map: 'dense-clash', profile: scaleProfile,
      windows: stressResult, timing: 'client monotonic clock; no browser/GPU or wire-egress measurement' } } : {}),
  }, null, 2));
} catch (error) {
  throw new Error(`${stage}: ${error.message}`, { cause: error });
} finally {
  await Promise.allSettled(clients.map(close));
}
