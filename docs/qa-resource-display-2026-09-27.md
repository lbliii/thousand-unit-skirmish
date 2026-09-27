# Resource display — 27 September 2026

[Game bible](game-bible.md) · [QA plan](qa-vertical-slice.md)

## Observation and decision

Native Firefox opening checks on source `bcd5fec`, Forked Vale, Ember, showed
`140.033` food and a research shortfall of `9.966667000000001 FOOD + 30 WOOD`.
The checks used an ordinary desktop viewport (approximately 1391 × 757 CSS pixels)
and Firefox Responsive Design Mode at 800 × 700, DPR 2, touch simulation off.
Azure was a passive local client. Gathering, Barracks/range placement, cancellation,
and infantry production worked; the resource precision was unnecessary visual noise.

Existing worker cargo already used `Math.floor`; stock totals used default
`toLocaleString`, and production/research deficits interpolated raw subtraction.
The stock formatting could round `49.9999` to `50` while a 50-food action correctly
remained disabled. The shared client formatting now extends the cargo policy:
whole stocks round down, costs and shortfalls round up, with locale digit grouping.
Authoritative amounts and exact affordability comparisons remain untouched.

| Situation | Before | After |
| --- | --- | --- |
| Food stock 140.033 | 140.033 | 140 |
| Food stock 49.9999; worker costs 50 | 50; disabled | 49; disabled; needs 1 food |
| Research food deficit 100 − 90.033333 | 9.966667000000001 | 10 |
| Food deficit 100 − 99.9999 | 0.00010000000000331966 | 1 |
| Food stock exactly 100, wood exactly 75 | Research enabled | Research enabled |

The helper covers HUD stock totals, both cargo summaries, production disabled
reasons, research costs/shortfalls, accessible cost labels, placement feedback,
and client purchase notices. Static integer button costs retain their wording.
Map authoring inputs and economy/server semantics were not changed.

## Validation

`resource-format.test.mjs` executes the actual economy/research UI functions in a
small DOM fixture for Azure and Ember. It checks all opening production costs,
both building costs, and both attack-upgrade boundaries below and exactly at cost.
It also checks preserved raw stocks, whole cargo, grouped amounts, and positive
shortfalls. Against the prior main source both seat tests fail (`50` instead of
`49`); all three tests pass with this change. The test is registered in CI.

The existing 17 build/camera/rematch recovery tests and four selection-context
tests pass. JavaScript syntax, diff whitespace, and documentation links pass.
A native Firefox after-check was attempted, but CUA reported that the Mac was
locked and automatic unlock failed. No after screenshot or visual pass is claimed.
The disposable fixture server was shut down. This is a formatting and exact
boundary regression result, not a new human-match or balance proof.

## Client boot fix-forward

The subsequent headless recovery audit on `664ecb6` exposed a delivery regression:
`/src/main.js` returned 200, but its newly imported `/src/resource-format.mjs`
returned 404 because the public client asset allowlist omitted it. The rendered
page showed `CLIENT ERROR · Could not load src/main.js`. The earlier VM checks did
not cover HTTP delivery; the locked native after-check had not established boot.

The allowlist now serves the helper. The existing packed Railway release scenario
walks static imports reachable from `src/main.js`, resolves relative/absolute paths
and the `three` import-map alias, and checks HTTP 200 plus JavaScript MIME for each
module. This check failed on the missing helper before the fix and the full release
scenario passed afterward. It runs in the existing CI release scenario; no new test
registration is required. Deployment and post-fix rendered verification are separate.
