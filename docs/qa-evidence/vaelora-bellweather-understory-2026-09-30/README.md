# Bellweather meadow herbs · 30 September 2026

Local candidate based on main64857bf9. Isolated room/map storage, headless Chrome on port4178; opening fixture maps/forked-vale.json.

Run `RTS_QA_URL=http://127.0.0.1:4178 RTS_VEGETATION_REGION=bellweather RTS_VEGETATION_LIFECYCLE=1 RTS_VEGETATION_ATLAS=1 RTS_VEGETATION_UNDERSTORY=1 node scripts/qa-vegetation-browser.mjs`.

- [Companion proof](understory-proof.json):75 clumps across256 existing zero-seed forest cells in one mesh; includes maple, hedgerow and existing generic parents. Roots stay inside parent cells, partial harvest retains appearance, zero hides and reset restores exact matrices. Actual roll7.95e-15 degrees passes0.0001 threshold; level2 ground contact passes1e-6. Repeat/changed-seed checks pass across13 bindings; meadow/short-grass/long-grass/dry-grass explicitly require meadow-herb identity.
- [Close renderer](understory-renderer.png):flowers beside worked maple and low hedgerow; cleared third cell has no plant. [Ordinary](bellweather-renderer-ordinary.png) and [strategic](bellweather-renderer-strategic.png) show forest composition. Cream/yellow flowers read at close range; canopy obscures much understory at strategic zoom.
- [Live harvest/reset](live-harvest-proof.json):worker0, maple cell768, worked3.966669, low1.966671, depleted0 and reset. [Camera/UV](lifecycle-proof.json), [fourteen-family fallback](fallback-proof.json), [eleven-base bindings](forest-slot-proof.json) and [opening requests](opening-requests.json) pass. Meadow herbs load on meadow only in the eleven-base fixture, while opening meadow loads them normally. Final boot ready with no runtime/console errors.

Selected generated PNG unchanged; cropped WebP alpha exact. Release source/runtime/manifest and loader bytes match; completed temporary release removed. JS syntax, documentation links and whitespace pass. No food/medicinal resource, extra collision cells, open-meadow placement, extra painted views, measured source projection, hosted or performance claim.
