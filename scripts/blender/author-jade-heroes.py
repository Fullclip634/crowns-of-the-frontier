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
    "stone": ((0.68, 0.66, 0.61, 1.0), 0.90, 0.0),
    "stoneDark": ((0.40, 0.42, 0.43, 1.0), 0.92, 0.0),
    "plaster": ((0.88, 0.84, 0.76, 1.0), 0.92, 0.0),
    "brick": ((0.56, 0.36, 0.25, 1.0), 0.88, 0.0),
    "wood": ((0.52, 0.38, 0.25, 1.0), 0.88, 0.0),
    "darkwood": ((0.24, 0.17, 0.12, 1.0), 0.90, 0.0),
    "straw": ((0.66, 0.54, 0.32, 1.0), 0.96, 0.0),
    "jadeRoof": ((0.24, 0.48, 0.40, 1.0), 0.76, 0.05),
    "lacquer": ((0.55, 0.22, 0.17, 1.0), 0.74, 0.03),
    "gold": ((0.86, 0.68, 0.26, 1.0), 0.38, 0.52),
    "iron": ((0.32, 0.35, 0.39, 1.0), 0.48, 0.52),
    "steel": ((0.74, 0.78, 0.82, 1.0), 0.32, 0.58),
    "glass": ((0.86, 0.72, 0.44, 1.0), 0.28, 0.05),
    "glow": ((0.98, 0.48, 0.14, 1.0), 0.35, 0.0),
    "canvas": ((0.84, 0.75, 0.58, 1.0), 0.92, 0.0),
    "grain": ((0.90, 0.74, 0.32, 1.0), 0.90, 0.0),
    "soil": ((0.48, 0.40, 0.30, 1.0), 0.96, 0.0),
    "leather": ((0.36, 0.26, 0.19, 1.0), 0.84, 0.0),
    "pants": ((0.30, 0.34, 0.28, 1.0), 0.90, 0.0),
    "skin": ((0.82, 0.64, 0.50, 1.0), 0.82, 0.0),
    "hair": ((0.18, 0.15, 0.13, 1.0), 0.88, 0.0),
    "horse": ((0.48, 0.32, 0.20, 1.0), 0.80, 0.0),
    "mane": ((0.16, 0.13, 0.12, 1.0), 0.88, 0.0),
    "team": ((0.22, 0.56, 0.46, 1.0), 0.82, 0.02),
    "teamRoof": ((0.28, 0.42, 0.44, 1.0), 0.82, 0.04),
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


def add_tapered_box(bm, cx, cy, z0, z1, sx0, sy0, sx1, sy1, rot_z=0.0):
    hx0, hy0 = sx0 * 0.5, sy0 * 0.5
    hx1, hy1 = sx1 * 0.5, sy1 * 0.5
    rot = Matrix.Rotation(rot_z, 3, "Z")
    def pt(x, y, z):
        v = rot @ Vector((x, y, 0.0))
        return (cx + v.x, cy + v.y, z)
    v0 = bm.verts.new(pt(-hx0, -hy0, z0))
    v1 = bm.verts.new(pt(hx0, -hy0, z0))
    v2 = bm.verts.new(pt(hx0, hy0, z0))
    v3 = bm.verts.new(pt(-hx0, hy0, z0))
    v4 = bm.verts.new(pt(-hx1, -hy1, z1))
    v5 = bm.verts.new(pt(hx1, -hy1, z1))
    v6 = bm.verts.new(pt(hx1, hy1, z1))
    v7 = bm.verts.new(pt(-hx1, hy1, z1))
    bm.faces.new((v3, v2, v1, v0))
    bm.faces.new((v4, v5, v6, v7))
    bm.faces.new((v0, v1, v5, v4))
    bm.faces.new((v1, v2, v6, v5))
    bm.faces.new((v2, v3, v7, v6))
    bm.faces.new((v3, v0, v4, v7))


