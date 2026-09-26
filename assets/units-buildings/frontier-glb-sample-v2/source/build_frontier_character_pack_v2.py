#!/usr/bin/env python3
"""Prepare a versioned, source-complete Worker/Infantry/Archer + Barracks pack.

Build a review-only checkpoint in a new output directory. The script refuses to
overwrite an existing output directory. It imports the immutable 0.1.2 authoring
module for the shared humanoid core, Worker equipment, and Barracks, then authors
the reserved role parts and six focused source-review frames.
"""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import math
import random
import shutil
import struct
import sys
import zlib
from pathlib import Path

import bpy
from mathutils import Matrix, Vector


SCRIPT_PATH = Path(__file__).resolve()
SCRIPT_DIR = SCRIPT_PATH.parent
REPO_ROOT = SCRIPT_PATH.parents[1]
LOCAL_BASE_PACK = REPO_ROOT / "assets/units-buildings/frontier-glb-sample-v1"
BASE_PACK = LOCAL_BASE_PACK if LOCAL_BASE_PACK.is_dir() else SCRIPT_DIR.parent
BASE_SCRIPT = LOCAL_BASE_PACK / "source/build_sample_pack.py"
if not BASE_SCRIPT.is_file():
    BASE_SCRIPT = SCRIPT_DIR / "base_build_sample_v0_1_2.py"
LOCAL_ENVIRONMENT_ROOT = REPO_ROOT / "assets/environment/frontier-v1"
TERRAIN_SOURCE_ROOT = LOCAL_ENVIRONMENT_ROOT if (LOCAL_ENVIRONMENT_ROOT / "meadow.png").is_file() else SCRIPT_DIR / "terrain"
SPRITE_SOURCE_ROOT = LOCAL_ENVIRONMENT_ROOT if (LOCAL_ENVIRONMENT_ROOT / "pine.webp").is_file() else SCRIPT_DIR / "environment"
LICENSE = "LicenseRef-Thousand-Unit-Skirmish-Internal-Review"
TEAMS = {"azure": "#5AA7D7", "ember": "#E67A5E"}
FOCUSED_REVIEW_ZOOMS = (("0.91", 0.91),)
FOCUSED_REVIEW_MAPS = ("meadow",)
FOCUSED_REVIEW_TEAMS = (("azure", -1.0),)

# One small, project-authored atlas adds low-frequency painted finish without
# changing the compact vertex-color palette or increasing material/bin counts.
ATLAS_CELL = 256
ATLAS_COLUMNS = 3
ATLAS_ROWS = 2
ATLAS_WIDTH = ATLAS_CELL * ATLAS_COLUMNS
ATLAS_HEIGHT = ATLAS_CELL * ATLAS_ROWS
ATLAS_GUTTER = 0.055
ATLAS_FAMILY_TILES = {
    "cloth": (0, 0),
    "leather": (1, 0),
    "wood": (2, 0),
    "stone": (0, 1),
    "slate": (1, 1),
    "metal": (2, 1),
}
ATLAS_FAMILY_COLORS = {
    "cloth": ("#B99B50", "#B48664", "#9B7848", "#DEC579",
              "#68764F", "#78845B", "#556347"),
    "leather": ("#715137", "#3D3C31", "#3D443F", "#626B65"),
    "wood": ("#6F5034", "#564533", "#745C3D", "#302D27",
             "#826646", "#39372F"),
    "stone": ("#918C79", "#AAA28A"),
    "slate": ("#444B4A", "#5B625D"),
    "metal": ("#AAB4B1", "#ADB4B1", "#78858A", "#51595D", "#716D5E", "#E2DED1"),
}
ATLAS_FAMILY_BY_COLOR = {
    color: family
    for family, colors in ATLAS_FAMILY_COLORS.items()
    for color in colors
}
ATLAS_GPU_BYTES_PER_MODEL = 2_097_152  # 768x512 RGBA8 plus a complete mip chain.

UNIT_ROLES = {
    "worker": {
        "parts": ("unit.humanoid-core", "unit.team-accent", "unit.worker.backpack", "unit.worker.tool"),
        "poseStates": ("idle", "build"),
    },
    "infantry": {
        "parts": ("unit.humanoid-core", "unit.team-accent", "unit.infantry.shield", "unit.infantry.spear"),
        "poseStates": ("idle", "attack"),
    },
    "archer": {
        "parts": ("unit.humanoid-core", "unit.team-accent", "unit.archer.bow", "unit.archer.quiver"),
        "poseStates": ("idle", "attack"),
    },
}

BARRACKS_STAGE_SAMPLES = (
    {
        "id": "barracks-stage-00-foundation", "state": "foundation", "progress": 0.0,
        "poseId": "barracks-stage-00-foundation",
        "visibleNodes": ["barracks.foundation"],
        "hiddenNodes": ["barracks.state.construction", "barracks.state.complete"],
        "notes": "Stone footings establish the footprint before the timber frame is raised.",
    },
    {
        "id": "barracks-stage-25-frame", "state": "frame", "progress": 0.25,
        "poseId": "barracks-stage-25-frame",
        "visibleNodes": ["barracks.foundation", "barracks.state.construction"],
        "hiddenNodes": ["barracks.state.complete"],
        "notes": "Low wall courses and exposed timber/scaffolding indicate the active build.",
    },
    {
        "id": "barracks-stage-50-walls", "state": "walls", "progress": 0.5,
        "poseId": "barracks-stage-50-walls",
        "visibleNodes": ["barracks.foundation", "barracks.complete.wallShell"],
        "hiddenNodes": ["barracks.state.construction", "barracks.complete.gate",
                         "barracks.complete.gabledRoof", "barracks.complete.neutralTrim",
                         "barracks.complete.bannerPole", "barracks.standard.azure",
                         "barracks.standard.ember"],
        "notes": "The enclosed wall silhouette is complete; the roof and finished entrance remain absent.",
    },
    {
        "id": "barracks-stage-75-roof", "state": "roof", "progress": 0.75,
        "poseId": "barracks-stage-75-roof",
        "visibleNodes": ["barracks.foundation", "barracks.complete.wallShell",
                         "barracks.complete.gabledRoof"],
        "hiddenNodes": ["barracks.state.construction", "barracks.complete.gate",
                         "barracks.complete.neutralTrim", "barracks.complete.bannerPole",
                         "barracks.standard.azure", "barracks.standard.ember"],
        "notes": "The roof completes the large silhouette; the gate, neutral trim, and team standard are pending.",
    },
    {
        "id": "barracks-stage-100-complete", "state": "complete", "progress": 1.0,
        "poseId": "barracks-stage-100-complete",
        "visibleNodes": ["barracks.foundation", "barracks.state.complete",
                         "barracks.standard.azure", "barracks.standard.ember"],
        "hiddenNodes": ["barracks.state.construction"],
        "notes": "Finished gate/trim and exactly one team-shaped standard complete the building.",
    },
)

SAMPLES = (
    {"id": "worker-idle", "role": "worker", "state": "idle", "poseId": "worker-idle"},
    {"id": "worker-build", "role": "worker", "state": "build", "poseId": "worker-build"},
    {"id": "infantry-idle", "role": "infantry", "state": "idle", "poseId": "infantry-idle"},
    {"id": "infantry-attack", "role": "infantry", "state": "attack", "poseId": "infantry-attack"},
    {"id": "archer-idle", "role": "archer", "state": "idle", "poseId": "archer-idle"},
    {"id": "archer-attack", "role": "archer", "state": "attack", "poseId": "archer-attack"},
) + tuple(
    {
        "id": stage["id"], "role": "barracks", "state": stage["state"],
        "buildingProgress": stage["progress"], "poseId": stage["poseId"],
    }
    for stage in BARRACKS_STAGE_SAMPLES
)
FOCUSED_REVIEW_SAMPLE_IDS = frozenset((
    "worker-idle",
    *(stage["id"] for stage in BARRACKS_STAGE_SAMPLES),
))


def parse_args() -> argparse.Namespace:
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--output-dir",
        default="assets/units-buildings/frontier-glb-sample-v2",
        help="new package directory; existing destinations are never overwritten",
    )
    return parser.parse_args(args)


