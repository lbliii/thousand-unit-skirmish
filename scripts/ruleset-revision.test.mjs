import assert from 'node:assert/strict';
import test from 'node:test';
import { GAMEPLAY_DEFINITIONS, GAMEPLAY_RULESET_REVISION, gameplayRulesetRevision, UNIT_WIRE_IDS,
  missingGameplayPrerequisites } from '../src/gameplay-definitions.mjs';

test('resolved ruleset checksum is canonical and gameplay changes alter it', async () => {
  const reordered = Object.fromEntries(Object.entries(GAMEPLAY_DEFINITIONS).reverse());
  reordered.units = Object.fromEntries(Object.entries(reordered.units).reverse());
  assert.equal(await gameplayRulesetRevision(reordered), GAMEPLAY_RULESET_REVISION);
  const changed = structuredClone(GAMEPLAY_DEFINITIONS); changed.units.spearman.combat.damage++;
  assert.notEqual(await gameplayRulesetRevision(changed), GAMEPLAY_RULESET_REVISION);
  const visual = structuredClone(GAMEPLAY_DEFINITIONS); visual.units.worker.label = 'Alternate worker'; visual.units.worker.presentation = 'unit.alternate';
  assert.equal(await gameplayRulesetRevision(visual), GAMEPLAY_RULESET_REVISION, 'presentation labels and bindings do not alter authoritative rules');
  assert.deepEqual(UNIT_WIRE_IDS, { worker: 0, infantry: 1, archer: 2, spearman: 3, scout: 4, rider: 5, 'siege-engine': 6 });
});
test('prerequisite availability uses registered technology completions', () => {
  const definition = { requires: ['infantry-attack', 'archer-attack'] };
  assert.deepEqual(missingGameplayPrerequisites(definition, {}), definition.requires);
  assert.deepEqual(missingGameplayPrerequisites(definition, { infantryAttack: true }), ['archer-attack']);
  assert.deepEqual(missingGameplayPrerequisites(definition, { infantryAttack: true, archerAttack: true }), []);
});
