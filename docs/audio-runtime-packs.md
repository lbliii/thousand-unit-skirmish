# Audio runtime and map packs

Audio Studio packs are installed in each browser's IndexedDB library. Legacy map audio references remain `{ "packId": "…", "profileId": "…" }`: export the pack and give every player its file to import locally. Shipped references add `version` and `sha256` together, and fetch their manifest and originals automatically from the same origin without an import. The map never embeds recordings. The game shows a missing-pack message and continues with synthesized cues if a pack or profile is absent. Browser storage is not a backup, so keep exported pack files.

Map Studio lists installed packs and their profiles. Publishing, saving, downloading, importing, reconnecting, and server restarts retain the map reference. Old maps omit the field and use the built-in synthesized soundtrack. The server validates stable IDs and rejects malformed references.

Bindings resolve from a role, action, and resource (for example `unit.worker.gather.wood`) to a role and action, then `cue.<name>`, then synthesis. Building selection first checks its exact building type. One selected group or issued order makes one decision, regardless of unit count. A profile can assign multiple variants; the resolver avoids an immediate repeat. Its voice cooldown is separate from synthesis, and urgent alerts can take priority. Captions use the binding's caption when present and the existing cue caption rules for fallback.

The match decodes local Blobs on demand, limiting each composition to 24 MiB of decoded PCM, keeping a 24 MiB decoded-source cache, and allowing at most eight simultaneous sampled cues. A source over 16 MiB, unsupported codec, invalid trim, or decode failure is reported in the sound panel and falls back to synthesis. Music compositions use the shared Web Audio timeline player; map switches stop prior playback. The master, effects, voice, music, and ambience controls are saved under `tus-audio-v1`. Existing settings migrate with voice at 100% and music from the previous ambience level, with a previously disabled ambience setting keeping music muted.

Focused checks: `node scripts/audio-runtime-scenario.mjs`, `node scripts/audio-runtime-playback-scenario.mjs`, `node scripts/audio-composition-player-scenario.mjs`, `node scripts/audio-policy-scenario.mjs`, and `node scripts/map-persistence-scenario.mjs`. The persistence check needs permission to bind a local loopback port.

## Unit lifecycle bindings

Supported lifecycle keys are `unit.<kind>.ready`, `unit.<kind>.death` and
`unit.worker.repair`; generic fallbacks are `cue.ready`, `cue.death`, and
`cue.repair`. Ready also falls back to existing `cue.complete` recordings.
All roster kinds use the same routing. Wood and food orders retain distinct
`unit.worker.gather.wood` and `unit.worker.gather.food` bindings.

Ready comes from a newly alive local unit generation; death requires an explicit
alive-to-dead local row. Missing enemy rows never mean death. Initial/reconnect,
map/reset and rematch baselines are silent; repeated or older ticks are ignored.
Each snapshot emits at most one representative of each lifecycle cue, and voice
samples are limited to two concurrently within the existing eight-sample budget.
Queue cancellations no longer masquerade as unit-ready sounds. Match defeat is
still separate from unit death. Tracked move/gather/build/repair/Stop/Hold/Patrol/Follow acknowledgements now wait for the authoritative applied `clientOrderToken` notice. Sending produces a neutral synthesized tick; planning is silent and rejected orders do not speak success. No per-unit sound-set overrides were added.

Check: `node scripts/audio-lifecycle-scenario.mjs`.

Stop and Hold Position orders use `unit.<kind>.stop` and `unit.<kind>.hold`,
then `cue.stop`/`cue.hold`, with synthesized stationary confirmation fallback.

## Shipped delivery and execution feedback

Map Studio offers the `rts-feedback-test` / `worker-actions` v1 profile as supplied
technical test material. Its manifest hash is listed in `src/audio-shipped-catalog.mjs`;
wood, food and repair use distinct existing UI recordings. These bindings prove the
runtime and are not creative acceptance of worker voices or final work sounds.
Shipped manifests are capped at 2 MiB, sources at 16 MiB and complete transfers at
64 MiB. Status, MIME, exact byte count, SHA-256, profile identity and safe same-origin
paths are checked, with a 30-second total fetch deadline. A two-pack LRU cache stays within 64 MiB; decoded samples retain
the separate 24 MiB bound. Load failures keep synthesized feedback. Local ID-only
references and portable pack export/import remain supported. Room uploads are absent.

Optional unit snapshot row 14 reports actual local wood/food gathering or repair execution,
not travel or an issued task. Fogged enemy execution is withheld. The client selects
living local workers within 24 world units of the camera, aggregates by resource,
and schedules at most three short work decisions every 1.5 seconds. Task changes,
death, reset, disconnect, pack switches, hidden pages and muting stop samples and
invalidate pending decodes. Continuous playback comes from fresh observed snapshots,
so there is no unattended timer or per-worker looping node.

The sound panel's inspector exposes profile bindings, source availability, load
status, active samples/voices/work, decoded bytes and the last 24 decisions. Decisions
identify binding/speech cooldowns, muted or locked playback, voice/sample limits,
decode failures and synthesized fallback.

Checks: `node --test scripts/audio-shipped-loader.test.mjs scripts/audio-execution.test.mjs`,
`node scripts/audio-runtime-playback-scenario.mjs`, `node scripts/audio-shipped-serving-scenario.mjs`, and owner-run
`node scripts/audio-shipped-browser.mjs`. The browser check uses two independent
empty browser contexts: each fetches verified content, decodes all three distinct
work bindings and stops them without importing a pack. It proves browser playback
scheduling, not a human listening or discoverability session.
