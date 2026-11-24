"""
Blender 4.5 LTS Authoring Script — Epic Frontier Landscapes, Jungle, Battlefield Props & Wildlife
==================================================================================================
Generates 17 studio-sculpted, vertex-colored, closed-manifold 3D models into
`frontier-epic-props-raw.glb` (meshopt-packed via gltfpack into
`src/assets3d/frontier-epic-props.glb`):

  Waterfalls & River Features:
    - waterfall:single   (Single-drop cliff amphitheater + animated water chute + splash foam)
    - waterfall:tiered   (Two-tier stepped rock waterfall + upper/lower chutes + plunge foam)
    - rapid:rock         (Water-worn river boulder cluster with trailing whitewater foam collar)
    - ice:floe           (Faceted drifting glacial river ice floe with frosty snowy top cap)

  Tropical Jungle & Ancient Temple Coast Biome:
    - tree:jungle:0      (Curved coastal coconut palm with 10 arched pinnate fronds & coconuts)
    - tree:jungle:1      (Ancient giant banyan tree with buttress trunk, aerial prop roots & wide canopy)
    - tree:jungle:2      (Lush tropical rainforest canopy tree with layered emerald crowns)
    - tree:jungle:3      (Riverbank mangrove tree with arched stilt roots & dense emerald leaves)
    - temple:jungle      (4-tier stepped ancient mossy stone jungle temple with grand staircase & spire)
    - temple:ruin        (Overgrown ancient jungle stone shrine gateway)

  Living Battlefield Props & Timber Ravine Bridge:
    - bridge:timber      (Timber trestle bridge with log piers, diagonal bracing, planks & rails)
    - prop:stakes        (Wooden defensive spike barricade / cheval-de-frise)
    - prop:campfire      (Stone-ringed war-camp campfire with firewood, glowing embers & iron kettle)
    - prop:tent          (Pitched medieval war-camp canvas tent with ridge pole & rolled entrance)
    - prop:crates        (Bound wooden supply crates & iron-hooped barrels)

  Roaming Wildlife:
    - wildlife:deer      (Sculpted Red Deer Stag with branching antlers, neck, muzzle & tapered legs)
    - wildlife:doe       (Sculpted Red Deer Hind / Doe for natural grazing herds)

Coordinate convention:
  Blender X -> Three.js X
  Blender Z -> Three.js Y (up)
  Blender -Y -> Three.js Z (front = -Y in Blender -> +Z in Three.js)
"""
import argparse
import json
import math
import os
import random
import sys
from pathlib import Path
import bpy
import bmesh
from mathutils import Euler, Matrix, Vector


def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def clamp(v, lo=0.0, hi=1.0):
    return max(lo, min(hi, v))


def lerp3(a, b, t):
    t = clamp(t)
    return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t)


def hash3(x, y, z):
    n = math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453123
    return n - math.floor(n)


def make_vc_material(name, roughness=0.88, metallic=0.0, alpha=1.0, emission=None, emission_strength=0.0):
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    bsdf = nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Roughness"].default_value = roughness
        bsdf.inputs["Metallic"].default_value = metallic
        bsdf.inputs["Alpha"].default_value = alpha
        vc = nodes.new("ShaderNodeVertexColor")
        vc.layer_name = "Color"
        links.new(vc.outputs["Color"], bsdf.inputs["Base Color"])
        if emission is not None and "Emission Color" in bsdf.inputs:
            bsdf.inputs["Emission Color"].default_value = (*emission, 1.0)
            bsdf.inputs["Emission Strength"].default_value = emission_strength
    if alpha < 0.99:
        mat.blend_method = "BLEND"
    return mat


def write_triplanar_uv(bm, uv_scale=0.35):
    uv_layer = bm.loops.layers.uv.verify()
    for f in bm.faces:
        n = f.normal
        ax, ay, az = abs(n.x), abs(n.y), abs(n.z)
        for loop in f.loops:
            co = loop.vert.co
            if az >= ax and az >= ay:
                loop[uv_layer].uv = (co.x * uv_scale + 0.5, co.y * uv_scale + 0.5)
            elif ax >= ay:
                loop[uv_layer].uv = (co.y * uv_scale + 0.5, co.z * uv_scale + 0.5)
            else:
                loop[uv_layer].uv = (co.x * uv_scale + 0.5, co.z * uv_scale + 0.5)


def finalize_mesh(bm, name, mat, color_fn, uv_scale=0.35, preserve_uv=False, recalc_normals=True, smooth=False):
    if recalc_normals:
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.normal_update()
    if not preserve_uv:
        write_triplanar_uv(bm, uv_scale=uv_scale)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()

    colors = mesh.color_attributes.new(name="Color", type="FLOAT_COLOR", domain="CORNER")
    mesh.color_attributes.active_color = colors
    mesh.color_attributes.render_color_index = 0
    verts = mesh.vertices
    loops = mesh.loops
    for poly in mesh.polygons:
        poly.use_smooth = smooth
        fn = poly.normal
        for li in poly.loop_indices:
            v = verts[loops[li].vertex_index]
            n = v.normal if smooth else fn
            c = color_fn(v.co, n)
            colors.data[li].color = (clamp(c[0]), clamp(c[1]), clamp(c[2]), 1.0)

    mesh.materials.append(mat)
    return mesh


def attach_mesh(root, name, mesh, role):
    obj = bpy.data.objects.new(name, mesh)
    obj["assetMaterial"] = role
    bpy.context.scene.collection.objects.link(obj)
    obj.parent = root
    return obj


def make_root(asset_key, x_offset=0.0):
    root = bpy.data.objects.new(asset_key.replace(":", "_"), None)
    root.empty_display_type = "PLAIN_AXES"
    root.location = (x_offset, 0.0, 0.0)
    root["assetKey"] = asset_key
    bpy.context.scene.collection.objects.link(root)
    return root


# ---------------------------------------------------------------------------
# Geometry primitives into bmesh
# ---------------------------------------------------------------------------
def add_box(bm, center, size, rot=(0.0, 0.0, 0.0), bevel=0.0):
    mat = Matrix.Translation(center) @ Euler(rot, "XYZ").to_matrix().to_4x4() @ Matrix.Diagonal((size[0], size[1], size[2], 1.0))
    res = bmesh.ops.create_cube(bm, size=1.0, matrix=mat)
    if bevel > 0.0:
        verts = res["verts"]
        edges = [e for e in bm.edges if e.verts[0] in verts and e.verts[1] in verts]
        bmesh.ops.bevel(bm, geom=edges, offset=bevel, segments=1, affect="EDGES", clamp_overlap=True)
    return res["verts"]


def add_tapered_cylinder(bm, p0, p1, r0, r1, segs=8, cap=True):
    v0 = Vector(p0)
    v1 = Vector(p1)
    axis = v1 - v0
    length = axis.length
    if length < 1e-5:
        return []
    z_dir = axis.normalized()
    up = Vector((0, 0, 1)) if abs(z_dir.z) < 0.95 else Vector((1, 0, 0))
    x_dir = up.cross(z_dir).normalized()
    y_dir = z_dir.cross(x_dir).normalized()
    ring0, ring1 = [], []
    for i in range(segs):
        a = (i / segs) * math.tau
        ca, sa = math.cos(a), math.sin(a)
        d = x_dir * ca + y_dir * sa
        ring0.append(bm.verts.new(v0 + d * r0))
        ring1.append(bm.verts.new(v1 + d * r1))
    for i in range(segs):
        ni = (i + 1) % segs
        bm.faces.new((ring0[i], ring0[ni], ring1[ni], ring1[i]))
    if cap:
        if r0 > 1e-4:
            bm.faces.new(list(reversed(ring0)))
        if r1 > 1e-4:
            bm.faces.new(ring1)
    return ring0 + ring1


