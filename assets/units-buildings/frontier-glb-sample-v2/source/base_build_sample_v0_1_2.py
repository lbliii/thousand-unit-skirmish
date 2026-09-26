import bpy
import json
import math
from pathlib import Path
from mathutils import Matrix, Vector

PACK_ROOT = Path(__file__).resolve().parents[1]
MODELS = PACK_ROOT / "models"
PREVIEWS = PACK_ROOT / "previews"
SOURCE = PACK_ROOT / "source"
POSE_SAMPLE_FILE = SOURCE / "pose-samples.json"
POSE_SAMPLES = json.loads(POSE_SAMPLE_FILE.read_text(encoding="utf-8"))
MEADOW_SOURCE = SOURCE / "terrain" / "meadow.png"
CINDER_SOURCE = SOURCE / "terrain" / "cinder.png"
ENVIRONMENT_SOURCE = SOURCE / "environment"

# Blender is Z-up; convert authored game coordinates (Y-up, +Z forward) so the
# Blender glTF exporter emits the agreed game-space axes unchanged.
def game_to_blender(point):
    x, y, z = point
    return (x, -z, y)

def hex_rgb(value):
    value = value.lstrip("#")
    return tuple(int(value[i:i + 2], 16) / 255.0 for i in (0, 2, 4))

def srgb_to_linear(value):
    if value <= 0.04045:
        return value / 12.92
    return ((value + 0.055) / 1.055) ** 2.4

def linear_rgba(value):
    return tuple(srgb_to_linear(v) for v in hex_rgb(value)) + (1.0,)

def make_material(name, value=None, vertex_colors=False, metallic=0.0, roughness=0.86):
    material = bpy.data.materials.new(name)
    material.diffuse_color = linear_rgba(value or "#FFFFFF")
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    principled = nodes.get("Principled BSDF")
    if principled:
        principled.inputs["Base Color"].default_value = linear_rgba(value or "#FFFFFF")
        principled.inputs["Metallic"].default_value = metallic
        principled.inputs["Roughness"].default_value = roughness
        if vertex_colors:
            color_node = nodes.new("ShaderNodeVertexColor")
            color_node.layer_name = "Col"
            links.new(color_node.outputs["Color"], principled.inputs["Base Color"])
    return material

def make_preview_team_material(name, value):
    """Tint white team-accent vertex colors while keeping darker marks legible."""
    material = bpy.data.materials.new(name)
    material.diffuse_color = linear_rgba(value)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    principled = nodes.get("Principled BSDF")
    if principled:
        principled.inputs["Roughness"].default_value = 0.86
        vertex_color = nodes.new("ShaderNodeVertexColor")
        vertex_color.layer_name = "Col"
        multiply = nodes.new("ShaderNodeMixRGB")
        multiply.blend_type = "MULTIPLY"
        multiply.inputs["Fac"].default_value = 1.0
        multiply.inputs["Color2"].default_value = linear_rgba(value)
        links.new(vertex_color.outputs["Color"], multiply.inputs["Color1"])
        links.new(multiply.outputs["Color"], principled.inputs["Base Color"])
    return material

def make_preview_unlit_material(name, color=None, vertex_colors=False, tint=None):
    """Make a preview-only material matching the runtime's MeshBasicMaterial."""
    material = bpy.data.materials.new(name)
    material.diffuse_color = linear_rgba(color or tint or "#FFFFFF")
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    emission = nodes.new("ShaderNodeEmission")
    if vertex_colors:
        vertex_color = nodes.new("ShaderNodeVertexColor")
        vertex_color.layer_name = "Col"
        color_output = vertex_color.outputs["Color"]
    else:
        emission.inputs["Color"].default_value = linear_rgba(color or "#FFFFFF")
        color_output = None
    if tint is not None and color_output is not None:
        multiply = nodes.new("ShaderNodeMixRGB")
        multiply.blend_type = "MULTIPLY"
        multiply.inputs["Fac"].default_value = 1.0
        multiply.inputs["Color2"].default_value = linear_rgba(tint)
        links.new(color_output, multiply.inputs["Color1"])
        color_output = multiply.outputs["Color"]
    if color_output is not None:
        links.new(color_output, emission.inputs["Color"])
    links.new(emission.outputs["Emission"], output.inputs["Surface"])
    return material

UNIT_NEUTRAL = make_material("neutral-unit-vertex-color", "#FFFFFF", True)
UNIT_TEAM = make_material("team-accent-unit-instance-color", "#FFFFFF")
BARRACKS_NEUTRAL = make_material("neutral-barracks-vertex-color", "#FFFFFF", True)
BARRACKS_TEAM = make_material("team-accent-barracks-instance-color", "#FFFFFF", True)

UNIT_PALETTE = {
    "wool": "#B99B50",
    "leather": "#715137",
    "skin": "#B48664",
    "cap": "#9B7848",
    "wood": "#6F5034",
    "iron": "#AAB4B1",
    "shadow": "#3D3C31",
    "highlight": "#DEC579",
}
BUILDING_PALETTE = {
    "stone": "#918C79",
    "stoneLight": "#AAA28A",
    "timber": "#564533",
    "timberLight": "#745C3D",
    "door": "#302D27",
    "slate": "#444B4A",
    "slateLight": "#5B625D",
    "iron": "#716D5E",
    "scaffold": "#826646",
    "shadow": "#39372F",
}
TEAM_COLORS = {"azure": "#5AA7D7", "ember": "#E67A5E"}

