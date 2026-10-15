"""Author sparse, closed leaf tips from the original editable tree models."""
import argparse, bpy, bmesh, hashlib, json, sys
from pathlib import Path
project=Path(__file__).resolve().parents[2]
parser=argparse.ArgumentParser()
parser.add_argument('--source',default=str(project/'.tools/art-refined/frontier-assets.blend'))
args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
source=Path(args.source).resolve()
assert source.is_relative_to(project) and source.suffix=='.blend' and source.is_file()
before=hashlib.sha256(source.read_bytes()).hexdigest()
folder=project/'.tools/art-candidate/balanced-foliage/raw';folder.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(source))
roots={obj['assetKey']:obj for obj in bpy.data.objects if obj.get('assetKey')}
assert len(roots)==126
keys={f'tree:{biome}:{variant}:near' for biome in ['highlands','desert'] for variant in range(4)}
retained=set();reports=[]
for key in sorted(keys):
    root=roots[key];retained.add(root)
    tips=[obj for obj in root.children_recursive if obj.type=='MESH' and obj.get('foliageDetail')=='closed leaf tips']
    assert len(tips)==2
    for obj in tips:
        retained.add(obj)
        bm=bmesh.new();bm.from_mesh(obj.data);bm.verts.ensure_lookup_table()
        unseen=set(bm.verts);components=[]
        while unseen:
            start=min(unseen,key=lambda v:v.index);pending=[start];component={start};unseen.remove(start)
            while pending:
                vertex=pending.pop()
                for edge in vertex.link_edges:
                    other=edge.other_vert(vertex)
                    if other in unseen:unseen.remove(other);component.add(other);pending.append(other)
            assert len(component)==6 and len({face for v in component for face in v.link_faces})==8
            components.append(component)
        assert len(components)==512
        # The original Fibonacci distribution is retained around every crown.
        # Preserve complete leaves rather than decimating them into flat cards.
        chosen={i for i in range(len(components)) if i%8 in [0,3,5]}
        for axis in range(3):
            chosen.add(min(range(len(components)),key=lambda i:min(v.co[axis] for v in components[i])))
            chosen.add(max(range(len(components)),key=lambda i:max(v.co[axis] for v in components[i])))
        remove=[v for i,component in enumerate(components) if i not in chosen for v in component]
        bmesh.ops.delete(bm,geom=remove,context='VERTS')
        assert all(edge.is_manifold for edge in bm.edges)
        volume=bm.calc_volume(signed=True);assert volume>0
        bm.normal_update();bm.to_mesh(obj.data);bm.free();obj.data.update()
        obj['balancedFoliage']='volumetric-tips-v1';obj['balancedLeafCount']=len(chosen)
        root['balancedFoliage']='volumetric-tips-v1'
        reports.append({'key':key,'role':obj.get('assetMaterial'),'originalLeaves':512,'retainedLeaves':len(chosen),'triangles':len(obj.data.polygons),'closedVolume':volume,'watertight':True})
bpy.ops.object.select_all(action='DESELECT')
for obj in retained:obj.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(folder/'frontier-foliage.glb'),export_format='GLB',use_selection=True,export_apply=True,export_vertex_color='ACTIVE',export_extras=True,export_animations=False,export_cameras=False,export_lights=False)
# Save a small independent editable leaf patch. The complete original source
# remains the authority for architecture, troops, canopies and future exports.
for obj in list(bpy.data.objects):
    if obj not in retained:bpy.data.objects.remove(obj,do_unlink=True)
bpy.data.orphans_purge(do_recursive=True)
bpy.ops.wm.save_as_mainfile(filepath=str(folder/'frontier-foliage.blend'),compress=True)
assert hashlib.sha256(source.read_bytes()).hexdigest()==before
report={'passed':True,'models':8,'sourceSHA256':before,'sourceUnchanged':True,'revision':'volumetric-tips-v1','parts':reports}
(folder/'authoring-validation.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print(json.dumps({'passed':True,'models':8,'leafParts':len(reports),'retainedLeaves':sum(r['retainedLeaves'] for r in reports),'sourceUnchanged':True}),flush=True)
