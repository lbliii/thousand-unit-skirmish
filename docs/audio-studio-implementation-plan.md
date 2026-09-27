# Audio Studio implementation plan

27 September 2026. User-authorized implementation; start each lane from current
`origin/main` (observed `f25be5a`). Existing [sound direction](audio-kit-plan.md)
and [runtime guide](audio-design.md) remain separate from this implementation plan.

## Outcome and scope

An author can import raw audio, preserve originals, assign character/building
responses, arrange isolated instrument clips into a saved composition, attach
an audio profile to a map, and hear the result in a match after a reload.
Use small locally synthesized WAV fixtures for validation. No paid generations,
provider credentials, new market gameplay, or note-level instrument synthesis
are required. A market is an example of future building-specific sound mapping.

First version is a clip arranger. It supports individual instrument recordings
and phrases; a sampler/piano roll is a later extension. The authoring UI belongs
alongside Map Studio and must not obscure an ordinary match.

## Three implementation lanes

| Owner | Files and outcome | Proof |
| --- | --- | --- |
| Sol: library | New `src/audio-assets.mjs`, `src/audio-library-store.mjs`, `src/audio-library-ui.mjs`, `audio-studio.html`, `src/audio-studio.mjs`, `src/audio-studio.css`; pack format, IndexedDB persistence, import/export, searchable library, assignment editor and composer mount point. | Import, reload, preserve bytes, export/import into empty store; clear failures for invalid references/oversized input. |
| Sol: runtime/maps | Existing `src/audio.mjs`, `src/audio-policy.mjs`, `src/main.js`, `server.mjs`, game HTML/styles, map editor serialization, Docker/static delivery when needed; new `src/audio-event-profile.mjs` and `src/audio-composition-player.mjs`. | Worker selection and wood order choose correct variants, one response per group, building-specific selection, map music restored, synthesized fallback and old maps intact. |
| Sol: composer | New `src/audio-composer.mjs`, `src/audio-composition.mjs`, `src/audio-composer.css`; timeline editor, project validation, timing and WAV mix export. | Arrange two tracks, trim/loop/mute/pan, save/reopen identical project, shared-clock playback and correct exported duration. |

Each lane owns its focused tests and one separate guide (`audio-library.md`,
`audio-runtime-packs.md`, `audio-composer.md`). Coordinator owns this plan, central
documentation index, CI registration, final cross-lane regression and integration.
No agent rewrites another lane's files. Concrete contract blockers go only to the
affected owner. Implement against the contract while dependencies are in flight.

## Shared v1 contract

Use JSON-serializable records with `schemaVersion: 1` and stable string IDs.
IDs reference records; names are display labels. Never embed remote provider
URLs or browser object URLs in saved projects. Validate bounds, finite numbers,
duplicate IDs and references. Reject unsupported versions with useful errors.

### Audio pack

`{schemaVersion, id, name, sources: [], profiles: [], compositions: []}`.

Source: `{id, name, fileName, mimeType, tags: [], provenance: {}, durationSeconds?,
sampleRate?, channels?}`. Binary originals are stored separately by source ID as
Blobs. Preserve originals; all edits live in cue/clip records. Provenance can hold
provider, prompt, model, generation ID and creation date, without credentials.

Profile: `{id, name, bindings: {}, music: {defaultCompositionId?}}`.
Binding keys use `unit.worker.select`, `unit.worker.gather.wood`,
`unit.worker.gather.food`, `unit.worker.move`, `building.town-center.select`,
`building.barracks.select`, `building.archery-range.select`, or `cue.<existingCue>`.
Binding: `{variants: [{sourceId, gain?, trimStartSeconds?, trimEndSeconds?,
caption?}], bus: 'voice'|'effects'|'ambience', cooldownMs?, priority?}`.
Fallback: exact role/action/resource, role/action, `cue.<existingCue>`, synthesis.
Avoid immediate repeats, throttle speech separately and let urgent alerts win.

Map optional field: `audio: {packId, profileId}`. Old maps omit it. Exported map
JSON references a separately distributable audio pack; it never embeds recordings.
The UI must make missing packs visible. Version one may use locally installed
packs, provided the UI clearly states that other players need the pack installed;
do not claim automatic multiplayer asset distribution. Shipped packs may be
served through the existing static path with explicit allowlist/packaging support.

