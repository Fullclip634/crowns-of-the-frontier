"""Decimate a Tripo character to a game triangle budget and render a preview.

Run: blender --background --python decimate-character.py -- <src.glb> <dst.glb> <target-tris> <preview.png>
"""
import bpy
import sys
import os
import math

argv = sys.argv[sys.argv.index('--') + 1:]
src, dst, target, preview = argv[0], argv[1], int(argv[2]), argv[3]

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)

meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
if not meshes:
    raise SystemExit('no meshes imported')


def triangle_count():
    total = 0
    for o in meshes:
        o.data.calc_loop_triangles()
        total += len(o.data.loop_triangles)
    return total


before = triangle_count()
ratio = min(1.0, target / max(1, before))

for o in meshes:
    bpy.context.view_layer.objects.active = o
    mod = o.modifiers.new(name='decimate', type='DECIMATE')
    mod.decimate_type = 'COLLAPSE'
    mod.ratio = ratio
    # Triangulate the result so the collapse cannot leave ngons that the glTF
    # exporter would triangulate differently on the way out.
    mod.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier=mod.name)

after = triangle_count()

# A single fused mesh has no parts to pose, so keep it upright and centred and
# let the game decide scale. Tripo exports one metre tall with feet at y=0.
bpy.ops.object.select_all(action='SELECT')
bpy.context.view_layer.objects.active = meshes[0]

bpy.ops.export_scene.gltf(
    filepath=dst,
    export_format='GLB',
    use_selection=False,
    export_apply=True,
    export_yup=True,
)

# Preview render: Workbench keeps this fast and shows the baked texture colour,
# which is what the game will actually display.
scene = bpy.context.scene
scene.render.engine = 'BLENDER_WORKBENCH'
scene.display.shading.light = 'STUDIO'
scene.display.shading.color_type = 'TEXTURE'
scene.display.shading.show_shadows = True
scene.render.resolution_x = 512
scene.render.resolution_y = 512
scene.render.film_transparent = False
scene.world = bpy.data.worlds.new('preview')
scene.world.color = (0.09, 0.13, 0.12)

bpy.ops.object.camera_add(location=(0, -2.6, 1.0), rotation=(math.radians(78), 0, 0))
cam = bpy.context.object
scene.camera = cam

bpy.ops.object.light_add(type='SUN', location=(2, -2, 4))
bpy.context.object.data.energy = 3.0

scene.render.filepath = preview
scene.render.image_settings.file_format = 'PNG'
bpy.ops.render.render(write_still=True)

print('RESULT %d %d %s %s' % (before, after, os.path.getsize(dst), os.path.getsize(preview)))
