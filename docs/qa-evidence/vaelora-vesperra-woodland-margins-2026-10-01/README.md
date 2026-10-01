# Vesperra woodland margins — 1 October 2026

Working branch `codex/vesperra-woodland-margins`, based on main `7f9bcbe9`.
Isolated local server at port 4178. No hosted or performance claim.

```sh
node scripts/meadow-vegetation-scenario.mjs
RTS_QA_URL=http://127.0.0.1:4178 RTS_VEGETATION_REGION=vesperra RTS_VEGETATION_JUNGLE=1 RTS_VEGETATION_PLANT_CONTRACT=1 RTS_VEGETATION_OCCUPATION=1 RTS_VEGETATION_OUTPUT=docs/qa-evidence/vaelora-vesperra-woodland-margins-2026-10-01 node scripts/qa-vegetation-browser.mjs
```

[Ordinary view](jungle-ordinary.png) and [strategic view](jungle-strategic.png)
show Pale Clearings' independent woodland-edge pockets. The central route stays
open, ferns form the main margin layer, and fungi/pods supply sparse accents.
The underlying terrain still has substantial texture mottling; this slice
changes foliage placement rather than claiming terrain repetition is resolved.

[Jungle proof](jungle-proof.json): 79 plants across four registered batches,
19 primary ferns, 46 alternate ferns, 6 Veilcaps and 8 pod-vines. Received wood
stock does not alter this independent layer. Root matrices follow terrain;
maximum screen roll is below 0.0001°. All incompatible base terrains, review
maps and explicit non-Vesperra regions are excluded. Map data stays identical.
These are renderer helper captures, not an ordinary player-built harvest test.

The Node placement scenario verifies deterministic seeds, unique roots, a
single species per six-cell bed, exact group/root union, final painted material,
obstacle/objective padding and protected spawn/resource radii. Every root lies
within five world units of a forest rectangle. No forests means no margin
plants. Existing six regional placement cases retain their counts and pass.

[Plant contract proof](plant-contract-proof.json) covers all 26 registered
geometries and wrong-scale rejections, all 21 forest companion lifecycles,
and footprint hiding/exact restoration for all nine land-vegetation categories,
including the new jungle layer. This verifies direct renderer occupation logic,
not a live construction command. Full browser run completes with ready boot,
empty runtime error and no recorded browser errors. Existing single-view source
art and resource rules are unchanged; more perspectives and harvest poses remain.
