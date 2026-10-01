# Ru’Lora living-fringe canopy lifecycle · 30 September 2026

Local candidate from main `765f7b89`, isolated room/map storage and headless Chrome on port 4178. Run `RTS_QA_URL=http://127.0.0.1:4178 RTS_VEGETATION_REGION=vesperra RTS_VEGETATION_LIFECYCLE=1 RTS_VEGETATION_ATLAS=1 RTS_VEGETATION_UNDERSTORY=1 RTS_VEGETATION_FRINGE_CANOPY=1 node scripts/qa-vegetation-browser.mjs`. The Vesperra flag identifies jungle ground; the fringe flag applies the registered fringe identity and dedicated family.

[Four-state renderer](lifecycle-renderer.png) and [state/UV proof](lifecycle-proof.json) show full, worked, low and depleted frames on the game camera, exact stock-to-UV selection and reset, one atlas batch and zero unintended screen roll. [Live harvesting](live-harvest-proof.json) verifies the dedicated canopy in an authoritative local map through worked/low/zero and reset. No runtime errors.

[Fringe bindings](fringe-binding-proof.json) record dedicated canopy and broadleaf companions on shipped Fringe Path and region/ground/review exclusions. [Companion proof](understory-proof.json) retains parent-cell roots, partial appearance, zero clearing, exact reset and raised contact. [Fallback](fallback-proof.json) restores all four individual state textures for all fifteen families after atlas metadata returns404. Generic eleven-base and forest-cover regressions remain passing.

[Source audit](lifecycle-source-proof.json) verifies source/runtime hashes and exact decoded alpha for all four frames using the shared crop. Sprite-atlas contract validation passes; deterministic builder also verifies atlas alpha. Syntax/docs/whitespace pass. Packaged source/runtime, atlas and loader bytes match; exact temporary copy removed.

Source PNGs unchanged, one approximate painted view per state. Ordinary/strategic scenery renders omit units/HUD/fog; live captures are a local isolated harvest fixture. No hosted/performance or intrinsic painted-angle calibration claim. Living-fringe biology/canon remains working presentation, with no new yield or supernatural rules.
