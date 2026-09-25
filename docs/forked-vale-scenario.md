# Forked Vale — first complete 1v1 scenario

Forked Vale is an original 80 × 64 skirmish map. Both teams start with four workers, eight infantry, 150 food, and 250 wood. The first useful choice is visible from the bases: send the army through the north or south signal ford, or spend wood on a Barracks or Archery Range and prepare a split attack. Workers count toward a capture threshold, so a quick 5+5 split is possible at the cost of exposing the economy.

![Top-down tactical layout of Forked Vale](forked-vale-preview.svg)

The host can choose **Forked Vale** in the battlefield picker, or launch it directly with `RTS_MAP=maps/forked-vale.json node server.mjs`.

## Tactical layout

The Azure and Ember starts sit at mirrored positions, ±26.5 on the east-west axis. Each has a nearby 600-stock food node and 600-stock wood node. Each side also has mirrored 400-stock food and wood expansions closer to the fords. Water divides the center into a 13-cell north crossing, a 9-cell central crossing, and a 12-cell south crossing. Small corner groves add visual landmarks without hiding the routes.

Both teams have the same shortest walkable distance to each objective: 31 cells to North Signal, 30 to South Signal, and 20 to Vale Watch. The one-cell difference between north and south is shared by both teams. The 1,000-unit-per-team starting footprint fits inside the map for manual stress resets.

## Match rules and player text

| Step | Rule | Why it matters |
| --- | --- | --- |
| North Signal | 5 units, 9 seconds; +75 food and +50 wood per capture | Gives the first army a northern route and a modest production reward. |
| South Signal | 5 units, 9 seconds; same reward | Offers an equal southern route and a second front. |
| Vale Watch | 8 units, 12 seconds; requires one team to own both signals | Forces a plan beyond a straight central rush. |
| Victory | Own all three zones for 20 continuous seconds | Leaves time for a counterattack after the final capture. |
| Relief Caravan | At 2:00, both teams receive 100 food and 75 wood | Keeps the losing side able to produce or rebuild. |
| Deadline | At 15:00, the Vale Watch owner wins regardless of signal ownership; if unclaimed, draw | Resolves a stalled match with an explicitly stated fallback. |

The authored scenario brief appears in the map picker: “Both Signals unlock the Watch. Hold all three for 20s. Relief at 2:00; 15:00, Watch owner wins or unclaimed is a draw.” It names the all-zone hold and its duration, the Relief Caravan arrival, and the deadline result. Objective callouts use the same North Signal, South Signal, and Vale Watch names in the editor and game.

## Authoring and checks

`node scripts/author-forked-vale.mjs` drives Map Studio in a local headless browser. It paints the terrain, places spawns and resources, sets every objective and event through editor controls, publishes the map, copies the editor-produced file to `maps/forked-vale.json`, and reopens it in Map Studio to check the round trip. It backs up an existing shipped file and restores it if authoring fails. No scenario JSON is hand edited.

`node scripts/forked-vale-layout.mjs` checks mirrored terrain and resources, equal path distance from both spawns, open crossing cells, and the large-army starting footprint. `node scripts/forked-vale-scenario.mjs 0 --stress` and `node scripts/forked-vale-scenario.mjs 1 --stress` exercise both winner assignments, both teams' economy, opposed signal ownership, the locked watch, recapture, victory, synchronized rematch reset, and a 2,000-unit match. Stress checks at least 950 units from each side move toward separate crossings, then attack-moves both full armies into a contested engagement and requires at least 10 units damaged or killed on each side. These are local simulation checks; match feel and internet performance still need player testing.

`node scripts/render-forked-vale-preview.mjs` refreshes the top-down diagram from the editor-authored map file.

Three Crowns was also revised through Map Studio with two central stone shelves, a clear brief, a 20-second all-zone victory hold, and a 15-minute deadline. Its original large-army opening remains intact as a contrasting shipped stress scenario.
