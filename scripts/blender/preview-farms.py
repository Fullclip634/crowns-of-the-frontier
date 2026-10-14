"""Render the isolated original farm candidate with CPU Cycles."""
import bpy
import math
from pathlib import Path
from mathutils import Vector
project=Path(__file__).resolve().parents[2]
folder=project/".tools/art-candidate/farms/raw"
bpy.ops.wm.open_mainfile(filepath=str(folder/"frontier-farms.blend"))
roots=sorted([obj for obj in bpy.data.objects if obj.get("assetKey")],key=lambda obj:obj["assetKey"])
for index,root in enumerate(roots):
    root.location.x=(index-1)*6.9
world=bpy.data.worlds.new("Farm preview daylight")
world.use_nodes=True
world.node_tree.nodes["Background"].inputs["Color"].default_value=(.48,.62,.75,1)
world.node_tree.nodes["Background"].inputs["Strength"].default_value=.5
bpy.context.scene.world=world
bpy.ops.mesh.primitive_plane_add(size=40,location=(0,0,-.13))
floor=bpy.context.object
material=bpy.data.materials.new("Preview ground")
material.diffuse_color=(.15,.22,.10,1)
floor.data.materials.append(material)
for location,energy,size in [((-5,-8,12),1800,8),((7,4,8),700,6)]:
    bpy.ops.object.light_add(type="AREA",location=location)
    light=bpy.context.object
    light.data.energy=energy
    light.data.shape="DISK"
    light.data.size=size
    light.rotation_euler=(Vector((0,0,.4))-light.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=(7,-17,17))
camera=bpy.context.object
camera.rotation_euler=(Vector((0,0,.45))-camera.location).to_track_quat('-Z','Y').to_euler()
camera.data.type="ORTHO"
camera.data.ortho_scale=24
scene=bpy.context.scene
scene.camera=camera
scene.render.engine="CYCLES"
scene.cycles.device="CPU"
scene.cycles.samples=16
scene.cycles.use_denoising=False
scene.render.threads_mode="FIXED"
scene.render.threads=1
scene.render.resolution_x=1100
scene.render.resolution_y=540
scene.render.resolution_percentage=100
scene.render.image_settings.file_format="PNG"
scene.render.filepath=str(project/"artifacts/farm-candidate-blender.png")
bpy.ops.render.render(write_still=True)
print("Original farm candidate preview rendered",flush=True)