class MeshBuilder:
    def __init__(self, pivot=(0.0, 0.0, 0.0)):
        self.pivot = Vector(pivot)
        self.vertices = []
        self.faces = []
        self.colors = []

    def face(self, points, color):
        start = len(self.vertices)
        for point in points:
            local = Vector(point) - self.pivot
            self.vertices.append((local.x, local.y, local.z))
        self.faces.append(tuple(range(start, start + len(points))))
        self.colors.append(color)

    def box(self, center, size, color, angle_z=0.0):
        cx, cy, cz = center
        sx, sy, sz = size
        half = (sx / 2.0, sy / 2.0, sz / 2.0)
        raw = [
            (-half[0], -half[1], -half[2]), (half[0], -half[1], -half[2]),
            (half[0], half[1], -half[2]), (-half[0], half[1], -half[2]),
            (-half[0], -half[1], half[2]), (half[0], -half[1], half[2]),
            (half[0], half[1], half[2]), (-half[0], half[1], half[2]),
        ]
        ca, sa = math.cos(angle_z), math.sin(angle_z)
        verts = []
        for x, y, z in raw:
            verts.append((cx + x * ca - y * sa, cy + x * sa + y * ca, cz + z))
        for indices in (
            (0, 3, 2, 1), (4, 5, 6, 7), (0, 4, 7, 3),
            (1, 2, 6, 5), (0, 1, 5, 4), (3, 7, 6, 2),
        ):
            self.face([verts[i] for i in indices], color)

    def frustum_y(self, center, bottom, top, bottom_size, top_size, color):
        cx, _, cz = center
        bx, by = bottom
        tx, ty = top
        bw, bd = bottom_size
        tw, td = top_size
        lower = [
            (cx - bw / 2, by, cz - bd / 2), (cx + bw / 2, by, cz - bd / 2),
            (cx + bw / 2, by, cz + bd / 2), (cx - bw / 2, by, cz + bd / 2),
        ]
        upper = [
            (cx - tw / 2, ty, cz - td / 2), (cx + tw / 2, ty, cz - td / 2),
            (cx + tw / 2, ty, cz + td / 2), (cx - tw / 2, ty, cz + td / 2),
        ]
        self.face([lower[0], lower[3], lower[2], lower[1]], color)
        self.face([upper[0], upper[1], upper[2], upper[3]], color)
        for i in range(4):
            j = (i + 1) % 4
            self.face([lower[i], lower[j], upper[j], upper[i]], color)

    def cylinder_y(self, center, radius, height, sides, color, top_radius=None):
        cx, cy, cz = center
        top_radius = radius if top_radius is None else top_radius
        low, high = [], []
        for i in range(sides):
            angle = 2 * math.pi * i / sides
            low.append((cx + math.cos(angle) * radius, cy - height / 2, cz + math.sin(angle) * radius))
            high.append((cx + math.cos(angle) * top_radius, cy + height / 2, cz + math.sin(angle) * top_radius))
        self.face(list(reversed(low)), color)
        self.face(high, color)
        for i in range(sides):
            j = (i + 1) % sides
            self.face([low[i], low[j], high[j], high[i]], color)

    def sphere(self, center, radii, color, segments=8, rings=5):
        cx, cy, cz = center
        rx, ry, rz = radii
        latitudes = []
        for row in range(rings + 1):
            phi = math.pi * row / rings
            ring = []
            for col in range(segments):
                theta = 2 * math.pi * col / segments
                ring.append((
                    cx + rx * math.sin(phi) * math.cos(theta),
                    cy + ry * math.cos(phi),
                    cz + rz * math.sin(phi) * math.sin(theta),
                ))
            latitudes.append(ring)
        for row in range(rings):
            for col in range(segments):
                nxt = (col + 1) % segments
                self.face(
                    [latitudes[row][col], latitudes[row + 1][col],
                     latitudes[row + 1][nxt], latitudes[row][nxt]],
                    color,
                )

    def prism_xy(self, points, z_center, thickness, color):
        front = z_center + thickness / 2
        back = z_center - thickness / 2
        front_points = [(x, y, front) for x, y in points]
        back_points = [(x, y, back) for x, y in reversed(points)]
        self.face(front_points, color)
        self.face(back_points, color)
        for i in range(len(points)):
            j = (i + 1) % len(points)
            self.face([
                (points[i][0], points[i][1], front),
                (points[j][0], points[j][1], front),
                (points[j][0], points[j][1], back),
                (points[i][0], points[i][1], back),
            ], color)

    def mesh_object(self, name, parent, location=(0.0, 0.0, 0.0), material=UNIT_NEUTRAL,
                    batch_key=None, vertex_colors=True):
        mesh = bpy.data.meshes.new(name + ".mesh")
        blender_vertices = [game_to_blender(v) for v in self.vertices]
        mesh.from_pydata(blender_vertices, [], self.faces)
        mesh.update()
        obj = bpy.data.objects.new(name, mesh)
        bpy.context.collection.objects.link(obj)
        obj.parent = parent
        obj.location = game_to_blender(location)
        obj.matrix_parent_inverse = Matrix.Identity(4)
        obj.data.materials.append(material)
        for poly in mesh.polygons:
            poly.use_smooth = False
        if vertex_colors and self.faces:
            attr = mesh.color_attributes.new(name="Col", type="FLOAT_COLOR", domain="CORNER")
            for polygon, face_color in zip(mesh.polygons, self.colors):
                rgba = linear_rgba(face_color)
                for loop_index in polygon.loop_indices:
                    attr.data[loop_index].color = rgba
        uv_layer = mesh.uv_layers.new(name="UVMap")
        for loop in mesh.loops:
            co = mesh.vertices[loop.vertex_index].co
            uv_layer.data[loop.index].uv = (co.x * 1.5 + 0.5, co.y * 1.5 + 0.5)
        if batch_key:
            obj["batchKey"] = batch_key
        return obj

def empty_node(name, parent, game_location=(0.0, 0.0, 0.0), anchor_kind=None):
    obj = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(obj)
    obj.empty_display_type = "PLAIN_AXES"
    obj.parent = parent
    obj.matrix_parent_inverse = Matrix.Identity(4)
    obj.location = game_to_blender(game_location)
    if anchor_kind:
        obj["anchorKind"] = anchor_kind
    return obj

def collection_children(root):
    found = [root]
    for child in root.children:
        found.extend(collection_children(child))
    return found

def descendants(root):
    for child in root.children:
        yield child
        yield from descendants(child)

