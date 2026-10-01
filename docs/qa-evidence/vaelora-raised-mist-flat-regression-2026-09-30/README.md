# Flat mist regression · 30 September 2026

Run `RTS_QA_URL=http://127.0.0.1:4178 RTS_MIST_REGRESSION=1 node scripts/qa-regional-mist-browser.mjs` on the terrain-following candidate. Twelve local captures compare clear, explicit and automatic views on both original shipped maps with fog and units/HUD. [Runtime proof](runtime-proof.json) records both named maps ready with no runtime/console errors.

[Prior/candidate image comparison](flat-image-measurements.json) finds only a few pixel-rounding differences at ordinary zoom (each mean RGB difference below0.000007 on a0–255 scale). These are appearance checks, not visibility-rule or performance proofs. Raised geometry evidence is recorded separately.
