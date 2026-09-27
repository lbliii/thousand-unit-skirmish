# Archer approach to building firing range — 27 September 2026

## Reproduction and behavior

On base `5842e42`, an Archer outside weapon range receives
`ATTACK BUILDING REJECTED · TARGET UNREACHABLE` for a visible enemy Archery Range
across a two-cell river, although its own bank contains reachable firing positions.
The existing approach planner only considered cells next to the building.

The server now plans Archer building attacks toward walkable cell centers within
4.5 cells of the building edge in the Archer's current connected region. Infantry
retain perimeter approach goals. In-range attacks still begin without walking.
Construction validation and route repair use the same approach rule, so an
unrelated new building does not cancel a river-bank attack.

## Bounds and contracts

Candidate enumeration examines at most a 13 × 13 cell box around the target for
the current building size and Archer range. The existing multi-goal flow planner
is shared by units of the same kind and connected region. Cache keys include unit
kind so a mixed Infantry/Archer command cannot give Infantry ranged destinations.
The existing eight-entry flow cache and navigation invalidation remain in force.
There is no per-unit full-map search added to order assignment.

Current combat range, ownership, generations, and visibility checks are retained.
This implements the existing range-based weapon rule; it adds neither projectile
occlusion nor elevation-based weapon range. It does not change unit-target
approach planning.

## Local regression

`node scripts/archer-firing-approach-scenario.mjs` creates a fog-enabled river map
and constructs/trains through ordinary two-seat commands. It fails against the
unchanged base and checks the following with the fix:

- A mixed selection on each seat accepts only the Archer; the Infantry has no
  route across the river.
- Both Archer routes stay on their own bank and end within building-edge range.
- New construction during approach invalidates navigation; both attacks recover
  and both clients observe building damage.
- Infantry-only, stale-generation, foreign-unit, and friendly-building orders
  remain rejected.
- A hidden enemy building remains untargetable even when its ID is supplied.

This is local automated evidence, not a deployment or human-match observation.

## Pinned source research

Inspected [0 A.D. UnitAI.js, MoveToTargetAttackRange, at
61a3b9507d974084e6badb88a0826bd89a6d5b8b](https://github.com/0ad/0ad/blob/61a3b9507d974084e6badb88a0826bd89a6d5b8b/binaries/data/mods/public/simulation/components/UnitAI.js#L4716).
Its ranged approach checks target visibility, obtains the weapon's range, and
requests movement into that range; its ranged branch also accounts for its own
parabolic range model. The applicable technique is to approach a legal firing
range rather than require a path to the target's edge. Our implementation uses
our existing grid flow fields and flat weapon range. No upstream implementation
was copied or translated.