def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    # Keep the explicitly authored materials created at module load time.
    for datablocks in (bpy.data.meshes, bpy.data.curves, bpy.data.cameras, bpy.data.lights):
        for item in list(datablocks):
            if item.users == 0:
                datablocks.remove(item)

def select_and_export(root, path):
    bpy.ops.object.select_all(action="DESELECT")
    for obj in collection_children(root):
        obj.select_set(True)
    bpy.context.view_layer.objects.active = root
    bpy.ops.export_scene.gltf(
        filepath=str(path),
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=True,
        export_extras=True,
        export_animations=False,
        export_cameras=False,
        export_lights=False,
    )
    bpy.ops.object.select_all(action="DESELECT")

def create_unit_asset():
    root = bpy.data.objects.new("unit.artRoot", None)
    bpy.context.collection.objects.link(root)
    root.empty_display_type = "CUBE"
    root["renderMode"] = "instanced-rigid-part"

    # One exact core mesh shared by worker, infantry, and archer.
    core = MeshBuilder(pivot=(0.0, 0.30, 0.0))
    # Boots and lower legs.
    core.box((-0.105, 0.07, 0.045), (0.19, 0.11, 0.26), UNIT_PALETTE["leather"])
    core.box((0.105, 0.07, 0.045), (0.19, 0.11, 0.26), UNIT_PALETTE["leather"])
    core.frustum_y((-0.105, 0.0, 0.0), (0.14, 0.11), (0.095, 0.30),
                   (0.105, 0.20), (0.13, 0.20), UNIT_PALETTE["shadow"])
    core.frustum_y((0.105, 0.0, 0.0), (0.14, 0.11), (0.095, 0.30),
                   (0.105, 0.20), (0.13, 0.20), UNIT_PALETTE["shadow"])
    # A broad, low-contrast tunic keeps the figure grounded in the frontier palette.
    core.frustum_y((0.0, 0.0, 0.0), (0.27, 0.30), (0.56, 0.30),
                   (0.36, 0.25), (0.43, 0.25), UNIT_PALETTE["wool"])
    # Short sleeves and forearms are part of the shared rigid body bin.
    core.box((-0.215, 0.405, 0.015), (0.14, 0.23, 0.17), UNIT_PALETTE["leather"], -0.15)
    core.box((0.215, 0.405, 0.035), (0.16, 0.24, 0.17), UNIT_PALETTE["leather"], 0.18)
    # A clear gold chest panel and dark belt separate the torso from the legs at game zoom.
    core.box((-0.055, 0.475, 0.149), (0.19, 0.18, 0.035), UNIT_PALETTE["highlight"])
    core.box((0.0, 0.34, 0.153), (0.36, 0.075, 0.035), UNIT_PALETTE["shadow"])
    # Face, ears, and cap stay in this same shared geometry/bin.
    core.sphere((0.0, 0.625, 0.055), (0.132, 0.142, 0.125), UNIT_PALETTE["skin"], 8, 5)
    core.sphere((-0.14, 0.63, 0.055), (0.035, 0.045, 0.055), UNIT_PALETTE["skin"], 5, 3)
    core.sphere((0.14, 0.63, 0.055), (0.035, 0.045, 0.055), UNIT_PALETTE["skin"], 5, 3)
    core.cylinder_y((0.0, 0.755, 0.045), 0.15, 0.075, 7, UNIT_PALETTE["cap"])
    core.box((0.0, 0.721, 0.12), (0.33, 0.035, 0.22), UNIT_PALETTE["cap"])
    core_obj = core.mesh_object(
        "unit.humanoid-core", root, location=(0.0, 0.30, 0.0),
        material=UNIT_NEUTRAL, batch_key="unit.humanoid-core",
    )

    # A single exact shoulder-sash mesh is shared by all unit roles; only its
    # instanceColor changes between Azure and Ember.
    sash = MeshBuilder(pivot=(0.0, 0.43, 0.18))
    sash.prism_xy([(-0.22, 0.57), (-0.13, 0.62), (0.20, 0.37), (0.11, 0.31)], 0.178, 0.025, "#FFFFFF")
    sash_obj = sash.mesh_object(
        "unit.team-accent", root, location=(0.0, 0.43, 0.18),
        material=UNIT_TEAM, batch_key="unit.team-accent", vertex_colors=False,
    )

    # Side-slung bedroll and pack extend beyond the core silhouette for worker-role readability.
    pack = MeshBuilder(pivot=(0.0, 0.0, 0.0))
    pack.box((0.0, 0.0, 0.0), (0.36, 0.31, 0.24), UNIT_PALETTE["leather"])
    pack.box((0.0, 0.15, 0.015), (0.40, 0.11, 0.28), UNIT_PALETTE["highlight"])
    pack.box((0.13, -0.055, 0.12), (0.14, 0.18, 0.11), UNIT_PALETTE["wood"])
    pack.box((0.0, 0.13, 0.02), (0.22, 0.055, 0.29), UNIT_PALETTE["shadow"])
    pack_obj = pack.mesh_object(
        "unit.worker.backpack", root, location=(0.18, 0.52, -0.10),
        material=UNIT_NEUTRAL, batch_key="unit.worker.backpack",
    )

    # Wide chopping tool. One vertex-colored material bin preserves the wood/iron
    # distinction while leaving this as a single independently posed instance batch.
    tool = MeshBuilder(pivot=(0.0, 0.0, 0.0))
    tool.cylinder_y((0.0, 0.0, 0.0), 0.032, 0.68, 6, UNIT_PALETTE["wood"])
    tool.box((0.0, 0.19, 0.0), (0.09, 0.08, 0.105), UNIT_PALETTE["wood"])
    tool.prism_xy(
        [(-0.045, 0.31), (0.08, 0.39), (0.25, 0.36), (0.405, 0.25),
         (0.45, 0.14), (0.33, 0.055), (0.12, 0.11), (0.0, 0.20)],
        0.0, 0.10, UNIT_PALETTE["iron"],
    )
    tool.prism_xy([(0.36, 0.09), (0.45, 0.14), (0.45, 0.23), (0.36, 0.21)],
                  0.058, 0.018, "#E2DED1")
    tool_obj = tool.mesh_object(
        "unit.worker.tool", root, location=(0.275, 0.395, 0.105),
        material=UNIT_NEUTRAL, batch_key="unit.worker.tool",
    )

    # Named empties are anchors, not render bins.
    empty_node("unit.anchor.ground", root, (0.0, 0.0, 0.0), "ground-center")
    empty_node("unit.anchor.foot", root, (0.0, 0.0, 0.0), "foot-center")
    empty_node("unit.anchor.headPivot", root, (0.0, 0.58, 0.055), "pose-pivot")
    empty_node("unit.anchor.toolGrip", root, (0.275, 0.395, 0.105), "attachment")
    empty_node("unit.anchor.backpackSocket", root, (0.18, 0.52, -0.10), "attachment")
    empty_node("unit.anchor.teamAccent", root, (0.0, 0.43, 0.18), "team-accent")
    return root, {"core": core_obj, "sash": sash_obj, "pack": pack_obj, "tool": tool_obj}