def add_tube(bm, points, radii, segs=8, cap_ends=True):
    if len(points) < 2:
        return []
    rings = []
    all_verts = []
    prev_x = None
    for idx, (pt, rad) in enumerate(zip(points, radii)):
        p = Vector(pt)
        if idx == 0:
            tangent = (Vector(points[1]) - p).normalized()
        elif idx == len(points) - 1:
            tangent = (p - Vector(points[-2])).normalized()
        else:
            tangent = (Vector(points[idx + 1]) - Vector(points[idx - 1])).normalized()
        if tangent.length < 1e-5:
            tangent = Vector((0, 0, 1))
        if prev_x is None:
            ref = Vector((1, 0, 0)) if abs(tangent.x) < 0.85 else Vector((0, 1, 0))
            x_dir = ref.cross(tangent).normalized()
        else:
            x_dir = (prev_x - tangent * prev_x.dot(tangent))
            if x_dir.length < 1e-4:
                ref = Vector((1, 0, 0)) if abs(tangent.x) < 0.85 else Vector((0, 1, 0))
                x_dir = ref.cross(tangent)
            x_dir.normalize()
        y_dir = tangent.cross(x_dir).normalized()
        prev_x = x_dir
        ring = []
        for i in range(segs):
            a = (i / segs) * math.tau
            d = x_dir * math.cos(a) + y_dir * math.sin(a)
            v = bm.verts.new(p + d * rad)
            ring.append(v)
            all_verts.append(v)
        rings.append(ring)
    for r_idx in range(len(rings) - 1):
        r0, r1 = rings[r_idx], rings[r_idx + 1]
        for i in range(segs):
            ni = (i + 1) % segs
            bm.faces.new((r0[i], r0[ni], r1[ni], r1[i]))
    if cap_ends:
        bm.faces.new(list(reversed(rings[0])))
        bm.faces.new(rings[-1])
    return all_verts


def add_sculpted_rock(bm, center, scale, seed=1, subdiv=2, flat_top=False, strata=0.14):
    res = bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=1.0)
    verts = res["verts"]
    cx, cy, cz = center
    sx, sy, sz = scale
    for v in verts:
        p = v.co.copy()
        n1 = math.sin(p.x * 3.1 + seed * 1.7) * math.cos(p.y * 2.7 - seed) * 0.18
        n2 = math.sin(p.z * 5.2 + p.x * 2.1 + seed * 2.3) * 0.11
        st = math.tanh(math.sin(p.z * 9.0 + seed) * 2.4) * strata
        flare = 1.24 if p.z < -0.15 else (1.0 - max(0.0, p.z) * 0.22)
        if flat_top and p.z > 0.35:
            p.z = 0.35 + (p.z - 0.35) * 0.28
        v.co = Vector((
            cx + p.x * sx * flare * (1.0 + n1 + st),
            cy + p.y * sy * flare * (1.0 - n1 * 0.7 + n2 + st),
            cz + p.z * sz * (1.0 + n2 * 0.6),
        ))
    return verts


def add_foliage_lobe(bm, center, radii, seed=1, subdiv=2):
    res = bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=1.0)
    verts = res["verts"]
    cx, cy, cz = center
    rx, ry, rz = radii
    for v in verts:
        p = v.co.copy()
        ang = math.atan2(p.y, p.x)
        # Organic scalloped botanical leaf-cluster contour (layered leafy boughs, never round balls!)
        scallop = (
            1.0
            + 0.22 * math.sin(ang * 5.0 + seed * 1.3 + p.z * 2.4)
            + 0.14 * math.cos(ang * 8.0 - seed * 0.9 + p.z * 3.8)
            + 0.10 * math.sin(p.z * 6.0 + seed * 2.1)
        )
        if p.z < 0.0:
            p.z *= 0.56
        elif p.z > 0.35:
            p.z = 0.35 + (p.z - 0.35) * 0.78
        v.co = Vector((cx + p.x * rx * scallop, cy + p.y * ry * scallop, cz + p.z * rz * (0.94 + 0.12 * math.sin(ang * 3.0 + seed))))
    return verts


def add_canyon_pillar(bm, center, rx, ry, height, seed=1, flat_top=True, sides=14, rings=7):
    """Vertical striated basalt/granite gorge cliff column with flat grassy plateau rim."""
    cx, cy, cz = center
    ring_verts = []
    for r_i in range(rings):
        t = r_i / max(1, rings - 1)
        z = cz - 0.35 + t * (height + 0.35)
        if t < 0.18:
            prof = 1.22 - (t / 0.18) * 0.22
        elif t < 0.88:
            ledge = math.tanh(math.sin(t * math.pi * 4.0 + seed) * 2.4) * 0.045
            prof = 1.0 - (t - 0.18) * 0.16 + ledge
        else:
            prof = 0.86 * (1.0 - (t - 0.88) * (0.35 if flat_top else 1.4))
        row = []
        for s in range(sides):
            ang = (s / sides) * math.tau
            # Crisp vertical basalt columnar flutes (matches AoE:DE gorge cliffs!)
            flute = 0.90 + 0.13 * math.sin(ang * 5.0 + seed) + 0.08 * math.cos(ang * 9.0 - seed * 1.4)
            px = cx + math.cos(ang) * rx * prof * flute
            py = cy + math.sin(ang) * ry * prof * flute
            pz = z + (0.0 if r_i == 0 else 0.07 * math.sin(ang * 3.0 + seed) * t)
            row.append(bm.verts.new(Vector((px, py, pz))))
        ring_verts.append(row)
    bot_c = bm.verts.new(Vector((cx, cy, cz - 0.38)))
    top_c = bm.verts.new(Vector((cx, cy, cz + height + (0.04 if flat_top else 0.32))))
    for s in range(sides):
        sn = (s + 1) % sides
        bm.faces.new((ring_verts[0][sn], ring_verts[0][s], bot_c))
        bm.faces.new((ring_verts[-1][s], ring_verts[-1][sn], top_c))
    for i in range(rings - 1):
        for s in range(sides):
            sn = (s + 1) % sides
            bm.faces.new((ring_verts[i][s], ring_verts[i][sn], ring_verts[i + 1][sn], ring_verts[i + 1][s]))


def add_ribbon_surface(bm, rows_pts, uv_u_scale=1.0):
    """Creates a smooth double-sided ribbon or water curtain with clean directional UVs."""
    uv_layer = bm.loops.layers.uv.verify()
    grid = []
    n_rows = len(rows_pts)
    n_cols = len(rows_pts[0])
    for r in range(n_rows):
        row_v = [bm.verts.new(Vector(p)) for p in rows_pts[r]]
        grid.append(row_v)
    for r in range(n_rows - 1):
        v0 = r / (n_rows - 1)
        v1 = (r + 1) / (n_rows - 1)
        for c in range(n_cols - 1):
            u0 = (c / (n_cols - 1)) * uv_u_scale
            u1 = ((c + 1) / (n_cols - 1)) * uv_u_scale
            f = bm.faces.new((grid[r][c], grid[r][c + 1], grid[r + 1][c + 1], grid[r + 1][c]))
            uvs = ((u0, v0), (u1, v0), (u1, v1), (u0, v1))
            for loop, uv in zip(f.loops, uvs):
                loop[uv_layer].uv = uv


# ---------------------------------------------------------------------------
# Color shaders
# ---------------------------------------------------------------------------
def rock_color_fn(co, fn, moss=True, wet_z=1.5):
    # Warm sunlit limestone/granite canyon strata + vibrant AoE:DE emerald mossy turf plateau caps!
    base = (0.58, 0.56, 0.50)
    dark = (0.30, 0.30, 0.28)
    light = (0.80, 0.77, 0.69)
    moss_col = (0.34, 0.64, 0.22)
    h = clamp((co.z + 0.5) / 7.5)
    strata = math.sin(co.z * 6.5 + co.x * 0.7) * 0.5 + 0.5
    n = hash3(round(co.x * 2.5, 1), round(co.y * 2.5, 1), round(co.z * 2.5, 1))
    col = lerp3(dark, lerp3(base, light, strata * 0.55 + n * 0.25 + h * 0.20), 0.42 + h * 0.58)
    if wet_z > 0.0 and co.z < wet_z:
        wet = 1.0 - clamp(co.z / wet_z)
        col = lerp3(col, (0.20, 0.28, 0.30), wet * 0.45)
    if moss and fn.z > 0.48 and co.z > 1.1:
        m = clamp((fn.z - 0.48) / 0.30) * (0.72 + 0.28 * n)
        col = lerp3(col, moss_col, m * 0.90)
    return col


def wood_color_fn(co, fn, dark=False):
    n = math.sin(co.x * 9.0 + co.y * 7.0 + co.z * 4.0) * 0.5 + 0.5
    ao = 0.68 + 0.32 * clamp((co.z + 0.3) / 2.2)
    if dark:
        c = lerp3((0.26, 0.19, 0.13), (0.42, 0.31, 0.21), n)
    else:
        c = lerp3((0.42, 0.31, 0.20), (0.62, 0.47, 0.31), n)
    top_lift = 1.08 if fn.z > 0.5 else 0.94
    return (c[0] * ao * top_lift, c[1] * ao * top_lift, c[2] * ao * top_lift)


