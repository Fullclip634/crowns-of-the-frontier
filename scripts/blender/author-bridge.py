"""Author the original river bridge; no external model or existing .blend is required."""
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
half_length, road_half, rail_inner, base, crown = 13.0, 9.6, 9.65, .72, 1.5
geometry = {role: {'vertices': [], 'faces': [], 'colors': []} for role in ['stone', 'stoneDark', 'leafDark']}

def height(x):
    return base + crown * math.cos(min(1, abs(x) / half_length) * math.pi / 2) ** 2

def solid(role, vertices, faces, color=(.74, .73, .66)):
    data = geometry[role]
    start = len(data['vertices'])
    data['vertices'].extend(vertices)
    data['faces'].extend(tuple(start + i for i in face) for face in faces)
    shade = rng.uniform(.92, 1.04)
    data['colors'].extend([tuple(c * shade for c in color)] * len(vertices))

def extrude(role, polygon, z0, z1, color=(.74, .73, .66)):
    n = len(polygon)
    vertices = [(x, y, z) for z in [z0, z1] for x, y in polygon]
    faces = [tuple(range(n - 1, -1, -1)), tuple(range(n, n * 2))]
    faces.extend((i, (i + 1) % n, (i + 1) % n + n, i + n) for i in range(n))
    solid(role, vertices, faces, color)

def block(role, x0, x1, z0, z1, bottom, top, color=(.74, .73, .66)):
    lo = bottom if callable(bottom) else lambda x: bottom
    hi = top if callable(top) else lambda x: top
    extrude(role, [(x0, lo(x0)), (x1, lo(x1)), (x1, hi(x1)), (x0, hi(x0))], z0, z1, color)

def bevel_top(role, x0, x1, z0, z1, bottom, top, bevel=.035, color=(.79, .78, .71)):
    corners = [(x0, z0), (x1, z0), (x1, z1), (x0, z1)]
    inset = [(x0 + bevel, z0 + bevel), (x1 - bevel, z0 + bevel), (x1 - bevel, z1 - bevel), (x0 + bevel, z1 - bevel)]
    vertices = [(x, bottom(x), z) for x, z in corners] + [(x, top(x) - bevel, z) for x, z in corners] + [(x, top(x), z) for x, z in inset]
    faces = [(3, 2, 1, 0), (8, 9, 10, 11)]
    for i in range(4):
        j = (i + 1) % 4
        faces.extend([(i, j, j + 4, i + 4), (i + 4, j + 4, j + 8, i + 8)])
    solid(role, vertices, faces, color)

# Complete barrel vaults, with individually closed wedge-shaped voussoirs.
arches = [(0, 3.6, 1.66, -.25, 18), (-8, 2.75, .91, -.35, 14), (8, 2.75, .91, -.35, 14)]
for center, radius, rise, spring, count in arches:
    for i in range(count):
        a, b = i * math.pi / count + .002, (i + 1) * math.pi / count - .002
        ring = .34 if center else .39
        outer = lambda t: (center + (radius + ring) * math.cos(t), spring + (rise + ring) * math.sin(t))
        inner = lambda t: (center + radius * math.cos(t), spring + rise * math.sin(t))
        extrude('stone', [outer(a), outer(b), inner(b), inner(a)], -9.92, 9.92, (.72, .71, .63))
        # The spandrel above each arch is a solid mass beneath the paving.
        aa, bb = i * math.pi / count, (i + 1) * math.pi / count
        x0, y0 = outer(aa)
        x1, y1 = outer(bb)
        extrude('stone', [(x0, y0 - .012), (x1, y1 - .012), (x1, height(x1) - .20), (x0, height(x0) - .20)], -9.9, 9.9, (.65, .66, .60))

# Piers and bank abutments reach below the riverbed. Pointed cutwaters break
# the rectangular silhouette at both river faces without narrowing the road.
for x0, x1 in [(-13, -10.75), (-5.25, -3.6), (3.6, 5.25), (10.75, 13)]:
    block('stone', x0, x1, -9.9, 9.9, -1.85, lambda x: height(x) - .19, (.64, .65, .59))
for center in [-4.425, 4.425]:
    for side in [-1, 1]:
        z0, z1 = side * 9.86, side * 11.15
        top = height(center) - .12
        # Build the two triangular end planes as one closed prism.
        points = []
        for y in [-1.85, top]:
            points.extend([(center - .84, y, z0), (center + .84, y, z0), (center, y, z1)])
        solid('stoneDark', points, [(0, 2, 1), (3, 4, 5), (0, 1, 4, 3), (1, 2, 5, 4), (2, 0, 3, 5)], (.70, .73, .66))