def add_gable(builder, front_z, color):
    builder.prism_xy([(-1.15, 1.05), (1.15, 1.05), (0.0, 1.83)], front_z, 0.12, color)

def create_barracks_asset():
    root = bpy.data.objects.new("barracks.artRoot", None)
    bpy.context.collection.objects.link(root)
    root.empty_display_type = "CUBE"
    root["renderMode"] = "low-count-building-group"
    empty_node("barracks.state.construction", root, (0, 0, 0), "state-group")
    empty_node("barracks.state.complete", root, (0, 0, 0), "state-group")

    foundation = MeshBuilder(pivot=(0, 0, 0))
    foundation.box((0.0, 0.11, 0.0), (2.94, 0.22, 2.94), BUILDING_PALETTE["stone"])
    foundation.box((0.0, 0.235, 0.0), (2.78, 0.055, 2.78), BUILDING_PALETTE["stoneLight"])
    foundation_obj = foundation.mesh_object(
        "barracks.foundation", root, material=BARRACKS_NEUTRAL,
        batch_key="building.barracks.foundation",
    )

    site = bpy.data.objects["barracks.state.construction"]
    partial = MeshBuilder(pivot=(0, 0, 0))
    # Low wall courses, exposed framing, and a front-facing work opening.
    partial.box((0.0, 0.47, -1.12), (2.25, 0.48, 0.16), BUILDING_PALETTE["timber"])
    partial.box((-1.12, 0.47, 0.0), (0.16, 0.48, 2.20), BUILDING_PALETTE["timber"])
    partial.box((1.12, 0.47, 0.0), (0.16, 0.48, 2.20), BUILDING_PALETTE["timber"])
    partial.box((-0.72, 0.47, 1.12), (0.72, 0.48, 0.16), BUILDING_PALETTE["timber"])
    partial.box((0.72, 0.47, 1.12), (0.72, 0.48, 0.16), BUILDING_PALETTE["timber"])
    partial.box((0.0, 0.25, 0.0), (0.20, 0.04, 2.8), BUILDING_PALETTE["scaffold"])
    partial.box((0.0, 0.62, 0.0), (0.20, 0.04, 2.8), BUILDING_PALETTE["scaffold"])
    partial.box((-1.25, 0.58, 0.0), (0.07, 0.72, 0.07), BUILDING_PALETTE["scaffold"])
    partial.box((1.25, 0.58, 0.0), (0.07, 0.72, 0.07), BUILDING_PALETTE["scaffold"])
    partial.box((-1.25, 0.93, 0.0), (0.07, 0.07, 2.8), BUILDING_PALETTE["scaffold"])
    partial.box((1.25, 0.93, 0.0), (0.07, 0.07, 2.8), BUILDING_PALETTE["scaffold"])
    partial.box((0.0, 0.40, -0.25), (0.58, 0.14, 0.44), BUILDING_PALETTE["timberLight"])
    partial.box((0.12, 0.42, -0.18), (0.44, 0.11, 0.34), BUILDING_PALETTE["shadow"])
    partial_obj = partial.mesh_object(
        "barracks.site.partialFrame", site, material=BARRACKS_NEUTRAL,
        batch_key="building.barracks.site",
    )
    site_accent = MeshBuilder(pivot=(0, 0, 0))
    site_accent.prism_xy([(-0.10, 0.73), (0.32, 0.73), (0.24, 0.48), (0.05, 0.53)], 0.06, 0.025, "#FFFFFF")
    site_accent_obj = site_accent.mesh_object(
        "barracks.site.teamCloth", site, location=(0.0, 0.0, 0.0),
        material=BARRACKS_TEAM,
        batch_key="building.barracks.team-accent",
    )

    complete = bpy.data.objects["barracks.state.complete"]
    walls = MeshBuilder(pivot=(0, 0, 0))
    # Closed, stout timber walls; front gable and clear gate establish the closed barracks silhouette.
    walls.box((0.0, 0.69, -1.12), (2.33, 0.92, 0.17), BUILDING_PALETTE["timber"])
    walls.box((-1.13, 0.69, 0.0), (0.17, 0.92, 2.28), BUILDING_PALETTE["timber"])
    walls.box((1.13, 0.69, 0.0), (0.17, 0.92, 2.28), BUILDING_PALETTE["timber"])
    walls.box((-0.78, 0.69, 1.12), (0.74, 0.92, 0.17), BUILDING_PALETTE["timber"])
    walls.box((0.78, 0.69, 1.12), (0.74, 0.92, 0.17), BUILDING_PALETTE["timber"])
    # Corner posts and cross-beams add a rhythm without shrinking the entrance.
    for x in (-1.06, 1.06):
        for z in (-1.02, 1.02):
            walls.box((x, 0.70, z), (0.18, 0.94, 0.18), BUILDING_PALETTE["timberLight"])
    walls.box((0.0, 1.10, 1.16), (1.45, 0.11, 0.18), BUILDING_PALETTE["timberLight"])
    walls.box((0.0, 0.38, -1.12), (2.24, 0.11, 0.19), BUILDING_PALETTE["shadow"])
    add_gable(walls, 1.17, BUILDING_PALETTE["timber"])
    add_gable(walls, -1.17, BUILDING_PALETTE["timberLight"])
    walls_obj = walls.mesh_object(
        "barracks.complete.wallShell", complete, material=BARRACKS_NEUTRAL,
        batch_key="building.barracks.shell",
    )

    entry = MeshBuilder(pivot=(0, 0, 0))
    entry.box((0.0, 0.54, 1.235), (0.48, 0.74, 0.055), BUILDING_PALETTE["door"])
    entry.box((-0.16, 0.54, 1.27), (0.045, 0.72, 0.03), BUILDING_PALETTE["timberLight"])
    entry.box((0.16, 0.54, 1.27), (0.045, 0.72, 0.03), BUILDING_PALETTE["timberLight"])
    entry.box((0.0, 0.18, 1.29), (0.56, 0.10, 0.12), BUILDING_PALETTE["stoneLight"])
    entry_obj = entry.mesh_object(
        "barracks.complete.gate", complete, material=BARRACKS_NEUTRAL,
        batch_key="building.barracks.gate",
    )

    roof = MeshBuilder(pivot=(0, 0, 0))
    roof.box((-0.68, 1.40, 0.0), (1.78, 0.16, 3.10), BUILDING_PALETTE["slate"], angle_z=math.radians(25))
    roof.box((0.68, 1.40, 0.0), (1.78, 0.16, 3.10), BUILDING_PALETTE["slate"], angle_z=math.radians(-25))
    roof.box((0.0, 1.84, 0.0), (0.18, 0.16, 3.17), BUILDING_PALETTE["slateLight"])
    roof_obj = roof.mesh_object(
        "barracks.complete.gabledRoof", complete, material=BARRACKS_NEUTRAL,
        batch_key="building.barracks.roof",
    )

    team_trim = MeshBuilder(pivot=(0, 0, 0))
    team_trim.prism_xy([(-0.31, 1.30), (0.31, 1.30), (0.27, 0.90), (0.0, 0.78), (-0.28, 0.90)], 1.33, 0.055, "#FFFFFF")
    team_trim.box((0.0, 1.86, 0.0), (0.12, 0.06, 3.12), "#FFFFFF")
    team_trim_obj = team_trim.mesh_object(
        "barracks.complete.teamTrim", complete, material=BARRACKS_TEAM,
        batch_key="building.barracks.team-trim",
    )

    # The two building standards share the team-accent material slot while their
    # vertex values draw a darker mark in the team's own hue. The renderer picks
    # exactly one GLB node for the building owner.
    azure_standard = MeshBuilder(pivot=(0, 0, 0))
    azure_standard.prism_xy([(0.55, 2.12), (1.62, 2.12), (1.62, 1.65), (0.55, 1.65)],
                            1.54, 0.035, "#FFFFFF")
    azure_standard.prism_xy([(0.66, 1.93), (1.50, 1.93), (1.50, 1.84), (0.66, 1.84)],
                            1.582, 0.012, "#B8B8B8")
    azure_standard_obj = azure_standard.mesh_object(
        "barracks.standard.azure", complete, material=BARRACKS_TEAM,
        batch_key="building.barracks.standard.azure",
    )
    azure_standard_obj["teamVariant"] = "azure"

    ember_standard = MeshBuilder(pivot=(0, 0, 0))
    ember_standard.prism_xy([(0.55, 2.12), (1.62, 2.12), (1.57, 1.65),
                             (1.31, 1.77), (0.58, 1.65)], 1.54, 0.035, "#FFFFFF")
    ember_standard.prism_xy([(0.84, 2.00), (1.12, 2.00), (1.17, 1.84),
                             (1.01, 1.79), (0.84, 1.84)], 1.582, 0.012, "#777777")
    ember_standard_obj = ember_standard.mesh_object(
        "barracks.standard.ember", complete, material=BARRACKS_TEAM,
        batch_key="building.barracks.standard.ember",
    )
    ember_standard_obj["teamVariant"] = "ember"

    pole = MeshBuilder(pivot=(0, 0, 0))
    pole.cylinder_y((0.55, 1.86, 1.54), 0.035, 0.90, 5, BUILDING_PALETTE["timber"])
    pole_obj = pole.mesh_object(
        "barracks.complete.bannerPole", complete, material=BARRACKS_NEUTRAL,
        batch_key="building.barracks.banner-pole",
    )

    empty_node("barracks.anchor.ground", root, (0.0, 0.0, 0.0), "ground-center")
    empty_node("barracks.anchor.gate", root, (0.0, 0.0, 1.50), "front-gate")
    empty_node("barracks.anchor.banner", root, (0.55, 2.31, 1.54), "team-accent")
    empty_node("barracks.anchor.productionCue", root, (-0.72, 1.32, 1.28), "renderer-signal")
    empty_node("barracks.anchor.rallyPoint", root, (0.0, 0.0, 2.15), "rally-point")
    return root, {
        "foundation": foundation_obj, "site": site, "partial": partial_obj, "siteAccent": site_accent_obj,
        "complete": complete, "walls": walls_obj, "entry": entry_obj, "roof": roof_obj,
        "teamTrim": team_trim_obj, "standardAzure": azure_standard_obj,
        "standardEmber": ember_standard_obj, "pole": pole_obj,
    }

