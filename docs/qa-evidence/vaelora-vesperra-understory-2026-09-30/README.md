# Vesperra shade fern understory · 30 September 2026

Owner-run local candidate based on main d39ca878, isolated room/map storage, headless Chrome on port4178. Opening fixture explicitly uses maps/forked-vale.json.

Run `RTS_QA_URL=http://127.0.0.1:4178 RTS_VEGETATION_REGION=vesperra RTS_VEGETATION_LIFECYCLE=1 RTS_VEGETATION_ATLAS=1 RTS_VEGETATION_UNDERSTORY=1 node scripts/qa-vegetation-browser.mjs`.

- [Understory proof](understory-proof.json): 75 companions across 256 existing forest cells, one mesh, roots inside parent cells, unchanged through partial harvest, hidden at stock zero and exact matrix restoration on reset.
- [Close preview](understory-renderer.png): worked, low and depleted parent states with companion clearing. [Ordinary](vesperra-renderer-ordinary.png) and [strategic](vesperra-renderer-strategic.png) regional composition. Canopies obscure much of the understory at strategic distance.
- [Live worker harvesting/reset](live-harvest-proof.json), [four-state tree camera/UV proof](lifecycle-proof.json), [metadata-failure fallback](fallback-proof.json), [eleven-base regional bindings](forest-slot-proof.json), and [lazy opening requests](opening-requests.json). Final boot ready, no runtime/console errors.

Generated alpha preserved; runtime WebP byte-matches packed release. Release includes source PNG as well as runtime export. No extra resource or collision cells, additional painted perspectives, source projection measurement, hosted validation or large-match performance claim.
