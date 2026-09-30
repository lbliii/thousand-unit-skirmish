# Veyrholds highpine lifecycle · 30 September 2026

Owner-run candidate based on main `12487696de5290eb43fad47a99f9fb61ddbac52d`, isolated room/map storage and local server port 4178, headless Chrome.

Run `RTS_QA_URL=http://127.0.0.1:4178 RTS_VEGETATION_REGION=veyrholds RTS_VEGETATION_LIFECYCLE=1 RTS_VEGETATION_ATLAS=1 node scripts/qa-vegetation-browser.mjs`.

- [Four-state lineup](lifecycle-renderer.png) and [renderer proof](lifecycle-proof.json) check state UVs, retained instance scale/pivot and upright matrices. Standing frames keep the wind-shaped crown; depletion shows matching weathered pine roots and a pale cut stump.
- [Live harvest proof](live-harvest-proof.json): worker 0 gathered deterministic highpine cell 810 (column 10, row 20) on the 40×40 `veyrholds-harvest-check` map. Worked at stock 3.933335, low at 1.933337, depleted zero, reset full. [Full](harvest-full.png), [worked](harvest-worked.png), [low](harvest-low.png), [depleted](harvest-depleted.png), [reset](harvest-reset.png).
- [Nine-family metadata-failure proof](fallback-proof.json) verifies individual state batches, including highpine depletion. [Eleven-base binding proof](forest-slot-proof.json) retains forest cell identities, the existing Veyrholds tree mix and decorative ironlichen outcrops. [Opening requests](opening-requests.json) confirm no eagerly loaded unused regional images.
- [Ordinary regional view](veyrholds-renderer-ordinary.png) and [strategic view](veyrholds-renderer-strategic.png) show existing composition. Final boot ready, runtime error empty, console errors empty.

All generated masters retain the exact source canvas, shared original crop and alpha. All file hashes/dimensions, exact PNG atlas frame pixels and six packaged runtime files passed. Atlas contract, JS syntax, docs and whitespace passed. Full approved source/runtime remain unchanged. Other forest species retain their existing states; this does not complete the regional alpine forest palette. Single fixed-oblique view, painted camera guidance approximate; no hosted readiness, worker-action animation, extra perspectives or large-match performance claim.
