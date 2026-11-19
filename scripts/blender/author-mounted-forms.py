
"""Build rigid mounted forms for the existing cavalry rigs."""
import bpy
import math
from pathlib import Path

project = Path(__file__).resolve().parents[2]
out = project / ".tools" / "art-candidate" / "mounted-forms" / "raw"
out.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)

UNITS = ("scout", "knight", "outrider")
MATERIALS = {
    "horse": ("Coat", (.19, .095, .052), .82),
    "mane": ("Mane", (.043, .028, .021), .96),
    "leather": ("Bridle", (.074, .039, .019), .77),
    "hair": ("Eyes", (.028, .018, .013), .33),
}

def material(label, color, roughness):
    result = bpy.data.materials.new(label)
    result.diffuse_color = (*color, 1)
    result.use_nodes = True
    bsdf = result.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Roughness"].default_value = roughness
    return result

def loft(profiles, sides, buffers, center=0):
    """Wrap rings perpendicular to a curve written in game coordinates."""
    vertices, faces = buffers
    offset = len(vertices)
    for j, (y, z, width, height) in enumerate(profiles):
        start, end = profiles[max(0,j-1)], profiles[min(len(profiles)-1,j+1)]
        dy, dz = end[0]-start[0], end[1]-start[1]
        length = math.hypot(dy, dz)
        for side in range(sides):
            angle = math.tau*side/sides
            x = center + math.cos(angle)*width
            up = math.sin(angle)*height
            # Blender's z axis is up, whereas the game uses y.
            vertices.append((x, -(z-up*dy/length), y+up*dz/length))
    faces.append(tuple(offset+i for i in range(sides-1,-1,-1)))
    for row in range(len(profiles)-1):
        for i in range(sides):
            a, b = offset+row*sides+i, offset+row*sides+(i+1)%sides
            faces.append((a,b,b+sides,a+sides))
    faces.append(tuple(range(len(vertices)-sides, len(vertices))))

def mount(sides):
    pieces = {role: ([],[]) for role in MATERIALS}
    coat, mane, tack, eyes = (pieces[k] for k in ("horse","mane","leather","hair"))
    detail_sides = 4 if sides <= 6 else 6
    mane_sides = max(4, sides - 2) if sides > 6 else 5
    ear_sides = max(4, sides - 4) if sides > 6 else 4
    loft([(1.14,-.86,.11,.17),(1.17,-.74,.31,.33),(1.20,-.52,.40,.38),(1.20,-.18,.46,.41),
          (1.18,.18,.43,.40),(1.20,.45,.39,.36),(1.27,.65,.26,.25),(1.35,.72,.13,.16)], sides, coat)
    loft([(1.21,.39,.26,.25),(1.46,.48,.31,.27),(1.68,.56,.26,.25),
          (1.88,.68,.21,.23),(2.06,.81,.17,.18),(2.20,.87,.14,.12)], sides, coat)
    loft([(2.23,.76,.11,.11),(2.19,.89,.19,.18),(2.11,1.02,.20,.18),
          (2.02,1.15,.153,.13),(1.94,1.30,.136,.102),(1.91,1.39,.109,.07)], sides, coat)
    for side in (-1,1):
        loft([(2.23,.84,.064,.055),(2.37,.816,.051,.037),(2.44,.79,.025,.022),(2.48,.773,.008,.008)],
             ear_sides,coat,side*.132)
        loft([(2.155,1.012,.010,.011),(2.160,1.043,.026,.019),(2.155,1.067,.013,.009)],
             detail_sides,eyes,side*.173)
        loft([(1.927,1.335,.009,.013),(1.927,1.363,.024,.013),(1.921,1.378,.008,.006)],
             detail_sides,eyes,side*.089)
        loft([(2.23,.854,.017,.021),(2.15,.965,.027,.029),(2.045,1.11,.029,.020),(1.98,1.26,.024,.019)],
             detail_sides,tack,side*.158)
        loft([(1.96,1.24,.022,.022),(1.948,1.28,.026,.022),(1.944,1.306,.016,.014)],
             detail_sides,tack,side*.142)
    loft([(1.54,.37,.08,.041),(1.74,.43,.09,.07),(1.96,.55,.086,.09),(2.15,.67,.067,.09),(2.30,.77,.045,.067)],
         mane_sides,mane)
    loft([(1.28,-.76,.076,.086),(1.19,-.92,.089,.083),(1.01,-1.015,.077,.078),
          (.78,-1.091,.051,.059),(.59,-1.18,.018,.026)],mane_sides,mane)
    loft([(1.964,1.251,.151,.130),(1.947,1.29,.150,.122)],sides,tack)
    return pieces

def catalogue(detail, sides):
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    parts = {}
    for role, (vertices, faces) in mount(sides).items():
        label = MATERIALS[role][0]
        data = bpy.data.meshes.new(label)
        data.from_pydata(vertices, [], faces)
        data.update()
        data.materials.append(material(*MATERIALS[role]))
        color = data.color_attributes.new(name="Coat light", type="FLOAT_COLOR", domain="POINT")
        data.color_attributes.active_color = color
        for v in data.vertices:
            x, y, z = v.co
            tone = .87 + .10*min(1, max(0, (z-.75)/1.5)) + .018*math.sin(x*17+y*7)
            color.data[v.index].color = (tone,tone,tone,1)
        uv = data.uv_layers.new(name="UVMap")
        for loop in data.loops:
            x, y, z = data.vertices[loop.vertex_index].co
            uv.data[loop.index].uv = (x*.55+y*.3,z*.7)
        for polygon in data.polygons:
            polygon.use_smooth = len(polygon.vertices) == 4
        parts[role] = data
    for unit in UNITS:
        root = bpy.data.objects.new("asset__unit__"+unit,None)
        root["assetKey"] = "unit:"+unit
        bpy.context.collection.objects.link(root)
        for role, data in parts.items():
            obj = bpy.data.objects.new(root.name+"_Mounted"+MATERIALS[role][0],data)
            obj["assetMaterial"] = role
            obj["mountedForm"] = True
            bpy.context.collection.objects.link(obj)
            obj.parent = root
    bpy.ops.export_scene.gltf(filepath=str(out/(detail+".glb")),export_format="GLB",
                             export_extras=True,export_vertex_color="ACTIVE")
    if detail == "near":
        bpy.ops.wm.save_as_mainfile(filepath=str(out/"mounted-forms.blend"),compress=True)

for detail, sides in [("low", 6), ("near", 12)]:
    catalogue(detail,sides)
