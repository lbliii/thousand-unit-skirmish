import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { privateProductionView } from '../src/snapshot-private-production.mjs';
const server = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');
const policy = server.slice(server.indexOf('const PERSISTENT_PLAN_BUDGET'), server.indexOf('// Stationary orders'));
function follower(id = 0) {
  return { id, team: 0, hp: 100, generation: 1, x: 0, z: 0, path: [], pathIndex: 0,
    attackTargetId: -1, attackBuildingTargetId: -1, orderRevision: 0,
    persistentOrder: { type: 'follow', targetId: 100, targetGeneration: 2,
      status: 'following', nextTick: 0, lastTargetCell: -1 } };
}
function contextFor(units, components = new Proxy({}, { get: () => 0 })) {
  const plans = [], stops = [], notices = [];
  const context = vm.createContext({ units, tickNumber: 30, TICK_RATE: 30, dirty: false,
    worldToCell: (x, z) => Math.floor(x) + Math.floor(z) * 100 + 5000,
    nearestOpenCell: cell => cell, walkableComponents: components,
    findAvailableCellNear: cell => cell,
    commandUnits: command => command.ids.map(id => units[id]).filter(Boolean),
    assignStationaryOrder: (_, command) => { for (const id of command.ids) { units[id].persistentOrder = null; stops.push(id); } },
    enqueueRouteRepairs: repairs => plans.push(...repairs),
    sendOrderNotice: (_, __, message) => notices.push(message) });
  vm.runInContext(policy, context); return { context, plans, stops, notices };
}
test('Follow stops on leader death, generation replacement and ownership change', () => {
  for (const change of [{ hp: 0 }, { generation: 3 }, { team: 1 }]) {
    const units = [follower()]; units[100] = { id: 100, team: 0, hp: 100, generation: 2, x: 10, z: 0, ...change };
    const { context, stops, plans } = contextFor(units); context.updatePersistentOrders();
    assert.deepEqual(stops, [0]); assert.equal(plans.length, 0);
  }
});
test('Follow uses a deadband and cannot start an enemy attack', () => {
  const unit = follower(); unit.path = [1, 2];
  const units = [unit]; units[100] = { id: 100, team: 0, hp: 100, generation: 2, x: 3, z: 0 };
  const { context, plans } = contextFor(units); context.updatePersistentOrders();
  assert.equal(plans.length, 0); assert.equal(unit.path.length, 0); assert.equal(unit.orderRevision, 1);
  assert.equal(unit.attackTargetId, -1);
});
test('Persistent plans have a global 64-unit cap per tick and no duplicate pending planning', () => {
  const units = Array.from({ length: 100 }, (_, id) => follower(id));
  units[100] = { id: 100, team: 0, hp: 100, generation: 2, x: 15, z: 0 };
  units[0].movePlanningPending = true;
  const { context, plans } = contextFor(units); context.updatePersistentOrders();
  assert.equal(plans.length, 64); assert.ok(plans.every(plan => plan.unit.id !== 0));
  assert.equal(units[99].persistentOrder.nextTick, 31);
});
test('Disconnected persistent route reports blocked and retries at two seconds', () => {
  const unit = follower(); const units = [unit]; units[100] = { id: 100, team: 0, hp: 100, generation: 2, x: 10, z: 0 };
  const components = new Proxy({}, { get: (_, cell) => Number(cell) === 5000 ? 0 : 1 });
  const { context, plans } = contextFor(units, components); context.updatePersistentOrders();
  assert.equal(plans.length, 0); assert.equal(unit.persistentOrder.status, 'blocked');
  assert.equal(unit.persistentOrder.nextTick, 90);
});
test('Patrol preserves its repeated leg through combat and resumes after a detour', () => {
  const unit = follower(); unit.attackMove = true;
  unit.persistentOrder = { type: 'patrol', start: 5000, end: 5010, leg: 1, nextTick: 0, status: 'active' };
  unit.attackTargetId = 2;
  const { context, plans } = contextFor([unit]); context.updatePersistentOrders();
  assert.equal(plans.length, 0); assert.equal(unit.persistentOrder.leg, 1);
  unit.attackTargetId = -1; context.tickNumber = 60; context.updatePersistentOrders();
  assert.equal(plans[0].destination, 5010);
  unit.x = 10; context.tickNumber = 90; context.updatePersistentOrders();
  assert.equal(unit.persistentOrder.leg, 0); assert.equal(plans[1].destination, 5000);
});
test('Follow rejects indirect cycles without interrupting existing orders', () => {
  const unit = follower(); const units = [unit];
  units[100] = { id: 100, team: 0, hp: 100, generation: 2,
    persistentOrder: { type: 'follow', targetId: 0, targetGeneration: 1 } };
  const { context, stops, notices } = contextFor(units);
  context.assignFollowOrder({ team: 0 }, { ids: [0], targetId: 100, targetGeneration: 2 });
  assert.match(notices[0], /FOLLOW CYCLE/); assert.equal(stops.length, 0);
});

test('Current older checkpoints explicitly initialize missing persistent intent', () => {
  const migration = server.slice(server.indexOf('function migrateMatchCheckpoint('), server.indexOf('async function drainMatchCheckpointWrites'));
  const schemaVersion = Number(server.match(/const MATCH_CHECKPOINT_SCHEMA_VERSION = (\d+)/)[1]);
  const rulesVersion = Number(server.match(/const MATCH_RULES_VERSION = (\d+)/)[1]);
  const context = vm.createContext({ MATCH_CHECKPOINT_SCHEMA_VERSION: schemaVersion, MATCH_RULES_VERSION: rulesVersion });
  vm.runInContext(migration, context);
  const checkpoint = { schemaVersion, rulesVersion, state: { units: [{ id: 0 }] } };
  context.migrateMatchCheckpoint(checkpoint);
  assert.equal(checkpoint.state.units[0].persistentOrder, null);
});

test('Cached no-fog snapshots retain persistent intent only for its owning seat', () => {
  const payload = { units: [[0, 0], [1, 1]], buildings: [], persistentOrders: [[0, 'patrol', 'active', null], [1, 'follow', 'following', 2]] };
  assert.deepEqual(privateProductionView(payload, 0).persistentOrders, [payload.persistentOrders[0]]);
  assert.deepEqual(privateProductionView(payload, 1).persistentOrders, [payload.persistentOrders[1]]);
  assert.equal(privateProductionView(payload, null), payload);
});
