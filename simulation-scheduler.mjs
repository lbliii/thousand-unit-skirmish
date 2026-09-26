/**
 * Advance a fixed-rate simulation deadline past all slots that elapsed while
 * the previous tick was running. The caller executes exactly one simulation
 * step per timer callback; missed wall-clock slots are deliberately dropped.
 */
export function advanceTickDeadline(deadlineMs, completedAtMs, intervalMs) {
  if (!Number.isFinite(deadlineMs)) throw new TypeError('deadlineMs must be finite');
  if (!Number.isFinite(completedAtMs)) throw new TypeError('completedAtMs must be finite');
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
    throw new TypeError('intervalMs must be a positive finite number');
  }

  const elapsedIntervals = Math.max(0, Math.floor((completedAtMs - deadlineMs) / intervalMs));
  const elapsedSlots = elapsedIntervals + 1;
  return {
    nextDeadlineMs: deadlineMs + elapsedSlots * intervalMs,
    skippedTickSlots: elapsedSlots - 1,
  };
}
