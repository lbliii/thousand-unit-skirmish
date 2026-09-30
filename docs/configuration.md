# Configuration reference

[Documentation index](README.md) · [Local setup](getting-started.md) · [Deployment](deployment.md)

Values below describe source defaults. Compose and a hosted service can override
them. The definitions in `room-supervisor.mjs`, `server.mjs`, `origin-policy.mjs`,
and `src/pve-match.mjs` are authoritative.

## Server and room settings

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `4173` | Public supervisor port, or direct worker port. |
| `RTS_HOST` | `127.0.0.1` | Listening interface; use `0.0.0.0` for LAN/container access. |
| `RTS_PUBLIC_ORIGINS` | Local matching origins | Comma-separated browser-facing full origins. Required for non-loopback/custom hosts unless the Railway domain supplies one. |
| `RTS_MAP` | `maps/bellweather-millrace.json` | Initial shipped map; existing checkpoints may restore another map. |
| `RTS_MAX_ROOMS` | `4` | Invite-room cap in addition to the default room. |
| `RTS_ROOM_IDLE_TTL_MS` | `21600000` | Six-hour idle expiry for invite-room data. |
| `RTS_MAX_PEERS` | `32` | Connections per worker, including spectators; valid range 2–256. Compose defaults to 16. |
| `RTS_SESSION_GRACE_MS` | `120000` | Seat reconnect window; valid range 1,000–3,600,000 ms. |
| `RTS_ROOM_DATA_DIRECTORY` | `room-data/` locally | Supervisor room records and checkpoints; defaults under the volume on Railway. |
| `RTS_CUSTOM_MAP_DIRECTORY` | `custom-maps/` locally | Default-room/direct-worker authored maps; must be outside `maps/`. |
| `RTS_MATCH_STATE_PATH` | Unset for direct worker | Checkpoint path assigned by the supervisor; keep separate from map directories. |

## Hosted access

| Variable | Purpose |
| --- | --- |
| `RTS_ACCESS_USER` | Shared Basic Auth username; defaults to `players`. |
| `RTS_ACCESS_PASSWORD` | Shared password; Railway startup requires at least 16 characters. Store it in service variables. |
| `RAILWAY_VOLUME_MOUNT_PATH` | Persistent storage root supplied by Railway; configure the volume at `/app/data`. |
| `RAILWAY_PUBLIC_DOMAIN` | Public hostname used by the origin policy. |
| `DOMAIN`, `RTS_ACCESS_PASSWORD_HASH` | Compose/Caddy hostname and Argon2id hash. These differ from Railway's plaintext service secret. |

## Diagnostics and solo launch

| Variable | Effect |
| --- | --- |
| `RTS_TICK_DIAGNOSTICS=1` | Enable detailed tick diagnostics. |
| `RTS_SEPARATION_DIAGNOSTICS=1` | Enable neighbor/separation work counters. |
| `RTS_SHARED_MOVE_PATHS=0` | Disable shared move paths for comparison. Normal runs leave this enabled. |
| `RTS_GAME_MODE=pve` | Direct-worker deterministic opponent mode. Default is `pvp`. |
| `RTS_PVE_MAP_SEED`, `RTS_PVE_POLICY_SEED` | Required unsigned 32-bit seeds for direct PvE launch. The normal Play vs AI flow supplies them. |
| `CHROME_PATH` | Browser executable for supported capture/scenario scripts. |

Browser measurement budgets can be overridden with `RTS_FRAME_P95_BUDGET_MS`,
`RTS_ANIMATE_P95_BUDGET_MS`, and `RTS_LONG_TASK_COUNT_BUDGET`. Record overrides
with each result; see [testing](testing.md).

## Fixed limits

These require code/schema changes, rather than environment configuration:

- 2,000 total living units and at most 1,000 per team; queued production reserves capacity.
- Eight queued waypoints per unit.
- Map dimensions 16–256 cells on each axis.
- 4,096 obstacle rectangles, 4,096 terrain patches, and 4,096 elevation patches.
- 128 ordinary resource nodes, 32 capture objectives, and 32 scenario events.
- 16 saved custom maps per room.
- 4 MiB outbound queue per peer; 64 pending commands per peer.

See [map authoring](map-authoring.md) for field-specific validation and
[the command contract](gameplay-command-observation-contract.md) for order semantics.
