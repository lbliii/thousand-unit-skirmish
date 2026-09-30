# Bellweather hedgerow lifecycle · 30 September 2026

Owner-run integrated candidate `0c42309`, including main `1c8984e` and the hedgerow increment, local port 4178, isolated room/map storage and headless Chrome. Server explicitly sets `RTS_MAP=maps/forked-vale.json` for the opening fixture.

Run `RTS_QA_URL=http://127.0.0.1:4178 RTS_VEGETATION_REGION=bellweather RTS_VEGETATION_FAMILY=bellweather-hedgerow RTS_VEGETATION_LIFECYCLE=1 RTS_VEGETATION_ATLAS=1 node scripts/qa-vegetation-browser.mjs`.

- [Lineup](lifecycle-renderer.png) and [renderer proof](lifecycle-proof.json) verify four-state UVs, retained scale/pivot and screen roll below 0.0001 degrees. Yellow/sage foliage gives way to exposed cut-back wood and short cleared stems. Early clipping is subtle at strategic scale.
- [Live harvest proof](live-harvest-proof.json): worker 0 harvested hedgerow cell 769 (column 9, row 19) on 40×40 `bellweather-harvest-check`. Worked stock 3.900002, low 1.900004, depleted zero, reset full. [Full](harvest-full.png), [worked](harvest-worked.png), [low](harvest-low.png), [depleted](harvest-depleted.png), [reset](harvest-reset.png).
- [Fourteen-family metadata-failure proof](fallback-proof.json) verifies individual four-state batches. [Eleven-base binding proof](forest-slot-proof.json) retains forest identity and existing mix. [Opening requests](opening-requests.json) confirm unused regional images are lazy.
- [Ordinary regional view](bellweather-renderer-ordinary.png) and [strategic view](bellweather-renderer-strategic.png) show existing composition. Final boot ready, runtime error empty, console errors empty.

Atlas contract, hashes/dimensions, exact PNG atlas frame pixels and six byte-matching release runtime files passed; JS syntax, docs and whitespace passed. Release allowlist resolution retains all seven Boughward manifests/atlases as well as the six hedgerow runtime files. Full source/runtime remain unchanged. Generated masters retain exact original canvas and shared crop; painted edges/registration remain approximate. No local repainting or alpha repair.

This completes state art for the current regional hedgerow alongside maple, not the broader Bellweather vegetation palette. Other generic trees remain. One fixed-oblique painted view; approximate camera guidance. No measured source projection, extra perspectives, worker-action animation, hosted readiness or large-match performance claim.
