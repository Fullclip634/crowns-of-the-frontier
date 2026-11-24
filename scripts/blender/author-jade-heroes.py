"""
Blender 4.5 LTS Authoring Script — The Jade Empire, 5 Hero Generals,
Giant Counterweight Trebuchet & Smoking Masonry Rubble
=====================================================================
Generates 25 closed-manifold, studio-calibrated 3D models into
`frontier-jade-heroes-raw.glb` (meshopt-packed via gltfpack into
`src/assets3d/frontier-jade-heroes.glb`):

  1. 5th Playable Civilization — The Jade Empire (16 Pagoda Buildings):
       - building:towncenter:jade:2 (Castle Imperial Courtyard Hall)
       - building:towncenter:jade:3 (Imperial Golden Dragon Palace)
       - building:house:jade, barracks, range, stable, workshop, blacksmith,
         market (Lantern Bazaar), monastery (Serenity Pagoda), mill (animated
         wheel), camp, mine, tower (3-tier Pagoda Watchtower),
         keep (Grand Dragon Citadel), wonder (Heavenly Jade Pagoda),
         dock (orientable dockPier=True)
  2. Jade Empire Unique Units (2 models):
       - unit:chukonu      (Repeating Crossbowman with box-magazine crossbow)
       - unit:firelancer   (Armored cavalry with blazing gunpowder fire-lance)
  3. Giant Counterweight Trebuchet (1 model):
       - unit:trebuchet    (Tall A-frame oak truss, counterweight box, long
                            elevated throwing arm & flaming boulder!)
  4. 5 Playable Auto-Casting Hero Generals (5 models — 1 per civ):
       - unit:hero_alder   (Marshal Rowan — mounted royal knight + war banner)
       - unit:hero_sun     (Sun Sovereign — gilded desert emir + sunburst banner)
       - unit:hero_raven   (Shadow Khan — wolf-pelt rider + twin war-axes)
       - unit:hero_iron    (Forgemaster Borin — colossal rune-hammer champion)
       - unit:hero_jade    (Dragon Marshal — jade lamellar general + guandao)
  5. Battlefield Siege Debris (1 model):
       - prop:rubble       (Shattered stone masonry blocks & broken beams)

Coordinate convention:
  Blender X  -> Three.js X
  Blender Z  -> Three.js Y (up)
  Blender -Y -> Three.js +Z (front face = -Y in Blender -> +Z in Three.js)
"""
import argparse
import json
import math
import os
import sys
from pathlib import Path
import bpy
import bmesh
from mathutils import Euler, Matrix, Vector

MAT_SPECS = {
    "stone": ((0.76, 0.74, 0.68, 1.0), 0.88, 0.0),
    "stoneDark": ((0.44, 0.45, 0.44, 1.0), 0.90, 0.0),
    "plaster": ((0.92, 0.88, 0.79, 1.0), 0.90, 0.0),
    "wood": ((0.54, 0.39, 0.24, 1.0), 0.86, 0.0),
    "darkwood": ((0.26, 0.18, 0.12, 1.0), 0.88, 0.0),
    "jadeRoof": ((0.16, 0.56, 0.42, 1.0), 0.42, 0.12),
    "lacquer": ((0.72, 0.18, 0.14, 1.0), 0.38, 0.08),
    "gold": ((0.90, 0.72, 0.24, 1.0), 0.34, 0.58),
    "iron": ((0.36, 0.39, 0.44, 1.0), 0.45, 0.55),
    "steel": ((0.78, 0.82, 0.86, 1.0), 0.30, 0.60),
    "glow": ((1.00, 0.52, 0.14, 1.0), 0.30, 0.0),
    "canvas": ((0.88, 0.80, 0.64, 1.0), 0.90, 0.0),
    "grain": ((0.90, 0.74, 0.32, 1.0), 0.90, 0.0),
    "soil": ((0.52, 0.42, 0.30, 1.0), 0.95, 0.0),
    "leather": ((0.38, 0.27, 0.18, 1.0), 0.84, 0.0),
    "pants": ((0.30, 0.34, 0.28, 1.0), 0.90, 0.0),
    "skin": ((0.84, 0.66, 0.52, 1.0), 0.82, 0.0),
    "hair": ((0.18, 0.15, 0.13, 1.0), 0.88, 0.0),
    "horse": ((0.48, 0.32, 0.20, 1.0), 0.80, 0.0),
    "mane": ((0.16, 0.13, 0.12, 1.0), 0.88, 0.0),
    "team": ((0.20, 0.62, 0.50, 1.0), 0.76, 0.04),
    "teamRoof": ((0.18, 0.52, 0.40, 1.0), 0.52, 0.08),
}


def clamp(v, lo=0.0, hi=1.0):
    return max(lo, min(hi, v))


def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def ensure_materials():
    mats = {}
    for name, (rgba, rough, metal) in MAT_SPECS.items():
        mat = bpy.data.materials.new(name=name)
        mat.use_nodes = True
        bsdf = mat.node_tree.nodes.get("Principled BSDF")
        if bsdf:
            bsdf.inputs["Base Color"].default_value = rgba
            bsdf.inputs["Roughness"].default_value = rough
            bsdf.inputs["Metallic"].default_value = metal
            vc = mat.node_tree.nodes.new("ShaderNodeVertexColor")
            vc.layer_name = "Color"
            mix = mat.node_tree.nodes.new("ShaderNodeMix")
            mix.data_type = "RGBA"
            mix.blend_type = "MULTIPLY"
            mix.inputs["Factor"].default_value = 1.0
            mix.inputs["A"].default_value = rgba
            mat.node_tree.links.new(vc.outputs["Color"], mix.inputs["B"])
            mat.node_tree.links.new(mix.outputs["Result"], bsdf.inputs["Base Color"])
        mats[name] = mat
    return mats


def write_triplanar_uv(bm, scale=0.35):
    uv_layer = bm.loops.layers.uv.verify()
    for f in bm.faces:
        n = f.normal
        ax, ay, az = abs(n.x), abs(n.y), abs(n.z)
        for loop in f.loops:
            co = loop.vert.co
            if az >= ax and az >= ay:
                loop[uv_layer].uv = (co.x * scale + 0.5, co.y * scale + 0.5)
            elif ax >= ay:
                loop[uv_layer].uv = (co.y * scale + 0.5, co.z * scale + 0.5)
            else:
                loop[uv_layer].uv = (co.x * scale + 0.5, co.z * scale + 0.5)


def make_root(asset_key):
    root = bpy.data.objects.new(asset_key.replace(":", "_"), None)
    root.empty_display_type = "PLAIN_AXES"
    root["assetKey"] = asset_key
    bpy.context.scene.collection.objects.link(root)
    return root


def finish_part(root, name, bm, role, mats, height_ref=4.0, tint=(1.0, 1.0, 1.0), smooth=False, extra=None):
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.normal_update()
    write_triplanar_uv(bm, scale=0.32)
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
            h = clamp((v.co.z + 0.15) / max(0.8, height_ref))
            sun = clamp(n.z * 0.38 + 0.62)
            ao = clamp(0.68 + h * 0.22 + sun * 0.14, 0.52, 1.08)
            colors.data[li].color = (clamp(tint[0] * ao), clamp(tint[1] * ao), clamp(tint[2] * ao), 1.0)
    mesh.materials.append(mats[role])

    obj = bpy.data.objects.new(name, mesh)
    obj["assetMaterial"] = role
    if extra:
        for k, val in extra.items():
            obj[k] = val
    bpy.context.scene.collection.objects.link(obj)
    obj.parent = root
    return obj


# ---------------------------------------------------------------------------
# Closed 2-Manifold Architectural & Character Primitives
# ---------------------------------------------------------------------------
def add_box(bm, center, size, rot=(0.0, 0.0, 0.0)):
    mat = Matrix.Translation(center) @ Euler(rot, "XYZ").to_matrix().to_4x4() @ Matrix.Diagonal((size[0], size[1], size[2], 1.0))
    bmesh.ops.create_cube(bm, size=1.0, matrix=mat)


