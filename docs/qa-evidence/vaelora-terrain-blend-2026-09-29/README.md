# Soft terrain blending · 29 September 2026

Follow-up to the [painted ground pass](../vaelora-ground-2026-09-29/README.md),
on `codex/vaelora-painted-ground` after `8c76852`. The same thirteen source textures
are used; this candidate changes ground composition and adds larger round brushes.

## Visual evidence

Local isolated room supervisor on port 4187, headless Chrome, 1280 × 633 content
viewport, DPR 1. Frontier Materials uses its default fit. Forked Vale uses Home
base followed by -700 wheel delta, then +400 for the wider view. The organic study
inherits that wider zoom after publishing. This is appearance evidence, not a
performance measurement or completed-match claim.

- [Frontier Materials](frontier-materials.png): straight study strips now have
  soft transitions, rounded corners, and continuous mixed joins.
- [Organic ground study](organic-ground-study.png): winding dirt trail, rounded
  copper woodland, sand, and lunar-soil areas blend into the meadow. Interiors
  retain their material identity. Team units and resources remain visible.
- [Forked Vale close](forked-vale.png) and [wider](forked-vale-strategic.png): the
  ordinary starting base remains readable; fog continues to limit sight.

[Importable study map](organic-ground-study.json) uses discrete round stamps and
non-overlapping terrain runs. Imported through Map Studio, then Save & Play in the
isolated room. The saved map's 4096 ground-cell assignments matched the source
after the editor recompressed it. Brush sizes 1, 3, 5, 7, and 11 were present.
Browser boot was ready; the displayed runtime-error field remained empty.

## Technical checks and limits

`terrain-blend-scenario.mjs` verifies soft borders, normalized three-way joins,
catalog-order independence within mask quantization, reproducibility, compression
independence, and unchanged input map data. It is registered in CI. Changed-module
syntax, client-import tests, water-surface scenario, CI-shard coverage, and
documentation links pass. The release pack includes the new served helper module.

Masks have two samples per cell, linear/mipmap filtering, and an approximately
two-cell transition band. Only materials present in the final painted cells get
overlay masks; their maps and masks are disposed when the map is cleared. The
editor grid and minimap remain schematic. Forest-obstacle floor overlays retain
their previous feathering. Fine painted paths soften into their surroundings;
authored hard edges or per-region softness are not exposed yet. Specific shore
debris, grass tufts, and other transition art remain future content work.
