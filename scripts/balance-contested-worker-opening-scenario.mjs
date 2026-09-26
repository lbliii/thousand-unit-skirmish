import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const serverRoot = process.env.RTS_SERVER_ROOT || root;
const baselineCommit = process.env.RTS_BASELINE_COMMIT?.trim() || '';
const mapRelativePath = process.env.RTS_CONTEST_MAP || 'maps/forked-vale.json';
const observationSeconds = Number(process.env.RTS_CONTEST_SECONDS || 80);

function cleanCheckoutCommit(directory, label) {
  let commit;
  try {
    commit = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: directory, encoding: 'utf8',
    }).trim();
  } catch (error) {
    throw new Error(`${label} must be a Git checkout: ${error.message}`);
  }
  const changes = execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], {
    cwd: directory, encoding: 'utf8',
  }).trim();
  if (changes) throw new Error(`${label} has changes; evidence requires a clean checkout:\n${changes}`);
  return commit;
}

const harnessCommit = cleanCheckoutCommit(root, 'Scenario harness checkout');
const serverCommit = cleanCheckoutCommit(serverRoot, 'RTS_SERVER_ROOT');
if (!/^[0-9a-f]{40,64}$/i.test(baselineCommit)) {
  throw new Error('RTS_BASELINE_COMMIT must be the full 40- or 64-character server-source Git SHA.');
}
if (serverCommit.toLowerCase() !== baselineCommit.toLowerCase()) {
  throw new Error(`RTS_BASELINE_COMMIT ${baselineCommit} does not match RTS_SERVER_ROOT HEAD ${serverCommit}.`);
}
if (!Number.isFinite(observationSeconds) || observationSeconds < 30 || observationSeconds > 180) {
  throw new Error('RTS_CONTEST_SECONDS must be between 30 and 180 in-game seconds.');
}

const mapPath = path.resolve(serverRoot, mapRelativePath);
const relativeMapPath = path.relative(serverRoot, mapPath);
if (!relativeMapPath || relativeMapPath === '..' || relativeMapPath.startsWith(`..${path.sep}`)
  || path.isAbsolute(relativeMapPath)) {
  throw new Error('RTS_CONTEST_MAP must resolve to a map inside RTS_SERVER_ROOT.');
}
try {
  execFileSync('git', ['ls-files', '--error-unmatch', '--', relativeMapPath], {
    cwd: serverRoot, encoding: 'utf8',
  });
} catch {
  throw new Error(`RTS_CONTEST_MAP must name a tracked baseline file: ${relativeMapPath}`);
}

const mapSourceBytes = await readFile(mapPath);
const mapSourceSha256 = createHash('sha256').update(mapSourceBytes).digest('hex');
const template = JSON.parse(mapSourceBytes.toString('utf8'));
assert.equal(template.id, 'forked-vale', 'this opening probe is specific to Forked Vale');
const runtime = { node: process.version, platform: process.platform, arch: process.arch };

function objectiveCenter(map, id) {
  const trigger = map.triggers.find((row) => row.id === id);
  assert.ok(trigger?.zone, `map must define ${id}`);
  return {
    x: trigger.zone.column + trigger.zone.width / 2 - map.width / 2,
    z: trigger.zone.row + trigger.zone.height / 2 - map.height / 2,
  };
}

function nearestNode(map, team, type) {
  const spawn = map.spawnPoints.find((point) => point.team === team);
  assert.ok(spawn, `map must define spawn ${team}`);
  return map.resourceNodes
    .filter((node) => node.type === type && node.stock > 0)
    .sort((a, b) => Math.hypot(a.x - spawn.x, a.z - spawn.z)
      - Math.hypot(b.x - spawn.x, b.z - spawn.z))[0];
}

function stateFrom(message) {
  if (message.type === 'state') return message;
  if (['welcome', 'mapChange'].includes(message.type)) return message.state;
  return null;
}

