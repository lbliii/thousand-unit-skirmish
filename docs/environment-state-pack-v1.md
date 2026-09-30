# Interactive environment states

[Documentation index](README.md) · [Renderer contract](renderer-state-contract.md)

The integrated `assets/environment/frontier-interactive-v1/manifest.json` describes
oak/berry depletion and construction-ground images. It uses renderer asset-pack v1.
The manifest owns exact file hashes, dimensions, bounds, pivots, ranges, and batches.

## Resource mapping

Use `floor(clamp(stock / startingStock, 0, 1) * 100)`. Initial stock comes from
the map; current stock comes only from visible snapshot rows. Hidden nodes retain
their last-known image. Visible stock zero remains a meaningful depleted feature.

| Stage | Integer percent | Oak | Berries |
| --- | ---: | --- | --- |
| `full` | 67–100 | Full crown | Full fruit clusters |
| `worked` | 34–66 | Reduced crown | Fewer fruits |
| `low` | 1–33 | Sparse foliage | Very few fruits |
| `depleted` | 0 | Stump and roots | Fruitless woody shrub |

Worker task drives a generic gather pose until cargo type is known; wood/food
then select chopping/picking. Moving/returning suppresses work swings. The pack
supplies resource art, not new simulation rules or regrowth.

## Construction ground

| Stage | Condition |
| --- | --- |
| `clear` | No incomplete building; no image/batch. |
| `earthwork` | Progress below 0.4. |
| `foundation` | Progress from 0.4 until completion. |

Upper bounds are exclusive. Authoritative completion removes the decal even if
a procedural roof appeared earlier.

## Registration and budget

| Family | Pixels | World width × height | Pivot |
| --- | --- | --- | --- |
| Oak | 1226 × 1283 | 4.1 × 3.75 | `[0.5,1.0]` |
| Berries | 1536 × 1024 | 2.55 × 1.56 | `[0.5,1.0]` |
| Construction | 1254 × 1254 | 3 × 3 | `[0.5,1.0]` |

All variants in a family share registration. Ten image-bearing states project
ten batches, 3,798,100 WebP bytes, and 83,884,376 decoded RGBA8 bytes including a
4/3 mip allowance. The planning cap is 96 MiB (100,663,296 bytes), leaving
16,778,920 bytes. This is a pack estimate, not measured GPU residency or an app cap.

```sh
node scripts/validate-visual-pack.mjs assets/environment/frontier-interactive-v1/manifest.json
```

## Evidence and next review

The [four-frame runtime pilot](qa-evidence/environment-state-pack-v1/pilot/README.md)
verified exact texture loads and visible stock-driven transitions on a named
build. The complete forty-frame matrix remains a separate review:

- Ten image-bearing states × Meadow/Cinder × zoom 0.91/0.48.
- Stock 100/50/20/0 for representative full/worked/low/depleted frames.
- Actual visible state rows and exact manifest-listed runtime textures.
- 1280 × 720 CSS viewport at DPR 2; saved PNGs 2560 × 1440 with HUD/minimap.
- A no-overlay assertion for `construction-clear`, without an extra image.
- Visible wood/food interactions where practical and a ground/army contrast check.

Use the adapter's preflight, pilot, and full capture scenarios described in the
[renderer contract](renderer-state-contract.md#appearance-checks). Contact sheets,
mockups, or scaled legacy sprites do not establish this pack's runtime appearance.
Ordinary appearance review needs no numeric host-load clearance; measured
residency and performance remain separate work.

## Source edge findings

Original v1 files retain their source alpha. Source review identified some oak
edge-color contamination but also intentional warm canopy/bark highlights.
Rejected cleanup generations changed too much of the silhouette. An accepted
source-only oak candidate remains outside the manifest/runtime path; adoption
needs black/light edge review and matching file/hash changes. Berry source
comparisons supported leaving v1 alpha unchanged. Neither finding substitutes
for the required game-zoom views.

## Regional asset production requirement · 30 September 2026

Regional vegetation must develop matching lifecycle art as well as its intact
silhouette. Before the Bellweather maple pilot, regional samples had one intact
view and used the shared generic stump only at zero stock. The maple, Sereward
palm, Pale Meridian conifer, Siltmouths tidal tree and Vesperra mistbark now
cover four stages; other regional families still need worked/low variants and matching
depleted art. See the [integrated pilot](environment-pack-v1.md#bellweather-maple-lifecycle--30-september-2026).

| Asset role | Required useful states |
| --- | --- |
| Harvestable tree | Intact, worked (cut/notched trunk), low stock, matching stump. Keep the standing crown plausible rather than shrinking the whole tree. |
| Harvestable fruit/shrub | Full yield, reduced yield, nearly empty, depleted plant. |
| Mineable resource | Intact deposit, worked surface, low deposit, exhausted remnant. |
| Decorative vegetation/rock | Intact variants; lifecycle states only when gameplay uses them. |

These are visual production requirements, not new harvest rules: a decorative
flowering hedge does not become a food node. Active chopping/picking feedback
belongs to worker animation and localized effects; stock stages persist when a
worker stops. Regrowth, seasonal changes and falling-tree animation need a
separate concrete gameplay or presentation outcome before expanding the matrix.

The renderer currently pans and zooms at one fixed oblique camera direction
(`cameraOffset` in `src/main.js`). One matching camera view per state is therefore
the first runtime target. Mirroring a sprite is not a second perspective.
Asymmetric props can benefit from alternate authored orientations even with this
camera. If camera rotation becomes a supported feature, evaluate four or eight
azimuth views at the same elevation using one consistent source asset, then
implement direction selection; the current renderer does not do that selection.

Use the [sprite-atlas contract](sprite-atlas-contract-v1.md) for new atlas packs:
state clips and optional direction IDs already fit its format. Keep a shared
logical canvas, ground pivot, scale and lighting across all states/directions.
Record trimmed rectangles relative to that canvas instead of independently
centering each crop, which would make state changes jump. Group pages by asset
family or region and load them on demand; do not require one world-sized sheet.
For planning, four stages at one view are four frames; eight views would make
32 before animation. Page size, padding and mip settings follow the existing
contract and measured residency rather than frame count alone.

The first regional lifecycle pilot should prove fixed registration, matching
depleted art, partial-stock selection, fog-preserved last-known states, reset and
game-zoom readability before multiplying the direction count across the library.