class JadeBuilder:
    """Multi-material closed-manifold architectural builder matching Ironhold/Alder craft."""
    def __init__(self, key, mats, parent=None, height_ref=6.5):
        self.key = key
        self.mats = mats
        self.height_ref = height_ref
        self.root = parent if parent is not None else make_root(key)
        self.buckets = {}

    def bm(self, role):
        b = self.buckets.get(role)
        if b is None:
            b = bmesh.new()
            self.buckets[role] = b
        return b

    def box(self, role, cx, cy, cz, sx, sy, sz, rot=(0.0, 0.0, 0.0)):
        add_box(self.bm(role), (cx, cy, cz), (sx, sy, sz), rot=rot)

    def box_z(self, role, cx, cy, z0, z1, sx, sy, rot_z=0.0):
        add_box(self.bm(role), (cx, cy, (z0 + z1) * 0.5), (sx, sy, z1 - z0), rot=(0.0, 0.0, rot_z))

    def tapered(self, role, cx, cy, z0, z1, sx0, sy0, sx1, sy1, rot_z=0.0):
        add_tapered_box(self.bm(role), cx, cy, z0, z1, sx0, sy0, sx1, sy1, rot_z=rot_z)

    def cyl(self, role, p0, p1, r0, r1=None, segs=8):
        add_cyl(self.bm(role), p0, p1, r0, r0 if r1 is None else r1, segs=segs)

    def sphere(self, role, center, radii, subdiv=1):
        add_sphere(self.bm(role), center, radii, subdiv=subdiv)

    def barrel(self, x, y, z0, r=0.22, h=0.56):
        self.cyl("wood", (x, y, z0), (x, y, z0 + h), r, r * 0.95, segs=7)
        self.cyl("iron", (x, y, z0 + h * 0.24), (x, y, z0 + h * 0.34), r * 1.05, r * 1.05, segs=7)
        self.cyl("iron", (x, y, z0 + h * 0.68), (x, y, z0 + h * 0.78), r * 1.05, r * 1.05, segs=7)

    def crate(self, x, y, z0, s=0.54):
        self.box_z("wood", x, y, z0, z0 + s, s, s)
        self.box("darkwood", x, y, z0 + s * 0.5, s + 0.05, s * 0.16, s + 0.05)

    def lantern(self, x, y, z, s=0.72):
        # Refined architectural wooden-framed palace lantern (never oversized neon ball!)
        self.box("darkwood", x, y, z + 0.20 * s, 0.24 * s, 0.24 * s, 0.06 * s)
        self.box("darkwood", x, y, z - 0.20 * s, 0.20 * s, 0.20 * s, 0.05 * s)
        self.box("glow", x, y, z, 0.17 * s, 0.17 * s, 0.32 * s)
        self.cyl("gold", (x, y, z + 0.22 * s), (x, y, z + 0.36 * s), 0.04 * s, 0.03 * s, segs=6)

    def terrace(self, cx, cy, sx, sy, h=0.68, stairs=True, balustrade=False, feudal=False):
        """Grounded battered stone podium extending -0.48m below z=0 so slopes never float."""
        # Lower battered stone foundation footing
        self.tapered("stoneDark", cx, cy, -0.48, h * 0.78, sx + 0.58, sy + 0.58, sx + 0.18, sy + 0.18)
        # Upper carved ashlar terrace slab & bevelled lip
        self.box_z("stone", cx, cy, h * 0.72, h, sx + 0.24, sy + 0.24)
        self.box("stoneDark", cx, cy, h + 0.03, sx + 0.08, sy + 0.08, 0.06)
        if stairs:
            sw = min(2.2, sx * 0.38)
            fy = cy - sy * 0.5 - 0.12
            # 3 descending stone steps + side stone cheek walls
            self.box_z("stone", cx, fy - 0.18, -0.46, h * 0.72, sw, 0.44)
            self.box_z("stone", cx, fy - 0.54, -0.46, h * 0.44, sw + 0.12, 0.44)
            self.box_z("stoneDark", cx, fy - 0.86, -0.46, h * 0.20, sw + 0.20, 0.38)
            for sgn in (-1, 1):
                self.box_z("stoneDark", cx + sgn * (sw * 0.5 + 0.12), fy - 0.44, -0.46, h * 0.82, 0.20, 0.96)
        if balustrade and not feudal:
            hx, hy = sx * 0.5 + 0.02, sy * 0.5 + 0.02
            bh = 0.52
            sw = min(2.2, sx * 0.38) * 0.5 + 0.22 if stairs else 0.0
            # Perimeter carved stone railings & corner bollards
            for sy_s in (-1, 1):
                if sy_s == -1 and stairs:
                    for side in (-1, 1):
                        seg_w = max(0.3, hx - sw)
                        seg_cx = cx + side * (sw + seg_w * 0.5)
                        self.box_z("stone", seg_cx, cy - hy, h, h + bh, seg_w, 0.12)
                        self.box("stoneDark", seg_cx, cy - hy, h + bh + 0.04, seg_w + 0.06, 0.18, 0.08)
                else:
                    self.box_z("stone", cx, cy + sy_s * hy, h, h + bh, sx + 0.04, 0.12)
                    self.box("stoneDark", cx, cy + sy_s * hy, h + bh + 0.04, sx + 0.12, 0.18, 0.08)
            for sx_s in (-1, 1):
                self.box_z("stone", cx + sx_s * hx, cy, h, h + bh, 0.12, sy + 0.04)
                self.box("stoneDark", cx + sx_s * hx, cy, h + bh + 0.04, 0.18, sy + 0.12, 0.08)
            for sx_s in (-1, 1):
                for sy_s in (-1, 1):
                    self.box_z("stone", cx + sx_s * hx, cy + sy_s * hy, h, h + bh + 0.16, 0.22, 0.22)
                    self.box("stoneDark", cx + sx_s * hx, cy + sy_s * hy, h + bh + 0.20, 0.26, 0.26, 0.09)

    def hall(self, cx, cy, z0, wall_h, sx, sy, feudal=False, windows=True, door=True, veranda=True):
        """Detailed timber-framed East Asian hall with carved plaster bays, dougong brackets, lattice glass windows & doorway."""
        post_role = "darkwood" if feudal else "lacquer"
        trim_role = "darkwood"
        z1 = z0 + wall_h
        hx, hy = sx * 0.5, sy * 0.5

        # Stone damp-course wall base + warm plaster core
        self.box_z("stoneDark", cx, cy, z0, z0 + 0.34, sx + 0.10, sy + 0.10)
        self.box_z("plaster", cx, cy, z0 + 0.28, z1, sx, sy)
        # Upper timber architrave & cornice belt (gives crisp shadow relief under roof!)
        self.box(trim_role, cx, cy, z1 - 0.12, sx + 0.28, sy + 0.28, 0.18)
        self.box(post_role, cx, cy, z0 + 0.38, sx + 0.16, sy + 0.16, 0.11)

        # Structural veranda & bay colonnade columns + dougong eave brackets
        col_r = 0.11 if feudal else 0.135
        pad = 0.22 if veranda else 0.04
        bx_list = (-hx - pad, 0.0, hx + pad) if sx >= 4.2 else (-hx - pad, hx + pad)
        by_list = (-hy - pad, 0.0, hy + pad) if sy >= 3.8 else (-hy - pad, hy + pad)
        for px in bx_list:
            for py in by_list:
                if abs(px) < 0.01 and abs(py) < 0.01:
                    continue
                if door and py < 0 and abs(px) < 0.01:
                    continue
                self.box_z("stoneDark", cx + px, cy + py, z0, z0 + 0.20, col_r * 2.4, col_r * 2.4)
                self.cyl(post_role, (cx + px, cy + py, z0 + 0.18), (cx + px, cy + py, z1 + 0.04), col_r, col_r * 0.92, segs=7)
                # Dougong stepped timber bracket cap under eave
                self.box(trim_role, cx + px, cy + py, z1 - 0.08, col_r * 3.4, col_r * 3.4, 0.14)
                self.box(post_role, cx + px, cy + py, z1 + 0.04, col_r * 4.2, col_r * 4.2, 0.10)

        # Perimeter veranda tie-beams
        if veranda:
            for sy_s in (-1, 1):
                self.box(trim_role, cx, cy + sy_s * (hy + pad), z1 - 0.10, sx + pad * 2 + 0.18, 0.14, 0.16)
            for sx_s in (-1, 1):
                self.box(trim_role, cx + sx_s * (hx + pad), cy, z1 - 0.10, 0.14, sy + pad * 2 + 0.18, 0.16)

        # Recessed multi-pane glowing wooden lattice windows (front, sides & back!)
        if windows:
            wz = z0 + 0.36 + (wall_h - 0.50) * 0.52
            wh = min(0.92, max(0.54, (wall_h - 0.56) * 0.54))
            ww = min(0.86, sx * 0.22)
            # Front flanking windows (around central doorway)
            f_offsets = (-sx * 0.29, sx * 0.29) if (door and sx >= 3.2) else ((-sx * 0.25, sx * 0.25) if sx >= 3.6 else (0.0,))
            for ox in f_offsets:
                self.box(trim_role, cx + ox, cy - hy - 0.03, wz, ww + 0.16, 0.12, wh + 0.16)
                self.box("glass", cx + ox, cy - hy - 0.05, wz, ww, 0.08, wh)
                self.box(trim_role, cx + ox, cy - hy - 0.075, wz, 0.055, 0.06, wh + 0.04)
                self.box(trim_role, cx + ox, cy - hy - 0.075, wz, ww + 0.04, 0.06, 0.055)
            # Back windows
            for ox in ((-sx * 0.25, sx * 0.25) if sx >= 3.4 else (0.0,)):
                self.box(trim_role, cx + ox, cy + hy + 0.03, wz, ww + 0.16, 0.12, wh + 0.16)
                self.box("glass", cx + ox, cy + hy + 0.05, wz, ww, 0.08, wh)
                self.box(trim_role, cx + ox, cy + hy + 0.075, wz, 0.055, 0.06, wh + 0.04)
            # Left & Right side windows
            sw_w = min(0.80, sy * 0.26)
            s_offsets = (-sy * 0.24, sy * 0.24) if sy >= 3.8 else (0.0,)
            for oy in s_offsets:
                for side in (-1, 1):
                    self.box(trim_role, cx + side * (hx + 0.03), cy + oy, wz, 0.12, sw_w + 0.16, wh + 0.16)
                    self.box("glass", cx + side * (hx + 0.05), cy + oy, wz, 0.08, sw_w, wh)
                    self.box(trim_role, cx + side * (hx + 0.075), cy + oy, wz, 0.06, 0.055, wh + 0.04)
                    self.box(trim_role, cx + side * (hx + 0.075), cy + oy, wz, 0.06, sw_w + 0.04, 0.055)

        # Heavy timber-framed paneled entrance doorway (-Y front)
        if door:
            dw = min(1.32, sx * 0.30)
            dh = min(1.88, wall_h - 0.36)
            self.box_z(trim_role, cx - dw * 0.56, cy - hy - 0.04, z0, z0 + dh + 0.16, 0.18, 0.22)
            self.box_z(trim_role, cx + dw * 0.56, cy - hy - 0.04, z0, z0 + dh + 0.16, 0.18, 0.22)
            self.box(trim_role, cx, cy - hy - 0.06, z0 + dh + 0.16, dw + 0.44, 0.26, 0.20)
            self.box_z(post_role if not feudal else "wood", cx, cy - hy - 0.02, z0, z0 + dh + 0.04, dw, 0.14)
            self.box_z(trim_role, cx, cy - hy - 0.08, z0 + 0.04, z0 + dh, 0.07, 0.08)
            if not feudal:
                for kx in (-0.18, 0.18):
                    self.box("gold", cx + kx, cy - hy - 0.10, z0 + dh * 0.52, 0.10, 0.06, 0.10)

    def pagoda_roof(self, cx, cy, z_eave, w, d, h, flare=0.22, feudal=False, ornate=True):
        """Crisp faceted East Asian hip-and-gable roof with exposed rafters, corner hip ribs, carved ridge spine & dragon finials."""
        roof_role = "teamRoof" if feudal else "jadeRoof"
        bm = self.bm(roof_role)
        steps = 4
        # Build elongated top ridge (authentic Xieshan hip-and-gable silhouette, never a pointy cone!)
        ridge_w = max(0.28, (w - d * 0.58) * 0.46) if w >= d else 0.18
        ridge_d = max(0.28, (d - w * 0.58) * 0.46) if d > w else 0.18
        rings = []
        for i in range(steps + 1):
            t = i / steps
            curve = math.pow(1.0 - t, 1.38)
            hw = ridge_w + (w * 0.5 - ridge_w) * curve
            hd = ridge_d + (d * 0.5 - ridge_d) * curve
            z = z_eave + h * (1.0 - curve)
            lift = flare * ((1.0 - t) ** 1.75)
            pts = [
                (-hw, -hd, lift),
                (0.0, -hd * 0.96, 0.0),
                (hw, -hd, lift),
                (hw * 0.96, 0.0, 0.0),
                (hw, hd, lift),
                (0.0, hd * 0.96, 0.0),
                (-hw, hd, lift),
                (-hw * 0.96, 0.0, 0.0),
            ]
            rings.append([bm.verts.new(Vector((cx + px, cy + py, z + lz))) for px, py, lz in pts])

        soffit = [bm.verts.new(Vector((v.co.x * 0.88 + cx * 0.12, v.co.y * 0.88 + cy * 0.12, z_eave - 0.11))) for v in rings[0]]
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

        # Exposed wooden underside fascia & projecting eave rafters
        self.box("darkwood", cx, cy, z_eave - 0.08, w * 0.88, d * 0.88, 0.12)
        # 4 bold curved corner hip ribs sweeping from top ridge corners to upturned eave tips!
        rib_role = "darkwood" if feudal else "stoneDark"
        fin_role = "darkwood" if feudal else "gold"
        for sx_s in (-1, 1):
            for sy_s in (-1, 1):
                p_top = (cx + sx_s * ridge_w, cy + sy_s * ridge_d, z_eave + h + 0.06)
                p_mid = (cx + sx_s * (ridge_w + (w * 0.5 - ridge_w) * 0.56), cy + sy_s * (ridge_d + (d * 0.5 - ridge_d) * 0.56), z_eave + h * 0.38)
                p_tip = (cx + sx_s * (w * 0.5 + 0.06), cy + sy_s * (d * 0.5 + 0.06), z_eave + flare + 0.05)
                self.cyl(rib_role, p_top, p_mid, 0.085, 0.075, segs=6)
                self.cyl(rib_role, p_mid, p_tip, 0.075, 0.065, segs=6)
                if ornate:
                    self.box(fin_role, p_tip[0], p_tip[1], p_tip[2] + 0.10, 0.14, 0.14, 0.22)

        # Heavy sculpted central roof ridge spine & upturned Chiwen end-finials!
        rz = z_eave + h + 0.10
        if w >= d:
            self.box(rib_role, cx, cy, rz, ridge_w * 2.08, 0.24, 0.24)
            self.box(fin_role, cx, cy, rz + 0.13, ridge_w * 2.02, 0.12, 0.08)
            for sgn in (-1, 1):
                self.box(fin_role, cx + sgn * (ridge_w + 0.04), cy, rz + 0.20, 0.18, 0.20, 0.34)
        else:
            self.box(rib_role, cx, cy, rz, 0.24, ridge_d * 2.08, 0.24)
            self.box(fin_role, cx, cy, rz + 0.13, 0.12, ridge_d * 2.02, 0.08)
            for sgn in (-1, 1):
                self.box(fin_role, cx, cy + sgn * (ridge_d + 0.04), rz + 0.20, 0.20, 0.18, 0.34)

    def oct_roof(self, cx, cy, z_eave, rad, h, flare=0.22, feudal=False):
        """Crisp faceted octagonal pagoda roof with 8 hip ribs & gilded spire collar."""
        roof_role = "teamRoof" if feudal else "jadeRoof"
        bm = self.bm(roof_role)
        segs, steps = 8, 4
        rings = []
        for i in range(steps + 1):
            t = i / steps
            curve = math.pow(1.0 - t, 1.45)
            r = max(0.16, rad * (0.16 + 0.84 * curve))
            z = z_eave + h * (1.0 - curve)
            lift = flare * ((1.0 - t) ** 1.8)
            ring = []
            for s in range(segs):
                a = (s / segs) * math.tau + math.pi / segs
                ring.append(bm.verts.new(Vector((cx + math.cos(a) * r, cy + math.sin(a) * r, z + lift))))
            rings.append(ring)
        soffit = [bm.verts.new(Vector((v.co.x * 0.86 + cx * 0.14, v.co.y * 0.86 + cy * 0.14, z_eave - 0.10))) for v in rings[0]]
        for s in range(segs):
            sn = (s + 1) % segs
            bm.faces.new((soffit[s], soffit[sn], rings[0][sn], rings[0][s]))
        bm.faces.new(list(reversed(soffit)))
        for r in range(steps):
            for s in range(segs):
                sn = (s + 1) % segs
                bm.faces.new((rings[r][s], rings[r][sn], rings[r + 1][sn], rings[r + 1][s]))
        bm.faces.new(rings[-1])
        rib_role = "darkwood" if feudal else "stoneDark"
        fin_role = "darkwood" if feudal else "gold"
        for s in range(segs):
            a = (s / segs) * math.tau + math.pi / segs
            p_top = (cx + math.cos(a) * rad * 0.18, cy + math.sin(a) * rad * 0.18, z_eave + h + 0.04)
            p_tip = (cx + math.cos(a) * (rad + 0.04), cy + math.sin(a) * (rad + 0.04), z_eave + flare + 0.04)
            self.cyl(rib_role, p_top, p_tip, 0.065, 0.055, segs=5)
            self.box(fin_role, p_tip[0], p_tip[1], p_tip[2] + 0.08, 0.12, 0.12, 0.18)

    def chimney(self, x, y, z0, z1, base_w=0.92, top_w=0.62, glow_face=None):
        mid = z0 + (z1 - z0) * 0.48
        self.tapered("stoneDark", x, y, z0, mid, base_w, base_w, base_w * 0.80, base_w * 0.80)
        self.tapered("stone", x, y, mid - 0.04, z1, base_w * 0.78, base_w * 0.78, top_w, top_w)
        self.box("stoneDark", x, y, z1 + 0.08, top_w + 0.22, top_w + 0.22, 0.14)
        self.box("darkwood", x, y, z1 + 0.26, top_w + 0.30, top_w + 0.30, 0.09)
        if glow_face == "-y":
            self.box("iron", x, y - base_w * 0.46, max(0.65, z0 + 0.85), base_w * 0.62, 0.14, 0.72)
            self.box("glow", x, y - base_w * 0.50, max(0.62, z0 + 0.82), base_w * 0.46, 0.12, 0.54)

    def finalize(self):
        for role, bm in self.buckets.items():
            if len(bm.verts):
                # Crisp faceted architectural shading (smooth=False!) so slate tile normals, stone joints & roof ridges shine!
                finish_part(self.root, f"{self.key.replace(':', '_')}_{role}", bm, role, self.mats, height_ref=self.height_ref, smooth=False)
            else:
                bm.free()
        return self.root


