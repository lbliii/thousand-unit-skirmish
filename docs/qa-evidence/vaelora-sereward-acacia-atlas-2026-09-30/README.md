# Sereward thorn acacia lifecycle · 30 September 2026

Owner-run candidate based on main `890d242603cc5f0b76c41d4a56c4d24655e3b6a7`, local port 4178, isolated room/map storage and headless Chrome. Server explicitly sets `RTS_MAP=maps/forked-vale.json` for opening evidence.

Run `RTS_QA_URL=http://127.0.0.1:4178 RTS_VEGETATION_REGION=sereward RTS_VEGETATION_FAMILY=sereward-acacia RTS_VEGETATION_LIFECYCLE=1 RTS_VEGETATION_ATLAS=1 node scripts/qa-vegetation-browser.mjs`.

- [Lineup](lifecycle-renderer.png) and [renderer proof](lifecycle-proof.json) verify full/worked/low/depleted UVs, retained scale/pivot and screen roll below 0.0001 degrees. Standing crowns retain peach/cream and muted turquoise; depletion leaves a matching twisted stump. Cuts are subtle at strategic scale.
- [Live harvest proof](live-harvest-proof.json): worker 0 harvested acacia cell 770 (column 10, row 19) on 40×40 `sereward-harvest-check`. Worked stock 3.900002, low 1.900004, depleted zero, reset full. [Full](harvest-full.png), [worked](harvest-worked.png), [low](harvest-low.png), [depleted](harvest-depleted.png), [reset](harvest-reset.png).
- [Twelve-family metadata-failure proof](fallback-proof.json) verifies individual state batches. [Eleven-base binding proof](forest-slot-proof.json) retains obstacle identities and palm/acacia/scrub selection. [Opening requests](opening-requests.json) confirm unused regional images are lazy.
- [Ordinary regional view](sereward-renderer-ordinary.png) and [strategic view](sereward-renderer-strategic.png) show mixed silhouettes. Final boot ready, runtime error empty, console errors empty.

Atlas contract, file hashes/dimensions, exact PNG atlas frame pixels and six byte-matching release runtime files passed; JS syntax, docs and whitespace passed. Full source/runtime are unchanged. Selected masters retain exact original canvas and shared crop. Painted registration remains approximate; two depletion iterations were discarded and ground contact corrected through ImageGen. No local repainting or alpha repair.

Scrub lifecycle remains unfinished. One fixed-oblique painted view; approximate camera guidance. No measured source projection, extra perspectives, worker-action animation, hosted readiness or large-match performance claim.
