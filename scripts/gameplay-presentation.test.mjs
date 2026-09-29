import assert from 'node:assert/strict';
import test from 'node:test';
import { UNIT_DEFINITIONS } from '../src/gameplay-definitions.mjs';
import { unitPresentation, UNIT_PRESENTATION_PROFILES, validateUnitPresentationBindings } from '../src/gameplay-presentation.mjs';

test('current roster resolves declared procedural appearances without changing rules', () => {
  const rules = JSON.stringify(UNIT_DEFINITIONS);
  for (const kind of Object.keys(UNIT_DEFINITIONS)) {
    assert.equal(unitPresentation(kind), UNIT_PRESENTATION_PROFILES[UNIT_DEFINITIONS[kind].presentation]);
    assert.ok(Object.isFrozen(unitPresentation(kind)));
  }
  assert.equal(JSON.stringify(UNIT_DEFINITIONS), rules);
  const variant = { soldier: { presentation: 'unit.archer' } };
  assert.equal(validateUnitPresentationBindings(variant), UNIT_PRESENTATION_PROFILES);
});
test('missing bindings and unsupported animation backends fail usefully', () => {
  assert.throws(() => validateUnitPresentationBindings({ soldier: { presentation: 'missing' } }), /missing: soldier/);
  assert.throws(() => validateUnitPresentationBindings({ soldier: { presentation: 'animated' } }, {
    animated: { backend: 'skeletal', role: 'infantry' },
  }), /Unsupported presentation binding animated: soldier/);
  assert.throws(() => unitPresentation('missing'), /Unknown unit presentation/);
  assert.throws(() => validateUnitPresentationBindings({ soldier: { presentation: 'invalid' } }, {
    invalid: { backend: 'procedural', role: 'infantry', headTint: 0, bodyTint: 0, bodyTintWeight: NaN },
  }), /Invalid presentation colors/);
});
