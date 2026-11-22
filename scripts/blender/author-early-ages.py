"""Author Age 1 (Frontier/Dark Age), Age 2 (Feudal Regional), and Wooden Palisade
Wall & Gate 3D buildings in Blender 4.5 LTS.

Produces strictly closed, outward-normal, UV-mapped, vertex-colored low-poly meshes
packed cleanly into `src/assets3d/frontier-early-ages.glb`:
  - Palisade fortifications (Age 1 & Age 2, universal):
      building:wall:palisade
      building:gate:palisade
  - Age 1 Frontier / Dark Age (universal humble timber & straw-thatch camp):
      building:{towncenter,house,barracks,mill,camp,mine}:frontier
  - Age 2 Feudal Age (3 distinct regional village styles - NO Castle stone walls, NO Sunward domes):
      Alder Kingdom (alder): Western European half-timbered oak + white plaster + pitched shingle roofs
      Sunward Sultanate (sun): Middle Eastern flat-roof desert adobe + timber vigas + woven cloth awnings
      Raven Clans (raven): Northern European notched horizontal log-cabins + steep Nordic roofs + ridge horns
      building:{towncenter,house,barracks,mill,camp,mine,range,stable,blacksmith,market,tower,dock}:{alder,sun,raven}:1

Coordinate convention (Blender Z-up -> glTF Y-up via export_yup=True):
  Three.js X =  Blender X
  Three.js Y =  Blender Z   (ground = 0.0, buried footing = -0.46)
  Three.js Z = -Blender Y   (front face = -Y in Blender -> +Z in Three.js)
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
# Scene & Material Helpers
# ---------------------------------------------------------------------------
MAT_SPECS = {
    "wood": ((0.54, 0.41, 0.27, 1.0), 0.88, 0.0),
    "darkwood": ((0.29, 0.22, 0.16, 1.0), 0.90, 0.0),
    "plaster": ((0.88, 0.82, 0.70, 1.0), 0.92, 0.0),
    "stone": ((0.72, 0.67, 0.58, 1.0), 0.90, 0.0),
    "stoneDark": ((0.50, 0.51, 0.48, 1.0), 0.92, 0.0),
    "brick": ((0.58, 0.40, 0.28, 1.0), 0.88, 0.0),
    "straw": ((0.68, 0.57, 0.34, 1.0), 0.95, 0.0),
    "canvas": ((0.72, 0.64, 0.52, 1.0), 0.92, 0.0),
    "soil": ((0.46, 0.38, 0.27, 1.0), 0.96, 0.0),
    "trunk": ((0.38, 0.30, 0.20, 1.0), 0.92, 0.0),
    "iron": ((0.42, 0.45, 0.47, 1.0), 0.50, 0.50),
    "steel": ((0.76, 0.80, 0.82, 1.0), 0.34, 0.55),
    "gold": ((0.80, 0.66, 0.28, 1.0), 0.42, 0.48),
    "glow": ((0.96, 0.42, 0.14, 1.0), 0.35, 0.0),
    "glass": ((0.86, 0.72, 0.44, 1.0), 0.28, 0.05),
    "grain": ((0.84, 0.71, 0.34, 1.0), 0.90, 0.0),
    "fruit": ((0.64, 0.24, 0.22, 1.0), 0.82, 0.0),
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
# Closed-Manifold Primitive Collector (grouped by material role per building)
# ---------------------------------------------------------------------------
class PartBuilder:
    """Collects closed 2-manifold primitives grouped by `assetMaterial` role,
    with per-primitive vertex color tinting and consistent world-scale box UVs."""

    def __init__(self, key, mats, parent=None, uv_scale=0.35):
        self.key = key
        self.mats = mats
        self.uv_scale = uv_scale
        self.buckets = {}  # role -> bmesh
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
        for f in faces:
            f.normal_update()
            n = f.normal
            ax, ay, az = abs(n.x), abs(n.y), abs(n.z)
            # Subtle directional plane shading baked gently into VC
            plane_shade = 1.0 if n.z > 0.4 else (0.94 if n.z > -0.2 else 0.85)
            for loop in f.loops:
                co = loop.vert.co
                if az >= ax and az >= ay:
                    loop[uv_layer].uv = (co.x * self.uv_scale, co.y * self.uv_scale)
                elif ax >= ay:
                    loop[uv_layer].uv = (co.y * self.uv_scale, co.z * self.uv_scale)
                else:
                    loop[uv_layer].uv = (co.x * self.uv_scale, co.z * self.uv_scale)
                g = 1.0
                if z_grad != 0.0:
                    g = max(0.76, min(1.06, 1.0 + z_grad * (co.z * 0.14 - 0.18)))
                r = max(0.05, min(1.0, tint[0] * plane_shade * g))
                gr = max(0.05, min(1.0, tint[1] * plane_shade * g))
                b = max(0.05, min(1.0, tint[2] * plane_shade * g))
                loop[vc_layer] = (r, gr, b, 1.0)

    def box(self, role, cx, cy, cz, sx, sy, sz, rot_z=0.0, rot_x=0.0, rot_y=0.0, tint=(1.0, 1.0, 1.0), z_grad=0.0):
        """Closed box centered at (cx, cy, cz) with full dimensions (sx, sy, sz)."""
        bm = self._bm(role)
        mat = (
            Matrix.Translation((cx, cy, cz))
            @ Matrix.Rotation(rot_z, 4, "Z")
            @ Matrix.Rotation(rot_y, 4, "Y")
            @ Matrix.Rotation(rot_x, 4, "X")
            @ Matrix.Diagonal((sx, sy, sz, 1.0))
        )
        res = bmesh.ops.create_cube(bm, size=1.0, matrix=mat)
        verts = set(res["verts"])
        faces = [f for f in bm.faces if all(v in verts for v in f.verts)]
        self._paint_faces(bm, faces, tint, z_grad)

    def box_z(self, role, cx, cy, z0, z1, sx, sy, rot_z=0.0, tint=(1.0, 1.0, 1.0), z_grad=0.0):
        """Closed box spanning z0..z1."""
        self.box(role, cx, cy, (z0 + z1) * 0.5, sx, sy, z1 - z0, rot_z=rot_z, tint=tint, z_grad=z_grad)

    def tapered_box(self, role, cx, cy, z0, z1, sx0, sy0, sx1, sy1, tint=(1.0, 1.0, 1.0), z_grad=0.0):
        """Closed trapezoidal frustum spanning z0..z1 (great for adobe & battered plinths)."""
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

    def gable_roof(self, role, cx, cy, z_eave, sx, sy, ridge_h, along_y=True, tint=(1.0, 1.0, 1.0)):
        """Closed pitched gable roof prism. If along_y=True, ridge runs along Y (front-to-back)."""
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
        self._paint_faces(bm, faces, tint, z_grad=0.25)

    def hip_roof(self, role, cx, cy, z_eave, sx, sy, ridge_h, ridge_inset=0.28, tint=(1.0, 1.0, 1.0)):
        """Closed hipped roof (all 4 slopes pitch inward to a shorter ridge)."""
        bm = self._bm(role)
        hx, hy = sx * 0.5, sy * 0.5
        rx = max(0.05, hx - ridge_inset * min(sx, sy))
        ry = max(0.05, hy - ridge_inset * min(sx, sy))
        if sx >= sy:
            ry = 0.04
        else:
            rx = 0.04
        z_top = z_eave + ridge_h
        v0 = bm.verts.new((cx - hx, cy - hy, z_eave))
        v1 = bm.verts.new((cx + hx, cy - hy, z_eave))
        v2 = bm.verts.new((cx + hx, cy + hy, z_eave))
        v3 = bm.verts.new((cx - hx, cy + hy, z_eave))
        v4 = bm.verts.new((cx - rx, cy - ry, z_top))
        v5 = bm.verts.new((cx + rx, cy - ry, z_top))
        v6 = bm.verts.new((cx + rx, cy + ry, z_top))
        v7 = bm.verts.new((cx - rx, cy + ry, z_top))
        faces = [
            bm.faces.new((v3, v2, v1, v0)),
            bm.faces.new((v4, v5, v6, v7)),
            bm.faces.new((v0, v1, v5, v4)),
            bm.faces.new((v1, v2, v6, v5)),
            bm.faces.new((v2, v3, v7, v6)),
            bm.faces.new((v3, v0, v4, v7)),
        ]
        self._paint_faces(bm, faces, tint, z_grad=0.28)

    def lean_roof(self, role, cx, cy, z_low, z_high, sx, sy, high_side="-y", thick=0.14, tint=(1.0, 1.0, 1.0)):
        """Closed shed/lean-to sloped roof slab."""
        bm = self._bm(role)
        hx, hy = sx * 0.5, sy * 0.5
        # Determine corner heights
        def zh(x_neg, y_neg):
            if high_side == "-y":
                return z_high if y_neg else z_low
            if high_side == "+y":
                return z_low if y_neg else z_high
            if high_side == "-x":
                return z_high if x_neg else z_low
            return z_low if x_neg else z_high

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
        self._paint_faces(bm, faces, tint, z_grad=0.2)

    def cylinder(self, role, cx, cy, z0, z1, r0, r1=None, segs=6, rot_x=0.0, rot_y=0.0, rot_z=0.0, tint=(1.0, 1.0, 1.0)):
        """Closed cylinder/frustum spanning z0..z1."""
        if r1 is None:
            r1 = r0
        bm = self._bm(role)
        h = z1 - z0
        mat = (
            Matrix.Translation((cx, cy, (z0 + z1) * 0.5))
            @ Matrix.Rotation(rot_z, 4, "Z")
            @ Matrix.Rotation(rot_y, 4, "Y")
            @ Matrix.Rotation(rot_x, 4, "X")
        )
        res = bmesh.ops.create_cone(
            bm,
            cap_ends=True,
            cap_tris=False,
            segments=segs,
            radius1=max(0.005, r0),
            radius2=max(0.005, r1),
            depth=h,
            matrix=mat,
        )
        verts = set(res["verts"])
        faces = [f for f in bm.faces if all(v in verts for v in f.verts)]
        self._paint_faces(bm, faces, tint, z_grad=0.12)

    def stake(self, role, cx, cy, z0, z_shaft, z_tip, r, segs=6, lean_x=0.0, lean_y=0.0, tint=(1.0, 1.0, 1.0)):
        """Closed sharpened vertical wooden palisade log (buried base -> cylindrical shaft -> pointed tip)."""
        bm = self._bm(role)
        rings = []
        levels = [
            (z0, r * 1.03, 0.0, 0.0),
            (z_shaft, r * 0.96, lean_x, lean_y),
            (z_tip, r * 0.16, lean_x * 1.15, lean_y * 1.15),
        ]
        for z, rad, lx, ly in levels:
            ring = []
            for i in range(segs):
                a = (i / segs) * math.tau
                ring.append(bm.verts.new((cx + lx + math.cos(a) * rad, cy + ly + math.sin(a) * rad, z)))
            rings.append(ring)
        faces = []
        faces.append(bm.faces.new(list(reversed(rings[0]))))
        faces.append(bm.faces.new(rings[-1]))
        for k in range(len(rings) - 1):
            rA, rB = rings[k], rings[k + 1]
            for i in range(segs):
                ni = (i + 1) % segs
                faces.append(bm.faces.new((rA[i], rA[ni], rB[ni], rB[i])))
        self._paint_faces(bm, faces, tint, z_grad=0.22)

    def rod(self, role, p0, p1, radius, segs=5, tint=(1.0, 1.0, 1.0)):
        """Closed timber strut/beam between 3D points p0 and p1."""
        v0, v1 = Vector(p0), Vector(p1)
        delta = v1 - v0
        length = delta.length
        if length < 1e-4:
            return
        mid = (v0 + v1) * 0.5
        q = Vector((0.0, 0.0, 1.0)).rotation_difference(delta.normalized())
        bm = self._bm(role)
        mat = Matrix.Translation(mid) @ q.to_matrix().to_4x4()
        res = bmesh.ops.create_cone(
            bm,
            cap_ends=True,
            cap_tris=False,
            segments=segs,
            radius1=radius,
            radius2=radius,
            depth=length,
            matrix=mat,
        )
        verts = set(res["verts"])
        faces = [f for f in bm.faces if all(v in verts for v in f.verts)]
        self._paint_faces(bm, faces, tint)

    def banner_pole(self, x, y, z0, z_top, flag_w=0.65, flag_h=0.45, dir_x=1.0):
        self.cylinder("darkwood", x, y, z0, z_top, 0.048, 0.036, segs=5)
        self.box("team", x + dir_x * (flag_w * 0.5 + 0.04), y, z_top - flag_h * 0.58, flag_w, 0.05, flag_h)

    def crate(self, x, y, z0, s=0.55):
        self.box_z("wood", x, y, z0, z0 + s, s, s, tint=(0.95, 0.90, 0.82))
        self.box_z("darkwood", x, y - s * 0.51, z0 + s * 0.1, z0 + s * 0.9, s * 0.96, 0.04)

    def barrel(self, x, y, z0, r=0.24, h=0.62):
        self.cylinder("wood", x, y, z0, z0 + h, r * 0.92, r * 0.92, segs=6, tint=(0.90, 0.84, 0.76))
        self.cylinder("iron", x, y, z0 + h * 0.22, z0 + h * 0.30, r * 0.98, r * 0.98, segs=6)
        self.cylinder("iron", x, y, z0 + h * 0.72, z0 + h * 0.80, r * 0.98, r * 0.98, segs=6)

    def target_disc(self, x, y, z0=0.0):
        # Straw archery target mounted on wooden tripod legs
        self.rod("darkwood", (x - 0.32, y + 0.25, z0), (x, y, z0 + 1.45), 0.045)
        self.rod("darkwood", (x + 0.32, y + 0.25, z0), (x, y, z0 + 1.45), 0.045)
        self.rod("darkwood", (x, y + 0.52, z0), (x, y + 0.08, z0 + 1.35), 0.045)
        self.cylinder("straw", x, y - 0.04, z0 + 0.96, z0 + 1.12, 0.52, 0.52, segs=8, rot_x=math.pi / 2)
        self.cylinder("team", x, y - 0.10, z0 + 0.98, z0 + 1.10, 0.30, 0.30, segs=8, rot_x=math.pi / 2)
        self.cylinder("straw", x, y - 0.14, z0 + 1.00, z0 + 1.08, 0.12, 0.12, segs=6, rot_x=math.pi / 2)

    def finalize(self, collection, link_root=True, extra_props=None):
        if link_root:
            collection.objects.link(self.root)
        if extra_props:
            for k, v in extra_props.items():
                self.root[k] = v
        tris = 0
        for idx, (role, bm) in enumerate(sorted(self.buckets.items())):
            mesh_name = f"{self.key}:{role}"
            mesh = bpy.data.meshes.new(mesh_name)
            bm.to_mesh(mesh)
            bm.free()
            mesh.materials.append(self.mats[role])
            obj = bpy.data.objects.new(mesh_name, mesh)
            obj["assetMaterial"] = role
            obj.parent = self.root
            collection.objects.link(obj)
            tris += sum(len(p.vertices) - 2 for p in mesh.polygons)
        return self.root, tris


# ---------------------------------------------------------------------------
# 1. PALISADE WALL & PALISADE GATE (Age 1 & Age 2 Universal)
# ---------------------------------------------------------------------------
def build_palisade_wall(mats, col):
    key = "building:wall:palisade"
    b = PartBuilder(key, mats)
    # Packed soil earth mound base (buried to -0.46 for seamless hillside grounding)
    b.tapered_box("soil", 0.0, 0.0, -0.46, 0.18, 2.94, 1.08, 2.86, 0.92, tint=(0.86, 0.80, 0.72))
    # 7 sharpened vertical timber stakes along X (-1.32 .. +1.32)
    stakes = [
        (-1.26, 0.02, 2.26, 2.58, 0.22, -0.02, 0.01, (0.98, 0.92, 0.84)),
        (-0.84, -0.03, 2.18, 2.48, 0.21, 0.01, -0.02, (0.91, 0.85, 0.77)),
        (-0.42, 0.02, 2.30, 2.64, 0.22, -0.01, 0.02, (1.00, 0.94, 0.86)),
        (0.00, -0.01, 2.22, 2.54, 0.22, 0.02, -0.01, (0.93, 0.87, 0.78)),
        (0.42, 0.03, 2.32, 2.66, 0.21, -0.02, 0.01, (0.97, 0.91, 0.83)),
        (0.84, -0.02, 2.16, 2.46, 0.22, 0.01, -0.02, (0.89, 0.83, 0.75)),
        (1.26, 0.01, 2.26, 2.58, 0.22, 0.02, 0.01, (0.96, 0.90, 0.82)),
    ]
    for x, y, zsh, ztip, rad, lx, ly, tint in stakes:
        b.stake("wood", x, y, -0.46, zsh, ztip, rad, segs=6, lean_x=lx, lean_y=ly, tint=tint)
    # Horizontal binding crossbeams front & back
    for zy in (0.72, 1.78):
        b.box("darkwood", 0.0, -0.22, zy, 2.96, 0.14, 0.18)
        b.box("darkwood", 0.0, 0.22, zy, 2.96, 0.14, 0.18)
    # Angled rear timber buttress braces
    for sx in (-0.92, 0.92):
        b.rod("darkwood", (sx, 0.22, 1.78), (sx, 0.74, -0.10), 0.085, segs=5)
        b.box("iron", sx, -0.24, 1.78, 0.14, 0.16, 0.24)
        b.box("iron", sx, -0.24, 0.72, 0.14, 0.16, 0.24)
    return b.finalize(col)


def build_palisade_gate(mats, col):
    key = "building:gate:palisade"
    b = PartBuilder(key, mats)
    # Beefy twin timber log watch-towers flanking x = +/- 2.12 (leaving clear passage x in [-1.25, +1.25])
    for side in (-1.0, 1.0):
        px = side * 2.12
        b.tapered_box("soil", px, 0.0, -0.46, 0.22, 1.88, 1.86, 1.74, 1.72, tint=(0.86, 0.80, 0.72))
        # Four heavy corner vertical posts rising into watch-tower platforms
        for ox in (-0.64, 0.64):
            for oy in (-0.62, 0.62):
                b.stake("darkwood", px + ox, oy, -0.46, 3.88, 4.24, 0.22, segs=6)
        # Inner wooden palisade cladding posts around each flanking pier
        for oy in (-0.22, 0.22):
            b.stake("wood", px - side * 0.64, oy, -0.46, 3.45, 3.74, 0.19, segs=6)
            b.stake("wood", px + side * 0.64, oy, -0.46, 3.45, 3.74, 0.19, segs=6)
        for ox in (-0.22, 0.22):
            b.stake("wood", px + ox, -0.62, -0.46, 3.45, 3.74, 0.19, segs=6)
            b.stake("wood", px + ox, 0.62, -0.46, 3.45, 3.74, 0.19, segs=6)
        # Horizontal rails + cantilevered wooden watch-deck & parapet atop each gate tower
        for zy in (0.95, 2.15, 3.22):
            b.box("darkwood", px, 0.0, zy, 1.66, 1.58, 0.18)
        b.box("wood", px, 0.0, 3.38, 1.84, 1.78, 0.18)
        b.box("darkwood", px, 0.0, 4.02, 1.86, 1.80, 0.14)
    # Tall commanding overhead timber lintel bridge + pitched gatehouse roof (clear above y=3.15!)
    b.box("darkwood", 0.0, -0.46, 3.24, 4.90, 0.28, 0.42)
    b.box("darkwood", 0.0, 0.46, 3.24, 4.90, 0.28, 0.42)
    b.box("wood", 0.0, 0.0, 3.48, 5.20, 1.58, 0.24)
    b.gable_roof("straw", 0.0, 0.0, 3.58, 6.20, 2.08, 1.18, along_y=False, tint=(0.98, 0.94, 0.84))
    b.gable_roof("teamRoof", 0.0, 0.0, 4.18, 3.80, 1.06, 0.58, along_y=False)
    b.box("darkwood", 0.0, 0.0, 4.78, 6.32, 0.16, 0.14)
    # Prominent team banners on both flanking watch-towers
    b.banner_pole(2.12, -0.62, 3.38, 5.65, flag_w=0.82, flag_h=0.52, dir_x=1.0)
    b.banner_pole(-2.12, -0.62, 3.38, 5.65, flag_w=0.82, flag_h=0.52, dir_x=-1.0)

    root, tris = b.finalize(col, extra_props={"gateHousingHeight": 3.15, "artRevision": "gate-footings-v1"})

    # Animated wooden palisade gate leaf (userData.gate = true -> retracts up into overhead lintel)
    gate_group = bpy.data.objects.new(f"{key}:gateLeaf", None)
    gate_group["gate"] = True
    gate_group.parent = root
    col.objects.link(gate_group)
    gb = PartBuilder(f"{key}:gateLeaf", mats, parent=gate_group)
    for x in (-1.02, -0.68, -0.34, 0.0, 0.34, 0.68, 1.02):
        gb.box_z("wood", x, 0.0, 0.02, 2.94, 0.31, 0.20, tint=(0.92, 0.84, 0.72))
    for zy in (0.60, 1.50, 2.42):
        gb.box("darkwood", 0.0, -0.11, zy, 2.38, 0.09, 0.18)
        gb.box("darkwood", 0.0, 0.11, zy, 2.38, 0.09, 0.18)
    # Iron strap hinges & cross-brace
    gb.rod("darkwood", (-1.05, -0.13, 0.60), (1.05, -0.13, 2.42), 0.065)
    for side in (-1.0, 1.0):
        for zy in (0.60, 2.42):
            gb.box("iron", side * 0.96, -0.14, zy, 0.36, 0.08, 0.11)
    _, gate_tris = gb.finalize(col, link_root=False)
    return root, tris + gate_tris


# ---------------------------------------------------------------------------
# 2. AGE 1 — FRONTIER / DARK AGE (Universal Humble Wood & Thatch)
# ---------------------------------------------------------------------------
def _frontier_hut_shell(b, cx, cy, sx, sy, wall_h, roof_h, along_y=True, door_front=True, team_trim=True):
    # Packed earth & rough timber footing down to -0.46
    b.tapered_box("soil", cx, cy, -0.46, 0.14, sx + 0.50, sy + 0.50, sx + 0.24, sy + 0.24, tint=(0.84, 0.78, 0.68))
    # Low timber-plank / wattle walls
    b.box_z("wood", cx, cy, 0.10, wall_h, sx, sy, tint=(0.94, 0.87, 0.76), z_grad=0.18)
    # Rough darkwood corner posts & horizontal eave sill logs
    hx, hy = sx * 0.5, sy * 0.5
    for px in (-hx, hx):
        for py in (-hy, hy):
            b.cylinder("darkwood", cx + px, cy + py, -0.46, wall_h + 0.08, 0.13, 0.11, segs=6)
    b.box("darkwood", cx, cy, wall_h - 0.04, sx + 0.18, sy + 0.18, 0.14)
    # Thick rustic golden straw-thatch pitched roof
    b.gable_roof("straw", cx, cy, wall_h - 0.08, sx + 0.72, sy + 0.64, roof_h, along_y=along_y, tint=(1.0, 0.95, 0.84))
    # Ridge pole & subtle team cloth saddle/stripe along top ridge for instant team readability
    if along_y:
        b.box("darkwood", cx, cy, wall_h - 0.04 + roof_h, 0.16, sy + 0.84, 0.16)
        if team_trim:
            b.gable_roof("teamRoof", cx, cy, wall_h - 0.06 + roof_h * 0.58, (sx + 0.72) * 0.44, sy * 0.68, roof_h * 0.44, along_y=True)
    else:
        b.box("darkwood", cx, cy, wall_h - 0.04 + roof_h, sx + 0.84, 0.16, 0.16)
        if team_trim:
            b.gable_roof("teamRoof", cx, cy, wall_h - 0.06 + roof_h * 0.58, sx * 0.68, (sy + 0.64) * 0.44, roof_h * 0.44, along_y=False)
    if door_front:
        b.box_z("darkwood", cx, cy - hy - 0.04, 0.10, min(wall_h - 0.18, 1.48), 0.78, 0.12)
        b.box("wood", cx, cy - hy - 0.08, 0.12, 0.96, 0.22, 0.12)


def build_frontier_towncenter(mats, col):
    key = "building:towncenter:frontier"
    b = PartBuilder(key, mats)
    # Wide packed-earth & timber-curb settlement terrace
    b.tapered_box("soil", 0.0, 0.0, -0.46, 0.24, 8.20, 7.60, 7.70, 7.10, tint=(0.86, 0.79, 0.69))
    b.box("darkwood", 0.0, -3.50, 0.18, 7.40, 0.22, 0.22)
    b.box("darkwood", 0.0, 3.50, 0.18, 7.40, 0.22, 0.22)
    # Main humble chieftain's timber hall at back
    b.box_z("wood", 0.0, 1.15, 0.20, 2.65, 5.20, 3.40, tint=(0.94, 0.87, 0.76), z_grad=0.2)
    for px in (-2.55, 0.0, 2.55):
        for py in (-0.52, 2.82):
            b.cylinder("darkwood", px, py, -0.46, 2.75, 0.15, 0.13, segs=6)
    b.gable_roof("straw", 0.0, 1.15, 2.58, 6.00, 4.10, 1.75, along_y=False, tint=(1.0, 0.94, 0.82))
    b.gable_roof("teamRoof", 0.0, 1.15, 3.48, 3.90, 2.05, 0.88, along_y=False)
    b.box("darkwood", 0.0, 1.15, 4.35, 6.24, 0.18, 0.18)
    # Warm lantern window & double plank entrance
    b.box_z("darkwood", 0.0, -0.56, 0.22, 1.95, 1.35, 0.16)
    for sx in (-1.55, 1.55):
        b.box("glass", sx, -0.56, 1.48, 0.52, 0.10, 0.56)
        b.box("darkwood", sx, -0.57, 1.48, 0.62, 0.06, 0.08)
    # Open thatched meeting portico in front
    for px in (-2.40, -0.80, 0.80, 2.40):
        b.cylinder("darkwood", px, -2.55, -0.46, 2.15, 0.13, 0.11, segs=6)
    b.box("darkwood", 0.0, -2.55, 2.15, 5.10, 0.18, 0.18)
    b.lean_roof("straw", 0.0, -1.60, 2.12, 2.68, 5.60, 2.25, high_side="+y", thick=0.18, tint=(0.98, 0.92, 0.80))
    # Team awning stripes on portico front
    for sx in (-1.60, 0.0, 1.60):
        b.box("team", sx, -2.68, 1.96, 1.18, 0.08, 0.34)
    # Rustic open wooden bell-tower frame on right side (5.8m tall - humble vs Castle TC 10.9m!)
    bx, by = -2.55, 0.85
    for ox in (-0.62, 0.62):
        for oy in (-0.62, 0.62):
            b.rod("darkwood", (bx + ox * 1.18, by + oy * 1.18, -0.46), (bx + ox * 0.88, by + oy * 0.88, 4.65), 0.11, segs=5)
    b.box("wood", bx, by, 3.65, 1.42, 1.42, 0.16)
    b.cylinder("gold", bx, by, 3.92, 4.46, 0.30, 0.18, segs=7)
    b.hip_roof("straw", bx, by, 4.58, 1.92, 1.92, 1.05, ridge_inset=0.42, tint=(0.98, 0.93, 0.82))
    # Small firepit + supplies in front yard
    b.cylinder("brick", 2.15, -2.05, 0.18, 0.46, 0.56, 0.52, segs=7)
    b.cylinder("glow", 2.15, -2.05, 0.32, 0.52, 0.32, 0.16, segs=6)
    b.crate(-2.30, -1.90, 0.22, 0.62)
    b.barrel(-1.48, -2.15, 0.22, 0.24, 0.62)
    b.banner_pole(2.70, -2.55, 0.20, 5.45, flag_w=1.05, flag_h=0.68, dir_x=1.0)
    return b.finalize(col)


def build_frontier_house(mats, col):
    key = "building:house:frontier"
    b = PartBuilder(key, mats)
    _frontier_hut_shell(b, 0.0, 0.0, 2.75, 2.55, 1.68, 1.42, along_y=True, door_front=True, team_trim=True)
    # Warm hearth window on side & stacked firewood logs
    b.box("glass", 1.39, 0.0, 1.02, 0.08, 0.48, 0.46)
    for k in range(3):
        b.cylinder("trunk", -1.62, -0.25 + k * 0.28, 0.10, 0.46, 0.12, 0.12, segs=5, rot_x=math.pi / 2)
    return b.finalize(col)


def build_frontier_barracks(mats, col):
    key = "building:barracks:frontier"
    b = PartBuilder(key, mats)
    # Main low timber warrior longhouse
    b.tapered_box("soil", 0.0, 0.0, -0.46, 0.16, 5.85, 5.20, 5.55, 4.90, tint=(0.84, 0.78, 0.68))
    _frontier_hut_shell(b, 0.0, 0.85, 4.80, 2.75, 2.05, 1.55, along_y=False, door_front=True, team_trim=True)
    # Front fenced dirt training pen
    for px in (-2.45, -1.25, 1.25, 2.45):
        b.stake("darkwood", px, -2.15, -0.46, 1.05, 1.22, 0.09, segs=5)
    for side in (-1.0, 1.0):
        b.box("wood", side * 1.85, -2.15, 0.58, 1.30, 0.10, 0.12)
        b.box("wood", side * 1.85, -2.15, 0.92, 1.30, 0.10, 0.12)
        b.box("wood", side * 2.45, -1.35, 0.72, 0.10, 1.65, 0.14)
    # Spear rack on left & straw training dummy on right
    b.box("darkwood", -1.65, -1.45, 0.95, 1.20, 0.10, 0.10)
    for sx in (-2.00, -1.65, -1.30):
        b.cylinder("wood", sx, -1.48, 0.15, 2.25, 0.035, 0.030, segs=4)
        b.cylinder("steel", sx, -1.48, 2.25, 2.55, 0.065, 0.01, segs=4)
    # Training dummy
    b.cylinder("darkwood", 1.65, -1.45, 0.12, 1.68, 0.07, 0.06, segs=5)
    b.box("darkwood", 1.65, -1.45, 1.30, 0.92, 0.09, 0.09)
    b.cylinder("straw", 1.65, -1.45, 0.95, 1.52, 0.22, 0.20, segs=6)
    b.banner_pole(2.35, -0.40, 0.15, 4.15, flag_w=0.82, flag_h=0.52)
    return b.finalize(col)


def build_frontier_mill(mats, col):
    key = "building:mill:frontier"
    b = PartBuilder(key, mats)
    # Humble rustic Dark Age grinding shelter + grain sacks + compact timber wind-vane
    b.tapered_box("soil", 0.0, 0.0, -0.46, 0.16, 4.10, 4.00, 3.85, 3.75, tint=(0.85, 0.79, 0.69))
    _frontier_hut_shell(b, 0.0, 0.25, 2.95, 2.85, 2.15, 1.38, along_y=True, door_front=True, team_trim=True)
    # Grinding millstone & wooden grain trough out front-right
    b.cylinder("stone", 1.32, -1.15, 0.14, 0.56, 0.54, 0.52, segs=8)
    b.cylinder("darkwood", 1.32, -1.15, 0.54, 1.15, 0.09, 0.08, segs=5)
    b.box("wood", -1.25, -1.20, 0.42, 0.95, 0.65, 0.52)
    b.box("grain", -1.25, -1.20, 0.66, 0.78, 0.50, 0.14)
    b.barrel(1.52, 0.55, 0.16, 0.24, 0.60)
    # Compact rustic axle mount on front gable (hub at Blender y=-1.82, z=2.45 -> Three.js z=+1.82, y=2.45)
    root, tris = b.finalize(col)
    mount = PartBuilder(f"{key}:mount", mats, parent=root)
    mount.cylinder("darkwood", 0.0, -1.48, 2.42, 2.50, 0.13, 0.13, segs=6, rot_x=math.pi / 2)
    _, mount_tris = mount.finalize(col, link_root=False)
    for child in root.children:
        if child.name.startswith(f"{key}:mount"):
            child["windmillMount"] = True

    # Small rustic timber vane rotor (radius 1.48 -> lowest tip y = 2.45 - 1.48 = 0.97m well clear of ground!)
    rotor = bpy.data.objects.new(f"{key}:rotor", None)
    rotor["windmill"] = True
    rotor.location = (0.0, -1.85, 2.45)
    rotor.parent = root
    col.objects.link(rotor)
    rb = PartBuilder(f"{key}:rotor", mats, parent=rotor)
    rb.cylinder("iron", 0.0, 0.0, -0.09, 0.09, 0.16, 0.16, segs=6, rot_x=math.pi / 2)
    for i in range(4):
        ang = i * math.pi / 2
        ca, sa = math.cos(ang), math.sin(ang)
        # Blade arm in Blender XZ plane (= Three.js XY plane)
        rb.rod("darkwood", (0.0, 0.0, 0.0), (ca * 1.48, 0.0, sa * 1.48), 0.055, segs=4)
        # Small woven rustic cloth sail panel
        cx = ca * 0.92 - sa * 0.20
        cz = sa * 0.92 + ca * 0.20
        rb.box("canvas", cx, -0.02, cz, 0.96, 0.05, 0.38, rot_y=-ang)
    _, rotor_tris = rb.finalize(col, link_root=False)
    return root, tris + mount_tris + rotor_tris


def build_frontier_camp(mats, col):
    key = "building:camp:frontier"
    b = PartBuilder(key, mats)
    b.tapered_box("soil", 0.0, 0.0, -0.46, 0.14, 3.85, 3.65, 3.65, 3.45, tint=(0.82, 0.76, 0.66))
    # 4 rough timber corner posts supporting a sloped straw-thatch lean-to
    for px in (-1.45, 1.45):
        b.cylinder("darkwood", px, 1.15, -0.46, 2.48, 0.12, 0.10, segs=6)
        b.cylinder("darkwood", px, -1.15, -0.46, 1.92, 0.12, 0.10, segs=6)
    b.lean_roof("straw", 0.0, 0.0, 1.92, 2.58, 3.65, 3.05, high_side="+y", thick=0.22, tint=(0.98, 0.92, 0.80))
    b.box("teamRoof", 0.0, 1.38, 2.60, 2.80, 0.36, 0.12)
    # Stacked cut logs under canopy
    for row, count, rz in [(0, 4, 0.32), (1, 3, 0.64)]:
        for i in range(count):
            lx = -0.85 + (i + row * 0.5) * 0.42
            b.cylinder("trunk", lx, 0.25, rz - 0.16, rz + 0.16, 0.16, 0.16, segs=6, rot_x=math.pi / 2)
    # Chopping block + hatchet
    b.cylinder("wood", 1.15, -1.05, 0.10, 0.78, 0.32, 0.30, segs=7)
    b.rod("wood", (1.15, -1.05, 0.75), (1.36, -1.05, 1.48), 0.038, segs=4)
    b.box("steel", 1.24, -1.05, 1.38, 0.28, 0.08, 0.22)
    b.banner_pole(-1.55, -1.25, 0.10, 3.15, flag_w=0.58, flag_h=0.38)
    return b.finalize(col)


def build_frontier_mine(mats, col):
    key = "building:mine:frontier"
    b = PartBuilder(key, mats)
    b.tapered_box("soil", 0.0, 0.0, -0.46, 0.14, 3.85, 3.85, 3.65, 3.65, tint=(0.76, 0.72, 0.66))
    # Rough timber mine tunnel entrance frame
    for px in (-1.35, 1.35):
        b.rod("darkwood", (px, 0.75, -0.46), (px * 0.72, 0.75, 2.38), 0.14, segs=5)
        b.rod("darkwood", (px, -0.25, -0.46), (px * 0.72, -0.25, 2.38), 0.14, segs=5)
    b.box("darkwood", 0.0, 0.25, 2.38, 2.45, 1.38, 0.20)
    b.box_z("darkwood", 0.0, 0.92, 0.10, 2.25, 2.15, 0.18, tint=(0.55, 0.50, 0.46))
    b.lean_roof("straw", 0.0, 0.35, 2.22, 2.68, 3.20, 1.95, high_side="-y", thick=0.20, tint=(0.94, 0.88, 0.76))
    # Timber ore chute & hand-cart full of rough rocks
    b.box("wood", 0.0, -1.05, 0.55, 1.55, 1.05, 0.56)
    for sx in (-0.82, 0.82):
        b.cylinder("darkwood", sx, -1.05, 0.14, 0.54, 0.24, 0.24, segs=7, rot_y=math.pi / 2)
    for ox, oy, oz in [(-0.32, -1.02, 0.92), (0.28, -1.12, 0.94), (0.0, -0.88, 0.98)]:
        b.box("stone", ox, oy, oz, 0.38, 0.34, 0.32, rot_z=ox * 2.1)
    b.barrel(-1.35, -1.05, 0.12, 0.24, 0.58)
    b.banner_pole(1.50, -0.95, 0.10, 3.05, flag_w=0.58, flag_h=0.38)
    return b.finalize(col)


# ---------------------------------------------------------------------------
# 3. AGE 2 — FEUDAL REGIONAL ARCHITECTURE (Alder / Sunward / Raven)
# ---------------------------------------------------------------------------
SUN_ADOBE = (1.00, 0.87, 0.68)
SUN_ADOBE_TRIM = (0.94, 0.78, 0.56)
RAVEN_LOG = (0.86, 0.74, 0.60)
ALDER_PLASTER = (0.98, 0.96, 0.90)


def feudal_hall(b, civ, cx, cy, sx, sy, wall_h, roof_h, along_y=True, door_front=True, chimney=False):
    """Builds one civilization-authentic Feudal Age (Age 2) building body:
       - alder: half-timbered oak frames + cream plaster + pitched teamRoof shingles
       - sun:   flat-roof desert clay/adobe + stepped parapet + projecting darkwood vigas + woven team awning (NO DOME!)
       - raven: horizontal notched dark log-cabin + steep pitched Nordic teamRoof + crossed gable ridge horns
    """
    hx, hy = sx * 0.5, sy * 0.5
    if civ == "alder":
        # Low rubble footing down to -0.46
        b.tapered_box("stoneDark", cx, cy, -0.46, 0.36, sx + 0.36, sy + 0.36, sx + 0.16, sy + 0.16)
        b.box_z("plaster", cx, cy, 0.32, wall_h, sx, sy, tint=ALDER_PLASTER, z_grad=0.14)
        # Exposed Western European half-timbering (corner posts, mid-posts, eave/belt beams, diagonal braces)
        for px in (-hx, 0.0, hx):
            for py in (-hy, hy):
                b.box_z("darkwood", cx + px, cy + py, 0.30, wall_h + 0.04, 0.16, 0.16)
        for px in (-hx, hx):
            b.box_z("darkwood", cx + px, cy, 0.30, wall_h + 0.04, 0.16, 0.16)
        for zy in (0.38, wall_h * 0.54, wall_h - 0.04):
            b.box("darkwood", cx, cy, zy, sx + 0.12, sy + 0.12, 0.12)
        # Diagonal oak braces on front corners
        for side in (-1.0, 1.0):
            b.rod("darkwood", (cx + side * (hx - 0.08), cy - hy - 0.03, 0.44), (cx + side * (hx * 0.45), cy - hy - 0.03, wall_h - 0.12), 0.055, segs=4)
        # Pitched medieval shingle roof + darkwood ridge beam
        b.gable_roof("teamRoof", cx, cy, wall_h - 0.06, sx + 0.62, sy + 0.58, roof_h, along_y=along_y)
        if along_y:
            b.box("darkwood", cx, cy, wall_h - 0.02 + roof_h, 0.14, sy + 0.68, 0.14)
        else:
            b.box("darkwood", cx, cy, wall_h - 0.02 + roof_h, sx + 0.68, 0.14, 0.14)
        if chimney:
            b.box_z("brick", cx - hx * 0.52, cy + hy * 0.32, wall_h * 0.5, wall_h + roof_h + 0.46, 0.48, 0.48)
            b.box("stoneDark", cx - hx * 0.52, cy + hy * 0.32, wall_h + roof_h + 0.50, 0.58, 0.58, 0.12)
        # Windows
        for side in (-1.0, 1.0):
            if sx >= 3.2:
                b.box("glass", cx + side * hx * 0.54, cy - hy - 0.04, wall_h * 0.64, 0.46, 0.08, 0.54)
            b.box("glass", cx + side * (hx + 0.04), cy, wall_h * 0.64, 0.08, 0.50, 0.54)

    elif civ == "sun":
        # Sun-baked desert mud-brick foundation & battered adobe walls (NO DOME!)
        b.tapered_box("soil", cx, cy, -0.46, 0.28, sx + 0.42, sy + 0.42, sx + 0.18, sy + 0.18, tint=(0.88, 0.78, 0.62))
        b.tapered_box("plaster", cx, cy, 0.24, wall_h, sx + 0.08, sy + 0.08, sx - 0.12, sy - 0.12, tint=SUN_ADOBE, z_grad=0.14)
        # Flat roof parapet walls around terrace perimeter + corner crenellation nubs
        parapet_h = 0.42
        b.box_z("plaster", cx, cy - hy + 0.12, wall_h - 0.04, wall_h + parapet_h, sx - 0.10, 0.22, tint=SUN_ADOBE_TRIM)
        b.box_z("plaster", cx, cy + hy - 0.12, wall_h - 0.04, wall_h + parapet_h, sx - 0.10, 0.22, tint=SUN_ADOBE_TRIM)
        b.box_z("plaster", cx - hx + 0.12, cy, wall_h - 0.04, wall_h + parapet_h, 0.22, sy - 0.10, tint=SUN_ADOBE_TRIM)
        b.box_z("plaster", cx + hx - 0.12, cy, wall_h - 0.04, wall_h + parapet_h, 0.22, sy - 0.10, tint=SUN_ADOBE_TRIM)
        for px in (-hx + 0.14, hx - 0.14):
            for py in (-hy + 0.14, hy - 0.14):
                b.box_z("plaster", cx + px, cy + py, wall_h + parapet_h - 0.02, wall_h + parapet_h + 0.22, 0.30, 0.30, tint=SUN_ADOBE_TRIM)
        # Projecting darkwood roof beams (vigas) protruding from front & back walls
        viga_n = max(3, int(sx / 0.85))
        for i in range(viga_n):
            vx = cx - (hx - 0.35) + (i / max(1, viga_n - 1)) * (sx - 0.70)
            b.box("darkwood", vx, cy, wall_h - 0.16, 0.11, sy + 0.42, 0.11)
        # Colorful woven team cloth sun-canopy shading part of the flat rooftop terrace!
        can_w = sx * 0.72
        can_d = sy * 0.68
        for px in (-can_w * 0.46, can_w * 0.46):
            for py in (-can_d * 0.44, can_d * 0.44):
                b.cylinder("darkwood", cx + px, cy + py, wall_h - 0.04, wall_h + 1.05, 0.055, 0.050, segs=4)
        b.lean_roof("teamRoof", cx, cy, wall_h + 0.88, wall_h + 1.18, can_w + 0.26, can_d + 0.24, high_side="+y", thick=0.09)
        # Recessed shaded desert windows
        for side in (-1.0, 1.0):
            if sx >= 3.2:
                b.box("darkwood", cx + side * hx * 0.50, cy - hy + 0.02, wall_h * 0.62, 0.38, 0.12, 0.56)
                b.box("glass", cx + side * hx * 0.50, cy - hy + 0.01, wall_h * 0.62, 0.26, 0.10, 0.42)
        if chimney:
            b.box_z("plaster", cx - hx * 0.50, cy + hy * 0.30, wall_h, wall_h + 1.25, 0.52, 0.52, tint=SUN_ADOBE_TRIM)

    else:  # raven — Northern European horizontal log-cabin + steep wood-shingle Nordic roof
        b.tapered_box("stoneDark", cx, cy, -0.46, 0.30, sx + 0.38, sy + 0.38, sx + 0.18, sy + 0.18)
        # Main horizontal timber log wall core + protruding interlocking notched log courses at corners!
        b.box_z("wood", cx, cy, 0.26, wall_h, sx, sy, tint=RAVEN_LOG, z_grad=0.18)
        courses = max(4, int((wall_h - 0.26) / 0.38))
        dz = (wall_h - 0.28) / courses
        for c in range(courses):
            cz = 0.28 + (c + 0.5) * dz
            tint = (0.88, 0.76, 0.62) if c % 2 == 0 else (0.76, 0.64, 0.50)
            b.box("wood", cx, cy - hy, cz, sx + 0.34, 0.16, dz * 0.86, tint=tint)
            b.box("wood", cx, cy + hy, cz, sx + 0.34, 0.16, dz * 0.86, tint=tint)
            b.box("wood", cx - hx, cy, cz, 0.16, sy + 0.34, dz * 0.86, tint=tint)
            b.box("wood", cx + hx, cy, cz, 0.16, sy + 0.34, dz * 0.86, tint=tint)
        # Steep Nordic wood-shingle pitched roof (1.28x steeper!) + crossed gable dragon/raven ridge horns
        steep_h = roof_h * 1.28
        b.gable_roof("teamRoof", cx, cy, wall_h - 0.08, sx + 0.76, sy + 0.68, steep_h, along_y=along_y)
        peak_z = wall_h - 0.04 + steep_h
        if along_y:
            b.box("darkwood", cx, cy, peak_z, 0.18, sy + 0.92, 0.18)
            for end in (-1.0, 1.0):
                ey = cy + end * (sy * 0.5 + 0.36)
                b.rod("darkwood", (cx - 0.28, ey, peak_z - 0.22), (cx + 0.24, ey, peak_z + 0.42), 0.065, segs=4)
                b.rod("darkwood", (cx + 0.28, ey, peak_z - 0.22), (cx - 0.24, ey, peak_z + 0.42), 0.065, segs=4)
        else:
            b.box("darkwood", cx, cy, peak_z, sx + 0.92, 0.18, 0.18)
            for end in (-1.0, 1.0):
                ex = cx + end * (sx * 0.5 + 0.36)
                b.rod("darkwood", (ex, cy - 0.28, peak_z - 0.22), (ex, cy + 0.24, peak_z + 0.42), 0.065, segs=4)
                b.rod("darkwood", (ex, cy + 0.28, peak_z - 0.22), (ex, cy - 0.24, peak_z + 0.42), 0.065, segs=4)
        if chimney:
            b.box_z("stoneDark", cx - hx * 0.48, cy + hy * 0.30, wall_h * 0.5, peak_z + 0.35, 0.48, 0.48)
        for side in (-1.0, 1.0):
            if sx >= 3.2:
                b.box("glass", cx + side * hx * 0.52, cy - hy - 0.09, wall_h * 0.58, 0.44, 0.08, 0.48)

    if door_front:
        door_h = min(wall_h - 0.24, 1.65)
        b.box_z("darkwood", cx, cy - hy - 0.05, 0.24, door_h, 0.88, 0.14)
        b.box("wood", cx, cy - hy - 0.12, 0.26, 1.12, 0.28, 0.14)
        if civ == "sun":
            # Front cloth shade over desert doorway
            b.lean_roof("team", cx, cy - hy - 0.48, door_h - 0.08, door_h + 0.18, 1.38, 0.85, high_side="+y", thick=0.07)
            for sx_p in (-0.58, 0.58):
                b.cylinder("darkwood", cx + sx_p, cy - hy - 0.82, 0.0, door_h - 0.06, 0.05, 0.045, segs=4)


def build_feudal_towncenter(civ, mats, col):
    key = f"building:towncenter:{civ}:1"
    b = PartBuilder(key, mats)
    # Regional courtyard base (footprint ~8.8m x 8.4m, height ~7.2-7.8m — bigger than Age 1, smaller than Castle 10.9m!)
    b.tapered_box("stoneDark" if civ != "sun" else "soil", 0.0, 0.0, -0.46, 0.34, 8.60, 8.10, 8.20, 7.70, tint=(0.92, 0.84, 0.70) if civ == "sun" else (1.0, 1.0, 1.0))
    # Main civic hall + two flanking wings
    feudal_hall(b, civ, 0.0, 1.35, 5.10, 3.60, 3.45, 2.05, along_y=False, door_front=True, chimney=(civ != "sun"))
    feudal_hall(b, civ, -2.95, 1.55, 2.25, 2.85, 2.45, 1.35, along_y=True, door_front=False)
    feudal_hall(b, civ, 2.95, 1.55, 2.25, 2.85, 2.45, 1.35, along_y=True, door_front=False)
    # Front timber civic portico / oasis bazaar colonnade
    for px in (-2.75, -0.95, 0.95, 2.75):
        b.cylinder("darkwood", px, -2.55, -0.46, 2.55, 0.14, 0.12, segs=6)
    b.box("darkwood", 0.0, -2.55, 2.52, 5.80, 0.20, 0.20)
    if civ == "sun":
        b.lean_roof("team", 0.0, -1.60, 2.46, 2.95, 6.20, 2.30, high_side="+y", thick=0.10)
        # Flat-topped adobe minaret/watch-belfry (NO DOME!)
        b.tapered_box("plaster", 0.0, 2.55, 3.20, 6.45, 1.65, 1.65, 1.42, 1.42, tint=SUN_ADOBE)
        b.box("plaster", 0.0, 2.55, 6.62, 1.58, 1.58, 0.34, tint=SUN_ADOBE_TRIM)
        b.lean_roof("teamRoof", 0.0, 2.55, 7.12, 7.36, 1.72, 1.72, high_side="+y", thick=0.09)
        for ox in (-0.58, 0.58):
            for oy in (-0.58, 0.58):
                b.cylinder("darkwood", ox, 2.55 + oy, 6.55, 7.18, 0.06, 0.05, segs=4)
    else:
        b.lean_roof("teamRoof", 0.0, -1.60, 2.48, 3.05, 6.25, 2.35, high_side="+y", thick=0.16)
        # Timber bell-turret rising from rear hall
        b.box_z("wood" if civ == "raven" else "plaster", 0.0, 2.35, 3.30, 5.75, 1.56, 1.56, tint=RAVEN_LOG if civ == "raven" else ALDER_PLASTER)
        for ox in (-0.78, 0.78):
            for oy in (-0.78, 0.78):
                b.box_z("darkwood", ox, 2.35 + oy, 3.30, 5.80, 0.16, 0.16)
        b.hip_roof("teamRoof", 0.0, 2.35, 5.72, 2.15, 2.15, 1.65 if civ == "raven" else 1.25, ridge_inset=0.45)
        b.cylinder("gold", 0.0, 2.35, 5.10, 5.56, 0.26, 0.16, segs=6)
    # Courtyard details
    b.crate(-2.45, -1.90, 0.32, 0.64)
    b.barrel(2.45, -1.95, 0.32, 0.26, 0.64)
    b.banner_pole(0.0, -2.60, 2.55, 6.85, flag_w=1.12, flag_h=0.70)
    if civ == "raven":
        # Decorative Nordic round team shields mounted on front portico beam
        for sx in (-1.85, 0.0, 1.85):
            b.cylinder("team", sx, -2.68, 2.36, 2.46, 0.34, 0.34, segs=8, rot_x=math.pi / 2)
    return b.finalize(col)


def build_feudal_house(civ, mats, col):
    key = f"building:house:{civ}:1"
    b = PartBuilder(key, mats)
    feudal_hall(b, civ, 0.0, 0.0, 3.45, 3.15, 2.25, 1.65, along_y=True, door_front=True, chimney=(civ != "sun"))
    b.crate(1.98, 0.45, 0.0, 0.50)
    return b.finalize(col)


def build_feudal_barracks(civ, mats, col):
    key = f"building:barracks:{civ}:1"
    b = PartBuilder(key, mats)
    b.tapered_box("stoneDark" if civ != "sun" else "soil", 0.0, 0.0, -0.46, 0.20, 6.35, 5.75, 6.05, 5.45)
    feudal_hall(b, civ, 0.0, 0.90, 5.45, 3.20, 2.65, 1.75, along_y=False, door_front=True)
    # Front training yard racks & shields
    for sx in (-2.05, 2.05):
        b.box_z("darkwood", sx, -2.05, 0.16, 1.72, 0.12, 0.12)
        b.box("darkwood", sx, -2.05, 1.38, 1.25, 0.10, 0.10)
        for k in (-0.36, 0.0, 0.36):
            b.cylinder("wood", sx + k, -2.08, 0.20, 2.25, 0.035, 0.030, segs=4)
            b.cylinder("steel", sx + k, -2.08, 2.25, 2.52, 0.065, 0.01, segs=4)
    b.banner_pole(2.75, -0.85, 0.18, 5.20, flag_w=0.92, flag_h=0.58)
    return b.finalize(col)


def build_feudal_mill(civ, mats, col):
    key = f"building:mill:{civ}:1"
    b = PartBuilder(key, mats)
    # Wooden post-mill / adobe wind-tower base + rotating timber/canvas sails!
    b.tapered_box("stoneDark" if civ != "sun" else "soil", 0.0, 0.0, -0.46, 0.24, 4.40, 4.40, 4.10, 4.10)
    feudal_hall(b, civ, 0.0, 0.35, 3.25, 3.20, 3.75, 1.55, along_y=True, door_front=True)
    b.barrel(1.88, -0.85, 0.20, 0.26, 0.65)
    b.crate(-1.82, -0.92, 0.20, 0.58)
    b.box("grain", -1.82, -0.92, 0.82, 0.46, 0.46, 0.14)
    root, tris = b.finalize(col)

    hub_y, hub_z = -1.78, 3.55
    mount = PartBuilder(f"{key}:mount", mats, parent=root)
    mount.box("darkwood", 0.0, -1.32, hub_z, 0.52, 0.52, 0.52)
    mount.cylinder("darkwood", 0.0, -1.55, hub_z - 0.14, hub_z + 0.14, 0.14, 0.14, segs=6, rot_x=math.pi / 2)
    _, mount_tris = mount.finalize(col, link_root=False)
    for child in root.children:
        if child.name.startswith(f"{key}:mount"):
            child["windmillMount"] = True

    rotor = bpy.data.objects.new(f"{key}:rotor", None)
    rotor["windmill"] = True
    rotor.location = (0.0, hub_y, hub_z)
    rotor.parent = root
    col.objects.link(rotor)
    rb = PartBuilder(f"{key}:rotor", mats, parent=rotor)
    rb.cylinder("iron", 0.0, 0.0, -0.10, 0.10, 0.20, 0.20, segs=6, rot_x=math.pi / 2)
    blade_len = 2.38  # lowest sweep z = 3.55 - 2.38 = 1.17m well above ground!
    for i in range(4):
        ang = i * math.pi / 2
        ca, sa = math.cos(ang), math.sin(ang)
        rb.rod("darkwood", (0.0, 0.0, 0.0), (ca * blade_len, 0.0, sa * blade_len), 0.068, segs=4)
        cx = ca * 1.48 - sa * 0.26
        cz = sa * 1.48 + ca * 0.26
        rb.box("canvas" if civ != "sun" else "team", cx, -0.02, cz, 1.56, 0.06, 0.50, rot_y=-ang)
    _, rotor_tris = rb.finalize(col, link_root=False)
    return root, tris + mount_tris + rotor_tris


def build_feudal_camp(civ, mats, col):
    key = f"building:camp:{civ}:1"
    b = PartBuilder(key, mats)
    b.tapered_box("stoneDark" if civ != "sun" else "soil", 0.0, 0.0, -0.46, 0.18, 4.05, 3.85, 3.85, 3.65)
    # Sturdy Feudal regional timber-shed overhang
    for px in (-1.55, 1.55):
        for py in (-1.25, 1.25):
            b.box_z("darkwood", px, py, -0.46, 2.38, 0.18, 0.18)
    if civ == "sun":
        b.box("plaster", 0.0, 1.20, 1.25, 3.30, 0.26, 2.30, tint=SUN_ADOBE)
        b.lean_roof("teamRoof", 0.0, 0.0, 2.20, 2.65, 3.85, 3.15, high_side="+y", thick=0.12)
    else:
        b.gable_roof("teamRoof", 0.0, 0.0, 2.32, 3.95, 3.25, 1.45 if civ == "raven" else 1.12, along_y=False)
        b.box("darkwood", 0.0, 0.0, 2.34 + (1.45 if civ == "raven" else 1.12), 4.15, 0.14, 0.14)
    # Stacked timber planks & sawbuck
    for row, count, rz in [(0, 4, 0.34), (1, 3, 0.66)]:
        for i in range(count):
            b.cylinder("trunk", -0.82 + (i + row * 0.5) * 0.44, 0.35, rz - 0.16, rz + 0.16, 0.16, 0.16, segs=6, rot_x=math.pi / 2)
    b.box("wood", 0.0, -1.15, 0.78, 2.40, 0.68, 0.14)
    b.cylinder("wood", 1.25, -1.05, 0.14, 0.85, 0.32, 0.30, segs=7)
    b.box("steel", 1.32, -1.05, 1.35, 0.28, 0.08, 0.22)
    b.rod("wood", (1.25, -1.05, 0.82), (1.42, -1.05, 1.48), 0.038, segs=4)
    return b.finalize(col)


def build_feudal_mine(civ, mats, col):
    key = f"building:mine:{civ}:1"
    b = PartBuilder(key, mats)
    b.tapered_box("stoneDark" if civ != "sun" else "soil", 0.0, 0.0, -0.46, 0.18, 4.10, 4.10, 3.85, 3.85)
    # Regional mine entrance & overhead hoist shed
    for px in (-1.40, 1.40):
        b.box_z("darkwood", px, 0.65, -0.46, 2.55, 0.22, 0.22)
        b.box_z("darkwood", px, -0.35, -0.46, 2.55, 0.22, 0.22)
    b.box_z("darkwood", 0.0, 1.00, 0.14, 2.35, 2.45, 0.20, tint=(0.45, 0.42, 0.40))
    if civ == "sun":
        b.box("plaster", 0.0, 0.20, 2.60, 3.30, 1.75, 0.34, tint=SUN_ADOBE)
        b.lean_roof("teamRoof", 0.0, 0.20, 2.78, 3.12, 3.45, 1.95, high_side="+y", thick=0.10)
    else:
        b.gable_roof("teamRoof", 0.0, 0.20, 2.50, 3.45, 1.95, 1.25 if civ == "raven" else 0.95, along_y=False)
    # Ore cart & stacked stones
    b.box("wood", 0.0, -1.25, 0.60, 1.65, 1.05, 0.62)
    for sx in (-0.86, 0.86):
        b.cylinder("iron", sx, -1.25, 0.14, 0.56, 0.26, 0.26, segs=7, rot_y=math.pi / 2)
    for ox, oy in [(-0.36, -1.22), (0.34, -1.28), (0.0, -1.14)]:
        b.box("stone", ox, oy, 1.00, 0.40, 0.38, 0.34, rot_z=ox * 1.8)
    b.barrel(-1.45, -1.15, 0.16, 0.24, 0.60)
    return b.finalize(col)


def build_feudal_range(civ, mats, col):
    key = f"building:range:{civ}:1"
    b = PartBuilder(key, mats)
    b.tapered_box("stoneDark" if civ != "sun" else "soil", 0.0, 0.0, -0.46, 0.18, 6.20, 5.85, 5.95, 5.55)
    feudal_hall(b, civ, 0.0, 1.25, 5.15, 2.65, 2.35, 1.48, along_y=False, door_front=True)
    # 3 straw archery targets across front range yard
    for tx in (-1.85, 0.0, 1.85):
        b.target_disc(tx, -1.95, 0.16)
    b.crate(2.45, 0.25, 0.16, 0.65)
    b.banner_pole(-2.45, -0.35, 0.16, 4.65, flag_w=0.80, flag_h=0.50)
    return b.finalize(col)


def build_feudal_stable(civ, mats, col):
    key = f"building:stable:{civ}:1"
    b = PartBuilder(key, mats)
    b.tapered_box("stoneDark" if civ != "sun" else "soil", 0.0, 0.0, -0.46, 0.18, 6.30, 6.00, 6.05, 5.70)
    feudal_hall(b, civ, 0.0, 1.20, 5.40, 3.05, 2.55, 1.70, along_y=False, door_front=True)
    # Fenced wooden horse paddock corral in front
    for px in (-2.45, -1.20, 1.20, 2.45):
        b.box_z("darkwood", px, -2.35, -0.46, 1.32, 0.14, 0.14)
    for py in (-1.35, -2.35):
        b.box("wood", -2.45, -1.35, 0.55, 0.10, 2.10, 0.12)
        b.box("wood", -2.45, -1.35, 1.05, 0.10, 2.10, 0.12)
        b.box("wood", 2.45, -1.35, 0.55, 0.10, 2.10, 0.12)
        b.box("wood", 2.45, -1.35, 1.05, 0.10, 2.10, 0.12)
    for sx in (-1.82, 1.82):
        b.box("wood", sx, -2.35, 0.55, 1.32, 0.10, 0.12)
        b.box("wood", sx, -2.35, 1.05, 1.32, 0.10, 0.12)
    # Wooden feeding trough filled with golden hay/straw
    b.box("wood", 0.0, -2.30, 0.44, 2.15, 0.65, 0.52)
    b.box("straw", 0.0, -2.30, 0.72, 1.95, 0.48, 0.22)
    b.box("straw", -1.45, -1.45, 0.46, 0.85, 0.72, 0.58)
    b.banner_pole(2.65, -0.45, 0.18, 4.85, flag_w=0.82, flag_h=0.52)
    return b.finalize(col)


def build_feudal_blacksmith(civ, mats, col):
    key = f"building:blacksmith:{civ}:1"
    b = PartBuilder(key, mats)
    b.tapered_box("stoneDark" if civ != "sun" else "soil", 0.0, 0.0, -0.46, 0.20, 5.20, 4.95, 4.95, 4.70)
    feudal_hall(b, civ, -0.55, 0.55, 3.55, 3.15, 2.45, 1.55, along_y=True, door_front=True, chimney=False)
    # Open brick/stone hearth forge with glowing embers & tall chimney stack on right
    b.box_z("brick", 1.48, -0.55, 0.16, 1.55, 1.55, 1.55)
    b.box("glow", 1.48, -1.12, 0.72, 0.88, 0.52, 0.52)
    b.tapered_box("brick", 1.48, -0.25, 1.50, 4.45, 1.15, 1.15, 0.72, 0.72)
    b.box("stoneDark", 1.48, -0.25, 4.52, 0.86, 0.86, 0.16)
    # Steel anvil on wooden stump + quenching barrel
    b.cylinder("wood", -0.85, -1.65, 0.16, 0.64, 0.34, 0.32, segs=7)
    b.box("steel", -0.85, -1.65, 0.80, 0.82, 0.36, 0.26)
    b.barrel(-1.82, -1.45, 0.16, 0.26, 0.60)
    return b.finalize(col)


def build_feudal_market(civ, mats, col):
    key = f"building:market:{civ}:1"
    b = PartBuilder(key, mats)
    b.tapered_box("stoneDark" if civ != "sun" else "soil", 0.0, 0.0, -0.46, 0.20, 6.20, 6.00, 5.95, 5.75)
    feudal_hall(b, civ, 0.0, 1.15, 4.30, 2.85, 2.45, 1.55, along_y=False, door_front=True)
    # 3 lively open timber market stalls across front plaza with vivid team & canvas cloth awnings!
    for idx, sx in enumerate((-1.90, 0.0, 1.90)):
        b.box_z("wood", sx, -1.75, 0.18, 0.96, 1.52, 0.85)
        for ox in (-0.68, 0.68):
            b.cylinder("darkwood", sx + ox, -1.42, 0.18, 2.28, 0.055, 0.050, segs=4)
            b.cylinder("darkwood", sx + ox, -2.08, 0.18, 1.98, 0.055, 0.050, segs=4)
        awning_role = "team" if idx == 1 else "canvas"
        b.lean_roof(awning_role, sx, -1.75, 1.98, 2.34, 1.72, 1.24, high_side="+y", thick=0.08)
        goods = "fruit" if idx == 0 else ("grain" if idx == 1 else "gold")
        for gx in (-0.38, 0.0, 0.38):
            b.box(goods, sx + gx, -1.75, 1.08, 0.28, 0.34, 0.22)
    b.barrel(2.55, 0.05, 0.18, 0.26, 0.62)
    b.crate(-2.55, 0.05, 0.18, 0.68)
    return b.finalize(col)


def build_feudal_tower(civ, mats, col):
    key = f"building:tower:{civ}:1"
    b = PartBuilder(key, mats)
    # Authentic AoE II Feudal Watchtower: rough base + cantilevered timber hoarding/gallery (~7.7m vs Castle 10.4m!)
    if civ == "sun":
        # Flat-topped desert adobe watchtower with timber shade canopy (NO stone spire or dome!)
        b.tapered_box("soil", 0.0, 0.0, -0.46, 0.40, 3.20, 3.20, 2.85, 2.85, tint=(0.86, 0.76, 0.60))
        b.tapered_box("plaster", 0.0, 0.0, 0.36, 5.25, 2.55, 2.55, 2.08, 2.08, tint=SUN_ADOBE, z_grad=0.14)
        # Projecting timber vigas & cantilevered wooden lookout gallery
        for sx in (-0.70, 0.0, 0.70):
            b.box("darkwood", sx, 0.0, 5.05, 0.14, 2.88, 0.14)
            b.box("darkwood", 0.0, sx, 5.05, 2.88, 0.14, 0.14)
        b.box_z("plaster", 0.0, 0.0, 5.18, 6.20, 2.62, 2.62, tint=SUN_ADOBE_TRIM)
        for ox in (-1.15, 1.15):
            for oy in (-1.15, 1.15):
                b.cylinder("darkwood", ox, oy, 6.18, 7.25, 0.075, 0.065, segs=4)
        b.lean_roof("teamRoof", 0.0, 0.0, 7.10, 7.48, 2.95, 2.95, high_side="+y", thick=0.10)
    else:
        # Rough low base + sturdy vertical timber-framed / log watchtower + cantilevered wooden hoarding!
        b.tapered_box("stoneDark", 0.0, 0.0, -0.46, 1.15, 3.15, 3.15, 2.55, 2.55)
        shaft_role = "wood" if civ == "raven" else "plaster"
        shaft_tint = RAVEN_LOG if civ == "raven" else ALDER_PLASTER
        b.tapered_box(shaft_role, 0.0, 0.0, 1.10, 4.95, 2.35, 2.35, 2.02, 2.02, tint=shaft_tint, z_grad=0.14)
        for ox in (-1.02, 1.02):
            for oy in (-1.02, 1.02):
                b.rod("darkwood", (ox * 1.12, oy * 1.12, 1.05), (ox * 0.96, oy * 0.96, 5.05), 0.12, segs=4)
        # Cantilevered timber hoarding deck + diagonal knee braces
        for side in (-1.0, 1.0):
            b.rod("darkwood", (side * 0.98, 0.0, 4.25), (side * 1.42, 0.0, 5.05), 0.09, segs=4)
            b.rod("darkwood", (0.0, side * 0.98, 4.25), (0.0, side * 1.42, 5.05), 0.09, segs=4)
        b.box_z("wood", 0.0, 0.0, 4.98, 6.18, 2.86, 2.86, tint=(0.88, 0.78, 0.66))
        for ox in (-1.40, 0.0, 1.40):
            for oy in (-1.40, 1.40):
                b.box_z("darkwood", ox, oy, 4.98, 6.22, 0.15, 0.15)
        b.hip_roof("teamRoof", 0.0, 0.0, 6.15, 3.35, 3.35, 1.85 if civ == "raven" else 1.45, ridge_inset=0.46)
    # Arrow slits & pennant
    for angle in (0, math.pi / 2, math.pi, 3 * math.pi / 2):
        sx, sy = math.sin(angle) * 1.12, math.cos(angle) * 1.12
        b.box("glass", sx, sy, 3.55, 0.22, 0.22, 0.78, rot_z=angle)
    b.banner_pole(0.0, 0.0, 7.20, 8.75, flag_w=0.78, flag_h=0.48)
    return b.finalize(col)


def build_feudal_dock(civ, mats, col):
    key = f"building:dock:{civ}:1"
    b = PartBuilder(key, mats)
    # Timber shoreline platform & rustic Feudal boathouse
    b.box_z("wood", 0.0, 0.0, -0.35, 0.42, 5.60, 5.20, tint=(0.88, 0.78, 0.66))
    for px in (-2.55, 0.0, 2.55):
        for py in (-2.35, 2.35):
            b.cylinder("darkwood", px, py, -2.00, 0.68, 0.14, 0.13, segs=6)
    feudal_hall(b, civ, -0.35, 0.95, 3.35, 2.70, 2.25, 1.42, along_y=False, door_front=True)
    b.barrel(-1.95, -1.15, 0.40, 0.26, 0.62)
    b.crate(1.65, -1.45, 0.40, 0.72)
    b.banner_pole(2.15, 0.0, 0.40, 4.75, flag_w=0.82, flag_h=0.52)
    root, tris = b.finalize(col)

    # Rotating wooden jetty pier (userData.dockPier = true, extends along +X!)
    pier = bpy.data.objects.new(f"{key}:pier", None)
    pier["dockPier"] = True
    pier.parent = root
    col.objects.link(pier)
    pb = PartBuilder(f"{key}:pier", mats, parent=pier)
    pb.box_z("wood", 4.45, 0.0, 0.12, 0.36, 8.40, 2.05, tint=(0.86, 0.76, 0.64))
    for x in (1.2, 2.8, 4.4, 6.0, 7.6):
        pb.box("darkwood", x, 0.0, 0.38, 0.12, 2.08, 0.06)
        for side in (-0.82, 0.82):
            pb.cylinder("darkwood", x, side, -2.00, 0.85, 0.12, 0.11, segs=5)
    # Mooring bollards at jetty tip
    for side in (-0.75, 0.75):
        pb.cylinder("darkwood", 8.25, side, -2.00, 1.05, 0.14, 0.13, segs=6)
    _, pier_tris = pb.finalize(col, link_root=False)
    return root, tris + pier_tris


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
        ("building:towncenter:frontier", lambda: build_frontier_towncenter(mats, col)),
        ("building:house:frontier", lambda: build_frontier_house(mats, col)),
        ("building:barracks:frontier", lambda: build_frontier_barracks(mats, col)),
        ("building:mill:frontier", lambda: build_frontier_mill(mats, col)),
        ("building:camp:frontier", lambda: build_frontier_camp(mats, col)),
        ("building:mine:frontier", lambda: build_frontier_mine(mats, col)),
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