# ---------------------------------------------------------------------------
# 1A. THE JADE EMPIRE — 12 FEUDAL AGE COURTYARD BUILDINGS (building:<type>:jade:1)
# ---------------------------------------------------------------------------
def build_jade_feudal(mats, kind):
    b = JadeBuilder(f"building:{kind}:jade:1", mats, height_ref=5.5)
    if kind == "towncenter":
        b.terrace(0, 0.2, 6.8, 5.8, h=0.62, stairs=True, feudal=True)
        b.hall(0, 0.35, 0.62, 2.25, 4.6, 3.4, feudal=True, windows=True, door=True)
        b.hall(-2.55, -0.75, 0.62, 1.75, 1.5, 2.1, feudal=True, windows=True, door=False, veranda=False)
        b.hall(2.55, -0.75, 0.62, 1.75, 1.5, 2.1, feudal=True, windows=True, door=False, veranda=False)
        b.pagoda_roof(0, 0.35, 2.84, 6.3, 4.9, 1.48, flare=0.20, feudal=True)
        b.pagoda_roof(-2.55, -0.75, 2.34, 2.3, 2.9, 0.84, flare=0.14, feudal=True, ornate=False)
        b.pagoda_roof(2.55, -0.75, 2.34, 2.3, 2.9, 0.84, flare=0.14, feudal=True, ornate=False)
        b.chimney(1.45, 1.55, 0.62, 4.95, base_w=0.82, top_w=0.56)
        b.box("team", -1.9, -2.55, 2.1, 0.62, 0.08, 1.15)
        b.cyl("darkwood", (-1.9, -2.55, 0.5), (-1.9, -2.55, 3.0), 0.06, 0.05, segs=6)
        b.barrel(2.05, -2.25, 0.62)
        b.crate(2.55, -2.25, 0.62)
    elif kind == "house":
        b.terrace(0, 0, 3.5, 3.1, h=0.42, stairs=True, feudal=True)
        b.hall(0, 0.05, 0.42, 1.68, 2.8, 2.4, feudal=True, windows=True, door=True, veranda=False)
        b.pagoda_roof(0, 0.05, 2.08, 4.0, 3.5, 1.18, flare=0.16, feudal=True, ornate=False)
        b.chimney(-1.28, 0.55, 0.42, 3.65, base_w=0.68, top_w=0.46)
        b.barrel(1.45, -1.05, 0.42, r=0.18, h=0.46)
    elif kind == "barracks":
        b.terrace(0, 0, 5.4, 4.6, h=0.52, stairs=True, feudal=True)
        b.hall(0, 0.25, 0.52, 2.05, 4.3, 3.2, feudal=True, windows=True, door=True)
        b.pagoda_roof(0, 0.25, 2.54, 5.9, 4.7, 1.42, flare=0.20, feudal=True)
        for sx in (-1.65, 1.65):
            b.cyl("darkwood", (sx, -1.95, 0.52), (sx, -1.95, 2.75), 0.06, 0.05, segs=6)
            b.box("team", sx, -1.95, 2.15, 0.56, 0.08, 1.05)
        b.crate(-2.1, -1.65, 0.52)
        b.barrel(2.1, -1.65, 0.52)
    elif kind == "range":
        b.terrace(0, 0, 5.2, 4.6, h=0.44, stairs=False, feudal=True)
        b.hall(0, 0.78, 0.44, 1.85, 4.2, 2.3, feudal=True, windows=True, door=True, veranda=False)
        b.pagoda_roof(0, 0.78, 2.26, 5.5, 3.5, 1.24, flare=0.18, feudal=True)
        for tx in (-1.35, 0.0, 1.35):
            b.cyl("darkwood", (tx, -1.65, 0.44), (tx, -1.65, 1.38), 0.06, 0.05, segs=6)
            b.cyl("straw", (tx, -1.55, 1.26), (tx, -1.78, 1.26), 0.40, 0.40, segs=10)
            b.cyl("team", (tx, -1.76, 1.26), (tx, -1.82, 1.26), 0.22, 0.22, segs=10)
    elif kind == "stable":
        b.terrace(0, 0, 5.4, 4.6, h=0.40, stairs=False, feudal=True)
        b.hall(-0.65, 0.65, 0.40, 1.88, 3.4, 2.5, feudal=True, windows=True, door=True, veranda=False)
        b.pagoda_roof(-0.65, 0.65, 2.26, 4.6, 3.7, 1.22, flare=0.16, feudal=True)
        for fx in (1.25, 2.35):
            b.cyl("darkwood", (fx, -1.9, 0.40), (fx, -1.9, 1.35), 0.08, 0.07, segs=6)
            b.cyl("darkwood", (fx, 1.6, 0.40), (fx, 1.6, 1.35), 0.08, 0.07, segs=6)
        b.box("wood", 2.35, -0.15, 0.98, 0.10, 3.5, 0.14)
        b.box("wood", 0.55, -1.90, 0.98, 3.6, 0.10, 0.14)
        b.box("straw", 1.75, 0.45, 0.68, 0.85, 1.15, 0.52)
    elif kind == "blacksmith":
        b.terrace(0, 0, 4.6, 4.2, h=0.46, stairs=True, feudal=True)
        b.hall(0.35, 0.20, 0.46, 1.85, 3.0, 2.6, feudal=True, windows=True, door=True, veranda=False)
        b.pagoda_roof(0.35, 0.20, 2.28, 4.3, 3.8, 1.18, flare=0.16, feudal=True)
        b.chimney(-1.38, -0.15, 0.46, 4.55, base_w=1.08, top_w=0.66, glow_face="-y")
        b.box_z("darkwood", -0.65, -1.45, 0.46, 0.96, 0.48, 0.42)
        b.box_z("iron", -0.65, -1.45, 0.96, 1.28, 0.68, 0.34)
        b.barrel(1.55, -1.35, 0.46)
    elif kind == "market":
        b.terrace(0, 0, 5.2, 4.6, h=0.38, stairs=False, feudal=True)
        for sx in (-1.30, 1.30):
            for px in (-0.95, 0.95):
                for py in (-1.45, 1.45):
                    b.cyl("darkwood", (sx + px, py + 0.15, 0.38), (sx + px, py + 0.15, 2.15), 0.09, 0.08, segs=6)
            b.pagoda_roof(sx, 0.15, 2.10, 2.65, 3.8, 0.92, flare=0.15, feudal=True, ornate=False)
            b.box_z("wood", sx, 0.10, 0.38, 1.05, 1.45, 2.1)
            b.box("canvas", sx, 0.10, 1.10, 1.35, 1.85, 0.10)
        b.crate(0.0, -1.35, 0.38)
        b.barrel(0.0, 1.25, 0.38)
    elif kind == "mill":
        b.terrace(0, 0, 3.8, 3.6, h=0.44, stairs=True, feudal=True)
        b.hall(0, 0, 0.44, 2.25, 2.7, 2.5, feudal=True, windows=True, door=True, veranda=False)
        b.pagoda_roof(0, 0, 2.66, 3.9, 3.7, 1.24, flare=0.16, feudal=True, ornate=False)
        bm_sail = bmesh.new()
        add_cyl(bm_sail, (0, 0, 0), (0, -0.30, 0), 0.15, 0.13, segs=8)
        for a in (0, math.pi * 0.5, math.pi, math.pi * 1.5):
            dx, dz = math.cos(a), math.sin(a)
            add_box(bm_sail, (dx * 0.80, -0.05, dz * 0.80), (1.48 if abs(dx) > 0.5 else 0.30, 0.07, 0.30 if abs(dx) > 0.5 else 1.48))
        sail_grp = bpy.data.objects.new("WindmillHub_f1", None)
        sail_grp["windmill"] = True
        sail_grp.location = (0.0, -1.55, 2.05)
        bpy.context.scene.collection.objects.link(sail_grp)
        sail_grp.parent = b.root
        finish_part(sail_grp, "MillSails_f1", bm_sail, "wood", mats, height_ref=2.4)
        b.crate(-1.25, -1.25, 0.44, s=0.46)
    elif kind == "camp":
        b.terrace(0, 0, 3.6, 3.2, h=0.30, stairs=False, feudal=True)
        for px in (-1.25, 0.75):
            for py in (-1.0, 1.1):
                b.cyl("darkwood", (px, py, 0.30), (px, py, 2.05), 0.09, 0.08, segs=6)
        b.pagoda_roof(-0.25, 0.05, 2.00, 3.3, 3.0, 0.96, flare=0.14, feudal=True, ornate=False)
        for lz in (0.44, 0.78, 1.12):
            b.cyl("wood", (0.55, -1.05, lz), (1.55, 0.45, lz), 0.17, 0.16, segs=7)
    elif kind == "mine":
        b.terrace(0, 0, 3.8, 3.4, h=0.32, stairs=False, feudal=True)
        b.tapered("stoneDark", -0.35, 0.45, 0.30, 2.15, 2.6, 2.0, 1.8, 1.3)
        b.box_z("darkwood", -0.35, -0.52, 0.30, 1.75, 1.25, 0.24)
        b.pagoda_roof(-0.35, 0.15, 2.10, 3.4, 2.9, 0.92, flare=0.14, feudal=True, ornate=False)
        b.box_z("wood", 0.95, -0.82, 0.32, 0.92, 1.05, 0.78)
        b.sphere("stone", (0.95, -0.82, 0.96), (0.34, 0.28, 0.22), subdiv=1)
    elif kind == "tower":
        b.tapered("stoneDark", 0, 0, -0.46, 1.85, 2.9, 2.9, 2.35, 2.35)
        b.hall(0, 0, 1.85, 2.20, 2.15, 2.15, feudal=True, windows=True, door=False, veranda=False)
        b.box("darkwood", 0, 0, 4.15, 2.65, 2.65, 0.65)
        b.pagoda_roof(0, 0, 4.45, 3.55, 3.55, 1.28, flare=0.20, feudal=True)
        b.box("team", 0, -1.35, 3.25, 0.54, 0.08, 0.95)
    elif kind == "dock":
        pier = bpy.data.objects.new("DockPier_f1", None)
        pier["dockPier"] = True
        bpy.context.scene.collection.objects.link(pier)
        pier.parent = b.root
        pb = JadeBuilder(f"building:dock:jade:1:pier", mats, parent=pier, height_ref=4.0)
        pb.box_z("wood", 0, -0.35, 0.36, 0.70, 4.4, 5.2)
        for px in (-1.9, 0.0, 1.9):
            for py in (-2.6, -0.4, 1.8):
                pb.cyl("darkwood", (px, py, -1.0), (px, py, 0.76), 0.15, 0.14, segs=6)
        pb.hall(0, 1.15, 0.70, 1.85, 2.9, 1.8, feudal=True, windows=True, door=True, veranda=False)
        pb.pagoda_roof(0, 1.15, 2.52, 4.1, 2.9, 1.05, flare=0.16, feudal=True, ornate=False)
        pb.crate(-1.45, -1.75, 0.70)
        pb.barrel(1.45, -1.75, 0.70)
        pb.finalize()
        return b.root
    return b.finalize()