def jungle_leaf_color_fn(co, fn, top_z=7.0):
    # Vivid sunlit AoE:DE tropical palette: deep emerald shadows -> lush leaf midtones -> golden-lime sunlit crowns!
    h = clamp((co.z - 1.4) / max(1.6, top_z - 1.4))
    sun = clamp(fn.z * 0.52 + fn.x * 0.18 + 0.42)
    dapple = math.sin(co.x * 4.8 + co.y * 4.2 + co.z * 3.1) * 0.5 + 0.5
    n = hash3(round(co.x * 3.5, 1), round(co.y * 3.5, 1), round(co.z * 3.5, 1))
    deep = (0.09, 0.27, 0.11)
    mid = (0.21, 0.54, 0.18)
    sunlit = (0.50, 0.76, 0.22)
    c = lerp3(deep, mid, clamp(h * 0.52 + sun * 0.48))
    c = lerp3(c, sunlit, clamp(math.pow(clamp(h * 0.68 + sun * 0.52 - 0.15), 1.35) * 0.85 + dapple * 0.16 + n * 0.08))
    return c


# ---------------------------------------------------------------------------
# 1 & 2. WATERFALLS (Single-Drop & Two-Tier — Stratified Gorge Cliffs + Luminous Cascade!)
# ---------------------------------------------------------------------------
def build_waterfall(mats, tiered=False):
    key = "waterfall:tiered" if tiered else "waterfall:single"
    root = make_root(key)

    # A. Stratified vertical canyon gorge cliffs with lush mossy tops flanking the cascade
    bm_rock = bmesh.new()
    if not tiered:
        # Back cliff wall & highland gorge cheeks (vertical striated columns, flat grassy tops!)
        add_canyon_pillar(bm_rock, (0.0, 2.3, 0.0), 5.6, 2.5, 6.2, seed=11, flat_top=True, sides=14)
        add_canyon_pillar(bm_rock, (-5.6, 0.5, 0.0), 2.9, 2.8, 6.6, seed=21, flat_top=True, sides=14)
        add_canyon_pillar(bm_rock, (5.6, 0.5, 0.0), 2.9, 2.8, 6.5, seed=29, flat_top=True, sides=14)
        add_canyon_pillar(bm_rock, (-7.8, -0.7, 0.0), 2.6, 2.4, 4.1, seed=37, flat_top=True, sides=12)
        add_canyon_pillar(bm_rock, (7.8, -0.7, 0.0), 2.6, 2.4, 4.0, seed=43, flat_top=True, sides=12)
        # Wet plunge-pool boulders
        add_sculpted_rock(bm_rock, (-4.5, -2.5, 0.55), (1.6, 1.4, 0.95), seed=51, subdiv=2)
        add_sculpted_rock(bm_rock, (4.6, -2.4, 0.55), (1.7, 1.3, 1.00), seed=57, subdiv=2)
        add_sculpted_rock(bm_rock, (-2.3, -2.9, 0.30), (0.9, 0.8, 0.52), seed=63, subdiv=1)
        add_sculpted_rock(bm_rock, (2.5, -3.0, 0.30), (1.0, 0.8, 0.52), seed=67, subdiv=1)
    else:
        # Tall upper highland gorge + wide rocky mid-shelf + lower flanking striated basalt cheeks!
        add_canyon_pillar(bm_rock, (0.0, 3.8, 0.0), 6.2, 2.7, 8.6, seed=101, flat_top=True, sides=14)
        add_canyon_pillar(bm_rock, (0.0, 0.5, 0.0), 5.8, 2.4, 4.5, seed=109, flat_top=True, sides=14)
        add_canyon_pillar(bm_rock, (-6.0, 2.3, 0.0), 3.0, 2.9, 9.0, seed=113, flat_top=True, sides=14)
        add_canyon_pillar(bm_rock, (6.0, 2.3, 0.0), 3.0, 2.9, 8.9, seed=119, flat_top=True, sides=14)
        add_canyon_pillar(bm_rock, (-6.6, -1.1, 0.0), 2.9, 2.7, 5.2, seed=127, flat_top=True, sides=12)
        add_canyon_pillar(bm_rock, (6.6, -1.1, 0.0), 2.9, 2.7, 5.1, seed=131, flat_top=True, sides=12)
        add_canyon_pillar(bm_rock, (-8.8, -2.2, 0.0), 2.4, 2.2, 3.1, seed=133, flat_top=True, sides=10)
        add_canyon_pillar(bm_rock, (8.8, -2.2, 0.0), 2.4, 2.2, 3.0, seed=135, flat_top=True, sides=10)
        add_sculpted_rock(bm_rock, (-5.1, -4.1, 0.60), (1.8, 1.5, 1.05), seed=137, subdiv=2)
        add_sculpted_rock(bm_rock, (5.2, -4.0, 0.60), (1.8, 1.5, 1.05), seed=141, subdiv=2)

    mesh_rock = finalize_mesh(bm_rock, f"{key}_rock", mats["rock"], lambda co, fn: rock_color_fn(co, fn, moss=True, wet_z=1.8), smooth=False)
    attach_mesh(root, "CliffRock", mesh_rock, "rock")

    # B. Smooth luminous pouring water sheet + upper highland river headwaters lip!
    bm_water = bmesh.new()
    cols = 16
    if not tiered:
        profile = [
            (4.6, 6.26, 3.55),
            (2.4, 6.25, 3.65),
            (0.9, 6.18, 3.72),
            (-0.2, 5.72, 3.80),
            (-0.95, 4.65, 3.92),
            (-1.45, 3.20, 4.08),
            (-1.82, 1.60, 4.28),
            (-2.12, 0.04, 4.48),
        ]
    else:
        profile = [
            (6.0, 8.66, 3.75),
            (3.6, 8.65, 3.85),
            (2.2, 8.58, 3.92),
            (1.15, 7.95, 3.98),
            (0.55, 6.40, 4.10),
            (0.18, 4.75, 4.30),
            (-0.75, 4.55, 4.52),
            (-1.75, 4.18, 4.64),
            (-2.45, 2.90, 4.82),
            (-2.95, 1.45, 5.05),
            (-3.35, 0.04, 5.32),
        ]
    rows = []
    for r_i, (py, pz, hw) in enumerate(profile):
        row = []
        for c_i in range(cols):
            u = (c_i / (cols - 1)) * 2.0 - 1.0
            px = u * hw
            flute = math.sin(u * math.pi * 6.0 + r_i * 0.22) * 0.11 * (1.0 - abs(u) * 0.35)
            arch = (1.0 - u * u) * 0.34
            row.append((px, py - arch - flute, pz))
        rows.append(row)
    add_ribbon_surface(bm_water, rows, uv_u_scale=2.2)

    def water_sheet_color(co, fn):
        max_z = 8.7 if tiered else 6.3
        t = clamp(co.z / max_z)
        mid_foam = 0.58 if (tiered and 4.1 < co.z < 5.05) else 0.0
        crest = clamp((t - 0.78) / 0.22) * 0.68
        base = clamp((0.26 - t) / 0.26) * 0.90
        streak = (math.sin(co.x * 4.2) * 0.5 + 0.5) * 0.36
        # Deep crystal turquoise on upper highland pool -> bright dazzling whitewater on vertical drops!
        if fn.z > 0.75 and t > 0.92:
            return lerp3((0.18, 0.62, 0.88), (0.64, 0.90, 0.98), streak * 0.5)
        foam = clamp(max(crest, base, mid_foam) + streak)
        return lerp3((0.46, 0.84, 0.96), (0.98, 0.99, 1.0), foam)

    mesh_water = finalize_mesh(bm_water, f"{key}_sheet", mats["waterSheet"], water_sheet_color, preserve_uv=True, recalc_normals=False, smooth=True)
    attach_mesh(root, "WaterSheet", mesh_water, "waterSheet")

    # C. Smooth organic churning plunge-pool whitewater foam cushions (NO uniform bead row!)
    bm_foam = bmesh.new()
    base_y = -3.45 if tiered else -2.25
    foam_span = 4.95 if tiered else 4.05
    for i in range(10):
        u = (i / 9.0) * 2.0 - 1.0
        fx = u * foam_span + math.sin(i * 3.7) * 0.22
        fy = base_y - (1.0 - u * u) * 0.88 + math.cos(i * 2.3) * 0.28
        rad = (1.12 - abs(u) * 0.30) * (1.15 if tiered else 1.0) * (0.86 + 0.28 * hash3(i, 2.0, 3.0))
        add_foliage_lobe(bm_foam, (fx, fy, 0.34), (rad * 1.18, rad * 0.94, rad * 0.50), seed=200 + i * 7, subdiv=2)

    mesh_foam = finalize_mesh(bm_foam, f"{key}_foam", mats["foam"], lambda co, fn: lerp3((0.82, 0.95, 0.99), (1.0, 1.0, 1.0), clamp(fn.z * 0.6 + 0.4)), smooth=True)
    attach_mesh(root, "SplashFoam", mesh_foam, "foam")
    return root