def add_ground_material(name, path):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    nodes.clear()
    image = bpy.data.images.load(str(path), check_existing=True)
    image.colorspace_settings.name = "sRGB"
    tex = nodes.new("ShaderNodeTexImage")
    tex.image = image
    tex.extension = "REPEAT"
    uv = nodes.new("ShaderNodeTexCoord")
    multiply = nodes.new("ShaderNodeMixRGB")
    multiply.blend_type = "MULTIPLY"
    multiply.inputs["Fac"].default_value = 1.0
    multiply.inputs["Color2"].default_value = linear_rgba("#D2D4BD")
    links.new(uv.outputs["UV"], tex.inputs["Vector"])
    links.new(tex.outputs["Color"], multiply.inputs["Color1"])
    emission = nodes.new("ShaderNodeEmission")
    links.new(multiply.outputs["Color"], emission.inputs["Color"])
    output = nodes.new("ShaderNodeOutputMaterial")
    links.new(emission.outputs["Emission"], output.inputs["Surface"])
    return material

def create_ground(name, image_path, material, span=220.0):
    mesh = bpy.data.meshes.new(name + ".mesh")
    verts = [
        game_to_blender((-span / 2, -0.03, -span / 2)),
        game_to_blender(( span / 2, -0.03, -span / 2)),
        game_to_blender(( span / 2, -0.03,  span / 2)),
        game_to_blender((-span / 2, -0.03,  span / 2)),
    ]
    mesh.from_pydata(verts, [], [(0, 3, 2, 1)])
    uv = mesh.uv_layers.new(name="UVMap")
    # The original environment textures repeat every twelve project world units.
    for loop in mesh.loops:
        vertex = mesh.vertices[loop.vertex_index].co
        game_x = vertex.x
        game_z = -vertex.y
        uv.data[loop.index].uv = (game_x / 12.0, game_z / 12.0)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(material)
    return obj

