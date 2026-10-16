"""Move original mill rotors clear of gables and author solid axle mounts."""
import bpy, math, json, hashlib, argparse, sys
from pathlib import Path
from mathutils import Vector
project=Path(__file__).resolve().parents[2]
parser=argparse.ArgumentParser()
parser.add_argument('--source',default=str(project/'.tools/art-refined/frontier-assets.blend'))
args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
source=Path(args.source).resolve()
assert source.is_relative_to(project) and source.suffix=='.blend' and source.is_file()
out=project/'.tools/art-candidate/windmill-mounts/raw';out.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(source))
roots={obj['assetKey']:obj for obj in bpy.data.objects if obj.get('assetKey')}
assert len(roots)==126
keys={f'building:mill:{faction}:0' for faction in ['alder','sun','raven']}
def descendants(root):return [root]+[part for child in root.children for part in descendants(child)]
def fingerprint(root):
    data=[]
    for obj in descendants(root):
        data.append((obj.name,tuple(value for row in obj.matrix_local for value in row),obj.get('assetMaterial')))
        if obj.type=='MESH':data.append(([tuple(v.co) for v in obj.data.vertices],[tuple(p.vertices) for p in obj.data.polygons]))
    return hashlib.sha256(repr(data).encode()).hexdigest()
unchanged={key:fingerprint(root) for key,root in roots.items() if key not in keys}
patches=[];reports=[]
for key in sorted(keys):
    root=roots[key];rotors=[p for p in descendants(root) if p.get('windmill')];assert len(rotors)==1
    rotor=rotors[0]
    # Blender Z-up/-Y-forward becomes browser Y-up/+Z-forward.
    matrix=rotor.matrix_world.copy();matrix.translation=root.matrix_world@Vector((0,-2.65,5.7));rotor.matrix_world=matrix
    materials={p.get('assetMaterial'):p.data.materials[0] for p in descendants(root) if p.type=='MESH' and p.get('assetMaterial')}
    mounts=[p for p in descendants(root) if p.get('windmillMount')]
    if not mounts:
        for label,role,location,dimensions,radius,depth in [
            ('Bearing','wood',(0,-1.98,5.7),(.65,.36,.65),None,None),
            ('Axle','darkwood',(0,-2.10,5.7),None,.16,1.30),
            ('Hub','iron',(0,-2.75,5.7),None,.27,.18)]:
            if dimensions:
                bpy.ops.mesh.primitive_cube_add(size=1);obj=bpy.context.object;obj.dimensions=dimensions
            else:
                bpy.ops.mesh.primitive_cylinder_add(vertices=16,radius=radius,depth=depth,rotation=(math.pi/2,0,0));obj=bpy.context.object
            obj.location=location;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
            obj.name=f'{root.name}_Mill{label}';obj.parent=root;obj['assetMaterial']=role;obj['windmillMount']=True
            obj.data.materials.append(materials[role])
            color=obj.data.color_attributes.new(name='BakedDepth',type='FLOAT_COLOR',domain='POINT');obj.data.color_attributes.active_color=color
            for value in color.data:value.color=(.9,.9,.9,1)
            uv=obj.data.uv_layers.active or obj.data.uv_layers.new(name='UVMap')
            for loop in obj.data.loops:
                p=obj.data.vertices[loop.vertex_index].co;uv.data[loop.index].uv=(p.x*.25,p.z*.25+p.y*.1)
            bevel=obj.modifiers.new('Crafted edges','BEVEL');bevel.width=.014;bevel.segments=1;bevel.limit_method='ANGLE';mounts.append(obj)
    assert len(mounts)==3
    metadata=dict(root['model3d']);metadata['windmillRevision']='axle-clearance-v1';root['model3d']=metadata
    patch=bpy.data.objects.new('Mill axle patch '+key,None);bpy.context.collection.objects.link(patch)
    patch.matrix_world=root.matrix_world.copy();patch['assetKey']='windmill-mount:'+key.split(':')[2];patches.append((patch,root,mounts))
    reports.append({'key':key,'rotorCenterBrowser':[0,5.7,2.65],'solidMountMeshes':len(mounts)})
for key,digest in unchanged.items():assert fingerprint(roots[key])==digest
bpy.context.view_layer.update()
for patch,root,mounts in patches:
    for obj in mounts:
        matrix=obj.matrix_world.copy();obj.parent=patch;obj.matrix_world=matrix
for detail in ['low','near']:
    bpy.ops.object.select_all(action='DESELECT')
    for patch,root,mounts in patches:
        patch.select_set(True)
        for obj in mounts:
            obj.select_set(True)
            for mod in obj.modifiers:mod.show_viewport=mod.show_render=detail=='near'
    bpy.ops.export_scene.gltf(filepath=str(out/f'frontier-{detail}.glb'),export_format='GLB',use_selection=True,export_apply=True,export_vertex_color='ACTIVE',export_extras=True,export_animations=False,export_cameras=False,export_lights=False)
for patch,root,mounts in patches:
    for obj in mounts:
        matrix=obj.matrix_world.copy();obj.parent=root;obj.matrix_world=matrix
    bpy.data.objects.remove(patch,do_unlink=True)
bpy.ops.wm.save_as_mainfile(filepath=str(out/'frontier-assets.blend'),compress=True)
report={'passed':True,'models':126,'unchangedOtherModels':123,'mills':reports,'liveEditableChanged':False}
(out/'authoring-validation.json').write_text(json.dumps(report,indent=2),encoding='utf-8');print(json.dumps(report),flush=True)
