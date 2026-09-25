#!/usr/bin/env python3
"""Prepare a versioned, source-complete Worker/Infantry/Archer + Barracks pack.

Run only after authorizing the exact destination with Blender. The script refuses
to overwrite an existing output directory. It imports the immutable 0.1.2
authoring module for the shared humanoid core, Worker equipment, and Barracks,
then authors the four reserved role parts and renders individual review frames.
"""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import math
import shutil
import sys
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
ZOOMS = (("0.91", 0.91), ("0.48", 0.48))
MAPS = ("meadow", "cinder")

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

SAMPLES = (
    {"id": "worker-idle", "role": "worker", "state": "idle", "poseId": "worker-idle"},
    {"id": "worker-build", "role": "worker", "state": "build", "poseId": "worker-build"},
    {"id": "infantry-idle", "role": "infantry", "state": "idle", "poseId": "infantry-idle"},
    {"id": "infantry-attack", "role": "infantry", "state": "attack", "poseId": "infantry-attack"},
    {"id": "archer-idle", "role": "archer", "state": "idle", "poseId": "archer-idle"},
    {"id": "archer-attack", "role": "archer", "state": "attack", "poseId": "archer-attack"},
    {"id": "barracks-construction-mid", "role": "barracks", "state": "construction-mid", "poseId": "barracks-construction-mid"},
    {"id": "barracks-complete", "role": "barracks", "state": "complete", "poseId": "barracks-complete"},
)


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


def set_neutral_vertex_mesh(base, obj, color, batch_key, node_name):
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
    scene.camera.data.type = "ORTHO"
    base.make_preview_unlit_material("preview-neutral-unlit", vertex_colors=True)
    base.make_preview_unlit_material("preview-team-azure", TEAMS["azure"])
    base.make_preview_unlit_material("preview-team-ember", TEAMS["ember"])
    base.make_preview_unlit_material("preview-team-barracks-azure", vertex_colors=True, tint=TEAMS["azure"])
    base.make_preview_unlit_material("preview-team-barracks-ember", vertex_colors=True, tint=TEAMS["ember"])
    scene.world.use_nodes = True
    scene.world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.38, 0.42, 0.33, 1)
    scene.world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.82
    world_height = 43.0 / 0.91
    world_width = world_height * 1280.0 / 720.0
    samples = []
    for sample in SAMPLES:
        if sample["role"] == "barracks":
            continue
        samples.append(sample)
    for sample in SAMPLES:
        if sample["role"] == "barracks":
            samples.append(sample)

    frames = []
    for sample in samples:
        for ground in MAPS:
            for zoom_label, zoom in ZOOMS:
                clear_preview_objects(scene)
                ground_path = out / "source/terrain" / f"{ground}.png"
                ground_mat = base.add_ground_material(f"ground.{ground}", ground_path)
                base.create_ground(f"ground.{ground}", ground_path, ground_mat, span=420.0)
                base.add_preview_environment_sprites()

                camera_data = bpy.data.cameras.new("preview.camera")
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
                    for team, sign in (("azure", -1.0), ("ember", 1.0)):
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
                    for team, sign in (("azure", -1.0), ("ember", 1.0)):
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


