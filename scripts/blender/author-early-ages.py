"""
Blender 4.5 LTS Authoring Script — Authentic AoE II:DE-Inspired Early Ages,
Dense Weathered Palisades & Automatic Corner Bastions
==============================================================================
Generates 47 closed-manifold, ultra-readable low-poly 3D assets into
`frontier-early-ages-raw.glb` (packed via gltfpack into `frontier-early-ages.glb`):

  1. Palisade Fortifications (Age 1 & Age 2 — weathered silver-grey dense stockade):
       - building:wall:palisade         (12 tightly packed jagged stakes, lashings, abatis base spikes)
       - building:gate:palisade         (twin tall spiked stockade towers, curved arched log header,
                                         open-lattice barred wooden portcullis, split-tail team+white flags)
  2. Automatic Corner Bastions (all 3 tiers, 4-way flush at 90-degree corners & junctions):
       - building:wallcorner:palisade   (square spiked stockade corner tower, recessed deck, split-tail flag)
       - building:wallcorner:stone      (5.68m warm brown castle bastion tower, arrow slits, machicolations)
       - building:wallcorner:fortified  (6.90m gleaming silver imperial citadel bastion, gold finials, banner)
  3. Age 1 — Frontier / Dark Age (6 universal open-air weathered timber & draped canvas tents):
       - towncenter (open courtyard on stilts + stick balcony + ladder + 2 flanking open canvas pavilions)
       - house      (weathered vertical log-stake tent-hut + draped tan canvas + team eave trim + pots & moss)
       - camp       (open A-frame wooden log-lifting crane + stacked felled logs & timber sawhorse)
       - barracks, mill, mine (rough weathered stakes, draped tan canvas + team borders, authentic props)
  4. Age 2 — Feudal Age (36 regional village buildings: 12 Alder + 12 Sunward + 12 Raven):
       - Alder   (Western European): thick layered shaggy golden straw thatch, half-timbered cream plaster
                 with bold dark oak X-bracing, cobblestone footings, climbing moss/ivy, team gable accents,
                 iconic octagonal wooden-capped Watch Tower, spinning post-Windmill, 3-target Archery Range,
                 open-arcade Stable with hay bales, glowing Blacksmith chimney, 3-booth Market, busy Dock.
       - Sunward (Middle Eastern): warm ochre desert adobe, protruding timber vigas, terraced flat roofs with
                 striped woven team canopies (ZERO domes until Castle Age), desert timber lookout tower.
       - Raven   (Nordic): horizontal notched dark timber log walls, steep shaggy timber-shingle & thatch roofs,
                 crossed ridge finials, mounted round Viking team shields.

Coordinate convention:
  Blender X -> Three.js X
  Blender Z -> Three.js Y (up)
  Blender -Y -> Three.js Z (front face = -Y in Blender -> +Z in Three.js)
"""
import argparse
import json
import math
import os
import sys
import bpy
import bmesh
from mathutils import Matrix, Vector


# ---------------------------------------------------------------------------
# Scene & Material Helpers (all roles exist in WorldView + ensureModels)
# ---------------------------------------------------------------------------
MAT_SPECS = {
    "wood": ((0.56, 0.44, 0.30, 1.0), 0.88, 0.0),
    "darkwood": ((0.27, 0.21, 0.15, 1.0), 0.90, 0.0),
    "trunk": ((0.58, 0.55, 0.50, 1.0), 0.94, 0.0),      # weathered silver-grey-brown palisade logs
    "plaster": ((0.90, 0.85, 0.74, 1.0), 0.92, 0.0),
    "stone": ((0.72, 0.67, 0.58, 1.0), 0.90, 0.0),
    "stoneDark": ((0.48, 0.49, 0.46, 1.0), 0.92, 0.0),
    "brick": ((0.58, 0.40, 0.28, 1.0), 0.88, 0.0),
    "straw": ((0.74, 0.62, 0.38, 1.0), 0.96, 0.0),      # shaggy golden-brown thatch
    "canvas": ((0.86, 0.77, 0.58, 1.0), 0.92, 0.0),     # sun-bleached tan hide/canvas
    "soil": ((0.56, 0.46, 0.32, 1.0), 0.96, 0.0),
    "leaf": ((0.38, 0.50, 0.28, 1.0), 0.92, 0.0),       # climbing ivy & moss
    "leafDark": ((0.24, 0.38, 0.22, 1.0), 0.92, 0.0),
    "snow": ((0.93, 0.94, 0.92, 1.0), 0.86, 0.0),       # crisp white bottom half of split-tail flags
    "iron": ((0.40, 0.43, 0.45, 1.0), 0.52, 0.48),
    "steel": ((0.76, 0.80, 0.82, 1.0), 0.34, 0.55),
    "gold": ((0.80, 0.66, 0.28, 1.0), 0.42, 0.48),
    "glow": ((0.96, 0.42, 0.14, 1.0), 0.35, 0.0),
    "glass": ((0.86, 0.72, 0.44, 1.0), 0.28, 0.05),
    "grain": ((0.86, 0.72, 0.34, 1.0), 0.90, 0.0),
    "fruit": ((0.68, 0.25, 0.22, 1.0), 0.82, 0.0),
    "team": ((0.24, 0.52, 0.58, 1.0), 0.84, 0.0),
    "teamRoof": ((0.36, 0.54, 0.58, 1.0), 0.86, 0.0),
}


def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def init_materials():
    mats = {}
    for name, (rgba, rough, metal) in MAT_SPECS.items():
        mat = bpy.data.materials.new(name=name)
        mat.use_nodes = True
        bsdf = mat.node_tree.nodes.get("Principled BSDF")
        if bsdf:
            bsdf.inputs["Base Color"].default_value = rgba
            bsdf.inputs["Roughness"].default_value = rough
            bsdf.inputs["Metallic"].default_value = metal
        mats[name] = mat
    return mats


# ---------------------------------------------------------------------------
# Closed-Manifold Primitive Collector (grouped by material role -> 1 draw call)
# ---------------------------------------------------------------------------
class PartBuilder:
    def __init__(self, key, mats, parent=None, uv_scale=0.38):
        self.key = key
        self.mats = mats
        self.uv_scale = uv_scale
        self.buckets = {}
        if parent is None:
            self.root = bpy.data.objects.new(key, None)
            self.root["assetKey"] = key
        else:
            self.root = parent

    def _bm(self, role):
        bm = self.buckets.get(role)
        if bm is None:
            bm = bmesh.new()
            bm.loops.layers.uv.verify()
            bm.loops.layers.color.verify()
            self.buckets[role] = bm
        return bm

    def _paint_faces(self, bm, faces, tint=(1.0, 1.0, 1.0), z_grad=0.0):
        uv_layer = bm.loops.layers.uv.verify()
        vc_layer = bm.loops.layers.color.verify()
        bmesh.ops.recalc_face_normals(bm, faces=faces)
        zs = [v.co.z for f in faces for v in f.verts]
        z_min = min(zs) if zs else 0.0
        z_span = max(0.01, (max(zs) - z_min)) if zs else 1.0
        for f in faces:
            f.normal_update()
            n = f.normal
            ax, ay, az = abs(n.x), abs(n.y), abs(n.z)
            for loop in f.loops:
                co = loop.vert.co
                if az >= ax and az >= ay:
                    u, v = co.x * self.uv_scale, co.y * self.uv_scale
                elif ax >= ay:
                    u, v = co.y * self.uv_scale, co.z * self.uv_scale
                else:
                    u, v = co.x * self.uv_scale, co.z * self.uv_scale
                loop[uv_layer].uv = (u, v)
                g = 1.0 - z_grad * (1.0 - (co.z - z_min) / z_span) if z_grad > 0.0 else 1.0
                r = max(0.0, min(1.0, tint[0] * g))
                gg = max(0.0, min(1.0, tint[1] * g))
                bb = max(0.0, min(1.0, tint[2] * g))
                loop[vc_layer] = (r, gg, bb, 1.0)

    def box(self, role, cx, cy, cz, sx, sy, sz, rot_z=0.0, tint=(1.0, 1.0, 1.0), z_grad=0.0):
        bm = self._bm(role)
        mat = (
            Matrix.Translation((cx, cy, cz))
            @ Matrix.Rotation(rot_z, 4, "Z")
            @ Matrix.Diagonal((sx, sy, sz, 1.0))
        )
        res = bmesh.ops.create_cube(bm, size=1.0, matrix=mat)
        verts = set(res["verts"])
        faces = [f for f in bm.faces if all(v in verts for v in f.verts)]
        self._paint_faces(bm, faces, tint, z_grad)

    def box_z(self, role, cx, cy, z0, z1, sx, sy, rot_z=0.0, tint=(1.0, 1.0, 1.0), z_grad=0.0):
        self.box(role, cx, cy, (z0 + z1) * 0.5, sx, sy, z1 - z0, rot_z=rot_z, tint=tint, z_grad=z_grad)

    def tapered_box(self, role, cx, cy, z0, z1, sx0, sy0, sx1, sy1, tint=(1.0, 1.0, 1.0), z_grad=0.0):
        bm = self._bm(role)
        hx0, hy0 = sx0 * 0.5, sy0 * 0.5
        hx1, hy1 = sx1 * 0.5, sy1 * 0.5
        v0 = bm.verts.new((cx - hx0, cy - hy0, z0))
        v1 = bm.verts.new((cx + hx0, cy - hy0, z0))
        v2 = bm.verts.new((cx + hx0, cy + hy0, z0))
        v3 = bm.verts.new((cx - hx0, cy + hy0, z0))
        v4 = bm.verts.new((cx - hx1, cy - hy1, z1))
        v5 = bm.verts.new((cx + hx1, cy - hy1, z1))
        v6 = bm.verts.new((cx + hx1, cy + hy1, z1))
        v7 = bm.verts.new((cx - hx1, cy + hy1, z1))
        faces = [
            bm.faces.new((v3, v2, v1, v0)),
            bm.faces.new((v4, v5, v6, v7)),
            bm.faces.new((v0, v1, v5, v4)),
            bm.faces.new((v1, v2, v6, v5)),
            bm.faces.new((v2, v3, v7, v6)),
            bm.faces.new((v3, v0, v4, v7)),
        ]
        self._paint_faces(bm, faces, tint, z_grad)

    def cylinder(self, role, cx, cy, z0, z1, r0, r1=None, segs=8, tint=(1.0, 1.0, 1.0), z_grad=0.0):
        if r1 is None:
            r1 = r0
        bm = self._bm(role)
        depth = z1 - z0
        mat = Matrix.Translation((cx, cy, (z0 + z1) * 0.5))
        res = bmesh.ops.create_cone(
            bm, cap_ends=True, cap_tris=False, segments=segs,
            radius1=r0, radius2=r1, depth=depth, matrix=mat,
        )
        verts = set(res["verts"])
        faces = [f for f in bm.faces if all(v in verts for v in f.verts)]
        self._paint_faces(bm, faces, tint, z_grad)

    def cone(self, role, cx, cy, z0, z1, r0, segs=8, tint=(1.0, 1.0, 1.0), z_grad=0.2):
        self.cylinder(role, cx, cy, z0, z1, r0, 0.02, segs=segs, tint=tint, z_grad=z_grad)

    def stake(self, role, cx, cy, z0, z_shoulder, z_tip, radius, segs=5, lean_x=0.0, lean_y=0.0, tint=(1.0, 1.0, 1.0)):
        bm = self._bm(role)
        base, mid = [], []
        for i in range(segs):
            a = i * 2.0 * math.pi / segs
            ca, sa = math.cos(a), math.sin(a)
            base.append(bm.verts.new((cx + ca * radius, cy + sa * radius, z0)))
            mid.append(bm.verts.new((cx + lean_x + ca * radius * 0.88, cy + lean_y + sa * radius * 0.88, z_shoulder)))
        tip = bm.verts.new((cx + lean_x * 1.15, cy + lean_y * 1.15, z_tip))
        faces = [bm.faces.new(list(reversed(base)))]
        for i in range(segs):
            j = (i + 1) % segs
            faces.append(bm.faces.new((base[i], base[j], mid[j], mid[i])))
            faces.append(bm.faces.new((mid[i], mid[j], tip)))
        self._paint_faces(bm, faces, tint, z_grad=0.18)

    def rod(self, role, p0, p1, radius, segs=5, tint=(1.0, 1.0, 1.0)):
        a, b = Vector(p0), Vector(p1)
        delta = b - a
        length = delta.length
        if length < 1e-5:
            return
        mid = (a + b) * 0.5
        rot = Vector((0.0, 0.0, 1.0)).rotation_difference(delta.normalized()).to_matrix().to_4x4()
        mat = Matrix.Translation(mid) @ rot
        bm = self._bm(role)
        res = bmesh.ops.create_cone(
            bm, cap_ends=True, cap_tris=False, segments=segs,
            radius1=radius, radius2=radius, depth=length, matrix=mat,
        )
        verts = set(res["verts"])
        faces = [f for f in bm.faces if all(v in verts for v in f.verts)]
        self._paint_faces(bm, faces, tint)

    def spiked_rod(self, role, p0, p1, r_base, segs=4, tint=(1.0, 1.0, 1.0)):
        """Tapered sharpened wooden spike (abatis defence stake)."""
        a, b = Vector(p0), Vector(p1)
        delta = b - a
        length = delta.length
        if length < 1e-5:
            return
        mid = (a + b) * 0.5
        rot = Vector((0.0, 0.0, 1.0)).rotation_difference(delta.normalized()).to_matrix().to_4x4()
        mat = Matrix.Translation(mid) @ rot
        bm = self._bm(role)
        res = bmesh.ops.create_cone(
            bm, cap_ends=True, cap_tris=False, segments=segs,
            radius1=r_base, radius2=0.015, depth=length, matrix=mat,
        )
        verts = set(res["verts"])
        faces = [f for f in bm.faces if all(v in verts for v in f.verts)]
        self._paint_faces(bm, faces, tint)

    def gable_prism(self, role, cx, cy, z_eave, sx, sy, ridge_h, along_y=True, tint=(1.0, 1.0, 1.0), z_grad=0.22):
        bm = self._bm(role)
        hx, hy = sx * 0.5, sy * 0.5
        z_top = z_eave + ridge_h
        if along_y:
            a0 = bm.verts.new((cx - hx, cy - hy, z_eave))
            a1 = bm.verts.new((cx + hx, cy - hy, z_eave))
            a2 = bm.verts.new((cx, cy - hy, z_top))
            b0 = bm.verts.new((cx - hx, cy + hy, z_eave))
            b1 = bm.verts.new((cx + hx, cy + hy, z_eave))
            b2 = bm.verts.new((cx, cy + hy, z_top))
            faces = [
                bm.faces.new((a0, a1, a2)),
                bm.faces.new((b1, b0, b2)),
                bm.faces.new((a0, b0, b1, a1)),
                bm.faces.new((a1, b1, b2, a2)),
                bm.faces.new((b0, a0, a2, b2)),
            ]
        else:
            a0 = bm.verts.new((cx - hx, cy - hy, z_eave))
            a1 = bm.verts.new((cx - hx, cy + hy, z_eave))
            a2 = bm.verts.new((cx - hx, cy, z_top))
            b0 = bm.verts.new((cx + hx, cy - hy, z_eave))
            b1 = bm.verts.new((cx + hx, cy + hy, z_eave))
            b2 = bm.verts.new((cx + hx, cy, z_top))
            faces = [
                bm.faces.new((a1, a0, a2)),
                bm.faces.new((b0, b1, b2)),
                bm.faces.new((a0, a1, b1, b0)),
                bm.faces.new((a0, b0, b2, a2)),
                bm.faces.new((b1, a1, a2, b2)),
            ]
        self._paint_faces(bm, faces, tint, z_grad=z_grad)

    def lean_roof(self, role, cx, cy, z_low, z_high, sx, sy, high_side="-y", thick=0.14, tint=(1.0, 1.0, 1.0)):
        bm = self._bm(role)
        hx, hy = sx * 0.5, sy * 0.5
        def zh(xn, yn):
            if high_side == "-y": return z_high if yn else z_low
            if high_side == "+y": return z_low if yn else z_high
            if high_side == "-x": return z_high if xn else z_low
            return z_low if xn else z_high
        b0 = bm.verts.new((cx - hx, cy - hy, zh(True, True) - thick))
        b1 = bm.verts.new((cx + hx, cy - hy, zh(False, True) - thick))
        b2 = bm.verts.new((cx + hx, cy + hy, zh(False, False) - thick))
        b3 = bm.verts.new((cx - hx, cy + hy, zh(True, False) - thick))
        t0 = bm.verts.new((cx - hx, cy - hy, zh(True, True)))
        t1 = bm.verts.new((cx + hx, cy - hy, zh(False, True)))
        t2 = bm.verts.new((cx + hx, cy + hy, zh(False, False)))
        t3 = bm.verts.new((cx - hx, cy + hy, zh(True, False)))
        faces = [
            bm.faces.new((b3, b2, b1, b0)),
            bm.faces.new((t0, t1, t2, t3)),
            bm.faces.new((b0, b1, t1, t0)),
            bm.faces.new((b1, b2, t2, t1)),
            bm.faces.new((b2, b3, t3, t2)),
            bm.faces.new((b3, b0, t0, t3)),
        ]
        self._paint_faces(bm, faces, tint, z_grad=0.18)

    def split_flag(self, x, y, z0, z1, flag_w=1.05, flag_h=0.58, dir_x=1.0, pole_role="trunk", col=None):
        """Authentic AoE II two-tone (team top + bright white bottom) split-tail pennant flag!
        When `col` is passed, the waving cloth is placed in an animated `flag=True` pivot group."""
        self.cylinder(pole_role, x, y, z0, z1 + 0.08, 0.055, 0.042, segs=5, tint=(0.82, 0.80, 0.77))
        self.box("iron", x, y, z1 + 0.08, 0.11, 0.11, 0.11)
        target = self
        fx, fy, fz = x, y, z1
        if col is not None:
            fg = bpy.data.objects.new(f"{self.key}:flag_{len(self.root.children)}", None)
            fg["flag"] = True
            fg.location = (x, y, z1)
            fg.parent = self.root
            col.objects.link(fg)
            target = PartBuilder(fg.name, self.mats, parent=fg)
            fx, fy, fz = 0.0, 0.0, 0.0
        for seg, (u0, u1, dz0, dz1, w_scale) in enumerate([
            (0.04, 0.56, 0.00, 0.06, 1.00),
            (0.54, 1.00, 0.06, 0.16, 0.72),
        ]):
            cx = fx + dir_x * (u0 + u1) * 0.5 * flag_w
            sw = (u1 - u0) * flag_w
            y_off = 0.05 if seg == 0 else -0.05
            z_mid = fz - flag_h * 0.48 + (dz0 + dz1) * 0.5
            target.box("team", cx, fy + y_off, z_mid + flag_h * 0.22 * w_scale, sw, 0.055, flag_h * 0.48 * w_scale)
            target.box("snow", cx, fy + y_off, z_mid - flag_h * 0.22 * w_scale, sw * 0.94, 0.055, flag_h * 0.44 * w_scale)
        if col is not None:
            _, ftris = target.finalize(col, link_root=False)
            return ftris
        return 0

    def banner_pole(self, x, y, z0, z1, flag_w=0.72, flag_h=0.44, dir_x=1.0, pole_role="darkwood", col=None):
        self.cylinder(pole_role, x, y, z0, z1 + 0.08, 0.055, 0.042, segs=5)
        self.box("gold", x, y, z1 + 0.08, 0.12, 0.12, 0.12)
        if col is not None:
            fg = bpy.data.objects.new(f"{self.key}:flag_{len(self.root.children)}", None)
            fg["flag"] = True
            fg.location = (x, y, z1)
            fg.parent = self.root
            col.objects.link(fg)
            fb = PartBuilder(fg.name, self.mats, parent=fg)
            fb.box("team", dir_x * flag_w * 0.30, 0.03, -flag_h * 0.48, flag_w * 0.56, 0.05, flag_h)
            fb.box("team", dir_x * flag_w * 0.78, -0.03, -flag_h * 0.44, flag_w * 0.48, 0.05, flag_h * 0.86)
            _, ftris = fb.finalize(col, link_root=False)
            return ftris
        self.box("team", x + dir_x * flag_w * 0.52, y, z1 - flag_h * 0.50, flag_w, 0.055, flag_h)
        return 0

    def moss(self, x, y, z0, sx=0.55, sy=0.45, sz=0.65):
        """Low-poly organic green climbing ivy/moss cluster hugging stone & timber."""
        self.tapered_box("leafDark", x, y, z0, z0 + sz * 0.72, sx, sy, sx * 0.72, sy * 0.72, tint=(0.90, 0.98, 0.86))
        self.tapered_box("leaf", x + sx * 0.16, y - sy * 0.12, z0 + sz * 0.22, z0 + sz, sx * 0.70, sy * 0.66, sx * 0.40, sy * 0.38, tint=(1.00, 1.00, 0.92))

    def barrel(self, x, y, z0, r=0.22, h=0.56, role="wood"):
        self.cylinder(role, x, y, z0, z0 + h, r, r * 0.96, segs=6, tint=(0.94, 0.90, 0.84))
        self.cylinder("iron", x, y, z0 + h * 0.22, z0 + h * 0.31, r * 1.04, r * 1.04, segs=6)
        self.cylinder("iron", x, y, z0 + h * 0.70, z0 + h * 0.79, r * 1.04, r * 1.04, segs=6)

    def crate(self, x, y, z0, s=0.56, role="wood", trim_role="darkwood"):
        self.box_z(role, x, y, z0, z0 + s, s, s, tint=(0.96, 0.93, 0.88))
        self.box(trim_role, x, y, z0 + s * 0.5, s + 0.04, s * 0.14, s + 0.04, tint=(0.76, 0.74, 0.70))

    def pot(self, x, y, z0, r=0.16, h=0.34, colored=True):
        """Age 1 painted clay jar/pot (as seen clustered around Dark Age huts!)."""
        role = "team" if colored else "brick"
        self.cylinder(role, x, y, z0, z0 + h * 0.72, r * 0.78, r, segs=6)
        self.cylinder(role, x, y, z0 + h * 0.72, z0 + h, r, r * 0.65, segs=6)

    def hay_stack(self, x, y, z0, r=0.55, h=0.72):
        self.cylinder("grain", x, y, z0, z0 + h * 0.55, r, r * 0.90, segs=6, tint=(0.96, 0.90, 0.72))
        self.cone("grain", x, y, z0 + h * 0.55, z0 + h, r * 0.92, segs=6, tint=(1.0, 0.95, 0.78))

    def finalize(self, collection, link_root=True, extra_props=None):
        if link_root:
            collection.objects.link(self.root)
        if extra_props:
            for k, v in extra_props.items():
                self.root[k] = v
        tris = 0
        for role, bm in self.buckets.items():
            mesh = bpy.data.meshes.new(f"{self.key}:{role}")
            bm.to_mesh(mesh)
            bm.free()
            mesh.materials.append(self.mats[role])
            mesh.update()
            obj = bpy.data.objects.new(f"{self.key}:{role}", mesh)
            obj["assetMaterial"] = role
            obj.parent = self.root
            collection.objects.link(obj)
            tris += sum(len(p.vertices) - 2 for p in mesh.polygons)
        return self.root, tris


