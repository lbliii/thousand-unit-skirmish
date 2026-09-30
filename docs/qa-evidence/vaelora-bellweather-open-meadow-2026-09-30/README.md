# Bellweather open-meadow flowers · 30 September 2026

Local candidate from main `5ec0fc2c`, isolated room/map storage and headless Chrome on port 4178. Run `RTS_QA_URL=http://127.0.0.1:4178 RTS_VEGETATION_REGION=bellweather RTS_VEGETATION_LIFECYCLE=1 RTS_VEGETATION_ATLAS=1 RTS_VEGETATION_UNDERSTORY=1 RTS_VEGETATION_MEADOW=1 node scripts/qa-vegetation-browser.mjs`.

[Ordinary](meadow-ordinary.png) and [strategic](meadow-strategic.png) renderer captures use shipped Bellweather Millrace and the actual game camera. [Meadow proof](meadow-proof.json) records 135 plants in one instanced batch, ground contact, maximum screen roll 7.16e-15 degrees, exact matrix retention after all forest cells clear, exclusions for six other regional bases and generic review, and unchanged map data. These captures show scenery without units/HUD or fog; no hosted match claim.

`node scripts/meadow-vegetation-scenario.mjs` passes deterministic same/different seeds, root cell identity, sparse density, protected roads/obstacles/capture rectangles/spawns/resources, other-region/review exclusions and no map mutation. The scenario is registered in Node CI. Existing browser forest companion, atlas/UV/fallback, live harvesting/reset and regional-loading checks pass with no runtime errors. Syntax/docs/whitespace pass. Release runtime/module bytes match and the exact temporary release copy was removed.

Existing approved meadow-herbs source/runtime are reused unchanged. Static decorative plants have no yield, collision or independent harvest state and do not react to later buildings or unit traffic. One approximate painted view only. No performance or raised-meadow capture claim.
