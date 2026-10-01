# Sombral Mere Noctilune · 30 September 2026

Local candidate based on main `be528e3a`, isolated room/map storage and headless Chrome on port 4178. Run `RTS_QA_URL=http://127.0.0.1:4178 RTS_VEGETATION_REGION=sombral-mere RTS_VEGETATION_UNDERSTORY=1 RTS_VEGETATION_VARIATION=1 node scripts/qa-vegetation-browser.mjs`.

[Companion preview](understory-renderer.png) compares upright Lunewort and the rooted Noctilune vine beside worked Merebloom, followed by a cleared stump. [Understory proof](understory-proof.json) preserves 256 forest identities and 75 companions, split 36 Lunewort/39 vines in two batches. Partial harvest retains companions, depletion hides them, and reset restores exact matrices. Level-two contact passes; maximum screen roll is 7.95e-15 degrees.

The initial run exposed an existing Mere forward-offset root escaping its parent cell. The production placement now clamps companion roots to 0.45 units from cell center. Thirteen terrain-base seed fixtures verify these bounds for every generated companion, repeated-seed stability and changed-seed variation. The final run passes. Clamping also applies to other regional companions; source images and resource roots stay unchanged.

[Eleven-base bindings](forest-slot-proof.json) load Noctilune only on lunar soil. [Ordinary regional renderer](sombral-mere-renderer-ordinary.png) and [strategic renderer](sombral-mere-renderer-strategic.png) use the actual runtime camera. Opening Forked Vale boots ready with no runtime/console errors. This run directly exercises stock transitions, not live gathering or a played Mere match.

Manifest and exact decoded-alpha validators pass eighteen packs. Plant rejection fixtures, syntax and whitespace pass. Release PNG/WebP and loader/server bytes match; the exact temporary copy was removed. Built-in ImageGen source unchanged; one approximate painted view. No emission, independent gathering, additional directions, hosted or performance claim.
