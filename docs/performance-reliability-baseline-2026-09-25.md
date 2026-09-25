# Performance and reliability baseline — 25 September 2026

This checkpoint records the merged local baseline and defines the next measurable gate. Performance numbers below are synthetic localhost results unless explicitly labeled otherwise; they do not establish Railway capacity or internet behavior.

## Source and machine

| Field | Value |
| --- | --- |
| Source | `f1d648205aa9523aa055e711553bf139e5bd909f` |
| Checkout | Clean at start; `HEAD` and local `origin/main` matched. The producer independently verified GitHub `refs/heads/main` at the same SHA during this checkpoint. |
| Machine | MacBook Pro, Apple M2, 24 GB RAM; macOS 26.6.2, arm64 |
| Runtime | Node v24.9.0; Chrome 153.0.8010.53 (headless for browser measurements) |
| Harness | `game-dev` 1.0.2; project adapter 0.23.0, SHA-256 `897c3d5f323e35c8957b469e33dd57766544843d8e92ce1aa7310c5558692ced` |
| Release package | `npm run release:pack` passed cleanly; source revision `f1d6482`; digest `sha256:38edad06e96efe1f6618a42fdbbbaecf7ec977e672b9f3ae2ed0701852a6618f` |

This worktree's direct `git ls-remote` attempt could not resolve `github.com`; the producer's separate read-only remote check confirmed the same SHA. QA reports that staging is also on `f1d6482`; the results in this document are local and do not certify that deployment.

## Results

| Profile | Result |
| --- | --- |
| `npm ci --offline` and `npm test` | Passed. The suite covered syntax and logic checks, two-room isolation, configured room-cap enforcement, worker recovery, reconnect seats, and Railway startup/release guards. The room scenario reported two live invite workers. |
| Checkpointed movement | Passed three 12-second windows on the 64×64 Open Field map with 1,000 units per team and one-second checkpoints. Tick p95 ranged 6.311–8.871 ms; each window's tick maximum ranged 10.005–24.611 ms; maximum tick-start lag across the windows was 52.614 ms. Checkpoints were 1,624,191–1,627,056 bytes; capture took 0.564–0.773 ms, deferred serialization 2.869–3.519 ms, and atomic writes 11.871–12.150 ms. The verified run is `run_1790353434546_2df9986e5dbb489ea0b7977adbbb8eb8`, manifest SHA-256 `278be34ef5656c3812d6732ee6f9d705db82b9fd22697d9906e0dbca35bfc24c`; `game-dev capture verify` passed. |
| Checkpointed attack-move | Failed its existing 99.999 ms single-tick ceiling at 187.704 ms (tick 609); measured simulation phase was 185.788 ms and process CPU was 6.037 ms. Host load averages at the failure were 24.01 / 11.74 / 8.94. Preserve this as QA-002 evidence; it suggests host scheduling pressure but does not prove a cause. The failed run bundle is `run_1790353493932_e572663ed9a747fca23d041a9157abdf`, manifest SHA-256 `c6e773ca458f00a0d1adddbc047fe3dccb395103536100384bdedfb4301eeba1`. |
| Snapshot bandwidth | Passed a 10-second, two-client Open Field run with 2,000 visible moving units. Each seat received 98 snapshots (9.8/s); mean / p95 / max JSON payload was 119,703 / 120,744 / 121,144 bytes. Compressed server egress was 308.43 KiB/s combined (about 154.2 KiB/s per seat), 86.5% below the uncompressed equivalent. Server tick p50 / p95 / max was 2.418 / 6.395 / 13.940 ms; tick-start lag p95 / max was 2.629 / 10.566 ms. Wire totals include WebSocket frame headers, but exclude TCP/IP and TLS. |
| Browser rendering | Passed three 10-second movement waves with 2,000 visible units. Headless Chrome frame-interval p50 / p95 / p99 was 16.7 / 16.7 / 16.8 ms; animation callback CPU p95 was 3.5 ms; no tasks exceeded 50 ms. This does not measure windowed presentation, GPU completion, or command acknowledgement latency. |
| Seat reconnect | `scripts/resume-session-scenario.mjs` passed seven checks: duplicate-token spectator handling, opponent-seat protection, peer notification on release, original identity reclaim within grace, seat replacement after expiry, rejection of the expired token, and independent opponent reconnect. |
| Slow-reader recovery | The backpressure scenario published a 820,255-byte map to a paused client. The 4 MiB per-peer queue peaked at 3,525,269 bytes, the server disconnected that reader once, then reclaimed the same Azure seat and returned the active map plus 1,000 visible units. This tests a slow/disconnected reader and session recovery; it is not a packet-loss simulation. |

The movement and attack-move results were collected while other team tasks were active. The browser profile began at load averages 14.12 / 10.83 / 8.94 and still passed its browser budgets. The game-dev summary verifies sealed artifact hashes and deterministic reductions, but marks hardware performance evidence as not admitted. Treat these as local diagnostic measurements, not target-hardware proof or causal attribution.

## Reproduction

Run one timed profile at a time and record the machine and commit. Preserve each game-dev run directory and verify successful captures before comparing them.

```sh
npm ci
npm test
npm run release:pack

game-dev scenario run checkpoint-move-2000 --project . --confirm --allow-performance --jsonl
game-dev performance summarize RUN_ID --json
game-dev capture verify RUN_ID --json

game-dev scenario run checkpoint-attack-move-2000 --project . --confirm --allow-performance --jsonl
```

For the snapshot scenario, start a dedicated server in one terminal with an external custom-map directory, wait until `/health` responds, then run the client scenario in another terminal. Waiting for readiness avoids a startup race in the client harness.

```sh
mkdir -p /tmp/rts-baseline-maps
RTS_HOST=127.0.0.1 RTS_MAP=maps/open-field.json PORT=4174 \
  RTS_TICK_DIAGNOSTICS=1 RTS_CUSTOM_MAP_DIRECTORY=/tmp/rts-baseline-maps node server.mjs
```

```sh
curl -fsS http://127.0.0.1:4174/health
node scripts/network-snapshot-scenario.mjs 4174 10
node scripts/browser-performance-scenario.mjs 10
node scripts/resume-session-scenario.mjs
```

To repeat slow-reader recovery against that dedicated server, run `node scripts/performance-scenario.mjs 4174 10 1 map-backpressure slow`.

## Next gate

**Re-run QA-002 attack-move on a quieter host window** against the same source, machine, Open Field map, 2,000-unit roster, and three 12-second checkpointed windows. Record load averages before and after. Pass only if every window stays within the existing 33.333 ms tick-p95 and tick-start-lag-p95 budgets, the 100 ms maximum-tick/start-lag/planning-stage ceilings, zero checkpoint failures, and observed combat damage. Compare tick phase time, process CPU, and start lag with the failed bundle; do not infer cause from one run.

After that local gate, establish hosted capacity with QA on a closed disposable staging room. Before running, agree on the Railway machine/CPU budget, CPU and egress stop thresholds, and a staging window. Start with one 2,000-unit room; increase concurrency only while each prior step stays within the agreed thresholds, and stop at the first breach or configured room cap. Record command-ack p50/p95, tick p50/p95/max, per-seat snapshots and egress, and reconnect time under the QA plan's 80 ms RTT / 1% packet-loss condition. Current local evidence verifies room-cap behavior and two-worker isolation only; it does not measure simultaneous 2,000-unit room capacity. Keep production on manual promotion.