# ---------------------------------------------------------------------------
# 1B. THE JADE EMPIRE — 17 CASTLE & IMPERIAL AGE PALACES & FORTRESSES
# ---------------------------------------------------------------------------
def build_jade_towncenter(mats, age=2):
    b = JadeBuilder(f"building:towncenter:jade:{age}", mats, height_ref=9.0 if age >= 3 else 7.6)
    # Grand two-step marble/stone imperial terrace with balustrade & ceremonial front stairs
    b.terrace(0, 0.15, 8.0, 7.2, h=0.72, stairs=True, balustrade=True)
    b.terrace(0, 0.45, 6.0, 4.8, h=1.08, stairs=True, balustrade=False)

    # Central Grand Hall + symmetric Courtyard Pavilions
    b.hall(0, 0.45, 1.08, 2.42, 4.8, 3.6, feudal=False, windows=True, door=True)
    b.hall(-3.15, -0.85, 0.72, 1.95, 1.65, 2.4, feudal=False, windows=True, door=False, veranda=False)
    b.hall(3.15, -0.85, 0.72, 1.95, 1.65, 2.4, feudal=False, windows=True, door=False, veranda=False)

    # Front Ceremonial Paifang Entrance Arch (-Y)
    for lx in (-1.45, 1.45):
        b.box_z("stoneDark", lx, -3.28, 0.72, 1.02, 0.42, 0.42)
        b.cyl("lacquer", (lx, -3.28, 1.00), (lx, -3.28, 2.65), 0.14, 0.12, segs=7)
    b.box("lacquer", 0, -3.28, 2.42, 3.55, 0.24, 0.26)
    b.box("gold", 0, -3.38, 2.44, 0.92, 0.10, 0.36)
    b.pagoda_roof(0, -3.28, 2.62, 4.1, 1.35, 0.62, flare=0.16)

    # Sweeping faceted weathered-jade slate roofs
    b.pagoda_roof(0, 0.45, 3.46, 7.2, 5.7, 1.56, flare=0.30)
    b.pagoda_roof(-3.15, -0.85, 2.64, 2.8, 3.5, 0.94, flare=0.18)
    b.pagoda_roof(3.15, -0.85, 2.64, 2.8, 3.5, 0.94, flare=0.18)

    # Second-tier Upper Throne Pavilion with lattice windows
    b.hall(0, 0.45, 4.65, 1.45, 3.1, 2.35, feudal=False, windows=True, door=False, veranda=True)
    b.pagoda_roof(0, 0.45, 6.08, 5.0, 4.0, 1.36, flare=0.28)
    b.chimney(2.45, 1.75, 1.08, 6.55, base_w=0.92, top_w=0.58)

    if age >= 3:
        # Imperial Age 3rd-tier Golden Dragon Crown Pavilion!
        b.hall(0, 0.45, 7.12, 1.05, 1.85, 1.50, feudal=False, windows=True, door=False, veranda=False)
        b.pagoda_roof(0, 0.45, 8.14, 3.4, 2.85, 1.15, flare=0.26)
        b.cyl("gold", (0, 0.45, 9.25), (0, 0.45, 10.45), 0.16, 0.04, segs=8)
        b.sphere("gold", (0, 0.45, 9.95), (0.26, 0.26, 0.26), subdiv=1)
    else:
        b.cyl("gold", (0, 0.45, 7.42), (0, 0.45, 8.20), 0.13, 0.04, segs=7)

    for lx in (-1.55, 1.55):
        b.lantern(lx, -3.45, 2.05, s=0.82)
        b.lantern(lx * 1.48, -1.62, 3.05, s=0.72)
    b.box("team", -2.35, -3.15, 2.25, 0.62, 0.08, 1.25)
    b.cyl("darkwood", (-2.35, -3.15, 0.72), (-2.35, -3.15, 3.15), 0.06, 0.05, segs=6)
    return b.finalize()


