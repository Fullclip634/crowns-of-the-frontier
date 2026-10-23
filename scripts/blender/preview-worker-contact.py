"""Show the measured candidate chopping pose against the actual authored trunk."""
import bpy,json
from pathlib import Path
from mathutils import Vector,Matrix
project=Path(__file__).resolve().parents[2];stage=project/'.tools/art-candidate/worker-tools';data=json.loads((project/'artifacts/worker-contact-study.json').read_text(encoding='utf-8'))
bpy.ops.wm.open_mainfile(filepath=str(stage/'raw/frontier-assets.blend'))
roots={obj['assetKey']:obj for obj in bpy.data.objects if obj.get('assetKey')}
def descendants(root):return [root]+[part for child in root.children for part in descendants(child)]
worker=roots['unit:villager:wood'];tree=roots[data['tree']['key']];shown=set(descendants(worker)+descendants(tree))
for obj in bpy.data.objects:obj.hide_render=obj not in shown
tree.location=Vector((0,-data['tree']['position'][2],0))
convert=Matrix(((1,0,0,0),(0,0,-1,0),(0,1,0,0),(0,0,0,1)))
for obj in descendants(worker)[1:]:
    motion=obj.get('motion')
    if not motion:continue
    role=obj.get('assetMaterial');kind=motion.get('type');side=motion.get('side')
    if kind=='forearm' and side>0 and role in {'wood','steel','iron'}:kind='workerTool'
    row=next(p for p in data['poses'] if p['type']==kind and p['side']==side)
    elements=row['matrix'];matrix=Matrix(tuple(tuple(elements[c*4+r] for c in range(4)) for r in range(4)));obj.matrix_local=convert@matrix@convert.inverted()@obj.matrix_local
scene=bpy.context.scene
try:scene.render.engine='BLENDER_WORKBENCH'
except TypeError as error:raise RuntimeError(str(error))
scene.display.shading.light='STUDIO';scene.display.shading.color_type='MATERIAL';scene.display.shading.show_shadows=True;scene.display.shading.show_cavity=True;scene.display.shading.cavity_type='BOTH';scene.display.shading.background_type='WORLD';scene.world.color=(.055,.075,.066)
bpy.ops.object.camera_add(location=(5,5,4));camera=bpy.context.object;camera.rotation_euler=(Vector((0,-.9,1.4))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.type='ORTHO';camera.data.ortho_scale=3.7;scene.camera=camera;camera.hide_render=False
scene.render.resolution_x=1000;scene.render.resolution_y=800;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG'
for label,position in [('back',(5,5,4)),('front',(4,-5,3.6))]:
    camera.location=Vector(position);camera.rotation_euler=(Vector((0,-.9,1.4))-camera.location).to_track_quat('-Z','Y').to_euler();scene.render.filepath=str(stage/f'worker-contact-study-{label}.png');bpy.ops.render.render(write_still=True)
bpy.ops.wm.save_as_mainfile(filepath=str(stage/'worker-contact-study.blend'),compress=True)
print(json.dumps({'rendered':True,'candidateOnly':True,'path':scene.render.filepath}),flush=True)
