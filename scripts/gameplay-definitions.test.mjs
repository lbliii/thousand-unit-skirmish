import test from 'node:test';
import assert from 'node:assert/strict';
import { GAMEPLAY_DEFINITIONS, validateGameplayDefinitions } from '../src/gameplay-definitions.mjs';

test('production registry retains the shipped opening economy', () => {
  const { units, buildings, technologies } = GAMEPLAY_DEFINITIONS;
  const opening = { food: 150, wood: 250 };
  const afterBarracksAndInfantry = {
    food: opening.food - buildings.barracks.cost.food - units.infantry.cost.food,
    wood: opening.wood - buildings.barracks.cost.wood - units.infantry.cost.wood,
  };
  assert.deepEqual(afterBarracksAndInfantry, { food: 100, wood: 75 });
  assert.equal(units.infantry.trainSeconds, 12);
  assert.equal(technologies['infantry-attack'].building, 'barracks');
  assert.ok(Object.isFrozen(units.infantry.cost));
});

test('invalid content cannot silently create free production or unknown products', () => {
  for (const [mutate, reason] of [
    [d => { d.units.worker.cost.food = -1; }, /Invalid food cost/],
    [d => { d.units.worker.trainSeconds = 0; }, /Invalid trainSeconds/],
    [d => { d.units.archer.combat.range = NaN; }, /Invalid combat range/],
    [d => { d.buildings.barracks.products.push('unknown-unit'); }, /Unknown product/],
    [d => { d.technologies['infantry-attack'].building = 'unknown-building'; }, /Unknown research building/],
    [d => { d.buildings.barracks.footprint = 2.5; }, /Invalid footprint/],
    [d => { d.units.worker.id = 'different-id'; }, /Invalid units ID/],
  ]) {
    const definitions = structuredClone(GAMEPLAY_DEFINITIONS);
    mutate(definitions);
    assert.throws(() => validateGameplayDefinitions(definitions), reason);
  }
});