function participantSummary(state, participants, gatherTargets, map) {
  return Object.fromEntries(Object.entries(participants).map(([label, ids]) => {
    const units = state.units.filter((row) => ids.includes(row[0]));
    return [label, {
      total: units.length,
      survivors: units.filter((row) => row[4] > 0).length,
      remainingHp: Number(units.reduce((sum, row) => sum + row[4], 0).toFixed(1)),
      workers: units.filter((row) => row[5] === 'worker').map((row) => {
        const targetId = gatherTargets[row[0]] || null;
        const target = map.resourceNodes.find((node) => node.id === targetId);
        return {
          id: row[0],
          hp: row[4],
          task: row[9],
          cargo: row[6],
          cargoType: row[7],
          targetNodeId: targetId,
          distanceToTarget: target
            ? Number(Math.hypot(target.x - row[2], target.z - row[3]).toFixed(2)) : null,
        };
      }),
    }];
  }));
}

function stateAtOrAfter(states, seconds) {
  return states.find((state) => state.matchElapsedSeconds >= seconds) || states.at(-1);
}

async function freePort() {
  const listener = createServer();
  listener.listen(0, '127.0.0.1');
  await once(listener, 'listening');
  const port = listener.address().port;
  await new Promise((resolve, reject) => listener.close((error) => error ? reject(error) : resolve()));
  return port;
}

