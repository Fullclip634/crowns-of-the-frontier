"""Author original closed-solid worker tools without rebuilding their figures.

The export contains only replacement tools. The browser catalogue composer
retains the already released bodies, clothing, heads and unrelated models.
"""
import bpy, bmesh, math, json, hashlib, argparse, sys
from pathlib import Path
from mathutils import Vector
project=Path(__file__).resolve().parents[2]
parser=argparse.ArgumentParser();parser.add_argument('--source',default=str(project/'.tools/art-refined/frontier-assets.blend'))
args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
source=Path(args.source).resolve();assert source.is_relative_to(project) and source.is_file() and source.suffix=='.blend'
out=project/'.tools/art-candidate/worker-tools/raw';out.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(source))
roots={obj['assetKey']:obj for obj in bpy.data.objects if obj.get('assetKey')};assert len(roots)==126
keys=['unit:villager','unit:villager:wood','unit:villager:mine','unit:villager:build','unit:villager:food']
def descendants(root):return [root]+[part for child in root.children for part in descendants(child)]
def tool_part(obj):
    motion=obj.get('motion');return obj.type=='MESH' and obj.get('assetMaterial') in {'wood','steel','iron'} and motion and motion.get('type')=='forearm' and motion.get('side',0)>0
def fingerprint(root,skip_tools=False):
    values=[]
    for obj in descendants(root):
        if skip_tools and tool_part(obj):continue
        values.append((obj.name,tuple(v for row in obj.matrix_local for v in row),obj.get('assetMaterial')))
        if obj.type=='MESH':values.append(([tuple(v.co) for v in obj.data.vertices],[tuple(p.vertices) for p in obj.data.polygons]))
    return hashlib.sha256(repr(values).encode()).hexdigest()
unchanged={key:fingerprint(root) for key,root in roots.items() if key not in keys}
bodies={key:fingerprint(roots[key],True) for key in keys}
materials={p.get('assetMaterial'):p.data.materials[0] for root in roots.values() for p in descendants(root) if p.type=='MESH' and p.get('assetMaterial') and p.data.materials}
parts=[];root=None;motion=None;serial=0
def point(p):return Vector((p[0],-p[2],p[1]))
def mesh(role,vertices,faces,label):
    global serial
    if task=='wood' and role in {'steel','iron'}:
        # The cutting plane follows the forward chopping arc, rather than
        # presenting the axe's broad side to the trunk.
        vertices=[(.50-(v[2]-.115),v[1],.115+(v[0]-.50)) for v in vertices]
    serial+=1;data=bpy.data.meshes.new(label);data.from_pydata([point(v) for v in vertices],[],faces);data.update()
    obj=bpy.data.objects.new(root.name+'_'+label+'_'+str(serial),data);bpy.context.collection.objects.link(obj);obj.parent=root;obj['assetMaterial']=role;obj['motion']=motion;obj['workerToolPart']=label;data.materials.append(materials[role])
    uv=data.uv_layers.new(name='UVMap')
    for loop in data.loops:
        p=data.vertices[loop.vertex_index].co;uv.data[loop.index].uv=(p.x*2+p.y*.3,p.z*1.5)
    colors=data.color_attributes.new(name='BakedDepth',type='FLOAT_COLOR',domain='POINT');data.color_attributes.active_color=colors
    for v in data.vertices:
        p=v.co;shade=.9+.055*math.sin(p.x*12+p.y*8+p.z*9);colors.data[v.index].color=(shade,shade,shade,1)
    bm=bmesh.new();bm.from_mesh(data);assert all(e.is_manifold for e in bm.edges),obj.name;bm.free();parts.append(obj);return obj
def bar(role,a,b,r,label,taper=1,sides=10):
    a=Vector(a);b=Vector(b);direction=(b-a).normalized();u=direction.cross(Vector((0,1,0)))
    if u.length<.001:u=direction.cross(Vector((0,0,1)))
    u.normalize();v=direction.cross(u).normalized();verts=[]
    for center,scale in [(a,1),(b,taper)]:
        for i in range(sides):
            angle=i*math.tau/sides;verts.append(tuple(center+(u*math.cos(angle)+v*math.sin(angle))*r*scale))
    faces=[tuple(range(sides-1,-1,-1)),tuple(sides+i for i in range(sides))]
    for i in range(sides):j=(i+1)%sides;faces.append((i,j,sides+j,sides+i))
    return mesh(role,verts,faces,label)
def box(role,c,s,label):
    x,y,z=c;a,b,c=[n/2 for n in s];return mesh(role,[(x-a,y-b,z-c),(x+a,y-b,z-c),(x+a,y+b,z-c),(x-a,y+b,z-c),(x-a,y-b,z+c),(x+a,y-b,z+c),(x+a,y+b,z+c),(x-a,y+b,z+c)],[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],label)
