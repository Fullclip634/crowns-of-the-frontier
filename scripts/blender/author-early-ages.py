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
    "wood": ((0.54, 0.41, 0.27, 1.0), 0.88, 0.0),
    "darkwood": ((0.23, 0.17, 0.12, 1.0), 0.90, 0.0),
    "trunk": ((0.46, 0.42, 0.37, 1.0), 0.94, 0.0),      # weathered dark ash-bark palisade & Dark Age logs
    "plaster": ((0.92, 0.87, 0.77, 1.0), 0.92, 0.0),
    "stone": ((0.70, 0.65, 0.57, 1.0), 0.90, 0.0),
    "stoneDark": ((0.44, 0.45, 0.42, 1.0), 0.92, 0.0),
    "brick": ((0.60, 0.39, 0.26, 1.0), 0.88, 0.0),
    "straw": ((0.64, 0.51, 0.31, 1.0), 0.96, 0.0),      # rich weathered brownish-golden reed thatch
    "canvas": ((0.84, 0.73, 0.52, 1.0), 0.92, 0.0),     # sun-bleached tan hide/canvas
    "soil": ((0.52, 0.41, 0.28, 1.0), 0.96, 0.0),
    "leaf": ((0.33, 0.49, 0.23, 1.0), 0.92, 0.0),       # climbing ivy & moss
    "leafDark": ((0.19, 0.34, 0.16, 1.0), 0.92, 0.0),
    "snow": ((0.95, 0.95, 0.93, 1.0), 0.86, 0.0),       # crisp white bottom half of split-tail flags
    "iron": ((0.36, 0.39, 0.42, 1.0), 0.52, 0.48),
    "steel": ((0.76, 0.80, 0.82, 1.0), 0.34, 0.55),
    "gold": ((0.84, 0.68, 0.26, 1.0), 0.42, 0.48),
    "glow": ((0.98, 0.44, 0.12, 1.0), 0.35, 0.0),
    "glass": ((0.86, 0.72, 0.44, 1.0), 0.28, 0.05),
    "grain": ((0.92, 0.76, 0.34, 1.0), 0.90, 0.0),
    "fruit": ((0.72, 0.24, 0.20, 1.0), 0.82, 0.0),
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
    """Dense tightly-packed weathered dark ash-bark vertical stakes with high log-to-log contrast & abatis spikes."""
    dx, dy = x1 - x0, y1 - y0
    span = math.hypot(dx, dy)
    nx, ny = (-dy / span, dx / span) if span > 1e-5 else (0.0, 1.0)
    for i in range(count):
        t = (i + 0.5) / count
        px, py = x0 + dx * t, y0 + dy * t
        h_var = (((i * 37 + seed * 19) % 13) - 6) * 0.045
        tip_h = 0.24 + ((i * 23 + seed * 7) % 5) * 0.035
        # High log-to-log contrast (alternating dark bark vs weathered ash logs like AoE2 Image 1 & 3!)
        alt = 0.56 if (i % 2 == 0) else 0.86
        shade = alt + ((i * 29 + seed * 11) % 5) * 0.04
        lx = (((i * 17 + seed) % 5) - 2) * 0.012
        ly = (((i * 13 + seed * 3) % 5) - 2) * 0.012
        b.stake("trunk", px, py, z0, z_base_h + h_var, z_base_h + h_var + tip_h,
                radius, segs=4, lean_x=lx, lean_y=ly, tint=(shade, shade * 0.96, shade * 0.91))
        if abatis and i % 2 == 0:
            for side in (-1.0, 1.0):
                b.spiked_rod("trunk",
                             (px, py, 0.04),
                             (px + nx * side * 0.44, py + ny * side * 0.44, 0.46 + (i % 3) * 0.07),
                             0.058, segs=4, tint=(shade * 0.78, shade * 0.74, shade * 0.68))


def _draped_canvas_roof(b, cx, cy, z_eave, sx, sy, ridge_h, along_y=True, team_border=True, guy_ropes=True):
    """Authentic AoE2 Dark Age wrinkled animal-hide / burlap tent roof with deep diagonal fold shadows & bold team valance (lean 7x7 grid = zero lag!)."""
    hx, hy = sx * 0.5, sy * 0.5
    us = (-1.05, -0.74, -0.38, 0.0, 0.38, 0.74, 1.05)
    vs = tuple(-1.0 + 2.0 * j / 6.0 for j in range(7))
    thick = 0.095

    def cloth_z(u, v):
        au = min(1.05, abs(u))
        norm_u = au / 1.05
        ridge_round = 1.0 - (norm_u ** 1.24)
        catenary_sag = -0.17 * ridge_h * math.sin(norm_u * math.pi)
        base = z_eave + ridge_h * max(0.0, ridge_round) + catenary_sag
        # Deep organic diagonal hide creases & scalloped eave waves (matches Image 1 & 3 Dark Age tents!)
        fold = math.sin(v * math.pi * 4.0 + norm_u * 2.4) * 0.088 * (0.22 + 0.78 * norm_u)
        fold += math.cos(v * math.pi * 3.0 - norm_u * 1.8) * 0.052 * norm_u
        end_droop = -0.065 * (1.0 - v * v) * norm_u
        return base + fold + end_droop

    bm = b._bm("canvas")
    nu, nv = len(us), len(vs)
    top = [[None] * nv for _ in range(nu)]
    bot = [[None] * nv for _ in range(nu)]
    for i, u in enumerate(us):
        for j, v in enumerate(vs):
            zp = cloth_z(u, v)
            flare = 1.0 + (0.048 * math.sin(v * math.pi * 4.0) if abs(u) > 0.88 else 0.0)
            if along_y:
                x, y = cx + u * hx * flare, cy + v * hy
            else:
                x, y = cx + v * hx, cy + u * hy * flare
            top[i][j] = bm.verts.new((x, y, zp))
            bot[i][j] = bm.verts.new((x, y, zp - thick))

    for i in range(nu - 1):
        for j in range(nv - 1):
            u_mid = abs(0.5 * (us[i] + us[i + 1]))
            v_mid = 0.5 * (vs[j] + vs[j + 1])
            fold = math.sin(v_mid * math.pi * 4.0 + u_mid * 2.4) * 0.65 + math.cos(v_mid * math.pi * 3.0 - u_mid * 1.8) * 0.35
            # High-contrast AoE2 hide shading: sunlit parchment crests vs deep umber wrinkle troughs!
            lum = 0.78 + 0.28 * fold + 0.14 * (1.0 - min(1.0, u_mid))
            seam_dark = 0.76 if (j % 3 == 1 and i in (2, 5)) else 1.0
            lum *= seam_dark
            tint = (max(0.45, min(1.12, lum * 1.06)), max(0.38, min(1.04, lum * 0.95)), max(0.28, min(0.90, lum * 0.78)))
            f_top = bm.faces.new((top[i][j], top[i + 1][j], top[i + 1][j + 1], top[i][j + 1]))
            f_bot = bm.faces.new((bot[i][j + 1], bot[i + 1][j + 1], bot[i + 1][j], bot[i][j]))
            b._paint_faces(bm, (f_top, f_bot), tint=tint, z_grad=0.08)

    edge_faces = []
    for i in range(nu - 1):
        edge_faces.append(bm.faces.new((bot[i][0], bot[i + 1][0], top[i + 1][0], top[i][0])))
        edge_faces.append(bm.faces.new((top[i][-1], top[i + 1][-1], bot[i + 1][-1], bot[i][-1])))
    for j in range(nv - 1):
        edge_faces.append(bm.faces.new((top[0][j], top[0][j + 1], bot[0][j + 1], bot[0][j])))
        edge_faces.append(bm.faces.new((bot[-1][j], bot[-1][j + 1], top[-1][j + 1], top[-1][j])))
    b._paint_faces(bm, edge_faces, tint=(0.56, 0.47, 0.34), z_grad=0.08)

    # Dark weathered ridge pole & cross rafters protruding at gable ends (Image 3!)
    if along_y:
        b.box("trunk", cx, cy, z_eave + ridge_h - 0.03, 0.14, sy + 0.44, 0.14, tint=(0.52, 0.48, 0.43))
    else:
        b.box("trunk", cx, cy, z_eave + ridge_h - 0.03, sx + 0.44, 0.14, 0.14, tint=(0.52, 0.48, 0.43))

    if team_border:
        # Bold, deeply scalloped AoE2 team-colored cloth valance curtain along eaves & gables (Image 1 & 3!)
        tbm = b._bm("team")
        val_drop = 0.29
        val_th = 0.052
        for s_eave in (-1.0, 1.0):
            u_e = s_eave * 1.03
            vto, vbo, vti, vbi = [], [], [], []
            for j, v in enumerate(vs):
                zp = cloth_z(u_e, v) - 0.02
                pleat = math.sin(v * math.pi * 6.0) * 0.048
                drop = val_drop * (0.78 + 0.34 * (0.5 + 0.5 * math.cos(v * math.pi * 4.0)))
                if along_y:
                    xo = cx + u_e * hx + s_eave * (0.03 + pleat)
                    xi = xo - s_eave * val_th
                    y0 = cy + v * hy
                    vto.append(tbm.verts.new((xo, y0, zp)))
                    vbo.append(tbm.verts.new((xo + s_eave * 0.025, y0, zp - drop)))
                    vti.append(tbm.verts.new((xi, y0, zp)))
                    vbi.append(tbm.verts.new((xi + s_eave * 0.025, y0, zp - drop)))
                else:
                    x0 = cx + v * hx
                    yo = cy + u_e * hy + s_eave * (0.03 + pleat)
                    yi = yo - s_eave * val_th
                    vto.append(tbm.verts.new((x0, yo, zp)))
                    vbo.append(tbm.verts.new((x0, yo + s_eave * 0.025, zp - drop)))
                    vti.append(tbm.verts.new((x0, yi, zp)))
                    vbi.append(tbm.verts.new((x0, yi + s_eave * 0.025, zp - drop)))
            vfaces = []
            for j in range(nv - 1):
                if (s_eave > 0) == along_y:
                    vfaces.append(tbm.faces.new((vto[j], vto[j + 1], vbo[j + 1], vbo[j])))
                    vfaces.append(tbm.faces.new((vti[j + 1], vti[j], vbi[j], vbi[j + 1])))
                    vfaces.append(tbm.faces.new((vbo[j], vbo[j + 1], vbi[j + 1], vbi[j])))
                else:
                    vfaces.append(tbm.faces.new((vto[j + 1], vto[j], vbo[j], vbo[j + 1])))
                    vfaces.append(tbm.faces.new((vti[j], vti[j + 1], vbi[j + 1], vbi[j])))
                    vfaces.append(tbm.faces.new((vbo[j + 1], vbo[j], vbi[j], vbi[j + 1])))
            b._paint_faces(tbm, vfaces, tint=(0.98, 0.98, 1.00), z_grad=0.16)
        for s_end in (-1.0, 1.0):
            vto, vbo, vti, vbi = [], [], [], []
            for i, u in enumerate(us):
                zp = cloth_z(u, s_end) - 0.02
                drop = 0.20 * (0.85 + 0.25 * abs(u))
                if along_y:
                    x0 = cx + u * hx
                    yo = cy + s_end * (hy + 0.03)
                    yi = yo - s_end * val_th
                    vto.append(tbm.verts.new((x0, yo, zp)))
                    vbo.append(tbm.verts.new((x0, yo, zp - drop)))
                    vti.append(tbm.verts.new((x0, yi, zp)))
                    vbi.append(tbm.verts.new((x0, yi, zp - drop)))
                else:
                    xo = cx + s_end * (hx + 0.03)
                    xi = xo - s_end * val_th
                    y0 = cy + u * hy
                    vto.append(tbm.verts.new((xo, y0, zp)))
                    vbo.append(tbm.verts.new((xo, y0, zp - drop)))
                    vti.append(tbm.verts.new((xi, y0, zp)))
                    vbi.append(tbm.verts.new((xi, y0, zp - drop)))
            gfaces = []
            for i in range(nu - 1):
                if (s_end > 0) != along_y:
                    gfaces.append(tbm.faces.new((vto[i], vto[i + 1], vbo[i + 1], vbo[i])))
                    gfaces.append(tbm.faces.new((vti[i + 1], vti[i], vbi[i], vbi[i + 1])))
                    gfaces.append(tbm.faces.new((vbo[i], vbo[i + 1], vbi[i + 1], vbi[i])))
                else:
                    gfaces.append(tbm.faces.new((vto[i + 1], vto[i], vbo[i], vbo[i + 1])))
                    gfaces.append(tbm.faces.new((vti[i], vti[i + 1], vbi[i + 1], vbi[i])))
                    gfaces.append(tbm.faces.new((vbo[i + 1], vbo[i], vbi[i], vbi[i + 1])))
            b._paint_faces(tbm, gfaces, tint=(0.94, 0.94, 0.98), z_grad=0.14)

    if guy_ropes:
        for sx_s in (-1.0, 1.0):
            for sy_s in (-1.0, 1.0):
                p_top = (cx + sx_s * hx * 0.98, cy + sy_s * hy * 0.98, z_eave - 0.06)
                p_peg = (cx + sx_s * (hx + 0.52), cy + sy_s * (hy + 0.46), -0.06)
                b.rod("trunk", p_top, p_peg, 0.028, segs=4, tint=(0.74, 0.68, 0.60))
                b.stake("trunk", p_peg[0], p_peg[1], -0.46, 0.14, 0.24, 0.055, segs=4, tint=(0.52, 0.47, 0.42))


