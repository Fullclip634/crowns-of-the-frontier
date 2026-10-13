"""Original Blender art pass: solid foliage, roof tiles, bevels and baked shading.

Run with the project Blender executable in background mode after export-source.
The output retains the game's semantic materials, joints and moving subgroups.
"""

import bpy
import bmesh
import json
import math
import random
import os
from pathlib import Path
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

project = Path(__file__).resolve().parents[2]
stage = os.environ.get("FRONTIER_ART_STAGE", "")
if stage not in {"", "full", "resources"}:
    raise ValueError("Invalid art staging mode")
source = project / (".tools/art-candidate/resources/source/catalogue.glb" if stage == "resources" else ".tools/art-source/catalogue.glb")
out = project / (f".tools/art-candidate/{stage}/raw" if stage else ".tools/art-refined")
out.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(source))
roots = [obj for obj in bpy.data.objects if obj.get("assetKey")]
materials = {}
for obj in bpy.data.objects:
    if obj.type == "MESH" and obj.get("assetMaterial"):
        materials.setdefault(obj["assetMaterial"], obj.data.materials[0])
if "leafDark" not in materials and "leaf" in materials:
    # A resource-only source has no forest mesh supplying this semantic surface.
    materials["leafDark"] = materials["leaf"].copy()
    materials["leafDark"].name = "leafDark"
    materials["leafDark"].diffuse_color = (.055,.14,.038,1)

def descendants(root):
    result = []
    def visit(obj):
        result.append(obj)
        for child in obj.children:
            visit(child)
    visit(root)
    return result

def make_mesh(root, role, vertices, faces, label):
    mesh = bpy.data.meshes.new(label)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(label, mesh)
    bpy.context.collection.objects.link(obj)
    obj.parent = root
    obj["assetMaterial"] = role
    obj.data.materials.append(materials[role])
    # Planar/organic primitives receive usable UVs even with no bitmap texture.
    uv = mesh.uv_layers.new(name="UVMap")
    for loop in mesh.loops:
        p = mesh.vertices[loop.vertex_index].co
        uv.data[loop.index].uv = (p.x * .25, p.z * .25 + p.y * .1)
    return obj

def rod_data(vertices, faces, start, end, radius, taper=.45, sides=7):
    a, b = Vector(start), Vector(end)
    direction = (b - a).normalized()
    u = direction.cross(Vector((0, 0, 1)))
    if u.length < .001:
        u = direction.cross(Vector((0, 1, 0)))
    u.normalize()
    v = direction.cross(u).normalized()
    base = len(vertices)
    for center, r in [(a, radius), (b, radius * taper)]:
        for i in range(sides):
            angle = i * math.tau / sides
            vertices.append(tuple(center + (u * math.cos(angle) + v * math.sin(angle)) * r))
    faces.append(tuple(base + i for i in range(sides - 1, -1, -1)))
    faces.append(tuple(base + sides + i for i in range(sides)))
    for i in range(sides):
        j = (i + 1) % sides
        faces.append((base + i, base + j, base + sides + j, base + sides + i))

def organic_crown(vertices, faces, center, scale, rng, detail):
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=detail, radius=1)
    bm.verts.ensure_lookup_table()
    base = len(vertices)
    for vert in bm.verts:
        p = vert.co
        noise = 1 + .12 * math.sin(p.x * 5 + p.y * 3) + rng.uniform(-.055, .055)
        vertices.append((center[0] + p.x * scale[0] * noise,
                         center[1] + p.y * scale[1] * noise,
                         center[2] + p.z * scale[2] * noise))
    for face in bm.faces:
        faces.append(tuple(base + vert.index for vert in face.verts))
    bm.free()

