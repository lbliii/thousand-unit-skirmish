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

Track the army's observed positions by unit ID and generation after an advance.
When every surviving soldier remains outside the destination and none has moved
half a cell, received incoming focus, or made a recent visible attack, retry after
300 simulation ticks. Repeated stalls back off to 600, 1,200, then at most 1,800
ticks between attempts (10, 20, 40, and 60 seconds at 30 Hz).

Movement, combat, and occupancy of the objective reset the stall clock and backoff.
An objective change still causes the usual immediate advance. Repeated snapshots
cannot advance the retry clock. The objective-free fallback advance uses the same
rule. A wiped-out army does not emit empty orders; a replacement army gets a new
advance. Retries use only current friendly unit IDs and ordinary attack-move
commands. No server protocol, DTO, or fog boundary changes are needed.

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

This is conservative whole-army recovery: one soldier moving, fighting, or holding
the objective suppresses a retry. Recovering isolated stragglers and selecting a
different target after repeated failures remain separate work. This evidence
establishes deterministic recovery decisions, not a claim of player-tested fun.