def add_cyl(bm, p0, p1, r0, r1, segs=8):
    v0, v1 = Vector(p0), Vector(p1)
    axis = v1 - v0
    if axis.length < 1e-5:
        return
    z_dir = axis.normalized()
    up = Vector((0, 0, 1)) if abs(z_dir.z) < 0.95 else Vector((1, 0, 0))
    x_dir = up.cross(z_dir).normalized()
    y_dir = z_dir.cross(x_dir).normalized()
    ring0, ring1 = [], []
    for i in range(segs):
        a = (i / segs) * math.tau
        d = x_dir * math.cos(a) + y_dir * math.sin(a)
        ring0.append(bm.verts.new(v0 + d * r0))
        ring1.append(bm.verts.new(v1 + d * r1))
    for i in range(segs):
        ni = (i + 1) % segs
        bm.faces.new((ring0[i], ring0[ni], ring1[ni], ring1[i]))
    if r0 > 1e-4:
        bm.faces.new(list(reversed(ring0)))
    if r1 > 1e-4:
        bm.faces.new(ring1)


def add_sphere(bm, center, radii, subdiv=2):
    res = bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=1.0)
    cx, cy, cz = center
    rx, ry, rz = radii
    for v in res["verts"]:
        v.co = Vector((cx + v.co.x * rx, cy + v.co.y * ry, cz + v.co.z * rz))


def add_pagoda_roof(bm, cx, cy, z_base, w, d, h, flare=0.28, steps=4):
    """Sculpts an authentic curved East Asian sweeping upturned-eave pagoda roof (strictly closed manifold!)."""
    rings = []
    # Bottom skirt ring -> concave curved rising tiers -> crisp ridge top
    for i in range(steps + 1):
        t = i / steps
        # Concave pagoda slope (sweeps gracefully outward & slightly upward at the corner eaves!)
        curve = math.pow(1.0 - t, 1.45)
        hw = max(0.18, (w * 0.5) * (0.24 + 0.76 * curve))
        hd = max(0.16, (d * 0.5) * (0.24 + 0.76 * curve))
        z = z_base + h * (1.0 - curve)
        # 8-point perimeter with lifted sweeping corners
        pts = [
            (-hw, -hd, flare * (1.0 - t) ** 1.6),
            (0.0, -hd * 0.94, 0.0),
            (hw, -hd, flare * (1.0 - t) ** 1.6),
            (hw * 0.94, 0.0, 0.0),
            (hw, hd, flare * (1.0 - t) ** 1.6),
            (0.0, hd * 0.94, 0.0),
            (-hw, hd, flare * (1.0 - t) ** 1.6),
            (-hw * 0.94, 0.0, 0.0),
        ]
        rings.append([bm.verts.new(Vector((cx + px, cy + py, z + lift))) for px, py, lift in pts])

    # Underside soffit thickness so eaves look substantial from below
    soffit = [bm.verts.new(Vector((v.co.x * 0.88 + cx * 0.12, v.co.y * 0.88 + cy * 0.12, z_base - 0.10))) for v in rings[0]]
    n = len(rings[0])
    for s in range(n):
        sn = (s + 1) % n
        bm.faces.new((soffit[s], soffit[sn], rings[0][sn], rings[0][s]))
    bm.faces.new(list(reversed(soffit)))

    for r in range(steps):
        for s in range(n):
            sn = (s + 1) % n
            bm.faces.new((rings[r][s], rings[r][sn], rings[r + 1][sn], rings[r + 1][s]))
    bm.faces.new(rings[-1])


def add_pagoda_oct_roof(bm, cx, cy, z_base, rad, h, flare=0.22):
    """Octagonal curved pagoda spire roof for Temple of Serenity & Heavenly Jade Wonder."""
    rings = []
    segs = 8
    steps = 4
    for i in range(steps + 1):
        t = i / steps
        curve = math.pow(1.0 - t, 1.5)
        r = max(0.14, rad * (0.18 + 0.82 * curve))
        z = z_base + h * (1.0 - curve)
        lift = flare * (1.0 - t) ** 1.8
        ring = []
        for s in range(segs):
            a = (s / segs) * math.tau + math.pi / segs
            ring.append(bm.verts.new(Vector((cx + math.cos(a) * r, cy + math.sin(a) * r, z + lift))))
        rings.append(ring)
    soffit = [bm.verts.new(Vector((v.co.x * 0.86 + cx * 0.14, v.co.y * 0.86 + cy * 0.14, z_base - 0.10))) for v in rings[0]]
    for s in range(segs):
        sn = (s + 1) % segs
        bm.faces.new((soffit[s], soffit[sn], rings[0][sn], rings[0][s]))
    bm.faces.new(list(reversed(soffit)))
    for r in range(steps):
        for s in range(segs):
            sn = (s + 1) % segs
            bm.faces.new((rings[r][s], rings[r][sn], rings[r + 1][sn], rings[r + 1][s]))
    bm.faces.new(rings[-1])


def add_jade_pillars(bm, cx, cy, z0, z1, hw, hd, r=0.14):
    for sx in (-1, 1):
        for sy in (-1, 1):
            add_cyl(bm, (cx + sx * hw, cy + sy * hd, z0), (cx + sx * hw, cy + sy * hd, z1), r, r * 0.92, segs=7)


def add_lantern(bm_glow, bm_gold, x, y, z, s=1.0):
    add_sphere(bm_glow, (x, y, z), (0.20 * s, 0.20 * s, 0.26 * s), subdiv=1)
    add_cyl(bm_gold, (x, y, z + 0.22 * s), (x, y, z + 0.34 * s), 0.12 * s, 0.08 * s, segs=6)
    add_cyl(bm_gold, (x, y, z - 0.32 * s), (x, y, z - 0.20 * s), 0.06 * s, 0.12 * s, segs=6)


