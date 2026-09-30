# Frontier building runtime preview — 30 September 2026

The six calibrated Complete source families now have manifests for the existing captured-building renderer. The generator preserves captured frame hashes, scale, azimuths and ground pivots. A six-building standalone renderer review loads all six; Frame selection hides all six Complete sprites and restores fallback blocks, then returning to Complete reloads them. Strategic zoom was reviewed at 0.48; this is a source renderer review, not six buildings verified in a live match.

The game exposes this progressive integration via `?frontierBuildingsPreview=1`. Existing building artwork remains the fallback for missing lifecycle states. The wrapper preserves outer selection, rally, health/combat feedback and fog ownership. Normal matches retain existing visuals. Team masks and all lifecycle families remain unfinished; no full-set/default acceptance is claimed.

Local isolated match: `bellweather-millrace`, server port 8772, current worktree. Home base and zoom review visibly showed the revised civic Town Center beside live units. [Screenshot](../assets/buildings/frontier-civilization-scale-pilot-v1/town-center-match-preview.png). Initial asset 404 led to adding explicit six-family manifests/PNG routes; all twelve manifest/front-frame requests return 200, while the ignored GLB returns 404. Only Town Center is claimed observed in a live match so far.

Regression fix: requesting an unavailable state now hides the captured sprite and invalidates pending frame loads, preventing a stale Complete frame from covering construction/damage fallback. The main render loop restores fallback visibility when the sprite is hidden. Focused renderer-manifest and existing building-sprite tests pass; Node syntax, documentation and whitespace checks pass.

Remaining: all six buildings in representative live settlements, both teams with correct masks/standards, matched lifecycle art and repair transitions, actual Worker/Rider doorway/bay scale, remaining Barracks/Archery Range family and default enablement. The full civilization runtime baseline remains incomplete.