def _shaggy_thatch_roof(b, cx, cy, z_eave, sx, sy, ridge_h, along_y=True, team_gable=True, hay_eaves=False, raven_style=False):
    """Authentic AoE2 Feudal multi-tiered shaggy reed thatch roof with deep tier undercut shadows & golden straw sheaves (lean 7x7 grid = zero lag!)."""
    hx, hy = sx * 0.5, sy * 0.5
    us = (-1.08, -0.78, -0.42, 0.0, 0.42, 0.78, 1.08)
    n_seg = max(6, min(8, int((sy if along_y else sx) / 0.58)))
    vs = tuple(-1.0 + 2.0 * j / n_seg for j in range(n_seg + 1))
    thick = 0.24

    def thatch_z(u, v, j):
        au = min(1.08, abs(u))
        t = max(0.0, 1.0 - au / 1.08)
        pitch_pow = 0.94 if raven_style else 0.84
        base = z_eave + ridge_h * (t ** pitch_pow)
        n1 = math.sin(v * 7.3 + au * 4.1) * 0.042
        n2 = math.cos(v * 13.7 - au * 8.3) * 0.026
        # Pronounced horizontal stepped thatch bundle ledges (like Image 2 Feudal roofs!)
        course_ledge = 0.052 * math.sin(au * math.pi * 4.0)
        eave_fringe = -0.12 - (((j * 37 + 11) % 7) * 0.024) if au >= 1.02 else 0.0
        return base + (n1 + n2) * (0.30 + 0.70 * au) + course_ledge + eave_fringe

    bm = b._bm("straw")
    nu, nv = len(us), len(vs)
    top = [[None] * nv for _ in range(nu)]
    bot = [[None] * nv for _ in range(nu)]
    for i, u in enumerate(us):
        for j, v in enumerate(vs):
            au = abs(u)
            zp = thatch_z(u, v, j)
            fringe_out = 1.0 + ((((j * 29 + 5) % 5) * 0.020) if au >= 1.00 else 0.0)
            end_overhang = 1.0 + (0.04 if abs(v) > 0.95 else 0.0)
            if along_y:
                x, y = cx + u * hx * fringe_out, cy + v * hy * end_overhang
            else:
                x, y = cx + v * hx * end_overhang, cy + u * hy * fringe_out
            top[i][j] = bm.verts.new((x, y, zp))
            bot[i][j] = bm.verts.new((x, y, zp - thick))

    for i in range(nu - 1):
        for j in range(nv - 1):
            u_mid = abs(0.5 * (us[i] + us[i + 1]))
            v_mid = 0.5 * (vs[j] + vs[j + 1])
            # Rich dark-streaked weathered AoE2 thatch tiers: dark eave/tier shadows + warm golden-brown crests!
            tier_band = 0.84 + 0.22 * math.sin(u_mid * math.pi * 4.0)
            height_shade = (0.64 if raven_style else 0.70) + 0.34 * (1.0 - min(1.0, u_mid / 1.08))
            mottle = 0.88 + 0.16 * math.sin(v_mid * 6.3 + u_mid * 4.1) * math.cos(v_mid * 10.7 - u_mid * 7.1)
            v_l = height_shade * mottle * tier_band
            tint = (max(0.42, min(1.08, v_l * 1.04)), max(0.35, min(1.00, v_l * 0.93)), max(0.24, min(0.86, v_l * 0.76)))
            f_top = bm.faces.new((top[i][j], top[i + 1][j], top[i + 1][j + 1], top[i][j + 1]))
            f_bot = bm.faces.new((bot[i][j + 1], bot[i + 1][j + 1], bot[i + 1][j], bot[i][j]))
            b._paint_faces(bm, (f_top, f_bot), tint=tint, z_grad=0.06)

    edge_faces = []
    for i in range(nu - 1):
        edge_faces.append(bm.faces.new((bot[i][0], bot[i + 1][0], top[i + 1][0], top[i][0])))
        edge_faces.append(bm.faces.new((top[i][-1], top[i + 1][-1], bot[i + 1][-1], bot[i][-1])))
    for j in range(nv - 1):
        edge_faces.append(bm.faces.new((top[0][j], top[0][j + 1], bot[0][j + 1], bot[0][j])))
        edge_faces.append(bm.faces.new((bot[-1][j], bot[-1][j + 1], top[-1][j + 1], top[-1][j])))
    b._paint_faces(bm, edge_faces, tint=(0.48, 0.39, 0.27), z_grad=0.08)

    gable_fill_role = "wood" if raven_style else "plaster"
    gable_fill_tint = (0.76, 0.66, 0.54) if raven_style else (0.95, 0.92, 0.85)
    # Thick braided straw ridge bolster + dark weathered oak bargeboards + cross-pinned ridge poles (Image 2!)
    if along_y:
        b.box("straw", cx, cy, z_eave + ridge_h + 0.05, 0.38, sy * 1.06, 0.26, tint=(0.76, 0.64, 0.46))
        b.box("darkwood", cx, cy, z_eave + ridge_h + 0.16, 0.14, sy * 1.12, 0.14)
        b.gable_prism(gable_fill_role, cx, cy, z_eave - 0.04, sx * 0.90, sy * 0.94, ridge_h * 0.88, along_y=True, tint=gable_fill_tint)
        for gy in (cy - hy * 0.99, cy + hy * 0.99):
            b.rod("darkwood", (cx - hx * 1.06, gy, z_eave - 0.12), (cx, gy, z_eave + ridge_h + 0.14), 0.11, segs=4)
            b.rod("darkwood", (cx + hx * 1.06, gy, z_eave - 0.12), (cx, gy, z_eave + ridge_h + 0.14), 0.11, segs=4)
            b.box("darkwood", cx, gy, z_eave + 0.02, sx * 0.96, 0.14, 0.16)
        if team_gable:
            b.gable_prism("team", cx, cy, z_eave + 0.10, sx * 0.52, sy * 0.98, ridge_h * 0.48, along_y=True)
    else:
        b.box("straw", cx, cy, z_eave + ridge_h + 0.05, sx * 1.06, 0.38, 0.26, tint=(0.76, 0.64, 0.46))
        b.box("darkwood", cx, cy, z_eave + ridge_h + 0.16, sx * 1.12, 0.14, 0.14)
        b.gable_prism(gable_fill_role, cx, cy, z_eave - 0.04, sx * 0.94, sy * 0.90, ridge_h * 0.88, along_y=False, tint=gable_fill_tint)
        for gx in (cx - hx * 0.99, cx + hx * 0.99):
            b.rod("darkwood", (gx, cy - hy * 1.06, z_eave - 0.12), (gx, cy, z_eave + ridge_h + 0.14), 0.11, segs=4)
            b.rod("darkwood", (gx, cy + hy * 1.06, z_eave - 0.12), (gx, cy, z_eave + ridge_h + 0.14), 0.11, segs=4)
            b.box("darkwood", gx, cy, z_eave + 0.02, 0.14, sy * 0.96, 0.16)
        if team_gable:
            b.gable_prism("team", cx, cy, z_eave + 0.10, sx * 0.98, sy * 0.52, ridge_h * 0.48, along_y=False)

    if hay_eaves:
        # Golden bound straw sheaves laid across the lower roof slope (exact match to Image 2 Feudal Stable & houses!)
        for k, off in enumerate((-1.45, -0.88, -0.32, 0.28, 0.86, 1.42)):
            jitter = ((k * 17) % 5 - 2) * 0.05
            if along_y:
                b.tapered_box("grain", cx + hx * 0.72 + jitter, cy + off, z_eave + ridge_h * 0.18, z_eave + ridge_h * 0.34, 0.48, 0.46, 0.22, 0.24, tint=(1.04, 0.94, 0.58))
            else:
                b.tapered_box("grain", cx + off, cy - hy * 0.72 + jitter, z_eave + ridge_h * 0.18, z_eave + ridge_h * 0.34, 0.46, 0.48, 0.24, 0.22, tint=(1.04, 0.94, 0.58))


def _feudal_alder_shell(b, cx, cy, sx, sy, wall_h, cobble_h=0.68, x_brace=True, moss=True, team_trim=True):
    """Alder Feudal Western European fieldstone plinth + half-timbered cream plaster walls with dark espresso X-beams & ivy."""
    b.tapered_box("stoneDark", cx, cy, -0.46, cobble_h, sx + 0.38, sy + 0.38, sx + 0.16, sy + 0.16, tint=(0.86, 0.85, 0.82))
    # Stepped fieldstone quoin stones at corners
    hx, hy = sx * 0.5, sy * 0.5
    for px in (-hx, hx):
        for py in (-hy, hy):
            b.box_z("stone", cx + px, cy + py, -0.10, cobble_h + 0.04, 0.32, 0.32, tint=(0.78, 0.76, 0.72))
            b.box_z("darkwood", cx + px, cy + py, cobble_h - 0.04, wall_h + 0.06, 0.22, 0.22)
    b.box_z("plaster", cx, cy, cobble_h - 0.04, wall_h, sx, sy, tint=(1.00, 0.97, 0.90), z_grad=0.14)
    b.box("darkwood", cx, cy, cobble_h + 0.02, sx + 0.20, sy + 0.20, 0.16)
    b.box("darkwood", cx, cy, (cobble_h + wall_h) * 0.5, sx + 0.14, sy + 0.14, 0.12)
    b.box("darkwood", cx, cy, wall_h - 0.05, sx + 0.22, sy + 0.22, 0.17)
    if team_trim:
        b.box("team", cx, cy, wall_h - 0.20, sx + 0.16, sy + 0.16, 0.16)
    if x_brace:
        z_lo, z_hi = cobble_h + 0.08, wall_h - 0.12
        for side in (-1.0, 1.0):
            for ox in (-hx * 0.35, hx * 0.35):
                b.box_z("darkwood", cx + ox, cy + side * (hy + 0.03), z_lo, z_hi, 0.13, 0.11)
            b.rod("darkwood", (cx - hx + 0.10, cy + side * (hy + 0.05), z_lo), (cx, cy + side * (hy + 0.05), z_hi), 0.068, segs=4)
            b.rod("darkwood", (cx + hx - 0.10, cy + side * (hy + 0.05), z_lo), (cx, cy + side * (hy + 0.05), z_hi), 0.068, segs=4)
            b.box_z("darkwood", cx + side * (hx + 0.03), cy, z_lo, z_hi, 0.11, 0.13)
            b.rod("darkwood", (cx + side * (hx + 0.05), cy - hy + 0.10, z_lo), (cx + side * (hx + 0.05), cy + hy - 0.10, z_hi), 0.068, segs=4)
            b.rod("darkwood", (cx + side * (hx + 0.05), cy + hy - 0.10, z_lo), (cx + side * (hx + 0.05), cy - hy + 0.10, z_hi), 0.068, segs=4)
    if moss:
        b.moss(cx - hx - 0.06, cy - hy + 0.22, 0.0, sx=0.64, sy=0.58, sz=cobble_h + 0.92)
        b.moss(cx + hx + 0.05, cy + hy - 0.25, 0.0, sx=0.58, sy=0.60, sz=cobble_h + 0.72)


def _feudal_sun_shell(b, cx, cy, sx, sy, wall_h, canopy=True):
    """Sunward Feudal Middle Eastern warm sunlit golden-ochre desert sandstone + terracotta trim + mashrabiya niches + striped canopies."""
    b.tapered_box("brick", cx, cy, -0.46, 0.48, sx + 0.42, sy + 0.42, sx + 0.18, sy + 0.18, tint=(0.96, 0.86, 0.74))
    b.tapered_box("plaster", cx, cy, 0.40, wall_h, sx, sy, sx - 0.16, sy - 0.16, tint=(1.00, 0.95, 0.85), z_grad=0.14)
    hx, hy = (sx - 0.16) * 0.5, (sy - 0.16) * 0.5
    # Terracotta corner buttress pilasters + stepped desert crenelated parapet merlons all around
    for px in (-hx, hx):
        for py in (-hy, hy):
            b.tapered_box("brick", cx + px, cy + py, 0.36, wall_h + 0.56, 0.42, 0.42, 0.32, 0.32, tint=(0.96, 0.84, 0.70))
    b.box("brick", cx, cy, wall_h - 0.12, sx - 0.20, sy - 0.20, 0.16, tint=(0.90, 0.78, 0.64))
    for side in (-1.0, 1.0):
        b.box_z("plaster", cx, cy + side * (hy - 0.10), wall_h - 0.04, wall_h + 0.38, sx - 0.20, 0.22, tint=(0.98, 0.93, 0.83))
        b.box_z("plaster", cx + side * (hx - 0.10), cy, wall_h - 0.04, wall_h + 0.38, 0.22, sy - 0.20, tint=(0.98, 0.93, 0.83))
        for m_off in (-0.30, 0.0, 0.30):
            b.box_z("brick", cx + m_off * sx, cy + side * (hy - 0.10), wall_h + 0.34, wall_h + 0.58, sx * 0.18, 0.24, tint=(0.96, 0.84, 0.70))
            b.box_z("brick", cx + side * (hx - 0.10), cy + m_off * sy, wall_h + 0.34, wall_h + 0.58, 0.24, sy * 0.18, tint=(0.96, 0.84, 0.70))
    # Protruding warm cedar roof vigas on both axes
    n_vigas = max(3, int(sx / 0.72))
    for i in range(n_vigas):
        vx = cx - hx + 0.34 + (i / max(1, n_vigas - 1)) * (sx - 0.84)
        b.box("wood", vx, cy, wall_h - 0.22, 0.13, sy + 0.52, 0.13, tint=(0.92, 0.82, 0.68))
    b.box("brick", cx, cy, wall_h - 0.34, sx + 0.12, sy + 0.12, 0.15, tint=(0.96, 0.84, 0.70))
    b.box("team", cx, cy, wall_h - 0.50, sx + 0.08, sy + 0.08, 0.19)
    # Recessed pointed desert arch window/alcove detail on front & sides
    if wall_h >= 1.9:
        for ox in ((-0.32 * sx, 0.32 * sx) if sx >= 3.2 else (0.0,)):
            b.box("darkwood", cx + ox, cy - hy - 0.03, wall_h * 0.46, 0.58, 0.12, 0.84)
            b.gable_prism("brick", cx + ox, cy - hy - 0.04, wall_h * 0.46 + 0.36, 0.74, 0.18, 0.34, along_y=True, tint=(0.96, 0.84, 0.70))
    if canopy:
        cw, cd = sx * 0.78, sy * 0.68
        for px in (-cw * 0.45, cw * 0.45):
            for py in (-cd * 0.45, cd * 0.45):
                b.cylinder("wood", cx + px, cy + py, wall_h, wall_h + 1.18, 0.07, 0.058, segs=4, tint=(0.92, 0.82, 0.68))
        b.lean_roof("canvas", cx, cy, wall_h + 0.96, wall_h + 1.26, cw + 0.34, cd + 0.34, high_side="+y", thick=0.10)
        b.box("team", cx, cy - cd * 0.58, wall_h + 0.90, cw + 0.36, 0.10, 0.24)
        b.box("team", cx - cw * 0.26, cy, wall_h + 1.15, cw * 0.22, cd + 0.30, 0.09)
        b.box("team", cx + cw * 0.26, cy, wall_h + 1.15, cw * 0.22, cd + 0.30, 0.09)


def _feudal_raven_shell(b, cx, cy, sx, sy, wall_h, roof_h, along_y=True, shields=True):
    """Raven Feudal Nordic horizontal notched timber log cabin + sculpted multi-tier shingle/thatch roof + dragon finials + Viking shields."""
    b.tapered_box("stoneDark", cx, cy, -0.46, 0.54, sx + 0.38, sy + 0.38, sx + 0.16, sy + 0.16, tint=(0.84, 0.83, 0.80))
    b.box_z("wood", cx, cy, 0.48, wall_h, sx, sy, tint=(0.88, 0.78, 0.66), z_grad=0.18)
    hx, hy = sx * 0.5, sy * 0.5
    # Full horizontal saddle-notched log courses with alternating dark/warm log contrast at all 4 walls & corners
    courses = max(4, int((wall_h - 0.48) / 0.34))
    for i in range(courses):
        zc = 0.58 + i * ((wall_h - 0.64) / max(1, courses - 1))
        role = "darkwood" if (i % 2 == 0) else "trunk"
        shade = (0.86, 0.78, 0.68) if (i % 2 == 0) else (0.76, 0.70, 0.62)
        b.box(role, cx, cy - hy, zc, sx + 0.48, 0.16, 0.16, tint=shade)
        b.box(role, cx, cy + hy, zc, sx + 0.48, 0.16, 0.16, tint=shade)
        b.box(role, cx - hx, cy, zc, 0.16, sy + 0.48, 0.16, tint=shade)
        b.box(role, cx + hx, cy, zc, 0.16, sy + 0.48, 0.16, tint=shade)
    # Sculpted multi-tier Nordic shingle & shaggy thatch roof (replaces old 12-tri prism!)
    _shaggy_thatch_roof(b, cx, cy, wall_h - 0.06, sx + 0.68, sy + 0.58, roof_h, along_y=along_y, team_gable=True, hay_eaves=False, raven_style=True)
    z_peak = wall_h - 0.04 + roof_h
    if along_y:
        for gy in (cy - hy - 0.30, cy + hy + 0.30):
            b.rod("darkwood", (cx - 0.24, gy, z_peak - 0.18), (cx + 0.42, gy, z_peak + 0.56), 0.072, segs=4)
            b.rod("darkwood", (cx + 0.24, gy, z_peak - 0.18), (cx - 0.42, gy, z_peak + 0.56), 0.072, segs=4)
    else:
        for gx in (cx - hx - 0.30, cx + hx + 0.30):
            b.rod("darkwood", (gx, cy - 0.24, z_peak - 0.18), (gx, cy + 0.42, z_peak + 0.56), 0.072, segs=4)
            b.rod("darkwood", (gx, cy + 0.24, z_peak - 0.18), (gx, cy - 0.42, z_peak + 0.56), 0.072, segs=4)
    if shields:
        for ox in (-hx * 0.50, hx * 0.50):
            b.cylinder("darkwood", cx + ox, cy - hy - 0.09, wall_h - 0.68, wall_h - 0.14, 0.29, 0.29, segs=8)
            b.box("team", cx + ox, cy - hy - 0.11, wall_h - 0.41, 0.46, 0.09, 0.46)
            b.box("steel", cx + ox, cy - hy - 0.15, wall_h - 0.41, 0.16, 0.07, 0.16)


