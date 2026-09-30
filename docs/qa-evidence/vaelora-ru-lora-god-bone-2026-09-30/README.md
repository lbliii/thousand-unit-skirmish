# Ru’Lora god-bone scenery · 30 September 2026

Local candidate based on main75f01a7f. Isolated room/map storage and headless Chrome on port4178; opening fixture maps/forked-vale.json. Run `RTS_QA_URL=http://127.0.0.1:4178 RTS_VEGETATION_REGION=ru-lora node scripts/qa-vegetation-browser.mjs`.

The [existing64×64 interior study](../vaelora-ru-lora-interior-2026-09-30/ru-lora-interior-study.json) was imported through Map Studio and Save & Play. Remaining low boulder-cluster placements now use ivory bone fragments among the existing petrified vegetation.

- [Close Save & Play](interior-save-play-ordinary.png) and [whole map](interior-save-play-strategic.png):ivory fragments break up charcoal/violet plant groups, preserving the central corridor. [Ordinary renderer](ru-lora-renderer-ordinary.png) and [strategic renderer](ru-lora-renderer-strategic.png) show the fixed-camera material mix.
- [Placement proof](stone-placement-proof.json):26 identical positions between regional and generic review maps at each obstacle elevation0.72/1.12/2. Level2 terrain contact passes1e-6 tolerance; maximum screen-roll component0 in all six fixtures. This proves runtime orientation, not exact painted projection. Images finish loading before checking bindings. Bone is present only in regional low scenery; review map has no Ru’Lora props; tall ridge/cliff texture lists match the generic bindings exactly.
- [Eleven-base proof](forest-slot-proof.json):all four Ru’Lora scenery images on salt-crust, none on other bases; all36 forest identities retained. [Study requests](study-requests.json) confirm regional loading; [opening requests](opening-requests.json) show no unused regional images loaded eagerly. Final map title correct, boot ready, runtime error empty and console errors empty.

Selected generated PNG unchanged; cropped/resized WebP alpha exact. Source/runtime/manifest and loader bytes match the release pack; completed temporary copy removed. JS syntax, documentation links and whitespace pass. One fixed-oblique view, approximate source projection. Bone is scenery under existing stone collision, with no mining/yield or anatomy canon. No hosted, lifecycle animation or performance claim.