def add_preview_sprite_material(name, image_path):
    existing = bpy.data.materials.get(name)
    if existing:
        return existing
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    nodes.clear()
    image = bpy.data.images.load(str(image_path), check_existing=True)
    image.colorspace_settings.name = "sRGB"
    image.alpha_mode = "STRAIGHT"
    tex = nodes.new("ShaderNodeTexImage")
    tex.image = image
    uv = nodes.new("ShaderNodeTexCoord")
    links.new(uv.outputs["UV"], tex.inputs["Vector"])
    emission = nodes.new("ShaderNodeEmission")
    links.new(tex.outputs["Color"], emission.inputs["Color"])
    transparent = nodes.new("ShaderNodeBsdfTransparent")
    mix = nodes.new("ShaderNodeMixShader")
    threshold = nodes.new("ShaderNodeMath")
    threshold.operation = "GREATER_THAN"
    threshold.inputs[1].default_value = 0.08
    links.new(tex.outputs["Alpha"], threshold.inputs[0])
    links.new(threshold.outputs[0], mix.inputs["Fac"])
    links.new(transparent.outputs["BSDF"], mix.inputs[1])
    links.new(emission.outputs["Emission"], mix.inputs[2])
    output = nodes.new("ShaderNodeOutputMaterial")
    links.new(mix.outputs["Shader"], output.inputs["Surface"])
    try:
        material.surface_render_method = "DITHERED"
    except (AttributeError, TypeError, ValueError):
        pass
    return material


