# Underbough woody bramble lifecycle · 30 September 2026

Owner-run candidate based on main `07f80a141acc5b5f28c7bbbb628638ce5ba777ff`, isolated local server port 4178 with separate room/map storage and headless Chrome.

Run `RTS_QA_URL=http://127.0.0.1:4178 RTS_VEGETATION_REGION=underbough RTS_VEGETATION_FAMILY=underbough-bramble RTS_VEGETATION_LIFECYCLE=1 RTS_VEGETATION_ATLAS=1 node scripts/qa-vegetation-browser.mjs`.

- [Four-state lineup](lifecycle-renderer.png) and [renderer proof](lifecycle-proof.json) exercise full/worked/low/depleted atlas UVs, retained scale/pivot and upright matrices. Cleared bramble is a low root tangle with clipped stems, distinct from Copperleaf’s tree stump.
- [Live harvest proof](live-harvest-proof.json): worker 0 gathered bramble cell 769 on the 40×40 `underbough-harvest-check` map. Worked observed at stock 3.933335, low at 1.933337, depleted zero, reset full. [Full](harvest-full.png), [worked](harvest-worked.png), [low](harvest-low.png), [cleared](harvest-depleted.png), [reset](harvest-reset.png). This cell’s deterministic selection is bramble, separately from the previous Copperleaf cell 768.
- [Eight-family fallback proof](fallback-proof.json) forces missing atlas metadata and confirms individual four-state batches, including both Underbough families. [Eleven-base binding proof](forest-slot-proof.json) retains the regional mix and identical forest cell sets. [Opening requests](opening-requests.json) verify no eager unused regional images. Game boot ready, runtime error empty, console errors empty.

Four selected source frames retain the 1536×1024 canvas and shared original crop. The first depleted draft left tall growth; its lower refinement drifted below the original root crop. Built-in ImageGen corrected registration before packaging. Rejected drafts remain outside the repository; their IDs/prompts are recorded. No local pixel repainting or alpha repair.

Source/runtime hashes and dimensions, exact atlas PNG frame pixels, alpha preservation and six packaged runtime files passed. Sprite-atlas contract, JS syntax, docs and whitespace passed. One fixed-oblique view, camera guidance approximate; no worker action animation, hosted readiness, both-seat fog or large-match performance claim.
