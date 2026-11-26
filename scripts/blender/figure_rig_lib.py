"""
Shared Blender 4.5 LTS Studio Character Rig & Articulation Library
==================================================================
Loads the studio-sculpted, articulated base human & mounted cavalry rigs from
`art/figures/frontier-figures.blend` so newly authored units (Skirmisher,
Chu-Ko-Nu, Fire Lancer, all 5 Hero Generals, etc.) inherit 100% native:
  - 2-bone Terrain Foot IK (`bindFootJoints`) on foot units
  - 3-bone Terrain-Adaptive Galloping Horse Hoof IK (`articulated-hooves-v1`)
    on mounted units
  - Full hierarchical upper-body joints (`torso`, `head`, `cape`, `arm`,
    `forearm`) for idle breathing, running strides, cape flutter, and combat
    animations
  - Real Blender BVH hemisphere raycast Vertex AO (`BakedDepth`)
  - Spoked rotating siege wheels (`wheel`) for Mangonels & Trebuchets
"""
import math
from pathlib import Path
import bpy
import bmesh
from mathutils import Euler, Matrix, Vector
from mathutils.bvhtree import BVHTree


def _descendants(obj):
    return [obj] + [p for c in obj.children for p in _descendants(c)]


def standing_motion_joints():
    """Exact Three.js Y-up motion dicts matching frontier-figures.blend standing adults."""
    torso = {"type": "torso", "pivot": [0.0, 1.28, 0.0], "side": 1}
    head = {"type": "head", "pivot": [0.0, 2.14, 0.0], "side": 1, "parent": torso}
    cape = {"type": "cape", "pivot": [0.0, 1.98, -0.15], "side": 1, "parent": torso}
    arm_l = {"type": "arm", "pivot": [-0.35, 1.925, 0.0], "side": -1, "parent": torso}
    arm_r = {"type": "arm", "pivot": [0.35, 1.925, 0.0], "side": 1, "parent": torso}
    fore_l = {"type": "forearm", "pivot": [-0.46, 1.63, 0.035], "side": -1, "parent": arm_l}
    fore_r = {"type": "forearm", "pivot": [0.46, 1.63, 0.035], "side": 1, "parent": arm_r}
    return {
        "torso": torso,
        "head": head,
        "cape": cape,
        "arm_l": arm_l,
        "arm_r": arm_r,
        "fore_l": fore_l,
        "fore_r": fore_r,
    }


def mounted_motion_joints():
    """Exact Three.js Y-up motion dicts matching frontier-figures.blend mounted riders."""
    torso = {"type": "torso", "pivot": [0.0, 2.06, 0.0], "side": 1}
    head = {"type": "head", "pivot": [0.0, 2.92, 0.0], "side": 1, "parent": torso}
    cape = {"type": "cape", "pivot": [0.0, 2.76, -0.15], "side": 1, "parent": torso}
    arm_l = {"type": "arm", "pivot": [-0.35, 2.705, 0.0], "side": -1, "parent": torso}
    arm_r = {"type": "arm", "pivot": [0.35, 2.705, 0.0], "side": 1, "parent": torso}
    fore_l = {"type": "forearm", "pivot": [-0.46, 2.41, 0.035], "side": -1, "parent": arm_l}
    fore_r = {"type": "forearm", "pivot": [0.46, 2.41, 0.035], "side": 1, "parent": arm_r}
    return {
        "torso": torso,
        "head": head,
        "cape": cape,
        "arm_l": arm_l,
        "arm_r": arm_r,
        "fore_l": fore_l,
        "fore_r": fore_r,
    }


def _yup_to_blender(p):
    """Convert Three.js Y-up (+Z forward) point to Blender Z-up (-Y forward)."""
    return Vector((p[0], -p[2], p[1]))


def _make_horse_leg_mesh(root, col, name, role, mats, motion, vertices, faces):
    data = bpy.data.meshes.new(name)
    data.from_pydata([_yup_to_blender(v) for v in vertices], [], faces)
    data.update()
    obj = bpy.data.objects.new(name, data)
    col.objects.link(obj)
    obj.parent = root
    obj["assetMaterial"] = role
    obj["motion"] = motion
    obj["horseLegPart"] = name
    data.materials.append(mats[role])

    uv = data.uv_layers.new(name="UVMap")
    for loop in data.loops:
        p = data.vertices[loop.vertex_index].co
        uv.data[loop.index].uv = (p.x * 2.0 + p.y * 0.3, p.z * 1.5)

    colors = data.color_attributes.new(name="BakedDepth", type="FLOAT_COLOR", domain="POINT")
    data.color_attributes.active_color = colors
    for v in data.vertices:
        p = v.co
        shade = 0.91 + 0.04 * math.sin(p.x * 9.0 + p.y * 7.0 + p.z * 8.0)
        colors.data[v.index].color = (shade, shade, shade, 1.0)
    for face in data.polygons:
        face.use_smooth = True
    return obj


