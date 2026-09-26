# Larger, lived-in maps: scale and density pilot

**26 September 2026 · design and authoring guide.** The user wants forests, resources, landmarks, and enough land for real routes, settlement, and contested regions. This is a playable-map pilot alongside the [living-land experiment](living-land-experiment.md), not a new approval queue or prerequisite for ordinary PRs.

## Current baseline

This audit reads the shipped maps on `main` at `a8bd1e9`. “Forest” counts blocked cells whose obstacle material is `forest`; it does not count individual harvestable wood nodes. Open Field and Dense Clash are diagnostic maps and should remain simple.

| Map | Cells | Harvestable food + wood nodes | Forest cells |
| --- | ---: | ---: | ---: |
| Stone Pass | 64 × 64 | 4 | 0 |
| Cinder Ridge | 80 × 56 | 4 | 30 / 4,480 (0.7%) |
| Forked Vale | 80 × 64 | 8 | 100 / 5,120 (2.0%) |
| Three Crowns | 64 × 64 | 6 | 140 / 4,096 (3.4%) |
| Frontier Materials | 64 × 64 | 4 | 42 / 4,096 (1.0%) |
| Open Field / Dense Clash | 64 × 64 | 4 / 0 | 0 / 0 |

A 160 × 160 map has **6.25 times** the area of today's 64 × 64 maps; 224 × 224 has **12.25 times** the area. Both sizes are already inside the Map Studio and server limit of 16–256 cells per side. Map JSON allows at most 128 resource nodes, 4,096 obstacle rectangles, and 4,096 ground-paint patches. Those are schema limits, not evidence that a crowded 2,000-unit match at 224 performs well.

The static audit on `0067c31` gives a compact-map geometry reference for
`maps/forked-vale.json`: both seats have 30–31-cell shortest paths to the
Signals (11.5–11.9 nominal seconds at current single-unit speed) and a
20-cell path to the Vale Watch (7.7 seconds). The Watch has a 21-cell
edge-disjoint alternate. Each spawn is nearest to 1,000 food and 1,000 wood
stock, plus 150 starting food and 250 starting wood. This describes layout,
not observed first contact, harvesting, or strategic route viability.

## Build one full-sized map now

Author a selectable **160 × 160 Frontier** 1v1 map. Treat these as first-layout targets, then tune from play:

- **Woodland:** about 12–20% of cells in several shaped forest regions, with gaps and clear edges. Do not fill a rectangle uniformly just to hit a percentage. Keep at least two broad army routes and smaller flanking paths; make open areas useful for building and formations.
- **Functional resources:** cluster authored food and wood sites into protected starting pockets, expansion regions, and contested pockets. The visual forest now has a stronger player promise: woody trees and thickets should themselves be harvestable, including deeper cells that workers can cut to open routes. See the [harvestable woodland pilot](harvestable-woodland-pilot.md) for the separate compact forest-cell model; the 128-node cap applies to ordinary authored resource sites, not a target number of harvestable trees.
- **Authored identity:** give the map 3–4 recognizable regions using existing ground materials, rock/water shapes, landmarks, and resource patterns. Place objectives and future specialty-crop candidates where holding land competes with another useful route. Leave room for the separate elevation pilot without making height a dependency of this map.
- **Two seats:** check mirrored travel to starting resources and contest sites, reachable nodes, buildable base and expansion space, and more than one viable opening. A larger map should create choices and exploration, not a longer walk across empty ground. Revisit the current 15-minute scenario deadlines against actual first-contact and objective travel times.

Ship the map in a scoped author-owned PR when it is useful. A static layout audit and an editor export/reload are proportionate initial evidence. Gather a normal-zoom overview and a two-seat play observation afterward; adjust resource stock, positions, routes, and objectives from what players actually use. This need not wait for full 2,000-unit or external-playtest acceptance.

A **224 × 224 Epic** variant can follow as a separate scale probe or authored scenario, not merely an enlarged blank copy. It can have more regions and longer routes. Keep existing compact maps as fast skirmishes and diagnostics. Decide whether the larger map should become the staging default after seeing first-contact time, travel, economy, and player preference.

## Make large maps authorable

Map Studio now supports scrollable zoom and pan navigation through [PR #93](https://github.com/lbliii/thousand-unit-skirmish/pull/93): the canvas has Pan and Fit controls, wheel zoom, and a 1×–4× range. At the 510 CSS-pixel viewport-height cap, a fitted 160-cell side gets at most about 3.2 pixels per cell and a 224-cell side about 2.3; 4× raises those upper bounds to about 12.8 and 9.1 pixels. Narrower viewports can reduce the fit size. Ground brush sizes still stop at 5 cells and resources are placed one node at a time.

The next authoring improvements are larger brushes or region fill and a repeatable forest/resource-cluster stamp. A script-generated first draft imported into Map Studio is a reasonable fast path; the editor should still round-trip and allow local edits. Keep the actual map and authoring-tool changes separate if that helps both owners merge sooner.

The renderer currently instances one tree sprite for every blocked forest cell. On a 160 × 160 map, 12–20% forest would mean about **3,100–5,100** tree instances, compared with 140 forest cells in the fullest compact shipped map. Woodland Expanse now has 5,240 forest cells. Renderer and Environment can use instancing, distance detail, and canopy treatment to keep the view full and readable. Each woody forest sprite should lead to the same harvest-and-clear interaction, so its silhouette matches the economic action.

## What to measure while building

- Run `node scripts/map-balance-audit.mjs maps/<map-file>.json` for a static
  two-seat report of initial stock by nearest spawn, nominal travel estimates
  to resources/objectives, and an edge-disjoint alternative after the shortest
  route is excluded when one is found. These are layout estimates. First
  contact, expansion, route viability under an opponent, and actual stock use
  still need a match observation. A missing alternate means this deterministic
  shortest route had no edge-disjoint path after its edges were removed; it is
  not a proof that no other pair of routes exists.
- **Map design:** cells by terrain/obstacle region, resource nodes and stock by region, paths and travel time from each spawn, available building footprints, objective approach widths, and actual player routes.
- **Runtime:** editor responsiveness at 160 and 224; map load and memory; A* expanded cells and order acknowledgement on long cross-map commands; server tick p95/max, vision/fog cost, two-seat snapshot bytes; browser frame and minimap legibility with dense forests and 2,000 units when a valid test window is available.
- **Network implication:** fog uses 2 bits per map cell in each state snapshot. Its packed data is 1,024 bytes on 64 × 64, 6,400 on 160 × 160, and 12,544 on 224 × 224 before base64. The map area expands this cost even when unit count stays fixed.
- **Player experience:** time to first meaningful contact, first expansion, fraction of map actually visited, whether resource pockets are found, whether a flank matters, and whether the map feels large rather than empty.

These are measurements and iteration cues, not a standing performance gate on a map-content PR. Diagnose a concrete regression and fix forward. Coordinate shared-host profiling so measurements are interpretable; source authoring can continue regardless of the measurement window.

## External reference

[Age of Empires II: DE's official update](https://www.ageofempires.com/news/age-of-empires-ii-definitive-edition-update-107882/) added larger editor map sizes and noted that existing map scripts might not support them correctly. A later [official map update](https://www.ageofempires.com/news/a-sneak-peek-at-new-content-coming-to-age-of-empires-ii-definitive-edition/) adjusts forests, neutral resources, and spacing by map size. Its tile scale is not equivalent to ours; the useful lesson is to design density and access for each size rather than stretching the border.
