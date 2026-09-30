import { UNIT_DEFINITIONS } from '../src/gameplay-definitions.mjs';
import assert from 'node:assert/strict';
import {
  chooseUnitPickCandidate,
  isSameUnitDoubleClick,
  livingIdleWorkerIds,
  livingUnitIdsOfKind,
  livingUnitIdsOfKinds,
  summarizeUnitComposition,
  visibleLivingUnitIdsOfKind,
} from '../src/unit-selection.mjs';

const roster = [
  { id: 4, team: 0, kind: 'worker', hp: 100, task: 'idle' },
  { id: 9, team: 0, kind: 'worker', hp: 100, task: 'gathering' },
  { id: 10, team: 0, kind: 'worker', hp: 100, task: 'building' },
  { id: 11, team: 0, kind: 'worker', hp: 0, task: 'idle' },
  { id: 12, team: 1, kind: 'worker', hp: 100, task: 'idle' },
  { id: 13, team: 0, kind: 'worker', hp: 100, task: 'unknown' },
  { id: 5, team: 0, kind: 'infantry', hp: 100 },
  { id: 6, team: 0, kind: 'infantry', hp: 0 },
  { id: 7, team: 1, kind: 'infantry', hp: 100 },
  { id: 8, team: 0, kind: 'archer', hp: 70 },
  undefined,
];

assert.deepEqual(livingUnitIdsOfKind(roster, 0, 'infantry'), [5],
  'quick selection should include living friendly infantry only');
assert.deepEqual(livingUnitIdsOfKind(roster, 0, 'worker'), [4, 9, 10, 13],
  'worker class quick selection should include every living friendly worker, including busy ones');
assert.deepEqual(livingUnitIdsOfKind(roster, 0, 'archer'), [8]);
assert.deepEqual(livingUnitIdsOfKinds(roster, 0, ['infantry', 'archer']), [5, 8],
  'military quick selection should include living friendly infantry and archers while leaving workers out');
assert.deepEqual(livingUnitIdsOfKinds(roster, 0, []), []);
assert.deepEqual(livingUnitIdsOfKinds([], 0, ['infantry', 'archer']), [],
  'military quick selection should remain empty for an empty roster');
assert.deepEqual(livingUnitIdsOfKinds(roster, null, ['infantry', 'archer']), []);
assert.deepEqual(livingUnitIdsOfKinds(roster, 0, 'infantry'), [],
  'multi-class filters must require an explicit kind list');
assert.deepEqual(livingUnitIdsOfKind(roster, 1, 'infantry'), [7]);
assert.deepEqual(livingUnitIdsOfKind(roster, 0, 'cavalry'), []);
assert.deepEqual(livingUnitIdsOfKind(roster, null, 'infantry'), []);
assert.deepEqual(livingIdleWorkerIds(roster, 0), [4],
  'idle-worker quick selection should exclude busy, dead, enemy, and unknown workers');
assert.deepEqual(livingIdleWorkerIds(roster, 1), [12]);
assert.deepEqual(livingIdleWorkerIds(roster, null), []);
const rosterById = [];
for (const unit of roster) if (unit && Number.isInteger(unit.id)) rosterById[unit.id] = unit;
const emptyCounts = Object.fromEntries(Object.keys(UNIT_DEFINITIONS).map(kind => [kind, 0]));
assert.deepEqual(summarizeUnitComposition(rosterById, new Set([4, 5, 8, 11, 12, 999]), 0), {
  ...emptyCounts, worker: 1, infantry: 1, archer: 1,
}, 'group composition should count only living selected friendlies of known combat and worker types');
assert.deepEqual(summarizeUnitComposition(rosterById, new Set([4, 5, 8]), null), {
  ...emptyCounts,
}, 'spectators should not receive a local friendly-group composition');
rosterById[20] = { id: 20, team: 0, kind: 'spearman', hp: 110 };
assert.equal(summarizeUnitComposition(rosterById, [20], 0).spearman, 1, 'new roster kinds appear in group composition');
rosterById[21] = { id: 21, team: 0, kind: 'scout', hp: 60 };
rosterById[22] = { id: 22, team: 0, kind: 'rider', hp: 130 };
assert.deepEqual(summarizeUnitComposition(rosterById, [21, 22], 0), {
  ...emptyCounts, scout: 1, rider: 1,
}, 'mounted units appear in selected group composition');
for (const [index, definition] of Object.values(UNIT_DEFINITIONS).entries()) {
  const id = 30 + index;
  rosterById[id] = { id, team: 0, kind: definition.id, hp: definition.combat.maxHp };
  assert.equal(summarizeUnitComposition(rosterById, [id], 0)[definition.id], 1, `${definition.id} is counted by registered identity`);
  assert.deepEqual(livingUnitIdsOfKinds(rosterById, 0, [definition.id]).filter(candidate => candidate === id), [id]);
}
const visibleRoster = [
  { id: 5, team: 0, kind: 'infantry', hp: 100, visible: true, screenX: 40, screenY: 60 },
  { id: 14, team: 0, kind: 'infantry', hp: 100, visible: false, screenX: 45, screenY: 60 },
  { id: 15, team: 0, kind: 'infantry', hp: 100, visible: true, screenX: 140, screenY: 60 },
];
assert.deepEqual(visibleLivingUnitIdsOfKind(visibleRoster, 0, 'infantry', (unit) => (
  unit.screenX >= 0 && unit.screenX <= 100 && unit.screenY >= 0 && unit.screenY <= 100
)), [5], 'local type selection should exclude hidden and off-screen units');
const priorClick = { id: 5, x: 42, y: 60, at: 1000 };
assert.equal(isSameUnitDoubleClick(priorClick, 5, 44, 61, 1250), true,
  'a nearby second click on the same unit inside the click window should select its type');
