# Construction connectivity — 27 September 2026

## Reproduction

Base `f25be5a10449b007e4d3f46bc0705e4072b179f4` accepts an authored map whose
seats occupy separate islands when it contains no resources or objectives that
require shared access. Ordinary Barracks construction on either island fails
with `BUILD REJECTED · WOULD BLOCK A ROUTE`, even in open local space. The
placement check required both bases to belong to one connected region after
placement, without checking whether they were connected beforehand.

Town Centers add another case: a clamped Town Center can cover a map-edge spawn
marker. A direct component lookup of that occupied marker produces an invalid
component even when the base has usable adjacent cells.

## Implemented rule

Before reserving a footprint, capture the connected regions of the current
walkable grid, including terrain, elevation, existing buildings, and Town Centers.
For each region, preserve connections among base access, live units, resources,
and access to existing production buildings and Town Centers. A building may
cover some access cells if an exit in the same connected region survives.
Previously separate regions need not become connected. Pending and queued move
routes retain their existing checks, and ranged attacks across islands do not
create a walking-route requirement.

Footprint occupancy, construction access from the owner's base, selected-worker
reachability, costs, and map validation remain enforced. Resource-node and capture
validation still require the access their authoring contracts specify. This does
not introduce transport or allow a new footprint to strand reachable entities.

## Evidence

`node scripts/construction-connectivity-scenario.mjs` uses ordinary publication,
construction, and movement commands through two WebSocket clients. It fails on
the unchanged base at the first harmless local placement and passes with the fix:

- Both islands construct completed Barracks, observed by both seats.
- A footprint that seals either island's three-cell doorway from a living unit
  is rejected. Neither wood nor building count changes, and the units can return
  through the doorway afterward.
- Placement over both Town Centers stays rejected as occupied space.
- Both seats construct successfully with Town Centers covering edge spawn markers.

The ranged-building regression also checks harmless construction while Archers
are actively attacking buildings and units across disconnected terrain.
The existing live attack-move route-repair scenario passes: a saved route is
repaired around new construction and the queued destination is reached.
These are local automated results; no deployed or human-play result is claimed.

## Source research and design boundary

Inspected the actual [0 A.D. BuildRestrictions.js at
61a3b9507d974084e6badb88a0826bd89a6d5b8b](https://github.com/0ad/0ad/blob/61a3b9507d974084e6badb88a0826bd89a6d5b8b/binaries/data/mods/public/simulation/components/BuildRestrictions.js#L60)
on 27 September 2026. It separates footprint obstruction and terrain passability
from other placement restrictions, using foundation checks with the appropriate
passability class. That separation supports retaining local occupancy validation
while making our additional anti-stranding policy explicit. The before/after
connectivity rule is our project decision; it is not presented as 0 A.D.'s rule.
No upstream implementation was copied or translated.
