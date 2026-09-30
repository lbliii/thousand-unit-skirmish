# Sereward lifecycle atlas · 30 September 2026

Source `codex/vaelora-environment-atlases`, based on main `a47b85f`. Working
change checked before checkpoint commit. Local macOS headless Chrome, isolated
127.0.0.1:4178 server, 1280×720 viewport. No staging/large-match claim.

`RTS_QA_URL=http://127.0.0.1:4178 RTS_VEGETATION_REGION=sereward RTS_VEGETATION_LIFECYCLE=1 RTS_VEGETATION_ATLAS=1 node scripts/qa-vegetation-browser.mjs`
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

A real fog-enabled `sereward-harvest-check` match orders worker 0 to gather
cell 768. [Live stock proof](live-harvest-proof.json) and full/worked/low/depleted/
reset captures exercise main.js stock updates and the atlas shader. They do not
prove both-seat hidden-state behavior or worker deposit completion.

[Fallback proof](fallback-proof.json) intercepts both atlas-metadata requests
with HTTP 404, reloads the live page, and verifies both families return to their
four individual state batches with decoded textures and depleted-state mapping.
The browser remains ready with empty runtime-error text.

## Camera correction and integrated rerun

After user feedback about dramatic angles, instance-facing matrices were changed
to match the camera's world-Y-up basis. The former shortest-arc quaternion added
about -19.677° of unintended screen roll. Current captures use the shared exact
[0.78,1.12,0.78] camera direction (45° azimuth, 45.4359° elevation).
`screenRollDegrees` in the lifecycle proof is within 0.0001° of zero across all
four tested states. Natural curves in the painted palm remain.

The local server was restarted on integrated main `242d330`/branch merge
`eb5cfac`, and the browser capture passed again. Camera controls scenario, camera
recovery tests (3), client imports (5), and stationary-command tests (6) passed.
No staging or intrinsic generated-image perspective calibration claim.
