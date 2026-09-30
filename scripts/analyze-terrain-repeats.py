"""Analyze the known 24-unit repeat in the paired flat-field GPU captures."""
import json
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageStat


ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / 'docs/qa-evidence/vaelora-terrain-variety-2026-09-29'


def correlation(first, second):
    count = len(first)
    sx, sy = sum(first), sum(second)
    sxx, syy = sum(x * x for x in first), sum(y * y for y in second)
    sxy = sum(x * y for x, y in zip(first, second))
    denominator = math.sqrt((count * sxx - sx * sx) * (count * syy - sy * sy))
    return (count * sxy - sx * sy) / denominator if denominator else None


analysis = {}
sheet = Image.new('RGB', (1024, 1064), (24, 29, 36))
draw = ImageDraw.Draw(sheet)
for row, material in enumerate(['scree', 'meadow']):
    analysis[material] = {}
    for column, mode in enumerate(['mirror', 'stochastic']):
        image = Image.open(EVIDENCE / f'{material}-{mode}-128.png').convert('RGB')
        if image.size != (512, 512):
            raise ValueError('Expected 512-square captures spanning 128 world units')
        gray = image.convert('L')
        stats = ImageStat.Stat(image)
        # 512 pixels / 128 world units * 24 units = 96 pixels.
        flattened = lambda box: list(gray.crop(box).get_flattened_data())
        analysis[material][mode] = {
            'horizontal24UnitCorrelation': correlation(
                flattened((0, 0, 416, 512)), flattened((96, 0, 512, 512))),
            'vertical24UnitCorrelation': correlation(
                flattened((0, 0, 512, 416)), flattened((0, 96, 512, 512))),
            'meanRGB': stats.mean,
            'stdRGB': stats.stddev,
        }
        sheet.paste(image, (column * 512, row * 532 + 20))
        draw.text((column * 512 + 10, row * 532 + 5), f'{material} / {mode}', fill='white')

(EVIDENCE / 'repeat-analysis.json').write_text(json.dumps(analysis, indent=2) + '\n')
sheet.save(EVIDENCE / 'repeat-comparison.png')
print(json.dumps(analysis, indent=2))