### Library API — library owner implements

`src/audio-assets.mjs`: export `validateAudioPack(pack)` returning a normalized
pack or throwing descriptive errors. Source/profile validation belongs here;
delegate composition validation to `src/audio-composition.mjs` once available.

`src/audio-library-store.mjs`: export `createAudioLibraryStore()`; returned async
methods `listPacks()`, `loadPack(packId)`, `savePack(pack, sourceBlobs)`,
`deletePack(packId)`. `loadPack` returns `{pack, sourceBlobs}` or null;
`sourceBlobs` is an object keyed by source ID with Blob values. Saving metadata
preserves existing blobs; supplied blobs replace only matching IDs. Missing new
source bytes fail validation. Commit metadata and blobs atomically. Implement
bounded portable pack import/export preserving originals and references; author
backups cannot depend solely on browser storage. Document practical byte limits.

### Composition — composer owner implements

`{schemaVersion:1, id, name, bpm:96, beatsPerBar:4, lengthBars:8,
tracks:[{id,name,gain:1,pan:0,mute:false,solo:false,
clips:[{id,sourceId,startBeat:0,durationBeats:4,offsetSeconds:0,
gain:1,loop:false,fadeInSeconds:0,fadeOutSeconds:0}]}]}`.

Sources play at their recorded speed; tempo sets placement/snapping, not automatic
time stretch. Loop repeats the available source region from offset to source end;
clip duration bounds playback. UI must explain timing and avoid promising beat
alignment for unedited material. Fades are bounded by scheduled duration.

`src/audio-composition.mjs`: export `validateComposition(value)` returning a
normalized record or throwing; `compileComposition(value)` returning
`{durationSeconds, events}`. Events contain `sourceId,startSeconds,durationSeconds,
offsetSeconds,gain,pan,loop,fadeInSeconds,fadeOutSeconds`; apply track mute/solo/gain
here. All timing derives from one timeline and one audio clock.

`src/audio-composer.mjs`: export
`mountAudioComposer(container,{pack,sourceBlobs,onChange})`, returning
`{dispose()}`. onChange receives the updated full pack for library persistence.
Composer owns composition selection/create/edit and exports. Library shell mounts
it on demand. Coordinator resolves final import wiring if merge order requires it.

`src/audio-composition-player.mjs`: runtime owner exports
`createCompositionPlayer({context,destination,resolveBuffer})`, returning
`play(composition,{loop=false}={})` (async), `stop()`, `dispose()`.
`resolveBuffer(sourceId)` is async and returns an AudioBuffer. Use compiled events,
cancel stale asynchronous loads, schedule against a shared clock and clean up
nodes/timers. The composer previews through this same player when integrated.
Composer may implement OfflineAudioContext WAV rendering independently using the
same compiled events; export must include fades, pan, mute/solo and loop behavior.

## Integration order

1. Shared contract and library persistence; composer can build pure timing and UI
   against fixture records while runtime builds contextual event routing.
2. Land focused library and composer modules in independent PRs targeting main.
   Author merges follow standing staging authorization after proportionate checks.
3. Runtime picks up current main before final library/player/editor wiring. Resolve
   exact shared API mismatches, not separate parallel format implementations.
4. Coordinator verifies complete import → assign → compose → save → map → play →
   reload workflow, registers focused CI checks, and updates owning guides.

PRs may deliver useful foundations progressively and must state unfinished wiring.
Do not publish a broken import or claim an editor preview proves match integration.

## Acceptance and limits

- Source bytes and provenance survive export/import; edits never overwrite raw data.
- Worker selection and gather-wood differ; mixed/large groups produce one voice.
- Building selection uses the selected type. Caption/visibility rules remain valid.
- Map audio survives authoring/import/export/server validation and reconnect/reset.
- Two instruments can be arranged, saved, reopened, mixed down and played as a map
  loop. Test loop seams, stop/restart, invalid references and rapid pack switching.
- Separate music/voice/effects/ambience controls preserve existing saved settings.
- Missing packs, unsupported codecs, decode failures and storage quota errors are
  visible and retain working synthesized feedback. Bound asset memory and voices.
- No generation credits are spent by this infrastructure work. Human sound quality
  and recognition reviews follow when real material is produced.
