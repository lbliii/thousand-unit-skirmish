# Bellweather maple lifecycle · local evidence · 30 September 2026

Source: `codex/vaelora-bellweather-lifecycle`, based on main `fa7e6bc`. Checks ran
against the working change before its checkpoint commit. Browser and docs checks
were repeated after integrating main `700f754` at merge commit `20974c7`;
client rematch recovery tests also passed (9). Local macOS headless
Chrome, isolated room supervisor at 127.0.0.1:4178, 1280×720 viewport. No staging
observation or GPU performance claim.

## Observations

- `RTS_QA_URL=http://127.0.0.1:4178 RTS_VEGETATION_LIFECYCLE=1 node scripts/qa-vegetation-browser.mjs` passed.
- Forked Vale booted ready with no runtime error and zero captured console errors.
  [Ordinary](forked-vale-ordinary.png) and [strategic](forked-vale-strategic.png)
  captures retain the normal opening.
- [Lifecycle capture](lifecycle-renderer.png) uses actual forest batches and the
  consuming stock-selection helper, displayed as a four-tree lineup without
  units/fog/UI. Stocks 6/3/1/0 selected full/worked/low/depleted.
  [Matrix evidence](lifecycle-proof.json) checks exactly one nonzero state matrix
  per slot and restores the full state from zero. The lineup intentionally
  retains each selected tree's deterministic scale/flip; source registration is
  compared in the [contact sheet](../../../assets/environment/frontier-v1/bellweather-lifecycle-preview.png).
- [Forest-slot proof](forest-slot-proof.json) retains 36 cell addresses across six
  regional bases. All intended textures loaded; unused regions were absent from
  [opening requests](opening-requests.json).
- [Forest-cover proof](forest-cover-proof.json) preserves all nine tested ground
  bindings and per-surface texture ownership.
- `node scripts/harvestable-woodland-scenario.mjs` passed: finite six-wood harvest,
  sparse fog-filtered changes, cleared-cell movement, checkpoint recovery and
  reset. This server scenario does not inspect browser state images. Main's
  sparse visual updater now compares stock stages and restores all worked slots
  on epoch change; a live browser harvesting/fog/reset capture remains separate
  evidence to add.
- Client import tests (5), syntax checks, documentation links, and release
  packaging passed. The release manifest includes all three new state WebPs.
  Eight lifecycle source/runtime entries match their manifest hash, dimensions
  and RGBA mode.

## Scope and limits

Only Bellweather field maples have regional lifecycle art. Other families retain
existing full/depleted behavior. Three additional instanced batches/textures are
created only when this family appears. Runtime WebPs add 432,652 encoded bytes;
three 1012×1024 RGBA images would add approximately 15.8 MiB including a full mip
chain, before browser/driver overhead. This is planning arithmetic, not measured
GPU residency. No large-match budget proof.

Single fixed-camera view and separate images; no directional selection, falling
animation, regrowth rules or integrated atlas. PNG masters remain unmodified;
all state encodings use the original full-frame crop for consistent registration.
