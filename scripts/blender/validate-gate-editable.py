"""Compare the current live editable source with the complete gate candidate."""
import bpy,json,hashlib
from pathlib import Path
project=Path(__file__).resolve().parents[2]
live=project/'.tools/art-refined/frontier-assets.blend'
candidate=project/'.tools/art-candidate/gate-footings/raw/frontier-assets.blend'
gates={f'building:gate:{faction}:0' for faction in ['alder','sun','raven']}
def plain(value):
    if hasattr(value,'to_dict'):return {key:plain(item) for key,item in value.to_dict().items()}
    if hasattr(value,'to_list'):return [plain(item) for item in value.to_list()]
    if isinstance(value,dict):return {key:plain(item) for key,item in value.items()}
    if isinstance(value,(list,tuple)):return [plain(item) for item in value]
    return value
def descendants(root):
    result=[root]
    for child in root.children:result.extend(descendants(child))
    return result
def snapshot(file):
    bpy.ops.wm.open_mainfile(filepath=str(file))
    roots={obj['assetKey']:obj for obj in bpy.data.objects if obj.get('assetKey')}
    assert len(roots)==126
    result={}
    for key,root in roots.items():
        digest=hashlib.sha256()
        for obj in descendants(root):
            digest.update(repr((obj.name,tuple(value for row in obj.matrix_local for value in row),obj.data.name if obj.data else None)).encode())
            digest.update(json.dumps(plain(dict(obj.items())),sort_keys=True).encode())
            if obj.type=='MESH':
                digest.update(repr([tuple(v.co) for v in obj.data.vertices]).encode())
                digest.update(repr([(tuple(face.vertices),face.material_index) for face in obj.data.polygons]).encode())
                digest.update(repr([material.name for material in obj.data.materials]).encode())
                for layer in obj.data.uv_layers:digest.update(repr((layer.name,[tuple(value.uv) for value in layer.data])).encode())
                for layer in obj.data.color_attributes:
                    values=[tuple(value.color) for value in layer.data]
                    digest.update(repr((layer.name,layer.domain,layer.data_type,values)).encode())
        result[key]=digest.hexdigest()
    return result
before=snapshot(live);after=snapshot(candidate)
assert before.keys()==after.keys()
unchanged=[key for key in before if key not in gates]
for key in unchanged:assert before[key]==after[key],f'Unrelated editable model changed: {key}'
report={'passed':True,'models':126,'unchangedOtherModels':len(unchanged),'liveSourceSHA256':hashlib.sha256(live.read_bytes()).hexdigest(),'candidateSHA256':hashlib.sha256(candidate.read_bytes()).hexdigest()}
(project/'artifacts/gate-editable-validation.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print(json.dumps(report),flush=True)