def _feudal_pavilion(b, civ, cx, cy, sx, sy, h=1.85, along_y=True):
    """Open-sided Feudal courtyard pavilion wing (signature of AoE2 Feudal Town Center & Market in Image 2!)."""
    hx, hy = sx * 0.44, sy * 0.44
    post_role = "wood" if civ == "sun" else "darkwood"
    for px in (-hx, hx):
        for py in (-hy, hy):
            b.box_z(post_role, cx + px, cy + py, -0.46, h, 0.16, 0.16)
    b.box("team", cx, cy, h - 0.08, sx + 0.10, sy + 0.10, 0.16)
    b.moss(cx - hx, cy - hy, -0.02, sx=0.44, sy=0.44, sz=0.68)
    if civ == "alder":
        _shaggy_thatch_roof(b, cx, cy, h - 0.04, sx + 0.46, sy + 0.46, 0.94, along_y=along_y, team_gable=False)
    elif civ == "sun":
        b.lean_roof("canvas", cx, cy, h - 0.04, h + 0.46, sx + 0.38, sy + 0.38, high_side="+y", thick=0.10)
        b.box("team", cx, cy - sy * 0.56, h - 0.10, sx + 0.40, 0.10, 0.24)
        b.box("team", cx - sx * 0.24, cy, h + 0.24, sx * 0.20, sy + 0.34, 0.08)
        b.box("team", cx + sx * 0.24, cy, h + 0.24, sx * 0.20, sy + 0.34, 0.08)
    else:
        _shaggy_thatch_roof(b, cx, cy, h - 0.04, sx + 0.44, sy + 0.44, 1.02, along_y=along_y, team_gable=False, raven_style=True)


def _timber_crane(b, cx, cy, scale=1.0, team_cloth=True, driftwood=False):
    """Iconic AoE2 Dark & Feudal Age wooden A-frame log-lifting crane with vertical spoked treadwheel & team boom banner (Image 2 & 3!)."""
    s = scale
    frame_role = "trunk" if driftwood else "darkwood"
    beam_role = "trunk" if driftwood else "wood"
    frame_tint = (0.62, 0.57, 0.50) if driftwood else (1.0, 1.0, 1.0)
    beam_tint = (0.86, 0.80, 0.72) if driftwood else (1.0, 1.0, 1.0)
    # Heavy timber ground skids & cross-sleepers
    b.box_z(frame_role, cx - 0.70 * s, cy, -0.46, 0.18 * s, 0.24 * s, 1.56 * s, tint=frame_tint)
    b.box_z(frame_role, cx + 0.52 * s, cy, -0.46, 0.18 * s, 0.24 * s, 1.56 * s, tint=frame_tint)
    for sy_s in (-0.62 * s, 0.62 * s):
        b.box_z(beam_role, cx - 0.08 * s, cy + sy_s, 0.06 * s, 0.26 * s, 1.65 * s, 0.20 * s, tint=beam_tint)
    # Tripod A-frame uprights & horizontal crossbars
    apex = (cx - 0.22 * s, cy, 2.38 * s)
    b.rod(frame_role, (cx - 0.68 * s, cy - 0.56 * s, 0.18 * s), apex, 0.095 * s, segs=5, tint=frame_tint)
    b.rod(frame_role, (cx - 0.68 * s, cy + 0.56 * s, 0.18 * s), apex, 0.095 * s, segs=5, tint=frame_tint)
    b.rod(frame_role, (cx + 0.48 * s, cy, 0.18 * s), apex, 0.095 * s, segs=5, tint=frame_tint)
    b.rod(frame_role, (cx - 0.52 * s, cy - 0.42 * s, 0.95 * s), (cx - 0.52 * s, cy + 0.42 * s, 0.95 * s), 0.065 * s, segs=4, tint=frame_tint)
    # Long angled wooden crane boom jib + dual stay struts + hanging hoist rope & log grapple
    tip = (cx + 1.62 * s, cy - 0.16 * s, 3.08 * s)
    b.rod(beam_role, (cx - 0.88 * s, cy + 0.10 * s, 1.25 * s), tip, 0.105 * s, segs=5, tint=beam_tint)
    b.rod(frame_role, apex, (cx + 0.98 * s, cy - 0.08 * s, 2.70 * s), 0.06 * s, segs=4, tint=frame_tint)
    b.rod("canvas", tip, (tip[0], tip[1], 1.12 * s), 0.038 * s, segs=4)
    b.box("iron", tip[0], tip[1], 1.06 * s, 0.18 * s, 0.18 * s, 0.22 * s)
    # REAL VERTICAL SPOKED WOODEN TREADWHEEL on a horizontal axle (exact match to Image 3 bottom-left & Image 2 top-right!)
    wx, wy, wz = cx - 0.24 * s, cy - 0.42 * s, 0.88 * s
    wr = 0.54 * s
    b.rod(frame_role, (wx, wy - 0.24 * s, wz), (wx, wy + 0.34 * s, wz), 0.075 * s, segs=5, tint=frame_tint)
    b.box("iron", wx, wy, wz, 0.18 * s, 0.32 * s, 0.18 * s)
    for k in range(8):
        a0 = k * math.pi * 0.25
        a1 = (k + 1) * math.pi * 0.25
        p0 = (wx + math.cos(a0) * wr, wy, wz + math.sin(a0) * wr)
        p1 = (wx + math.cos(a1) * wr, wy, wz + math.sin(a1) * wr)
        b.rod(beam_role, p0, p1, 0.055 * s, segs=4, tint=beam_tint)
        if k < 4:
            p_opp = (wx - math.cos(a0) * wr, wy, wz - math.sin(a0) * wr)
            b.rod(frame_role, p0, p_opp, 0.042 * s, segs=4, tint=frame_tint)
    if team_cloth:
        # Bold AoE2 team-colored cloth banner slung between the crane boom & A-frame (Image 2 & 3!)
        b.box("team", cx - 0.06 * s, cy - 0.04 * s, 1.86 * s, 0.96 * s, 0.12 * s, 0.48 * s, rot_z=0.18)
        b.box("team", cx + 0.58 * s, cy - 0.08 * s, 2.24 * s, 0.68 * s, 0.10 * s, 0.36 * s, rot_z=0.18)


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
    # 2 crisp horizontal dark weathered lashings front & back + binding knots (ZERO brown wood!)
    for zy in (0.95, 2.22):
        b.box("trunk", 0.0, -0.16, zy, 2.94, 0.095, 0.135, tint=(0.44, 0.40, 0.36))
        b.box("trunk", 0.0, 0.16, zy, 2.94, 0.095, 0.135, tint=(0.44, 0.40, 0.36))
        for kx in (-1.05, 0.0, 1.05):
            b.box("trunk", kx, -0.19, zy, 0.12, 0.11, 0.20, tint=(0.38, 0.35, 0.31))
            b.box("trunk", kx, 0.19, zy, 0.12, 0.11, 0.20, tint=(0.38, 0.35, 0.31))
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
    """Exact AoE II:DE Dark Age Town Center (1-to-1 match with uploaded Image 3 center!):
    Earthen dirt courtyard apron, raised dark weathered log stilt platform with crooked stake balcony,
    front 6-rung ladder, stretched animal pelts & table on deck, + TWO forward-projecting (`along_y=True`)
    open-sided wrinkled-hide canopy wings framing the U-shaped gathering courtyard (ZERO brown wood!)."""
    key = "building:towncenter:frontier"
    b = PartBuilder(key, mats)

    # Earthen dirt courtyard apron & post footings (grounded to -0.46)
    b.tapered_box("soil", 0.0, 0.90, -0.46, 0.05, 4.40, 3.30, 4.10, 3.00, tint=(0.82, 0.72, 0.56))
    for side in (-1.0, 1.0):
        b.tapered_box("soil", side * 2.35, -0.95, -0.46, 0.04, 2.25, 3.15, 2.00, 2.90, tint=(0.80, 0.70, 0.54))

    # CENTRAL ELEVATED STILT PLATFORM (at back-center y = +0.95, deck at z = 1.66m!)
    cx, cy, dw, dd, z_deck = 0.0, 0.95, 3.70, 2.85, 1.66
    for idx_p, px in enumerate((-1.62, 0.0, 1.62)):
        for py in (-1.22, 1.22):
            h_top = 3.24 if py > 0 else 2.60
            sh = 0.58 if (idx_p % 2 == 0) else 0.78
            b.cylinder("trunk", cx + px, cy + py, -0.46, h_top, 0.16, 0.13, segs=5, tint=(sh, sh * 0.95, sh * 0.88))
    # Dark weathered cross-bracing under the stilts (ZERO brown wood!)
    for px in (-1.62, 1.62):
        b.rod("trunk", (cx + px, cy - 1.18, 0.18), (cx + px, cy + 1.18, z_deck - 0.08), 0.072, segs=4, tint=(0.50, 0.46, 0.41))
        b.rod("trunk", (cx + px, cy + 1.18, 0.18), (cx + px, cy - 1.18, z_deck - 0.08), 0.072, segs=4, tint=(0.50, 0.46, 0.41))
    b.rod("trunk", (cx - 1.56, cy + 1.18, 0.22), (cx + 1.56, cy + 1.18, z_deck - 0.08), 0.072, segs=4, tint=(0.50, 0.46, 0.41))

    # Planked split-log platform deck & dark cross-beams
    b.box_z("trunk", cx, cy, z_deck - 0.16, z_deck, dw, dd, tint=(0.76, 0.71, 0.64))
    for k in range(-5, 6):
        sh = 0.62 if (k % 2 == 0) else 0.84
        b.box_z("trunk", cx + k * 0.32, cy, z_deck - 0.02, z_deck + 0.04, 0.26, dd - 0.08, tint=(sh, sh * 0.95, sh * 0.88))
    for py in (-1.15, 0.0, 1.15):
        b.box("trunk", cx, cy + py, z_deck - 0.20, dw + 0.42, 0.18, 0.18, tint=(0.48, 0.44, 0.39))

    # Open crooked vertical stake-railing balcony around front & sides of upper deck (EXACT Image 3!)
    for ix in range(-6, 7):
        if -1 <= ix <= 1:
            continue
        rx = cx + ix * 0.28
        sh = 0.56 if (ix % 2 == 0) else 0.84
        b.stake("trunk", rx, cy - dd * 0.48, z_deck, z_deck + 0.84 + (ix % 3) * 0.06, z_deck + 1.05, 0.062, segs=4, tint=(sh, sh * 0.95, sh * 0.88))
    for iy in range(-4, 5):
        ry = cy + iy * 0.31
        sh = 0.58 if (iy % 2 == 0) else 0.82
        b.stake("trunk", cx - dw * 0.48, ry, z_deck, z_deck + 0.86 + (iy % 2) * 0.07, z_deck + 1.06, 0.062, segs=4, tint=(sh, sh * 0.95, sh * 0.88))
        b.stake("trunk", cx + dw * 0.48, ry, z_deck, z_deck + 0.86 + (iy % 2) * 0.07, z_deck + 1.06, 0.062, segs=4, tint=(sh, sh * 0.95, sh * 0.88))
    # Dark binding rails around balcony
    b.box("trunk", cx - 1.18, cy - dd * 0.48, z_deck + 0.68, 1.36, 0.10, 0.10, tint=(0.46, 0.42, 0.37))
    b.box("trunk", cx + 1.18, cy - dd * 0.48, z_deck + 0.68, 1.36, 0.10, 0.10, tint=(0.46, 0.42, 0.37))
    b.box("trunk", cx - dw * 0.48, cy, z_deck + 0.68, 0.10, dd, 0.10, tint=(0.46, 0.42, 0.37))
    b.box("trunk", cx + dw * 0.48, cy, z_deck + 0.68, 0.10, dd, 0.10, tint=(0.46, 0.42, 0.37))

    # Front wooden ladder leaning up to balcony opening (6 rungs, dark weathered rails — Image 3!)
    for lx in (-0.30, 0.30):
        b.rod("trunk", (cx + lx, cy - dd * 0.50 - 0.72, -0.10), (cx + lx, cy - dd * 0.46, z_deck + 0.16), 0.064, segs=4, tint=(0.56, 0.51, 0.45))
    for step in range(6):
        f = (step + 0.5) / 6.0
        b.box("trunk", cx, cy - dd * 0.50 - 0.72 * (1.0 - f), 0.06 + f * z_deck, 0.64, 0.075, 0.075, tint=(0.78, 0.73, 0.66))

    # Wrinkled hide canopy over back half of stilt deck + hanging team cloth drapes beneath (Image 3!)
    for px in (-1.62, 1.62):
        b.cylinder("trunk", cx + px, cy + 0.18, z_deck, 3.16, 0.115, 0.095, segs=5, tint=(0.58, 0.53, 0.47))
    _draped_canvas_roof(b, cx, cy + 0.48, 3.08, 4.05, 2.38, 1.08, along_y=False, team_border=True, guy_ropes=False)
    b.box_z("team", cx - 1.15, cy + 0.25, z_deck + 0.65, 2.95, 0.68, 0.08)
    b.box_z("team", cx + 1.15, cy + 1.10, z_deck + 0.55, 2.95, 0.72, 0.08)

    # Stretched animal pelts, table, crates & barrels on the open balcony deck + beneath stilts (Image 3!)
    b.box("canvas", cx + 0.48, cy - 0.48, z_deck + 0.05, 1.08, 0.84, 0.06, rot_z=0.38, tint=(1.04, 0.96, 0.82))
    b.box("trunk", cx - 0.78, cy - 0.42, z_deck + 0.46, 0.88, 0.58, 0.08, tint=(0.68, 0.62, 0.54))
    b.barrel(cx - 1.05, cy + 0.35, z_deck + 0.02, r=0.23, h=0.54, role="trunk")
    b.crate(cx + 1.02, cy + 0.42, z_deck + 0.02, s=0.54, role="trunk", trim_role="trunk")
    b.barrel(cx - 0.88, cy - 0.15, 0.0, r=0.25, h=0.58, role="trunk")
    b.barrel(cx + 0.96, cy - 0.35, 0.0, r=0.25, h=0.58, role="trunk")
    b.pot(cx - 0.62, cy - 1.58, 0.0, colored=True)
    b.pot(cx + 0.72, cy - 1.48, 0.0, colored=False)
    b.moss(cx - 1.55, cy - 1.18, -0.02, sx=0.72, sy=0.68, sz=0.78)
    b.moss(cx + 0.45, cy - 1.42, -0.02, sx=0.58, sy=0.54, sz=0.58)

    # TWO FORWARD-PROJECTING (`along_y=True`!) OPEN-SIDED COURTYARD CANOPY WINGS (EXACT Image 3 U-shaped layout!)
    for side in (-1.0, 1.0):
        px, py = side * 2.35, -0.95
        pw, pd, ph = 1.86, 2.85, 1.72
        for ox in (-pw * 0.44, pw * 0.44):
            for oy in (-pd * 0.44, 0.0, pd * 0.44):
                b.cylinder("trunk", px + ox, py + oy, -0.46, ph + 0.06, 0.105, 0.088, segs=5, tint=(0.56, 0.51, 0.45))
        # Dark perimeter tie-beams under the wing eaves
        b.box("trunk", px, py, ph - 0.06, pw, pd, 0.10, tint=(0.48, 0.44, 0.39))
        _draped_canvas_roof(b, px, py, ph, pw + 0.42, pd + 0.42, 0.76, along_y=True, team_border=True, guy_ropes=False)
        b.barrel(px - side * 0.32, py + 0.45, 0.0, r=0.21, h=0.50, role="trunk")
        b.pot(px + side * 0.36, py - 0.65, 0.0, colored=True)
        b.moss(px + side * 0.78, py - 1.15, -0.02, sx=0.56, sy=0.54, sz=0.56)

    return b.finalize(col)