# ---------------------------------------------------------------------------
# 3 & 4. RIVER RAPIDS ROCK & DRIFTING WINTER ICE FLOE
# ---------------------------------------------------------------------------
def build_rapid_rock(mats):
    root = make_root("rapid:rock")
    bm_r = bmesh.new()
    add_sculpted_rock(bm_r, (0.0, 0.0, 0.32), (1.05, 0.92, 0.62), seed=401, subdiv=2)
    add_sculpted_rock(bm_r, (0.85, -0.45, 0.22), (0.62, 0.55, 0.42), seed=409, subdiv=1)
    add_sculpted_rock(bm_r, (-0.75, 0.35, 0.18), (0.55, 0.48, 0.36), seed=419, subdiv=1)
    attach_mesh(root, "RapidBoulders", finalize_mesh(bm_r, "rapid_rock", mats["rock"], lambda co, fn: rock_color_fn(co, fn, moss=True, wet_z=0.55)), "rock")

    bm_f = bmesh.new()
    # Sculpted V-shaped whitewater collar around boulders
    for i in range(6):
        a = (i / 6.0) * math.tau
        fx, fy = math.cos(a) * 1.12, math.sin(a) * 1.02 - 0.18
        add_foliage_lobe(bm_f, (fx, fy, 0.07), (0.48, 0.42, 0.11), seed=430 + i * 5, subdiv=1)
    attach_mesh(root, "RapidFoam", finalize_mesh(bm_f, "rapid_foam", mats["foam"], lambda co, fn: lerp3((0.72, 0.90, 0.96), (0.98, 1.0, 1.0), clamp(fn.z * 0.5 + 0.5))), "foam")
    return root


def build_ice_floe(mats):
    root = make_root("ice:floe")
    bm = bmesh.new()
    rng = random.Random(512)
    pts = []
    segs = 9
    for i in range(segs):
        a = (i / segs) * math.tau
        r = 1.45 + rng.uniform(-0.32, 0.38)
        pts.append((math.cos(a) * r, math.sin(a) * r * 0.82))
    bot = [bm.verts.new((x * 1.04, y * 1.04, -0.14)) for x, y in pts]
    mid = [bm.verts.new((x * 1.0, y * 1.0, 0.14)) for x, y in pts]
    top = [bm.verts.new((x * 0.86, y * 0.86, 0.24)) for x, y in pts]
    for i in range(segs):
        ni = (i + 1) % segs
        bm.faces.new((bot[i], bot[ni], mid[ni], mid[i]))
        bm.faces.new((mid[i], mid[ni], top[ni], top[i]))
    bm.faces.new(list(reversed(bot)))
    bm.faces.new(top)

    def ice_col(co, fn):
        if fn.z > 0.72:
            return lerp3((0.86, 0.94, 0.98), (0.97, 0.99, 1.0), hash3(co.x, co.y, co.z))
        return lerp3((0.46, 0.76, 0.86), (0.76, 0.92, 0.97), clamp((co.z + 0.14) / 0.38))

    attach_mesh(root, "IceFloe", finalize_mesh(bm, "ice_floe", mats["ice"], ice_col), "ice")
    return root


# ---------------------------------------------------------------------------
# 5–8. TROPICAL JUNGLE TREES (Palm, Giant Banyan, Rainforest Canopy, Mangrove)
# ---------------------------------------------------------------------------
def build_jungle_palm(mats):
    root = make_root("tree:jungle:0")
    bm_t = bmesh.new()
    pts = [
        (0.0, 0.0, -0.15),
        (0.18, 0.08, 1.15),
        (0.45, 0.16, 2.55),
        (0.68, 0.20, 3.95),
        (0.78, 0.18, 5.25),
        (0.75, 0.12, 6.20),
    ]
    rads = [0.42, 0.27, 0.22, 0.18, 0.15, 0.17]
    add_tube(bm_t, pts, rads, segs=7)
    # Coconut cluster under crown
    crown = Vector(pts[-1])
    for i in range(5):
        a = i * math.tau / 5.0
        add_foliage_lobe(bm_t, (crown.x + math.cos(a) * 0.24, crown.y + math.sin(a) * 0.24, crown.z - 0.18), (0.14, 0.14, 0.16), seed=610 + i, subdiv=1)

    def palm_trunk_col(co, fn):
        ring = math.sin(co.z * 14.0) * 0.5 + 0.5
        if co.z > 5.75:
            return lerp3((0.28, 0.36, 0.16), (0.42, 0.30, 0.16), ring)
        return lerp3((0.36, 0.28, 0.20), (0.54, 0.44, 0.32), ring * 0.7 + clamp(co.z / 6.0) * 0.3)

    attach_mesh(root, "PalmTrunk", finalize_mesh(bm_t, "jungle_palm_trunk", mats["trunk"], palm_trunk_col, smooth=True), "trunk")

    # 14 gracefully arched pinnate palm fronds in 3 lush tiers (smooth-shaded AoE:DE tropical palm!)
    bm_l = bmesh.new()
    fronds = (
        [(i * math.tau / 6.0, 2.55, 0.52, 0.48) for i in range(6)]
        + [(i * math.tau / 5.0 + 0.35, 2.10, 0.95, 0.42) for i in range(5)]
        + [(i * math.tau / 3.0 + 0.78, 1.45, 1.25, 0.30) for i in range(3)]
    )
    for f_i, (ang, length, lift, droop) in enumerate(fronds):
        dx, dy = math.cos(ang), math.sin(ang)
        sx, sy = -dy, dx
        segs = 7
        prev_ring = None
        for s in range(segs + 1):
            t = s / segs
            r = t * length
            z = crown.z + 0.12 + math.sin(t * math.pi * 0.78) * lift - (t * t) * droop * 1.42
            cx, cy = crown.x + dx * r, crown.y + dy * r
            leaflet = 1.0 + 0.18 * math.sin(t * math.pi * 6.0)
            half_w = math.sin(max(0.08, t) * math.pi * 0.92) * 0.48 * (1.0 - t * 0.25) * leaflet
            thick = 0.052 * (1.0 - t * 0.65)
            drop_edge = half_w * 0.42
            v_top = bm_l.verts.new((cx, cy, z + thick))
            v_left = bm_l.verts.new((cx + sx * half_w, cy + sy * half_w, z - drop_edge))
            v_bot = bm_l.verts.new((cx, cy, z - thick * 0.8))
            v_right = bm_l.verts.new((cx - sx * half_w, cy - sy * half_w, z - drop_edge))
            ring = [v_top, v_left, v_bot, v_right]
            if prev_ring is not None:
                for k in range(4):
                    nk = (k + 1) % 4
                    bm_l.faces.new((prev_ring[k], prev_ring[nk], ring[nk], ring[k]))
            else:
                bm_l.faces.new(list(reversed(ring)))
            prev_ring = ring
        bm_l.faces.new(prev_ring)

    attach_mesh(root, "PalmFronds", finalize_mesh(bm_l, "jungle_palm_fronds", mats["leaf"], lambda co, fn: jungle_leaf_color_fn(co, fn, top_z=7.4), smooth=True), "leaf")
    return root


