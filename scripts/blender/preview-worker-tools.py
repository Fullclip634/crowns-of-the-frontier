"""Render the isolated authored worker-tool candidate for visual inspection."""
import bpy, json
from pathlib import Path
from mathutils import Vector
project=Path(__file__).resolve().parents[2];stage=project/'.tools/art-candidate/worker-tools'
bpy.ops.wm.open_mainfile(filepath=str(stage/'raw/frontier-assets.blend'))
keys=['unit:villager:wood','unit:villager:mine','unit:villager:build','unit:villager:food']
roots={obj['assetKey']:obj for obj in bpy.data.objects if obj.get('assetKey')}
def descendants(root):return [root]+[part for child in root.children for part in descendants(child)]
shown={obj for key in keys for obj in descendants(roots[key])}
for obj in bpy.data.objects:obj.hide_render=obj not in shown
for i,key in enumerate(keys):roots[key].location.x=(i-1.5)*2.35
scene=bpy.context.scene
try:scene.render.engine='BLENDER_WORKBENCH'
except TypeError as error:raise RuntimeError('Workbench rendering is required: '+str(error))
scene.display.shading.light='STUDIO';scene.display.shading.color_type='MATERIAL';scene.display.shading.show_shadows=True;scene.display.shading.show_cavity=True;scene.display.shading.cavity_type='BOTH';scene.display.shading.background_type='WORLD';scene.world.color=(.055,.075,.066)
bpy.ops.object.camera_add(location=(6,-13,7));camera=bpy.context.object;camera.rotation_euler=(Vector((0,0,1.35))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.type='ORTHO';camera.data.ortho_scale=10.8;scene.camera=camera;camera.hide_render=False
scene.render.resolution_x=1200;scene.render.resolution_y=620;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.render.filepath=str(stage/'worker-tools-authoring.png');bpy.ops.render.render(write_still=True)
print(json.dumps({'rendered':True,'path':scene.render.filepath,'models':keys,'savedSceneChanges':False}),flush=True)
