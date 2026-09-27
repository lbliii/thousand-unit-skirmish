# Integrated core staging evidence — 2026-09-27

[QA plan](qa-vertical-slice.md) · [Testing guide](testing.md)

## Build and method

The automated hosted checks below ran against staging deployment
`7cfc4714-39a8-46a8-a235-ec0da5eaf523`, source
`8b6bcbbf338ce7a3fe20c85105aee37b56ad4c11`, at
`https://game-staging-21f9.up.railway.app`. Deployment identity and successful
status were checked before and after the match scenario. Production was unchanged.

The authenticated release smoke used `scripts/railway-smoke.mjs`. The gameplay
check used `scripts/qa-staging-smoke.mjs` in a newly created disposable invite
room, with a 250-unit army configuration and no stress flag.

## Observed outcomes

- Public readiness returned 200. Unauthenticated game/health access returned
  401; authenticated HTML, health, Three.js, audio, and environment assets
  returned 200. WebSocket authentication returned 401 without credentials and
  upgraded with 101 with credentials.
- Both 1v1 seats joined and reconnected successfully.
- The authored map `qa-staging-mujuk2a2` saved and reloaded.
- Both seats observed the elimination result and synchronized rematch reset.

The gameplay runner returned `status: passed` for all eight checks: readiness,
browser assets, invite creation, both seats, reconnect, map persistence,
elimination victory, and rematch.

## Scope and remaining proof

This is automated hosted behavior at the named build. It does not establish
unassisted human match completion, novice comprehension, or 2,000-unit
performance. Later camera reclaim, reinforcement retry, and building attack
range-boundary fixes require their own build-specific validation.

Local browser observations from this integration cycle are recorded separately
in [Barracks lifecycle evidence](qa-barracks-lifecycle-2026-09-27.md) and
[opening camera evidence](qa-opening-camera-2026-09-27.md). Those observations
do not certify deployed appearance.
