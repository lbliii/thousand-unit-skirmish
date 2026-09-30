# Sereward woody scrub lifecycle · 30 September 2026

Owner-run candidate based on main `91e6f3452df20018a882d1e835b0d7c150c132bb`, local port 4178, isolated room/map storage and headless Chrome. Server explicitly sets `RTS_MAP=maps/forked-vale.json` for the opening fixture.

Run `RTS_QA_URL=http://127.0.0.1:4178 RTS_VEGETATION_REGION=sereward RTS_VEGETATION_FAMILY=sereward-scrub RTS_VEGETATION_LIFECYCLE=1 RTS_VEGETATION_ATLAS=1 node scripts/qa-vegetation-browser.mjs`.

- [Lineup](lifecycle-renderer.png) and [renderer proof](lifecycle-proof.json) verify state UVs, retained scale/pivot and screen roll below 0.0001 degrees. Clipped outer tips progress to exposed cut-back wood and bare cut stems. Early clipping is subtle at strategic scale.
- [Live harvest proof](live-harvest-proof.json): worker 0 harvested scrub cell 769 (column 9, row 19) on 40×40 `sereward-harvest-check`. Worked stock 3.966669, low 1.966671, depleted zero, reset full. [Full](harvest-full.png), [worked](harvest-worked.png), [low](harvest-low.png), [depleted](harvest-depleted.png), [reset](harvest-reset.png).
- [Thirteen-family metadata-failure proof](fallback-proof.json) verifies individual four-state batches. [Eleven-base binding proof](forest-slot-proof.json) retains forest identity and palm/acacia/scrub selection. [Opening requests](opening-requests.json) confirm unused regional images are lazy.
- [Ordinary regional view](sereward-renderer-ordinary.png) and [strategic view](sereward-renderer-strategic.png) show the existing desert mix. Final boot ready, runtime error empty, console errors empty.

Atlas contract, hashes/dimensions, exact PNG atlas frame pixels and six byte-matching release runtime files passed; JS syntax, documentation links and whitespace passed. Full source/runtime are unchanged. Selected generated masters retain exact original canvas and shared crop; painted registration remains approximate. No local repainting or alpha repair.

All three current Sereward forest families now have stock states. This does not complete regional plant variety or fauna. One fixed-oblique view, approximate painted camera guidance; no measured source projection, extra perspectives, worker-action animation, hosted readiness or large-match performance claim.
