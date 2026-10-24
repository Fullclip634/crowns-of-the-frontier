"""Original periodic character materials, baked for the shared troop palette.

The editable library and candidate exports stay outside the released catalogue.
No figure geometry, motion pivots or unrelated world assets are regenerated.
"""
import bpy, math, json, hashlib, numpy as np
from pathlib import Path

project=Path(__file__).resolve().parents[2]
out=project/'.tools/art-candidate/character-surfaces'
out.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=1
scene.render.bake.margin=0;scene.render.bake.use_clear=True
core=224;pad=16;cell=core+pad*2;size=cell*2
color_pixels=np.ones((size,size,4),dtype=np.float32)
normal_pixels=np.ones((size,size,4),dtype=np.float32);normal_pixels[:,:,:3]=(.5,.5,1)
checks=[]

def material(role,frequency,roughness,relief):
    mat=bpy.data.materials.new('Fieldcraft / '+role);mat.use_nodes=True
    nodes=mat.node_tree.nodes;nodes.clear();links=mat.node_tree.links
    def node(kind,label):
        value=nodes.new(kind);value.label=label;value.name=label;return value
    def math_node(operation,a,b=None,label=''):
        n=node('ShaderNodeMath',label or operation);n.operation=operation
        for index,value in enumerate([a,b]):
            if value is None:continue
            if isinstance(value,(int,float)):n.inputs[index].default_value=value
            else:links.new(value,n.inputs[index])
        return n.outputs[0]
    uv=node('ShaderNodeTexCoord','Tile coordinates');separate=node('ShaderNodeSeparateXYZ','UV axes');links.new(uv.outputs['UV'],separate.inputs[0])
    # A four-dimensional torus is continuous at every tile boundary.
    u=math_node('MULTIPLY',separate.outputs['X'],math.tau)
    v=math_node('MULTIPLY',separate.outputs['Y'],math.tau)
    coordinates=node('ShaderNodeCombineXYZ','Periodic noise position')
    for socket,value in zip(coordinates.inputs,[math_node('MULTIPLY',math_node('COSINE',u),frequency[0]),math_node('MULTIPLY',math_node('SINE',u),frequency[0]),math_node('MULTIPLY',math_node('COSINE',v),frequency[1])]):links.new(value,socket)
    noise=node('ShaderNodeTexNoise','Periodic grain');noise.noise_dimensions='4D';noise.inputs['Scale'].default_value=1;noise.inputs['Detail'].default_value=3;noise.inputs['Roughness'].default_value=.65
    links.new(coordinates.outputs[0],noise.inputs['Vector']);links.new(math_node('MULTIPLY',math_node('SINE',v),frequency[1]),noise.inputs['W'])
    grain=noise.outputs['Fac'];height=grain
    if role=='cloth':
        warp=math_node('SINE',math_node('MULTIPLY',separate.outputs['X'],math.tau*36))
        weft=math_node('SINE',math_node('MULTIPLY',separate.outputs['Y'],math.tau*36))
        weave=math_node('MULTIPLY',warp,weft)
        height=math_node('ADD',math_node('MULTIPLY',weave,.22),math_node('MULTIPLY',grain,.4),'Crossed woven threads')
    elif role=='metal':
        strokes=math_node('SINE',math_node('MULTIPLY',separate.outputs['X'],math.tau*54))
        height=math_node('ADD',math_node('MULTIPLY',strokes,.08),math_node('MULTIPLY',grain,.8),'Fine forged grain')
    elif role=='leather':
        height=math_node('POWER',grain,2.2,'Compressed leather pores')
    shade=math_node('ADD',math_node('MULTIPLY',height,.22 if role=='leather' else .12),.80 if role=='leather' else .88,'Neutral color variation')
    rough=math_node('ADD',math_node('MULTIPLY',grain,.18),roughness-.09,'Roughness variation')
    bump=node('ShaderNodeBump','Physical micro relief');bump.inputs['Distance'].default_value=relief;bump.inputs['Strength'].default_value=1;links.new(height,bump.inputs['Height'])
    bsdf=node('ShaderNodeBsdfPrincipled','Export material');links.new(shade,bsdf.inputs['Base Color']);links.new(rough,bsdf.inputs['Roughness']);links.new(bump.outputs['Normal'],bsdf.inputs['Normal']);bsdf.inputs['Metallic'].default_value=1 if role=='metal' else 0
    if role=='cloth':bsdf.inputs['Sheen Weight'].default_value=.15
    if role=='skin':bsdf.inputs['Subsurface Weight'].default_value=.05
    output=node('ShaderNodeOutputMaterial','Material output');links.new(bsdf.outputs[0],output.inputs['Surface'])
    target=node('ShaderNodeTexImage','Bake destination');emission=node('ShaderNodeEmission','Data export')
    for index,n in enumerate(nodes):n.location=((index%6)*210,-(index//6)*210)
    return mat,bsdf,output,target,emission,shade,rough

def bake(mat,bsdf,output,target,emission,source,kind):
    image=bpy.data.images.new(mat.name+' / '+kind,width=core,height=core,alpha=True,float_buffer=False)
    image.colorspace_settings.name='Non-Color' if kind!='color' else 'sRGB'
    target.image=image;mat.node_tree.nodes.active=target
    links=mat.node_tree.links
    if kind=='normal':links.new(bsdf.outputs[0],output.inputs['Surface'])
    else:links.new(source,emission.inputs['Color']);links.new(emission.outputs[0],output.inputs['Surface'])
    bpy.ops.object.bake(type='NORMAL' if kind=='normal' else 'EMIT',normal_space='TANGENT',normal_r='POS_X',normal_g='POS_Y',normal_b='POS_Z')
    pixels=np.empty(core*core*4,dtype=np.float32);image.pixels.foreach_get(pixels);pixels=pixels.reshape(core,core,4)
    links.new(bsdf.outputs[0],output.inputs['Surface']);image.pack()
    return pixels

definitions=[('cloth',(2.5,2.5),.91,.006),('leather',(6,6),.70,.010),('metal',(1,14),.36,.002),('skin',(9,9),.59,.0015)]
for index,(role,frequency,roughness,relief) in enumerate(definitions):
    bpy.ops.mesh.primitive_plane_add(size=1);plane=bpy.context.object;plane.name='Bake / '+role
    mat,bsdf,output,target,emission,shade,rough=material(role,frequency,roughness,relief);plane.data.materials.append(mat)
    color=bake(mat,bsdf,output,target,emission,shade,'color')
    normal=bake(mat,bsdf,output,target,emission,None,'normal')
    rough_pixels=bake(mat,bsdf,output,target,emission,rough,'roughness');normal[:,:,3]=rough_pixels[:,:,0]
    y=(index//2)*cell;x=(index%2)*cell
    color_pixels[y:y+cell,x:x+cell]=np.pad(color,((pad,pad),(pad,pad),(0,0)),mode='wrap')
    normal_pixels[y:y+cell,x:x+cell]=np.pad(normal,((pad,pad),(pad,pad),(0,0)),mode='wrap')
    vectors=normal[:,:,:3]*2-1;lengths=np.linalg.norm(vectors,axis=2)
    assert np.isfinite(color).all() and np.isfinite(normal).all()
    assert lengths.min()>.96 and lengths.max()<1.04
    assert float(normal[:,:,3].min())>.15 and float(normal[:,:,3].max())<1
    checks.append({'role':role,'tile':index,'normalLength':[float(lengths.min()),float(lengths.max())],'colorRange':[float(color[:,:,:3].min()),float(color[:,:,:3].max())],'roughnessRange':[float(normal[:,:,3].min()),float(normal[:,:,3].max())]})
    plane.location=(index*1.3,0,0);plane.hide_render=True;plane.select_set(False)
    # Keep real 3D material studies beside the editable node library.
    bpy.ops.mesh.primitive_uv_sphere_add(segments=48,ring_count=24,radius=.5,location=(index*1.3,1,0));study=bpy.context.object;study.name='Study / '+role;study.data.materials.append(mat)
    for polygon in study.data.polygons:polygon.use_smooth=True
    study.select_set(False)

files={}
for name,pixels,color_space in [('character-color',color_pixels,'sRGB'),('character-normal-roughness',normal_pixels,'Non-Color')]:
    image=bpy.data.images.new(name,width=size,height=size,alpha=True,float_buffer=False);image.colorspace_settings.name=color_space;image.pixels.foreach_set(pixels.reshape(-1));image.filepath_raw=str(out/(name+'.png'));image.file_format='PNG';image.save();image.pack()
    file=out/(name+'.png');files[name]={'file':file.name,'bytes':file.stat().st_size,'sha256':hashlib.sha256(file.read_bytes()).hexdigest()}
bpy.ops.wm.save_as_mainfile(filepath=str(out/'character-materials.blend'),compress=True)
manifest={'revision':'field-surfaces-v1','authoring':'Blender '+bpy.app.version_string,'license':'Original project artwork','width':size,'height':size,'core':core,'padding':pad,'columns':2,'rows':2,'roles':checks,'files':files,'normalConvention':'OpenGL tangent +Y; roughness in alpha','baked':True}
(out/'character-surfaces.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'passed':True,'directory':str(out),'files':files,'roles':checks}),flush=True)