def import_base_authoring():
    if not BASE_SCRIPT.is_file():
        raise FileNotFoundError(f"Required 0.1.2 source is missing: {BASE_SCRIPT}")
    spec = importlib.util.spec_from_file_location("frontier_sample_v1", BASE_SCRIPT)
    if spec is None or spec.loader is None:
        raise ImportError(f"Cannot load the 0.1.2 authoring source: {BASE_SCRIPT}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _noise_grid(rng, size):
    return [[rng.uniform(-1.0, 1.0) for _ in range(size)] for _ in range(size)]


def _sample_noise(grid, u, v):
    height = len(grid)
    width = len(grid[0])
    x = u * (width - 1)
    y = v * (height - 1)
    x0, y0 = int(x), int(y)
    x1, y1 = min(x0 + 1, width - 1), min(y0 + 1, height - 1)
    fx, fy = x - x0, y - y0
    top = grid[y0][x0] * (1 - fx) + grid[y0][x1] * fx
    bottom = grid[y1][x0] * (1 - fx) + grid[y1][x1] * fx
    return top * (1 - fy) + bottom * fy


def _png_chunk(kind, payload):
    return (struct.pack(">I", len(payload)) + kind + payload
            + struct.pack(">I", zlib.crc32(kind + payload) & 0xFFFFFFFF))


def write_material_atlas(path):
    """Write a deterministic, softly painted RGBA8 atlas using only stdlib."""
    base_tones = {
        "cloth": (245, 241, 224),
        "leather": (241, 233, 219),
        "wood": (243, 234, 216),
        "stone": (239, 240, 231),
        "slate": (231, 237, 237),
        "metal": (239, 243, 246),
    }
    rows = [bytearray(ATLAS_WIDTH * 4) for _ in range(ATLAS_HEIGHT)]
    for family, (column, tile_row) in ATLAS_FAMILY_TILES.items():
        seed = zlib.crc32(f"frontier-atlas-v1:{family}".encode("ascii"))
        rng = random.Random(seed)
        broad_noise = _noise_grid(rng, 12)
        medium_noise = _noise_grid(rng, 32)
        fine_noise = _noise_grid(rng, 72)
        phase = rng.uniform(0.0, math.tau)
        tile_top = (ATLAS_ROWS - 1 - tile_row) * ATLAS_CELL
        tone = base_tones[family]
        for y in range(ATLAS_CELL):
            v = y / (ATLAS_CELL - 1)
            py = tile_top + y
            for x in range(ATLAS_CELL):
                u = x / (ATLAS_CELL - 1)
                broad = _sample_noise(broad_noise, u, v)
                medium = _sample_noise(medium_noise, u, v)
                fine = _sample_noise(fine_noise, u, v)
                grain = 0.0
                if family == "cloth":
                    grain = 1.1 * math.sin((x + y * 0.28 + phase) / 17.0)
                    grain += 0.7 * math.sin((y + phase) / 23.0)
                elif family == "leather":
                    grain = 1.5 * math.sin((x * 0.42 + y * 0.31 + phase) / 10.0)
                elif family == "wood":
                    grain = 3.0 * math.sin((y + 1.8 * math.sin(x / 23.0) + phase) / 7.0)
                elif family == "stone":
                    grain = 1.4 * math.sin((x + y * 0.63 + phase) / 15.0)
                elif family == "slate":
                    grain = 2.1 * math.sin((y + x * 0.18 + phase) / 10.0)
                elif family == "metal":
                    grain = 1.7 * math.sin((x + y * 0.10 + phase) / 5.0)
                shade = broad * 5.0 + medium * 2.4 + fine * 0.8 + grain
                offset = (column * ATLAS_CELL + x) * 4
                # A narrow luminance range keeps the vertex-color palette in charge.
                for channel, component in enumerate(tone):
                    rows[py][offset + channel] = max(218, min(255, round(component + shade)))
                rows[py][offset + 3] = 255

    scanlines = b"".join(b"\x00" + bytes(row) for row in rows)
    png = bytearray(b"\x89PNG\r\n\x1a\n")
    png.extend(_png_chunk(b"IHDR", struct.pack(">IIBBBBB", ATLAS_WIDTH, ATLAS_HEIGHT, 8, 6, 0, 0, 0)))
    png.extend(_png_chunk(b"IDAT", zlib.compress(scanlines, 9)))
    png.extend(_png_chunk(b"IEND", b""))
    path.write_bytes(png)


def atlas_family_for_color(color):
    normalized = color.upper()
    if not normalized.startswith("#"):
        normalized = "#" + normalized
    try:
        return ATLAS_FAMILY_BY_COLOR[normalized]
    except KeyError as error:
        raise ValueError(f"No neutral material-atlas family for vertex color {normalized}") from error


def assign_polygon_atlas_uvs(mesh, polygon_families):
    if len(polygon_families) != len(mesh.polygons):
        raise ValueError(f"Atlas UV family count does not match mesh {mesh.name}")
    uv_layer = mesh.uv_layers.active
    if uv_layer is None:
        uv_layer = mesh.uv_layers.new(name="UVMap")
    mesh.update()
    for polygon, family in zip(mesh.polygons, polygon_families):
        column, row = ATLAS_FAMILY_TILES[family]
        normal = polygon.normal
        dropped_axis = max(range(3), key=lambda axis: abs(normal[axis]))
        axes = [axis for axis in range(3) if axis != dropped_axis]
        projected = {
            loop_index: tuple(mesh.vertices[mesh.loops[loop_index].vertex_index].co[axis] for axis in axes)
            for loop_index in polygon.loop_indices
        }
        mins = [min(point[axis] for point in projected.values()) for axis in range(2)]
        maxs = [max(point[axis] for point in projected.values()) for axis in range(2)]
        spans = [maxs[axis] - mins[axis] for axis in range(2)]
        u0 = (column + ATLAS_GUTTER) / ATLAS_COLUMNS
        u1 = (column + 1 - ATLAS_GUTTER) / ATLAS_COLUMNS
        v0 = (row + ATLAS_GUTTER) / ATLAS_ROWS
        v1 = (row + 1 - ATLAS_GUTTER) / ATLAS_ROWS
        for loop_index, point in projected.items():
            normalized = [0.5 if spans[axis] < 1e-8 else (point[axis] - mins[axis]) / spans[axis]
                          for axis in range(2)]
            uv_layer.data[loop_index].uv = (
                u0 + normalized[0] * (u1 - u0),
                v0 + normalized[1] * (v1 - v0),
            )


def _linear_to_srgb8(value):
    srgb = value * 12.92 if value <= 0.0031308 else 1.055 * (value ** (1 / 2.4)) - 0.055
    return max(0, min(255, round(srgb * 255)))


def assign_uvs_from_vertex_colors(mesh, family_override=None):
    colors = mesh.color_attributes.get("Col")
    if colors is None:
        raise ValueError(f"Neutral atlas mesh {mesh.name} has no Col attribute")
    families = []
    for polygon in mesh.polygons:
        loop_index = next(iter(polygon.loop_indices), None)
        if loop_index is None:
            raise ValueError(f"Neutral atlas mesh {mesh.name} has an empty polygon")
        color = colors.data[loop_index].color
        family = family_override or atlas_family_for_color(
            "#" + "".join(f"{_linear_to_srgb8(channel):02X}" for channel in color[:3])
        )
        families.append(family)
    assign_polygon_atlas_uvs(mesh, families)


def install_atlas_uv_mapping(base):
    original_mesh_object = base.MeshBuilder.mesh_object

    def mesh_object_with_atlas(self, *args, **kwargs):
        material = kwargs.get("material", args[3] if len(args) > 3 else base.UNIT_NEUTRAL)
        obj = original_mesh_object(self, *args, **kwargs)
        if material in (base.UNIT_NEUTRAL, base.BARRACKS_NEUTRAL):
            families = [atlas_family_for_color(color) for color in self.colors]
            assign_polygon_atlas_uvs(obj.data, families)
        return obj

    base.MeshBuilder.mesh_object = mesh_object_with_atlas


def configure_atlas_material(material, atlas_image):
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    principled = nodes.get("Principled BSDF")
    if principled is None:
        raise ValueError(f"Material {material.name} has no Principled BSDF")
    for link in list(links):
        if link.to_socket == principled.inputs["Base Color"]:
            links.remove(link)
    color_node = next((node for node in nodes if node.type == "VERTEX_COLOR"), None)
    if color_node is None:
        color_node = nodes.new("ShaderNodeVertexColor")
    color_node.layer_name = "Col"
    color_node.label = "Broad palette color"
    texture = nodes.new("ShaderNodeTexImage")
    texture.image = atlas_image
    texture.interpolation = "Linear"
    texture.extension = "CLIP"
    texture.label = "Shared painted material atlas"
    texcoord = nodes.new("ShaderNodeTexCoord")
    texcoord.label = "Packed atlas UVs"
    links.new(texcoord.outputs["UV"], texture.inputs["Vector"])
    multiply = nodes.new("ShaderNodeMixRGB")
    multiply.blend_type = "MULTIPLY"
    multiply.inputs["Fac"].default_value = 1.0
    multiply.label = "Atlas finish × vertex palette"
    links.new(texture.outputs["Color"], multiply.inputs["Color1"])
    links.new(color_node.outputs["Color"], multiply.inputs["Color2"])
    links.new(multiply.outputs["Color"], principled.inputs["Base Color"])


def configure_preview_atlas_material(material, atlas_image):
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    emission = next((node for node in nodes if node.type == "EMISSION"), None)
    color_node = next((node for node in nodes if node.type == "VERTEX_COLOR"), None)
    if emission is None or color_node is None:
        raise ValueError("The neutral review material is missing its emission/vertex-color nodes")
    for link in list(links):
        if link.to_socket == emission.inputs["Color"]:
            links.remove(link)
    texture = nodes.new("ShaderNodeTexImage")
    texture.image = atlas_image
    texture.interpolation = "Linear"
    texture.extension = "CLIP"
    texcoord = nodes.new("ShaderNodeTexCoord")
    links.new(texcoord.outputs["UV"], texture.inputs["Vector"])
    multiply = nodes.new("ShaderNodeMixRGB")
    multiply.blend_type = "MULTIPLY"
    multiply.inputs["Fac"].default_value = 1.0
    links.new(texture.outputs["Color"], multiply.inputs["Color1"])
    links.new(color_node.outputs["Color"], multiply.inputs["Color2"])
    links.new(multiply.outputs["Color"], emission.inputs["Color"])


def add_role_parts(base, root):
    MeshBuilder = base.MeshBuilder
    UNIT_NEUTRAL = base.UNIT_NEUTRAL
    UNIT_PALETTE = base.UNIT_PALETTE

    # Dark six-sided neutral shield; only the shared sash carries per-unit tint.
    shield = MeshBuilder()
    shield.prism_xy(
        [(-0.155, 0.30), (0.0, 0.24), (0.155, 0.30),
         (0.14, 0.56), (0.0, 0.68), (-0.14, 0.56)],
        0.0, 0.075, "#3D443F",
    )
    shield.prism_xy(
        [(-0.116, 0.32), (0.0, 0.275), (0.116, 0.32),
         (0.105, 0.54), (0.0, 0.625), (-0.105, 0.54)],
        0.043, 0.012, "#626B65",
    )
    shield.prism_xy([(-0.018, 0.36), (0.018, 0.36), (0.018, 0.55), (-0.018, 0.55)],
                    0.052, 0.008, "#AAB4B1")
    shield_obj = shield.mesh_object(
        "unit.infantry.shield", root, location=(-0.31, 0.0, 0.23),
        material=UNIT_NEUTRAL, batch_key="unit.infantry.shield",
    )

    # One rigid spear mesh, with a timber shaft and a bright, readable iron tip.
    spear = MeshBuilder()
    spear.cylinder_y((0.0, 0.0, 0.0), 0.023, 0.93, 6, UNIT_PALETTE["wood"])
    spear.frustum_y((0.0, 0.0, 0.0), (0.0, 0.41), (0.0, 0.56),
                    (0.073, 0.065), (0.008, 0.008), UNIT_PALETTE["iron"])
    # Keep the shared core, but place a steel-grey cap in the neutral spear bin
    # so Infantry gains its own broad head silhouette without a ninth draw bin.
    spear.frustum_y((-0.29, 0.0, 0.035), (0.0, 0.16), (0.0, 0.285),
                    (0.33, 0.28), (0.18, 0.18), "#78858A")
    spear.box((-0.29, 0.175, 0.18), (0.34, 0.045, 0.035), "#51595D")
    spear.box((-0.29, 0.30, 0.035), (0.04, 0.025, 0.20), "#ADB4B1")
    spear_obj = spear.mesh_object(
        "unit.infantry.spear", root, location=(0.29, 0.535, 0.02),
        material=UNIT_NEUTRAL, batch_key="unit.infantry.spear",
    )

    # Faceted crescent bow and string occupy a single wood-colored role bin.
    bow = MeshBuilder()
    bow.prism_xy(
        [(0.00, 0.03), (0.095, 0.12), (0.145, 0.29), (0.145, 0.49),
         (0.095, 0.66), (0.00, 0.75), (0.028, 0.66), (0.075, 0.49),
         (0.075, 0.29), (0.028, 0.12)],
        0.0, 0.055, UNIT_PALETTE["wood"],
    )
    bow.prism_xy([(0.00, 0.03), (0.009, 0.03), (0.154, 0.75), (0.145, 0.75)],
                 0.008, 0.014, UNIT_PALETTE["iron"])
    bow_obj = bow.mesh_object(
        "unit.archer.bow", root, location=(0.25, 0.08, 0.24),
        material=UNIT_NEUTRAL, batch_key="unit.archer.bow",
    )

    # Quiver, strap, and three oversized fletches stay within one neutral bin.
    quiver = MeshBuilder()
    quiver.box((0.0, 0.0, 0.0), (0.19, 0.40, 0.17), UNIT_PALETTE["leather"])
    quiver.box((0.0, 0.18, 0.015), (0.23, 0.065, 0.19), UNIT_PALETTE["wood"])
    quiver.box((0.0, 0.04, 0.09), (0.06, 0.49, 0.035), UNIT_PALETTE["highlight"])
    for x in (-0.055, 0.0, 0.055):
        quiver.prism_xy([(x - 0.025, 0.25), (x, 0.34), (x + 0.025, 0.25)],
                        0.02, 0.018, UNIT_PALETTE["iron"])
    # The hood sits over the shared cap; its rear drape separates the Archer's
    # silhouette from Worker/Infantry while remaining inside the quiver batch.
    quiver.frustum_y((0.20, 0.0, 0.18), (0.0, 0.15), (0.0, 0.28),
                     (0.34, 0.28), (0.19, 0.20), "#68764F")
    quiver.box((0.20, 0.16, 0.30), (0.34, 0.035, 0.08), "#78845B")
    quiver.prism_xy([(0.095, 0.17), (0.305, 0.17), (0.29, 0.04), (0.115, 0.035)],
                    0.035, 0.045, "#556347")
    quiver_obj = quiver.mesh_object(
        "unit.archer.quiver", root, location=(-0.20, 0.53, -0.13),
        material=UNIT_NEUTRAL, batch_key="unit.archer.quiver",
    )

    base.empty_node("unit.anchor.infantryShieldGrip", root, (-0.31, 0.38, 0.23), "attachment")
    base.empty_node("unit.anchor.infantrySpearGrip", root, (0.29, 0.42, 0.02), "attachment")
    base.empty_node("unit.anchor.archerBowGrip", root, (0.25, 0.43, 0.24), "attachment")
    base.empty_node("unit.anchor.archerQuiverSocket", root, (-0.20, 0.53, -0.13), "attachment")
    root["unitBatchCount"] = 8
    return {
        "infantryShield": shield_obj,
        "infantrySpear": spear_obj,
        "archerBow": bow_obj,
        "archerQuiver": quiver_obj,
    }


def set_neutral_vertex_mesh(base, obj, color, batch_key, node_name, atlas_family=None):
    """Keep inherited construction cloth/trim geometry, but remove team tint."""
    colors = obj.data.color_attributes.get("Col")
    if colors is not None:
        rgba = base.linear_rgba(color)
        for entry in colors.data:
            entry.color = rgba
    obj.data.materials.clear()
    obj.data.materials.append(base.BARRACKS_NEUTRAL)
    obj.name = node_name
    obj["batchKey"] = batch_key
    obj["paletteSlot"] = "neutral"
    assign_uvs_from_vertex_colors(obj.data, family_override=atlas_family)


def author_barracks_standards(base, barracks_root, parts):
    """Limit building team color to small, shape-distinct Azure/Ember pennants."""
    base.BARRACKS_TEAM.name = "team-accent-building-standard"
    for key in ("standardAzure", "standardEmber"):
        old = parts[key]
        old_mesh = old.data
        bpy.data.objects.remove(old, do_unlink=True)
        if old_mesh.users == 0:
            bpy.data.meshes.remove(old_mesh)

    azure = base.MeshBuilder(pivot=(0, 0, 0))
    # Azure: straight-cut field with one centered bar.
    azure.prism_xy([(0.55, 2.10), (1.18, 2.10), (1.18, 1.79), (0.55, 1.79)],
                   1.54, 0.035, "#FFFFFF")
    azure.prism_xy([(0.63, 1.94), (1.10, 1.94), (1.10, 1.985), (0.63, 1.985)],
                   1.582, 0.012, "#A9C0C9")
    azure_obj = azure.mesh_object(
        "barracks.standard.azure", barracks_root, material=base.BARRACKS_TEAM,
        batch_key="building.barracks.standard.azure",
    )
    azure_obj["teamVariant"] = "azure"
    azure_obj["paletteSlot"] = "team-accent"

    ember = base.MeshBuilder(pivot=(0, 0, 0))
    # Ember: forked tail with a visibly split two-piece center bar.
    ember.prism_xy([(0.55, 2.10), (1.18, 2.10), (0.99, 1.945),
                    (1.18, 1.79), (0.55, 1.79)],
                   1.54, 0.035, "#FFFFFF")
    ember.prism_xy([(0.64, 1.965), (0.85, 1.965), (0.85, 2.005), (0.64, 2.005)],
                   1.582, 0.012, "#56534F")
    ember.prism_xy([(0.91, 1.965), (1.12, 1.965), (1.12, 2.005), (0.91, 2.005)],
                   1.582, 0.012, "#56534F")
    ember_obj = ember.mesh_object(
        "barracks.standard.ember", barracks_root, material=base.BARRACKS_TEAM,
        batch_key="building.barracks.standard.ember",
    )
    ember_obj["teamVariant"] = "ember"
    ember_obj["paletteSlot"] = "team-accent"
    parts["standardAzure"] = azure_obj
    parts["standardEmber"] = ember_obj
    return parts


def extended_pose_samples(base):
    poses = json.loads((BASE_PACK / "source/pose-samples.json").read_text(encoding="utf-8"))
    for obsolete in ("barracks-construction-mid", "barracks-complete"):
        poses["sampledPoses"].pop(obsolete, None)
    def part(names, rotation=(0, 0, 0), delta=(0, 0, 0)):
        return {name: {"translationDeltaWorld": list(delta), "rotationDegXYZ": list(rotation)} for name in names}

    core = ("unit.humanoid-core", "unit.team-accent")
    infantry = core + ("unit.infantry.shield", "unit.infantry.spear")
    archer = core + ("unit.archer.bow", "unit.archer.quiver")
    poses["sampledPoses"].update({
        "infantry-idle": {
            "state": "idle", "partTransforms": part(infantry),
            "notes": "Upright spear and forward six-sided shield; rigid-part base pose.",
        },
        "infantry-attack": {
            "state": "attack",
            "partTransforms": part(core, (3, 0, 0)) | {
                "unit.infantry.shield": {"translationDeltaWorld": [0, 0, 0], "rotationDegXYZ": [-4, 0, 0]},
                "unit.infantry.spear": {"translationDeltaWorld": [0.025, 0.03, 0.10], "rotationDegXYZ": [38, 0, 0]},
            },
            "notes": "Short forward spear sample. The renderer may interpolate from idle while retaining rigid-part instancing.",
        },
        "archer-idle": {
            "state": "idle", "partTransforms": part(archer),
            "notes": "Narrow bow-and-quiver profile; rigid-part base pose.",
        },
        "archer-attack": {
            "state": "attack",
            "partTransforms": part(core, (2, 0, 0)) | {
                "unit.archer.bow": {"translationDeltaWorld": [0.02, 0.02, 0.05], "rotationDegXYZ": [-10, 0, -8]},
                "unit.archer.quiver": {"translationDeltaWorld": [0, 0, 0], "rotationDegXYZ": [2, 0, 0]},
            },
            "notes": "Brief forward draw/release sample; renderer owns continuous timing and projectiles.",
        },
    })
    for stage in BARRACKS_STAGE_SAMPLES:
        pose = {
            "state": stage["state"],
            "buildingProgress": stage["progress"],
            "visibleNodes": stage["visibleNodes"],
            "hiddenNodes": stage["hiddenNodes"],
            "notes": stage["notes"],
        }
        if stage["state"] == "complete":
            pose["rendererCue"] = {
                "anchorId": "productionCue",
                "condition": "building.complete === true && building.queue > 0 && building.productionBlocked !== true",
                "style": "small team-tinted pulse",
                "assetOwnedGeometry": False,
                "sampleVisible": True,
            }
        poses["sampledPoses"][stage["poseId"]] = pose
    return poses


def mesh_bounds(base, root, wanted_names):
    bpy.context.view_layer.update()
    points = []
    for obj in base.descendants(root):
        if obj.type != "MESH" or obj.name not in wanted_names:
            continue
        for vertex in obj.data.vertices:
            world = obj.matrix_world @ vertex.co
            points.append((world.x, world.z, -world.y))
    if not points:
        raise ValueError(f"No mesh vertices found for bounds: {sorted(wanted_names)}")
    mins = [min(point[i] for point in points) for i in range(3)]
    maxs = [max(point[i] for point in points) for i in range(3)]
    return {
        "width": round(maxs[0] - mins[0], 4),
        "height": round(maxs[1] - mins[1], 4),
        "depth": round(maxs[2] - mins[2], 4),
    }


def clear_preview_objects(scene):
    for obj in list(scene.objects):
        if obj.get("previewOwned") or obj.name.startswith(("preview.", "ground.", "sun")):
            bpy.data.objects.remove(obj, do_unlink=True)


def clone_role_for_preview(base, unit_root, role, team, location):
    preview_root = base.root_for_preview(f"preview.{role}.{team}", location)
    wanted = set(UNIT_ROLES[role]["parts"])
    for child in base.descendants(unit_root):
        if child.type == "MESH" and child.name in wanted:
            base.clone_mesh_for_preview(child, preview_root, team_color=team)
    sample_id = next(sample["poseId"] for sample in SAMPLES if sample["role"] == role and sample["state"] == "idle")
    pose = CURRENT_POSES["sampledPoses"][sample_id]["partTransforms"]
    for obj in preview_root.children:
        transform = pose.get(obj.name)
        if transform:
            delta = transform.get("translationDeltaWorld", (0, 0, 0))
            obj.location += Vector(base.game_to_blender(delta))
            obj.rotation_euler = tuple(math.radians(value) for value in transform["rotationDegXYZ"])
    if team == "ember":
        preview_root.rotation_euler = Matrix.Rotation(math.pi, 4, "Z").to_euler()
    return preview_root


CURRENT_POSES = None


def apply_pose(base, preview_root, pose_id):
    pose = CURRENT_POSES["sampledPoses"][pose_id]["partTransforms"]
    for obj in preview_root.children:
        transform = pose.get(obj.name)
        if transform:
            delta = transform.get("translationDeltaWorld", (0, 0, 0))
            obj.location += Vector(base.game_to_blender(delta))
            rotation = transform["rotationDegXYZ"]
            obj.rotation_euler = tuple(math.radians(value) for value in rotation)


def render_review_frames(base, out, unit_root, barracks_root):
    global CURRENT_POSES
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1280
    scene.render.resolution_y = 720
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "8"
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "Medium High Contrast"
    scene.render.film_transparent = False
    base.make_preview_unlit_material("preview-neutral-unlit", vertex_colors=True)
    configure_preview_atlas_material(
        bpy.data.materials["preview-neutral-unlit"],
        bpy.data.images["frontier-material-atlas.png"],
    )
    base.make_preview_unlit_material("preview-team-azure", TEAMS["azure"])
    base.make_preview_unlit_material("preview-team-ember", TEAMS["ember"])
    base.make_preview_unlit_material("preview-team-barracks-azure", vertex_colors=True, tint=TEAMS["azure"])
    base.make_preview_unlit_material("preview-team-barracks-ember", vertex_colors=True, tint=TEAMS["ember"])
    scene.world.use_nodes = True
    scene.world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.38, 0.42, 0.33, 1)
    scene.world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.82
    world_height = 43.0 / 0.91
    world_width = world_height * 1280.0 / 720.0
    samples = [sample for sample in SAMPLES if sample["id"] in FOCUSED_REVIEW_SAMPLE_IDS]

    frames = []
    for sample in samples:
        for ground in FOCUSED_REVIEW_MAPS:
            for zoom_label, zoom in FOCUSED_REVIEW_ZOOMS:
                clear_preview_objects(scene)
                ground_path = out / "source/terrain" / f"{ground}.png"
                ground_mat = base.add_ground_material(f"ground.{ground}", ground_path)
                base.create_ground(f"ground.{ground}", ground_path, ground_mat, span=420.0)
                base.add_preview_environment_sprites()

                camera_data = bpy.data.cameras.new("preview.camera")
                camera_data.type = "ORTHO"
                camera = bpy.data.objects.new("preview.camera", camera_data)
                scene.collection.objects.link(camera)
                scene.camera = camera
                camera.location = base.game_to_blender(tuple(Vector((0.78, 1.12, 0.78)).normalized() * 120.0))
                camera.rotation_euler = (Vector(base.game_to_blender((0, 0, 0))) - camera.location).to_track_quat("-Z", "Y").to_euler()
                camera.data.ortho_scale = world_width / zoom
                camera.data.clip_start = 0.1
                camera.data.clip_end = 400

                light_data = bpy.data.lights.new("sun", "SUN")
                light_data.energy = 1.5
                light_data.angle = math.radians(15)
                sun = bpy.data.objects.new("sun", light_data)
                scene.collection.objects.link(sun)
                light_position = Vector(base.game_to_blender((-24, 38, 20)))
                sun.location = light_position
                sun.rotation_euler = (-light_position).to_track_quat("-Z", "Y").to_euler()

                if sample["role"] == "barracks":
                    preview_roots = {}
                    visible = set(CURRENT_POSES["sampledPoses"][sample["poseId"]]["visibleNodes"])
                    for team, sign in FOCUSED_REVIEW_TEAMS:
                        pos = (sign * 4.0 / math.sqrt(2), 0.0, -sign * 4.0 / math.sqrt(2))
                        root = base.root_for_preview(f"preview.barracks.{team}", pos)
                        for child in base.descendants(barracks_root):
                            if child.type != "MESH":
                                continue
                            variant = child.get("teamVariant")
                            if variant and variant != team:
                                continue
                            if child.name in visible or (child.parent and child.parent.name in visible):
                                base.clone_mesh_for_preview(child, root, team_color=team)
                        if sample["state"] == "complete":
                            cue = base.make_queue_cue((pos[0] - 0.72, 1.32, pos[2] + 1.28), team)
                            cue.parent = root
                            cue.matrix_parent_inverse = Matrix.Identity(4)
                            cue.location = base.game_to_blender((-0.72, 1.32, 1.28))
                        if team == "ember":
                            root.rotation_euler = Matrix.Rotation(math.pi, 4, "Z").to_euler()
                        preview_roots[team] = root
                else:
                    preview_roots = {}
                    for team, sign in FOCUSED_REVIEW_TEAMS:
                        pos = (sign * 1.5 / math.sqrt(2), 0.0, -sign * 1.5 / math.sqrt(2))
                        preview_roots[team] = clone_role_for_preview(base, unit_root, sample["role"], team, pos)
                        apply_pose(base, preview_roots[team], sample["poseId"])

                filename = f"{sample['id']}-{ground}-zoom-{zoom_label}-1280x720.png"
                path = out / "previews" / filename
                scene.render.filepath = str(path)
                bpy.ops.render.render(write_still=True)
                frames.append(f"previews/{filename}")
    clear_preview_objects(scene)
    return frames


