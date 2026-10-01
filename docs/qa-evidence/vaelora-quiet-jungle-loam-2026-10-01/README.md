# Quiet Vesperra jungle-loam comparison — 1 October 2026

Working branch `codex/vesperra-quiet-loam`, based on main `a222d105`.
Isolated local server at port 4178 configured with
`RTS_MAP=maps/vesperra-pale-clearings.json`, fresh room/map storage in `/tmp`.
No hosted or performance claim.

```sh
npm run validate:quiet-terrain
RTS_QA_URL=http://127.0.0.1:4178 RTS_QUIET_TERRAIN=jungle-loam node scripts/qa-quiet-meadow-browser.mjs
```

The original jungle tile contains bright/dark moss islands and brown channels.
The first generated edit retained broad ribbons and was rejected. The selected
second edit provides lower-relief moss and small indistinct litter flecks.
Selected PNG unchanged; opaque RGB LANCZOS1024 WebP quality86/method6.
Prompt chain and selected output are recorded in the source manifest.

[Original wide field](jungle-loam-128-cardinal.png) versus
[quiet wide field](vesperra-quiet-loam-128-cardinal.png) use identical 128-world-unit
span, renderer, seed42 and cardinal sampling. [Original close field](jungle-loam-32-cardinal.png)
and [quiet close field](vesperra-quiet-loam-32-cardinal.png) show 32-unit spans.
The directory also contains all four free-sampling comparisons. The quiet
source visibly reduces strong mottled patterning; fine grain and some repeat
structure remain. This is not an exact seamlessness certificate.

[Rotation/loading proof](rotation-proof.json) records eight deterministic
renders, one shader program each, ready Vesperra default boot loading quiet
loam, and ready legacy boot loading the original without requesting quiet loam.
Regional helper fixtures require quiet loam for Vesperra/unassigned jungle and
original jungle loam for Ru Lora fringe/interior and Underbough. No recorded
browser errors. [Default gameplay capture](runtime-quiet.png) and
[legacy gameplay capture](runtime-legacy.png) include normal fog and UI.

[Illustrative contrast measurements](render-contrast.json) use rendered sRGB
pixel luma, not linear light or a gameplay readability score. At the 128-unit
cardinal span, luma standard deviation falls from 4.376 to 2.273 and mean
horizontal adjacent-pixel difference from 2.815 to 1.662. Mean RGB changes from
(50.46,52.37,26.64) to (49.14,51.49,19.51); the quiet surface is slightly warmer.
The provenance/export validator passes four packs and rejects twenty corrupted
metadata fixtures. It does not certify visual seams or tileability.
