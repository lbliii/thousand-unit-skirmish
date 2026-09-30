import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const fn = source.slice(source.indexOf('function updateBuildingLifecycleActions('), source.indexOf('function updateRosterBuildingOptions('));
for (const team of [0, 1]) test(`contextual lifecycle choices follow owned building state for seat ${team}`, () => {
  const commands = [];
  const container = { dataset: {}, children: [], replaceChildren() { this.children = []; }, append(button) { this.children.push(button); } };
  const building = { id: 7, team, complete: false, queue: 0, hp: 1800, maxHp: 1800 };
  const context = vm.createContext({ ui: { buildingLifecycleActions: container, cancelWorkerTraining: {} },
    document: { createElement() { return { dataset: {}, addEventListener(_, callback) { this.click = callback; } }; } },
    localTeam: team, latestBuildings: [building], selectedBuildingId: 7, matchWinner: -1,
    latestTeamResearch: [{}, {}], latestWorkerProduction: [{ queue: 1 }, { queue: 1 }],
    teamUnits: [[{ id: 1, hp: 100, kind: 'worker' }], [{ id: 2, hp: 100, kind: 'worker' }]],
    getBuildingQueueLength: (row) => row.queue, sendCommand: (command) => commands.push(command),
    sendTrackedOrder: (command, label, count, unitName) => { assert.equal(label, 'REPAIR'); assert.equal(count, 1); assert.equal(unitName, 'WORKERS'); commands.push(command); },
  });
  vm.runInContext(fn, context); context.updateBuildingLifecycleActions();
  assert.deepEqual(container.children.map((button) => button.dataset.action), ['cancelConstruction']); container.children[0].click();
  assert.deepEqual(JSON.parse(JSON.stringify(commands[0])), { type: 'cancelConstruction', buildingId: 7 });
  building.complete = true; building.queue = 2; building.hp = 900;
  context.latestTeamResearch[team].active = { buildingId: 7 };
  context.updateBuildingLifecycleActions();
  assert.deepEqual(container.children.map((button) => button.dataset.action), ['cancelTraining', 'cancelResearch', 'repairBuilding']);
  const repair = container.children.at(-1); repair.click();
  assert.deepEqual(JSON.parse(JSON.stringify(commands.at(-1))), { type: 'repairBuilding', buildingId: 7, ids: [team + 1] });
  context.updateBuildingLifecycleActions(); assert.equal(container.children.at(-1), repair, 'state refresh preserves focused action');
  building.team = 1 - team; context.updateBuildingLifecycleActions(); assert.equal(container.children.length, 0);
  context.localTeam = null; context.updateBuildingLifecycleActions(); assert.equal(context.ui.cancelWorkerTraining.disabled, true);
});
