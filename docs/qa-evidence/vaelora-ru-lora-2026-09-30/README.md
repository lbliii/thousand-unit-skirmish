# Ru’Lora Fiendwood appearance · 30 September 2026

Owner-run local server on port 4178 with isolated room/map storage, headless Chrome and current game renderer. Run: `RTS_QA_URL=http://127.0.0.1:4178 RTS_VEGETATION_REGION=ru-lora node scripts/qa-vegetation-browser.mjs`.

- [Ordinary view](ru-lora-renderer-ordinary.png) and [strategic view](ru-lora-renderer-strategic.png): salt-crust stone obstacle study rendered with the actual camera direction. Fiendwood reads as pale violet stone foliage beside retained boulder clusters.
- [Binding proof](forest-slot-proof.json): salt-crust low stone outcrops select Fiendwood; the other ten terrain bases do not. Forest slot count remains 36 per base with matching cell identities. Salt-crust authored forest remains legacy woodland, explicitly outside this petrified scenery increment.
- [Opening requests](opening-requests.json): ordinary Forked Vale boot does not eagerly load unused regional sprites. Game boot ready, runtime error empty, console errors empty.
- [Ordinary match](forked-vale-ordinary.png) and [strategic match](forked-vale-strategic.png) provide opening regression views.

Source/runtime hashes, crop, dimensions and exact alpha were checked; the disposable Railway release includes the runtime WebP byte-for-byte. JS syntax, documentation links and whitespace checks passed. These are local appearance checks, not staging, both-seat fog, performance or measured source-camera calibration evidence. Single intact scenery view; no harvest lifecycle is claimed.
