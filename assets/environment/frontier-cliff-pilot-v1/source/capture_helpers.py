#!/usr/bin/env python3
"""Render a Meshy GLB into a registered eight-view reference atlas."""

from __future__ import annotations

from http.server import SimpleHTTPRequestHandler
from pathlib import Path
from urllib.parse import unquote, urlparse

from PIL import Image, ImageDraw, ImageFont


SIZE = 640
ANCHOR = (320, 376)
ORTHO_SCALE = 5.0
ELEVATION = 45.44
AZIMUTHS = (0, 45, 90, 135, 180, 225, 270, 315)
PASSES = ("color", "normal", "depth", "silhouette")


class RenderHandler(SimpleHTTPRequestHandler):
    project: Path
    repo: Path

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(self.repo), **kwargs)

    def do_POST(self) -> None:  # noqa: N802
        route = unquote(urlparse(self.path).path)
        prefix = "/__save/"
        if not route.startswith(prefix):
            self.send_error(404)
            return
        relative = Path(route[len(prefix):])
        destination = (self.project / relative).resolve()
        project = self.project.resolve()
        if project not in destination.parents or relative.is_absolute() or ".." in relative.parts:
            self.send_error(400, "invalid output path")
            return
        content_length = int(self.headers.get("Content-Length", "0"))
        payload = self.rfile.read(content_length)
        if not payload:
            self.send_error(400, "empty payload")
            return
        destination.parent.mkdir(parents=True, exist_ok=True)
        if destination.exists() and not getattr(self.server, "overwrite", False):
            self.send_error(409, "refusing to overwrite an existing file")
            return
        destination.write_bytes(payload)
        self.send_response(201)
        self.send_header("Content-Length", "0")
        self.end_headers()

    def log_message(self, format: str, *args) -> None:
        return


def contact_sheet(paths: list[Path], target: Path) -> None:
    cols, rows = 4, 2
    cell_h = SIZE + 34
    sheet = Image.new("RGB", (cols * SIZE, rows * cell_h), (49, 55, 50))
    draw = ImageDraw.Draw(sheet)
    try:
        font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 18)
    except OSError:
        font = ImageFont.load_default()
    for index, path in enumerate(paths):
        frame = Image.open(path).convert("RGBA")
        x = (index % cols) * SIZE
        y = (index // cols) * cell_h
        tile = Image.new("RGBA", (SIZE, SIZE), (49, 55, 50, 255))
        tile.alpha_composite(frame)
        sheet.paste(tile.convert("RGB"), (x, y))
        draw.text((x + 12, y + SIZE + 8),
                  f"VIEW {index:02d}  ·  AZ {AZIMUTHS[index]:03d}°  ·  EL {ELEVATION}°",
                  fill=(245, 238, 218), font=font)
    target.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(target, "PNG", optimize=True)
