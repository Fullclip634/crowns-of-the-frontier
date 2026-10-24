"""Refine articulated figures without rebuilding their tools or the world.

Selected surface/joint parts are replaced; the export is only that small patch.
The complete editable scene keeps the unchanged source objects for inspection.
"""
import bpy, bmesh, math, json, hashlib, argparse, sys
from pathlib import Path
from mathutils import Vector

project=Path(__file__).resolve().parents[2]
parser=argparse.ArgumentParser();parser.add_argument('--source',default=str(project/'art/figures/figure-source.blend'))
args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
source=Path(args.source).resolve();assert source.is_relative_to(project) and source.is_file() and source.suffix=='.blend'
out=project/'.tools/art-candidate/figure-forms/raw';out.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(source))
roots={obj['assetKey']:obj for obj in bpy.data.objects if obj.get('assetKey')};assert len(roots)==15
humans={'villager','spearman','swordsman','archer','scout','knight','monk','king','sentinel','marksman','outrider'}
keys=[key for key in roots if key.startswith('unit:') and key.split(':')[1] in humans];assert len(keys)==15
def descendants(root):return [root]+[part for child in root.children for part in descendants(child)]
def plain(value):return value.to_dict() if hasattr(value,'to_dict') else value
def fingerprint(obj):
    data=[obj.name,tuple(v for row in obj.matrix_local for v in row),obj.get('assetMaterial'),plain(obj.get('motion'))]
    if obj.type=='MESH':data.extend([[tuple(v.co) for v in obj.data.vertices],[tuple(p.vertices) for p in obj.data.polygons]])
    return hashlib.sha256(repr(data).encode()).hexdigest()
def selected(obj,unit):
    role=obj.get('assetMaterial');motion=obj.get('motion');kind=motion.get('type') if motion else None
    return (kind=='head' and role in {'skin','hair'} or kind=='knee' and role=='leather' or kind=='forearm' and role=='skin' or
            role=='pants' and kind in {'torso','leg','knee'} or unit=='villager' and role=='canvas' and kind=='torso' or
            kind=='torso' and role==('steel' if unit in {'spearman','swordsman','knight','sentinel','king'} else 'team') or
            kind in {'arm','forearm'} and role=='team' and unit not in {'spearman','swordsman','knight','sentinel','king'})
untouched={obj.name:fingerprint(obj) for key,root in roots.items() for obj in descendants(root)[1:] if key not in keys or not selected(obj,key.split(':')[1])}
materials={p.get('assetMaterial'):p.data.materials[0] for root in roots.values() for p in descendants(root) if p.type=='MESH' and p.get('assetMaterial') and p.data.materials}
created=[];selectors={};preserved_components=[];root=None;motion=None;parts=[]
def append(vertices,faces,verts,polygons):
    offset=len(vertices);vertices.extend(verts);faces.extend(tuple(offset+i for i in face) for face in polygons)
def loft(vertices,faces,center,rings,sides=12,fold=0):
    verts=[]
    for height,width,front,back in rings:
        for i in range(sides):
            angle=math.tau*i/sides;wave=1+fold*math.sin(angle*7+height*3)
            verts.append((center[0]+math.sin(angle)*width*wave,center[1]+height,center[2]+math.cos(angle)*(front if math.cos(angle)>=0 else back)*wave))
    polys=[tuple(range(sides-1,-1,-1))]
    for row in range(len(rings)-1):
        for i in range(sides):j=(i+1)%sides;polys.append((row*sides+i,row*sides+j,(row+1)*sides+j,(row+1)*sides+i))
    polys.append(tuple((len(rings)-1)*sides+i for i in range(sides)));append(vertices,faces,verts,polys)
def limb(vertices,faces,a,b,rings,sides=10):
    a=Vector(a);b=Vector(b);d=(b-a).normalized();u=d.cross(Vector((0,1,0)))
    if u.length<.001:u=d.cross(Vector((0,0,1)))
    u.normalize();v=d.cross(u).normalized();verts=[]
    for t,radius in rings:
        for i in range(sides):angle=math.tau*i/sides;verts.append(tuple(a.lerp(b,t)+(u*math.cos(angle)+v*math.sin(angle))*radius))
    polys=[tuple(range(sides-1,-1,-1))]
    for row in range(len(rings)-1):
        for i in range(sides):j=(i+1)%sides;polys.append((row*sides+i,row*sides+j,(row+1)*sides+j,(row+1)*sides+i))
    polys.append(tuple((len(rings)-1)*sides+i for i in range(sides)));append(vertices,faces,verts,polys)