def add_preview_billboard(name, image_path, location_game, width, height, scale=1.0):
    half_width = width * scale * 0.5
    scaled_height = height * scale
    game_vertices = [
        (-half_width, 0.0, 0.0), (half_width, 0.0, 0.0),
        (half_width, scaled_height, 0.0), (-half_width, scaled_height, 0.0),
    ]
    mesh = bpy.data.meshes.new("preview.sprite." + name + ".mesh")
    mesh.from_pydata([game_to_blender(point) for point in game_vertices], [], [(0, 1, 2, 3)])
    uv = mesh.uv_layers.new(name="UVMap")
    for loop, coords in zip(mesh.loops, ((0, 0), (1, 0), (1, 1), (0, 1))):
        uv.data[loop.index].uv = coords
    obj = bpy.data.objects.new("preview.sprite." + name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.location = game_to_blender(location_game)
    obj.rotation_mode = "QUATERNION"
    source_normal = Vector(game_to_blender((0.0, 0.0, 1.0))).normalized()
    camera_facing = Vector(game_to_blender((0.78, 1.12, 0.78))).normalized()
    obj.rotation_quaternion = source_normal.rotation_difference(camera_facing)
    obj["previewOwned"] = True
    obj.data.materials.append(add_preview_sprite_material("preview.sprite.material." + name, image_path))
    return obj


def add_preview_environment_sprites():
    return [
        add_preview_billboard("pine", ENVIRONMENT_SOURCE / "pine.webp", (-9.0, 0.0, 9.0), 2.25, 3.4),
        add_preview_billboard("oak", ENVIRONMENT_SOURCE / "oak.webp", (9.0, 0.0, -9.0), 3.05, 2.86),
        add_preview_billboard("rock-outcrop", ENVIRONMENT_SOURCE / "rock-outcrop.webp", (12.0, 0.0, 12.0), 3.5, 2.2),
    ]

def light_camera_and_world(world_width, world_height, output_path, scene):
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1920
    scene.render.resolution_y = 720
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.film_transparent = False
    scene.render.filepath = str(output_path)
    scene.render.resolution_percentage = 100
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    scene.view_settings.exposure = 0.0
    scene.view_settings.gamma = 1.0
    scene.camera.data.type = "ORTHO"
    scene.camera.data.ortho_scale = world_width
    scene.camera.location = game_to_blender((0.78 * 38, 1.12 * 38, 0.78 * 38))
    direction = Vector(game_to_blender((0.0, 0.0, 0.0))) - scene.camera.location
    scene.camera.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    scene.camera.data.lens = 50
    scene.camera.data.clip_start = 0.1
    scene.camera.data.clip_end = 400
    scene.render.resolution_y = round(scene.render.resolution_x * world_height / world_width)
    scene.camera.data.dof.use_dof = False
    scene.render.image_settings.color_depth = "8"
    scene.world.color = (0.22, 0.25, 0.19)
    scene.world.use_nodes = True
    background = scene.world.node_tree.nodes.get("Background")
    if background:
        background.inputs["Color"].default_value = (0.35, 0.39, 0.31, 1.0)
        background.inputs["Strength"].default_value = 0.75
    if not any(obj.type == "LIGHT" for obj in scene.objects):
        data = bpy.data.lights.new("sun", "SUN")
        data.energy = 2.0
        data.angle = math.radians(14)
        sun = bpy.data.objects.new("sun", data)
        bpy.context.collection.objects.link(sun)
        sun.location = game_to_blender((-24, 38, 20))
        light_position = Vector(game_to_blender((-24, 38, 20)))
        sun.rotation_euler = (-light_position).to_track_quat("-Z", "Y").to_euler()
    return scene

def clone_mesh_for_preview(source, parent, team_color=None, local_location=None, rotation_x=0.0, include=True):
    if not include or source.type != "MESH":
        return None
    obj = source.copy()
    obj.data = source.data.copy()
    bpy.context.collection.objects.link(obj)
    obj.parent = parent
    obj.matrix_parent_inverse = Matrix.Identity(4)
    obj.location = source.location.copy()
    obj.rotation_euler = source.rotation_euler.copy()
    obj.scale = source.scale.copy()
    obj.hide_render = False
    obj["previewOwned"] = True
    obj.hide_set(False)
    if local_location is not None:
        obj.location = game_to_blender(local_location)
    if rotation_x:
        # Game +X rotation maps to Blender +X after the agreed basis conversion.
        obj.rotation_euler.x += rotation_x
    for slot in obj.material_slots:
        if slot.material in (UNIT_NEUTRAL, BARRACKS_NEUTRAL):
            slot.material = bpy.data.materials["preview-neutral-unlit"]
        elif slot.material == UNIT_TEAM:
            slot.material = bpy.data.materials["preview-team-" + team_color]
        elif slot.material == BARRACKS_TEAM:
            slot.material = bpy.data.materials["preview-team-barracks-" + team_color]
    return obj

def root_for_preview(name, location_game):
    root = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(root)
    root.empty_display_type = "PLAIN_AXES"
    root.location = game_to_blender(location_game)
    root["previewOwned"] = True
    return root

def make_queue_cue(location_game, color):
    # Preview-only renderer signal. This object is never exported into barracks.glb.
    mesh = bpy.data.meshes.new("preview.productionCue.mesh")
    size = 0.10
    verts = [
        game_to_blender((-size, -size, -size)), game_to_blender((size, -size, -size)),
        game_to_blender((size, -size, size)), game_to_blender((-size, -size, size)),
        game_to_blender((0.0, size, 0.0)),
    ]
    faces = [(0, 3, 2, 1), (0, 1, 4), (1, 2, 4), (2, 3, 4), (3, 0, 4)]
    mesh.from_pydata(verts, [], faces)
    obj = bpy.data.objects.new("preview.productionCue.renderer-owned", mesh)
    bpy.context.collection.objects.link(obj)
    obj.location = game_to_blender(location_game)
    obj["previewOwned"] = True
    material = make_preview_unlit_material("preview.productionCue." + color, TEAM_COLORS[color])
    obj.data.materials.append(material)
    return obj

def duplicate_asset(root, state, sample_center, pair_offset, team):
    pos = Vector(sample_center) + Vector(pair_offset)
    preview_root = root_for_preview("preview." + state + "." + team, pos)
    visible_nodes = set()
    if root.name.startswith("barracks"):
        pose_id = "barracks-construction-mid" if state == "construction-mid" else "barracks-complete"
        visible_nodes = set(POSE_SAMPLES["sampledPoses"][pose_id]["visibleNodes"])
    for child in descendants(root):
        if child.type != "MESH":
            continue
        if root.name.startswith("unit"):
            clone_mesh_for_preview(child, preview_root, team_color=team)
        else:
            variant_team = child.get("teamVariant")
            if variant_team and variant_team != team:
                continue
            if child.name in visible_nodes or (child.parent and child.parent.name in visible_nodes):
                clone_mesh_for_preview(child, preview_root, team_color=team)
    if root.name.startswith("unit"):
        pose_id = "worker-idle" if state == "idle" else "worker-build"
        pose_parts = POSE_SAMPLES["sampledPoses"][pose_id]["partTransforms"]
        for obj in preview_root.children:
            node = next((key for key in pose_parts if obj.name.startswith(key)), None)
            if node:
                transform = pose_parts[node]
                delta = transform.get("translationDeltaWorld", (0.0, 0.0, 0.0))
                obj.location += Vector(game_to_blender(delta))
                rotation = transform["rotationDegXYZ"]
                obj.rotation_euler = tuple(math.radians(value) for value in rotation)
        # Orient paired figures to reveal the pack silhouette without changing the model axis.
        if team == "ember":
            preview_root.rotation_euler = Matrix.Rotation(math.pi, 4, "Z").to_euler()
    if state == "complete" and root.name.startswith("barracks"):
        anchor = Vector((-0.72, 1.32, 1.28))
        cue = make_queue_cue(tuple(pos + anchor), team)
        cue.parent = preview_root
        cue.matrix_parent_inverse = Matrix.Identity(4)
        cue.location = game_to_blender(tuple(anchor))
    return preview_root

def render_comparison(unit_root, building_root):
    scene = bpy.context.scene
    for obj in collection_children(unit_root) + collection_children(building_root):
        obj.hide_render = True
    # Clear any camera/lights left in the factory scene, then restore only render objects.
    for obj in list(scene.objects):
        if obj.type in {"CAMERA", "LIGHT"}:
            bpy.data.objects.remove(obj, do_unlink=True)
    camera_data = bpy.data.cameras.new("preview-camera")
    camera = bpy.data.objects.new("preview-camera", camera_data)
    scene.collection.objects.link(camera)
    scene.camera = camera

    make_preview_unlit_material("preview-neutral-unlit", vertex_colors=True)
    make_preview_unlit_material("preview-team-azure", TEAM_COLORS["azure"])
    make_preview_unlit_material("preview-team-ember", TEAM_COLORS["ember"])
    make_preview_unlit_material("preview-team-barracks-azure", vertex_colors=True, tint=TEAM_COLORS["azure"])
    make_preview_unlit_material("preview-team-barracks-ember", vertex_colors=True, tint=TEAM_COLORS["ember"])
    # Match the live renderer's unlit material and world-space ground tint.

    camera_offset = Vector((0.78, 1.12, 0.78)).normalized()
    camera_position = camera_offset * 120.0
    camera.location = game_to_blender(tuple(camera_position))
    camera.rotation_euler = (Vector(game_to_blender((0, 0, 0))) - camera.location).to_track_quat("-Z", "Y").to_euler()

    ground_paths = [("meadow", MEADOW_SOURCE), ("cinder", CINDER_SOURCE)]
    sample_specs = [
        ("idle", "unit", "worker-idle"),
        ("build", "unit", "worker-build"),
        ("construction-mid", "building", "barracks-construction-mid"),
        ("complete", "building", "barracks-complete"),
    ]
    # Match the browser renderer's 43 / 0.91 world-unit vertical frustum at
    # its common 16:9 1280 x 720 review viewport. Each file gets one centered
    # state and both teams; no rescaling is applied to the models.
    world_height = 43.0 / 0.91
    world_width = world_height * (1280.0 / 720.0)
    detail_zoom = 2.3
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
    scene.camera.data.ortho_scale = world_width
    scene.world.use_nodes = True
    scene.world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.38, 0.42, 0.33, 1)
    scene.world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.82

    output_files = []
    for ground_name, ground_path in ground_paths:
        for state, kind, _pose_id in sample_specs:
            for obj in list(scene.objects):
                if obj.get("previewOwned") or obj.name.startswith(("preview.", "ground.", "sun")):
                    bpy.data.objects.remove(obj, do_unlink=True)
            ground_mat = add_ground_material("ground." + ground_name, ground_path)
            create_ground("ground." + ground_name, ground_path, ground_mat, span=420.0)
            context_sprites = add_preview_environment_sprites()

            asset_root = unit_root if kind == "unit" else building_root
            offset_distance = 1.15 if kind == "unit" else 4.0
            preview_roots = {}
            for team, offset_sign in (("azure", -1.0), ("ember", 1.0)):
                pair_offset = (offset_sign * offset_distance / math.sqrt(2), 0.0,
                               -offset_sign * offset_distance / math.sqrt(2))
                preview_roots[team] = duplicate_asset(asset_root, state, (0.0, 0.0, 0.0), pair_offset, team)

            sun_data = bpy.data.lights.new("sun", "SUN")
            sun_data.energy = 1.5
            sun_data.angle = math.radians(15)
            sun = bpy.data.objects.new("sun", sun_data)
            scene.collection.objects.link(sun)
            sun.location = game_to_blender((-24, 38, 20))
            light_position = Vector(game_to_blender((-24, 38, 20)))
            sun.rotation_euler = (-light_position).to_track_quat("-Z", "Y").to_euler()

            role = "worker" if kind == "unit" else "barracks"
            file_name = f"{role}-{state}-{ground_name}-1280x720.png"
            for zoom_name, zoom_value in (("default", 0.91), ("strategic", 0.48)):
                scene.camera.data.ortho_scale = world_width / zoom_value
                suffix = "-strategic-zoom" if zoom_name == "strategic" else ""
                output_path = PREVIEWS / file_name.replace("-1280x720.png", suffix + "-1280x720.png")
                scene.render.filepath = str(output_path)
                bpy.ops.render.render(write_still=True)
                output_files.append(scene.render.filepath)

            # Close details are separate craft views without contextual props;
            # the gameplay and strategic shots above retain their exact framing.
            for sprite in context_sprites:
                sprite.hide_render = True
            detail_pair_distance = 7.2 if kind == "unit" else 9.0
            for team, offset_sign in (("azure", -1.0), ("ember", 1.0)):
                pair_offset = (offset_sign * detail_pair_distance / math.sqrt(2), 0.0,
                               -offset_sign * detail_pair_distance / math.sqrt(2))
                preview_roots[team].location = game_to_blender(pair_offset)
            scene.camera.data.ortho_scale = world_width / detail_zoom
            scene.render.filepath = str(PREVIEWS / file_name.replace("-1280x720.png", "-detail-zoom-1280x720.png"))
            bpy.ops.render.render(write_still=True)
            output_files.append(scene.render.filepath)
    return output_files