# ---------------------------------------------------------------------------
# Shared Architectural Helpers (Authentic AoE II:DE Silhouettes!)
# ---------------------------------------------------------------------------
def _palisade_row(b, x0, y0, x1, y1, count, z0, z_base_h, radius=0.135, seed=1, abatis=True):
    """Dense tightly-packed weathered silver-grey vertical stakes with jagged tips & abatis spikes."""
    dx, dy = x1 - x0, y1 - y0
    span = math.hypot(dx, dy)
    nx, ny = (-dy / span, dx / span) if span > 1e-5 else (0.0, 1.0)
    for i in range(count):
        t = (i + 0.5) / count
        px, py = x0 + dx * t, y0 + dy * t
        h_var = (((i * 37 + seed * 19) % 13) - 6) * 0.045
        tip_h = 0.24 + ((i * 23 + seed * 7) % 5) * 0.035
        shade = 0.84 + ((i * 29 + seed * 11) % 7) * 0.035
        lx = (((i * 17 + seed) % 5) - 2) * 0.012
        ly = (((i * 13 + seed * 3) % 5) - 2) * 0.012
        b.stake("trunk", px, py, z0, z_base_h + h_var, z_base_h + h_var + tip_h,
                radius, segs=5, lean_x=lx, lean_y=ly, tint=(shade, shade * 0.99, shade * 0.97))
        if abatis and i % 2 == 0:
            for side in (-1.0, 1.0):
                b.spiked_rod("trunk",
                             (px, py, 0.04),
                             (px + nx * side * 0.42, py + ny * side * 0.42, 0.44 + (i % 3) * 0.07),
                             0.055, segs=4, tint=(shade * 0.92, shade * 0.90, shade * 0.87))


def _draped_canvas_roof(b, cx, cy, z_eave, sx, sy, ridge_h, along_y=True, team_border=True, guy_ropes=True):
    """Authentic AoE2 Dark Age 2D sculpted rippled catenary-draped parchment canvas tent cloth with slim tucked team valance!"""
    hx, hy = sx * 0.5, sy * 0.5
    us = (-1.0, -0.74, -0.40, 0.0, 0.40, 0.74, 1.0)
    vs = tuple(-1.0 + 2.0 * j / 8.0 for j in range(9))
    thick = 0.068

    def cloth_z(u, v):
        au = abs(u)
        base = z_eave + ridge_h * ((1.0 - au) ** 1.42)
        # Organic woven cloth folds & stitched ripples running ridge-to-eave + gentle draped eave scallops!
        ripple = math.sin(v * math.pi * 3.5 + au * 1.4) * 0.048 * (0.25 + 0.75 * au)
        sag_along = -0.042 * (1.0 - v * v) * (0.35 + 0.65 * au)
        return base + ripple + sag_along

    bm = b._bm("canvas")
    nu, nv = len(us), len(vs)
    top = [[None] * nv for _ in range(nu)]
    bot = [[None] * nv for _ in range(nu)]
    for i, u in enumerate(us):
        for j, v in enumerate(vs):
            zp = cloth_z(u, v)
            if along_y:
                x, y = cx + u * hx, cy + v * hy
            else:
                x, y = cx + v * hx, cy + u * hy
            top[i][j] = bm.verts.new((x, y, zp))
            bot[i][j] = bm.verts.new((x, y, zp - thick))

    for i in range(nu - 1):
        for j in range(nv - 1):
            u_mid = 0.5 * (us[i] + us[i + 1])
            v_mid = 0.5 * (vs[j] + vs[j + 1])
            fold = math.sin(v_mid * math.pi * 3.5 + abs(u_mid) * 1.4)
            # Rich parchment-cream sunlit cloth crests + warm ochre shadowed fold troughs!
            lum = 0.90 + 0.14 * fold + 0.10 * (1.0 - abs(u_mid))
            tint = (min(1.06, lum * 1.03), min(1.02, lum * 0.97), min(0.95, lum * 0.85))
            f_top = bm.faces.new((top[i][j], top[i + 1][j], top[i + 1][j + 1], top[i][j + 1]))
            f_bot = bm.faces.new((bot[i][j + 1], bot[i + 1][j + 1], bot[i + 1][j], bot[i][j]))
            b._paint_faces(bm, (f_top, f_bot), tint=tint, z_grad=0.06)

    # Close perimeter gable & eave strips cleanly (watertight manifold)
    edge_faces = []
    for i in range(nu - 1):
        edge_faces.append(bm.faces.new((bot[i][0], bot[i + 1][0], top[i + 1][0], top[i][0])))
        edge_faces.append(bm.faces.new((top[i][-1], top[i + 1][-1], bot[i + 1][-1], bot[i][-1])))
    for j in range(nv - 1):
        edge_faces.append(bm.faces.new((top[0][j], top[0][j + 1], bot[0][j + 1], bot[0][j])))
        edge_faces.append(bm.faces.new((bot[-1][j], bot[-1][j + 1], top[-1][j + 1], top[-1][j])))
    b._paint_faces(bm, edge_faces, tint=(0.86, 0.80, 0.68), z_grad=0.08)

    # Weathered warm driftwood ridge pole poking slightly past both ends (ZERO brown wood!)
    if along_y:
        b.box("trunk", cx, cy, z_eave + ridge_h + 0.01, 0.10, sy + 0.28, 0.10, tint=(0.82, 0.79, 0.74))
    else:
        b.box("trunk", cx, cy, z_eave + ridge_h + 0.01, sx + 0.28, 0.10, 0.10, tint=(0.82, 0.79, 0.74))

    if team_border:
        # Slim, organic draped team-colored cloth hem flush against the canvas rim (ZERO gap at any zoom!)
        for j in range(nv - 1):
            v0, v1 = vs[j], vs[j + 1]
            for s_eave in (-1.0, 1.0):
                if along_y:
                    p0 = (cx + s_eave * hx * 0.99, cy + v0 * hy, cloth_z(s_eave, v0) - 0.035)
                    p1 = (cx + s_eave * hx * 0.99, cy + v1 * hy, cloth_z(s_eave, v1) - 0.035)
                else:
                    p0 = (cx + v0 * hx, cy + s_eave * hy * 0.99, cloth_z(s_eave, v0) - 0.035)
                    p1 = (cx + v1 * hx, cy + s_eave * hy * 0.99, cloth_z(s_eave, v1) - 0.035)
                b.rod("team", p0, p1, 0.056, segs=4)
        for i in range(nu - 1):
            u0, u1 = us[i], us[i + 1]
            for s_end in (-1.0, 1.0):
                if along_y:
                    p0 = (cx + u0 * hx, cy + s_end * hy * 0.99, cloth_z(u0, s_end) - 0.018)
                    p1 = (cx + u1 * hx, cy + s_end * hy * 0.99, cloth_z(u1, s_end) - 0.018)
                else:
                    p0 = (cx + s_end * hx * 0.99, cy + u0 * hy, cloth_z(u0, s_end) - 0.018)
                    p1 = (cx + s_end * hx * 0.99, cy + u1 * hy, cloth_z(u1, s_end) - 0.018)
                b.rod("team", p0, p1, 0.048, segs=4)

    if guy_ropes:
        for sx_s in (-1.0, 1.0):
            for sy_s in (-1.0, 1.0):
                p_top = (cx + sx_s * hx * 0.96, cy + sy_s * hy * 0.96, z_eave - 0.04)
                p_peg = (cx + sx_s * (hx + 0.44), cy + sy_s * (hy + 0.38), -0.06)
                b.rod("trunk", p_top, p_peg, 0.025, segs=4, tint=(0.74, 0.71, 0.66))


def _shaggy_thatch_roof(b, cx, cy, z_eave, sx, sy, ridge_h, along_y=True, team_gable=True, hay_eaves=False):
    """Authentic AoE2 Feudal deeply ribbed, ragged overhanging golden-brown reed thatch roof (matches Image 5!)."""
    hx, hy = sx * 0.5, sy * 0.5
    # Sculpted corrugated reed-straw thatch bmesh: vertical straw bundle grooves + ragged scalloped eaves!
    us = (-1.04, -0.78, -0.48, -0.18, 0.0, 0.18, 0.48, 0.78, 1.04)
    n_ribs = max(10, int((sy if along_y else sx) / 0.34))
    if n_ribs % 2 == 1:
        n_ribs += 1
    vs = tuple(-1.0 + 2.0 * j / n_ribs for j in range(n_ribs + 1))
    thick = 0.16

    def thatch_z(u, v, j):
        au = min(1.04, abs(u))
        # Slightly curved chunky thatched pitch with heavy overhanging eave lip
        slope = max(0.0, 1.0 - au / 1.04)
        base = z_eave + ridge_h * (slope ** 0.92)
        if au >= 0.98:
            base -= 0.08 + (j % 3) * 0.045  # ragged uneven overhanging straw eave fringe!
        # Deep physical reed-bundle corrugation running ridge-to-eave
        rib = (1.0 if j % 2 == 0 else -1.0) * 0.062 * (0.28 + 0.72 * au)
        tier_step = 0.045 * math.sin(au * math.pi * 3.0)
        return base + rib + tier_step

    bm = b._bm("straw")
    nu, nv = len(us), len(vs)
    top = [[None] * nv for _ in range(nu)]
    bot = [[None] * nv for _ in range(nu)]
    for i, u in enumerate(us):
        for j, v in enumerate(vs):
            au = abs(u)
            zp = thatch_z(u, v, j)
            flare = 1.0 + (0.045 if (au >= 0.98 and j % 2 == 0) else 0.0)
            if along_y:
                x, y = cx + u * hx * flare, cy + v * hy
            else:
                x, y = cx + v * hx, cy + u * hy * flare
            top[i][j] = bm.verts.new((x, y, zp))
            bot[i][j] = bm.verts.new((x, y, zp - thick))

    for i in range(nu - 1):
        for j in range(nv - 1):
            u_mid = abs(0.5 * (us[i] + us[i + 1]))
            # Deep dark-umber straw valleys alternating with sunlit golden-brown reed crests!
            rib_bright = 1.08 if j % 2 == 0 else 0.68
            eave_shade = 0.80 + 0.24 * (1.0 - min(1.0, u_mid))
            var = 0.92 + ((i * 11 + j * 17) % 5) * 0.035
            v_l = rib_bright * eave_shade * var
            tint = (min(1.12, v_l * 1.02), min(1.04, v_l * 0.94), min(0.92, v_l * 0.80))
            f_top = bm.faces.new((top[i][j], top[i + 1][j], top[i + 1][j + 1], top[i][j + 1]))
            f_bot = bm.faces.new((bot[i][j + 1], bot[i + 1][j + 1], bot[i + 1][j], bot[i][j]))
            b._paint_faces(bm, (f_top, f_bot), tint=tint, z_grad=0.04)

    edge_faces = []
    for i in range(nu - 1):
        edge_faces.append(bm.faces.new((bot[i][0], bot[i + 1][0], top[i + 1][0], top[i][0])))
        edge_faces.append(bm.faces.new((top[i][-1], top[i + 1][-1], bot[i + 1][-1], bot[i][-1])))
    for j in range(nv - 1):
        edge_faces.append(bm.faces.new((top[0][j], top[0][j + 1], bot[0][j + 1], bot[0][j])))
        edge_faces.append(bm.faces.new((bot[-1][j], bot[-1][j + 1], top[-1][j + 1], top[-1][j])))
    b._paint_faces(bm, edge_faces, tint=(0.66, 0.59, 0.46), z_grad=0.06)

    # Thick braided straw ridge bundle + dark weathered oak gable bargeboards + cream-plaster & tasteful team gable!
    if along_y:
        b.box("straw", cx, cy, z_eave + ridge_h + 0.06, 0.34, sy * 1.03, 0.24, tint=(0.86, 0.78, 0.64))
        b.gable_prism("plaster", cx, cy, z_eave - 0.02, sx * 0.88, sy * 0.92, ridge_h * 0.86, along_y=True, tint=(0.96, 0.93, 0.86))
        for gy in (cy - hy * 0.97, cy + hy * 0.97):
            b.rod("darkwood", (cx - hx * 1.02, gy, z_eave - 0.06), (cx, gy, z_eave + ridge_h + 0.10), 0.095, segs=4)
            b.rod("darkwood", (cx + hx * 1.02, gy, z_eave - 0.06), (cx, gy, z_eave + ridge_h + 0.10), 0.095, segs=4)
            b.box("darkwood", cx, gy, z_eave + 0.02, sx * 0.92, 0.12, 0.14)
        if team_gable:
            # Tasteful recessed team-colored heraldic gable inset framed inside dark oak beams (matches Image 5!)
            b.gable_prism("team", cx, cy, z_eave + 0.12, sx * 0.46, sy * 0.95, ridge_h * 0.48, along_y=True)
    else:
        b.box("straw", cx, cy, z_eave + ridge_h + 0.06, sx * 1.03, 0.34, 0.24, tint=(0.86, 0.78, 0.64))
        b.gable_prism("plaster", cx, cy, z_eave - 0.02, sx * 0.92, sy * 0.88, ridge_h * 0.86, along_y=False, tint=(0.96, 0.93, 0.86))
        for gx in (cx - hx * 0.97, cx + hx * 0.97):
            b.rod("darkwood", (gx, cy - hy * 1.02, z_eave - 0.06), (gx, cy, z_eave + ridge_h + 0.10), 0.095, segs=4)
            b.rod("darkwood", (gx, cy + hy * 1.02, z_eave - 0.06), (gx, cy, z_eave + ridge_h + 0.10), 0.095, segs=4)
            b.box("darkwood", gx, cy, z_eave + 0.02, 0.12, sy * 0.92, 0.14)
        if team_gable:
            b.gable_prism("team", cx, cy, z_eave + 0.12, sx * 0.95, sy * 0.46, ridge_h * 0.48, along_y=False)

    if hay_eaves:
        # Loose bright golden hay sheaves resting cleanly ON TOP of the Feudal Stable thatch slope (EXACT Image 5!)
        for off in (-1.15, -0.05, 1.05):
            if along_y:
                b.box("grain", cx + hx * 0.68, cy + off, z_eave + ridge_h * 0.34 + 0.14, 0.56, 0.72, 0.26, rot_z=0.18)
            else:
                b.box("grain", cx + off, cy - hy * 0.68, z_eave + ridge_h * 0.34 + 0.14, 0.72, 0.56, 0.26, rot_z=0.18)


