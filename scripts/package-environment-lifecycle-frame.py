"""Package a generated state using the family's approved full-frame registration.

Usage: python3 scripts/package-environment-lifecycle-frame.py MANIFEST STAGE PNG
The PNG master is copied unchanged. This does not repaint or repair generated art.
"""
import argparse
import hashlib
import json
import shutil
from pathlib import Path
from PIL import Image

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('manifest', type=Path)
parser.add_argument('stage', choices=['worked', 'low', 'depleted'])
parser.add_argument('source', type=Path)
parser.add_argument('--allow-outside-crop-edge-difference', action='store_true',
    help='Allow at most one pixel per canvas edge dimension, only outside the shared crop')
args = parser.parse_args()
manifest = json.loads(args.manifest.read_text())
root = args.manifest.parent
full = next(asset for asset in manifest['assets'] if asset['stage'] == 'full')
image = Image.open(args.source).convert('RGBA')
expected = tuple(full['logicalCanvasPx'])
edge_difference = image.size != expected
if edge_difference:
    left, top, right, bottom = full['cropBoxPx']
    safe_edge = (args.allow_outside_crop_edge_difference
        and all(abs(actual - wanted) <= 1 for actual, wanted in zip(image.size, expected))
        and 0 <= left < right <= min(image.width, expected[0])
        and 0 <= top < bottom <= min(image.height, expected[1]))
    if not safe_edge:
        raise ValueError('Generated frame canvas differs from the full source; review registration first')
asset = dict(full)
asset.update(id=full['id'] + '-' + args.stage, stage=args.stage,
             sourceOutputId=args.source.stem,
             sourceFile=full['id'] + '-' + args.stage + '.png',
             runtimeFile=full['id'] + '-' + args.stage + '.webp')
if edge_difference:
    asset['sourceCanvasPx'] = list(image.size)
    asset['registrationNote'] = 'Reviewed one-pixel canvas edge difference outside shared crop; no resize, translation or pixel repair.'
source = root / asset['sourceFile']
if args.source.resolve() != source.resolve():
    shutil.copy2(args.source, source)
runtime = image.crop(full['cropBoxPx'])
runtime.thumbnail((1024, 1024), Image.Resampling.LANCZOS)
target = root / asset['runtimeFile']
runtime.save(target, 'WEBP', quality=86, method=6)
if Image.open(target).getchannel('A').tobytes() != runtime.getchannel('A').tobytes():
    raise ValueError('Runtime alpha changed during encoding')
paths = {source.name, target.name}
manifest['files'] = [entry for entry in manifest['files'] if entry['path'] not in paths]
for path, role in [(source, 'source-image'), (target, 'runtime-image')]:
    width, height = Image.open(path).size
    manifest['files'].append(dict(path=path.name, role=role,
        sha256=hashlib.sha256(path.read_bytes()).hexdigest(),
        dimensionsPx=dict(width=width, height=height), bytes=path.stat().st_size))
manifest['assets'] = [entry for entry in manifest['assets'] if entry['stage'] != args.stage]
manifest['assets'].append(asset)
order = ['full', 'worked', 'low', 'depleted']
manifest['assets'].sort(key=lambda entry: order.index(entry['stage']))
args.manifest.write_text(json.dumps(manifest, indent=2) + '\n')
print(f"Packaged {asset['id']}: {runtime.size}, shared crop, generated alpha preserved")