# A continuous cambered deck under tightly fitted, staggered paving stones.
for i in range(52):
    x0, x1 = -13 + i * .5, -13 + (i + 1) * .5
    block('stoneDark', x0, x1, -9.9, 9.9, lambda x: height(x) - .25, lambda x: height(x) - .045, (.57, .60, .54))
for row in range(12):
    z0, z1 = -road_half + row * 1.6 + .018, -road_half + (row + 1) * 1.6 - .018
    start = -13 - (.65 if row % 2 else 0)
    for col in range(21):
        x0, x1 = max(-13, start + col * 1.3 + .018), min(13, start + (col + 1) * 1.3 - .018)
        if x1 - x0 < .1:
            continue
        variation = rng.uniform(-.004, .004)
        bevel_top('stone', x0, x1, z0, z1, lambda x: height(x) - .06, lambda x: height(x) + .006 + variation, .025, (.70, .70, .64))

# Three bonded courses and continuous beveled coping stones on each side.
for side in [-1, 1]:
    z0, z1 = sorted([side * rail_inner, side * (rail_inner + .52)])
    for course in range(3):
        start = -13 - (.65 if course % 2 else 0)
        for col in range(21):
            x0, x1 = max(-13, start + col * 1.3 + .012), min(13, start + (col + 1) * 1.3 - .012)
            if x1 - x0 > .1:
                block('stone', x0, x1, z0, z1, lambda x: height(x) + course * .29, lambda x: height(x) + (course + 1) * .29 - .012)
    for col in range(20):
        x0, x1 = -13 + col * 1.3, -13 + (col + 1) * 1.3
        bevel_top('stone', x0, x1, z0 - .08, z1 + .08, lambda x: height(x) + .86, lambda x: height(x) + 1.05, .045, (.85, .83, .75))
    for x in [-12.65, -4.425, 4.425, 12.65]:
        block('stone', x - .31, x + .31, z0 - .07, z1 + .07, lambda t: height(t), lambda t: height(t) + 1.12, (.76, .75, .68))
        bevel_top('stone', x - .40, x + .40, z0 - .15, z1 + .15, lambda t: height(t) + 1.1, lambda t: height(t) + 1.26, .04, (.87, .85, .77))

# Sparse moss occupies damp vertical masonry rather than the walking surface.
for center in [-11.8, -4.425, 4.425, 11.8]:
    for side in [-1, 1]:
        for i in range(5):
            x = center + rng.uniform(-.48, .48)
            z0, z1 = sorted([side * 9.9, side * 9.925])
            block('leafDark', x - .11, x + .12, z0, z1, -.14 + i * .115, -.05 + i * .115, (.63, .68, .45))

root = bpy.data.objects.new('Frontier stone river bridge', None)
bpy.context.collection.objects.link(root)
root['assetKey'] = 'terrain:bridge:stone'
root['bridgeRevision'] = 'masonry-vault-v1'
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
        shade = .83 + .17 * max(0, normal.z)
        for loop_index in face.loop_indices:
            vertex = mesh.loops[loop_index].vertex_index
            p = mesh.vertices[vertex].co
            color.data[loop_index].color = tuple(c * shade for c in data['colors'][vertex]) + (1,)
            uv.data[loop_index].uv = (p.x * .5, -p.y * .5) if abs(normal.z) > .5 else (p.x * .5, p.z * .5) if abs(normal.y) > .5 else (p.y * .5, p.z * .5)
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
    shader.inputs['Roughness'].default_value = .9
    mesh.materials.append(material)
    obj = bpy.data.objects.new('Bridge ' + role, mesh)
    obj.parent = root
    obj['assetMaterial'] = role
    bpy.context.collection.objects.link(obj)
assert total_triangles < 16000, total_triangles
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=str(out / 'frontier-bridge.glb'), export_format='GLB', use_selection=True, export_apply=True, export_extras=True, export_vertex_color='ACTIVE', export_animations=False, export_cameras=False, export_lights=False)
metadata = {'revision': 'masonry-vault-v1', 'halfLength': half_length, 'roadHalfWidth': road_half, 'baseHeight': base, 'crownHeight': crown, 'triangles': total_triangles, 'materialRoles': list(geometry), 'sourceSHA256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest()}
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