def _feudal_alder_shell(b, cx, cy, sx, sy, wall_h, cobble_h=0.62, x_brace=True, moss=True, team_trim=True):
    """Alder Feudal Western European cobblestone + half-timbered cream plaster walls with bold X-beams."""
    b.tapered_box("stoneDark", cx, cy, -0.46, cobble_h, sx + 0.34, sy + 0.34, sx + 0.14, sy + 0.14, tint=(0.92, 0.91, 0.88))
    b.box_z("plaster", cx, cy, cobble_h - 0.04, wall_h, sx, sy, tint=(1.00, 0.98, 0.93), z_grad=0.12)
    hx, hy = sx * 0.5, sy * 0.5
    # Bold protruding dark oak corner posts, sill & wall plates
    for px in (-hx, hx):
        for py in (-hy, hy):
            b.box_z("darkwood", cx + px, cy + py, cobble_h - 0.06, wall_h + 0.06, 0.20, 0.20)
    b.box("darkwood", cx, cy, cobble_h + 0.02, sx + 0.18, sy + 0.18, 0.15)
    b.box("darkwood", cx, cy, wall_h - 0.05, sx + 0.20, sy + 0.20, 0.16)
    if team_trim:
        b.box("team", cx, cy, wall_h - 0.19, sx + 0.14, sy + 0.14, 0.14)
    # Mid vertical timber studs + bold X-bracing diagonals on all 4 faces
    if x_brace:
        z_lo, z_hi = cobble_h + 0.08, wall_h - 0.12
        for side in (-1.0, 1.0):
            b.box_z("darkwood", cx, cy + side * (hy + 0.03), z_lo, z_hi, 0.13, 0.11)
            b.rod("darkwood", (cx - hx + 0.10, cy + side * (hy + 0.05), z_lo), (cx, cy + side * (hy + 0.05), z_hi), 0.062, segs=4)
            b.rod("darkwood", (cx + hx - 0.10, cy + side * (hy + 0.05), z_lo), (cx, cy + side * (hy + 0.05), z_hi), 0.062, segs=4)
            b.box_z("darkwood", cx + side * (hx + 0.03), cy, z_lo, z_hi, 0.11, 0.13)
            b.rod("darkwood", (cx + side * (hx + 0.05), cy - hy + 0.10, z_lo), (cx + side * (hx + 0.05), cy + hy - 0.10, z_hi), 0.062, segs=4)
            b.rod("darkwood", (cx + side * (hx + 0.05), cy + hy - 0.10, z_lo), (cx + side * (hx + 0.05), cy - hy + 0.10, z_hi), 0.062, segs=4)
    if moss:
        b.moss(cx - hx - 0.06, cy - hy + 0.25, 0.0, sx=0.58, sy=0.52, sz=cobble_h + 0.72)
        b.moss(cx + hx + 0.05, cy + hy - 0.30, 0.0, sx=0.52, sy=0.55, sz=cobble_h + 0.56)


def _feudal_sun_shell(b, cx, cy, sx, sy, wall_h, canopy=True):
    """Sunward Feudal Middle Eastern warm sunlit golden-ochre desert sandstone + terracotta trim + desert arches + woven canopies (ZERO domes!)."""
    # Warm sunlit terracotta sandstone base plinth + battered golden-ochre mudbrick walls
    b.tapered_box("brick", cx, cy, -0.46, 0.42, sx + 0.40, sy + 0.40, sx + 0.16, sy + 0.16, tint=(0.98, 0.90, 0.78))
    b.tapered_box("plaster", cx, cy, 0.36, wall_h, sx, sy, sx - 0.16, sy - 0.16, tint=(1.00, 0.96, 0.88), z_grad=0.10)
    hx, hy = (sx - 0.16) * 0.5, (sy - 0.16) * 0.5
    # Terracotta corner pilasters + stepped desert crenelated parapet merlons (rich architectural silhouette!)
    for px in (-hx, hx):
        for py in (-hy, hy):
            b.box_z("brick", cx + px, cy + py, 0.34, wall_h + 0.52, 0.34, 0.34, tint=(0.98, 0.90, 0.78))
    b.box("brick", cx, cy, wall_h - 0.12, sx - 0.24, sy - 0.24, 0.16, tint=(0.92, 0.82, 0.68))
    for side in (-1.0, 1.0):
        b.box_z("plaster", cx, cy + side * (hy - 0.10), wall_h - 0.04, wall_h + 0.36, sx - 0.22, 0.22, tint=(0.98, 0.94, 0.86))
        b.box_z("plaster", cx + side * (hx - 0.10), cy, wall_h - 0.04, wall_h + 0.36, 0.22, sy - 0.22, tint=(0.98, 0.94, 0.86))
        # Stepped mudbrick merlon cresting along parapet walls
        b.box_z("brick", cx, cy + side * (hy - 0.10), wall_h + 0.32, wall_h + 0.54, sx * 0.28, 0.24, tint=(0.98, 0.90, 0.78))
        b.box_z("brick", cx + side * (hx - 0.10), cy, wall_h + 0.32, wall_h + 0.54, 0.24, sy * 0.28, tint=(0.98, 0.90, 0.78))
    # Protruding warm cedar roof vigas + sculpted arched window/door niches
    n_vigas = max(2, int(sx / 0.82))
    for i in range(n_vigas):
        vx = cx - hx + 0.38 + (i / max(1, n_vigas - 1)) * (sx - 0.90)
        b.box("wood", vx, cy, wall_h - 0.22, 0.13, sy + 0.48, 0.13, tint=(0.96, 0.88, 0.76))
    # Terracotta cornice trim + bold team mosaic frieze band
    b.box("brick", cx, cy, wall_h - 0.34, sx + 0.10, sy + 0.10, 0.14, tint=(0.98, 0.88, 0.74))
    b.box("team", cx, cy, wall_h - 0.50, sx + 0.06, sy + 0.06, 0.18)
    # Recessed pointed desert arch window/alcove detail on front & sides
    if wall_h >= 2.0:
        b.box("darkwood", cx, cy - hy - 0.02, wall_h * 0.48, 0.68, 0.12, 0.86)
        b.gable_prism("brick", cx, cy - hy - 0.03, wall_h * 0.48 + 0.36, 0.86, 0.18, 0.38, along_y=True, tint=(0.98, 0.88, 0.74))
    if canopy:
        # Sun-shaded woven golden-tan & team striped rooftop pergola awning on warm cedar poles
        cw, cd = sx * 0.76, sy * 0.66
        for px in (-cw * 0.44, cw * 0.44):
            for py in (-cd * 0.44, cd * 0.44):
                b.cylinder("wood", cx + px, cy + py, wall_h, wall_h + 1.15, 0.065, 0.055, segs=5, tint=(0.96, 0.88, 0.76))
        b.lean_roof("canvas", cx, cy, wall_h + 0.96, wall_h + 1.24, cw + 0.32, cd + 0.32, high_side="+y", thick=0.10)
        b.box("team", cx, cy - cd * 0.58, wall_h + 0.90, cw + 0.34, 0.10, 0.24)
        b.box("team", cx - cw * 0.25, cy, wall_h + 1.14, cw * 0.20, cd + 0.28, 0.08)
        b.box("team", cx + cw * 0.25, cy, wall_h + 1.14, cw * 0.20, cd + 0.28, 0.08)


def _feudal_raven_shell(b, cx, cy, sx, sy, wall_h, roof_h, along_y=True, shields=True):
    """Raven Feudal Nordic horizontal notched warm timber logs + steep shaggy roof + dragon-horn finials + painted shields."""
    b.tapered_box("stoneDark", cx, cy, -0.46, 0.50, sx + 0.36, sy + 0.36, sx + 0.14, sy + 0.14, tint=(0.90, 0.89, 0.88))
    b.box_z("wood", cx, cy, 0.44, wall_h, sx, sy, tint=(0.96, 0.90, 0.82), z_grad=0.14)
    # Protruding notched horizontal log ends at all 4 corners (weathered warm timber!)
    hx, hy = sx * 0.5, sy * 0.5
    courses = max(3, int((wall_h - 0.48) / 0.42))
    for i in range(courses):
        zc = 0.58 + i * ((wall_h - 0.66) / max(1, courses - 1))
        b.box("trunk", cx, cy - hy, zc, sx + 0.46, 0.16, 0.16, tint=(0.88, 0.85, 0.80))
        b.box("trunk", cx, cy + hy, zc, sx + 0.46, 0.16, 0.16, tint=(0.88, 0.85, 0.80))
        b.box("trunk", cx - hx, cy, zc, 0.16, sy + 0.46, 0.16, tint=(0.88, 0.85, 0.80))
        b.box("trunk", cx + hx, cy, zc, 0.16, sy + 0.46, 0.16, tint=(0.88, 0.85, 0.80))
    # Steep Norse layered timber-shingle & shaggy golden-brown thatch roof + crossed ridge dragon-horn finials
    b.gable_prism("darkwood", cx, cy, wall_h - 0.08, sx + 0.72, sy + 0.60, roof_h, along_y=along_y, tint=(0.94, 0.86, 0.76), z_grad=0.20)
    b.gable_prism("straw", cx, cy, wall_h + roof_h * 0.16, (sx + 0.64) * (0.88 if along_y else 0.96), (sy + 0.54) * (0.96 if along_y else 0.88), roof_h * 0.84, along_y=along_y, tint=(0.92, 0.86, 0.76), z_grad=0.20)
    z_peak = wall_h - 0.04 + roof_h
    if along_y:
        b.box("wood", cx, cy, z_peak, 0.18, sy + 0.74, 0.18, tint=(0.94, 0.88, 0.78))
        for gy in (cy - hy - 0.30, cy + hy + 0.30):
            b.rod("wood", (cx - 0.22, gy, z_peak - 0.18), (cx + 0.38, gy, z_peak + 0.52), 0.068, segs=4)
            b.rod("wood", (cx + 0.22, gy, z_peak - 0.18), (cx - 0.38, gy, z_peak + 0.52), 0.068, segs=4)
        b.gable_prism("team", cx, cy, wall_h + 0.06, sx * 0.64, sy * 0.90, roof_h * 0.60, along_y=True)
    else:
        b.box("wood", cx, cy, z_peak, sx + 0.74, 0.18, 0.18, tint=(0.94, 0.88, 0.78))
        for gx in (cx - hx - 0.30, cx + hx + 0.30):
            b.rod("wood", (gx, cy - 0.22, z_peak - 0.18), (gx, cy + 0.38, z_peak + 0.52), 0.068, segs=4)
            b.rod("wood", (gx, cy + 0.22, z_peak - 0.18), (gx, cy - 0.38, z_peak + 0.52), 0.068, segs=4)
        b.gable_prism("team", cx, cy, wall_h + 0.06, sx * 0.90, sy * 0.64, roof_h * 0.60, along_y=False)
    if shields:
        for ox in (-hx * 0.48, hx * 0.48):
            b.box("team", cx + ox, cy - hy - 0.10, wall_h - 0.42, 0.50, 0.09, 0.50)
            b.box("steel", cx + ox, cy - hy - 0.14, wall_h - 0.42, 0.16, 0.07, 0.16)


def _feudal_pavilion(b, civ, cx, cy, sx, sy, h=1.85, along_y=False):
    """Open-sided Feudal courtyard pavilion awning (signature of AoE2 Feudal Town Center & Market!)."""
    hx, hy = sx * 0.44, sy * 0.44
    post_role = "wood" if civ == "sun" else "darkwood"
    for px in (-hx, hx):
        for py in (-hy, hy):
            b.box_z(post_role, cx + px, cy + py, -0.46, h, 0.15, 0.15)
    b.box("team", cx, cy, h - 0.06, sx + 0.08, sy + 0.08, 0.14)
    if civ == "alder":
        _shaggy_thatch_roof(b, cx, cy, h - 0.04, sx + 0.46, sy + 0.46, 0.92, along_y=along_y, team_gable=False)
    elif civ == "sun":
        b.lean_roof("canvas", cx, cy, h - 0.04, h + 0.48, sx + 0.38, sy + 0.38, high_side="+y", thick=0.10)
        b.box("team", cx, cy - sy * 0.56, h - 0.10, sx + 0.40, 0.09, 0.24)
    else:
        b.gable_prism("straw", cx, cy, h - 0.04, sx + 0.44, sy + 0.44, 0.98, along_y=along_y, tint=(0.90, 0.84, 0.74))
        b.box("wood", cx, cy, h + 0.96, 0.14 if along_y else sx + 0.52, sy + 0.52 if along_y else 0.14, 0.14)


def _timber_crane(b, cx, cy, scale=1.0, team_cloth=True, driftwood=False):
    """Iconic AoE2 Dark & Feudal Age wooden A-frame log-lifting crane (Image 1 top-right & Image 2 bottom-left!)."""
    s = scale
    frame_role = "trunk" if driftwood else "darkwood"
    beam_role = "trunk" if driftwood else "wood"
    frame_tint = (0.82, 0.80, 0.77) if driftwood else (1.0, 1.0, 1.0)
    beam_tint = (0.96, 0.94, 0.90) if driftwood else (1.0, 1.0, 1.0)
    # Timber base skids
    b.box_z(frame_role, cx, cy, -0.46, 0.18 * s, 1.50 * s, 1.30 * s, tint=frame_tint)
    # Tripod A-frame uprights
    apex = (cx - 0.25 * s, cy, 2.35 * s)
    b.rod(frame_role, (cx - 0.65 * s, cy - 0.52 * s, 0.10), apex, 0.085 * s, segs=5, tint=frame_tint)
    b.rod(frame_role, (cx - 0.65 * s, cy + 0.52 * s, 0.10), apex, 0.085 * s, segs=5, tint=frame_tint)
    b.rod(frame_role, (cx + 0.45 * s, cy, 0.10), apex, 0.085 * s, segs=5, tint=frame_tint)
    # Long angled wooden crane boom jib + winch wheel + hanging rope
    tip = (cx + 1.55 * s, cy - 0.18 * s, 3.05 * s)
    b.rod(beam_role, (cx - 0.85 * s, cy + 0.12 * s, 1.35 * s), tip, 0.095 * s, segs=5, tint=beam_tint)
    b.rod(frame_role, apex, (cx + 0.95 * s, cy - 0.10 * s, 2.68 * s), 0.05 * s, segs=4, tint=frame_tint)
    # Hanging rope & iron hook
    b.rod("canvas", tip, (tip[0], tip[1], 1.15 * s), 0.034 * s, segs=4)
    b.box("iron", tip[0], tip[1], 1.08 * s, 0.16 * s, 0.16 * s, 0.20 * s)
    # Wooden winch drum / spoked wheel at crane base
    b.cylinder(beam_role, cx - 0.20 * s, cy - 0.36 * s, 0.55 * s, 1.15 * s, 0.36 * s, 0.36 * s, segs=8, tint=beam_tint)
    b.cylinder("iron", cx - 0.20 * s, cy - 0.36 * s, 0.78 * s, 0.92 * s, 0.12 * s, 0.12 * s, segs=6)
    if team_cloth:
        b.box("team", cx - 0.10 * s, cy - 0.05 * s, 1.88 * s, 0.82 * s, 0.10 * s, 0.42 * s, rot_z=0.22)


def _archery_target(b, cx, cy, z0=0.0):
    """Classic prominent round AoE2 straw & team-color bullseye archery target on wooden tripod stand."""
    b.rod("darkwood", (cx - 0.30, cy + 0.08, z0), (cx, cy + 0.08, z0 + 1.55), 0.05, segs=4)
    b.rod("darkwood", (cx + 0.30, cy + 0.08, z0), (cx, cy + 0.08, z0 + 1.55), 0.05, segs=4)
    b.rod("darkwood", (cx, cy + 0.52, z0), (cx, cy + 0.08, z0 + 1.32), 0.05, segs=4)
    # Large readable target bullseye facing -Y (-> Three.js +Z, clearly in front of backstop!)
    b.box("straw", cx, cy - 0.04, z0 + 1.02, 0.88, 0.16, 0.88, tint=(1.00, 0.96, 0.82))
    b.box("team", cx, cy - 0.11, z0 + 1.02, 0.58, 0.09, 0.58)
    b.box("grain", cx, cy - 0.15, z0 + 1.02, 0.32, 0.07, 0.32)
    b.box("fruit", cx, cy - 0.18, z0 + 1.02, 0.15, 0.05, 0.15)


# ---------------------------------------------------------------------------
# 1. PALISADE WALL, PALISADE GATE & 3-TIER CORNER BASTIONS (Images 3 & 4!)
# ---------------------------------------------------------------------------
def build_palisade_wall(mats, col):
    """Exact AoE II:DE tall weathered silver-driftwood dense palisade wall with lashings & abatis base spikes (ZERO brown wood!)."""
    key = "building:wall:palisade"
    b = PartBuilder(key, mats)
    # Subtle buried earth trench footing (-0.46 .. 0.04)
    b.tapered_box("soil", 0.0, 0.0, -0.46, 0.04, 2.94, 0.88, 2.86, 0.72, tint=(0.90, 0.82, 0.68))
    # 12 tall tightly-packed weathered silver-driftwood sharpened stakes rising proudly to 3.15..3.45m!
    _palisade_row(b, -1.36, 0.0, 1.36, 0.0, count=12, z0=-0.46, z_base_h=2.95, radius=0.142, seed=3, abatis=True)
    # 2 crisp horizontal weathered silver-grey lashings front & back + binding knots (ZERO brown wood!)
    for zy in (0.95, 2.22):
        b.box("trunk", 0.0, -0.16, zy, 2.94, 0.09, 0.13, tint=(0.72, 0.70, 0.67))
        b.box("trunk", 0.0, 0.16, zy, 2.94, 0.09, 0.13, tint=(0.72, 0.70, 0.67))
        for kx in (-1.05, 0.0, 1.05):
            b.box("trunk", kx, -0.19, zy, 0.11, 0.10, 0.19, tint=(0.66, 0.64, 0.61))
            b.box("trunk", kx, 0.19, zy, 0.11, 0.10, 0.19, tint=(0.66, 0.64, 0.61))
    return b.finalize(col)


