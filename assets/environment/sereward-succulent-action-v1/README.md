# Sereward succulent harvesting source

Partially harvested source sample, 1 October 2026. Built-in ImageGen edited the selected [full succulent](../frontier-v1/sereward-succulent.png), retaining its living turquoise rosette and coral edges while exposing pale cut leaf faces. Selected generated PNG is unchanged; [manifest](manifest.json) records hashes, dimensions and alpha. [Exact prompt](PROMPTS.json).

This begins authored plant action states requested by the user. It is not integrated into the game and adds no water resource, gathering command or parent-wood depletion mapping. Source composition is approximate; exact shared-canvas pivot/contact registration, game-scale readability, game-scale low/depleted readability and additional viewpoints still need verification before a runtime atlas can claim completion. Do not substitute this plant-harvest pose for ordinary forest clearing.

[Four-state preview](registration-preview.png) uses the existing full source and selected worked, low and depleted sources through the identical `[160,40,1385,984]` crop, resized to 1024×789 per frame. [Atlas](states-atlas.webp) is 4096×789, with shared world size 0.97338×0.75 and bottom-center card pivot. [Export proof](export-proof.json) verifies source/export hashes and exact alpha after decoding both individual WebPs and atlas frames. Preview uses neutral ground compositing only, with no source repaint.

Full/ worked alpha bottoms are 984 / 973 on the original canvas. The 11-pixel difference reflects changed silhouette extremities; anatomical root-anchor alignment remains approximate. Do not independently crop or scale states. Low/depleted were added on 1 October; extra directions remain absent.

The four authored poses are full, worked (cut outer leaves), low (three small central leaves) and depleted (short cut bases and a root crown). [Low/depleted prompts](LOW-DEPLETED-PROMPTS.json) record Built-in ImageGen edits and selected outputs. Each uses the original canvas and common crop; no per-state enlargement or repaint. Alpha-bottom measurements for all four are recorded in the manifest. Their changes are silhouette observations, not verified anatomical root anchors. Runtime gameplay mapping remains absent.

Repeatable production commands (Python/Pillow):

```sh
python3 scripts/check-succulent-action-atlas.py
python3 scripts/build-succulent-action-atlas.py --write
```

The builder verifies selected sources before exporting all four through the reviewed common crop. Without `--write` it only checks the existing pack. The checker reads current hashes, canvas sizes, state order, frame rectangles, world registration and decoded alpha; it explicitly reports anatomical root certification and runtime integration as false.

## Fixed-camera review

Run `node scripts/preview-succulent-actions.mjs` and open
`http://127.0.0.1:4186`. This local-only Three.js review imports the renderer's
camera direction, uses its bottom-pivoted plane construction and material
settings, and shows all four atlas frames at the same scale. Cyan ground rings
mark the unchanged pivots; buttons compare one state at all four positions.
It serves only the explicitly listed review dependencies, not the game.

The [captured review](../../../docs/qa-evidence/sereward-succulent-camera-2026-10-01/README.md)
shows readable removal stages and a small upward silhouette displacement in
low/depleted frames. This is a reason to review anatomical root registration
before runtime harvest integration; it does not certify the painted camera
angle or add harvesting rules.
