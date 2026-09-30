# Human mounted and siege first pass

The 30 September user direction prioritizes initial graphics for every moment even when animation sequences are approximate. This extends the default Human roster to Scout, Rider and Siege Engine. Each has four distinct generated static poses: idle, walk, attack and defeat, reused across eight headings. These are deliberately initial action graphics, not directional animations.

Scout uses the Vaelora Human cream/sage/leather clothing on a light chestnut horse with a short sword. Rider has a steel cap, spear and cream shield on a horse. Siege Engine is a timber ballista with sage trim and ivory bindings. Built-in OpenAI ImageGen produced the sources; the spearman sheet is the visual reference and the Scout sheet is the Rider reference. No Meshy used.

Prompts requested painterly high-fidelity elevated isometric cutouts, restrained palette, upper-left light, consistent identity and scale, four complete isolated poses in a 2x2 grid, alpha transparency, no scenery, text or ground shadows. Scout: idle, walking, mounted sword slash, slumped defeat. Rider: idle, walking, spear thrust, slumped defeat. Siege: loaded idle, moving, firing bolt, collapsed wreck with detached bow and debris.

The raw source RGB includes backdrop color under transparent pixels. Packing discards alpha below the runtime threshold and zeros invisible RGB. Connected silhouette extraction preserves Scout/Rider weapons beyond nominal cells. Explicit siege cell bounds preserve detached wreck pieces. The reproducible builder is `scripts/build-human-mounted-preview.py ROLE`. Uniform source-to-runtime scaling is provisional for mounted body size and siege footprint; live appearance must verify it.

Runtime packs supply all available registered roles after this slice. Neutral team masks, static motion, single facing, approximate roots, and any source anatomy errors remain polish. Existing selection/health/cargo cues remain renderer-owned. Atlas and clip checks prove loadable coverage, not live visual correctness. The browser capture remains blocked by policy from the prior turn; no workaround was used.

Validation: nine sprite checks, three new atlas validators, syntax, documentation links and all nine new runtime HTTP files pass (200 responses). Disposable release package checked separately.
