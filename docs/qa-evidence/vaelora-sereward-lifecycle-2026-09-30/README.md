# Sereward palm lifecycle · 30 September 2026

Source branch `codex/vaelora-sereward-lifecycle`, based on main `86d342d`.
Checks ran on the working change before its checkpoint commit. Local macOS
headless Chrome, 1280×720, isolated supervisor 127.0.0.1:4178. No staging or
large-match performance claim.

## Browser evidence

`RTS_QA_URL=http://127.0.0.1:4178 RTS_VEGETATION_REGION=sereward RTS_VEGETATION_LIFECYCLE=1 node scripts/qa-vegetation-browser.mjs`
passed with ready boot, empty runtime-error text and zero captured console
errors. The local script instruments its own page WebSocket to observe stock
and send host publish/gather/reset commands; no production debug hooks or
server rules were added. Camera wheel/Home controls provide the close view.

- [Lineup](lifecycle-renderer.png) renders actual forest batches on sand.
  [Matrix proof](lifecycle-proof.json) checks stocks 6/3/1/0 activate exactly one
  full/worked/low/depleted frame per slot and that zero-to-full reset succeeds.
- The ordinary [Forked Vale](forked-vale-ordinary.png) opening and
  [strategic view](forked-vale-strategic.png) still load;
  [opening requests](opening-requests.json) exclude unused Sereward and other
  regional sprites.
- [Oasis import/save/play](oasis-save-play.png) uses the previously authored
  Sereward study, followed by ordinary/strategic consuming-renderer captures.
- [Forest cells](forest-slot-proof.json) preserve the same 36 addresses across
  six regional palettes; expected family files decode.
  [Cover proof](forest-cover-proof.json) preserves nine ground bindings and
  texture ownership.
- A live fog-enabled 40×40 `sereward-harvest-check` map places a single palm at
  cell 768, selected by the existing deterministic family rule. Worker 0 receives
  a gather order through the browser's host connection.
  [Stock proof](live-harvest-proof.json) records worked/low/depleted snapshots
  and a reset with a new forest epoch and no changed-stock rows.
  Captures show [full](harvest-full.png), [worked](harvest-worked.png),
  [low](harvest-low.png), [depleted](harvest-depleted.png) and
  [reset](harvest-reset.png). These exercise the real main.js updater, rather
  than only the isolated selection helper. They do not establish both-seat fog
  behavior or worker deposit completion; the prior woodland regression remains
  the reference for those server rules.

## Packaging and limits

Eight source/runtime entries match manifest SHA-256, dimensions and RGBA mode.
The release manifest includes three new state WebPs. Client import tests (5),
syntax, documentation links and diff whitespace checks passed.

Only the Sereward palm joins Bellweather maple in regional lifecycle support.
Acacias, scrub and other regional families retain their existing art. Original
intact source/runtime unchanged. All state crops share the original logical
canvas and registration; PNG masters unmodified. Single camera view, separate
textures, no directional atlas or falling animation yet.

The three added WebPs total 585,150 encoded bytes. Three 853×1024 RGBA textures
with complete mip chains imply about 13.3 MiB before browser/driver overhead;
this is planning arithmetic, not measured residency. Three extra instanced
batches are map-local; cached textures have no eviction budget yet.
