"""Validate selected quiet-terrain source provenance and opaque runtime exports."""
import copy
import hashlib
import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
PACK = ROOT / 'assets/environment/frontier-v1'
NAMES = ('bellweather-quiet-meadow', 'siltmouths-quiet-mud', 'pale-meridian-quiet-snow', 'vesperra-quiet-loam')


def require(condition, message):
    if not condition:
        raise ValueError(message)


def resolve(relative):
    path = (PACK / relative).resolve()
    require(path.is_relative_to(ROOT), f'Path escapes repository: {relative}')
    require(path.is_file(), f'Missing file: {relative}')
    return path


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def validate(name, manifest):
    require(manifest['generator'] == 'Built-in ImageGen', f'{name}: generator')
    require(digest(resolve(manifest['reference'])) == manifest['referenceSha256'], f'{name}: stale reference')
    prompts = json.loads(resolve(manifest['prompts']).read_text())
    require(isinstance(prompts, dict) and prompts, f'{name}: empty prompt record')
    files = manifest['files']
    require(len(files) == 2, f'{name}: expected source/runtime pair')
    require({f['file'] for f in files} == {name + '.png', name + '.webp'}, f'{name}: wrong file binding')
    require(len({f['sourceOutput'] for f in files}) == 1, f'{name}: inconsistent selected output')
    for row in files:
        path = resolve(row['file'])
        require(digest(path) == row['sha256'], f'{name}: changed bytes {path.name}')
        with Image.open(path) as image:
            image.load()
            require(list(image.size) == row['dimensions'], f'{name}: stale dimensions {path.name}')
            require(image.width == image.height, f'{name}: non-square terrain')
            require(image.convert('RGBA').getchannel('A').getextrema() == (255, 255), f'{name}: translucent terrain')
            if path.suffix == '.webp':
                require(image.format == 'WEBP' and image.size == (1024, 1024), f'{name}: runtime export')
            else:
                require(image.format == 'PNG', f'{name}: source format')


def main():
    checked = []
    rejected = 0
    for name in NAMES:
        manifest = json.loads((PACK / (name + '-manifest.json')).read_text())
        validate(name, manifest)
        checked.append(name)
        # Metadata corruption must not silently admit a stale source pairing.
        for field, value in [('referenceSha256', '0' * 64), ('reference', '/tmp/quiet-terrain-escape')]:
            changed = copy.deepcopy(manifest)
            changed[field] = value
            try:
                validate(name, changed)
            except ValueError:
                rejected += 1
            else:
                raise AssertionError(f'{name}: admitted invalid {field}')
        for field, value in [('sha256', '0' * 64), ('dimensions', [1, 1]), ('file', name + '.webp')]:
            changed = copy.deepcopy(manifest)
            changed['files'][0][field] = value
            try:
                validate(name, changed)
            except ValueError:
                rejected += 1
            else:
                raise AssertionError(f'{name}: admitted invalid file {field}')
    print(json.dumps({'checked': checked, 'invalidRecordsRejected': rejected}))


if __name__ == '__main__':
    main()
