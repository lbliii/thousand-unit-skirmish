import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { UNIT_DEFINITIONS, BUILDING_DEFINITIONS } from '../src/gameplay-definitions.mjs';
import { formatResourceRequirement } from '../src/resource-format.mjs';
const source = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const fn = source.slice(source.indexOf('function updateRosterProductionOptions('), source.indexOf('function updateEconomyUI('));
for (const team of [0, 1]) test(`roster production choices follow definitions and current affordability for seat ${team}`, () => {
  const commands = [];
  const building = { id: 7, team, type: 'barracks', complete: true, queue: 0 };
  const container = { dataset: {}, children: [], replaceChildren() { this.children = []; }, append(button) { this.children.push(button); } };
  const context = vm.createContext({ UNIT_DEFINITIONS, BUILDING_DEFINITIONS, formatResourceRequirement,
    document: { createElement() { return { dataset: {}, addEventListener(_, callback) { this.click = callback; } }; } },
    localTeam: team, latestBuildings: [building], teamUnits: [[], []],
    latestFood: [500, 500], latestWood: [500, 500], latestWorkerProduction: [null, null], latestPopulation: [null, null],
    BARRACKS_QUEUE_LIMIT: 5, MAX_PER_TEAM: 1000, MAX_UNITS: 2000, latestRosterSize: 0, matchWinner: -1,
    getBuildingQueueLength: (row) => row.queue, sendCommand: (command) => commands.push(command),
  });
  vm.runInContext(fn, context);
  context.updateRosterProductionOptions(container, building);
  assert.deepEqual(container.children.map((button) => button.dataset.product), BUILDING_DEFINITIONS.barracks.products);
  const spear = container.children.find((button) => button.dataset.product === 'spearman');
  assert.ok(spear); assert.equal(spear.disabled, false); spear.click();
  assert.deepEqual(JSON.parse(JSON.stringify(commands)), [{ type: 'trainUnit', kind: 'spearman', buildingId: 7 }]);
  context.latestFood[team] = 59.99;
  context.updateRosterProductionOptions(container, building);
  assert.equal(container.children.find((button) => button.dataset.product === 'spearman'), spear, 'resource updates preserve the focused button');
  assert.equal(spear.disabled, true); assert.match(spear.textContent, /Need 1 food/);
  context.latestFood[team] = 500; building.queue = 5;
  context.updateRosterProductionOptions(container, building);
  assert.equal(spear.disabled, true); assert.match(spear.textContent, /Queue full/);
  building.queue = 0; building.productionBlocked = true;
  context.updateRosterProductionOptions(container, building);
  assert.match(spear.textContent, /Clear spawn area/);
  building.productionBlocked = false;
  context.latestPopulation[team] = { used: 12, reserved: 3, capacity: 15, available: 0 };
  context.updateRosterProductionOptions(container, building);
  assert.equal(spear.disabled, true); assert.match(spear.textContent, /Population full · build a House/);
  context.latestPopulation[team].available = 8;
  building.productionOptions = [{ kind: 'spearman', available: false, reason: 'REQUIRES MILITARY TIER II' }];
  context.updateRosterProductionOptions(container, building);
  assert.equal(spear.disabled, true); assert.match(spear.textContent, /REQUIRES MILITARY TIER II/);
  context.updateRosterProductionOptions(container);
  assert.equal(container.hidden, true, 'unselected command bar hides roster-wide training choices');
  assert.equal(container.children.length, 0);
  context.updateRosterProductionOptions(container, null, true);
  assert.equal(container.hidden, false, 'the production panel retains its roster catalog');
  assert.ok(container.children.some(button => button.dataset.product === 'spearman'));
  assert.ok(container.children.some(button => button.dataset.product === 'siege-engine'));
});

for (const team of [0, 1]) test(`Stable exposes both mounted products and weighted population for seat ${team}`, () => {
  const building = { id: 8, team, type: 'stable', complete: true, queue: 0 };
  const commands = [];
  const container = { dataset: {}, children: [], replaceChildren() { this.children = []; }, append(button) { this.children.push(button); } };
  const context = vm.createContext({ UNIT_DEFINITIONS, BUILDING_DEFINITIONS, formatResourceRequirement,
    document: { createElement() { return { dataset: {}, addEventListener(_, callback) { this.click = callback; } }; } },
    localTeam: team, latestBuildings: [building], teamUnits: [[], []], latestFood: [500, 500], latestWood: [500, 500],
    latestWorkerProduction: [null, null], latestPopulation: [{ available: 1 }, { available: 1 }],
    BARRACKS_QUEUE_LIMIT: 5, MAX_PER_TEAM: 1000, MAX_UNITS: 2000, latestRosterSize: 0, matchWinner: -1,
    getBuildingQueueLength: row => row.queue, sendCommand: command => commands.push(command) });
  vm.runInContext(fn, context); context.updateRosterProductionOptions(container, building);
  assert.deepEqual(container.children.map(button => button.dataset.product), ['scout', 'rider']);
  assert.equal(container.children[0].disabled, false); assert.equal(container.children[1].disabled, true);
  assert.match(container.children[1].textContent, /Population full/);
  context.latestPopulation[team].available = 2; context.updateRosterProductionOptions(container, building);
  assert.equal(container.children[1].disabled, false); container.children[1].click();
  assert.deepEqual(JSON.parse(JSON.stringify(commands)), [{ type: 'trainUnit', kind: 'rider', buildingId: 8 }]);
});