def build_jade_house(mats):
    b = JadeBuilder("building:house:jade:0", mats, height_ref=4.2)
    b.terrace(0, 0, 3.8, 3.4, h=0.48, stairs=True, balustrade=False)
    b.hall(0, 0.05, 0.48, 1.78, 3.05, 2.65, feudal=False, windows=True, door=True, veranda=True)
    b.pagoda_roof(0, 0.05, 2.24, 4.55, 4.05, 1.32, flare=0.22)
    b.chimney(-1.38, 0.65, 0.48, 4.05, base_w=0.72, top_w=0.48)
    b.lantern(0.95, -1.55, 1.88, s=0.68)
    b.barrel(1.52, -1.15, 0.48, r=0.18, h=0.46)
    return b.finalize()


def build_jade_hall(mats, kind):
    b = JadeBuilder(f"building:{kind}:jade:0", mats, height_ref=6.4)
    if kind == "barracks":
        b.terrace(0, 0, 6.0, 5.2, h=0.62, stairs=True, balustrade=True)
        b.hall(0, 0.25, 0.62, 2.35, 4.8, 3.6, feudal=False, windows=True, door=True)
        b.pagoda_roof(0, 0.25, 2.94, 6.8, 5.5, 1.48, flare=0.28)
        b.hall(0, 0.25, 4.10, 0.95, 2.4, 1.8, feudal=False, windows=True, door=False, veranda=False)
        b.pagoda_roof(0, 0.25, 5.02, 3.9, 3.1, 0.98, flare=0.22)
        for dx in (-1.75, 1.75):
            b.cyl("lacquer", (dx, -2.02, 0.62), (dx, -2.02, 1.38), 0.40, 0.40, segs=10)
            b.cyl("gold", (dx, -2.02, 0.96), (dx, -2.02, 1.04), 0.42, 0.42, segs=10)
            b.cyl("darkwood", (dx, -2.02, 0.62), (dx, -2.02, 3.25), 0.06, 0.05, segs=6)
            b.box("team", dx, -2.02, 2.55, 0.64, 0.09, 1.18)
    elif kind == "range":
        b.terrace(0, 0, 5.8, 5.0, h=0.52, stairs=True, balustrade=False)
        b.hall(0, 0.85, 0.52, 2.08, 4.6, 2.55, feudal=False, windows=True, door=True)
        b.pagoda_roof(0, 0.85, 2.58, 6.3, 4.3, 1.38, flare=0.26)
        for tx in (-1.45, 0.0, 1.45):
            b.cyl("darkwood", (tx, -1.85, 0.52), (tx, -1.85, 1.48), 0.07, 0.06, segs=6)
            b.cyl("straw", (tx, -1.75, 1.36), (tx, -1.98, 1.36), 0.42, 0.42, segs=10)
            b.cyl("team", (tx, -1.96, 1.36), (tx, -2.03, 1.36), 0.22, 0.22, segs=10)
        b.crate(-2.25, -1.45, 0.52)
    elif kind == "stable":
        b.terrace(0, 0, 6.0, 5.2, h=0.46, stairs=False, balustrade=False)
        b.hall(-0.72, 0.72, 0.46, 2.10, 3.7, 2.75, feudal=False, windows=True, door=True)
        b.pagoda_roof(-0.72, 0.72, 2.54, 5.3, 4.3, 1.36, flare=0.24)
        for fx in (1.30, 2.60):
            b.cyl("darkwood", (fx, -2.10, 0.46), (fx, -2.10, 1.48), 0.09, 0.08, segs=6)
            b.cyl("darkwood", (fx, 1.80, 0.46), (fx, 1.80, 1.48), 0.09, 0.08, segs=6)
        b.box("wood", 2.60, -0.15, 1.08, 0.11, 3.9, 0.16)
        b.box("wood", 0.60, -2.10, 1.08, 4.1, 0.11, 0.16)
        b.box("straw", 1.92, 0.65, 0.78, 0.92, 1.25, 0.58)
        b.box("team", -2.48, -1.85, 2.05, 0.72, 0.09, 1.22)
        b.cyl("lacquer", (-2.48, -1.85, 0.46), (-2.48, -1.85, 2.95), 0.07, 0.06, segs=6)
    elif kind == "workshop":
        b.terrace(0, 0, 6.4, 5.6, h=0.60, stairs=True, balustrade=False)
        b.hall(-0.45, 0.45, 0.60, 2.48, 4.4, 3.5, feudal=False, windows=True, door=True)
        b.pagoda_roof(-0.45, 0.45, 3.06, 6.2, 5.0, 1.52, flare=0.26)
        b.chimney(2.15, 1.35, 0.60, 5.85, base_w=1.12, top_w=0.68, glow_face="-y")
        # Timber siege gantry crane + iron-banded black-powder kegs
        b.cyl("darkwood", (2.20, -1.45, 0.60), (2.20, -1.45, 3.75), 0.14, 0.11, segs=7)
        b.cyl("darkwood", (2.20, -1.45, 3.58), (0.55, -2.25, 3.32), 0.11, 0.09, segs=7)
        for kx, ky in [(1.55, -1.85), (2.25, -2.10), (1.85, -0.75)]:
            b.cyl("lacquer", (kx, ky, 0.60), (kx, ky, 1.34), 0.30, 0.28, segs=8)
            b.cyl("iron", (kx, ky, 0.88), (kx, ky, 0.98), 0.32, 0.32, segs=8)
    elif kind == "blacksmith":
        b.terrace(0, 0, 5.0, 4.5, h=0.54, stairs=True, balustrade=False)
        b.hall(0.35, 0.25, 0.54, 2.02, 3.3, 2.8, feudal=False, windows=True, door=True)
        b.pagoda_roof(0.35, 0.25, 2.54, 4.9, 4.2, 1.35, flare=0.24)
        b.chimney(-1.58, -0.05, 0.54, 5.35, base_w=1.22, top_w=0.74, glow_face="-y")
        b.box_z("darkwood", -0.68, -1.55, 0.54, 1.06, 0.52, 0.44)
        b.box_z("iron", -0.68, -1.55, 1.06, 1.42, 0.76, 0.36)
        b.barrel(1.65, -1.48, 0.54)
        b.crate(1.15, -1.62, 0.54, s=0.48)
    elif kind == "market":
        b.terrace(0, 0, 5.8, 5.2, h=0.46, stairs=True, balustrade=False)
        for sx in (-1.45, 1.45):
            for px in (-1.08, 1.08):
                for py in (-1.60, 1.60):
                    b.cyl("lacquer", (sx + px, py + 0.28, 0.46), (sx + px, py + 0.28, 2.38), 0.11, 0.10, segs=7)
            b.pagoda_roof(sx, 0.28, 2.32, 3.05, 4.25, 1.05, flare=0.22)
            b.box_z("wood", sx, 0.20, 0.46, 1.12, 1.55, 2.25)
            b.box("team", sx, 0.20, 1.18, 1.38, 1.95, 0.12)
            b.lantern(sx, -1.52, 1.98, s=0.72)
        b.cyl("lacquer", (-1.45, -1.78, 2.52), (1.45, -1.78, 2.52), 0.06, 0.06, segs=6)
        b.lantern(0.0, -1.78, 2.22, s=0.78)
        b.crate(0.0, -1.35, 0.46)
        b.barrel(0.0, 1.45, 0.46)
    elif kind == "mill":
        b.terrace(0, 0, 4.2, 4.0, h=0.52, stairs=True, balustrade=False)
        b.hall(0, 0, 0.52, 2.58, 3.0, 2.8, feudal=False, windows=True, door=True, veranda=False)
        b.pagoda_roof(0, 0, 3.08, 4.45, 4.25, 1.40, flare=0.24)
        bm_sail = bmesh.new()
        add_cyl(bm_sail, (0, 0, 0), (0, -0.34, 0), 0.16, 0.14, segs=8)
        for a in (0, math.pi * 0.5, math.pi, math.pi * 1.5):
            dx, dz = math.cos(a), math.sin(a)
            add_box(bm_sail, (dx * 0.88, -0.06, dz * 0.88), (1.62 if abs(dx) > 0.5 else 0.34, 0.08, 0.34 if abs(dx) > 0.5 else 1.62))
        sail_grp = bpy.data.objects.new("WindmillHub", None)
        sail_grp["windmill"] = True
        sail_grp.location = (0.0, -1.72, 2.25)
        bpy.context.scene.collection.objects.link(sail_grp)
        sail_grp.parent = b.root
        finish_part(sail_grp, "MillSails", bm_sail, "wood", mats, height_ref=2.5)
        b.crate(-1.35, -1.32, 0.52, s=0.48)
        b.barrel(1.35, -1.32, 0.52)
    elif kind == "camp":
        b.terrace(0, 0, 3.8, 3.4, h=0.36, stairs=False, balustrade=False)
        for px in (-1.30, 0.85):
            for py in (-1.05, 1.15):
                b.cyl("lacquer", (px, py, 0.36), (px, py, 2.20), 0.11, 0.10, segs=7)
        b.pagoda_roof(-0.25, 0.08, 2.15, 3.7, 3.25, 1.05, flare=0.20)
        for lz in (0.50, 0.86, 1.22):
            b.cyl("wood", (0.60, -1.10, lz), (1.65, 0.45, lz), 0.19, 0.18, segs=7)
    else:  # mine
        b.terrace(0, 0, 4.0, 3.6, h=0.38, stairs=False, balustrade=False)
        b.tapered("stoneDark", -0.35, 0.45, 0.36, 2.35, 2.75, 2.1, 1.9, 1.35)
        b.box_z("lacquer", -0.35, -0.58, 0.36, 1.88, 1.32, 0.24)
        b.pagoda_roof(-0.35, 0.18, 2.28, 3.85, 3.3, 1.06, flare=0.22)
        b.box_z("wood", 0.95, -0.85, 0.38, 1.02, 1.12, 0.82)
        b.sphere("gold", (0.95, -0.85, 1.08), (0.36, 0.28, 0.22), subdiv=1)
    return b.finalize()


