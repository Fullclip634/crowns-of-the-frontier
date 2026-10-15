"""Render the separate original gate candidate; never save preview transforms."""
import bpy
from pathlib import Path
from mathutils import Vector
project=Path(__file__).resolve().parents[2]
bpy.ops.wm.open_mainfile(filepath=str(project/'.tools/art-candidate/gate-footings/raw/frontier-assets.blend'))
roots=sorted([obj for obj in bpy.data.objects if str(obj.get('assetKey','')).startswith('building:gate:')],key=lambda obj:obj['assetKey'])
assert len(roots)==3
def descendants(root):
    result=[root]
    for child in root.children:result.extend(descendants(child))
    return result
retained={obj for root in roots for obj in descendants(root)}
for obj in bpy.data.objects:obj.hide_render=obj not in retained
for index,root in enumerate(roots):
    root.location.x=(index-1)*7.2
    if index==1:
        for obj in descendants(root):
            if obj.get('gate'):
                for part in descendants(obj):part.hide_render=True
world=bpy.data.worlds.new('Gate preview daylight');world.use_nodes=True
world.node_tree.nodes['Background'].inputs['Color'].default_value=(.48,.62,.75,1)
world.node_tree.nodes['Background'].inputs['Strength'].default_value=.5
bpy.context.scene.world=world
bpy.ops.mesh.primitive_plane_add(size=48,location=(0,0,-.18))
floor=bpy.context.object;material=bpy.data.materials.new('Preview soil');material.diffuse_color=(.16,.23,.11,1);floor.data.materials.append(material)
for location,energy,size in [((-5,-8,14),2200,8),((8,4,10),900,7)]:
    bpy.ops.object.light_add(type='AREA',location=location);light=bpy.context.object;light.data.energy=energy;light.data.shape='DISK';light.data.size=size;light.rotation_euler=(Vector((0,0,2))-light.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=(7,-24,15));camera=bpy.context.object
camera.rotation_euler=(Vector((0,0,2))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.type='ORTHO';camera.data.ortho_scale=26
scene=bpy.context.scene;scene.camera=camera;scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=16;scene.cycles.use_denoising=False
scene.render.threads_mode='FIXED';scene.render.threads=1;scene.render.resolution_x=1100;scene.render.resolution_y=540;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.filepath=str(project/'artifacts/gate-candidate-blender.png')
bpy.ops.render.render(write_still=True)
print('Original gate candidate preview rendered; editable source not changed',flush=True)
