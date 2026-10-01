# Underbough fungus variation · 30 September 2026

Local candidate based on main `e4fb6f856`, isolated room/map storage and headless Chrome on port 4178. Run `RTS_QA_URL=http://127.0.0.1:4178 RTS_VEGETATION_REGION=underbough RTS_VEGETATION_UNDERSTORY=1 RTS_VEGETATION_VARIATION=1 node scripts/qa-vegetation-browser.mjs`.

[Companion preview](understory-renderer.png) shows the broad shelf clump and compact upright cluster beside worked trees, followed by a cleared stump. [Understory proof](understory-proof.json) preserves 256 forest identities and 75 companions, split 36 original/39 alternate in two batches. Partial harvest retains companions, depletion hides them and reset restores exact matrices. Roots stay inside parent cells, raised ground contact passes, and maximum screen roll is 7.95e-15 degrees. Both Copperleaf and bramble carry companions. Thirteen terrain-base fixtures repeat seed results exactly and change placement/selection with different seeds.

[Eleven-base bindings](forest-slot-proof.json) load both fungus images on forest-floor only. [Ordinary regional renderer](underbough-renderer-ordinary.png) and [strategic renderer](underbough-renderer-strategic.png) use the actual runtime camera. Opening Forked Vale boots ready with no runtime/console errors; it is a generic opening regression, not proof of a shipped Underbough match. This run exercises stock transitions directly, not live worker harvesting.

Both asset validators pass sixteen packs, with exact decoded alpha for every source crop. Plant rejection fixtures, syntax and whitespace checks pass. Release PNG/WebP and loader bytes match the workspace; the exact temporary release copy was removed.

Selected PNG unchanged, one approximate painted view per silhouette. Decorative companions use existing forest clearing: no separate harvesting rule, resource yield, additional direction, hosted or performance claim.
