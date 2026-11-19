"""Original Blender art pass: solid foliage, roof tiles, bevels and baked shading.

Run with the project Blender executable in background mode after export-source.
The output retains the game's semantic materials, joints and moving subgroups.
"""

import argparse
import bpy
import bmesh
import json
import math
import random
import os
import sys
from pathlib import Path
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

project = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser()
parser.add_argument("--blend", default="")
parser.add_argument("--prefix", default="")
parser.add_argument("--exclude", default="")
parser.add_argument("--output", default="")
argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
cli = parser.parse_args(argv)
stage = os.environ.get("FRONTIER_ART_STAGE", "")
if stage not in {"", "full", "resources"}:
    raise ValueError("Invalid art staging mode")
source = project / (".tools/art-candidate/resources/source/catalogue.glb" if stage == "resources" else ".tools/art-source/catalogue.glb")
out = Path(cli.output).resolve() if cli.output else project / (f".tools/art-candidate/{stage}/raw" if stage else ".tools/art-refined")
out.mkdir(parents=True, exist_ok=True)
if cli.blend:
    blend_path = Path(cli.blend).resolve()
    assert blend_path.is_relative_to(project) and blend_path.suffix == ".blend" and blend_path.is_file()
    bpy.ops.wm.open_mainfile(filepath=str(blend_path))
