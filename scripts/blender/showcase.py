"""Show the actual game catalogue in the running Blender window."""
import bpy
import math
import sys
from pathlib import Path

project = Path(__file__).resolve().parents[2]
low_preview = "--low-preview" in sys.argv
if low_preview:
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    bpy.ops.import_scene.gltf(filepath=str(project / ".tools/art-refined/frontier-low.glb"))
else:
    bpy.ops.wm.open_mainfile(filepath=str(project / ".tools/art-refined/frontier-assets.blend"))
roots = [obj for obj in bpy.data.objects if obj.get("assetKey")]
for obj in bpy.data.objects:
    for modifier in obj.modifiers:
        modifier.show_viewport=False
buildings = ["towncenter", "house", "mill", "camp", "mine", "barracks", "range", "stable", "workshop", "blacksmith", "market", "tower", "keep", "wall", "gate", "monastery", "wonder", "dock", "farm"]
units = ["villager", "spearman", "swordsman", "archer", "scout", "knight", "sentinel", "marksman", "outrider", "monk", "king", "ram", "catapult", "cart", "fishingboat", "galley", "warship", "transport"]
for root in roots:
    parts = root["assetKey"].split(":")
    if parts[0] == "building":
        faction = ["alder", "sun", "raven"].index(parts[2])
        column = buildings.index(parts[1])
        if parts[1] == "towncenter" and parts[3] != "3":
            root.hide_viewport = True
            root.hide_render = True
            continue
        root.location = ((column % 7) * 15, faction * 52 + (column // 7) * 16, 0)
    elif parts[0] == "unit":
        column = units.index(parts[1])
        root.location = ((column % 9) * 7, -18 - (column // 9) * 12, 0)
        if len(parts) > 2:
            column = ["wood", "mine", "food", "build"].index(parts[2])
            root.location = (column * 7, -42, 0)
    elif parts[0] == "tree":
        if parts[-1] == "far":
            root.hide_viewport = True
            root.hide_render = True
            continue
        biome = ["highlands", "winter", "desert"].index(parts[1])
        root.location = (112 + int(parts[2]) * 8, biome * 14, 0)
    else:
        column = ["food", "gold", "stone", "fish", "shrine"].index(parts[1])
        variant = int(parts[2]) if len(parts) > 2 else 0
        root.location = (112 + variant * 8, 50 + column * 12, 0)

bpy.ops.object.select_all(action="DESELECT")
focus = next(root for root in roots if root["assetKey"] == "building:towncenter:alder:3")
focus.select_set(True)
bpy.context.view_layer.objects.active = focus
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type != "VIEW_3D":
            continue
        space = area.spaces.active
        space.shading.type = "SOLID"
        space.shading.color_type = "MATERIAL"
        space.shading.light = "STUDIO"
        space.shading.show_shadows = True
        space.shading.show_cavity = True
        space.shading.cavity_type = "BOTH"
        space.shading.use_scene_world = False
        space.overlay.show_floor = False
        space.overlay.show_axis_x = False
        space.overlay.show_axis_y = False
        space.region_3d.view_distance = 95
        space.region_3d.view_location = (30, 7, 1)
        space.region_3d.view_rotation = (0.82, 0.42, 0.18, 0.34)
bpy.ops.wm.save_as_mainfile(filepath=str(project / ".tools/art-refined" / ("frontier-showcase-low.blend" if low_preview else "frontier-showcase.blend")), compress=True)
print("Opened the actual building, troop, tree and resource showcase in Blender.")
