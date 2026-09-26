# Environment state play-zoom pilot

Captured 2026-09-26 with the `renderer-environment-state-pilot` scenario against game source `c9e4791` and environment pack `1.0.0`. Pack `1.0.1` later corrected only construction orientation/pivot metadata; all ten runtime WebP files retain the same SHA-256 hashes and decoded dimensions. Current main when this note was updated is `89c9c37`. The screenshots document the captured build and are not claims of a pixel-identical full scene on current main.

The capture-only runner was updated in the accompanying change to place detailed state records in a sidecar, keeping the `game_dev.capture.v1` manifest within the current schema. The capture uses the normal resource-stock path and the manifest-listed runtime textures; it does not override stock or substitute renderer-only art.

The four-frame run is `run_1790444012393_a432a5abc6764808a77bf549d7947a6e`. `game-dev capture verify` reported `status: completed`, `hashesVerified: true`, `closedArtifactRosterVerified: true`, `captureContractValidated: true`, and `rasterBytesDecoded: true`. Its run-manifest SHA-256 is `378b6fc7f42af96e994e0b24284f38e3336ee83f39f48b37b986bf9b63fa6850`.

The scenario loaded and checked all ten manifest-listed runtime WebPs in both player clients. Both seats' visible stock rows and states were verified under fog; the screenshots show the Azure view. The workers changed stock through normal gather orders from 100, rather than a renderer-only stock override.

| Preview | Azure stock / stage | Ember stock / stage | Image |
| --- | ---: | ---: | --- |
| Meadow oak, zoom 0.91 | 54.17 / worked | 54.97 / worked | [oak-worked.png](meadow/zoom-0.91/oak-worked.png) |
| Meadow berries, zoom 0.48 | 54.60 / worked | 53.80 / worked | [berries-worked.png](meadow/zoom-0.48/berries-worked.png) |
| Cinder oak, zoom 0.91 | 0 / depleted | 0 / depleted | [oak-depleted.png](cinder/zoom-0.91/oak-depleted.png) |
| Cinder berries, zoom 0.48 | 24.63 / low | 23.83 / low | [berries-low.png](cinder/zoom-0.48/berries-low.png) |

Each PNG is 2560 × 1440 (1280 × 720 CSS viewport at DPR 2) and retains the HUD and minimap. The run recorded no performance measurements and does not establish measured GPU residency. This is a four-frame preview, not the complete 40-frame art review. In this owner visual pass, the resource props read at 0.91; at 0.48 they are small in the full battlefield view, so their strategic-zoom scale still deserves player review.