def build_jungle_banyan(mats):
    root = make_root("tree:jungle:1")
    bm_t = bmesh.new()
    # Massive fluted buttress trunk + spreading upper boughs
    add_tube(bm_t, [(0, 0, -0.2), (0.08, -0.05, 1.8), (0.14, 0.04, 3.6), (0.06, 0.08, 4.9)], [0.96, 0.66, 0.52, 0.38], segs=9)
    for i in range(6):
        a = i * math.tau / 6.0 + 0.2
        ca, sa = math.cos(a), math.sin(a)
        add_tube(bm_t, [(ca * 0.42, sa * 0.42, 2.2), (ca * 0.98, sa * 0.98, 0.88), (ca * 1.40, sa * 1.40, -0.18)], [0.22, 0.18, 0.13], segs=6)
    for i in range(5):
        a = i * math.tau / 5.0 + 0.55
        ca, sa = math.cos(a), math.sin(a)
        add_tube(bm_t, [(0, 0, 3.7), (ca * 1.35, sa * 1.35, 4.55), (ca * 2.35, sa * 2.35, 4.95)], [0.30, 0.21, 0.12], segs=6)
        add_tube(bm_t, [(ca * 1.80, sa * 1.80, 4.60), (ca * 1.86, sa * 1.86, 2.25), (ca * 1.74, sa * 1.74, -0.15)], [0.08, 0.068, 0.08], segs=5)

    attach_mesh(root, "BanyanTrunk", finalize_mesh(bm_t, "jungle_banyan_trunk", mats["trunk"], lambda co, fn: wood_color_fn(co, fn, dark=True), smooth=True), "trunk")

    # 19 airy, layered scalloped foliage bough clouds (smooth-shaded lush tropical crown — ZERO chunky soccer balls!)
    bm_l = bmesh.new()
    crowns = [
        # Upper sunlit crown cluster
        ((0.0, 0.0, 6.75), (1.42, 1.36, 0.86)),
        ((0.95, 0.58, 6.45), (1.12, 1.05, 0.72)),
        ((-0.92, 0.65, 6.38), (1.15, 1.08, 0.72)),
        ((0.25, -0.98, 6.42), (1.12, 1.06, 0.70)),
        ((-0.85, -0.78, 6.22), (1.06, 1.02, 0.68)),
        # Mid spreading umbrella boughs
        ((-2.15, 0.85, 5.55), (1.28, 1.18, 0.78)),
        ((-1.65, 1.75, 5.38), (1.05, 0.98, 0.68)),
        ((2.20, -0.55, 5.58), (1.30, 1.18, 0.78)),
        ((1.75, -1.55, 5.32), (1.06, 1.00, 0.66)),
        ((0.68, 2.15, 5.48), (1.24, 1.12, 0.74)),
        ((-0.65, 2.05, 5.25), (1.02, 0.96, 0.65)),
        ((-0.82, -2.05, 5.40), (1.26, 1.16, 0.74)),
        ((0.65, -2.08, 5.20), (1.04, 0.98, 0.66)),
        ((1.88, 1.38, 5.25), (1.14, 1.06, 0.70)),
        ((-1.85, -1.28, 5.18), (1.12, 1.05, 0.68)),
        # Outer overhanging leafy tufts
        ((2.65, 0.55, 4.92), (0.88, 0.82, 0.58)),
        ((-2.60, -0.25, 4.88), (0.88, 0.84, 0.58)),
        ((0.15, 2.65, 4.85), (0.86, 0.82, 0.56)),
        ((-0.18, -2.62, 4.82), (0.86, 0.80, 0.56)),
    ]
    for i, (c, r) in enumerate(crowns):
        add_foliage_lobe(bm_l, c, r, seed=710 + i * 13, subdiv=1 if i >= 5 else 2)
    attach_mesh(root, "BanyanCanopy", finalize_mesh(bm_l, "jungle_banyan_canopy", mats["leaf"], lambda co, fn: jungle_leaf_color_fn(co, fn, top_z=7.6), smooth=True), "leaf")
    return root


def build_jungle_canopy(mats):
    root = make_root("tree:jungle:2")
    bm_t = bmesh.new()
    add_tube(bm_t, [(0, 0, -0.15), (-0.12, 0.08, 1.5), (0.06, 0.16, 3.1), (0.14, 0.05, 4.3)], [0.44, 0.28, 0.22, 0.15], segs=7)
    for ang, bx, by, bz in [(0.4, 1.05, 0.45, 4.55), (2.5, -0.95, 0.65, 4.35), (4.6, -0.25, -1.05, 4.20)]:
        add_tube(bm_t, [(0.05, 0.10, 3.2), (bx, by, bz)], [0.16, 0.09], segs=5)
    attach_mesh(root, "CanopyTrunk", finalize_mesh(bm_t, "jungle_canopy_trunk", mats["trunk"], lambda co, fn: wood_color_fn(co, fn, dark=False), smooth=True), "trunk")

    # 15 staggered organic rainforest foliage tufts (smooth-shaded, crisp sunlit tips!)
    bm_l = bmesh.new()
    for i, (c, r) in enumerate([
        ((0.05, 0.05, 5.75), (1.05, 1.00, 0.72)),
        ((0.72, 0.42, 5.45), (0.86, 0.82, 0.62)),
        ((-0.68, 0.50, 5.40), (0.88, 0.84, 0.62)),
        ((0.08, -0.76, 5.35), (0.86, 0.82, 0.60)),
        ((1.35, 0.55, 4.72), (0.98, 0.92, 0.66)),
        ((1.10, -0.68, 4.65), (0.92, 0.88, 0.64)),
        ((-1.28, 0.68, 4.62), (0.96, 0.92, 0.64)),
        ((-1.05, -0.78, 4.58), (0.94, 0.88, 0.64)),
        ((-0.22, -1.28, 4.55), (0.96, 0.90, 0.64)),
        ((0.25, 1.25, 4.68), (0.94, 0.88, 0.62)),
        ((1.75, -0.08, 4.32), (0.76, 0.72, 0.52)),
        ((-1.68, 0.05, 4.28), (0.74, 0.70, 0.52)),
        ((0.68, 1.38, 4.35), (0.72, 0.68, 0.50)),
        ((-0.65, 1.28, 4.30), (0.72, 0.68, 0.50)),
        ((0.48, -1.42, 4.25), (0.74, 0.70, 0.50)),
    ]):
        add_foliage_lobe(bm_l, c, r, seed=810 + i * 11, subdiv=1 if i >= 3 else 2)
    attach_mesh(root, "CanopyLeaves", finalize_mesh(bm_l, "jungle_canopy_leaves", mats["leaf"], lambda co, fn: jungle_leaf_color_fn(co, fn, top_z=6.4), smooth=True), "leaf")
    return root


def build_jungle_mangrove(mats):
    root = make_root("tree:jungle:3")
    bm_t = bmesh.new()
    add_tube(bm_t, [(0, 0, 1.2), (0.12, -0.08, 2.3), (0.04, 0.10, 3.3)], [0.32, 0.24, 0.17], segs=7)
    for i in range(8):
        a = i * math.tau / 8.0 + 0.15
        ca, sa = math.cos(a), math.sin(a)
        add_tube(bm_t, [
            (ca * 0.18, sa * 0.18, 1.75),
            (ca * 0.88, sa * 0.88, 1.25),
            (ca * 1.32, sa * 1.32, 0.45),
            (ca * 1.48, sa * 1.48, -0.25),
        ], [0.11, 0.095, 0.085, 0.075], segs=5)
    attach_mesh(root, "MangroveRoots", finalize_mesh(bm_t, "jungle_mangrove_trunk", mats["trunk"], lambda co, fn: wood_color_fn(co, fn, dark=True), smooth=True), "trunk")

    bm_l = bmesh.new()
    for i, (c, r) in enumerate([
        ((0.0, 0.0, 4.15), (0.96, 0.92, 0.66)),
        ((0.68, 0.45, 3.85), (0.82, 0.78, 0.58)),
        ((-0.72, 0.48, 3.82), (0.82, 0.78, 0.56)),
        ((0.12, -0.78, 3.78), (0.84, 0.80, 0.56)),
        ((-1.22, 0.52, 3.42), (0.84, 0.80, 0.56)),
        ((1.24, -0.42, 3.40), (0.86, 0.80, 0.56)),
        ((0.32, 1.18, 3.38), (0.82, 0.78, 0.54)),
        ((-0.48, -1.12, 3.34), (0.82, 0.78, 0.54)),
        ((1.12, 0.78, 3.30), (0.72, 0.68, 0.48)),
        ((-1.08, -0.68, 3.28), (0.72, 0.68, 0.48)),
    ]):
        add_foliage_lobe(bm_l, c, r, seed=910 + i * 9, subdiv=1 if i >= 2 else 2)
    attach_mesh(root, "MangroveCanopy", finalize_mesh(bm_l, "jungle_mangrove_leaves", mats["leaf"], lambda co, fn: jungle_leaf_color_fn(co, fn, top_z=4.9), smooth=True), "leaf")
    return root


# ---------------------------------------------------------------------------
# 9 & 10. ANCIENT MOSSY STEPPED JUNGLE TEMPLE & SHRINE GATEWAY (Image 9)
# ---------------------------------------------------------------------------
def temple_stone_color(co, fn):
    warm = (0.56, 0.53, 0.44)
    shadow = (0.28, 0.28, 0.24)
    moss = (0.22, 0.40, 0.17)
    course = math.sin(co.z * 11.0) * 0.5 + 0.5
    n = hash3(round(co.x * 2.0, 1), round(co.y * 2.0, 1), round(co.z * 2.0, 1))
    ao = 0.55 + 0.45 * clamp((co.z + 0.2) / 6.5)
    c = lerp3(shadow, warm, clamp(0.35 + course * 0.25 + n * 0.25 + ao * 0.30))
    # Lush moss creeping over horizontal temple steps and lower joints
    moss_amt = 0.0
    if fn.z > 0.55:
        moss_amt = clamp((fn.z - 0.55) / 0.35) * (0.52 + 0.42 * n)
    elif co.z < 1.6:
        moss_amt = clamp((1.6 - co.z) / 1.6) * 0.45 * n
    return lerp3(c, moss, moss_amt * 0.85)


