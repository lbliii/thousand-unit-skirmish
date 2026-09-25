import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { connect } from 'node:net';

const port = Number(process.argv[2] || 4178);
const sockets = new Set();

function openWebSocket(origin, forwardedHeaders = {}) {
  const socket = connect({ host: '127.0.0.1', port });
  sockets.add(socket);
  return new Promise((resolve, reject) => {
    let response = Buffer.alloc(0);
    const timeout = setTimeout(() => finish(new Error('Timed out waiting for WebSocket upgrade')), 3000);
    const cleanup = () => {
      clearTimeout(timeout);
      socket.off('data', onData);
      socket.off('error', onError);
    };
    const finish = (error, result) => {
      cleanup();
      if (error) reject(error);
      else resolve(result);
    };
    const onError = (error) => finish(error);
    const onData = (chunk) => {
      response = Buffer.concat([response, chunk]);
      const end = response.indexOf('\r\n\r\n');
      if (end < 0) return;
      const status = Number(response.subarray(0, end).toString('latin1').match(/^HTTP\/1\.1 (\d+)/)?.[1]);
      if (!Number.isInteger(status)) return finish(new Error('Malformed WebSocket handshake response'));
      finish(null, { socket, status });
    };
    socket.once('error', onError);
    socket.on('data', onData);
    socket.once('connect', () => {
      const headers = [
        'GET /ws HTTP/1.1',
        `Host: 127.0.0.1:${port}`,
        'Upgrade: websocket',
        'Connection: Upgrade',
        `Sec-WebSocket-Key: ${randomBytes(16).toString('base64')}`,
        'Sec-WebSocket-Version: 13',
      ];
      if (origin) headers.push(`Origin: ${origin}`);
      for (const [name, value] of Object.entries(forwardedHeaders)) headers.push(`${name}: ${value}`);
      socket.write(`${headers.join('\r\n')}\r\n\r\n`);
    });
  });
}

function maskedTextFrame(text) {
  const payload = Buffer.from(text);
  const mask = randomBytes(4);
  const header = Buffer.from([0x81, 0x80 | payload.length]);
  const masked = Buffer.from(payload);
  for (let index = 0; index < masked.length; index++) masked[index] ^= mask[index % 4];
  return Buffer.concat([header, mask, masked]);
}

function maskedControlFrame(opcode, payload = Buffer.alloc(0)) {
  assert.ok(payload.length <= 125, 'control frame payload must fit in one byte');
  const mask = randomBytes(4);
  const header = Buffer.from([0x80 | opcode, 0x80 | payload.length]);
  const masked = Buffer.from(payload);
  for (let index = 0; index < masked.length; index++) masked[index] ^= mask[index % 4];
  return Buffer.concat([header, mask, masked]);
}

function waitForClose(socket) {
  if (socket.destroyed) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timed out waiting for server to close the peer')), 3000);
    socket.once('close', () => {
      clearTimeout(timeout);
      resolve();
    });
    socket.once('error', () => {});
  });
}

