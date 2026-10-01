"""Rebuild the reviewed source atlas; --write explicitly opts into file edits."""
import argparse
import json
import sys

sys.dont_write_bytecode = True

from PIL import Image

from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path

spec = spec_from_file_location('atlas_check', Path(__file__).with_name('check-succulent-action-atlas.py'))
validation = module_from_spec(spec)
spec.loader.exec_module(validation)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--write', action='store_true', help='Re-export selected PNGs, atlas and preview')
    args = parser.parse_args()
    if not args.write:
        print(json.dumps(validation.check()))
        return
    pack = validation.PACK
    manifest_path = pack / 'manifest.json'
    manifest = json.loads(manifest_path.read_text())
    validation.require([f['state'] for f in manifest['frames']] == ['full', 'worked', 'low', 'depleted'], 'Reviewed state order changed')
    # Validate all inputs before modifying any exports.
    for frame in manifest['frames']:
        source = validation.source_path(frame['sourceFile'])
        validation.require(validation.digest(source) == frame['sourceSha256'], 'Selected source changed')
        with Image.open(source) as image:
            validation.require(image.size == (1536, 1024), 'Source canvas changed')
    validation.require(manifest['sharedCropPx'] == [160, 40, 1385, 984], 'Reviewed common crop changed')
    atlas = Image.new('RGBA', (4096, 789))
    preview = Image.new('RGBA', (1536, 330), '#79705b')
    for index, frame in enumerate(manifest['frames']):
        image = Image.open(validation.source_path(frame['sourceFile'])).convert('RGBA')
        image = image.crop(manifest['sharedCropPx']).resize((1024, 789), Image.Resampling.LANCZOS)
        path = pack / (frame['state'] + '.webp')
        image.save(path, quality=86, method=6, exact=True)
        frame['runtimeSha256'] = validation.digest(path)
        atlas.alpha_composite(image, (index * 1024, 0))
        preview.alpha_composite(image.resize((384, 296), Image.Resampling.LANCZOS), (index * 384, 17))
    atlas.save(pack / manifest['atlasFile'], quality=86, method=6, exact=True)
    preview.convert('RGB').save(pack / 'registration-preview.png')
    manifest['atlasSha256'] = validation.digest(pack / manifest['atlasFile'])
    manifest_path.write_text(json.dumps(manifest, indent=2) + '\n')
    print(json.dumps(validation.check()))


if __name__ == '__main__':
    main()