def build_jungle_temple(mats):
    root = make_root("temple:jungle")
    bm = bmesh.new()
    # 4 stepped weathered stone pyramid tiers
    tiers = [
        (7.4, 7.4, 1.15, 0.50),
        (5.6, 5.6, 1.10, 1.60),
        (4.0, 4.0, 1.05, 2.65),
        (2.7, 2.7, 0.90, 3.60),
    ]
    for w, d, h, cz in tiers:
        add_box(bm, (0.0, 0.0, cz), (w, d, h), bevel=0.08)
        # Corner carved pillar buttresses on each tier
        for sx in (-1, 1):
            for sy in (-1, 1):
                add_box(bm, (sx * (w * 0.48), sy * (d * 0.48), cz + 0.05), (0.48, 0.48, h * 1.04), bevel=0.04)

    # Grand central front staircase (-Y = Three.js +Z) + stepped balustrades
    for step in range(9):
        t = step / 8.0
        sy = -3.85 + t * 2.45
        sz = 0.20 + t * 3.55
        add_box(bm, (0.0, sy, sz), (1.75, 0.44, 0.42), bevel=0.02)
    for side in (-1.02, 1.02):
        add_box(bm, (side, -2.65, 1.95), (0.34, 3.10, 0.68), rot=(0.88, 0.0, 0.0), bevel=0.04)
        # Carved guardian finials at staircase base
        add_box(bm, (side, -4.05, 0.65), (0.46, 0.52, 1.25), bevel=0.05)

    # Upper sanctuary tower + Khmer corbeled tiered lotus spire
    add_box(bm, (0.0, 0.0, 4.75), (2.05, 2.05, 1.45), bevel=0.06)
    # Recessed dark portal lintel on front
    add_box(bm, (0.0, -1.04, 4.65), (0.96, 0.24, 1.02), bevel=0.03)
    # Corbeled spire tiers
    for idx, (sw, sh, scz) in enumerate([(1.78, 0.58, 5.75), (1.36, 0.58, 6.32), (0.94, 0.55, 6.86), (0.56, 0.52, 7.36)]):
        add_box(bm, (0.0, 0.0, scz), (sw, sw, sh), bevel=0.06)
    add_tapered_cylinder(bm, (0.0, 0.0, 7.60), (0.0, 0.0, 8.35), 0.24, 0.04, segs=8)

    attach_mesh(root, "JungleTemple", finalize_mesh(bm, "temple_jungle", mats["stone"], temple_stone_color), "stone")
    return root


def build_temple_ruin(mats):
    root = make_root("temple:ruin")
    bm = bmesh.new()
    # Weathered mossy stepped base + twin carved columns + broken ornate lintel
    add_box(bm, (0.0, 0.0, 0.22), (3.4, 2.0, 0.48), bevel=0.06)
    for sx in (-1.15, 1.15):
        add_box(bm, (sx, 0.0, 1.45), (0.68, 0.72, 2.10), bevel=0.05)
        add_box(bm, (sx, 0.0, 2.58), (0.86, 0.88, 0.28), bevel=0.04)
    add_box(bm, (0.0, 0.0, 2.95), (3.15, 0.86, 0.52), bevel=0.06)
    add_box(bm, (0.0, 0.0, 3.40), (2.20, 0.70, 0.42), bevel=0.05)
    add_box(bm, (0.0, 0.0, 3.76), (1.10, 0.56, 0.34), bevel=0.04)
    # Fallen carved moss stone block nearby
    add_box(bm, (1.95, -0.55, 0.32), (0.78, 0.64, 0.62), rot=(0.12, 0.22, 0.48), bevel=0.05)
    attach_mesh(root, "TempleRuin", finalize_mesh(bm, "temple_ruin", mats["stone"], temple_stone_color), "stone")
    return root


# ---------------------------------------------------------------------------
# 11. TIMBER RAVINE / RIVER TRESTLE BRIDGE (Images 6, 7, 8, 10, 11)
# ---------------------------------------------------------------------------
def build_timber_bridge(mats):
    root = make_root("bridge:timber")
    bm_dark = bmesh.new()
    bm_deck = bmesh.new()

    half_len = 10.6
    half_w = 2.65
    deck_z = 1.45

    # Heavy log piers & cross-bracing trestles
    for px in (-8.2, -3.4, 3.4, 8.2):
        for sy in (-half_w + 0.35, 0.0, half_w - 0.35):
            add_tapered_cylinder(bm_dark, (px, sy, -1.8), (px, sy, deck_z - 0.12), 0.26, 0.22, segs=7)
        # Cross cap beam
        add_box(bm_dark, (px, 0.0, deck_z - 0.18), (0.42, half_w * 2.08, 0.34), bevel=0.03)
        # X-bracing struts
        add_tapered_cylinder(bm_dark, (px, -half_w + 0.4, -0.55), (px, half_w - 0.4, deck_z - 0.25), 0.11, 0.11, segs=6)
        add_tapered_cylinder(bm_dark, (px, half_w - 0.4, -0.55), (px, -half_w + 0.4, deck_z - 0.25), 0.11, 0.11, segs=6)

    # Longitudinal stringer beams under deck
    for sy in (-half_w + 0.45, -0.9, 0.9, half_w - 0.45):
        add_box(bm_dark, (0.0, sy, deck_z - 0.02), (half_len * 2.02, 0.28, 0.28), bevel=0.02)

    # Individual weathered deck planks (with subtle gentle arch toward center)
    plank_count = 28
    for i in range(plank_count):
        t = (i + 0.5) / plank_count
        px = -half_len + t * (half_len * 2.0)
        arch = math.cos((t * 2.0 - 1.0) * math.pi * 0.5) * 0.22
        add_box(bm_deck, (px, 0.0, deck_z + 0.14 + arch), (0.66, half_w * 2.0, 0.15), bevel=0.015)

    # Sturdy timber guardrails & end newel posts
    for side in (-half_w + 0.16, half_w - 0.16):
        add_box(bm_dark, (0.0, side, deck_z + 0.96), (half_len * 2.0, 0.18, 0.16), bevel=0.02)
        add_box(bm_dark, (0.0, side, deck_z + 0.56), (half_len * 1.98, 0.14, 0.12), bevel=0.015)
        for px in (-10.2, -6.8, -3.4, 0.0, 3.4, 6.8, 10.2):
            arch = math.cos((px / half_len) * math.pi * 0.5) * 0.22
            add_box(bm_dark, (px, side, deck_z + 0.62 + arch), (0.26, 0.26, 1.15), bevel=0.02)

    attach_mesh(root, "BridgeTimberFrame", finalize_mesh(bm_dark, "bridge_timber_frame", mats["darkwood"], lambda co, fn: wood_color_fn(co, fn, dark=True)), "darkwood")
    attach_mesh(root, "BridgeTimberDeck", finalize_mesh(bm_deck, "bridge_timber_deck", mats["wood"], lambda co, fn: wood_color_fn(co, fn, dark=False)), "wood")
    return root


# ---------------------------------------------------------------------------
# 12–15. LIVING BATTLEFIELD PROPS (Defensive Stakes, Campfire, Tent, Crates)
# ---------------------------------------------------------------------------
def build_defensive_stakes(mats):
    root = make_root("prop:stakes")
    bm = bmesh.new()
    # Heavy horizontal lashed timber beam + A-frame end supports + sharpened outward stakes
    add_tapered_cylinder(bm, (-1.85, 0.0, 0.68), (1.85, 0.0, 0.68), 0.14, 0.14, segs=7)
    for sx in (-1.35, 1.35):
        add_tapered_cylinder(bm, (sx, -0.58, -0.05), (sx, 0.0, 0.72), 0.09, 0.08, segs=6)
        add_tapered_cylinder(bm, (sx, 0.62, -0.05), (sx, 0.0, 0.72), 0.09, 0.08, segs=6)
    for i in range(7):
        px = -1.5 + i * 0.50
        # Alternating sharpened stakes angled forward (-Y) and upward
        add_tapered_cylinder(bm, (px, 0.55, 0.0), (px, -0.82, 1.48), 0.085, 0.012, segs=6)
        if i % 2 == 0:
            add_tapered_cylinder(bm, (px + 0.18, -0.45, 0.0), (px + 0.18, 0.65, 1.25), 0.075, 0.012, segs=6)

    def stake_col(co, fn):
        c = wood_color_fn(co, fn, dark=False)
        # Fire-hardened charred spear tips
        if co.z > 1.15:
            tip = clamp((co.z - 1.15) / 0.35)
            c = lerp3(c, (0.14, 0.11, 0.09), tip * 0.75)
        return c

    attach_mesh(root, "DefensiveStakes", finalize_mesh(bm, "prop_stakes", mats["wood"], stake_col), "wood")
    return root


