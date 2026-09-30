# Underbough Rootward fungus · 30 September 2026

Owner-run local candidate based on main a568698d, isolated room/map storage, headless Chrome on port4178. Opening fixture explicitly uses maps/forked-vale.json.

Run `RTS_QA_URL=http://127.0.0.1:4178 RTS_VEGETATION_REGION=underbough RTS_VEGETATION_LIFECYCLE=1 RTS_VEGETATION_ATLAS=1 RTS_VEGETATION_UNDERSTORY=1 node scripts/qa-vegetation-browser.mjs`.

- [Companion proof](understory-proof.json):75 fungus clusters across256 existing forest cells in one mesh, including both Copperleaf and bramble parents. Root positions remain within cells, partial harvest retains appearance, stock zero hides and reset exactly restores matrices. Actual companion roll7.95e-15 degrees, below0.0001 threshold. Raised level2 ground contact agrees with groundHeight within1e-6.
- [Close renderer](understory-renderer.png): worked, low and depleted parent states. Selected refinement shows more cap tops and shorter gills than the initial draft. Low rust caps remain visible at Copperleaf roots. [Ordinary](underbough-renderer-ordinary.png) and [strategic](underbough-renderer-strategic.png) regional views. Canopies obscure much of the understory at strategic distance.
- [Live harvest/reset](live-harvest-proof.json):worker0, cell768, worked3.933335, low1.933337, depleted0, reset full. [Tree camera/UV proof](lifecycle-proof.json), [fourteen-family metadata fallback](fallback-proof.json), [eleven-base bindings](forest-slot-proof.json) and [lazy opening requests](opening-requests.json) passed. Fungus loads on forest-floor only. Final boot ready with no runtime/console errors.

Selected generated PNG unchanged; WebP crop/encode alpha exact and runtime release bytes match. JS syntax, documentation links and whitespace passed. No standalone fungus harvesting, new resource/collision cells, additional painted perspectives, measured source projection, hosted validation or large-match performance claim. Runtime roll is measured; painted perspective remains approximate.
