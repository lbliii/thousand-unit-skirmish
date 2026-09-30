# Vaelora painted ground · local visual evidence

29 September 2026, branch `codex/vaelora-painted-ground`, based on main
`54cbb516` (the Vaelora concept checkpoint). This is the working asset candidate;
the [ground manifest](../../../assets/environment/frontier-v1/vaelora-ground-manifest.json)
identifies the exact source/runtime hashes.

## Capture conditions

Local room supervisor on port 4187, headless Chrome, 1280 × 633 content viewport,
DPR 1. No performance claim. Frontier Materials uses its default fit and a
24-unit opening so the ground is visible. Forked Vale uses Home base followed
by a -700 wheel delta for the close view, then +400 for the wider view; fog is
enabled and limits that check to the starting area. No completed-match proof.

- [Thirteen-material review map](frontier-materials.png): distinct warm sand,
  copper leaf litter, violet sterile earth, slate, white snow, blue ice, gray
  tidal mud, dark jungle loam, and lavender lunar soil; feathered boundaries
  remain continuous. Both team colors, resources, and the objective are visible.
- [Forked Vale close view](forked-vale.png): painted meadow reads beneath the
  starting Town Center, workers, and army. Fog remains authoritative.
- [Forked Vale wider view](forked-vale-strategic.png): the starting group and base
  remain distinguishable while the ground loses fine detail at distance.

Runtime boot reported ready with no visible runtime error. All thirteen revised
WebP paths loaded, and all thirteen base-ground options were present in Map Studio.
The full set totals 1,432,394 encoded WebP bytes; decoded memory and device
performance were not measured. The loader currently initializes the full set.

## Checks

Syntax checks for the changed server and renderer modules; map-persistence
scenario including all thirteen materials, unknown base/patch rejection, and
server restart; painted-material atlas validation and UV/schema scenarios;
reproducible atlas rebuild; 26 source/runtime dimensions and manifest hashes.
Release packing includes the five additional WebPs through the existing frontier
asset wildcard. Documentation links are checked with `npm run docs:check`.

## Limits

Mirrored symmetry remains visible in long grass, scree, and some regional patches.
Props are the previous generation and need a separate art pass. This is a usable
shared ground library, not complete region-specific terrain sets. Ice is a visual
ground material; water collision and walkability still come from map obstacles.
The eight-material candidate atlas remains an isolated candidate; the additional
five grounds are individual runtime textures.
