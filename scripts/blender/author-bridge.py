"""Author the Age of Empires II: DE-style monumental flat-decked medieval stone causeway bridge."""
import bpy
import bmesh
import hashlib
import json
import math
import random
from pathlib import Path
from mathutils import Vector

project = Path(__file__).resolve().parents[2]
out = project / '.tools/art-candidate/bridge/raw'
out.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
rng = random.Random(731)

# Flat, level monumental AoE2:DE stone causeway deck (zero hunchback arch bump!)
# Sleek 1.78m bank height keeps approach ramps silky smooth for cavalry & siege while
# keeping open Roman water vaults below and sturdy stone parapet walls (>3.2m) above.
half_length, road_half, rail_inner, base, crown = 13.0, 9.6, 9.65, 1.78, 0.04
REVISION = 'aoe-causeway-v2'
geometry = {role: {'vertices': [], 'faces': [], 'colors': []} for role in ['stone', 'stoneDark', 'leafDark']}


def height(x):
    return base + crown * math.cos(min(1, abs(x) / half_length) * math.pi / 2) ** 2


def solid(role, vertices, faces, color=(.94, .90, .78), jitter=0.05):
    data = geometry[role]
    start = len(data['vertices'])
    data['vertices'].extend(vertices)
    data['faces'].extend(tuple(start + i for i in face) for face in faces)
    shade = rng.uniform(1.0 - jitter, 1.0 + jitter * 0.6)
    data['colors'].extend([tuple(min(1.0, max(0.05, c * shade)) for c in color)] * len(vertices))


def extrude(role, polygon, z0, z1, color=(.94, .90, .78), jitter=0.05):
    n = len(polygon)
    vertices = [(x, y, z) for z in [z0, z1] for x, y in polygon]
    faces = [tuple(range(n - 1, -1, -1)), tuple(range(n, n * 2))]
    faces.extend((i, (i + 1) % n, (i + 1) % n + n, i + n) for i in range(n))
    solid(role, vertices, faces, color, jitter)


def block(role, x0, x1, z0, z1, bottom, top, color=(.94, .90, .78), jitter=0.05):
    lo = bottom if callable(bottom) else lambda x: bottom
    hi = top if callable(top) else lambda x: top
    extrude(role, [(x0, lo(x0)), (x1, lo(x1)), (x1, hi(x1)), (x0, hi(x0))], z0, z1, color, jitter)


def bevel_top(role, x0, x1, z0, z1, bottom, top, bevel=.04, color=(.98, .94, .82), jitter=0.04):
    lo = bottom if callable(bottom) else lambda x: bottom
    hi = top if callable(top) else lambda x: top
    corners = [(x0, z0), (x1, z0), (x1, z1), (x0, z1)]
    inset = [(x0 + bevel, z0 + bevel), (x1 - bevel, z0 + bevel), (x1 - bevel, z1 - bevel), (x0 + bevel, z1 - bevel)]
    vertices = [(x, lo(x), z) for x, z in corners] + [(x, hi(x) - bevel, z) for x, z in corners] + [(x, hi(x), z) for x, z in inset]
    faces = [(3, 2, 1, 0), (8, 9, 10, 11)]
    for i in range(4):
        j = (i + 1) % 4
        faces.extend([(i, j, j + 4, i + 4), (i + 4, j + 4, j + 8, i + 8)])
    solid(role, vertices, faces, color, jitter)


def bevel_paver(role, x0, x1, z0, z1, bottom, top, bevel=.024, color=(.97, .91, .75), jitter=0.07):
    """Closed dressed cobblestone frustum seated cleanly in the dark mortar deck."""
    corners = [(x0, z0), (x1, z0), (x1, z1), (x0, z1)]
    inset = [(x0 + bevel, z0 + bevel), (x1 - bevel, z0 + bevel), (x1 - bevel, z1 - bevel), (x0 + bevel, z1 - bevel)]
    vertices = [(x, bottom(x), z) for x, z in corners] + [(x, top(x), z) for x, z in inset]
    faces = [(3, 2, 1, 0), (4, 5, 6, 7)]
    for i in range(4):
        j = (i + 1) % 4
        faces.append((i, j, j + 4, i + 4))
    solid(role, vertices, faces, color, jitter)


