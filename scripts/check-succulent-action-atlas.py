"""Read-only verification of the current shared-crop plant action atlas."""
import hashlib
import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
PACK = ROOT / 'assets/environment/sereward-succulent-action-v1'


def require(value, message):
    if not value:
        raise ValueError(message)


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def source_path(relative):
    path = (PACK / relative).resolve()
    require(path.is_relative_to(ROOT) and path.is_file(), f'Invalid source path: {relative}')
    return path


def check():
    manifest = json.loads((PACK / 'manifest.json').read_text())
    frames = manifest['frames']
    require([f['state'] for f in frames] == ['full', 'worked', 'low', 'depleted'], 'State order changed')
    require(manifest['frameSizePx'] == [1024, 789], 'Shared frame size changed')
    require(manifest['worldSize'] == [0.97338, 0.75] and manifest['pivot'] == [0.5, 1], 'Registration changed')
    full_pack = json.loads((ROOT / 'assets/environment/frontier-v1/sereward-understory-manifest.json').read_text())
    require(manifest['sharedCropPx'] == full_pack['cropPx'], 'Crop differs from selected full specimen')
    atlas_path = source_path(manifest['atlasFile'])
    require(digest(atlas_path) == manifest['atlasSha256'], 'Atlas hash mismatch')
    atlas = Image.open(atlas_path).convert('RGBA')
    require(atlas.size == (4096, 789), 'Atlas dimensions changed')
    rows = []
    for index, frame in enumerate(frames):
        state = frame['state']
        source = source_path(frame['sourceFile'])
        require(digest(source) == frame['sourceSha256'], f'{state}: source hash mismatch')
        image = Image.open(source).convert('RGBA')
        require(image.size == (1536, 1024), f'{state}: source canvas mismatch')
        bounds = image.getchannel('A').point(lambda v: 255 if v >= 8 else 0).getbbox()
        require(list(bounds) == frame['sourceAlphaBoundsPx'], f'{state}: alpha bounds mismatch')
        expected = image.crop(manifest['sharedCropPx']).resize((1024, 789), Image.Resampling.LANCZOS)
        runtime_path = PACK / (state + '.webp')
        require(digest(runtime_path) == frame['runtimeSha256'], f'{state}: runtime hash mismatch')
        runtime = Image.open(runtime_path).convert('RGBA')
        require(runtime.size == expected.size, f'{state}: runtime dimensions mismatch')
        require(runtime.getchannel('A').tobytes() == expected.getchannel('A').tobytes(), f'{state}: alpha changed')
        rect = [index * 1024, 0, 1024, 789]
        require(frame['rectPx'] == rect, f'{state}: frame shifted or resized')
        tile = atlas.crop((rect[0], 0, rect[0] + 1024, 789))
        require(tile.getchannel('A').tobytes() == expected.getchannel('A').tobytes(), f'{state}: atlas alpha changed')
        rows.append({'state': state, 'sourceAlphaBottomPx': bounds[3], 'decodedAlphaExact': True})
    return {'frames': rows, 'sameCropAndScale': True, 'runtimeIntegrated': False,
            'anatomicalRootAlignmentCertified': False}


if __name__ == '__main__':
    print(json.dumps(check()))
