# Siltmouths dry marsh beds

30 September 2026 local; base `83a88448`, branch `codex/siltmouths-marsh-beds` plus this checkpoint. Isolated local server at port 4178; no hosted/performance claim.

```sh
node scripts/meadow-vegetation-scenario.mjs
RTS_QA_URL=http://127.0.0.1:4178 RTS_VEGETATION_REGION=siltmouths RTS_VEGETATION_MARSH=1 RTS_VEGETATION_PLANT_CONTRACT=1 RTS_VEGETATION_OCCUPATION=1 RTS_VEGETATION_OUTPUT=docs/qa-evidence/vaelora-siltmouths-marsh-beds-2026-09-30 node scripts/qa-vegetation-browser.mjs
```

[Marsh proof](marsh-proof.json) records 43 plants in a single registered-size batch, ground contact, screen roll 6.36e-15 degrees, exact independence from forest clearing, eleven incompatible-base exclusions and resource-review exclusion. Placement checks add Reed Crossings to the five previous regional fixtures: roots stay within five units of authored water, exclude no-water maps, retain deterministic seeds/unique cells and protect obstacles, routes, objectives, economy markers and spawns without modifying maps.

[Ordinary](marsh-ordinary.png) and [strategic](marsh-strategic.png) renderer studies show small dry broadleaf pockets alongside existing silver reeds. [Plant contracts](plant-contract-proof.json) pass all 24 geometry registrations / wrong-scale rejections, 19 forest companion lifecycles and eight independent land categories through footprint overlap and exact restoration. Synthetic tidal-mud water uses the unobstructed right bank to expose the new dry habitat. Forked Vale boots ready without recorded browser errors.

Foundation checks call the renderer helper, not a player-built construction interaction. Decorative single-view source is reused; no independent gathering, yield or harvest pose. Strong ground swirls and angular water boundaries remain visible and require further environment work.
