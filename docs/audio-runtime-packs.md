# Audio runtime and map packs

Audio Studio packs are installed in each browser's IndexedDB library. A map's optional `audio` field contains only `{ "packId": "…", "profileId": "…" }`. The map never embeds recordings. Export the pack from Audio Studio and give every player the pack file separately; each player imports it locally. The game shows a missing-pack message and continues with synthesized cues if a pack or profile is absent. Browser storage is not a backup, so keep exported pack files.

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
still separate from unit death. Repair is an issued-order acknowledgement, as
are the existing move/gather cues; server acceptance and looping work/hurt sounds
remain follow-up work. No sound files or per-unit sound-set overrides were added.

Check: `node scripts/audio-lifecycle-scenario.mjs`.

Stop and Hold Position orders use `unit.<kind>.stop` and `unit.<kind>.hold`,
then `cue.stop`/`cue.hold`, with synthesized stationary confirmation fallback.
