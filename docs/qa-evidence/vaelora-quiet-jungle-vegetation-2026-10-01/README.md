# Vesperra vegetation on quiet loam — 1 October 2026

Working branch `codex/vesperra-quiet-loam`. Local server at port 4178 uses fresh
Bellweather default storage, as required by the lazy regional-loading opening
assertion. A prior attempt on a Vesperra default server correctly failed that
Bellweather-specific assertion; it was not relaxed. These helpers then load
and render the actual Vesperra map against the new ground default.

```sh
RTS_QA_URL=http://127.0.0.1:4178 RTS_VEGETATION_REGION=vesperra RTS_VEGETATION_JUNGLE=1 RTS_VEGETATION_PLANT_CONTRACT=1 RTS_VEGETATION_OUTPUT=docs/qa-evidence/vaelora-quiet-jungle-vegetation-2026-10-01 node scripts/qa-vegetation-browser.mjs
```

[Jungle proof](jungle-proof.json), [ordinary view](jungle-ordinary.png) and
[strategic view](jungle-strategic.png) cover the current 79 independent margin
plants, four batches, terrain contact, no roll, region/base exclusions and
independence from wood stock. [Plant contracts](plant-contract-proof.json)
verify all 26 geometries and wrong-scale rejections, plus 21 companion
lifecycles. [Ground-cover proof](forest-cover-proof.json) requires the new
quiet texture for the default living jungle cover. Existing plant counts,
positions, source images and gameplay rules are unchanged.

The repeated full run finishes with ready boot, empty runtime error and no
recorded browser errors. Comparing `points` to the preceding woodland-margin
proof confirms all 79 root positions, scales and flips are identical. Both QA
browser and local server were stopped after capture. These are local renderer
and loading proofs, not a hosted match or live independent harvest test.
