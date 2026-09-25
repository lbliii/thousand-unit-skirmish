import assert from 'node:assert/strict';
import {
  unitActionPoseAllowed, unitCargoVisualState,
} from '../src/unit-visual-state.mjs';

assert.equal(unitActionPoseAllowed(100, 0), true,
  'living units may show their current action pose');
assert.equal(unitActionPoseAllowed(0, 0), false,
  'defeated units must not show action poses');
assert.equal(unitActionPoseAllowed(100, 1234), false,
  'an active defeat animation takes precedence over another action pose');

assert.equal(unitCargoVisualState('worker', 100, true, 0, null), 'none',
  'empty Workers have no cargo cue');
assert.equal(unitCargoVisualState('worker', 100, true, 4, 'wood'), 'wood',
  'wood cargo uses the wood cue');
assert.equal(unitCargoVisualState('worker', 100, true, 4, 'food'), 'food',
  'food cargo uses the food cue');
assert.equal(unitCargoVisualState('worker', 100, true, 4, null), 'unknown',
  'cargo without a known type uses a neutral cue');
assert.equal(unitCargoVisualState('worker', 100, true, 1, 'wood'),
  unitCargoVisualState('worker', 100, true, 9, 'wood'),
  'amount changes within one resource type retain the same visual state');
assert.equal(unitCargoVisualState('infantry', 100, true, 4, 'wood'), 'none',
  'non-Workers do not inherit cargo cues');
assert.equal(unitCargoVisualState('worker', 0, true, 4, 'wood'), 'none',
  'defeated Workers do not retain cargo cues');
assert.equal(unitCargoVisualState('worker', 100, false, 4, 'food'), 'none',
  'fog-hidden Workers do not expose cargo cues');

process.stdout.write('Unit visual-state scenario passed: defeat priority and fog-safe cargo mapping.\n');
