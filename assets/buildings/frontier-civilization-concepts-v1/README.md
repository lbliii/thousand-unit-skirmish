# Frontier civilization — Bellweather building concepts v1

Complete-building source concepts, 30 September 2026. These establish a proposed coherent first-civilization architectural kit for the existing Frontier roster. They are not runtime sprites, exact orthographic captures, lifecycle sheets or a new gameplay faction.

[Illustrated wiki](../../../docs/lore/frontier-architecture.md) · [Style and scale guide](../../../docs/frontier-civilization-art-style.md) · [Atlas production plan](../../../docs/building-atlas-production-plan.md)

## Contents

Eight separate transparent PNG concepts: Town Center, House, Storehouse, Stable, Workshop, Watchtower, Barracks and Archery Range. Each depicts the complete building from an elevated three-quarter view. `manifest.json` records dimensions, hashes, roles, footprint references and proposed visible-base targets. `prompts.json` records exact generation prompts and reference paths.

[Open the roster gallery](preview.html) · [Reviewed gallery screenshot](gallery-review.png)

## Source and provenance

Generated with the built-in image-generation tool. The Town Center was generated from a written brief informed by the selected Vaelora/Bellweather map, ecology key, art contract and current lore wiki on main `f896d09`. The other buildings use that generated Town Center image as a visual style reference. Downloaded third-party village/castle sheets were studied in the preceding planning task; their pixels were not submitted as inputs to these generations.

Full-resolution generated outputs are retained without manual paintover. Storehouse received a targeted built-in background-extraction pass; its original and selected output paths and exact edit prompt are recorded in `prompts.json`. Actual silhouettes and camera angles require controlled modeling/capture before runtime use. Transparent image padding is not world scale. The generated standard/ornament details are illustrative: production must enforce the project's exact team shapes and recolorable masks. Wiki viewing does not demonstrate in-game appearance.

[Source review evidence](../../../docs/qa-frontier-building-concepts-2026-09-30.md)

## Next production step

Use the Town Center and House as the first scale pair beside the current 0.8-world-unit Worker. Preserve consistent door dimensions and measure modeled ground bases separately from projected alpha bounds. Then derive registered views and Foundation/Frame/Complete/Damaged/Critical states per building, integrate one useful pack at a time and record actual game-zoom evidence.