def _build_articulated_horse_legs(root, col, prefix, coat_role, mats):
    """Build the 12 exact articulated horse limb + hoof meshes matching mounted-footing.js."""
    created = []

    def add_limb(motion, start, end, profiles, label):
        a, b = Vector(start), Vector(end)
        direction = (b - a).normalized()
        u = direction.cross(Vector((0.0, 0.0, 1.0)))
        if u.length < 0.001:
            u = direction.cross(Vector((1.0, 0.0, 0.0)))
        u.normalize()
        v = direction.cross(u).normalized()
        sides = 10
        vertices = []
        for t, r in profiles:
            center = a.lerp(b, t)
            for i in range(sides):
                ang = i * math.tau / sides
                vertices.append(tuple(center + (u * math.cos(ang) + v * math.sin(ang)) * r))
        faces = [
            tuple(range(sides - 1, -1, -1)),
            tuple((len(profiles) - 1) * sides + i for i in range(sides)),
        ]
        for row in range(len(profiles) - 1):
            for i in range(sides):
                j = (i + 1) % sides
                faces.append((row * sides + i, row * sides + j, (row + 1) * sides + j, (row + 1) * sides + i))
        created.append(_make_horse_leg_mesh(root, col, f"{prefix}_{label}", coat_role, mats, motion, vertices, faces))

    def add_hoof(motion, x, z, label):
        vertices = []
        for y, width, front, back in [(0.0, 0.105, 0.12, -0.12), (0.18, 0.095, 0.105, -0.105), (0.25, 0.075, 0.075, -0.075)]:
            vertices.extend([
                (x - width, y, z + back),
                (x + width, y, z + back),
                (x + width, y, z + front),
                (x - width, y, z + front),
            ])
        faces = [(3, 2, 1, 0), (8, 9, 10, 11)]
        for row in range(2):
            for i in range(4):
                j = (i + 1) % 4
                faces.append((row * 4 + i, row * 4 + j, (row + 1) * 4 + j, (row + 1) * 4 + i))
        created.append(_make_horse_leg_mesh(root, col, f"{prefix}_{label}", "mane", mats, motion, vertices, faces))

    coords = [(x, z) for x in (-0.3, 0.3) for z in (-0.58, 0.59)]
    for index, (x, z) in enumerate(coords):
        side = (1 if x > 0 else -1) * (1 if z > 0 else -1)
        hip = {"type": "horseleg", "pivot": [x, 1.18, z], "side": side, "legIndex": index}
        knee = {"type": "horseknee", "pivot": [x, 0.66, z + 0.04], "side": side, "legIndex": index, "parent": hip}
        ankle = {"type": "horsehoof", "pivot": [x, 0.20, z - 0.02], "side": side, "legIndex": index, "parent": knee}
        add_limb(hip, hip["pivot"], knee["pivot"], [(0.0, 0.115), (0.25, 0.12), (0.7, 0.10), (1.0, 0.085)], f"upper_{index}")
        add_limb(knee, knee["pivot"], ankle["pivot"], [(0.0, 0.085), (0.25, 0.078), (0.75, 0.062), (1.0, 0.065)], f"lower_{index}")
        add_hoof(ankle, x, z - 0.02, f"hoof_{index}")

    return created


