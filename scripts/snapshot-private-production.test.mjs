import assert from 'node:assert/strict';
import test from 'node:test';
import { privateProductionView } from '../src/snapshot-private-production.mjs';
for (const team of [0, 1]) test(`no-fog broadcast withholds enemy queue contents for seat ${team} while sharing roster storage`, () => {
  const payload = { units: [[0, 0]], population: [{ capacity: 15 }, { capacity: 23 }],
    buildings: [0, 1].map((owner) => ({ id: owner, team: owner, queue: 2, productionQueue: ['infantry', 'spearman'],
      researchOptions: [{ upgrade: 'military-armor', available: false, reason: 'NEED 100 FOOD + 100 WOOD' }], productionOptions: [{ kind: 'spearman', available: true }] })) };
  const view = privateProductionView(payload, team);
  assert.equal(view.units, payload.units, 'large public roster storage is reused');
  assert.equal(view.buildings[team], payload.buildings[team]);
  assert.equal(view.population[team], payload.population[team]);
  assert.equal(view.population[1 - team], null);
  assert.deepEqual(view.buildings[1 - team].productionQueue, []);
  assert.deepEqual(view.buildings[1 - team].productionOptions, []);
  assert.deepEqual(view.buildings[1 - team].researchOptions, []);
  assert.equal(view.buildings[team].researchOptions, payload.buildings[team].researchOptions);
  assert.equal(view.buildings[1 - team].queue, 2, 'legacy public queue count remains available');
  assert.equal(payload.buildings[1 - team].productionQueue.length, 2, 'masking one view cannot mutate another');
  assert.equal(privateProductionView(payload, null), payload, 'spectator retains the full view');
});