def drape(vertices,faces):
    # A closed, curved bib follows the chest and falls clear of the tunic hem.
    rows=[(1.17,.205,.239),(1.32,.204,.226),(1.47,.193,.216),(1.67,.184,.232),(1.84,.172,.216),(1.915,.163,.202)]
    columns=8;verts=[];faces_local=[];count=len(rows)*(columns+1)
    for layer in range(2):
        for row,(height,width,front) in enumerate(rows):
            for col in range(columns+1):
                t=col*2/columns-1;fold=math.sin(t*math.pi*3)*.003*(1-row/(len(rows)-1))
                verts.append((t*width,height+.006*t*t,front-.057*t*t+fold-layer*.009))
    for row in range(len(rows)-1):
        for col in range(columns):
            a=row*(columns+1)+col;b=a+1;c=b+columns+1;d=a+columns+1
            faces_local.extend([(a,b,c,d),(count+a,count+d,count+c,count+b)])
    boundary=list(range(columns+1))+[row*(columns+1)+columns for row in range(1,len(rows))]+[(len(rows)-1)*(columns+1)+col for col in range(columns-1,-1,-1)]+[row*(columns+1) for row in range(len(rows)-2,0,-1)]
    for index,a in enumerate(boundary):b=boundary[(index+1)%len(boundary)];faces_local.append((a,a+count,b+count,b))
    append(vertices,faces,verts,faces_local)

def preserve_apron_straps(obj):
    mesh=obj.data;adj={v.index:set() for v in mesh.vertices}
    for edge in mesh.edges:a,b=edge.vertices;adj[a].add(b);adj[b].add(a)
    unseen=set(adj);matches=[]
    while unseen:
        seed=unseen.pop();pending=[seed];members={seed}
        while pending:
            for index in adj[pending.pop()]:
                if index in unseen:unseen.remove(index);members.add(index);pending.append(index)
        points=[mesh.vertices[index].co for index in members];game=[(p.x,p.z,-p.y) for p in points]
        bounds=[min(p[i] for p in game) for i in range(3)]+[max(p[i] for p in game) for i in range(3)]
        expected=[-.185,1.325,.2055,.185,1.915,.2305]
        if len(members)==8 and all(abs(a-b)<1e-5 for a,b in zip(bounds,expected)):matches.append(members)
    assert len(matches)==1,(obj.name,'Identify exactly the old apron slab')
    removed=matches[0];keep=set(adj)-removed
    def signature(data,indices):
        vertices=sorted(tuple(data.vertices[i].co) for i in indices)
        faces=sorted(tuple(tuple(data.vertices[i].co) for i in p.vertices) for p in data.polygons if set(p.vertices)<=indices)
        return hashlib.sha256(repr([vertices,faces]).encode()).hexdigest()
    expected=signature(mesh,keep);retained=obj.copy();retained.data=mesh.copy();retained.name=root.name+'_Retained apron straps and pouch patch';bpy.context.collection.objects.link(retained)
    bm=bmesh.new();bm.from_mesh(retained.data);bm.verts.ensure_lookup_table();bmesh.ops.delete(bm,geom=[bm.verts[i] for i in removed],context='VERTS');bm.to_mesh(retained.data);bm.free();retained.data.update()
    assert signature(retained.data,set(range(len(retained.data.vertices))))==expected,'Retained canvas components must have identical coordinates and faces'
    retained['figurePart']='Unchanged apron straps and pouch patch';created.append(retained);parts.append(retained);preserved_components.append({'key':key,'vertices':len(keep),'sha256':expected})
def part(role,vertices,faces,label):
    data=bpy.data.meshes.new(label);data.from_pydata([(x,-z,y) for x,y,z in vertices],[],faces);data.update()
    bm=bmesh.new();bm.from_mesh(data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));assert all(e.is_manifold for e in bm.edges),label
    assert bm.calc_volume(signed=True)>0,label;bm.to_mesh(data);bm.free()
    obj=bpy.data.objects.new(root.name+'_'+label,data);bpy.context.collection.objects.link(obj);obj.parent=root;obj['assetMaterial']=role;obj['motion']=motion;obj['figurePart']=label;data.materials.append(materials[role])
    uv=data.uv_layers.new(name='UVMap')
    for loop in data.loops:p=data.vertices[loop.vertex_index].co;uv.data[loop.index].uv=(p.x*.25,p.z*.25+p.y*.1)
    colors=data.color_attributes.new(name='BakedDepth',type='FLOAT_COLOR',domain='POINT');data.color_attributes.active_color=colors
    for vertex in data.vertices:
        shade=.95
        if label.startswith('Boot') and vertex.co.z-offset<.08:shade=.67
        colors.data[vertex.index].color=(shade,shade,shade,1)
    for polygon in data.polygons:polygon.use_smooth=len(polygon.vertices)==4
    created.append(obj);parts.append(obj);return obj

