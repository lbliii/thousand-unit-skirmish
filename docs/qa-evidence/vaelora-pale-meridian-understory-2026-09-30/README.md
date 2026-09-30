# Pale Meridian silver cushion moss · 30 September 2026

Owner-run integrated candidate 464d586a (moss slice plus main5b9afde), isolated room/map storage, headless Chrome on port4178. Opening fixture explicitly uses maps/forked-vale.json.

Run `RTS_QA_URL=http://127.0.0.1:4178 RTS_VEGETATION_REGION=pale-meridian RTS_VEGETATION_LIFECYCLE=1 RTS_VEGETATION_ATLAS=1 RTS_VEGETATION_UNDERSTORY=1 node scripts/qa-vegetation-browser.mjs`.

- [Companion proof](understory-proof.json): 75 moss cushions across 256 existing forest cells, one mesh, roots inside parent cells, appearance retained through partial harvest, hidden at zero and exact matrix restoration on reset. Actual mirrored/yawed instance matrices have maximum screen roll 7.95e-15 degrees against the game camera, below0.0001 threshold.
- [Close renderer](understory-renderer.png): worked, low and depleted parent states with clearing companions. Moss remains deliberately lower than tree roots. [Ordinary](pale-meridian-renderer-ordinary.png) and [strategic](pale-meridian-renderer-strategic.png) views show regional composition.
- [Live harvesting/reset](live-harvest-proof.json): worker0, cell768, worked3.933335, low1.933337, depleted0 and reset full. [Tree camera/UV proof](lifecycle-proof.json), [fourteen-family metadata fallback](fallback-proof.json), [eleven-base bindings](forest-slot-proof.json), and [lazy opening requests](opening-requests.json) passed. Moss loads on both snow and ice and no other terrain base. A level2 raised terrain fixture checks all75 companion root heights against groundHeight within1e-6. Final boot ready with no runtime or console errors.

Generated PNG unchanged; crop/encode preserves alpha. Runtime WebP byte-matches packed release. JS syntax, documentation links and whitespace passed. Runtime screen roll is measured; painted source projection remains approximate. No new resource/collision cells, exposed tundra placement, additional painted views, hosted validation or large-match performance claim.
