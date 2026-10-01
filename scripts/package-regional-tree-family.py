"""Encode registered tree states; preserve original masters and shared geometry.

This performs crop/format packaging only, never painting or alpha repair.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
from PIL import Image

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--source', type=Path, required=True)
parser.add_argument('--prefix', required=True)
parser.add_argument('--family', required=True)
parser.add_argument('--crop', type=int, nargs=4, required=True)
parser.add_argument('--height', type=float, required=True)
args = parser.parse_args()
out = Path(__file__).resolve().parents[1] / 'assets/environment/frontier-v1'
left, top, right, bottom = args.crop
if not 0 <= left < right or not 0 <= top < bottom or args.height <= 0:
    parser.error('Crop and world height must be positive.')
assets, files = [], []
for stage in ['full', 'worked', 'low', 'depleted']:
    source = args.source / f'{args.prefix}-{stage}-000.png'
    image = Image.open(source)
    if image.mode != 'RGBA' or right > image.width or bottom > image.height:
        raise ValueError(f'Invalid source canvas: {source}')
    runtime = image.crop(args.crop)
    runtime.thumbnail((1024, 1024), Image.Resampling.LANCZOS)
    name = args.family + ('' if stage == 'full' else '-' + stage) + '.webp'
    target = out / name
    if target.exists():
        raise FileExistsError(f'Refusing to replace existing runtime: {target}')
    runtime.save(target, 'WEBP', quality=86, method=6)
    assert Image.open(target).getchannel('A').tobytes() == runtime.getchannel('A').tobytes()
    assets.append(dict(id=args.family, stage=stage,
        logicalCanvasPx=list(image.size), cropBoxPx=args.crop,
        sourceFile=os.path.relpath(source.resolve(), out), runtimeFile=name,
        worldSize=dict(width=args.height*(right-left)/(bottom-top), height=args.height),
        groundPivotPx=[runtime.width/2, runtime.height], directionId='fixed-oblique'))
    files.append(dict(path=name, role='runtime-image',
        sha256=hashlib.sha256(target.read_bytes()).hexdigest(), bytes=target.stat().st_size,
        dimensionsPx=dict(width=runtime.width, height=runtime.height)))
manifest = dict(schemaVersion=1, packId='environment.vaelora-'+args.family+'-lifecycle',
    packVersion='0.1.0', maturity='runtime-candidate',
    provenance='Project-owned built-in ImageGen masters retained. Shared reviewed crop; '
    'LANCZOS max1024, WebP quality86 method6 exact alpha. Fixed painted view, not measured rotations.',
    assets=assets, files=files)
(out / (args.family+'-lifecycle-manifest.json')).write_text(json.dumps(manifest, indent=2)+'\n')
print(f'Packaged {args.family}: four states, shared crop {args.crop}')
