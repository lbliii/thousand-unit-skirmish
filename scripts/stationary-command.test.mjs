import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const server = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');
const client = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const stationary = server.slice(server.indexOf('function assignStationaryOrder('), server.indexOf('function assignAttack('));
const clearAttack = server.slice(server.indexOf('function clearAttackMoveOrder('), server.indexOf('function clearAttackTarget('));
const clearGather = server.slice(server.indexOf('function cancelGatherOrder('), server.indexOf('function workerDropoffCandidates('));
for (const type of ['stop', 'holdPosition']) test(`${type} preserves cargo and shared building while invalidating worker and planner ownership`, () => {
  const unit = { team: 1, hp: 40, orderRevision: 17, path: [8, 9], pathIndex: 1,
    cargo: 7.25, cargoType: 'wood', gatherNodeId: 'timber', gatherForestCell: 3, gatherPhase: 'to-base',
    buildingTargetId: 5, repairing: true, queuedWaypoints: [{ destination: 42 }],
    movePlanningPending: true, attackMove: true, attackMoveResumePath: [10], attackMoveResumePathIndex: 1,
    attackTargetId: 1, attackBuildingTargetId: 2 };
  const building = { id: 5, hp: 600, complete: false };
  const notices = [];
  const context = vm.createContext({ dirty: false, tickNumber: 24, commandUnits: () => [unit],
    sendOrderNotice: (_, __, notice) => notices.push(notice) });
  vm.runInContext(clearAttack + clearGather + stationary, context);
  context.assignStationaryOrder({ team: 1 }, { type, ids: [3] });
  assert.equal(unit.orderRevision, 18); // An in-flight assignment captured revision 17 and cannot apply.
  assert.equal(unit.movePlanningPending, false); assert.equal(unit.moveGoalCell, -1);
  assert.equal(unit.path.length, 0); assert.equal(unit.queuedWaypoints.length, 0);
  assert.equal(unit.gatherNodeId, null); assert.equal(unit.gatherForestCell, -1); assert.equal(unit.gatherPhase, '');
  assert.equal(unit.buildingTargetId, null); assert.equal(unit.repairing, false);
  assert.equal(unit.attackTargetId, -1); assert.equal(unit.attackBuildingTargetId, -1);
  assert.equal(unit.attackMove, false); assert.equal(unit.attackMoveResumePath, null);
  assert.equal(unit.holdingPosition, type === 'holdPosition');
  assert.equal(unit.cargo, 7.25); assert.equal(unit.cargoType, 'wood');
  assert.deepEqual(building, { id: 5, hp: 600, complete: false });
  assert.ok(notices[0].endsWith('ORDER · 1 UNITS'));
});
const issue = client.slice(client.indexOf('function issueStationaryOrder('), client.indexOf('for (const button of document.querySelectorAll', client.indexOf('function issueStationaryOrder(')));
for (const team of [0, 1]) test(`seat ${team} sends tracked stationary commands without a battlefield target`, () => {
  const commands = []; const modes = [];
  const context = vm.createContext({ localTeam: team, matchWinner: -1, selectedIds: () => [7, 8],
    showToast: () => {}, sendTrackedOrder: (command, label, count) => { commands.push({ command, label, count }); return 12; },
    setTapOrderArmed: value => modes.push(value), setAttackMoveMode: value => modes.push(value) });
  vm.runInContext(issue, context); context.issueStationaryOrder('holdPosition');
  assert.deepEqual(JSON.parse(JSON.stringify(commands)), [{ command: { type: 'holdPosition', ids: [7, 8] }, label: 'HOLD POSITION', count: 2 }]);
  assert.deepEqual(modes, [false, false]);
  context.localTeam = null; context.issueStationaryOrder('stop'); assert.equal(commands.length, 1);
  context.localTeam = team; context.matchWinner = 0; context.issueStationaryOrder('stop'); assert.equal(commands.length, 1);
});
test('stationary commands have keyboard and touch/context controls', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  for (const type of ['stop', 'holdPosition']) assert.equal((html.match(new RegExp(`data-stationary-order="${type}"`, 'g')) || []).length, 2);
  assert.ok(client.includes("issueStationaryOrder(event.key.toLowerCase() === 's' ? 'stop' : 'holdPosition')"));
});

test('selection refresh enables stationary controls immediately and clears stale availability', () => {
  const buttons = [{ disabled: true }, { disabled: true }];
  let ids = [];
  const context = vm.createContext({ localTeam: 0, matchWinner: -1, selectedIds: () => ids,
    document: { querySelectorAll: () => buttons } });
  vm.runInContext(client.slice(client.indexOf('function updateStationaryOrderControls('), client.indexOf('function updateSelectionUI(')), context);
  context.updateStationaryOrderControls(null); assert.ok(buttons.every(button => button.disabled));
  ids = [4, 5]; context.updateStationaryOrderControls(null); assert.ok(buttons.every(button => !button.disabled));
  context.updateStationaryOrderControls({ id: 7 }); assert.ok(buttons.every(button => button.disabled));
  context.updateStationaryOrderControls(null); assert.ok(buttons.every(button => !button.disabled));
  ids = []; context.updateStationaryOrderControls(null); assert.ok(buttons.every(button => button.disabled));
  assert.ok(client.slice(client.indexOf('function updateSelectionUI('), client.indexOf('function updateContextualCommands(')).includes('updateStationaryOrderControls(selectedBuilding)'));
});
