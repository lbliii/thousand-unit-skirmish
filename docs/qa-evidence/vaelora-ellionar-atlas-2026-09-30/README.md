# Ellionar cultivated palm lifecycle · 30 September 2026

Owner-run candidate based on main `7ba591981db716c09090952d1a47f3f8ccac809e`, isolated room/map storage and local port 4178, headless Chrome.

Run `RTS_QA_URL=http://127.0.0.1:4178 RTS_VEGETATION_REGION=ellionar RTS_VEGETATION_LIFECYCLE=1 RTS_VEGETATION_ATLAS=1 node scripts/qa-vegetation-browser.mjs`.

- [Four-state lineup](lifecycle-renderer.png) and [renderer proof](lifecycle-proof.json) check UV selection, retained instance scale/pivot and screen roll below 0.0001 degrees. Small/deep cuts keep cultivated crowns; depleted frames leave matching diamond-bark stumps.
- [Live harvest proof](live-harvest-proof.json): worker 0 harvested palm cell 768 (column 8, row 19) on 40×40 `ellionar-harvest-check`. Worked observed at stock 3.900002, low at 1.900004, depleted zero, reset full. [Full](harvest-full.png), [worked](harvest-worked.png), [low](harvest-low.png), [depleted](harvest-depleted.png), [reset](harvest-reset.png).
- [Ten-family metadata-failure proof](fallback-proof.json) verifies individual four-state batches. [Eleven-base binding proof](forest-slot-proof.json) retains forest identities and palm/hedge selection. [Opening requests](opening-requests.json) confirm no eagerly loaded unused regional images.
- [Ordinary view](ellionar-renderer-ordinary.png) and [strategic view](ellionar-renderer-strategic.png) show the existing garden mix. Final boot ready, runtime error empty, console errors empty.

Hashes/dimensions, exact PNG atlas frame pixels and six release runtime files passed, along with atlas contract, JS syntax, docs and whitespace. Full approved source/runtime are unchanged. Generated masters retain the original canvas and share the original crop; slight painted edge differences remain, rather than pixel-identical registration. The first stump was discarded for excessive height; the accepted shorter refinement preserves its ground placement at game scale. No local repainting or alpha repair.

Garden hedge lifecycle is unfinished. Single fixed-oblique view; camera guidance approximate. This proves local state feedback, not measured painted projection, worker-action animation, extra perspectives, hosted readiness or large-match performance.
