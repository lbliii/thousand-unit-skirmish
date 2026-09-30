# Ru’Lora broken trunk mix · 30 September 2026

Working candidate based on `30bcd560fec79da2f2075f4dc72dfd6efccf18b8`, isolated local server port 4178 with separate room/map storage and headless Chrome. Run `RTS_QA_URL=http://127.0.0.1:4178 RTS_VEGETATION_REGION=ru-lora node scripts/qa-vegetation-browser.mjs`.

The [unchanged 64×64 study](../vaelora-ru-lora-interior-2026-09-30/ru-lora-interior-study.json) was imported through Map Studio and Save & Play. The new variant affects only existing low outcrop scenery choices.

- [Previous close view](../vaelora-ru-lora-interior-2026-09-30/interior-save-play-ordinary.png) versus [new close view](interior-save-play-ordinary.png): narrow darker crownless trunks interrupt the repeated pale crowns, creating clearer gaps and more varied group outlines. [Whole-map view](interior-save-play-strategic.png) checks the same six clusters and central route.
- [Placement proof](stone-placement-proof.json): 26 identical ground positions between regional and generic review stone scenery, maximum screen-roll component zero in both. This proves the runtime upright basis, not intrinsic painted projection accuracy.
- [Eleven-base binding proof](forest-slot-proof.json): all four stone scenery images on salt-crust, no Ru’Lora images on other terrain bases; identical 36 forest cells per base. The small original fixture happened to select only broken outcrop variants, so a second stone row was added to exercise both choices without changing production art selection.
- [Study requests](study-requests.json) confirm regional image loading; [opening requests](opening-requests.json) confirm no eager unused regional images. Map title correct, boot ready, runtime error empty, console errors empty.

Source/runtime hashes and dimensions passed; cropped/resized runtime alpha equals decoded WebP alpha exactly. Disposable Railway release includes the new WebP byte-for-byte. JS syntax, documentation links and whitespace passed. Generated PNG is unchanged; this is a naturally fractured mineral prop, not a wood harvest lifecycle. One fixed-oblique view. No hosted, both-seat fog or large-match performance evidence.
