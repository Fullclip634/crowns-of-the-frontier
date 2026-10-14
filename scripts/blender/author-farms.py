"""Author original solid crop fields as a separate three-model Blender patch.

The live/full editable catalogue is never overwritten by this staged job.
"""
import bpy
import math
import json
import random
from pathlib import Path
from mathutils import Vector

project = Path(__file__).resolve().parents[2]
out = project / ".tools/art-candidate/farms/raw"
out.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)

colors = {"soil": (.32, .24, .15, 1), "furrow": (.20, .15, .09, 1),
          "grain": (.68, .52, .22, 1), "leaf": (.24, .39, .12, 1),
          "wood": (.30, .20, .12, 1), "darkwood": (.17, .12, .08, 1),
          "team": (.10, .38, .48, 1)}
materials = {}
for role, color in colors.items():
    material = bpy.data.materials.new(role)
    material.diffuse_color = color
    material.use_nodes = True
    shader = material.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = color
    shader.inputs["Roughness"].default_value = .92
    materials[role] = material

def bucket(data, role, near=False):
    return data.setdefault((role, near), {"vertices": [], "faces": [], "colors": []})

def primitive(data, role, vertices, faces, near=False, shade=1):
    target = bucket(data, role, near)
    offset = len(target["vertices"])
    target["vertices"].extend(vertices)
    target["faces"].extend(tuple(offset + i for i in face) for face in faces)
    target["colors"].extend([(shade, shade, shade, 1)] * len(vertices))

def box(data, role, center, size, near=False, shade=1):
    x, y, z = center
    a, b, c = (value / 2 for value in size)
    vertices = [(x+dx*a, y+dy*b, z+dz*c) for dx,dy,dz in
                [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),
                 (-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]]
    primitive(data, role, vertices, [(0,3,2,1),(4,5,6,7),(0,1,5,4),
              (1,2,6,5),(2,3,7,6),(3,0,4,7)], near, shade)

def rod(data, role, start, end, radius, sides=6, near=False, shade=1):
    a, b = Vector(start), Vector(end)
    direction = (b-a).normalized()
    u = direction.cross(Vector((0,0,1)))
    if u.length < .001:
        u = direction.cross(Vector((0,1,0)))
    u.normalize()
    v = direction.cross(u).normalized()
    vertices = []
    for point in [a, b]:
        for i in range(sides):
            angle = i * math.tau / sides
            vertices.append(tuple(point + radius*(u*math.cos(angle)+v*math.sin(angle))))
    faces = [tuple(reversed(range(sides))), tuple(range(sides, sides*2))]
    faces += [(i,(i+1)%sides,(i+1)%sides+sides,i+sides) for i in range(sides)]
    primitive(data, role, vertices, faces, near, shade)

def seed_head(data, center, height, width, near=False, shade=1):
    x, y, z = center
    sides = 4 if near else 6
    vertices = []
    for at, radius in [(0, .2),(.18, .82),(.66,1),(.9,.55),(1,.02)]:
        for i in range(sides):
            angle = math.tau * i / sides
            vertices.append((x+math.cos(angle)*width*radius,
                             y+math.sin(angle)*width*radius, z+height*at))
    faces = [tuple(reversed(range(sides))),tuple(range(4*sides,5*sides))]
    for row in range(4):
        for i in range(sides):
            faces.append((row*sides+i,row*sides+(i+1)%sides,
                          (row+1)*sides+(i+1)%sides,(row+1)*sides+i))
    primitive(data, "grain", vertices, faces, near, shade)

def leaf(data, start, end, width, near=False, shade=1):
    a, b = Vector(start), Vector(end)
    side = (b-a).cross(Vector((0,0,1)))
    if side.length < .01:
        side = Vector((1,0,0))
    side.normalize()
    mid = a.lerp(b,.55)
    vertices = [tuple(a),tuple(mid+side*width),tuple(b),tuple(mid-side*width),
                tuple(mid+Vector((0,0,.025)))]
    primitive(data,"leaf",vertices,[(0,1,4),(1,2,4),(2,3,4),(3,0,4),
                                   (0,3,2),(0,2,1)],near,shade)

def soil_bed(data):
    # Dense enough to follow the runtime's triangulated terrain on gentle slopes.
    n = 12
    vertices = [(x/n*5.7-2.85,y/n*5.7-2.85,.16) for y in range(n+1) for x in range(n+1)]
    faces = []
    for y in range(n):
        for x in range(n):
            a = y*(n+1)+x
            faces.append((a,a+1,a+n+2,a+n+1))
    primitive(data,"soil",vertices,faces,shade=.87)
    for side in [-1,1]:
        for i in range(n):
            a, b = -2.85+i*5.7/n,-2.85+(i+1)*5.7/n
            primitive(data,"soil",[(a,side*2.85,-.08),(b,side*2.85,-.08),
                      (b,side*2.85,.16),(a,side*2.85,.16)],[(0,1,2,3) if side<0 else (3,2,1,0)],shade=.73)
            primitive(data,"soil",[(side*2.85,a,-.08),(side*2.85,b,-.08),
                      (side*2.85,b,.16),(side*2.85,a,.16)],[(0,1,2,3) if side>0 else (3,2,1,0)],shade=.73)
    primitive(data,"soil",[(-2.85,-2.85,-.08),(2.85,-2.85,-.08),
                           (2.85,2.85,-.08),(-2.85,2.85,-.08)],[(3,2,1,0)],shade=.7)