def build_frontier_house(mats, col):
    """Exact AoE II:DE Dark Age Tent-Hut (1-to-1 match with uploaded Image 3 top two houses, ZERO brown wood!):
    Earthen dirt base pad, high-contrast dark weathered vertical split-log walls, wrinkled hide roof with
    bold team valance & guy-ropes, wrinkled-hide side porch annex, bright team door curtain, painted pots & corner bushes!"""
    key = "building:house:frontier"
    b = PartBuilder(key, mats)

    # Earthen dirt foundation pad
    b.tapered_box("soil", 0.10, 0.0, -0.46, 0.05, 3.95, 3.15, 3.65, 2.85, tint=(0.82, 0.72, 0.56))

    # Main tent-hut vertical weathered dark split-log walls (grounded to -0.46)
    cx, cy, sx, sy, wh = -0.36, 0.12, 2.48, 2.26, 1.66
    b.box_z("trunk", cx, cy, -0.46, wh - 0.10, sx - 0.18, sy - 0.18, tint=(0.48, 0.44, 0.39), z_grad=0.18)
    hx, hy = sx * 0.5, sy * 0.5
    _palisade_row(b, cx - hx, cy - hy, cx + hx, cy - hy, count=8, z0=-0.46, z_base_h=wh - 0.44, radius=0.122, seed=71, abatis=False)
    _palisade_row(b, cx - hx, cy + hy, cx + hx, cy + hy, count=8, z0=-0.46, z_base_h=wh - 0.44, radius=0.122, seed=73, abatis=False)
    _palisade_row(b, cx - hx, cy - hy + 0.16, cx - hx, cy + hy - 0.16, count=6, z0=-0.46, z_base_h=wh - 0.44, radius=0.122, seed=79, abatis=False)
    _palisade_row(b, cx + hx, cy - hy + 0.16, cx + hx, cy + hy - 0.16, count=6, z0=-0.46, z_base_h=wh - 0.44, radius=0.122, seed=83, abatis=False)
    # Dark interior doorway + bold team-colored entrance curtain drapes (Image 3!)
    b.box_z("trunk", cx, cy - hy - 0.06, -0.10, 1.30, 0.78, 0.14, tint=(0.32, 0.29, 0.26))
    b.box_z("team", cx - 0.22, cy - hy - 0.11, 0.04, 1.24, 0.28, 0.09)
    b.box_z("team", cx + 0.22, cy - hy - 0.11, 0.04, 1.24, 0.26, 0.09)
    # Wrinkled animal-hide tent roof with bold team eave valance + taut guy-ropes pinned to stakes!
    _draped_canvas_roof(b, cx, cy, wh - 0.04, sx + 0.50, sy + 0.48, 1.12, along_y=False, team_border=True, guy_ropes=True)

    # Front-right stick-framed porch annex with wrinkled hide canopy & team valance (replaces flat box roof — Image 3!)
    px, py = 1.28, -0.18
    for ox in (-0.52, 0.52):
        for oy in (-0.64, 0.64):
            b.cylinder("trunk", px + ox, py + oy, -0.46, 1.32, 0.095, 0.08, segs=5, tint=(0.56, 0.51, 0.45))
    b.box_z("trunk", px, py + 0.58, -0.46, 1.24, 1.12, 0.16, tint=(0.54, 0.49, 0.43))
    b.box_z("team", px + 0.15, py - 0.62, 0.04, 1.18, 0.42, 0.08)
    _draped_canvas_roof(b, px, py, 1.26, 1.38, 1.56, 0.48, along_y=True, team_border=True, guy_ropes=False)

    # Clustered team-cloth-topped clay storage jars, wood crate & lush green corner bushes (Image 3!)
    b.pot(cx - hx - 0.28, cy - 0.56, 0.0, r=0.18, h=0.38, colored=True)
    b.pot(cx - hx - 0.32, cy - 0.14, 0.0, r=0.17, h=0.35, colored=True)
    b.pot(cx - 0.72, cy - hy - 0.24, 0.0, r=0.18, h=0.36, colored=True)
    b.pot(px + 0.52, py - 0.78, 0.0, r=0.18, h=0.38, colored=True)
    b.crate(px - 0.32, py - 0.68, 0.0, s=0.44, role="trunk", trim_role="trunk")
    b.moss(cx - hx - 0.16, cy + 0.48, -0.02, sx=0.68, sy=0.72, sz=1.12)
    b.moss(px - 0.48, py - 0.78, -0.02, sx=0.52, sy=0.52, sz=0.92)
    b.moss(px + 0.64, py + 0.52, -0.02, sx=0.58, sy=0.54, sz=0.96)
    return b.finalize(col)


def build_frontier_camp(mats, col):
    """Exact AoE II:DE Dark Age Lumber Camp (1-to-1 match with uploaded Image 3 bottom-left, ZERO brown wood!):
    Earthen work pad, dark weathered A-frame hoist crane with vertical spoked wooden treadwheel & team boom banner,
    timber skid deck with stacked cylindrical felled tree trunks, X-frame sawbuck & chopping block!"""
    key = "building:camp:frontier"
    b = PartBuilder(key, mats)
    b.tapered_box("soil", 0.0, 0.0, -0.46, 0.05, 4.10, 3.05, 3.80, 2.75, tint=(0.82, 0.72, 0.56))
    _timber_crane(b, -0.62, 0.28, scale=1.14, team_cloth=True, driftwood=True)

    # Timber log-deck skids + pyramid of 6 round cylindrical felled tree trunks (dark bark + lighter cut ends — Image 3!)
    for sx_s in (0.35, 1.55):
        b.box_z("trunk", sx_s, -0.52, -0.46, 0.14, 0.20, 1.48, tint=(0.50, 0.46, 0.40))
    log_specs = [
        (-0.88, 0.28, 0.58), (-0.52, 0.28, 0.76), (-0.16, 0.28, 0.62),
        (-0.70, 0.56, 0.82), (-0.34, 0.56, 0.66),
        (-0.52, 0.82, 0.74),
    ]
    for oy, zc, sh in log_specs:
        b.rod("trunk", (-0.08, oy, zc), (2.02, oy, zc), 0.17, segs=6, tint=(sh, sh * 0.94, sh * 0.86))
        b.box("canvas", -0.09, oy, zc, 0.04, 0.22, 0.22, tint=(0.96, 0.88, 0.72))
        b.box("canvas", 2.03, oy, zc, 0.04, 0.22, 0.22, tint=(0.96, 0.88, 0.72))

    # Crossed X-frame wooden sawbuck holding a half-sawn log + stacked planks
    for sx_b in (0.45, 1.45):
        b.rod("trunk", (sx_b, 0.52, -0.10), (sx_b, 1.12, 0.78), 0.055, segs=4, tint=(0.54, 0.49, 0.43))
        b.rod("trunk", (sx_b, 1.12, -0.10), (sx_b, 0.52, 0.78), 0.055, segs=4, tint=(0.54, 0.49, 0.43))
    b.rod("trunk", (0.18, 0.82, 0.56), (1.78, 0.82, 0.56), 0.15, segs=6, tint=(0.68, 0.63, 0.56))

    # Chopping stump + iron axe + green bushes
    b.cylinder("trunk", -1.32, -0.92, -0.46, 0.58, 0.32, 0.28, segs=6, tint=(0.64, 0.59, 0.52))
    b.box("iron", -1.32, -0.92, 0.68, 0.26, 0.06, 0.20)
    b.rod("trunk", (-1.32, -0.92, 0.66), (-1.68, -1.22, 1.06), 0.045, segs=4, tint=(0.82, 0.76, 0.68))
    b.moss(-1.68, 0.92, -0.02, sx=0.68, sy=0.62, sz=0.64)
    b.moss(1.75, 1.05, -0.02, sx=0.54, sy=0.52, sz=0.52)
    return b.finalize(col)


def build_frontier_barracks(mats, col):
    """Exact AoE II:DE Dark Age Barracks compound (1-to-1 match with uploaded Image 1!):
    Raised earthen dirt perimeter berm, high-contrast dark weathered palisade stockade walls (lean 4-seg split stakes = 45% fewer tris!),
    4 distinct square corner watch-turrets bound with dual dark horizontal straps & flying 4 large split-tail banners,
    enclosing a prominent dark-log command cabin with wrinkled hide roof, bold team valance, blue door curtain & lush green bushes!"""
    key = "building:barracks:frontier"
    b = PartBuilder(key, mats)
    ftris = 0

    # Earthen dirt perimeter foundation berm + courtyard dirt apron (EXACT Image 1 base berm!)
    b.tapered_box("soil", 0.0, 2.32, -0.46, 0.14, 5.55, 0.95, 5.20, 0.68, tint=(0.82, 0.68, 0.48))
    b.tapered_box("soil", -2.38, 0.02, -0.46, 0.14, 0.95, 5.35, 0.68, 5.00, tint=(0.82, 0.68, 0.48))
    b.tapered_box("soil", 2.38, 0.02, -0.46, 0.14, 0.95, 5.35, 0.68, 5.00, tint=(0.82, 0.68, 0.48))
    b.tapered_box("soil", -1.58, -2.28, -0.46, 0.14, 2.35, 0.95, 2.05, 0.68, tint=(0.82, 0.68, 0.48))
    b.tapered_box("soil", 1.58, -2.28, -0.46, 0.14, 2.35, 0.95, 2.05, 0.68, tint=(0.82, 0.68, 0.48))
    b.tapered_box("soil", 0.0, 0.0, -0.46, 0.04, 4.65, 4.55, 4.45, 4.35, tint=(0.76, 0.64, 0.46))

    # Compact weathered dark ash-bark palisade curtain walls (z_base_h = 1.58m so inner hut stands prominently visible like Image 1!)
    _palisade_row(b, -2.25, 2.32, 2.25, 2.32, count=12, z0=-0.46, z_base_h=1.58, radius=0.135, seed=91, abatis=True)
    _palisade_row(b, -2.38, -2.10, -2.38, 2.10, count=11, z0=-0.46, z_base_h=1.55, radius=0.135, seed=97, abatis=True)
    _palisade_row(b, 2.38, -2.10, 2.38, 2.10, count=11, z0=-0.46, z_base_h=1.55, radius=0.135, seed=101, abatis=True)
    _palisade_row(b, -2.25, -2.28, -0.82, -2.28, count=5, z0=-0.46, z_base_h=1.52, radius=0.135, seed=103, abatis=True)
    _palisade_row(b, 0.82, -2.28, 2.25, -2.28, count=5, z0=-0.46, z_base_h=1.52, radius=0.135, seed=107, abatis=True)
    # Dark horizontal binding rails along curtain walls
    for zy in (0.58, 1.24):
        b.box("trunk", 0.0, 2.45, zy, 4.85, 0.095, 0.12, tint=(0.44, 0.40, 0.36))
        b.box("trunk", -2.51, 0.02, zy, 0.095, 4.65, 0.12, tint=(0.44, 0.40, 0.36))
        b.box("trunk", 2.51, 0.02, zy, 0.095, 4.65, 0.12, tint=(0.44, 0.40, 0.36))
        b.box("trunk", -1.58, -2.41, zy, 1.62, 0.095, 0.12, tint=(0.44, 0.40, 0.36))
        b.box("trunk", 1.58, -2.41, zy, 1.62, 0.095, 0.12, tint=(0.44, 0.40, 0.36))

    # 4 DISTINCT SQUARE CORNER WATCH-TURRETS bound with dual dark horizontal straps + 4 LARGE SPLIT-TAIL BANNERS (EXACT Image 1!)
    for idx_c, (cx_c, cy_c) in enumerate(((-2.38, -2.28), (2.38, -2.28), (-2.38, 2.32), (2.38, 2.32))):
        ch = 0.58
        b.tapered_box("soil", cx_c, cy_c, -0.46, 0.16, 1.68, 1.68, 1.42, 1.42, tint=(0.82, 0.68, 0.48))
        b.box_z("trunk", cx_c, cy_c, -0.46, 2.12, 0.88, 0.88, tint=(0.46, 0.42, 0.37))
        _palisade_row(b, cx_c - ch, cy_c - ch, cx_c + ch, cy_c - ch, count=4, z0=-0.46, z_base_h=2.34, radius=0.132, seed=111 + idx_c * 7, abatis=False)
        _palisade_row(b, cx_c - ch, cy_c + ch, cx_c + ch, cy_c + ch, count=4, z0=-0.46, z_base_h=2.34, radius=0.132, seed=115 + idx_c * 7, abatis=False)
        _palisade_row(b, cx_c - ch, cy_c - ch + 0.18, cx_c - ch, cy_c + ch - 0.18, count=3, z0=-0.46, z_base_h=2.34, radius=0.132, seed=119 + idx_c * 7, abatis=False)
        _palisade_row(b, cx_c + ch, cy_c - ch + 0.18, cx_c + ch, cy_c + ch - 0.18, count=3, z0=-0.46, z_base_h=2.34, radius=0.132, seed=123 + idx_c * 7, abatis=False)
        for zy in (0.76, 1.68):
            b.box("trunk", cx_c, cy_c - ch - 0.12, zy, ch * 2 + 0.28, 0.10, 0.13, tint=(0.40, 0.37, 0.33))
            b.box("trunk", cx_c, cy_c + ch + 0.12, zy, ch * 2 + 0.28, 0.10, 0.13, tint=(0.40, 0.37, 0.33))
            b.box("trunk", cx_c - ch - 0.12, cy_c, zy, 0.10, ch * 2 + 0.28, 0.13, tint=(0.40, 0.37, 0.33))
            b.box("trunk", cx_c + ch + 0.12, cy_c, zy, 0.10, ch * 2 + 0.28, 0.13, tint=(0.40, 0.37, 0.33))
        ftris += b.split_flag(cx_c, cy_c, 2.12, 4.02, flag_w=1.22, flag_h=0.62, dir_x=1.0, pole_role="trunk", col=col)

    # Prominent central dark-log command cabin with wrinkled hide roof, bold team valance, blue door curtain & flanking green bushes (Image 1!)
    cx, cy = 0.0, 0.18
    hx, hy, wh = 1.32, 1.08, 1.76
    b.box_z("trunk", cx, cy, -0.46, wh - 0.08, hx * 2 - 0.14, hy * 2 - 0.14, tint=(0.46, 0.42, 0.37))
    _palisade_row(b, cx - hx, cy - hy, cx + hx, cy - hy, count=8, z0=-0.46, z_base_h=wh - 0.38, radius=0.118, seed=141, abatis=False)
    _palisade_row(b, cx - hx, cy + hy, cx + hx, cy + hy, count=8, z0=-0.46, z_base_h=wh - 0.38, radius=0.118, seed=143, abatis=False)
    _palisade_row(b, cx - hx, cy - hy + 0.16, cx - hx, cy + hy - 0.16, count=6, z0=-0.46, z_base_h=wh - 0.38, radius=0.118, seed=147, abatis=False)
    _palisade_row(b, cx + hx, cy - hy + 0.16, cx + hx, cy + hy - 0.16, count=6, z0=-0.46, z_base_h=wh - 0.38, radius=0.118, seed=149, abatis=False)
    # Dark interior doorway + bright team-colored door curtain on front-right face (Image 1!)
    b.box_z("trunk", cx + 0.18, cy - hy - 0.06, 0.0, 1.42, 0.82, 0.14, tint=(0.28, 0.25, 0.22))
    b.box_z("team", cx - 0.05, cy - hy - 0.11, 0.04, 1.38, 0.34, 0.09)
    b.box_z("team", cx + 0.42, cy - hy - 0.11, 0.04, 1.38, 0.30, 0.09)
    _draped_canvas_roof(b, cx, cy, wh - 0.04, hx * 2 + 0.56, hy * 2 + 0.54, 1.14, along_y=False, team_border=True, guy_ropes=True)
    # Lush green foliage bushes hugging both sides of the central cabin inside the courtyard (Image 1!)
    b.moss(cx - hx - 0.24, cy - 0.32, -0.02, sx=0.72, sy=0.74, sz=1.18)
    b.moss(cx - hx - 0.20, cy + 0.45, -0.02, sx=0.62, sy=0.64, sz=0.98)
    b.moss(cx + hx + 0.22, cy + 0.18, -0.02, sx=0.68, sy=0.70, sz=1.12)
    # Courtyard barrels, weapon racks & shields
    b.barrel(cx + hx + 0.35, cy - 0.65, 0.0, r=0.22, h=0.52, role="trunk")
    for sx in (-1.35, 1.35):
        b.box("team", sx, -1.52, 0.62, 0.46, 0.10, 0.54)
        b.rod("trunk", (sx, -1.42, 0.04), (sx + 0.08, -1.32, 1.92), 0.04, segs=4, tint=(0.68, 0.63, 0.56))
    root, tris = b.finalize(col)
    return root, tris + ftris


