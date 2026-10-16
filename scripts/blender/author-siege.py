"""Author solid timber siege engines in the editable 126-model catalogue.

Browser-space dimensions use Y-up/+Z-forward; this file converts to Blender.
Only the two siege roots change. Every structural component is a closed solid.
"""
import bpy, math, json, hashlib, argparse, sys
from pathlib import Path
from mathutils import Vector
project=Path(__file__).resolve().parents[2]
parser=argparse.ArgumentParser()
parser.add_argument('--source',default=str(project/'.tools/art-refined/frontier-assets.blend'))
args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
source=Path(args.source).resolve()
assert source.is_relative_to(project) and source.suffix=='.blend' and source.is_file()
out=project/'.tools/art-candidate/siege/raw';out.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(source))
roots={obj['assetKey']:obj for obj in bpy.data.objects if obj.get('assetKey')}
assert len(roots)==126
keys=['unit:ram','unit:catapult']
def descendants(root):return [root]+[part for child in root.children for part in descendants(child)]
def fingerprint(root):
    values=[]
    for obj in descendants(root):
        values.append((obj.name,tuple(value for row in obj.matrix_local for value in row),obj.get('assetMaterial')))
        if obj.type=='MESH':values.append(([tuple(v.co) for v in obj.data.vertices],[tuple(p.vertices) for p in obj.data.polygons]))
    return hashlib.sha256(repr(values).encode()).hexdigest()
unchanged={key:fingerprint(root) for key,root in roots.items() if key not in keys}
materials={p.get('assetMaterial'):p.data.materials[0] for root in roots.values() for p in descendants(root) if p.type=='MESH' and p.get('assetMaterial') and p.data.materials}
def point(p):return Vector((p[0],-p[2],p[1]))
parts=[];root=None;motion=None;serial=0
def finish(obj,role,label,near=False,bevel=0):
    global serial
    serial+=1;obj.name=f'{root.name}_{label}_{serial}';obj.parent=root
    obj['assetMaterial']=role;obj['siegePart']=label
    if near:obj['nearOnly']=True
    if motion:obj['motion']=motion
    obj.data.materials.clear();obj.data.materials.append(materials[role])
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    uv=obj.data.uv_layers.active or obj.data.uv_layers.new(name='UVMap')
    # Stable grain coordinates rather than stretched primitive UV islands.
    for loop in obj.data.loops:
        p=obj.matrix_local@obj.data.vertices[loop.vertex_index].co
        uv.data[loop.index].uv=(p.x*.7-p.y*.2,p.z*.35-p.y*.42)
    colors=obj.data.color_attributes.new(name='BakedDepth',type='FLOAT_COLOR',domain='POINT');obj.data.color_attributes.active_color=colors
    for v in obj.data.vertices:
        p=obj.matrix_local@v.co;shade=.88+.07*math.sin(p.x*7.3+p.y*3.4+p.z*4.1)
        colors.data[v.index].color=(shade,shade,shade,1)
    if bevel:
        mod=obj.modifiers.new('Crafted timber edges','BEVEL');mod.width=bevel;mod.segments=1;mod.limit_method='ANGLE'
    parts.append(obj);return obj
def box(role,c,size,label,near=False,bevel=0):
    bpy.ops.mesh.primitive_cube_add(size=1);obj=bpy.context.object;obj.location=point(c);obj.dimensions=(size[0],size[2],size[1]);return finish(obj,role,label,near,bevel)
def beam(role,a,b,width,depth,label,near=False,bevel=0):
    a=point(a);b=point(b);delta=b-a
    bpy.ops.mesh.primitive_cube_add(size=1);obj=bpy.context.object;obj.location=(a+b)*.5;obj.dimensions=(width,depth,delta.length);obj.rotation_mode='QUATERNION';obj.rotation_quaternion=delta.to_track_quat('Z','Y');return finish(obj,role,label,near,bevel)
def rod(role,a,b,radius,label,vertices=12,near=False):
    a=point(a);b=point(b);delta=b-a
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=radius,depth=delta.length);obj=bpy.context.object;obj.location=(a+b)*.5;obj.rotation_mode='QUATERNION';obj.rotation_quaternion=delta.to_track_quat('Z','Y');return finish(obj,role,label,near)
def ring(role,x,y,z,outer,inner,width,label,segments=16):
    verts=[]
    for xx,r in [(x-width/2,outer),(x+width/2,outer),(x-width/2,inner),(x+width/2,inner)]:
        for i in range(segments):
            angle=2*math.pi*i/segments;verts.append(point((xx,y+r*math.cos(angle),z+r*math.sin(angle))))
    faces=[]
    for i in range(segments):
        j=(i+1)%segments
        faces.extend([(i,j,segments+j,segments+i),(2*segments+j,2*segments+i,3*segments+i,3*segments+j),(j,i,2*segments+i,2*segments+j),(segments+i,segments+j,3*segments+j,3*segments+i)])
    mesh=bpy.data.meshes.new(label);mesh.from_pydata(verts,[],faces);mesh.update();obj=bpy.data.objects.new(label,mesh);bpy.context.collection.objects.link(obj);return finish(obj,role,label)
