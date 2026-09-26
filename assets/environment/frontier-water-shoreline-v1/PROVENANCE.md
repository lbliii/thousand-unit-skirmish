# Frontier water and shoreline v1 provenance

Original project material generated for Thousand Unit Skirmish with OpenAI ImageGen. No third-party images or reference images were used. Exact generation and edit prompts are preserved in [`PROMPTS.md`](./PROMPTS.md).

| Asset | Source output | Source SHA-256 | Runtime output | Runtime SHA-256 |
| --- | --- | --- | --- | --- |
| Water surface detail | `exec-af6d9e64-7821-4b38-bd60-2e8700196d04.png` | `bfe0a6a91aa9a09309919a7b8f72d9f8149e596ff02562ae19e6455e5c44816e` | `water.webp` | `7ad880af00d7f1fe5a707193e1710de7a88c34b0af488e1a7891d9c270e19ed8` |
| Shallows detail | `exec-f93e8ca3-6093-4171-ba05-7719142f3b1f.png` | `cf74ecc0241a7c1960c0bb4ad878efaa053d56452cb6751ff86be218e3dc479e` | `shallows.webp` | `699be7853b7f7db63743b8efa428eb6f468add1f78458952aba762be791d5587` |

Both sources are opaque RGB PNGs at 1254 × 1254. Runtime WebPs are 768 × 768, resized with LANCZOS and encoded with Pillow 12.3.0 at quality 86. WebGL sampling should use sRGB color space, mirrored repeat, trilinear mip filtering, and the manifest's world-cell repeat periods. The pale maps are detail modulators; the renderer's per-vertex colors remain the source of the final slate water, cool bank, and sandy bank colors.

The pair's RGBA-plus-full-mip planning estimate is 6,291,456 bytes. This is a texture-memory estimate, not measured GPU residency. The runtime UV/material contract is two groups in one batched geometry: group 0 water surface, group 1 shoreline bands. This asset pack does not change map water cells, passability, or collision.

The source images' opposite-edge mean absolute RGB deltas are 3.70/4.16 for water and 5.57/5.82 for shallows (horizontal/vertical, measured on 8-bit source edges). The renderer will use mirrored repeat to avoid hard repeat seams. Runtime appearance, zoom readability, and texture residency still require an in-game capture.