function createClient(port) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`, ['rts-v1']);
  const client = { socket, messages: [], states: [], waiters: [] };
  socket.addEventListener('message', (event) => {
    let message;
    try { message = JSON.parse(event.data); } catch { return; }
    client.messages.push(message);
    const state = stateFrom(message);
    if (state) client.states.push(state);
    for (let index = client.waiters.length - 1; index >= 0; index--) {
      const waiter = client.waiters[index];
      if (!waiter.predicate(message, state)) continue;
      client.waiters.splice(index, 1);
      clearTimeout(waiter.timeout);
      waiter.resolve({ message, state });
    }
  });
  client.waitFor = (predicate, timeoutMs = 12_000, afterMessage = 0) => {
    const existing = client.messages.slice(afterMessage).find((message) => predicate(message, stateFrom(message)));
    if (existing) return Promise.resolve({ message: existing, state: stateFrom(existing) });
    return new Promise((resolve, reject) => {
      const waiter = {
        predicate,
        resolve,
        timeout: setTimeout(() => {
          client.waiters.splice(client.waiters.indexOf(waiter), 1);
          reject(new Error(`message wait timed out; recent messages: ${JSON.stringify(client.messages.slice(-3))}`));
        }, timeoutMs),
      };
      client.waiters.push(waiter);
    });
  };
  client.send = (command) => socket.send(JSON.stringify(command));
  client.latestState = () => client.states.at(-1);
  client.close = async () => {
    if (socket.readyState === WebSocket.CLOSED) return;
    const closed = once(socket, 'close');
    socket.close();
    await Promise.race([closed, new Promise((resolve) => setTimeout(resolve, 2_000))]);
  };
  return client;
}

async function connect(client) {
  const welcome = await client.waitFor((message) => message.type === 'welcome');
  assert.equal(welcome.message.type, 'welcome');
  client.team = welcome.message.player.team;
  return welcome.message;
}

async function runCase(splitTeam) {
  const port = await freePort();
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'rts-contested-opening-'));
  const server = spawn(process.execPath, ['server.mjs'], {
    cwd: serverRoot,
    env: {
      ...process.env,
      PORT: String(port),
      RTS_HOST: '127.0.0.1',
      RTS_MAP: relativeMapPath,
      RTS_MATCH_STATE_PATH: path.join(temporary, 'match.json'),
      RTS_CUSTOM_MAP_DIRECTORY: path.join(temporary, 'custom-maps'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let serverLog = '';
  server.stdout.on('data', (chunk) => { serverLog = `${serverLog}${chunk}`.slice(-6_000); });
  server.stderr.on('data', (chunk) => { serverLog = `${serverLog}${chunk}`.slice(-6_000); });
  const clients = [];
  try {
    const deadline = Date.now() + 15_000;
    let healthy = false;
    while (Date.now() < deadline) {
      if (server.exitCode !== null) throw new Error(`server exited before health: ${serverLog}`);
      try {
        if ((await fetch(`http://127.0.0.1:${port}/health`)).ok) { healthy = true; break; }
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.equal(healthy, true, `server health timed out: ${serverLog}`);

    const azure = createClient(port);
    clients.push(azure);
    const azureWelcome = await connect(azure);
    assert.equal(azureWelcome.player.team, 0);
    const ember = createClient(port);
    clients.push(ember);
    const emberWelcome = await connect(ember);
    assert.equal(emberWelcome.player.team, 1);
    assert.equal(azureWelcome.map.id, 'forked-vale');
    assert.equal(emberWelcome.map.id, 'forked-vale');

    const clientsByTeam = [azure, ember];
    const map = structuredClone(template);
    map.id = `balance-worker-split-${splitTeam}`;
    map.name = `BALANCE WORKER SPLIT · TEAM ${splitTeam}`;
    map.startingArmySize = 24;
    map.startingResources = { food: 150, wood: 250 };
    map.fogOfWar = false;
    const afterPublish = clientsByTeam.map((client) => client.messages.length);
    const mapChanges = clientsByTeam.map((client, team) => client.waitFor(
      (message) => message.type === 'mapChange' && message.map?.id === map.id,
      15_000,
      afterPublish[team],
    ));
    azure.send({ type: 'publishMap', map });
    const published = await Promise.all(mapChanges);
    const initial = published.map(({ state }) => state);
    for (const [team, state] of initial.entries()) {
      assert.equal(state.armySize, 24);
      assert.equal(state.food[team], 150);
      assert.equal(state.wood[team], 250);
      assert.equal(state.units.filter((row) => row[1] === team && row[5] === 'worker').length, 4);
      assert.equal(state.units.filter((row) => row[1] === team && row[5] === 'infantry').length, 8);
    }

    const responseTeam = 1 - splitTeam;
    const splitState = initial[splitTeam];
    const responseState = initial[responseTeam];
    const splitWorkers = splitState.units
      .filter((row) => row[1] === splitTeam && row[5] === 'worker' && row[4] > 0);
    const splitInfantry = splitState.units
      .filter((row) => row[1] === splitTeam && row[5] === 'infantry' && row[4] > 0);
    const responseWorkers = responseState.units
      .filter((row) => row[1] === responseTeam && row[5] === 'worker' && row[4] > 0);
    const responseInfantry = responseState.units
      .filter((row) => row[1] === responseTeam && row[5] === 'infantry' && row[4] > 0);
    assert.deepEqual([splitWorkers.length, splitInfantry.length, responseWorkers.length, responseInfantry.length], [4, 8, 4, 8]);

    const north = objectiveCenter(map, 'capture-zone-1');
    const south = objectiveCenter(map, 'capture-zone-2');
    const groups = {
      splitNorthInfantry: splitInfantry.slice(0, 5).map((row) => row[0]),
      splitSouthInfantry: splitInfantry.slice(5).map((row) => row[0]),
      splitSouthWorkers: splitWorkers.slice(0, 2).map((row) => row[0]),
      splitGatherers: splitWorkers.slice(2).map((row) => row[0]),
      responseSouthInfantry: responseInfantry.slice(0, 5).map((row) => row[0]),
      responseGatherers: responseWorkers.map((row) => row[0]),
    };
    assert.deepEqual([
      groups.splitNorthInfantry.length,
      groups.splitSouthInfantry.length,
      groups.splitSouthWorkers.length,
      groups.splitGatherers.length,
      groups.responseSouthInfantry.length,
    ], [5, 3, 2, 2, 5]);

    const startFood = initial.map((state, team) => state.food[team]);
    const startWood = initial.map((state, team) => state.wood[team]);
    const orderMessages = [];
    const issue = (team, command, token) => {
      const client = clientsByTeam[team];
      const after = client.messages.length;
      const ack = client.waitFor((message) => message.type === 'notice'
        && message.clientOrderToken === token, 12_000, after);
      client.send({ ...command, clientOrderToken: token });
      orderMessages.push(ack.then(({ message }) => {
        assert.ok(!message.message?.includes('REJECTED'),
          `team ${team} order ${token} rejected: ${message.message}`);
        return { team, token, message: message.message };
      }));
    };
    const foodNodeSplit = nearestNode(map, splitTeam, 'food');
    const woodNodeSplit = nearestNode(map, splitTeam, 'wood');
    const foodNodeResponse = nearestNode(map, responseTeam, 'food');
    const woodNodeResponse = nearestNode(map, responseTeam, 'wood');
    assert.ok(foodNodeSplit && woodNodeSplit && foodNodeResponse && woodNodeResponse);
    const gatherTargets = Object.fromEntries([
      [groups.splitGatherers[0], foodNodeSplit.id],
      [groups.splitGatherers[1], woodNodeSplit.id],
      ...groups.responseGatherers.slice(0, 2).map((id) => [id, foodNodeResponse.id]),
      ...groups.responseGatherers.slice(2).map((id) => [id, woodNodeResponse.id]),
    ]);

    issue(splitTeam, { type: 'gather', ids: [groups.splitGatherers[0]], nodeId: foodNodeSplit.id }, 1);
    issue(splitTeam, { type: 'gather', ids: [groups.splitGatherers[1]], nodeId: woodNodeSplit.id }, 2);
    issue(splitTeam, { type: 'move', ids: groups.splitSouthWorkers, x: south.x, z: south.z }, 3);
    issue(splitTeam, { type: 'attackMove', ids: groups.splitNorthInfantry, x: north.x, z: north.z }, 4);
    issue(splitTeam, { type: 'attackMove', ids: groups.splitSouthInfantry, x: south.x, z: south.z }, 5);
    issue(responseTeam, { type: 'gather', ids: groups.responseGatherers.slice(0, 2), nodeId: foodNodeResponse.id }, 1);
    issue(responseTeam, { type: 'gather', ids: groups.responseGatherers.slice(2), nodeId: woodNodeResponse.id }, 2);
    issue(responseTeam, { type: 'attackMove', ids: groups.responseSouthInfantry, x: south.x, z: south.z }, 3);
    const acceptedOrders = await Promise.all(orderMessages);

    const observed = await azure.waitFor(
      (message, state) => state?.mapId === map.id
        && state.matchElapsedSeconds >= observationSeconds,
      observationSeconds * 1_000 + 30_000,
      afterPublish[0],
    );
    const states = azure.states.filter((state) => state.mapId === map.id
      && Number.isFinite(state.matchElapsedSeconds));
    const finalState = observed.state;
    assert.ok(finalState, 'final observed game state must be present');
    assert.equal(finalState.winner, -1, 'the two-Signal probe should not resolve the match');

    const involvedIds = new Set([
      ...groups.splitNorthInfantry,
      ...groups.splitSouthInfantry,
      ...groups.splitSouthWorkers,
      ...groups.responseSouthInfantry,
    ]);
    const firstDamageState = states.find((state) => state.units.some((row) => (
      involvedIds.has(row[0]) && row[4] < 100
    )));
    const firstWorkerLossState = states.find((state) => groups.splitSouthWorkers.some((id) => {
      const worker = state.units.find((row) => row[0] === id);
      return worker && worker[4] <= 0;
    }));
    const firstObjectiveEntry = Object.fromEntries(['capture-zone-1', 'capture-zone-2'].map((id) => {
      const state = states.find((candidate) => {
        const objective = candidate.objectives.find((row) => row.id === id);
        return objective && objective.unitCounts.some((count) => count > 0);
      });
      const objective = state?.objectives.find((row) => row.id === id);
      return [id, state ? {
        atSeconds: Number(state.matchElapsedSeconds.toFixed(1)),
        unitCounts: objective.unitCounts,
      } : null];
    }));
    const firstOwner = Object.fromEntries(['capture-zone-1', 'capture-zone-2'].map((id) => {
      const state = states.find((candidate) => {
        const objective = candidate.objectives.find((row) => row.id === id);
        return objective && objective.owner !== -1;
      });
      const objective = state?.objectives.find((row) => row.id === id);
      return [id, state ? {
        atSeconds: Number(state.matchElapsedSeconds.toFixed(1)),
        team: objective.owner,
      } : null];
    }));
    const timeline = {};
    const checkpoints = [...new Set([25, 40, 60, observationSeconds])]
      .filter((seconds) => seconds <= observationSeconds);
    for (const checkpoint of checkpoints) {
      const state = stateAtOrAfter(states, checkpoint);
      if (!state) continue;
      timeline[checkpoint] = {
        atSeconds: Number(state.matchElapsedSeconds.toFixed(1)),
        resources: [0, 1].map((team) => ({
          team,
          food: state.food[team],
          wood: state.wood[team],
          foodDelivered: state.food[team] - startFood[team],
          woodDelivered: state.wood[team] - startWood[team],
        })),
        objectives: ['capture-zone-1', 'capture-zone-2'].map((id) => {
          const objective = state.objectives.find((row) => row.id === id);
          return {
            id,
            owner: objective.owner,
            progressTeam: objective.progressTeam,
            progress: objective.progress,
            unitCounts: objective.unitCounts,
          };
        }),
        participants: participantSummary(state, groups, gatherTargets, map),
        resourcesByObserver: clientsByTeam.map((client, observerTeam) => {
          const observerState = stateAtOrAfter(client.states.filter((candidate) => (
            candidate.mapId === map.id && Number.isFinite(candidate.matchElapsedSeconds)
          )), checkpoint);
          return {
            observerTeam,
            food: observerState?.food,
            wood: observerState?.wood,
          };
        }),
      };
    }

    const result = {
      splitTeam,
      responseTeam,
      responseOrder: 'attackMove',
      observationSeconds,
      startingResources: { food: 150, wood: 250 },
      opening: '5 infantry north; 3 infantry + 2 workers south; 2 workers gather. Response: 5 infantry attack-move south; 4 workers gather.',
      objectiveEntry: firstObjectiveEntry,
      firstDamageAtSeconds: firstDamageState
        ? Number(firstDamageState.matchElapsedSeconds.toFixed(1)) : null,
      firstSplitWorkerLossAtSeconds: firstWorkerLossState
        ? Number(firstWorkerLossState.matchElapsedSeconds.toFixed(1)) : null,
      firstOwner,
      final: {
        atSeconds: Number(finalState.matchElapsedSeconds.toFixed(1)),
        objectives: ['capture-zone-1', 'capture-zone-2'].map((id) => {
          const objective = finalState.objectives.find((row) => row.id === id);
          return {
            id,
            owner: objective.owner,
            progressTeam: objective.progressTeam,
            progress: objective.progress,
            unitCounts: objective.unitCounts,
          };
        }),
        participants: participantSummary(finalState, groups, gatherTargets, map),
        resources: [0, 1].map((team) => ({
          team,
          food: finalState.food[team],
          wood: finalState.wood[team],
          foodDelivered: finalState.food[team] - startFood[team],
          woodDelivered: finalState.wood[team] - startWood[team],
        })),
        resourcesByObserver: clientsByTeam.map((client, observerTeam) => {
          const observerState = client.latestState();
          return {
            observerTeam,
            food: observerState?.food,
            wood: observerState?.wood,
          };
        }),
      },
      timeline,
      acceptedOrders,
    };
    return result;
  } catch (error) {
    throw new Error(`worker-split run for team ${splitTeam} failed: ${error.message}\n${serverLog}`);
  } finally {
    for (const client of clients) await client.close();
    if (server.exitCode === null && server.signalCode === null) {
      server.kill('SIGTERM');
      await once(server, 'exit').catch(() => {});
    }
    await rm(temporary, { recursive: true, force: true });
  }
}

const results = [];
try {
  for (const splitTeam of [0, 1]) results.push(await runCase(splitTeam));
  process.stdout.write(`${JSON.stringify({
    event: 'complete',
    baselineCommit,
    harnessCommit,
    map: relativeMapPath,
    mapSourceSha256,
    runtime,
    scenario: 'scripted Forked Vale worker-split versus five-infantry attack-move response; no buildings or human input',
    results,
  })}\n`);
} catch (error) {
  process.stdout.write(`${JSON.stringify({
    event: 'failed',
    baselineCommit,
    harnessCommit,
    map: relativeMapPath,
    mapSourceSha256,
    runtime,
    completedResults: results,
    error: error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : String(error),
  })}\n`);
  throw error;
}
