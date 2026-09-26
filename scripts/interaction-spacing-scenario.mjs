import assert from 'node:assert/strict';

// Run against a disposable RTS_MAP=maps/open-field.json server.
const port = Number(process.argv[2] || 4174);
const endpoint = `ws://127.0.0.1:${port}/ws`;

function connect() {
  const socket = new WebSocket(endpoint);
  const messages = [];
  const waiters = [];
  socket.addEventListener('message', (event) => {
    let message;
    try { message = JSON.parse(event.data); } catch { return; }
    messages.push(message);
    for (const waiter of [...waiters]) {
      if (!waiter.predicate(message)) continue;
      waiters.splice(waiters.indexOf(waiter), 1);
      clearTimeout(waiter.timer);
      waiter.resolve(message);
    }
  });
  return {
    socket,
    messages,
    send(command) { socket.send(JSON.stringify(command)); },
    waitFor(predicate, timeoutMs = 35_000, after = 0) {
      const existing = messages.slice(after).find(predicate);
      if (existing) return Promise.resolve(existing);
      return new Promise((resolve, reject) => {
        const waiter = {
          predicate: (message) => messages.length > after && predicate(message),
          resolve,
          timer: null,
        };
        waiter.timer = setTimeout(() => {
          waiters.splice(waiters.indexOf(waiter), 1);
          reject(new Error(`Timed out after ${timeoutMs} ms; latest tick ${messages.at(-1)?.tick ?? 'unknown'}`));
        }, timeoutMs);
        waiters.push(waiter);
      });
    },
    waitForState(predicate, timeoutMs = 35_000) {
      const latest = messages.findLast((message) => message.type === 'state');
      if (latest && predicate(latest)) return Promise.resolve(latest);
      const after = messages.length;
      return this.waitFor((message) => message.type === 'state' && predicate(message), timeoutMs, after);
    },
  };
}

function unit(state, id) {
  return state.units.find((row) => row[0] === id);
}

async function close(socket) {
  if (socket.readyState === WebSocket.CLOSED) return;
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 2_000);
    socket.addEventListener('close', () => { clearTimeout(timer); resolve(); }, { once: true });
    socket.close(1000, 'interaction spacing scenario complete');
  });
}

const azure = connect();
const ember = connect();
try {
  const [azureWelcome, emberWelcome] = await Promise.all([
    azure.waitFor((message) => message.type === 'welcome'),
    ember.waitFor((message) => message.type === 'welcome'),
  ]);
  assert.equal(azureWelcome.player.team, 0);
  assert.equal(emberWelcome.player.team, 1);
  const reset = azure.waitForState((state) => state.armySize === 250);
  azure.send({ type: 'selectArmySize', count: 250 });
  await reset;

  // Place two idle enemies along one attack-move route, then check that the
  // squad engages both and continues toward its assigned destination.
  const firstMove = ember.waitFor((message) => message.type === 'notice'
    && message.message?.startsWith('MOVE ORDER'));
  ember.send({ type: 'move', ids: [125], x: -8, z: 12 });
  await firstMove;
  const secondMove = ember.waitFor((message) => message.type === 'notice'
    && message.message?.startsWith('MOVE ORDER'), 35_000, ember.messages.length);
  ember.send({ type: 'move', ids: [127], x: -8, z: 16 });
  await secondMove;
  await ember.waitForState((state) => {
    const first = unit(state, 125);
    const second = unit(state, 127);
    return first && second && Math.hypot(first[2] + 7.5, first[3] - 12.5) < 1
      && Math.hypot(second[2] + 7.5, second[3] - 16.5) < 1;
  });

  const order = azure.waitFor((message) => message.type === 'notice'
    && message.message?.startsWith('ATTACK MOVE ORDER'));
  azure.send({ type: 'attackMove', ids: [4, 5], x: -5, z: 12 });
  await order;
  const firstContact = await azure.waitForState((state) => {
    const target = unit(state, 125);
    const first = unit(state, 4);
    const second = unit(state, 5);
    return target?.[4] > 0 && first && second
      && Math.hypot(first[2] - target[2], first[3] - target[3]) <= 1.28
      && Math.hypot(second[2] - target[2], second[3] - target[3]) <= 1.28;
  });
  const attackSpread = await azure.waitForState((state) => state.tick >= firstContact.tick + 12
    && unit(state, 125)?.[4] > 0);
  const attackPair = Math.hypot(unit(attackSpread, 4)[2] - unit(attackSpread, 5)[2],
    unit(attackSpread, 4)[3] - unit(attackSpread, 5)[3]);
  assert.ok(attackPair >= 0.4, `attacking units overlap: pair ${attackPair.toFixed(2)}`);
  const firstKill = await azure.waitForState((state) => unit(state, 125)?.[4] === 0);
  const secondHit = await azure.waitForState((state) => unit(state, 127)?.[4] < 100);
  assert.ok(secondHit.tick > firstKill.tick, 'attack-move should acquire the next enemy after a kill');
  const arrived = await azure.waitForState((state) => {
    const attacker = unit(state, 4);
    return unit(state, 127)?.[4] === 0 && attacker
      && Math.hypot(attacker[2] + 4.5, attacker[3] - 12.5) < 1.4;
  });

  // Four workers using one berry node should keep usable positions around it.
  const gatherOrder = azure.waitFor((message) => message.type === 'notice'
    && message.message?.startsWith('GATHER ORDER'));
  azure.send({ type: 'gather', ids: [0, 1, 2, 3], nodeId: 'azure-berries' });
  await gatherOrder;
  const gathering = await azure.waitForState((state) => [0, 1, 2, 3].every((id) => {
    const worker = unit(state, id);
    return worker?.[6] > 0 && Math.hypot(worker[2] + 14, worker[3] - 5) <= 1.5;
  }));
  const settled = await azure.waitForState((state) => state.tick >= gathering.tick + 18);
  const workers = [0, 1, 2, 3].map((id) => unit(settled, id));
  let closestPair = Infinity;
  for (let left = 0; left < workers.length; left++) {
    for (let right = left + 1; right < workers.length; right++) {
      closestPair = Math.min(closestPair, Math.hypot(
        workers[left][2] - workers[right][2], workers[left][3] - workers[right][3],
      ));
    }
  }
  assert.ok(closestPair >= 0.4, `gathering workers overlap: closest pair ${closestPair.toFixed(2)}`);
  assert.ok(workers.every((worker) => Math.hypot(worker[2] + 14, worker[3] - 5) <= 1.5),
    'workers should remain within harvest range while spreading');

  console.log(JSON.stringify({
    scenario: 'attack-move retargeting and harvest spacing',
    firstKillTick: firstKill.tick,
    secondHitTick: secondHit.tick,
    routeArrivalTick: arrived.tick,
    attackingPair: Number(attackPair.toFixed(2)),
    closestGatheringPair: Number(closestPair.toFixed(2)),
  }, null, 2));
} finally {
  await Promise.all([close(azure.socket), close(ember.socket)]);
}