def write_metadata(out, base, unit_root, barracks_root, frames, poses):
    readme = """# Frontier character and Barracks pack\n\nCheckpoint 0.2.0 activates the full three-role unit roster in the approved compact GLB contract. The unchanged 0.1.2 checkpoint remains a separate package.\n\n## Assets\n\n- `models/unit-art-v2.glb` contains one shared humanoid core and sash plus the Worker backpack/tool, Infantry shield/spear, and Archer bow/quiver. All eight renderer batch keys are active; the two teams share geometry and use the agreed instance-color slots.\n- `models/barracks.glb` carries construction and complete states, team trim, and mutually exclusive Azure/Ember standards.\n- `source/frontier-character-pack-v2.blend`, the local authoring scripts, and `source/pose-samples.json` preserve the editable Blender scene and sampled rigid-part transforms.\n\nThe next building checkpoint is Town Center (wide stone hall with taller rear tower) and Archery Range (open canopy with a front target), following the current Barracks silhouette. They are planned here and not included in this checkpoint.\n\n## Review and hold\n\nEach state has an individual 1280×720 source frame for zoom 0.91 and 0.48 over Meadow and Cinder. Each frame shows Azure and Ember together. Frames are source renders, not runtime signoff. The Worker normal-zoom role-readability hold remains explicit: the base body is about 12 pixels tall at 0.91, so confirm backpack/tool recognition in the live game before accepting it. At 0.48, use the renderer-owned instanced role LOD without changing world scale.\n\n`manifest.json` records bounds, ground/pose/equipment anchors, team tint and building variants, active batch keys, state samples, review views, provenance, and file hashes. The pack uses flat vertex colors and no texture maps.\n\n## Inspection\n\nRun `game-dev asset inspect models/unit-art-v2.glb --json` and `game-dev asset inspect models/barracks.glb --json`. `SHA256SUMS.txt` covers every package file except itself.\n"""
    provenance = """# Provenance\n\nThe shared humanoid core, Worker parts, and Barracks derive from the project-owned 0.1.2 Blender source `source/base_build_sample_v0_1_2.py`. Infantry shield/spear and Archer bow/quiver are original low-poly geometry authored by `source/build_frontier_character_pack_v2.py` in Blender 5.2.1 LTS. No paid provider, external model, or third-party game art was used.\n\nTerrain and preview-only tree/rock images are copied byte-for-byte from `assets/environment/frontier-v1/`; their existing internal license is retained. Runtime models are GLB 2.0 with rigid parts, broad vertex colors, named anchors, and per-team instance tint.\n\nAll new content is licensed for internal review under `LicenseRef-Thousand-Unit-Skirmish-Internal-Review`. `SHA256SUMS.txt` records every pack file other than itself.\n"""
    readme = readme.replace(
        "Infantry shield/spear, and Archer bow/quiver.",
        "Infantry shield/spear/steel cap, and Archer bow/quiver/moss hood.",
    )
    readme = readme.replace(
        "All eight renderer batch keys are active; the two teams share geometry and use the agreed instance-color slots.",
        "All eight renderer batch keys are active; per-unit instance tint is limited to the shared sash/team-accent slot while role equipment stays neutral.",
    )
    readme = readme.replace(
        "team tint and building variants",
        "sash-only instance-tint metadata and standard-only teamVariant entries",
    )
    readme = readme.replace(
        "\n\nThe next building checkpoint",
        "\n\nThe Blender source opens with the Worker and completed Azure Barracks visible. Toggle the Infantry/Archer role-part objects, construction state, and Ember standard in the Outliner to inspect the alternatives.\n\nThe next building checkpoint",
    )
    readme = readme.replace("Worker backpack/tool, Infantry", "Worker backpack/widened tool, Infantry")
    readme = readme.replace(
        "- `models/barracks.glb` carries construction and complete states, team trim, and mutually exclusive Azure/Ember standards.",
        "- `models/barracks.glb` carries construction and complete states with neutral architectural materials. Building team identity is confined to a small standard: Azure has a straight-cut pennant with one centered bar; Ember has a forked tail with a split bar. `barracks.anchor.productionCue` is an anchor only; the GLB has no lamp or queue state.",
    )
    readme = readme.replace(
        "The next building checkpoint is Town Center (wide stone hall with taller rear tower) and Archery Range (open canopy with a front target), following the current Barracks silhouette.",
        "The next building checkpoint is Town Center (wide stone hall with taller rear tower) and Archery Range (open canopy with a front target), each with neutral trim and the same shape-coded standard system, following the current Barracks silhouette.",
    )
    readme = readme.replace(
        "Frames are source renders, not runtime signoff.",
        "Frames are source renders, not runtime signoff. The completed Barracks review frame includes a temporary renderer-owned queue cue stand-in for context; it is not exported to either model.",
    )
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
            note = "Native 1280x720 Blender source render at the named game zoom, over copied terrain and preview-only billboards; Azure and Ember are shown together."
            if Path(rel).name.startswith("barracks-complete-"):
                note += " A temporary renderer-owned queue cue stand-in appears for context only; it is absent from both model GLBs."
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
        sample_records[sample["id"]] = {
            "state": sample["state"],
            "poseId": sample["poseId"],
            "previewFile": f"previews/{sample['id']}-meadow-zoom-0.91-1280x720.png",
            "reviewFiles": review,
        }

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
        "stateSamples": [sample_records["barracks-construction-mid"], sample_records["barracks-complete"]],
    }]

    registry = []
    for node in ("unit.humanoid-core", "unit.team-accent", "unit.worker.backpack", "unit.worker.tool",
                 "unit.infantry.shield", "unit.infantry.spear", "unit.archer.bow", "unit.archer.quiver"):
        registry.append({"batchKey": node, "status": "active", "modelFile": unit_model, "node": node})

    manifest = {
        "schemaVersion": 1,
        "packId": "frontier-character-building-sample",
        "packVersion": "0.2.0",
        "packKind": "character-building",
        "coordinateSystem": {"units": "world-unit", "up": "+Y", "forward": "+Z", "right": "+X"},
        "provenance": {
            "license": LICENSE,
            "source": "Original Infantry/Archer role equipment authored in Blender, combined with the 0.1.2 shared core/Worker parts/Barracks source; the Worker tool is widened 1.25x within its existing batch. No external model provider or third-party model source.",
            "authoringTool": "Blender 5.2.1 LTS",
            "notes": "All three unit roles share one humanoid core and sash, using eight shared bins / sixteen team batches; only the sash receives per-unit tint. Building team identity is limited to a small neutral-backed Azure straight-cut pennant with one centered bar or Ember forked-tail pennant with a split bar. Direct source views cover zoom 0.91 and 0.48 over Meadow and Cinder for both teams. Worker normal-zoom role readability remains on hold; source renders are not runtime signoff.",
        },
        "budgets": {
            "maxUnitPartBins": 8, "maxUnitTeamBatches": 16,
            "projectedUnitPartBins": 8, "projectedUnitTeamBatches": 16,
            "maxEnvironmentBatches": 10, "projectedEnvironmentBatches": 0,
            "maxTextureMemoryBytes": 0, "projectedTextureMemoryBytes": 0,
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
                "reviewFrameStandIn": "temporary cue in completed-Barracks source renders only",
            },
        },
        "unitBatchRegistry": registry,
        "assets": assets,
        "reviewViews": [
            {"zoom": float(zoom), "ground": ground, "teams": ["azure", "ember"], "framePattern": "previews/{state}-{ground}-zoom-{zoom}-1280x720.png"}
            for zoom, _factor in (("0.91", 0.91), ("0.48", 0.48)) for ground in MAPS
        ],
        "nextBuildingScope": [
            {"id": "town-center", "read": "wide stone hall with taller rear tower and small shape-coded team standard; architectural trim remains neutral", "status": "planned-next-checkpoint"},
            {"id": "archery-range", "read": "open canopy with front target and small shape-coded team standard; architectural trim remains neutral", "status": "planned-next-checkpoint"},
        ],
        "visualHold": {
            "workerDefaultZoom": "pending role-readability review at 0.91; current source worker is about 12 pixels tall",
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
    print(f"Pack v0.2.0 written to {out}; verified {len(expected)} files, {len(frames)} direct review frames, and 8 unit batch keys")


def main():
    args = parse_args()
    out = (REPO_ROOT / args.output_dir).resolve() if not Path(args.output_dir).is_absolute() else Path(args.output_dir).resolve()
    if out.exists():
        raise FileExistsError(f"Refusing to overwrite existing output directory: {out}")
    if not BASE_SCRIPT.is_file():
        raise FileNotFoundError(f"Required source pack is missing: {BASE_SCRIPT}")
    for input_path in (TERRAIN_SOURCE_ROOT / "meadow.png", TERRAIN_SOURCE_ROOT / "cinder.png",
                       SPRITE_SOURCE_ROOT / "pine.webp", SPRITE_SOURCE_ROOT / "oak.webp",
                       SPRITE_SOURCE_ROOT / "rock-outcrop.webp"):
        if not input_path.is_file():
            raise FileNotFoundError(f"Required in-repository preview input is missing: {input_path}")

    # From this point on, every write is confined to the explicitly selected new output root.
    out.mkdir(parents=True, exist_ok=False)
    (out / "models").mkdir()
    (out / "previews").mkdir()
    (out / "source/terrain").mkdir(parents=True)
    (out / "source/environment").mkdir(parents=True)
    for name in ("meadow.png", "cinder.png"):
        shutil.copy2(TERRAIN_SOURCE_ROOT / name, out / "source/terrain" / name)
    for name in ("pine.webp", "oak.webp", "rock-outcrop.webp"):
        shutil.copy2(SPRITE_SOURCE_ROOT / name, out / "source/environment" / name)

    base = import_base_authoring()
    base.PACK_ROOT = out
    base.MODELS = out / "models"
    base.PREVIEWS = out / "previews"
    base.SOURCE = out / "source"
    base.POSE_SAMPLE_FILE = out / "source/pose-samples.json"
    base.MEADOW_SOURCE = out / "source/terrain/meadow.png"
    base.CINDER_SOURCE = out / "source/terrain/cinder.png"
    base.ENVIRONMENT_SOURCE = out / "source/environment"
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
    write_metadata(out, base, unit_root, barracks_root, frames, poses)


if __name__ == "__main__":
    main()
