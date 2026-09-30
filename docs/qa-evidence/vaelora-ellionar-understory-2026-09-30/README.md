# Ellionar Sunbloom · 30 September 2026

Local candidate based on main446a9ba5, isolated room/map storage and headless Chrome on port4178. Opening fixture maps/forked-vale.json.

Run `RTS_QA_URL=http://127.0.0.1:4178 RTS_VEGETATION_REGION=ellionar RTS_VEGETATION_LIFECYCLE=1 RTS_VEGETATION_ATLAS=1 RTS_VEGETATION_UNDERSTORY=1 node scripts/qa-vegetation-browser.mjs`.

- [Companion proof](understory-proof.json):75 Sunbloom clumps across256 existing zero-seed cells, one mesh, both palm and hedge parents. Roots stay inside parent cells; partial harvest retains appearance, zero hides and reset restores exact matrices. Actual roll7.95e-15 degrees, below0.0001 threshold. Level2 raised ground contact matches groundHeight within1e-6. Repeat/different-seed checks pass across eight terrain bindings.
- [Close renderer](understory-renderer.png): worked, low and depleted palm states. Lapis-blue blossoms read clearly around warm palm roots. [Ordinary](ellionar-renderer-ordinary.png) and [strategic](ellionar-renderer-strategic.png) regional views; canopies obscure much of the understory at strategic distance.
- [Live harvest/reset](live-harvest-proof.json):worker0, palm cell768, worked3.900002, low1.900004, depleted0, reset full. [Tree camera/UV proof](lifecycle-proof.json), [fourteen-family fallback](fallback-proof.json), [eleven-base bindings](forest-slot-proof.json) and [lazy loading](opening-requests.json) passed. Sunbloom loads on garden-loam only. Final boot ready with no runtime/console errors.

Generated source unchanged, cropped WebP alpha exact. Release packaging initially hit ENOSPC; completed temporary release copies from this work were removed and packaging retried. Runtime bytes match the successful release; its temporary copy is removed after verification. JS syntax, docs and whitespace passed. No medicinal/resource/collision rules, planters, cultivated flower-bed placement, additional painted views, measured source projection, hosted or performance claim.
