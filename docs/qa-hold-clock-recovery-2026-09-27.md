# Victory hold clock recovery — 2026-09-27

Baseline: `bcd5fec632d365c7b46571d290b367b1d167f5f8`.

## Reproduction and correction

A small authored map has a 7.5-second victory hold, a capture reward, repeating
supplies, and a later timed-control deadline. With only the host connected,
units capture the marked zone. The hold is active with zero progress while the
match clock waits for the second seat. Stop and restart the server from its
ordinary checkpoint, resume the host, and join the opponent between scenario
evaluations. The fixture uses worker move commands to obtain a move-start
snapshot between those evaluations; it does not modify checkpoint data.

Before the fix, an active checkpoint recorded **0.6 seconds of hold progress
with only 0.5666666667 seconds on the match clock**. Hold evaluation always added
the entire three-tick (0.1-second) interval, including ticks before the match
clock started. Depending on the join phase this could credit one or two ticks
early. An already-active hold recovered from disk exposed the same startup edge.

The first increment is now limited to elapsed match time. Later increments,
saved progress, capture rules, event schedules, and victory precedence stay the
same. No new persisted fields or checkpoint migration are required.

## Verification

```sh
node scripts/hold-clock-recovery-scenario.mjs
node scripts/hold-clock-recovery-scenario.mjs 1
node scripts/timed-victory-scenario.mjs
```

The focused fixture covers each winning seat, paused-clock and active-clock
restart, exact preservation of the next repeat deadline, no duplicate capture
or event reward, exactly two scheduled deliveries, and no victory before the
hold duration. It uses real server processes and WebSocket commands; checkpoint
files only verify the resulting authoritative state. This is simulation evidence,
not a human match or deployment claim.

## Pinned source observation

Read OpenRA `World.Tick` at
[`b4f3d8ae02b6bd6f4a3a5441e6d0daf7c5073787`](https://github.com/OpenRA/OpenRA/blob/b4f3d8ae02b6bd6f4a3a5441e6d0daf7c5073787/OpenRA.Game/World.cs#L423).
It advances `WorldTick` and simulation traits inside the unpaused simulation
branch, separately from frame-end actions. The applicable principle is to count
only elapsed simulation time toward gameplay timers. Our correction keeps the
existing match-clock and batched scenario evaluator, clipping its initial hold
increment to time actually elapsed. No upstream implementation was copied.
