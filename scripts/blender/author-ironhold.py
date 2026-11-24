"""
Blender 4.5 LTS Authoring Script — The Ironhold Vanguard (4th Playable Civilization)
====================================================================================
Generates 30 closed-manifold, studio-calibrated 3D models into
`frontier-ironhold-raw.glb` (meshopt-packed via gltfpack into
`src/assets3d/frontier-ironhold.glb`):

  1. Unique Unit (1 articulated rig built on frontier-figures.blend anatomy):
       - unit:ironbreaker
         Heavy mountain-siege infantry carrying a massive forged breaching
         warhammer (right forearm), reinforced ironclad kite shield (left
         forearm), flat-topped riveted iron greathelm with team crest (head),
         layered banded iron pauldrons (arms), and armored siege tabard (torso),
         with real Blender BVH hemisphere raycast Vertex AO baked in.

  2. Feudal Age Mountain-Forge Buildings (12 models — building:<type>:iron:1):
       towncenter, house, barracks, range, stable, blacksmith, market, mill,
       camp, mine, tower, dock
       Signature style: battered dark-stone mountain footings, iron-strapped
       timber upper stories, stepped iron-ribbed slate/team roofs, stout stone
       forge chimneys with glowing hearths, ore hoists, and iron-rimmed shields.

  3. Castle & Imperial Age Mountain-Stronghold Buildings (17 models):
       - building:towncenter:iron:2  (Castle Age fortified mountain hall)
       - building:towncenter:iron:3  (Imperial Age golden-crowned citadel hall)
       - building:keep:iron:0        (Ironhold Bastion Fortress with 4 corner
                                      octagonal towers, braziers & portcullis)
       - building:workshop:iron:0    (Grand Siege Foundry with overhead timber-
                                      and-iron gantry crane & blast furnace)
       - building:wonder:iron:0      (Great Forge Monument / Eternal Anvil Spire)
       - building:<type>:iron:0 for house, barracks, range, stable, blacksmith,
         market, mill (animated windmill=True), camp, mine (iron headframe &
         ore cart), tower, monastery, dock (orientable dockPier=True).

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
from pathlib import Path
import bpy
import bmesh
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree


# ---------------------------------------------------------------------------
# Materials (every role exists in WorldView + ensureModels)
# ---------------------------------------------------------------------------
MAT_SPECS = {
    "wood": ((0.50, 0.37, 0.25, 1.0), 0.88, 0.0),
    "darkwood": ((0.22, 0.16, 0.12, 1.0), 0.90, 0.0),
    "trunk": ((0.44, 0.39, 0.34, 1.0), 0.94, 0.0),
    "plaster": ((0.84, 0.80, 0.72, 1.0), 0.92, 0.0),
    "stone": ((0.64, 0.62, 0.58, 1.0), 0.90, 0.0),
    "stoneDark": ((0.38, 0.40, 0.41, 1.0), 0.92, 0.0),
    "brick": ((0.56, 0.36, 0.25, 1.0), 0.88, 0.0),
    "straw": ((0.64, 0.51, 0.31, 1.0), 0.96, 0.0),
    "canvas": ((0.82, 0.72, 0.54, 1.0), 0.92, 0.0),
    "soil": ((0.48, 0.40, 0.30, 1.0), 0.96, 0.0),
    "leaf": ((0.31, 0.46, 0.23, 1.0), 0.92, 0.0),
    "leafDark": ((0.18, 0.32, 0.16, 1.0), 0.92, 0.0),
    "snow": ((0.95, 0.95, 0.93, 1.0), 0.86, 0.0),
    "iron": ((0.32, 0.35, 0.39, 1.0), 0.48, 0.52),
    "steel": ((0.74, 0.78, 0.82, 1.0), 0.32, 0.58),
    "gold": ((0.86, 0.68, 0.26, 1.0), 0.38, 0.52),
    "glow": ((0.98, 0.44, 0.12, 1.0), 0.35, 0.0),
    "glass": ((0.86, 0.72, 0.44, 1.0), 0.28, 0.05),
    "grain": ((0.92, 0.76, 0.34, 1.0), 0.90, 0.0),
    "fruit": ((0.72, 0.24, 0.20, 1.0), 0.82, 0.0),
    "leather": ((0.35, 0.26, 0.20, 1.0), 0.84, 0.0),
    "pants": ((0.32, 0.35, 0.29, 1.0), 0.90, 0.0),
    "skin": ((0.80, 0.62, 0.50, 1.0), 0.82, 0.0),
    "hair": ((0.24, 0.19, 0.15, 1.0), 0.88, 0.0),
    "team": ((0.77, 0.38, 0.24, 1.0), 0.84, 0.0),
    "teamRoof": ((0.64, 0.34, 0.24, 1.0), 0.84, 0.0),
}


def ensure_materials():
    mats = {}
    for name, (rgba, rough, metal) in MAT_SPECS.items():
        mat = bpy.data.materials.get(name) or bpy.data.materials.new(name=name)
        mat.use_nodes = True
        bsdf = mat.node_tree.nodes.get("Principled BSDF")
        if bsdf:
            bsdf.inputs["Base Color"].default_value = rgba
            bsdf.inputs["Roughness"].default_value = rough
            bsdf.inputs["Metallic"].default_value = metal
        mats[name] = mat
    return mats


# ---------------------------------------------------------------------------
# Closed-Manifold PartBuilder (grouped by material role -> minimal draw calls)
# ---------------------------------------------------------------------------
class PartBuilder:
    def __init__(self, key, mats, parent=None, uv_scale=0.36):
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

    def tapered_box(self, role, cx, cy, z0, z1, sx0, sy0, sx1, sy1, rot_z=0.0, tint=(1.0, 1.0, 1.0), z_grad=0.0):
        bm = self._bm(role)
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
        faces = [
            bm.faces.new((v3, v2, v1, v0)),
            bm.faces.new((v4, v5, v6, v7)),
            bm.faces.new((v0, v1, v5, v4)),
            bm.faces.new((v1, v2, v6, v5)),
            bm.faces.new((v2, v3, v7, v6)),
            bm.faces.new((v3, v0, v4, v7)),
        ]
        self._paint_faces(bm, faces, tint, z_grad)

    def cylinder(self, role, cx, cy, z0, z1, r0, r1=None, segs=8, rot_z=0.0, tint=(1.0, 1.0, 1.0), z_grad=0.0):
        if r1 is None:
            r1 = r0
        bm = self._bm(role)
        mat = Matrix.Translation((cx, cy, (z0 + z1) * 0.5)) @ Matrix.Rotation(rot_z, 4, "Z")
        res = bmesh.ops.create_cone(
            bm, cap_ends=True, cap_tris=False, segments=segs,
            radius1=r0, radius2=r1, depth=z1 - z0, matrix=mat,
        )
        verts = set(res["verts"])
        faces = [f for f in bm.faces if all(v in verts for v in f.verts)]
        self._paint_faces(bm, faces, tint, z_grad)

    def cone(self, role, cx, cy, z0, z1, r0, segs=8, rot_z=0.0, tint=(1.0, 1.0, 1.0), z_grad=0.18):
        self.cylinder(role, cx, cy, z0, z1, r0, 0.03, segs=segs, rot_z=rot_z, tint=tint, z_grad=z_grad)

    def rod(self, role, p0, p1, radius, segs=6, tint=(1.0, 1.0, 1.0)):
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

    def gable_prism(self, role, cx, cy, z_eave, sx, sy, ridge_h, along_y=True, tint=(1.0, 1.0, 1.0), z_grad=0.18):
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

    def lean_roof(self, role, cx, cy, z_low, z_high, sx, sy, high_side="+y", thick=0.14, tint=(1.0, 1.0, 1.0)):
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
        self._paint_faces(bm, faces, tint, z_grad=0.14)

    def banner_pole(self, x, y, z0, z1, flag_w=0.90, flag_h=0.50, dir_x=1.0, pole_role="iron", col=None):
        self.cylinder(pole_role, x, y, z0, z1 + 0.12, 0.055, 0.042, segs=6)
        self.box("gold", x, y, z1 + 0.16, 0.14, 0.14, 0.18)
        if col is not None:
            fg = bpy.data.objects.new(f"{self.key}:flag_{len(self.root.children)}", None)
            fg["flag"] = True
            fg.location = (x, y, z1)
            fg.parent = self.root
            col.objects.link(fg)
            fb = PartBuilder(fg.name, self.mats, parent=fg)
            fb.box("team", dir_x * flag_w * 0.28, 0.03, -flag_h * 0.48, flag_w * 0.56, 0.055, flag_h)
            fb.box("team", dir_x * flag_w * 0.78, -0.03, -flag_h * 0.44, flag_w * 0.46, 0.055, flag_h * 0.80)
            fb.box("iron", dir_x * flag_w * 0.28, 0.03, -flag_h * 0.48, flag_w * 0.58, 0.065, flag_h * 0.16)
            _, ftris = fb.finalize(col, link_root=False)
            return ftris
        self.box("team", x + dir_x * flag_w * 0.50, y, z1 - flag_h * 0.48, flag_w, 0.055, flag_h)
        return 0

    def barrel(self, x, y, z0, r=0.22, h=0.56):
        self.cylinder("wood", x, y, z0, z0 + h, r, r * 0.96, segs=6, tint=(0.90, 0.84, 0.76))
        self.cylinder("iron", x, y, z0 + h * 0.22, z0 + h * 0.32, r * 1.05, r * 1.05, segs=6)
        self.cylinder("iron", x, y, z0 + h * 0.68, z0 + h * 0.78, r * 1.05, r * 1.05, segs=6)

    def crate(self, x, y, z0, s=0.56):
        self.box_z("wood", x, y, z0, z0 + s, s, s, tint=(0.92, 0.88, 0.82))
        self.box("iron", x, y, z0 + s * 0.5, s + 0.05, s * 0.14, s + 0.05)

    def anvil(self, x, y, z0, scale=1.0):
        self.cylinder("darkwood", x, y, z0 - 0.06, z0 + 0.52 * scale, 0.30 * scale, 0.26 * scale, segs=6)
        self.box_z("iron", x, y, z0 + 0.48 * scale, z0 + 0.68 * scale, 0.46 * scale, 0.30 * scale)
        self.box_z("iron", x, y, z0 + 0.66 * scale, z0 + 0.92 * scale, 0.78 * scale, 0.34 * scale)
        self.tapered_box("steel", x + 0.44 * scale, y, z0 + 0.72 * scale, z0 + 0.90 * scale, 0.28 * scale, 0.24 * scale, 0.16 * scale, 0.14 * scale)

    def brazier(self, x, y, z0, h=0.95, r=0.34):
        self.tapered_box("stoneDark", x, y, z0, z0 + h * 0.62, r * 2.1, r * 2.1, r * 1.5, r * 1.5)
        self.cylinder("iron", x, y, z0 + h * 0.58, z0 + h, r * 0.95, r * 1.25, segs=8)
        self.cylinder("glow", x, y, z0 + h * 0.85, z0 + h + 0.16, r * 0.82, r * 0.46, segs=8)

    def iron_shield(self, x, y, z, face="-y", scale=1.0):
        sx, sy = (0.48 * scale, 0.10) if face in ("-y", "+y") else (0.10, 0.48 * scale)
        self.box("iron", x, y, z, sx, sy, 0.62 * scale)
        self.box("team", x + (0.0 if face in ("-y", "+y") else (0.04 if face == "+x" else -0.04)),
                 y + (0.0 if face in ("-x", "+x") else (-0.04 if face == "-y" else 0.04)),
                 z, sx * 0.78 if face in ("-y", "+y") else 0.08, sy * 0.78 if face in ("-x", "+x") else 0.08, 0.48 * scale)
        self.box("steel", x + (0.0 if face in ("-y", "+y") else (0.07 if face == "+x" else -0.07)),
                 y + (0.0 if face in ("-x", "+x") else (-0.07 if face == "-y" else 0.07)),
                 z, 0.14 * scale, 0.14 * scale, 0.14 * scale)

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
            tris += sum(max(1, len(p.vertices) - 2) for p in mesh.polygons)
            obj = bpy.data.objects.new(f"{self.key}:{role}", mesh)
            obj["assetMaterial"] = role
            obj.parent = self.root
            collection.objects.link(obj)
        return self.root, tris


# ---------------------------------------------------------------------------
# Ironhold Signature Architectural Modules (Mountain-Forge Identity)
# ---------------------------------------------------------------------------
def ironhold_hall(b, cx, cy, sx, sy, wall_h, plinth_h=0.95, upper_role="stone", feudal=False, windows=True, buttresses=True):
    """Sturdy battered mountain-stone base + recessed upper story + sloped corner buttresses + iron framing."""
    # Battered stone plinth extending -0.46m into terrain so slopes never float
    b.tapered_box("stoneDark", cx, cy, -0.46, plinth_h, sx + 0.56, sy + 0.56, sx + 0.14, sy + 0.14, z_grad=0.18)
    # Stone water-table sill molding
    b.box("iron", cx, cy, plinth_h + 0.06, sx + 0.24, sy + 0.24, 0.14)
    # Main upper masonry walls
    b.box_z(upper_role, cx, cy, plinth_h + 0.05, wall_h, sx, sy, z_grad=0.14)
    # Heavy stone-and-iron eaves cornice band
    b.box("stoneDark", cx, cy, wall_h - 0.06, sx + 0.34, sy + 0.34, 0.22)
    b.box("iron", cx, cy, wall_h + 0.08, sx + 0.40, sy + 0.40, 0.12)

    # Signature Ironhold sloped stone corner buttresses with iron cap-straps
    if buttresses:
        hx, hy = sx * 0.5, sy * 0.5
        bw = 0.42 if feudal else 0.54
        for sx_s in (-1.0, 1.0):
            for sy_s in (-1.0, 1.0):
                bx = cx + sx_s * (hx + 0.06)
                by = cy + sy_s * (hy + 0.06)
                b.tapered_box("stoneDark", bx, by, -0.46, wall_h * 0.88, bw * 1.38, bw * 1.38, bw * 0.78, bw * 0.78)
                b.box("iron", bx, by, wall_h * 0.88, bw * 0.86, bw * 0.86, 0.14)

    # Recessed dark-timber & iron frame ribs on Feudal halls
    if feudal:
        hx, hy = sx * 0.5, sy * 0.5
        for fx in (-hx * 0.48, 0.0, hx * 0.48):
            b.box_z("darkwood", cx + fx, cy - hy - 0.03, plinth_h + 0.12, wall_h - 0.10, 0.16, 0.10)
            b.box_z("darkwood", cx + fx, cy + hy + 0.03, plinth_h + 0.12, wall_h - 0.10, 0.16, 0.10)
        b.box("darkwood", cx, cy - hy - 0.04, (plinth_h + wall_h) * 0.52, sx + 0.08, 0.10, 0.16)
        b.box("darkwood", cx, cy + hy + 0.04, (plinth_h + wall_h) * 0.52, sx + 0.08, 0.10, 0.16)

    # Recessed glowing arched forge-hall windows along front & sides
    if windows:
        hx, hy = sx * 0.5, sy * 0.5
        wz = plinth_h + (wall_h - plinth_h) * 0.52
        wh = min(0.88, (wall_h - plinth_h) * 0.48)
        n_win = 2 if sx >= 3.4 else 1
        offsets = (-sx * 0.25, sx * 0.25) if n_win == 2 else (0.0,)
        for ox in offsets:
            b.box("iron", cx + ox, cy - hy - 0.04, wz, 0.58, 0.12, wh + 0.18)
            b.box("glass", cx + ox, cy - hy - 0.06, wz, 0.40, 0.10, wh)
            b.box("iron", cx + ox, cy - hy - 0.08, wz, 0.06, 0.08, wh + 0.06)
        # Side windows
        b.box("iron", cx - hx - 0.04, cy, wz, 0.12, 0.54, wh + 0.16)
        b.box("glass", cx - hx - 0.06, cy, wz, 0.10, 0.38, wh)
        b.box("iron", cx + hx + 0.04, cy, wz, 0.12, 0.54, wh + 0.16)
        b.box("glass", cx + hx + 0.06, cy, wz, 0.10, 0.38, wh)


def ironhold_roof(b, cx, cy, z_eave, sx, sy, ridge_h, along_y=False, stepped=True, finial_role="iron"):
    """Signature Ironhold stepped iron-ribbed gabled roof with teamRoof slopes & forged ridge spine."""
    # Main team-colored slate/iron roof prism
    b.gable_prism("teamRoof", cx, cy, z_eave, sx, sy, ridge_h, along_y=along_y, z_grad=0.14)
    # Heavy forged iron eave trims & bold central ridge beam
    if along_y:
        b.box("iron", cx, cy, z_eave + ridge_h + 0.08, 0.24, sy + 0.30, 0.22)
        b.box("steel", cx, cy, z_eave + ridge_h + 0.20, 0.12, sy + 0.24, 0.08)
        for side in (-1.0, 1.0):
            b.box("iron", cx + side * sx * 0.50, cy, z_eave + 0.06, 0.16, sy + 0.18, 0.18)
        # Forged iron roof trusses / transverse ribs gripping the slopes
        ribs = 3 if sy >= 3.2 else 2
        for i in range(ribs):
            t = -0.34 + 0.68 * (i / max(1, ribs - 1))
            ry = cy + t * sy
            b.rod("iron", (cx - sx * 0.50, ry, z_eave + 0.04), (cx, ry, z_eave + ridge_h + 0.08), 0.095, segs=6)
            b.rod("iron", (cx + sx * 0.50, ry, z_eave + 0.04), (cx, ry, z_eave + ridge_h + 0.08), 0.095, segs=6)
        # Stepped dwarf-stone parapet gables at front & back
        if stepped:
            for gy in (cy - sy * 0.50, cy + sy * 0.50):
                b.box("stoneDark", cx, gy, z_eave + ridge_h * 0.24, sx * 0.88, 0.22, ridge_h * 0.34)
                b.box("stoneDark", cx, gy, z_eave + ridge_h * 0.58, sx * 0.54, 0.24, ridge_h * 0.34)
                b.box("stoneDark", cx, gy, z_eave + ridge_h * 0.88, sx * 0.24, 0.26, ridge_h * 0.30)
                b.box(finial_role, cx, gy, z_eave + ridge_h + 0.26, 0.20, 0.20, 0.44)
    else:
        b.box("iron", cx, cy, z_eave + ridge_h + 0.08, sx + 0.30, 0.24, 0.22)
        b.box("steel", cx, cy, z_eave + ridge_h + 0.20, sx + 0.24, 0.12, 0.08)
        for side in (-1.0, 1.0):
            b.box("iron", cx, cy + side * sy * 0.50, z_eave + 0.06, sx + 0.18, 0.16, 0.18)
        ribs = 3 if sx >= 3.2 else 2
        for i in range(ribs):
            t = -0.34 + 0.68 * (i / max(1, ribs - 1))
            rx = cx + t * sx
            b.rod("iron", (rx, cy - sy * 0.50, z_eave + 0.04), (rx, cy, z_eave + ridge_h + 0.08), 0.095, segs=6)
            b.rod("iron", (rx, cy + sy * 0.50, z_eave + 0.04), (rx, cy, z_eave + ridge_h + 0.08), 0.095, segs=6)
        if stepped:
            for gx in (cx - sx * 0.50, cx + sx * 0.50):
                b.box("stoneDark", gx, cy, z_eave + ridge_h * 0.24, 0.22, sy * 0.88, ridge_h * 0.34)
                b.box("stoneDark", gx, cy, z_eave + ridge_h * 0.58, 0.24, sy * 0.54, ridge_h * 0.34)
                b.box("stoneDark", gx, cy, z_eave + ridge_h * 0.88, 0.26, sy * 0.24, ridge_h * 0.30)
                b.box(finial_role, gx, cy, z_eave + ridge_h + 0.26, 0.20, 0.20, 0.44)


def ironhold_chimney(b, x, y, z0, z1, base_w=1.18, top_w=0.72, glow_face="-y"):
    """Iconic tapered stone mountain forge chimney with glowing hearth & iron flue cap."""
    mid = z0 + (z1 - z0) * 0.45
    b.tapered_box("stoneDark", x, y, z0, mid, base_w, base_w, base_w * 0.78, base_w * 0.78)
    b.tapered_box("stone", x, y, mid - 0.05, z1, base_w * 0.76, base_w * 0.76, top_w, top_w)
    b.box("iron", x, y, z1 + 0.08, top_w + 0.22, top_w + 0.22, 0.18)
    b.box("glow", x, y, z1 + 0.20, top_w * 0.54, top_w * 0.54, 0.10)
    # Iron hood bars over chimney stack
    for sx in (-top_w * 0.36, top_w * 0.36):
        b.box("iron", x + sx, y, z1 + 0.34, 0.09, 0.09, 0.36)
    b.tapered_box("iron", x, y, z1 + 0.48, z1 + 0.72, top_w + 0.16, top_w + 0.16, top_w * 0.42, top_w * 0.42)
    # Glowing lower hearth arch
    if glow_face == "-y":
        b.box("iron", x, y - base_w * 0.48, max(0.55, z0 + 0.95), base_w * 0.62, 0.16, 0.76)
        b.box("glow", x, y - base_w * 0.52, max(0.52, z0 + 0.92), base_w * 0.46, 0.14, 0.56)


def ironhold_door(b, x, y, z0, w=1.08, h=1.82, face="-y"):
    """Heavy arched stone doorway with iron-banded dark oak gate & iron keystone."""
    if face == "-y":
        b.box_z("stoneDark", x - w * 0.56, y - 0.04, z0, z0 + h + 0.22, 0.28, 0.32)
        b.box_z("stoneDark", x + w * 0.56, y - 0.04, z0, z0 + h + 0.22, 0.28, 0.32)
        b.box("stoneDark", x, y - 0.04, z0 + h + 0.20, w + 0.62, 0.34, 0.28)
        b.box("iron", x, y - 0.12, z0 + h + 0.22, 0.26, 0.22, 0.34)
        b.box_z("darkwood", x, y - 0.02, z0, z0 + h + 0.04, w, 0.18)
        for hz in (0.35, 0.68):
            b.box("iron", x, y - 0.11, z0 + h * hz, w + 0.04, 0.08, 0.11)
        b.box_z("stoneDark", x, y - 0.36, -0.46, z0 + 0.16, w + 0.52, 0.62)


def ironhold_turret(b, cx, cy, z0, h, r=1.18, roof_h=2.15, crenellated=True, gold_trim=False):
    """Octagonal battered mountain stone bastion turret with iron ribs and pitched iron/team crown."""
    b.cylinder("stoneDark", cx, cy, z0, z0 + 1.35, r * 1.18, r * 1.02, segs=8)
    b.cylinder("stone", cx, cy, z0 + 1.25, h, r, r * 0.94, segs=8, z_grad=0.14)
    b.cylinder("iron", cx, cy, h * 0.58, h * 0.58 + 0.16, r * 1.02, r * 1.02, segs=8)
    # Corbeled stone gallery
    b.cylinder("stoneDark", cx, cy, h - 0.12, h + 0.34, r * 0.98, r * 1.18, segs=8)
    b.cylinder("iron", cx, cy, h + 0.32, h + 0.46, r * 1.22, r * 1.22, segs=8)
    if crenellated:
        for i in range(8):
            a = i * math.pi * 0.25
            mx = cx + math.cos(a) * r * 1.08
            my = cy + math.sin(a) * r * 1.08
            b.box_z("stone", mx, my, h + 0.44, h + 1.02, 0.44, 0.44, rot_z=a)
            b.box("iron", mx, my, h + 1.04, 0.48, 0.48, 0.09, rot_z=a)
    if roof_h > 0:
        rz = h + (0.82 if crenellated else 0.42)
        b.cone("teamRoof", cx, cy, rz, rz + roof_h, r * 1.18, segs=8, z_grad=0.16)
        for i in range(4):
            a = i * math.pi * 0.5 + math.pi * 0.25
            b.rod("iron", (cx + math.cos(a) * r * 1.16, cy + math.sin(a) * r * 1.16, rz),
                  (cx, cy, rz + roof_h + 0.06), 0.075, segs=5)
        b.cylinder("gold" if gold_trim else "steel", cx, cy, rz + roof_h - 0.04, rz + roof_h + 0.56, 0.10, 0.03, segs=6)


def ironhold_horse(b, cx, cy, z0=0.0, coat_tint=(0.42, 0.34, 0.28)):
    b.box("wood", cx, cy + 0.10, z0 + 0.88, 0.48, 1.10, 0.48, tint=coat_tint)
    b.tapered_box("wood", cx, cy - 0.38, z0 + 0.96, z0 + 1.48, 0.32, 0.38, 0.24, 0.28, tint=coat_tint)
    b.box("wood", cx, cy - 0.56, z0 + 1.38, 0.24, 0.42, 0.24, tint=coat_tint)
    b.box("iron", cx, cy - 0.52, z0 + 1.48, 0.26, 0.36, 0.12)
    for lx in (-0.15, 0.15):
        for ly in (-0.28, 0.46):
            b.box_z("wood", cx + lx, cy + ly, z0, z0 + 0.72, 0.12, 0.12, tint=coat_tint)
    b.box_z("darkwood", cx, cy + 0.68, z0 + 0.36, z0 + 0.98, 0.10, 0.12)


# ---------------------------------------------------------------------------
# 1. Bespoke Blender 4.5 LTS Unit: unit:ironbreaker
# ---------------------------------------------------------------------------
def bake_figure_ao(root_obj, target_objs):
    """Bake real Blender BVH hemisphere raycast Vertex AO into BakedDepth."""
    def descendants(o):
        return [o] + [p for c in o.children for p in descendants(c)]

    ao_bm = bmesh.new()
    inv_root = root_obj.matrix_world.inverted()
    for obj in descendants(root_obj)[1:]:
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
                n = Vector((0, 0, 1))
            ref = Vector((1, 0, 0)) if abs(n.x) < 0.85 else Vector((0, 1, 0))
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


def _add_unit_part(parent, col, name, bm, role, mats, motion_dict, figure_part=None):
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
    mesh.materials.append(mats[role])
    obj = bpy.data.objects.new(name, mesh)
    obj["assetMaterial"] = role
    obj["motion"] = motion_dict
    if figure_part:
        obj["figurePart"] = figure_part
    obj.parent = parent
    col.objects.link(obj)
    tris = sum(max(1, len(p.vertices) - 2) for p in mesh.polygons)
    return obj, tris


def build_ironbreaker_unit(project_root, mats, col):
    """
    Build unit:ironbreaker on top of the studio-refined frontier-figures.blend
    swordsman skeleton so foot contact, proportions, and combat animations are
    100% native — replacing sword, buckler, and helmet with bespoke Blender
    Ironhold Siege Warhammer, Ironclad Kite Shield, Riveted Greathelm,
    Layered Iron Pauldrons, and Armored Tabard.
    """
    blend_path = Path(project_root) / "art" / "figures" / "frontier-figures.blend"
    assert blend_path.is_file(), f"Missing {blend_path}"

    # Load only unit:swordsman hierarchy from frontier-figures.blend
    with bpy.data.libraries.load(str(blend_path), link=False) as (data_from, data_to):
        data_to.objects = [n for n in data_from.objects if n.startswith("asset__unit__swordsman")]

    src_root = next(o for o in data_to.objects if o and o.get("assetKey") == "unit:swordsman")
    # Strip sword (Figure23, Figure24), shield (Figure25, Figure26), helmet (Figure7, Figure8), plain tabard/buckle (Figure3, Figure4)
    strip_suffixes = ("_Figure23", "_Figure24", "_Figure25", "_Figure26", "_Figure7", "_Figure8", "_Figure3", "_Figure4")

    root = bpy.data.objects.new("asset__unit__ironbreaker", None)
    root["assetKey"] = "unit:ironbreaker"
    col.objects.link(root)

    # Coordinate note: in frontier-figures.blend (Blender Z-up, -Y forward -> Three.js Y-up, +Z forward):
    # Let's detect swordsman forward axis directly from Figure25 (shield) or Hand positions so gear aligns 100%!
    hand_r = next((o for o in data_to.objects if o and o.type == "MESH" and o.get("motion") and o["motion"].get("type") == "forearm" and o["motion"].get("side") == 1 and o.get("assetMaterial") == "skin"), None)
    hand_l = next((o for o in data_to.objects if o and o.type == "MESH" and o.get("motion") and o["motion"].get("type") == "forearm" and o["motion"].get("side") == -1 and o.get("assetMaterial") == "skin"), None)
    head_obj = next((o for o in data_to.objects if o and o.type == "MESH" and o.get("motion") and o["motion"].get("type") == "head" and o.get("assetMaterial") == "skin"), None)
    assert hand_r and hand_l and head_obj, "Could not locate figure anchor parts"

    def obj_center(o):
        pts = [o.matrix_world @ Vector(c) for c in o.bound_box]
        return sum(pts, Vector((0, 0, 0))) / len(pts)

    hr = obj_center(hand_r)   # Right hand in Blender Z-up
    hl = obj_center(hand_l)   # Left hand in Blender Z-up
    hc = obj_center(head_obj) # Head center in Blender Z-up
    # Forward direction in Blender: hands are slightly forward of torso (check sign of hr.y)
    fwd_sign = -1.0 if hr.y < 0.0 else 1.0

    # Copy kept studio anatomy parts under root
    kept_tris = 0
    for src in data_to.objects:
        if not src or src is src_root or src.type != "MESH":
            continue
        if any(src.name.endswith(suf) for suf in strip_suffixes):
            bpy.data.objects.remove(src, do_unlink=True)
            continue
        src.name = src.name.replace("asset__unit__swordsman", "asset__unit__ironbreaker")
        src.parent = root
        role = src.get("assetMaterial") or "steel"
        if role in mats:
            src.data.materials.clear()
            src.data.materials.append(mats[role])
        col.objects.link(src)
        kept_tris += sum(max(1, len(p.vertices) - 2) for p in src.data.polygons)
    bpy.data.objects.remove(src_root, do_unlink=True)

    # Exact Three.js-compatible motion dicts (copied straight from swordsman's verified pivots!)
    m_torso = {"type": "torso", "pivot": [0.0, 1.28, 0.0], "side": 1}
    m_head = {"type": "head", "pivot": [0.0, 2.14, 0.0], "side": 1, "parent": m_torso}
    m_arm_l = {"type": "arm", "pivot": [-0.35, 1.925, 0.0], "side": -1, "parent": m_torso}
    m_arm_r = {"type": "arm", "pivot": [0.35, 1.925, 0.0], "side": 1, "parent": m_torso}
    m_fore_l = {"type": "forearm", "pivot": [-0.46, 1.63, 0.035], "side": -1, "parent": m_arm_l}
    m_fore_r = {"type": "forearm", "pivot": [0.46, 1.63, 0.035], "side": 1, "parent": m_arm_r}

    created_objs = []
    added_tris = 0

    def create_mesh_part(suffix, role, motion_dict, build_fn, figure_part=None):
        nonlocal added_tris
        bm = bmesh.new()
        build_fn(bm)
        obj, t = _add_unit_part(root, col, f"asset__unit__ironbreaker_{suffix}", bm, role, mats, motion_dict, figure_part)
        created_objs.append(obj)
        added_tris += t

    def add_box(bm, cx, cy, cz, sx, sy, sz, rot_x=0.0, rot_y=0.0, rot_z=0.0):
        mat = (
            Matrix.Translation((cx, cy, cz))
            @ Matrix.Rotation(rot_z, 4, "Z")
            @ Matrix.Rotation(rot_y, 4, "Y")
            @ Matrix.Rotation(rot_x, 4, "X")
            @ Matrix.Diagonal((sx, sy, sz, 1.0))
        )
        bmesh.ops.create_cube(bm, size=1.0, matrix=mat)

    def add_cyl(bm, cx, cy, cz, r1, r2, depth, segs=8, rot_x=0.0, rot_y=0.0, rot_z=0.0):
        mat = (
            Matrix.Translation((cx, cy, cz))
            @ Matrix.Rotation(rot_z, 4, "Z")
            @ Matrix.Rotation(rot_y, 4, "Y")
            @ Matrix.Rotation(rot_x, 4, "X")
        )
        bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=segs, radius1=r1, radius2=r2, depth=depth, matrix=mat)

    # A. RIVETED MOUNTAIN GREATHELM (Head)
    hz = hc.z + 0.14
    def build_helm_iron(bm):
        # Barrel helm shell
        add_cyl(bm, 0.0, hc.y, hz + 0.02, 0.185, 0.172, 0.36, segs=10)
        # Beveled crown cap
        add_cyl(bm, 0.0, hc.y, hz + 0.22, 0.172, 0.125, 0.06, segs=10)
        # Heavy forged cheek-and-brow reinforcing bands
        add_box(bm, 0.0, hc.y + fwd_sign * 0.172, hz + 0.02, 0.26, 0.04, 0.045)
        add_box(bm, 0.0, hc.y + fwd_sign * 0.176, hz - 0.04, 0.055, 0.04, 0.20)
    create_mesh_part("GreathelmIron", "iron", m_head, build_helm_iron, "Riveted iron greathelm")

    def build_helm_gold(bm):
        # Gilded nasal & crown band
        add_cyl(bm, 0.0, hc.y, hz + 0.19, 0.184, 0.184, 0.036, segs=10)
        add_box(bm, 0.0, hc.y + fwd_sign * 0.186, hz + 0.02, 0.04, 0.025, 0.18)
    create_mesh_part("GreathelmTrim", "gold", m_head, build_helm_gold)

    def build_helm_crest(bm):
        # Bold Ironhold mountain crest comb (team heraldry!)
        add_box(bm, 0.0, hc.y - fwd_sign * 0.02, hz + 0.29, 0.055, 0.30, 0.12)
        add_box(bm, 0.0, hc.y - fwd_sign * 0.06, hz + 0.36, 0.042, 0.24, 0.07)
    create_mesh_part("GreathelmCrest", "team", m_head, build_helm_crest)

    def add_kite_prism(bm, cx, cy, cz, w_top, h_top, h_bot, depth, y_dir=1.0):
        """True forged hexagonal tapered kite-shield solid (zero stair-stepping!)."""
        pts = [
            (-w_top * 0.42, h_top),
            (w_top * 0.42, h_top),
            (w_top * 0.50, h_top * 0.52),
            (w_top * 0.34, -h_bot * 0.35),
            (0.0, -h_bot),
            (-w_top * 0.34, -h_bot * 0.35),
            (-w_top * 0.50, h_top * 0.52),
        ]
        hy = depth * 0.5
        back = [bm.verts.new((cx + px, cy - y_dir * hy, cz + pz)) for px, pz in pts]
        front = [bm.verts.new((cx + px, cy + y_dir * hy, cz + pz)) for px, pz in pts]
        bm.faces.new(list(reversed(back)))
        bm.faces.new(front)
        n = len(pts)
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((back[i], back[j], front[j], front[i]))

    # B. LAYERED CURVED BANDED IRON PAULDRONS (Left & Right Arm)
    for side, m_arm, tag in ((-1, m_arm_l, "L"), (1, m_arm_r, "R")):
        sx = side * 0.37
        def build_pauldron(bm, s=side, x0=sx):
            # Rounded domed shoulder plates (beveled cylinders/lames hugging shoulder curvature)
            add_cyl(bm, x0, 0.0, 1.96, 0.145, 0.120, 0.11, segs=10, rot_y=s * 0.34)
            add_cyl(bm, x0 + s * 0.045, 0.0, 1.87, 0.132, 0.116, 0.085, segs=10, rot_y=s * 0.46)
            add_cyl(bm, x0 + s * 0.072, 0.0, 1.79, 0.115, 0.102, 0.068, segs=10, rot_y=s * 0.54)
        create_mesh_part(f"PauldronIron{tag}", "iron", m_arm, build_pauldron)

        def build_pauldron_trim(bm, s=side, x0=sx):
            add_cyl(bm, x0 + s * 0.015, 0.0, 2.01, 0.128, 0.092, 0.04, segs=10, rot_y=s * 0.34)
        create_mesh_part(f"PauldronRim{tag}", "steel", m_arm, build_pauldron_trim)

    # C. SLEEK FORGED HERALDIC WAIST SURCOAT & ARMORED TASSETS (Torso)
    def build_tabard(bm):
        # Tapered cloth waist tabard hanging below the steel breastplate & belt (lets sculpted cuirass shine!)
        add_kite_prism(bm, 0.0, fwd_sign * 0.188, 1.18, 0.30, 0.18, 0.34, 0.032, y_dir=fwd_sign)
        add_kite_prism(bm, 0.0, -fwd_sign * 0.185, 1.24, 0.32, 0.24, 0.32, 0.032, y_dir=-fwd_sign)
        # Sleek team heraldic chest sash chevron over cuirass
        add_kite_prism(bm, 0.0, fwd_sign * 0.205, 1.62, 0.28, 0.20, 0.26, 0.024, y_dir=fwd_sign)
    create_mesh_part("SiegeTabard", "team", m_torso, build_tabard)

    def build_tassets(bm):
        # Forged iron war-belt + contoured hip tassets
        add_cyl(bm, 0.0, 0.0, 1.33, 0.265, 0.260, 0.072, segs=12)
        for s in (-1.0, 1.0):
            add_box(bm, s * 0.22, fwd_sign * 0.11, 1.19, 0.15, 0.18, 0.22, rot_y=-s * 0.14)
            add_box(bm, s * 0.24, fwd_sign * 0.09, 1.04, 0.13, 0.16, 0.12, rot_y=-s * 0.18)
    create_mesh_part("ArmoredTassets", "iron", m_torso, build_tassets)

    # D. MASSIVE FORGED SIEGE WARHAMMER / BREACHING MAUL (Right Forearm, side=+1)
    wx, wy, wz = hr.x, hr.y, hr.z
    def build_maul_haft(bm):
        # Heavy ash-wood warhammer shaft running vertically through right hand
        add_cyl(bm, wx, wy, wz + 0.38, 0.036, 0.042, 1.32, segs=8)
    create_mesh_part("MaulHaft", "darkwood", m_fore_r, build_maul_haft)

    def build_maul_iron(bm):
        # Pommel cap & forged iron socket collar
        add_cyl(bm, wx, wy, wz - 0.28, 0.056, 0.048, 0.10, segs=8)
        add_cyl(bm, wx, wy, wz + 0.90, 0.056, 0.064, 0.20, segs=8)
        # Massive octagonal breaching hammer block oriented forward/back along Y!
        add_cyl(bm, wx, wy, wz + 1.06, 0.135, 0.135, 0.44, segs=8, rot_x=math.pi * 0.5)
        # Top forging crown spike
        add_cyl(bm, wx, wy, wz + 1.24, 0.062, 0.012, 0.16, segs=6)
    create_mesh_part("MaulHeadIron", "iron", m_fore_r, build_maul_iron)

    def build_maul_steel(bm):
        # Gleaming flanged striking face (forward) + armor-piercing crow-beak spike (rear)
        add_cyl(bm, wx, wy + fwd_sign * 0.24, wz + 1.06, 0.152, 0.128, 0.08, segs=8, rot_x=math.pi * 0.5)
        add_cyl(bm, wx, wy - fwd_sign * 0.29, wz + 1.06, 0.088, 0.014, 0.22, segs=6, rot_x=-fwd_sign * math.pi * 0.5)
    create_mesh_part("MaulHeadSteel", "steel", m_fore_r, build_maul_steel)

    def build_maul_gold(bm):
        # Brass/gold collar bands gripping the warhammer neck
        add_cyl(bm, wx, wy, wz + 0.80, 0.052, 0.052, 0.05, segs=8)
        add_cyl(bm, wx, wy, wz + 0.24, 0.046, 0.046, 0.045, segs=8)
    create_mesh_part("MaulCollarGold", "gold", m_fore_r, build_maul_gold)

    # E. TRUE TAPERED IRONCLAD BREACHING KITE SHIELD (Left Forearm, side=-1)
    sh_x = hl.x - 0.02
    sh_y = hl.y + fwd_sign * 0.15
    sh_z = hl.z - 0.02
    def build_shield_iron(bm):
        add_kite_prism(bm, sh_x, sh_y, sh_z + 0.02, 0.52, 0.36, 0.52, 0.062, y_dir=fwd_sign)
    create_mesh_part("KiteShieldFrame", "iron", m_fore_l, build_shield_iron)

    def build_shield_team(bm):
        # Smooth recessed team heraldic kite panel inside the forged iron border
        add_kite_prism(bm, sh_x, sh_y + fwd_sign * 0.022, sh_z + 0.02, 0.42, 0.29, 0.43, 0.036, y_dir=fwd_sign)
    create_mesh_part("KiteShieldFace", "team", m_fore_l, build_shield_team)

    def build_shield_steel(bm):
        # Forged central steel spine & domed shield umbo boss
        add_box(bm, sh_x, sh_y + fwd_sign * 0.044, sh_z - 0.02, 0.065, 0.036, 0.62)
        add_cyl(bm, sh_x, sh_y + fwd_sign * 0.058, sh_z + 0.08, 0.095, 0.048, 0.055, segs=10, rot_x=math.pi * 0.5)
    create_mesh_part("KiteShieldBoss", "steel", m_fore_l, build_shield_steel)

    # Bake real Blender BVH hemisphere Vertex AO over all sculpted Ironbreaker gear
    bpy.context.view_layer.update()
    bake_figure_ao(root, created_objs)
    return root, kept_tris + added_tris


# ---------------------------------------------------------------------------
# 2. Feudal Age Ironhold Buildings (12 models — building:<type>:iron:1)
#    (Scaled identically to author-early-ages.py Feudal buildings!)
# ---------------------------------------------------------------------------
def build_feudal_iron_towncenter(mats, col):
    key = "building:towncenter:iron:1"
    b = PartBuilder(key, mats)
    # Stone courtyard terrace
    b.tapered_box("stoneDark", 0.0, -0.35, -0.46, 0.12, 6.20, 5.40, 5.85, 5.05)
    # Main rugged Feudal Mountain Hall
    ironhold_hall(b, -0.25, 0.85, 4.45, 2.75, 3.25, plinth_h=1.05, upper_role="stone", feudal=True)
    ironhold_roof(b, -0.25, 0.85, 3.25, 4.85, 3.15, 1.85, along_y=False, stepped=True)
    # Stout stone watch-belfry & forge chimney
    ironhold_turret(b, -2.05, -0.85, -0.46, 3.65, r=0.95, roof_h=1.55, crenellated=False)
    ironhold_chimney(b, 1.55, 1.60, -0.46, 4.95, base_w=1.10, top_w=0.66)
    # Front iron-braced work arcade & open courtyard awning
    b.box_z("stoneDark", 0.95, -1.45, -0.46, 0.24, 2.55, 1.85)
    for px in (-0.15, 2.05):
        b.box_z("darkwood", px, -2.18, 0.16, 2.05, 0.18, 0.18)
    b.lean_roof("teamRoof", 0.95, -1.42, 1.88, 2.52, 2.68, 1.78, high_side="+y", thick=0.14)
    b.box("iron", 0.95, -2.30, 1.84, 2.72, 0.12, 0.16)
    ironhold_door(b, -0.25, -0.52, 0.12, w=1.08, h=1.72)
    b.anvil(0.85, -1.45, 0.24, scale=0.82)
    b.barrel(1.68, -1.55, 0.24)
    b.crate(-0.92, -1.78, 0.12, s=0.52)
    b.iron_shield(-0.25, -0.56, 2.48, face="-y", scale=0.95)
    ftris = b.banner_pole(-2.05, -0.85, 5.10, 6.25, flag_w=1.05, flag_h=0.56, col=col)
    root, tris = b.finalize(col)
    return root, tris + ftris


def build_feudal_iron_house(mats, col):
    key = "building:house:iron:1"
    b = PartBuilder(key, mats)
    ironhold_hall(b, 0.0, 0.10, 2.95, 2.55, 2.45, plinth_h=0.88, upper_role="stone", feudal=True)
    ironhold_roof(b, 0.0, 0.10, 2.45, 3.35, 2.95, 1.48, along_y=True, stepped=True)
    ironhold_chimney(b, -1.42, 0.62, -0.46, 3.82, base_w=0.74, top_w=0.46, glow_face="")
    ironhold_door(b, 0.0, -1.18, 0.0, w=0.80, h=1.42)
    b.barrel(1.18, -1.38, 0.0, r=0.20, h=0.48)
    b.crate(-1.05, -1.35, 0.0, s=0.44)
    root, tris = b.finalize(col)
    return root, tris


def build_feudal_iron_barracks(mats, col):
    key = "building:barracks:iron:1"
    b = PartBuilder(key, mats)
    b.tapered_box("soil", 0.0, -0.95, -0.46, 0.08, 4.90, 2.60, 4.60, 2.38)
    ironhold_hall(b, 0.0, 0.95, 4.55, 2.48, 3.10, plinth_h=0.95, upper_role="stone", feudal=True)
    ironhold_roof(b, 0.0, 0.95, 3.10, 4.98, 2.92, 1.62, along_y=False, stepped=True)
    # Stone gatehouse arch at front-left
    gx, gy = -1.42, -1.25
    for sx in (-0.68, 0.68):
        b.box_z("stoneDark", gx + sx, gy, -0.46, 2.24, 0.50, 1.48)
        b.iron_shield(gx + sx, gy - 0.78, 1.32, face="-y", scale=0.72)
    b.box_z("stone", gx, gy, 1.62, 2.28, 1.88, 1.48)
    b.box_z("iron", gx, gy, 0.0, 1.62, 0.90, 0.24)
    ironhold_roof(b, gx, gy, 2.28, 2.08, 1.72, 0.78, along_y=True, stepped=False)
    # Stone courtyard parapet wall + iron crenellation bars
    b.box_z("stoneDark", 0.92, -1.92, -0.46, 1.48, 2.86, 0.48)
    b.box_z("stoneDark", 2.18, -0.95, -0.46, 1.48, 0.48, 2.16)
    for ix in range(-2, 3):
        b.box_z("stone", 0.92 + ix * 0.56, -1.92, 1.46, 1.88, 0.34, 0.50)
        b.box("iron", 0.92 + ix * 0.56, -1.92, 1.90, 0.38, 0.52, 0.08)
    b.box("team", 0.92, -2.18, 1.12, 2.60, 0.08, 0.24)
    # Courtyard training dummy & weapon rack
    b.cylinder("darkwood", 0.62, -0.95, -0.05, 1.38, 0.12, 0.10, segs=6)
    b.box("iron", 0.62, -0.95, 0.96, 0.48, 0.36, 0.50)
    b.box("darkwood", 0.62, -0.95, 1.06, 0.92, 0.12, 0.12)
    b.barrel(1.56, -0.58, 0.06)
    ftris = b.banner_pole(2.18, -1.92, 1.48, 4.45, flag_w=0.92, flag_h=0.50, col=col)
    root, tris = b.finalize(col)
    return root, tris + ftris


def build_feudal_iron_range(mats, col):
    key = "building:range:iron:1"
    b = PartBuilder(key, mats)
    b.tapered_box("soil", 0.0, -0.85, -0.46, 0.06, 4.75, 2.60, 4.48, 2.40)
    ironhold_hall(b, 0.0, 0.85, 4.25, 2.25, 2.80, plinth_h=0.86, upper_role="stone", feudal=True)
    ironhold_roof(b, 0.0, 0.85, 2.80, 4.68, 2.68, 1.45, along_y=False, stepped=True)
    # Covered iron-braced firing gallery
    for px in (-1.92, 0.0, 1.92):
        b.box_z("darkwood", px, -0.85, -0.46, 1.98, 0.16, 0.16)
    b.lean_roof("teamRoof", 0.0, -0.35, 1.88, 2.42, 4.24, 1.38, high_side="+y")
    b.box("iron", 0.0, -1.04, 1.84, 4.28, 0.12, 0.14)
    # 3 armored crossbow targets in front yard
    for tx in (-1.35, 0.0, 1.35):
        b.cylinder("darkwood", tx, -1.78, -0.10, 1.25, 0.08, 0.07, segs=5)
        b.box("straw", tx, -1.78, 1.05, 0.62, 0.22, 0.62)
        b.box("team", tx, -1.90, 1.05, 0.42, 0.06, 0.42)
        b.box("gold", tx, -1.94, 1.05, 0.16, 0.05, 0.16)
    b.crate(-1.82, -0.85, 0.04, s=0.50)
    ftris = b.banner_pole(2.12, 0.85, 2.80, 4.88, flag_w=0.86, flag_h=0.46, col=col)
    root, tris = b.finalize(col)
    return root, tris + ftris


def build_feudal_iron_stable(mats, col):
    key = "building:stable:iron:1"
    b = PartBuilder(key, mats)
    b.tapered_box("soil", 0.0, -0.65, -0.46, 0.06, 4.85, 2.95, 4.58, 2.75)
    ironhold_hall(b, 0.0, 0.92, 4.35, 2.38, 2.86, plinth_h=0.86, upper_role="stone", feudal=True)
    ironhold_roof(b, 0.0, 0.92, 2.86, 4.78, 2.82, 1.52, along_y=False, stepped=True)
    # Open stone-and-timber front paddock stalls
    for px in (-2.05, -0.68, 0.68, 2.05):
        b.box_z("stoneDark", px, -1.78, -0.46, 1.42, 0.30, 0.30)
    b.box("wood", 0.0, -1.78, 0.92, 4.18, 0.12, 0.12)
    b.box("wood", 0.0, -1.78, 0.48, 4.18, 0.12, 0.12)
    ironhold_horse(b, -1.18, -0.88, z0=0.04)
    ironhold_horse(b, 0.95, -0.85, z0=0.04, coat_tint=(0.56, 0.44, 0.34))
    b.box("grain", 1.72, -1.25, 0.34, 0.68, 0.56, 0.52)
    b.barrel(-1.82, -1.22, 0.04)
    ftris = b.banner_pole(-2.08, 0.92, 2.86, 4.85, flag_w=0.86, flag_h=0.46, col=col)
    root, tris = b.finalize(col)
    return root, tris + ftris


def build_feudal_iron_blacksmith(mats, col):
    key = "building:blacksmith:iron:1"
    b = PartBuilder(key, mats)
    ironhold_hall(b, 0.48, 0.42, 3.25, 2.55, 2.68, plinth_h=0.92, upper_role="stone", feudal=True)
    ironhold_roof(b, 0.48, 0.42, 2.68, 3.68, 2.98, 1.42, along_y=False, stepped=True)
    # Tall external glowing blast-forge chimney at (-1.48, -0.15) matching smoke outlet!
    ironhold_chimney(b, -1.48, -0.15, -0.46, 4.62, base_w=1.34, top_w=0.64, glow_face="-y")
    # Front iron-braced forge work-porch + anvil + glowing coal trough
    for px in (-0.98, 0.98):
        b.box_z("darkwood", px, -1.68, -0.46, 1.78, 0.18, 0.18)
    b.lean_roof("teamRoof", 0.0, -1.24, 1.68, 2.18, 2.48, 1.32, high_side="+y")
    b.box("iron", 0.0, -1.90, 1.64, 2.52, 0.10, 0.16)
    b.anvil(0.0, -1.32, 0.0, scale=0.96)
    b.barrel(-0.76, -1.42, 0.0)
    b.crate(0.86, -1.35, 0.0, s=0.52)
    root, tris = b.finalize(col)
    return root, tris


def build_feudal_iron_market(mats, col):
    key = "building:market:iron:1"
    b = PartBuilder(key, mats)
    ironhold_hall(b, -0.35, 0.92, 3.65, 2.38, 2.75, plinth_h=0.88, upper_role="stone", feudal=True)
    ironhold_roof(b, -0.35, 0.92, 2.75, 4.08, 2.82, 1.48, along_y=False, stepped=True)
    # Raised stone trading platform + ore/goods stalls
    b.box_z("stoneDark", -0.35, -0.72, -0.46, 0.56, 3.45, 1.24)
    b.box("gold", -1.18, -0.78, 0.74, 0.58, 0.44, 0.34)
    b.box("grain", -0.35, -0.78, 0.74, 0.58, 0.44, 0.34)
    b.box("iron", 0.48, -0.78, 0.74, 0.58, 0.44, 0.34)
    # 2 covered stone-and-iron market pavilions
    for px, py, pw, pd in ((-1.35, -1.72, 1.98, 1.24), (1.62, -0.82, 1.62, 1.78)):
        for sx in (-pw * 0.44, pw * 0.44):
            for sy in (-pd * 0.42, pd * 0.42):
                b.box_z("darkwood", px + sx, py + sy, -0.46, 1.46, 0.14, 0.14)
        b.gable_prism("teamRoof", px, py, 1.44, pw + 0.24, pd + 0.24, 0.52, along_y=(pd > pw))
        b.box("iron", px, py, 1.98, 0.12 if pd > pw else pw + 0.28, pd + 0.28 if pd > pw else 0.12, 0.12)
    b.crate(-1.55, -1.72, 0.0, s=0.48)
    b.barrel(1.55, -0.68, 0.0)
    root, tris = b.finalize(col)
    return root, tris


def build_feudal_iron_mill(mats, col):
    key = "building:mill:iron:1"
    b = PartBuilder(key, mats)
    b.tapered_box("stoneDark", 0.0, 0.25, -0.46, 1.38, 3.16, 3.02, 2.58, 2.48)
    b.cylinder("stone", 0.0, 0.25, 1.28, 4.10, 1.38, 1.16, segs=8, z_grad=0.14)
    b.cylinder("iron", 0.0, 0.25, 2.65, 2.82, 1.36, 1.36, segs=8)
    b.cylinder("team", 0.0, 0.25, 3.82, 4.08, 1.26, 1.26, segs=8)
    b.cone("teamRoof", 0.0, 0.25, 4.05, 5.55, 1.48, segs=8, z_grad=0.16)
    for i in range(4):
        a = i * math.pi * 0.5 + math.pi * 0.25
        b.rod("iron", (math.cos(a) * 1.46, 0.25 + math.sin(a) * 1.46, 4.05), (0.0, 0.25, 5.58), 0.07, segs=5)
    b.box("darkwood", 0.0, -1.06, 4.25, 0.46, 1.26, 0.46)
    b.cylinder("iron", 0.0, -1.64, 4.08, 4.42, 0.22, 0.22, segs=8)
    # Attached stone granary wing
    b.box_z("stone", 1.42, 0.35, -0.46, 1.68, 1.34, 1.72)
    b.gable_prism("teamRoof", 1.42, 0.35, 1.68, 1.54, 1.92, 0.72, along_y=True)
    b.barrel(1.52, -0.78, 0.0)
    b.crate(-1.48, -0.78, 0.0, s=0.52)
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
        rb.rod("darkwood", (0.0, 0.0, 0.0), (ca * 1.74, 0.0, sa * 1.74), 0.075, segs=5)
        rb.rod("iron", (ca * 0.34, 0.0, sa * 0.34), (ca * 1.66, 0.0, sa * 1.66), 0.045, segs=4)
        # Sail paddle
        sx_n, sz_n = -sa, ca
        cx_s = ca * 1.06 + sx_n * 0.24
        cz_s = sa * 1.06 + sz_n * 0.24
        rb.box("canvas", cx_s, 0.03, cz_s, 1.18, 0.05, 0.46, rot_z=0.0)
    _, rtris = rb.finalize(col, link_root=False)
    return root, tris + rtris


def build_feudal_iron_camp(mats, col):
    key = "building:camp:iron:1"
    b = PartBuilder(key, mats)
    b.tapered_box("stoneDark", 0.0, 0.45, -0.46, 0.55, 3.25, 2.35, 3.02, 2.18)
    b.box_z("stone", 0.0, 0.55, 0.50, 2.15, 2.75, 1.85)
    ironhold_roof(b, 0.0, 0.55, 2.15, 3.18, 2.30, 1.12, along_y=False, stepped=False)
    # Iron log-sawing frame & stacked mountain logs
    for px in (-1.28, 1.28):
        b.box_z("iron", px, -1.18, -0.46, 1.65, 0.16, 0.16)
    b.box("iron", 0.0, -1.18, 1.62, 2.74, 0.16, 0.16)
    for row in range(3):
        b.cylinder("trunk", -0.82 + row * 0.42, -0.92, 0.0, 0.46, 0.20, 0.19, segs=6)
    b.rod("trunk", (-1.15, -1.45, 0.26), (1.15, -1.45, 0.26), 0.22, segs=6)
    b.crate(1.12, -0.68, 0.0, s=0.52)
    root, tris = b.finalize(col)
    return root, tris


def build_feudal_iron_mine(mats, col):
    key = "building:mine:iron:1"
    b = PartBuilder(key, mats)
    # Stone quarry bulkhead & dark mine portal arch
    b.tapered_box("stoneDark", 0.35, 0.72, -0.46, 2.35, 3.18, 2.25, 2.78, 1.95)
    b.box_z("darkwood", 0.35, -0.36, 0.0, 1.48, 1.22, 0.26)
    b.box("iron", 0.35, -0.42, 1.54, 1.56, 0.26, 0.24)
    # Signature Ironhold A-frame Iron Hoist Headframe above the mine!
    for sx in (-0.82, 0.82):
        b.rod("iron", (0.35 + sx, -0.15, 0.20), (0.35 + sx * 0.52, 0.55, 3.65), 0.10, segs=6)
        b.rod("iron", (0.35 + sx, 1.42, 0.20), (0.35 + sx * 0.52, 0.55, 3.65), 0.10, segs=6)
    b.box("iron", 0.35, 0.55, 3.68, 1.22, 0.46, 0.26)
    b.cylinder("steel", 0.35, 0.55, 3.12, 3.55, 0.42, 0.42, segs=8)
    # Ore cart packed with gold & stone in front yard
    b.box_z("iron", -0.68, -1.18, 0.22, 0.78, 1.28, 0.80)
    b.box_z("gold", -0.58, -1.18, 0.74, 1.02, 0.76, 0.52)
    b.box_z("stone", -0.96, -1.18, 0.72, 0.94, 0.46, 0.52)
    for wx in (-1.05, -0.32):
        for wy in (-1.58, -0.78):
            b.box("steel", wx, wy, 0.18, 0.26, 0.08, 0.26)
    b.barrel(0.95, -1.25, 0.0)
    root, tris = b.finalize(col)
    return root, tris


def build_feudal_iron_tower(mats, col):
    key = "building:tower:iron:1"
    b = PartBuilder(key, mats)
    ironhold_turret(b, 0.0, 0.0, -0.46, 4.95, r=1.18, roof_h=1.95, crenellated=True)
    b.iron_shield(0.0, -1.24, 3.25, face="-y", scale=0.88)
    ftris = b.banner_pole(0.0, 0.0, 6.85, 8.05, flag_w=0.82, flag_h=0.46, col=col)
    root, tris = b.finalize(col)
    return root, tris + ftris


def build_feudal_iron_dock(mats, col):
    key = "building:dock:iron:1"
    b = PartBuilder(key, mats)
    for px in (-2.50, -1.25, 0.0, 1.25, 2.50):
        for py in (-2.25, -0.75, 0.75, 2.25):
            b.cylinder("stoneDark", px, py, -2.20, 0.56, 0.22, 0.20, segs=6)
    b.box_z("stone", 0.0, 0.0, 0.14, 0.56, 5.65, 5.20)
    b.box("iron", 0.0, -2.62, 0.42, 5.68, 0.14, 0.22)
    b.box("team", 0.0, 2.62, 0.42, 5.68, 0.14, 0.22)
    ironhold_hall(b, -1.02, 0.88, 3.05, 2.38, 2.58, plinth_h=0.92, upper_role="stone", feudal=True, windows=False)
    ironhold_roof(b, -1.02, 0.88, 2.58, 3.45, 2.78, 1.38, along_y=False, stepped=True)
    # Iron harbor cargo crane
    b.cylinder("iron", 1.88, -1.68, 0.52, 3.18, 0.14, 0.12, segs=6)
    b.rod("iron", (1.88, -1.68, 2.65), (3.02, -1.12, 3.45), 0.09, segs=6)
    b.rod("steel", (3.02, -1.12, 3.45), (3.02, -1.12, 1.65), 0.032, segs=4)
    b.crate(3.02, -1.12, 1.15, s=0.48)
    b.barrel(1.22, -1.15, 0.56)
    b.crate(1.52, 0.65, 0.56, s=0.66)
    ftris = b.banner_pole(2.38, -2.12, 0.56, 4.18, flag_w=0.92, flag_h=0.50, col=col)
    root, tris = b.finalize(col)

    pier = bpy.data.objects.new(f"{key}:pier", None)
    pier["dockPier"] = True
    pier.parent = root
    col.objects.link(pier)
    pb = PartBuilder(f"{key}:pier", mats, parent=pier)
    pb.box_z("wood", 3.10, 0.0, 0.18, 0.48, 2.95, 2.90)
    for x in (2.05, 3.25, 4.35):
        for side in (-1.28, 1.28):
            pb.cylinder("darkwood", x, side, -2.20, 1.02, 0.16, 0.15, segs=6)
    pb.box("iron", 3.10, -1.46, 0.36, 2.95, 0.12, 0.22)
    pb.box("team", 3.10, 1.46, 0.36, 2.95, 0.12, 0.22)
    pb.barrel(3.15, 0.85, 0.48)
    pb.crate(3.45, -0.78, 0.48, s=0.54)
    pb.cylinder("iron", 4.35, -1.28, 1.00, 2.15, 0.06, 0.05, segs=6)
    pb.box("glow", 4.35, -1.28, 2.22, 0.22, 0.22, 0.26)
    _, p_tris = pb.finalize(col, link_root=False)
    return root, tris + p_tris + ftris


# ---------------------------------------------------------------------------
# 3. Castle & Imperial Age Ironhold Strongholds (17 models — 1:1 Game Scale!)
# ---------------------------------------------------------------------------
def build_castle_iron_towncenter(age_num, mats, col):
    """Castle (age 2) & Imperial (age 3) Grand Ironhold Citadel Town Center (~11m wide, ~11m tall)."""
    key = f"building:towncenter:iron:{age_num}"
    imperial = age_num >= 3
    b = PartBuilder(key, mats)
    # Massive terraced mountain stone plinth
    b.tapered_box("stoneDark", 0.0, 0.0, -0.46, 0.65, 10.6, 9.2, 9.8, 8.5)
    # Grand central mountain hall
    ironhold_hall(b, 0.0, 1.15, 6.40, 4.40, 4.85 if imperial else 4.35, plinth_h=1.45, upper_role="stone", feudal=False)
    ironhold_roof(b, 0.0, 1.15, 4.85 if imperial else 4.35, 6.95, 4.90, 2.55, along_y=False, stepped=True, finial_role="gold" if imperial else "steel")
    # Twin flanking octagonal defensive turrets
    for sx in (-3.95, 3.95):
        ironhold_turret(b, sx, -0.85, -0.46, 5.45 if imperial else 4.85, r=1.42, roof_h=2.35, crenellated=True, gold_trim=imperial)
        b.iron_shield(sx, -2.35, 3.20, face="-y", scale=1.12)
    # Central iron-crowned belfry / Imperial crown spire atop the hall
    cz = 7.35 if imperial else 6.85
    b.cylinder("stoneDark", 0.0, 1.15, cz - 0.65, cz + 1.15, 1.22, 1.08, segs=8)
    b.cylinder("iron", 0.0, 1.15, cz + 1.10, cz + 1.32, 1.24, 1.24, segs=8)
    b.cone("teamRoof", 0.0, 1.15, cz + 1.30, cz + (3.25 if imperial else 2.55), 1.26, segs=8)
    if imperial:
        b.cylinder("gold", 0.0, 1.15, cz + 3.15, cz + 4.15, 0.16, 0.04, segs=8)
        b.box("gold", 0.0, 1.15, cz + 1.45, 2.55, 0.24, 0.24)
        b.box("gold", 0.0, 1.15, cz + 1.45, 0.24, 2.55, 0.24)
    # Grand arched vaulted stone front entry & stairs
    b.box_z("stone", 0.0, -1.85, 0.55, 3.25, 3.65, 2.10)
    ironhold_roof(b, 0.0, -1.85, 3.25, 3.95, 2.40, 1.15, along_y=True, stepped=True, finial_role="gold" if imperial else "iron")
    ironhold_door(b, 0.0, -2.92, 0.60, w=1.62, h=2.18)
    # Rear forge hearth chimney & flanking braziers
    ironhold_chimney(b, 2.65, 3.15, -0.46, 7.65, base_w=1.42, top_w=0.82, glow_face="")
    b.brazier(-1.75, -3.55, 0.60, h=1.05, r=0.34)
    b.brazier(1.75, -3.55, 0.60, h=1.05, r=0.34)
    b.anvil(-2.45, -2.75, 0.60, scale=0.90)
    b.crate(2.45, -2.85, 0.60, s=0.68)
    ftris = b.banner_pole(0.0, -2.90, 4.40, 6.25, flag_w=1.22, flag_h=0.62, col=col)
    root, tris = b.finalize(col)
    return root, tris + ftris


def build_castle_iron_house(mats, col):
    key = "building:house:iron:0"
    b = PartBuilder(key, mats)
    ironhold_hall(b, 0.0, 0.0, 3.75, 3.35, 3.25, plinth_h=1.05, upper_role="stone")
    ironhold_roof(b, 0.0, 0.0, 3.25, 4.25, 3.85, 1.95, along_y=True, stepped=True)
    ironhold_chimney(b, -1.78, 0.82, -0.46, 5.10, base_w=0.84, top_w=0.50, glow_face="")
    ironhold_door(b, 0.0, -1.68, 0.0, w=0.92, h=1.62)
    b.barrel(1.42, -1.85, 0.0)
    root, tris = b.finalize(col)
    return root, tris


def build_castle_iron_barracks(mats, col):
    key = "building:barracks:iron:0"
    b = PartBuilder(key, mats)
    b.tapered_box("stoneDark", 0.0, -0.45, -0.46, 0.25, 6.90, 5.95, 6.50, 5.60)
    ironhold_hall(b, 0.0, 1.15, 5.85, 3.20, 3.95, plinth_h=1.18, upper_role="stone")
    ironhold_roof(b, 0.0, 1.15, 3.95, 6.35, 3.68, 2.05, along_y=False, stepped=True)
    # Fortified bastion gateway at front
    b.box_z("stone", -1.95, -1.65, 0.20, 2.95, 2.25, 1.95)
    ironhold_roof(b, -1.95, -1.65, 2.95, 2.55, 2.25, 0.95, along_y=True, stepped=True)
    ironhold_door(b, -1.95, -2.62, 0.20, w=1.18, h=1.88)
    # Battle courtyard curtain parapet
    b.box_z("stoneDark", 1.25, -2.45, 0.20, 1.72, 3.65, 0.56)
    for ix in range(-2, 3):
        b.box_z("stone", 1.25 + ix * 0.72, -2.45, 1.70, 2.18, 0.42, 0.58)
        b.box("iron", 1.25 + ix * 0.72, -2.45, 2.20, 0.46, 0.60, 0.09)
    b.iron_shield(0.0, -0.48, 2.95, face="-y", scale=1.15)
    b.brazier(2.65, -2.45, 1.72, h=0.82, r=0.28)
    ftris = b.banner_pole(-1.95, -1.65, 3.90, 5.85, flag_w=1.12, flag_h=0.58, col=col)
    root, tris = b.finalize(col)
    return root, tris + ftris


def build_castle_iron_range(mats, col):
    key = "building:range:iron:0"
    b = PartBuilder(key, mats)
    b.tapered_box("stoneDark", 0.0, -0.35, -0.46, 0.20, 6.40, 5.85, 6.05, 5.50)
    ironhold_hall(b, 0.0, 1.15, 5.45, 2.95, 3.65, plinth_h=1.10, upper_role="stone")
    ironhold_roof(b, 0.0, 1.15, 3.65, 5.95, 3.40, 1.78, along_y=False, stepped=True)
    # Armored crossbow gallery porch
    for px in (-2.35, 0.0, 2.35):
        b.box_z("stoneDark", px, -1.05, 0.15, 2.45, 0.36, 0.36)
    b.lean_roof("teamRoof", 0.0, -0.52, 2.35, 2.98, 5.35, 1.65, high_side="+y")
    b.box("iron", 0.0, -1.35, 2.30, 5.40, 0.14, 0.18)
    for tx in (-1.75, 0.0, 1.75):
        b.cylinder("iron", tx, -2.25, 0.15, 1.48, 0.09, 0.08, segs=6)
        b.box("straw", tx, -2.25, 1.25, 0.72, 0.26, 0.72)
        b.box("team", tx, -2.40, 1.25, 0.48, 0.06, 0.48)
        b.box("gold", tx, -2.44, 1.25, 0.18, 0.05, 0.18)
    ftris = b.banner_pole(2.65, 1.15, 3.65, 5.65, flag_w=1.05, flag_h=0.52, col=col)
    root, tris = b.finalize(col)
    return root, tris + ftris


def build_castle_iron_stable(mats, col):
    key = "building:stable:iron:0"
    b = PartBuilder(key, mats)
    b.tapered_box("stoneDark", 0.0, -0.35, -0.46, 0.20, 6.45, 6.10, 6.10, 5.75)
    ironhold_hall(b, 0.0, 1.25, 5.55, 3.05, 3.85, plinth_h=1.15, upper_role="stone")
    ironhold_roof(b, 0.0, 1.25, 3.85, 6.05, 3.50, 1.95, along_y=False, stepped=True)
    # Stone-piered heavy cavalry paddock
    for px in (-2.55, -0.85, 0.85, 2.55):
        b.box_z("stoneDark", px, -2.35, 0.15, 1.65, 0.40, 0.40)
        b.box("iron", px, -2.35, 1.68, 0.44, 0.44, 0.08)
    b.box("darkwood", 0.0, -2.35, 1.05, 5.20, 0.14, 0.16)
    b.box("darkwood", 0.0, -2.35, 0.56, 5.20, 0.14, 0.16)
    ironhold_horse(b, -1.45, -1.15, z0=0.20)
    ironhold_horse(b, 1.15, -1.10, z0=0.20, coat_tint=(0.56, 0.44, 0.34))
    b.box("grain", 2.05, -1.48, 0.52, 0.78, 0.64, 0.58)
    ftris = b.banner_pole(-2.65, 1.25, 3.85, 5.85, flag_w=1.05, flag_h=0.52, col=col)
    root, tris = b.finalize(col)
    return root, tris + ftris


def build_castle_iron_workshop(mats, col):
    """ICONIC SIGNATURE BUILDING OF IRONHOLD: The Grand Siege Foundry (~7.5m × 7.4m × 7.0m)."""
    key = "building:workshop:iron:0"
    b = PartBuilder(key, mats)
    # Heavy stone foundry deck
    b.tapered_box("stoneDark", 0.0, 0.0, -0.46, 0.30, 7.40, 7.20, 7.00, 6.80)
    # Main rear stone foundry hall
    ironhold_hall(b, -0.45, 1.45, 5.65, 3.25, 4.15, plinth_h=1.25, upper_role="stone")
    ironhold_roof(b, -0.45, 1.45, 4.15, 6.15, 3.70, 2.05, along_y=False, stepped=True, finial_role="steel")
    # Towering double-flue roaring blast furnace chimney
    ironhold_chimney(b, 2.68, 1.35, -0.46, 6.85, base_w=1.68, top_w=0.92, glow_face="-y")
    # Massive timber-and-iron overhead Siege Gantry Crane straddling the assembly yard!
    for gx in (-2.55, 1.55):
        b.box_z("stoneDark", gx, -2.35, 0.25, 1.25, 0.68, 0.68)
        b.box_z("darkwood", gx, -2.35, 1.20, 4.75, 0.32, 0.32)
        b.rod("iron", (gx, -2.35, 3.85), (gx, -0.45, 4.65), 0.11, segs=6)
    b.box("iron", -0.50, -2.35, 4.75, 4.65, 0.38, 0.36)
    b.box("steel", -0.50, -2.35, 4.48, 0.56, 0.46, 0.34)
    # Hanging iron-capped battering ram beam under construction!
    b.rod("steel", (-1.15, -2.35, 4.45), (-1.15, -2.35, 1.85), 0.045, segs=5)
    b.rod("steel", (0.15, -2.35, 4.45), (0.15, -2.35, 1.85), 0.045, segs=5)
    b.rod("wood", (-1.75, -2.35, 1.75), (0.85, -2.35, 1.75), 0.34, segs=8)
    b.cylinder("iron", 0.92, -2.35, 1.42, 2.08, 0.38, 0.22, segs=8)
    # Open foundry anvil, giant spoked wheel & glowing ember pit
    b.anvil(1.95, -1.45, 0.30, scale=1.18)
    b.cylinder("iron", 2.55, -2.45, 0.30, 1.15, 0.58, 0.58, segs=10)
    b.cylinder("glow", 2.55, 0.25, 0.30, 0.62, 0.54, 0.44, segs=8)
    b.crate(-2.45, -1.05, 0.30, s=0.72)
    ftris = b.banner_pole(-2.55, -2.35, 4.75, 6.45, flag_w=1.12, flag_h=0.58, col=col)
    root, tris = b.finalize(col)
    return root, tris + ftris


def build_castle_iron_blacksmith(mats, col):
    key = "building:blacksmith:iron:0"
    b = PartBuilder(key, mats)
    ironhold_hall(b, 0.55, 0.55, 3.95, 3.15, 3.25, plinth_h=1.05, upper_role="stone")
    ironhold_roof(b, 0.55, 0.55, 3.25, 4.45, 3.60, 1.65, along_y=False, stepped=True)
    ironhold_chimney(b, -1.95, -0.15, -0.46, 5.75, base_w=1.55, top_w=0.78, glow_face="-y")
    for px in (-1.15, 1.15):
        b.box_z("iron", px, -2.05, -0.46, 2.15, 0.22, 0.22)
    b.lean_roof("teamRoof", 0.0, -1.52, 2.05, 2.65, 2.85, 1.55, high_side="+y")
    b.anvil(0.0, -1.55, 0.0, scale=1.12)
    b.brazier(-0.92, -1.65, 0.0, h=0.78, r=0.28)
    b.crate(1.05, -1.55, 0.0, s=0.58)
    root, tris = b.finalize(col)
    return root, tris


def build_castle_iron_market(mats, col):
    key = "building:market:iron:0"
    b = PartBuilder(key, mats)
    b.tapered_box("stoneDark", 0.0, -0.25, -0.46, 0.25, 6.25, 6.10, 5.90, 5.75)
    ironhold_hall(b, -0.45, 1.15, 4.65, 2.85, 3.45, plinth_h=1.05, upper_role="stone")
    ironhold_roof(b, -0.45, 1.15, 3.45, 5.15, 3.30, 1.75, along_y=False, stepped=True)
    # Stone guild trading stalls with iron-framed striped canopies
    for px, py, pw, pd in ((-1.55, -1.85, 2.35, 1.45), (1.85, -0.95, 1.85, 2.15)):
        for sx in (-pw * 0.44, pw * 0.44):
            for sy in (-pd * 0.42, pd * 0.42):
                b.box_z("stoneDark", px + sx, py + sy, 0.20, 1.85, 0.22, 0.22)
        b.gable_prism("teamRoof", px, py, 1.82, pw + 0.28, pd + 0.28, 0.65, along_y=(pd > pw))
        b.box("iron", px, py, 2.48, 0.14 if pd > pw else pw + 0.30, pd + 0.30 if pd > pw else 0.14, 0.14)
    b.box("gold", -1.55, -1.85, 0.56, 0.95, 0.68, 0.52)
    b.box("grain", 1.85, -1.15, 0.56, 0.85, 0.65, 0.52)
    b.barrel(0.35, -1.65, 0.25)
    b.crate(0.92, -1.72, 0.25, s=0.60)
    ftris = b.banner_pole(2.35, 1.15, 3.45, 5.35, flag_w=0.98, flag_h=0.50, col=col)
    root, tris = b.finalize(col)
    return root, tris + ftris


def build_castle_iron_mill(mats, col):
    key = "building:mill:iron:0"
    b = PartBuilder(key, mats)
    b.tapered_box("stoneDark", 0.0, 0.25, -0.46, 1.85, 4.10, 3.95, 3.35, 3.25)
    b.cylinder("stone", 0.0, 0.25, 1.75, 5.65, 1.76, 1.48, segs=8, z_grad=0.14)
    b.cylinder("iron", 0.0, 0.25, 3.65, 3.88, 1.70, 1.70, segs=8)
    b.cylinder("team", 0.0, 0.25, 5.25, 5.58, 1.58, 1.58, segs=8)
    b.cone("teamRoof", 0.0, 0.25, 5.55, 7.65, 1.88, segs=8, z_grad=0.16)
    for i in range(4):
        a = i * math.pi * 0.5 + math.pi * 0.25
        b.rod("iron", (math.cos(a) * 1.86, 0.25 + math.sin(a) * 1.86, 5.55), (0.0, 0.25, 7.68), 0.085, segs=5)
    b.box("iron", 0.0, -1.35, 5.75, 0.58, 1.48, 0.58)
    # Stone granary annex
    b.box_z("stone", 1.85, 0.35, -0.46, 2.25, 1.75, 2.25)
    b.gable_prism("teamRoof", 1.85, 0.35, 2.25, 1.98, 2.48, 0.92, along_y=True)
    b.barrel(1.92, -1.15, 0.0)
    b.crate(-1.95, -1.05, 0.0, s=0.64)
    root, tris = b.finalize(col)

    rotor = bpy.data.objects.new(f"{key}:rotor", None)
    rotor["windmill"] = True
    rotor.location = (0.0, -2.18, 5.75)
    rotor.parent = root
    col.objects.link(rotor)
    rb = PartBuilder(f"{key}:rotor", mats, parent=rotor)
    rb.box("iron", 0.0, 0.0, 0.0, 0.56, 0.32, 0.56)
    for k in range(4):
        ang = k * math.pi * 0.5 + math.pi * 0.25
        ca, sa = math.cos(ang), math.sin(ang)
        sx_n, sz_n = -sa, ca
        rb.rod("darkwood", (0.0, 0.0, 0.0), (ca * 2.38, 0.0, sa * 2.38), 0.09, segs=5)
        rb.box("canvas", ca * 1.44 + sx_n * 0.30, 0.04, sa * 1.44 + sz_n * 0.30, 1.56, 0.06, 0.58)
    _, rtris = rb.finalize(col, link_root=False)
    return root, tris + rtris


def build_castle_iron_camp(mats, col):
    key = "building:camp:iron:0"
    b = PartBuilder(key, mats)
    b.tapered_box("stoneDark", 0.0, 0.45, -0.46, 0.65, 3.85, 2.95, 3.55, 2.75)
    b.box_z("stone", 0.0, 0.55, 0.60, 2.45, 3.25, 2.35)
    ironhold_roof(b, 0.0, 0.55, 2.45, 3.75, 2.85, 1.32, along_y=False, stepped=True)
    for px in (-1.52, 1.52):
        b.box_z("iron", px, -1.35, -0.46, 1.92, 0.20, 0.20)
    b.box("iron", 0.0, -1.35, 1.88, 3.25, 0.20, 0.20)
    b.rod("trunk", (-1.35, -1.55, 0.32), (1.35, -1.55, 0.32), 0.26, segs=6)
    b.crate(1.38, -0.82, 0.0, s=0.62)
    root, tris = b.finalize(col)
    return root, tris


def build_castle_iron_mine(mats, col):
    key = "building:mine:iron:0"
    b = PartBuilder(key, mats)
    b.tapered_box("stoneDark", 0.35, 0.72, -0.46, 2.65, 3.65, 2.65, 3.18, 2.30)
    b.box_z("darkwood", 0.35, -0.52, 0.0, 1.72, 1.42, 0.28)
    b.box("iron", 0.35, -0.58, 1.78, 1.82, 0.30, 0.28)
    for sx in (-0.98, 0.98):
        b.rod("iron", (0.35 + sx, -0.18, 0.20), (0.35 + sx * 0.52, 0.58, 4.15), 0.12, segs=6)
        b.rod("iron", (0.35 + sx, 1.62, 0.20), (0.35 + sx * 0.52, 0.58, 4.15), 0.12, segs=6)
    b.box("iron", 0.35, 0.58, 4.18, 1.42, 0.52, 0.30)
    b.cylinder("steel", 0.35, 0.58, 3.52, 4.02, 0.52, 0.52, segs=10)
    b.box_z("iron", -0.82, -1.35, 0.24, 0.92, 1.48, 0.94)
    b.box_z("gold", -0.68, -1.35, 0.88, 1.20, 0.88, 0.62)
    b.box_z("stone", -1.16, -1.35, 0.86, 1.12, 0.54, 0.62)
    b.barrel(1.12, -1.35, 0.0)
    root, tris = b.finalize(col)
    return root, tris


def build_castle_iron_tower(mats, col):
    key = "building:tower:iron:0"
    b = PartBuilder(key, mats)
    ironhold_turret(b, 0.0, 0.0, -0.46, 7.15, r=1.45, roof_h=2.75, crenellated=True)
    b.iron_shield(0.0, -1.52, 4.55, face="-y", scale=1.08)
    b.iron_shield(0.0, 1.52, 4.55, face="+y", scale=1.08)
    ftris = b.banner_pole(0.0, 0.0, 9.85, 11.15, flag_w=1.05, flag_h=0.56, col=col)
    root, tris = b.finalize(col)
    return root, tris + ftris


def build_castle_iron_keep(mats, col):
    """ICONIC IRONHOLD BASTION FORTRESS (~8m base before 1.25× Keep scale -> ~10m × 13m citadel!)."""
    key = "building:keep:iron:0"
    b = PartBuilder(key, mats)
    # Massive battered basalt escarpment base
    b.tapered_box("stoneDark", 0.0, 0.0, -0.82, 2.25, 8.15, 7.95, 7.15, 6.95, z_grad=0.18)
    # Central square Ironhold mountain donjon
    b.box_z("stone", 0.0, 0.0, 2.10, 6.65, 5.45, 5.25, z_grad=0.14)
    b.box("iron", 0.0, 0.0, 4.35, 5.65, 5.45, 0.24)
    b.box("stoneDark", 0.0, 0.0, 6.55, 6.05, 5.85, 0.42)
    b.box("iron", 0.0, 0.0, 6.82, 6.18, 5.98, 0.16)
    # 4 heavy octagonal iron-crowned corner bastions
    for sx in (-2.95, 2.95):
        for sy in (-2.85, 2.85):
            ironhold_turret(b, sx, sy, -0.82, 6.25, r=1.22, roof_h=2.05, crenellated=True, gold_trim=True)
    # Towering central upper citadel crown & forged iron roof spire
    b.box_z("stone", 0.0, 0.0, 6.85, 8.45, 3.65, 3.45)
    ironhold_roof(b, 0.0, 0.0, 8.45, 4.10, 3.90, 2.10, along_y=False, stepped=True, finial_role="gold")
    # Recessed iron portcullis gatehouse at front
    b.box_z("stoneDark", 0.0, -3.15, -0.46, 3.85, 2.85, 1.35)
    b.box_z("darkwood", 0.0, -3.78, 0.0, 2.35, 1.65, 0.22)
    for gx in (-0.56, -0.18, 0.18, 0.56):
        b.box_z("iron", gx, -3.86, 0.0, 2.35, 0.09, 0.12)
    for gz in (0.65, 1.35, 2.02):
        b.box("iron", 0.0, -3.86, gz, 1.68, 0.12, 0.09)
    # Flanking glowing hearth braziers & royal crest
    b.brazier(-1.72, -3.72, 2.25, h=0.88, r=0.28)
    b.brazier(1.72, -3.72, 2.25, h=0.88, r=0.28)
    b.iron_shield(0.0, -2.72, 5.35, face="-y", scale=1.35)
    ftris = b.banner_pole(0.0, 0.0, 10.50, 12.10, flag_w=1.35, flag_h=0.68, col=col)
    root, tris = b.finalize(col)
    return root, tris + ftris


def build_castle_iron_monastery(mats, col):
    key = "building:monastery:iron:0"
    b = PartBuilder(key, mats)
    b.tapered_box("stoneDark", 0.0, 0.0, -0.46, 0.68, 6.45, 6.65, 6.05, 6.25)
    ironhold_hall(b, 0.0, 0.25, 4.65, 5.45, 4.45, plinth_h=1.25, upper_role="stone")
    ironhold_roof(b, 0.0, 0.25, 4.45, 5.15, 5.90, 2.25, along_y=True, stepped=True, finial_role="gold")
    # Tall mountain stone bell-spire tower
    ironhold_turret(b, 0.0, -1.65, 0.60, 7.65, r=1.22, roof_h=2.95, crenellated=False, gold_trim=True)
    # Arched lancet stained-glass front window
    b.box("iron", 0.0, -2.92, 4.55, 0.88, 0.16, 1.65)
    b.box("glass", 0.0, -2.96, 4.55, 0.64, 0.12, 1.42)
    ironhold_door(b, 0.0, -2.78, 0.60, w=1.28, h=2.05)
    b.brazier(-1.65, -2.85, 0.60, h=0.92, r=0.30)
    b.brazier(1.65, -2.85, 0.60, h=0.92, r=0.30)
    ftris = b.banner_pole(0.0, -1.65, 10.55, 11.75, flag_w=0.95, flag_h=0.50, col=col)
    root, tris = b.finalize(col)
    return root, tris + ftris


def build_castle_iron_wonder(mats, col):
    """THE GREAT FORGE MONUMENT — Colossal Mountain-Crown Eternal Forge Spire (~10.4m × 12.8m)."""
    key = "building:wonder:iron:0"
    b = PartBuilder(key, mats)
    # 3-tiered octagonal basalt ziggurat plinth
    b.cylinder("stoneDark", 0.0, 0.0, -0.46, 1.15, 5.45, 5.05, segs=8)
    b.cylinder("stone", 0.0, 0.0, 1.10, 2.45, 4.55, 4.15, segs=8)
    b.cylinder("iron", 0.0, 0.0, 2.40, 2.68, 4.25, 4.25, segs=8)
    b.cylinder("stone", 0.0, 0.0, 2.65, 5.65, 3.45, 2.95, segs=8, z_grad=0.14)
    # 4 monumental corner brazier bastion pillars + sweeping iron flying buttresses
    for i in range(4):
        a = i * math.pi * 0.5 + math.pi * 0.25
        cx, cy = math.cos(a) * 3.55, math.sin(a) * 3.55
        ironhold_turret(b, cx, cy, 1.05, 6.25, r=0.92, roof_h=0.0, crenellated=True, gold_trim=True)
        b.brazier(cx, cy, 6.65, h=1.05, r=0.42)
        b.rod("iron", (cx * 0.85, cy * 0.85, 6.35), (cx * 0.35, cy * 0.35, 9.25), 0.22, segs=6)
        b.rod("gold", (cx * 0.82, cy * 0.82, 6.55), (cx * 0.32, cy * 0.32, 9.35), 0.09, segs=6)
    # Upper sanctuary drum with blazing eternal forge hearth windows
    b.cylinder("stoneDark", 0.0, 0.0, 5.55, 8.65, 2.35, 2.05, segs=8)
    for i in range(4):
        a = i * math.pi * 0.5
        b.box("glow", math.cos(a) * 2.18, math.sin(a) * 2.18, 7.05, 0.85 if i % 2 else 0.18, 0.18 if i % 2 else 0.85, 1.85)
    b.cylinder("gold", 0.0, 0.0, 8.55, 8.95, 2.25, 2.25, segs=8)
    # Soaring Iron-and-Gold Crown Spire
    b.cone("teamRoof", 0.0, 0.0, 8.90, 12.15, 2.18, segs=8)
    for i in range(8):
        a = i * math.pi * 0.25
        b.rod("gold", (math.cos(a) * 2.16, math.sin(a) * 2.16, 8.90), (0.0, 0.0, 12.20), 0.08, segs=5)
    b.cylinder("gold", 0.0, 0.0, 11.95, 13.05, 0.24, 0.04, segs=8)
    # Grand front stone staircase
    b.tapered_box("stoneDark", 0.0, -4.35, -0.46, 2.45, 3.15, 2.05, 2.55, 0.85)
    ftris = b.banner_pole(0.0, -3.55, 2.45, 5.25, flag_w=1.35, flag_h=0.68, col=col)
    root, tris = b.finalize(col)
    return root, tris + ftris


def build_castle_iron_dock(mats, col):
    key = "building:dock:iron:0"
    b = PartBuilder(key, mats)
    for px in (-2.85, -1.42, 0.0, 1.42, 2.85):
        for py in (-2.45, -0.82, 0.82, 2.45):
            b.cylinder("stoneDark", px, py, -2.20, 0.64, 0.26, 0.24, segs=6)
    b.box_z("stone", 0.0, 0.0, 0.14, 0.64, 6.35, 5.55)
    b.box("iron", 0.0, -2.78, 0.46, 6.40, 0.16, 0.24)
    b.box("team", 0.0, 2.78, 0.46, 6.40, 0.16, 0.24)
    ironhold_hall(b, -1.15, 0.92, 3.45, 2.68, 3.25, plinth_h=1.05, upper_role="stone", windows=False)
    ironhold_roof(b, -1.15, 0.92, 3.25, 3.92, 3.12, 1.65, along_y=False, stepped=True)
    # Heavy forged iron shipyard crane
    b.cylinder("iron", 2.15, -1.78, 0.60, 4.15, 0.18, 0.14, segs=8)
    b.rod("iron", (2.15, -1.78, 3.45), (3.65, -1.15, 4.45), 0.11, segs=6)
    b.rod("steel", (3.65, -1.15, 4.45), (3.65, -1.15, 2.05), 0.036, segs=5)
    b.crate(3.65, -1.15, 1.45, s=0.58)
    b.barrel(1.38, -1.25, 0.64)
    b.crate(1.75, 0.78, 0.64, s=0.72)
    ftris = b.banner_pole(2.65, -2.25, 0.64, 4.85, flag_w=1.08, flag_h=0.56, col=col)
    root, tris = b.finalize(col)

    pier = bpy.data.objects.new(f"{key}:pier", None)
    pier["dockPier"] = True
    pier.parent = root
    col.objects.link(pier)
    pb = PartBuilder(f"{key}:pier", mats, parent=pier)
    pb.box_z("stone", 3.55, 0.0, 0.18, 0.56, 3.35, 3.10)
    for x in (2.35, 3.65, 4.85):
        for side in (-1.38, 1.38):
            pb.cylinder("stoneDark", x, side, -2.20, 1.12, 0.20, 0.18, segs=6)
    pb.box("iron", 3.55, -1.56, 0.42, 3.38, 0.14, 0.24)
    pb.box("team", 3.55, 1.56, 0.42, 3.38, 0.14, 0.24)
    pb.barrel(3.45, 0.92, 0.56)
    pb.crate(3.85, -0.82, 0.56, s=0.60)
    pb.cylinder("iron", 4.85, -1.38, 1.08, 2.38, 0.07, 0.06, segs=6)
    pb.box("glow", 4.85, -1.38, 2.48, 0.24, 0.24, 0.28)
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
    project_root = Path(__file__).resolve().parents[2]

    bpy.ops.wm.read_factory_settings(use_empty=True)
    mats = ensure_materials()
    col = bpy.context.scene.collection
    summary = {}

    builders = [
        ("unit:ironbreaker", lambda: build_ironbreaker_unit(project_root, mats, col)),
        # Feudal Age (Age 2) — 12 bespoke mountain-forge models
        ("building:towncenter:iron:1", lambda: build_feudal_iron_towncenter(mats, col)),
        ("building:house:iron:1", lambda: build_feudal_iron_house(mats, col)),
        ("building:barracks:iron:1", lambda: build_feudal_iron_barracks(mats, col)),
        ("building:range:iron:1", lambda: build_feudal_iron_range(mats, col)),
        ("building:stable:iron:1", lambda: build_feudal_iron_stable(mats, col)),
        ("building:blacksmith:iron:1", lambda: build_feudal_iron_blacksmith(mats, col)),
        ("building:market:iron:1", lambda: build_feudal_iron_market(mats, col)),
        ("building:mill:iron:1", lambda: build_feudal_iron_mill(mats, col)),
        ("building:camp:iron:1", lambda: build_feudal_iron_camp(mats, col)),
        ("building:mine:iron:1", lambda: build_feudal_iron_mine(mats, col)),
        ("building:tower:iron:1", lambda: build_feudal_iron_tower(mats, col)),
        ("building:dock:iron:1", lambda: build_feudal_iron_dock(mats, col)),
        # Castle & Imperial Age (Ages 3 & 4) — 17 bespoke mountain-stronghold models
        ("building:towncenter:iron:2", lambda: build_castle_iron_towncenter(2, mats, col)),
        ("building:towncenter:iron:3", lambda: build_castle_iron_towncenter(3, mats, col)),
        ("building:house:iron:0", lambda: build_castle_iron_house(mats, col)),
        ("building:barracks:iron:0", lambda: build_castle_iron_barracks(mats, col)),
        ("building:range:iron:0", lambda: build_castle_iron_range(mats, col)),
        ("building:stable:iron:0", lambda: build_castle_iron_stable(mats, col)),
        ("building:workshop:iron:0", lambda: build_castle_iron_workshop(mats, col)),
        ("building:blacksmith:iron:0", lambda: build_castle_iron_blacksmith(mats, col)),
        ("building:market:iron:0", lambda: build_castle_iron_market(mats, col)),
        ("building:mill:iron:0", lambda: build_castle_iron_mill(mats, col)),
        ("building:camp:iron:0", lambda: build_castle_iron_camp(mats, col)),
        ("building:mine:iron:0", lambda: build_castle_iron_mine(mats, col)),
        ("building:tower:iron:0", lambda: build_castle_iron_tower(mats, col)),
        ("building:keep:iron:0", lambda: build_castle_iron_keep(mats, col)),
        ("building:monastery:iron:0", lambda: build_castle_iron_monastery(mats, col)),
        ("building:wonder:iron:0", lambda: build_castle_iron_wonder(mats, col)),
        ("building:dock:iron:0", lambda: build_castle_iron_dock(mats, col)),
    ]

    total_tris = 0
    for key, make_fn in builders:
        root, tris = make_fn()
        assert root["assetKey"] == key, f"Key mismatch: {root['assetKey']} vs {key}"
        summary[key] = {"tris": tris}
        total_tris += tris

    glb_path = os.path.join(args.output, "frontier-ironhold-raw.glb")
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