# ---------------------------------------------------------------------------
# 1. THE JADE EMPIRE — 16 SCULPTED PAGODA BUILDINGS
# ---------------------------------------------------------------------------
def build_jade_towncenter(mats, age=2):
    key = f"building:towncenter:jade:{age}"
    root = make_root(key)
    bm_stone, bm_plaster, bm_lacq, bm_roof, bm_gold, bm_glow = (bmesh.new() for _ in range(6))

    # Grand two-step white marble terrace with front ceremonial stairs (-Y = front!)
    add_box(bm_stone, (0, 0, 0.28), (8.2, 7.6, 0.56))
    add_box(bm_stone, (0, 0.35, 0.72), (6.4, 5.4, 0.36))
    add_box(bm_stone, (0, -3.95, 0.22), (2.4, 1.0, 0.44))
    add_box(bm_stone, (0, -3.55, 0.44), (2.1, 0.7, 0.44))

    # Main palace hall + flanking courtyard wings
    add_box(bm_plaster, (0, 0.4, 2.05), (5.0, 3.8, 2.35))
    add_box(bm_plaster, (-3.1, -0.9, 1.55), (1.6, 2.4, 1.95))
    add_box(bm_plaster, (3.1, -0.9, 1.55), (1.6, 2.4, 1.95))
    add_jade_pillars(bm_lacq, 0, 0.4, 0.85, 3.25, 2.68, 2.10, r=0.17)
    add_jade_pillars(bm_lacq, -3.1, -0.9, 0.55, 2.55, 0.92, 1.28, r=0.12)
    add_jade_pillars(bm_lacq, 3.1, -0.9, 0.55, 2.55, 0.92, 1.28, r=0.12)
    # Front crimson archway beam & doorway
    add_box(bm_lacq, (0, -1.52, 1.85), (1.75, 0.22, 1.95))
    add_box(bm_lacq, (0, -3.45, 2.15), (3.4, 0.26, 0.28))
    add_cyl(bm_lacq, (-1.45, -3.45, 0.5), (-1.45, -3.45, 2.2), 0.14, 0.13, segs=7)
    add_cyl(bm_lacq, (1.45, -3.45, 0.5), (1.45, -3.45, 2.2), 0.14, 0.13, segs=7)

    # Sweeping double-tiered jade ceramic pagoda roofs (+ Imperial 3rd tier at Age 3!)
    add_pagoda_roof(bm_roof, 0, 0.4, 3.15, 7.1, 5.7, 1.55, flare=0.38)
    add_pagoda_roof(bm_roof, -3.1, -0.9, 2.45, 2.8, 3.5, 0.92, flare=0.22)
    add_pagoda_roof(bm_roof, 3.1, -0.9, 2.45, 2.8, 3.5, 0.92, flare=0.22)
    add_pagoda_roof(bm_roof, 0, -3.45, 2.20, 3.8, 1.25, 0.55, flare=0.18)

    # Upper imperial throne pavilion
    add_box(bm_plaster, (0, 0.4, 4.95), (3.1, 2.4, 1.35))
    add_jade_pillars(bm_lacq, 0, 0.4, 4.3, 5.65, 1.62, 1.28, r=0.12)
    add_pagoda_roof(bm_roof, 0, 0.4, 5.55, 4.9, 3.9, 1.35, flare=0.36)

    if age >= 3:
        add_box(bm_lacq, (0, 0.4, 7.05), (1.7, 1.4, 0.95))
        add_pagoda_roof(bm_roof, 0, 0.4, 7.40, 3.2, 2.7, 1.15, flare=0.34)
        add_cyl(bm_gold, (0, 0.4, 8.45), (0, 0.4, 9.65), 0.18, 0.04, segs=8)
        add_sphere(bm_gold, (0, 0.4, 9.2), (0.28, 0.28, 0.28), subdiv=1)
        add_box(bm_gold, (0, 0.4, 8.52), (1.35, 0.22, 0.26))
    else:
        add_box(bm_gold, (0, 0.4, 6.88), (2.2, 0.22, 0.28))
        add_cyl(bm_gold, (0, 0.4, 6.90), (0, 0.4, 7.65), 0.14, 0.04, segs=7)

    # Glowing Imperial palace lanterns flanking entrance
    for lx in (-1.65, 1.65):
        add_lantern(bm_glow, bm_gold, lx, -3.55, 1.80, s=1.05)
        add_lantern(bm_glow, bm_gold, lx * 1.45, -1.70, 2.85, s=0.95)

    finish_part(root, "Terrace", bm_stone, "stone", mats, height_ref=4.0)
    finish_part(root, "Walls", bm_plaster, "plaster", mats, height_ref=7.0)
    finish_part(root, "Lacquer", bm_lacq, "lacquer", mats, height_ref=7.0)
    finish_part(root, "JadeRoof", bm_roof, "jadeRoof", mats, height_ref=8.5, smooth=True)
    finish_part(root, "GoldTrim", bm_gold, "gold", mats, height_ref=9.0)
    finish_part(root, "Lanterns", bm_glow, "glow", mats, height_ref=4.0)
    return root


def build_jade_house(mats):
    root = make_root("building:house:jade")
    bm_st, bm_pl, bm_la, bm_rf, bm_gd, bm_gl = (bmesh.new() for _ in range(6))
    add_box(bm_st, (0, 0, 0.22), (3.7, 3.3, 0.44))
    add_box(bm_pl, (0, 0, 1.25), (3.1, 2.7, 1.65))
    add_jade_pillars(bm_la, 0, 0, 0.42, 2.08, 1.62, 1.42, r=0.11)
    add_box(bm_la, (0, -1.38, 1.05), (0.85, 0.14, 1.25))
    add_pagoda_roof(bm_rf, 0, 0, 2.02, 4.45, 3.95, 1.28, flare=0.28)
    add_box(bm_gd, (0, 0, 3.28), (1.35, 0.16, 0.20))
    add_lantern(bm_gl, bm_gd, 0.85, -1.55, 1.72, s=0.8)
    finish_part(root, "Base", bm_st, "stone", mats, height_ref=2.5)
    finish_part(root, "Walls", bm_pl, "plaster", mats, height_ref=3.0)
    finish_part(root, "Pillars", bm_la, "lacquer", mats, height_ref=3.0)
    finish_part(root, "Roof", bm_rf, "jadeRoof", mats, height_ref=3.6, smooth=True)
    finish_part(root, "Finial", bm_gd, "gold", mats, height_ref=3.6)
    finish_part(root, "Lantern", bm_gl, "glow", mats, height_ref=2.5)
    return root