def load_studio_figure(
    project_root,
    src_unit_type,
    new_asset_key,
    mats,
    col=None,
    strip_suffixes=(),
    replace_horse_legs=False,
    horse_coat_role=None,
    armor_override=None,
):
    """
    Import a studio-refined articulated figure from `art/figures/frontier-figures.blend`,
    detach unwanted weapons/helms, optionally upgrade horse legs to `articulated-hooves-v1`,
    and return `(root, anchors, joints)`.
    """
    if col is None:
        col = bpy.context.scene.collection

    blend_path = Path(project_root) / "art" / "figures" / "frontier-figures.blend"
    assert blend_path.is_file(), f"Missing studio figures file: {blend_path}"

    # Load all objects from the lightweight studio figure file, keep only src_unit_type's subtree
    with bpy.data.libraries.load(str(blend_path), link=False) as (data_from, data_to):
        data_to.objects = list(data_from.objects)

    loaded = [o for o in data_to.objects if o is not None]
    target_key = f"unit:{src_unit_type}"
    src_root = next((o for o in loaded if o.get("assetKey") == target_key), None)
    assert src_root is not None, f"Could not find {target_key} in {blend_path}"

    subtree = set(_descendants(src_root))
    for obj in loaded:
        if obj not in subtree:
            bpy.data.objects.remove(obj, do_unlink=True)

    # Locate sculpted anatomical anchor centers in Blender Z-up coordinates
    mesh_children = [o for o in subtree if o is not src_root and o.type == "MESH"]

    def find_anchor(mtype, side, role):
        for o in mesh_children:
            m = o.get("motion")
            if m and m.get("type") == mtype and m.get("side") == side and o.get("assetMaterial") == role:
                return o
        return None

    hand_r = find_anchor("forearm", 1, "skin")
    hand_l = find_anchor("forearm", -1, "skin")
    head_obj = find_anchor("head", 1, "skin")
    assert hand_r and hand_l and head_obj, f"Missing anchor meshes in {target_key}"

    def obj_center(o):
        pts = [o.matrix_world @ Vector(c) for c in o.bound_box]
        return sum(pts, Vector((0.0, 0.0, 0.0))) / len(pts)

    hr = obj_center(hand_r)
    hl = obj_center(hand_l)
    hc = obj_center(head_obj)
    fwd_sign = -1.0 if hr.y < 0.0 else 1.0

    unit_name = new_asset_key.split(":", 1)[1]
    prefix = f"asset__unit__{unit_name}"

    root = bpy.data.objects.new(prefix, None)
    root.empty_display_type = "PLAIN_AXES"
    root["assetKey"] = new_asset_key
    col.objects.link(root)

    # Copy kept studio anatomy parts under our new root with unique names
    kept_idx = 0
    for src in mesh_children:
        m = src.get("motion")
        if replace_horse_legs and m and m.get("type") == "horseleg":
            bpy.data.objects.remove(src, do_unlink=True)
            continue
        if any(src.name.endswith(suf) for suf in strip_suffixes):
            bpy.data.objects.remove(src, do_unlink=True)
            continue

        # Normalize role overrides (e.g., Sun Sovereign white horse, Raven black horse, Jade lamellar)
        role = src.get("assetMaterial") or "steel"
        if horse_coat_role and role == "horse":
            role = horse_coat_role
            src["assetMaterial"] = role
        if armor_override and role == "steel":
            role = armor_override
            src["assetMaterial"] = role

        # Ensure unique object & mesh data name across the entire GLB
        clean_tail = src.name.replace(f"asset__unit__{src_unit_type}_", "").replace(" ", "_")
        unique_name = f"{prefix}_{clean_tail}_{kept_idx}"
        kept_idx += 1
        src.name = unique_name
        src.data.name = unique_name
        src.parent = root

        if role in mats:
            src.data.materials.clear()
            src.data.materials.append(mats[role])

        # Ensure an active color attribute exists for export_vertex_color="ACTIVE"
        if not src.data.color_attributes:
            ca = src.data.color_attributes.new(name="BakedDepth", type="BYTE_COLOR", domain="POINT")
            src.data.color_attributes.active_color = ca
            for item in ca.data:
                item.color = (0.94, 0.94, 0.94, 1.0)
        elif src.data.color_attributes.active_color is None:
            src.data.color_attributes.active_color = src.data.color_attributes[0]

        col.objects.link(src)

    bpy.data.objects.remove(src_root, do_unlink=True)

    # Optionally attach the 12 exact 3-segment articulated horse legs + hooves!
    if replace_horse_legs:
        coat = horse_coat_role or "horse"
        _build_articulated_horse_legs(root, col, prefix, coat, mats)

    model3d = {
        "kind": "unit",
        "type": unit_name,
        "articulated": True,
        "figure": "adult",
        "variant": "standard",
        "artRevision": "field-gear",
        "figureRevision": "field-forms-v1",
    }
    if replace_horse_legs:
        model3d["horseLegRevision"] = "articulated-hooves-v1"
    root["model3d"] = model3d

    joints = mounted_motion_joints() if replace_horse_legs else standing_motion_joints()
    anchors = {
        "hr": hr,
        "hl": hl,
        "hc": hc,
        "fwd": fwd_sign,
        "prefix": prefix,
    }
    return root, anchors, joints