def build_campfire(mats):
    root = make_root("prop:campfire")
    bm_stone = bmesh.new()
    for i in range(10):
        a = (i / 10.0) * math.tau
        add_sculpted_rock(bm_stone, (math.cos(a) * 0.62, math.sin(a) * 0.62, 0.14), (0.22, 0.19, 0.16), seed=1010 + i * 7, subdiv=1)
    attach_mesh(root, "CampfireStones", finalize_mesh(bm_stone, "campfire_stones", mats["rock"], lambda co, fn: rock_color_fn(co, fn, moss=False, wet_z=0.0)), "rock")

    bm_wood = bmesh.new()
    # Crossed firewood logs + wooden tripod spit
    for i in range(5):
        a = (i / 5.0) * math.tau + 0.3
        add_tapered_cylinder(bm_wood, (math.cos(a) * 0.45, math.sin(a) * 0.45, 0.08), (-math.cos(a) * 0.12, -math.sin(a) * 0.12, 0.38), 0.075, 0.06, segs=6)
    for i in range(3):
        a = (i / 3.0) * math.tau + 0.2
        add_tapered_cylinder(bm_wood, (math.cos(a) * 0.75, math.sin(a) * 0.75, -0.04), (0.0, 0.0, 1.38), 0.045, 0.032, segs=5)
    attach_mesh(root, "CampfireLogs", finalize_mesh(bm_wood, "campfire_logs", mats["darkwood"], lambda co, fn: wood_color_fn(co, fn, dark=True)), "darkwood")

    bm_ember = bmesh.new()
    add_foliage_lobe(bm_ember, (0.0, 0.0, 0.15), (0.44, 0.44, 0.14), seed=1050, subdiv=1)
    attach_mesh(root, "CampfireEmbers", finalize_mesh(bm_ember, "campfire_embers", mats["ember"], lambda co, fn: lerp3((0.88, 0.24, 0.04), (1.0, 0.72, 0.18), clamp(1.0 - math.hypot(co.x, co.y) / 0.45))), "ember")
    return root


def build_war_tent(mats):
    root = make_root("prop:tent")
    bm_wood = bmesh.new()
    # Ridge pole & end uprights + corner wooden pegs
    add_tapered_cylinder(bm_wood, (0.0, -1.55, 0.0), (0.0, -1.55, 2.08), 0.065, 0.055, segs=6)
    add_tapered_cylinder(bm_wood, (0.0, 1.55, 0.0), (0.0, 1.55, 2.08), 0.065, 0.055, segs=6)
    add_tapered_cylinder(bm_wood, (0.0, -1.70, 1.98), (0.0, 1.70, 1.98), 0.055, 0.055, segs=6)
    for sx in (-1.55, 1.55):
        for sy in (-1.35, 1.35):
            add_tapered_cylinder(bm_wood, (sx, sy, -0.05), (sx * 0.96, sy, 0.28), 0.035, 0.025, segs=5)
    attach_mesh(root, "TentPoles", finalize_mesh(bm_wood, "tent_poles", mats["darkwood"], lambda co, fn: wood_color_fn(co, fn, dark=True)), "darkwood")

    bm_canvas = bmesh.new()
    # Closed pitched medieval pavilion canvas roof & walls with subtle fabric sag
    pts_front = [(-1.38, -1.48, 0.0), (-1.22, -1.48, 0.65), (-0.64, -1.48, 1.32), (0.0, -1.48, 1.96), (0.64, -1.48, 1.32), (1.22, -1.48, 0.65), (1.38, -1.48, 0.0)]
    pts_mid = [(-1.42, 0.0, 0.0), (-1.26, 0.0, 0.62), (-0.66, 0.0, 1.26), (0.0, 0.0, 1.92), (0.66, 0.0, 1.26), (1.26, 0.0, 0.62), (1.42, 0.0, 0.0)]
    pts_back = [(-1.38, 1.48, 0.0), (-1.22, 1.48, 0.65), (-0.64, 1.48, 1.32), (0.0, 1.48, 1.96), (0.64, 1.48, 1.32), (1.22, 1.48, 0.65), (1.38, 1.48, 0.0)]
    rings = [[bm_canvas.verts.new(p) for p in row] for row in (pts_front, pts_mid, pts_back)]
    for r in range(2):
        for c in range(len(pts_front) - 1):
            bm_canvas.faces.new((rings[r][c], rings[r + 1][c], rings[r + 1][c + 1], rings[r][c + 1]))
    # Back & front end walls + floor closure
    bm_canvas.faces.new(rings[0])
    bm_canvas.faces.new(list(reversed(rings[2])))
    bm_canvas.faces.new((rings[0][0], rings[0][-1], rings[2][-1], rings[2][0]))
    # Rolled fabric doorway flap trim at front
    add_tapered_cylinder(bm_canvas, (-0.42, -1.52, 0.08), (-0.18, -1.52, 1.45), 0.11, 0.09, segs=6)
    add_tapered_cylinder(bm_canvas, (0.42, -1.52, 0.08), (0.18, -1.52, 1.45), 0.11, 0.09, segs=6)

    def canvas_col(co, fn):
        base = (0.80, 0.72, 0.56)
        stripe = (0.58, 0.24, 0.18)
        dirt = (0.44, 0.37, 0.28)
        c = stripe if (co.z > 1.52 or abs(co.y) > 1.35 and co.z > 1.25) else base
        if co.z < 0.35:
            c = lerp3(dirt, c, clamp(co.z / 0.35))
        return c

    attach_mesh(root, "TentCanvas", finalize_mesh(bm_canvas, "tent_canvas", mats["canvas"], canvas_col), "plaster")
    return root


def build_supply_crates(mats):
    root = make_root("prop:crates")
    bm = bmesh.new()
    # Two bound wooden crates + two iron-hooped barrels + timber log bundle
    add_box(bm, (-0.45, 0.15, 0.42), (0.88, 0.88, 0.84), rot=(0.0, 0.0, 0.14), bevel=0.04)
    add_box(bm, (-0.38, 0.10, 1.15), (0.64, 0.64, 0.62), rot=(0.0, 0.0, -0.28), bevel=0.03)
    # Barrels (bulging tapered cylinders)
    for bx, by, bz in [(0.48, -0.22, 0.0), (0.55, 0.48, 0.0)]:
        add_tube(bm, [(bx, by, bz), (bx, by, bz + 0.24), (bx, by, bz + 0.62), (bx, by, bz + 0.86)], [0.24, 0.31, 0.31, 0.24], segs=9)
    # Timber logs lying beside crates
    for i in range(3):
        add_tapered_cylinder(bm, (-0.85, -0.68 + i * 0.16, 0.12), (0.35, -0.62 + i * 0.16, 0.12), 0.11, 0.10, segs=6)
    attach_mesh(root, "SupplyCrates", finalize_mesh(bm, "prop_crates", mats["wood"], lambda co, fn: wood_color_fn(co, fn, dark=False)), "wood")
    return root


