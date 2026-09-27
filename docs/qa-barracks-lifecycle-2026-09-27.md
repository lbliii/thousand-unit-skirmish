# Barracks sprite lifecycle — 27 September 2026

## Observed failure

Baseline: `20d076b`, with the unrelated client disconnect fix `e18ee30`.
Map: Forked Vale, Azure, local browser at 1280 × 720.

Selected idle workers, opened Build, placed a Barracks on clear ground near the
Town Center, and waited for construction. Wood fell from 250 to 75 and the HUD
reported `BARRACKS COMPLETE · TRAIN INFANTRY`, but the image still showed the
foundation. The browser reported no console warnings or errors.

`updateBarracksVisual` updated procedural fallback geometry but never passed
new building state to the attached sprite controller. Archery Range already
performed this update. Barracks consequently retained whichever frame loaded
when first seen, including after later damage.

## Fix and regression

Pass each authoritative Barracks update to its sprite controller. Existing
construction/health thresholds, team variants, async load protection, fallback,
and fog ownership stay in the shared building sprite module.

The regression in `scripts/building-sprites.test.mjs` executes the actual client
update function with the real sprite controller. It advances both teams from
foundation through frame and completion to damaged and critical health. It
failed at the first foundation-to-frame transition before the fix, and passes
after it. The existing loader/fog tests and production cue scenario also pass.

This corrects a runtime state handoff; no new artwork or balance change is involved.

## Browser replay

Replayed at code `15faa0c` in the in-app browser, Forked Vale, Azure,
1280 × 720: Home base, zoom in, Idle workers → Build → Barracks → clear site.
After the completion message, the building visibly had its complete timber walls,
roof, and blue team trim. The prior foundation-only appearance was gone. Damage
states and Ember are covered by the regression, not this browser observation.
