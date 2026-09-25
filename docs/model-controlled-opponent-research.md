# Model-controlled opponent: research checkpoint

**Status:** design draft only; no provider integration or game-server changes.
**Baseline reviewed:** `216a466` (locally cached `origin/main` after merges #25/#27; performance reference data was collected on `f1d6482`).
**Scope:** an optional opponent that proposes ordinary gameplay commands while the deterministic PvE bot remains the default and fallback.

## Decision and dependencies

Keep inference outside the 30 Hz simulation callback. The model receives a compact, versioned observation for one bot seat and may return one schema-constrained proposal. The authoritative server validates that proposal using the same command contract as a player command. The model cannot mutate simulation state, call tools, or run code.

The shared gameplay contract PR [#25](https://github.com/lbliii/thousand-unit-skirmish/pull/25) and PvE adapter PR [#27](https://github.com/lbliii/thousand-unit-skirmish/pull/27) are integrated in main at `216a466`; the exact #27 source head was `396f632`. This refresh checks the merged adapter and schema. Prototype work remains gated on producer approval of the concrete scope, provider, cadence, actions, and token/cost ceilings.

This checkpoint does not edit runtime code. Model integration follows the merged PvE adapter and its gameplay contract, not a parallel command path.

## Existing code seams and fog caveat

- `server.mjs:426-428` sets a 30 Hz simulation rate and a regular state cadence of every three ticks. That is a 33.3 ms tick budget and a 10 Hz regular snapshot interval.
- `roomPayload(viewTeam)` at `server.mjs:2065` is the closest existing observation source, but the model should consume the narrower PvE adapter rather than the whole payload. Peer snapshots filter enemy units, buildings, and resource nodes by the assigned team's visibility; the PvE adapter applies that peer-scoped state and the static public objective zones.
- The stable bot/model contract is `toOpponentObservation(state, team, map)` with `OPPONENT_OBSERVATION_SCHEMA_VERSION = 1` in `src/pve-opponent.mjs` (PR #27). Call it only on the assigned peer's `welcome.state`, `state`, or `mapChange.state`, with `team` from `welcome.player.team`. The bot uses the ordinary WebSocket command path and never supplies a team field.
- **Use the v1 allow-list, not the full `roomPayload(team)`.** Under current human fog rules, objective IDs/zones/owners/prerequisite owners are public; victory-hold state is derived from public objective ownership and the scenario clock, and map-wide event state or capture attribution is public when it comes from a public capture. These are not current hidden-state leaks. PvE v1 still omits global `victoryHold`, `scenarioEvents`, match clock, and winner fields by design; adding them requires an explicit schema review. For each objective, the adapter reports counts only from individually observable units and includes capture `progressTeam`/`progress` only when the entire zone is visible.
- Never use `roomPayload(null)`, a checkpoint, or the full map definition as model input. With fog disabled, the broadcast path sends a global payload; with fog enabled, unassigned/spectator views can still use `viewTeam = null` (`server.mjs:2842-2872`). Neither case defines the model's player-seat observation.
- `handleCommand(player, command)` at `server.mjs:4710-4728` dispatches normal gameplay actions through authoritative handlers. The inbound path parses and serializes commands through a per-peer queue at `server.mjs:5338-5355`. Model output must re-enter the same validated contract, not call simulation mutations directly.

## Observation proposal

Use the merged PvE adapter as the only game-state input. Its exact v1 top-level allow-list is `{ schemaVersion, team, tick, map, fogOfWar, visibility, resources, units, buildings, workerProduction, research, resourceNodes, objectives }`, with `schemaVersion: 1` and `map: { id, width, height }`. `units` and `buildings` each contain `friendly` and `visibleEnemies`; `resources` contains only the assigned team's food and wood. It also contains that team's worker production and research, currently visible resource nodes, and public objective metadata for every zone: ID, zone rectangle, owner, victory flag, and prerequisite fields. With fog enabled, each objective's `unitCounts` is counted from the adapter's filtered unit list (own units plus currently visible enemies); those are partial observable counts, not total zone occupancy, and unseen enemies do not contribute. With fog disabled, all units are observable. `progressTeam` and `progress` are included only when fog is off or the objective's entire zone is visible, and are omitted for partially visible or hidden zones.

The adapter may inspect static map resource IDs/coordinates and public objective zones to attach coordinates to peer-visible resources and decide whether a zone is fully visible; it emits only map ID/dimensions plus those public zone rectangles. Never send the provider the raw `welcome`, `mapChange`, map, map catalog, spawn list, or checkpoint. The DTO has no match clock/outcome, global objective-owner summary, victory-hold state, scenario-event state, session token, connection data, opponent economy, hidden unit/building/resource data, unobservable enemy counts, or capture progress from a zone that is not fully visible. Per-objective public owner and prerequisite-owner fields are included. It has no free-form scenario prose that could act as instructions. If last-seen contacts are proposed later, label them with their last-seen tick and obtain producer approval before adding them.

## Proposal schema and command mapping

The first experiment should follow the current bot contract's narrow action set: `wait`, `gather`, and `attackMove`. The deterministic PvE policy currently evaluates on a separate one-second interval with an explicit integer seed; model requests should use a slower, independently budgeted cadence. The provider response should be a strict JSON Schema discriminated union (`oneOf`, `additionalProperties: false`) with a proposal-protocol version, a server-generated request correlation ID, and exactly one action. The request ID is not a new PvE DTO field; the server binds it to the match, seat, DTO schema, and source tick. An envelope example is:

```json
{
  "proposalSchemaVersion": 1,
  "requestId": "server-issued opaque reference",
  "action": {
    "type": "gather",
    "ids": [23],
    "nodeId": "visible-wood"
  }
}
```

A successful `wait` consumes that decision slot without issuing a command. Otherwise the action union is limited to the two command shapes in the PvE contract:

```js
{ type: 'gather', ids: [unitId], nodeId: 'visible-resource-id' }
{ type: 'attackMove', ids: [unitId, ...], x: 0, z: 0 }
```

The team is bound by the server-assigned bot seat and is not model-supplied. Do not let the model set `clientOrderToken`; the trusted bot adapter may attach one for acknowledgement. For large armies, derive any bounded model request view from the v1 DTO only, preserve a server-side mapping for every actionable unit/group reference, and reject actions that refer outside that exact view. Confirm grouping and per-action caps with the producer before prototype work.

Each action variant has only its required typed fields. Unit IDs and resource-node IDs must come from the bound v1 observation; coordinates must be finite and within map bounds. Do not accept free-form commands, explanations, tool names, endpoint URLs, scripts, team/seat fields, client order tokens, or arbitrary nested payloads. Map each proposal to the deterministic bot's ordinary JSON command and send it through the existing WebSocket command path rather than creating a second game-command language.

On receipt, the server checks the response size and schema, request-ID binding and age, DTO version, match and seat, action allow-list, reference ownership/visibility, numeric bounds, and gameplay preconditions. It then maps the action to the ordinary `gather` or `attackMove` JSON command and sends it through the trusted bot seat's WebSocket, where normal command validation and queueing still apply. A schema-valid proposal is not permission to skip server rules.

## Cadence, budgets, and execution boundary

Provisional limits for a local research prototype, for producer review only. These values do not authorize provider use; model mode stays off until the provider and limits are approved:

- Ask for a model decision at most once every **5 seconds** per bot seat (12 requests/minute maximum), not on each regular state snapshot.
- Permit **one in-flight request** per seat. Coalesce pending observations to the newest state; never build a backlog of stale decisions.
- Cap a match at **120 sent requests**, **256 KiB** of serialized v1 observation per request, **65,536 estimated input tokens** per request (including the system prompt), and **256 output tokens / 4 KiB** of response JSON. Enforce both input limits; if either is exceeded, skip that proposal and let the deterministic policy act. Never truncate away observation fields to fit.
- Propose a **$1.00 estimated-cost ceiling per match**. Before sending, reserve the provider-priced worst-case cost for the input estimate and full output allowance; settle against reported usage afterward. If the selected provider cannot give a conservative estimate or usage, or the reservation would exceed the remaining cap, do not send the request. Count every sent request, including timeouts, against the request cap; after any cap is reached, keep the deterministic bot active for the rest of the match.
- The byte ceiling is a provisional envelope informed by the merged baseline's 120,744-byte p95 full snapshot at 2,000 visible moving units; it is not a measurement of the PvE DTO. Measure actual v1 DTO bytes and token estimates at each supported roster size before provider use. If an observation exceeds the envelope, skip inference rather than dropping visible state.
- Use asynchronous request I/O outside `simulateTick()`. Do not await, call a provider, build a large prompt, or apply a model result in the simulation callback. Bound DTO preparation and response parsing; measure event-loop/tick-start lag, and offload heavier preparation if it moves the tick budget.
- A result carries its request ID; the server-side request record binds that ID to the v1 DTO tick, seat, and match. Discard it if that binding changed, the response is stale, or a newer decision superseded it. Accepted results enter the same authoritative command queue as ordinary commands.

The provider adapter belongs server-side or in a separate trusted worker connected to the bot seat. Its credential belongs only in a server-side secret store or runtime environment. Never put provider I/O or its key in the browser, include the key in an observation, commit it, or log it. The experiment is off by default; CI and local deterministic tests use a fake provider. MCP may help with developer-time analysis but is not part of the match command path.

## Timeout and deterministic fallback

Start with a **2 second request deadline** and no immediate retry. A valid `wait` is a successful no-op for that slot. On timeout, provider error, invalid/oversized output, schema or version mismatch, stale result, seat mismatch, budget exhaustion, or rejected command, discard the proposal and let the deterministic policy take its next due action. A decision slot must produce at most one command: never let the model and deterministic policy both act on the same observation. Late responses are dropped. Repeated failures can open a per-match circuit breaker; they must never stall the match or suppress the deterministic fallback.

## Measurement and comparison

The locally cached `origin/main` includes `docs/performance-reliability-baseline-2026-09-25.md` at `322e68e` (PR #24), measured against game source `f1d6482`. Its 10-second, two-client Open Field profile with 2,000 visible moving units recorded 98 snapshots per seat (9.8/s), 120,744-byte p95 JSON payloads, 308.43 KiB/s combined compressed server egress, tick p50/p95/max of 2.418/6.395/13.940 ms, and tick-start-lag p95/max of 2.629/10.566 ms. These are synthetic localhost diagnostics on an Apple M2, not hosted-capacity or target-hardware evidence. Use the same profile and machine for the no-model versus model-mode comparison where possible; keep provider latency, decision age, request counts, and estimated cost as additional measurements.

Record bounded aggregate metrics per decision: model/version, observation bytes and token counts, response token count, provider latency, end-to-end decision age (source tick to command acceptance), schema/authority rejection reason, timeout/fallback reason, request count, and estimated cost using the selected provider's current rates. Do not retain raw prompts, credentials, or private player text in telemetry.

Compare the experiment with the deterministic bot on the same seeded maps and seats. Report request/cost per match, latency p50/p95, timeout and rejection rates, resource/build/production progress, objective outcomes, and tick duration/start-lag p50/p95/p99 at 250, 1,000, and 2,000 total units. Keep the game at its existing 30 Hz tick target; model work must not increase tick work or create command backlog.

## Test plan for the prototype checkpoint

The merged `scripts/ci.mjs` includes `scripts/pve-opponent-scenario.mjs`. Its fog fixtures and both-seat WebSocket smoke already check public objective metadata in hidden zones, individually observable unit counts, and omission of capture progress until full-zone visibility. Prototype tests below extend that contract through provider forwarding, request binding, scheduling, and fallback.

1. **Fog boundary:** fixtures with visible and hidden enemies/resources, public objective IDs/zones/owners/prerequisites, and hidden, partially visible, and fully visible objective zones. Assert public objective metadata remains present for every zone; under fog, `unitCounts` matches only own units and currently visible enemies (including zero counts for the hidden fixture), while no-fog counts use all units; `progressTeam`/`progress` appear only for fully visible zones; global victory-hold, scenario-event, winner, and clock fields remain absent from v1. Assert the provider never receives `roomPayload(null)`, checkpoints, raw welcome/map-change messages, or full map data.
2. **Schema and authority:** accept `wait`, `gather`, and `attackMove`; reject extra fields, unsupported/editor/reset commands, model-supplied team or order tokens, wrong request/match/seat bindings, stale request IDs/ticks, unseen or unowned unit/resource references, invalid numbers/coordinates, oversized lists, and unaffordable or otherwise illegal actions. Verify accepted proposals reach the ordinary WebSocket validation path.
3. **Faults and fallback:** fake timeout, provider error, malformed JSON, oversize response, invalid schema, stale late result, rejection, and exhausted token/cost budget. Each case must fall back once to the deterministic bot without blocking the match or duplicating a command.
4. **Scheduling:** prove no provider call or awaited model work runs from `simulateTick()`, only one request is in flight, observations coalesce, and late results cannot overwrite a newer seat decision.
5. **Regression and evaluation:** replay seeded cases for both team seats with fog on and off; preserve the deterministic bot's reproducibility and the existing human command path. Compare measured decision quality, request cost, latency, and tick metrics against the deterministic baseline at the game's small, normal, and stress sizes.

## Review gate

This note is the research checkpoint. Implementation starts only after the deterministic bot contract is stable and the producer approves the exact adapter, schema fields, provider, and budget. A prototype must remain optional, server-side, fog-safe, schema-constrained, and fully replaceable by the deterministic bot.