# ---------------------------------------------------------------------------
# 16 & 17. ROAMING WILDLIFE — SCULPTED RED DEER STAG & DOE (Images 1, 7, 10, 11)
# ---------------------------------------------------------------------------
def build_deer(mats, stag=True):
    key = "wildlife:deer" if stag else "wildlife:doe"
    root = make_root(key)
    bm = bmesh.new()
    scale = 1.0 if stag else 0.88

    # Sculpted organic body spine (rump -> barrel -> chest) facing -Y (Three.js +Z)
    torso_pts = [
        (0.0, 0.66 * scale, 0.98 * scale),
        (0.0, 0.42 * scale, 1.05 * scale),
        (0.0, 0.02 * scale, 1.00 * scale),
        (0.0, -0.38 * scale, 1.06 * scale),
        (0.0, -0.60 * scale, 1.02 * scale),
    ]
    torso_r = [0.16 * scale, 0.28 * scale, 0.27 * scale, 0.30 * scale, 0.18 * scale]
    add_tube(bm, torso_pts, torso_r, segs=9)

    # Slender curved neck -> sculpted head -> tapered muzzle
    neck_pts = [
        (0.0, -0.48 * scale, 1.08 * scale),
        (0.0, -0.64 * scale, 1.36 * scale),
        (0.0, -0.76 * scale, 1.62 * scale),
    ]
    add_tube(bm, neck_pts, [0.17 * scale, 0.13 * scale, 0.11 * scale], segs=8)
    head_pts = [
        (0.0, -0.68 * scale, 1.65 * scale),
        (0.0, -0.84 * scale, 1.64 * scale),
        (0.0, -1.04 * scale, 1.55 * scale),
    ]
    add_tube(bm, head_pts, [0.11 * scale, 0.125 * scale, 0.055 * scale], segs=8)

    # Alert ears
    for sx in (-1.0, 1.0):
        add_tapered_cylinder(bm, (sx * 0.08 * scale, -0.70 * scale, 1.72 * scale), (sx * 0.22 * scale, -0.66 * scale, 1.92 * scale), 0.045 * scale, 0.015 * scale, segs=5)

    # Short white-tipped tail
    add_tapered_cylinder(bm, (0.0, 0.68 * scale, 1.02 * scale), (0.0, 0.84 * scale, 0.88 * scale), 0.06 * scale, 0.025 * scale, segs=5)

    # 4 graceful jointed tapered legs with dark hooves
    legs = [
        (-0.16, -0.44, -0.15, -0.46, -0.15, -0.48),  # front-left
        (0.16, -0.44, 0.15, -0.42, 0.15, -0.40),     # front-right
        (-0.16, 0.44, -0.16, 0.52, -0.15, 0.46),     # rear-left
        (0.16, 0.44, 0.16, 0.50, 0.15, 0.48),        # rear-right
    ]
    for lx0, ly0, lxk, lyk, lxf, lyf in legs:
        add_tube(bm, [
            (lx0 * scale, ly0 * scale, 0.96 * scale),
            (lxk * scale, lyk * scale, 0.50 * scale),
            (lxf * scale, lyf * scale, 0.12 * scale),
            (lxf * scale, lyf * scale, 0.0),
        ], [0.105 * scale, 0.062 * scale, 0.045 * scale, 0.052 * scale], segs=6)

    # Branching royal antlers on Stag!
    if stag:
        for sx in (-1.0, 1.0):
            # Main sweeping antler beam
            add_tube(bm, [
                (sx * 0.06, -0.74, 1.74),
                (sx * 0.18, -0.68, 1.98),
                (sx * 0.34, -0.58, 2.22),
                (sx * 0.38, -0.52, 2.40),
            ], [0.028, 0.024, 0.018, 0.008], segs=5)
            # Brow tine & royal crown tine
            add_tapered_cylinder(bm, (sx * 0.16, -0.70, 1.94), (sx * 0.24, -0.88, 2.10), 0.018, 0.006, segs=5)
            add_tapered_cylinder(bm, (sx * 0.28, -0.62, 2.12), (sx * 0.48, -0.66, 2.30), 0.016, 0.006, segs=5)
            add_tapered_cylinder(bm, (sx * 0.34, -0.58, 2.22), (sx * 0.24, -0.46, 2.42), 0.015, 0.006, segs=5)

    def deer_col(co, fn):
        if co.z > 1.78 * scale and abs(co.x) > 0.04 and co.y > -0.95:
            # Bone-ivory antlers (or dark ear tips for doe)
            return (0.78, 0.72, 0.60) if stag else (0.44, 0.28, 0.17)
        if co.z < 0.11 * scale:
            return (0.14, 0.12, 0.11)  # dark hooves
        if co.y > 0.56 * scale and co.z > 0.76 * scale:
            return (0.88, 0.84, 0.76)  # pale rump & tail patch
        if co.z < 0.84 * scale and abs(co.y) < 0.42 * scale and fn.z < -0.2:
            return (0.76, 0.67, 0.54)  # cream underbelly
        if co.y < -0.96 * scale:
            return (0.20, 0.15, 0.12)  # dark nose/muzzle
        coat = (0.56, 0.34, 0.18) if stag else (0.62, 0.41, 0.24)
        back_dark = (0.38, 0.22, 0.11)
        return lerp3(coat, back_dark, clamp((co.z - 0.95 * scale) / 0.55) * 0.55)

    attach_mesh(root, "DeerBody", finalize_mesh(bm, f"{key}_body", mats["wildlife"], deer_col), "wildlife")
    return root


# ---------------------------------------------------------------------------
# Preview render for visual QA
# ---------------------------------------------------------------------------
def render_preview(roots, out_png):
    # Temporarily lay out models on a clean grid for studio QA render
    saved = {}
    cols = 6
    spacing_x = 13.0
    spacing_y = 13.0
    for idx, root in enumerate(roots):
        saved[root.name] = root.location.copy()
        r = idx // cols
        c = idx % cols
        root.location = ((c - 2.5) * spacing_x, (r - 1.0) * spacing_y, 0.0)

    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 16
    scene.cycles.use_denoising = False
    scene.cycles.max_bounces = 2
    scene.render.resolution_x = 1280
    scene.render.resolution_y = 720
    scene.render.filepath = str(out_png)
    world = bpy.data.worlds.new("StudioWorld")
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs[0].default_value = (0.12, 0.16, 0.20, 1.0)
        bg.inputs[1].default_value = 0.85
    scene.world = world
    sun_data = bpy.data.lights.new("Sun", type="SUN")
    sun_data.energy = 3.2
    sun_obj = bpy.data.objects.new("Sun", sun_data)
    scene.collection.objects.link(sun_obj)
    sun_obj.rotation_euler = Euler((0.75, 0.25, 0.55), "XYZ")

    cam_data = bpy.data.cameras.new("PreviewCam")
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = 82.0
    cam_obj = bpy.data.objects.new("PreviewCam", cam_data)
    scene.collection.objects.link(cam_obj)
    cam_obj.location = (0.0, -52.0, 42.0)
    direction = Vector((0.0, 0.0, 2.5)) - cam_obj.location
    cam_obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    scene.camera = cam_obj

    bpy.ops.render.render(write_still=True)

    # Restore zero origins before GLB export!
    bpy.data.objects.remove(cam_obj, do_unlink=True)
    bpy.data.cameras.remove(cam_data, do_unlink=True)
    bpy.data.objects.remove(sun_obj, do_unlink=True)
    bpy.data.lights.remove(sun_data, do_unlink=True)
    scene.world = None
    bpy.data.worlds.remove(world, do_unlink=True)
    for root in roots:
        root.location = saved[root.name]


def main():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True)
    parser.add_argument("--preview", default="")
    args = parser.parse_args(argv)
    out_dir = Path(args.output)
    out_dir.mkdir(parents=True, exist_ok=True)

    clear_scene()

    mats = {
        "rock": make_vc_material("EpicRock", roughness=0.90),
        "waterSheet": make_vc_material("EpicWaterSheet", roughness=0.18, alpha=0.92),
        "foam": make_vc_material("EpicFoam", roughness=0.65, alpha=0.94),
        "ice": make_vc_material("EpicIce", roughness=0.26, metallic=0.05),
        "trunk": make_vc_material("EpicTrunk", roughness=0.94),
        "leaf": make_vc_material("EpicLeaf", roughness=0.86),
        "stone": make_vc_material("EpicTempleStone", roughness=0.91),
        "wood": make_vc_material("EpicWood", roughness=0.88),
        "darkwood": make_vc_material("EpicDarkWood", roughness=0.90),
        "canvas": make_vc_material("EpicCanvas", roughness=0.92),
        "ember": make_vc_material("EpicEmber", roughness=0.45, emission=(1.0, 0.36, 0.05), emission_strength=1.8),
        "wildlife": make_vc_material("EpicWildlife", roughness=0.84),
    }

    roots = [
        build_waterfall(mats, tiered=False),
        build_waterfall(mats, tiered=True),
        build_rapid_rock(mats),
        build_ice_floe(mats),
        build_jungle_palm(mats),
        build_jungle_banyan(mats),
        build_jungle_canopy(mats),
        build_jungle_mangrove(mats),
        build_jungle_temple(mats),
        build_temple_ruin(mats),
        build_timber_bridge(mats),
        build_defensive_stakes(mats),
        build_campfire(mats),
        build_war_tent(mats),
        build_supply_crates(mats),
        build_deer(mats, stag=True),
        build_deer(mats, stag=False),
    ]

    if args.preview:
        render_preview(roots, args.preview)

    raw_glb = out_dir / "frontier-epic-props-raw.glb"
    bpy.ops.export_scene.gltf(
        filepath=str(raw_glb),
        export_format="GLB",
        export_yup=True,
        export_apply=True,
        export_extras=True,
        export_texcoords=True,
        export_normals=True,
        export_vertex_color="MATERIAL",
        export_materials="EXPORT",
    )

    report = {
        "count": len(roots),
        "keys": [r["assetKey"] for r in roots],
    }
    (out_dir / "report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(f"Exported {len(roots)} epic prop models to {raw_glb}")


if __name__ == "__main__":
    main()
