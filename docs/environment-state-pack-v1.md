# Interactive environment state pack v1

Asset-only checkpoint for the existing oak and berry resource nodes, with two construction-ground samples. `assets/environment/frontier-interactive-v1/manifest.json` follows renderer asset-pack schema v1 and records each source/runtime file, pixel dimensions, world dimensions, pivot, stock range, batch key, SHA-256, and provenance. No renderer code or map/resource placement data changes are included.

## Resource state mapping

Select the stage from the integer stock percentage `floor(clamp(stock / startingStock, 0, 1) * 100)`. `startingStock` is the node's map-defined initial stock; the live snapshot provides the current stock. The map definition publicly includes resource placement and starting stock, while match-state snapshots include live stock only for nodes whose cells are visible to that team. A hidden node therefore retains its starting or last-seen art under fog until it becomes visible again, when the current stage is sent. The server keeps visible nodes at stock zero in snapshots, so the depleted stump or bare berry shrub can remain visible.

| Stage | Stock percent | Oak appearance | Berry appearance |
| --- | ---: | --- | --- |
| `full` | 67–100 | Full leafy crown | Full fruit clusters |
| `worked` | 34–66 | Reduced crown, more exposed branches | Fewer fruits, foliage retained |
| `low` | 1–33 | Sparse foliage islands | Very few fruits, opened canopy |
| `depleted` | 0 | Harvested stump and roots | Fruitless, sparse woody shrub |

The current game uses `task: "gathering"` for both resource types. When `cargoType` is unknown, keep a generic gathering cue. For known values, `wood` maps to an overhead chopping swing at oak, and `food` maps to a shorter forward pick at berry bushes. Building keeps a separate construction swing; moving or returning workers do not swing. Visible worker rows already carry `cargoType` (`food`/`wood`), so this mapping requires no gameplay-schema change. The environment pack supplies resource-node state images. The renderer pose checkpoint is merged in PR #72 (`30a386b`); play-zoom runtime review remains pending.

## Construction ground mapping

| Stage | Progress | Meaning |
| --- | --- | --- |
| `clear` | No active construction or progress ≥ 1 | No decal; the manifest row has null files and dimensions. |
| `earthwork` | 0 ≤ progress < 0.4 | Disturbed soil pad. |
| `foundation` | 0.4 ≤ progress < 1 | Stone foundation sample. |

The schema stores earthwork as `{ "min": 0, "max": 0.4 }` and foundation as `{ "min": 0.4, "max": 1 }`; the table defines the exclusive upper boundaries used at runtime.

## Dimensions and anchors

All sprites are RGBA cutouts. Resource sprites are camera-facing and use the shared bottom-center pivot `[0.5, 1.0]`; state variants in each family keep the same source canvas and world size. The construction decals also share their canvas, world size, and pivot.

| Family | Pixel canvas | World size | Pivot |
| --- | ---: | ---: | --- |
| Oak | 1226 × 1283 | 4.1 × 3.75 | `[0.5, 1.0]` |
| Berries | 1536 × 1024 | 2.55 × 1.56 | `[0.5, 1.0]` |
| Construction ground | 1254 × 1254 | 3.0 × 3.0 | `[0.5, 1.0]` |

The construction `clear` row is a no-image routing state and does not create a render batch.

## Budgets

- 10 environment state batches: four oak stages, four berry stages, and two visible construction states.
- 10 projected additional draw calls under the renderer contract; construction `clear` adds none.
- 3,798,100 compressed WebP bytes across the ten runtime textures.
- 83,884,376 bytes (79.998 MiB) estimated texture memory, calculated by the renderer validator as `ceil(width × height × 4 × 4/3)` per unique runtime WebP.
- 100,663,296 bytes (96 MiB) first-pack planning cap, leaving 16,778,920 bytes of headroom. This is not a whole-app GPU cap or a measured residency result; the renderer should measure actual residency and review readability at DPR 2 in the required in-game views: ordinary zoom 0.91 and strategic zoom 0.48, on meadow and cinder. Zoom 2.3 is optional close craft review and cannot replace either acceptance view. If measured residency exceeds this budget or either required view shows artifacts, compare 768 px and 512 px longest-edge runtime images before changing the current full-resolution set.

## Review status

An independent source-integrity audit on 2026-09-25 matched all 20 manifest file records to their on-disk SHA-256 hashes and decoded pixel dimensions. It confirmed all eight oak and berry resource rows cover the four stages, keep one world size per resource family, and use the shared bottom-center pivot `[0.5, 1.0]`. This verifies the source package record; it does not establish runtime readability, play-zoom evidence, or measured GPU residency.

On 2026-09-25, the Art Direction owner flagged a source-preview contrast risk: Meadow's high-frequency ground mottling fills much of the view, while Workers occupy only a few pixels at normal and strategic zooms. Check ground/army contrast in the authorized play-zoom frames; this observation is not runtime signoff and does not imply a v1 art or manifest change.

