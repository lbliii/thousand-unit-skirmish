import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { connect } from 'node:net';

const port = Number(process.argv[2] || 4174);
const durationSeconds = Number(process.argv[3] || 10);
const repeatCount = Number(process.argv[4] || 3);
const mode = process.argv[5] || 'move';
const option = process.argv[6];
const slowReader = option === 'slow';
const formation = ['box', 'line', 'column'].includes(option) ? option
  : ['box', 'line', 'column'].includes(process.argv[7]) ? process.argv[7] : 'box';
assert.ok(Number.isFinite(durationSeconds) && durationSeconds >= 10,
  'duration must be at least 10 seconds to measure a full post-order 300-tick window');
assert.ok(['move', 'attack', 'attack-move', 'dense-clash', 'map-backpressure'].includes(mode),
  'mode must be "move", "attack", "attack-move", "dense-clash", or "map-backpressure"');
assert.ok(option === undefined || slowReader || ['box', 'line', 'column'].includes(option),
  'optional sixth argument must be "slow", "box", "line", or "column"');
assert.ok(process.argv[7] === undefined || (slowReader && ['box', 'line', 'column'].includes(process.argv[7])),
  'optional seventh argument must select a formation after "slow"');
assert.ok(mode !== 'map-backpressure' || slowReader,
  'map-backpressure mode requires the optional "slow" argument');
const endpoint = `ws://127.0.0.1:${port}/ws`;
const healthEndpoint = `http://127.0.0.1:${port}/health`;

function openClient(resumeToken = null) {
  const url = new URL(endpoint);
  const protocols = ['rts-v1'];
  if (resumeToken) protocols.push(`rts-resume.${resumeToken}`);
  return new WebSocket(url, protocols);
}

function waitForMessage(socket, predicate, timeoutMs = 10_000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => finish(new Error('Timed out waiting for server state')), timeoutMs);
    const onError = () => finish(new Error('WebSocket connection failed'));
    const onMessage = (event) => {
      let message;
      try { message = JSON.parse(event.data); } catch { return; }
      if (predicate(message)) finish(null, message);
    };
    const finish = (error, message) => {
      clearTimeout(timeout);
      socket.removeEventListener('error', onError);
      socket.removeEventListener('message', onMessage);
      if (error) reject(error);
      else resolve(message);
    };
    socket.addEventListener('error', onError, { once: true });
    socket.addEventListener('message', onMessage);
  });
}

function send(socket, message) {
  socket.send(JSON.stringify(message));
}

function hasExpectedArmySnapshot(message, team) {
  if (message.type !== 'state' || message.armySize !== 2000 || !Array.isArray(message.units)) return false;
  return message.fogOfWar === true
    ? message.units.filter((unit) => unit[1] === team).length === 1000
    : message.units.length === 2000;
}

function countMovedUnits(before, after, visibleTeam = null) {
  const starts = new Map(before.units.map((unit) => [unit[0], [unit[2], unit[3]]]));
  let moved = 0;
  for (const unit of after.units) {
    if (visibleTeam !== null && unit[1] !== visibleTeam) continue;
    const start = starts.get(unit[0]);
    if (start && Math.hypot(unit[2] - start[0], unit[3] - start[1]) > 0.1) moved++;
  }
  return moved;
}

function countDamagedUnits(before, after) {
  const startingHp = new Map(before.units.map((unit) => [unit[0], unit[4]]));
  return after.units.reduce((count, unit) => {
    const hp = startingHp.get(unit[0]);
    return count + (Number.isFinite(hp) && unit[4] < hp ? 1 : 0);
  }, 0);
}

function encodeMaskedTextFrame(text) {
  const payload = Buffer.from(text);
  const mask = randomBytes(4);
  let header;
  if (payload.length < 126) {
    header = Buffer.alloc(2);
    header[1] = 0x80 | payload.length;
  } else if (payload.length <= 0xffff) {
    header = Buffer.alloc(4);
    header[1] = 0x80 | 126;
    header.writeUInt16BE(payload.length, 2);
  } else {
    header = Buffer.alloc(10);
    header[1] = 0x80 | 127;
    header.writeBigUInt64BE(BigInt(payload.length), 2);
  }
  header[0] = 0x81;
  const maskedPayload = Buffer.allocUnsafe(payload.length);
  for (let index = 0; index < payload.length; index++) maskedPayload[index] = payload[index] ^ mask[index % 4];
  return Buffer.concat([header, mask, maskedPayload]);
}

