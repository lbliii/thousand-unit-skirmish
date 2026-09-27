# Play vs AI

[Documentation index](README.md) · [Player guide](playing.md)

Choose **Play vs AI** to create an isolated room. You take Azure (Team 0); the
server reserves Ember (Team 1) for the deterministic opponent and starts its
policy after the human seat is assigned.

## Reproducible setup

Two unsigned 32-bit seeds identify the setup:

- **Map seed:** selects from the stable pool in `src/pve-match.mjs`: Forked Vale
  and Woodland Expanse. Both start with 24 total units, resources, and objectives.
- **Policy seed:** controls deterministic opponent choices.

The room URL carries both seeds. Include them, the map, build, and observed
behavior in a feedback report. Rematch keeps the room, map, and seeds and resets
the policy. New Map creates a new room and seeds.

## Opponent opening

The opponent gathers food and wood, contests objectives, and attempts one
Barracks after the first ten seconds of observed simulation time. It keeps
25 wood and 50 food in reserve, queues one Infantry at a time, and reinforces
up to 12 military units within a 24-unit friendly population cap. New soldiers
join its current advance. Lost Infantry can be replaced; a destroyed Barracks
is not rebuilt by this bounded opening. See the [production rules and evidence](pve-production-opening.md).

## Authority and limits

The bot uses the normal authoritative command path and a Team 1 observation.
Enemy units, buildings, and resources remain subject to fog filtering. Public
objective metadata is available; hidden capture progress is omitted.

Normal solo play uses no model provider. The optional
[model-proposal experiment](model-controlled-opponent-research.md) is separate
and default-off. See the [command contract](gameplay-command-observation-contract.md)
for the exact observation boundary.

## Verify

```sh
node scripts/pve-production-scenario.mjs
node scripts/pve-production-runtime-scenario.mjs forked-vale
node scripts/pve-production-runtime-scenario.mjs woodland-expanse
node scripts/pve-decision-fairness-scenario.mjs
node scripts/pve-tactical-retry-scenario.mjs
node scripts/pve-tactical-stall-runtime-scenario.mjs
node scripts/pve-opponent-scenario.mjs
node scripts/pve-room-launch-scenario.mjs
```

Follow these with a solo match: observe the opening, objective contest, retake
response, result, and rematch. A deterministic trace does not establish a fun or
understandable opponent.

The policy bounds economy-only decisions so repeated gather retries cannot
indefinitely delay an opening advance or objective retake. See the
[decision fairness evidence](pve-decision-fairness.md) for reproduction and limits.

When the army stalls short of its destination, the policy retries with bounded
backoff. Movement, fighting, and objective occupancy suppress retries. See the
[tactical recovery evidence](pve-tactical-recovery.md) for timing and observation limits.
