# Terrain-following mist · 30 September 2026

Local candidate from main `a89d0018`, isolated room/map storage and headless Chrome on port 4178. Run `RTS_QA_URL=http://127.0.0.1:4178 RTS_MIST_RAISED=1 node scripts/qa-regional-mist-browser.mjs`.

Local Vesperra and Sombral Mere copies use editor rolling-ground seed93080 and fog disabled for scenery review. The original shipped maps are unchanged. Twelve clear/explicit/automatic screenshots pass named import/save/play with no runtime errors. [Geometry proof](geometry-proof.json) preserves all terrain positions and indices: 27,648 vertices/13,824 triangles on Vesperra, 23,040/11,520 on Mere. World UV error is below3e-8, with a0.04 ground lift and unchanged source map data. [Vesperra view](vesperra-pale-clearings-auto-strategic.png) and [Mere view](sombral-mere-shore-gardens-auto-strategic.png) show generated slopes beside protected pads/roads.

An initial hand-painted fixture was rejected because it disconnected a resource; final fixtures use the existing generator and pass import. Generator-protected water remains flat, so live excluded-water count is0. Separate Node atmosphere fixtures prove raised-water mask exclusion, source geometry cloning, triangle preservation, UV immutability, lift and disposal. This does not claim an elevated-water appearance fix.

[Flat regression](../vaelora-raised-mist-flat-regression-2026-09-30/README.md) preserves clear/explicit/default behavior and fog. Syntax, documentation, whitespace, existing atmosphere scenario and release runtime/module bytes pass; exact temporary release copy removed. One decorative ground surface, not volumetric mist. No hosted, played-match or performance claim; intrinsic cliff appearance was not separately captured.
