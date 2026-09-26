# Frontier environment pack v1

This is the first playable environment art library for the RTS. It treats the world as an old, contested frontier: living meadow, exhausted cinder upland, windworn sand, weathered basalt, mature trees, and an ancient split stone at contested objectives. The mood is grounded and somber, while warm moss, ochre grass, and small amber accents keep the field inviting.

The rendering is **not pixel art**. Seven opaque ground textures repeat across an orthographic 3D battlefield. Their mirrored repeat pattern is mathematically continuous, and every painted region samples the same global world coordinates. Brush edges feather around the outside of each material region; adjoining patches of the same material stay continuous. Trees, berry thickets, rocks, and landmarks are transparent painterly cutout sprites that face the fixed camera. Repeated props are grouped into instanced batches so a large army still has room in the draw-call budget.

## Asset roles

| Asset | Game role | Readability target |
| --- | --- | --- |
| `meadow.png`, `short-grass.png`, `long-grass.png` | Three states of living ground | Quiet base, short pasture, and coarser wild growth |
| `dirt.png`, `sand.png`, `scree.png`, `cinder.png` | Worn, dry, rocky, and exhausted ground | Distinct regions or paths without changing movement rules |
| `rock-outcrop.png`, `basalt-ridge.png`, `cliff.png` | Three stone obstacle heights | Low rocks, medium impassable ridge, tall cliff; flips and scale changes break repetition |
| `pine.png`, `oak.png`, `silver-birch.png`, `field-maple.png`, `hazel-thicket.png` | Forest obstacles | Conifer, open pale-barked tree, broadleaf crowns, and a shrub-height silhouette mark blocked woodland |
| `oak.png` | Harvestable wood node | A single large tree with its existing resource ring and stock behavior |
| `berries.png` | Harvestable food node | Rust-red food accent, paired with the existing resource ring |
| `seamstone.png` | Capture zone landmark | Ancient neutral silhouette with restrained amber seams; the game's zone outline and ownership UI remain authoritative |

Source PNGs, hashes, and generation prompts are in [`assets/environment/frontier-v1/PROVENANCE.md`](../assets/environment/frontier-v1/PROVENANCE.md). The pack is original project art, without third-party game images.

## Review in the prototype

1. Start the game with `npm start` and open **Match Controls**.
2. Choose **Frontier Materials** to compare all seven ground materials and all three rock heights in the same lighting. **Stone Pass** and **Cinder Ridge** show the two original regional palettes in normal play.
3. Choose **Woodland Expanse** for the 160 × 160 mixed forest scene and inspect it at ordinary and closer zoom.
4. Open **Map Studio**. Choose a **Base Ground** material, then choose a 1, 3, or 5-cell ground brush and draw across the map grid. **Base ground** brushes a region back to the base. Rocks, Ridge, and Cliff retain rectangle painting for collision obstacles; ground paint leaves resources and passability intact.
5. Save and play a custom map, then reopen it. Painted regions and obstacle height survive export, server validation, and map reload.
6. Zoom between ordinary strategic view and closer inspection with the mouse wheel. Compare these questions: Are brush boundaries quiet? Are rock heights unmistakable? Are berry and wood nodes obvious beside a 1,000-unit army? Does the objective read as a world feature without masking units or the capture outline? Are Azure and Ember still the first colors you notice?

The first review pass found that raised square stone blocks made the ridge look like a tiled strip, so the stone mesh was removed from rendering and the basalt sprites now carry its shape. Server collision and vision still use the authored stone obstacle rectangles. Forest and water retain low colored ground footprints.

## Current limits and next art tests

- Each rock height currently has one silhouette, flipped and scaled across a barrier. Additional modules and cap/corner pieces would make long cliffs more natural.
- Forest cells now choose among oak, pine, silver birch, field maple, and hazel thicket. The three new source/runtime pairs, deterministic size ranges, and generation provenance are in [`vegetation-manifest.json`](../assets/environment/frontier-v1/vegetation-manifest.json); resource harvesting remains on its existing oak and berry states.
- Ground brushes now draw connected strokes with soft outer edges. More varied transitions, roads, and shorelines remain for the next map-making pass.
- Sprites face the fixed oblique camera. They suit this prototype camera, but free camera rotation would need new views or 3D props.
- Harvestable oaks and impassable forests share the same species; their isolation/density and resource rings distinguish their gameplay roles. We should test whether players read that distinction during a real match.
- Runtime WebP files are smaller than the source PNGs; measure downloads and texture memory on intended playtest devices before widening distribution.
