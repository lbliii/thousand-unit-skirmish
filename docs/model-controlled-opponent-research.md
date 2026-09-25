# Model-controlled opponent: research checkpoint

**Status:** design draft only; no provider integration or game-server changes.
**Baseline reviewed:** `f1d6482` (`origin/main` as of 25 September 2026).
**Scope:** an optional opponent that proposes ordinary gameplay commands while the deterministic PvE bot remains the default and fallback.

## Decision and dependencies

Keep inference outside the 30 Hz simulation callback. The model receives a compact, versioned observation for one bot seat and may return one schema-constrained proposal. The authoritative server validates that proposal using the same command contract as a player command. The model cannot mutate simulation state, call tools, or run code.

Prototype work is gated on both of these:

1. The deterministic PvE owner lands the team-seat observation and validated-command contract: `OPPONENT_OBSERVATION_SCHEMA_VERSION = 1`, `toOpponentObservation(state, team, map)`, and the ordinary WebSocket command path. The API and example are not in `main` yet.
2. The producer reviews and approves the concrete prototype scope, provider choice, cadence, and token/cost ceilings.

This checkpoint does not edit shared server code. Its exact implementation dependency is the deterministic PvE bot-seat/command-contract PR; model integration should follow that PR, not precede it.

## Existing code seams and fog caveat

- `server.mjs:426-428` sets a 30 Hz simulation rate and a regular state cadence of every three ticks. That is a 33.3 ms tick budget and a 10 Hz regular snapshot interval.
- `roomPayload(viewTeam)` at `server.mjs:2065` is the closest existing observation source. With fog enabled and a real team seat, it filters enemy units, buildings, resource nodes, economy, research, and objective progress by visibility. `snapshotUnits` and `snapshotObjectives` contain additional team-aware filtering.
- The PvE owner has settled a safer adapter contract for its pending PR: schema version 1 and `toOpponentObservation(state, team, map)`, built from that bot seat's own welcome/state/map-change messages. The team comes from `welcome.player.team`; the DTO carries own/visible units and buildings, own economy/production/research, visible resource and objective summaries, map ID/dimensions, and the visibility mask. It omits hidden nodes, the raw map/spawn list, winner/connection fields, `victoryHold`, and `scenarioEvents`. Use this adapter after it lands; do not reconstruct a second observation from server internals.
- **Do not pass the complete `roomPayload(team)` to a model without an allow-list audit.** The baseline still includes both teams' `victoryHold.activeTeams` and `progressSeconds` at `server.mjs:2083-2087`, plus unfiltered `scenarioEvents.triggeredByTeam` at `server.mjs:2088-2100`. Objective ownership and prerequisite-owner fields also remain visible when a zone is unseen at `server.mjs:1656-1665`. These fields may be intentionally public, but that needs an explicit fog contract; otherwise omit or filter them in the bot DTO.
- Never use `roomPayload(null)`, a checkpoint, or the full map definition as model input. With fog disabled, the broadcast path sends a global payload; with fog enabled, unassigned/spectator views can still use `viewTeam = null` (`server.mjs:2842-2872`). Neither case defines the model's player-seat observation.
- `handleCommand(player, command)` at `server.mjs:4710-4728` dispatches normal gameplay actions through authoritative handlers. The inbound path parses and serializes commands through a per-peer queue at `server.mjs:5338-5355`. Model output must re-enter the same validated contract, not call simulation mutations directly.

## Observation proposal

Use a versioned, allow-listed plain-data DTO bound to one match and one bot seat. Include only:

- observation ID, schema version, team, and source tick;
- the seat's own resources, production, research, buildings, and units;
- enemy units/buildings and resource nodes currently visible to that seat;
- objectives and map facts the seat is allowed to know, plus its visible/explored mask;
- bounded, structured public match status needed for a decision.

Exclude hidden or global simulation state, enemy economy/research/roster counts, unseen resource locations, checkpoints, session tokens, connection details, player chat, raw map/scenario prose, and arbitrary strings that could act as instructions. If last-seen contacts are added later, label them explicitly with their last-seen tick and never present their old location as current.

Compact or aggregate large rosters to a measured size limit. Any unit or target reference accepted in a proposal must be a server-issued reference present in that exact observation; do not silently truncate references. The final DTO fields and reference format come from the deterministic PvE contract.

## Proposal schema and command mapping

The first experiment should follow the current bot contract's narrow action set: `wait`, `gather`, and `attackMove`. The PvE policy currently evaluates on a separate one-second interval with an explicit integer seed; model requests should use a slower, independently budgeted cadence. The provider response should be a strict JSON Schema discriminated union (`oneOf`, `additionalProperties: false`) with a schema version, the originating observation ID, and exactly one action. Its envelope is:

```json
{
  "schemaVersion": 1,
  "observationId": "server-issued opaque reference",
  "action": { "type": "wait" }
}
```