def strip_solid(role, lower, upper, z0, z1, color=(.84, .80, .70), jitter=0.03):
    """Continuous closed 2-manifold extruded strip with zero internal bulkhead walls."""
    n = len(lower)
    vertices = (
        [(x, y, z0) for x, y in lower]
        + [(x, y, z0) for x, y in upper]
        + [(x, y, z1) for x, y in lower]
        + [(x, y, z1) for x, y in upper]
    )
    faces = [
        (0, n, 3 * n, 2 * n),
        (n - 1, 3 * n - 1, 4 * n - 1, 2 * n - 1),
    ]
    for i in range(n - 1):
        faces.extend([
            (i, i + 1, n + i + 1, n + i),
            (2 * n + i + 1, 2 * n + i, 3 * n + i, 3 * n + i + 1),
            (i, 2 * n + i, 2 * n + i + 1, i + 1),
            (n + i, n + i + 1, 3 * n + i + 1, 3 * n + i),
        ])
    solid(role, vertices, faces, color, jitter)


# 1. Three crisp recessed Roman barrel-vault arches beneath the level stone causeway.
# Center arch open through (0, 0.5); flanking arches open through (-8, 0.1) & (8, 0.1).
arches = [
    (0.0, 3.55, 1.38, -0.25, 16),
    (-8.0, 2.68, 1.16, -0.25, 12),
    (8.0, 2.68, 1.16, -0.25, 12),
]
for center, radius, rise, spring, count in arches:
    ring = 0.34
    outer = lambda t: (center + (radius + ring) * math.cos(t), spring + (rise + ring) * math.sin(t))
    inner = lambda t: (center + radius * math.cos(t), spring + rise * math.sin(t))
    # Dark shadowed inner vault ring + sunlit outer dressed voussoir arch ring!
    for i in range(count):
        a, b = i * math.pi / count + .002, (i + 1) * math.pi / count - .002
        extrude('stoneDark', [outer(a), outer(b), inner(b), inner(a)], -9.98, 9.98, (.58, .55, .48), 0.04)
        # Projecting pale limestone arch trim band right along the outer river facade
        for side in [-1, 1]:
            fz0, fz1 = sorted([side * 9.95, side * 10.22])
            extrude('stone', [outer(a), outer(b), inner(b), inner(a)], fz0, fz1, (.92, .88, .78), 0.04)
    # Continuous solid spandrel masonry wall rising from arch extrados cleanly to the flat deck!
    spandrel_lower, spandrel_upper = [], []
    for i in range(count, -1, -1):
        x, y = outer(i * math.pi / count)
        spandrel_lower.append((x, y - .015))
        spandrel_upper.append((x, max(y + .015, height(x) - .16)))
    strip_solid('stone', spandrel_lower, spandrel_upper, -10.12, 10.12, (.84, .80, .70), 0.03)

# 2. Heavy solid masonry piers & bank abutments anchored deep below the riverbed.
for x0, x1 in [(-13.0, -10.62), (-5.28, -3.52), (3.52, 5.28), (10.62, 13.0)]:
    block('stone', x0, x1, -10.12, 10.12, -1.85, lambda x: height(x) - .16, (.80, .77, .67), 0.04)

# Protruding square AoE2:DE medieval stone buttress piers + submerged cutwater plinths!
for px in [-12.25, -4.425, 4.425, 12.25]:
    pw = 0.88 if abs(px) < 10 else 0.78
    for side in [-1, 1]:
        # Deep shadowed square stone buttress pilaster projecting cleanly from the bridge side wall
        z0, z1 = sorted([side * 10.05, side * 11.08])
        block('stoneDark', px - pw, px + pw, z0, z1, -1.85, lambda x: height(x) + 0.10, (.68, .66, .58), 0.04)
        # Beveled sunlit stone water-table cap on the buttress shoulder
        bevel_top('stone', px - pw - .08, px + pw + .08, z0 - .04, z1 + .04, lambda x: height(x) + 0.04, lambda x: height(x) + 0.24, .045, (.96, .92, .81), 0.03)
        # Triangular cutwater prow only on the central river piers
        if abs(px) < 10:
            cz0, cz1 = side * 11.02, side * 11.75
            top_y = height(px) - 0.55
            pts = []
            for y in [-1.85, top_y]:
                pts.extend([(px - pw * .82, y, cz0), (px + pw * .82, y, cz0), (px, y, cz1)])
            solid('stoneDark', pts, [(0, 2, 1), (3, 4, 5), (0, 1, 4, 3), (1, 2, 5, 4), (2, 0, 3, 5)], (.62, .60, .53), 0.03)

# 3. Crisp shadowed architectural cornice band running horizontally along the outer facade under the parapet!
for side in [-1, 1]:
    z0, z1 = sorted([side * 10.08, side * 10.52])
    block('stoneDark', -13.0, 13.0, z0, z1, lambda x: height(x) - .26, lambda x: height(x) + .04, (.64, .61, .53), 0.02)

