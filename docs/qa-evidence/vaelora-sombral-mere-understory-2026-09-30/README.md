# Sombral Mere Lunewort · 30 September 2026

Owner-run local candidate based on main e1c3a96d, isolated room/map storage, headless Chrome on port4178. Opening fixture explicitly uses maps/forked-vale.json.

Run `RTS_QA_URL=http://127.0.0.1:4178 RTS_VEGETATION_REGION=sombral-mere RTS_VEGETATION_LIFECYCLE=1 RTS_VEGETATION_ATLAS=1 RTS_VEGETATION_UNDERSTORY=1 node scripts/qa-vegetation-browser.mjs`.

- [Companion proof](understory-proof.json): 75 Lunewort clumps across256 existing forest cells in one mesh, roots within parent cells, unchanged through partial harvest, hidden at stock zero and exact matrix restoration on reset. Maximum actual companion screen roll7.95e-15 degrees, below0.0001 threshold. Level2 raised terrain roots match groundHeight within1e-6.
- [Close renderer](understory-renderer.png): worked, low and depleted parent states. Initial0.85 height hid too much foliage behind roots; final1.15 height and0.18 front offset expose flowers while retaining parent-cell containment. [Ordinary](sombral-mere-renderer-ordinary.png) and [strategic](sombral-mere-renderer-strategic.png) regional views. Canopies still obscure much of the understory at strategic distance.
- [Live harvest/reset](live-harvest-proof.json): worker0, cell768, worked3.933335, low1.933337, depleted0, reset full. [Tree camera/UV proof](lifecycle-proof.json), [fourteen-family metadata fallback](fallback-proof.json), [eleven-base bindings](forest-slot-proof.json) and [lazy opening requests](opening-requests.json) passed. Lunewort loads on lunar-soil only. Final boot ready with no runtime/console errors.

Generated PNG unchanged, cropped WebP alpha exact, runtime release byte match. JS syntax, documentation links and whitespace passed. No new resource/collision cells, medicinal mechanic, additional painted views, measured source projection, hosted validation or large-match performance claim. Runtime matrix roll is measured; painted source perspective remains approximate.
