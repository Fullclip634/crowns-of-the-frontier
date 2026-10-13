"""Compose a full editable catalogue without rebaking unrelated game artwork."""
import bpy
import json
from pathlib import Path

project = Path(__file__).resolve().parents[2]
base = project / ".tools/art-refined/frontier-assets.blend"
patch = project / ".tools/art-candidate/resources/raw/frontier-assets.blend"
out = project / ".tools/art-candidate/full/raw"
validation = json.loads((project / ".tools/art-candidate/full/optimized/validation.json").read_text(encoding="utf-8"))
assert validation["passed"] and validation["models"] == 126
expected = {f"resource:{kind}:{variant}" for kind in ("food", "gold", "stone") for variant in range(4)}

def descendants(root):
    result = [root]
    for child in root.children:
        result.extend(descendants(child))
    return result

bpy.ops.wm.open_mainfile(filepath=str(base))
original = {obj["assetKey"]: obj for obj in bpy.data.objects if obj.get("assetKey")}
assert len(original) == 126 and expected <= original.keys()
unchanged = {key: [(obj.name, obj.type, obj.data.name if obj.data else None) for obj in descendants(root)]
             for key, root in original.items() if key not in expected}
with bpy.data.libraries.load(str(patch), link=False) as (source, target):
    target.objects = source.objects
loaded = [obj for obj in target.objects if obj]
replacement = {obj["assetKey"]: obj for obj in loaded if obj.get("assetKey") in expected}
assert set(replacement) == expected
retained = set()
for key, root in replacement.items():
    assert root.get("model3d", {}).get("resourceRevision") == "field-resources-v1"
    old = original[key]
    assert max(abs(root.matrix_world[r][c] - old.matrix_world[r][c]) for r in range(4) for c in range(4)) < 1e-6
    for obj in reversed(descendants(old)):
        mesh = obj.data if obj.type == "MESH" else None
        bpy.data.objects.remove(obj, do_unlink=True)
        if mesh and mesh.users == 0:
            bpy.data.meshes.remove(mesh)
    for obj in descendants(root):
        retained.add(obj)
        bpy.context.scene.collection.objects.link(obj)
for obj in loaded:
    if obj not in retained:
        bpy.data.objects.remove(obj, do_unlink=True)
roots = {obj["assetKey"]: obj for obj in bpy.data.objects if obj.get("assetKey")}
assert set(roots) == set(original)
for key, snapshot in unchanged.items():
    assert [(obj.name, obj.type, obj.data.name if obj.data else None) for obj in descendants(roots[key])] == snapshot
out.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(out / "frontier-assets.blend"), compress=True)
report = {"passed": True, "models": len(roots), "replacedResources": len(expected),
          "unrelatedModelsPreserved": len(unchanged), "resourceRevision": "field-resources-v1"}
(out / "editable-validation.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
print(json.dumps(report), flush=True)
