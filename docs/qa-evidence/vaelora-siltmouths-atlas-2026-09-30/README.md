# Siltmouths tidal-tree local evidence · 30 September 2026

Source base `d595708`, branch `codex/vaelora-siltmouths-tidal-tree`.
Isolated local server port 4178; this does not certify staging.

Command: `RTS_QA_URL=http://127.0.0.1:4178 RTS_VEGETATION_REGION=siltmouths RTS_VEGETATION_LIFECYCLE=1 RTS_VEGETATION_ATLAS=1 node scripts/qa-vegetation-browser.mjs`.

Ordinary/strategic captures and the four-state lineup use the actual shared
45° azimuth / 45.4359° elevation camera. Instance matrices have zero screen
roll; UV selection and reset pass. Tidal-mud forest cells use the tidal-tree
atlas and retain the same 36 addresses as the other regional palettes.
Metadata-rejection fallback loads all four individual textures. A real worker
harvests cell 768 through worked, low and depleted states; reset restores stock
and advances the forest epoch. Browser boot is ready with no console errors.

Atlas validation passes. The disposable Railway package contains byte-identical
atlas JSON/WebP and all four fallback WebPs. Original generated PNG masters,
shared crop, exact prompts and file hashes remain in the source manifest.

No staging, both-seat fog, performance, additional directions or measured
painted-perspective calibration is claimed. This is one tidal woodland family;
reeds, marsh tubers and estuary fauna remain separate production outcomes.
