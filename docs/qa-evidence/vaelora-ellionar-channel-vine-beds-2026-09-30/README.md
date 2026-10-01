# Ellionar mixed channel beds

30 September 2026 local; base `9af76fed`, branch `codex/ellionar-channel-vine-beds` plus this checkpoint. Isolated local server at port 4178.

```sh
node scripts/garden-vegetation-scenario.mjs
node scripts/meadow-vegetation-scenario.mjs
RTS_QA_URL=http://127.0.0.1:4178 RTS_VEGETATION_REGION=ellionar RTS_VEGETATION_GARDEN=1 RTS_VEGETATION_PLANT_CONTRACT=1 RTS_VEGETATION_OCCUPATION=1 RTS_VEGETATION_OUTPUT=docs/qa-evidence/vaelora-ellionar-channel-vine-beds-2026-09-30 node scripts/qa-vegetation-browser.mjs
```

[Garden proof](garden-proof.json) records 15 retained plants, two registered-size batches (9 Sunbloom / 6 vine), exact forest-clearing independence, grounded contact and screen roll 4.77e-15 degrees. Seven incompatible bases and resource-review maps are excluded. Placement checks cover exact group union, one specimen per occupied bed, deterministic seed behavior, crossings, channel ends, resources, objectives, spawns and unchanged input maps. Previous regional placement scenarios pass unchanged.

The initial random bed selection failed the requirement to display both specimens on the shipped map's three occupied beds. Final selection deliberately alternates occupied beds in sorted order, with seeded starting phase. This provides cultivated variety without changing any roots or weakening checks. Final browser capture was rerun after that change.

[Ordinary](garden-ordinary.png) and [strategic](garden-strategic.png) views show the actual shipped channel layout through the renderer study. [Plant contracts](plant-contract-proof.json) pass all 24 registered geometries and wrong-scale rejections, 19 forest companion lifecycles and seven independent land occupation categories. Forked Vale boots ready with no recorded browser errors. Foundation checks use direct renderer fixtures, not a player-built interaction. Sources retain one approximate painted view; resource gathering, authored harvest states and additional perspectives remain unfinished. No hosted or performance claim.