def leaf_volume(vertices, faces, center, direction, length, width, thickness=.025):
    """A pointed leaf with a raised vein and a closed underside, not a card."""
    center, axis = Vector(center), Vector(direction).normalized()
    across = axis.cross(Vector((0, 0, 1)))
    if across.length < .01:
        across = axis.cross(Vector((0, 1, 0)))
    across.normalize()
    normal = across.cross(axis).normalized()
    base = len(vertices)
    vertices.extend(tuple(point) for point in [center + axis*length*.5,
        center + across*width, center - axis*length*.5, center - across*width,
        center + normal*thickness, center - normal*thickness])
    for i in range(4):
        j = (i+1) % 4
        faces.extend([(base+j, base+i, base+4), (base+i, base+j, base+5)])

def weathered_rock(vertices, faces, center, scale, angle, rng, detail=2):
    """Closed uneven stone with a settled base and broad erosion, not a ball."""
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=detail, radius=1)
    bm.verts.ensure_lookup_table()
    base = len(vertices)
    rotation = Matrix.Rotation(angle, 3, "Z")
    for vert in bm.verts:
        p = vert.co
        erosion = 1 + .09*math.sin(p.x*5.2+p.y*3.8) + .055*math.cos(p.z*6.1-p.y*4) + rng.uniform(-.035,.035)
        point = rotation @ Vector((p.x*scale[0]*erosion, p.y*scale[1]*erosion,
                                    max(-.68,p.z)*scale[2]*erosion))
        vertices.append(tuple(Vector(center)+point))
    for face in bm.faces:
        faces.append(tuple(base+vert.index for vert in face.verts))
    bm.free()

