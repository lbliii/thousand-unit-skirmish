# Persistent tactical order evidence — 30 September 2026

[QA](qa-vertical-slice.md) · [Testing](testing.md) · [Game rules](game-bible.md#stationary-army-orders)

Source: `codex/patrol-follow-orders`, based on main `d595708`. Local Node 24.9.0,
macOS and installed headless Chrome. Both Azure and Ember connect to disposable
local workers with separate sessions; no production rooms or paid services are
used. The committed scripts reproduce each recorded check.

## Authoritative and policy checks

`node scripts/persistent-command-scenario.mjs` passed both-seat outbound/return
Patrol, generation and ownership rejection, Follow movement, checkpoint restart
with reclaimed seats, Hold interruption, rematch generation reset, live Patrol
combat acquisition and route resumption after the enemy worker dies. The final
fixture also places a paid unfinished Barracks on a Patrol endpoint, observes
`BLOCKED`, cancels construction and observes resumed movement. This fixture
publishes Open Field geometry with 350 food and 400 wood per seat, allowing
construction to spend actual starting resources.

`node --test scripts/persistent-command.test.mjs scripts/stationary-command.test.mjs`
passed the persistent-order safety and existing Stop/Hold checks. Policy fixtures
cover leader death, generation replacement and team change; Follow's deadband and
non-aggressive semantics; global 64-unit persistent replan admission; disconnected
route retry; combat detour retention; indirect Follow cycles; and the explicit
missing-intent default for older schema-19 checkpoints.

## Browser controls and planning bound

`node scripts/persistent-command-browser.mjs` passed in two isolated browser
profiles on a 1,000-total-unit Open Field match. Both players used keyboard Patrol,
a ground target, visible selected-order summary, Hold, the Follow button, a real
pointer target on a friendly rendered unit and keyboard Stop. No client runtime
error was present. The sampled health history contained nine persistent planning
jobs; the largest admitted batch was 33 units, below the 64-unit per-tick cap.
The script checks that cap on actual planning samples as well as in the policy
fixtures. This is an owner-run UI smoke with large selections, not a comparable
performance benchmark.

## Limits

These checks use the existing roster and placeholder presentation. Follow is a
bounded catch-up order, not a rigid convoy or shared-speed formation. Patrol has
two endpoints per unit; arbitrary editable looping waypoint routes remain future
work. Disconnected routes retain visible blocked intent and retry; a lost leader
ends Follow in Stop. Automated policy fixtures establish dead/replaced-leader
behavior separately from the live both-seat match. The combined Fortified
Crossing proof, hosted scale measurements and unassisted human discoverability
remain milestone-level work and are not claimed by this lane's local evidence.