A `wait` action is valid; otherwise the action is one of the two supported command families. The team is bound by the bot seat and is not a model-supplied WebSocket command field. Exact `gather` and `attackMove` fields come from the landed PvE example.

Each action variant has only its required typed fields. Targets and unit references must come from the bound observation; coordinates must be finite and within map bounds. Do not accept free-form commands, explanations, tool names, endpoint URLs, scripts, or arbitrary nested payloads. Map each proposal to the deterministic bot's ordinary JSON command and send it through the existing WebSocket command path rather than creating a second game-command language.

On receipt, the server checks the response size and schema, observation age/version, match and seat binding, action allow-list, reference ownership/visibility, numeric bounds, and gameplay preconditions. It then passes the mapped proposal through the ordinary command validation and queue. A schema-valid proposal is not permission to skip server rules.

## Cadence, budgets, and execution boundary

Initial experiment values, to tune from measured cost and playtests:

- Ask for a decision at most once every **5 seconds** per bot seat (12 requests/minute maximum), not on each regular state snapshot.
- Permit **one in-flight request** per seat. Coalesce pending observations to the newest state; never build a backlog of stale decisions.
- Bound observation bytes/input tokens and response bytes/output tokens. Set explicit per-match request, token, and estimated-cost ceilings before enabling a provider; exhaustion turns model requests off for that match.
- Use asynchronous request I/O outside `simulateTick()`. Do not await, call a provider, build a large prompt, or apply a model result in the simulation callback. Bound DTO preparation and response parsing; measure event-loop/tick-start lag, and offload heavier preparation if it moves the tick budget.
- A result carries its observation ID and tick. Discard it if the seat/match changed, the response is stale, or a newer decision superseded it. Accepted results enter the same authoritative command queue as ordinary commands.

The provider adapter belongs server-side or in a separate trusted worker connected to the bot seat. Its credential belongs only in a server-side secret store or runtime environment. Never put provider I/O or its key in the browser, include the key in an observation, commit it, or log it. The experiment is off by default; CI and local deterministic tests use a fake provider. MCP may help with developer-time analysis but is not part of the match command path.

## Timeout and deterministic fallback

Start with a **2 second request deadline** and no immediate retry. On timeout, provider error, invalid/oversized output, schema or version mismatch, stale result, seat mismatch, budget exhaustion, or rejected command, discard the proposal and let the deterministic bot take its next due action. A decision slot must produce at most one command: never let the model and deterministic policy both act on the same observation. Late responses are dropped. Repeated failures can open a per-match circuit breaker; they must never stall the match or suppress the deterministic fallback.

## Measurement and comparison

Record bounded aggregate metrics per decision: model/version, observation bytes and token counts, response token count, provider latency, end-to-end decision age (source tick to command acceptance), schema/authority rejection reason, timeout/fallback reason, request count, and estimated cost using the selected provider's current rates. Do not retain raw prompts, credentials, or private player text in telemetry.

Compare the experiment with the deterministic bot on the same seeded maps and seats. Report request/cost per match, latency p50/p95, timeout and rejection rates, resource/build/production progress, objective outcomes, and tick duration/start-lag p50/p95/p99 at 250, 1,000, and 2,000 total units. Keep the game at its existing 30 Hz tick target; model work must not increase tick work or create command backlog.

## Test plan for the prototype checkpoint

1. **Fog boundary:** fixtures with hidden and visible enemy units, buildings, resource nodes, objectives, victory-hold activity, and scenario events. Assert hidden values are absent from the bot DTO and visible values appear only when the same seat can observe them. Assert `roomPayload(null)`, checkpoints, and full map data are never passed to the provider.
2. **Schema and authority:** accept each supported action variant; reject extra fields, unsupported/editor/reset commands, wrong team or match, stale observation IDs, unseen or unowned references, invalid numbers/coordinates, oversized lists, and unaffordable or otherwise illegal actions. Verify accepted proposals reach the ordinary authoritative handler.
3. **Faults and fallback:** fake timeout, provider error, malformed JSON, oversize response, invalid schema, stale late result, rejection, and exhausted token/cost budget. Each case must fall back once to the deterministic bot without blocking the match or duplicating a command.
4. **Scheduling:** prove no provider call or awaited model work runs from `simulateTick()`, only one request is in flight, observations coalesce, and late results cannot overwrite a newer seat decision.
5. **Regression and evaluation:** replay seeded cases for both team seats with fog on and off; preserve the deterministic bot's reproducibility and the existing human command path. Compare measured decision quality, request cost, latency, and tick metrics against the deterministic baseline at the game's small, normal, and stress sizes.

## Review gate

This note is the research checkpoint. Implementation starts only after the deterministic bot contract is stable and the producer approves the exact adapter, schema fields, provider, and budget. A prototype must remain optional, server-side, fog-safe, schema-constrained, and fully replaceable by the deterministic bot.
