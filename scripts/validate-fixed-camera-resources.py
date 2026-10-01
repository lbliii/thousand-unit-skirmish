"""Audit model-derived directional frames against their source and packed encodings."""
from pathlib import Path
import hashlib
import json
import math
from PIL import Image

root = Path(__file__).resolve().parents[1]
pack = root / 'assets/environment/frontier-meshy-fixed-camera-v2'
report = {}
for name in ['oak', 'pine', 'berries']:
    directory = pack / name
    manifest = json.loads((directory / 'manifest.json').read_text())
    atlas = Image.open(directory / manifest['atlas']).convert('RGBA')
    assert atlas.tobytes() == Image.open(directory / f'{name}-atlas.webp').convert('RGBA').tobytes()
    assert manifest['anchorPixelFromTopLeft'] == [320, 480]
    elevation = math.degrees(math.atan2(1.12, math.hypot(.78, .78)))
    assert abs(manifest['elevationDegrees'] - elevation) < 1e-10
    source = root / manifest['sourceModel']
    if source.exists():
        assert hashlib.sha256(source.read_bytes()).hexdigest() == manifest['sourceModelSha256']
    hashes = []
    for frame in manifest['frames']:
        index = frame['index']
        file = directory / f'references/frames/color/view-{index:02d}.png'
        image = Image.open(file).convert('RGBA')
        x, y, width, height = frame['rect']
        assert image.size == (640, 640)
        bounds = image.getchannel('A').getbbox()
        assert bounds and min(bounds[:2]) >= 2 and max(bounds[2:]) <= 638
        assert list(bounds) == frame['alphaBounds']
        assert hashlib.sha256(file.read_bytes()).hexdigest() == frame['sha256']
        assert image.tobytes() == atlas.crop((x, y, x + width, y + height)).tobytes()
        assert image.tobytes() == Image.open(directory / f'runtime/{name}-{index:02d}.webp').convert('RGBA').tobytes()
        assert frame['cameraAzimuthDegrees'] == 45 and frame['modelYawDegrees'] == index * 45
        hashes.append(hashlib.sha256(image.tobytes()).hexdigest())
    assert len(hashes) == len(set(hashes)) == 8
    report[name] = dict(distinctFrames=8, sourceHashVerified=source.exists(),
        rgbaAtlasAndRuntimeExact=True, cameraAzimuthDegrees=45,
        elevationDegrees=elevation, anchorPixelFromTopLeft=[320, 480])
print(json.dumps(report, indent=2))
