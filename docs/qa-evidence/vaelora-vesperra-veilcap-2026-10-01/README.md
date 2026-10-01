# Vesperra Veilcap

1 October 2026 local; base `f5de11f6`, branch `codex/vesperra-veilcap` plus this checkpoint. Isolated local server at port 4178; no hosted/performance claim.

```sh
node scripts/validate-environment-plants.mjs
python3 scripts/validate-environment-plant-alpha.py
node scripts/environment-plant-pack-scenario.mjs
RTS_QA_URL=http://127.0.0.1:4178 RTS_VEGETATION_REGION=vesperra RTS_VEGETATION_UNDERSTORY=1 RTS_VEGETATION_VARIATION=1 RTS_VEGETATION_PLANT_CONTRACT=1 RTS_VEGETATION_OUTPUT=docs/qa-evidence/vaelora-vesperra-veilcap-2026-10-01 node scripts/qa-vegetation-browser.mjs
```

Built-in ImageGen used approved Vesperra ecology and the camera construction guide. Initial broad cap undersides indicated too low a painted camera and were rejected; selected edit shows cap tops. Original selected PNG unchanged; deterministic padded alpha crop exports 928×979 WebP, quality86/method6/exact alpha. Registered 0.61614×0.65 card with bottom-center pivot. Approximate painted viewpoint, no multi-view certification.

[Understory proof](understory-proof.json) verifies all three specimen batches at unchanged accepted forest locations, partial-stock retention, zero-stock hiding, exact reset, raised ground contact, upright roll and seeded regional fixtures. [Renderer](understory-renderer.png) shows fern and fungus beneath partially harvested trees beside a cleared stump. [Plant proof](plant-contract-proof.json) passes all 25 geometries / wrong-scale rejection checks and all 20 forest companion lifecycles. Source/reference/crop/hash registration validation, exact alpha and corrupted-pack fixtures pass.

The first browser run exposed a stale two-batch assertion, corrected to require all three specimens. A later root-cover assertion expected previous snow/tidal textures; updated to current quiet defaults, then full run repeated successfully. Forked Vale boots ready with no recorded browser errors. These are test-contract updates, not relaxed plant contact or lifecycle checks. Decorative fungus only; independent harvest, authored action states and extra painted views remain unfinished.
