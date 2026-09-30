# Sereward succulent · 30 September 2026

Local candidate based on main b7b8fc4f, isolated room/map storage and headless Chrome on port4178. Opening fixture maps/forked-vale.json.

Run `RTS_QA_URL=http://127.0.0.1:4178 RTS_VEGETATION_REGION=sereward RTS_VEGETATION_LIFECYCLE=1 RTS_VEGETATION_ATLAS=1 RTS_VEGETATION_UNDERSTORY=1 node scripts/qa-vegetation-browser.mjs`.

- [Companion proof](understory-proof.json):75 rosettes across256 existing zero-seed cells in one mesh, including palm/acacia/scrub parents. Roots stay inside parent cells; partial harvest retains appearance, zero hides and reset restores matrices exactly. Actual roll7.95e-15 degrees, below0.0001 threshold. Level2 ground contact matches groundHeight within1e-6. Repeat/different-seed checks pass across nine bindings.
- [Close renderer](understory-renderer.png): worked, low and depleted palm states. Turquoise leaves read clearly against peach sand and warm roots. [Ordinary](sereward-renderer-ordinary.png) and [strategic](sereward-renderer-strategic.png) regional views; canopy obscures much understory at strategic distance.
- [Live harvest/reset](live-harvest-proof.json):worker0, palm cell768, worked3.966669, low1.966671, depleted0 and reset full. [Tree camera/UV proof](lifecycle-proof.json), [fourteen-family fallback](fallback-proof.json), [eleven-base bindings](forest-slot-proof.json) and [lazy loading](opening-requests.json) pass. Succulent loads on sand only. Final boot ready with no runtime/console errors.

Generated PNG unchanged, cropped WebP alpha exact, release runtime bytes match. Completed temporary release copy removed after verification. JS syntax, docs and whitespace passed. No water-harvest/resource/collision rules, open dune placement, extra painted views, measured source projection, hosted or performance claim.
