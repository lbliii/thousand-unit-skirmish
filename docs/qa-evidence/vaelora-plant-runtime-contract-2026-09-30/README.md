# Plant runtime scale contract · 30 September 2026

Local candidate from main `b7d8d049`, isolated room/map storage and headless Chrome on port 4178. Run `RTS_QA_URL=http://127.0.0.1:4178 RTS_VEGETATION_PLANT_CONTRACT=1 node scripts/qa-vegetation-browser.mjs`.

[Runtime geometry proof](plant-contract-proof.json) covers all twenty registered plant/scenery specimens through production environment creation across eleven terrain bases plus the living fringe. Actual geometry bounding boxes match registered dimensions within 1e-6 world units. Billboards have bottom-center roots; the water decal is centered. All twenty deliberately incorrect size/surface requests are rejected before mesh allocation. [Base binding regression](forest-slot-proof.json) and opening Forked Vale boot pass without runtime/console errors.

Selected manifests now agree with the runtime registration on kind, dimensions, pivot and water lift, and the full validator requires matching registration/manifest coverage. The rejection scenario includes a uniform width/height increase that preserves image aspect but must fail the runtime contract. Twenty manifests, rejection fixtures, syntax, documentation links and whitespace pass. Release module/loader/server bytes match; exact temporary copy removed.

This is a scale/pivot production guard, not measured calibration of painted source perspective. Source images and current visual dimensions are unchanged. No new directions, live match, hosted or performance claim.
