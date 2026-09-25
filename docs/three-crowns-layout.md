# Three Crowns — fair starts and the 1,000-unit opening

Three Crowns keeps its 1,000-unit opening, two outer crowns, gated central keep, and neutral market resources. The previous starts at x = -24 and +24 rasterized to columns 8 and 56, whose shortest routes to North Crown / South Crown / Keep were 35/36, 34/35, and 20/21 cells. The 26-column default formation also crossed the map edge from those centers. The corrected starts use mirrored grid cells 11 and 52 at x = -20.5 and +20.5. Both 500-unit formations now fit fully on open terrain inside the 64 × 64 map.

## Routes and resources

| Route | Azure | Ember |
| --- | ---: | ---: |
| North Crown | 32 cells | 32 cells |
| South Crown | 31 cells | 31 cells |
| Heartland Keep | 17 cells | 17 cells |
| Home food / wood | 9 cells each | 9 cells each |

The North Market Food route is 34 cells for Azure and 35 for Ember. The South Market Wood route is 35 for Azure and 34 for Ember, so the combined neutral-market route cost is 69 cells for each seat. The paired home nodes occupy mirrored cells and keep their existing 350-stock amount. The central resources remain in the contested middle.

## Authoring and checks

Run `node scripts/improve-three-crowns.mjs` to author the map in Map Studio and export it back to `maps/three-crowns.json`. It places both spawn markers, shifts the paired home resources onto mirrored cells, preserves their existing IDs and stocks, and keeps the two neutral market routes balanced.

The `node scripts/three-crowns-layout.mjs` check verifies mirrored terrain and starts, equal shortest routes to all three objectives, equal home-resource routes, equal combined market access, and both open 1,000-unit formation envelopes. It is included in `npm test`.

The `node scripts/three-crowns-scenario.mjs 0` and `node scripts/three-crowns-scenario.mjs 1` runs exercise both winner seats through crown capture, keep gating, victory, synchronized rematch, and reset.