def build_jade_monastery(mats):
    b = JadeBuilder("building:monastery:jade:0", mats, height_ref=8.0)
    b.cyl("stoneDark", (0, 0, -0.46), (0, 0, 0.42), 3.45, 3.20, segs=8)
    b.cyl("stone", (0, 0, 0.38), (0, 0, 0.68), 3.22, 3.12, segs=8)
    b.cyl("plaster", (0, 0, 0.68), (0, 0, 2.65), 2.32, 2.24, segs=8)
    for i in range(8):
        a = (i / 8.0) * math.tau
        px, py = math.cos(a) * 2.55, math.sin(a) * 2.55
        b.cyl("lacquer", (px, py, 0.68), (px, py, 2.68), 0.12, 0.11, segs=6)
        b.box("glass", math.cos(a + math.pi / 8) * 2.24, math.sin(a + math.pi / 8) * 2.24, 1.72, 0.48, 0.48, 0.84, rot=(0, 0, a + math.pi / 8))
    b.oct_roof(0, 0, 2.62, 3.55, 1.42, flare=0.26)
    b.cyl("plaster", (0, 0, 3.85), (0, 0, 5.25), 1.55, 1.48, segs=8)
    b.oct_roof(0, 0, 5.18, 2.52, 1.28, flare=0.24)
    b.cyl("gold", (0, 0, 6.42), (0, 0, 7.85), 0.15, 0.03, segs=8)
    b.sphere("gold", (0, 0, 6.95), (0.28, 0.28, 0.30), subdiv=1)
    b.lantern(-1.25, -2.55, 2.15, s=0.72)
    b.lantern(1.25, -2.55, 2.15, s=0.72)
    return b.finalize()


