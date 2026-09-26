# Living land: elevation, regional crops, and regrowth

**Status:** design experiment, 26 September 2026. This records a direction to prototype, not a new first-slice completion requirement or an approval gate for other PRs. The [game bible](game-bible.md) still defines the current playable goal.

## Player promise

Land should be worth choosing, defending, and revisiting. A high terrace can expose an approach; a sheltered grove can produce a valuable crop; an abandoned clearing can recover. The resulting question for a player is **where to settle or fight now, and what land will be valuable later?**

The first proof should be one authored 1v1 map where players can make that choice. We should measure whether anyone actually contests the special site instead of assuming a new resource counter makes it interesting.

## What exists today

- Map Studio paints ground materials and blocked stone, forest, and water cells. Obstacle `elevation` controls their visible height and vision blocking; it is not a traversable land-height system. See `server.mjs` map validation and `src/main.js` editor compression.
- Resource nodes are fixed `food` or `wood` sites with finite `stock`. Current save validation requires the same node IDs and stock no greater than the map's starting stock. Gathering only reduces it.
- The renderer already has visual concepts for resource stages. Those can convey renewal, but visual stages alone cannot create authoritative growth.

Keep older maps flat and finite by default. Add the new fields to one pilot map first.

## One playable experiment

Create a **Highland Grove** scenario with equal travel distance from both spawns, two approaches to a central terrace, and ordinary food/wood near each base. The terrace has one contestable specialty crop site. A player can rush it for a modest economic option, fortify the high route for information, build nearby to protect workers, or ignore it and push another objective. Do not force the grove into the victory rule; we want to learn whether its value changes play.

### 1. Traversable elevation

- Give Map Studio a simple raise, lower, and level brush. Store small non-overlapping `elevationPatches` with integer `level` 0–2; missing data means level 0. Keep `height` as the existing map dimension, and keep obstacle `elevation` separate.
- Render actual raised ground and place units, buildings, resources, selection markers, and projectiles on the surface. Make the height visible in the editor and minimap so path choices are legible.
- In the first rules slice, neighboring cells with a one-level difference are slopes with a small uphill path cost; a two-level edge is a cliff unless the author paints a connecting level. A level-1 terrace grants a small sight advantage. Start without a damage bonus.
- Validation checks that both spawns, essential resources, and the scenario objective remain reachable, and that building footprints are level. Test both seats and a map saved, exported, and reloaded through Map Studio. Tune the sight and path-cost numbers from the pilot rather than treating real-world elevation as a combat formula.

**Gameplay trial in source, 26 September 2026:** one-level edges are traversable, two-level edges are cliffs, and uphill A*/attack-flow edges cost 115 against the 100 base edge cost. Sources on levels 1–2 receive a one-cell sight-radius increase; combat stats remain unchanged. These values are playtest inputs, not balance commitments. The server derives the level grid from `elevationPatches`, keeps entity rows at their existing shape, and records the map field with match rules version 4. `scripts/elevation-scenario.mjs` exercises both seats, weighted routes, the single-ramp cliff crossing, team-private extended sight, and checkpoint/rematch stability. `scripts/map-utils-scenario.mjs` covers map connectivity across slopes and cliffs.

### 2. One special crop with a use

Add a named `species` separate from a node's economic `type`. The first site can be a **coffee grove**: workers gather a small `trade` stock, and the Town Center can exchange a bounded amount of trade for food or wood with a cooldown. That gives the crop a reason to protect or conquer without requiring a full market system immediately. Trade is earned from the map; it is not an unlimited purchase button. Show its source, inventory, and exchange outcome clearly on both seats. A later forward depot or outpost could make settlement near the grove a distinct economic choice; the first pilot tests protection and conquest using existing buildings.

Treat these as playtest starting values, not balance commitments: 60 trade on the site, 12 trade per minute of renewal after 60 seconds without harvesting, and an exchange of 20 trade for 40 food or 30 wood no more than once per 30 seconds. Balance should compare a grove opening with ordinary resource and objective openings, including whether first control snowballs.

The pilot coffee grove sits on a high, shaded terrace. A spice garden can become a second species after the first site proves useful, favoring a warm sheltered region. Elevation should be one site factor, not a universal crop rule: real coffee site selection also depends on temperature, rainfall, water, soil, slope, and aspect ([FAO coffee agronomy](https://www.fao.org/4/ae939e/ae939e03.htm)). These are inspiration for readable fictional biomes, not a promise to simulate agriculture. Start with an authored site and a clear Map Studio suitability hint; automated crop placement can wait.

### 3. Land that recovers

Begin with renewal on **fixed, authored node IDs**. A harvested berry bush or coffee grove becomes depleted, then visibly buds and refills toward a capacity after a period without harvesting. A cut tree can return as a sapling at its stump after a longer delay. Passing troops do not reset the clock; active harvesting or a building occupying the site does. Keep the growth rate below ordinary consumption so a single guarded patch cannot sustain an entire army indefinitely.

Use deterministic simulation ticks and persist `stock`, last harvest/eligible time, and growth stage through checkpoint/restart and rematch reset. Update the snapshot invariant to compare stock with `capacity` rather than initial stock. Hide current growth behind fog just as current resource state is hidden. The renderer should show depleted → young → mature states and not reveal unseen regrowth.

Only after that fixed-site loop is fun, try **succession into nearby empty cells**: shrubs first, then young trees if the ground suits them and a seed source or surviving stump exists. Place no new hard path blocker under units or across the only valid route. Wildlife migration is a separate later experiment; mobile spawns need their own rules and performance budget. Natural regeneration depends on seed sources and site conditions, and can fail after severe disturbance ([US Forest Service research](https://research.fs.usda.gov/treesearch/57074)); use that as a design cue for stewardship and recovery, with game-tuned timescales.

## Independent slices and owners

| Slice | Owning lane | Observable result |
| --- | --- | --- |
| Add optional height data and Map Studio brushes | Maps/interface, with gameplay on the schema | An older map round-trips unchanged; Highland Grove exports/reloads with the same levels. |
| Render traversable height | Renderer/environment art | A player can see shelf, slope, units, and building bases at ordinary and strategic zoom. |
| Apply slope pathing and sight | Gameplay systems, with balance | Both seats reach all essential locations; high-ground information has a visible counterplay route. |
| Add one specialty site and exchange | Gameplay/maps/interface, with balance | Two seats can gather, see, spend, and contest trade; balance records whether players choose it. |
| Renew fixed nodes and persist state | Gameplay/renderer/environment art | Harvest, leave, regrow, reconnect/restart, and rematch yield the same authoritative result. |
| Observe a complete pilot match | QA and balance | Record site control time, harvest/exchange totals, path choices, whether terrain mattered, and player explanation. |

The affected owners should agree on the map/snapshot fields directly, then ship their own scoped PRs when useful. The complete match is evidence for the **experiment**, not a prerequisite for merging each slice to staging. Keep current first-slice, art, and infrastructure work moving in parallel.

## Decision after the pilot

Keep the feature only if the special site changes at least one meaningful choice and the elevation can be read without a tutorial. If players ignore the grove, change its location, reward, or routes before adding more species. If renewal causes passive camping or endless low-risk income, slow it or require stewardship and exposure. If elevation mostly creates pathing confusion, improve the editor and terrain cues before adding combat modifiers.
