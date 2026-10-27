"""Author articulated horse limbs while leaving the released riders intact."""
import bpy, bmesh, hashlib, json, math
from pathlib import Path
from mathutils import Vector

project=Path(__file__).resolve().parents[2]
source=project/'.tools/art-refined/frontier-assets.blend'
out=project/'.tools/art-candidate/horse-legs/raw';out.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(source))
roots={obj['assetKey']:obj for obj in bpy.data.objects if obj.get('assetKey')}
keys=['unit:scout','unit:knight','unit:outrider']
assert len(roots)==126 and all(key in roots for key in keys)

def descendants(root):return [root]+[part for child in root.children for part in descendants(child)]
def old_leg(obj):
    motion=obj.get('motion');return obj.type=='MESH' and motion and motion.get('type')=='horseleg'
def fingerprint(root,skip_legs=False):
    values=[]
    for obj in descendants(root):
        if skip_legs and (old_leg(obj) or obj.get('horseLegPart')):continue
        values.append((obj.name,tuple(v for row in obj.matrix_local for v in row),obj.get('assetMaterial')))
        if obj.type=='MESH':values.append(([tuple(v.co) for v in obj.data.vertices],[tuple(p.vertices) for p in obj.data.polygons]))
    return hashlib.sha256(repr(values).encode()).hexdigest()
unchanged={key:fingerprint(root) for key,root in roots.items() if key not in keys}
bodies={key:fingerprint(roots[key],True) for key in keys}
materials={p.get('assetMaterial'):p.data.materials[0] for root in roots.values() for p in descendants(root) if p.type=='MESH' and p.get('assetMaterial') and p.data.materials}
parts=[]

def point(p):return Vector((p[0],-p[2],p[1]))
def mesh(root,role,motion,vertices,faces,label):
    data=bpy.data.meshes.new(label);data.from_pydata([point(v) for v in vertices],[],faces);data.update()
    obj=bpy.data.objects.new(root.name+'_'+label,data);bpy.context.collection.objects.link(obj);obj.parent=root
    obj['assetMaterial']=role;obj['motion']=motion;obj['horseLegPart']=label;data.materials.append(materials[role])
    uv=data.uv_layers.new(name='UVMap')
    for loop in data.loops:
        p=data.vertices[loop.vertex_index].co;uv.data[loop.index].uv=(p.x*2+p.y*.3,p.z*1.5)
    colors=data.color_attributes.new(name='BakedDepth',type='FLOAT_COLOR',domain='POINT');data.color_attributes.active_color=colors
    for v in data.vertices:
        p=v.co;shade=.91+.04*math.sin(p.x*9+p.y*7+p.z*8);colors.data[v.index].color=(shade,shade,shade,1)
    for face in data.polygons:face.use_smooth=True
    bm=bmesh.new();bm.from_mesh(data);assert all(e.is_manifold for e in bm.edges),obj.name;bm.free();parts.append(obj)

def limb(root,motion,start,end,profiles,label):
    a,b=Vector(start),Vector(end);direction=(b-a).normalized();u=direction.cross(Vector((0,0,1)))
    if u.length<.001:u=direction.cross(Vector((1,0,0)))
    u.normalize();v=direction.cross(u).normalized();sides=10;vertices=[]
    for t,r in profiles:
        center=a.lerp(b,t)
        for i in range(sides):
            angle=i*math.tau/sides;vertices.append(tuple(center+(u*math.cos(angle)+v*math.sin(angle))*r))
    faces=[tuple(range(sides-1,-1,-1)),tuple((len(profiles)-1)*sides+i for i in range(sides))]
    for row in range(len(profiles)-1):
        for i in range(sides):j=(i+1)%sides;faces.append((row*sides+i,row*sides+j,(row+1)*sides+j,(row+1)*sides+i))
    mesh(root,'horse',motion,vertices,faces,label)

def hoof(root,motion,x,z,label):
    # A slightly flared closed hoof with a flat, terrain-contacting sole.
    vertices=[]
    for y,width,front,back in [(0,.105,.12,-.12),(.18,.095,.105,-.105),(.25,.075,.075,-.075)]:
        vertices.extend([(x-width,y,z+back),(x+width,y,z+back),(x+width,y,z+front),(x-width,y,z+front)])
    faces=[(3,2,1,0),(8,9,10,11)]
    for row in range(2):
        for i in range(4):j=(i+1)%4;faces.append((row*4+i,row*4+j,(row+1)*4+j,(row+1)*4+i))
    mesh(root,'mane',motion,vertices,faces,label)

for key in keys:
    root=roots[key];assert root.matrix_local.is_identity
    old=[obj for obj in descendants(root)[1:] if old_leg(obj)];assert len(old)>=8,key
    for obj in old:bpy.data.objects.remove(obj,do_unlink=True)
    for index,(x,z) in enumerate((x,z) for x in [-.3,.3] for z in [-.58,.59]):
        side=(1 if x>0 else -1)*(1 if z>0 else -1)
        hip={'type':'horseleg','pivot':[x,1.18,z],'side':side,'legIndex':index}
        knee={'type':'horseknee','pivot':[x,.66,z+.04],'side':side,'legIndex':index,'parent':hip}
        ankle={'type':'horsehoof','pivot':[x,.20,z-.02],'side':side,'legIndex':index,'parent':knee}
        limb(root,hip,hip['pivot'],knee['pivot'],[(0,.115),(.25,.12),(.7,.10),(1,.085)],f'upper_{index}')
        limb(root,knee,knee['pivot'],ankle['pivot'],[(0,.085),(.25,.078),(.75,.062),(1,.065)],f'lower_{index}')
        hoof(root,ankle,x,z-.02,f'hoof_{index}')
    model=root['model3d'].to_dict();model['horseLegRevision']='articulated-hooves-v1';root['model3d']=model

bpy.context.view_layer.update()
for key,digest in unchanged.items():assert fingerprint(roots[key])==digest,key
for key,digest in bodies.items():assert fingerprint(roots[key],True)==digest,key
for detail in ['low','near']:
    bpy.ops.object.select_all(action='DESELECT')
    for key in keys:roots[key].select_set(True)
    for obj in parts:obj.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(out/f'frontier-{detail}.glb'),export_format='GLB',use_selection=True,export_apply=True,export_vertex_color='ACTIVE',export_extras=True,export_animations=False,export_cameras=False,export_lights=False)
bpy.ops.wm.save_as_mainfile(filepath=str(out/'frontier-assets.blend'),compress=True)
report={'passed':True,'keys':keys,'unchangedOtherModels':123,'unchangedBodies':3,'parts':len(parts),'sourceSHA256':hashlib.sha256(source.read_bytes()).hexdigest(),'revision':'articulated-hooves-v1'}
(out/'authoring-validation.json').write_text(json.dumps(report,indent=2),encoding='utf-8');print(json.dumps(report),flush=True)