def axe(x,y,z):
    # 1.28-unit hickory handle against a 2.7-unit adult, with a gentle belly.
    path=[(x+.018,y-.16,z),(x,y+.24,z),(x-.025,y+.67,z),(x-.018,y+1.12,z)]
    for a,b in zip(path,path[1:]):bar('wood',a,b,.034,'Hickory axe handle',taper=.96)
    box('iron',(x-.018,y+1.105,z),(.15,.19,.135),'Forged axe eye')
    box('iron',(x-.137,y+1.105,z),(.14,.14,.12),'Axe poll')
    # Forged blade narrows to a separate closed steel cutting bevel.
    mesh('iron',[(x+.035,y+1.035,z-.052),(x+.30,y+.95,z-.021),(x+.33,y+1.255,z-.021),(x+.035,y+1.185,z-.052),(x+.035,y+1.035,z+.052),(x+.30,y+.95,z+.021),(x+.33,y+1.255,z+.021),(x+.035,y+1.185,z+.052)],[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],'Forged axe blade')
    mesh('steel',[(x+.30,y+.95,z-.021),(x+.385,y+.925,z-.006),(x+.415,y+1.28,z-.006),(x+.33,y+1.255,z-.021),(x+.30,y+.95,z+.021),(x+.385,y+.925,z+.006),(x+.415,y+1.28,z+.006),(x+.33,y+1.255,z+.021)],[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],'Steel cutting bevel')
def pick(x,y,z):
    bar('wood',(x+.015,y-.14,z),(x-.012,y+1.06,z),.033,'Ash pick handle',taper=.93)
    box('iron',(x-.012,y+1.04,z),(.16,.16,.13),'Pick eye')
    for side in [-1,1]:
        a=(x-.012,y+1.04,z);b=(x+side*.23,y+1.025,z);c=(x+side*.49,y+.88,z)
        bar('iron',a,b,.055,'Curved pick shoulder',taper=.75)
        bar('steel',b,c,.041,'Forged pick point',taper=.1)
def hammer(x,y,z):
    bar('wood',(x,y-.12,z),(x,y+.61,z),.034,'Hammer handle',taper=.9)
    box('iron',(x,y+.61,z),(.31,.145,.14),'Hammer head')
    box('steel',(x-.19,y+.61,z),(.085,.16,.16),'Striking face')
    for side in [-1,1]:bar('steel',(x+.13,y+.61,z+side*.045),(x+.245,y+.53,z+side*.045),.026,'Claw',taper=.45,sides=8)
def sickle(x,y,z):
    bar('wood',(x,y-.12,z),(x,y+.42,z),.032,'Sickle grip',taper=.88)
    points=[(x+.22*math.cos(a),y+.50+.22*math.sin(a),z) for a in [i*math.pi/8 for i in range(9)]]
    for a,b in zip(points,points[1:]):bar('steel',a,b,.019,'Curved sickle blade',sides=8)
for key in keys:
    root=roots[key];assert root.matrix_local.is_identity
    old=[obj for obj in descendants(root)[1:] if tool_part(obj)];assert len(old)>=2,key
    motion=old[0]['motion'].to_dict()
    for obj in old:bpy.data.objects.remove(obj,do_unlink=True)
    task=key.split(':')[2] if len(key.split(':'))>2 else 'wood'
    {'wood':axe,'mine':pick,'build':hammer,'food':sickle}[task](.50,1.38,.115)
    model=root['model3d'].to_dict();model['toolRevision']='craft-tools-v1';root['model3d']=model
bpy.context.view_layer.update()
for key,digest in unchanged.items():assert fingerprint(roots[key])==digest,key
for key,digest in bodies.items():assert fingerprint(roots[key],True)==digest,key
for detail in ['low','near']:
    bpy.ops.object.select_all(action='DESELECT')
    for key in keys:roots[key].select_set(True)
    for obj in parts:obj.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(out/f'frontier-{detail}.glb'),export_format='GLB',use_selection=True,export_apply=True,export_vertex_color='ACTIVE',export_extras=True,export_animations=False,export_cameras=False,export_lights=False)
bpy.ops.wm.save_as_mainfile(filepath=str(out/'frontier-assets.blend'),compress=True)
report={'passed':True,'keys':keys,'unchangedOtherModels':121,'unchangedWorkerBodies':5,'solidToolParts':len(parts),'sourceSHA256':hashlib.sha256(source.read_bytes()).hexdigest(),'revision':'craft-tools-v1'}
(out/'authoring-validation.json').write_text(json.dumps(report,indent=2),encoding='utf-8');print(json.dumps(report),flush=True)