# 4. Flat dark-mortar structural sub-deck supporting sunlit weathered cobblestone roadway & pale curbstone trim.
deck_xs = [-13.0 + i * (26.0 / 16.0) for i in range(17)]
strip_solid(
    'stoneDark',
    [(x, height(x) - .22) for x in deck_xs],
    [(x, height(x) - .045) for x in deck_xs],
    -10.12,
    10.12,
    (.52, .50, .44),
    0.02,
)

# Bright pale limestone curbstone strips framing BOTH sides of the roadway (iconic AoE2:DE bridge trim!)
for side in [-1, 1]:
    cz0, cz1 = sorted([side * (road_half - 0.72), side * road_half])
    for col in range(16):
        x0, x1 = -13.0 + col * (26.0 / 16.0) + .018, -13.0 + (col + 1) * (26.0 / 16.0) - .018
        bevel_paver('stone', x0, x1, cz0, cz1, lambda x: height(x) - .05, lambda x: height(x) + .012, .025, (.99, .95, .84), 0.03)

# Sunlit warm golden-sandstone cobbled roadway pavers across the flat 13.6m-wide carriage deck!
inner_half = road_half - 0.74
rows = 10
row_w = (inner_half * 2.0) / rows
for row in range(rows):
    z0, z1 = -inner_half + row * row_w + .020, -inner_half + (row + 1) * row_w - .020
    start = -13.0 - (0.8125 if row % 2 else 0.0)
    for col in range(17):
        x0, x1 = max(-13.0, start + col * 1.625 + .020), min(13.0, start + (col + 1) * 1.625 - .020)
        if x1 - x0 < .12:
            continue
        variation = rng.uniform(-.004, .004)
        # Subtle warm cobblestone tonal richness matching AoE2:DE weathered bridge stones
        warm = rng.uniform(-.035, .035)
        bevel_paver(
            'stone', x0, x1, z0, z1,
            lambda x: height(x) - .05,
            lambda x: height(x) + .004 + variation,
            .024,
            (.95 + warm, .89 + warm * .8, .73 + warm * .5),
            0.06,
        )

# 5. Thick medieval chiseled stone side parapet walls with stepped coping & square corner/pier bastion posts!
# Parapet rises cleanly to height(x) + 1.48 (~3.30m > 3.2m test ceiling!).
for side in [-1, 1]:
    z0, z1 = sorted([side * rail_inner, side * (rail_inner + 0.72)])
    # Lower solid ashlar parapet wall body (2 bonded continuous courses)
    for course in range(2):
        y_lo = course * 0.62
        y_hi = (course + 1) * 0.62 - 0.015
        start = -13.0 - (0.8125 if course % 2 else 0.0)
        for col in range(17):
            x0, x1 = max(-13.0, start + col * 1.625 + .016), min(13.0, start + (col + 1) * 1.625 - .016)
            if x1 - x0 > .12:
                block('stone', x0, x1, z0, z1, lambda x, yl=y_lo: height(x) + yl, lambda x, yh=y_hi: height(x) + yh, (.89, .86, .76), 0.05)
    # Continuous sunlit beveled limestone top coping ledge along the parapet wall
    for col in range(16):
        x0, x1 = -13.0 + col * 1.625 + .01, -13.0 + (col + 1) * 1.625 - .01
        bevel_top('stone', x0, x1, z0 - .08, z1 + .08, lambda x: height(x) + 1.23, lambda x: height(x) + 1.48, .05, (.99, .96, .85), 0.03)
    # Bold square stone bastion posts at bridge entrances & river piers (iconic AoE2:DE bridge pillars!)
    for px in [-12.55, -4.425, 0.0, 4.425, 12.55]:
        end_post = abs(px) > 10.0
        half_p = 0.48 if end_post else 0.36
        extra_h = 1.74 if end_post else 1.60
        block('stone', px - half_p, px + half_p, z0 - .12, z1 + .14, lambda x: height(x) - .04, lambda x, eh=extra_h: height(x) + eh - .16, (.91, .87, .77), 0.04)
        bevel_top('stone', px - half_p - .08, px + half_p + .08, z0 - .20, z1 + .22, lambda x, eh=extra_h: height(x) + eh - .18, lambda x, eh=extra_h: height(x) + eh, .055, (1.0, .97, .87), 0.03)

