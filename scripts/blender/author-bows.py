"""Author original closed short/long bows, strings and arrows for released figures.

Only the replacement equipment is exported. The catalogue composer retains
the current character meshes and every unrelated model verbatim.
"""
import bpy, bmesh, math, json, argparse, sys
from pathlib import Path
from mathutils import Vector
project=Path(__file__).resolve().parents[2]
parser=argparse.ArgumentParser();parser.add_argument('--source',default=str(project/'.tools/art-refined/frontier-assets.blend'))
args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
source=Path(args.source).resolve();assert source.is_relative_to(project) and source.is_file()
out=project/'.tools/art-candidate/bows/raw';out.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(source))
roots={o['assetKey']:o for o in bpy.data.objects if o.get('assetKey')};assert len(roots)==126
def descendants(o):return [o]+[p for c in o.children for p in descendants(c)]
materials={p.get('assetMaterial'):p.data.materials[0] for r in roots.values() for p in descendants(r) if p.type=='MESH' and p.get('assetMaterial') and p.data.materials}
grip=(-.49321,1.37445,.118967);parts=[];serial=0
arm={'type':'arm','pivot':[-.35,1.925,0],'side':-1,'parent':{'type':'torso','pivot':[0,1.28,0],'side':1}}
forearm={'type':'forearm','pivot':[-.46,1.63,.035],'side':-1,'parent':arm}
def mesh(role,verts,faces,part,label,extra=None):
    global serial
    serial+=1;data=bpy.data.meshes.new(label);data.from_pydata([(p[0],-p[2],p[1]) for p in verts],[],faces);data.update()
    obj=bpy.data.objects.new(root.name+'_Bow_'+label+'_'+str(serial),data);bpy.context.collection.objects.link(obj);obj.parent=root;obj['assetMaterial']=role
    motion={'type':'bow','part':part,'pivot':grip,'span':span,'side':-1,'parent':forearm}
    if extra:motion.update(extra)
    obj['motion']=motion;data.materials.append(materials[role]);uv=data.uv_layers.new(name='UVMap')
    for loop in data.loops:
        p=data.vertices[loop.vertex_index].co;uv.data[loop.index].uv=(p.x*2+p.y*.3,p.z*1.5)
    colors=data.color_attributes.new(name='BakedDepth',type='FLOAT_COLOR',domain='POINT');data.color_attributes.active_color=colors
    for v in data.vertices:
        shade=.94+.04*math.sin(v.co.z*23+v.co.y*17);colors.data[v.index].color=(shade,shade,shade,1)
    bm=bmesh.new();bm.from_mesh(data);assert all(e.is_manifold for e in bm.edges),label;bm.free();parts.append(obj);return obj
def bar(role,a,b,r,part,label,extra=None,sides=8):
    a=Vector(a);b=Vector(b);direction=(b-a).normalized();u=direction.cross(Vector((0,1,0)))
    if u.length<.001:u=direction.cross(Vector((0,0,1)))
    u.normalize();v=direction.cross(u).normalized();verts=[]
    for center in [a,b]:
        for i in range(sides):angle=i*math.tau/sides;verts.append(tuple(center+(u*math.cos(angle)+v*math.sin(angle))*r))
    faces=[tuple(range(sides-1,-1,-1)),tuple(sides+i for i in range(sides))]
    for i in range(sides):j=(i+1)%sides;faces.append((i,j,sides+j,sides+i))
    return mesh(role,verts,faces,part,label,extra)
def limb(side):
    verts=[];steps=8;sides=8
    for i in range(steps+1):
        t=i/steps;cy=grip[1]+side*span*t;cz=grip[2]-.2*t*t;width=.035*(1-.65*t);depth=.023*(1-.45*t)
        for j in range(sides):angle=j*math.tau/sides;verts.append((grip[0]+width*math.cos(angle),cy,cz+depth*math.sin(angle)))
    faces=[tuple(range(sides-1,-1,-1)),tuple(steps*sides+j for j in range(sides))]
    for i in range(steps):
        for j in range(sides):k=(j+1)%sides;faces.append((i*sides+j,i*sides+k,(i+1)*sides+k,(i+1)*sides+j))
    mesh('wood',verts,faces,'upper' if side>0 else 'lower','Tapered_yew_limb')
for key in ['unit:archer','unit:marksman']:
    root=roots[key];assert root.matrix_local.is_identity;span=.9 if key.endswith('marksman') else .72
    limb(1);limb(-1);bar('leather',(grip[0],grip[1]-.095,grip[2]),(grip[0],grip[1]+.095,grip[2]),.040,'grip','Bound_leather_grip')
    nock=(grip[0]+.035,grip[1],grip[2]-.22)
    for side in [-1,1]:
        tip=(grip[0],grip[1]+side*span,grip[2]-.2);part='stringUpper' if side>0 else 'stringLower';bar('canvas',tip,nock,.0065,part,'Linen_bowstring',{'a':tip,'b':nock},sides=6)
    center=(nock[0],nock[1],nock[2]+.425)
    bar('wood',nock,(nock[0],nock[1],nock[2]+.85),.012,'arrow','Arrow_shaft',sides=6)
    bar('steel',(center[0],center[1],center[2]+.40),(center[0],center[1],center[2]+.57),.035,'arrow','Arrow_head',sides=4)
    # Two crossed closed vanes retain volume from any camera direction.
    for axis in [0,1]:
        a=[center[0],center[1],center[2]-.34];b=list(a);a[axis]-=.055;b[axis]+=.055;bar('canvas',a,b,.022,'arrow','Arrow_fletching',sides=4)
bpy.ops.object.select_all(action='DESELECT')
for key in ['unit:archer','unit:marksman']:roots[key].select_set(True)
for obj in parts:obj.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(out/'bows.glb'),export_format='GLB',use_selection=True,export_apply=True,export_vertex_color='ACTIVE',export_extras=True,export_animations=False,export_cameras=False,export_lights=False)
bpy.ops.wm.save_as_mainfile(filepath=str(out/'bows.blend'),compress=True)
report={'passed':True,'keys':['unit:archer','unit:marksman'],'solidParts':len(parts),'revision':'drawn-bows-v1'}
(out/'authoring-validation.json').write_text(json.dumps(report,indent=2),encoding='utf-8');print(json.dumps(report),flush=True)
