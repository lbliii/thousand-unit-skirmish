# Siltmouths shoreline reeds · 30 September 2026

Local candidate based on mainb3d64c77. Isolated room/map storage, headless Chrome on port4178, opening fixture maps/forked-vale.json.

Run `RTS_QA_URL=http://127.0.0.1:4178 RTS_VEGETATION_REGION=siltmouths RTS_VEGETATION_LIFECYCLE=1 RTS_VEGETATION_ATLAS=1 RTS_VEGETATION_UNDERSTORY=1 RTS_VEGETATION_SHORE=1 node scripts/qa-vegetation-browser.mjs`.

- `node scripts/shore-vegetation-scenario.mjs`:42 repeat-seed-stable clumps inside existing Reed Crossings water cells; changed seed varies placement, no duplicated roots, channel end cells and water interiors stay clear, overlapping patches do not duplicate decoration, all-water/bare/tiny-water fixtures produce no reeds and map data stays unchanged. Existing water-surface scenario passes.
- [Native-camera proof](shore-proof.json):one shoreline batch/42 plants, all256 forest identities retained; actual roll7.95e-15 degrees passes0.0001 threshold. Roots match shared water level0.032 within1e-6. Clearing all forests leaves shoreline matrices unchanged; source map unchanged. Review map, meadow/jungle bases and raised water-root fixture produce no shoreline batch.
- [Close channels](shore-renderer.png) show irregular small clumps within water and an open dry crossing. [Map Studio review copy](shore-study.json) retains shipped Reed Crossings geometry/rules except a distinct import ID and fog disabled for appearance review. [Ordinary Save & Play](shore-save-play-ordinary.png) and [strategic](shore-save-play-strategic.png) show the integrated result. Shipped map fog remains unchanged.
- [Forest companion proof](understory-proof.json), [live tree harvesting/reset](live-harvest-proof.json), [tree camera/UV](lifecycle-proof.json), [fourteen-family fallback](fallback-proof.json), [eleven-base loading](forest-slot-proof.json) and [opening requests](opening-requests.json) pass. Final boot ready, runtime error empty and console errors empty.

An initial preview boot failed because the new module was missing from the public-file allowlist; corrected before the successful run. Initial direct shipped-ID import was rejected by catalog protection; the separately named review copy resolves this without modifying the shipped map.

Existing approved silver-reed sprite reused unchanged, no new source art. Runtime module/loader bytes match the release pack and completed temporary copy removed. Syntax, documentation links and whitespace pass. Flat water only: elevated roots are omitted until elevated water rendering is supported. No passability/resource/schema change, independent reed harvesting, new painted direction, hosted or performance claim.