for key in keys:
    root=roots[key];unit=key.split(':')[1];riding=unit in {'scout','knight','outrider'};offset=.78 if riding else 0
    targets=[obj for obj in descendants(root)[1:] if selected(obj,unit)]
    groups={}
    for obj in targets:
        role=obj['assetMaterial'];m=plain(obj['motion']);signature=(role,m['type'],m.get('side',0));groups.setdefault(signature,m)
        if unit=='villager' and role=='canvas' and m['type']=='torso':preserve_apron_straps(obj)
    selectors[key]=[{'role':role,'joint':kind,'side':side} for role,kind,side in groups]
    for obj in targets:bpy.data.objects.remove(obj,do_unlink=True)
    for (role,kind,side),motion in groups.items():
        verts=[];faces=[]
        if kind=='head' and role=='skin':
            limb(verts,faces,(0,1.99+offset,0),(0,2.18+offset,0),[(0,.079),(1,.083)],sides=10)
            loft(verts,faces,(0,2.32+offset,.008),[(-.17,.077,.086,.085),(-.12,.112,.108,.10),(-.045,.134,.12,.114),(.035,.14,.12,.12),(.115,.131,.11,.112),(.174,.092,.078,.082)],sides=16)
            for sign in [-1,1]:loft(verts,faces,(sign*.14,2.31+offset,-.007),[(-.04,.009,.015,.015),(-.025,.018,.024,.023),(.022,.019,.024,.023),(.043,.008,.013,.013)],sides=8)
            nose=[(-.019,2.37+offset,.124),(.019,2.37+offset,.124),(-.021,2.29+offset,.125),(.021,2.29+offset,.125),(-.012,2.315+offset,.151),(.012,2.315+offset,.151),(-.022,2.285+offset,.137),(.022,2.285+offset,.137)]
            append(verts,faces,nose,[(0,1,5,4),(0,4,6,2),(1,3,7,5),(2,6,7,3),(4,5,7,6),(0,2,3,1)])
            part(role,verts,faces,'Head with cheek jaw and nasal planes')
        elif kind=='head' and role=='hair':
            loft(verts,faces,(0,2.32+offset,-.005),[(.082,.143,.122,.125),(.135,.137,.116,.118),(.185,.105,.088,.095),(.205,.035,.03,.034)],sides=16)
            for sign in [-1,1]:
                loft(verts,faces,(sign*.055,2.355+offset,.129),[(-.007,.009,.003,.003),(.003,.012,.0035,.0035),(.009,.007,.002,.002)],sides=8)
                limb(verts,faces,(sign*.035,2.389+offset,.127),(sign*.085,2.383+offset,.126),[(0,.0035),(1,.003)],sides=6)
            limb(verts,faces,(-.023,2.25+offset,.129),(.023,2.25+offset,.129),[(0,.002),(1,.002)],sides=6)
            part(role,verts,faces,'Hairline inset eyes and facial creases')
        elif kind=='forearm' and role=='skin':
            hand=(side*.5,1.38+offset,.115)
            loft(verts,faces,hand,[(-.074,.025,.032,.03),(-.05,.045,.052,.044),(.025,.05,.053,.045),(.063,.037,.04,.036)],sides=10)
            loft(verts,faces,(hand[0]-side*.042,hand[1]-.008,hand[2]+.02),[(-.042,.012,.02,.016),(-.014,.023,.028,.023),(.021,.014,.02,.015)],sides=8)
            part(role,verts,faces,'Hand palm fingers and opposing thumb')
        elif kind=='knee' and role=='leather':
            x=side*(.52 if riding else .18)
            loft(verts,faces,(x,offset,.025),[(0,.087,.222,.098),(.045,.10,.235,.105),(.115,.101,.228,.10),(.17,.086,.15,.09),(.235,.066,.086,.075),(.29,.068,.079,.072),(.315,.073,.084,.077)],sides=12)
            part(role,verts,faces,'Boot shaped last heel sole and cuff')
        elif role=='pants':
            if kind=='torso':
                loft(verts,faces,(0,offset,0),[(1.05,.23,.145,.155),(1.13,.266,.175,.18),(1.24,.265,.175,.18),(1.32,.25,.16,.17)],sides=14)
                part(role,verts,faces,'Trousers shaped seat and waist')
            elif kind=='leg':
                knee=groups[('pants','knee',side)]['pivot'];limb(verts,faces,motion['pivot'],knee,[(0,.101),(.15,.12),(.53,.112),(.84,.091),(1,.089)],sides=12)
                part(role,verts,faces,'Trousers articulated thigh and knee')
            elif kind=='knee':
                ankle=(side*(.52 if riding else .18),.285+offset,.025);limb(verts,faces,motion['pivot'],ankle,[(0,.089),(.22,.103),(.56,.096),(.83,.075),(1,.063)],sides=12)
                part(role,verts,faces,'Trousers articulated calf and cuff')
            else:raise AssertionError((key,role,kind))
        elif role=='canvas' and kind=='torso':
            drape(verts,faces);part(role,verts,faces,'Apron curved bib waist and hanging cloth')
        elif kind=='torso':
            if role=='steel':
                rings=[(1.235,.245,.168,.16),(1.35,.267,.18,.168),(1.54,.29,.215,.18),(1.75,.33,.222,.186),(1.9,.305,.177,.16),(2.015,.145,.132,.128)]
                loft(verts,faces,(0,offset,0),rings,sides=14)
                limb(verts,faces,(0,1.42+offset,.223),(0,1.87+offset,.193),[(0,.01),(1,.011)],sides=6)
                part(role,verts,faces,'Cuirass curved breast waist and collar')
            else:
                rings=[(1.08,.315,.205,.195),(1.19,.310,.206,.194),(1.275,.294,.195,.184),(1.345,.266,.174,.166),(1.51,.279,.191,.18),(1.73,.321,.204,.185),(1.91,.309,.17,.157),(2.015,.147,.132,.13)]
                loft(verts,faces,(0,offset,0),rings,sides=14,fold=.012)
                part(role,verts,faces,'Tunic tailored shoulder waist and hem folds')
        elif kind in {'arm','forearm'} and role=='team':
            if kind=='arm':a=(side*.35,1.925+offset,0);b=(side*.46,1.63+offset,.035);rings=[(0,.099),(.2,.108),(.6,.093),(.88,.088),(1,.085)]
            else:a=(side*.46,1.63+offset,.035);b=(side*.5,1.38+offset,.115);rings=[(0,.082),(.22,.084),(.65,.069),(.88,.063),(.96,.07),(1,.064)]
            limb(verts,faces,a,b,rings,sides=10);part(role,verts,faces,'Sleeve shaped elbow and cuff')
        else:raise AssertionError((key,role,kind))
    data=plain(root['model3d']);data['figureRevision']='field-forms-v1';root['model3d']=data

