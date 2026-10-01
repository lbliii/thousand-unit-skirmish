# Quiet meadow source companion

Local candidate from main `41f52498`. Run an isolated local server and `RTS_QA_URL=http://127.0.0.1:4178 node scripts/qa-quiet-meadow-browser.mjs`.

[GPU proof](rotation-proof.json) records eight renders: original/companion meadow sources at 32/128 world-unit spans, with cardinal/free rotation. Seed 42, twelve-unit texture scale, wrapping and blending remain identical. Frames repeat exactly, one shader program compiles per view and console errors are empty. [Source comparison](source-comparison.png) shows cardinal wide fields. [Runtime capture](runtime-quiet.png) proves ready boot and an actual quiet-texture request through `meadowSurface=quiet`; this is an opening smoke, not a played match.

The first source was too speckled. A generation edit replaced fine flecks with softer color masses. Selected source PNG remains unchanged, with deterministic RGB LANCZOS 1024-square WebP export. Exact prompts and reference/source hashes are recorded. Served texture SHA matches the export; release source/runtime/loader/server bytes match and the selected temporary copy was removed.

[Source analysis](source-analysis.json) measures horizontal adjacent-pixel luminance differences on the 128-unit cardinal fields: original 1.895, companion 3.295. This metric is not a readability score; it shows that a softer-looking close source does not establish quieter strategic output. The companion is warmer and still mottled at large scale, so the default remains. No repetition-elimination, raw seamless-edge certification, performance or hosted claim. Existing regional mappings, gameplay and vegetation remain unchanged.