function close(socket) {
  return new Promise((resolve) => {
    if (socket.readyState === WebSocket.CLOSED) return resolve();
    socket.addEventListener('close', resolve, { once: true });
    socket.close(1000, 'performance scenario complete');
  });
}

async function openSlowReader(portNumber) {
  const socket = connect({ host: '127.0.0.1', port: portNumber });
  await once(socket, 'connect');
  socket.setNoDelay(true);
  const key = randomBytes(16).toString('base64');
  try {
    const welcome = await new Promise((resolve, reject) => {
      let response = Buffer.alloc(0);
      let upgraded = false;
      const timeout = setTimeout(() => finish(new Error('Timed out waiting for slow-reader handshake')), 5000);
      const onError = (error) => finish(error);
      const onData = (chunk) => {
        response = Buffer.concat([response, chunk]);
        if (!upgraded) {
          const headerEnd = response.indexOf('\r\n\r\n');
          if (headerEnd < 0) return;
          const header = response.subarray(0, headerEnd).toString('latin1');
          if (!header.startsWith('HTTP/1.1 101 ')) return finish(new Error('Slow-reader WebSocket upgrade failed'));
          response = response.subarray(headerEnd + 4);
          upgraded = true;
        }
        parseServerFrames();
      };
      let welcomeMessage = null;
      const parseServerFrames = () => {
        while (response.length >= 2) {
          const opcode = response[0] & 0x0f;
          let length = response[1] & 0x7f;
          let offset = 2;
          if (length === 126) {
            if (response.length < 4) return;
            length = response.readUInt16BE(2);
            offset = 4;
          } else if (length === 127) {
            if (response.length < 10) return;
            const longLength = response.readBigUInt64BE(2);
            if (longLength > 1_000_000n) return finish(new Error('Slow-reader received an oversized frame'));
            length = Number(longLength);
            offset = 10;
          }
          if (response.length < offset + length) return;
          const payload = response.subarray(offset, offset + length);
          response = response.subarray(offset + length);
          if (opcode === 0x9) {
            socket.write(encodeMaskedControlFrame(0x0a, payload));
            continue;
          }
          if (opcode !== 0x1) continue;
          let message;
          try { message = JSON.parse(payload.toString('utf8')); } catch { continue; }
          if (message.type === 'welcome') welcomeMessage = message;
        }
        if (welcomeMessage) finish(null, welcomeMessage);
      };
      const finish = (error, message) => {
        clearTimeout(timeout);
        socket.removeListener('error', onError);
        socket.removeListener('data', onData);
        if (error) reject(error);
        else {
          socket.on('error', () => {});
          socket.pause();
          resolve(message);
        }
      };
      socket.on('error', onError);
      socket.on('data', onData);
      socket.write([
        'GET /ws HTTP/1.1',
        `Host: 127.0.0.1:${portNumber}`,
        'Upgrade: websocket',
        'Connection: Upgrade',
        `Sec-WebSocket-Key: ${key}`,
        'Sec-WebSocket-Version: 13',
        '\r\n',
      ].join('\r\n'));
    });
    return { socket, welcome };
  } catch (error) {
    socket.destroy();
    throw error;
  }
}

function encodeMaskedControlFrame(opcode, payload) {
  const mask = randomBytes(4);
  const header = Buffer.from([0x80 | opcode, 0x80 | payload.length]);
  const maskedPayload = Buffer.allocUnsafe(payload.length);
  for (let index = 0; index < payload.length; index++) maskedPayload[index] = payload[index] ^ mask[index % 4];
  return Buffer.concat([header, mask, maskedPayload]);
}

async function readHealth() {
  const response = await fetch(healthEndpoint, { cache: 'no-store' });
  assert.equal(response.status, 200, 'health endpoint should be available');
  return response.json();
}

async function readFullTickWindowHealth(timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  let health;
  do {
    health = await readHealth();
    if (health.tickTiming?.sampleCount === 300) return health;
    await new Promise((resolve) => setTimeout(resolve, 50));
  } while (Date.now() < deadline);
  return health;
}

