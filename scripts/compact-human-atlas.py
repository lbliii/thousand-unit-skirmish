"""Repack transparent frame margins, preserving canvas coordinates and pivots."""
from pathlib import Path
import hashlib
import json
import sys
from PIL import Image, ImageChops


def compact(folder):
    folder = Path(folder)
    manifest = folder / 'sprite-atlas-pack-v1.json'
    pack = json.loads(manifest.read_text())
    runtime = next(f for f in pack['files'] if f['usage'] == 'runtime')
    original = Image.open(folder / runtime['path']).convert('RGBA')
    items = []
    for asset in pack['assets']:
        for frame in asset['frames']:
            mapping = frame['frameRectsPx'][0]
            rect = mapping['rectPx']
            image = original.crop((rect['x'], rect['y'], rect['x'] + rect['width'], rect['y'] + rect['height']))
            offset = mapping.get('offsetPx', {'x': 0, 'y': 0})
            logical = Image.new('RGBA', (frame['canvasPx']['width'], frame['canvasPx']['height']))
            logical.alpha_composite(image, (offset['x'], offset['y']))
            image = logical
            bounds = image.getchannel('A').getbbox()
            if not bounds:
                raise ValueError(f"Empty frame {frame['id']}")
            alpha = frame.get('alphaBoundsPx')
            if alpha:
                bounds = (min(bounds[0], alpha['x']), min(bounds[1], alpha['y']), max(bounds[2], alpha['x'] + alpha['width']), max(bounds[3], alpha['y'] + alpha['height']))
            pivot = frame['groundPivotPx']
            bounds = (min(bounds[0], pivot['x']), min(bounds[1], pivot['y']), max(bounds[2], pivot['x']), max(bounds[3], pivot['y']))
            offset = {'x': 0, 'y': 0}
            items.append((frame, image, bounds, offset))
    width, gap = 2048, 4
    placements = []
    x = y = row_height = 0
    for frame, image, bounds, offset in sorted(items, key=lambda i: i[2][3] - i[2][1], reverse=True):
        w, h = bounds[2] - bounds[0], bounds[3] - bounds[1]
        if w + gap * 2 > width:
            raise ValueError('Frame exceeds atlas width')
        if x + w + gap * 2 > width:
            y += row_height
            x = row_height = 0
        placements.append((frame, image, bounds, offset, x + gap, y + gap))
        x += w + gap * 2
        row_height = max(row_height, h + gap * 2)
    height = 1
    while height < y + row_height:
        height *= 2
    atlas = Image.new('RGBA', (width, height))
    for frame, image, bounds, offset, x, y in placements:
        crop = image.crop(bounds)
        atlas.alpha_composite(crop, (x, y))
        new_offset = {'x': offset['x'] + bounds[0], 'y': offset['y'] + bounds[1]}
        rect = {'x': x, 'y': y, 'width': crop.width, 'height': crop.height}
        frame['frameRectsPx'][0]['rectPx'] = rect
        frame['frameRectsPx'][0]['offsetPx'] = new_offset
        frame['fallbackRectPx']['rectPx'] = rect
        # Verify visible pixels in original canvas coordinates before writing.
        before = Image.new('RGBA', (frame['canvasPx']['width'], frame['canvasPx']['height']))
        after = before.copy()
        before.alpha_composite(image, (offset['x'], offset['y']))
        after.alpha_composite(crop, (new_offset['x'], new_offset['y']))
        if any(channel.getbbox() for channel in ImageChops.difference(before, after).split()):
            raise ValueError(f"Repacking changed frame {frame['id']}")
        frame['canvasPx'] = {'width': crop.width, 'height': crop.height}
        frame['groundPivotPx'] = {'x': frame['groundPivotPx']['x'] - bounds[0], 'y': frame['groundPivotPx']['y'] - bounds[1]}
        alpha = frame.get('alphaBoundsPx')
        if alpha:
            alpha['x'] -= bounds[0]
            alpha['y'] -= bounds[1]
        frame['frameRectsPx'][0]['offsetPx'] = {'x': 0, 'y': 0}
    for file in pack['files']:
        path = folder / file['path']
        if file['usage'] == 'team-mask':
            mask = Image.open(path)
            if mask.getbbox():
                raise ValueError('Nonempty team masks require matching repacking')
            Image.new('L', atlas.size).save(path)
        else:
            atlas.save(path)
        file['dimensionsPx'] = {'width': width, 'height': height}
        file['sha256'] = hashlib.sha256(path.read_bytes()).hexdigest()
    pack['pages'][0]['dimensionsPx'] = {'width': width, 'height': height}
    manifest.write_text(json.dumps(pack, indent=2) + '\n')
    print(f'{folder.name}: {original.width}x{original.height} -> {width}x{height}; {len(items)} frames preserved')


if __name__ == '__main__':
    compact(sys.argv[1])