roots = []
report = []
for index, faction in enumerate(["alder","sun","raven"]):
    rng = random.Random(2026+index*93)
    data = {}
    soil_bed(data)
    for row in range(6):
        x = -2.3+row*.86
        # Segmented ridges and rails retain their shape after terrain fitting.
        for segment in range(8):
            y = -2.28+segment*.57
            box(data,"furrow",(x,y,.20),(.13,.55,.10),shade=.79)
        for column in range(8):
            y = -2.22+column*.63
            height = .85+rng.random()*.19
            bend = (.035+rng.random()*.07)*(1 if row%2 else -1)
            base = (x,y,.19)
            tip = (x+bend,y+.03,height)
            rod(data,"grain",base,tip,.017,shade=.8+rng.random()*.17)
            seed_head(data,(tip[0],tip[1],height-.02),.28,.083,shade=.82+rng.random()*.17)
            leaf(data,(x,y,.40),(x+.22,y-.10,.66),.052,shade=.82)
            if faction == "sun":
                leaf(data,(x,y,.26),(x-.19,y+.08,.48),.06,shade=.90)
            else:
                leaf(data,(x,y,.31),(x-.12,y+.10,.52),.028,shade=.90)
            for offset in [-1,1]:
                extra=(x+offset*.11,y+offset*.08,height-.04+rng.random()*.09)
                rod(data,"grain",(x+offset*.035,y,.19),extra,.015,5,True,.85)
                seed_head(data,(extra[0],extra[1],extra[2]-.02),.24,.057,True,.93)
                leaf(data,(x+offset*.035,y,.4),(x+offset*.20,y+.08,.66),.039,True,.88)
            # Fine kernels and barley awns are added only to the near mesh.
            for k in range(4):
                for side in [-1,1]:
                    seed_head(data,(tip[0]+side*.033,tip[1],height+k*.051),.065,.025,True,.88)
            if faction == "raven":
                for side in [-1,1]:
                    rod(data,"grain",(tip[0],tip[1],height+.16),
                        (tip[0]+side*.10,tip[1]+.035,height+.32),.006,4,True,.92)
    for side in [-1,1]:
        for i in range(5):
            x = -2.9+i*1.45
            box(data,"wood",(x,side*2.9,.45),(.11,.11,.9),shade=.82)
            box(data,"darkwood",(x,side*2.9,.92),(.14,.14,.06),True,.88)
        for i in range(8):
            x = -2.9+i*.725
            rod(data,"wood",(x,side*2.9,.55),(x+.725,side*2.9,.55),.035,shade=.83)
    # A small solid owner pennant remains batched with the structure.
    rod(data,"wood",(-2.9,2.9,.7),(-2.9,2.9,1.3),.025,shade=.8)
    box(data,"team",(-2.72,2.9,1.17),(.35,.035,.2),shade=.97)
    root = bpy.data.objects.new(f"asset__building__farm__{faction}__0",None)
    bpy.context.collection.objects.link(root)
    root["assetKey"] = f"building:farm:{faction}:0"
    root["model3d"] = {"kind":"building","type":"farm","volumetric":True,
                        "architectureAge":0,"artRevision":"field-crops-v1"}
    for (role, near), source in data.items():
        mesh = bpy.data.meshes.new(f"farm_{faction}_{role}_{near}")
        mesh.from_pydata(source["vertices"],[],source["faces"])
        mesh.update()
        obj = bpy.data.objects.new(mesh.name,mesh)
        bpy.context.collection.objects.link(obj)
        obj.parent = root
        obj["assetMaterial"] = role
        if near:
            obj["nearOnly"] = True
        mesh.materials.append(materials[role])
        uv = mesh.uv_layers.new(name="UVMap")
        for loop in mesh.loops:
            p = mesh.vertices[loop.vertex_index].co
            uv.data[loop.index].uv = (p.x*.25,p.z*.25+p.y*.1)
        color = mesh.color_attributes.new(name="Color",type="FLOAT_COLOR",domain="POINT")
        for i,value in enumerate(source["colors"]):
            color.data[i].color = value
    roots.append(root)
    report.append({"key":root["assetKey"],"lowStalks":48,"nearStalks":144,
                   "lowSeedHeads":48,"nearSeedHeads":528,
                   "features":["curved stems","closed volumetric grain","thick leaves",
                               "soil ridges","timber rails","owner pennant"]})

def export(name, near):
    bpy.ops.object.select_all(action="DESELECT")
    for root in roots:
        root.select_set(True)
        for obj in root.children:
            obj.select_set(near or not obj.get("nearOnly"))
    bpy.ops.export_scene.gltf(filepath=str(out/name),export_format="GLB",use_selection=True,
         export_apply=True,export_vertex_color="ACTIVE",export_extras=True,
         export_animations=False,export_cameras=False,export_lights=False)

export("frontier-low.glb",False)
export("frontier-near.glb",True)
bpy.ops.wm.save_as_mainfile(filepath=str(out/"frontier-farms.blend"),compress=True)
(out/"report.json").write_text(json.dumps({"models":report,"source":"Original Blender farm authoring",
    "liveCatalogueChanged":False},indent=2),encoding="utf-8")
print("Original staged crop fields exported",flush=True)