async function runMapBackpressureWorkload(slowSocket, sessionToken, ember) {
  const mapId = `backpressure-${randomBytes(4).toString('hex')}`;
  const map = {
    id: mapId,
    name: 'Backpressure Recovery Map',
    width: 64,
    height: 64,
    terrainSeed: 31,
    obstacles: [],
    spawnPoints: [{ team: 0, x: -24, z: 0 }, { team: 1, x: 24, z: 0 }],
    triggers: [],
    // Map Studio permits files up to 900 KB. This keeps each valid mapChange
    // deliberately large enough to fill a slow reader's bounded queue quickly.
    transportStressPayload: 'x'.repeat(820_000),
  };
  const commandText = JSON.stringify({ type: 'publishMap', map });
  assert.ok(Buffer.byteLength(commandText) < 900_000,
    'stress map command should stay under the normal client upload limit');
  const initialHealth = await readHealth();
  const initialDisconnects = initialHealth.transport.outboundQueueLimitDisconnects;
  let emberSawMap = false;
  const onEmberMessage = (event) => {
    let message;
    try { message = JSON.parse(event.data); } catch { return; }
    if (message.type === 'mapChange' && message.map?.id === mapId) emberSawMap = true;
  };
  ember.addEventListener('message', onEmberMessage);
  let readerClosed = false;
  const readerClosedWait = new Promise((resolve) => slowSocket.once('close', () => {
    readerClosed = true;
    resolve();
  }));

  let publicationsSubmitted = 0;
  for (; publicationsSubmitted < 40 && !readerClosed; publicationsSubmitted++) {
    slowSocket.write(encodeMaskedTextFrame(commandText));
    // Stay below the server's 2 MiB/s inbound byte cap while filling the slow reader's queue.
    await new Promise((resolve) => setTimeout(resolve, 600));
  }
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Slow reader was not disconnected at the queue limit')), 5000);
    readerClosedWait.then(() => {
      clearTimeout(timeout);
      resolve();
    }, reject);
  });
  assert.ok(readerClosed, 'server should close a peer that exceeds its outbound queue limit');

  const overloadedHealth = await readHealth();
  const transport = overloadedHealth.transport;
  assert.ok(transport.outboundQueueLimitDisconnects > initialDisconnects,
    'health should record the queue-limit disconnect');
  assert.ok(transport.peakOutboundQueuedBytes <= transport.maxQueuedBytesPerPeer,
    'observed per-peer writable queue must remain at or below its configured cap');
  assert.ok(transport.peakOutboundQueuedBytes
    > transport.maxQueuedBytesPerPeer - Buffer.byteLength(commandText) - 262_144,
  'large map broadcasts should fill the queue close to the cap before the disconnect');
  assert.ok(emberSawMap, 'the connected player should observe the published map before recovery');

  const roomSyncPromise = waitForMessage(ember, (message) => message.type === 'room' && message.connected === 2);
  const resumed = openClient(sessionToken);
  const resumedWelcomePromise = waitForMessage(resumed, (message) => message.type === 'welcome');
  const resumedClosed = new Promise((resolve) => resumed.addEventListener('close', resolve, { once: true }));
  const resumedWelcome = await Promise.race([
    resumedWelcomePromise,
    resumedClosed.then(() => { throw new Error('Resuming the disconnected team seat was rejected'); }),
  ]);
  assert.equal(resumedWelcome.player.resumed, true, 'reconnect should reclaim the same reserved team session');
  assert.equal(resumedWelcome.player.team, 0, 'reconnect should reclaim Azure');
  assert.equal(resumedWelcome.map.id, mapId, 'reconnect should receive the latest authoritative map');
  assert.equal(resumedWelcome.state.mapId, mapId, 'reconnect state should agree with the active map');
  assert.equal(resumedWelcome.state.units.length, resumedWelcome.state.armySize,
    'reconnect should receive a complete authoritative army snapshot');
  clients.push(resumed);

  const roomSync = await roomSyncPromise;
  assert.equal(roomSync.connected, 2, 'room occupancy should recover after the session resumes');
  ember.removeEventListener('message', onEmberMessage);
  return {
    mapId, commandBytes: Buffer.byteLength(commandText), publicationsSubmitted,
    queueLimitBytes: transport.maxQueuedBytesPerPeer,
    peakOutboundQueuedBytes: transport.peakOutboundQueuedBytes,
    outboundQueueLimitDisconnects: transport.outboundQueueLimitDisconnects,
    resumedAs: resumedWelcome.player.id, resumedTeam: resumedWelcome.player.team,
    authoritativeMapId: resumedWelcome.state.mapId, authoritativeUnits: resumedWelcome.state.units.length,
  };
}