def build_jade_hall(mats, kind):
    """Builds distinct Jade Empire military & economic halls: barracks, range, stable, workshop, blacksmith, market, mill, camp, mine."""
    root = make_root(f"building:{kind}:jade")
    bm_st, bm_pl, bm_la, bm_rf, bm_wd, bm_gd, bm_gl, bm_tm = (bmesh.new() for _ in range(8))

    if kind == "barracks":
        add_box(bm_st, (0, 0, 0.28), (6.0, 5.2, 0.56))
        add_box(bm_pl, (0, 0.2, 1.72), (5.0, 3.8, 2.35))
        add_jade_pillars(bm_la, 0, 0.2, 0.52, 2.95, 2.65, 2.05, r=0.16)
        add_pagoda_roof(bm_rf, 0, 0.2, 2.88, 6.8, 5.6, 1.48, flare=0.34)
        add_box(bm_la, (0, 0.2, 4.45), (2.4, 1.8, 0.85))
        add_pagoda_roof(bm_rf, 0, 0.2, 4.78, 3.8, 3.0, 0.95, flare=0.28)
        add_box(bm_gd, (0, 0.2, 5.72), (1.7, 0.18, 0.24))
        # Twin crimson war drums on front terrace
        for dx in (-1.65, 1.65):
            add_cyl(bm_la, (dx, -2.05, 0.6), (dx, -2.05, 1.35), 0.42, 0.42, segs=10)
            add_box(bm_tm, (dx, -2.05, 2.35), (0.62, 0.10, 1.15))
            add_cyl(bm_wd, (dx, -2.05, 0.5), (dx, -2.05, 3.05), 0.06, 0.05, segs=6)
    elif kind == "range":
        add_box(bm_st, (0, 0, 0.24), (5.8, 5.0, 0.48))
        add_box(bm_pl, (0, 0.85, 1.50), (4.8, 2.6, 2.05))
        add_jade_pillars(bm_la, 0, 0.3, 0.46, 2.58, 2.55, 1.95, r=0.14)
        add_pagoda_roof(bm_rf, 0, 0.35, 2.52, 6.4, 5.0, 1.42, flare=0.32)
        add_box(bm_gd, (0, 0.35, 3.92), (1.8, 0.18, 0.22))
        # Straw archery targets in front courtyard
        for tx in (-1.5, 0.0, 1.5):
            add_cyl(bm_wd, (tx, -1.95, 0.48), (tx, -1.95, 1.45), 0.07, 0.06, segs=6)
            add_cyl(bm_tm, (tx, -1.82, 1.32), (tx, -2.05, 1.32), 0.42, 0.42, segs=10)
    elif kind == "stable":
        add_box(bm_st, (0, 0, 0.22), (6.0, 5.2, 0.44))
        add_box(bm_wd, (-0.7, 0.75, 1.45), (3.8, 2.8, 2.05))
        add_jade_pillars(bm_la, -0.7, 0.55, 0.42, 2.52, 2.05, 1.65, r=0.14)
        add_pagoda_roof(bm_rf, -0.7, 0.55, 2.48, 5.3, 4.4, 1.35, flare=0.30)
        # Paddock rail fence on right/front
        for fx in (1.3, 2.65):
            add_cyl(bm_wd, (fx, -2.1, 0.4), (fx, -2.1, 1.45), 0.09, 0.08, segs=6)
            add_cyl(bm_wd, (fx, 1.8, 0.4), (fx, 1.8, 1.45), 0.09, 0.08, segs=6)
        add_box(bm_wd, (2.65, -0.15, 1.05), (0.12, 3.9, 0.16))
        add_box(bm_wd, (0.6, -2.1, 1.05), (4.2, 0.12, 0.16))
        add_box(bm_tm, (-2.5, -1.8, 1.95), (0.75, 0.10, 1.25))
        add_cyl(bm_la, (-2.5, -1.8, 0.4), (-2.5, -1.8, 2.8), 0.07, 0.06, segs=6)
    elif kind == "workshop":
        # Imperial Gunpowder Arsenal with timber crane & black-powder barrels!
        add_box(bm_st, (0, 0, 0.28), (6.4, 5.6, 0.56))
        add_box(bm_pl, (-0.4, 0.45, 1.85), (4.6, 3.6, 2.55))
        add_jade_pillars(bm_la, -0.4, 0.45, 0.55, 3.15, 2.45, 1.95, r=0.16)
        add_pagoda_roof(bm_rf, -0.4, 0.45, 3.10, 6.2, 5.0, 1.55, flare=0.34)
        add_box(bm_gd, (-0.4, 0.45, 4.62), (1.8, 0.20, 0.24))
        # Overhead siege gantry + red powder kegs
        add_cyl(bm_wd, (2.2, -1.4, 0.5), (2.2, -1.4, 3.6), 0.14, 0.11, segs=7)
        add_cyl(bm_wd, (2.2, -1.4, 3.45), (0.6, -2.2, 3.25), 0.11, 0.09, segs=7)
        for kx, ky in [(1.6, -1.8), (2.25, -2.05), (1.9, -0.7)]:
            add_cyl(bm_la, (kx, ky, 0.55), (kx, ky, 1.32), 0.32, 0.30, segs=8)
            add_cyl(bm_gd, (kx, ky, 0.90), (kx, ky, 0.98), 0.34, 0.34, segs=8)
    elif kind == "blacksmith":
        add_box(bm_st, (0, 0, 0.26), (4.8, 4.4, 0.52))
        add_box(bm_pl, (-0.3, 0.25, 1.48), (3.4, 2.8, 1.95))
        add_jade_pillars(bm_la, -0.3, 0.25, 0.50, 2.48, 1.82, 1.52, r=0.13)
        add_pagoda_roof(bm_rf, -0.3, 0.25, 2.42, 4.9, 4.2, 1.35, flare=0.28)
        # Tall stone furnace chimney + glowing hearth
        add_box(bm_st, (1.55, 0.45, 2.15), (1.25, 1.25, 3.35))
        add_box(bm_gl, (1.55, -0.22, 1.05), (0.72, 0.18, 0.68))
        add_box(bm_gd, (-0.3, 0.25, 3.76), (1.2, 0.16, 0.20))
    elif kind == "market":
        # Lantern Bazaar — twin curved jade silk stalls + glowing hanging lanterns!
        add_box(bm_st, (0, 0, 0.22), (5.8, 5.2, 0.44))
        for sx in (-1.45, 1.45):
            add_jade_pillars(bm_la, sx, 0.3, 0.44, 2.35, 1.12, 1.65, r=0.11)
            add_pagoda_roof(bm_rf, sx, 0.3, 2.28, 3.05, 4.25, 1.02, flare=0.24)
            add_box(bm_wd, (sx, 0.2, 0.78), (1.5, 2.2, 0.68))
            add_box(bm_tm, (sx, 0.2, 1.18), (1.3, 1.9, 0.12))
            add_lantern(bm_gl, bm_gd, sx, -1.55, 1.95, s=1.05)
        add_lantern(bm_gl, bm_gd, 0.0, -1.85, 2.25, s=1.15)
        add_cyl(bm_la, (-1.45, -1.85, 2.55), (1.45, -1.85, 2.55), 0.06, 0.06, segs=6)
    elif kind == "mill":
        add_box(bm_st, (0, 0, 0.24), (4.2, 4.0, 0.48))
        add_box(bm_pl, (0, 0, 1.75), (3.0, 2.8, 2.55))
        add_jade_pillars(bm_la, 0, 0, 0.48, 3.05, 1.62, 1.52, r=0.12)
        add_pagoda_roof(bm_rf, 0, 0, 2.98, 4.4, 4.2, 1.38, flare=0.28)
        add_box(bm_gd, (0, 0, 4.36), (1.1, 0.16, 0.20))
        # Animated timber grain sails on front face (recognized by view's windmill animation!)
        bm_sail = bmesh.new()
        add_cyl(bm_sail, (0, -1.55, 2.15), (0, -1.88, 2.15), 0.16, 0.14, segs=8)
        for a in (0, math.pi * 0.5, math.pi, math.pi * 1.5):
            dx, dz = math.cos(a), math.sin(a)
            add_box(bm_sail, (dx * 0.85, -1.78, 2.15 + dz * 0.85), (1.55 if abs(dx) > 0.5 else 0.34, 0.08, 0.34 if abs(dx) > 0.5 else 1.55))
        sail_grp = bpy.data.objects.new("WindmillHub", None)
        sail_grp["windmill"] = True
        sail_grp.location = (0.0, -1.78, 2.15)
        bpy.context.scene.collection.objects.link(sail_grp)
        sail_grp.parent = root
        # Re-center sail verts around hub
        for v in bm_sail.verts:
            v.co -= Vector((0.0, -1.78, 2.15))
        finish_part(sail_grp, "MillSails", bm_sail, "wood", mats, height_ref=2.5)
    elif kind == "camp":
        add_box(bm_st, (0, 0, 0.16), (3.8, 3.4, 0.32))
        add_jade_pillars(bm_la, -0.3, 0.2, 0.32, 2.15, 1.35, 1.15, r=0.11)
        add_pagoda_roof(bm_rf, -0.3, 0.2, 2.10, 3.8, 3.3, 1.05, flare=0.22)
        for lz in (0.45, 0.82, 1.18):
            add_cyl(bm_wd, (0.6, -1.1, lz), (1.65, 0.4, lz), 0.19, 0.18, segs=7)
    else:  # mine
        add_box(bm_st, (0, 0, 0.18), (4.0, 3.6, 0.36))
        add_jade_pillars(bm_la, -0.3, 0.2, 0.36, 2.25, 1.35, 1.18, r=0.11)
        add_pagoda_roof(bm_rf, -0.3, 0.2, 2.20, 3.9, 3.4, 1.05, flare=0.24)
        add_box(bm_wd, (0.95, -0.85, 0.72), (1.15, 0.85, 0.65))
        add_sphere(bm_gd, (0.95, -0.85, 1.08), (0.38, 0.30, 0.24), subdiv=1)

    for nm, bm, rl, sm in [
        ("Base", bm_st, "stone", False), ("Walls", bm_pl, "plaster", False),
        ("Lacquer", bm_la, "lacquer", False), ("Roof", bm_rf, "jadeRoof", True),
        ("Timber", bm_wd, "wood", False), ("Gold", bm_gd, "gold", False),
        ("Glow", bm_gl, "glow", False), ("Banner", bm_tm, "team", False),
    ]:
        if len(bm.verts):
            finish_part(root, nm, bm, rl, mats, height_ref=5.5, smooth=sm)
        else:
            bm.free()
    return root


def build_jade_monastery(mats):
    root = make_root("building:monastery:jade")
    bm_st, bm_pl, bm_la, bm_rf, bm_gd, bm_gl = (bmesh.new() for _ in range(6))
    add_cyl(bm_st, (0, 0, 0), (0, 0, 0.55), 3.25, 3.05, segs=8)
    add_cyl(bm_pl, (0, 0, 0.55), (0, 0, 2.45), 2.35, 2.25, segs=8)
    for i in range(8):
        a = (i / 8.0) * math.tau
        add_cyl(bm_la, (math.cos(a) * 2.55, math.sin(a) * 2.55, 0.55), (math.cos(a) * 2.55, math.sin(a) * 2.55, 2.50), 0.12, 0.11, segs=6)
    add_pagoda_oct_roof(bm_rf, 0, 0, 2.42, 3.45, 1.38, flare=0.28)
    add_cyl(bm_pl, (0, 0, 3.65), (0, 0, 5.05), 1.55, 1.48, segs=8)
    add_pagoda_oct_roof(bm_rf, 0, 0, 4.98, 2.45, 1.25, flare=0.26)
    add_cyl(bm_gd, (0, 0, 6.18), (0, 0, 7.65), 0.16, 0.03, segs=8)
    add_sphere(bm_gd, (0, 0, 6.75), (0.30, 0.30, 0.32), subdiv=1)
    add_lantern(bm_gl, bm_gd, -1.25, -2.55, 1.95, s=0.95)
    add_lantern(bm_gl, bm_gd, 1.25, -2.55, 1.95, s=0.95)
    finish_part(root, "Terrace", bm_st, "stone", mats, height_ref=3.0)
    finish_part(root, "ShrineWalls", bm_pl, "plaster", mats, height_ref=6.0)
    finish_part(root, "Pillars", bm_la, "lacquer", mats, height_ref=5.0)
    finish_part(root, "PagodaRoof", bm_rf, "jadeRoof", mats, height_ref=7.0, smooth=True)
    finish_part(root, "LotusSpire", bm_gd, "gold", mats, height_ref=7.6)
    finish_part(root, "Lanterns", bm_gl, "glow", mats, height_ref=3.0)
    return root


