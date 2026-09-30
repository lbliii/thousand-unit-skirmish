# Ru’Lora interior composition study · 30 September 2026

Final working candidate after main integration at `e87135aa41f1d8d8ffa1bb8ecdee97a21688414c`, owner-run local server port 4178, isolated room/map storage and headless Chrome. [Editable map JSON](ru-lora-interior-study.json) is an importable 64×64 art/navigation study, not a balanced economy map or a new default scenario.

Import the JSON through Map Studio → Import → Save & Play. Six irregular clusters of low stone obstacles use the already integrated Fiendwood, stone fern and retained boulder mix. Salt-crust ground and sparse cinder companion patches keep the petrified palette. No authored harvestable forest or resource nodes are present. Open spawn spaces and a winding central corridor separate the dense canopy groups.

Run `RTS_QA_URL=http://127.0.0.1:4178 RTS_VEGETATION_REGION=ru-lora node scripts/qa-vegetation-browser.mjs`.

- [Home-base view](interior-save-play-ordinary.png) checks nearby canopy overlap and clear spawn space after import/publish; [whole-map view](interior-save-play-strategic.png) checks grouping and the central route. The closer view uses an explicit wheel zoom and Home base, rather than retaining the previous whole-map zoom.
- Map Studio accepted Save & Play, game title became `RU LORA INTERIOR STUDY`, boot remained ready, runtime error empty, console errors empty. [Study requests](study-requests.json) include both regional sprites and retained boulders.
- [Route check](check-route.mjs), run with Node, verifies no overlapping obstacle cells, open spawn cells, four-neighbor connectivity and the reserved nine-cell corridor. [Proof](route-proof.json): 392 stone cells, 3656 reachable cells, no forest/resource nodes.
- [Binding proof](forest-slot-proof.json), [ground proof](forest-cover-proof.json) and [opening requests](opening-requests.json) retain the eleven-base regression checks. [Renderer detail study](ru-lora-renderer-ordinary.png) isolates the asset mix.

First import failed because a draft used `basalt`, which is not a ground catalog ID. Corrected to the existing `cinder` material and reran successfully. No catalog/rule change was needed.

Dense clusters still reveal repeated Fiendwood crown shapes and a narrow lightness range. A broken or crownless trunk silhouette and darker canopy variant are useful next art work. This study establishes composition and authoring integration, not finished biome art, extraction rules, actual unit-travel validation, hosted readiness, both-seat fog or performance evidence.