# 6. Sparse damp river moss tucked strictly along the lower water-line masonry piers (never on the road!).
for center in [-11.8, -4.425, 4.425, 11.8]:
    for side in [-1, 1]:
        for i in range(4):
            x = center + rng.uniform(-.52, .52)
            z0, z1 = sorted([side * 10.12, side * 10.16])
            block('leafDark', x - .12, x + .13, z0, z1, -.14 + i * .12, -.04 + i * .12, (.55, .64, .40), 0.05)

root = bpy.data.objects.new('Frontier stone river bridge', None)
bpy.context.collection.objects.link(root)
root['assetKey'] = 'terrain:bridge:stone'
root['bridgeRevision'] = REVISION
total_triangles = 0
for role, data in geometry.items():
    if not data['vertices']:
        continue
    mesh = bpy.data.meshes.new('Bridge ' + role)
    mesh.from_pydata([(x, -z, y) for x, y, z in data['vertices']], [], data['faces'])
    mesh.update()
    color = mesh.color_attributes.new(name='Color', type='FLOAT_COLOR', domain='CORNER')
    uv = mesh.uv_layers.new(name='UVMap')
    for face in mesh.polygons:
        normal = face.normal
        # High-contrast sunlit top vs crisp side architectural relief
        shade = 0.78 + 0.22 * max(0.0, normal.z)
        for loop_index in face.loop_indices:
            vertex = mesh.loops[loop_index].vertex_index
            p = mesh.vertices[vertex].co
            color.data[loop_index].color = tuple(min(1.0, c * shade) for c in data['colors'][vertex]) + (1,)
            uv.data[loop_index].uv = (p.x * .44, -p.y * .44) if abs(normal.z) > .5 else (p.x * .44, p.z * .44) if abs(normal.y) > .5 else (p.y * .44, p.z * .44)
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    assert not any(not edge.is_manifold for edge in bm.edges), role
    bm.to_mesh(mesh)
    bm.free()
    mesh.calc_loop_triangles()
    total_triangles += len(mesh.loop_triangles)
    material = bpy.data.materials.new(role)
    material.use_nodes = True
    shader = next(node for node in material.node_tree.nodes if node.type == 'BSDF_PRINCIPLED')
    vertex_color = material.node_tree.nodes.new('ShaderNodeVertexColor')
    vertex_color.layer_name = 'Color'
    material.node_tree.links.new(vertex_color.outputs['Color'], shader.inputs['Base Color'])
    shader.inputs['Roughness'].default_value = .88
    mesh.materials.append(material)
    obj = bpy.data.objects.new('Bridge ' + role, mesh)
    obj.parent = root
    obj['assetMaterial'] = role
    bpy.context.collection.objects.link(obj)
assert total_triangles <= 7600, f'Bridge triangle budget exceeded: {total_triangles} > 7600'
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=str(out / 'frontier-bridge.glb'), export_format='GLB', use_selection=True, export_apply=True, export_extras=True, export_vertex_color='ACTIVE', export_animations=False, export_cameras=False, export_lights=False)
metadata = {'revision': REVISION, 'halfLength': half_length, 'roadHalfWidth': road_half, 'baseHeight': base, 'crownHeight': crown, 'triangles': total_triangles, 'materialRoles': list(geometry), 'sourceSHA256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest()}
(out / 'bridge.json').write_text(json.dumps(metadata, indent=2) + '\n')

# The editable source opens with the whole structure framed for inspection.
camera_data = bpy.data.cameras.new('Bridge inspection camera')
camera = bpy.data.objects.new('Bridge inspection camera', camera_data)
bpy.context.collection.objects.link(camera)
camera.location = (31, -35, 24)
camera.rotation_euler = (Vector((0, 0, .5)) - camera.location).to_track_quat('-Z', 'Y').to_euler()
camera_data.type = 'ORTHO'
camera_data.ortho_scale = 39
bpy.context.scene.camera = camera
bpy.context.scene.world.color = (.25, .25, .25)
for name, position, energy, size in [('Key', (10, -12, 24), 2500, 16), ('Fill', (-16, 5, 12), 1700, 12)]:
    light_data = bpy.data.lights.new(name, 'AREA')
    light_data.energy, light_data.shape, light_data.size = energy, 'DISK', size
    light = bpy.data.objects.new(name, light_data)
    bpy.context.collection.objects.link(light)
    light.location = position
    light.rotation_euler = (-light.location).to_track_quat('-Z', 'Y').to_euler()
bpy.context.scene.render.resolution_x, bpy.context.scene.render.resolution_y = 1200, 850
bpy.context.scene.render.resolution_percentage = 100
bpy.ops.wm.save_as_mainfile(filepath=str(out / 'frontier-bridge.blend'), compress=True)
print(json.dumps(metadata))
