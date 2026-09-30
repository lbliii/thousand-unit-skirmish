# Ellionar garden hedge lifecycle · 30 September 2026

Owner-run candidate based on main `6fa5c27bcb5aa870528fed77e6cd8fd89c9a88ee`, local port 4178 with isolated room/map storage and headless Chrome. Server explicitly sets `RTS_MAP=maps/forked-vale.json` for the opening fixture; current default map is different.

Run `RTS_QA_URL=http://127.0.0.1:4178 RTS_VEGETATION_REGION=ellionar RTS_VEGETATION_FAMILY=ellionar-garden-hedge RTS_VEGETATION_LIFECYCLE=1 RTS_VEGETATION_ATLAS=1 node scripts/qa-vegetation-browser.mjs`.

- [Lineup](lifecycle-renderer.png) and [renderer proof](lifecycle-proof.json) verify full/worked/low/depleted UVs, retained scale/pivot and screen roll below 0.0001 degrees. Clipped tips progress to exposed branches and a low cleared woody base.
- [Live harvest proof](live-harvest-proof.json): worker 0 harvested hedge cell 769 (column 9, row 19) on 40×40 `ellionar-harvest-check`. Worked stock 3.966669, low 1.966671, depleted zero, reset full. [Full](harvest-full.png), [worked](harvest-worked.png), [low](harvest-low.png), [depleted](harvest-depleted.png), [reset](harvest-reset.png).
- [Eleven-family metadata-failure proof](fallback-proof.json) verifies individual four-state fallback batches, including both Ellionar families. [Eleven-base binding proof](forest-slot-proof.json) retains forest identities and the existing palm/hedge mix. [Opening requests](opening-requests.json) confirm unused regional images are lazy.
- [Ordinary view](ellionar-renderer-ordinary.png) and [strategic view](ellionar-renderer-strategic.png) show the existing garden composition. Final boot ready, runtime error empty, console errors empty.

Atlas contract, file hashes/dimensions, exact PNG page frame pixels and six byte-matching release runtime files passed; JS syntax, documentation links and whitespace passed. Full source/runtime are unchanged. Generated masters share the original canvas/crop; painted edges and root details are approximate rather than pixel-identical. One tall depletion was discarded and shortened through ImageGen; no local repainting or alpha repair.

Single fixed-oblique view with approximate painted camera guidance. This is local stock feedback evidence, not measured source projection, worker-action animation, extra perspectives, hosted readiness or large-match performance.
