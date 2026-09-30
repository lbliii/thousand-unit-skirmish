# Veyrholds ridgegrass · 30 September 2026

Local candidate based on main b8b41cf7, isolated room/map storage and headless Chrome on port4178. Opening fixture maps/forked-vale.json.

Run `RTS_QA_URL=http://127.0.0.1:4178 RTS_VEGETATION_REGION=veyrholds RTS_VEGETATION_LIFECYCLE=1 RTS_VEGETATION_ATLAS=1 RTS_VEGETATION_UNDERSTORY=1 node scripts/qa-vegetation-browser.mjs`.

- [Companion proof](understory-proof.json):75 grass tufts across256 existing zero-seed forest cells in one mesh. Parents include highpine and the retained generic forest mix. Roots remain inside cells; partial harvest retains appearance, zero stock hides and reset exactly restores matrices. Actual maximum roll7.95e-15 degrees, below0.0001 threshold. Raised level2 contact matches groundHeight within1e-6. Seed93007/93008/93007 checks cover seven terrain bindings, proving repeat stability and changed-seed distribution.
- [Close renderer](understory-renderer.png): worked, low and depleted highpine states. Grass remains a low straw-colored accent against slate ground. [Ordinary](veyrholds-renderer-ordinary.png) and [strategic](veyrholds-renderer-strategic.png) regional views. Canopies obscure much of the understory at strategic distance.
- [Live harvest/reset](live-harvest-proof.json):worker0, highpine cell810, worked3.900002, low1.900004, depleted0 and reset full. [Tree camera/UV proof](lifecycle-proof.json), [fourteen-family fallback](fallback-proof.json), [eleven-base bindings](forest-slot-proof.json) and [lazy loading](opening-requests.json) passed. Ridgegrass loads on scree only. Final boot ready with no runtime/console errors.

Original generated PNG unchanged, cropped WebP alpha exact, release runtime byte match. JS syntax, docs and whitespace passed. No crop/resource/collision changes, exposed hillside placement, wind animation, additional painted viewpoints, measured source projection, hosted or large-match performance claim.