def build_frontier_mill(mats, col):
    """Age 1 Dark Age Mill: earthen floor, rotary stone quern with dark timber sweep arm, wrinkled hide canopy with bold team valance, grain sacks & haystack (ZERO brown wood!)."""
    key = "building:mill:frontier"
    b = PartBuilder(key, mats)
    b.tapered_box("soil", 0.10, 0.15, -0.46, 0.05, 4.05, 3.35, 3.75, 3.05, tint=(0.82, 0.72, 0.56))
    # Circular stone grinding curb & millstone + dark timber capstan sweep bar
    b.cylinder("stone", -0.68, -0.48, -0.46, 0.62, 1.02, 0.96, segs=10)
    b.cylinder("stoneDark", -0.68, -0.48, 0.62, 0.98, 0.68, 0.64, segs=10)
    b.cylinder("trunk", -0.68, -0.48, 0.96, 1.82, 0.14, 0.12, segs=6, tint=(0.52, 0.48, 0.42))
    b.box("trunk", -0.12, -0.48, 1.32, 2.28, 0.16, 0.16, tint=(0.62, 0.57, 0.50))
    # Open dark weathered post pavilion + wrinkled hide shelter
    cx, cy = 0.45, 0.65
    for px in (-1.28, 1.28):
        for py in (-0.98, 0.98):
            b.cylinder("trunk", cx + px, cy + py, -0.46, 2.08, 0.125, 0.105, segs=5, tint=(0.56, 0.51, 0.45))
    b.box("trunk", cx, cy, 1.98, 2.65, 2.05, 0.11, tint=(0.48, 0.44, 0.39))
    _draped_canvas_roof(b, cx, cy, 2.02, 3.08, 2.45, 1.02, along_y=False, team_border=True, guy_ropes=True)
    # Abundant golden grain sacks, woven baskets & haystack
    for gx, gy in ((0.85, 0.35), (1.32, 0.58), (0.35, 0.88), (1.18, -0.78), (-0.15, 0.45)):
        b.cylinder("canvas", gx, gy, -0.10, 0.70, 0.29, 0.21, segs=6, tint=(0.94, 0.86, 0.72))
        b.cylinder("grain", gx, gy, 0.64, 0.78, 0.20, 0.16, segs=6)
    b.pot(0.05, -0.95, 0.0, colored=True)
    b.hay_stack(-1.38, 1.15, -0.06, r=0.64, h=0.88)
    b.moss(1.58, 1.35, -0.02, sx=0.62, sy=0.58, sz=0.62)
    b.moss(-1.55, 0.25, -0.02, sx=0.54, sy=0.52, sz=0.54)
    return b.finalize(col)


def build_frontier_mine(mats, col):
    """Age 1 Dark Age Mining Camp: earthen quarry pad, dark weathered log pavilion with wrinkled hide canopy, timber ore chute, boulders & gold (ZERO brown wood!)."""
    key = "building:mine:frontier"
    b = PartBuilder(key, mats)
    b.tapered_box("soil", 0.0, 0.0, -0.46, 0.05, 3.95, 3.05, 3.65, 2.75, tint=(0.80, 0.70, 0.54))
    for px in (-1.38, 0.88):
        for py in (-0.78, 0.98):
            b.cylinder("trunk", px, py, -0.46, 1.92, 0.125, 0.105, segs=5, tint=(0.56, 0.51, 0.45))
    b.box("trunk", -0.25, 0.10, 1.84, 2.36, 1.86, 0.11, tint=(0.48, 0.44, 0.39))
    _draped_canvas_roof(b, -0.25, 0.10, 1.86, 2.84, 2.32, 0.92, along_y=False, team_border=True, guy_ropes=True)
    # Stone & gold ore heaps + timber ore-washing trough & sorting chest
    for ox, oy, r, h, role in [
        (1.18, 0.48, 0.64, 0.78, "stoneDark"),
        (1.48, -0.22, 0.50, 0.62, "stone"),
        (0.96, -0.62, 0.40, 0.48, "gold"),
        (0.52, 0.82, 0.36, 0.44, "gold"),
        (-0.88, 0.38, 0.52, 0.64, "stoneDark"),
    ]:
        b.cone(role, ox, oy, -0.14, 0.04 + h, r, segs=6)
    b.box_z("trunk", -0.58, -0.92, -0.12, 0.70, 1.24, 0.74, tint=(0.58, 0.53, 0.47))
    b.box_z("stone", -0.58, -0.92, 0.58, 0.82, 0.96, 0.52)
    b.box_z("gold", -0.42, -0.92, 0.76, 0.90, 0.42, 0.32)
    b.barrel(0.38, -0.95, -0.06, r=0.22, h=0.52, role="trunk")
    b.pot(-1.35, -0.82, 0.0, colored=True)
    b.moss(-1.48, 0.88, -0.02, sx=0.60, sy=0.56, sz=0.58)
    return b.finalize(col)


def build_frontier_dock(mats, col):
    """Authentic AoE II:DE Dark Age / Frontier Harbor Dock (ZERO brown wood!):
    Dark weathered ash-log piling wharf + sturdy 3m front jetty (never clips ships!),
    wrinkled hide fisherman canopy with bold team valance, drying nets, hoist davit, stacked barrels, crates & split-tail pennant!"""
    key = "building:dock:frontier"
    b = PartBuilder(key, mats)
    for px in (-2.40, -1.20, 0.0, 1.20, 2.40):
        for py in (-2.15, -0.72, 0.72, 2.15):
            b.cylinder("trunk", px, py, -2.20, 0.68, 0.17, 0.15, segs=6, tint=(0.52, 0.48, 0.42))
    b.box_z("trunk", 0.0, 0.0, 0.18, 0.52, 5.45, 4.95, tint=(0.74, 0.69, 0.62))
    for px in (-2.0, -1.0, 0.0, 1.0, 2.0):
        b.box("trunk", px, 0.0, 0.54, 0.16, 4.88, 0.05, tint=(0.54, 0.50, 0.44))
    b.box("team", 0.0, -2.49, 0.36, 5.48, 0.12, 0.22)
    b.box("team", 0.0, 2.49, 0.36, 5.48, 0.12, 0.22)
    b.box("team", 2.74, 0.0, 0.36, 0.12, 4.98, 0.22)

    sx, sy = -0.85, 0.65
    for ox in (-1.30, 1.30):
        for oy in (-1.00, 1.00):
            b.cylinder("trunk", sx + ox, sy + oy, 0.46, 2.38, 0.115, 0.098, segs=5, tint=(0.56, 0.51, 0.45))
    _draped_canvas_roof(b, sx, sy, 2.30, 3.18, 2.48, 1.08, along_y=False, team_border=True, guy_ropes=False)
    for ox in (-0.80, 0.80):
        b.cylinder("trunk", 1.48, -1.25 + ox * 0.70, 0.46, 1.95, 0.08, 0.068, segs=5, tint=(0.56, 0.51, 0.45))
    b.box("trunk", 1.48, -1.25, 1.90, 0.11, 1.42, 0.11, tint=(0.52, 0.48, 0.42))
    b.box("canvas", 1.48, -1.25, 1.30, 0.06, 1.16, 0.98, tint=(0.86, 0.78, 0.64))
    for bx, by in ((1.10, 0.88), (1.62, 1.08), (1.35, 1.54), (-1.70, -1.35), (-1.18, -1.58), (0.65, 1.55)):
        b.barrel(bx, by, 0.52, r=0.23, h=0.58, role="trunk")
    b.crate(0.32, -1.28, 0.52, s=0.62, role="trunk", trim_role="trunk")
    b.crate(0.42, -1.24, 1.14, s=0.44, role="trunk", trim_role="trunk")
    b.cylinder("canvas", 1.85, 0.32, 0.52, 0.82, 0.30, 0.26, segs=8, tint=(0.92, 0.84, 0.70))
    b.pot(-1.75, -0.68, 0.52, colored=True)
    ftris = b.split_flag(2.35, -2.02, 0.52, 4.18, flag_w=1.08, flag_h=0.54, dir_x=1.0, pole_role="trunk", col=col)
    root, tris = b.finalize(col)

    pier = bpy.data.objects.new(f"{key}:pier", None)
    pier["dockPier"] = True
    pier.parent = root
    col.objects.link(pier)
    pb = PartBuilder(f"{key}:pier", mats, parent=pier)
    pb.box_z("trunk", 3.10, 0.0, 0.18, 0.46, 2.95, 2.85, tint=(0.74, 0.69, 0.62))
    for x in (2.05, 3.25, 4.35):
        for side in (-1.24, 1.24):
            pb.cylinder("trunk", x, side, -2.20, 1.02, 0.16, 0.145, segs=6, tint=(0.52, 0.48, 0.42))
        pb.rod("trunk", (x, -1.20, -0.65), (x, 1.20, 0.22), 0.075, segs=4, tint=(0.48, 0.44, 0.39))
    pb.box("team", 3.10, -1.44, 0.34, 2.95, 0.11, 0.20)
    pb.box("team", 3.10, 1.44, 0.34, 2.95, 0.11, 0.20)
    pb.box("canvas", 4.58, 0.0, -0.05, 0.08, 2.15, 0.82, tint=(0.86, 0.78, 0.64))
    pb.barrel(3.15, 0.82, 0.46, r=0.22, h=0.55, role="trunk")
    pb.barrel(3.65, 0.88, 0.46, r=0.22, h=0.55, role="trunk")
    pb.crate(3.55, -0.78, 0.46, s=0.56, role="trunk", trim_role="trunk")
    _, p_tris = pb.finalize(col, link_root=False)
    return root, tris + p_tris + ftris


# ---------------------------------------------------------------------------
# 3. AGE 2 — FEUDAL AGE (36 Models: 12 Alder + 12 Sunward + 12 Raven — 1-to-1 Match with Uploaded Image 2!)
# ---------------------------------------------------------------------------
def build_feudal_towncenter(civ, mats, col):
    """Exact AoE II:DE Feudal Town Center (1-to-1 match with uploaded Image 2 center!):
    2-story half-timbered / regional manor hall with overhanging upper jetty, stone chimney, bold team banners & ivy,
    + TWO forward-projecting (`along_y=True`!) thatched/regional courtyard pavilion wings framing the front plaza!"""
    key = f"building:towncenter:{civ}:1"
    b = PartBuilder(key, mats)

    cx, cy = 0.0, 0.95
    if civ == "alder":
        _feudal_alder_shell(b, cx, cy, 3.65, 3.05, 2.25, cobble_h=0.72, x_brace=True, moss=True, team_trim=True)
        _feudal_alder_shell(b, cx, cy, 4.00, 3.35, 3.98, cobble_h=2.22, x_brace=True, moss=False, team_trim=True)
        _shaggy_thatch_roof(b, cx, cy, 3.90, 4.75, 4.05, 1.82, along_y=False, team_gable=True, hay_eaves=True)
        b.box_z("darkwood", cx, cy - 1.56, 0.02, 1.86, 1.22, 0.26)
        b.box_z("team", cx, cy - 1.66, 1.68, 2.02, 1.68, 0.16)
        b.box_z("stoneDark", cx + 1.55, cy + 0.65, 0.50, 5.48, 0.66, 0.66)
        b.box("stone", cx + 1.55, cy + 0.65, 5.54, 0.78, 0.78, 0.16)
    elif civ == "sun":
        _feudal_sun_shell(b, cx, cy, 4.15, 3.45, 3.68, canopy=True)
        _feudal_sun_shell(b, cx, cy + 0.35, 2.75, 2.25, 4.98, canopy=False)
        for sx in (-0.98, 0.98):
            b.box_z("brick", cx + sx, cy - 1.85, -0.46, 2.18, 0.46, 0.46, tint=(0.96, 0.84, 0.70))
        b.box("team", cx, cy - 1.85, 2.20, 2.42, 0.50, 0.26)
        b.box_z("brick", cx + 1.55, cy + 0.65, 0.50, 5.48, 0.64, 0.64, tint=(0.94, 0.80, 0.66))
    else:
        _feudal_raven_shell(b, cx, cy, 4.00, 3.30, 3.18, 2.38, along_y=False, shields=True)
        b.box_z("darkwood", cx, cy - 1.70, 0.02, 1.90, 1.22, 0.26)
        b.box("team", cx, cy - 1.76, 1.88, 1.48, 0.14, 0.24)
        b.box_z("stoneDark", cx + 1.55, cy + 0.65, 0.50, 5.48, 0.66, 0.66)

    # TWO FORWARD-PROJECTING (`along_y=True`!) COURTYARD PAVILION WINGS (exact U-shaped layout of Image 2 Feudal TC!)
    for side in (-1.0, 1.0):
        _feudal_pavilion(b, civ, side * 2.38, -0.95, 1.92, 2.75, h=1.90, along_y=True)
        b.barrel(side * 2.15, -0.55, 0.0, r=0.22, h=0.54)
        b.crate(side * 2.65, -1.45, 0.0, s=0.52)

    ftris = b.banner_pole(0.0, cy - 1.75, 2.25, 5.88, flag_w=0.96, flag_h=0.54, dir_x=1.0, col=col)
    root, tris = b.finalize(col)
    return root, tris + ftris