assert.equal(isSameUnitDoubleClick(priorClick, 7, 42, 60, 1250), false,
  'clicking a different unit should not trigger type selection');
assert.equal(isSameUnitDoubleClick(priorClick, 5, 42, 60, 1400), false,
  'a slow second click should remain an ordinary single-unit selection');
assert.equal(isSameUnitDoubleClick(priorClick, 5, 80, 60, 1250), false,
  'a second click outside the pointer tolerance should remain a single-unit selection');
assert.equal(isSameUnitDoubleClick(priorClick, 5, 42, 60, 999), false,
  'out-of-order pointer timestamps should not count as a double click');

const stack = [
  { id: 7, distanceSquared: 4, depth: 0.3 },
  { id: 5, distanceSquared: 1, depth: 0.6 },
  { id: 3, distanceSquared: 1, depth: -0.2 },
  { id: 2, distanceSquared: 1, depth: -0.2 },
];
const firstPick = chooseUnitPickCandidate(stack, null, 100, 80, 1000);
assert.equal(firstPick.id, 2,
  'pick ordering should prefer the closest screen center, then the frontmost depth, then the lower id');
assert.equal(firstPick.stackIndex, 1);
assert.equal(firstPick.stackCount, 4);
assert.equal(firstPick.cycled, false);

const reorderedStack = [
  { id: 5, distanceSquared: 0, depth: 0.6 },
  { id: 3, distanceSquared: 1, depth: -0.2 },
  { id: 2, distanceSquared: 4, depth: 0.1 },
];
const fastRepeatPick = chooseUnitPickCandidate(reorderedStack, { ...firstPick.state, id: 3 }, 101, 80, 1250);
assert.equal(fastRepeatPick.id, 3,
  'a fast repeated pick should stay on its prior unit if candidate ranking shifts, preserving type double-click');
assert.equal(fastRepeatPick.cycled, false);

let cyclingPick = chooseUnitPickCandidate([
  { id: 1, distanceSquared: 0, depth: 0.4 },
  { id: 2, distanceSquared: 1, depth: 0.1 },
  { id: 3, distanceSquared: 2, depth: -0.1 },
], null, 100, 80, 1000);
assert.equal(cyclingPick.id, 1);
cyclingPick = chooseUnitPickCandidate([
  { id: 1, distanceSquared: 0, depth: 0.4 },
  { id: 2, distanceSquared: 1, depth: 0.1 },
  { id: 3, distanceSquared: 2, depth: -0.1 },
], cyclingPick.state, 100, 80, 1500);
assert.equal(cyclingPick.id, 2, 'a deliberate repeat should advance to the next stacked unit');
assert.equal(cyclingPick.stackIndex, 2);
assert.equal(cyclingPick.cycled, true);
cyclingPick = chooseUnitPickCandidate([
  { id: 1, distanceSquared: 0, depth: 0.4 },
  { id: 2, distanceSquared: 1, depth: 0.1 },
  { id: 3, distanceSquared: 2, depth: -0.1 },
], cyclingPick.state, 100, 80, 2000);
assert.equal(cyclingPick.id, 3, 'repeated clicks should continue through the stack');
cyclingPick = chooseUnitPickCandidate([
  { id: 1, distanceSquared: 0, depth: 0.4 },
  { id: 2, distanceSquared: 1, depth: 0.1 },
  { id: 3, distanceSquared: 2, depth: -0.1 },
], cyclingPick.state, 100, 80, 2500);
assert.equal(cyclingPick.id, 1, 'stack cycling should wrap to its first unit');
assert.equal(cyclingPick.cycled, true);

const movedPick = chooseUnitPickCandidate(stack, firstPick.state, 140, 80, 1500);
assert.equal(movedPick.id, 2);
assert.equal(movedPick.cycled, false, 'moving outside the pick tolerance should start a fresh pick');
const expiredPick = chooseUnitPickCandidate(stack, firstPick.state, 100, 80, 2501);
assert.equal(expiredPick.id, 2);
assert.equal(expiredPick.cycled, false, 'a long pause should start a fresh pick');
const missingPreviousPick = chooseUnitPickCandidate([
  { id: 8, distanceSquared: 0, depth: 0.2 },
], firstPick.state, 100, 80, 1500);
assert.equal(missingPreviousPick.id, 8, 'a unit that left the hit stack should not block a fresh pick');
assert.deepEqual(chooseUnitPickCandidate([{ id: -1, distanceSquared: 0, depth: 0 }], null, 0, 0, 0), {
  id: null, stackIndex: 0, stackCount: 0, cycled: false, state: null,
}, 'invalid or empty candidate lists should safely clear pick state');

console.log('Unit-selection scenario passed: class filters, role composition, visible type double-click, stable depth ordering, and stacked-unit cycling.');
