"""Capture the source GLB without altering it, then prepare review frames."""
import argparse
import capture_helpers as helpers
import json
import hashlib
import subprocess
import threading
from pathlib import Path
from http.server import ThreadingHTTPServer
from PIL import Image

PROJECT = Path(__file__).resolve().parent
REPO = PROJECT.parents[3]
RUNTIME = PROJECT.parent / 'runtime'

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--overwrite', action='store_true')
    args = parser.parse_args()
    if (PROJECT / 'references/model-stats.json').exists() and not args.overwrite:
        raise SystemExit('Captures already exist; use --overwrite to regenerate them.')
    handler = type('CliffHandler', (helpers.RenderHandler,), {'project': PROJECT, 'repo': REPO})
    server = ThreadingHTTPServer(('127.0.0.1', 0), handler)
    server.overwrite = args.overwrite
    threading.Thread(target=server.serve_forever, daemon=True).start()
    url = f'http://127.0.0.1:{server.server_port}/{PROJECT.relative_to(REPO)}/render-cliff.html'
    try:
        result = subprocess.run(['node', str(PROJECT / 'browser-capture.mjs'), url],
                                capture_output=True, text=True, timeout=300)
    finally:
        server.shutdown()
        server.server_close()
    if result.returncode or 'RENDER_DONE' not in result.stdout:
        raise SystemExit(result.stdout[-2000:] + result.stderr[-3000:])
    stats = json.loads((PROJECT / 'references/model-stats.json').read_text())
    helpers.ELEVATION = round(stats['elevationDegrees'], 2)
    colors = [PROJECT / f'references/frames/color/view-{i:02d}.png' for i in range(8)]
    helpers.contact_sheet(colors, PROJECT / 'references/cliff-eight-view.png')
    RUNTIME.mkdir(parents=True, exist_ok=True)
    frames = []
    for i, source in enumerate(colors):
        color = Image.open(source).convert('RGBA')
        bbox = color.getchannel('A').getbbox()
        assert bbox and min(bbox[:2]) > 0 and max(bbox[2:]) < 640, (i, bbox)
        color.save(RUNTIME / f'cliff-color-{i:02d}.webp', 'WEBP', quality=92, method=6)
        depth = Image.open(PROJECT / f'references/frames/depth/view-{i:02d}.png')
        depth.save(RUNTIME / f'cliff-depth-{i:02d}.png', optimize=True)
        frames.append({'index': i, 'azimuthDegrees': i * 45, 'alphaBounds': bbox,
                       'color': f'runtime/cliff-color-{i:02d}.webp', 'depth': f'runtime/cliff-depth-{i:02d}.png'})
    receipt = json.loads((PROJECT / 'receipt.json').read_text())
    manifest = {
        'asset': 'frontier-cliff-straight-pilot', 'status': 'review-only',
        'taskId': '01a0e003-8ecc-707f-9ca0-966ebfb6c52d', 'resource': 'image-to-3d',
        'consumedCredits': receipt.get('consumed_credits'),
        'model': 'source/cliff-source.glb',
        'modelSha256': hashlib.sha256((PROJECT / 'cliff-source.glb').read_bytes()).hexdigest(),
        'camera': {'projection': 'orthographic', 'elevationDegrees': stats['elevationDegrees'],
                   'framePixels': [640,640], 'frameWorldUnits': [5,5], 'anchorPixelFromTopLeft': [320,376],
                   'near': 8, 'far': 20, 'groundOriginDistance': 14},
        'depthEncoding': '16-bit linear distance: (R*256+G)/65535 * 12 + 8; RGB bytes, alpha coverage; no color conversion',
        'normalization': stats, 'frames': frames,
        'limits': ['Rear geometry inferred from one image.', 'One shape only; corners and caps not generated.',
                   'No paid remesh. Source mesh is retained for offline capture only.',
                   'Gallery is an art and occlusion review; gameplay collision and elevation are unchanged.']
    }
    (RUNTIME.parent / 'manifest.json').write_text(json.dumps(manifest, indent=2)+'\n')
    print(json.dumps({'stats':stats, 'runtime':str(RUNTIME), 'frames':len(frames)}, indent=2))

if __name__ == '__main__':
    main()