def add_unit_part(root, col, name, bm, role, mats, motion_dict=None, smooth=False):
    """Convert a closed bmesh into an articulated child mesh with triplanar UVs and motion tag."""
    if len(bm.verts) == 0:
        bm.free()
        return None
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    uv_layer = bm.loops.layers.uv.verify()
    for f in bm.faces:
        f.normal_update()
        n = f.normal
        ax, ay, az = abs(n.x), abs(n.y), abs(n.z)
        for loop in f.loops:
            co = loop.vert.co
            if az >= ax and az >= ay:
                loop[uv_layer].uv = (co.x * 1.4, co.y * 1.4)
            elif ax >= ay:
                loop[uv_layer].uv = (co.y * 1.4, co.z * 1.4)
            else:
                loop[uv_layer].uv = (co.x * 1.4, co.z * 1.4)

    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    for poly in mesh.polygons:
        poly.use_smooth = smooth
    mesh.materials.append(mats[role])

    obj = bpy.data.objects.new(name, mesh)
    obj["assetMaterial"] = role
    if motion_dict is not None:
        obj["motion"] = motion_dict
    obj.parent = root
    col.objects.link(obj)
    return obj


def add_flowing_cape(root, col, name, role, mats, cape_motion, z_top=1.97, length=1.06, width_top=0.58, width_flare=0.22, fwd_sign=-1.0):
    """
    Create a closed, 2-sided rippled cloth cloak parented to `cape_motion` so the
    engine billows it with wind, weather, and running speed!
    Coordinates are Blender Z-up where back direction is `-fwd_sign` (+Y when fwd_sign=-1).
    """
    bm = bmesh.new()
    back = -fwd_sign  # +1.0 (+Y is behind the figure's back)
    verts = []
    for layer in (0.0, 0.032):
        for row in range(5):
            v = row / 4.0
            for col_i in range(7):
                u = col_i / 6.0
                x = (u - 0.5) * (width_top + v * width_flare)
                z = z_top - v * length
                ripple = math.sin(u * math.tau * 2.0) * (0.025 + v * 0.035)
                y = back * (0.20 + v * 0.09 + layer) + ripple
                verts.append(bm.verts.new((x, y, z)))

    for row in range(4):
        for col_i in range(6):
            a = row * 7 + col_i
            bm.faces.new((verts[a], verts[a + 1], verts[a + 8], verts[a + 7]))
            bm.faces.new((verts[a + 35], verts[a + 42], verts[a + 43], verts[a + 36]))
    for col_i in range(6):
        bm.faces.new((verts[col_i], verts[col_i + 35], verts[col_i + 36], verts[col_i + 1]))
        bm.faces.new((verts[28 + col_i], verts[29 + col_i], verts[64 + col_i], verts[63 + col_i]))
    for row in range(4):
        bm.faces.new((verts[row * 7], verts[(row + 1) * 7], verts[(row + 1) * 7 + 35], verts[row * 7 + 35]))
        bm.faces.new((verts[row * 7 + 6], verts[row * 7 + 41], verts[(row + 1) * 7 + 41], verts[(row + 1) * 7 + 6]))

    return add_unit_part(root, col, name, bm, role, mats, cape_motion, smooth=True)


