# Thousand Unit Skirmish

A browser RTS for solo play and invite-only 1v1 matches. Command armies, gather
food and wood, build production sites, and contest objectives on maps you can
edit and share. Node.js runs each room as an isolated authoritative match;
Three.js renders the battlefield.

## Run locally

Install **Node.js 24 or newer**, then run from the repository root:

```sh
npm ci
npm start
```

Open [localhost:4173](http://127.0.0.1:4173).

- **Play vs AI** starts a seeded match against the deterministic opponent.
- For a human match, create a **New room** and share its invite link. The first
  player is Azure; the second is Ember. Two tabs can exercise both seats locally.
- New PvP matches default to **Bellweather · Millrace**, a 24-unit economy and objective
  scenario. Azure can change the map, reset the match, and select larger armies.

For controls and the first match, read the [player guide](docs/playing.md).
For LAN access, configuration, and troubleshooting, see [local setup](docs/getting-started.md).

## Work on the project

```sh
npm test
```

This runs the repository's syntax, logic, gameplay, room, and release checks.
Browser captures and performance measurements are separate; see
[testing](docs/testing.md). Three.js is pinned in the lockfile and served locally.
There is no frontend build step.

| Task | Start here |
| --- | --- |
| Find a guide or contract | [Documentation index](docs/README.md) |
| Understand the code | [Architecture](docs/architecture.md) |
| Author maps and scenarios | [Map authoring](docs/map-authoring.md) |
| Choose the next improvement | [Roadmap](docs/roadmap.md) and [game bible](docs/game-bible.md) |
| Create or integrate art | [Asset guide](docs/assets.md) |
| Run a playtest | [QA and playtest plan](docs/qa-vertical-slice.md) |
| Operate a hosted build | [Deployment and recovery](docs/deployment.md) |

## Project status

The core includes food/wood gathering, construction and training, formation
orders, combat, fog of war, scenario events, elevation, forest clearing,
reconnects, and checkpoint recovery. Maps support up to 2,000 total units;
local stress tests do not establish hosted capacity or player readability.

The current priority is a dependable RTS core demonstrated in solo and human
matches. Public matchmaking, player accounts, campaigns, and broad faction
rosters remain outside the first slice. The [roadmap](docs/roadmap.md) separates
implemented systems from the player evidence still needed.