def build_palisade_corner(mats, col):
    """Exact AoE II:DE tall Palisade Corner Bastion (Image 3 left & Image 4 all 4 corners, ZERO brown wood!)."""
    key = "building:wallcorner:palisade"
    b = PartBuilder(key, mats)
    # Subtle buried earth pad + 4 flush docking trenches reaching +/-1.43m on X & Y
    b.tapered_box("soil", 0.0, 0.0, -0.46, 0.05, 2.46, 2.46, 2.16, 2.16, tint=(0.90, 0.82, 0.68))
    b.tapered_box("soil", 0.0, 0.0, -0.46, 0.04, 2.90, 0.86, 2.86, 0.72, tint=(0.88, 0.80, 0.66))
    b.tapered_box("soil", 0.0, 0.0, -0.46, 0.04, 0.86, 2.90, 0.72, 2.86, tint=(0.88, 0.80, 0.66))

    # Recessed weathered inner crib core & flat log roof deck (completely hidden behind rounded outer stakes!)
    b.box_z("trunk", 0.0, 0.0, -0.46, 3.18, 1.38, 1.38, tint=(0.76, 0.74, 0.70), z_grad=0.14)
    for k in range(-3, 4):
        b.box_z("trunk", 0.0, k * 0.21, 3.14, 3.28, 1.48, 0.17, tint=(0.94 + (k % 2) * 0.05, 0.91, 0.85))

    # Dense tightly-packed square perimeter of tall sharpened weathered stakes rising to 3.95..4.25m!
    hs = 0.92
    _palisade_row(b, -hs, -hs, hs, -hs, count=8, z0=-0.46, z_base_h=3.72, radius=0.148, seed=11, abatis=True)
    _palisade_row(b, -hs, hs, hs, hs, count=8, z0=-0.46, z_base_h=3.72, radius=0.148, seed=17, abatis=True)
    _palisade_row(b, -hs, -hs + 0.20, -hs, hs - 0.20, count=6, z0=-0.46, z_base_h=3.72, radius=0.148, seed=23, abatis=True)
    _palisade_row(b, hs, -hs + 0.20, hs, hs - 0.20, count=6, z0=-0.46, z_base_h=3.72, radius=0.148, seed=29, abatis=True)

    # Flush 4-way docking cheek-stakes reaching +/-1.36m at matching tall wall height (ZERO gap!)
    for side in (-1.0, 1.0):
        for dist in (1.12, 1.34):
            b.stake("trunk", side * dist, 0.0, -0.46, 2.98, 3.26, 0.140, segs=5, tint=(0.94, 0.92, 0.88))
            b.stake("trunk", 0.0, side * dist, -0.46, 2.98, 3.26, 0.140, segs=5, tint=(0.92, 0.90, 0.86))

    # 3 crisp horizontal weathered silver-grey lashings wrapped around all 4 bastion faces + docking rails
    for zy in (0.95, 2.22, 3.30):
        b.box("trunk", 0.0, -hs - 0.14, zy, hs * 2 + 0.36, 0.09, 0.13, tint=(0.72, 0.70, 0.67))
        b.box("trunk", 0.0, hs + 0.14, zy, hs * 2 + 0.36, 0.09, 0.13, tint=(0.72, 0.70, 0.67))
        b.box("trunk", -hs - 0.14, 0.0, zy, 0.09, hs * 2 + 0.36, 0.13, tint=(0.72, 0.70, 0.67))
        b.box("trunk", hs + 0.14, 0.0, zy, 0.09, hs * 2 + 0.36, 0.13, tint=(0.72, 0.70, 0.67))
    for zy in (0.95, 2.22):
        b.box("trunk", 0.0, -0.16, zy, 2.88, 0.08, 0.12, tint=(0.72, 0.70, 0.67))
        b.box("trunk", 0.0, 0.16, zy, 2.88, 0.08, 0.12, tint=(0.72, 0.70, 0.67))
        b.box("trunk", -0.16, 0.0, zy, 0.08, 2.88, 0.12, tint=(0.72, 0.70, 0.67))
        b.box("trunk", 0.16, 0.0, zy, 0.08, 2.88, 0.12, tint=(0.72, 0.70, 0.67))

    # Iconic AoE2 two-tone (team + bright white) fluttering split-tail war pennant rising proudly from corner deck!
    ftris = b.split_flag(0.0, 0.0, 3.18, 5.55, flag_w=1.24, flag_h=0.62, dir_x=1.0, pole_role="trunk", col=col)
    root, tris = b.finalize(col)
    return root, tris + ftris


def build_palisade_gate(mats, col):
    """Exact AoE II:DE tall Palisade Gate (Image 3 center!): twin tall spiked silver-driftwood towers,
    curved arched log header bridge, bright open-lattice wooden barred portcullis, fluttering split flags (ZERO brown wood!)."""
    key = "building:gate:palisade"
    b = PartBuilder(key, mats)
    ftris = 0

    # TWO TALL SQUARE PALISADE STOCKADE TOWERS flanking x = +/-2.14 (wide clear passage [-1.26, +1.26])
    for side in (-1.0, 1.0):
        px = side * 2.14
        hs = 0.80
        b.tapered_box("soil", px, 0.0, -0.46, 0.05, 2.10, 2.10, 1.84, 1.84, tint=(0.90, 0.82, 0.68))
        # Recessed inner weathered driftwood tower shaft (hidden behind rounded outer logs!) + flat log top deck
        b.box_z("trunk", px, 0.0, -0.46, 4.55, 1.18, 1.18, tint=(0.76, 0.74, 0.70), z_grad=0.14)
        for k in range(-2, 3):
            b.box_z("trunk", px, k * 0.25, 4.50, 4.64, 1.32, 0.19, tint=(0.94, 0.91, 0.85))
        # Dense vertical sharpened stakes wrapping all 4 faces up to jagged 5.15..5.45m rim!
        _palisade_row(b, px - hs, -hs, px + hs, -hs, count=7, z0=-0.46, z_base_h=4.92, radius=0.146, seed=int(41 + side * 7), abatis=True)
        _palisade_row(b, px - hs, hs, px + hs, hs, count=7, z0=-0.46, z_base_h=4.92, radius=0.146, seed=int(53 + side * 7), abatis=True)
        _palisade_row(b, px - hs, -hs + 0.20, px - hs, hs - 0.20, count=6, z0=-0.46, z_base_h=4.92, radius=0.146, seed=int(61 + side * 7), abatis=True)
        _palisade_row(b, px + hs, -hs + 0.20, px + hs, hs - 0.20, count=6, z0=-0.46, z_base_h=4.92, radius=0.146, seed=int(67 + side * 7), abatis=True)
        # 4 horizontal weathered silver-grey lashing bands wrapping all 4 faces of each tower (matches Image 3!)
        for zy in (0.95, 2.15, 3.35, 4.35):
            b.box("trunk", px, -hs - 0.14, zy, hs * 2 + 0.32, 0.09, 0.13, tint=(0.72, 0.70, 0.67))
            b.box("trunk", px, hs + 0.14, zy, hs * 2 + 0.32, 0.09, 0.13, tint=(0.72, 0.70, 0.67))
            b.box("trunk", px - hs - 0.14, 0.0, zy, 0.09, hs * 2 + 0.32, 0.13, tint=(0.72, 0.70, 0.67))
            b.box("trunk", px + hs + 0.14, 0.0, zy, 0.09, hs * 2 + 0.32, 0.13, tint=(0.72, 0.70, 0.67))
        # Prominent fluttering two-tone split-tail war-pennant on top of EACH tower!
        ftris += b.split_flag(px, 0.0, 4.55, 6.85, flag_w=1.34, flag_h=0.65, dir_x=1.0, pole_role="trunk", col=col)
        # Team-colored cloth pennant/wrap hanging down the inner gatepost jamb (matches Image 3!)
        b.box("team", px - side * (hs + 0.15), -0.34, 3.15, 0.10, 0.24, 1.38)

    # CURVED ARCHED PALISADE LOG HEADER BRIDGE between the two towers (clear above portcullis y = 3.45!)
    header_count = 13
    for i in range(header_count):
        t = (i + 0.5) / header_count
        x = -1.32 + t * 2.64
        u = abs(x) / 1.32
        z_bot = 3.74 - (u * u) * 0.28       # subtle curved archway underside (>= 3.46m clear!)
        z_sh = 4.30 + (u * u) * 0.46 + ((i * 19) % 5) * 0.035
        z_tip = z_sh + 0.28 + ((i * 13) % 3) * 0.04
        shade = 0.88 + (i % 4) * 0.04
        b.stake("trunk", x, -0.14, z_bot, z_sh, z_tip, 0.130, segs=5, tint=(shade, shade * 0.99, shade * 0.96))
        b.stake("trunk", x, 0.14, z_bot, z_sh, z_tip, 0.130, segs=5, tint=(shade * 0.94, shade * 0.93, shade * 0.90))
    # Weathered silver-grey horizontal lashing beams gripping the arched header bridge
    b.box("trunk", 0.0, -0.27, 4.02, 2.86, 0.11, 0.14, tint=(0.72, 0.70, 0.67))
    b.box("trunk", 0.0, 0.27, 4.02, 2.86, 0.11, 0.14, tint=(0.72, 0.70, 0.67))
    b.box("trunk", 0.0, 0.0, 3.76, 2.86, 0.46, 0.12, tint=(0.76, 0.74, 0.71))

    root, tris = b.finalize(col, extra_props={"gateHousingHeight": 3.45, "artRevision": "gate-footings-v1"})

    # OPEN-LATTICE BARRED WEATHERED SILVER-DRIFTWOOD PORTCULLIS GATE LEAF (matches Image 3!)
    gate_group = bpy.data.objects.new(f"{key}:gateLeaf", None)
    gate_group["gate"] = True
    gate_group.parent = root
    col.objects.link(gate_group)
    gb = PartBuilder(f"{key}:gateLeaf", mats, parent=gate_group)
    # 7 crisp light weathered silver-grey vertical lattice bars (clear see-through grid!)
    for x in (-1.08, -0.72, -0.36, 0.0, 0.36, 0.72, 1.08):
        gb.box_z("trunk", x, 0.0, 0.02, 3.30, 0.075, 0.075, tint=(0.94, 0.92, 0.88))
    # 5 thin horizontal cross-bars forming the iconic square barred portcullis grid
    for zy in (0.45, 1.12, 1.79, 2.46, 3.12):
        gb.box("trunk", 0.0, 0.0, zy, 2.48, 0.085, 0.068, tint=(0.88, 0.86, 0.82))
    for sx in (-1.08, 1.08):
        for zy in (0.45, 3.12):
            gb.box("iron", sx, 0.0, zy, 0.11, 0.11, 0.11)
    _, gate_tris = gb.finalize(col, link_root=False)
    return root, tris + gate_tris + ftris


def build_stone_corner(mats, col):
    """Age 3 Castle Age square stone corner bastion tower (5.68m tall, 4-way flush, castle-like)."""
    key = "building:wallcorner:stone"
    b = PartBuilder(key, mats)
    # Heavy battered dark-stone foundation buried to -0.46
    b.tapered_box("stoneDark", 0.0, 0.0, -0.46, 0.72, 2.92, 2.92, 2.58, 2.58, tint=(0.96, 0.94, 0.90))
    # 4-way flush masonry wall-docking shoulders (matches straight Stone Wall depth & height)
    b.box_z("stone", 0.0, 0.0, -0.46, 3.62, 2.88, 1.48, tint=(0.98, 0.96, 0.93), z_grad=0.14)
    b.box_z("stone", 0.0, 0.0, -0.46, 3.62, 1.48, 2.88, tint=(0.98, 0.96, 0.93), z_grad=0.14)
    b.box_z("stoneDark", 0.0, 0.0, -0.46, 0.48, 2.90, 2.12, tint=(0.95, 0.93, 0.90))
    b.box_z("stoneDark", 0.0, 0.0, -0.46, 0.48, 2.12, 2.90, tint=(0.95, 0.93, 0.90))
    b.box("stoneDark", 0.0, 0.0, 3.66, 2.90, 1.54, 0.16)
    b.box("stoneDark", 0.0, 0.0, 3.66, 1.54, 2.90, 0.16)

    # Commanding dressed-ashlar square bastion shaft (rises proudly to z = 4.52m!) + corner pilasters
    b.box_z("stone", 0.0, 0.0, 0.56, 4.52, 2.38, 2.38, tint=(1.00, 0.98, 0.95), z_grad=0.16)
    for sx in (-1.14, 1.14):
        for sy in (-1.14, 1.14):
            b.box_z("stoneDark", sx, sy, 0.42, 4.54, 0.44, 0.44, tint=(0.96, 0.95, 0.92), z_grad=0.12)
    b.box("stoneDark", 0.0, 0.0, 2.55, 2.52, 2.52, 0.18)

    # Recessed arrow slits & heraldic team-colored shield plaques cleanly proud on all 4 bastion faces!
    for side in (-1.0, 1.0):
        b.box("iron", 0.0, side * 1.45, 2.55, 0.18, 0.08, 0.86)
        b.box("iron", 0.0, side * 1.45, 2.72, 0.40, 0.08, 0.12)
        b.box("iron", side * 1.45, 0.0, 2.55, 0.08, 0.18, 0.86)
        b.box("iron", side * 1.45, 0.0, 2.72, 0.08, 0.40, 0.12)
        b.box("team", 0.0, side * 1.24, 4.02, 0.56, 0.10, 0.50)
        b.box("team", side * 1.24, 0.0, 4.02, 0.10, 0.56, 0.50)

    # Projecting stepped machicolation corbel ring (z = 4.42 .. 4.78)
    for off in (-0.82, 0.0, 0.82):
        for side in (-1.0, 1.0):
            b.box("stoneDark", off, side * 1.26, 4.44, 0.24, 0.28, 0.34)
            b.box("stoneDark", side * 1.26, off, 4.44, 0.28, 0.24, 0.34)
    b.box_z("stoneDark", 0.0, 0.0, 4.52, 4.72, 2.70, 2.70, tint=(0.95, 0.94, 0.91))
    b.box_z("stone", 0.0, 0.0, 4.72, 4.82, 2.80, 2.80, tint=(1.00, 0.99, 0.96))

    # Recessed fighting deck + parapet sill + 8 sculpted crenellations up to 5.68m!
    b.box_z("stoneDark", 0.0, 0.0, 4.68, 4.84, 2.22, 2.22, tint=(0.86, 0.85, 0.82))
    for side in (-1.0, 1.0):
        b.box_z("stone", 0.0, side * 1.20, 4.82, 5.04, 2.70, 0.36)
        b.box_z("stone", side * 1.20, 0.0, 4.82, 5.04, 0.36, 2.70)
    for sx in (-1.16, 1.16):
        for sy in (-1.16, 1.16):
            b.box_z("stone", sx, sy, 5.02, 5.56, 0.58, 0.58)
            b.box_z("stoneDark", sx, sy, 5.56, 5.68, 0.66, 0.66)
    for side in (-1.0, 1.0):
        b.box_z("stone", 0.0, side * 1.18, 5.02, 5.52, 0.66, 0.40)
        b.box_z("stoneDark", 0.0, side * 1.18, 5.52, 5.64, 0.74, 0.48)
        b.box_z("stone", side * 1.18, 0.0, 5.02, 5.52, 0.40, 0.66)
        b.box_z("stoneDark", side * 1.18, 0.0, 5.52, 5.64, 0.48, 0.74)
    return b.finalize(col)