def build_jade_tower(mats):
    root = make_root("building:tower:jade")
    bm_st, bm_pl, bm_la, bm_rf, bm_gd, bm_gl = (bmesh.new() for _ in range(6))
    # Battered stone foundation + 3-tier sweeping pagoda watchtower!
    add_cyl(bm_st, (0, 0, 0), (0, 0, 2.15), 2.05, 1.65, segs=4)
    add_box(bm_pl, (0, 0, 3.35), (2.45, 2.45, 2.45))
    add_jade_pillars(bm_la, 0, 0, 2.15, 4.58, 1.32, 1.32, r=0.12)
    add_pagoda_roof(bm_rf, 0, 0, 4.48, 3.95, 3.95, 1.05, flare=0.30)
    add_box(bm_la, (0, 0, 6.05), (1.85, 1.85, 1.35))
    add_pagoda_roof(bm_rf, 0, 0, 6.62, 3.35, 3.35, 1.18, flare=0.32)
    add_cyl(bm_gd, (0, 0, 7.75), (0, 0, 8.85), 0.14, 0.03, segs=7)
    add_lantern(bm_gl, bm_gd, 0, -1.55, 4.15, s=0.9)
    finish_part(root, "StoneBase", bm_st, "stone", mats, height_ref=4.0)
    finish_part(root, "Shaft", bm_pl, "plaster", mats, height_ref=6.0)
    finish_part(root, "Lacquer", bm_la, "lacquer", mats, height_ref=7.0)
    finish_part(root, "PagodaRoofs", bm_rf, "jadeRoof", mats, height_ref=8.5, smooth=True)
    finish_part(root, "Spire", bm_gd, "gold", mats, height_ref=8.8)
    finish_part(root, "Lantern", bm_gl, "glow", mats, height_ref=5.0)
    return root


def build_jade_keep(mats):
    root = make_root("building:keep:jade")
    bm_st, bm_pl, bm_la, bm_rf, bm_gd, bm_gl, bm_tm = (bmesh.new() for _ in range(7))
    # Massive stepped fortified stone castle plinth + 4 corner turrets + 3-tier Grand Dragon Citadel!
    add_box(bm_st, (0, 0, 1.35), (8.2, 8.2, 2.70))
    for sx in (-3.45, 3.45):
        for sy in (-3.45, 3.45):
            add_box(bm_st, (sx, sy, 2.15), (2.1, 2.1, 4.30))
            add_pagoda_roof(bm_rf, sx, sy, 4.25, 3.15, 3.15, 0.95, flare=0.26)
            add_cyl(bm_gd, (sx, sy, 5.15), (sx, sy, 5.75), 0.09, 0.03, segs=6)
    # Central 3-tier Dragon Keep Palace
    add_box(bm_pl, (0, 0, 4.15), (5.4, 5.0, 2.95))
    add_jade_pillars(bm_la, 0, 0, 2.70, 5.65, 2.85, 2.65, r=0.18)
    add_pagoda_roof(bm_rf, 0, 0, 5.55, 7.6, 7.1, 1.55, flare=0.40)

    add_box(bm_pl, (0, 0, 7.55), (3.7, 3.4, 1.85))
    add_jade_pillars(bm_la, 0, 0, 6.85, 8.45, 1.95, 1.82, r=0.14)
    add_pagoda_roof(bm_rf, 0, 0, 8.35, 5.6, 5.2, 1.38, flare=0.38)

    add_box(bm_la, (0, 0, 9.95), (2.1, 1.9, 1.15))
    add_pagoda_roof(bm_rf, 0, 0, 10.42, 3.8, 3.5, 1.25, flare=0.36)
    add_box(bm_gd, (0, 0, 11.65), (1.7, 0.24, 0.30))
    add_cyl(bm_gd, (0, 0, 11.65), (0, 0, 12.85), 0.16, 0.04, segs=8)
    # Front iron-bound gatehouse portal + imperial banners + glowing torches
    add_box(bm_la, (0, -4.12, 1.35), (2.15, 0.24, 2.25))
    for lx in (-1.55, 1.55):
        add_lantern(bm_gl, bm_gd, lx, -4.35, 2.45, s=1.2)
        add_box(bm_tm, (lx * 1.4, -4.25, 3.2), (0.65, 0.10, 1.35))

    finish_part(root, "StoneBastion", bm_st, "stone", mats, height_ref=6.0)
    finish_part(root, "PalaceWalls", bm_pl, "plaster", mats, height_ref=10.0)
    finish_part(root, "Lacquer", bm_la, "lacquer", mats, height_ref=11.0)
    finish_part(root, "JadeRoofs", bm_rf, "jadeRoof", mats, height_ref=12.0, smooth=True)
    finish_part(root, "GoldFinials", bm_gd, "gold", mats, height_ref=12.8)
    finish_part(root, "Lanterns", bm_gl, "glow", mats, height_ref=4.0)
    finish_part(root, "Banners", bm_tm, "team", mats, height_ref=5.0)
    return root


def build_jade_wonder(mats):
    root = make_root("building:wonder:jade")
    bm_st, bm_pl, bm_la, bm_rf, bm_gd, bm_gl = (bmesh.new() for _ in range(6))
    # Monumental 5-tier Heavenly Jade Pagoda on grand octagonal marble altar!
    add_cyl(bm_st, (0, 0, 0.0), (0, 0, 0.85), 5.6, 5.1, segs=8)
    add_cyl(bm_st, (0, 0, 0.85), (0, 0, 1.55), 4.6, 4.3, segs=8)
    tiers = [
        (1.55, 3.35, 2.15, 4.55, 1.25),
        (4.15, 2.75, 1.85, 3.85, 1.15),
        (6.45, 2.20, 1.65, 3.20, 1.05),
        (8.45, 1.70, 1.45, 2.60, 0.98),
        (10.20, 1.25, 1.25, 2.05, 1.15),
    ]
    for z0, wr, wh, rr, rh in tiers:
        add_cyl(bm_pl, (0, 0, z0), (0, 0, z0 + wh), wr, wr * 0.96, segs=8)
        for i in range(8):
            a = (i / 8.0) * math.tau
            add_cyl(bm_la, (math.cos(a) * (wr + 0.14), math.sin(a) * (wr + 0.14), z0), (math.cos(a) * (wr + 0.14), math.sin(a) * (wr + 0.14), z0 + wh), 0.12, 0.10, segs=6)
        add_pagoda_oct_roof(bm_rf, 0, 0, z0 + wh - 0.12, rr, rh, flare=0.30)
    # Towering golden dragon pinnacle spire + radiant lanterns
    add_cyl(bm_gd, (0, 0, 12.45), (0, 0, 15.20), 0.24, 0.04, segs=8)
    for sz in (13.1, 13.7, 14.3):
        add_sphere(bm_gd, (0, 0, sz), (0.42 - (sz - 13.0) * 0.12, 0.42 - (sz - 13.0) * 0.12, 0.28), subdiv=1)
    for i in range(4):
        a = i * math.pi * 0.5 + math.pi * 0.25
        add_lantern(bm_gl, bm_gd, math.cos(a) * 4.2, math.sin(a) * 4.2, 2.85, s=1.35)
    finish_part(root, "MarbleAltar", bm_st, "stone", mats, height_ref=4.0)
    finish_part(root, "PagodaBody", bm_pl, "plaster", mats, height_ref=12.0)
    finish_part(root, "CrimsonColumns", bm_la, "lacquer", mats, height_ref=12.0)
    finish_part(root, "JadeTiers", bm_rf, "jadeRoof", mats, height_ref=13.5, smooth=True)
    finish_part(root, "GoldenSpire", bm_gd, "gold", mats, height_ref=15.2)
    finish_part(root, "Lanterns", bm_gl, "glow", mats, height_ref=4.0)
    return root