def wheels():
    global motion
    for x in [-1.08,1.08]:
        for z in [-.98,.98]:
            motion={'type':'wheel','pivot':[x,.55,z],'side':1}
            ring('iron',x,.55,z,.53,.485,.19,'Iron tyre')
            ring('wood',x,.55,z,.485,.37,.16,'Wooden felloe')
            for i in range(6):
                a=i*math.pi/3;beam('wood',(x,.55,z),(x,.55+math.cos(a)*.405,z+math.sin(a)*.405),.12,.075,'Wheel spoke')
            rod('darkwood',(x-.16,.55,z),(x+.16,.55,z),.14,'Wheel hub')
            rod('iron',(x-.18,.55,z),(x+.18,.55,z),.075,'Axle pin')
            motion=None
    for z in [-.98,.98]:rod('iron',(-1.18,.55,z),(1.18,.55,z),.075,'Axle')
def chassis():
    wheels()
    for x in [-.78,.78]:box('darkwood',(x,.74,0),(.22,.26,2.95),'Chassis rail',bevel=.018)
    for z in [-1.28,0,1.28]:box('wood',(0,.79,z),(1.86,.23,.22),'Cross member',bevel=.012)
    for x in [-.57,-.285,0,.285,.57]:box('wood',(x,.91,0),(.265,.10,2.58),'Deck plank')
def ram():
    global motion
    chassis()
    for x in [-.79,.79]:
        for z in [-1.15,1.15]:
            box('darkwood',(x,1.47,z),(.18,1.35,.20),'Canopy post',bevel=.012)
            beam('wood',(x,1.04,z*.55),(x,1.96,z),.12,.13,'Diagonal brace',bevel=.01)
            box('iron',(x,1.03,z),(.21,.15,.23),'Post shoe')
        box('darkwood',(x,2.08,0),(.20,.18,2.88),'Canopy rail',bevel=.014)
    # Each slope is made from eight individually thick, closed overlapping planks.
    for side in [-1,1]:
        for i in range(8):
            x=side*(i+.5)*.141;center=(x,2.73-abs(x)*.58,0)
            obj=box('wood',center,(.16,.11,3.12),'Protective roof plank')
            obj.rotation_euler.y=side*math.atan(.58)
        for z in [-1.22,0,1.22]:beam('iron',(0,2.79,z),(side*1.16,2.12,z),.055,.09,'Roof strap')
    box('darkwood',(0,2.77,0),(.13,.15,3.20),'Ridge cap',bevel=.012)
    for z in [-1.58,1.58]:
        for side in [-1,1]:beam('darkwood',(0,2.73,z),(side*1.16,2.06,z),.14,.13,'Gable fascia',bevel=.012)
    for z in [-.78,.78]:
        for x in [-.18,.18]:rod('iron',(x,2.06,z),(x,1.42,z),.025,'Suspension chain')
    motion={'type':'ram','pivot':[0,1.36,0],'side':1}
    rod('wood',(0,1.36,-1.57),(0,1.36,2.03),.245,'Ramming timber',vertices=16)
    for z in [-.80,.78,1.82]:rod('iron',(0,1.36,z-.055),(0,1.36,z+.055),.266,'Log binding',vertices=16)
    rod('iron',(0,1.36,1.95),(0,1.36,2.20),.29,'Forged ram head',vertices=16)
    box('steel',(0,1.36,2.21),(.43,.39,.085),'Striking face',bevel=.02)
    motion=None
    for side in [-1,1]:box('team',(side*.905,1.64,0),(.035,.27,.72),'Team plate')
