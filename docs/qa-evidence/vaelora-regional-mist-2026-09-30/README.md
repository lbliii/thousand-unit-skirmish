# Regional ground mist · 30 September 2026

Local candidate from main `071f3f62`, isolated room/map storage and headless Chrome on port 4178. Run `RTS_QA_URL=http://127.0.0.1:4178 node scripts/qa-regional-mist-browser.mjs`.

Twelve screenshots compare clear, explicit mist and automatic defaults on shipped Vesperra Pale Clearings and Sombral Mere Shore Gardens at strategic and ordinary gameplay zoom. [Runtime proof](runtime-proof.json) verifies each named map loaded ready, records distinct tint/opacity/pocket profiles, and reports no runtime or console errors. [Paired measurements](paired-image-measurements.json) find automatic and explicit fixed-time ordinary captures identical in all RGB pixels on both maps.

[Sombral mist](sombral-mere-shore-gardens-auto-ordinary.png) and [clear](sombral-mere-shore-gardens-clear-ordinary.png), plus [Vesperra mist](vesperra-pale-clearings-auto-ordinary.png) and [clear](vesperra-pale-clearings-clear-ordinary.png), show visible units, selection outlines, resource markers and bare dirt routes. Unexplored ground remains covered by the existing fog overlay; source inspection confirms its render order12 follows ground mist order-1 with depth testing disabled. This is a visual/source observation, not a visibility-rule match test.

`node scripts/terrain-atmosphere-scenario.mjs` passes wet coverage, painted dry clearings, immutable map data, seeded variation/repeatability, separate restrained regional profiles, default/override/review policy, foreground order, fixed-time capture and disposal ownership. Existing Node CI runs this scenario. Syntax/docs/whitespace and release runtime/module byte checks pass; exact temporary release copy removed.

Raised maps omit the flat plane. Clear override remains available. This is one decorative animated ground plane, not volumetric/weather simulation; it adds no resource, collision, visibility or supernatural rule. Captures are local opening views without a played match; no hosted or performance claim.
