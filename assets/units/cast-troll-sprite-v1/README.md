# Troll cast sprite review pack

This exploratory four-cast readability pack supplies a default Worker variant by user direction. It
contains 264 frames across eight directions, with idle, walk, attack/work, and
defeat clips plus a grayscale team-accent mask.

Human, orc, elf, and troll variants are assigned across Worker slots in the normal game. Each Worker keeps its assigned appearance. Infantry and Archer retain their existing visuals; `?castPreview=0` restores the previous Worker.

The pack is a runtime candidate for visual review only. Shared motion scaffolds,
foot registration, identity consistency, and small-scale readability still need
human review before production use. The troll source has known edge residue.
See `PROVENANCE.md` for the source and rights boundary.

The v0.2 review runtime corrects the copied ground pivot using each heading’s standing foot baseline and adds pixel-checked margins. Source-cut poses temporarily hold a complete pose in the same directional clip; `clipping-review.json` lists each hold. Sources remain unchanged. These holds reduce animation fluidity, especially Troll work, and require replacement before final art acceptance.