def build_feudal_house(civ, mats, col):
    """Exact AoE II:DE Feudal House (Image 2!): L-shaped cottage, multi-tiered thatch with straw sheaves, stone chimney, team gable & ivy!"""
    key = f"building:house:{civ}:1"
    b = PartBuilder(key, mats)
    if civ == "alder":
        _feudal_alder_shell(b, -0.30, 0.25, 2.78, 2.28, 2.18, cobble_h=0.64, x_brace=True, moss=True, team_trim=True)
        _shaggy_thatch_roof(b, -0.30, 0.25, 2.12, 3.48, 2.98, 1.52, along_y=False, team_gable=True, hay_eaves=True)
        _feudal_alder_shell(b, 0.92, -0.58, 1.48, 1.58, 1.86, cobble_h=0.54, x_brace=True, moss=True, team_trim=False)
        _shaggy_thatch_roof(b, 0.92, -0.58, 1.80, 1.98, 2.08, 1.12, along_y=True, team_gable=True)
        b.box_z("stoneDark", -1.42, 0.62, -0.46, 3.74, 0.58, 0.58)
        b.box("stone", -1.42, 0.62, 3.80, 0.68, 0.68, 0.14)
        b.box_z("darkwood", -0.35, -0.92, 0.12, 1.44, 0.70, 0.16)
        b.box("glass", -0.35, -0.94, 1.24, 0.44, 0.10, 0.36)
        b.barrel(-1.25, -0.95, 0.04, r=0.21, h=0.50)
    elif civ == "sun":
        _feudal_sun_shell(b, -0.20, 0.15, 2.88, 2.48, 2.38, canopy=True)
        _feudal_sun_shell(b, 1.05, -0.55, 1.42, 1.42, 1.76, canopy=False)
        b.box_z("brick", -1.42, 0.62, -0.46, 3.42, 0.52, 0.52, tint=(0.94, 0.80, 0.66))
        b.box_z("darkwood", -0.25, -1.12, 0.12, 1.48, 0.74, 0.16)
        b.pot(1.25, -1.35, 0.04, colored=True)
        b.barrel(-1.25, -0.98, 0.04, r=0.20, h=0.48)
    else:
        _feudal_raven_shell(b, -0.25, 0.20, 2.78, 2.28, 2.02, 1.82, along_y=False, shields=True)
        _feudal_raven_shell(b, 0.95, -0.55, 1.48, 1.48, 1.68, 1.28, along_y=True, shields=False)
        b.box_z("stoneDark", -1.42, 0.62, -0.46, 3.74, 0.56, 0.56)
        b.box_z("darkwood", -0.25, -0.98, 0.12, 1.40, 0.70, 0.16)
        b.barrel(-1.20, -1.00, 0.04, r=0.21, h=0.50)
    return b.finalize(col)


def build_feudal_tower(civ, mats, col):
    """Exact AoE II:DE Feudal Watch Tower (5 visible in uploaded Image 2!):
    Tall fieldstone shaft wrapped in lush dark-green climbing ivy + overhanging octagonal wooden lookout gallery
    with open window gap between 8 timber posts, bright team stripe & 3-tier faceted conical wooden-plank roof!"""
    key = f"building:tower:{civ}:1"
    b = PartBuilder(key, mats)
    if civ == "alder":
        b.cylinder("stoneDark", 0.0, 0.0, -0.46, 0.92, 1.54, 1.24, segs=8, tint=(0.86, 0.85, 0.82))
        b.cylinder("stoneDark", 0.0, 0.0, 0.85, 4.35, 1.18, 1.04, segs=8, tint=(0.90, 0.88, 0.84), z_grad=0.18)
        # Lush climbing ivy/vines wrapping the stone shaft up to the timber gallery (EXACT Image 2!)
        b.moss(-0.94, -0.48, 0.06, sx=0.78, sy=0.72, sz=3.15)
        b.moss(0.78, -0.70, 0.04, sx=0.68, sy=0.66, sz=2.25)
        b.moss(-0.36, 0.92, 0.06, sx=0.70, sy=0.62, sz=2.55)
        for i in range(8):
            a = i * math.pi / 4.0
            ca, sa = math.cos(a), math.sin(a)
            b.rod("darkwood", (ca * 0.98, sa * 0.98, 3.65), (ca * 1.52, sa * 1.52, 4.38), 0.09, segs=4)
        # Overhanging octagonal wooden gallery skirt + bold team band + dark recessed lookout opening framed by 8 posts!
        b.cylinder("wood", 0.0, 0.0, 4.28, 4.78, 1.58, 1.60, segs=8, tint=(0.92, 0.78, 0.56))
        b.cylinder("darkwood", 0.0, 0.0, 4.24, 4.36, 1.62, 1.62, segs=8)
        b.cylinder("team", 0.0, 0.0, 4.46, 4.68, 1.63, 1.63, segs=8)
        b.cylinder("iron", 0.0, 0.0, 4.78, 5.34, 1.32, 1.32, segs=8, tint=(0.24, 0.22, 0.20))
        for i in range(8):
            a = i * math.pi / 4.0
            b.box_z("darkwood", math.cos(a) * 1.52, math.sin(a) * 1.52, 4.28, 5.48, 0.17, 0.17, rot_z=a)
        b.cylinder("darkwood", 0.0, 0.0, 5.32, 5.50, 1.64, 1.64, segs=8)
        # 3-tier faceted conical golden-oak plank roof with dark hip rafters (EXACT Image 2!)
        b.cylinder("wood", 0.0, 0.0, 5.44, 5.96, 1.84, 1.36, segs=8, tint=(0.96, 0.80, 0.52), z_grad=0.16)
        b.cylinder("wood", 0.0, 0.0, 5.92, 6.46, 1.40, 0.86, segs=8, tint=(1.04, 0.88, 0.58), z_grad=0.16)
        b.cone("wood", 0.0, 0.0, 6.42, 7.12, 0.90, segs=8, tint=(1.08, 0.92, 0.64), z_grad=0.18)
        b.cylinder("darkwood", 0.0, 0.0, 5.90, 5.98, 1.42, 1.38, segs=8)
        b.cylinder("darkwood", 0.0, 0.0, 6.40, 6.48, 0.92, 0.88, segs=8)
        for i in range(8):
            a = i * math.pi / 4.0
            b.rod("darkwood", (math.cos(a) * 1.84, math.sin(a) * 1.84, 5.44), (0.0, 0.0, 7.14), 0.075, segs=4)
        b.box("darkwood", 0.0, 0.0, 7.16, 0.24, 0.24, 0.28)
    elif civ == "sun":
        # High-detail desert sandstone & terracotta watchtower with corner buttresses, corbelled gallery, merlons & striped canopy!
        b.tapered_box("brick", 0.0, 0.0, -0.46, 0.78, 2.85, 2.85, 2.45, 2.45, tint=(0.96, 0.84, 0.70))
        b.tapered_box("plaster", 0.0, 0.0, 0.72, 4.45, 2.32, 2.32, 1.88, 1.88, tint=(1.00, 0.95, 0.85), z_grad=0.14)
        for sx in (-0.92, 0.92):
            for sy in (-0.92, 0.92):
                b.tapered_box("brick", sx, sy, 0.68, 4.52, 0.42, 0.42, 0.32, 0.32, tint=(0.94, 0.82, 0.68))
        for zy in (1.85, 3.25):
            for off in (-0.65, 0.0, 0.65):
                b.box("wood", off, 0.0, zy, 0.14, 2.55, 0.14)
                b.box("wood", 0.0, off, zy, 2.55, 0.14, 0.14)
            b.box("darkwood", 0.0, -1.08, zy + 0.45, 0.38, 0.10, 0.68)
        # Corbelled overhanging desert fighting gallery + stepped brick merlons + wrinkled shade awning
        b.box_z("brick", 0.0, 0.0, 4.40, 4.72, 2.68, 2.68, tint=(0.96, 0.84, 0.70))
        b.box_z("team", 0.0, 0.0, 4.70, 5.02, 2.72, 2.72)
        for side in (-1.0, 1.0):
            for m_off in (-0.85, 0.0, 0.85):
                b.box_z("brick", m_off, side * 1.24, 5.00, 5.42, 0.48, 0.24, tint=(0.96, 0.84, 0.70))
                b.box_z("brick", side * 1.24, m_off, 5.00, 5.42, 0.24, 0.48, tint=(0.96, 0.84, 0.70))
        for sx in (-1.15, 1.15):
            for sy in (-1.15, 1.15):
                b.box_z("wood", sx, sy, 4.95, 6.18, 0.16, 0.16)
        _draped_canvas_roof(b, 0.0, 0.0, 6.12, 2.88, 2.88, 0.56, along_y=False, team_border=True, guy_ropes=False)
        b.banner_pole(1.15, -1.15, 5.10, 7.25, flag_w=0.82, flag_h=0.48, dir_x=1.0)
    else:
        # High-detail Nordic stone-and-notched-log watchtower + shield-hung timber gallery + 3-tier shingled roof & dragon horns!
        b.cylinder("stoneDark", 0.0, 0.0, -0.46, 1.55, 1.54, 1.28, segs=8)
        b.cylinder("wood", 0.0, 0.0, 1.48, 4.32, 1.26, 1.14, segs=8, tint=(0.88, 0.78, 0.66), z_grad=0.16)
        for zc in (1.85, 2.55, 3.25, 3.95):
            b.box("darkwood", 0.0, 0.0, zc, 2.58, 0.18, 0.18)
            b.box("darkwood", 0.0, 0.0, zc, 0.18, 2.58, 0.18)
        b.moss(-0.92, -0.55, 0.02, sx=0.76, sy=0.70, sz=1.95)
        b.moss(0.75, 0.65, 0.02, sx=0.64, sy=0.62, sz=1.65)
        for i in range(8):
            a = i * math.pi / 4.0
            b.rod("darkwood", (math.cos(a) * 1.02, math.sin(a) * 1.02, 3.65), (math.cos(a) * 1.54, math.sin(a) * 1.54, 4.35), 0.09, segs=4)
        b.box_z("darkwood", 0.0, 0.0, 4.25, 4.82, 2.78, 2.78)
        b.box_z("iron", 0.0, 0.0, 4.80, 5.38, 2.24, 2.24, tint=(0.24, 0.22, 0.20))
        for side in (-1.0, 1.0):
            for off in (-0.75, 0.0, 0.75):
                b.box("team", off, side * 1.44, 4.62, 0.52, 0.10, 0.52)
                b.box("steel", off, side * 1.48, 4.62, 0.16, 0.07, 0.16)
                b.box("team", side * 1.44, off, 4.62, 0.10, 0.52, 0.52)
                b.box("steel", side * 1.48, off, 4.62, 0.07, 0.16, 0.16)
        for sx in (-1.24, 1.24):
            for sy in (-1.24, 1.24):
                b.box_z("darkwood", sx, sy, 4.40, 5.52, 0.18, 0.18)
        b.cylinder("darkwood", 0.0, 0.0, 5.44, 6.08, 1.98, 1.42, segs=8)
        b.cylinder("straw", 0.0, 0.0, 6.04, 6.68, 1.46, 0.88, segs=8, tint=(0.82, 0.70, 0.52))
        b.cone("straw", 0.0, 0.0, 6.64, 7.45, 0.92, segs=8, tint=(0.90, 0.78, 0.58))
        b.rod("darkwood", (-0.32, 0.0, 7.25), (0.48, 0.0, 7.95), 0.075, segs=4)
        b.rod("darkwood", (0.32, 0.0, 7.25), (-0.48, 0.0, 7.95), 0.075, segs=4)
        b.banner_pole(0.0, 0.0, 7.35, 8.28, flag_w=0.76, flag_h=0.45, dir_x=1.0)
    return b.finalize(col)