def build_fortified_corner(mats, col):
    """Age 4 Imperial Fortified monumental corner citadel bastion (6.90m + banner, gleaming silver)."""
    key = "building:wallcorner:fortified"
    b = PartBuilder(key, mats)
    b.tapered_box("stoneDark", 0.0, 0.0, -0.46, 0.92, 3.08, 3.08, 2.76, 2.76, tint=(0.94, 0.95, 0.98))
    b.box_z("stone", 0.0, 0.0, -0.46, 4.52, 2.94, 1.86, tint=(0.98, 0.99, 1.00), z_grad=0.14)
    b.box_z("stone", 0.0, 0.0, -0.46, 4.52, 1.86, 2.94, tint=(0.98, 0.99, 1.00), z_grad=0.14)
    b.box_z("stoneDark", 0.0, 0.0, -0.46, 0.68, 2.96, 2.42, tint=(0.93, 0.95, 0.98))
    b.box_z("stoneDark", 0.0, 0.0, -0.46, 0.68, 2.42, 2.96, tint=(0.93, 0.95, 0.98))
    b.box("stoneDark", 0.0, 0.0, 4.56, 2.96, 1.92, 0.16)
    b.box("stoneDark", 0.0, 0.0, 4.56, 1.92, 2.96, 0.16)

    b.box_z("stone", 0.0, 0.0, 0.76, 5.45, 2.62, 2.62, tint=(1.00, 1.00, 1.00), z_grad=0.16)
    for sx in (-1.26, 1.26):
        for sy in (-1.26, 1.26):
            b.box_z("stoneDark", sx, sy, 0.56, 5.48, 0.52, 0.52, tint=(0.94, 0.96, 0.99), z_grad=0.12)
            b.tapered_box("stoneDark", sx * 1.08, sy * 1.08, -0.46, 1.56, 0.66, 0.66, 0.46, 0.46)
    b.box("stoneDark", 0.0, 0.0, 2.86, 2.78, 2.78, 0.22)
    b.box("stone", 0.0, 0.0, 5.06, 2.76, 2.76, 0.18)

    for side in (-1.0, 1.0):
        for off in (-0.42, 0.42):
            b.box("iron", off, side * 1.48, 3.32, 0.18, 0.08, 0.96)
            b.box("iron", side * 1.48, off, 3.32, 0.08, 0.18, 0.96)
        b.box("team", 0.0, side * 1.36, 4.80, 0.64, 0.10, 0.56)
        b.box("gold", 0.0, side * 1.38, 5.10, 0.68, 0.08, 0.09)
        b.box("team", side * 1.36, 0.0, 4.80, 0.10, 0.64, 0.56)
        b.box("gold", side * 1.38, 0.0, 5.10, 0.08, 0.68, 0.09)

    for off in (-0.98, -0.32, 0.32, 0.98):
        for side in (-1.0, 1.0):
            b.box("stoneDark", off, side * 1.40, 5.36, 0.22, 0.30, 0.40)
            b.box("stoneDark", side * 1.40, off, 5.36, 0.30, 0.22, 0.40)
    b.box_z("stoneDark", 0.0, 0.0, 5.45, 5.68, 2.98, 2.98, tint=(0.94, 0.96, 0.99))
    b.box_z("stone", 0.0, 0.0, 5.68, 5.80, 3.08, 3.08, tint=(1.00, 1.00, 1.00))

    b.box_z("stoneDark", 0.0, 0.0, 5.66, 5.82, 2.40, 2.40, tint=(0.86, 0.88, 0.92))
    for side in (-1.0, 1.0):
        b.box_z("stoneDark", 0.0, side * 1.32, 5.80, 6.12, 2.96, 0.40)
        b.box_z("stoneDark", side * 1.32, 0.0, 5.80, 6.12, 0.40, 2.96)
    for sx in (-1.28, 1.28):
        for sy in (-1.28, 1.28):
            b.box_z("stoneDark", sx, sy, 6.10, 6.72, 0.66, 0.66)
            b.box_z("stone", sx, sy, 6.72, 6.86, 0.74, 0.74)
            b.tapered_box("gold", sx, sy, 6.86, 7.16, 0.28, 0.28, 0.08, 0.08)
    for side in (-1.0, 1.0):
        b.box_z("stoneDark", 0.0, side * 1.30, 6.10, 6.66, 0.74, 0.44)
        b.box_z("stone", 0.0, side * 1.30, 6.66, 6.80, 0.82, 0.52)
        b.box_z("stoneDark", side * 1.30, 0.0, 6.10, 6.66, 0.44, 0.74)
        b.box_z("stone", side * 1.30, 0.0, 6.66, 6.80, 0.52, 0.82)

    b.banner_pole(0.0, 0.0, 5.80, 7.82, flag_w=0.96, flag_h=0.58, dir_x=1.0)
    return b.finalize(col)


# ---------------------------------------------------------------------------
# 2. AGE 1 — FRONTIER / DARK AGE (7 Universal Driftwood & Draped Canvas Models — ZERO brown wood!)
# ---------------------------------------------------------------------------
def build_frontier_towncenter(mats, col):
    """Exact AoE II:DE Dark Age Town Center (Image 2 center!):
    Raised weathered silver-driftwood stilt platform with crooked stick balcony, ladder, hides,
    draped golden-tan canvas canopy with sleek team hem, + TWO flanking open-sided canvas pavilions!"""
    key = "building:towncenter:frontier"
    b = PartBuilder(key, mats)

    # CENTRAL ELEVATED STILT PLATFORM (at back-center y = +0.95, deck at z = 1.66m!)
    cx, cy, dw, dd, z_deck = 0.0, 0.95, 3.60, 2.80, 1.66
    for px in (-1.58, 0.0, 1.58):
        for py in (-1.20, 1.20):
            h_top = 3.22 if py > 0 else 2.58
            b.cylinder("trunk", cx + px, cy + py, -0.46, h_top, 0.145, 0.115, segs=5, tint=(0.94, 0.92, 0.88))
    # Cross-bracing under the stilts (weathered silver-driftwood, ZERO brown wood!)
    for px in (-1.58, 1.58):
        b.rod("trunk", (cx + px, cy - 1.15, 0.22), (cx + px, cy + 1.15, z_deck - 0.10), 0.065, segs=4, tint=(0.82, 0.80, 0.77))
    b.rod("trunk", (cx - 1.52, cy + 1.15, 0.25), (cx + 1.52, cy + 1.15, z_deck - 0.10), 0.065, segs=4, tint=(0.82, 0.80, 0.77))
    # Weathered silver-driftwood platform planks & beams
    b.box_z("trunk", cx, cy, z_deck - 0.16, z_deck, dw, dd, tint=(0.94, 0.92, 0.88))
    for py in (-1.12, 0.0, 1.12):
        b.box("trunk", cx, cy + py, z_deck - 0.20, dw + 0.36, 0.16, 0.16, tint=(0.78, 0.76, 0.72))
    # Open crooked vertical stick-railing balcony around front & sides of upper deck (EXACT Image 2!)
    for ix in range(-6, 7):
        if -1 <= ix <= 1:
            continue
        rx = cx + ix * 0.27
        b.stake("trunk", rx, cy - dd * 0.48, z_deck, z_deck + 0.82 + (ix % 3) * 0.06, z_deck + 1.02, 0.058, segs=4, tint=(0.94, 0.92, 0.88))
    for iy in range(-4, 5):
        ry = cy + iy * 0.30
        b.stake("trunk", cx - dw * 0.48, ry, z_deck, z_deck + 0.84 + (iy % 2) * 0.07, z_deck + 1.04, 0.058, segs=4, tint=(0.92, 0.90, 0.86))
        b.stake("trunk", cx + dw * 0.48, ry, z_deck, z_deck + 0.84 + (iy % 2) * 0.07, z_deck + 1.04, 0.058, segs=4, tint=(0.92, 0.90, 0.86))
    # Top weathered stick rails
    b.box("trunk", cx - 1.14, cy - dd * 0.48, z_deck + 0.70, 1.32, 0.09, 0.09, tint=(0.78, 0.76, 0.72))
    b.box("trunk", cx + 1.14, cy - dd * 0.48, z_deck + 0.70, 1.32, 0.09, 0.09, tint=(0.78, 0.76, 0.72))
    b.box("trunk", cx - dw * 0.48, cy, z_deck + 0.70, 0.09, dd, 0.09, tint=(0.78, 0.76, 0.72))
    b.box("trunk", cx + dw * 0.48, cy, z_deck + 0.70, 0.09, dd, 0.09, tint=(0.78, 0.76, 0.72))

    # Weathered driftwood ladder leaning up to front balcony opening!
    for lx in (-0.28, 0.28):
        b.rod("trunk", (cx + lx, cy - dd * 0.50 - 0.65, -0.10), (cx + lx, cy - dd * 0.46, z_deck + 0.12), 0.058, segs=4, tint=(0.94, 0.92, 0.88))
    for step in range(5):
        f = (step + 0.5) / 5.0
        b.box("trunk", cx, cy - dd * 0.50 - 0.65 * (1.0 - f), 0.08 + f * z_deck, 0.60, 0.07, 0.07, tint=(0.82, 0.80, 0.76))

    # Draped golden-tan canvas pavilion over back half of stilt deck (EXACT Image 2!)
    for px in (-1.58, 1.58):
        b.cylinder("trunk", cx + px, cy + 0.20, z_deck, 3.18, 0.10, 0.085, segs=5, tint=(0.92, 0.90, 0.86))
    _draped_canvas_roof(b, cx, cy + 0.52, 3.10, 3.92, 2.30, 1.05, along_y=False, team_border=True, guy_ropes=False)
    # Animal pelts, crates & barrels on the open balcony deck + beneath stilts
    b.box("canvas", cx + 0.55, cy - 0.45, z_deck + 0.04, 0.96, 0.74, 0.06, rot_z=0.35, tint=(1.00, 0.96, 0.88))
    b.barrel(cx - 0.85, cy - 0.35, z_deck, r=0.22, h=0.52, role="trunk")
    b.crate(cx - 0.35, cy + 0.35, z_deck, s=0.54, role="trunk", trim_role="trunk")
    b.barrel(cx - 0.80, cy - 0.20, 0.0, r=0.24, h=0.56, role="trunk")
    b.barrel(cx + 0.95, cy - 0.40, 0.0, r=0.24, h=0.56, role="trunk")
    b.pot(cx - 0.55, cy - 1.55, 0.0, colored=True)
    b.moss(cx - 1.45, cy - 1.10, -0.02, sx=0.62, sy=0.56, sz=0.60)

    # TWO FLANKING OPEN-SIDED COURTYARD CANVAS PAVILIONS (front-left & front-right — EXACT Image 2!)
    for side in (-1.0, 1.0):
        px, py = side * 2.55, -1.45
        pw, pd, ph = 2.40, 1.68, 1.72
        for ox in (-pw * 0.44, pw * 0.44):
            for oy in (-pd * 0.42, pd * 0.42):
                b.cylinder("trunk", px + ox, py + oy, -0.46, ph + 0.06, 0.095, 0.08, segs=5, tint=(0.94, 0.92, 0.88))
        _draped_canvas_roof(b, px, py, ph, pw + 0.38, pd + 0.38, 0.74, along_y=False, team_border=True, guy_ropes=False)
        b.barrel(px - side * 0.42, py + 0.20, 0.0, r=0.20, h=0.48, role="trunk")
        b.pot(px + side * 0.45, py - 0.25, 0.0, colored=True)
        b.moss(px + side * 0.95, py + 0.55, -0.02, sx=0.48, sy=0.46, sz=0.46)

    return b.finalize(col)


def build_frontier_house(mats, col):
    """Exact AoE II:DE Dark Age Tent-Hut (Image 2 top & Image 4 center!, ZERO brown wood!):
    Weathered pale silver-driftwood vertical stakes, draped golden-tan canvas roof with sleek team trim,
    side stick-porch awning, guy-ropes, painted pots & lush green moss!"""
    key = "building:house:frontier"
    b = PartBuilder(key, mats)

    # Main tent-hut vertical weathered silver-driftwood stake walls (grounded to -0.46, tucked cleanly under canvas eave!)
    cx, cy, sx, sy, wh = -0.32, 0.12, 2.44, 2.22, 1.64
    b.box_z("trunk", cx, cy, -0.46, wh - 0.12, sx - 0.16, sy - 0.16, tint=(0.86, 0.84, 0.80), z_grad=0.14)
    hx, hy = sx * 0.5, sy * 0.5
    _palisade_row(b, cx - hx, cy - hy, cx + hx, cy - hy, count=8, z0=-0.46, z_base_h=wh - 0.46, radius=0.115, seed=71, abatis=False)
    _palisade_row(b, cx - hx, cy + hy, cx + hx, cy + hy, count=8, z0=-0.46, z_base_h=wh - 0.46, radius=0.115, seed=73, abatis=False)
    _palisade_row(b, cx - hx, cy - hy + 0.16, cx - hx, cy + hy - 0.16, count=6, z0=-0.46, z_base_h=wh - 0.46, radius=0.115, seed=79, abatis=False)
    _palisade_row(b, cx + hx, cy - hy + 0.16, cx + hx, cy + hy - 0.16, count=6, z0=-0.46, z_base_h=wh - 0.46, radius=0.115, seed=83, abatis=False)
    # Shadowed doorway with team cloth door-flap (weathered driftwood frame, ZERO brown wood!)
    b.box_z("trunk", cx, cy - hy - 0.06, -0.10, 1.24, 0.72, 0.12, tint=(0.56, 0.54, 0.52))
    b.box_z("team", cx - 0.20, cy - hy - 0.10, 0.06, 1.18, 0.26, 0.08)
    # Draped golden-tan canvas tent roof with sleek team eave hem + taut guy-ropes!
    _draped_canvas_roof(b, cx, cy, wh - 0.04, sx + 0.46, sy + 0.44, 1.08, along_y=False, team_border=True, guy_ropes=True)

    # Front-right driftwood stick-porch lean-to awning (EXACT Image 2!)
    px, py = 1.30, -0.22
    for oy in (-0.58, 0.58):
        b.cylinder("trunk", px + 0.36, py + oy, -0.46, 1.28, 0.09, 0.075, segs=5, tint=(0.94, 0.92, 0.88))
    b.lean_roof("canvas", px, py, 1.20, 1.52, 1.22, 1.46, high_side="-x", thick=0.10)
    b.box("team", px + 0.58, py, 1.16, 0.08, 1.48, 0.14)
    b.box("team", px, py - 0.72, 1.30, 1.24, 0.08, 0.14)

    # Painted team ceramic water jars & lush green moss/ivy clusters!
    b.pot(cx - hx - 0.24, cy - 0.52, 0.0, colored=True)
    b.pot(cx - hx - 0.28, cy - 0.16, 0.0, colored=False)
    b.pot(px + 0.42, py - 0.72, 0.0, colored=True)
    b.pot(px + 0.12, py - 0.80, 0.0, colored=True)
    b.moss(cx - hx - 0.14, cy + 0.52, -0.02, sx=0.62, sy=0.64, sz=1.02)
    b.moss(cx + hx - 0.08, cy + hy + 0.10, -0.02, sx=0.54, sy=0.48, sz=0.78)
    return b.finalize(col)


def build_frontier_camp(mats, col):
    """Exact AoE II:DE Dark Age Lumber Camp (Image 2 bottom-left!): weathered driftwood A-frame hoist crane & logs!"""
    key = "building:camp:frontier"
    b = PartBuilder(key, mats)
    _timber_crane(b, -0.55, 0.35, scale=1.12, team_cloth=True, driftwood=True)
    # Stacked pale weathered timber logs on skids + sawing trestle + cut planks (ZERO brown wood!)
    for i, zc in enumerate((0.20, 0.50)):
        for oy in (-0.34, 0.0, 0.34):
            if i == 1 and abs(oy) > 0.2:
                continue
            b.box("trunk", 0.95, -0.55 + oy, zc, 2.08, 0.26, 0.26, tint=(0.90 + i * 0.06, 0.88, 0.84))
    b.box("trunk", 0.95, 0.75, 0.18, 1.68, 0.78, 0.22, rot_z=0.14, tint=(0.96, 0.94, 0.90))
    # Chopping stump + iron axe blade
    b.cylinder("trunk", -1.25, -0.95, -0.46, 0.58, 0.32, 0.28, segs=7, tint=(0.92, 0.90, 0.86))
    b.box("iron", -1.25, -0.95, 0.68, 0.24, 0.06, 0.18)
    b.rod("trunk", (-1.25, -0.95, 0.66), (-1.62, -1.25, 1.05), 0.042, segs=4, tint=(0.92, 0.90, 0.86))
    b.moss(-1.65, 0.95, -0.02, sx=0.64, sy=0.58, sz=0.54)
    return b.finalize(col)


def build_frontier_barracks(mats, col):
    """Exact AoE II:DE Dark Age Barracks compound (1-to-1 match with uploaded Image 4!):
    Wide open warm weathered-driftwood palisade courtyard, 4 stake-wrapped mini corner bastions
    with fluttering split-tail pennants, centered cozy rippled-canvas command hut & moss (ZERO brown wood!)"""
    key = "building:barracks:frontier"
    b = PartBuilder(key, mats)
    ftris = 0
    # Wide open weathered driftwood palisade stockade perimeter (+/-2.42m courtyard, open front entrance!)
    _palisade_row(b, -2.35, 2.32, 2.35, 2.32, count=16, z0=-0.46, z_base_h=1.88, radius=0.122, seed=91, abatis=True)
    _palisade_row(b, -2.38, -2.22, -2.38, 2.22, count=14, z0=-0.46, z_base_h=1.82, radius=0.122, seed=97, abatis=True)
    _palisade_row(b, 2.38, -2.22, 2.38, 2.22, count=14, z0=-0.46, z_base_h=1.82, radius=0.122, seed=101, abatis=True)
    _palisade_row(b, -2.35, -2.28, -0.82, -2.28, count=6, z0=-0.46, z_base_h=1.78, radius=0.122, seed=103, abatis=True)
    _palisade_row(b, 0.82, -2.28, 2.35, -2.28, count=6, z0=-0.46, z_base_h=1.78, radius=0.122, seed=107, abatis=True)
    # Horizontal driftwood lashing poles wrapping all 4 perimeter faces
    for zy in (0.68, 1.38):
        b.box("trunk", 0.0, 2.44, zy, 4.95, 0.085, 0.105, tint=(0.72, 0.69, 0.64))
        b.box("trunk", -2.50, 0.02, zy, 0.085, 4.75, 0.105, tint=(0.72, 0.69, 0.64))
        b.box("trunk", 2.50, 0.02, zy, 0.085, 4.75, 0.105, tint=(0.72, 0.69, 0.64))
        b.box("trunk", -1.62, -2.40, zy, 1.65, 0.085, 0.105, tint=(0.72, 0.69, 0.64))
        b.box("trunk", 1.62, -2.40, zy, 1.65, 0.085, 0.105, tint=(0.72, 0.69, 0.64))

    # 4 FULLY STAKE-WRAPPED MINI CORNER PALISADE BASTIONS + 4 FLUTTERING SPLIT-TAIL PENNANTS (ZERO flat cubes!)
    for idx_c, (cx_c, cy_c) in enumerate(((-2.38, -2.28), (2.38, -2.28), (-2.38, 2.32), (2.38, 2.32))):
        ch = 0.56
        b.box_z("trunk", cx_c, cy_c, -0.46, 2.15, 0.82, 0.82, tint=(0.76, 0.73, 0.68))
        _palisade_row(b, cx_c - ch, cy_c - ch, cx_c + ch, cy_c - ch, count=5, z0=-0.46, z_base_h=2.40, radius=0.118, seed=111 + idx_c * 7, abatis=False)
        _palisade_row(b, cx_c - ch, cy_c + ch, cx_c + ch, cy_c + ch, count=5, z0=-0.46, z_base_h=2.40, radius=0.118, seed=115 + idx_c * 7, abatis=False)
        _palisade_row(b, cx_c - ch, cy_c - ch + 0.18, cx_c - ch, cy_c + ch - 0.18, count=4, z0=-0.46, z_base_h=2.40, radius=0.118, seed=119 + idx_c * 7, abatis=False)
        _palisade_row(b, cx_c + ch, cy_c - ch + 0.18, cx_c + ch, cy_c + ch - 0.18, count=4, z0=-0.46, z_base_h=2.40, radius=0.118, seed=123 + idx_c * 7, abatis=False)
        for zy in (0.78, 1.72):
            b.box("trunk", cx_c, cy_c - ch - 0.11, zy, ch * 2 + 0.24, 0.08, 0.11, tint=(0.70, 0.67, 0.62))
            b.box("trunk", cx_c, cy_c + ch + 0.11, zy, ch * 2 + 0.24, 0.08, 0.11, tint=(0.70, 0.67, 0.62))
            b.box("trunk", cx_c - ch - 0.11, cy_c, zy, 0.08, ch * 2 + 0.24, 0.11, tint=(0.70, 0.67, 0.62))
            b.box("trunk", cx_c + ch + 0.11, cy_c, zy, 0.08, ch * 2 + 0.24, 0.11, tint=(0.70, 0.67, 0.62))
        ftris += b.split_flag(cx_c, cy_c, 2.15, 3.88, flag_w=0.92, flag_h=0.46, dir_x=1.0, pole_role="trunk", col=col)

    # Cozy rustic centered rippled-canvas command hut inside the open courtyard + lush green moss!
    cx, cy = 0.0, 0.15
    hx, hy, wh = 1.18, 0.96, 1.56
    b.box_z("trunk", cx, cy, -0.46, wh - 0.12, hx * 2 - 0.14, hy * 2 - 0.14, tint=(0.82, 0.79, 0.74))
    _palisade_row(b, cx - hx, cy - hy, cx + hx, cy - hy, count=8, z0=-0.46, z_base_h=wh - 0.44, radius=0.105, seed=141, abatis=False)
    _palisade_row(b, cx - hx, cy + hy, cx + hx, cy + hy, count=8, z0=-0.46, z_base_h=wh - 0.44, radius=0.105, seed=143, abatis=False)
    _palisade_row(b, cx - hx, cy - hy + 0.16, cx - hx, cy + hy - 0.16, count=6, z0=-0.46, z_base_h=wh - 0.44, radius=0.105, seed=147, abatis=False)
    _palisade_row(b, cx + hx, cy - hy + 0.16, cx + hx, cy + hy - 0.16, count=6, z0=-0.46, z_base_h=wh - 0.44, radius=0.105, seed=149, abatis=False)
    b.box_z("team", cx, cy - hy - 0.06, 0.04, 1.24, 0.64, 0.10)
    _draped_canvas_roof(b, cx, cy, wh - 0.04, hx * 2 + 0.48, hy * 2 + 0.46, 1.02, along_y=False, team_border=True, guy_ropes=True)
    b.moss(cx - hx - 0.16, cy - 0.25, -0.02, sx=0.58, sy=0.60, sz=0.92)
    b.moss(cx + hx + 0.14, cy + 0.15, -0.02, sx=0.54, sy=0.56, sz=0.84)
    # Courtyard sparring rack & shields
    for sx in (-1.35, 1.35):
        b.box("team", sx, -1.48, 0.62, 0.42, 0.10, 0.52)
        b.rod("trunk", (sx, -1.38, 0.04), (sx + 0.08, -1.28, 1.88), 0.036, segs=4, tint=(0.92, 0.89, 0.84))
    root, tris = b.finalize(col)
    return root, tris + ftris


