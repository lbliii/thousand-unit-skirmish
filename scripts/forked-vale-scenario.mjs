import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const winnerTeam = Number(process.argv[2] ?? 0);
assert.ok([0, 1].includes(winnerTeam), 'pass the expected winner team as 0 or 1');
const loserTeam = 1 - winnerTeam;
const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'forked-vale-playthrough-'));
const scenarioMapId = 'forked-vale-finite-probe';
const finiteProbeNodeId = 'finite-probe-food';
const finiteProbeStock = 5;
const scenarioMap = JSON.parse(await readFile(path.join(root, 'maps/forked-vale.json'), 'utf8'));
scenarioMap.id = scenarioMapId;
scenarioMap.name = 'Forked Vale Finite Probe';
scenarioMap.resourceNodes.push({ id: finiteProbeNodeId, type: 'food', x: -32.5, z: 0.5, stock: finiteProbeStock });
const portListener = createServer();
portListener.listen(Number.isFinite(Number(process.argv[3])) ? Number(process.argv[3]) : 0, '127.0.0.1');
await once(portListener, 'listening');
const port = portListener.address().port;
await new Promise((resolve, reject) => portListener.close(error => error ? reject(error) : resolve()));
const child = spawn(process.execPath, ['server.mjs'], {
  cwd: root,
  env: { ...process.env, PORT: String(port), RTS_HOST: '127.0.0.1', RTS_MAP: 'maps/forked-vale.json',
    RTS_MATCH_STATE_PATH: path.join(tempRoot, 'match.json'), RTS_CUSTOM_MAP_DIRECTORY: path.join(tempRoot, 'maps') },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let log = '';
child.stdout.on('data', chunk => { log += chunk.toString(); });
child.stderr.on('data', chunk => { log += chunk.toString(); });
const clients = [];
let stage = 'starting isolated Forked Vale match';
let finiteProbeWorkerId = null;
let workerTaskSwitch = null;

function createClient(team) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`, ['rts-v1']);
  const client = { socket, team, messages: [], states: [], waiters: [], messageWaiters: [] };
  socket.addEventListener('message', event => {
    let message;
    try { message = JSON.parse(event.data); } catch { return; }
    client.messages.push(message);
    for (let i = client.messageWaiters.length - 1; i >= 0; i--) {
      const waiter = client.messageWaiters[i];
      if (!waiter.predicate(message)) continue;
      client.messageWaiters.splice(i, 1);
      clearTimeout(waiter.timeout);
      waiter.resolve(message);
    }
    const state = message.type === 'state' ? message
      : ['welcome', 'mapChange'].includes(message.type) ? message.state : null;
    if (!state) return;
    client.states.push(state);
    for (let i = client.waiters.length - 1; i >= 0; i--) {
      const waiter = client.waiters[i];
      if (!waiter.predicate(state)) continue;
      client.waiters.splice(i, 1);
      clearTimeout(waiter.timeout);
      waiter.resolve(state);
    }
  });
  client.welcome = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('welcome timed out')), 12000);
    socket.addEventListener('message', event => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'welcome') { clearTimeout(timer); resolve(message); }
      } catch {}
    });
    socket.addEventListener('error', () => { clearTimeout(timer); reject(new Error('WebSocket failed')); });
  });
  client.waitState = (predicate, timeoutMs = 90000) => {
    const existing = [...client.states].reverse().find(predicate);
    if (existing) return Promise.resolve(existing);
    return new Promise((resolve, reject) => {
      const waiter = { predicate, resolve, timeout: setTimeout(() => {
        client.waiters.splice(client.waiters.indexOf(waiter), 1);
        reject(new Error(`state timeout for team ${client.team}`));
      }, timeoutMs) };
      client.waiters.push(waiter);
    });
  };
  client.waitNextState = (predicate, timeoutMs = 12000) => new Promise((resolve, reject) => {
    const waiter = { predicate, resolve, timeout: setTimeout(() => {
      client.waiters.splice(client.waiters.indexOf(waiter), 1);
      reject(new Error(`new state timeout for team ${client.team}`));
    }, timeoutMs) };
    client.waiters.push(waiter);
  });
  client.waitMessage = (predicate, afterIndex = 0, timeoutMs = 12000) => {
    const existing = client.messages.slice(afterIndex).reverse().find(predicate);
    if (existing) return Promise.resolve(existing);
    return new Promise((resolve, reject) => {
      const waiter = { predicate, resolve, timeout: setTimeout(() => {
        client.messageWaiters.splice(client.messageWaiters.indexOf(waiter), 1);
        reject(new Error(`message timeout for team ${client.team}`));
      }, timeoutMs) };
      client.messageWaiters.push(waiter);
    });
  };
  clients.push(client);
  return client;
}

const objective = (state, id) => state.objectives.find(row => row.id === id);
const move = (client, ids, x, z) => client.socket.send(JSON.stringify({ type: 'move', ids, x, z }));
function nearestIds(state, team, x, z, count, exclude = new Set()) {
  return state.units.filter(row => row[1] === team && row[4] > 0 && row[5] === 'infantry' && !exclude.has(row[0]))
    .sort((a, b) => Math.hypot(a[2] - x, a[3] - z) - Math.hypot(b[2] - x, b[3] - z))
    .slice(0, count).map(row => row[0]);
}
const testStartedAt = Date.now();
const logStep = name => console.log(JSON.stringify({ stage: name,
  elapsedSeconds: Number(((Date.now() - testStartedAt) / 1000).toFixed(1)) }));
const flank = winnerTeam === 0
  ? { winner: { id: 'capture-zone-1', x: 0, z: -16 }, loser: { id: 'capture-zone-2', x: 0, z: 16 } }
  : { winner: { id: 'capture-zone-2', x: 0, z: 16 }, loser: { id: 'capture-zone-1', x: 0, z: -16 } };

try {
  const healthDeadline = Date.now() + 15000;
  let healthy = false;
  while (Date.now() < healthDeadline) {
    if (child.exitCode !== null) throw new Error(`server exited: ${log}`);
    try {
      if ((await fetch(`http://127.0.0.1:${port}/health`)).ok) { healthy = true; break; }
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.equal(healthy, true, `server health timed out: ${log}`);
  stage = 'joining both player seats';
  const azure = createClient(0);
  const azureWelcome = await azure.welcome;
  assert.equal(azureWelcome.player.team, 0);
  const ember = createClient(1);
  const emberWelcome = await ember.welcome;
  assert.equal(emberWelcome.player.team, 1);
  assert.equal(azureWelcome.map.id, 'forked-vale');
  assert.equal(emberWelcome.map.id, 'forked-vale');
  assert.equal(azureWelcome.state.armySize, 24);
  assert.equal(emberWelcome.state.armySize, 24);
  const clientsByTeam = [azure, ember];
  stage = 'publishing a disposable map with a finite resource probe';
  const published = azure.waitMessage(message => message.type === 'mapPublished'
    && message.mapId === scenarioMapId);
  const mapStates = clientsByTeam.map(client => client.waitNextState(state => state.mapId === scenarioMapId));
  azure.socket.send(JSON.stringify({ type: 'publishMap', map: scenarioMap }));
  const [publishedMessage, ...openingStates] = await Promise.all([published, ...mapStates]);
  assert.equal(publishedMessage.mapId, scenarioMapId);
  assert.deepEqual(openingStates.map(state => state.armySize), [24, 24]);
  const initialUnitCounts = openingStates.map((state, team) =>
    state.units.filter(row => row[1] === team && row[4] > 0).length);
  assert.deepEqual(openingStates[0].food, [150, null]);
  assert.deepEqual(openingStates[1].food, [null, 150]);
  assert.deepEqual(openingStates[0].wood, [250, null]);
  assert.deepEqual(openingStates[1].wood, [null, 250]);
  const winnerClient = clientsByTeam[winnerTeam];
  const loserClient = clientsByTeam[loserTeam];
  const initialInfantryIds = openingStates.map((state, team) => new Set(
    state.units
      .filter(row => row[1] === team && row[4] > 0 && row[5] === 'infantry')
      .map(row => row[0])));

  stage = 'opening economy for both teams';
  const workers = clientsByTeam.map((client, team) => openingStates[team].units
    .filter(row => row[1] === team && row[5] === 'worker' && row[4] > 0).map(row => row[0]));
  assert.deepEqual(workers.map(row => row.length), [4, 4]);
  stage = 'depleting and rejecting a finite resource node';
  const finiteNode = state => state.resourceNodes.find(row => row.id === finiteProbeNodeId);
  finiteProbeWorkerId = workers[0][0];
  assert.equal(finiteNode(openingStates[0])?.stock, finiteProbeStock);
  assert.equal(finiteNode(openingStates[1]), undefined,
    'the probe node must remain hidden from the opposing seat under fog of war');
  azure.socket.send(JSON.stringify({ type: 'gather', ids: [finiteProbeWorkerId], nodeId: finiteProbeNodeId }));
  const depletedState = await azure.waitState(state => finiteNode(state)?.stock === 0
    && state.units.find(row => row[0] === finiteProbeWorkerId)?.[6] >= finiteProbeStock - 0.01
    && state.units.find(row => row[0] === finiteProbeWorkerId)?.[7] === 'food', 90000);
  assert.equal(finiteNode(depletedState).stock, 0);
  const depositedState = await azure.waitState(state => finiteNode(state)?.stock === 0
    && state.food[0] === 150 + finiteProbeStock
    && state.units.find(row => row[0] === finiteProbeWorkerId)?.[6] === 0, 90000);
  assert.equal(depositedState.food[0], 150 + finiteProbeStock,
    'the depleted five-unit node must credit exactly five food to the player');
  const rejectedGatherToken = 84_001;
  const emptyNodeNotice = azure.waitMessage(message => message.type === 'notice'
    && message.clientOrderToken === rejectedGatherToken
    && message.message === `RESOURCE NODE EMPTY · ${finiteProbeNodeId.toUpperCase()}`);
  azure.socket.send(JSON.stringify({ type: 'gather', ids: [finiteProbeWorkerId],
    nodeId: finiteProbeNodeId, clientOrderToken: rejectedGatherToken }));
  await emptyNodeNotice;
  logStep('finite node depleted, cargo deposited, and a repeat gather order was rejected');

  stage = 'opening economy for both teams';
  for (const team of [0, 1]) {
    const client = clientsByTeam[team];
    client.socket.send(JSON.stringify({ type: 'gather', ids: [workers[team][0]],
      nodeId: team === 0 ? 'food-17-39' : 'food-62-39' }));
    client.socket.send(JSON.stringify({ type: 'gather', ids: [workers[team][1]],
      nodeId: team === 0 ? 'wood-17-25' : 'wood-62-25' }));
  }
  await Promise.all(clientsByTeam.map((client, team) => client.waitState(state =>
    state.food?.[team] > 150 && state.wood?.[team] > 250, 120000)));
  logStep('both teams gathered food and wood from mirrored base nodes');

  stage = `interrupting Team ${winnerTeam} food gathering with carried cargo`;
  const taskSwitchClient = clientsByTeam[winnerTeam];
  const taskSwitchWorkerId = workers[winnerTeam][0];
  const taskSwitchWoodNodeId = winnerTeam === 0 ? 'wood-17-25' : 'wood-62-25';
  const taskSwitchSpawn = { x: winnerTeam === 0 ? -26.5 : 26.5, z: 0.5 };
  const carryingFood = await taskSwitchClient.waitState(state => {
    const worker = state.units.find(row => row[0] === taskSwitchWorkerId);
    return worker?.[6] > 0 && worker[6] <= 5 && worker[7] === 'food'
      && worker[9] === 'gathering';
  }, 90000);
  const carryingWorker = carryingFood.units.find(row => row[0] === taskSwitchWorkerId);
  const cargoBeforeInterrupt = carryingWorker[6];
  const foodBeforeInterrupt = carryingFood.food[winnerTeam];
  const moveAckIndex = taskSwitchClient.messages.length;
  const moveAck = taskSwitchClient.waitMessage(message => message.type === 'notice'
    && message.message?.startsWith('MOVE ORDER'), moveAckIndex);
  move(taskSwitchClient, [taskSwitchWorkerId], taskSwitchSpawn.x, taskSwitchSpawn.z);
  await moveAck;
  const interruptedGather = await taskSwitchClient.waitState(state => {
    const worker = state.units.find(row => row[0] === taskSwitchWorkerId);
    return worker?.[9] === 'idle'
      && Math.hypot(worker[2] - taskSwitchSpawn.x, worker[3] - taskSwitchSpawn.z) < 1.5;
  }, 90000);
  const interruptedWorker = interruptedGather.units.find(row => row[0] === taskSwitchWorkerId);
  assert.equal(interruptedWorker[7], 'food',
    'interrupting a gather order must preserve the carried resource type');
  assert.ok(Math.abs(interruptedWorker[6] - cargoBeforeInterrupt) <= 0.01,
    'interrupting a gather order must preserve the worker cargo amount');
  assert.equal(interruptedGather.food[winnerTeam], foodBeforeInterrupt,
    'moving a loaded worker must not deposit cargo without a gather order');

  stage = `retasking Team ${winnerTeam} worker from food cargo to wood`;
  const gatherAckIndex = taskSwitchClient.messages.length;
  const gatherAck = taskSwitchClient.waitMessage(message => message.type === 'notice'
    && message.message === 'GATHER ORDER · 1 WORKERS', gatherAckIndex);
  taskSwitchClient.socket.send(JSON.stringify({ type: 'gather', ids: [taskSwitchWorkerId],
    nodeId: taskSwitchWoodNodeId }));
  await gatherAck;
  const depositedFood = await taskSwitchClient.waitState(state => {
    const worker = state.units.find(row => row[0] === taskSwitchWorkerId);
    return state.food?.[winnerTeam] >= foodBeforeInterrupt + cargoBeforeInterrupt - 0.02
      && worker?.[6] === 0 && worker[7] === null && worker[9] === 'gathering';
  }, 90000);
  const foodDeposit = depositedFood.food[winnerTeam] - foodBeforeInterrupt;
  assert.ok(Math.abs(foodDeposit - cargoBeforeInterrupt) <= 0.02,
    'retasking to wood must deposit the worker’s carried food exactly once before gathering wood');
  const clearedCargoWorker = depositedFood.units.find(row => row[0] === taskSwitchWorkerId);
  assert.equal(clearedCargoWorker[7], null,
    'the worker must clear its old cargo after depositing before switching resources');
  const switchedResource = await taskSwitchClient.waitState(state => {
    const worker = state.units.find(row => row[0] === taskSwitchWorkerId);
    return worker?.[6] > 0 && worker[7] === 'wood' && worker[9] === 'gathering';
  }, 90000);
  const switchedWorker = switchedResource.units.find(row => row[0] === taskSwitchWorkerId);
  workerTaskSwitch = {
    team: winnerTeam,
    workerId: taskSwitchWorkerId,
    interruptedCargo: cargoBeforeInterrupt,
    foodDeposit,
    nextResourceNode: taskSwitchWoodNodeId,
    newCargoType: switchedWorker[7],
    passed: true,
  };
  logStep(`Team ${winnerTeam} kept interrupted food cargo, deposited it once, and resumed on wood`);

  stage = 'building mirrored barracks and training infantry';
  for (const team of [0, 1]) {
    clientsByTeam[team].socket.send(JSON.stringify({ type: 'build', buildingType: 'barracks',
      ids: workers[team].slice(2), x: team === 0 ? -21.5 : 21.5, z: 0.5 }));
  }
  const barracks = await Promise.all(clientsByTeam.map((client, team) => client.waitState(state =>
    state.buildings?.some(building => building.team === team && building.type === 'barracks'
      && building.complete === true), 120000)));
  for (const team of [0, 1]) {
    const building = barracks[team].buildings.find(row => row.team === team && row.type === 'barracks');
    clientsByTeam[team].socket.send(JSON.stringify({ type: 'train', buildingId: building.id }));
  }
  const trainedStates = await Promise.all(clientsByTeam.map((client, team) => client.waitState(state =>
    state.units.filter(row => row[1] === team && row[5] === 'infantry' && row[4] > 0).length >= 9, 90000)));
  const producedInfantryIds = trainedStates.map((state, team) => state.units
    .filter(row => row[1] === team && row[4] > 0 && row[5] === 'infantry'
      && !initialInfantryIds[team].has(row[0]))
    .map(row => row[0]));
  assert.deepEqual(producedInfantryIds.map(ids => ids.length), [1, 1],
    'each team must receive exactly one new infantry from its completed barracks');
  const winnerUnits = [
    ...nearestIds(openingStates[winnerTeam], winnerTeam,
      flank.winner.x, flank.winner.z, 4),
    producedInfantryIds[winnerTeam][0],
  ];
  const loserUnits = [
    ...nearestIds(openingStates[loserTeam], loserTeam,
      flank.loser.x, flank.loser.z, 4),
    producedInfantryIds[loserTeam][0],
  ];
  assert.equal(winnerUnits.length, 5);
  assert.equal(loserUnits.length, 5);
  assert.ok(winnerUnits.includes(producedInfantryIds[winnerTeam][0]));
  assert.ok(loserUnits.includes(producedInfantryIds[loserTeam][0]));
  logStep('both teams completed a barracks and sent its trained infantry to the objective front');

  stage = 'capturing opposite flank objectives';
  const winnerFlankCaptured = winnerClient.waitState(state => objective(state, flank.winner.id)?.owner === winnerTeam);
  const loserFlankCaptured = loserClient.waitState(state => objective(state, flank.loser.id)?.owner === loserTeam);
  move(winnerClient, winnerUnits, flank.winner.x, flank.winner.z);
  move(loserClient, loserUnits, flank.loser.x, flank.loser.z);
  await Promise.all([winnerFlankCaptured, loserFlankCaptured]);
  const opposingOwners = await Promise.all([
    azure.waitState(state => objective(state, flank.winner.id)?.owner === winnerTeam
      && objective(state, flank.loser.id)?.owner === loserTeam),
    ember.waitState(state => objective(state, flank.winner.id)?.owner === winnerTeam
      && objective(state, flank.loser.id)?.owner === loserTeam),
  ]);
  assert.ok(opposingOwners.every(state => objective(state, 'capture-zone-3')?.owner === -1));
  logStep(`Team ${winnerTeam} owns ${flank.winner.id}; Team ${loserTeam} owns ${flank.loser.id}; keep remains neutral`);

  stage = 'attempting the gated keep before prerequisites are united';
  const winnerKeepUnits = nearestIds(winnerClient.states.at(-1), winnerTeam, 0, 0, 8);
  assert.equal(winnerKeepUnits.length, 8);
  const beforeKeepOrder = winnerClient.states.length;
  move(winnerClient, winnerKeepUnits, 0, 0);
  const gatedPresence = await winnerClient.waitState(state => objective(state, 'capture-zone-3')?.unitCounts?.[winnerTeam] >= 8
    && objective(state, 'capture-zone-3')?.requiredOwners?.[0] === objective(state, 'capture-zone-1')?.owner
    && objective(state, 'capture-zone-3')?.requiredOwners?.[1] === objective(state, 'capture-zone-2')?.owner
    && objective(state, 'capture-zone-1')?.owner !== objective(state, 'capture-zone-2')?.owner);
  const gatedTick = gatedPresence.tick;
  await new Promise(resolve => setTimeout(resolve, 1500));
  const gatedSnapshots = winnerClient.states.filter(state => state.tick >= gatedTick
    && objective(state, 'capture-zone-3')?.unitCounts?.[winnerTeam] >= 8);
  assert.ok(winnerClient.states.length > beforeKeepOrder);
  assert.ok(gatedSnapshots.length >= 8, `expected repeated keep states, saw ${gatedSnapshots.length}`);
  assert.ok(gatedSnapshots.every(state => {
    const keep = objective(state, 'capture-zone-3');
    return keep.owner === -1 && keep.progressTeam === -1 && keep.progress === 0;
  }), `keep must not progress while Team ${loserTeam} owns one required flank`);
  logStep(`keep stayed locked for ${gatedSnapshots.length} snapshots with Team ${winnerTeam} units inside`);

  stage = `withdrawing Team ${loserTeam} and recapturing its flank`;
  const loserClearedFlank = loserClient.waitState(state => objective(state, flank.loser.id)?.unitCounts?.[loserTeam] === 0);
  move(loserClient, loserUnits, loserTeam === 0 ? -26.5 : 26.5, 0);
  await loserClearedFlank;
  const loserFlankRecaptured = Promise.all([
    azure.waitState(state => objective(state, flank.loser.id)?.owner === winnerTeam),
    ember.waitState(state => objective(state, flank.loser.id)?.owner === winnerTeam),
  ]);
  move(winnerClient, winnerKeepUnits, flank.loser.x, flank.loser.z);
  await loserFlankRecaptured;
  logStep(`Team ${winnerTeam} retook ${flank.loser.id}; both prerequisite owners match`);

  stage = 'capturing the now-unlocked keep and resolving all-objectives victory';
  const azureVictory = azure.waitState(state => state.winner === winnerTeam
    && state.winnerTriggerId === 'capture-zone-3' && state.winnerReason === 'capture-hold');
  const emberVictory = ember.waitState(state => state.winner === winnerTeam
    && state.winnerTriggerId === 'capture-zone-3' && state.winnerReason === 'capture-hold');
  move(winnerClient, winnerKeepUnits, 0, 0);
  const [finalAzure, finalEmber] = await Promise.all([azureVictory, emberVictory]);
  for (const state of [finalAzure, finalEmber]) {
    assert.deepEqual(state.objectives.filter(row => row.victory).map(row => row.owner),
      Array(3).fill(winnerTeam));
  }
  logStep(`Team ${winnerTeam} completed the 20-second all-zone victory hold`);

  stage = 'resetting the completed match for both player seats';
  const resetStates = clientsByTeam.map(client => client.waitNextState(state => (
    state.mapId === scenarioMapId && state.winner === -1
      && state.objectives.filter(row => row.victory).every(row => row.owner === -1)
  )));
  azure.socket.send(JSON.stringify({ type: 'reset' }));
  const resetResults = await Promise.all(resetStates);
  for (const [team, state] of resetResults.entries()) {
    assert.equal(state.armySize, 24, 'rematch must restore the authored army size');
    assert.equal(state.units.filter(row => row[1] === team && row[4] > 0).length,
      initialUnitCounts[team], 'rematch must restore the player army');
    assert.deepEqual(state.food, team === 0 ? [150, null] : [null, 150],
      'rematch must restore starting food');
    assert.deepEqual(state.wood, team === 0 ? [250, null] : [null, 250],
      'rematch must restore starting wood');
    assert.equal(state.winnerTriggerId, null, 'rematch must clear the winning trigger');
    assert.equal(state.winnerReason, null, 'rematch must clear the victory reason');
  }
  assert.equal(finiteNode(resetResults[0])?.stock, finiteProbeStock,
    'rematch must restore the finite probe node to its authored stock');
  assert.equal(finiteNode(resetResults[1]), undefined,
    'the opposing seat must not see the hidden probe node after rematch reset');
  logStep('both seats reset to neutral objectives and the authored opening army');

  let stressResult = null;
  if (process.argv.includes('--stress')) {
    stage = '2,000-unit two-lane stress reset';
    azure.socket.send(JSON.stringify({ type: 'selectArmySize', count: 2000 }));
    const stressStarts = await Promise.all(clientsByTeam.map((client, team) => client.waitState(state =>
      state.armySize === 2000 && state.winner === -1
      && state.units.filter(row => row[1] === team && row[4] > 0).length === 1000, 60000)));
    const positions = stressStarts.map((state, team) => new Map(state.units
      .filter(row => row[1] === team && row[4] > 0).map(row => [row[0], [row[2], row[3]]])));
    const startingHealth = stressStarts.map((state, team) => new Map(state.units
      .filter(row => row[1] === team && row[4] > 0).map(row => [row[0], row[4]])));
    const damagedCount = (state, team) => {
      const currentHealth = new Map(state.units.filter(row => row[1] === team && row[4] > 0)
        .map(row => [row[0], row[4]]));
      return [...startingHealth[team]].filter(([id, health]) =>
        !currentHealth.has(id) || currentHealth.get(id) < health).length;
    };
    for (const team of [0, 1]) {
      const ids = [...positions[team].keys()];
      assert.equal(ids.length, 1000);
      move(clientsByTeam[team], ids, 0, team === 0 ? -16 : 16);
    }
    const moving = await Promise.all(clientsByTeam.map((client, team) => client.waitState(state =>
      state.armySize === 2000 && state.units.filter(row => row[1] === team && row[4] > 0
        && positions[team].has(row[0])
        && Math.hypot(row[2] - positions[team].get(row[0])[0],
          row[3] - positions[team].get(row[0])[1]) > 0.5).length >= 950, 90000)));
    stressResult = moving.map((state, team) => ({ team,
      moved: state.units.filter(row => row[1] === team && row[4] > 0
        && positions[team].has(row[0])
        && Math.hypot(row[2] - positions[team].get(row[0])[0],
          row[3] - positions[team].get(row[0])[1]) > 0.5).length }));
    logStep('both 1,000-unit armies moved toward separate crossings');
    stage = '2,000-unit contested attack-move engagement';
    for (const team of [0, 1]) {
      clientsByTeam[team].socket.send(JSON.stringify({ type: 'attackMove',
        ids: [...positions[team].keys()], x: 0, z: 0 }));
    }
    const fighting = await Promise.all(clientsByTeam.map((client, team) => client.waitState(state =>
      state.armySize === 2000 && damagedCount(state, team) >= 10, 120000)));
    stressResult.forEach((result, team) => { result.damagedOrKilled = damagedCount(fighting[team], team); });
    logStep('both 1,000-unit armies engaged with at least 10 units hurt or lost per team');
  }
  console.log(JSON.stringify({
    map: scenarioMapId, roster: finalAzure.armySize, testedWinner: winnerTeam,
    oppositeFlanks: [winnerTeam, loserTeam], lockedKeepSnapshots: gatedSnapshots.length,
    finalOwners: finalAzure.objectives.filter(row => row.victory).map(row => row.owner),
    winner: finalAzure.winner, winnerTriggerId: finalAzure.winnerTriggerId,
    winnerReason: finalAzure.winnerReason, rematchReset: 'both seats restored',
    workerTaskSwitch, stressResult,
  }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ stage, error: error.message, log,
    elapsedSeconds: Number(((Date.now() - testStartedAt) / 1000).toFixed(1)), workerTaskSwitch,
    latest: clients.map(client => {
      const state = client.states.at(-1);
      return { team: client.team, tick: state?.tick, winner: state?.winner,
        probeNode: state?.resourceNodes?.find(row => row.id === finiteProbeNodeId),
        probeWorkerId: finiteProbeWorkerId,
        probeWorker: state?.units?.find(row => row[0] === finiteProbeWorkerId),
        food: state?.food?.[client.team],
        objectives: state?.objectives?.map(row => ({ id: row.id, owner: row.owner,
          progressTeam: row.progressTeam, progress: row.progress, unitCounts: row.unitCounts,
          requiredOwners: row.requiredOwners })) };
    }) }, null, 2));
  process.exitCode = 1;
} finally {
  for (const client of clients) { try { client.socket.close(); } catch {} }
  if (child.exitCode === null) {
    child.kill('SIGTERM');
    await Promise.race([once(child, 'exit'), new Promise(resolve => setTimeout(resolve, 2500))]);
    if (child.exitCode === null) child.kill('SIGKILL');
  }
  await rm(tempRoot, { recursive: true, force: true });
}
