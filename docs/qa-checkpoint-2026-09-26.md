# QA evidence checkpoint — 26 September 2026

This snapshot supplements the vertical-slice acceptance record and the 25 September QA checkpoint. Older captures and fingerprints keep their original build and environment scope; this checkpoint does not relabel them as current-build evidence.

## Current source and deployments

| Environment | Identity | Verification and limits |
| --- | --- | --- |
| Main | a8bd1e99dd0ceb917186a7a79ac6179c50e1ca88 (merge PR #93) | Includes PRs #85–93: the interactive pack and Docker fix, map and environment roadmaps, balance roadmap, audio-preview caption change, unit/building art format review, agent coordination guidance, and Map Studio zoom/pan. |
| Staging | Deployment 3507c1ba-314a-48e2-b207-c5e99ed959e1, source a8bd1e99dd0ceb917186a7a79ac6179c50e1ca88, image sha256:739a5345d64485c06c561d3c87cb969f8059334cb82f06a2e396bfcac98cfeaa | Railway reported SUCCESS; `/ready` succeeded at 16:01:59Z. Build logs include Docker `COPY` steps for the interactive manifest and WebPs. At 16:02Z, authenticated GETs returned HTTP 200 for the manifest and all ten runtime WebPs; each image SHA-256 matched its manifest entry. This verifies asset delivery, not renderer behavior. No full HTTP, WSS, browser, or match smoke was run. |
| Production | Manual redeploy 014448c3-4a3b-4942-9d96-6d77515d0d61, still SUCCESS | No new production deployment was made. Railway metadata still gives no source SHA or immutable image digest. The 25 September 52-file fingerprint matched application files at 2530714869a342e37cdd0fee17bd33ac757b7a88; it does not establish platform image provenance. |

PR #85 integrated the interactive environment pack, and PR #88 added Docker and `.dockerignore` entries for the manifest and runtime WebPs. Current staging source `a8bd1e9` includes those `COPY` steps and passed `/ready`. QA fetched the manifest and all ten runtime WebPs with staging authentication; every response was HTTP 200 and every image hash matched the manifest. This establishes that the assets are served by the current image. It does not establish renderer-state selection or visual quality; no browser or GPU capture was run. Production remains untouched.

## CI runner availability

The GitHub Verify Node 24 project check failed before runner assignment on merged PRs #76, #77, #78, #79, #81, #82, #83, and #84. For each job, the Actions job API reported runner_id 0, an empty runner name, and no steps; each completed in about two seconds. These runs provide no assertion or test result. CI status for PRs #85–93 was not verified for this checkpoint. See [PR #76](https://github.com/lbliii/thousand-unit-skirmish/pull/76), [PR #77](https://github.com/lbliii/thousand-unit-skirmish/pull/77), [PR #78](https://github.com/lbliii/thousand-unit-skirmish/pull/78), [PR #79](https://github.com/lbliii/thousand-unit-skirmish/pull/79), [PR #81](https://github.com/lbliii/thousand-unit-skirmish/pull/81), and [PR #82](https://github.com/lbliii/thousand-unit-skirmish/pull/82), [PR #83](https://github.com/lbliii/thousand-unit-skirmish/pull/83), [PR #84](https://github.com/lbliii/thousand-unit-skirmish/pull/84), [PR #85](https://github.com/lbliii/thousand-unit-skirmish/pull/85), [PR #86](https://github.com/lbliii/thousand-unit-skirmish/pull/86), [PR #87](https://github.com/lbliii/thousand-unit-skirmish/pull/87), [PR #88](https://github.com/lbliii/thousand-unit-skirmish/pull/88), [PR #89](https://github.com/lbliii/thousand-unit-skirmish/pull/89), [PR #90](https://github.com/lbliii/thousand-unit-skirmish/pull/90), [PR #91](https://github.com/lbliii/thousand-unit-skirmish/pull/91), [PR #92](https://github.com/lbliii/thousand-unit-skirmish/pull/92), and [PR #93](https://github.com/lbliii/thousand-unit-skirmish/pull/93).

PR #79 moved critical caption decisions ahead of the audio enabled, volume, and effects-level early return. PR #83 records the focused pre-unlock, muted, and zero-output regression as passed on PR #79, and this code is included in current staging. That is focused regression evidence, not an independent QA browser check or player cue-recognition observation on the current staging build. The GitHub CI job did not reach a runner.

PR #90 now shows mapped captions for critical sample previews when captions are enabled; attack and move sample cues remain audio-only. This behavior is in current main/staging, but QA has not observed player cue recognition on the current build.

## Renderer environment-state pilot

The PR #77 renderer-environment-state-pilot-plan completed as a static plan. It declares four Meadow/Cinder resource-state tuples but starts no server or browser, creates no WebGL context, and captures no screenshots; its output sets verifiedDuringPlan to false. This is planning evidence only.

The capture runner's `verifyEnvironmentPack()` requires `assets/environment/frontier-interactive-v1/manifest.json` plus ten hash- and dimension-verified WebP runtime images before either static preflight or GPU capture. PR #85 integrated the pack and PR #88 fixed Docker packaging. On current staging deployment `3507c1ba-314a-48e2-b207-c5e99ed959e1` at source `a8bd1e9`, the authenticated manifest and all ten runtime images returned HTTP 200; all ten image hashes matched the manifest. This proves static delivery, not a renderer capture or visual review.

The current Dockerfile and `.dockerignore` include the interactive manifest and WebPs. The pack provenance records an unresolved yellow-green oak edge contour; hash verification alone is not visual acceptance. Capture the environment states in a bounded owner-run browser session and review terrain edges in-game at ordinary and strategic zoom. A quiet-host load reading is not required for this appearance check.

No environment-state capture is registered in the current game-dev capture list. No GPU or browser capture was started.

## Host and player evidence gates

Infra's latest host sample, at 2026-09-26T15:57:26Z, was 6.21 / 5.07 / 5.98 for the 1/5/15-minute load averages. The 1-minute value is above the <=2.0 threshold. The required two readings at or below 2.0, at least 60 seconds apart, plus explicit Infra release have not been recorded. No performance scenario, browser run, or renderer capture was started for this historical checkpoint. The quiet-host threshold applies to comparable performance work; it no longer blocks ordinary appearance capture.

No new two-seat WSS/reconnect/rematch run or complete Forked Vale match was conducted on the current staging build. The earlier f1d6482/1d74cae results remain historical evidence. The novice external playtest remains pending; no testers were contacted. Keep synthetic scenario results, browser automation, and player observations as separate evidence classes.

## Living-land experiment evidence

PR #84's living-land experiment is a design proposal, not a first-slice completion requirement or a routine PR gate. No traversable-height, specialty-crop, or regrowth pilot is implemented in the current build. When the pilot is runnable, QA will coordinate the map/snapshot revision with the affected Maps, Gameplay, and Renderer owners and record:

- Both seats' path choices and whether they take, defend, or bypass the special site.
- Site-control time by seat and each seat's harvest and exchange totals.
- Resource state and regrowth after a player leaves, reconnects or restarts, and rematches.
- Whether each player can explain if and why the terrain changed a decision.

Record the exact build and map/snapshot revision with this evidence. Keep the experiment's player evidence separate from the current invite-match acceptance gates.

## Map-scale and density observations

PR #86's guide proposes a selectable 160 × 160 Frontier map, with a possible 224 × 224 variant later. PR #89's roadmap assigns Maps the populated 160 × 160 map with working resource clusters and a lake or stream region, while Renderer and Environment advance water, shoreline, and tree variety in parallel. This is a map and art iteration experiment, not a PR gate or prerequisite for current milestone proof. No large authored-map observation was run for this checkpoint. Once the map is runnable on a recorded build, observe both seats and record:

PR #93's Map Studio zoom/pan navigation is now in main and staging. It improves large-map authoring controls, but QA has not observed or round-tripped a 160 × 160 map.

- Each seat's routes, explored area, and discovered resource pockets.
- Available base and expansion building space, first contact, and whether contact or objectives are delayed by empty travel.
- Whether players describe the map as large and strategically open or simply empty, using their words where possible.

Include the build SHA, map revision, seat actions, and any missed resources or unusable building areas. Keep this iteration evidence separate from acceptance gates.

## Next QA proof

1. After Infra releases a safe host window and room, run the current-main two-seat Forked Vale path: both seats gather, build, produce, choose routes, contest a signal, observe the same winner, reconnect, and rematch. Record the deployment SHA, seat actions, failures, and both clients' result.
2. On the same current build, verify critical captions with audio disabled and with volume/effects at zero. Record the visible caption and cue on both settings paths; then observe whether players recognize the key cues.
3. Run the bounded renderer capture when the owning lane is ready; no Infra release is needed for appearance review. Staging asset delivery is now verified; capture the selected Meadow/Cinder states at both zooms and review the oak edge.
4. When the living-land prototype is runnable, record the exact build/map revision, both-seat paths, site-control time, harvest/exchange totals, resource state through leave/reconnect/restart/rematch, and player explanations; this experiment evidence does not gate unrelated PRs or current M1–M4 work.
5. When the large authored map is runnable, record the exact build/map revision, both-seat routes, explored areas, discovered resources, building spaces, first contact, and whether players find the map large or empty. This iteration evidence is not a PR gate.
6. Keep the 2,000-unit hosted gate separate: use a comparable intended-host run with server tick, browser frame, egress, order acknowledgement, and reconnect evidence after the quiet-host release.
7. Schedule the novice-pair protocol only after the outstanding tester availability choice is resolved; record player words without developer coaching.
