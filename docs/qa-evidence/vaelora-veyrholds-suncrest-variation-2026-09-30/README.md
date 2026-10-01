# Veyrholds Suncrest · 30 September 2026

Local candidate from main `7a7deb68`, isolated room/map storage and headless Chrome on port 4178. Run `RTS_QA_URL=http://127.0.0.1:4178 RTS_VEGETATION_REGION=veyrholds RTS_VEGETATION_UNDERSTORY=1 RTS_VEGETATION_VARIATION=1 node scripts/qa-vegetation-browser.mjs`.

[Companion preview](understory-renderer.png) compares ridgegrass and Suncrest beside worked/low Highpine, followed by a cleared stump. [Understory proof](understory-proof.json) preserves 256 forest identities and 75 companions, split 36 grass/39 flowers in two batches. Partial harvest retains them; depletion hides them; reset restores exact matrices. Parent-cell bounds, level-two contact and maximum screen roll 7.95e-15 degrees pass. Thirteen terrain-base fixtures repeat seeds exactly and change placement/selection with changed seeds, exercising the simplified alternate-plant mapping.

[Eleven-base bindings](forest-slot-proof.json) load Suncrest on scree only. [Ordinary renderer](veyrholds-renderer-ordinary.png) and [strategic renderer](veyrholds-renderer-strategic.png) use the runtime camera. Opening Forked Vale boots ready without runtime/console errors. These are renderer/stock fixtures, not a played Veyrholds match or live flower gathering.

Manifest and exact decoded-alpha validators pass twenty packs. Plant rejection fixtures pass. Release PNG/WebP and loader/server bytes match; exact temporary copy removed. Syntax/docs/whitespace pass. Selected Built-in ImageGen PNG unchanged, one approximate painted view. Decorative specimen only: no crop or medicinal yield, additional directions, hosted or performance claim.