def part_record(part_id, node, batch_key, palette_slot, team_variant=None, notes=None, instance_tint=None):
    record = {"id": part_id, "node": node, "batchKey": batch_key, "paletteSlot": palette_slot}
    if team_variant:
        record["teamVariant"] = team_variant
    if notes:
        record["notes"] = notes
    if instance_tint:
        record["instanceTint"] = instance_tint
    return record


def file_sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def write_game_dev_package_requests(out, provenance_path):
    """Prepare per-model metadata for later, separately authorized CLI builds."""
    common_policy = {
        "requireUVs": True,
        "requireNormals": True,
        "requireTangentsWithNormalMap": True,
        "requireBaseColorTexture": True,
        "maxTriangles": 1200,
        "maxMaterials": 3,
        "minTextureSize": 512,
        "requirePowerOfTwoTextures": False,
        "maxDimensionMeters": 4.0,
        "minDimensionMeters": 0.1,
    }
    requests = {
        "game-dev-package-unit.json": {
            "name": "Frontier Three-Role Unit Kit",
            "version": "0.2.0",
            "description": "Project-authored Worker, Infantry, and Archer rigid-part models with a shared painted material atlas.",
            "category": "character",
            "license": LICENSE,
            "provenance": {
                "origin": "authored",
                "packProvenancePath": provenance_path,
                "notes": "See the versioned v0.2 pack manifest for anchors, role parts, team variants, state samples, texture budget, and file digests. The model and atlas are project-authored; no provider-generated source was used.",
            },
            "policy": common_policy,
        },
        "game-dev-package-barracks.json": {
            "name": "Frontier Barracks",
            "version": "0.2.0",
            "description": "Project-authored five-stage Barracks construction samples with neutral architecture and shape-coded team standards.",
            "category": "architecture",
            "license": LICENSE,
            "provenance": {
                "origin": "authored",
                "packProvenancePath": provenance_path,
                "notes": "See the versioned v0.2 pack manifest for anchors, construction states, standard variants, atlas mapping, texture budget, and file digests. The model and atlas are project-authored; no provider-generated source was used.",
            },
            "policy": common_policy,
        },
    }
    for name, request in requests.items():
        path = out / "source" / name
        path.write_text(json.dumps(request, indent=2) + "\n", encoding="utf-8")


