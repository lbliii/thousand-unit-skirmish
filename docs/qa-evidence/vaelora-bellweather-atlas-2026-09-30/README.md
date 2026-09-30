# Bellweather lifecycle atlas · 30 September 2026

Source `codex/vaelora-environment-atlases`, based on main `a47b85f`. Working
change checked before checkpoint commit. Local macOS headless Chrome, isolated
127.0.0.1:4178 server, 1280×720 viewport. No staging/large-match claim.

`RTS_QA_URL=http://127.0.0.1:4178 RTS_VEGETATION_REGION=bellweather RTS_VEGETATION_LIFECYCLE=1 RTS_VEGETATION_ATLAS=1 node scripts/qa-vegetation-browser.mjs`
checks the actual atlas-consuming renderer. [UV proof](lifecycle-proof.json)
asserts four stocks select the expected distinct frame rectangles, all four
preview slots share one mesh, and reset restores full UVs.
[Lineup](lifecycle-renderer.png), ordinary/strategic regional renders and Forked
Vale opening captures support ground-contact and zoom inspection.
[Forest cells](forest-slot-proof.json) preserve 36 addresses across six regions;
[cover proof](forest-cover-proof.json) preserves nine ground bindings.
[Opening requests](opening-requests.json) show only used regional image pages,
plus the two small atlas metadata requests.

The linear/no-mip prototype was rejected for visibly speckled foliage. Final
64px padded pages use derived texture LOD capped at six. No frame repaint or
resizing; source-page frame crops are byte-equal to decoded individual images.
Runtime alpha is exact after WebP encoding. RGB recompression is not pixel-equal.
Sprite-atlas validators, client import tests (5), syntax, documentation and
release packaging checks support integrity. Both JSON/WebP pairs appear in
the release manifest; Docker admission explicitly includes the JSON files. Batch count is an implementation
observation, not an FPS or residency measurement. Padding costs additional GPU
memory; the owning environment guide records estimates and cache limitations.
