# Harvestable woodland pilot

**Direction from the player, 26 September 2026.** Forests should be places workers can cut through, not a backdrop that looks like wood but cannot be worked. Berry bushes should leave a small woody harvest after their fruit is gone. Forest outlines should follow natural-looking clusters rather than large rectangular blocks. Build and merge useful slices independently; this note is a shared contract, not an approval or release gate.

## The mismatch in the current build

On `main` at `b34fca5`, Woodland Expanse is 160 × 160 with 5,240 blocked forest cells. The renderer places an oak, pine, birch, maple, or hazel sprite on every one of those cells and paints forest floor beneath them. The map has four `wood` nodes and four `food` nodes. Workers can gather only the separate nodes. Forest sprites are solid path and sight obstacles with no stock, gather target, or clearing state. The map schema caps ordinary resource nodes at 128; expanding every tree into one of those nodes would greatly inflate ordinary resource snapshots and exceed that cap.

The rectangular look comes from authored obstacle rectangles, not a requirement of the renderer. `addObstacleEnvironmentSprites` and forest-floor painting expand those rectangles to cells. A shaped cell mask can be encoded as short row spans using today's rectangle schema. The previous [map density pilot](map-scale-density.md) allowed deep forest to remain scenery; that no longer matches the desired player interaction.

## Player-facing rules to prototype

1. **Woody sprite means usable wood.** Every visible tree or woody hazel thicket placed by a forest cell should accept a worker wood order. Do not require players to identify a special oak among identical-looking forest trees. Tree species can yield different small finite amounts, but the first slice can give every forest cell the same stock. Decorative ground cover is not a separate clickable resource.
2. **Cutting changes the land.** A worker reaches an adjacent open cell, chops the target cell, carries wood home, and eventually removes that cell's tree and hard path/sight block. Ground cover can remain as a clearing. Movement, vision, minimap, and later route orders must agree on the cleared cell. The map need not regrow during this first pilot; regrowth remains the separate [living-land experiment](living-land-experiment.md).
3. **Berry, then brushwood.** A food node with an authored optional brushwood amount first yields berries. Once fruit is exhausted, a later worker order can harvest its woody remnant for a modest amount of wood. Food cargo returns before wood gathering; one load never mixes types. The sprite, cursor/callout, and exhausted state should make the second use understandable. Existing food nodes without this field behave as before.
4. **Forest opening.** Author one selectable test map or scenario with a useful clearing around each Town Center and workers, forest close on several sides, and at least two directions that can be opened by cutting. The first route must be understandable and harvestable from the starting clearing. Observe whether players choose to cut a shortcut, widen a route for an army, or settle elsewhere. A sealed start that current validators or starting armies cannot use is not the pilot.
5. **Organic outline.** Generate deterministic clustered cell masks with uneven edges, gaps, and a few protruding tree groups. Convert each row to nonoverlapping spans for the existing map format, within its 4,096-obstacle limit. Forest-floor paint and sprites use the same mask. Preserve two-seat fairness and broad army routes; avoid a pure rectangle with visual jitter at its edge.

## Small independent implementation slices

| Primary lane | Useful mergeable slice | Evidence to record |
| --- | --- | --- |
| Gameplay systems | Give forest cells authoritative finite wood stock and a cell-target gather order. Cut cells update blocking, vision, path caches, and checkpoint state. Use a compact per-cell change representation instead of adding thousands of ordinary `resourceNodes`. | A worker cuts one cell, deposits wood, and opens a traversable route; reset and checkpoint/reconnect reproduce that state. |
| Renderer and interface | Pick the visible tree cell, show the gather affordance and its remaining/cleared state, and hide or change the cut tree. Keep unseen changes hidden behind fog until observed. | A named build shows click → chop → clearing → movement at ordinary zoom. |
| Gameplay and environment art | Add optional berry brushwood stock and an obvious fruitless-then-cut visual state; reuse a simple current asset if needed and improve the art in a later slice. | A worker gathers food, returns it, receives a new wood order, then gathers and deposits wood from the same bush. |
| Maps and scenarios | Replace blocky forest rectangles with a seeded irregular mask and author the forest-opening pilot. | Mask/row-span count, editor round trip, both-seat routes, and one observed choice about where to cut. |

The shared address for a forest tree is its map cell (`row * width + column`); it is separate from the authored `resourceNodes` IDs. Keep the map definition static and transmit only mutable forest state needed by a seat. The team can evolve this representation if a smaller working implementation proves better. A local single-worker scenario is enough for the first code merge; density and 2,000-unit measurements are later scale evidence, not a blanket hold on useful code.
