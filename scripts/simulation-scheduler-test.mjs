import assert from 'node:assert/strict';
import { advanceTickDeadline } from '../simulation-scheduler.mjs';

const intervalMs = 1000 / 30;

// A regular callback stays on the original 30 Hz schedule without accumulating
// the small floating point rounding error from repeatedly adding elapsed time.
let deadlineMs = intervalMs;
for (let tick = 1; tick <= 300; tick++) {
  const result = advanceTickDeadline(deadlineMs, deadlineMs, intervalMs);
  assert.equal(result.skippedTickSlots, 0);
  deadlineMs = result.nextDeadlineMs;
}
assert.ok(Math.abs(deadlineMs - 301 * intervalMs) < 1e-8);

// Inject a 150 ms event-loop/tick stall. One current step is run, five timer
// slots are dropped, and the next callback is placed in the future.
const stalled = advanceTickDeadline(100, 250, 30);
assert.deepEqual(stalled, { nextDeadlineMs: 280, skippedTickSlots: 5 });

// A tick that ends just before its next slot keeps that slot; ending exactly
// on a due slot drops it so the scheduler never starts an immediate catch-up.
assert.deepEqual(advanceTickDeadline(100, 129.999, 30), {
  nextDeadlineMs: 130,
  skippedTickSlots: 0,
});
assert.deepEqual(advanceTickDeadline(100, 130, 30), {
  nextDeadlineMs: 160,
  skippedTickSlots: 1,
});

assert.throws(() => advanceTickDeadline(0, 0, 0), /positive finite/);
console.log('Simulation scheduler injected-stall checks passed.');
