#!/usr/bin/env python3
"""Re-layout existing Human action frames as padded imagegen pose references.

These preserve source mechanics only; they are not new accepted Human artwork.
"""
import json
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'assets/units/cast-human-sprite-v1/source-directional'
DEST = ROOT / 'docs/art-direction/human-roster-v1/pose-seeds'
DEST.mkdir(parents=True, exist_ok=True)
layout = json.loads((SOURCE / 'layout.json').read_text())
inventory = []
for batch in layout['batches']:
    direction = batch['direction']
    source = Image.open(SOURCE / f'{direction}.png').convert('RGBA')
    actions = {}
    for frame in batch['frames']:
        actions.setdefault(frame['action'], []).append(frame)
    for action, frames in actions.items():
        frames.sort(key=lambda frame: frame['frameIndex'])
        rows = (len(frames) + 3) // 4
        sheet = Image.new('RGBA', (1536, rows * 512))
        for index, frame in enumerate(frames):
            x, y, width, height = frame['batchRect']
            tile = source.crop((x, y, x + width, y + height))
            tile = tile.resize((384, 384), Image.Resampling.LANCZOS)
            sheet.alpha_composite(tile, ((index % 4) * 384, (index // 4) * 512 + 64))
        filename = f'{action}-{direction}.png'
        sheet.save(DEST / filename)
        inventory.append({'path': filename, 'source': f'{direction}.png',
                          'action': action, 'frameIds': [f['id'] for f in frames],
                          'purpose': 'pose mechanics only'})
(DEST / 'inventory.json').write_text(json.dumps(inventory, indent=2) + '\n')
print(f'Prepared {len(inventory)} action/direction pose references')