def build_jade_dock(mats):
    root = make_root("building:dock:jade")
    pier = bpy.data.objects.new("DockPier", None)
    pier["dockPier"] = True
    bpy.context.scene.collection.objects.link(pier)
    pier.parent = root
    bm_wd, bm_la, bm_rf, bm_gd, bm_gl = (bmesh.new() for _ in range(5))
    add_box(bm_wd, (0, -0.4, 0.55), (4.6, 5.4, 0.36))
    for px in (-2.0, 0.0, 2.0):
        for py in (-2.8, -0.5, 1.9):
            add_cyl(bm_wd, (px, py, -1.0), (px, py, 0.65), 0.16, 0.15, segs=6)
    add_jade_pillars(bm_la, 0, 1.15, 0.72, 2.85, 1.65, 1.05, r=0.13)
    add_pagoda_roof(bm_rf, 0, 1.15, 2.80, 4.4, 3.2, 1.15, flare=0.28)
    add_box(bm_gd, (0, 1.15, 3.92), (1.3, 0.16, 0.20))
    add_lantern(bm_gl, bm_gd, -1.85, -2.55, 1.65, s=0.95)
    add_lantern(bm_gl, bm_gd, 1.85, -2.55, 1.65, s=0.95)
    finish_part(pier, "PierDeck", bm_wd, "wood", mats, height_ref=2.5)
    finish_part(pier, "GatePillars", bm_la, "lacquer", mats, height_ref=3.5)
    finish_part(pier, "HarborRoof", bm_rf, "jadeRoof", mats, height_ref=4.2, smooth=True)
    finish_part(pier, "GoldTrim", bm_gd, "gold", mats, height_ref=4.2)
    finish_part(pier, "Lanterns", bm_gl, "glow", mats, height_ref=2.5)
    return root


# ---------------------------------------------------------------------------
# 2. SCULPTED UNITS — REPEATING CROSSBOWMAN, FIRE LANCER, TREBUCHET & 5 HEROES
# ---------------------------------------------------------------------------
def add_warhorse(bm_horse, bm_mane, bm_armor, bm_team, armored=True):
    """Sculpted heroic warhorse facing -Y in Blender (+Z in Three.js)."""
    # Barrel torso, arched neck, sculpted head & tail
    add_sphere(bm_horse, (0, 0.05, 1.18), (0.46, 0.94, 0.44), subdiv=2)
    add_cyl(bm_horse, (0, -0.58, 1.32), (0, -0.96, 1.98), 0.28, 0.20, segs=8)
    add_sphere(bm_horse, (0, -1.16, 2.02), (0.20, 0.34, 0.22), subdiv=2)
    # 4 legs grounded at z = 0
    for sx in (-0.28, 0.28):
        for sy in (-0.56, 0.58):
            add_cyl(bm_horse, (sx, sy, 1.12), (sx, sy - 0.04, 0.56), 0.12, 0.085, segs=7)
            add_cyl(bm_horse, (sx, sy - 0.04, 0.56), (sx, sy, 0.0), 0.08, 0.09, segs=7)
    # Flowing mane & tail
    add_cyl(bm_mane, (0, -0.42, 1.48), (0, -0.82, 2.12), 0.10, 0.08, segs=6)
    add_cyl(bm_mane, (0, 0.92, 1.28), (0, 1.18, 0.55), 0.11, 0.05, segs=6)
    if armored:
        # Chamfron & chest/flank barding
        add_sphere(bm_armor, (0, -0.62, 1.38), (0.47, 0.36, 0.32), subdiv=1)
        add_box(bm_armor, (0, -1.24, 2.08), (0.18, 0.28, 0.22))
        add_box(bm_team, (0, 0.08, 1.14), (0.98, 1.42, 0.58))


def add_rider_body(bm_armor, bm_skin, bm_team, bm_gold, z_off=0.0, scale=1.0):
    s = scale
    # Armored cuirass, pauldrons, legs, arms, head & flowing hero cape
    add_box(bm_armor, (0, 0, z_off + 1.18 * s), (0.58 * s, 0.38 * s, 0.72 * s))
    add_sphere(bm_armor, (-0.38 * s, 0, z_off + 1.42 * s), (0.20 * s, 0.20 * s, 0.18 * s), subdiv=1)
    add_sphere(bm_armor, (0.38 * s, 0, z_off + 1.42 * s), (0.20 * s, 0.20 * s, 0.18 * s), subdiv=1)
    add_box(bm_gold, (0, -0.20 * s, z_off + 1.05 * s), (0.60 * s, 0.08 * s, 0.12 * s))
    add_sphere(bm_skin, (0, -0.02 * s, z_off + 1.78 * s), (0.21 * s, 0.22 * s, 0.24 * s), subdiv=2)
    # Legs (either straddling saddle or standing grounded at z=0)
    if z_off > 0.1:
        for sx in (-0.34 * s, 0.34 * s):
            add_cyl(bm_armor, (sx, 0.02, z_off + 0.88 * s), (sx * 1.18, -0.10, z_off + 0.12 * s), 0.13 * s, 0.10 * s, segs=6)
    else:
        for sx in (-0.18 * s, 0.18 * s):
            add_cyl(bm_armor, (sx, 0, 0.86 * s), (sx, 0, 0.0), 0.15 * s, 0.12 * s, segs=7)
    # Flowing heroic team-colored cloak behind shoulders
    add_box(bm_team, (0, 0.28 * s, z_off + 0.96 * s), (0.62 * s, 0.10 * s, 1.08 * s), rot=(0.24, 0, 0))


def build_unit_chukonu(mats):
    root = make_root("unit:chukonu")
    body = bpy.data.objects.new("Body", None)
    body["assetBody"] = True
    bpy.context.scene.collection.objects.link(body)
    body.parent = root
    bm_ar, bm_sk, bm_tm, bm_wd, bm_gd = (bmesh.new() for _ in range(5))
    add_rider_body(bm_ar, bm_sk, bm_tm, bm_gd, z_off=0.0, scale=0.98)
    # Conical Imperial Jade lamellar helmet + crimson tassel
    add_cyl(bm_gd, (0, 0, 1.92), (0, 0, 2.24), 0.34, 0.05, segs=8)
    # Box-magazine Repeating Crossbow (Chu-Ko-Nu!) held forward (-Y)
    add_box(bm_wd, (0.16, -0.48, 1.24), (0.14, 0.72, 0.16))
    add_box(bm_wd, (0.16, -0.44, 1.40), (0.12, 0.38, 0.20))  # Top bolt magazine box!
    add_box(bm_wd, (0.16, -0.78, 1.24), (0.96, 0.09, 0.08))  # Bow prod
    finish_part(body, "Lamellar", bm_ar, "jadeRoof", mats, height_ref=2.2, smooth=True)
    finish_part(body, "Skin", bm_sk, "skin", mats, height_ref=2.0, smooth=True)
    finish_part(body, "Tabard", bm_tm, "team", mats, height_ref=2.0)
    finish_part(body, "Crossbow", bm_wd, "wood", mats, height_ref=2.0)
    finish_part(body, "Helm", bm_gd, "gold", mats, height_ref=2.2)
    return root