def build_frontier_mill(mats, col):
    """Age 1 Dark Age Mill: open weathered driftwood pavilion, stone grinding wheel, golden-tan canvas & grain sacks (NO flat soil slab, ZERO brown wood!)."""
    key = "building:mill:frontier"
    b = PartBuilder(key, mats)
    # Circular stone grinding ring buried cleanly into grass (no flat square dirt pad!)
    b.cylinder("stone", -0.65, -0.45, -0.46, 0.58, 0.98, 0.94, segs=10)
    b.cylinder("stoneDark", -0.65, -0.45, 0.58, 0.92, 0.64, 0.60, segs=10)
    b.cylinder("trunk", -0.65, -0.45, 0.90, 1.72, 0.12, 0.11, segs=6, tint=(0.86, 0.84, 0.80))
    b.box("trunk", -0.15, -0.45, 1.26, 2.18, 0.14, 0.14, tint=(0.94, 0.92, 0.88))
    # Open weathered silver-driftwood post pavilion + draped golden-tan canvas shelter
    cx, cy = 0.45, 0.65
    for px in (-1.25, 1.25):
        for py in (-0.95, 0.95):
            b.cylinder("trunk", cx + px, cy + py, -0.46, 2.06, 0.115, 0.095, segs=5, tint=(0.94, 0.92, 0.88))
    _draped_canvas_roof(b, cx, cy, 2.00, 3.00, 2.38, 0.98, along_y=False, team_border=True, guy_ropes=True)
    # Abundant golden grain sacks & hay stacks resting cleanly on grass
    for gx, gy in ((0.85, 0.35), (1.30, 0.55), (0.35, 0.85), (1.15, -0.75)):
        b.cylinder("canvas", gx, gy, -0.12, 0.68, 0.28, 0.20, segs=6, tint=(0.98, 0.94, 0.84))
        b.cylinder("grain", gx, gy, 0.62, 0.76, 0.19, 0.15, segs=6)
    b.hay_stack(-1.35, 1.15, -0.06, r=0.60, h=0.84)
    b.moss(1.55, 1.35, -0.02, sx=0.56, sy=0.52, sz=0.52)
    return b.finalize(col)


def build_frontier_mine(mats, col):
    """Age 1 Dark Age Mining Camp: open weathered driftwood lean-to canvas shed, ore trough, boulders & gold (NO flat soil slab, ZERO brown wood!)."""
    key = "building:mine:frontier"
    b = PartBuilder(key, mats)
    # Open weathered driftwood post lean-to canopy
    for px in (-1.35, 0.85):
        b.cylinder("trunk", px, 0.95, -0.46, 2.28, 0.12, 0.10, segs=5, tint=(0.94, 0.92, 0.88))
        b.cylinder("trunk", px, -0.65, -0.46, 1.58, 0.11, 0.095, segs=5, tint=(0.94, 0.92, 0.88))
    b.lean_roof("canvas", -0.25, 0.15, 1.54, 2.32, 2.80, 2.18, high_side="+y", thick=0.11)
    b.box("team", -0.25, -0.94, 1.48, 2.82, 0.09, 0.18)
    # Stone & gold ore heaps + weathered driftwood mine trough
    for ox, oy, r, h, role in [
        (1.15, 0.45, 0.60, 0.74, "stoneDark"),
        (1.45, -0.22, 0.46, 0.58, "stone"),
        (0.95, -0.58, 0.36, 0.44, "gold"),
        (-0.85, 0.35, 0.50, 0.60, "stoneDark"),
    ]:
        b.cone(role, ox, oy, -0.14, 0.02 + h, r, segs=6)
    b.box_z("trunk", -0.55, -0.92, -0.12, 0.66, 1.18, 0.70, tint=(0.90, 0.88, 0.84))
    b.box_z("stone", -0.55, -0.92, 0.56, 0.78, 0.92, 0.48)
    b.barrel(0.35, -0.95, -0.06, r=0.20, h=0.50, role="trunk")
    b.moss(-1.45, 0.85, -0.02, sx=0.54, sy=0.50, sz=0.50)
    return b.finalize(col)


def build_frontier_dock(mats, col):
    """Authentic AoE II:DE Dark Age / Frontier Harbor Dock (ZERO brown wood!):
    Compact weathered ash-driftwood piling wharf + sturdy 3m front jetty (never clips ships!),
    sculpted rippled canvas fishing awning, draped drying nets, stacked barrels, crates, rope coils & fluttering pennant!"""
    key = "building:dock:frontier"
    b = PartBuilder(key, mats)
    # Compact weathered ash-driftwood piling wharf deck (5.4 x 5.0m, deep pilings to -2.20m)
    for px in (-2.40, -1.20, 0.0, 1.20, 2.40):
        for py in (-2.15, -0.72, 0.72, 2.15):
            b.cylinder("trunk", px, py, -2.20, 0.68, 0.17, 0.15, segs=6, tint=(0.80, 0.77, 0.72))
    b.box_z("trunk", 0.0, 0.0, 0.18, 0.52, 5.45, 4.95, tint=(0.94, 0.91, 0.85))
    # Subtle deck planking ribs + diagonal timber piling braces
    for px in (-2.0, -1.0, 0.0, 1.0, 2.0):
        b.box("trunk", px, 0.0, 0.54, 0.14, 4.88, 0.04, tint=(0.82, 0.79, 0.74))
    b.box("team", 0.0, -2.49, 0.36, 5.48, 0.11, 0.20)
    b.box("team", 0.0, 2.49, 0.36, 5.48, 0.11, 0.20)
    b.box("team", 2.74, 0.0, 0.36, 0.11, 4.98, 0.20)

    # Open-sided weathered driftwood & rippled parchment-canvas fisherman shelter on wharf
    sx, sy = -0.85, 0.65
    for ox in (-1.30, 1.30):
        for oy in (-1.00, 1.00):
            b.cylinder("trunk", sx + ox, sy + oy, 0.46, 2.38, 0.11, 0.095, segs=5, tint=(0.94, 0.91, 0.85))
    _draped_canvas_roof(b, sx, sy, 2.30, 3.15, 2.45, 1.06, along_y=False, team_border=True, guy_ropes=False)
    # Drying fishing net rack + draped side nets + clustered barrels, crates, rope coils & painted pots
    for ox in (-0.80, 0.80):
        b.cylinder("trunk", 1.48, -1.25 + ox * 0.70, 0.46, 1.95, 0.075, 0.065, segs=5, tint=(0.86, 0.83, 0.78))
    b.box("trunk", 1.48, -1.25, 1.90, 0.10, 1.38, 0.10, tint=(0.84, 0.81, 0.76))
    b.box("canvas", 1.48, -1.25, 1.30, 0.06, 1.12, 0.96, tint=(0.92, 0.86, 0.76))
    for bx, by in ((1.10, 0.88), (1.62, 1.08), (1.35, 1.54), (-1.70, -1.35), (-1.18, -1.58), (0.65, 1.55)):
        b.barrel(bx, by, 0.52, r=0.23, h=0.58, role="trunk")
    b.crate(0.32, -1.28, 0.52, s=0.62, role="trunk", trim_role="trunk")
    b.crate(0.42, -1.24, 1.14, s=0.44, role="trunk", trim_role="trunk")
    b.cylinder("canvas", 1.85, 0.32, 0.52, 0.82, 0.30, 0.26, segs=8, tint=(0.95, 0.88, 0.74))
    b.pot(-1.75, -0.68, 0.52, colored=True)
    ftris = b.split_flag(2.35, -2.02, 0.52, 4.18, flag_w=1.02, flag_h=0.52, dir_x=1.0, pole_role="trunk", col=col)
    root, tris = b.finalize(col)

    # COMPACT STURDY DRIFTWOOD FRONT JETTY (x = 1.65 .. 4.55m -> matches DOCK_PIER_OFFSET=3.1, ZERO ship overlap!)
    pier = bpy.data.objects.new(f"{key}:pier", None)
    pier["dockPier"] = True
    pier.parent = root
    col.objects.link(pier)
    pb = PartBuilder(f"{key}:pier", mats, parent=pier)
    pb.box_z("trunk", 3.10, 0.0, 0.18, 0.46, 2.95, 2.85, tint=(0.94, 0.91, 0.85))
    for x in (2.05, 3.25, 4.35):
        for side in (-1.24, 1.24):
            pb.cylinder("trunk", x, side, -2.20, 1.02, 0.16, 0.145, segs=6, tint=(0.78, 0.75, 0.70))
        pb.rod("trunk", (x, -1.20, -0.65), (x, 1.20, 0.22), 0.075, segs=4, tint=(0.74, 0.71, 0.66))
    pb.box("team", 3.10, -1.44, 0.34, 2.95, 0.10, 0.20)
    pb.box("team", 3.10, 1.44, 0.34, 2.95, 0.10, 0.20)
    # Draped fishing net hanging off front pilings + barrels & rope coil!
    pb.box("canvas", 4.58, 0.0, -0.05, 0.08, 2.15, 0.82, tint=(0.90, 0.84, 0.74))
    pb.barrel(3.15, 0.82, 0.46, r=0.22, h=0.55, role="trunk")
    pb.barrel(3.65, 0.88, 0.46, r=0.22, h=0.55, role="trunk")
    pb.crate(3.55, -0.78, 0.46, s=0.56, role="trunk", trim_role="trunk")
    _, p_tris = pb.finalize(col, link_root=False)
    return root, tris + p_tris + ftris


# ---------------------------------------------------------------------------
# 3. AGE 2 — FEUDAL AGE (36 Models: 12 Alder + 12 Sunward + 12 Raven — Image 1!)
# ---------------------------------------------------------------------------
def build_feudal_towncenter(civ, mats, col):
    """Exact AoE II:DE Feudal Town Center (Image 1 center!):
    2-story half-timbered / regional manor hall + TWO flanking open-sided courtyard pavilions!"""
    key = f"building:towncenter:{civ}:1"
    b = PartBuilder(key, mats)

    # Central 2-story Feudal hall (shifted slightly rear at y = +0.95 to frame open front courtyard!)
    cx, cy = 0.0, 0.95
    if civ == "alder":
        _feudal_alder_shell(b, cx, cy, 3.60, 3.00, 2.25, cobble_h=0.68, x_brace=True, moss=True, team_trim=True)
        _feudal_alder_shell(b, cx, cy, 3.90, 3.25, 3.95, cobble_h=2.22, x_brace=True, moss=False, team_trim=True)
        _shaggy_thatch_roof(b, cx, cy, 3.88, 4.65, 3.95, 1.78, along_y=False, team_gable=True)
        b.box_z("darkwood", cx, cy - 1.54, 0.02, 1.82, 1.15, 0.24)
        b.box_z("team", cx, cy - 1.62, 1.65, 1.95, 1.32, 0.14)
        b.box_z("stoneDark", cx + 1.55, cy + 0.65, 0.50, 5.45, 0.64, 0.64)
        b.box("stone", cx + 1.55, cy + 0.65, 5.52, 0.76, 0.76, 0.16)
    elif civ == "sun":
        _feudal_sun_shell(b, cx, cy, 4.10, 3.45, 3.65, canopy=True)
        _feudal_sun_shell(b, cx, cy + 0.35, 2.65, 2.20, 4.95, canopy=False)
        for sx in (-0.95, 0.95):
            b.box_z("brick", cx + sx, cy - 1.85, -0.46, 2.15, 0.44, 0.44, tint=(0.98, 0.90, 0.78))
        b.box("team", cx, cy - 1.85, 2.18, 2.38, 0.48, 0.24)
    else:
        _feudal_raven_shell(b, cx, cy, 3.95, 3.25, 3.15, 2.35, along_y=False, shields=True)
        b.box_z("darkwood", cx, cy - 1.68, 0.02, 1.88, 1.18, 0.24)
        b.box("team", cx, cy - 1.74, 1.85, 1.34, 0.12, 0.22)

    # TWO FLANKING OPEN-SIDED COURTYARD PAVILIONS (EXACT signature of Image 1 Feudal Town Center!)
    for side in (-1.0, 1.0):
        _feudal_pavilion(b, civ, side * 2.55, -1.45, 2.35, 1.95, h=1.88, along_y=False)
        b.barrel(side * 2.25, -1.25, 0.0, r=0.22, h=0.54)
        b.crate(side * 2.85, -1.55, 0.0, s=0.52)

    ftris = b.banner_pole(0.0, cy - 1.75, 2.25, 5.85, flag_w=0.92, flag_h=0.52, dir_x=1.0, col=col)
    root, tris = b.finalize(col)
    return root, tris + ftris


def build_feudal_house(civ, mats, col):
    """Exact AoE II:DE Feudal House (Image 1!): L-shaped cottage, shaggy thatch, stone chimney, team gable!"""
    key = f"building:house:{civ}:1"
    b = PartBuilder(key, mats)
    if civ == "alder":
        # Main cozy half-timbered wing + perpendicular front porch wing (L-silhouette like Image 1!)
        _feudal_alder_shell(b, -0.30, 0.25, 2.75, 2.25, 2.15, cobble_h=0.60, x_brace=True, moss=True, team_trim=False)
        _shaggy_thatch_roof(b, -0.30, 0.25, 2.10, 3.45, 2.95, 1.48, along_y=False, team_gable=True)
        # Side L-wing jutting forward
        _feudal_alder_shell(b, 0.92, -0.58, 1.45, 1.55, 1.85, cobble_h=0.52, x_brace=False, moss=False, team_trim=False)
        _shaggy_thatch_roof(b, 0.92, -0.58, 1.80, 1.95, 2.05, 1.08, along_y=True, team_gable=True)
        # Stone chimney stack + wooden door + barrels
        b.box_z("stoneDark", -1.42, 0.62, -0.46, 3.72, 0.56, 0.56)
        b.box("stone", -1.42, 0.62, 3.78, 0.66, 0.66, 0.14)
        b.box_z("darkwood", -0.35, -0.90, 0.12, 1.42, 0.68, 0.16)
        b.box("glass", -0.35, -0.92, 1.22, 0.42, 0.10, 0.36)
        b.barrel(-1.25, -0.95, 0.04, r=0.20, h=0.48)
    elif civ == "sun":
        _feudal_sun_shell(b, -0.20, 0.15, 2.85, 2.45, 2.45, canopy=True)
        _feudal_sun_shell(b, 1.05, -0.55, 1.35, 1.35, 1.75, canopy=False)
        b.box_z("darkwood", -0.25, -1.10, 0.12, 1.46, 0.72, 0.16)
        b.pot(1.25, -1.35, 0.04, colored=True)
    else:
        _feudal_raven_shell(b, -0.25, 0.20, 2.75, 2.25, 1.95, 1.75, along_y=False, shields=True)
        _feudal_raven_shell(b, 0.95, -0.55, 1.45, 1.45, 1.65, 1.25, along_y=True, shields=False)
        b.box_z("darkwood", -0.25, -0.96, 0.12, 1.38, 0.68, 0.16)
        b.barrel(-1.20, -1.00, 0.04, r=0.20, h=0.48)
    return b.finalize(col)


