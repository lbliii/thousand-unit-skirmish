# Veyrholds alpine moss

30 September 2026 local; base `edbccce7`, branch `codex/veyrholds-alpine-moss` plus this checkpoint. Local isolated server at port 4178. No hosted/performance claim.

```sh
node scripts/validate-environment-plants.mjs
python3 scripts/validate-environment-plant-alpha.py
node scripts/environment-plant-pack-scenario.mjs
node scripts/meadow-vegetation-scenario.mjs
RTS_QA_URL=http://127.0.0.1:4178 RTS_VEGETATION_REGION=veyrholds RTS_VEGETATION_RIDGE=1 RTS_VEGETATION_PLANT_CONTRACT=1 RTS_VEGETATION_OCCUPATION=1 RTS_VEGETATION_OUTPUT=docs/qa-evidence/vaelora-veyrholds-alpine-moss-2026-09-30 node scripts/qa-vegetation-browser.mjs
```

The source follows the approved Alpine Moss & Lichen key. Original PNG remains unchanged; crop `[253,236,1285,828]` exports to 1024×587 WebP at quality86/method6/exact alpha. Registered card size 0.95945×0.55. A neutral-ground composite shows no visible outside glow despite RGB in fully transparent pixels. No repaint or manual cutout.

[Ridge proof](ridge-proof.json) retains all 50 accepted roots and records 7 ridgegrass / 18 Suncrest / 25 moss across three batches, grounded contact and screen roll 7.95e-15 degrees. [Ordinary](ridge-ordinary.png) and [strategic](ridge-strategic.png) captures show sparse low rocky accents. Ten incompatible bases and review maps are excluded; forest clearing leaves plants unchanged.

[Plant proof](plant-contract-proof.json) passes all 24 geometries/wrong-scale rejection checks, 19 forest companion lifecycles and seven independent land occupation categories. Pack/reference/crop/registration validation and exact decoded alpha pass for all 24 packs; corrupted-pack fixtures reject correctly. Placement checks preserve grouping, seed changes, protected markers and map immutability. Release packing includes byte-identical new WebP and changed runtime files; temporary pack removed.

The first renderer attempt failed texture loading because the new filename was absent from the server allowlist. After adding it and restarting the isolated server, the full run boots ready without recorded browser errors and passes. Occupation remains a helper-fixture proof, not a player-built foundation capture. One approximate painted view, no gathering or harvest poses. Terrain repetition remains visible.
