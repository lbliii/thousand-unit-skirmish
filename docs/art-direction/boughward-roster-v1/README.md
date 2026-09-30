# Boughward rival roster first pass

30 September 2026. The user authorized selecting a rival civilization and generating the full existing unit roster. Boughward develops the earlier orc/goblin woodland exploration: burgundy, copper, moss, leather and pale bark. The selected direction reference is preserved here; it is concept provenance rather than gameplay evidence. Built-in OpenAI ImageGen produced each role sheet and cleanup edits; exact prompts are in `prompts.json`.

| Gameplay type | Presentation |
| --- | --- |
| Worker | Stocky orc, woven pack and axe; food/wood gathering, build, repair, attack and defeat poses |
| Infantry | Orc short spear and six-sided timber shield |
| Spearman | Orc long two-handed spear |
| Archer | Smaller goblin bow and quiver |
| Scout | Goblin riding a grey woodland wolf |
| Rider | Orc spear/shield on a boar |
| Siege Engine | Copper-bound bark-timber ballista |

The normal game assigns Human art to team zero and Boughward art to team one. Both still use the existing Frontier gameplay definitions and balance. This is a civilization presentation association, not a civilization chooser or an asymmetric ruleset. Explicit legacy preview flags remain separate.

Each role has distinct static idle, walk, attack and defeat images, reused across all eight headings. Worker also has resource-specific gathering, building and repair. This follows the user's direction to prioritize initial graphics even when animation is approximate. No directional fidelity or animation completion claim is made. Foot body scale follows the approved 232-pixel/1.2161865234375-world-unit Human calibration; goblins are smaller. Mount size, siege footprint and ground anchors remain provisional until live review. Team masks remain neutral; renderer-owned selection, health and other ownership cues are preserved.

`scripts/build-boughward-roster.py ROLE` reproduces extraction, scaling, manifests and compact atlases. Worker uses eight connected silhouettes; other military foot and mounted roles use four. Archer uses cells with small isolated fragments removed. Siege retains full cells to preserve disconnected wreck parts. Background cleanup uses built-in image generation; packing only crops and normalizes existing alpha. Source RGB under invisible alpha is zeroed. No Meshy pipeline was used.

Fresh live gameplay verification is unavailable in this task because an earlier browser-policy rejection blocked the capture. No alternate browser workaround was used. Atlas validation, action tests, HTTP serving and release packaging are separate evidence and do not prove live appearance.