def build_feudal_tower(civ, mats, col):
    """Exact AoE II:DE Feudal Watch Tower (5 visible in Image 1!!):
    Tall weathered cobblestone shaft with climbing ivy + overhanging octagonal wooden lookout cabin
    with dark slit band & team trim + conical ribbed golden-oak plank roof!"""
    key = f"building:tower:{civ}:1"
    b = PartBuilder(key, mats)
    if civ == "alder":
        # Battered dark cobblestone tower base + slender octagonal stone shaft (z = -0.46 .. 4.32m)
        b.cylinder("stoneDark", 0.0, 0.0, -0.46, 0.85, 1.48, 1.20, segs=8, tint=(0.90, 0.89, 0.86))
        b.cylinder("stoneDark", 0.0, 0.0, 0.78, 4.32, 1.14, 1.02, segs=8, tint=(0.94, 0.92, 0.88), z_grad=0.16)
        # Climbing lush green moss/ivy creeping up two sides of the stone shaft (EXACT Image 1!)
        b.moss(-0.92, -0.48, 0.10, sx=0.72, sy=0.68, sz=2.85)
        b.moss(0.76, -0.68, 0.08, sx=0.62, sy=0.62, sz=1.95)
        b.moss(-0.35, 0.88, 0.10, sx=0.65, sy=0.58, sz=2.30)
        # Angled timber corbel brackets supporting the overhanging wooden watch-gallery
        for i in range(8):
            a = i * math.pi / 4.0
            ca, sa = math.cos(a), math.sin(a)
            b.rod("darkwood", (ca * 0.96, sa * 0.96, 3.68), (ca * 1.46, sa * 1.46, 4.36), 0.085, segs=4)
        # Wider overhanging octagonal wooden lookout cabin!
        b.cylinder("darkwood", 0.0, 0.0, 4.28, 4.52, 1.54, 1.56, segs=8)
        b.cylinder("team", 0.0, 0.0, 4.50, 4.74, 1.57, 1.57, segs=8)
        # Dark recessed lookout slit window band + 8 corner wooden posts
        b.cylinder("iron", 0.0, 0.0, 4.74, 5.26, 1.38, 1.38, segs=8, tint=(0.35, 0.34, 0.32))
        for i in range(8):
            a = i * math.pi / 4.0
            b.box_z("darkwood", math.cos(a) * 1.48, math.sin(a) * 1.48, 4.46, 5.46, 0.16, 0.16, rot_z=a)
        b.cylinder("darkwood", 0.0, 0.0, 5.26, 5.48, 1.58, 1.58, segs=8)
        # Iconic conical ribbed golden-oak wooden plank roof (EXACT Image 5 Watch Towers!)
        b.cone("straw", 0.0, 0.0, 5.44, 6.96, 1.74, segs=8, tint=(1.04, 0.88, 0.62), z_grad=0.24)
        for i in range(8):
            a = i * math.pi / 4.0
            b.rod("darkwood", (math.cos(a) * 1.72, math.sin(a) * 1.72, 5.44), (0.0, 0.0, 7.00), 0.068, segs=4)
        b.box("darkwood", 0.0, 0.0, 7.04, 0.22, 0.22, 0.26)
        b.box("iron", 0.0, 0.0, 7.22, 0.10, 0.10, 0.22)
    elif civ == "sun":
        # Tapered warm golden-ochre desert mud-brick watchtower + terracotta base + cedar vigas + woven shade canopy (NO dome!)
        b.tapered_box("brick", 0.0, 0.0, -0.46, 0.62, 2.75, 2.75, 2.38, 2.38, tint=(0.98, 0.90, 0.78))
        b.tapered_box("plaster", 0.0, 0.0, 0.56, 4.42, 2.24, 2.24, 1.84, 1.84, tint=(1.00, 0.96, 0.88), z_grad=0.10)
        for zy in (1.85, 3.25):
            for off in (-0.65, 0.0, 0.65):
                b.box("wood", off, 0.0, zy, 0.13, 2.48, 0.13)
        b.box_z("brick", 0.0, 0.0, 4.38, 4.66, 2.62, 2.62, tint=(0.98, 0.90, 0.78))
        b.box_z("team", 0.0, 0.0, 4.64, 4.94, 2.66, 2.66)
        for sx in (-1.12, 1.12):
            for sy in (-1.12, 1.12):
                b.box_z("wood", sx, sy, 4.60, 5.95, 0.16, 0.16)
        b.lean_roof("canvas", 0.0, 0.0, 5.88, 6.26, 2.90, 2.90, high_side="+y", thick=0.12)
        b.banner_pole(1.12, -1.12, 4.88, 7.10, flag_w=0.78, flag_h=0.45, dir_x=1.0)
    else:
        # Nordic stone-and-log tower + wide wooden lookout deck hung with round team shields + steep shingled roof!
        b.cylinder("stoneDark", 0.0, 0.0, -0.46, 1.45, 1.46, 1.24, segs=8)
        b.cylinder("wood", 0.0, 0.0, 1.38, 4.25, 1.22, 1.12, segs=8, tint=(0.94, 0.88, 0.78))
        b.moss(-0.90, -0.55, 0.02, sx=0.72, sy=0.66, sz=1.75)
        b.box_z("darkwood", 0.0, 0.0, 4.20, 4.48, 2.75, 2.75)
        for side in (-1.0, 1.0):
            for off in (-0.70, 0.0, 0.70):
                b.box("team", off, side * 1.40, 4.74, 0.52, 0.10, 0.52)
                b.box("team", side * 1.40, off, 4.74, 0.10, 0.52, 0.52)
        for sx in (-1.18, 1.18):
            for sy in (-1.18, 1.18):
                b.box_z("darkwood", sx, sy, 4.44, 5.45, 0.18, 0.18)
        b.cone("straw", 0.0, 0.0, 5.38, 7.25, 1.92, segs=6, tint=(0.92, 0.86, 0.76))
        b.banner_pole(0.0, 0.0, 7.10, 8.15, flag_w=0.72, flag_h=0.42, dir_x=1.0)
    return b.finalize(col)


def build_feudal_barracks(civ, mats, col):
    """Exact AoE II:DE Feudal Barracks (Image 1 top-center!):
    2-story garrison hall + stone & timber fortified gate-porch + raised wooden training balcony with railings!"""
    key = f"building:barracks:{civ}:1"
    b = PartBuilder(key, mats)
    if civ == "alder":
        _feudal_alder_shell(b, 0.0, 0.95, 4.45, 2.45, 3.35, cobble_h=0.78, x_brace=True, moss=True, team_trim=True)
        _shaggy_thatch_roof(b, 0.0, 0.95, 3.28, 5.15, 3.15, 1.62, along_y=False, team_gable=True)
        b.box_z("stoneDark", -1.45, -1.25, -0.46, 2.15, 1.75, 1.45)
        b.box_z("wood", -1.45, -1.25, 2.08, 2.26, 1.92, 1.62)
        b.box_z("darkwood", -1.45, -1.96, 0.02, 1.56, 0.88, 0.14)
        for sx in (-2.05, -0.85):
            b.box_z("team", sx, -1.98, 0.55, 1.65, 0.24, 0.12)
        b.box_z("stoneDark", 0.92, -1.15, -0.46, 0.82, 2.65, 1.85)
        b.box_z("wood", 0.92, -1.15, 0.78, 0.96, 2.75, 1.95)
        for ix in range(-3, 4):
            b.box_z("darkwood", 0.92 + ix * 0.38, -2.02, 0.94, 1.72, 0.11, 0.11)
        b.box("darkwood", 0.92, -2.02, 1.72, 2.75, 0.14, 0.12)
        b.box("darkwood", 2.22, -1.15, 1.72, 0.14, 1.92, 0.12)
    elif civ == "sun":
        _feudal_sun_shell(b, 0.0, 0.85, 4.55, 2.65, 3.25, canopy=True)
        b.box_z("plaster", -1.35, -1.25, -0.46, 2.25, 1.85, 1.45, tint=(1.00, 0.96, 0.88))
        b.box_z("brick", -1.35, -1.25, 2.18, 2.48, 1.94, 1.54, tint=(0.98, 0.90, 0.78))
        b.box_z("darkwood", -1.35, -1.96, 0.02, 1.62, 0.88, 0.14)
        b.box_z("plaster", 0.95, -1.15, -0.46, 1.15, 2.55, 1.85, tint=(1.00, 0.96, 0.88))
        b.box("team", 0.95, -2.02, 1.18, 2.58, 0.14, 0.22)
    else:
        _feudal_raven_shell(b, 0.0, 0.85, 4.45, 2.45, 2.75, 1.95, along_y=False, shields=True)
        b.box_z("wood", -1.40, -1.25, -0.46, 2.15, 1.75, 1.45, tint=(0.94, 0.88, 0.78))
        b.box_z("wood", 0.92, -1.15, -0.46, 0.96, 2.70, 1.85)
        for ix in range(-3, 4):
            b.box_z("darkwood", 0.92 + ix * 0.38, -2.00, 0.94, 1.74, 0.11, 0.11)
        b.box("darkwood", 0.92, -2.00, 1.74, 2.72, 0.14, 0.12)
    ftris = b.banner_pole(2.15, -1.95, 0.96, 4.45, flag_w=0.86, flag_h=0.48, dir_x=1.0, col=col)
    root, tris = b.finalize(col)
    return root, tris + ftris


def build_feudal_stable(civ, mats, col):
    """Exact AoE II:DE Feudal Stable (Image 1 center-right!):
    Wide thatched half-timber barn with hay on the eaves + open-front horse-stall arcade!"""
    key = f"building:stable:{civ}:1"
    b = PartBuilder(key, mats)
    if civ == "alder":
        _feudal_alder_shell(b, 0.0, 0.55, 4.40, 2.55, 2.45, cobble_h=0.58, x_brace=True, moss=True, team_trim=True)
        _shaggy_thatch_roof(b, 0.0, 0.05, 2.18, 5.10, 4.45, 1.72, along_y=False, team_gable=True, hay_eaves=True)
    elif civ == "sun":
        _feudal_sun_shell(b, 0.0, 0.65, 4.45, 2.55, 2.85, canopy=False)
        _feudal_pavilion(b, "sun", 0.0, -1.30, 4.45, 1.75, h=2.05, along_y=False)
    else:
        _feudal_raven_shell(b, 0.0, 0.55, 4.40, 2.55, 2.35, 1.85, along_y=False, shields=True)
        _feudal_pavilion(b, "raven", 0.0, -1.35, 4.35, 1.65, h=1.92, along_y=False)

    # Open front wooden horse-stall arcade posts, stall dividers & golden hay trough!
    for px in (-2.05, -0.70, 0.70, 2.05):
        b.box_z("darkwood", px, -1.92, -0.46, 2.20, 0.18, 0.18)
        b.box_z("wood", px, -1.25, -0.10, 1.15, 0.12, 1.35)
    b.box("team", 0.0, -1.94, 2.12, 4.35, 0.14, 0.18)
    b.hay_stack(2.25, -1.45, -0.04, r=0.58, h=0.84)
    b.box_z("wood", -1.35, -1.85, 0.0, 0.50, 0.95, 0.42)
    b.box_z("grain", -1.35, -1.85, 0.40, 0.58, 0.82, 0.32)
    return b.finalize(col)


def build_feudal_range(civ, mats, col):
    """Exact AoE II:DE Feudal Archery Range (Image 1 right-center!):
    Thatched archery hall + wooden shooting platform + 3 prominent round straw bullseye targets cleanly IN FRONT of backstop!"""
    key = f"building:range:{civ}:1"
    b = PartBuilder(key, mats)
    if civ == "alder":
        _feudal_alder_shell(b, 0.45, 0.95, 3.65, 2.35, 2.38, cobble_h=0.58, x_brace=True, moss=True, team_trim=True)
        _shaggy_thatch_roof(b, 0.45, 0.95, 2.30, 4.35, 3.05, 1.52, along_y=False, team_gable=True)
    elif civ == "sun":
        _feudal_sun_shell(b, 0.45, 0.95, 3.75, 2.45, 2.75, canopy=True)
    else:
        _feudal_raven_shell(b, 0.45, 0.95, 3.65, 2.35, 2.18, 1.78, along_y=False, shields=True)

    # Raised wooden shooting gallery platform on left
    b.box_z("wood", -1.80, 0.40, -0.46, 0.74, 1.35, 2.85)
    b.box("darkwood", -2.40, 0.40, 1.36, 0.12, 2.85, 0.12)
    # Wooden target backstop fence BEHIND the 3 targets + low open shooting rail in front (EXACT Image 1!)
    b.box_z("wood", 0.35, -0.82, -0.46, 1.65, 3.65, 0.16)
    b.box("team", 0.35, -0.84, 1.58, 3.70, 0.20, 0.20)
    for tx in (-0.85, 0.35, 1.55):
        _archery_target(b, tx, -1.42, z0=-0.04)
    # Low front shooting rail framing the courtyard without blocking the targets
    for rx in (-1.35, 0.35, 2.05):
        b.box_z("darkwood", rx, -2.25, -0.46, 0.72, 0.12, 0.12)
    b.box("darkwood", 0.35, -2.25, 0.62, 3.55, 0.10, 0.10)
    b.barrel(-1.80, -1.55, 0.0, r=0.22, h=0.52)
    return b.finalize(col)


def build_feudal_blacksmith(civ, mats, col):
    """Exact AoE II:DE Feudal Blacksmith (Image 1 far right!):
    Thatched forge workshop + TALL EXTERNAL STONE CHIMNEY with glowing orange forge mouth + open smithy lean-to & anvil!"""
    key = f"building:blacksmith:{civ}:1"
    b = PartBuilder(key, mats)
    if civ == "alder":
        _feudal_alder_shell(b, 0.55, 0.45, 3.35, 2.55, 2.35, cobble_h=0.62, x_brace=True, moss=True, team_trim=True)
        _shaggy_thatch_roof(b, 0.55, 0.45, 2.28, 4.05, 3.25, 1.52, along_y=False, team_gable=True)
    elif civ == "sun":
        _feudal_sun_shell(b, 0.55, 0.45, 3.45, 2.65, 2.75, canopy=False)
    else:
        _feudal_raven_shell(b, 0.55, 0.45, 3.35, 2.55, 2.20, 1.75, along_y=False, shields=True)

    # ICONIC TALL EXTERNAL STONE FORGE CHIMNEY on front-left with glowing orange furnace mouth!
    b.tapered_box("stone", -1.48, -0.15, -0.46, 1.85, 1.28, 1.28, 0.88, 0.88)
    b.tapered_box("stoneDark", -1.48, -0.15, 1.78, 4.55, 0.86, 0.86, 0.58, 0.58)
    b.box("stone", -1.48, -0.15, 4.62, 0.72, 0.72, 0.16)
    b.box("team", -1.48, -0.15, 1.52, 0.96, 0.96, 0.18)
    b.box("glow", -1.48, -0.76, 0.68, 0.58, 0.18, 0.58)
    b.box("glow", -1.48, -0.15, 4.72, 0.34, 0.34, 0.08)

    b.cylinder("darkwood", -0.95, -1.65, -0.46, 1.72, 0.09, 0.08, segs=5)
    b.cylinder("darkwood", 0.95, -1.65, -0.46, 1.72, 0.09, 0.08, segs=5)
    b.lean_roof("wood", 0.0, -1.25, 1.65, 2.15, 2.35, 1.25, high_side="+y", thick=0.10)
    b.cylinder("trunk", 0.0, -1.35, -0.10, 0.68, 0.26, 0.24, segs=6)
    b.box("iron", 0.0, -1.35, 0.86, 0.68, 0.28, 0.26)
    b.box("steel", 0.34, -1.35, 0.90, 0.24, 0.16, 0.14)
    b.barrel(-0.68, -1.42, 0.0, r=0.22, h=0.52)
    b.crate(0.85, -1.35, 0.0, s=0.52)
    return b.finalize(col)


def build_feudal_market(civ, mats, col):
    """Exact AoE II:DE Feudal Market (Image 1 far left!):
    Main thatched merchant hall with raised porch & fruit baskets + 2 flanking thatched market stalls!"""
    key = f"building:market:{civ}:1"
    b = PartBuilder(key, mats)
    if civ == "alder":
        _feudal_alder_shell(b, -0.45, 0.95, 3.65, 2.35, 2.65, cobble_h=0.68, x_brace=True, moss=True, team_trim=True)
        _shaggy_thatch_roof(b, -0.45, 0.95, 2.58, 4.35, 3.05, 1.56, along_y=False, team_gable=True)
    elif civ == "sun":
        _feudal_sun_shell(b, -0.45, 0.95, 3.75, 2.45, 2.95, canopy=True)
    else:
        _feudal_raven_shell(b, -0.45, 0.95, 3.65, 2.35, 2.35, 1.82, along_y=False, shields=True)

    b.box_z("wood", -0.45, -0.68, -0.46, 0.56, 3.45, 1.15)
    b.box("fruit", -1.25, -0.78, 0.72, 0.56, 0.42, 0.34)
    b.box("grain", -0.45, -0.78, 0.72, 0.58, 0.42, 0.34)
    b.box("team", 0.38, -0.78, 0.72, 0.56, 0.42, 0.32)

    _feudal_pavilion(b, civ, -1.45, -1.75, 1.95, 1.25, h=1.42, along_y=False)
    _feudal_pavilion(b, civ, 1.65, -0.85, 1.65, 1.75, h=1.48, along_y=True)
    b.box("fruit", -1.65, -1.75, 0.24, 0.52, 0.42, 0.44)
    b.box("grain", -1.10, -1.75, 0.24, 0.48, 0.42, 0.44)
    b.barrel(1.55, -0.65, 0.0, r=0.22, h=0.52)
    b.crate(1.85, -1.15, 0.0, s=0.48)
    return b.finalize(col)


