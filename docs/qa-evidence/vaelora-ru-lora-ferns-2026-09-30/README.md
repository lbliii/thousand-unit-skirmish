# Ru’Lora stone fern companion · 30 September 2026

Owner-run working candidate based on main `cb15cadedbee7939a6b68dd4669150a0cc382d96`, isolated room/map storage and headless Chrome on local port 4178. Run: `RTS_QA_URL=http://127.0.0.1:4178 RTS_VEGETATION_REGION=ru-lora node scripts/qa-vegetation-browser.mjs`.

- [Ordinary renderer view](ru-lora-renderer-ordinary.png) and [strategic view](ru-lora-renderer-strategic.png) show the real camera direction and mixed salt-crust low stone scenery. Ferns have a lower spreading fan beside taller Fiendwood; a subset of existing boulders remains.
- [Eleven-base binding proof](forest-slot-proof.json) confirms Fiendwood, stone fern and retained boulders on salt-crust; no Ru’Lora sprites on other bases. All forest slot sets still contain the same 36 cells. Collision remains defined by unchanged authored stone obstacles, not image bounds.
- [Opening requests](opening-requests.json) confirm no unused regional sprite images eagerly loaded by Forked Vale. Game boot ready, runtime error empty, console errors empty.
- [Opening match view](forked-vale-ordinary.png), [strategic match view](forked-vale-strategic.png) and [forest ground proof](forest-cover-proof.json) preserve the existing local regression floor.

Manifest file hashes/dimensions passed. Cropped/resized runtime alpha matches decoded WebP alpha exactly. Disposable Railway packaging includes the fern WebP byte-for-byte. JS syntax, docs and whitespace checks passed. One intact scenery view; no harvesting animation, measured source-camera calibration, hosted deployment, fog or large-match performance claim.