def build_unit_firelancer(mats):
    root = make_root("unit:firelancer")
    body = bpy.data.objects.new("Body", None)
    body["assetBody"] = True
    bpy.context.scene.collection.objects.link(body)
    body.parent = root
    bm_ho, bm_mn, bm_ar, bm_sk, bm_tm, bm_gd, bm_gl, bm_la = (bmesh.new() for _ in range(8))
    add_warhorse(bm_ho, bm_mn, bm_ar, bm_tm, armored=True)
    add_rider_body(bm_ar, bm_sk, bm_tm, bm_gd, z_off=0.88, scale=0.98)
    # Imperial helm with crimson plume
    add_cyl(bm_gd, (0, 0, 2.75), (0, 0, 3.12), 0.28, 0.05, segs=8)
    add_cyl(bm_la, (0, 0.05, 3.05), (0, 0.35, 3.35), 0.08, 0.03, segs=6)
    # Long gunpowder Fire-Lance extending forward (-Y) with iron barrel & glowing ignition tip!
    add_cyl(bm_la, (0.48, 0.55, 2.02), (0.44, -1.95, 2.08), 0.065, 0.06, segs=7)
    add_cyl(bm_gd, (0.44, -1.55, 2.07), (0.43, -2.35, 2.09), 0.11, 0.10, segs=8)
    add_sphere(bm_gl, (0.43, -2.45, 2.10), (0.14, 0.22, 0.14), subdiv=1)
    for nm, bm, rl, sm in [
        ("Horse", bm_ho, "horse", True), ("Mane", bm_mn, "mane", True),
        ("Armor", bm_ar, "steel", True), ("Skin", bm_sk, "skin", True),
        ("Barding", bm_tm, "team", False), ("Gold", bm_gd, "gold", False),
        ("FireTip", bm_gl, "glow", True), ("Lance", bm_la, "lacquer", False),
    ]:
        finish_part(body, nm, bm, rl, mats, height_ref=3.4, smooth=sm)
    return root


def build_unit_trebuchet(mats):
    """Monumental Giant Counterweight Trebuchet with tall A-frame truss, heavy iron-banded counterweight,
    long throwing arm & glowing blazing fire boulder!"""
    root = make_root("unit:trebuchet")
    body = bpy.data.objects.new("Body", None)
    body["assetBody"] = True
    bpy.context.scene.collection.objects.link(body)
    body.parent = root
    bm_wd, bm_dw, bm_ir, bm_st, bm_gl, bm_tm = (bmesh.new() for _ in range(6))

    # Heavy timber wheeled siege chassis (3.2m wide x 4.6m long!)
    for sx in (-1.35, 1.35):
        add_box(bm_wd, (sx, 0, 0.52), (0.34, 4.45, 0.34))
        # Tall A-frame timber towers supporting axle at z = 3.65m
        add_cyl(bm_wd, (sx, -1.75, 0.55), (sx * 0.72, -0.35, 3.72), 0.18, 0.15, segs=7)
        add_cyl(bm_wd, (sx, 1.85, 0.55), (sx * 0.72, -0.35, 3.72), 0.18, 0.15, segs=7)
        add_cyl(bm_dw, (sx, 0.05, 0.55), (sx * 0.72, -0.35, 3.72), 0.16, 0.14, segs=7)
        # 4 massive iron-rimmed timber siege wheels grounded at z=0
        for wy in (-1.55, 1.55):
            add_cyl(bm_dw, (sx + (0.28 if sx > 0 else -0.28), wy, 0.52), (sx + (0.04 if sx > 0 else -0.04), wy, 0.52), 0.52, 0.52, segs=12)
            add_cyl(bm_ir, (sx + (0.30 if sx > 0 else -0.30), wy, 0.52), (sx + (0.24 if sx > 0 else -0.24), wy, 0.52), 0.18, 0.18, segs=8)
    # Cross beams & timber firing trough
    for cy in (-1.95, 0.0, 1.95):
        add_box(bm_wd, (0, cy, 0.52), (2.95, 0.32, 0.28))
    add_box(bm_dw, (0, 0.35, 0.74), (0.95, 3.65, 0.16))
    # Iron main pivot axle + heavy hanging counterweight chest (filled with boulders!)
    add_cyl(bm_ir, (-1.18, -0.35, 3.65), (1.18, -0.35, 3.65), 0.15, 0.15, segs=8)
    add_box(bm_dw, (0, -1.35, 2.15), (1.35, 1.25, 1.38))
    add_box(bm_ir, (0, -1.35, 2.52), (1.42, 1.32, 0.16))
    add_box(bm_ir, (0, -1.35, 1.78), (1.42, 1.32, 0.16))
    add_sphere(bm_st, (0, -1.35, 2.88), (0.55, 0.48, 0.34), subdiv=1)

    # Animated throwing arm + sling + blazing fireball boulder!
    arm_grp = bpy.data.objects.new("TrebuchetArm", None)
    arm_grp.location = (0.0, -0.35, 3.65)
    bpy.context.scene.collection.objects.link(arm_grp)
    arm_grp.parent = body
    bm_arm = bmesh.new()
    # Long dramatic arm angled up & back (ready to hurl forward -Y!)
    add_cyl(bm_arm, (0, -1.15, -0.55), (0, 3.15, 1.75), 0.20, 0.10, segs=8)
    add_cyl(bm_arm, (-0.38, -1.0, -0.48), (-0.38, -1.0, -1.55), 0.07, 0.07, segs=6)
    add_cyl(bm_arm, (0.38, -1.0, -0.48), (0.38, -1.0, -1.55), 0.07, 0.07, segs=6)
    finish_part(arm_grp, "ThrowingBeam", bm_arm, "wood", mats, height_ref=5.5, extra={"motion": {"type": "siegearm", "pivot": [0, 3.65, 0.35]}})

    # Glowing flaming boulder resting in firing trough / sling
    add_sphere(bm_gl, (0, 1.95, 1.18), (0.44, 0.44, 0.44), subdiv=2)
    # Faction war pennant fluttering atop A-frame
    add_cyl(bm_ir, (0.98, -0.35, 3.70), (0.98, -0.35, 5.15), 0.05, 0.04, segs=6)
    add_box(bm_tm, (0.98, 0.05, 4.78), (0.08, 0.85, 0.46))

    finish_part(body, "Frame", bm_wd, "wood", mats, height_ref=4.5)
    finish_part(body, "DarkTimber", bm_dw, "darkwood", mats, height_ref=3.5)
    finish_part(body, "Ironwork", bm_ir, "iron", mats, height_ref=4.0)
    finish_part(body, "CounterweightStone", bm_st, "stoneDark", mats, height_ref=3.5)
    finish_part(body, "FireBoulder", bm_gl, "glow", mats, height_ref=2.5, smooth=True)
    finish_part(body, "Pennant", bm_tm, "team", mats, height_ref=5.0)
    return root