def build_feudal_mill(civ, mats, col):
    """Exact AoE II:DE Feudal Mill (Image 5 lower-center!):
    Cozy timber-and-stone millhouse + rounded shaggy thatch turret dome +
    4 CHUNKY TRAPEZOIDAL WOOD-LATTICE & CANVAS SPINNING SAILS (`windmill = True`, min.y > 2.45m)!"""
    key = f"building:mill:{civ}:1"
    b = PartBuilder(key, mats)
    if civ == "alder":
        # Ground-floor rustic stone-and-timber mill base + octagonal half-timber shaft + shaggy rounded reed-thatch dome!
        b.tapered_box("stoneDark", 0.0, 0.25, -0.46, 1.15, 3.05, 2.85, 2.55, 2.45)
        b.box_z("wood", 0.0, 0.25, 1.08, 2.55, 2.48, 2.35, tint=(0.94, 0.86, 0.74))
        b.cylinder("plaster", 0.0, 0.25, 2.25, 4.05, 1.34, 1.18, segs=8, tint=(0.98, 0.95, 0.88))
        for i in range(8):
            a = i * math.pi / 4.0
            b.box_z("darkwood", math.cos(a) * 1.30, 0.25 + math.sin(a) * 1.30, 1.12, 4.08, 0.15, 0.15, rot_z=a)
        b.cylinder("darkwood", 0.0, 0.25, 2.52, 2.68, 1.40, 1.40, segs=8)
        b.cylinder("team", 0.0, 0.25, 3.82, 4.04, 1.30, 1.30, segs=8)
        # Rounded shaggy dark-golden reed thatch turret dome cap (matches AoE2 Feudal Windmill!)
        b.cylinder("straw", 0.0, 0.25, 3.98, 4.52, 1.54, 1.36, segs=8, tint=(0.76, 0.68, 0.54))
        b.cylinder("straw", 0.0, 0.25, 4.46, 4.92, 1.38, 0.96, segs=8, tint=(0.92, 0.84, 0.68))
        b.cone("straw", 0.0, 0.25, 4.86, 5.42, 1.00, segs=8, tint=(1.00, 0.92, 0.76))
        # Cozy side thatch porch awning over grain sacks
        _shaggy_thatch_roof(b, 1.32, 0.35, 1.65, 1.45, 1.85, 0.76, along_y=True, team_gable=False)
        b.moss(-1.32, -0.78, -0.02, sx=0.70, sy=0.68, sz=1.45)
        b.moss(1.20, 1.02, -0.02, sx=0.60, sy=0.60, sz=1.15)
    elif civ == "sun":
        b.tapered_box("brick", 0.0, 0.25, -0.46, 0.68, 3.05, 2.95, 2.72, 2.62, tint=(0.98, 0.90, 0.78))
        b.tapered_box("plaster", 0.0, 0.25, 0.62, 4.35, 2.65, 2.55, 2.02, 2.02, tint=(1.00, 0.96, 0.88))
        b.box("team", 0.0, 0.25, 4.10, 2.18, 2.18, 0.24)
        b.box_z("brick", 0.0, 0.25, 4.28, 4.72, 2.14, 2.14, tint=(0.98, 0.90, 0.78))
    else:
        b.tapered_box("stoneDark", 0.0, 0.25, -0.46, 1.25, 3.05, 2.95, 2.50, 2.45)
        b.cylinder("wood", 0.0, 0.25, 1.18, 4.15, 1.40, 1.18, segs=8, tint=(0.94, 0.88, 0.78))
        b.cone("straw", 0.0, 0.25, 4.08, 5.55, 1.56, segs=6, tint=(0.88, 0.80, 0.66))
        b.box("team", 0.0, 0.25, 3.92, 2.38, 2.38, 0.22)

    # Front rotor mount bearing + axle protruding cleanly forward (hub at Blender (0, -1.68, 4.25) -> Three.js (0, 4.25, +1.68))
    b.box("darkwood", 0.0, -1.08, 4.25, 0.44, 1.25, 0.44)
    b.cylinder("iron", 0.0, -1.64, 4.08, 4.42, 0.22, 0.22, segs=6)
    # Grain sacks & barrels around mill base
    for gx, gy in ((1.52, -0.78), (1.84, -0.32), (-1.58, -0.82)):
        b.cylinder("canvas", gx, gy, -0.10, 0.68, 0.30, 0.22, segs=6)
    b.barrel(1.55, 0.78, 0.0, r=0.24, h=0.56)

    root, tris = b.finalize(col)

    # CHUNKY ICONIC AO2 4-BLADE TRAPEZOIDAL WOOD-LATTICE & CANVAS SPINNING SAIL ROTOR (`windmill = True`)!
    # Hub at z=4.25 with radius 1.78m -> min.y >= 2.47m (clears ground cleanly!) and y=-1.74 clears turret front by >0.35m!
    rotor = bpy.data.objects.new(f"{key}:rotor", None)
    rotor["windmill"] = True
    rotor.location = (0.0, -1.74, 4.25)
    rotor.parent = root
    col.objects.link(rotor)
    rb = PartBuilder(f"{key}:rotor", mats, parent=rotor)
    rb.box("iron", 0.0, 0.0, 0.0, 0.44, 0.26, 0.44)
    for k in range(4):
        ang = k * math.pi * 0.5 + math.pi * 0.25
        ca, sa = math.cos(ang), math.sin(ang)
        sx_n, sz_n = -sa, ca
        # Sturdy dark-oak sail spar (radius 1.76m -> 3.52m bold trapezoidal wheel!)
        rb.rod("darkwood", (0.0, 0.0, 0.0), (ca * 1.76, 0.0, sa * 1.76), 0.072, segs=4)
        # Wide fan-shaped trapezoidal canvas sail (flares wider toward tip like Image 5!)
        bm = rb._bm("canvas")
        stations = ((0.38, 0.26, 0.44), (0.86, 0.32, 0.64), (1.32, 0.36, 0.80), (1.72, 0.40, 0.92))
        ht = 0.036
        for idx_s in range(len(stations) - 1):
            d0, w0_l, w0_r = stations[idx_s]
            d1, w1_l, w1_r = stations[idx_s + 1]
            # Build trapezoidal canvas panel with subtle wooden lattice frame bars
            corners_f = [
                (ca * d0 - sx_n * w0_l, -ht, sa * d0 - sz_n * w0_l),
                (ca * d0 + sx_n * w0_r, -ht, sa * d0 + sz_n * w0_r),
                (ca * d1 + sx_n * w1_r, -ht, sa * d1 + sz_n * w1_r),
                (ca * d1 - sx_n * w1_l, -ht, sa * d1 - sz_n * w1_l),
            ]
            corners_b = [(x, ht, z) for x, _, z in corners_f]
            vf = [bm.verts.new(p) for p in corners_f]
            vb = [bm.verts.new(p) for p in corners_b]
            faces = [
                bm.faces.new((vf[0], vf[1], vf[2], vf[3])),
                bm.faces.new((vb[3], vb[2], vb[1], vb[0])),
                bm.faces.new((vf[0], vb[0], vb[1], vf[1])),
                bm.faces.new((vf[1], vb[1], vb[2], vf[2])),
                bm.faces.new((vf[2], vb[2], vb[3], vf[3])),
                bm.faces.new((vf[3], vb[3], vb[0], vf[0])),
            ]
            shade = 0.92 + idx_s * 0.04
            rb._paint_faces(bm, faces, tint=(shade, shade * 0.94, shade * 0.82))
            rb.rod("darkwood", (ca * d1 - sx_n * w1_l, -0.02, sa * d1 - sz_n * w1_l),
                   (ca * d1 + sx_n * w1_r, -0.02, sa * d1 + sz_n * w1_r), 0.042, segs=4)
        # Outer dark-oak sail edge rails framing the fan paddle
        rb.rod("darkwood", (ca * 0.38 - sx_n * 0.26, -0.02, sa * 0.38 - sz_n * 0.26),
               (ca * 1.72 - sx_n * 0.40, -0.02, sa * 1.72 - sz_n * 0.40), 0.042, segs=4)
        rb.rod("darkwood", (ca * 0.38 + sx_n * 0.44, -0.02, sa * 0.38 + sz_n * 0.44),
               (ca * 1.72 + sx_n * 0.92, -0.02, sa * 1.72 + sz_n * 0.92), 0.042, segs=4)
    _, r_tris = rb.finalize(col, link_root=False)
    return root, tris + r_tris


def build_feudal_camp(civ, mats, col):
    """Exact AoE II:DE Feudal Lumber Camp (Image 1 top-right!): upgraded A-frame timber hoist crane + lumber pile!"""
    key = f"building:camp:{civ}:1"
    b = PartBuilder(key, mats)
    _timber_crane(b, -0.55, 0.30, scale=1.22, team_cloth=True)
    for i, zc in enumerate((0.20, 0.50, 0.78)):
        for oy in (-0.36, 0.0, 0.36):
            if i == 2 and abs(oy) > 0.1:
                continue
            b.box("wood", 1.05, -0.55 + oy, zc, 2.15, 0.25, 0.25, tint=(0.90 + i * 0.05, 0.82, 0.70))
    b.box("wood", 0.95, 0.85, 0.22, 1.75, 0.82, 0.26, rot_z=0.12)
    b.barrel(-1.45, -1.05, 0.0, r=0.22, h=0.52)
    b.moss(-1.75, 1.05, -0.02, sx=0.58, sy=0.56, sz=0.52)
    return b.finalize(col)


def build_feudal_mine(civ, mats, col):
    """Exact AoE II:DE Feudal Mining Camp (Image 1 right!): open timber ore-sorting shed, mine cart, boulders & gold."""
    key = f"building:mine:{civ}:1"
    b = PartBuilder(key, mats)
    _feudal_pavilion(b, civ, -0.45, 0.45, 2.55, 2.15, h=1.82, along_y=False)
    for ox, oy, r, h, role in [
        (1.25, 0.55, 0.64, 0.78, "stoneDark"),
        (1.55, -0.18, 0.48, 0.60, "stone"),
        (1.05, -0.62, 0.38, 0.46, "gold"),
        (0.55, 0.95, 0.34, 0.42, "gold"),
    ]:
        b.cone(role, ox, oy, -0.14, 0.02 + h, r, segs=6)
    b.box_z("wood", -0.55, -1.05, 0.08, 0.68, 1.25, 0.74)
    b.box_z("stone", -0.55, -1.05, 0.56, 0.82, 1.02, 0.54)
    b.crate(-1.55, -0.95, 0.0, s=0.52)
    return b.finalize(col)


def build_feudal_dock(civ, mats, col):
    """Exact AoE II:DE Feudal Dock (Image 5 top-left!):
    Compact cargo-packed wooden waterfront wharf + sturdy 3m front jetty (ZERO ship overlap!),
    crowded stacked barrels, crates, draped fishing nets, harbor crane, fluttering pennant & regional boathouse!"""
    key = f"building:dock:{civ}:1"
    b = PartBuilder(key, mats)
    # Compact heavy wooden wharf deck on deep water pilings (5.6 x 5.2m, pilings to -2.20m)
    for px in (-2.50, -1.25, 0.0, 1.25, 2.50):
        for py in (-2.25, -0.75, 0.75, 2.25):
            b.cylinder("darkwood", px, py, -2.20, 0.68, 0.18, 0.16, segs=6)
    b.box_z("wood", 0.0, 0.0, 0.18, 0.54, 5.65, 5.20, tint=(0.94, 0.86, 0.74))
    b.box("team", 0.0, -2.62, 0.38, 5.68, 0.13, 0.22)
    b.box("team", 0.0, 2.62, 0.38, 5.68, 0.13, 0.22)
    b.box("team", 2.84, 0.0, 0.38, 0.13, 5.24, 0.22)

    # Raised thatched/regional harbor boathouse at rear-left of wharf
    if civ == "alder":
        _feudal_alder_shell(b, -1.00, 0.88, 3.05, 2.35, 2.52, cobble_h=0.66, x_brace=True, moss=True, team_trim=True)
        _shaggy_thatch_roof(b, -1.00, 0.88, 2.48, 3.80, 3.05, 1.54, along_y=False, team_gable=True)
    elif civ == "sun":
        _feudal_sun_shell(b, -1.00, 0.88, 3.15, 2.42, 2.82, canopy=True)
    else:
        _feudal_raven_shell(b, -1.00, 0.88, 3.05, 2.35, 2.28, 1.72, along_y=False, shields=True)

    # Harbor timber derrick hoist crane on front-right wharf corner
    b.cylinder("darkwood", 1.88, -1.68, 0.50, 3.05, 0.12, 0.10, segs=6)
    b.rod("wood", (1.88, -1.68, 2.52), (3.05, -1.15, 3.35), 0.08, segs=5)
    b.rod("canvas", (3.05, -1.15, 3.35), (3.05, -1.15, 1.65), 0.03, segs=4)
    b.crate(3.05, -1.15, 1.15, s=0.44)

    # Crowded dockside cargo: clustered barrels, stacked crates, sacks, produce baskets & bollards (EXACT Image 5!)
    for bx, by in ((1.08, -1.20), (1.60, -1.00), (1.34, -0.52), (-1.78, -1.38), (-1.24, -1.62), (0.62, 1.58), (1.15, 1.65)):
        b.barrel(bx, by, 0.54, r=0.23, h=0.58)
    b.crate(1.58, 0.58, 0.54, s=0.70)
    b.crate(1.48, 1.34, 0.54, s=0.60)
    b.crate(1.56, 0.65, 1.24, s=0.50)
    b.box("fruit", 0.22, -1.38, 0.76, 0.66, 0.50, 0.42)
    b.box("grain", -0.52, -1.48, 0.76, 0.60, 0.46, 0.40)
    ftris = b.banner_pole(2.42, -2.15, 0.54, 4.15, flag_w=0.92, flag_h=0.50, dir_x=1.0, col=col)
    root, tris = b.finalize(col)

    # COMPACT STURDY TIMBER HARBOR PIER (x = 1.65 .. 4.55m -> matches DOCK_PIER_OFFSET=3.1, ZERO ship overlap!)
    pier = bpy.data.objects.new(f"{key}:pier", None)
    pier["dockPier"] = True
    pier.parent = root
    col.objects.link(pier)
    pb = PartBuilder(f"{key}:pier", mats, parent=pier)
    pb.box_z("wood", 3.10, 0.0, 0.18, 0.48, 2.95, 2.90, tint=(0.94, 0.86, 0.74))
    for x in (2.05, 3.25, 4.35):
        for side in (-1.28, 1.28):
            pb.cylinder("darkwood", x, side, -2.20, 1.05, 0.16, 0.145, segs=6)
        pb.rod("darkwood", (x, -1.24, -0.65), (x, 1.24, 0.22), 0.075, segs=4)
    pb.box("team", 3.10, -1.46, 0.36, 2.95, 0.11, 0.20)
    pb.box("team", 3.10, 1.46, 0.36, 2.95, 0.11, 0.20)
    # Draped fishing net off front pilings, barrels, stacked crates, rope coil & glowing pier lantern!
    pb.box("canvas", 4.60, 0.0, -0.05, 0.08, 2.25, 0.84, tint=(0.92, 0.86, 0.74))
    pb.barrel(3.05, 0.82, 0.48, r=0.22, h=0.56)
    pb.barrel(3.55, 0.88, 0.48, r=0.22, h=0.56)
    pb.crate(3.45, -0.78, 0.48, s=0.58)
    pb.crate(3.48, -0.74, 1.06, s=0.42)
    pb.cylinder("canvas", 4.10, 0.56, 0.48, 0.78, 0.30, 0.26, segs=8, tint=(0.96, 0.90, 0.78))
    pb.cylinder("darkwood", 4.35, -1.28, 1.02, 2.15, 0.06, 0.05, segs=5)
    pb.box("glow", 4.35, -1.28, 2.22, 0.22, 0.22, 0.26)
    _, p_tris = pb.finalize(col, link_root=False)
    return root, tris + p_tris + ftris


# ---------------------------------------------------------------------------
# Entry Point
# ---------------------------------------------------------------------------
def main():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True)
    args = parser.parse_args(argv)
    os.makedirs(args.output, exist_ok=True)

    clear_scene()
    mats = init_materials()
    col = bpy.context.scene.collection
    summary = {}

    builders = [
        ("building:wall:palisade", lambda: build_palisade_wall(mats, col)),
        ("building:gate:palisade", lambda: build_palisade_gate(mats, col)),
        ("building:wallcorner:palisade", lambda: build_palisade_corner(mats, col)),
        ("building:wallcorner:stone", lambda: build_stone_corner(mats, col)),
        ("building:wallcorner:fortified", lambda: build_fortified_corner(mats, col)),
        ("building:towncenter:frontier", lambda: build_frontier_towncenter(mats, col)),
        ("building:house:frontier", lambda: build_frontier_house(mats, col)),
        ("building:barracks:frontier", lambda: build_frontier_barracks(mats, col)),
        ("building:mill:frontier", lambda: build_frontier_mill(mats, col)),
        ("building:camp:frontier", lambda: build_frontier_camp(mats, col)),
        ("building:mine:frontier", lambda: build_frontier_mine(mats, col)),
        ("building:dock:frontier", lambda: build_frontier_dock(mats, col)),
    ]

    feudal_fns = [
        ("towncenter", build_feudal_towncenter),
        ("house", build_feudal_house),
        ("barracks", build_feudal_barracks),
        ("mill", build_feudal_mill),
        ("camp", build_feudal_camp),
        ("mine", build_feudal_mine),
        ("range", build_feudal_range),
        ("stable", build_feudal_stable),
        ("blacksmith", build_feudal_blacksmith),
        ("market", build_feudal_market),
        ("tower", build_feudal_tower),
        ("dock", build_feudal_dock),
    ]
    for civ in ("alder", "sun", "raven"):
        for btype, fn in feudal_fns:
            key = f"building:{btype}:{civ}:1"
            builders.append((key, (lambda f=fn, c=civ: f(c, mats, col))))

    total_tris = 0
    for key, make_fn in builders:
        root, tris = make_fn()
        assert root["assetKey"] == key, f"Mismatch {root['assetKey']} vs {key}"
        summary[key] = {"tris": tris}
        total_tris += tris

    glb_path = os.path.join(args.output, "frontier-early-ages-raw.glb")
    bpy.ops.export_scene.gltf(
        filepath=glb_path,
        export_format="GLB",
        export_yup=True,
        export_extras=True,
        export_apply=True,
        export_normals=True,
        export_texcoords=True,
        export_vertex_color="ACTIVE",
        export_materials="EXPORT",
    )
    report = {
        "keys": sorted(summary.keys()),
        "count": len(summary),
        "totalTris": total_tris,
        "summary": summary,
    }
    with open(os.path.join(args.output, "report.json"), "w", encoding="utf-8") as fh:
        json.dump(report, fh, indent=2)
    print(json.dumps({"glb": glb_path, "count": len(summary), "totalTris": total_tris}))


if __name__ == "__main__":
    main()
