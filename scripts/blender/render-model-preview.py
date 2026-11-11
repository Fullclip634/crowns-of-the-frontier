"""Render a turntable-style preview of a GLB so the decimated silhouette can be judged.

Run: blender --background --python render-preview.py -- <model.glb> <out.png> [tris]
"""
import bpy
import sys
import math
import os

argv = sys.argv[sys.argv.index('--') + 1:]
src, out = argv[0], argv[1]
frame = int(argv[2]) if len(argv) > 2 else 1

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)

meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
total = 0
for o in meshes:
    o.data.calc_loop_triangles()
    total += len(o.data.loop_triangles)
print('PREVIEW_TRIS %d' % total)

scene = bpy.context.scene
scene.frame_set(frame)
scene.render.engine = 'BLENDER_WORKBENCH'
scene.display.shading.light = 'STUDIO'
scene.display.shading.color_type = 'TEXTURE'
scene.display.shading.show_shadows = True
scene.display.shading.show_cavity = True
scene.render.resolution_x = 512
scene.render.resolution_y = 512
scene.render.image_settings.file_format = 'PNG'
scene.render.filepath = os.path.abspath(out)
scene.render.use_file_extension = False

world = bpy.data.worlds.new('preview')
world.color = (0.10, 0.14, 0.13)
scene.world = world

# Frame the figure from slightly above, at the distance an RTS camera sees it.
bpy.ops.object.camera_add(location=(0.0, -2.4, 1.15), rotation=(math.radians(80), 0, 0))
scene.camera = bpy.context.object
scene.camera.data.lens = 60

bpy.ops.object.light_add(type='SUN', location=(2, -3, 4))
bpy.context.object.data.energy = 4.0

bpy.ops.render.render(write_still=True)
print('PREVIEW_OK %s %s' % (os.path.abspath(out), os.path.getsize(scene.render.filepath)))
