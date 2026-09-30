#!/usr/bin/env python3
"""Read-only decoded-alpha audit for the regional single-asset export recipe."""
import json
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parents[1]
packs = root / "assets/environment/frontier-v1"
suffixes = ("understory-manifest.json", "variation-manifest.json",
            "water-plants-manifest.json", "god-bone-manifest.json")
results = []
for path in sorted(packs.glob("*-manifest.json")):
    if not path.name.endswith(suffixes):
        continue
    manifest = json.loads(path.read_text())
    files = {f["role"]: f["path"] for f in manifest["files"]}
    with Image.open(packs / files["source-image"]) as source:
        expected = source.convert("RGBA").crop(manifest["cropPx"])
        expected.thumbnail((1024, 1024), Image.Resampling.LANCZOS)
        expected_alpha = expected.getchannel("A")
    with Image.open(packs / files["runtime-image"]) as runtime:
        actual = runtime.convert("RGBA").getchannel("A")
        if actual.size != expected_alpha.size:
            raise ValueError(f"{path.name}: decoded runtime dimensions differ from export recipe")
        if actual.tobytes() != expected_alpha.tobytes():
            mismatches = sum(a != b for a, b in zip(actual.tobytes(), expected_alpha.tobytes()))
            raise ValueError(f"{path.name}: {mismatches} alpha pixels differ from selected source crop")
        extrema = actual.getextrema()
        if extrema[0] != 0 or extrema[1] == 0:
            raise ValueError(f"{path.name}: expected transparent surroundings and visible plant pixels")
    results.append({"asset": manifest["asset"]["id"], "pixels": actual.width * actual.height,
                    "decodedAlphaExact": True, "alphaRange": extrema})
if not results:
    raise ValueError("No regional plant packs found")
print(json.dumps({"checked": len(results), "packs": results}, indent=2))
