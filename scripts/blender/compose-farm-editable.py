"""Compose the staged farm patch into a separate complete editable source."""
import bpy
import json
import argparse
import sys
from pathlib import Path
project=Path(__file__).resolve().parents[2]
folder=project/".tools/art-candidate/farms/full"
parser=argparse.ArgumentParser()
parser.add_argument("--source",default=str(project/".tools/art-refined/frontier-assets.blend"))
parser.add_argument("--output",default=str(folder/"frontier-assets.blend"))
args=parser.parse_args(sys.argv[sys.argv.index("--")+1:] if "--" in sys.argv else [])
source_file=Path(args.source).resolve()
output_file=Path(args.output).resolve()
assert source_file.is_relative_to(project) and output_file.is_relative_to(project)
assert source_file.suffix==".blend" and output_file.suffix==".blend"
output_file.parent.mkdir(parents=True,exist_ok=True)
expected={f"building:farm:{faction}:0" for faction in ["alder","sun","raven"]}
def descendants(root):
    result=[root]
    for child in root.children:
        result.extend(descendants(child))
    return result
bpy.ops.wm.open_mainfile(filepath=str(source_file))
original={obj["assetKey"]:obj for obj in bpy.data.objects if obj.get("assetKey")}
assert len(original)==126 and expected<=original.keys()
unchanged={key:[(obj.name,obj.type,obj.data.name if obj.data else None) for obj in descendants(root)] for key,root in original.items() if key not in expected}
with bpy.data.libraries.load(str(project/".tools/art-candidate/farms/raw/frontier-farms.blend"),link=False) as (source,target):
    target.objects=source.objects
loaded=[obj for obj in target.objects if obj]
replacements={obj["assetKey"]:obj for obj in loaded if obj.get("assetKey") in expected}
assert set(replacements)==expected
retained=set()
for key,root in replacements.items():
    assert root.get("model3d",{}).get("artRevision")=="field-crops-v1"
    old=original[key]
    assert max(abs(root.matrix_world[r][c]-old.matrix_world[r][c]) for r in range(4) for c in range(4))<1e-6
    for obj in reversed(descendants(old)):
        mesh=obj.data if obj.type=="MESH" else None
        bpy.data.objects.remove(obj,do_unlink=True)
        if mesh and mesh.users==0:
            bpy.data.meshes.remove(mesh)
    for obj in descendants(root):
        retained.add(obj)
        bpy.context.scene.collection.objects.link(obj)
for obj in loaded:
    if obj not in retained:
        bpy.data.objects.remove(obj,do_unlink=True)
roots={obj["assetKey"]:obj for obj in bpy.data.objects if obj.get("assetKey")}
assert set(roots)==set(original)
for key,previous in unchanged.items():
    assert [(obj.name,obj.type,obj.data.name if obj.data else None) for obj in descendants(roots[key])]==previous
bpy.ops.wm.save_as_mainfile(filepath=str(output_file),compress=True)
report={"passed":True,"models":126,"replacedFarms":3,"unrelatedModelsPreserved":len(unchanged),"liveEditableChanged":output_file==project/".tools/art-refined/frontier-assets.blend"}
(output_file.parent/"editable-validation.json").write_text(json.dumps(report,indent=2),encoding="utf-8")
print(json.dumps(report),flush=True)
