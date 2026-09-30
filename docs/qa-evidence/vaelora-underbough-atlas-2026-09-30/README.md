# Underbough Copperleaf lifecycle atlas · 30 September 2026

Owner-run local working candidate based on merged main `58f97d8a6fac463f6f1d9e7bd480b35e87b0564d`, isolated room/map directories, port 4178 and headless Chrome. Run `RTS_QA_URL=http://127.0.0.1:4178 RTS_VEGETATION_REGION=underbough RTS_VEGETATION_LIFECYCLE=1 RTS_VEGETATION_ATLAS=1 node scripts/qa-vegetation-browser.mjs`.

- [Four-state game-renderer lineup](lifecycle-renderer.png) and [selection proof](lifecycle-proof.json) check full/worked/low/depleted UV selection, stable scale/pivot and upright runtime matrices. Worked/low remain standing, stump retains the original roots.
- [Live harvest proof](live-harvest-proof.json): worker 0 gathered Copperleaf forest cell 768 on the 40×40 `underbough-harvest-check` map. Observed worked at stock 3.966669, low at 1.966671, depleted at zero, then reset to full. [Full](harvest-full.png), [worked](harvest-worked.png), [low](harvest-low.png), [depleted](harvest-depleted.png), [reset](harvest-reset.png).
- [Atlas-failure proof](fallback-proof.json): forced missing atlas metadata restores individual four-state batches for all seven families, including Copperleaf depletion. [Eleven-base binding proof](forest-slot-proof.json) preserves forest slot identities and the Copperleaf/bramble mix. [Opening requests](opening-requests.json) show no unused regional images loaded eagerly by Forked Vale.
- [Ordinary woodland](underbough-renderer-ordinary.png) and [strategic woodland](underbough-renderer-strategic.png) review the existing regional composition. Final boot ready, runtime error empty, console errors empty.

All source/runtime hashes and dimensions passed; all four PNG atlas frames equal decoded runtime frame pixels exactly. Runtime WebP alpha is preserved; six release files (atlas JSON/WebP and four fallback frames) match packaged bytes. Sprite-atlas contract, JS syntax, documentation links and whitespace passed. The new `--region underbough` packer option reproduces the page without rewriting other regions.

One fixed-oblique painted view; prompt camera guidance is not measured source calibration. Bramble retains its existing clearing feedback. No active worker animation, extra viewpoints, hosted/fog or large-match performance claim.
