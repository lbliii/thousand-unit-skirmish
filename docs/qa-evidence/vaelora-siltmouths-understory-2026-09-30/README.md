# Siltmouths silver reed understory · 30 September 2026

Owner-run local candidate based on main f39a644, isolated room/map storage and headless Chrome on port4178. Opening fixture explicitly uses maps/forked-vale.json.

Run `RTS_QA_URL=http://127.0.0.1:4178 RTS_VEGETATION_REGION=siltmouths RTS_VEGETATION_LIFECYCLE=1 RTS_VEGETATION_ATLAS=1 RTS_VEGETATION_UNDERSTORY=1 node scripts/qa-vegetation-browser.mjs`.

- [Companion proof](understory-proof.json): 75 reed clumps across 256 existing forest cells, one mesh, roots inside parent cells, retained through partial harvest, hidden at zero stock and exact matrix restoration on reset.
- [Close renderer](understory-renderer.png): worked, low and depleted parent states. Reeds are deliberately smaller than tree roots/crowns; seed heads appear pale against wet mud. [Ordinary](siltmouths-renderer-ordinary.png) and [strategic](siltmouths-renderer-strategic.png) views show regional composition. Canopies obscure much of the understory at strategic distance.
- [Live harvesting/reset](live-harvest-proof.json): worker0, cell768, worked3.933335, low1.933337, depleted0, reset full. [Tree camera/UV proof](lifecycle-proof.json), [fourteen-family metadata fallback](fallback-proof.json), [eleven-base bindings](forest-slot-proof.json) and [lazy opening requests](opening-requests.json) passed. Final boot ready, no runtime or console errors.

Original PNG unchanged; generated alpha preserved in crop/encode. Runtime WebP byte-matches packed release. JS syntax, documentation links and whitespace passed. This proves local art integration, not hosted readiness, shoreline-wide reeds, extra painted perspectives, measured source projection or large-match performance. No new collision/resource cells.
