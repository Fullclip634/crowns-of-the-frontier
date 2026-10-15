"""Replace only original gate pads with two solid, passage-safe side footings."""
import bpy,bmesh,json,hashlib,argparse,sys
from pathlib import Path
project=Path(__file__).resolve().parents[2]
folder=project/'.tools/art-candidate/gate-footings/raw'
folder.mkdir(parents=True,exist_ok=True)
parser=argparse.ArgumentParser()
parser.add_argument('--source',default=str(project/'.tools/art-refined/frontier-assets.blend'))
args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
source=Path(args.source).resolve()
assert source.is_relative_to(project) and source.suffix=='.blend' and source.is_file()
bpy.ops.wm.open_mainfile(filepath=str(source))
roots={obj['assetKey']:obj for obj in bpy.data.objects if obj.get('assetKey')}
assert len(roots)==126
keys={f'building:gate:{faction}:0' for faction in ['alder','sun','raven']}
def descendants(root):
    result=[root]
    for child in root.children:result.extend(descendants(child))
    return result
def fingerprint(root):
    data=[]
    for obj in descendants(root):
        data.append((obj.name,tuple(value for row in obj.matrix_local for value in row),obj.data.name if obj.data else None))
        if obj.type=='MESH':data.append(([(tuple(v.co)) for v in obj.data.vertices],[tuple(face.vertices) for face in obj.data.polygons]))
    return hashlib.sha256(repr(data).encode()).hexdigest()
unchanged={key:fingerprint(root) for key,root in roots.items() if key not in keys}
reports=[]
for key in sorted(keys):
    root=roots[key]
    metadata=dict(root['model3d'])
    existing=[obj for obj in descendants(root) if obj.get('gateFooting')]
    if existing:
        assert metadata.get('artRevision')=='gate-footings-v1' and len(existing)==2
        upper_count=sum(sum((obj.matrix_world@v.co).z>.21 for v in obj.data.vertices) for obj in descendants(root) if obj.type=='MESH' and obj.get('assetMaterial')=='stoneDark' and not obj.get('gateFooting'))
    else:
        candidates=[obj for obj in descendants(root) if obj.type=='MESH' and obj.get('assetMaterial')=='stoneDark' and min((obj.matrix_world@v.co).z for v in obj.data.vertices)<-.3]
        assert len(candidates)==1
        obj=candidates[0];before_upper=sorted(tuple(round(value,6) for value in obj.matrix_world@v.co) for v in obj.data.vertices if (obj.matrix_world@v.co).z>.21)
        bm=bmesh.new();bm.from_mesh(obj.data);bottom=[v for v in bm.verts if (obj.matrix_world@v.co).z<-.3];selected=set(bottom);pending=list(bottom)
        while pending:
            vertex=pending.pop()
            for edge in vertex.link_edges:
                other=edge.other_vert(vertex)
                if other not in selected:selected.add(other);pending.append(other)
        assert max((obj.matrix_world@v.co).z for v in selected)<.21,'Only the original separate plinth may be removed'
        assert len(selected)==8,'The welded source plinth must be a single box'
        bmesh.ops.delete(bm,geom=list(selected),context='VERTS');bm.to_mesh(obj.data);bm.free();obj.data.update()
        after_upper=sorted(tuple(round(value,6) for value in obj.matrix_world@v.co) for v in obj.data.vertices if (obj.matrix_world@v.co).z>.21)
        assert before_upper==after_upper,'The gate towers and arch must stay unchanged'
        upper_count=len(before_upper)
        # Two closed side boxes leave the original 2.5m arch opening clear.
        for side in [-1,1]:
            bpy.ops.mesh.primitive_cube_add(size=1,location=(side*2.025,0,-.14))
            footing=bpy.context.object;footing.name=f'Gate footing {key} {side}'
            footing.dimensions=(1.55,4.625,.65)
            bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
            footing.parent=root;footing['assetMaterial']='stoneDark';footing['gateFooting']=True
            footing.data.materials.append(obj.data.materials[0])
            color=footing.data.color_attributes.new(name='Color',type='FLOAT_COLOR',domain='POINT')
            for value in color.data:value.color=(.84,.84,.84,1)
            bevel=footing.modifiers.new('Crafted edges','BEVEL');bevel.width=.023;bevel.segments=1;bevel.limit_method='ANGLE'
    poles=[obj for obj in descendants(root) if obj.type=='MESH' and obj.get('assetMaterial')=='darkwood']
    assert len(poles)==1
    pole=poles[0];inverse=pole.matrix_world.inverted()
    # Mount the banner on the lintel instead of running its pole through the
    # entrance. Preserve its top, thickness and closed cylindrical topology.
    for vertex in pole.data.vertices:
        point=pole.matrix_world@vertex.co
        if point.z<3.65:point.z=3.65;vertex.co=inverse@point
    pole.data.update()
    metadata.update(artRevision='gate-footings-v1',gateBannerMounted=True,gateHousingHeight=3.5);root['model3d']=metadata
    reports.append({'key':key,'originalPadRemoved':True,'unchangedUpperVertices':upper_count,'passageWidth':2.5,'solidSideFootings':2,'bannerPoleMinimumHeight':min((pole.matrix_world@v.co).z for v in pole.data.vertices),'existingFootingsReused':bool(existing)})
for key,digest in unchanged.items():assert fingerprint(roots[key])==digest
def export(name,near):
    bpy.ops.object.select_all(action='DESELECT')
    for key in keys:
        for obj in descendants(roots[key]):
            obj.select_set(near or not obj.get('nearOnly'))
            if obj.type=='MESH':
                for modifier in obj.modifiers:
                    if modifier.type=='BEVEL':modifier.show_viewport=modifier.show_render=near
    bpy.ops.export_scene.gltf(filepath=str(folder/name),export_format='GLB',use_selection=True,export_apply=True,export_vertex_color='ACTIVE',export_extras=True,export_animations=False,export_cameras=False,export_lights=False)
export('frontier-low.glb',False)
export('frontier-near.glb',True)
bpy.ops.wm.save_as_mainfile(filepath=str(folder/'frontier-assets.blend'),compress=True)
report={'passed':True,'models':126,'unchangedOtherModels':123,'gates':reports,'liveEditableChanged':False}
(folder/'authoring-validation.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print(json.dumps(report),flush=True)
