# Cliff pursuit recovery — 2026-09-27

Baseline: `26eea9b0bb06249a93176fade2c2375ff4b93a3f`.

## Scope and reproduction

A read-only connectivity scan of Highland Grove (`highland-grove`) found one
walkable region. Frontier Reach (`frontier-160`) has its main region and eight
31-cell pockets enclosed by forest. No stuck attack was established in an
ordinary match on either map. The isolated reproduction below exercises the
same elevation and movement contracts on a deliberately disconnected cliff.
It does not claim an authored-map or human-match observation.

`scripts/cliff-pursuit-scenario.mjs` publishes a small fog-enabled map with a
two-level elevation boundary, then restores a controlled roster on both sides.
The checkpoint fixture places two mirrored Archers, visible enemy workers,
friendly scouts to preserve observation during retreat, and reachable alternate
enemies. Subsequent movement and combat use ordinary authoritative commands.

Before the change:

- A direct attack fires across the cliff while the enemy is within range. After
  the visible enemy retreats beyond all reachable firing positions, both Archers
  keep their target and retry an empty path indefinitely.
- Attack move ignores the closer enemy across the cliff even when that enemy is
  already within weapon range. Its component filter disagrees with direct attack.

Both baseline modes fail their state-based deadlines. The correction lets attack
move consider in-range visible enemies regardless of walking connectivity.
Direct attacks and pursuit share a planner that uses the ordinary target flow
when both units share a region, and reachable firing cells otherwise. An enemy
moving along the cliff remains pursued when firing cells exist. An unreachable
retreat clears the target; attack move restores its route and can choose the
reachable alternate enemy.

## Bounds and rules

The additional goal scan runs only across disconnected regions. It examines at
most 11 × 11 cells with the current Archer range. Exact target position, component,
and range identify cached fields, avoiding a stale firing boundary when a unit
moves inside one cell. Attack move retains its existing per-tick flow-build cap,
candidate cap, scan schedule, and shared eight-entry flow cache. Budget exhaustion
defers work; it is not treated as an unreachable target.

Current cell centers can be valid firing goals while a unit's continuous position
is still outside range. In that case the route includes the current cell center.
No weapon ranges, damage, visibility rules, projectile occlusion, or elevation
bonuses change.

## Source observation

Inspected [0 A.D. UnitAI.js at
61a3b9507d974084e6badb88a0826bd89a6d5b8b](https://github.com/0ad/0ad/blob/61a3b9507d974084e6badb88a0826bd89a6d5b8b/binaries/data/mods/public/simulation/components/UnitAI.js#L2054).
`COMBAT.APPROACHING` asks to move into attack range and handles movement failure
by finishing queued work or finding a new target, with distinct handling for
forced orders. The useful principles are range-aware approach and an explicit
failure transition. Our implementation uses this project's flat range rules,
component labels, and bounded shared flow fields. No upstream code was copied.

## Verification

```sh
node scripts/cliff-pursuit-scenario.mjs --direct
node scripts/cliff-pursuit-scenario.mjs
node scripts/archer-firing-approach-scenario.mjs
node scripts/live-attack-move-repair-scenario.mjs
```

The focused fixture checks both seats, initial damage, continued lateral pursuit,
release after unreachable retreat, selection of a reachable alternate for attack
move, preservation of the elevation boundary, and rejection of unreachable
Infantry and foreign-unit commands. Adjacent regressions cover
building firing positions and construction-invalidated attack-move routes.