bpy.context.view_layer.update()
for name,digest in untouched.items():assert name in bpy.data.objects and fingerprint(bpy.data.objects[name])==digest,name
low_limits={'Head':128,'Hairline':96,'Hand':48,'Boot':64,'Trousers':40,'Cuirass':100,'Tunic':96,'Sleeve':40,'Apron':96}
low_checks=[]
for detail in ['low','near']:
    temporary=[]
    if detail=='low':
        # Keep the detailed editable forms; evaluate a bounded mobile mesh only
        # for export. Tools and preserved straps never pass through decimation.
        for obj in created:
            label=obj.get('figurePart','');target=next((limit for prefix,limit in low_limits.items() if label.startswith(prefix)),None)
            if target is None:continue
            triangles=sum(len(p.vertices)-2 for p in obj.data.polygons)
            if triangles<=target:continue
            modifier=obj.modifiers.new(name='Mobile geometry budget',type='DECIMATE');modifier.ratio=target/triangles;modifier.use_collapse_triangulate=True;temporary.append((obj,modifier))
        bpy.context.view_layer.update()
        for obj,modifier in temporary:
            evaluated=obj.evaluated_get(bpy.context.evaluated_depsgraph_get());mesh=evaluated.to_mesh();bm=bmesh.new();bm.from_mesh(mesh)
            assert all(edge.is_manifold for edge in bm.edges),(obj.name,'Closed mobile figure surface')
            assert bm.calc_volume(signed=True)>0,(obj.name,'Outward mobile figure surface');bm.free()
            low_checks.append({'part':obj.name,'triangles':sum(len(p.vertices)-2 for p in mesh.polygons),'ratio':modifier.ratio});evaluated.to_mesh_clear()
    bpy.ops.object.select_all(action='DESELECT')
    for key in keys:roots[key].select_set(True)
    for obj in created:obj.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(out/f'frontier-{detail}.glb'),export_format='GLB',use_selection=True,export_apply=True,export_vertex_color='ACTIVE',export_extras=True,export_animations=False,export_cameras=False,export_lights=False)
    for obj,modifier in temporary:obj.modifiers.remove(modifier)
assert len(preserved_components)==5,'Retain the straps and pouch patch on every worker variant'
sys.path.insert(0,str(Path(__file__).resolve().parent))
from figure_study import finish_figure_study
finish_figure_study(project,roots)
bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(out/'frontier-assets.blend'),compress=True)
report={'passed':True,'revision':'field-forms-v1','sourceModels':len(roots),'keys':keys,'selectors':selectors,'unchangedSourceParts':len(untouched),'preservedCanvasComponents':preserved_components,'mobileGeometry':low_checks,'newParts':len(created),'sourceSHA256':hashlib.sha256(source.read_bytes()).hexdigest()}
(out/'authoring-validation.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');print(json.dumps(report),flush=True)
