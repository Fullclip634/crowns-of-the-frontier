"""Rig, skin and animate a fused Tripo scan into a game-weight animated GLB.

Blender's automatic weights fail on fused scans ("Bone Heat Weighting: failed to
find solution"), which silently produces a GLB with JOINTS_0 but no skin — a
mesh that looks rigged and cannot move. This assigns weights deterministically
from bone proximity instead, blending the two nearest bones so joints bend
rather than tear.

Run: blender --background --python rig-character.py -- <src.glb> <dst.glb> <target-tris>
"""
import bpy
import sys
import math
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:]
src, dst, target = argv[0], argv[1], int(argv[2])

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)

meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
if not meshes:
    raise SystemExit('no meshes')
body = meshes[0]


def tris(obj):
    obj.data.calc_loop_triangles()
    return len(obj.data.loop_triangles)


before = sum(tris(o) for o in meshes)
ratio = min(1.0, target / max(1, before))
for o in meshes:
    bpy.context.view_layer.objects.active = o
    mod = o.modifiers.new('dec', 'DECIMATE')
    mod.decimate_type = 'COLLAPSE'
    mod.ratio = ratio
    mod.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier=mod.name)
after = sum(tris(o) for o in meshes)

bpy.context.view_layer.update()
world = [body.matrix_world @ v.co for v in body.data.vertices]
min_z = min(v.z for v in world)
max_z = max(v.z for v in world)
min_x = min(v.x for v in world)
max_x = max(v.x for v in world)
height = max_z - min_z
centre_x = (min_x + max_x) / 2
print('BOUNDS height=%.3f base=%.3f centreX=%.3f' % (height, min_z, centre_x))

bpy.ops.object.armature_add(location=(0, 0, 0))
armature = bpy.context.object
armature.name = 'Rig'
bpy.ops.object.mode_set(mode='EDIT')
eb = armature.data.edit_bones
for bone in list(eb):
    eb.remove(bone)

segments = {}


def bone(name, head, tail, parent=None):
    b = eb.new(name)
    b.head = Vector(head)
    b.tail = Vector(tail)
    if parent:
        b.parent = eb[parent]
    segments[name] = (Vector(head), Vector(tail))
    return b


hip_z = min_z + height * 0.50
chest_z = min_z + height * 0.72
neck_z = min_z + height * 0.86
bone('hips', (centre_x, 0, hip_z), (centre_x, 0, chest_z))
bone('spine', (centre_x, 0, chest_z), (centre_x, 0, neck_z), 'hips')
bone('head', (centre_x, 0, neck_z), (centre_x, 0, max_z), 'spine')
bone('arm.L', (centre_x + height * 0.11, 0, neck_z - height * 0.05), (centre_x + height * 0.27, 0, hip_z + height * 0.05), 'spine')
bone('arm.R', (centre_x - height * 0.11, 0, neck_z - height * 0.05), (centre_x - height * 0.27, 0, hip_z + height * 0.05), 'spine')
bone('leg.L', (centre_x + height * 0.07, 0, hip_z), (centre_x + height * 0.07, 0, min_z), 'hips')
bone('leg.R', (centre_x - height * 0.07, 0, hip_z), (centre_x - height * 0.07, 0, min_z), 'hips')
bpy.ops.object.mode_set(mode='OBJECT')

# Parent with empty groups: this creates the Armature modifier and one vertex
# group per bone without attempting bone heat, which cannot solve this mesh.
body.select_set(True)
armature.select_set(True)
bpy.context.view_layer.objects.active = armature
bpy.ops.object.parent_set(type='ARMATURE_NAME')

groups = {name: body.vertex_groups[name] for name in segments}


def distance_to_segment(p, a, b):
    ab = b - a
    length_sq = ab.length_squared
    if length_sq < 1e-9:
        return (p - a).length
    t = max(0.0, min(1.0, (p - a).dot(ab) / length_sq))
    return (p - (a + ab * t)).length


for v in body.data.vertices:
    p = body.matrix_world @ v.co
    ranked = sorted(((distance_to_segment(p, a, b), name) for name, (a, b) in segments.items()))[:2]
    # Inverse-distance blend with a strong falloff: the nearest bone dominates
    # the interior of a limb while the second keeps joints continuous.
    weights = [(name, 1.0 / (d ** 4 + 1e-6)) for d, name in ranked]
    total = sum(w for _, w in weights)
    for name, w in weights:
        groups[name].add([v.index], w / total, 'REPLACE')

scene = bpy.context.scene
scene.frame_start = 1
scene.frame_end = 25
scene.render.fps = 12

bpy.context.view_layer.objects.active = armature
bpy.ops.object.mode_set(mode='POSE')
for frame, swing in ((1, 0.5), (7, -0.5), (13, 0.5), (19, -0.5), (25, 0.5)):
    scene.frame_set(frame)
    for name, sign in (('leg.L', 1), ('leg.R', -1), ('arm.L', -1), ('arm.R', 1)):
        pb = armature.pose.bones.get(name)
        if not pb:
            continue
        pb.rotation_mode = 'XYZ'
        pb.rotation_euler = (math.radians(28) * swing * sign, 0, 0)
        pb.keyframe_insert('rotation_euler', frame=frame)
bpy.ops.object.mode_set(mode='OBJECT')

scene.frame_set(1)
bpy.ops.export_scene.gltf(
    filepath=dst,
    export_format='GLB',
    use_selection=False,
    export_apply=False,
    export_animations=True,
    export_skins=True,
    export_yup=True,
)

print('RIG_RESULT before=%d after=%d groups=%d' % (before, after, len(groups)))