try {
  for (const privatePath of ['/README.md', '/.env', '/server.mjs', '/scripts/server-hardening-scenario.mjs']) {
    const response = await fetch(`http://127.0.0.1:${port}${privatePath}`);
    assert.equal(response.status, 404, `${privatePath} should not be served as a static asset`);
  }
  const malformedPath = await fetch(`http://127.0.0.1:${port}/%E0%A4`);
  assert.equal(malformedPath.status, 400, 'malformed percent-encoded paths should return HTTP 400');
  const healthAfterMalformedPath = await fetch(`http://127.0.0.1:${port}/health`);
  assert.equal(healthAfterMalformedPath.status, 200, 'the server should remain responsive after a malformed path');

  const mapResponse = await fetch(`http://127.0.0.1:${port}/maps/stone-pass.json`);
  assert.equal(mapResponse.status, 200, 'the authored map JSON should remain available');
  const resizeModule = await fetch(`http://127.0.0.1:${port}/src/map-resize.mjs`);
  assert.equal(resizeModule.status, 200, 'the browser map editor helper should remain on the static allowlist');
  const selectionModule = await fetch(`http://127.0.0.1:${port}/src/unit-selection.mjs`);
  assert.equal(selectionModule.status, 200, 'the browser unit selector should remain on the static allowlist');
  for (const moduleName of ['audio.mjs', 'audio-policy.mjs']) {
    const response = await fetch(`http://127.0.0.1:${port}/src/${moduleName}`);
    assert.equal(response.status, 200, `${moduleName} should remain on the static allowlist`);
    assert.match(response.headers.get('content-type') || '', /^text\/javascript/, `${moduleName} needs a JavaScript MIME type`);
  }

  const crossOrigin = await openWebSocket('https://other-site.example');
  assert.equal(crossOrigin.status, 403, 'cross-origin browser handshakes should be rejected');
  crossOrigin.socket.destroy();

  const forwardedOriginSpoof = await openWebSocket('https://attacker.example', {
    'X-Forwarded-Host': 'attacker.example',
    'X-Forwarded-Proto': 'https',
  });
  assert.equal(forwardedOriginSpoof.status, 403,
    'client-controlled forwarded headers must not make a cross-origin handshake appear same-origin');
  forwardedOriginSpoof.socket.destroy();

  const sameOrigin = await openWebSocket(`http://127.0.0.1:${port}`);
  assert.equal(sameOrigin.status, 101, 'same-origin browser handshakes should be accepted');

  const floodPeer = await openWebSocket(null);
  assert.equal(floodPeer.status, 101, 'native clients without an Origin should remain supported');
  const floodClosed = waitForClose(floodPeer.socket);
  floodPeer.socket.write(Buffer.concat(Array.from({ length: 121 }, () => maskedTextFrame('{}'))));
  await floodClosed;
  await new Promise((resolve) => setTimeout(resolve, 100));

  const controlFloodPeer = await openWebSocket(null);
  assert.equal(controlFloodPeer.status, 101);
  const controlFloodClosed = waitForClose(controlFloodPeer.socket);
  controlFloodPeer.socket.write(Buffer.concat(Array.from({ length: 121 }, () => maskedControlFrame(0x9))));
  await controlFloodClosed;
  const controlHealth = await fetch(`http://127.0.0.1:${port}/health`).then((response) => response.json());
  assert.equal(controlHealth.transport.maxInboundControlFramesPerSecond, 120);
  assert.ok(controlHealth.transport.inboundControlPingsReceived >= 121,
    'health should count inbound control pings, including the frame that exceeds the limit');
  assert.ok(controlHealth.transport.inboundControlRateLimitDisconnects >= 1,
    'health should count peers disconnected for exceeding the control-frame limit');

  const queueRejectionsBeforeFlood = controlHealth.transport.commandQueueLimitRejections;
  const queuedCommands = Buffer.concat(Array.from({ length: 100 }, (_, index) => (
    maskedTextFrame(JSON.stringify({ type: 'noop', clientOrderToken: index + 1 }))
  )));
  sameOrigin.socket.write(queuedCommands);
  let commandHealth = null;
  for (let attempt = 0; attempt < 20; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 25));
    commandHealth = await fetch(`http://127.0.0.1:${port}/health`).then((response) => response.json());
    if (commandHealth.transport.commandQueueLimitRejections > queueRejectionsBeforeFlood) break;
  }
  assert.equal(commandHealth.transport.maxPendingCommandsPerPeer, 64);
  assert.ok(commandHealth.transport.commandQueueLimitRejections > queueRejectionsBeforeFlood,
    'a burst beyond the per-peer queue limit should be rejected');

  const nativePeer = await openWebSocket(null);
  assert.equal(nativePeer.status, 101);
  const overLimit = await openWebSocket(null);
  assert.equal(overLimit.status, 503, 'connections above RTS_MAX_PEERS should be rejected');
  overLimit.socket.destroy();

  const closeSameOrigin = waitForClose(sameOrigin.socket);
  sameOrigin.socket.destroy();
  await closeSameOrigin;
  const closeNativePeer = waitForClose(nativePeer.socket);
  nativePeer.socket.destroy();
  await closeNativePeer;

  console.log(JSON.stringify({
    passed: ['static-file allowlist', 'browser map editor module delivery', 'browser unit selector delivery', 'browser audio module delivery', 'malformed URL handling', 'same-origin guard', 'native client compatibility', 'peer cap', 'per-peer message-rate cap', 'per-peer control-frame-rate cap', 'per-peer pending command queue cap'],
    rejectedCrossOriginStatus: crossOrigin.status,
    overLimitStatus: overLimit.status,
    floodFramesBeforeDisconnect: 121,
    controlFramesBeforeDisconnect: 121,
    queuedCommandsBeforeRejection: 100,
    commandQueueLimitRejections: commandHealth.transport.commandQueueLimitRejections - queueRejectionsBeforeFlood,
  }, null, 2));
} catch (error) {
  for (const socket of sockets) socket.destroy();
  console.error(error);
  process.exitCode = 1;
}