def main():
    MODELS.mkdir(parents=True, exist_ok=True)
    PREVIEWS.mkdir(parents=True, exist_ok=True)
    SOURCE.mkdir(parents=True, exist_ok=True)
    if not MEADOW_SOURCE.exists() or not CINDER_SOURCE.exists():
        raise FileNotFoundError("Original meadow and cinder source textures are required for review previews")
    required_sprites = ("pine.webp", "oak.webp", "rock-outcrop.webp")
    if any(not (ENVIRONMENT_SOURCE / name).exists() for name in required_sprites):
        raise FileNotFoundError("Copied source tree/rock sprites are required for in-world review previews")
    clear_scene()
    unit_root, unit_parts = create_unit_asset()
    barracks_root, barracks_parts = create_barracks_asset()
    select_and_export(unit_root, MODELS / "unit-art-v1.glb")
    select_and_export(barracks_root, MODELS / "barracks.glb")

    # Save a clean authoring view before any preview instances or billboards exist.
    # Open on one complete Azure Barracks; all exported state/team nodes remain intact.
    unit_root.hide_set(True)
    bpy.data.objects["barracks.state.construction"].hide_set(True)
    barracks_parts["standardEmber"].hide_set(True)
    bpy.ops.object.select_all(action="DESELECT")
    barracks_root.hide_set(False)
    barracks_root.select_set(True)
    bpy.context.view_layer.objects.active = barracks_root
    bpy.context.preferences.filepaths.save_version = 0
    backup = SOURCE / "frontier-sample-source.blend1"
    if backup.exists():
        backup.unlink()
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE / "frontier-sample-source.blend"))
    render_comparison(unit_root, barracks_root)

    # The review manifest, documentation, crops, and checksums are assembled by assemble_review_pack.py.

if __name__ == "__main__":
    main()
