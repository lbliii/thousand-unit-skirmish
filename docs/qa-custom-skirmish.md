# Custom-skirmish milestone evidence

[Milestone requirements](custom-skirmish-milestone-plan.md) · [QA evidence standard](qa-vertical-slice.md)

## Current acceptance audit

The three feature lanes and combined integration are merged in main `eecc2d0`
([PR #289](https://github.com/lbliii/thousand-unit-skirmish/pull/289)). The table
records engineering acceptance and explicit observation limits; merged-main and
stable staging verification is recorded below. Unassisted human discovery and
listening remain explicit follow-up observations.

| Requirement | Authoritative evidence | Limit or remaining observation |
| --- | --- | --- |
| Terrain and resources | Final candidate layout passes: mirrored North 31 cells, South 30, Watch/crossing 20, including home collision. Browser proof selects the shipped terrain and verifies roster, resources and capture rules in its export. | No balance or human route-readability claim. |
| Paid economy, event chains, combat, result and rematch | Both winner variants of `fortified-crossing-combined.mjs` pass. Paid Barracks, infantry and research, nine delivered events, actual combat death, capture/hold result and clean rematch are asserted without modifying checkpoints. | Scripted commands establish behavior, not comprehension. |
| Patrol/Follow | PR #277 (`540785b`), [lane evidence](qa-persistent-orders-2026-09-30.md), plus combined mixed-speed Follow and Patrol/research/armed-event restart. | Follow is bounded catch-up, not a rigid convoy. |
| Visual authoring and completion trace | PR #274 (`8a93749`); final browser proof draws/names the crossing, configures nine events through typed forms, checks joined IDs, undo/redo, export/import/reopen, then verifies the authoritative published map ID. Focused completion tests cover initial completed state, simultaneous teams and recovery; guest trace privacy passes in the combined match. | Arbitrary scripts, variables and authored entity/death triggers remain deferred. |
| Automatic audio and execution lifecycle | PR #271 (`56011c4`), loader/serving/execution tests, distinct food/wood/repair clip browser test. Combined fresh host/guest have zero imported packs and available shipped bindings; native work scheduling, effects mute/resume, Stop silence and same-size reset pass. | Supplied technical clips prove hooks and delivery; no creative acceptance or human listening claim. |
| Recovery | Original seat tokens reclaim after restart with preserved intent, active paid research and delayed event state; Ember disconnect/reclaim and no duplicate event delivery pass. All three complete rendered scale cases recover both browser seats. | Loopback restart timing is not a hosted resilience budget. |
| Scale | Candidate `1f419d9` passes combined rendered 250/500/1,000-unit cases. [Retained report](qa/custom-skirmish-scale-2026-09-30.json) includes the diagnostic 2,000-unit construction-clearance failure and its measurements. | The 2,000 workload never reached economy/audio/combat/recovery; no supported capacity claim. |
| Hosted observation | Stable deployment `43b7af65-91d7-4008-9092-6cce5f78cd21`, source `6fa5c27`, passes a fresh invite and all thirteen browser checks. Azure-winning combined match passes on integration main `eecc2d0`. | No public matchmaking, internet impairment or unassisted-human claim. |
| Unassisted author and human pair | Not observed. | Actual people must establish discoverability and listening; automation cannot supply this evidence. |

## Reproduction commands

Run from the repository with Node 24 and local listening permitted:

```sh
node scripts/fortified-crossing-layout.mjs
node scripts/fortified-crossing-economy.mjs
node scripts/fortified-crossing-scale.mjs 20 250,500,1000,2000
# After all feature lanes integrate:
node scripts/fortified-crossing-combined.mjs 0
node scripts/fortified-crossing-combined.mjs 1
node scripts/fortified-crossing-browser.mjs
FORTIFIED_SCALE_RECORD=<output.json> node scripts/fortified-crossing-browser-scale.mjs 20 250,500,1000,2000
```

The economy test uses real paid orders and never injects checkpoint state. Its
worker and save directory are disposable. The scale runner publishes a derived
map with a distinct ID and the selected starting roster; it retains the terrain,
fog, resource and capture/event rules. It alternates converging attack-move and
withdrawal, samples health and reclaims both seats after restarting the worker.
Its JSON output identifies build, timestamp, Node/platform/CPU, workload duration,
rolling tick timing, planning, transport, checkpoint and applied notice latency.

These are loopback server diagnostics. They do not measure rendered frames,
audio callbacks, real network latency, player comprehension or supported hosted
capacity. Overlapping health windows are reported as such. Performance claims
require separately recorded conditions and browser evidence; a smoke run under
other active development workloads validates the runner only.

## Runner smoke, 30 September 2026

The 10-second 250-unit run on `b42b50e` plus the uncommitted runner
collected 20 health samples and four successful applied notices, then reclaimed
both original seats after restart. The runner revision is committed with this
record. Other development work was active on the host; this run is validation
of the runner, not a comparable performance baseline. No rendered client or
audio callback was measured.

## Combined proof preparation

The combined candidate assigns the supplied `rts-feedback-test` / `worker-actions`
v1 hash, arms each seat’s delayed Barracks and infantry-attack rewards, and joins
its completed research reward with its crossing reward before delivering field
reinforcement. The new combined scripts are prepared and syntax checked; they
remain unproven until the pending tactical and scenario contracts integrate.
The browser harness uses real disposable invite rooms and empty Chrome contexts,
form and pointer actions, export/import/reopen, published map assignment and
automatic guest delivery. It never establishes unassisted human usability.

## Combined author-to-invite browser, 30 September 2026

Candidate `559ce08` (main `8a93749` plus combined map/proof changes) passes
`node scripts/fortified-crossing-browser.mjs` in Chrome 154.0.8037.92 at
1280×720/DPR 1. A real disposable supervisor invite hosts the scenario. The
script removes the inherited event/region definitions using controls, draws a
14×8 Central Crossing at column 33/row 28, configures nine events with typed
forms, checks the exact joined source IDs, exercises undo/redo, exports and
imports its own file, closes/reopens/restores the draft, and saves it to the room.
The host and guest use independent empty Chrome contexts; both report the hashed
shipped profile ready with available binding sources and zero imported packs.
Neither context reports a runtime exception.

The initial runs corrected harness assumptions about invite URL format, import
status wording and native dialog-close event sequencing. The final run follows
the actual `?room=` invite format and waits for dialog close processing before
reopening. This proves browser authoring and automatic delivery; native playback
scheduling is supported by lane C’s separate fresh-context work-clip test. It
does not prove listening quality, unassisted authoring or hosted capacity.

## Combined authoritative match, 30 September 2026

Both `node scripts/fortified-crossing-combined.mjs 0` and `1` pass after all three
lane implementations integrate on main `540785b` plus the combined candidate.
Both seats build and gather, buy infantry and research, preserve Patrol and active
research across worker restart while construction relief is armed, Follow their
Scout into the crossing, reclaim Ember’s seat, receive the joined research/crossing
reinforcement, clear persistent intent with Stop/Hold, fight, finish capture/hold
victory, and rematch with fresh generations/resources/events/orders. Host trace
privacy and no duplicate event notifications are asserted. Checkpoint contents
are inspected but never modified.

The first Follow-arrival probe placed the Scout too near the region edge; one
Ember follower correctly stopped outside the three-unit condition. The final
probe moves the leader farther inside rather than changing the authored rule.
These scripted matches establish the engineering behavior, not player comprehension
or browser playback; those use their separate browser evidence.

## Final candidate authoring and audio lifecycle — 30 September 2026

Candidate `1f419d9` supersedes the earlier browser proof's narrow checks. The
earlier probe checked the dialog closing and editor fields; it did not establish
that the exact shipped Fortified terrain and exported draft reached the room.
The final probe selects Fortified Crossing with the normal map selector, verifies
its roster/resources/capture rules, and waits for the authoritative map ID on
both host and fresh guest. It passes all thirteen reported checks, including
native work playback, effects mute/resume, Stop silence and same-size reset.

The stronger probe exposed a real restore race: refreshing the audio profile
list briefly cleared a known selected profile and could reject publication.
The client now retains the selected profile during loading and invalidates stale
profile requests when a different pack list is opened. The editor help explains
automatic versioned shipped delivery and separate local-pack imports.

Harness iteration also parks the pointer away from edge scrolling and uses normal
zoom/Home controls so the commanded workers are within the camera's audio radius.
The browser test still cannot establish listening quality or unassisted discovery.

## Bounded rendered scale — 30 September 2026

Source `1f419d9266823fbf4d292f5f891bebe2e5c2ddde`, Apple M2/macOS,
Node 24.9.0, two independent Chrome 154.0.8037.92 processes, each 1280×720/DPR 1.
Each complete case warms up paid gathering/Barracks/research and the joined supply
chain before 20 seconds of attack-move, Patrol, Scout Follow and withdrawal.
Actual combat casualties, native work scheduling and both-seat restart recovery
are asserted. The coordinator launched no concurrent benchmark; background
desktop load is not isolated. Full data and limitations are in the retained report.

| Measured opening | Combat casualties | Tick p95 ms | Event evaluation p95 ms | Frame interval p95, Azure/Ember ms | Applied notice p95 ms | Both-seat recovery ms |
| --- | --- | --- | --- | --- | --- | --- |
| 250 | 118 | 1.889 | 0.077 | 16.7 / 16.7 | 3.8 | 574.9 |
| 500 | 123 | 2.711 | 0.279 | 16.8 / 16.8 | 4.2 | 572.8 |
| 1,000 | 203 | 3.393 | 0.308 | 16.7 / 16.7 | 4.8 | 571.1 |

The retained final planning histories have maximum slices 0.268/0.550/0.595 ms.
All-RAF callback p95 is 2.1/2.2, 2.9/2.7, and 3.4/3.3 ms; no browser long tasks
were observed. Native sampled-buffer starts are 26/31, 29/31 and 30/31; these
include other effects and are not exclusively work counts. Each case reports
39 health polls, no queued commands/backpressure disconnects or checkpoint write
failures, and inspected work decisions. Tick data is the last rolling 10-second
window, with 100 scenario-evaluated samples; planning history and transport totals
are bounded/cumulative diagnostics, not full-window percentiles or network rates.

The diagnostic 2,000 case starts at 1,996 units to allow later supply. It timed
out after the 120-second ordinary-movement clearance bound, with 999 living units
per seat after Scout supply. Even clearing only the actual 3×3 Barracks footprint
did not finish. Its final tick p95 is 5.254 ms, event evaluation p95 0.079 ms,
frame p95 16.7/16.7 ms, all-RAF CPU p95 3.7/3.7 ms, and no browser long tasks.
These are measurements of the failed warmup. Paid completion chains, work audio,
combat and recovery at 2,000 remain unproven. Prior broad-footprint probes also
failed; this is a recorded crowded movement/placement follow-up, not a passing
capacity result. The runner preserves each completed case and failure diagnostics
through `FORTIFIED_SCALE_RECORD` and exits nonzero on the ceiling failure.

Headless frame intervals do not establish windowed GPU performance. Loopback
applied notices do not establish internet latency. Probe overhead, fog-limited
rendered populations, casualties and overlapping inspector polls bound these
observations; retain the existing hosted support-profile work separately.

## Merged-main and hosted integration — 30 September 2026

The integration is merged in [PR #289](https://github.com/lbliii/thousand-unit-skirmish/pull/289),
main `eecc2d0cdd9f6214c886f65ff0a98c0492fc5735`. The Azure-winning combined
match passes on that actual main build; the Ember variant passes on final source
candidate `1f419d9`. Both include paid economy, delayed/research/region chains,
persistent intent and seat recovery, actual combat, capture/hold victory and
clean rematch. The final layout check passes with the mirrored distances above.

Railway reported `SUCCESS` for exact integration deployment
`7a3f3391-9730-47ce-8278-ac06ea0da601`. Staging subsequently advanced to the
Ellionar palm art merge `6fa5c27bcb5aa870528fed77e6cd8fd89c9a88ee` in deployment
`43b7af65-91d7-4008-9092-6cce5f78cd21`. The first browser observation overlapped
that transition and is not attributed to one build. A separate repeated proof
passes all thirteen checks while that latter deployment is `SUCCESS` before and
after the run. This is the stable hosted evidence at
`https://game-staging-21f9.up.railway.app`, using a fresh disposable invite, empty
host/guest contexts and the assigned test profile. No service password is recorded.

Reproduce using the existing staging service credentials, not a password in a
command or document:

```sh
FORTIFIED_STAGING_ORIGIN=https://game-staging-21f9.up.railway.app \
  railway run --project 32da8e2c-3377-49ed-8df0-45f72ecdc562 \
  --environment staging --service game --no-local -- \
  node scripts/fortified-crossing-browser.mjs
```

Final source candidate `1f419d9` passes all three integration CI shards in
[run 36758467927](https://github.com/lbliii/thousand-unit-skirmish/actions/runs/36758467927):
19m49s, 19m07s and 23m48s, including release packaging and the combined Azure
match regression. Engineering acceptance is complete with the recorded scale
and human-observation limits.
Production promotion was not performed. Unassisted authoring, human 1v1
comprehension and listening quality remain unobserved; these require actual
people, an identified build/map and concrete confusing or failed actions.