else:
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
    """Closed uneven stone with angular mineral facets and a settled base."""
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=detail, radius=1)
    bm.verts.ensure_lookup_table()
    base = len(vertices)
    rotation = Matrix.Rotation(angle, 3, "Z")
    planes = [Vector((rng.uniform(-1,1), rng.uniform(-1,1), rng.uniform(.15,.95))).normalized() for _ in range(3)]
    for vert in bm.verts:
        p = vert.co.copy()
        for plane in planes:
            d = p.dot(plane)
            if d > .64:
                p -= plane * ((d - .64) * .85)
        erosion = 1 + .08*math.sin(p.x*5.2+p.y*3.8) + .05*math.cos(p.z*6.1-p.y*4) + rng.uniform(-.03,.03)
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
            for vein in range(3):
                angle = rng.random()*math.tau
                points = []
                for step in range(4):
                    direction = Vector((math.cos(angle+step*.12),math.sin(angle+step*.12),.35+step*.16)).normalized()
                    point, normal, _, _ = tree.ray_cast(center+direction*scale*3,-direction,scale*3)
                    if point is not None:
                        points.append(point+normal*.032)
                for i in range(len(points)-1):
                    if (points[i+1]-points[i]).length_squared > .000001:
                        rod_data(gold,gold_faces,points[i],points[i+1],.055,.82,5)
                if points:
                    organic_crown(nuggets,nugget_faces,points[len(points)//2],(.13,.10,.12),rng,1)
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
    """Windswept snow-laden alpine spruces with drooping asymmetric boughs and carved snow caps."""
    bark_vertices, bark_faces = [], []
    foliage = {role: ([], []) for role in ["leafDark", "snow"]}
    tiers, branches = (5, 5) if far else (6, 7)
    for tier in range(tiers):
        progress = tier / max(1, tiers - 1)
        z = 1.35 + progress * (height - 1.85)
        radius = (2.35 * (1 - progress) ** .82 + .24) * (1.06 if far else 1.0)
        droop = -.54 * (1 - progress * .62)
        for branch in range(branches):
            angle = branch * math.tau / branches + tier * .58 + variant * .41 + rng.uniform(-.18, .18)
            direction = Vector((math.cos(angle), math.sin(angle), 0))
            across = Vector((-direction.y, direction.x, 0))
            asym = rng.uniform(.78, 1.22)
            root_point = Vector((.12 * progress, -.06 * progress, z + rng.uniform(-.10, .10)))
            tip = root_point + direction * (radius * asym) + Vector((0, 0, droop * asym))
            if tier < (3 if far else 4):
                rod_data(bark_vertices, bark_faces, root_point, tip.lerp(root_point, .22), .062 * (1 - progress * .65), .20, 4)
            dark, dark_faces = foliage["leafDark"]
            snow_v, snow_f = foliage["snow"]
            # Two overlapping curved needle sprays per bough with irregular silhouette tips.
            for section in range(2):
                frac = .36 + section * .44
                center = root_point.lerp(tip, frac) + across * (rng.uniform(-.08, .08) * radius)
                bough_dir = (tip - root_point).normalized() + Vector((0, 0, -.12 if section == 1 else -.04))
                length = radius * asym * (.68 if far else .62) * (1 - section * .14)
                width = radius * (.29 if far else .23) * (1 - section * .16)
                leaf_volume(dark, dark_faces, center, bough_dir, length, width, .14 if far else .12)
                # Carved snow pillows settle heavily on upper/outer boughs, leaving dark evergreen undersides.
                if (branch + tier + variant + section) % 4 != 0:
                    snow_offset = Vector((0, 0, .115 if section == 0 else .095))
                    leaf_volume(snow_v, snow_f, center + snow_offset, bough_dir + Vector((0, 0, .06)),
                                length * .78, width * .74, .085)
    # Sculpted evergreen spire leader + snowy cap at apex.
    apex = Vector((.18, -.09, height))
    dark, dark_faces = foliage["leafDark"]
    snow_v, snow_f = foliage["snow"]
    for k in range(3 if far else 4):
        a = k * math.tau / (3 if far else 4) + variant * .5
        d = Vector((math.cos(a) * .45, math.sin(a) * .45, .88)).normalized()
        leaf_volume(dark, dark_faces, apex + Vector((math.cos(a) * .16, math.sin(a) * .16, -.35)), d, .78, .22, .11)
    leaf_volume(snow_v, snow_f, apex + Vector((0, 0, -.05)), Vector((0, 0, 1)), .62, .20, .14)
    if bark_vertices:
        boughs = make_mesh(root, "trunk", bark_vertices, bark_faces, root.name + "_Boughs")
        boughs["skipCraftedBevel"] = True
    for role, (vertices, faces) in foliage.items():
        make_mesh(root, role, vertices, faces, root.name + "_" + role)


def desert_acacia(root, height, spread, variant, far, rng):
    """Flat-topped layered desert acacias with gnarled V-forked limbs and sunlit umbrella fronds."""
    bark, bark_faces = [], []
    foliage = {"leaf": ([], []), "leafDark": ([], [])}
    split_z = height * (.40 + (variant % 2) * .04)
    trunk = [(0, 0, 0), (.11 * (-1 if variant % 2 else 1), -.05, split_z * .52),
             (.16 * (-1 if variant % 2 else 1), .06, split_z)]
    radii = [.26, .20, .15]
    for s in range(len(trunk) - 1):
        rod_data(bark, bark_faces, trunk[s], trunk[s + 1], radii[s], radii[s + 1] / radii[s], 6 if far else 8)
    for r in range(2 if far else 3):
        ra = r * math.tau / (2 if far else 3) + variant * .7
        rod_data(bark, bark_faces, (0, 0, .28), (math.cos(ra) * .68, math.sin(ra) * .68, .03), .12, .22, 4 if far else 5)

    split = Vector(trunk[-1])
    pads = []
    # Central crown leader slightly taller than outer umbrella tiers.
    center_tip = split + Vector((rng.uniform(-.22, .22), rng.uniform(-.22, .22), height * .46))
    rod_data(bark, bark_faces, split, center_tip, .10, .38, 4 if far else 5)
    pads.append((center_tip + Vector((0, 0, .14)), 1.38 * spread, .22))

    # 4 spreading gnarled primary limbs radiating into flat-topped umbrella crowns.
    limb_count = 4
    for i in range(limb_count):
        ang = i * math.tau / limb_count + variant * .55 + rng.uniform(-.26, .26)
        reach = (1.55 + rng.uniform(.05, .52)) * spread
        tier_z = height * (.74 + (i % 2) * .09 + rng.uniform(-.04, .05))
        dir_xy = Vector((math.cos(ang), math.sin(ang), 0))
        elbow = split + dir_xy * (reach * .54) + Vector((0, 0, (tier_z - split_z) * .58))
        tip = split + dir_xy * reach + Vector((0, 0, tier_z - split_z))
        rod_data(bark, bark_faces, split, elbow, .105, .64, 4 if far else 5)
        rod_data(bark, bark_faces, elbow, tip, .068, .35, 4)
        pads.append((tip + Vector((0, 0, .10)), (1.18 + rng.uniform(.0, .26)) * spread, .19))
        # Forked secondary sub-boughs create wide overlapping flat acacia terraces.
        forks = (-1,) if far and i % 2 else (-1, 1) if not far else (1,)
        for side in forks:
            sub_ang = ang + side * (.52 + rng.uniform(-.10, .12))
            sub_dir = Vector((math.cos(sub_ang), math.sin(sub_ang), 0))
            sub_tip = elbow + sub_dir * (reach * .62) + Vector((0, 0, (tier_z - split_z) * .42 + rng.uniform(-.12, .16)))
            if not far:
                rod_data(bark, bark_faces, elbow, sub_tip, .052, .32, 4)
            if not far or side > 0:
                pads.append((sub_tip + Vector((0, 0, .08)), (.96 + rng.uniform(-.08, .20)) * spread, .16))

    dark, dark_faces = foliage["leafDark"]
    light, light_faces = foliage["leaf"]
    # Build each umbrella pad from horizontal overlapping closed frond sprays (zero spherical blobs).
    for idx, (pad_center, pad_r, pad_h) in enumerate(pads):
        under_n = 4 if far else 6
        upper_n = 5 if far else 8
        for k in range(under_n):
            a = k * math.tau / under_n + idx * 1.1 + rng.uniform(-.22, .22)
            d = Vector((math.cos(a), math.sin(a), rng.uniform(-.16, -.02))).normalized()
            pos = pad_center + Vector((math.cos(a) * pad_r * .42, math.sin(a) * pad_r * .42, -pad_h * .45))
            leaf_volume(dark, dark_faces, pos, d, pad_r * (1.26 if far else 1.10), pad_r * (.44 if far else .36), .11)
        for k in range(upper_n):
            a = k * math.tau / upper_n + idx * 1.7 + .35 + rng.uniform(-.20, .20)
            d = Vector((math.cos(a), math.sin(a), rng.uniform(.02, .16))).normalized()
            pos = pad_center + Vector((math.cos(a) * pad_r * .46, math.sin(a) * pad_r * .46, pad_h * (.32 + (k % 2) * .28)))
            leaf_volume(light, light_faces, pos, d, pad_r * (1.18 if far else 1.02), pad_r * (.40 if far else .33), .095)
        # Crown cap closes the top flat terrace cleanly when viewed from RTS camera angle.
        cap_ang = idx * 1.3 + variant
        leaf_volume(light, light_faces, pad_center + Vector((0, 0, pad_h * .62)),
                    Vector((math.cos(cap_ang), math.sin(cap_ang), .08)).normalized(), pad_r * 1.18, pad_r * .56, .10)

    bark_mesh = make_mesh(root, "trunk", bark, bark_faces, root.name + "_Bark")
    bark_mesh["skipCraftedBevel"] = True
    for role, (vertices, faces) in foliage.items():
        make_mesh(root, role, vertices, faces, root.name + "_" + role)


def meadow_boughs(root, height, spread, variant, far):
    """Green conifers with a raised crown and uneven whorls of hanging sprays."""
    bark, bark_faces = [], []
    foliage = {"leafDark": ([], []), "leaf": ([], [])}
    tiers = 8
    for tier in range(tiers):
        progress = tier / (tiers - 1)
        radius = spread * (2.0 * (1 - progress) ** .83 + .18)
        level = height * (.32 + .65 * progress)
        for branch in range(8):
            twig = random.Random(3161 + variant * 571 + tier * 101 + branch * 11)
            angle = branch * math.tau / 8 + tier * .62 + twig.uniform(-.27, .27)
            direction = Vector((math.cos(angle), math.sin(angle), 0))
            across = Vector((-direction.y, direction.x, 0))
            origin = Vector((.23 * progress, -.12 * progress, level + twig.uniform(-.12, .12)))
            elbow = origin + direction * radius * .64 + Vector((0, 0, .10))
            tip = origin + direction * radius * twig.uniform(.88, 1.18) + Vector((0, 0, -.28 * (1 - progress)))
            if far and branch in (1, 3, 5):
                continue
            rod_data(bark, bark_faces, origin, elbow, .060 * (1 - .65 * progress), .62, 4)
            if not far:
                rod_data(bark, bark_faces, elbow, tip, .035 * (1 - .65 * progress), .25, 4)
            dark, dark_faces = foliage["leafDark"]
            green, green_faces = foliage["leaf"]
            # Full-length twisted needle clusters cover the limb and form the
            # same outer silhouette in both meshes. Near tips add split edges.
            leaf_volume(dark, dark_faces, origin.lerp(tip, .48), direction + Vector((0, 0, -.10)),
                        radius * 1.05, radius * (.29 if far else .21), radius * .145)
            leaf_volume(green, green_faces, tip.lerp(elbow, .26), direction + Vector((0, 0, .10)),
                        radius * .50, radius * .17, radius * .10)
            for side in (() if far else (-1, 1)):
                spray = direction * .64 + across * side * .78 + Vector((0, 0, -.26))
                center = origin.lerp(tip, .51 + side * .085) + spray * radius * .13
                leaf_volume(dark, dark_faces, center, spray, radius * .64, radius * .125, radius * .08)
                needle = direction * .70 + across * side * .58 + Vector((0, 0, -.14))
                leaf_volume(green, green_faces, center + direction * radius * .23,
                            needle, radius * .42, radius * .082, radius * .065)
    limbs = make_mesh(root, "trunk", bark, bark_faces, root.name + "_Limbs")
    limbs["skipCraftedBevel"] = True
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
        height, spread = 6.0 + variant*.22, 1.0
    elif biome == "highlands":
        height, spread = [(7.8, .94), (8.6, .79), (7.5, 1.0), (7.15, .92)][variant]
    elif biome == "desert":
        height, spread = [(5.4, 1.08), (6.1, .96), (5.2, 1.16), (4.8, 1.05)][variant]
    root["foliageSpecies"] = {"winter": "pine", "highlands": "meadow conifer", "desert": "desert acacia"}.get(biome, ["oak", "birch", "elm", "beech"][variant])
    if biome == "desert":
        desert_acacia(root, height, spread, variant, far, rng)
        return
    # A gently bent, tapering trunk avoids the straight toy-cylinder silhouette.
    trunk = [(0, 0, 0), (.06, -.025, height*.28),
             (.13+variant*.025, -.06, height*.56), (.18, -.10, height*.80)]
    radii = [.28, .235, .17, .105]
    for segment in range(len(trunk)-1):
        rod_data(vertices, faces, trunk[segment], trunk[segment+1], radii[segment],
                 radii[segment+1]/radii[segment], 6 if far else 9)
    if biome in ("highlands", "winter"):
        rod_data(vertices, faces, trunk[-1], (.20, -.10, height * .96), radii[-1], .12, 5 if far else 6)
    for i in range(3 if not far else 2):
        angle = i * math.tau / (3 if not far else 2) + variant
        rod_data(vertices, faces, (0, 0, .35),
                 (math.cos(angle) * .72, math.sin(angle) * .72, .035), .14, .22, 5 if not far else 4)
    if biome == "winter":
        trunk_mesh = make_mesh(root, "trunk", vertices, faces, root.name + "_Bark")
        trunk_mesh["skipCraftedBevel"] = True
        winter_boughs(root, height, variant, far, rng)
        return
    if biome == "highlands":
        trunk_mesh = make_mesh(root, "trunk", vertices, faces, root.name + "_Bark")
        trunk_mesh["skipCraftedBevel"] = far
        meadow_boughs(root, height, spread, variant, far)
        return
    crowns = []
    # Three oversized lobes read as a smooth ball from a distance. A distant
    # broadleaf canopy needs more, smaller lobes so its outline stays ragged.
    far_crowns = 7
    for i in range(far_crowns if far else 16):
        angle = i * 2.399 + variant
        tier = (i-1) % 3 if i else 0
        radius = ((.52 + tier*.20 + rng.random()*.10) if far else (.55+tier*.45+rng.random()*.25))*spread if i else .10
        location = (math.cos(angle) * radius, math.sin(angle) * radius,
                    height - (.30 if not i else .60+tier*.65))
        junction = (.13, -.06, height*.50)
        bend = ((junction[0]+location[0])*.5, (junction[1]+location[1])*.5, height*.70)
        rod_data(vertices, faces, junction, bend, .10, .6, 5 if far else 6)
        rod_data(vertices, faces, bend, location, .06, .25, 4 if far else 5)
        crowns.append(location)
    make_mesh(root, "trunk", vertices, faces, root.name + "_Bark")
    scale = ((1.05 if far else .92)*spread, (.95 if far else .83)*spread,
             (.86 if far else .60) if biome == "desert" else (.90 if far else .78))
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
    for old in [obj for obj in descendants(root) if obj.name.endswith("_SlateTiles")]:
        bpy.data.objects.remove(old, do_unlink=True)
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
        y = miny + .24
        row = 0
        while y < maxy - .15 and count < 168:
            x = minx + .25 + (.29 if row % 2 else 0)
            while x < maxx - .15 and count < 168:
                point, normal, _, _ = tree.ray_cast(Vector((x, y, top)), Vector((0, 0, -1)))
                if point is not None and .3 < normal.z < .95:
                    tangent = Vector((0, 1, 0))
                    tangent = (tangent - normal * tangent.dot(normal)).normalized()
                    across = tangent.cross(normal).normalized()
                    base = len(tile_vertices)
                    for depth in [0, .040]:
                        for a, b in [(-.275, -.22), (.275, -.22), (.275, .22), (-.275, .22)]:
                            tile_vertices.append(tuple(point + across * a + tangent * b + normal * (depth + .006)))
                    tile_faces.extend([(base,base+3,base+2,base+1),(base+4,base+5,base+6,base+7),
                                       (base,base+1,base+5,base+4),(base+1,base+2,base+6,base+5),
                                       (base+2,base+3,base+7,base+6),(base+3,base,base+4,base+7)])
                    count += 1
                x += .58
            y += .42
            row += 1
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
            elif role in ["teamRoof", "roof"]:
                tile_var = .86 + .14*(.5+.5*math.sin(p.x*6.3+p.z*7.9+p.y*3.1))
                colors.data[vert.index].color = (shade*tile_var, shade*tile_var, shade*tile_var, 1)
            else:
                colors.data[vert.index].color = (shade, shade, shade, 1)

excludes = tuple(e for e in cli.exclude.split(",") if e)
target_roots = [r for r in roots if (not cli.prefix or r["assetKey"].startswith(cli.prefix)) and not r["assetKey"].startswith(excludes)]
if not cli.prefix or cli.prefix.startswith("unit:"):
    exec(compile((project / "scripts/blender/human-figures.py").read_text(encoding="utf-8"), "human-figures.py", "exec"))

for i, root in enumerate(target_roots):
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
        print(f"Refined {i + 1}/{len(target_roots)} models", flush=True)

def export(name, near):
    bpy.ops.object.select_all(action="DESELECT")
    selected = []
    for root in target_roots:
        for obj in descendants(root):
            if not near and obj.get("nearOnly"):
                continue
            obj.select_set(True)
            selected.append(obj)
    if not near:
        for obj in selected:
            for mod in list(obj.modifiers):
                if mod.name == "Crafted edges":
                    obj.modifiers.remove(mod)
    if near:
        for obj in selected:
            if obj.type != "MESH" or obj.get("skipCraftedBevel") or obj.get("assetMaterial") in ["leaf", "leafDark", "snow"]:
                continue
            if any(mod.name == "Crafted edges" for mod in obj.modifiers):
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
(out / "report.json").write_text(json.dumps({"models": len(target_roots), "keys": sorted(r["assetKey"] for r in target_roots), "source": "original game assets and authored Blender geometry",
                                             "features": ["weathered ore shapes", "solid gold seams", "branched fruit canes", "closed shrub leaflets", "civic arcades", "detailed gables", "field packs and visors", "species-shaped crowns", "curved tapered trunks", "closed leaf tips", "branched winter boughs", "patchy snow", "smooth volumetric foliage", "adult figures", "nested joints", "solid worker tools", "slate tiles", "beveled edges", "baked vertex shading"]}, indent=2), encoding="utf-8")
print("Blender catalogue art pass complete.", flush=True)
