# PvE recovery from stalled tactical orders

## Reproduction — 2026-09-27

Base build: `f9e0d57ad21b95c73917bcd2af30af288b5c0ff1`.

The deterministic policy remembered an objective ID, or that its fallback advance
had started, forever. If the army stopped outside the destination, subsequent
observations produced no replacement order until objective ownership changed.

The initial investigation concerned rejected orders. Reading the authoritative
command path showed that an unreachable attack-move generally receives a reachable
fallback destination, rather than a rejection. The runtime regression therefore
uses this actual outcome: two armies on opposite sides of a dividing wall receive
accepted attack-move orders, reach fallback positions, and stop short of their
targets. Both seats then need another tactical decision. A permanently impassable
wall remains impassable; this change keeps the policy able to retry when a
transient blockage clears.

## Policy

Track each ordered soldier's observed position by unit ID and generation. A
soldier outside the destination that has not moved half a cell, received incoming
focus, or made a recent attack retries after 300 simulation ticks. Repeated
stalls back off to 600, 1,200, then at most 1,800 ticks (10, 20, 40, and 60 seconds).
Movement, combat, and arrival reset only that soldier's clock and backoff.

A reinforcement receives its own watch when it is first ordered. Arrived or
fighting soldiers neither suppress another soldier's retry nor receive that
retry themselves. Due retries and newly observed reinforcements are combined in
one command per decision. An objective change still advances the full army.
Repeated snapshots cannot advance the retry clock. The objective-free fallback
uses the same rule; dead IDs are pruned and new generations start fresh.

The original whole-army implementation at `d7f9862` treated any soldier's progress
as progress for everyone. The follow-up below replaces that behavior.

## Research decision

Reviewed OpenRA release `release-20250330`, commit
`b4f3d8ae02b6bd6f4a3a5441e6d0daf7c5073787`,
[`GroundUnitsAttackMoveState.Tick`](https://github.com/OpenRA/OpenRA/blob/b4f3d8ae02b6bd6f4a3a5441e6d0daf7c5073787/OpenRA.Mods.Common/Traits/BotModules/Squads/States/GroundStates.cs).
OpenRA tracks the leader's location and target and returns to idle after a period
without movement, explicitly avoiding repeated costly pathfinding against an
unreachable destination. Our policy instead watches its small army through the
existing observation, waits longer, and caps retry frequency with backoff. The
implementation is independent; no GPL source was copied.

## Validation

- `node scripts/pve-tactical-retry-scenario.mjs`: both seats, three seeds,
  objective and fallback advances. The base build emits only at tick 0; the fixed
  policy emits at ticks 0, 300, 900, 2,100, 3,900, and 5,700 across 6,001 tick
  observations. Also covers duplicate snapshots, movement, combat, arrival,
  army loss/replacement, and repeatable traces.
- `node scripts/pve-tactical-stall-runtime-scenario.mjs`: isolated authoritative
  server, legal custom divided map `pve-stalled-advance`, both seats, seed
  `20260925`. Both original and retry orders receive `ATTACK MOVE ORDER`
  acknowledgements. In the recorded run, both seats ordered at ticks 2 and 573;
  soldiers first moved to fallback positions and remained short of their targets.
- Full `node scripts/pve-opponent-scenario.mjs` passes, including fog projection,
  both live seats, solo maps, rematches, and the optional fake-provider path.
- Existing decision-fairness regression remains green.

## Limits

The built-in solo driver obtains fresh observations every decision. The external
WebSocket adapter receives state only when it changes; a completely idle match
can leave its last observed tick unchanged. The runtime scenario uses independent
worker patrols to keep ordinary snapshots flowing. It does not invent ticks or
add a polling protocol.

Selecting a different target after repeated failures remains separate work.
This evidence establishes deterministic recovery decisions, not a claim of
player-tested fun.

## Reinforcement recovery follow-up — 27 September 2026

Review at `8b6bcbbf338ce7a3fe20c85105aee37b56ad4c11` reproduced one soldier at a
neutral objective suppressing retries for a newly ordered stationary reinforcement.
There were no retries over 9,000 simulation ticks. Forked Vale objectives require
five or eight occupants, so a single arrival does not guarantee capture.

`node scripts/pve-reinforcement-recovery-scenario.mjs` fails on that base and
passes after independent soldier watches are introduced. Across both seats,
three seeds, and objective/fallback routes, a reinforcement first ordered at tick
30 retries at 330, 930, 2,130, 3,930, 5,730, and 7,530. Those orders contain only the
stranded soldier. Already-arrived and fighting soldiers keep their orders.
The scenario also checks duplicate observations, progress resetting backoff,
arrival stopping retries, deterministic replay, and fresh slot generations.

Existing fairness, tactical retry, production, and core policy contract checks
remain green. The existing server-backed stall scenario also passes for both
seats (opening tick 2, accepted retry tick 513). The new reinforcement case is
pure-policy evidence; it does not claim a new runtime obstruction or
deployed-match observation. The pinned OpenRA research
above remains the source for the general progress-watch/backoff technique;
per-soldier watches are this project's independent design decision.