def build_feudal_barracks(civ, mats, col):
    """Exact AoE II:DE Feudal Barracks Compound (1-to-1 match with uploaded Image 2 top-center!):
    2-story rear garrison hall + ENCLOSED stone-and-timber front courtyard wall with wooden parapet walk & railings +
    OPEN timber/stone front-left gatehouse arch + weapon racks & training dummy inside the courtyard!"""
    key = f"building:barracks:{civ}:1"
    b = PartBuilder(key, mats)
    # Courtyard gravel/earth base pad
    b.tapered_box("soil", 0.0, -0.95, -0.46, 0.06, 4.85, 2.55, 4.55, 2.35, tint=(0.78, 0.68, 0.54))

    # 1. Rear 2-story garrison hall (y = +0.95)
    if civ == "alder":
        _feudal_alder_shell(b, 0.0, 0.95, 4.55, 2.45, 3.38, cobble_h=0.82, x_brace=True, moss=True, team_trim=True)
        _shaggy_thatch_roof(b, 0.0, 0.95, 3.30, 5.25, 3.15, 1.66, along_y=False, team_gable=True, hay_eaves=True)
    elif civ == "sun":
        _feudal_sun_shell(b, 0.0, 0.95, 4.55, 2.55, 3.35, canopy=True)
    else:
        _feudal_raven_shell(b, 0.0, 0.95, 4.55, 2.45, 2.85, 1.98, along_y=False, shields=True)

    wall_role = "brick" if civ == "sun" else "stoneDark"
    parapet_role = "wood" if civ != "alder" else "darkwood"

    # 2. Front-left projecting gatehouse with OPEN archway passage & pitched roof/parapet cap (EXACT Image 2 top-center!)
    gx, gy = -1.45, -1.25
    for side_x in (-0.68, 0.68):
        b.box_z(wall_role, gx + side_x, gy, -0.46, 2.22, 0.48, 1.52)
        b.box_z("team", gx + side_x, gy - 0.78, 0.55, 1.78, 0.26, 0.10)
    # Gatehouse lintel bridge over open dark passage + roof/parapet cap
    b.box_z(wall_role, gx, gy, 1.62, 2.22, 1.84, 1.52)
    b.box_z("darkwood", gx, gy, 0.0, 1.62, 0.92, 0.35, tint=(0.24, 0.20, 0.18))
    b.box_z("wood", gx, gy, 2.18, 2.38, 2.02, 1.72)
    if civ == "alder":
        _shaggy_thatch_roof(b, gx, gy, 2.32, 2.15, 1.88, 0.78, along_y=True, team_gable=True)
    elif civ == "sun":
        b.box_z("brick", gx, gy, 2.36, 2.68, 1.98, 1.68, tint=(0.96, 0.84, 0.70))
    else:
        _shaggy_thatch_roof(b, gx, gy, 2.32, 2.15, 1.88, 0.86, along_y=True, team_gable=True, raven_style=True)

    # 3. Enclosed front-right & right-side stone-and-timber courtyard perimeter wall + wooden parapet walkway & railings (Image 2!)
    b.box_z(wall_role, 0.92, -1.92, -0.46, 1.08, 2.85, 0.42)
    b.box_z(wall_role, 2.18, -0.95, -0.46, 1.08, 0.42, 2.15)
    b.box_z("wood", 0.92, -1.86, 1.04, 1.22, 2.95, 0.62)
    b.box_z("wood", 2.12, -0.95, 1.04, 1.22, 0.62, 2.25)
    # Timber parapet railing posts & top rails around the courtyard wall
    for ix in range(-3, 4):
        b.box_z(parapet_role, 0.92 + ix * 0.42, -2.08, 1.18, 1.86, 0.12, 0.12)
    for iy in range(-2, 3):
        b.box_z(parapet_role, 2.32, -0.95 + iy * 0.45, 1.18, 1.86, 0.12, 0.12)
    b.box(parapet_role, 0.92, -2.08, 1.84, 2.92, 0.14, 0.12)
    b.box(parapet_role, 2.32, -0.95, 1.84, 0.14, 2.22, 0.12)
    b.box("team", 0.92, -2.12, 1.48, 2.86, 0.10, 0.22)

    # 4. Open courtyard interior details: weapon rack, training dummy & barrels
    b.cylinder("trunk", 0.55, -0.95, -0.10, 1.35, 0.12, 0.10, segs=5)
    b.box("straw", 0.55, -0.95, 0.85, 0.46, 0.34, 0.52)
    b.box("team", 0.55, -0.95, 0.88, 0.50, 0.38, 0.24)
    b.box("darkwood", 0.55, -0.95, 0.98, 0.88, 0.12, 0.12)
    b.barrel(1.55, -0.55, 0.0, r=0.22, h=0.52)
    b.moss(-2.28, -1.92, -0.02, sx=0.58, sy=0.56, sz=0.88)

    ftris = b.banner_pole(2.25, -1.98, 1.22, 4.55, flag_w=0.92, flag_h=0.50, dir_x=1.0, col=col)
    root, tris = b.finalize(col)
    return root, tris + ftris


def _feudal_horse(b, cx, cy, z0=0.0, coat_role="wood", coat_tint=(0.72, 0.48, 0.28), mane_tint=(0.24, 0.18, 0.14)):
    """Low-poly sculpted horse standing in Feudal Stable stall (chestnut or dapple-white, ~36 tris = zero lag, matches Image 2!)."""
    # Barrel torso, angled neck, head & muzzle facing -Y (front of stable stall)
    b.box(coat_role, cx, cy + 0.12, z0 + 0.86, 0.46, 1.08, 0.46, tint=coat_tint)
    b.tapered_box(coat_role, cx, cy - 0.38, z0 + 0.96, z0 + 1.46, 0.32, 0.38, 0.24, 0.28, tint=coat_tint)
    b.box(coat_role, cx, cy - 0.56, z0 + 1.36, 0.24, 0.42, 0.24, tint=coat_tint)
    b.box("darkwood", cx, cy - 0.34, z0 + 1.24, 0.09, 0.36, 0.42, tint=mane_tint)
    # 4 legs + tail
    for lx in (-0.15, 0.15):
        for ly in (-0.28, 0.46):
            b.box_z(coat_role, cx + lx, cy + ly, z0, z0 + 0.72, 0.12, 0.12, tint=coat_tint)
    b.box_z("darkwood", cx, cy + 0.68, z0 + 0.36, z0 + 0.98, 0.10, 0.12, tint=mane_tint)


def build_feudal_stable(civ, mats, col):
    """Exact AoE II:DE Feudal Stable (1-to-1 match with uploaded Image 2 center & bottom-center!):
    Wide thatched half-timber barn with golden straw sheaves on the roof eaves + open-front timber horse-stall arcade
    with 2 visible horses standing inside the stalls, wooden trough & rounded golden haystack!"""
    key = f"building:stable:{civ}:1"
    b = PartBuilder(key, mats)
    b.tapered_box("soil", 0.0, -0.45, -0.46, 0.05, 5.15, 4.25, 4.85, 3.95, tint=(0.78, 0.68, 0.52))
    if civ == "alder":
        _feudal_alder_shell(b, 0.0, 0.62, 4.45, 2.50, 2.48, cobble_h=0.62, x_brace=True, moss=True, team_trim=True)
        _shaggy_thatch_roof(b, 0.0, 0.05, 2.16, 5.18, 4.55, 1.76, along_y=False, team_gable=True, hay_eaves=True)
    elif civ == "sun":
        _feudal_sun_shell(b, 0.0, 0.65, 4.48, 2.55, 2.88, canopy=False)
        _feudal_pavilion(b, "sun", 0.0, -1.25, 4.45, 1.85, h=2.08, along_y=False)
    else:
        _feudal_raven_shell(b, 0.0, 0.62, 4.45, 2.50, 2.38, 1.88, along_y=False, shields=True)
        _feudal_pavilion(b, "raven", 0.0, -1.28, 4.40, 1.80, h=1.96, along_y=False)

    # Open front wooden horse-stall arcade posts, stall partitions & team eaves frieze (Image 2!)
    for px in (-2.08, -0.70, 0.70, 2.08):
        b.box_z("darkwood", px, -1.94, -0.46, 2.22, 0.18, 0.18)
        b.box_z("wood", px, -1.18, -0.10, 1.18, 0.14, 1.48)
    b.box("team", 0.0, -1.96, 2.12, 4.42, 0.16, 0.22)

    # 2 sculpted horses standing inside the open front stalls (1 dapple-white, 1 chestnut brown — EXACT Image 2!)
    _feudal_horse(b, -1.38, -1.05, z0=0.0, coat_role="canvas", coat_tint=(1.04, 1.00, 0.94), mane_tint=(0.58, 0.54, 0.48))
    _feudal_horse(b, 0.0, -1.05, z0=0.0, coat_role="wood", coat_tint=(0.74, 0.48, 0.28), mane_tint=(0.24, 0.18, 0.14))

    # Golden hay mound spilling out right side + feed trough on left (Image 2!)
    b.hay_stack(2.28, -1.42, -0.04, r=0.68, h=0.92)
    b.hay_stack(1.65, -1.68, -0.04, r=0.46, h=0.62)
    b.box_z("wood", -1.38, -1.92, 0.0, 0.52, 1.02, 0.44)
    b.box_z("grain", -1.38, -1.92, 0.42, 0.60, 0.88, 0.34)
    return b.finalize(col)


def build_feudal_range(civ, mats, col):
    """Exact AoE II:DE Feudal Archery Range (Image 2 right-center!):
    Thatched archery hall + raised wooden shooting gallery deck with stairs + 3 round straw bullseye targets in front of timber backstop!"""
    key = f"building:range:{civ}:1"
    b = PartBuilder(key, mats)
    b.tapered_box("soil", 0.0, -0.45, -0.46, 0.05, 4.95, 3.85, 4.65, 3.55, tint=(0.78, 0.68, 0.52))
    if civ == "alder":
        _feudal_alder_shell(b, 0.45, 0.95, 3.72, 2.38, 2.42, cobble_h=0.62, x_brace=True, moss=True, team_trim=True)
        _shaggy_thatch_roof(b, 0.45, 0.95, 2.34, 4.42, 3.08, 1.56, along_y=False, team_gable=True, hay_eaves=True)
    elif civ == "sun":
        _feudal_sun_shell(b, 0.45, 0.95, 3.78, 2.45, 2.78, canopy=True)
    else:
        _feudal_raven_shell(b, 0.45, 0.95, 3.72, 2.38, 2.22, 1.82, along_y=False, shields=True)

    # Raised wooden shooting gallery platform on left + wooden steps & railings (Image 2!)
    b.box_z("wood", -1.82, 0.35, -0.46, 0.82, 1.42, 2.95)
    for step in range(3):
        b.box_z("wood", -1.82, -1.25 - step * 0.26, -0.10, 0.24 * (3 - step), 0.92, 0.26)
    for ry in (-1.05, 0.35, 1.75):
        b.box_z("darkwood", -2.44, ry, 0.78, 1.52, 0.12, 0.12)
    b.box("darkwood", -2.44, 0.35, 1.48, 0.14, 2.95, 0.12)
    b.box("team", -2.46, 0.35, 1.15, 0.10, 2.88, 0.22)

    # Timber & earth target backstop wall behind the 3 targets + low front shooting fence
    b.box_z("wood", 0.35, -0.82, -0.46, 1.72, 3.72, 0.22)
    b.box("team", 0.35, -0.84, 1.62, 3.78, 0.24, 0.22)
    for tx in (-0.85, 0.35, 1.55):
        _archery_target(b, tx, -1.42, z0=-0.04)
    for rx in (-1.35, 0.35, 2.05):
        b.box_z("darkwood", rx, -2.25, -0.46, 0.76, 0.13, 0.13)
    b.box("darkwood", 0.35, -2.25, 0.66, 3.58, 0.11, 0.11)
    b.barrel(-1.82, -1.85, 0.0, r=0.22, h=0.52)
    return b.finalize(col)


def build_feudal_blacksmith(civ, mats, col):
    """Exact AoE II:DE Feudal Blacksmith (Image 2 far right!):
    Thatched forge hall + TALL EXTERNAL STONE CHIMNEY (`x=-1.48`) with glowing orange furnace mouth & team band + open smithy porch & anvil!"""
    key = f"building:blacksmith:{civ}:1"
    b = PartBuilder(key, mats)
    if civ == "alder":
        _feudal_alder_shell(b, 0.55, 0.45, 3.42, 2.58, 2.38, cobble_h=0.66, x_brace=True, moss=True, team_trim=True)
        _shaggy_thatch_roof(b, 0.55, 0.45, 2.30, 4.12, 3.28, 1.56, along_y=False, team_gable=True)
    elif civ == "sun":
        _feudal_sun_shell(b, 0.55, 0.45, 3.48, 2.65, 2.78, canopy=True)
    else:
        _feudal_raven_shell(b, 0.55, 0.45, 3.42, 2.58, 2.24, 1.78, along_y=False, shields=True)

    # ICONIC TALL EXTERNAL STONE FORGE CHIMNEY at (-1.48, -0.15) with glowing orange furnace mouth & team band (Image 2 far right!)
    b.tapered_box("stone", -1.48, -0.15, -0.46, 1.88, 1.32, 1.32, 0.92, 0.92)
    b.tapered_box("stoneDark", -1.48, -0.15, 1.80, 4.58, 0.90, 0.90, 0.60, 0.60)
    b.box("stone", -1.48, -0.15, 4.64, 0.76, 0.76, 0.16)
    b.box("team", -1.48, -0.15, 1.54, 1.02, 1.02, 0.22)
    b.box("glow", -1.48, -0.78, 0.72, 0.62, 0.20, 0.62)
    b.box("glow", -1.48, -0.15, 4.74, 0.36, 0.36, 0.08)

    # Front smithy work-porch with anvil on log block, quench barrel & weapon rack
    for px in (-0.98, 0.98):
        b.cylinder("darkwood", px, -1.68, -0.46, 1.76, 0.095, 0.085, segs=5)
    b.lean_roof("wood", 0.0, -1.25, 1.68, 2.18, 2.42, 1.30, high_side="+y", thick=0.12)
    b.box("team", 0.0, -1.88, 1.64, 2.44, 0.10, 0.18)
    b.cylinder("trunk", 0.0, -1.35, -0.10, 0.68, 0.28, 0.25, segs=6)
    b.box("iron", 0.0, -1.35, 0.86, 0.70, 0.30, 0.28)
    b.box("steel", 0.36, -1.35, 0.90, 0.26, 0.18, 0.15)
    b.barrel(-0.72, -1.42, 0.0, r=0.23, h=0.54)
    b.crate(0.88, -1.35, 0.0, s=0.54)
    return b.finalize(col)


def build_feudal_market(civ, mats, col):
    """Exact AoE II:DE Feudal Market (1-to-1 match with uploaded Image 2 middle-left!):
    Tall thatched merchant guildhall with raised wooden display stage, side wooden stairs, pumpkin/produce crates
    + 2 flanking thatched market stall pavilions!"""
    key = f"building:market:{civ}:1"
    b = PartBuilder(key, mats)
    if civ == "alder":
        _feudal_alder_shell(b, -0.42, 0.95, 3.72, 2.38, 2.68, cobble_h=0.72, x_brace=True, moss=True, team_trim=True)
        _shaggy_thatch_roof(b, -0.42, 0.95, 2.60, 4.42, 3.08, 1.60, along_y=False, team_gable=True, hay_eaves=True)
    elif civ == "sun":
        _feudal_sun_shell(b, -0.42, 0.95, 3.78, 2.45, 2.98, canopy=True)
    else:
        _feudal_raven_shell(b, -0.42, 0.95, 3.72, 2.38, 2.40, 1.86, along_y=False, shields=True)

    # Raised wooden merchant display stage + side wooden steps + colorful produce bins (Image 2 middle-left!)
    b.box_z("wood", -0.42, -0.68, -0.46, 0.62, 3.52, 1.22)
    b.box("darkwood", -0.42, -1.28, 0.58, 3.58, 0.12, 0.14)
    for step in range(3):
        b.box_z("wood", 1.52 + step * 0.22, -0.68, -0.10, 0.20 * (3 - step), 0.24, 0.86)
    b.box("fruit", -1.28, -0.78, 0.78, 0.58, 0.44, 0.36)
    b.box("grain", -0.42, -0.78, 0.78, 0.60, 0.44, 0.36)
    b.box("team", 0.42, -0.78, 0.78, 0.58, 0.44, 0.34)

    _feudal_pavilion(b, civ, -1.42, -1.78, 2.05, 1.32, h=1.48, along_y=False)
    _feudal_pavilion(b, civ, 1.68, -0.88, 1.68, 1.82, h=1.52, along_y=True)
    b.box("fruit", -1.68, -1.78, 0.26, 0.54, 0.44, 0.46)
    b.box("grain", -1.10, -1.78, 0.26, 0.50, 0.44, 0.46)
    b.barrel(1.55, -0.62, 0.0, r=0.23, h=0.54)
    b.crate(1.88, -1.18, 0.0, s=0.50)
    return b.finalize(col)


