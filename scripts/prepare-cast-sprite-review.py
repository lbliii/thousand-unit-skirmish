#!/usr/bin/env python3
"""Measure authored cells; reject cropped sources or explicitly hold a safe review pose.
Source PNGs are never modified. Requires Pillow; no provider calls.
"""
import argparse, hashlib, json
from pathlib import Path
from PIL import Image

THRESHOLD = 8
PADDING = 8

def bounds(tile):
    return tile.getchannel('A').point(lambda value: 255 if value >= THRESHOLD else 0).getbbox()

def clipped(box, size):
    return box is None or min(box[0], box[1], size[0]-box[2], size[1]-box[3]) <= 0

def prepare(pack, repair=False, write=False):
    manifest = json.loads(pack.read_text())
    asset = manifest['assets'][0]
    source = Image.open(pack.parent / 'cast-atlas-source.png').convert('RGBA')
    tiles = {}
    for frame in asset['frames']:
        rect = frame['fallbackRectPx']['rectPx']
        tiles[frame['id']] = source.crop((rect['x'], rect['y'], rect['x']+rect['width'], rect['y']+rect['height']))
    bad = {key for key, tile in tiles.items() if clipped(bounds(tile), tile.size)}
    replacements = {}
    for clip in asset['clips']:
        ids = [item['frameId'] for item in clip['sequence']]
        safe = [index for index, key in enumerate(ids) if key not in bad]
        for index, key in enumerate(ids):
            if key not in bad: continue
            if not safe: raise ValueError(f'{asset["id"]}: no complete pose in {clip["id"]}')
            nearest = min(safe, key=lambda other: abs(other-index))
            replacements[key] = ids[nearest]
    report = {'asset': asset['id'], 'alphaThreshold': THRESHOLD, 'paddingPx': PADDING,
              'sourceEdgeFrames': sorted(bad), 'reviewPoseSubstitutions': replacements,
              'sourceSha256': hashlib.sha256((pack.parent/'cast-atlas-source.png').read_bytes()).hexdigest()}
    if bad and not repair:
        raise ValueError(f'{asset["id"]}: {len(bad)} source frames touch a cell edge; rebake with a wider shared envelope. Review fallback requires --hold-safe-poses.')
    runtime = Image.new('RGBA', source.size)
    mask = Image.new('L', source.size)
    prepared = {}
    for key, tile in tiles.items():
        tile = tiles[replacements.get(key, key)]
        inner = tile.resize((tile.width-2*PADDING, tile.height-2*PADDING), Image.Resampling.LANCZOS)
        padded = Image.new('RGBA', tile.size)
        padded.paste(inner, (PADDING, PADDING))
        prepared[key] = padded
    # One standing ground baseline per heading, shared by every animation. Never normalize
    # individual frames: that would erase jumping/defeat motion and cause foot jitter.
    baselines = {frame['id'].removeprefix('idle-').removesuffix('-0'): bounds(prepared[frame['id']])[3]
                 for frame in asset['frames'] if frame['id'].startswith('idle-')}
    for frame in asset['frames']:
        tile = prepared[frame['id']]
        box = bounds(tile)
        rect = frame['fallbackRectPx']['rectPx']
        runtime.paste(tile, (rect['x'], rect['y']))
        mask.paste(tile.getchannel('A'), (rect['x'], rect['y']))
        frame['alphaBoundsPx'] = dict(x=box[0], y=box[1], width=box[2]-box[0], height=box[3]-box[1])
        frame['groundPivotPx'] = {'x': 64, 'y': baselines[frame['id'].split('-',1)[1].rsplit('-',1)[0]]}
        frame['groundPivotStatus'] = 'unreviewed-estimate'
    max_height = max(frame['alphaBoundsPx']['height'] for frame in asset['frames'])
    # Preserve original on-screen pixels/world after introducing transparent padding.
    asset['heightWorld'] = 1.35 * max_height / 112
    report['groundBaselineByDirectionPx'] = baselines
    report['runtimeEdgeFrames'] = [key for key,tile in prepared.items() if clipped(bounds(tile),tile.size)]
    if report['runtimeEdgeFrames']: raise ValueError('Prepared runtime still contains clipped frames')
    if write:
        runtime.save(pack.parent/'cast-atlas-runtime.png')
        mask.save(pack.parent/'team-accent-mask.png')
        for file in manifest['files']:
            file['sha256'] = hashlib.sha256((pack.parent/file['path']).read_bytes()).hexdigest()
        manifest['packVersion'] = '0.2.0'
        manifest['provenance']['notes'] = 'Pixel-audited review pack; original sources retained. Edge-cut source poses held at nearest complete pose in the same clip. See clipping-review.json. Shared baseline preserves motion; visual registration remains exploratory.'
        pack.write_text(json.dumps(manifest, indent=2)+'\n')
        (pack.parent/'clipping-review.json').write_text(json.dumps(report, indent=2)+'\n')
    return report

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('packs', nargs='+', type=Path)
    parser.add_argument('--hold-safe-poses', action='store_true')
    parser.add_argument('--write', action='store_true')
    args = parser.parse_args()
    for pack in args.packs:
        report = prepare(pack, args.hold_safe_poses, args.write)
        print(f'{report["asset"]}: {len(report["sourceEdgeFrames"])} source edge frames, {len(report["reviewPoseSubstitutions"])} explicit holds, {len(report["runtimeEdgeFrames"])} runtime edge frames')