def build_hero_general(mats, civ):
    """Builds 1 of 5 iconic, larger-than-life Blender 4.5 LTS Hero Champions with glowing aura crest & banner!"""
    root = make_root(f"unit:hero_{civ}")
    body = bpy.data.objects.new("Body", None)
    body["assetBody"] = True
    bpy.context.scene.collection.objects.link(body)
    body.parent = root
    bm_ho, bm_mn, bm_ar, bm_sk, bm_tm, bm_gd, bm_gl, bm_wp = (bmesh.new() for _ in range(8))

    if civ == "iron":
        # Forgemaster Borin — colossal heavily armored Rune-Plate Champion on foot with molten warhammer & tower shield!
        add_rider_body(bm_ar, bm_sk, bm_tm, bm_gd, z_off=0.0, scale=1.34)
        # Horned Ironhold furnace crown
        add_cyl(bm_gd, (0, 0, 2.52), (0, 0, 2.88), 0.34, 0.28, segs=8)
        for sx in (-1, 1):
            add_cyl(bm_gd, (sx * 0.28, 0, 2.75), (sx * 0.62, -0.12, 3.12), 0.09, 0.03, segs=6)
        # Colossal glowing Rune Warhammer (right hand) + Fortified Tower Shield (left hand)
        add_cyl(bm_wp, (0.62, -0.25, 0.95), (0.68, -0.82, 2.72), 0.08, 0.08, segs=7)
        add_box(bm_ar, (0.68, -0.88, 2.68), (0.46, 0.84, 0.50))
        add_box(bm_gl, (0.68, -0.88, 2.68), (0.50, 0.42, 0.20))
        add_box(bm_gd, (-0.64, -0.32, 1.48), (0.16, 0.72, 1.38))
        add_box(bm_tm, (-0.70, -0.32, 1.48), (0.08, 0.56, 1.08))
    else:
        # Mounted Hero Generals (scale 1.18x bigger & more majestic than ordinary knights!)
        add_warhorse(bm_ho, bm_mn, bm_ar, bm_tm, armored=True)
        add_rider_body(bm_ar, bm_sk, bm_tm, bm_gd, z_off=0.92, scale=1.14)
        # Back-mounted tall Royal Hero War Standard so you spot your Hero instantly in 200-soldier battles!
        add_cyl(bm_gd, (-0.36, 0.32, 1.65), (-0.36, 0.42, 4.35), 0.055, 0.045, segs=6)
        add_box(bm_tm, (-0.36, 0.82, 3.72), (0.08, 0.85, 1.12))
        add_sphere(bm_gd, (-0.36, 0.42, 4.42), (0.14, 0.14, 0.14), subdiv=1)

        if civ == "alder":
            # Marshal Rowan — plumed royal greathelm, radiant greatsword & kite shield
            add_cyl(bm_gd, (0, 0, 2.95), (0, 0, 3.38), 0.28, 0.25, segs=8)
            add_cyl(bm_tm, (0, 0.06, 3.35), (0, 0.48, 3.68), 0.10, 0.04, segs=6)
            add_box(bm_wp, (0.58, -0.78, 2.55), (0.09, 0.20, 1.68), rot=(-0.48, 0, 0))
            add_box(bm_gd, (0.58, -0.45, 2.02), (0.48, 0.12, 0.12))
            add_box(bm_gd, (-0.52, -0.35, 2.15), (0.12, 0.55, 0.88))
        elif civ == "sun":
            # Sun Sovereign — golden sunburst turban crown + glowing curved solar scimitar
            add_sphere(bm_gd, (0, 0, 3.18), (0.34, 0.34, 0.28), subdiv=2)
            add_sphere(bm_gl, (0, -0.26, 3.24), (0.12, 0.10, 0.12), subdiv=1)
            add_cyl(bm_gd, (0.56, -0.38, 2.02), (0.64, -1.25, 3.05), 0.09, 0.04, segs=7)
            add_sphere(bm_gl, (0.64, -1.25, 3.05), (0.13, 0.13, 0.13), subdiv=1)
        elif civ == "raven":
            # Shadow Khan — horned iron war-helm + twin brutal war-axes
            add_cyl(bm_ar, (0, 0, 2.95), (0, 0, 3.36), 0.29, 0.22, segs=8)
            for sx in (-1, 1):
                add_cyl(bm_gd, (sx * 0.24, 0, 3.22), (sx * 0.55, -0.12, 3.56), 0.08, 0.025, segs=6)
                add_cyl(bm_wp, (sx * 0.56, -0.35, 2.05), (sx * 0.62, -0.95, 2.75), 0.06, 0.06, segs=6)
                add_box(bm_ar, (sx * 0.62, -0.98, 2.68), (0.10, 0.45, 0.36))
        else:  # jade — Dragon Marshal!
            # Imperial Dragon Crest with twin long golden pheasant feathers + sweeping Guandao crescent polearm!
            add_cyl(bm_gd, (0, 0, 2.95), (0, 0, 3.42), 0.32, 0.10, segs=8)
            for sx in (-1, 1):
                add_cyl(bm_gl, (sx * 0.16, 0.05, 3.32), (sx * 0.58, 0.62, 4.18), 0.045, 0.02, segs=5)
            add_cyl(bm_gd, (0.56, 0.42, 1.65), (0.54, -1.55, 3.12), 0.06, 0.055, segs=7)
            add_box(bm_wp, (0.54, -1.68, 3.22), (0.08, 0.55, 0.32), rot=(-0.5, 0, 0))

    horse_mat = "stone" if civ == "sun" else "mane" if civ == "raven" else "horse"
    armor_mat = "jadeRoof" if civ == "jade" else "iron" if civ in ("iron", "raven") else "steel"
    for nm, bm, rl, sm in [
        ("Horse", bm_ho, horse_mat, True), ("Mane", bm_mn, "mane", True),
        ("Armor", bm_ar, armor_mat, True), ("Skin", bm_sk, "skin", True),
        ("BannerCape", bm_tm, "team", False), ("GoldCrest", bm_gd, "gold", True),
        ("AuraGlow", bm_gl, "glow", True), ("Weapon", bm_wp, "steel", False),
    ]:
        if len(bm.verts):
            finish_part(body, nm, bm, rl, mats, height_ref=4.4, smooth=sm)
        else:
            bm.free()
    return root


def build_prop_rubble(mats):
    root = make_root("prop:rubble")
    bm_st, bm_wd, bm_gl = bmesh.new(), bmesh.new(), bmesh.new()
    blocks = [
        (0.0, 0.0, 0.28, 1.15, 0.92, 0.56, 0.15),
        (-0.85, 0.42, 0.22, 0.85, 0.78, 0.44, -0.4),
        (0.92, -0.35, 0.24, 0.92, 0.74, 0.48, 0.6),
        (-0.35, -0.78, 0.18, 0.75, 0.65, 0.36, 0.9),
        (0.42, 0.78, 0.20, 0.78, 0.68, 0.40, -0.8),
        (0.15, -0.18, 0.56, 0.68, 0.56, 0.42, 0.35),
    ]
    for x, y, z, sx, sy, sz, rz in blocks:
        add_box(bm_st, (x, y, z), (sx, sy, sz), rot=(rz * 0.3, rz * 0.2, rz))
    # Splintered charred beams jutting out + faint glowing embers
    add_box(bm_wd, (-0.25, 0.18, 0.48), (1.85, 0.18, 0.18), rot=(0.25, -0.32, 0.55))
    add_box(bm_wd, (0.35, -0.22, 0.40), (1.55, 0.16, 0.16), rot=(-0.22, 0.28, -0.75))
    add_sphere(bm_gl, (0.05, 0.05, 0.18), (0.45, 0.38, 0.16), subdiv=1)
    finish_part(root, "MasonryDebris", bm_st, "stoneDark", mats, height_ref=1.2)
    finish_part(root, "BrokenBeams", bm_wd, "darkwood", mats, height_ref=1.0)
    finish_part(root, "SmolderingEmbers", bm_gl, "glow", mats, height_ref=0.8, smooth=True)
    return root


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True)
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
    out_dir = Path(args.output)
    out_dir.mkdir(parents=True, exist_ok=True)

    clear_scene()
    mats = ensure_materials()

    roots = [
        build_jade_towncenter(mats, age=2),
        build_jade_towncenter(mats, age=3),
        build_jade_house(mats),
        build_jade_hall(mats, "barracks"),
        build_jade_hall(mats, "range"),
        build_jade_hall(mats, "stable"),
        build_jade_hall(mats, "workshop"),
        build_jade_hall(mats, "blacksmith"),
        build_jade_hall(mats, "market"),
        build_jade_monastery(mats),
        build_jade_hall(mats, "mill"),
        build_jade_hall(mats, "camp"),
        build_jade_hall(mats, "mine"),
        build_jade_tower(mats),
        build_jade_keep(mats),
        build_jade_wonder(mats),
        build_jade_dock(mats),
        build_unit_chukonu(mats),
        build_unit_firelancer(mats),
        build_unit_trebuchet(mats),
        build_hero_general(mats, "alder"),
        build_hero_general(mats, "sun"),
        build_hero_general(mats, "raven"),
        build_hero_general(mats, "iron"),
        build_hero_general(mats, "jade"),
        build_prop_rubble(mats),
    ]

    for r in roots:
        r.location = (0.0, 0.0, 0.0)

    raw_glb = out_dir / "frontier-jade-heroes-raw.glb"
    bpy.ops.export_scene.gltf(
        filepath=str(raw_glb),
        export_format="GLB",
        export_extras=True,
        export_yup=True,
        export_normals=True,
        export_texcoords=True,
        export_attributes=True,
        export_materials="EXPORT",
    )

    total_tris = sum(len(obj.data.polygons) for obj in bpy.data.objects if obj.type == "MESH")
    report = {
        "models": len(roots),
        "keys": [r["assetKey"] for r in roots],
        "meshes": sum(1 for obj in bpy.data.objects if obj.type == "MESH"),
        "polygons": total_tris,
    }
    (out_dir / "report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report))


if __name__ == "__main__":
    main()
