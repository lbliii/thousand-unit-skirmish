# Siltmouths marsh tuber · 30 September 2026

Local candidate from main `3c830913`, isolated room/map storage and headless Chrome on port 4178. Run `RTS_QA_URL=http://127.0.0.1:4178 RTS_VEGETATION_REGION=siltmouths RTS_VEGETATION_UNDERSTORY=1 RTS_VEGETATION_VARIATION=1 node scripts/qa-vegetation-browser.mjs`.

[Companion preview](understory-renderer.png) compares reed and broadleaf tuber companions beside worked tidal trees, followed by a cleared stump. [Understory proof](understory-proof.json) preserves 256 forest identities and 75 companions, split 36 reeds/39 tuber clumps in two batches. Partial harvest retains them; depletion hides them; reset restores exact matrices. Root bounds, level-two contact and maximum screen roll 7.95e-15 degrees pass. Thirteen terrain-base fixtures repeat seeds exactly and change placement/selection with changed seeds.

[Eleven-base bindings](forest-slot-proof.json) load the tuber image on tidal mud only. [Ordinary renderer](siltmouths-renderer-ordinary.png) and [strategic renderer](siltmouths-renderer-strategic.png) use the runtime camera. Opening Forked Vale boots ready without runtime/console errors. Stock transitions are direct renderer checks, not live crop gathering or a played Siltmouths match.

Manifest and exact decoded-alpha validators pass nineteen packs. Plant rejection and existing shoreline scenarios pass. Release PNG/WebP and loader/server bytes match; exact temporary copy removed. Syntax/docs/whitespace pass. Selected Built-in ImageGen PNG unchanged, one approximate painted view. Decorative use only: no crop yield, identity with private-story tubers, additional directions, hosted or performance claim.
