"""Export un-beveled 3D roof _SlateTiles meshes from the editable Blender source.

Individual slate roof shingles are 4 cm thick, so the global 2.3 cm Crafted edges
bevel modifier overlapped itself (2 * 2.3 cm > 4.0 cm), tripling shingle triangles
and producing degenerate faces. Removing only that bevel keeps every sculpted 3D
shingle, vertex shading, UVs, and parent transforms intact while saving ~59K tris.
"""
import argparse
import bmesh
import bpy
import hashlib
import json
import sys
from pathlib import Path

project = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser()
parser.add_argument("--source", default=str(project / ".tools/art-refined/frontier-assets.blend"))
parser.add_argument("--output", default=str(project / ".tools/art-candidate/optimized-details/raw"))
args = parser.parse_args(sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else [])

source = Path(args.source).resolve()
assert source.is_relative_to(project) and source.suffix == ".blend" and source.is_file()
out = Path(args.output).resolve()
assert out.is_relative_to(project)
out.mkdir(parents=True, exist_ok=True)

before_hash = hashlib.sha256(source.read_bytes()).hexdigest()
bpy.ops.wm.open_mainfile(filepath=str(source))

roots = {obj["assetKey"]: obj for obj in bpy.data.objects if obj.get("assetKey")}
assert len(roots) == 126, f"Expected 126 asset roots, found {len(roots)}"

selected = []
keys = []
stats = []

for key, root in sorted(roots.items()):
    tiles = [child for child in root.children if child.type == "MESH" and child.name.endswith("_SlateTiles")]
    if not tiles:
        continue
    assert len(tiles) == 1, f"Expected 1 _SlateTiles mesh on {key}, found {len(tiles)}"
    obj = tiles[0]
    for mod in list(obj.modifiers):
        if mod.name == "Crafted edges":
            obj.modifiers.remove(mod)
    obj["skipCraftedBevel"] = True
    assert obj.get("nearOnly"), f"{obj.name} must stay nearOnly"
    assert obj.get("assetMaterial") == "teamRoof", f"{obj.name} must keep teamRoof material"

    bm = bmesh.new()
    bm.from_mesh(obj.data)
    non_manifold = [e for e in bm.edges if not e.is_manifold]
    assert not non_manifold, f"Non-manifold edges ({len(non_manifold)}) in {obj.name}"
    degen = [f for f in bm.faces if f.calc_area() < 1e-8]
    assert not degen, f"Degenerate faces ({len(degen)}) in {obj.name}"
    volume = bm.calc_volume(signed=True)
    assert volume > 0.001, f"Non-positive volume ({volume}) in {obj.name}"
    tris = sum(max(0, len(f.verts) - 2) for f in bm.faces)
    bm.free()

    keys.append(key)
    selected.extend([root, obj])
    stats.append({"key": key, "name": obj.name, "triangles": tris, "volume": round(volume, 4)})

assert len(keys) >= 30, f"Expected at least 30 slate-tile roofs, found {len(keys)}"

bpy.ops.object.select_all(action="DESELECT")
for obj in selected:
    obj.select_set(True)

bpy.ops.export_scene.gltf(
    filepath=str(out / "slate-tiles.glb"),
    export_format="GLB",
    use_selection=True,
    export_apply=True,
    export_vertex_color="ACTIVE",
    export_extras=True,
    export_animations=False,
    export_cameras=False,
    export_lights=False,
)

assert hashlib.sha256(source.read_bytes()).hexdigest() == before_hash, "Source .blend was modified"
report = {
    "passed": True,
    "models": len(keys),
    "keys": keys,
    "totalTriangles": sum(item["triangles"] for item in stats),
    "sourceSHA256": before_hash,
    "parts": stats,
}
(out / "slate-report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
print(json.dumps({"passed": True, "models": len(keys), "totalTriangles": report["totalTriangles"]}), flush=True)
