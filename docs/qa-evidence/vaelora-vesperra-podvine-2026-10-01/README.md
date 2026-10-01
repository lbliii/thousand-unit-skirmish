# Vesperra spiral pod-vine — 1 October 2026

Isolated local server at port 4178, working branch `codex/vesperra-podvine`.
No hosted or performance claim.

```sh
node scripts/validate-environment-plants.mjs
python3 scripts/validate-environment-plant-alpha.py
node scripts/environment-plant-pack-scenario.mjs
RTS_QA_URL=http://127.0.0.1:4178 RTS_VEGETATION_REGION=vesperra RTS_VEGETATION_UNDERSTORY=1 RTS_VEGETATION_VARIATION=1 RTS_VEGETATION_PLANT_CONTRACT=1 RTS_VEGETATION_OUTPUT=docs/qa-evidence/vaelora-vesperra-podvine-2026-10-01 node scripts/qa-vegetation-browser.mjs
```

The approved Vesperra key's Spiral Podvine is a low woody tangle with muted
petrol/olive leaves and three split violet seed pods. Initial tall/front-on
source rejected; the selected edit lowers the silhouette and reveals leaf tops.
The selected PNG is unchanged. Alpha≥8 crop `[54,135,1513,862]`, LANCZOS maximum
1024, RGBA WebP quality86/method6/exact alpha. Runtime is 1024×510 at
1.10431×0.55 world units with bottom-center pivot. The painted viewpoint is
approximate, not a measured multi-view capture.

[Renderer lineup](understory-renderer.png) shows the two ferns, Veilcap and
pod-vine beside their retained parents, followed by a cleared stump.
[Understory proof](understory-proof.json) covers 75 companions, four batches,
partial-stock retention, zero-stock hiding, exact reset, raised ground contact,
no screen roll and repeatable seed fixtures. [Baseline comparison](placement-comparison.json)
confirms identical accepted parent cells to the previous three-specimen pack.
Counts are 20 primary ferns, 16 alternate ferns, 19 Veilcaps and 20 pod-vines.

[Plant contracts](plant-contract-proof.json) verify all 26 registered plant
geometries, reject wrong scale, and exercise all 21 forest companion lifecycles.
Source/reference hashes, dimensions, crop binding, exact decoded alpha and
corrupted-pack rejection checks pass. [Ordinary](vesperra-renderer-ordinary.png)
and [strategic](vesperra-renderer-strategic.png) views expose the current kit.

The first full browser run stopped at a stale Underbough assertion for the
previous copperleaf/bramble mix. The assertion was updated to require the
current root-oak, hornbeam, old-plum and bramble atlas mix; Vesperra assertions
require all four companion assets. This changes expected content, not contact
or clearing checks. Pods have no independent yield or harvesting states;
additional authored perspectives remain unfinished.

The repeated full browser run completes successfully: ready boot, empty runtime
error and no recorded browser errors. Both QA browser and isolated server were
stopped after capture. This verifies renderer helpers and local app loading;
it does not claim an independent pod-harvesting gameplay path.