def write_metadata(out, base, unit_root, barracks_root, frames, poses):
    expected_frames = {
        f"previews/{sample['id']}-{ground}-zoom-{zoom}-1280x720.png"
        for sample in SAMPLES if sample["id"] in FOCUSED_REVIEW_SAMPLE_IDS
        for ground in FOCUSED_REVIEW_MAPS
        for zoom, _factor in FOCUSED_REVIEW_ZOOMS
    }
    if len(frames) != len(expected_frames) or set(frames) != expected_frames:
        raise RuntimeError(
            f"Review frame roster mismatch: expected {len(expected_frames)} unique frames, found {len(frames)}"
        )
    readme = """# Frontier character and Barracks pack

Checkpoint 0.2.0 adds the Worker, Infantry, and Archer to the compact GLB asset set. The immutable 0.1.2 checkpoint remains a separate package.

## Visual finish

The models use simple faceted geometry with broad vertex-color value shapes and one shared, low-frequency material atlas for cloth, leather, wood, stone, slate, and metal. The matte finish is intended to sit beside the painterly environment cutouts; the renderer contract proposes displaying it through the existing unlit material path. Team color is limited to the shared unit sash and small, shape-coded building standards; role equipment and building architecture stay neutral. Here, “skin” means material finish. The parts are rigid and do not use skeletal skinning.

## Assets

- `models/unit-art-v2.glb` contains one shared humanoid core and sash plus the Worker backpack/tool, Infantry six-sided shield/spear, and Archer bow/quiver. The steel-grey Infantry cap and moss-green Archer hood are included in their existing role bins. The renderer owner accepted eight bins per team: head-plus-torso core to `bodyMeshes` (neutral), sash to `teamAccentMeshes` (`TEAM_HEX` on the sash only, replacing the old `headMeshes` sphere slot), and Worker backpack/tool, Infantry shield/spear, and Archer bow/quiver to their matching existing slots. The sash inherits the core pose and GLB node transform; independent head-sphere bob is dropped. Loader integration remains pending.
- `models/barracks.glb` contains five sampled progress states at 0%, 25%, 50%, 75%, and 100%: foundation, frame, walls, roof, and finished details. All states share one ground pivot. Ten authored part groups include two mutually exclusive standards; the renderer selects exactly one matching the building team, with at most nine active building batches. `barracks.anchor.productionCue` is an anchor only; queue state and cue geometry belong to the renderer.
- Both GLBs embed the same 768×512 RGBA8 atlas. Team accents are outside the atlas. The projected resident texture estimate is 4 MiB for both embedded copies, assuming full mip chains and no cross-model GPU sharing.
- `source/frontier-material-atlas.png`, `source/frontier-character-pack-v2.blend`, the authoring scripts, and `source/pose-samples.json` preserve the atlas, editable Blender scene, and sampled rigid-part transforms. The scene opens with the Worker and completed Azure Barracks visible; the other role parts, construction state, and Ember standard remain available in the Outliner.
- `source/game-dev-package-unit.json` and `source/game-dev-package-barracks.json` are policy/provenance requests for later canonical packages. Building those packages is a separate authorized write.

Town Center (wide stone hall with a taller rear tower) and Archery Range (open canopy with a front target) are planned for a later checkpoint and are not included here.

## Review limits

This focused source review contains six individual 1280×720 frames: one Azure Worker at gameplay zoom 0.91 and five Azure Barracks progress states at the same zoom and camera over Meadow. The sequence broadly reads in order, but the roof and complete stages look too similar at about 50 pixels wide. The complete frame's cyan mark is a temporary renderer-cue stand-in, absent from both GLBs and not evidence that the Azure standard reads. The renderer owner requested a broader neutral gate/front trim and clearer Azure/Ember standards in the existing part groups; these revisions are pending a new source render. The Worker is about 12 pixels tall, so its backpack and tool are not yet assessable at normal zoom. Infantry, Archer, other Worker poses, strategic zoom, Cinder, and close craft views remain unreviewed. Source renders do not establish runtime signoff. The current game renderer still draws procedural geometry and does not load these GLBs; loader integration and an authored-GLB 2,000-unit measurement remain open.

The Worker body is about 12 pixels tall at zoom 0.91. Its backpack and broad tool were not assessable in the full-field frame. At zoom 0.48, use the renderer-owned instanced role LOD without changing world scale. Exported atlas/UV data has been inspected and rendered, but the finish has not received broad art signoff; the generic validator reports the 768×512 atlas's shortest edge below its 1024-pixel guidance and its non-power-of-two dimensions. It passes the project's 512-pixel policy. Review native-size in-game frames before accepting the material finish.

`manifest.json` records bounds, anchors, batch keys, team variants, atlas family/UV mapping, texture estimate, state samples, review views, provenance, and file hashes. Run `game-dev asset inspect models/unit-art-v2.glb --json` and `game-dev asset inspect models/barracks.glb --json` for read-only inspection. `SHA256SUMS.txt` covers every package file except itself.
"""
    provenance = """# Provenance

The shared humanoid core, Worker parts, and Barracks derive from the project-owned 0.1.2 Blender source `source/base_build_sample_v0_1_2.py`. The Worker toolhead is widened 1.25× within its existing batch. The Infantry shield/spear and steel-grey cap, and the Archer bow/quiver and moss hood, are original low-poly geometry authored by `source/build_frontier_character_pack_v2.py` in Blender 5.2.1 LTS. The deterministic RGBA8 atlas is project-authored by the same source. No paid provider, external model, or third-party game art was used.

The inherited Barracks construction cloth and trim are recolored neutral. Its Azure standard is a straight-cut pennant with one centered bar; its Ember standard is forked-tail with a split bar. Terrain and preview-only tree/rock images are copied byte-for-byte from `assets/environment/frontier-v1/`; their existing internal license is retained.

All new content is licensed for internal review under `LicenseRef-Thousand-Unit-Skirmish-Internal-Review`. `SHA256SUMS.txt` records every pack file other than itself.
"""
    (out / "README.md").write_text(readme, encoding="utf-8")
    provenance = provenance.replace(
        "The shared humanoid core, Worker parts, and Barracks derive",
        "The v0.2 Worker toolhead is widened 1.25x within its existing batch. The shared humanoid core, Worker parts, and Barracks derive",
    )
    provenance = provenance.replace(
        "No paid provider, external model, or third-party game art was used.",
        "The inherited Barracks construction cloth and trim are recolored neutral; its small standards are reshaped as Azure's straight-cut pennant with one centered bar and Ember's forked-tail pennant with a split bar. No paid provider, external model, or third-party game art was used.",
    )
    provenance = provenance.replace(
        "named anchors, and per-team instance tint.",
        "named anchors, sash-only per-unit tint, and team color reserved for the small building standard.",
    )
    provenance = provenance.replace(
        "team color reserved for the small building standard.",
        "team color reserved for the small building standard. The Barracks `productionCue` is an anchor only; no lamp or queue state is exported in the GLB.",
    )
    (out / "PROVENANCE.md").write_text(provenance, encoding="utf-8")
    input_records = []
    for path in sorted(item for item in out.rglob("*") if item.is_file()):
        rel = path.relative_to(out).as_posix()
        if rel in {"manifest.json", "SHA256SUMS.txt"}:
            continue
        if rel.startswith("models/"):
            role = "model"
            note = "Original or retained Blender-authored low-poly GLB for the oblique Three.js renderer."
        elif rel.startswith("previews/"):
            role = "review-image"
            note = "Native 1280x720 Blender source render at the named game zoom over copied Meadow terrain and preview-only billboards; the focused frame shows one Azure instance."
            if Path(rel).name.startswith("barracks-stage-"):
                note += " One of five aligned Barracks progress-state samples sharing the same footprint, ground pivot, and review camera."
            if Path(rel).name.startswith(("barracks-complete-", "barracks-stage-100-complete-")):
                note += " A temporary renderer-owned queue cue stand-in appears for context only; it is absent from both model GLBs."
        elif rel == "source/frontier-material-atlas.png":
            role = "source-image"
            note = "Deterministic 768x512 RGBA8 project-authored material atlas; the shared image is embedded in both model GLBs."
        elif rel.startswith("source/terrain/") or rel.startswith("source/environment/"):
            role = "source-image"
            note = "Byte-for-byte in-repository environment input copied for deterministic package review."
        elif rel.endswith(".blend"):
            role = "source-project"
            note = "Editable Blender authoring scene saved from the v0.2 pack generator."
        elif rel.endswith(".py"):
            role = "authoring-source"
            note = "Local Python/Blender source used to construct or reproduce this pack."
        elif rel.endswith(".json"):
            role = "source-data"
            if rel.startswith("source/game-dev-package-"):
                note = "Policy/provenance request for a separate canonical per-model game-dev package build; no package build is performed by this script."
            else:
                note = "Manifested pose samples and named rigid-part transforms."
        else:
            role = "documentation"
            note = "Project-internal review documentation."
        record = {"path": rel, "role": role, "sha256": file_sha256(path), "license": LICENSE, "provenance": note}
        if role in {"review-image", "source-image"}:
            import struct
            with path.open("rb") as image_file:
                header = image_file.read(24)
            if header[:8] == b"\x89PNG\r\n\x1a\n":
                record["dimensionsPx"] = {"width": struct.unpack(">I", header[16:20])[0], "height": struct.unpack(">I", header[20:24])[0]}
        input_records.append(record)

    unit_model = "models/unit-art-v2.glb"
    barracks_model = "models/barracks.glb"
    common = ["unit.humanoid-core", "unit.team-accent"]
    worker_parts = common + ["unit.worker.backpack", "unit.worker.tool"]
    infantry_parts = common + ["unit.infantry.shield", "unit.infantry.spear"]
    archer_parts = common + ["unit.archer.bow", "unit.archer.quiver"]
    sample_records = {}
    for sample in SAMPLES:
        review = [frame for frame in frames if Path(frame).name.startswith(sample["id"] + "-")]
        record = {
            "state": sample["state"],
            "poseId": sample["poseId"],
            "previewFile": review[0] if review else None,
            "reviewFiles": review,
            "reviewStatus": "rendered-in-focused-review" if review else "pose-data-only",
        }
        if sample["role"] == "barracks":
            pose = poses["sampledPoses"][sample["poseId"]]
            record.update({
                "buildingProgress": pose["buildingProgress"],
                "visibleNodes": pose["visibleNodes"],
                "hiddenNodes": pose["hiddenNodes"],
            })
        sample_records[sample["id"]] = record

    def anchors(role):
        base_list = [
            {"id": "ground", "node": "unit.anchor.ground", "position": [0, 0, 0]},
            {"id": "foot", "node": "unit.anchor.foot", "position": [0, 0, 0]},
            {"id": "headPivot", "node": "unit.anchor.headPivot", "position": [0, 0.58, 0.055]},
            {"id": "teamAccent", "node": "unit.anchor.teamAccent", "position": [0, 0.43, 0.18]},
        ]
        if role == "worker":
            base_list.extend([
                {"id": "toolGrip", "node": "unit.anchor.toolGrip", "position": [0.275, 0.395, 0.105]},
                {"id": "backpackSocket", "node": "unit.anchor.backpackSocket", "position": [0.18, 0.52, -0.1]},
            ])
        elif role == "infantry":
            base_list.extend([
                {"id": "shieldGrip", "node": "unit.anchor.infantryShieldGrip", "position": [-0.31, 0.38, 0.23]},
                {"id": "spearGrip", "node": "unit.anchor.infantrySpearGrip", "position": [0.29, 0.42, 0.02]},
            ])
        else:
            base_list.extend([
                {"id": "bowGrip", "node": "unit.anchor.archerBowGrip", "position": [0.25, 0.43, 0.24]},
                {"id": "quiverSocket", "node": "unit.anchor.archerQuiverSocket", "position": [-0.2, 0.53, -0.13]},
            ])
        return base_list

    role_parts = {
        "worker": [
            part_record("humanoid-core", "unit.humanoid-core", "unit.humanoid-core", "neutral"),
            part_record("team-accent", "unit.team-accent", "unit.team-accent", "team-accent", instance_tint={"mode": "instanceColor", "teams": ["azure", "ember"]}),
            part_record("backpack", "unit.worker.backpack", "unit.worker.backpack", "neutral"),
            part_record("tool", "unit.worker.tool", "unit.worker.tool", "neutral",
                        notes="Original axe mesh widened 1.25x in the same batch to strengthen the broad hand-tool cue."),
        ],
        "infantry": [
            part_record("humanoid-core", "unit.humanoid-core", "unit.humanoid-core", "neutral"),
            part_record("team-accent", "unit.team-accent", "unit.team-accent", "team-accent", instance_tint={"mode": "instanceColor", "teams": ["azure", "ember"]}),
            part_record("shield", "unit.infantry.shield", "unit.infantry.shield", "neutral",
                        notes="Dark six-sided neutral shield; per-unit team tint stays on the shared sash."),
            part_record("spear", "unit.infantry.spear", "unit.infantry.spear", "neutral",
                        notes="One neutral role bin combines the wood spear, iron tip, and steel-grey cap."),
        ],
        "archer": [
            part_record("humanoid-core", "unit.humanoid-core", "unit.humanoid-core", "neutral"),
            part_record("team-accent", "unit.team-accent", "unit.team-accent", "team-accent", instance_tint={"mode": "instanceColor", "teams": ["azure", "ember"]}),
            part_record("bow", "unit.archer.bow", "unit.archer.bow", "neutral"),
            part_record("quiver", "unit.archer.quiver", "unit.archer.quiver", "neutral",
                        notes="One neutral role bin combines the leather quiver, arrows, and moss hood."),
        ],
    }
    unit_assets = []
    for role, names in UNIT_ROLES.items():
        part_names = set(names["parts"])
        bounds = mesh_bounds(base, unit_root, part_names)
        body = mesh_bounds(base, unit_root, {"unit.humanoid-core"})
        state_refs = [
            sample_records[sample["id"]]
            for sample in SAMPLES if sample["role"] == role
        ]
        unit_assets.append({
            "id": role,
            "kind": "unit",
            "modelFile": unit_model,
            "boundsWorld": bounds,
            "bodyHeightWorld": body["height"],
            "groundAnchor": "ground",
            "parts": role_parts[role],
            "anchors": anchors(role),
            "stateSamples": state_refs,
        })

    building_bounds = mesh_bounds(base, barracks_root, {obj.name for obj in base.descendants(barracks_root) if obj.type == "MESH"})
    barracks_parts_manifest = [
        part_record("foundation", "barracks.foundation", "building.barracks.foundation", "neutral"),
        part_record("construction-frame", "barracks.site.partialFrame", "building.barracks.site", "neutral"),
        part_record("construction-cloth", "barracks.site.neutralCloth", "building.barracks.site-cloth", "neutral"),
        part_record("wall-shell", "barracks.complete.wallShell", "building.barracks.shell", "neutral"),
        part_record("gate", "barracks.complete.gate", "building.barracks.gate", "neutral"),
        part_record("roof", "barracks.complete.gabledRoof", "building.barracks.roof", "neutral"),
        part_record("neutral-trim", "barracks.complete.neutralTrim", "building.barracks.neutral-trim", "neutral"),
        part_record("standard-azure", "barracks.standard.azure", "building.barracks.standard.azure", "team-accent", {"group": "standard", "team": "azure", "teamColor": TEAMS["azure"], "materialName": "team-accent-building-standard", "shape": "straight-cut-pennant", "mark": "one-centered-bar"}),
        part_record("standard-ember", "barracks.standard.ember", "building.barracks.standard.ember", "team-accent", {"group": "standard", "team": "ember", "teamColor": TEAMS["ember"], "materialName": "team-accent-building-standard", "shape": "forked-tail-pennant", "mark": "split-bar"}),
        part_record("banner-pole", "barracks.complete.bannerPole", "building.barracks.banner-pole", "neutral"),
    ]
    barracks_anchors = [
        {"id": "ground", "node": "barracks.anchor.ground", "position": [0, 0, 0]},
        {"id": "gate", "node": "barracks.anchor.gate", "position": [0, 0, 1.5]},
        {"id": "standard", "node": "barracks.anchor.banner", "position": [0.55, 2.31, 1.54]},
        {"id": "rallyPoint", "node": "barracks.anchor.rallyPoint", "position": [0, 0, 2.15]},
        {"id": "productionCue", "node": "barracks.anchor.productionCue", "position": [-0.72, 1.32, 1.28]},
    ]
    assets = unit_assets + [{
        "id": "barracks", "kind": "building", "modelFile": barracks_model,
        "boundsWorld": building_bounds, "footprintWorld": {"width": 3, "depth": 3},
        "groundAnchor": "ground", "parts": barracks_parts_manifest,
        "anchors": barracks_anchors,
        "stateSamples": [sample_records[stage["id"]] for stage in BARRACKS_STAGE_SAMPLES],
        "constructionProgressRange": [0.0, 1.0],
        "constructionStateSelection": (
            "Renderer-owned: complete=true or clamp(progress, 0, 1)=1 selects complete; "
            "otherwise index=floor(clamp(progress, 0, 1)*4) into ordered stateSamples "
            "(0-<0.25 foundation, 0.25-<0.5 frame, 0.5-<0.75 walls, 0.75-<1 roof)."
        ),
        "teamVariantSelection": {
            "status": "accepted-renderer-contract",
            "rule": "For a completed Barracks, render exactly the standard whose teamVariant matches the building owner; never render both standards.",
            "standardsVisibleOnlyWhenComplete": True,
        },
        "maxActivePartBatches": 9,
        "partBatchCountIncludingMutuallyExclusiveStandards": 10,
    }]

    renderer_mapping = {
        "unit.humanoid-core": ("bodyMeshes", "neutral-core"),
        "unit.team-accent": ("teamAccentMeshes", "team-hex-on-sash-only"),
        "unit.worker.backpack": ("packMeshes", "cargo-color-when-known-otherwise-neutral"),
        "unit.worker.tool": ("toolMeshes", "neutral"),
        "unit.infantry.shield": ("shieldMeshes", "neutral"),
        "unit.infantry.spear": ("spearMeshes", "neutral"),
        "unit.archer.bow": ("bowMeshes", "neutral"),
        "unit.archer.quiver": ("quiverMeshes", "neutral"),
    }
    registry = [
        {
            "batchKey": node,
            "status": "active",
            "modelFile": unit_model,
            "node": node,
            "rendererSlot": slot,
            "tintPolicy": tint,
        }
        for node, (slot, tint) in renderer_mapping.items()
    ]
    next(item for item in registry if item["batchKey"] == "unit.team-accent").update({
        "replacesRendererSlot": "headMeshes",
        "poseBehavior": "inherits-core-body-pose-and-authored-node-transform; no-independent-head-sphere-bob",
    })

    manifest = {
        "schemaVersion": 1,
        "packId": "frontier-character-building-sample",
        "packVersion": "0.2.0",
        "packKind": "character-building",
        "coordinateSystem": {"units": "world-unit", "up": "+Y", "forward": "+Z", "right": "+X"},
        "provenance": {
            "license": LICENSE,
            "source": "Original Infantry/Archer role equipment and five Barracks progress samples authored in Blender, combined with the 0.1.2 shared core/Worker parts/Barracks source; the Worker tool is widened 1.25x within its existing batch. No external model provider or third-party model source.",
            "authoringTool": "Blender 5.2.1 LTS",
            "notes": "Renderer owner accepted the compact eight-bin unit mapping: unit.humanoid-core maps to bodyMeshes as a neutral head-and-torso core; unit.team-accent replaces the old headMeshes sphere slot with teamAccentMeshes and receives TEAM_HEX on the sash only. The sash inherits the core pose and authored node transform; independent head-sphere bob is dropped. The remaining six role parts map to packMeshes, toolMeshes, shieldMeshes, spearMeshes, bowMeshes, and quiverMeshes; Worker cargo color remains renderer-owned. This contract is accepted, but loader integration and runtime measurement remain pending. Both model GLBs embed the same 768x512 sRGB RGBA8 atlas, multiplied by broad vertex colors. The focused source review shows one Azure Worker and five Azure Barracks stages at zoom 0.91 over Meadow. The sequence reads in order, but roof and complete are too similar at about 50 pixels wide; the cyan complete-stage cue is preview-only and does not demonstrate the Azure standard. Worker gear readability, other role/state views, Ember presentation, strategic zoom, and Cinder remain unreviewed; source renders are not runtime signoff.",
        },
        "canonicalGameDevPackages": {
            "status": "metadata-requests-prepared-not-built",
            "buildOperation": "game-dev package build",
            "unit": {"modelFile": "models/unit-art-v2.glb", "requestFile": "source/game-dev-package-unit.json"},
            "barracks": {"modelFile": "models/barracks.glb", "requestFile": "source/game-dev-package-barracks.json"},
        },
        "materialAtlas": {
            "sourceFile": "source/frontier-material-atlas.png",
            "format": "PNG RGBA8 sRGB",
            "dimensionsPx": {"width": ATLAS_WIDTH, "height": ATLAS_HEIGHT},
            "material": "atlas albedo multiplied by per-face vertex color",
            "uvMap": "UVMap",
            "tileSizePx": [ATLAS_CELL, ATLAS_CELL],
            "gutterFraction": ATLAS_GUTTER,
            "runtimeMaterialIntent": {
                "status": "proposed-not-runtime-implemented",
                "shader": "unlit base-color material compatible with the current renderer style",
                "textureColorSpace": "sRGB",
                "vertexColorAttribute": "glTF COLOR_0 exported from Blender Col",
                "baseColorOperation": "sampled atlas multiplied by per-face vertex color",
                "teamAccent": "Keep the unit sash and Azure/Ember Barracks standards in separate accent batches outside the atlas.",
            },
            "validationStatus": "glb-inspected-and-source-rendered; atlas-passes-project-512px-policy-with-generic-validator-warnings; broader-art-fit-review-pending",
            "memoryEstimate": {
                "status": "estimate-only",
                "bytesPerEmbeddedCopyWithFullMipChain": ATLAS_GPU_BYTES_PER_MODEL,
                "embeddedCopies": 2,
                "residentBytesAcrossUnitAndBarracksModels": 2 * ATLAS_GPU_BYTES_PER_MODEL,
                "assumption": "One uncompressed RGBA8 GPU image per GLB with a full mip chain; texture sharing between model loaders is not assumed.",
            },
            "families": [
                {"id": family, "tileXYFromBottomLeft": list(ATLAS_FAMILY_TILES[family]),
                 "vertexColors": list(colors)}
                for family, colors in ATLAS_FAMILY_COLORS.items()
            ],
            "vertexColorOverrides": [
                {"node": "barracks.site.neutralCloth", "vertexColor": "#826646", "family": "cloth",
                 "reason": "The same brown tone marks timber scaffolding; this node is authoritatively cloth."},
            ],
            "roleMaterialMapping": {
                "worker": {"humanoid-core": ["cloth", "leather"],
                           "backpack": ["leather", "cloth", "wood"],
                           "tool": ["wood", "metal"], "team-accent": "outside-atlas"},
                "infantry": {"humanoid-core": ["cloth", "leather"],
                             "shield": ["leather", "metal"], "spear": ["wood", "metal"],
                             "team-accent": "outside-atlas"},
                "archer": {"humanoid-core": ["cloth", "leather"],
                           "bow": ["wood", "metal"], "quiver": ["leather", "cloth", "wood"],
                           "team-accent": "outside-atlas"},
                "barracks": {"foundation": ["stone"], "construction-frame": ["wood", "leather"],
                             "construction-cloth": ["cloth"], "wall-shell": ["wood", "leather"],
                             "gate": ["wood", "stone"], "roof": ["slate"],
                             "neutral-trim": ["metal"], "banner-pole": ["wood"],
                             "standards": "outside-atlas"},
            },
            "embeddedInModelFiles": [unit_model, barracks_model],
        },
        "budgets": {
            "maxUnitPartBins": 8, "maxUnitTeamBatches": 16,
            "projectedUnitPartBins": 8, "projectedUnitTeamBatches": 16,
            "maxEnvironmentBatches": 10, "projectedEnvironmentBatches": 0,
            "maxTextureMemoryBytes": 8_388_608,
            "projectedTextureMemoryBytes": 2 * ATLAS_GPU_BYTES_PER_MODEL,
            "maxAdditionalDrawCalls": 8, "projectedAdditionalDrawCalls": 8,
            "projectedBuildingDrawCallsPerStructure": 9,
        },
        "teamVariants": [
            {"team": "azure", "instanceColor": TEAMS["azure"], "instanceColorTarget": "unit.team-accent", "markerShape": "square", "buildingStandard": {"paletteSlot": "team-accent", "materialName": "team-accent-building-standard", "teamColor": TEAMS["azure"], "shape": "straight-cut-pennant", "mark": "one-centered-bar"}},
            {"team": "ember", "instanceColor": TEAMS["ember"], "instanceColorTarget": "unit.team-accent", "markerShape": "diamond", "buildingStandard": {"paletteSlot": "team-accent", "materialName": "team-accent-building-standard", "teamColor": TEAMS["ember"], "shape": "forked-tail-pennant", "mark": "split-bar"}},
        ],
        "files": input_records,
        "rendererOwnedSignals": {
            "barracksProduction": {
                "anchor": "barracks.anchor.productionCue",
                "anchorOnly": True,
                "lampOrQueueStateInGlb": False,
                "owner": "renderer",
                "reviewFrameStandIn": "v0.2.0 completed-Barracks preview contains a temporary cyan cue stand-in; absent from GLBs and not standard-readability evidence",
            },
        },
        "rendererContract": {
            "status": "accepted-design-pending-runtime-integration",
            "fullDetailUnitBinsPerTeam": 8,
            "legacySlotReplacement": {
                "replacedSlot": "headMeshes",
                "newSlot": "teamAccentMeshes",
                "part": "unit.team-accent",
            },
            "headPoseTradeoff": "The shared neutral unit.humanoid-core contains head and torso and maps to bodyMeshes. The sash inherits the core pose plus its authored node transform; no independent head-sphere bob is retained.",
            "teamTint": "Apply TEAM_HEX to the sash only; keep the shared core neutral apart from renderer-owned health/damage modulation.",
        },
        "unitBatchRegistry": registry,
        "assets": assets,
        "reviewViews": [
            {"zoom": 0.91, "ground": "meadow", "purpose": "gameplay",
             "teams": ["azure"],
             "framePattern": "previews/{sampleId}-meadow-zoom-0.91-1280x720.png"}
        ],
        "nextBuildingScope": [
            {"id": "town-center", "read": "wide stone hall with taller rear tower and small shape-coded team standard; architectural trim remains neutral", "status": "planned-next-checkpoint"},
            {"id": "archery-range", "read": "open canopy with front target and small shape-coded team standard; architectural trim remains neutral", "status": "planned-next-checkpoint"},
        ],
        "visualHold": {
            "focusedReviewScope": "Six source frames were reviewed: Azure Worker idle and five Azure Barracks construction states over Meadow at zoom 0.91; other roles, poses, teams, grounds, and zooms remain unreviewed",
            "buildingProgressReadability": "stage order broadly reads; roof and complete are too similar at about 50 pixels wide; broaden neutral gate/front trim and clarify both standards within existing part groups",
            "workerDefaultZoom": "Worker is about 12 pixels tall; backpack/tool are not assessable in the full-field source frame",
            "materialAtlas": "exported UV and embedded atlas inspected and source-rendered; passes project 512px policy with generic shortest-edge and NPOT warnings; broader art-fit review pending",
            "productionCuePreview": "v0.2.0 complete frame contains a temporary cyan renderer cue; it is absent from the GLB and is not evidence of the Azure standard",
            "runtimeSignoff": "pending approved in-game review at 0.91 and 0.48 over both grounds",
        },
    }

    (out / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    checksum_file = out / "SHA256SUMS.txt"
    files = sorted(path for path in out.rglob("*") if path.is_file() and path != checksum_file)
    checksum_file.write_text("\n".join(f"{file_sha256(path)}  {path.relative_to(out).as_posix()}" for path in files) + "\n", encoding="utf-8")

    # Check manifest coverage and hashes before the builder exits.
    loaded = json.loads((out / "manifest.json").read_text(encoding="utf-8"))
    for record in loaded["files"]:
        target = out / record["path"]
        if not target.is_file() or file_sha256(target) != record["sha256"]:
            raise RuntimeError(f"Manifest file record failed: {record['path']}")
    expected = {path.relative_to(out).as_posix() for path in files if path.name != "manifest.json"}
    if {record["path"] for record in loaded["files"]} != expected:
        raise RuntimeError("Manifest file list does not cover every package input/output")
    for line in checksum_file.read_text(encoding="utf-8").splitlines():
        expected_hash, rel = line.split("  ", 1)
        if file_sha256(out / rel) != expected_hash:
            raise RuntimeError(f"SHA256SUMS verification failed: {rel}")

    file_paths = {record["path"] for record in loaded["files"]}
    if len(file_paths) != len(loaded["files"]):
        raise RuntimeError("Manifest contains duplicate file records")
    unit_assets = [asset for asset in loaded["assets"] if asset["kind"] == "unit"]
    if {asset["id"] for asset in unit_assets} != set(UNIT_ROLES):
        raise RuntimeError("Manifest unit roles do not match the authoring roster")
    unit_nodes = {part["node"] for asset in unit_assets for part in asset["parts"]}
    registry_nodes = {entry["node"] for entry in loaded["unitBatchRegistry"]}
    registry_keys = {entry["batchKey"] for entry in loaded["unitBatchRegistry"]}
    if len(loaded["unitBatchRegistry"]) != 8 or registry_nodes != unit_nodes or registry_keys != unit_nodes:
        raise RuntimeError("Unit batch registry does not cover exactly the eight unit geometry bins")
    manifest_models = {asset["modelFile"] for asset in loaded["assets"]}
    if not manifest_models.issubset(file_paths):
        raise RuntimeError("An asset modelFile is missing from the manifest file roster")
    teams = {variant["team"] for variant in loaded["teamVariants"]}
    if teams != set(TEAMS):
        raise RuntimeError("Manifest team variants do not cover Azure and Ember")
    for asset in loaded["assets"]:
        for sample in asset["stateSamples"]:
            referenced_frames = set(sample["reviewFiles"])
            if sample.get("previewFile"):
                referenced_frames.add(sample["previewFile"])
            if not referenced_frames.issubset(file_paths):
                missing = sorted(referenced_frames - file_paths)
                raise RuntimeError(f"State sample references missing review files: {missing}")
    barracks_assets = [asset for asset in loaded["assets"] if asset["id"] == "barracks"]
    if len(barracks_assets) != 1:
        raise RuntimeError("Manifest must contain exactly one Barracks asset")
    if barracks_assets[0].get("maxActivePartBatches") != 9 or len(barracks_assets[0]["parts"]) != 10:
        raise RuntimeError("Barracks must preserve ten authored alternatives within nine active batches")
    if barracks_assets[0].get("teamVariantSelection", {}).get("standardsVisibleOnlyWhenComplete") is not True:
        raise RuntimeError("Barracks team-standard selection contract is missing")
    expected_mapping = {
        "unit.humanoid-core": ("bodyMeshes", "neutral-core"),
        "unit.team-accent": ("teamAccentMeshes", "team-hex-on-sash-only"),
        "unit.worker.backpack": ("packMeshes", "cargo-color-when-known-otherwise-neutral"),
        "unit.worker.tool": ("toolMeshes", "neutral"),
        "unit.infantry.shield": ("shieldMeshes", "neutral"),
        "unit.infantry.spear": ("spearMeshes", "neutral"),
        "unit.archer.bow": ("bowMeshes", "neutral"),
        "unit.archer.quiver": ("quiverMeshes", "neutral"),
    }
    actual_mapping = {
        item["batchKey"]: (item.get("rendererSlot"), item.get("tintPolicy"))
        for item in loaded["unitBatchRegistry"]
    }
    if actual_mapping != expected_mapping:
        raise RuntimeError("Unit batch registry does not match the renderer-owner accepted mapping")
    accent_mapping = next(item for item in loaded["unitBatchRegistry"] if item["batchKey"] == "unit.team-accent")
    if accent_mapping.get("replacesRendererSlot") != "headMeshes" or "no-independent-head-sphere-bob" not in accent_mapping.get("poseBehavior", ""):
        raise RuntimeError("Team-accent slot replacement and accepted head-pose tradeoff are missing")
    if loaded.get("rendererContract", {}).get("legacySlotReplacement", {}).get("replacedSlot") != "headMeshes":
        raise RuntimeError("Manifest renderer contract does not record the headMeshes replacement")
    barracks_samples = barracks_assets[0]["stateSamples"]
    expected_progress = [stage["progress"] for stage in BARRACKS_STAGE_SAMPLES]
    actual_progress = [sample.get("buildingProgress") for sample in barracks_samples]
    if actual_progress != expected_progress:
        raise RuntimeError(f"Barracks progress sample roster mismatch: {actual_progress}")
    for sample in barracks_samples:
        if len(sample["reviewFiles"]) != 1 or sample["previewFile"] != sample["reviewFiles"][0]:
            raise RuntimeError(f"Barracks stage must have one focused preview: {sample['state']}")
        if set(sample["visibleNodes"]) & set(sample["hiddenNodes"]):
            raise RuntimeError(f"Barracks stage has conflicting visibility nodes: {sample['state']}")
    worker_assets = [asset for asset in loaded["assets"] if asset["id"] == "worker"]
    if len(worker_assets) != 1:
        raise RuntimeError("Manifest must contain exactly one Worker asset")
    worker_idle = next(sample for sample in worker_assets[0]["stateSamples"] if sample["state"] == "idle")
    if len(worker_idle["reviewFiles"]) != 1 or worker_idle["previewFile"] != worker_idle["reviewFiles"][0]:
        raise RuntimeError("Focused review must include one Worker idle preview")
    package_requests = loaded["canonicalGameDevPackages"]
    for package in (package_requests["unit"], package_requests["barracks"]):
        if package["modelFile"] not in file_paths or package["requestFile"] not in file_paths:
            raise RuntimeError("Canonical package model or metadata request is absent from the file roster")
    print(f"Staging pack verified: {len(expected)} files, {len(frames)} direct review frames, and 8 unit batch keys")


def main():
    args = parse_args()
    target = (REPO_ROOT / args.output_dir).resolve() if not Path(args.output_dir).is_absolute() else Path(args.output_dir).resolve()
    try:
        target_relative = target.relative_to(REPO_ROOT)
    except ValueError as error:
        raise ValueError(f"Output must stay inside the isolated repository worktree: {target}") from error
    if not target_relative.parts:
        raise ValueError("Output directory cannot be the repository root")
    staging = target.with_name(target.name + ".building")
    for candidate in (target, staging):
        if candidate.exists() or candidate.is_symlink():
            raise FileExistsError(f"Refusing to overwrite existing output directory: {candidate}")
    if not staging.parent.is_dir():
        raise FileNotFoundError(f"Output parent directory does not exist: {staging.parent}")
    provenance_path = (target_relative / "PROVENANCE.md").as_posix()
    if not BASE_SCRIPT.is_file():
        raise FileNotFoundError(f"Required source pack is missing: {BASE_SCRIPT}")
    for input_path in (TERRAIN_SOURCE_ROOT / "meadow.png", TERRAIN_SOURCE_ROOT / "cinder.png",
                       SPRITE_SOURCE_ROOT / "pine.webp", SPRITE_SOURCE_ROOT / "oak.webp",
                       SPRITE_SOURCE_ROOT / "rock-outcrop.webp"):
        if not input_path.is_file():
            raise FileNotFoundError(f"Required in-repository preview input is missing: {input_path}")

    # Assemble away from the final checkpoint path. A failed export/render leaves
    # an inspectable staging directory without advertising a partial final pack.
    out = staging
    out.mkdir(parents=True, exist_ok=False)
    (out / "models").mkdir()
    (out / "previews").mkdir()
    (out / "source/terrain").mkdir(parents=True)
    (out / "source/environment").mkdir(parents=True)
    for name in ("meadow.png", "cinder.png"):
        shutil.copy2(TERRAIN_SOURCE_ROOT / name, out / "source/terrain" / name)
    for name in ("pine.webp", "oak.webp", "rock-outcrop.webp"):
        shutil.copy2(SPRITE_SOURCE_ROOT / name, out / "source/environment" / name)
    atlas_path = out / "source/frontier-material-atlas.png"
    write_material_atlas(atlas_path)

    base = import_base_authoring()
    base.PACK_ROOT = out
    base.MODELS = out / "models"
    base.PREVIEWS = out / "previews"
    base.SOURCE = out / "source"
    base.POSE_SAMPLE_FILE = out / "source/pose-samples.json"
    base.MEADOW_SOURCE = out / "source/terrain/meadow.png"
    base.CINDER_SOURCE = out / "source/terrain/cinder.png"
    base.ENVIRONMENT_SOURCE = out / "source/environment"
    install_atlas_uv_mapping(base)
    atlas_image = bpy.data.images.load(str(atlas_path), check_existing=False)
    atlas_image.colorspace_settings.name = "sRGB"
    atlas_image.pack()
    configure_atlas_material(base.UNIT_NEUTRAL, atlas_image)
    configure_atlas_material(base.BARRACKS_NEUTRAL, atlas_image)
    poses = extended_pose_samples(base)
    global CURRENT_POSES
    CURRENT_POSES = poses
    (out / "source/pose-samples.json").write_text(json.dumps(poses, indent=2) + "\n", encoding="utf-8")
    shutil.copy2(BASE_SCRIPT, out / "source/base_build_sample_v0_1_2.py")
    shutil.copy2(Path(__file__).resolve(), out / "source/build_frontier_character_pack_v2.py")

    base.clear_scene()
    unit_root, unit_parts = base.create_unit_asset()
    # Broaden the existing Worker axe silhouette directly in mesh space so
    # the instanced GLB geometry needs no per-node scale transform. This does
    # not add a mesh bin or change the immutable v0.1.2 source asset.
    for vertex in unit_parts["tool"].data.vertices:
        vertex.co.x *= 1.25
    unit_parts["tool"].data.update()
    unit_parts.update(add_role_parts(base, unit_root))
    barracks_root, barracks_parts = base.create_barracks_asset()
    # Building identity belongs only on the restrained, shape-coded standard.
    set_neutral_vertex_mesh(
        base, barracks_parts["siteAccent"], "#826646",
        "building.barracks.site-cloth", "barracks.site.neutralCloth",
        atlas_family="cloth",
    )
    set_neutral_vertex_mesh(
        base, barracks_parts["teamTrim"], "#716D5E",
        "building.barracks.neutral-trim", "barracks.complete.neutralTrim",
    )
    barracks_parts = author_barracks_standards(base, barracks_root, barracks_parts)
    bpy.data.objects["barracks.anchor.banner"]["anchorKind"] = "building-standard"
    base.select_and_export(unit_root, out / "models/unit-art-v2.glb")
    base.select_and_export(barracks_root, out / "models/barracks.glb")

    # Save a reviewable authoring scene with the Worker kit visible. Keep the
    # mutually exclusive role kits/state/team variant toggleable in the Outliner.
    unit_root.hide_set(False)
    for key in ("infantryShield", "infantrySpear", "archerBow", "archerQuiver"):
        unit_parts[key].hide_set(True)
    bpy.data.objects["barracks.state.construction"].hide_set(True)
    barracks_parts["standardEmber"].hide_set(True)
    bpy.ops.object.select_all(action="DESELECT")
    barracks_root.hide_set(False)
    barracks_root.select_set(True)
    bpy.context.view_layer.objects.active = barracks_root
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(out / "source/frontier-character-pack-v2.blend"))
    for obj in base.collection_children(unit_root) + base.collection_children(barracks_root):
        obj.hide_render = True
    frames = render_review_frames(base, out, unit_root, barracks_root)
    write_game_dev_package_requests(out, provenance_path)
    write_metadata(out, base, unit_root, barracks_root, frames, poses)
    if target.exists() or target.is_symlink():
        raise FileExistsError(f"Refusing to replace output created during build: {target}")
    out.rename(target)
    print(f"Pack v0.2.0 written to {target}; verified {len(frames)} direct review frames and 8 unit batch keys")


if __name__ == "__main__":
    main()
