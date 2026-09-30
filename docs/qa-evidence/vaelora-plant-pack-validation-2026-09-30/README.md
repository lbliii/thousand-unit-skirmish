# Regional plant pack contract validation · 30 September 2026

Candidate based on maind9bea57b. `npm run validate:environment-plants` checks12 current single-source/runtime packs: regional understory, fern variation, Mirelily water decal and god-bone scenery. [Report](report.json) records exact covered IDs and runtime dimensions. Tree lifecycle atlases retain their separate validator.

Checks cover source/runtime byte counts and SHA256, PNG RGBA and WebP alpha headers, encoded dimensions, reference SHA256, valid prompt JSON, crop bounds, max1024/no-upscale dimensions, matching world aspect, surface kind, pivot and forest-stock clearing metadata. Vesperra's original manifest now records the existing ecology reference hash as version0.1.1; source/runtime images remain unchanged.

`node scripts/environment-plant-pack-scenario.mjs` passes a valid copied pack and rejects runtime byte corruption, stale reference and dimensions, out-of-source crop, wrong world aspect/pivot and unsupported surface type. Fixture copies live in a task-created temporary directory and are removed afterward. Both commands are in CI; JS syntax, docs and whitespace pass.

These are file/header/metadata checks, not decoded-alpha equality, runtime loader binding, measured painted perspective, art quality or gameplay evidence. Existing dated browser/alpha checks retain those separate scopes. No runtime appearance or gameplay code changes.