const clients = [];
let slowSocket = null;
let slowReaderRecovery = null;
try {
  if (mode === 'map-backpressure') {
    const slowAzure = await openSlowReader(port);
    slowSocket = slowAzure.socket;
    assert.equal(slowAzure.welcome.player.team, 0, 'slow-reader client should claim Azure');
    assert.ok(slowAzure.welcome.player.sessionToken, 'Azure should receive a resumable session token');
    const ember = openClient();
    clients.push(ember);
    const emberWelcome = await waitForMessage(ember, (message) => message.type === 'welcome');
    assert.equal(emberWelcome.player.team, 1, 'second client should be Ember');
    const mapReport = await runMapBackpressureWorkload(
      slowSocket, slowAzure.welcome.player.sessionToken, ember,
    );
    console.log(JSON.stringify({
      workload: 'repeated large map publications to a paused team client, then session resume',
      slowReader: true,
      ...mapReport,
    }, null, 2));
  } else {
    const azure = openClient();
    clients.push(azure);
    const azureWelcome = waitForMessage(azure, (message) => message.type === 'welcome');
    const azureSession = await azureWelcome;
    assert.equal(azureSession.player.team, 0, 'first client should be Azure');

    const ember = openClient();
    clients.push(ember);
    const emberSession = await waitForMessage(ember, (message) => message.type === 'welcome');
    assert.equal(emberSession.player.team, 1, 'second client should be Ember');
    if (slowReader) slowSocket = (await openSlowReader(port)).socket;

    const azureArmy = Array.from({ length: 1000 }, (_, index) => index);
    const emberArmy = Array.from({ length: 1000 }, (_, index) => index + 1000);
    const measurements = [];
    for (let run = 1; run <= repeatCount; run++) {
      const azureReset = waitForMessage(azure, (message) => message.type === 'state'
        && hasExpectedArmySnapshot(message, azureSession.player.team));
      const emberReset = waitForMessage(ember, (message) => message.type === 'state'
        && hasExpectedArmySnapshot(message, emberSession.player.team));
      send(azure, { type: 'selectArmySize', count: 2000 });
      const [azureResetState, emberResetState] = await Promise.all([azureReset, emberReset]);
      assert.equal(azureResetState.fogOfWar, emberResetState.fogOfWar,
        'both clients should use the same fog-of-war rules');
      assert.ok(!azureResetState.fogOfWar || mode === 'move',
        'fog-of-war performance runs currently support the privacy-safe movement workload');
      if (mode === 'dense-clash') {
        assert.equal(azureResetState.mapId, 'dense-clash',
          'dense-clash mode must run on the dedicated trigger-free choke map');
        assert.equal(azureResetState.fogOfWar, false,
          'dense-clash diagnostics require both armies to be visible to the profiler');
      }
      const attackCombatStateWait = ['attack-move', 'dense-clash'].includes(mode)
        ? waitForMessage(azure, (message) => message.type === 'state'
          && message.tick >= azureResetState.tick + Math.floor(durationSeconds * 30 * 0.8)
          && hasExpectedArmySnapshot(message, azureSession.player.team), durationSeconds * 1000 + 5000)
        : null;

      const movementStateWaits = [
        waitForMessage(azure, (message) => message.tick >= azureResetState.tick + 30
          && hasExpectedArmySnapshot(message, azureSession.player.team)),
        waitForMessage(ember, (message) => message.tick >= emberResetState.tick + 30
          && hasExpectedArmySnapshot(message, emberSession.player.team)),
      ];
      let orderAssignmentMs = null;
      const orderNoticePrefix = mode === 'move' ? 'MOVE ORDER'
        : mode === 'attack' ? 'ATTACK ORDER' : 'ATTACK MOVE ORDER';
      const orderNotice = (message) => message.type === 'notice'
        && message.message?.startsWith(orderNoticePrefix);
      const azureOrderWait = waitForMessage(azure, orderNotice);
      const emberOrderWait = waitForMessage(ember, orderNotice);
      const priorHealthResponse = await fetch(healthEndpoint, { cache: 'no-store' });
      assert.equal(priorHealthResponse.status, 200, 'health endpoint should be available before the orders');
      const priorHealth = await priorHealthResponse.json();
      if (mode === 'dense-clash') {
        assert.equal(priorHealth.map, 'dense-clash', 'dense-clash mode needs its dedicated map');
        assert.equal(priorHealth.separationWork?.enabled, true,
          'start the server with RTS_SEPARATION_DIAGNOSTICS=1 for neighbor-work measurements');
      }
      const previousMoveOrderId = Math.max(0, ...(priorHealth.movePlanning ?? []).map((sample) => sample.orderId));
      const scenarioStartedAt = Date.now();
      const orderStartedAt = performance.now();
      if (mode === 'move') {
        send(azure, { type: 'move', ids: azureArmy, x: -6, z: 0, formation });
        send(ember, { type: 'move', ids: emberArmy, x: 6, z: 0, formation });
      } else if (mode === 'attack-move' || mode === 'dense-clash') {
        const azureTargetX = mode === 'dense-clash' ? 0 : 10;
        const emberTargetX = mode === 'dense-clash' ? 0 : -10;
        send(azure, { type: 'attackMove', ids: azureArmy, x: azureTargetX, z: 0, formation });
        send(ember, { type: 'attackMove', ids: emberArmy, x: emberTargetX, z: 0, formation });
      } else {
        send(azure, { type: 'attack', ids: azureArmy, targetId: 1000 });
        send(ember, { type: 'attack', ids: emberArmy, targetId: 0 });
      }
      await Promise.all([azureOrderWait, emberOrderWait]);
      orderAssignmentMs = Number((performance.now() - orderStartedAt).toFixed(3));
      const [azureMovementState, emberMovementState] = await Promise.all(movementStateWaits);
      const azureMoved = countMovedUnits(azureResetState, azureMovementState,
        azureResetState.fogOfWar ? azureSession.player.team : null);
      const emberMoved = countMovedUnits(emberResetState, emberMovementState,
        emberResetState.fogOfWar ? emberSession.player.team : null);
      const unitsMoved = azureResetState.fogOfWar ? azureMoved + emberMoved : azureMoved;
      assert.ok(unitsMoved > 0, 'movement orders should move units through walkable cells');
      if (mode === 'move' || mode === 'attack-move') {
        if (azureResetState.fogOfWar) {
          assert.ok(azureMoved >= 950 && emberMoved >= 950,
            `${formation} ${mode} should move at least 95% of each team's 1,000 visible units`);
        } else {
          assert.ok(unitsMoved >= 1900,
            `${formation} ${mode} should get at least 95% of the 2,000-unit army moving in the first checked snapshot`);
        }
      }
      const remainingMs = Math.max(0, durationSeconds * 1000 - (Date.now() - scenarioStartedAt));
      await new Promise((resolve) => setTimeout(resolve, remainingMs));

      const health = await readFullTickWindowHealth();
      assert.equal(health.connected, 2, 'both teams should remain connected');
      assert.equal(health.armySize, 2000, 'scenario should exercise 2,000 units');
      assert.equal(health.tickTiming?.sampleCount, 300, 'measurement window should be full');
      if (mode === 'dense-clash') {
        assert.equal(health.separationWork?.sampleCount, 300,
          'dense-clash neighbor-work measurement window should be full');
        assert.ok(health.separationWork.moveVectorCallsPerTick.p95 > 0,
          'the choke fight should keep units moving during the measurement window');
        assert.ok(health.separationWork.closeNeighborContributionsPerTick.max > 0,
          'the choke fight should exercise local separation between nearby units');
        assert.ok(health.separationWork.maxCandidatesPerCall.max >= 32,
          `the choke should expose dense bucket fan-in (saw ${health.separationWork.maxCandidatesPerCall.max})`);
      }
      const tickBudgetMs = health.tickTiming.budgetMs;
      const maxBlockingBudgetMs = tickBudgetMs * 3;
      const tickDiagnostic = health.tickTiming.slowestTick
        ? `; slowest tick ${JSON.stringify(health.tickTiming.slowestTick)}` : '';
      assert.ok(health.tickTiming.p95Ms <= tickBudgetMs,
        `server tick p95 should stay within ${tickBudgetMs} ms (saw ${health.tickTiming.p95Ms} ms)`);
      assert.ok(health.tickTiming.startLagP95Ms <= tickBudgetMs,
        `server tick-start lag p95 should stay within ${tickBudgetMs} ms (saw ${health.tickTiming.startLagP95Ms} ms)`);
      assert.ok(health.tickTiming.maxMs <= maxBlockingBudgetMs,
        `a single server tick should stay within ${maxBlockingBudgetMs} ms (saw ${health.tickTiming.maxMs} ms${tickDiagnostic})`);
      assert.ok(health.tickTiming.startLagMaxMs <= maxBlockingBudgetMs,
        `a single tick-start lag should stay within ${maxBlockingBudgetMs} ms (saw ${health.tickTiming.startLagMaxMs} ms${tickDiagnostic}; checkpoint serialize ${health.checkpoint?.lastSerializeMs ?? 'unavailable'} ms)`);
      assert.ok(health.transport && Number.isFinite(health.transport.queuedBytes), 'transport queue metrics should be available');
      if (mode === 'move' || mode === 'attack-move' || mode === 'dense-clash') {
        const plannedOrders = health.movePlanning.filter((sample) => sample.orderId > previousMoveOrderId);
        assert.equal(plannedOrders.length, 2, 'both team orders should finish route planning');
        for (const plannedOrder of plannedOrders) {
          assert.equal(plannedOrder.unitCount, 1000, 'each team order should apply to all 1,000 units');
          assert.equal(plannedOrder.nonEmptyPaths + plannedOrder.alreadyInDestinationCell,
            plannedOrder.unitCount, 'each unit should receive a route or already occupy its destination cell');
          assert.equal(plannedOrder.routeFailures, 0, 'no unit should be left without a route');
          for (const [stage, milliseconds] of [
            ['move-order setup', plannedOrder.setupMs],
            ['a path-planning slice', plannedOrder.maxPathPlanningSliceMs],
            ['move-order finalization', plannedOrder.finalizationMs],
          ]) {
            assert.ok(milliseconds <= maxBlockingBudgetMs,
              `${stage} should stay within ${maxBlockingBudgetMs} ms (saw ${milliseconds} ms)`);
          }
        }
      }
      if (slowReader) {
        assert.ok(health.transport.coalescedStateSnapshots > 0,
          'slow readers should cause stale state snapshots to be coalesced');
      }
      let damagedUnits = null;
      if (attackCombatStateWait) {
        const combatState = await attackCombatStateWait;
        damagedUnits = countDamagedUnits(azureResetState, combatState);
        assert.ok(damagedUnits > 0,
          'attack-move/dense-clash performance window should include real unit combat');
      }
      measurements.push({
        run, map: health.map, unitsMovedAfterFirstSnapshot: unitsMoved,
        damagedUnits,
        unitsMovedByTeam: { azure: azureMoved, ember: emberMoved },
        orderAssignmentMs, movePlanning: health.movePlanning,
        tickTiming: health.tickTiming, separationWork: health.separationWork,
        transport: health.transport,
        checkpoint: health.checkpoint,
      });
    }

    if (slowReader && slowSocket) {
      slowSocket.on('data', () => {});
      slowSocket.resume();
      const recoveryDeadline = Date.now() + 5000;
      do {
        const response = await fetch(healthEndpoint, { cache: 'no-store' });
        slowReaderRecovery = (await response.json()).transport;
        if (slowReaderRecovery.backpressuredPeers === 0) break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      } while (Date.now() < recoveryDeadline);
      assert.equal(slowReaderRecovery.backpressuredPeers, 0,
        'transport should drain and resume current-state delivery when the slow reader recovers');
    }

    console.log(JSON.stringify({
      workload: mode === 'move'
        ? `2,000 units moving in two connected teams (${formation} formation)`
        : mode === 'attack'
          ? '2,000 units in two connected teams issuing simultaneous 1,000-unit attack orders'
          : mode === 'dense-clash'
            ? '2,000 units funneling into a four-cell choke and fighting while local separation work is sampled'
          : `2,000 units in two connected teams issuing simultaneous 1,000-unit attack-move orders (${formation} formation)`,
      slowReader,
      formation,
      durationSeconds,
      slowReaderRecovery,
      measurements,
    }, null, 2));
  }
} finally {
  await Promise.all([...clients.map(close), ...(slowSocket ? [Promise.resolve(slowSocket.destroy())] : [])]);
}