def trebuchet():
    global motion
    chassis()
    for x in [-.64,.64]:
        for z in [-1.15,1.15]:
            beam('wood',(x,.96,z),(x,2.85,0),.23,.23,'A frame',bevel=.018)
            box('iron',(x,.99,z),(.28,.18,.30),'Frame shoe')
        box('darkwood',(x,1.30,0),(.17,.17,2.12),'Frame tie',bevel=.01)
        for z in [-1.24,1.24]:beam('darkwood',(x,.98,z),(x,1.8,z*.5),.12,.14,'Frame brace')
        box('iron',(x,2.80,0),(.29,.31,.30),'Axle bearing',bevel=.012)
    rod('iron',(-.91,2.8,0),(.91,2.8,0),.115,'Throwing axle',vertices=16)
    # A continuous beam actually passes through its pivot. The short arm carries
    # a fixed counterweight; the long arm carries two sling ropes and a solid pouch.
    motion={'type':'siege','pivot':[0,2.8,0],'side':1}
    beam('wood',(0,2.00,.89),(0,4.65,-2.05),.22,.25,'Throwing beam',bevel=.016)
    rod('iron',(-.24,2.8,0),(.24,2.8,0),.19,'Beam collar',vertices=16)
    box('wood',(0,1.95,1.02),(.89,.70,.79),'Counterweight box',bevel=.016)
    for x in [-.33,.33]:box('iron',(x,1.95,1.02),(.065,.735,.82),'Counterweight binding')
    box('darkwood',(0,2.32,1.02),(.94,.07,.84),'Counterweight lid')
    for x in [-.12,.12]:rod('canvas',(x,4.64,-2.05),(x,4.16,-2.64),.023,'Sling rope',vertices=8)
    pouch=box('leather',(0,4.13,-2.66),(.40,.15,.41),'Leather sling pouch',bevel=.04)
    motion=None
    rod('darkwood',(-.87,1.12,-1.05),(.87,1.12,-1.05),.115,'Windlass drum')
    for x in [-.93,.93]:
        beam('iron',(x,1.12,-1.05),(x,1.48,-1.05),.055,.06,'Windlass handle')
        rod('wood',(x-.09,1.48,-1.05),(x+.09,1.48,-1.05),.055,'Crank grip')
    # Solid ownership shield avoids a flat billboard and stays out of the arm arc.
    box('team',(.80,1.83,.30),(.10,.42,.52),'Team shield',bevel=.025)
reports=[]
for key in keys:
    root=roots[key];assert root.matrix_local.is_identity, 'Preserve the browser-space identity root'
    for obj in reversed(descendants(root)[1:]):bpy.data.objects.remove(obj,do_unlink=True)
    motion=None
    ram() if key=='unit:ram' else trebuchet()
    root['model3d']={'kind':'unit','type':key.split(':')[1],'articulated':True,'siegeRevision':'solid-timber-v1'}
bpy.context.view_layer.update()
for key,digest in unchanged.items():assert fingerprint(roots[key])==digest,key
for obj in parts:
    # All beam, plank, rim and mechanism pieces must have enclosing faces.
    import bmesh
    bm=bmesh.new();bm.from_mesh(obj.data);assert all(e.is_manifold for e in bm.edges),obj.name;bm.free()
for detail in ['low','near']:
    bpy.ops.object.select_all(action='DESELECT')
    for obj in parts:
        for mod in obj.modifiers:mod.show_viewport=mod.show_render=detail=='near'
    bpy.context.view_layer.update();depsgraph=bpy.context.evaluated_depsgraph_get();exported=[]
    for key in keys:
        root=roots[key];groups={}
        for obj in descendants(root)[1:]:
            group=(obj.get('assetMaterial'),json.dumps(obj['motion'].to_dict() if obj.get('motion') else None,sort_keys=True))
            groups.setdefault(group,[]).append(obj)
        for (role,definition),members in groups.items():
            bpy.ops.object.select_all(action='DESELECT');copies=[]
            for obj in members:
                mesh=bpy.data.meshes.new_from_object(obj.evaluated_get(depsgraph),preserve_all_data_layers=True,depsgraph=depsgraph)
                copy=bpy.data.objects.new('Siege '+role,mesh);bpy.context.collection.objects.link(copy);copy.matrix_world=obj.matrix_world.copy();copy.select_set(True);copies.append(copy)
            bpy.context.view_layer.objects.active=copies[0];bpy.ops.object.join();joined=copies[0]
            bpy.ops.object.transform_apply(location=True,rotation=True,scale=True);joined.parent=root;joined['assetMaterial']=role
            if definition!='null':joined['motion']=json.loads(definition)
            exported.append(joined)
    bpy.ops.object.select_all(action='DESELECT')
    for key in keys:roots[key].select_set(True)
    for obj in exported:obj.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(out/f'frontier-{detail}.glb'),export_format='GLB',use_selection=True,export_apply=True,export_vertex_color='ACTIVE',export_extras=True,export_animations=False,export_cameras=False,export_lights=False)
    for obj in exported:bpy.data.objects.remove(obj,do_unlink=True)
for obj in parts:
    for mod in obj.modifiers:mod.show_viewport=mod.show_render=True
bpy.ops.wm.save_as_mainfile(filepath=str(out/'frontier-assets.blend'),compress=True)
report={'passed':True,'models':126,'unchangedOtherModels':124,'closedSolidParts':len(parts),'keys':keys,'sourceSHA256':hashlib.sha256(source.read_bytes()).hexdigest()}
(out/'authoring-validation.json').write_text(json.dumps(report,indent=2),encoding='utf-8');print(json.dumps(report),flush=True)
