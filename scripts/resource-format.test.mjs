import { researchAction, researchOptions } from '../src/research-actions.mjs';
import { UNIT_DEFINITIONS, BUILDING_DEFINITIONS, TECHNOLOGY_DEFINITIONS } from '../src/gameplay-definitions.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { formatResourceStock, formatResourceRequirement } from '../src/resource-format.mjs';

const source = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const declaration = (name, next) => source.slice(source.indexOf(`function ${name}(`), source.indexOf(`\nfunction ${next}(`));
function fixture(team) {
  const element = () => ({ textContent: '', disabled: false, dataset: {},
    classList: { toggle() {} }, setAttribute() {}, querySelector: () => ({ textContent: '' }) });
  const ui = new Proxy({}, { get(target, key) { return target[key] ||= element(); } });
  const context = vm.createContext({ ui, localTeam: team, matchWinner: -1,
    formatResourceStock, formatResourceRequirement,
    UNIT_DEFINITIONS, BUILDING_DEFINITIONS, TECHNOLOGY_DEFINITIONS, researchAction, researchOptions,
    latestFood: [0, 0], latestWood: [0, 0], latestWorkerProduction: [null, null], latestPopulation: [null, null],
    latestTeamResearch: [{}, {}], latestRosterSize: 4,
    latestBuildings: [{ id: 1, team, type: 'barracks', complete: true, queue: [] },
      { id: 2, team, type: 'archery-range', complete: true, queue: [] },
      { id: 1_000_000_000 + team, team, type: 'town-center', home: true, complete: true, queue: [] }],
    selectedBuildingId: 1, teamUnits: [0, 1].map(t => [{ hp: 100, team: t, kind: 'worker', cargoType: 'food', cargo: 9.999 }]),
    MAX_PER_TEAM: 1000, MAX_UNITS: 2000, buildPlacementPending: false, buildPlacementActive: false,
    buildPlacementType: 'barracks', livingIdleWorkerIds: () => [],
    document: { querySelector: element }, mapDefinition: { resourceNodes: [{}] },
    updateRosterProductionOptions() {}, updateRosterBuildingOptions() {}, updateBuildingLifecycleActions() {},
    window: { matchMedia: () => ({ matches: false }) }, updateCommandUI() {},
  });
  vm.runInContext(source.slice(source.indexOf('const INFANTRY_FOOD_COST'), source.indexOf('const TEAM_NAMES'))
    + declaration('getBuildingQueueLength', 'findTrainableArcheryRange')
    + declaration('findTrainableArcheryRange', 'findTrainableBarracks')
    + declaration('findTrainableBarracks', 'buildingLabel')
    + declaration('buildingLabel', 'updateBuildingResearchControls')
    + declaration('updateBuildingResearchControls', 'buildingWoodCost')
    + declaration('updateEconomyUI', 'updateRoomUI'), context);
  return { context, ui, stocks(food, wood) {
    const foods = [0, 0]; const woods = [0, 0]; foods[team] = food; woods[team] = wood;
    context.updateEconomyUI({ food: foods, wood: woods });
    context.updateBuildingResearchControls(context.latestBuildings[0]);
  } };
}

test('whole resource display preserves conservative stock and requirement boundaries', () => {
  assert.equal(formatResourceStock(190.033), '190');
  assert.equal(formatResourceRequirement(100 - 90.033333), '10');
  assert.equal(formatResourceStock(1234.99), (1234).toLocaleString());
  assert.equal(formatResourceRequirement(0), '0');
});

for (const team of [0, 1]) test(`actual economy and research controls keep exact affordability for team ${team}`, () => {
  const f = fixture(team);
  f.stocks(49.9999, 44.9999);
  assert.equal(f.ui.foodStock.textContent, '49');
  assert.equal(f.ui.woodStock.textContent, '44');
  assert.equal(f.ui.workerLoad.textContent, 'WORKER CARGO · 9 FOOD · 0 WOOD');
  for (const name of ['trainWorker', 'trainInfantry', 'trainArcher']) {
    assert.equal(f.ui[name].disabled, true);
    assert.match(f.ui[name].dataset.disabledReason, /Need (1|0) food \/ (1|0) wood/);
  }
  f.stocks(50, 45);
  for (const name of ['trainWorker', 'trainInfantry', 'trainArcher']) assert.equal(f.ui[name].disabled, false);
  f.stocks(24.9999, 45);
  assert.equal(f.ui.trainArcher.disabled, true);
  assert.equal(f.ui.trainArcher.dataset.disabledReason, 'Need 1 food / 0 wood');
  f.stocks(99.9999, 74.9999);
  assert.equal(f.ui.researchAttackUpgrade.disabled, true);
  assert.match(f.ui.buildingResearchReadout.textContent, /NEED 1 FOOD \+ 1 WOOD$/);
  assert.equal(f.context.latestFood[team], 99.9999, 'formatting never mutates authoritative stocks');
  f.stocks(100, 75);
  assert.equal(f.ui.researchAttackUpgrade.disabled, false);
  assert.doesNotMatch(f.ui.buildingResearchReadout.textContent, /NEED/);
  f.context.selectedBuildingId = 2;
  f.stocks(124.9999, 124.9999);
  f.context.updateBuildingResearchControls(f.context.latestBuildings[1]);
  assert.equal(f.ui.researchAttackUpgrade.disabled, true);
  assert.match(f.ui.buildingResearchReadout.textContent, /NEED 1 FOOD \+ 1 WOOD$/);
  f.stocks(125, 125);
  f.context.updateBuildingResearchControls(f.context.latestBuildings[1]);
  assert.equal(f.ui.researchAttackUpgrade.disabled, false);
  f.stocks(150, 149.9999);
  assert.equal(f.ui.buildRange.disabled, true);
  f.stocks(150, 150);
  assert.equal(f.ui.buildRange.disabled, false);
  f.stocks(150, 174.9999);
  assert.equal(f.ui.buildBarracks.disabled, true);
  assert.equal(f.ui.woodStock.textContent, '174');
  f.stocks(150, 175);
  assert.equal(f.ui.buildBarracks.disabled, false);
});
