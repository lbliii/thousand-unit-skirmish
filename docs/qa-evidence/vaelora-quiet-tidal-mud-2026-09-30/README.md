# Quieter tidal mud

30 September 2026 local; base `dd3fe555`, branch `codex/siltmouths-quiet-mud` plus this checkpoint. Local isolated supervisor at port 4178, default map Siltmouths Reed Crossings.

```sh
RTS_QA_URL=http://127.0.0.1:4178 RTS_QUIET_TERRAIN=tidal-mud node scripts/qa-quiet-meadow-browser.mjs
```

The existing bounded quiet-meadow capture now also supports tidal-mud studies through the environment flag; default meadow behavior remains. [GPU proof](rotation-proof.json) covers original/candidate sources × 32/128-unit spans × cardinal/free patch rotations with identical seeds, texture repeat and blending. Eight stable rendered views and no recorded browser errors. The final runtime capture boots the actual Siltmouths map without a source-selection query and confirms the new image was requested. Runtime images are not performance evidence.

Compare [original strategic field](tidal-mud-128-cardinal.png) with [new strategic field](siltmouths-quiet-mud-128-cardinal.png). Broad swirl bands are visibly reduced, though fine mottling remains. [Image analysis](image-analysis.json) records RGB mean and absolute horizontal neighboring-pixel luminance difference: original 2.237 / new 1.640, with similar gray-olive mean colors. Formula and scope are recorded; this is not a gameplay readability metric or proof of no repetition.

Built-in ImageGen edited the existing source to remove long bands; original PNG output is saved unchanged, runtime is RGB LANCZOS 1024 square WebP quality86/method6. Exact source hashes/dimensions and prompt are in the source manifest. New source is the default for resolved tidal-mud materials; `tidalSurface=legacy` selects the original. No other material identity, sampler, terrain paint or gameplay rule changes. Tileability was requested, not raw-edge certified. Mirror/stochastic sampling handles boundaries.
