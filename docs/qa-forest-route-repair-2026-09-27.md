# Forest approach repair — 2026-09-27

## Reproduction

Baseline: `e5efc50c4c4c60d331a3c269b45c290a91286d31`.
The authoritative WebSocket scenario uses Highland Grove (`highland-grove`) and
FRONTIER REACH (`frontier-160`) terrain, resources, elevations, spawns, and fog.
It publishes test copies with 250 initial units and 175 wood per seat so both
players can place one Barracks without a long economic opening. No checkpoint
state is injected; checkpoints only observe simulation results.

On Highland Grove, send a worker to forest cell column 16, row 37 (Azure),
or column 112, row 37 (Ember). Immediately place a Barracks at column 18/110,
row 38 using another worker. Both placements are accepted and leave another
harvesting side open. Before the fix, generic route repair chooses a reachable
cell 2.24 world units from the tree, outside the 1.5-unit harvesting range.
Both workers finish their paths with `gatherPhase: to-node`, zero cargo, and no
further progress. The regression fails with deposited wood `[0, 0]`.

On Frontier Reach, first move the workers north to reveal trees through ordinary
vision. Target columns 26/133, row 41; a Barracks centered at the same column,
row 43 would cover every accessible harvesting side. This placement must be
rejected while the active forest order remains valid.

## Decision

Construction validates the worker's reachable forest approach cells, rather than
only the generic destination's connectivity. An affected approach order uses the
existing forest flow-field planner to choose another reachable harvesting cell.
It shares cached fields and does not add a per-tick search. Cargo return orders
keep their existing deposit route and accounting. Fog and ownership validation
are unchanged.

## Source comparison

Read 0 A.D. `UnitAI.js` at commit
[`61a3b9507d974084e6badb88a0826bd89a6d5b8b`](https://github.com/0ad/0ad/blob/61a3b9507d974084e6badb88a0826bd89a6d5b8b/binaries/data/mods/public/simulation/components/UnitAI.js).
Its `GATHER.GATHERING` entry checks resource interaction range before starting
collection, and target invalidation enters `FINDINGNEWTARGET`; cargo return has
a separate `RETURNRESOURCE` state. The relevant principle is that reaching a
walkable cell is insufficient to complete a gathering approach. This fix keeps
our selected tree and existing cargo lifecycle, recalculating valid approach
cells after construction. No upstream code was copied or translated.

## Checks and limits

The focused scenario verifies both seats, placement acceptance/rejection,
forest depletion, exactly six wood deposited per tree, empty cargo, and a
finished gather order. Existing woodland persistence and construction
connectivity scenarios protect their surrounding contracts. These are local
simulation regressions, not a human playtest or a large-match performance claim.

```sh
node scripts/worker-cargo-return-scenario.mjs
node scripts/worker-cargo-return-scenario.mjs frontier-160
node scripts/harvestable-woodland-scenario.mjs
node scripts/construction-connectivity-scenario.mjs
```