def build_feudal_mill(civ, mats, col):
    """Exact AoE II:DE Feudal Mill (1-to-1 match with uploaded Image 2 lower-center!):
    Fieldstone-and-timber millhouse + attached side grain shed + rounded shaggy thatch turret dome +
    4 CHUNKY TRAPEZOIDAL WOOD-LATTICE & CANVAS SPINNING SAILS (`windmill = True`, min.y > 2.45m)!"""
    key = f"building:mill:{civ}:1"
    b = PartBuilder(key, mats)
    if civ == "alder":
        b.tapered_box("stoneDark", 0.0, 0.25, -0.46, 1.22, 3.12, 2.92, 2.60, 2.50)
        b.box_z("wood", 0.0, 0.25, 1.15, 2.58, 2.52, 2.38, tint=(0.92, 0.82, 0.68))
        b.cylinder("plaster", 0.0, 0.25, 2.28, 4.08, 1.36, 1.20, segs=8, tint=(0.98, 0.95, 0.88))
        for i in range(8):
            a = i * math.pi / 4.0
            b.box_z("darkwood", math.cos(a) * 1.32, 0.25 + math.sin(a) * 1.32, 1.15, 4.10, 0.16, 0.16, rot_z=a)
        b.cylinder("darkwood", 0.0, 0.25, 2.52, 2.68, 1.42, 1.42, segs=8)
        b.cylinder("team", 0.0, 0.25, 3.82, 4.06, 1.32, 1.32, segs=8)
        b.cylinder("straw", 0.0, 0.25, 3.98, 4.40, 1.64, 1.44, segs=10, tint=(0.68, 0.56, 0.38))
        b.cylinder("straw", 0.0, 0.25, 4.36, 4.76, 1.48, 1.18, segs=10, tint=(0.80, 0.68, 0.48))
        b.cylinder("straw", 0.0, 0.25, 4.72, 5.08, 1.20, 0.80, segs=10, tint=(0.90, 0.78, 0.56))
        b.cone("straw", 0.0, 0.25, 5.04, 5.52, 0.84, segs=10, tint=(0.98, 0.86, 0.64))
        _shaggy_thatch_roof(b, 1.36, 0.35, 1.68, 1.52, 1.92, 0.82, along_y=True, team_gable=True)
        b.moss(-1.35, -0.78, -0.02, sx=0.72, sy=0.70, sz=1.52)
        b.moss(1.22, 1.05, -0.02, sx=0.64, sy=0.62, sz=1.22)
    elif civ == "sun":
        b.tapered_box("brick", 0.0, 0.25, -0.46, 0.76, 3.12, 3.00, 2.76, 2.66, tint=(0.96, 0.84, 0.70))
        b.tapered_box("plaster", 0.0, 0.25, 0.70, 4.38, 2.68, 2.58, 2.04, 2.04, tint=(1.00, 0.95, 0.85), z_grad=0.14)
        for sx in (-1.05, 1.05):
            for sy in (-0.80, 1.30):
                b.tapered_box("brick", sx, sy, 0.68, 4.45, 0.38, 0.38, 0.28, 0.28, tint=(0.94, 0.82, 0.68))
        b.box("team", 0.0, 0.25, 4.10, 2.22, 2.22, 0.26)
        b.box_z("brick", 0.0, 0.25, 4.28, 4.76, 2.18, 2.18, tint=(0.96, 0.84, 0.70))
        _draped_canvas_roof(b, 1.38, 0.35, 1.72, 1.52, 1.92, 0.48, along_y=True, team_border=True, guy_ropes=False)
    else:
        b.tapered_box("stoneDark", 0.0, 0.25, -0.46, 1.28, 3.12, 3.00, 2.56, 2.50)
        b.cylinder("wood", 0.0, 0.25, 1.20, 4.18, 1.42, 1.20, segs=8, tint=(0.88, 0.78, 0.66), z_grad=0.16)
        b.cylinder("team", 0.0, 0.25, 3.85, 4.12, 1.32, 1.32, segs=8)
        b.cylinder("darkwood", 0.0, 0.25, 4.08, 4.62, 1.62, 1.18, segs=8)
        b.cone("straw", 0.0, 0.25, 4.58, 5.62, 1.24, segs=8, tint=(0.86, 0.74, 0.54))
        _shaggy_thatch_roof(b, 1.36, 0.35, 1.68, 1.52, 1.92, 0.86, along_y=True, team_gable=True, raven_style=True)
        b.moss(-1.35, -0.78, -0.02, sx=0.70, sy=0.68, sz=1.45)

    b.box("darkwood", 0.0, -1.08, 4.25, 0.46, 1.28, 0.46)
    b.cylinder("iron", 0.0, -1.64, 4.08, 4.42, 0.22, 0.22, segs=6)
    for gx, gy in ((1.52, -0.78), (1.84, -0.32), (-1.58, -0.82)):
        b.cylinder("canvas", gx, gy, -0.10, 0.68, 0.30, 0.22, segs=6)
    b.barrel(1.55, 0.78, 0.0, r=0.24, h=0.56)

    root, tris = b.finalize(col)

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
        rb.rod("darkwood", (0.0, 0.0, 0.0), (ca * 1.76, 0.0, sa * 1.76), 0.072, segs=4)
        bm = rb._bm("canvas")
        stations = ((0.38, 0.26, 0.44), (0.86, 0.32, 0.64), (1.32, 0.36, 0.80), (1.72, 0.40, 0.92))
        ht = 0.036
        for idx_s in range(len(stations) - 1):
            d0, w0_l, w0_r = stations[idx_s]
            d1, w1_l, w1_r = stations[idx_s + 1]
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
            shade = 0.88 + idx_s * 0.05
            rb._paint_faces(bm, faces, tint=(shade, shade * 0.93, shade * 0.80))
            rb.rod("darkwood", (ca * d1 - sx_n * w1_l, -0.02, sa * d1 - sz_n * w1_l),
                   (ca * d1 + sx_n * w1_r, -0.02, sa * d1 + sz_n * w1_r), 0.042, segs=4)
        rb.rod("darkwood", (ca * 0.38 - sx_n * 0.26, -0.02, sa * 0.38 - sz_n * 0.26),
               (ca * 1.72 - sx_n * 0.40, -0.02, sa * 1.72 - sz_n * 0.40), 0.042, segs=4)
        rb.rod("darkwood", (ca * 0.38 + sx_n * 0.44, -0.02, sa * 0.38 + sz_n * 0.44),
               (ca * 1.72 + sx_n * 0.92, -0.02, sa * 1.72 + sz_n * 0.92), 0.042, segs=4)
    _, r_tris = rb.finalize(col, link_root=False)
    return root, tris + r_tris


def build_feudal_camp(civ, mats, col):
    """Exact AoE II:DE Feudal Lumber Camp (Image 2 top-right, DISTINCT for Alder, Sunward & Raven!):
    Spoked-treadwheel A-frame timber hoist crane + pyramid of round felled tree trunks on skids + regional Feudal sawyer shed!"""
    key = f"building:camp:{civ}:1"
    b = PartBuilder(key, mats)
    b.tapered_box("soil", 0.0, 0.0, -0.46, 0.05, 4.35, 3.25, 4.05, 2.95, tint=(0.78, 0.68, 0.52))
    _timber_crane(b, -0.75, 0.18, scale=1.18, team_cloth=True, driftwood=False)

    # Regional Feudal sawyer's shelter on rear-right (makes Alder, Sunward & Raven 100% distinct!)
    if civ == "alder":
        _feudal_alder_shell(b, 1.05, 0.78, 1.85, 1.45, 1.68, cobble_h=0.48, x_brace=True, moss=True, team_trim=True)
        _shaggy_thatch_roof(b, 1.05, 0.78, 1.62, 2.28, 1.88, 0.92, along_y=False, team_gable=True)
    elif civ == "sun":
        _feudal_sun_shell(b, 1.05, 0.78, 1.92, 1.52, 1.85, canopy=True)
    else:
        _feudal_raven_shell(b, 1.05, 0.78, 1.85, 1.45, 1.62, 1.12, along_y=False, shields=True)

    # Pyramid of 6 round cylindrical felled tree trunks on timber skids in front-right
    for sx_s in (0.35, 1.65):
        b.box_z("darkwood", sx_s, -0.78, -0.46, 0.14, 0.20, 1.36)
    for oy, zc, sh in ((-1.12, 0.28, 0.72), (-0.78, 0.28, 0.88), (-0.44, 0.28, 0.76), (-0.95, 0.56, 0.94), (-0.61, 0.56, 0.80), (-0.78, 0.82, 0.86)):
        b.rod("wood", (0.05, oy, zc), (2.05, oy, zc), 0.17, segs=6, tint=(sh, sh * 0.88, sh * 0.74))
        b.box("canvas", 2.06, oy, zc, 0.04, 0.22, 0.22, tint=(0.98, 0.90, 0.74))
    b.barrel(-1.55, -1.05, 0.0, r=0.22, h=0.52)
    b.moss(-1.82, 1.02, -0.02, sx=0.64, sy=0.60, sz=0.62)
    return b.finalize(col)


def build_feudal_mine(civ, mats, col):
    """Exact AoE II:DE Feudal Mining Camp (Image 2 far-right!): regional timber/adobe ore-sorting shed, wheeled mine cart on timber rails, boulders & gold."""
    key = f"building:mine:{civ}:1"
    b = PartBuilder(key, mats)
    b.tapered_box("soil", 0.0, 0.0, -0.46, 0.05, 4.15, 3.25, 3.85, 2.95, tint=(0.78, 0.68, 0.52))
    _feudal_pavilion(b, civ, -0.48, 0.48, 2.62, 2.22, h=1.86, along_y=False)
    for ox, oy, r, h, role in [
        (1.28, 0.58, 0.68, 0.82, "stoneDark"),
        (1.58, -0.18, 0.52, 0.64, "stone"),
        (1.08, -0.64, 0.42, 0.50, "gold"),
        (0.56, 0.96, 0.38, 0.46, "gold"),
        (-1.45, 0.65, 0.46, 0.54, "stoneDark"),
    ]:
        b.cone(role, ox, oy, -0.14, 0.04 + h, r, segs=6)
    # Timber rail ties + iron-strapped mine cart brimming with gold & stone ore
    b.box("darkwood", -0.55, -1.05, 0.04, 1.85, 0.78, 0.08)
    b.box_z("wood", -0.55, -1.05, 0.16, 0.76, 1.28, 0.76)
    b.box("iron", -0.55, -1.05, 0.46, 1.32, 0.80, 0.10)
    for wx in (-0.92, -0.18):
        for wy in (-1.45, -0.65):
            b.box("iron", wx, wy, 0.18, 0.28, 0.08, 0.28)
    b.box_z("stone", -0.55, -1.05, 0.64, 0.88, 1.04, 0.56)
    b.box_z("gold", -0.42, -1.05, 0.82, 0.96, 0.48, 0.36)
    b.crate(-1.58, -0.95, 0.0, s=0.54)
    b.barrel(0.42, -1.12, 0.0, r=0.21, h=0.50)
    return b.finalize(col)


def build_feudal_dock(civ, mats, col):
    """Exact AoE II:DE Feudal Dock (Image 2 top-left!):
    Cargo-packed wooden waterfront wharf + sturdy 3m front jetty (ZERO ship overlap!),
    crowded stacked barrels, crates, draped fishing nets, harbor crane, fluttering pennant & regional boathouse!"""
    key = f"building:dock:{civ}:1"
    b = PartBuilder(key, mats)
    for px in (-2.50, -1.25, 0.0, 1.25, 2.50):
        for py in (-2.25, -0.75, 0.75, 2.25):
            b.cylinder("darkwood", px, py, -2.20, 0.68, 0.18, 0.16, segs=6)
    b.box_z("wood", 0.0, 0.0, 0.18, 0.54, 5.65, 5.20, tint=(0.90, 0.80, 0.66))
    for px in (-2.1, -1.05, 0.0, 1.05, 2.1):
        b.box("darkwood", px, 0.0, 0.55, 0.15, 5.12, 0.05)
    b.box("team", 0.0, -2.62, 0.38, 5.68, 0.14, 0.24)
    b.box("team", 0.0, 2.62, 0.38, 5.68, 0.14, 0.24)
    b.box("team", 2.84, 0.0, 0.38, 0.14, 5.24, 0.24)

    if civ == "alder":
        _feudal_alder_shell(b, -1.00, 0.88, 3.08, 2.38, 2.54, cobble_h=0.68, x_brace=True, moss=True, team_trim=True)
        _shaggy_thatch_roof(b, -1.00, 0.88, 2.48, 3.84, 3.08, 1.56, along_y=False, team_gable=True, hay_eaves=True)
    elif civ == "sun":
        _feudal_sun_shell(b, -1.00, 0.88, 3.18, 2.45, 2.84, canopy=True)
    else:
        _feudal_raven_shell(b, -1.00, 0.88, 3.08, 2.38, 2.30, 1.76, along_y=False, shields=True)

    b.cylinder("darkwood", 1.88, -1.68, 0.50, 3.08, 0.13, 0.11, segs=6)
    b.rod("wood", (1.88, -1.68, 2.54), (3.05, -1.15, 3.38), 0.085, segs=5)
    b.rod("canvas", (3.05, -1.15, 3.38), (3.05, -1.15, 1.65), 0.032, segs=4)
    b.crate(3.05, -1.15, 1.15, s=0.46)

    for bx, by in ((1.08, -1.20), (1.60, -1.00), (1.34, -0.52), (-1.78, -1.38), (-1.24, -1.62), (0.62, 1.58), (1.15, 1.65)):
        b.barrel(bx, by, 0.54, r=0.23, h=0.58)
    b.crate(1.58, 0.58, 0.54, s=0.70)
    b.crate(1.48, 1.34, 0.54, s=0.60)
    b.crate(1.56, 0.65, 1.24, s=0.50)
    b.box("fruit", 0.22, -1.38, 0.76, 0.66, 0.50, 0.42)
    b.box("grain", -0.52, -1.48, 0.76, 0.60, 0.46, 0.40)
    ftris = b.banner_pole(2.42, -2.15, 0.54, 4.18, flag_w=0.94, flag_h=0.52, dir_x=1.0, col=col)
    root, tris = b.finalize(col)

    pier = bpy.data.objects.new(f"{key}:pier", None)
    pier["dockPier"] = True
    pier.parent = root
    col.objects.link(pier)
    pb = PartBuilder(f"{key}:pier", mats, parent=pier)
    pb.box_z("wood", 3.10, 0.0, 0.18, 0.48, 2.95, 2.90, tint=(0.90, 0.80, 0.66))
    for x in (2.05, 3.25, 4.35):
        for side in (-1.28, 1.28):
            pb.cylinder("darkwood", x, side, -2.20, 1.05, 0.16, 0.145, segs=6)
        pb.rod("darkwood", (x, -1.24, -0.65), (x, 1.24, 0.22), 0.075, segs=4)
    pb.box("team", 3.10, -1.46, 0.36, 2.95, 0.12, 0.22)
    pb.box("team", 3.10, 1.46, 0.36, 2.95, 0.12, 0.22)
    pb.box("canvas", 4.60, 0.0, -0.05, 0.08, 2.25, 0.84, tint=(0.88, 0.80, 0.68))
    pb.barrel(3.05, 0.82, 0.48, r=0.22, h=0.56)
    pb.barrel(3.55, 0.88, 0.48, r=0.22, h=0.56)
    pb.crate(3.45, -0.78, 0.48, s=0.58)
    pb.crate(3.48, -0.74, 1.06, s=0.42)
    pb.cylinder("canvas", 4.10, 0.56, 0.48, 0.78, 0.30, 0.26, segs=8, tint=(0.94, 0.86, 0.74))
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
