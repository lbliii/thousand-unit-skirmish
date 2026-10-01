# Quieter Pale Meridian snow

30 September 2026 local; source base `efb49bed`, branch `codex/meridian-quiet-snow` plus this checkpoint. Isolated supervisor at port 4178, default map Pale Meridian Observation Road.

```sh
RTS_QA_URL=http://127.0.0.1:4178 RTS_QUIET_TERRAIN=snow node scripts/qa-quiet-meadow-browser.mjs
```

[GPU proof](rotation-proof.json) records eight stable views with no recorded browser errors: original/new × 32/128-unit spans × cardinal/free rotation, using identical seed, repeat and blending. Compare [original strategic snow](snow-128-cardinal.png) with [new strategic snow](pale-meridian-quiet-snow-128-cardinal.png). Long wave ridges reduce, but fine pebbled mottling remains. This is visual owner review, not a gameplay readability or performance measurement.

The final runtime check opens Observation Road without a source-selection query, boots ready and confirms the new snow image request; [runtime capture](runtime-quiet.png). Ice and vegetation remain separate. Original texture is available through `snowSurface=legacy`. Source PNG unchanged; RGB LANCZOS1024 WebP quality86/method6, hashes/dimensions in manifest, exact Built-in ImageGen edit prompt saved. Seamlessness requested, not raw-edge certified. No new harvest artwork or resource rule.
