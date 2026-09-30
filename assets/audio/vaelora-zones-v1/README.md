# Vaelora — all-zone audio sources v1

Ten zones, eleven palettes, 44 original ElevenLabs recordings. Ru’Lora has separate living-fringe and petrified-interior palettes. Every palette contains everyday music, a landscape bed, a contrasting environment bed, and a signature gesture.

Open `audio-zones.html` through the game server (also linked from Audio Studio). Select a zone, play individual ingredients or the combined palette, adjust levels, compare current game command cues, and save/export review notes. **Save sources to Audio Studio** imports all 44 original files and their provenance into a local source pack; it preserves an existing pack instead of overwriting edits. Audio Studio can export a portable backup.

[catalog.json](catalog.json) is the source of truth for exact prompts, source flows/nodes, requested settings, actual duration/sample rate, original download names, sizes and SHA-256 hashes. Originals live in `sources/` and are unedited. One Meridian request produced no exposed recording; its attempt is recorded alongside the alternate take. The shared pilot UI ingredients live in [the pilot source pack](../vaelora-pilot-v1/README.md).

These are first-pass audition candidates. Loop seam, musical accuracy, regional distinctiveness, quality acceptance and final game assignments remain review work. The imported pack initially has no event bindings or compositions. Independent music takes are complete reference mixes, not synchronized stems.

See [creative direction](../../../docs/vaelora-zone-audio-plan.md), [UI direction](../../../docs/ui-audio-direction.md), and [milestone evidence](../../../docs/qa-zone-audio-2026-09-30.md). Validate source coverage with `node scripts/validate-zone-audio.mjs`.
