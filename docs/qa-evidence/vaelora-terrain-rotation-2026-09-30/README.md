# Terrain patch rotation study

Local candidate from main `21120983`. Run an isolated server, then `RTS_QA_URL=http://127.0.0.1:4178 node scripts/qa-terrain-rotation-browser.mjs`.

[Proof](rotation-proof.json) records sixteen actual GPU renders: meadow, sand, jungle-loam and forest-floor at 32/128 world-unit spans, each with cardinal/free rotation. All use seed 42, the same selected texture at twelve-unit scale, mirror wrapping, triangle blending and broad value field. Each pair changes only patch angle selection. Every rendered frame repeats exactly and compiles one shader program without console errors. [Meadow comparison](meadow-comparison.png) shows the wide-scale pair; individual PNGs retain the full captures. These are top-down flat fields, not gameplay-camera screenshots.

[Runtime free-mode capture](runtime-free.png) checks the actual game loads with the optional mode and reaches ready without an error. This is an opening smoke, not a played match. Default cardinal rotation is retained. Visual inspection finds altered alignment but still busy wide-scale meadow/sand strokes; rotation alone is insufficient evidence to replace the default or claim the reported pattern resolved. Quieter source companions are the next art experiment. No new texture generation, palette/lore change, performance measurement or elimination claim.