def build_jade_tower(mats):
    b = JadeBuilder("building:tower:jade:0", mats, height_ref=8.8)
    # Battered fortified stone masonry plinth extending -0.46m into ground + timber & jade 2-tier watchtower!
    b.tapered("stoneDark", 0, 0, -0.46, 2.35, 3.3, 3.3, 2.6, 2.6)
    b.box("stone", 0, 0, 2.40, 2.8, 2.8, 0.22)
    b.hall(0, 0, 2.48, 2.35, 2.35, 2.35, feudal=False, windows=True, door=False, veranda=True)
    b.pagoda_roof(0, 0, 4.80, 4.05, 4.05, 1.10, flare=0.26)
    b.hall(0, 0, 5.65, 1.28, 1.65, 1.65, feudal=False, windows=True, door=False, veranda=False)
    b.pagoda_roof(0, 0, 6.90, 3.35, 3.35, 1.18, flare=0.28)
    b.cyl("gold", (0, 0, 8.05), (0, 0, 9.05), 0.13, 0.03, segs=7)
    b.lantern(0, -1.48, 4.35, s=0.72)
    return b.finalize()


def build_jade_keep(mats):
    b = JadeBuilder("building:keep:jade:0", mats, height_ref=12.5)
    # Massive battered stone fortress bastion extending -0.48m into ground + stone battlements + 4 corner turrets!
    b.tapered("stoneDark", 0, 0, -0.48, 2.85, 8.8, 8.8, 8.1, 8.1)
    b.box("stone", 0, 0, 2.90, 8.3, 8.3, 0.24)
    # Crenellated curtain merlons around bastion top
    for i in (-2.0, -0.8, 0.8, 2.0):
        for sgn in (-1, 1):
            b.box_z("stone", i, sgn * 3.98, 3.00, 3.55, 0.68, 0.34)
            b.box_z("stone", sgn * 3.98, i, 3.00, 3.55, 0.34, 0.68)
    # 4 corner battered stone bastion towers with jade pagoda roofs
    for sx in (-3.45, 3.45):
        for sy in (-3.45, 3.45):
            b.tapered("stoneDark", sx, sy, -0.48, 4.35, 2.35, 2.35, 2.02, 2.02)
            b.box("stone", sx, sy, 4.40, 2.25, 2.25, 0.22)
            b.pagoda_roof(sx, sy, 4.48, 3.25, 3.25, 0.98, flare=0.22)
            b.cyl("gold", (sx, sy, 5.45), (sx, sy, 6.02), 0.09, 0.03, segs=6)
    # Central 3-tier Grand Dragon Citadel Keep
    b.hall(0, 0, 3.02, 2.85, 5.2, 4.8, feudal=False, windows=True, door=True)
    b.pagoda_roof(0, 0, 5.84, 7.6, 7.0, 1.56, flare=0.34)
    b.hall(0, 0, 7.05, 1.75, 3.6, 3.3, feudal=False, windows=True, door=False)
    b.pagoda_roof(0, 0, 8.78, 5.6, 5.1, 1.38, flare=0.30)
    b.hall(0, 0, 9.85, 1.05, 2.1, 1.9, feudal=False, windows=True, door=False, veranda=False)
    b.pagoda_roof(0, 0, 10.88, 3.8, 3.5, 1.25, flare=0.28)
    b.cyl("gold", (0, 0, 12.10), (0, 0, 13.30), 0.16, 0.04, segs=8)
    # Fortified recessed iron-studded timber fortress gate (-Y)
    b.box_z("stoneDark", -1.25, -4.18, 0.0, 2.48, 0.44, 0.56)
    b.box_z("stoneDark", 1.25, -4.18, 0.0, 2.48, 0.44, 0.56)
    b.box("stone", 0, -4.18, 2.52, 2.95, 0.62, 0.36)
    b.box_z("darkwood", 0, -4.10, 0.0, 2.36, 2.05, 0.24)
    for hz in (0.72, 1.58):
        b.box("iron", 0, -4.24, hz, 2.08, 0.08, 0.14)
    for lx in (-1.65, 1.65):
        b.lantern(lx, -4.35, 2.55, s=0.88)
        b.box("team", lx * 1.42, -4.25, 3.35, 0.68, 0.10, 1.38)
    return b.finalize()