def author_resource(root):
    key = root["assetKey"].split(":")
    if len(key) != 3 or key[1] not in {"food", "stone", "gold"}:
        return
    kind, variant = key[1], int(key[2])
    rng = random.Random(9017+variant*193+(500 if kind == "gold" else 0))
    for obj in reversed(descendants(root)[1:]):
        bpy.data.objects.remove(obj, do_unlink=True)
    metadata = dict(root.get("model3d", {}))
    metadata["resourceRevision"] = "field-resources-v1"
    root["model3d"] = metadata
    if kind == "food":
        wood, wood_faces, fruit, fruit_faces = [], [], [], []
        leaves = {role: ([], []) for role in ["leaf", "leafDark"]}
        detail, detail_faces = [], []
        for cane in range(5):
            angle = cane*math.tau/5+variant*.29
            direction = Vector((math.cos(angle),math.sin(angle),0))
            base = direction*.32
            bend = base*.6+Vector((0,0,.84+rng.uniform(-.1,.1)))
            tip = direction*(.84+rng.uniform(-.07,.07))+Vector((0,0,1.14+rng.uniform(-.13,.13)))
            rod_data(wood,wood_faces,base,bend,.047,.75,7)
            rod_data(wood,wood_faces,bend,tip,.034,.35,7)
            for level in range(4):
                stem = bend.lerp(tip,.12+level*.23)
                turn = angle+level*2.399
                twig = Vector((math.cos(turn),math.sin(turn),.22)).normalized()
                end = stem+twig*(.20+rng.random()*.08)
                rod_data(wood,wood_faces,stem,end,.014,.3,5)
                for leaflet in range(3):
                    leaf_angle = turn+(leaflet-1)*.85
                    axis = Vector((math.cos(leaf_angle),math.sin(leaf_angle),rng.uniform(-.24,.22)))
                    vertices, faces = leaves["leaf" if (level+cane)%2 else "leafDark"]
                    leaf_volume(vertices,faces,end+axis*.12,axis,.34+rng.random()*.09,.10,.018)
                # Extra leaflets enrich the near silhouette without enlarging Low.
                leaf_volume(detail,detail_faces,end+Vector((0,0,.09)),twig,.30,.085,.015)
                if level%2:
                    for berry in range(3):
                        center = end+Vector(((berry-1)*.08,.03*math.sin(turn+berry),-.08))
                        organic_crown(fruit,fruit_faces,center,(.062,.062,.078),rng,1)
        make_mesh(root,"trunk",wood,wood_faces,root.name+"_FruitCanes")
        for role, (vertices,faces) in leaves.items():
            obj = make_mesh(root,role,vertices,faces,root.name+"_FruitLeaves_"+role)
            obj["foliageDetail"] = "closed shrub leaflets"
        extra = make_mesh(root,"leaf",detail,detail_faces,root.name+"_FruitLeafTips")
        extra["nearOnly"] = True
        extra["foliageDetail"] = "closed shrub leaflets"
        make_mesh(root,"fruit",fruit,fruit_faces,root.name+"_FruitClusters")
        return
    vertices, faces, centers = [], [], []
    for i in range(7):
        angle = i*2.399+variant*.4
        radius = .38 if i == 0 else .70+rng.random()*.42
        sx, sy, sz = .56+rng.random()*.40, .53+rng.random()*.34, .46+rng.random()*.42
        center = Vector((math.cos(angle)*radius,math.sin(angle)*radius,.68*sz+.035))
        weathered_rock(vertices,faces,center,(sx,sy,sz),rng.random()*math.tau,rng)
        centers.append((center,max(sx,sy,sz)))
    for i in range(8):
        angle = i*2.399+variant*.3
        weathered_rock(vertices,faces,(math.cos(angle)*1.6,math.sin(angle)*1.6,.07),(.12,.10,.09),angle,rng,1)
    rock = make_mesh(root,"stoneDark" if kind == "gold" else "stone",vertices,faces,root.name+"_WeatheredDeposit")
    rock["naturalRock"] = True
    if kind == "gold":
        tree = BVHTree.FromPolygons([Vector(p) for p in vertices],faces,all_triangles=False)
        gold, gold_faces, nuggets, nugget_faces = [], [], [], []
        for center, scale in centers:
            for vein in range(2):
                angle = rng.random()*math.tau
                points = []
                for step in range(4):
                    direction = Vector((math.cos(angle+step*.10),math.sin(angle+step*.10),.35+step*.16)).normalized()
                    point, normal, _, _ = tree.ray_cast(center+direction*scale*3,-direction,scale*3)
                    if point is not None:
                        points.append(point+normal*.018)
                for i in range(len(points)-1):
                    if (points[i+1]-points[i]).length_squared > .000001:
                        rod_data(gold,gold_faces,points[i],points[i+1],.025,.8,5)
                if points:
                    organic_crown(nuggets,nugget_faces,points[len(points)//2],(.065,.048,.055),rng,1)
        seams = make_mesh(root,"gold",gold,gold_faces,root.name+"_GoldSeams")
        seams["nearOnly"] = True
        make_mesh(root,"gold",nuggets,nugget_faces,root.name+"_GoldInclusions")

def crown_leaves(root, crowns, scale, rng):
    for parity, role in [(0, "leaf"), (1, "leafDark")]:
        vertices, faces = [], []
        for i, center in enumerate(crowns):
            if i % 2 != parity:
                continue
            # Stable surface distribution with different tilt/size at each tip.
            for j in range(64):
                z = 1 - 2*(j+.5)/64
                angle = j*2.399963 + rng.uniform(-.16, .16)
                radius = math.sqrt(max(0, 1-z*z))
                direction = Vector((radius*math.cos(angle), radius*math.sin(angle), z))
                position = Vector(center) + Vector(tuple(direction[k]*scale[k]*1.10 for k in range(3)))
                tilt = Vector((math.cos(angle+.7), math.sin(angle+.7), rng.uniform(-.45, .35)))
                leaf_volume(vertices, faces, position, tilt, rng.uniform(.34, .55), rng.uniform(.10, .18))
        if vertices:
            obj = make_mesh(root, role, vertices, faces, root.name + "_LeafTips_" + role)
            obj["nearOnly"] = True
            obj["foliageDetail"] = "closed leaf tips"

def winter_boughs(root, height, variant, far, rng):
    bark_vertices, bark_faces = [], []
    foliage = {role: ([], []) for role in ["leafDark", "snow"]}
    tiers, branches = (5, 7) if far else (7, 9)
    for tier in range(tiers):
        z = 1.5 + tier*(height-1.9)/(tiers-1)
        radius = 2.15*(1-tier/(tiers+1))
        for branch in range(branches):
            angle = branch*math.tau/branches + tier*.43 + variant*.3
            direction = Vector((math.cos(angle), math.sin(angle), 0))
            root_point = Vector((.10, -.05, z))
            tip = root_point + direction*(radius*rng.uniform(.88, 1.1)) + Vector((0, 0, -.22))
            rod_data(bark_vertices, bark_faces, root_point, tip, .075*(1-tier/tiers*.65), .12, 5 if far else 7)
            for section in range(2 if far else 3):
                fraction = .30 + section*(.55 if far else .30)
                center = root_point.lerp(tip, fraction)
                length = radius*(.7 if far else .55)
                width = radius*(.22 if far else .18)*(1-section*.12)
                verts, faces = foliage["leafDark"]
                leaf_volume(verts, faces, center, direction, length, width, .13 if far else .11)
                # Uneven patches sit on the boughs, leaving dark needle edges.
                if (branch+tier+variant) % 3 != 0:
                    verts, faces = foliage["snow"]
                    leaf_volume(verts, faces, center+Vector((0, 0, .125)), direction,
                                length*.72, width*.68, .06)
    make_mesh(root, "trunk", bark_vertices, bark_faces, root.name + "_Boughs")
    for role, (vertices, faces) in foliage.items():
        make_mesh(root, role, vertices, faces, root.name + "_" + role)

def author_tree(root):
    _, biome, variant, lod = root["assetKey"].split(":")
    variant = int(variant)
    rng = random.Random(2201 + variant)
    far = lod == "far"
    for obj in reversed(descendants(root)[1:]):
        bpy.data.objects.remove(obj, do_unlink=True)
    vertices, faces = [], []
    height, spread = [(6.3, 1.0), (7.2, .78), (6.5, 1.18), (5.8, 1.12)][variant]
    if biome == "winter":
        height, spread = 5.8 + variant*.15, 1.0
    elif biome == "desert":
        spread *= .85
    root["foliageSpecies"] = "pine" if biome == "winter" else ["oak", "birch", "elm", "beech"][variant]
    # A gently bent, tapering trunk avoids the straight toy-cylinder silhouette.
    trunk = [(0, 0, 0), (.06, -.025, height*.28),
             (.13+variant*.025, -.06, height*.56), (.18, -.10, height*.80)]
    radii = [.28, .235, .17, .105]
    for segment in range(len(trunk)-1):
        rod_data(vertices, faces, trunk[segment], trunk[segment+1], radii[segment],
                 radii[segment+1]/radii[segment], 8 if far else 13)
    for i in range(4 if not far else 2):
        angle = i * math.tau / 4 + variant
        rod_data(vertices, faces, (0, 0, .35),
                 (math.cos(angle) * .72, math.sin(angle) * .72, .035), .15, .22)
    if biome == "winter":
        make_mesh(root, "trunk", vertices, faces, root.name + "_Bark")
        winter_boughs(root, height, variant, far, rng)
        return
    crowns = []
    for i in range(3 if far else 16):
        angle = i * 2.399 + variant
        tier = (i-1) % 3 if i else 0
        radius = ((.82+rng.random()*.28) if far else (.55+tier*.45+rng.random()*.25))*spread if i else .10
        location = (math.cos(angle) * radius, math.sin(angle) * radius,
                    height - (.30 if not i else .60+tier*.65))
        junction = (.13, -.06, height*.50)
        bend = ((junction[0]+location[0])*.5, (junction[1]+location[1])*.5, height*.70)
        rod_data(vertices, faces, junction, bend, .10, .6, 7 if far else 10)
        rod_data(vertices, faces, bend, location, .06, .25, 6 if far else 9)
        crowns.append(location)
    make_mesh(root, "trunk", vertices, faces, root.name + "_Bark")
    scale = ((1.4 if far else .92)*spread, (1.25 if far else .83)*spread,
             (.78 if far else .60) if biome == "desert" else (1.12 if far else .78))
    for parity, role in [(0, "leaf"), (1, "leafDark")]:
        vertices, faces = [], []
        for i, center in enumerate(crowns):
            if i % 2 != parity:
                continue
            # Smooth closed lobes remain the affordable distant canopy.
            organic_crown(vertices, faces, center, scale, rng, 2)
        make_mesh(root, role, vertices, faces, root.name + "_" + role)
    if not far:
        crown_leaves(root, crowns, scale, rng)

def weld(obj):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=.00001)
    bm.normal_update()
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()
    if obj.get("naturalRock") or obj.get("assetMaterial") in {"skin", "hair", "pants", "team", "canvas", "leather", "straw", "horse", "mane", "leaf", "leafDark", "trunk", "steel"}:
        for polygon in obj.data.polygons:
            polygon.use_smooth = True
        # Blender 4.5 splits sharp joins while preserving curved skin and cloth.
        obj.data.set_sharp_from_angle(angle=math.radians(55))

def roof_tiles(root):
    key = root["assetKey"]
    if not key.startswith("building:") or ":sun:" in key:
        return
    for roof in [obj for obj in descendants(root) if obj.type == "MESH" and obj.get("assetMaterial") == "teamRoof"]:
        mesh = roof.data
        vertices = [roof.matrix_world @ vert.co for vert in mesh.vertices]
        faces = [tuple(poly.vertices) for poly in mesh.polygons]
        tree = BVHTree.FromPolygons(vertices, faces, all_triangles=False)
        minx, maxx = min(v.x for v in vertices), max(v.x for v in vertices)
        miny, maxy = min(v.y for v in vertices), max(v.y for v in vertices)
        top = max(v.z for v in vertices) + 1
        tile_vertices, tile_faces = [], []
        count = 0
        y = miny + .28
        while y < maxy - .15 and count < 140:
            x = minx + .29
            while x < maxx - .15 and count < 140:
                point, normal, _, _ = tree.ray_cast(Vector((x, y, top)), Vector((0, 0, -1)))
                if point is not None and .3 < normal.z < .95:
                    tangent = Vector((0, 1, 0))
                    tangent = (tangent - normal * tangent.dot(normal)).normalized()
                    across = tangent.cross(normal).normalized()
                    base = len(tile_vertices)
                    for depth in [0, .035]:
                        for a, b in [(-.285, -.235), (.285, -.235), (.285, .235), (-.285, .235)]:
                            tile_vertices.append(tuple(point + across * a + tangent * b + normal * (depth + .006)))
                    tile_faces.extend([(base,base+3,base+2,base+1),(base+4,base+5,base+6,base+7),
                                       (base,base+1,base+5,base+4),(base+1,base+2,base+6,base+5),
                                       (base+2,base+3,base+7,base+6),(base+3,base,base+4,base+7)])
                    count += 1
                x += .6
            y += .49
        if tile_vertices:
            obj = make_mesh(root, "teamRoof", tile_vertices, tile_faces, root.name + "_SlateTiles")
            obj["nearOnly"] = True

def bake_shading(root):
    meshes = [obj for obj in descendants(root) if obj.type == "MESH"]
    vertices, faces = [], []
    for obj in meshes:
        base = len(vertices)
        vertices.extend(obj.matrix_world @ vert.co for vert in obj.data.vertices)
        faces.extend(tuple(base + v for v in poly.vertices) for poly in obj.data.polygons)
    tree = BVHTree.FromPolygons(vertices, faces, all_triangles=False)
    is_unit = root["assetKey"].startswith("unit:")
    distance = .65 if is_unit else 1.6
    for obj in meshes:
        mesh = obj.data
        old = mesh.color_attributes.get("BakedDepth")
        if old:
            mesh.color_attributes.remove(old)
        colors = mesh.color_attributes.new(name="BakedDepth", type="FLOAT_COLOR", domain="POINT")
        mesh.color_attributes.active_color = colors
        matrix, normal_matrix = obj.matrix_world, obj.matrix_world.to_3x3().inverted().transposed()
        for vert in mesh.vertices:
            p = matrix @ vert.co
            normal = (normal_matrix @ vert.normal).normalized()
            u = normal.cross(Vector((0, 0, 1)))
            if u.length < .01:
                u = normal.cross(Vector((0, 1, 0)))
            u.normalize()
            v = normal.cross(u).normalized()
            occlusion = 0
            for direction in [normal, (normal + u * .8).normalized(),
                              (normal - u * .8).normalized(), (normal + v * .8).normalized()]:
                hit, _, _, dist = tree.ray_cast(p + normal * .018, direction, distance)
                if hit is not None:
                    occlusion += 1 - dist / distance
            shade = max(.64, 1 - occlusion * .075)
            role = obj.get("assetMaterial")
            if role in ["leaf", "leafDark"]:
                # Subtle canopy variation survives compression and batching.
                variation = .90 + .10*(.5+.5*math.sin(p.x*8.1+p.y*5.3+p.z*6.7))
                colors.data[vert.index].color = (shade*variation*.96, shade*variation, shade*variation*.92, 1)
            else:
                colors.data[vert.index].color = (shade, shade, shade, 1)

exec(compile((project / "scripts/blender/human-figures.py").read_text(encoding="utf-8"), "human-figures.py", "exec"))

for i, root in enumerate(roots):
    if root["assetKey"].startswith("unit:"):
        author_human(root)
    if root["assetKey"].startswith("tree:"):
        author_tree(root)
    if root["assetKey"].startswith("resource:"):
        author_resource(root)
    for obj in descendants(root):
        if obj.type == "MESH":
            weld(obj)
    roof_tiles(root)
    bpy.context.view_layer.update()
    bake_shading(root)
    if (i + 1) % 12 == 0:
        print(f"Refined {i + 1}/{len(roots)} models", flush=True)

def export(name, near):
    bpy.ops.object.select_all(action="DESELECT")
    selected = []
    for root in roots:
        for obj in descendants(root):
            if not near and obj.get("nearOnly"):
                continue
            obj.select_set(True)
            selected.append(obj)
    if near:
        for obj in selected:
            if obj.type != "MESH" or obj.get("assetMaterial") in ["leaf", "leafDark", "snow"]:
                continue
            bpy.context.view_layer.objects.active = obj
            bevel = obj.modifiers.new("Crafted edges", "BEVEL")
            bevel.width = .009 if obj.get("motion") else .023
            bevel.segments = 1
            bevel.limit_method = "ANGLE"
            bevel.angle_limit = .8
            bevel.use_clamp_overlap = True
    bpy.ops.export_scene.gltf(filepath=str(out / name), export_format="GLB",
                             use_selection=True, export_apply=True,
                             export_vertex_color="ACTIVE",
                             export_extras=True, export_animations=False,
                             export_cameras=False, export_lights=False)

export("frontier-low.glb", False)
export("frontier-near.glb", True)
bpy.ops.wm.save_as_mainfile(filepath=str(out / "frontier-assets.blend"), compress=True)
(out / "report.json").write_text(json.dumps({"models": len(roots), "source": "original game assets and authored Blender geometry",
                                             "features": ["weathered ore shapes", "solid gold seams", "branched fruit canes", "closed shrub leaflets", "civic arcades", "detailed gables", "field packs and visors", "species-shaped crowns", "curved tapered trunks", "closed leaf tips", "branched winter boughs", "patchy snow", "smooth volumetric foliage", "adult figures", "nested joints", "solid worker tools", "slate tiles", "beveled edges", "baked vertex shading"]}, indent=2), encoding="utf-8")
print("Blender catalogue art pass complete.", flush=True)
