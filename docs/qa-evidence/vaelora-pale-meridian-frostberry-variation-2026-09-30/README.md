# Pale Meridian frostberry · 30 September 2026

Local candidate based on main `4ff59546`, isolated room/map storage and headless Chrome on port 4178. Run `RTS_QA_URL=http://127.0.0.1:4178 RTS_VEGETATION_REGION=pale-meridian RTS_VEGETATION_UNDERSTORY=1 RTS_VEGETATION_VARIATION=1 node scripts/qa-vegetation-browser.mjs`.

[Companion preview](understory-renderer.png) shows silver moss and frostberry beside worked conifers, followed by a cleared stump. [Understory proof](understory-proof.json) preserves 256 forest identities and 75 companions, split 36 moss/39 frostberry in two batches. Partial harvest retains companions; depletion hides them; reset restores exact matrices. Roots remain in parent cells, level-two ground contact passes and maximum screen roll is 7.95e-15 degrees. Thirteen terrain-base fixtures repeat seeds exactly and change placement/selection with changed seeds.

[Eleven-base bindings](forest-slot-proof.json) load frostberry on snow/ice only. [Ordinary regional renderer](pale-meridian-renderer-ordinary.png) and [strategic renderer](pale-meridian-renderer-strategic.png) use the actual runtime camera. Opening Forked Vale boots ready with no runtime/console errors. These are isolated renderer/stock checks, not a played Pale Meridian match or live berry harvest.

Manifest and decoded-alpha validators pass seventeen packs, including exact source-crop alpha. Plant rejection fixtures, syntax and whitespace pass. Release selected PNG/WebP and loader/server bytes match; the exact temporary copy was removed.

Built-in ImageGen, selected source unchanged after the root-contact edit. Decorative specimen from the approved ecology key, one approximate painted view. No food yield, independent gathering, additional directions, hosted or performance claim.