The source PNGs were reviewed individually. In the latest source-only palette pass, the art director found `berries-full.png`, `berries-depleted.png`, `construction-earthwork.png`, and `construction-foundation.png` consistent with the painterly frontier palette; this does not establish in-game readability. The art director also confirmed that saturated red/orange pixels protruding beyond the leafy oak alpha silhouette are edge contamination; subdued yellow-green highlights within the silhouette are intentional and should remain. The v1 files are unchanged. ImageGen cleanup candidates were rejected because they retained some fringe and changed the alpha mask by 311,512–702,622 pixels per stage, violating the exact-silhouette requirement. Any correction must preserve the source alpha mask and alter only protruding fringe colors, then pass edge review on black and light backgrounds before files, hashes, and manifest entries are updated. On 2026-09-25, the Art Director accepted `assets/environment/frontier-interactive-v1-candidates/oak-edge-candidate-01/` as a source-only cleanup proposal for runtime evaluation after black/light review. They confirmed the remaining warmer pixels at reviewed canopy, bark, and stump edges are intentional and must remain. The candidate is not in the v1 manifest or runtime path and does not count as in-game approval.

### First in-game pilot

The renderer already has a four-frame `renderer-environment-state-pilot` scenario on `main`. Use it first to confirm that the exact pack textures load and that live stock changes produce distinct art at ordinary and strategic zoom. It covers Meadow oak `worked` at 0.91, Meadow berries `worked` at 0.48, Cinder oak `depleted` at 0.91, and Cinder berries `low` at 0.48. Keep the active worker interaction visible where the scenario provides one.

The existing host/browser capture hold applies to this runtime observation. It does not block merging the versioned pack. The pilot should record the asset and renderer revisions, fetched runtime files, and observed state transitions once a capture slot is available.

### Expanded in-game review matrix

The full art review can follow the pilot; it is not a prerequisite for merging the approved source/runtime pack.

- Capture each of the 10 image-bearing states—four oak, four berry, and construction earthwork/foundation—on both Meadow and Cinder at zoom 0.91 and 0.48. This produces 40 standalone frames.
- `open-field` and `cinder-ridge` are the current production-map references for Meadow and Cinder. A dedicated review map may be used when needed for state setup or fog visibility, provided its explicit `terrainBase` resolves to the same `meadow` or `cinder` texture through `environmentTheme`.
- Store one full-resolution PNG per state/theme/zoom tuple at `docs/qa-evidence/environment-state-pack-v1/<theme>/zoom-<value>/<state>.png`; for example, `docs/qa-evidence/environment-state-pack-v1/meadow/zoom-0.91/oak-full.png`. Keep the team HUD label and minimap visible in each frame.
- Capture against a renderer build that implements all four stock stages. A full/empty-only renderer cannot produce valid `worked` or `low` frames. For a review node with `startingStock` 100, use visible live-stock values 100, 50, 20, and 0 as representative `full`, `worked`, `low`, and `depleted` cases.
- Each image-bearing environment frame must render the matching manifest-listed v1 `runtimeFile` for that resource or construction state. Scaling a full oak/berry sprite to imitate another stage, or substituting procedural construction geometry, is not evidence for this pack's art review.
- Verify that each target resource's live stock row is present in the observing player's match snapshot before saving its frame. Include the Meadow ground/army contrast check recorded above.
- Keep the active gatherer visible beside oak and berry nodes in non-depleted views where practical. Across the required zooms, show at least one wood interaction and one food interaction so the same matrix reviews chopping/gathering cues; depleted states need no active worker.
- `construction-clear` has null source/runtime files. Verify it with a runtime no-overlay assertion during the same capture run; it does not need an additional screenshot.
- Contact sheets, composite boards, source renders, and browser mockups do not establish runtime readability. Zoom 2.3 is optional close craft review and cannot substitute for either required view.

The in-game pilot and expanded review remain pending an owner-run capture. They require a working browser and GPU, but no numeric host-load clearance.

The separate `renderer-appearance-lod` scenario captures eight fog-safe unit-role views across two maps, two team viewers, and two zooms. Its review maps contain no resource nodes, so those images do not count toward this environment-state matrix.

The renderer loader, stock-state mapping, and four-frame pilot are already on `main` (PR #77). The loader verifies the ten manifest-listed WebP files and uses them for resource and construction states when the manifest is available. Until this pack is present, it falls back to the legacy single oak and berry textures. This handoff supplies the missing versioned pack: ten runtime WebPs, ten source PNGs, manifest, provenance, and prompts. The user approved the source art on 2026-09-26. Runtime readability still requires in-game observation; the owning lane can run a bounded appearance capture without quiet-host approval. Measured GPU residency belongs to the separate performance milestone.
