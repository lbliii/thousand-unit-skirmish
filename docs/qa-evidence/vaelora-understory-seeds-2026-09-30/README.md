# Map-seeded understory variation · 30 September 2026

Local candidate based on main05f095f7, isolated room/map storage, headless Chrome on port4178. Opening fixture maps/forked-vale.json.

Run `RTS_QA_URL=http://127.0.0.1:4178 RTS_VEGETATION_REGION=underbough RTS_VEGETATION_LIFECYCLE=1 RTS_VEGETATION_ATLAS=1 RTS_VEGETATION_UNDERSTORY=1 RTS_VEGETATION_SEED_STUDY=1 node scripts/qa-vegetation-browser.mjs`.

[Companion proof](understory-proof.json) compares terrain seeds93007,93008,93007 for jungle-loam, tidal-mud, snow, ice, lunar-soil and forest-floor. Exact cell/x/z/scale descriptor equality proves repeated-seed stability; inequality proves changed-seed variation. All fixtures retain256 forest cells. The zero-seed fixture retains75 companions, both Underbough parent families, cell containment, clearing/reset matrices, effective-zero screen roll and level2 raised ground contact.

[Close view](understory-renderer.png), [live harvest/reset](live-harvest-proof.json), [eleven-base bindings](forest-slot-proof.json), [fourteen-family fallback](fallback-proof.json), [camera/UV proof](lifecycle-proof.json) and [lazy opening requests](opening-requests.json) cover existing regional behavior. Final boot ready and no runtime/console errors. JS syntax, docs and whitespace passed. Generated sources/runtime images are unchanged.

This varies understory placement only. Parent trees still use their existing distribution, and no additional painted viewpoint, ecological clustering, hosted or large-match performance claim is made.
