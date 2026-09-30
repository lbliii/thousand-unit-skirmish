# Vesperra fern silhouette variation · 30 September 2026

Local candidate based on main 0fa92da0. Isolated room/map storage, headless Chrome on port4178 and opening fixture maps/forked-vale.json.

Run `RTS_QA_URL=http://127.0.0.1:4178 RTS_VEGETATION_REGION=vesperra RTS_VEGETATION_LIFECYCLE=1 RTS_VEGETATION_ATLAS=1 RTS_VEGETATION_UNDERSTORY=1 RTS_VEGETATION_VARIATION=1 node scripts/qa-vegetation-browser.mjs`.

- [Companion proof](understory-proof.json):75 companions across256 existing zero-seed forest cells, split36 original/39 fuller silhouettes in two meshes. Partition retains every selected cell. All roots stay inside parent cells; partial harvest retains appearance, zero hides and reset restores exact matrices. Actual roll7.95e-15 degrees passes0.0001 threshold. Level2 ground contact passes1e-6 tolerance. Repeat/different-seed checks include asset identity and pass across nine bindings.
- [Close renderer](understory-renderer.png) shows original/worked and fuller/low companions beside depleted/cleared forest. [Ordinary](vesperra-renderer-ordinary.png) and [strategic](vesperra-renderer-strategic.png) views show forest composition. Canopies obscure much understory at strategic distance.
- [Live harvest/reset](live-harvest-proof.json):worker0, mistbark cell768, worked3.966669, low1.966671, depleted0 and reset. [Tree camera/UV](lifecycle-proof.json), [fourteen-family fallback](fallback-proof.json), [eleven-base bindings](forest-slot-proof.json) and [opening requests](opening-requests.json) pass. Both fern images load on jungle-loam only. Final boot ready with no runtime/console errors.

Selected generated PNG unchanged; cropped WebP alpha exact. Release files match source bytes. JS syntax, docs and whitespace pass. Two painted silhouettes share one approximate view; no measured source projection, independent fern resource, extra collision cells, multi-directional source, hosted or performance claim.
