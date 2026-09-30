import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { TECHNOLOGY_DEFINITIONS } from '../src/gameplay-definitions.mjs';
import { researchAction, researchOptions } from '../src/research-actions.mjs';
const source = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const fn = source.slice(source.indexOf('function updateResearchOptions('), source.indexOf('function buildingWoodCost('));
for (const team of [0, 1]) test(`research buttons follow registered choices, prerequisites and focused state for seat ${team}`, () => {
  const commands = [];
  const container = { dataset: {}, children: [], replaceChildren() { this.children = []; }, append(button) { this.children.push(button); } };
  const building = { id: 4, team, type: 'barracks', complete: true };
  const context = vm.createContext({ TECHNOLOGY_DEFINITIONS, researchAction, researchOptions,
    localTeam: team, latestFood: [1000, 1000], latestWood: [1000, 1000], latestTeamResearch: [{}, {}], matchWinner: -1,
    document: { createElement() { return { dataset: {}, addEventListener(_, fn) { this.click = fn; } }; } },
    sendCommand: command => commands.push(command) });
  vm.runInContext(fn, context); context.updateResearchOptions(container, building);
  const armor = container.children.find(button => button.dataset.technology === 'military-armor');
  assert.ok(armor); assert.equal(armor.disabled, true); assert.match(armor.textContent, /REQUIRES MILITARY TIER II/);
  context.latestTeamResearch[team].militaryTier2 = true; context.updateResearchOptions(container, building);
  assert.equal(container.children.find(button => button.dataset.technology === 'military-armor'), armor);
  assert.equal(armor.disabled, false); armor.click();
  assert.deepEqual(JSON.parse(JSON.stringify(commands)), [{ type: 'researchUpgrade', buildingId: 4, upgrade: 'military-armor' }]);
  context.latestTeamResearch[team].active = { type: 'infantry-attack' }; context.updateResearchOptions(container, building);
  assert.equal(armor.disabled, true); assert.match(armor.textContent, /RESEARCH IN PROGRESS/);
  building.team = 1 - team; context.updateResearchOptions(container, building); assert.equal(container.children.length, 0);
});
