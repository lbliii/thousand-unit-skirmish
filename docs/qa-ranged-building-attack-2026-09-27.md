# In-range building attacks — 27 September 2026

## Reproduction and result

At base `20d076b1b8254f877e6c27a28fe1d3fae1818883`, the authoritative server
rejected an Archer attacking an enemy Archery Range across disconnected terrain,
even though the Archer was 3.5 cells from the building edge and its attack range
was 4.5. Unit-target orders and the combat tick already allowed attacks within
range without requiring a walking path.

`node scripts/ranged-building-attack-scenario.mjs` constructs and trains through
ordinary commands in a local two-seat match. It restores that real match with a
two-cell dividing wall in its map fixture, then checks both seats. The baseline
fails with `ATTACK BUILDING REJECTED · TARGET UNREACHABLE`; the change accepts
both Archer orders, damages both buildings, and keeps each Archer on its side
with no walking path. Distant Infantry orders remain rejected.

The restored fixture deliberately isolates combat: current building placement
rejects construction on already disconnected maps. That separate restriction
remains. This is automated local evidence, not a deployed or human-play result.

## Decision and source research

An attacker already within building-edge range enters combat before approach
pathfinding. Ownership, visibility, unit-generation, military-unit, and target
validity checks still run first. Out-of-range units retain the existing approach
rules. Projectile occlusion and searching for firing positions across a gap are
outside this change.

The actual [0 A.D. UnitAI.js source at revision
61a3b9507d974084e6badb88a0826bd89a6d5b8b](https://github.com/0ad/0ad/blob/61a3b9507d974084e6badb88a0826bd89a6d5b8b/binaries/data/mods/public/simulation/components/UnitAI.js#L409)
was inspected on 27 September 2026. Its `Order.Attack` handler checks attack
range and enters combat before checking whether movement is possible. This
supports separating the ability to fire from the ability to approach. We use
that design observation with our own existing distance rule; no source code was
copied or translated.

## Validation

- New two-seat regression: baseline failed at the in-range attack acceptance;
  fixed server passes and both clients observe building damage.
- Existing `scripts/unreachable-attack-scenario.mjs`: retained order rejection,
  guest reset, spawn-clearance, and objective-hold checks.
- Server and scenario syntax checks and documentation link validation.
