# Pale Meridian conifer local renderer evidence · 30 September 2026

Local isolated server on port 4178, branch `codex/vaelora-pale-meridian-conifer`.
Source base `df6f141`; this record does not certify staging or current main.

Command: `RTS_QA_URL=http://127.0.0.1:4178 RTS_VEGETATION_REGION=pale-meridian RTS_VEGETATION_LIFECYCLE=1 RTS_VEGETATION_ATLAS=1 node scripts/qa-vegetation-browser.mjs`.

The captures show ordinary/strategic regional rendering and all four stock
stages through the shared 45° azimuth / 45.4359° elevation camera. The lifecycle
proof checks exact UV selection, one family batch, reset to full, and zero
screen roll from actual instance matrices. Forest-slot evidence checks both
snow and ice use the cold atlas and retain the same 36 resource-cell addresses
as other palettes. Fallback evidence deliberately rejects atlas metadata and
checks all four individual textures decode, including the conifer family.

The live one-cell snow map sends a gather order to worker 0, observes stock
4 (worked), 2 (low), and 0 (depleted), then checks a new forest epoch and
restored stock after reset. The corresponding live screenshots are retained.
A disposable Railway release package includes identical atlas metadata, atlas
WebP, and four fallback WebPs. Offline validation confirms all four PNG atlas
frame rectangles exactly match the decoded individual runtime pixels.

No both-seat fog, staging deployment, performance measurement, additional
perspectives or measured painted-image calibration is claimed.