def add_spoked_wheel(root, col, name_prefix, mats, x_inner, x_outer, wy, wz, radius, spokes=6):
    """
    Build a rotating closed-manifold spoked timber & iron siege wheel at Blender
    `(x_mid, wy, wz)` with exact Y-up Three.js wheel motion pivot `[x_mid, wz, -wy]`.
    """
    x_mid = (x_inner + x_outer) * 0.5
    thick = abs(x_outer - x_inner)
    sign_out = 1.0 if x_outer >= x_inner else -1.0
    wheel_motion = {"type": "wheel", "pivot": [round(x_mid, 4), round(wz, 4), round(-wy, 4)], "side": 1}

    bm_dw = bmesh.new()
    bm_wd = bmesh.new()
    bm_ir = bmesh.new()

    def cyl_x(bm, x0, x1, r, segs=12):
        v0, v1 = Vector((x0, wy, wz)), Vector((x1, wy, wz))
        ring0, ring1 = [], []
        for i in range(segs):
            a = i * math.tau / segs
            dy, dz = math.cos(a) * r, math.sin(a) * r
            ring0.append(bm.verts.new((v0.x, wy + dy, wz + dz)))
            ring1.append(bm.verts.new((v1.x, wy + dy, wz + dz)))
        for i in range(segs):
            j = (i + 1) % segs
            bm.faces.new((ring0[i], ring0[j], ring1[j], ring1[i]))
        bm.faces.new(list(reversed(ring0)))
        bm.faces.new(ring1)

    def box_rot(bm, center, size, rot_x=0.0):
        mat = Matrix.Translation(center) @ Euler((rot_x, 0.0, 0.0), "XYZ").to_matrix().to_4x4() @ Matrix.Diagonal((size[0], size[1], size[2], 1.0))
        bmesh.ops.create_cube(bm, size=1.0, matrix=mat)

    # Outer iron tire + solid recessed oak wheel felloe + proud rotating spokes + iron hubcap
    cyl_x(bm_ir, x_inner + sign_out * 0.02, x_outer + sign_out * 0.02, radius, segs=14)
    cyl_x(bm_dw, x_inner, x_outer, radius * 0.94, segs=14)
    cyl_x(bm_wd, x_inner - sign_out * 0.01, x_outer + sign_out * 0.015, radius * 0.72, segs=12)
    # Prominent radial timber spokes protruding slightly past the wheel face so rotation is super crisp!
    for i in range(spokes // 2):
        ang = (i / (spokes // 2)) * math.pi
        box_rot(bm_dw, (x_mid + sign_out * 0.02, wy, wz), (thick + 0.06, radius * 1.72, radius * 0.19), rot_x=ang)
        box_rot(bm_ir, (x_mid + sign_out * 0.03, wy, wz), (thick + 0.07, radius * 0.24, radius * 0.24), rot_x=ang)
    # Iron axle hub boss
    cyl_x(bm_ir, x_inner - sign_out * 0.02, x_outer + sign_out * 0.09, radius * 0.26, segs=8)

    created = []
    for tag, bm, role, sm in (
        ("Rim", bm_dw, "darkwood", False),
        ("Face", bm_wd, "wood", False),
        ("Tire", bm_ir, "iron", True),
    ):
        obj = add_unit_part(root, col, f"{name_prefix}_{tag}", bm, role, mats, wheel_motion, smooth=sm)
        if obj is not None:
            created.append(obj)
    return created


def bake_figure_ao(root_obj, target_objs):
    """Bake real Blender BVH hemisphere raycast Vertex AO into `BakedDepth` on created gear."""
    if not target_objs:
        return
    ao_bm = bmesh.new()
    inv_root = root_obj.matrix_world.inverted()
    for obj in _descendants(root_obj)[1:]:
        if obj.type != "MESH" or not obj.data.polygons:
            continue
        xf = inv_root @ obj.matrix_world
        tmp = bmesh.new()
        tmp.from_mesh(obj.data)
        bmesh.ops.transform(tmp, matrix=xf, verts=tmp.verts)
        vmap = [ao_bm.verts.new(v.co) for v in tmp.verts]
        for f in tmp.faces:
            try:
                ao_bm.faces.new([vmap[v.index] for v in f.verts])
            except ValueError:
                pass
        tmp.free()
    bmesh.ops.triangulate(ao_bm, faces=list(ao_bm.faces))
    bvh = BVHTree.FromBMesh(ao_bm)
    ao_bm.free()

    samples = []
    golden = math.pi * (3.0 - math.sqrt(5.0))
    for i in range(16):
        z = 0.14 + 0.84 * (i + 0.5) / 16.0
        r = math.sqrt(max(0.0, 1.0 - z * z))
        theta = golden * i
        samples.append((r * math.cos(theta), r * math.sin(theta), z))

    for obj in target_objs:
        if obj is None or obj.type != "MESH":
            continue
        mesh = obj.data
        colors = mesh.color_attributes.get("BakedDepth") or mesh.color_attributes.new(
            name="BakedDepth", type="BYTE_COLOR", domain="POINT"
        )
        mesh.color_attributes.active_color = colors
        xf = inv_root @ obj.matrix_world
        nxf = xf.to_3x3()
        for v in mesh.vertices:
            p = xf @ v.co
            n = (nxf @ v.normal).normalized()
            if n.length < 1e-4:
                n = Vector((0.0, 0.0, 1.0))
            ref = Vector((1.0, 0.0, 0.0)) if abs(n.x) < 0.85 else Vector((0.0, 1.0, 0.0))
            t = n.cross(ref).normalized()
            bt = n.cross(t).normalized()
            occ = 0.0
            origin = p + n * 0.006
            for sx, sy, sz in samples:
                d = (t * sx + bt * sy + n * sz).normalized()
                hit = bvh.ray_cast(origin, d, 0.58)
                if hit[0] is not None:
                    occ += (1.0 - hit[3] / 0.58) ** 0.85
            ao = 1.0 - 0.42 * (occ / len(samples))
            sky = 0.90 + 0.10 * max(-1.0, min(1.0, n.z))
            shade = max(0.45, min(1.0, ao * sky))
            colors.data[v.index].color = (shade, shade, shade, 1.0)