def build_jade_wonder(mats):
    b = JadeBuilder("building:wonder:jade:0", mats, height_ref=15.0)
    # Monumental 5-tier Heavenly Jade Pagoda on grand two-step octagonal stone altar!
    b.cyl("stoneDark", (0, 0, -0.48), (0, 0, 0.88), 5.8, 5.2, segs=8)
    b.cyl("stone", (0, 0, 0.84), (0, 0, 1.56), 4.75, 4.45, segs=8)
    for sx in (-1.45, 1.45):
        b.box_z("stoneDark", sx, -5.05, -0.46, 0.96, 0.28, 1.35)
    b.box_z("stone", 0, -5.12, -0.46, 0.72, 2.6, 1.2)
    tiers = [
        (1.56, 3.35, 2.15, 4.55, 1.25),
        (4.15, 2.75, 1.85, 3.85, 1.15),
        (6.45, 2.20, 1.65, 3.20, 1.05),
        (8.45, 1.70, 1.45, 2.60, 0.98),
        (10.20, 1.25, 1.25, 2.05, 1.15),
    ]
    for z0, wr, wh, rr, rh in tiers:
        b.cyl("plaster", (0, 0, z0), (0, 0, z0 + wh), wr, wr * 0.96, segs=8)
        for i in range(8):
            a = (i / 8.0) * math.tau
            b.cyl("lacquer", (math.cos(a) * (wr + 0.14), math.sin(a) * (wr + 0.14), z0), (math.cos(a) * (wr + 0.14), math.sin(a) * (wr + 0.14), z0 + wh), 0.12, 0.10, segs=6)
            b.box("glass", math.cos(a + math.pi / 8) * (wr - 0.04), math.sin(a + math.pi / 8) * (wr - 0.04), z0 + wh * 0.52, 0.46, 0.46, wh * 0.45, rot=(0, 0, a + math.pi / 8))
        b.oct_roof(0, 0, z0 + wh - 0.12, rr, rh, flare=0.26)
    b.cyl("gold", (0, 0, 12.45), (0, 0, 15.25), 0.22, 0.04, segs=8)
    for sz in (13.1, 13.7, 14.3):
        b.sphere("gold", (0, 0, sz), (0.40 - (sz - 13.0) * 0.11, 0.40 - (sz - 13.0) * 0.11, 0.26), subdiv=1)
    for i in range(4):
        a = i * math.pi * 0.5 + math.pi * 0.25
        b.lantern(math.cos(a) * 4.2, math.sin(a) * 4.2, 2.85, s=0.95)
    return b.finalize()


def build_jade_dock(mats):
    root = make_root("building:dock:jade:0")
    pier = bpy.data.objects.new("DockPier", None)
    pier["dockPier"] = True
    bpy.context.scene.collection.objects.link(pier)
    pier.parent = root
    b = JadeBuilder("building:dock:jade:0:pier", mats, parent=pier, height_ref=4.6)
    b.box_z("wood", 0, -0.4, 0.38, 0.74, 4.6, 5.4)
    for px in (-2.0, 0.0, 2.0):
        for py in (-2.8, -0.5, 1.9):
            b.cyl("darkwood", (px, py, -1.0), (px, py, 0.80), 0.16, 0.15, segs=6)
    b.hall(0, 1.15, 0.74, 2.10, 3.1, 1.95, feudal=False, windows=True, door=True, veranda=True)
    b.pagoda_roof(0, 1.15, 2.82, 4.55, 3.3, 1.18, flare=0.24)
    b.lantern(-1.85, -2.55, 1.65, s=0.72)
    b.lantern(1.85, -2.55, 1.65, s=0.72)
    b.crate(-1.55, -1.75, 0.74)
    b.barrel(1.55, -1.75, 0.74)
    b.finalize()
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

    feudal_types = [
        "towncenter", "house", "barracks", "range", "stable", "blacksmith",
        "market", "mill", "camp", "mine", "tower", "dock",
    ]
    roots = [
        *[build_jade_feudal(mats, kind) for kind in feudal_types],
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
