# Terrain variety and atmosphere · local evidence

29 September 2026, branch `codex/vaelora-terrain-variety`, based on the approved
checkpoint `83f85b5`. This is a follow-up candidate, not a claim of deployed art.

## Conditions and reproduction

Local isolated room supervisor, Chrome headless, 1280 × 633 content viewport,
DPR 1. The browser script creates an isolated local review room, uses the same
browser profile across reloads, and selects Fit map for each matched capture.
It imports the organic and wet-ground studies through Map Studio Save & Play.
No completed-match or GPU-performance claim.

Run a local supervisor with temporary room/custom-map directories, then
`RTS_QA_URL=http://127.0.0.1:4187 node scripts/qa-terrain-variety-browser.mjs`
(or omit the URL for the normal local port 4173). The script rejects remote hosts. After capture, run
`python3 scripts/analyze-terrain-repeats.py` to reproduce the correlation analysis
and comparison sheet (Pillow 12.3.0).

## Sampling comparison

- [Material map: mirror](materials-mirror.png) / [randomized](materials-stochastic.png).
- [Organic terrain: mirror](organic-mirror.png) / [randomized](organic-stochastic.png).
- [Flat-field side-by-side](repeat-comparison.png): mirrored sampling on the left,
  randomized sampling on the right. Same original scree and meadow sources.

The flat-field captures render a 128 × 128 world-unit plane at 512 × 512 pixels,
orthographic, seed 42, no atmosphere or material tint. The regular mirrored cycle
is 24 units / 96 pixels. Pearson correlation of grayscale fields offset by exactly
that distance is 1.000 on both axes for mirrored scree/meadow. Randomized scree is
0.015 / 0.029, meadow 0.052 / 0.068. This measures removal of that exact periodic
repeat, not all possible perceptual artifacts. [Raw analysis](repeat-analysis.json).

Mean RGB stays close; per-channel contrast decreases by roughly 12–17% in most
channels. The prototype blends three source placements and is not a full
histogram-preserving synthesis implementation. It costs three ground samples
instead of one. Low-end device performance is not established.

## Regional palette and atmosphere

The review map includes dry grass, garden loam, and salt crust, bringing the
runtime catalog to sixteen. The old thirteen source textures are retained.
[New source/runtime hashes](../../../assets/environment/frontier-v1/vaelora-ground-variety-manifest.json)
and [palette preview](../../../assets/environment/frontier-v1/vaelora-ground-variety-preview.png)
record the additions and their approved source references.

[Wet-ground study](wet-ground-study.json): same playable spawn/resource rules,
with damp ground, dry/cultivated patches and two water obstacles.
[Clear](atmosphere-clear.png) / [mist at phase 12](atmosphere-mist.png) compare the
optional decorative ground-haze study.
[Clear close view](atmosphere-clear-close.png) / [mist close view](atmosphere-mist-close.png)
use the same -550 wheel delta after Fit map. Haze is confined to wet ground and water,
drawn before team sprites and props; dry clearings remain clear. This is a thin
ground layer, not volumetric fog or a visibility mechanic. Fog of war retains
its separate authoritative mask and later render order.

## Verification

Map persistence covers all sixteen catalog materials, invalid names, and restart.
Terrain blend and atmosphere scenarios verify normalized joins, unchanged map
data, wet coverage, dry clearing overrides, foreground order, fixed phase and
texture teardown ownership. Syntax, client-import tests, water-surface checks,
CI shard coverage, source/runtime hashes, release packaging, and documentation
links are checked. Browser captures report no console shader errors.

Ground images now load on demand and are cached for reuse: the fresh Forked Vale
opening requests meadow and forest floor rather than all sixteen sources. Cached
sources stay resident across later maps; this is not an eviction/memory-budget
system. The three enriched flower/root/bone studies are still separate source
candidates and have no runtime loader.

After integrating main `32e5076`, syntax, client-import/CI-shard tests, terrain
scenarios, sixteen-material persistence and documentation links passed again.
A [combined-build browser smoke](post-integration-materials.png) confirmed ready
boot on Frontier Materials with no visible runtime error or console shader error.
The import and served-module conflicts were resolved by retaining both the
terrain catalog and current gameplay research-action modules.
