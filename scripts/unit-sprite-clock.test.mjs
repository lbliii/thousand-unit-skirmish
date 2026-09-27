import test from 'node:test';
import assert from 'node:assert/strict';
import { spriteAnimationTime, spriteClipDuration } from '../src/unit-sprite-runtime.mjs';

test('walking and work use elapsed milliseconds, not procedural phase', () => {
  const unit = { motionPhase: 300 };
  assert.equal(spriteAnimationTime(unit, 'walk', 1000), 0);
  unit.motionPhase += 14;
  assert.equal(spriteAnimationTime(unit, 'walk', 2067), 1067);
  assert.equal(spriteAnimationTime(unit, 'gather', 2200), 0);
  assert.equal(spriteAnimationTime(unit, 'gather', 5033), 2833);
});
test('one-shot transitions use event timestamps and restart resumed walking', () => {
  const unit = { attackStartedAt: 500, defeatStartedAt: 3000 };
  spriteAnimationTime(unit, 'walk', 100);
  assert.equal(spriteAnimationTime(unit, 'attack', 600), 100);
  assert.equal(spriteAnimationTime(unit, 'walk', 1000), 0);
  assert.equal(spriteAnimationTime(unit, 'defeat', 6533), 3533);
});
test('clip duration preserves variable endpoint frame durations', () => {
  assert.equal(spriteClipDuration({sequence:[{durationMs:62},{durationMs:63},{durationMs:1}]}),126);
  assert.equal(spriteClipDuration(null),0);
});
