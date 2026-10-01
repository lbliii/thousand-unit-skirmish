# Land vegetation and foundations

30 September 2026 local; source base `83ed2dc3`, branch `codex/land-vegetation-foundations` plus the changes recorded in this checkpoint. Local room supervisor at port 4178, Forked Vale, isolated room storage. No hosted or performance claim.

Run:

```sh
RTS_QA_URL=http://127.0.0.1:4178 RTS_VEGETATION_PLANT_CONTRACT=1 RTS_VEGETATION_OCCUPATION=1 node scripts/qa-vegetation-browser.mjs
node scripts/meadow-vegetation-scenario.mjs
```

[Plant proof](plant-contract-proof.json) records seven batches / 58 instances across independent meadow, dryland, snow, garden and shore vegetation. Real Three.js meshes in twelve synthetic habitat fixtures pass foundation overlap, unchanged repeated updates, moved-foundation restoration, tiny card-edge overlap, whole-field hiding and exact matrix restoration after removal. Unrelated mesh matrices remain identical. All 23 registered plant geometries and wrong-scale rejections pass; all 19 forest companion specimens retain partial-stock/cleared/reset behavior.

The game boots ready on Forked Vale without recorded browser errors. Opening and ordinary/strategic images are baseline appearance captures, **not** screenshots of construction clearing. The occupation assertions call the renderer helper directly; an ordinary player-built foundation and multiplayer visibility interaction are not verified here. Client integration applies the helper to reconciled received buildings using canonical sizes. Original matrices preserve ground contact and facing when restored.

Placement checks retain 148 Bellweather meadow, 68 Sereward dryland and 42 Pale Meridian snow plants with deterministic grouping, protected markers and no map mutation. This does not certify new painted perspectives, plant gathering states, trampling, biological regrowth or reduced terrain repetition.

A [fresh integrated repeat](../vaelora-land-vegetation-foundations-integrated-2026-09-30/README.md) passes after merging current main `24f800bb`. Original captures remain preserved here.
