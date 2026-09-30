# Audio Studio library and pack backups

Audio Studio is a standalone authoring page at `audio-studio.html`. Create a pack, import individual audio recordings, label and tag the raw sources, then assign variants to unit, building, or existing cue events. The Composer tab loads the separate composition editor when that module is installed. Packs are local to this browser until exported and installed elsewhere. A map references a pack and profile by ID; multiplayer does not transfer recordings automatically.

## Storage and portable format

`createAudioLibraryStore()` uses IndexedDB database `tus-audio-library-v1`. Pack metadata and source Blobs are in separate stores; `savePack` changes them in one read/write transaction. Source bytes are preserved when metadata changes, and new sources require a Blob. `loadPack(id)` returns `{pack, sourceBlobs}` or `null`. `listPacks()` returns summary rows. `deletePack(id)` removes the pack and its source bytes.

Use **Export backup** before clearing browser data or moving to another machine. A `.audio-pack.json` archive contains `{format:"tus-audio-pack-v1", pack, sources}` with each source's original bytes encoded as base64. **Import pack backup** validates IDs, references, versions, declared byte lengths and binary data before saving. It rejects an existing pack ID so a backup cannot silently overwrite local edits. The browser's storage quota still applies; quota errors are shown in Audio Studio.

Limits are 128 sources, 16 MiB per source, 64 MiB of audio per pack, and 90 MiB per archive. Base64 increases backup size by about one third. Files that the browser cannot decode remain available for backup, and the preview reports the codec failure. No provider credentials belong in provenance; supported fields are provider, prompt, model, generation ID, creation date, license and attribution.

The library uses the shared `validateComposition` contract by default for storage and backups, then checks source and profile references. Composer save failures remain visible in the editor and preserve its unsaved state. Audio Studio and its modules are included in the server allowlist and release image.

Run `node scripts/audio-library.test.mjs` for validation and portable byte round-trip checks. Browser acceptance should create/import a WAV, assign `unit.worker.gather.wood`, reload the page, export the pack, clear it, and import the backup to confirm original bytes and metadata survive.

## Vaelora regional source collection

Audio Studio links to `audio-zones.html`, the [all-zone palette audition](../assets/audio/vaelora-zones-v1/README.md). It compares ten zones (eleven palettes with Ru’Lora fringe/interior), with independent source levels, repeat controls, current synthesized command cues, and local review notes. **Save sources to Audio Studio** installs the 44 original candidates and their provenance as `vaelora-zone-sources-v1`; an existing pack is preserved. Event bindings and compositions start empty. Use Audio Studio to edit/arrange accepted sources and export a portable backup. [Technical acceptance](qa-zone-audio-2026-09-30.md) covers source playback and byte-preserving export, not creative acceptance.
