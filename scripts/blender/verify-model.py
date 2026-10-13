"""Small original animated tree to check the Blender-to-Three.js export path.

The MCP verification helper supplies output_dir. This asset stays in .tools and
is not added to the live game's asset catalogue.
"""

import bpy
import math

scene = bpy.context.scene
collection = bpy.data.collections.get("ConnectorCheck")
if collection:
    for obj in list(collection.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
else:
    collection = bpy.data.collections.new("ConnectorCheck")
    scene.collection.children.link(collection)

previous_selection = list(bpy.context.selected_objects)
previous_active = bpy.context.view_layer.objects.active
bpy.ops.object.select_all(action="DESELECT")

def move_to_collection(obj):
    for existing in list(obj.users_collection):
        existing.objects.unlink(obj)
    collection.objects.link(obj)

def material(name, color):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1.0)
    mat.use_nodes = True
    principled = mat.node_tree.nodes.get("Principled BSDF")
    principled.inputs["Base Color"].default_value = (*color, 1.0)
    principled.inputs["Roughness"].default_value = 0.85
    return mat

bark = material("ConnectorCheck_Bark", (0.24, 0.11, 0.045))
leaves = material("ConnectorCheck_Leaves", (0.16, 0.38, 0.08))
root = bpy.data.objects.new("ConnectorCheck_Tree", None)
collection.objects.link(root)
bpy.ops.mesh.primitive_cone_add(vertices=10, radius1=0.22, radius2=0.1, depth=2.6, location=(0, 0, 1.3))
trunk = bpy.context.object
trunk.name = "ConnectorCheck_Trunk"
move_to_collection(trunk)
trunk.parent = root
trunk.data.materials.append(bark)

pivot = bpy.data.objects.new("ConnectorCheck_CanopyPivot", None)
collection.objects.link(pivot)
pivot.parent = root
pivot.location = (0, 0, 2.1)
for index, (location, scale) in enumerate([
    ((0, 0, 0.5), (1.05, 0.92, 1.1)),
    ((-0.65, 0.12, 0.1), (0.72, 0.68, 0.65)),
    ((0.62, -0.18, 0.15), (0.7, 0.65, 0.75)),
]):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=1)
    crown = bpy.context.object
    crown.name = f"ConnectorCheck_Crown{index}"
    move_to_collection(crown)
    crown.parent = pivot
    crown.location = location
    crown.scale = scale
    crown.data.materials.append(leaves)

scene.render.fps = 24
scene.frame_start = 1
scene.frame_end = 49
for frame, angle in [(1, 0), (13, 0.045), (25, 0), (37, -0.045), (49, 0)]:
    pivot.rotation_euler.y = angle
    pivot.keyframe_insert(data_path="rotation_euler", frame=frame)
pivot.animation_data.action.name = "CanopyWind"
scene.frame_set(1)

for obj in collection.objects:
    obj.select_set(True)
bpy.context.view_layer.objects.active = trunk
bpy.ops.export_scene.gltf(
    filepath=output_dir + "/connector-check.glb",
    export_format="GLB",
    use_selection=True,
    export_animations=True,
    export_force_sampling=True,
)
bpy.ops.wm.save_as_mainfile(filepath=output_dir + "/connector-check.blend")
print("Created and exported the animated connector-check tree.")

bpy.ops.object.select_all(action="DESELECT")
for obj in previous_selection:
    if obj.name in bpy.data.objects:
        obj.select_set(True)
if previous_active and previous_active.name in bpy.data.objects:
    bpy.context.view_layer.objects.active = previous_active
