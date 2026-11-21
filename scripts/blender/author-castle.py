"""Author an iconic AoE2-inspired Western European medieval stone castle in Blender 4.5 LTS.

Replaces the three faction keep templates (`building:keep:alder:0`,
`building:keep:sun:0`, `building:keep:raven:0`) while leaving all 123 other
catalogue models byte-exact.

Browser-space coordinates use Y-up / +Z-forward (front-left gatehouse at the
game's default 45-degree camera), +X front-right buttressed flank, (+X, -Z)
tall cylindrical round corner tower with hanging chevron heraldic banner, and
(-X, -Z) elevated rear watch-turret with solid stone roof stairs and fluttering
flag.

Every authored piece is a strictly watertight closed manifold bmesh solid with
world-scale architectural box/cylindrical UVs, optional stone edge bevels (high
tier), and non-crushing 3D BVH ambient-occlusion vertex shading tuned for cool
weathered medieval grey limestone-granite. Core mesh datablocks are shared
across all three faction roots for zero redundant download or VRAM cost.
"""
import argparse
import array
import hashlib
import json
import math
import sys
from pathlib import Path

import bmesh
import bpy
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

project = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser()
parser.add_argument("--source", default=str(project / ".tools/art-refined/frontier-assets.blend"))
parser.add_argument("--out", default=str(project / ".tools/art-candidate/castle/raw"))
args = parser.parse_args(sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else [])

source = Path(args.source).resolve()
assert source.is_relative_to(project) and source.suffix == ".blend" and source.is_file()
out = Path(args.out).resolve()
assert out.is_relative_to(project)
out.mkdir(parents=True, exist_ok=True)

bpy.ops.wm.open_mainfile(filepath=str(source))
roots = {obj["assetKey"]: obj for obj in bpy.data.objects if obj.get("assetKey")}
assert len(roots) == 126, f"Expected 126 catalogue roots, found {len(roots)}"

KEYS = [
    "building:keep:alder:0",
    "building:keep:sun:0",
    "building:keep:raven:0",
]
CASTLE_REVISION = "aoe2-fortress-v1"


def descendants(root):
    return [root] + [part for child in root.children for part in descendants(child)]


def fingerprint(root):
    """Low-memory streaming SHA-256 fingerprint of a model hierarchy."""
    h = hashlib.sha256()
    for obj in descendants(root):
        h.update(obj.name.encode("utf-8"))
        h.update(str(obj.get("assetMaterial") or "").encode("utf-8"))
        mat_arr = array.array("f", (v for row in obj.matrix_local for v in row))
        h.update(mat_arr.tobytes())
        if obj.type == "MESH":
            mesh = obj.data
            n_v = len(mesh.vertices)
            co = array.array("f", [0.0]) * (n_v * 3)
            mesh.vertices.foreach_get("co", co)
            h.update(co.tobytes())
            n_l = len(mesh.loops)
            vi = array.array("I", [0]) * n_l
            mesh.loops.foreach_get("vertex_index", vi)
            h.update(vi.tobytes())
            n_p = len(mesh.polygons)
            lt = array.array("I", [0]) * n_p
            mesh.polygons.foreach_get("loop_total", lt)
            h.update(lt.tobytes())
    return h.hexdigest()


unchanged = {key: fingerprint(root) for key, root in roots.items() if key not in KEYS}
materials = {
    p.get("assetMaterial"): p.data.materials[0]
    for root in roots.values()
    for p in descendants(root)
    if p.type == "MESH" and p.get("assetMaterial") and p.data.materials
}
for required_mat in ("stone", "stoneDark", "wood", "darkwood", "iron", "team", "snow", "glass", "glow", "leaf", "leafDark", "gold"):
    assert required_mat in materials, f"Missing required Blender material role: {required_mat}"


def pt(p):
    """Browser (x, y, z) [Y-up, +Z-forward] -> Blender (x, -z, y) [Z-up, -Y-forward]."""
    return Vector((p[0], -p[2], p[1]))


class CastleBuilder:
    """Fast, strictly manifold bmesh bucket builder for the AoE2 Castle."""

    def __init__(self, high_detail=True):
        self.high_detail = high_detail
        self.buckets = {}  # (role, is_flag) -> (bmesh, uv_layer)
        self.part_count = 0
        self.flag_origin = (-2.28, 8.58, -1.92)

    def _get_bucket(self, role, is_flag):
        key = (role, is_flag)
        if key not in self.buckets:
            bm = bmesh.new()
            uv = bm.loops.layers.uv.verify()
            self.buckets[key] = (bm, uv)
        return self.buckets[key]

    def _commit(self, src, role, label, bevel=0.0, smooth=False, cyl_center=None, is_flag=False, uv_scale=0.48):
        self.part_count += 1
        bmesh.ops.recalc_face_normals(src, faces=src.faces)
        non_manifold = [e for e in src.edges if not e.is_manifold]
        assert not non_manifold, f"Non-manifold edges ({len(non_manifold)}) in {label}"

        if bevel > 0.0 and self.high_detail:
            sharp = [e for e in src.edges if len(e.link_faces) == 2 and e.calc_face_angle(0.0) > math.radians(34)]
            if sharp:
                bmesh.ops.bevel(
                    src,
                    geom=sharp,
                    offset=bevel,
                    offset_type="OFFSET",
                    segments=1,
                    profile=0.5,
                    affect="EDGES",
                    clamp_overlap=True,
                )
                bmesh.ops.recalc_face_normals(src, faces=src.faces)
                non_manifold = [e for e in src.edges if not e.is_manifold]
                assert not non_manifold, f"Bevel produced non-manifold edges in {label}"

        if role in ("wood", "darkwood"):
            uv_scale = 0.56

        dst, dst_uv = self._get_bucket(role, is_flag)
        vmap = [dst.verts.new(v.co) for v in src.verts]
        src.verts.index_update()
        src.normal_update()

        for f in src.faces:
            n = f.normal
            ax, ay, az = abs(n.x), abs(n.y), abs(n.z)
            nf = dst.faces.new(tuple(vmap[v.index] for v in f.verts))
            nf.smooth = smooth
            for loop in nf.loops:
                co = loop.vert.co
                if cyl_center is not None and az < 0.72:
                    cx, cy = cyl_center[0], -cyl_center[1]
                    dx, dy = co.x - cx, co.y - cy
                    radius = max(0.25, math.hypot(dx, dy))
                    angle = math.atan2(dy, dx)
                    loop[dst_uv].uv = (angle * radius * uv_scale, co.z * uv_scale)
                elif az >= ax and az >= ay:
                    loop[dst_uv].uv = (co.x * uv_scale, co.y * uv_scale)
                elif ax >= ay:
                    loop[dst_uv].uv = (co.y * uv_scale, co.z * uv_scale)
                else:
                    loop[dst_uv].uv = (co.x * uv_scale, co.z * uv_scale)

        src.free()

    def box(self, role, center, size, label, rot=(0.0, 0.0, 0.0), bevel=0.0, cyl_center=None):
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1.0)
        sx, sy, sz = size
        scale_mat = Matrix.Diagonal((sx, sz, sy, 1.0))
        rot_mat = (
            Matrix.Rotation(rot[1], 4, "Z")
            @ Matrix.Rotation(-rot[2], 4, "Y")
            @ Matrix.Rotation(rot[0], 4, "X")
        )
        xform = Matrix.Translation(pt(center)) @ rot_mat @ scale_mat
        bmesh.ops.transform(bm, matrix=xform, verts=bm.verts)
        self._commit(bm, role, label, bevel=bevel, cyl_center=cyl_center)

    def beam(self, role, a, b, width, depth, label):
        """Watertight rectangular bar/ribbon connecting browser points `a` and `b`."""
        pa, pb = pt(a), pt(b)
        delta = pb - pa
        length = delta.length
        if length < 1e-5:
            return
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1.0)
        scale_mat = Matrix.Diagonal((width, depth, length, 1.0))
        quat = delta.to_track_quat("Z", "Y")
        xform = Matrix.Translation((pa + pb) * 0.5) @ quat.to_matrix().to_4x4() @ scale_mat
        bmesh.ops.transform(bm, matrix=xform, verts=bm.verts)
        self._commit(bm, role, label)

    def frustum_box(self, role, center_xz, y0, y1, size0, size1, label, bevel=0.0):
        cx, cz = center_xz
        hx0, hz0 = size0[0] * 0.5, size0[1] * 0.5
        hx1, hz1 = size1[0] * 0.5, size1[1] * 0.5
        bm = bmesh.new()
        b0 = [
            bm.verts.new(pt((cx - hx0, y0, cz - hz0))),
            bm.verts.new(pt((cx + hx0, y0, cz - hz0))),
            bm.verts.new(pt((cx + hx0, y0, cz + hz0))),
            bm.verts.new(pt((cx - hx0, y0, cz + hz0))),
        ]
        b1 = [
            bm.verts.new(pt((cx - hx1, y1, cz - hz1))),
            bm.verts.new(pt((cx + hx1, y1, cz - hz1))),
            bm.verts.new(pt((cx + hx1, y1, cz + hz1))),
            bm.verts.new(pt((cx - hx1, y1, cz + hz1))),
        ]
        for i in range(4):
            j = (i + 1) % 4
            bm.faces.new((b0[i], b0[j], b1[j], b1[i]))
        bm.faces.new((b0[3], b0[2], b0[1], b0[0]))
        bm.faces.new((b1[0], b1[1], b1[2], b1[3]))
        self._commit(bm, role, label, bevel=bevel)

    def cylinder(self, role, center_xz, y0, y1, r0, r1=None, segs=16, label="Cyl", smooth=False, bevel=0.0):
        if r1 is None:
            r1 = r0
        cx, cz = center_xz
        h = y1 - y0
        bm = bmesh.new()
        bmesh.ops.create_cone(
            bm,
            cap_ends=True,
            cap_tris=False,
            segments=segs,
            radius1=r0,
            radius2=r1,
            depth=h,
        )
        xform = Matrix.Translation(pt((cx, (y0 + y1) * 0.5, cz)))
        bmesh.ops.transform(bm, matrix=xform, verts=bm.verts)
        self._commit(bm, role, label, bevel=bevel, smooth=smooth, cyl_center=center_xz)

    def hollow_cylinder(self, role, center_xz, y0, y1, r_out, r_in, segs=16, label="RingWall", smooth=False):
        cx, cz = center_xz
        bm = bmesh.new()
        rings = []
        for yy, rr in ((y0, r_out), (y1, r_out), (y0, r_in), (y1, r_in)):
            ring = []
            for i in range(segs):
                a = math.tau * i / segs
                ring.append(bm.verts.new(pt((cx + math.cos(a) * rr, yy, cz + math.sin(a) * rr))))
            rings.append(ring)
        ro0, ro1, ri0, ri1 = rings
        for i in range(segs):
            j = (i + 1) % segs
            bm.faces.new((ro0[i], ro0[j], ro1[j], ro1[i]))
            bm.faces.new((ri0[j], ri0[i], ri1[i], ri1[j]))
            bm.faces.new((ro1[i], ro1[j], ri1[j], ri1[i]))
            bm.faces.new((ro0[j], ro0[i], ri0[i], ri0[j]))
        self._commit(bm, role, label, smooth=smooth, cyl_center=center_xz)

    def arc_wall_segment(self, role, center_xz, y0, y1, r_out, r_in, a0, a1, segs=4, label="ArcSeg"):
        cx, cz = center_xz
        bm = bmesh.new()
        o0, o1, i0, i1 = [], [], [], []
        for s in range(segs + 1):
            a = a0 + (a1 - a0) * (s / segs)
            ca, sa = math.cos(a), math.sin(a)
            o0.append(bm.verts.new(pt((cx + ca * r_out, y0, cz + sa * r_out))))
            o1.append(bm.verts.new(pt((cx + ca * r_out, y1, cz + sa * r_out))))
            i0.append(bm.verts.new(pt((cx + ca * r_in, y0, cz + sa * r_in))))
            i1.append(bm.verts.new(pt((cx + ca * r_in, y1, cz + sa * r_in))))
        for s in range(segs):
            bm.faces.new((o0[s], o0[s + 1], o1[s + 1], o1[s]))
            bm.faces.new((i0[s + 1], i0[s], i1[s], i1[s + 1]))
            bm.faces.new((o1[s], o1[s + 1], i1[s + 1], i1[s]))
            bm.faces.new((o0[s + 1], o0[s], i0[s], i0[s + 1]))
        bm.faces.new((i0[0], o0[0], o1[0], i1[0]))
        bm.faces.new((o0[-1], i0[-1], i1[-1], o1[-1]))
        self._commit(bm, role, label, cyl_center=center_xz)

    def rod(self, role, a, b, r0, r1=None, segs=6, label="Rod", smooth=False):
        if r1 is None:
            r1 = r0
        pa, pb = pt(a), pt(b)
        delta = pb - pa
        length = delta.length
        if length < 1e-5:
            return
        bm = bmesh.new()
        bmesh.ops.create_cone(
            bm,
            cap_ends=True,
            cap_tris=False,
            segments=segs,
            radius1=r0,
            radius2=r1,
            depth=length,
        )
        quat = delta.to_track_quat("Z", "Y")
        xform = Matrix.Translation((pa + pb) * 0.5) @ quat.to_matrix().to_4x4()
        bmesh.ops.transform(bm, matrix=xform, verts=bm.verts)
        self._commit(bm, role, label, smooth=smooth)

    def heater_shield(self, role, center, width, height, thick, face_axis="+z", label="Shield"):
        hw, hh, ht = width * 0.5, height * 0.5, thick * 0.5
        profile = [
            (-hw, hh),
            (hw, hh),
            (hw * 0.92, -hh * 0.15),
            (0.0, -hh),
            (-hw * 0.92, -hh * 0.15),
        ]
        cx, cy, cz = center

        def world(u, v, w):
            if face_axis == "+z":
                return pt((cx + u, cy + v, cz + w))
            if face_axis == "+x":
                return pt((cx + w, cy + v, cz - u))
            if face_axis == "-z":
                return pt((cx - u, cy + v, cz - w))
            return pt((cx - w, cy + v, cz + u))

        bm = bmesh.new()
        front = [bm.verts.new(world(u, v, ht)) for u, v in profile]
        back = [bm.verts.new(world(u, v, -ht)) for u, v in profile]
        f_face = bm.faces.new(front)
        b_face = bm.faces.new(list(reversed(back)))
        bmesh.ops.triangulate(bm, faces=[f_face, b_face])
        n = len(profile)
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((front[i], back[i], back[j], front[j]))
        self._commit(bm, role, label)

    def ivy_lobe(self, role, center, scale, seed, label="Ivy"):
        bm = bmesh.new()
        bmesh.ops.create_icosphere(bm, subdivisions=1 if self.high_detail else 0, radius=1.0)
        sx, sy, sz = scale
        c = pt(center)
        for v in bm.verts:
            p = v.co
            n = (
                1.0
                + 0.24 * math.sin(p.x * 5.1 + seed) * math.cos(p.y * 4.3 - seed * 0.7)
                + 0.14 * math.cos(p.z * 5.7 + seed * 1.2)
            )
            v.co = c + Vector((p.x * sx * n, p.y * sz * n, p.z * sy * n))
        self._commit(bm, role, label, smooth=False)

    def lancet_window(self, center, face_axis, w=0.30, h=0.80, depth=0.14, subtle_ember=False, label="Window"):
        """Narrow dark-recessed arched medieval arrow slit / lancet embrasure."""
        cx, cy, cz = center

        def place(role, du, dv, dw, su, sv, sw, sub):
            if face_axis == "+z":
                pos, size = (cx + du, cy + dv, cz + dw), (su, sv, sw)
            elif face_axis == "-z":
                pos, size = (cx - du, cy + dv, cz - dw), (su, sv, sw)
            elif face_axis == "+x":
                pos, size = (cx + dw, cy + dv, cz - du), (sw, sv, su)
            else:
                pos, size = (cx - dw, cy + dv, cz + du), (sw, sv, su)
            self.box(role, pos, size, f"{label}_{sub}")

        place("stoneDark", 0.0, 0.0, 0.02, w + 0.14, h + 0.10, depth, "Frame")
        place("stone", 0.0, -h * 0.5 - 0.05, 0.06, w + 0.22, 0.09, depth + 0.08, "Sill")
        if self.high_detail:
            place("stone", 0.0, h * 0.5 + 0.05, 0.05, w + 0.16, 0.10, depth + 0.05, "ArchCap")
        # Deep dark slate glass slit (auto-glows warmly at night!)
        place("glass", 0.0, 0.0, 0.055, w * 0.64, h * 0.84, 0.05, "Glass")
        # Subtle warm amber torch glint only on select hall windows (never blinding orange bars!)
        if subtle_ember:
            place("glow", 0.0, -h * 0.14, 0.066, w * 0.22, h * 0.26, 0.035, "Ember")

    def battlement_run(self, p0, p1, outward, y_corbel=4.56, y_deck=4.94, y_parapet=5.46, y_merlon=5.96, corbel_step=0.60, merlon_step=0.84, label="WallTop"):
        """Build overhanging corbeled machicolations, parapet breastwork, and chunky crenellations."""
        x0, z0 = p0
        x1, z1 = p1
        dx, dz = x1 - x0, z1 - z0
        length = math.hypot(dx, dz)
        if length < 0.35:
            return
        tx, tz = dx / length, dz / length
        ox, oz = outward
        yaw = math.atan2(ox, oz)
        rot = (0.0, yaw, 0.0)
        mid_d = length * 0.5

        def along(dist, out_off, yy):
            return (x0 + tx * dist + ox * out_off, yy, z0 + tz * dist + oz * out_off)

        # Shadowed machicolation backing frieze behind projecting corbels
        self.box("stoneDark", along(mid_d, 0.04, (y_corbel + y_deck) * 0.5), (length, y_deck - y_corbel, 0.22), f"{label}_MachBack", rot=rot)

        # Rhythmic stepped stone corbel brackets (2-tier stepped on high, clean single bracket on low)
        n_corbels = max(2, int(round(length / corbel_step)))
        for i in range(n_corbels):
            dist = (i + 0.5) * (length / n_corbels)
            if self.high_detail:
                self.box("stone", along(dist, 0.10, y_corbel + 0.10), (0.20, 0.20, 0.24), f"{label}_CorbLo", rot=rot)
                self.box("stone", along(dist, 0.16, y_deck - 0.09), (0.24, 0.20, 0.34), f"{label}_CorbHi", rot=rot)
            else:
                self.box("stone", along(dist, 0.14, (y_corbel + y_deck) * 0.5), (0.23, y_deck - y_corbel, 0.32), f"{label}_Corb", rot=rot)

        # Overhanging parapet breastwork wall + coping ledge
        par_h = y_parapet - y_deck
        self.box("stone", along(mid_d, 0.10, y_deck + par_h * 0.5), (length + 0.06, par_h, 0.42), f"{label}_Parapet", rot=rot, bevel=0.016)
        if self.high_detail:
            self.box("stone", along(mid_d, 0.13, y_parapet - 0.03), (length + 0.10, 0.09, 0.48), f"{label}_Coping", rot=rot)

        # Chunky crenellated merlons with overhanging stone caps
        merl_h = y_merlon - y_parapet
        n_merlons = max(2, int(round(length / merlon_step)))
        pitch = length / n_merlons
        merl_w = min(0.54, pitch * 0.60)
        for i in range(n_merlons):
            dist = (i + 0.5) * pitch
            self.box("stone", along(dist, 0.13, y_parapet + merl_h * 0.50), (merl_w, merl_h, 0.38), f"{label}_Merlon", rot=rot, bevel=0.015)
            if self.high_detail:
                self.box("stoneDark", along(dist, 0.03, y_parapet + merl_h * 0.48), (merl_w * 0.92, merl_h * 0.95, 0.26), f"{label}_MerlCore", rot=rot)
                self.box("stone", along(dist, 0.13, y_merlon + 0.035), (merl_w + 0.07, 0.09, 0.45), f"{label}_MerlCap", rot=rot)

    def _make_fluttering_flag(self):
        cols = 6 if self.high_detail else 4
        rows = 3 if self.high_detail else 2
        width, height, thick = 1.38, 0.80, 0.036
        bm = bmesh.new()
        front, back = [], []
        for r in range(rows + 1):
            v = r / rows
            yf = (v - 0.5) * height
            frow, brow = [], []
            for c in range(cols + 1):
                u = c / cols
                taper = 1.0 - 0.18 * u
                xf = u * width
                zf = (math.sin(u * math.tau * 1.15) * 0.12 * u + math.sin(v * math.pi) * 0.03) * width
                frow.append(bm.verts.new(pt((xf, yf * taper, zf + thick * 0.5))))
                brow.append(bm.verts.new(pt((xf, yf * taper, zf - thick * 0.5))))
            front.append(frow)
            back.append(brow)
        for r in range(rows):
            for c in range(cols):
                bm.faces.new((front[r][c], front[r][c + 1], front[r + 1][c + 1], front[r + 1][c]))
                bm.faces.new((back[r][c], back[r + 1][c], back[r + 1][c + 1], back[r][c + 1]))
        for c in range(cols):
            bm.faces.new((front[0][c], back[0][c], back[0][c + 1], front[0][c + 1]))
            bm.faces.new((front[rows][c], front[rows][c + 1], back[rows][c + 1], back[rows][c]))
        for r in range(rows):
            bm.faces.new((front[r][0], front[r + 1][0], back[r + 1][0], back[r][0]))
            bm.faces.new((front[r][cols], back[r][cols], back[r + 1][cols], front[r + 1][cols]))
        self._commit(bm, "team", "CastleFlag", smooth=True, is_flag=True)

    def build(self):
        kx, kz = -0.35, 0.05
        hw, hd = 2.65, 2.60
        x_min, x_max = kx - hw, kx + hw
        z_min, z_max = kz - hd, kz + hd
        tx, tz = 2.48, -1.95
        r_tower = 1.38
        t_segs = 20 if self.high_detail else 12
        rod_segs = 6 if self.high_detail else 4

        # 1. TIGHT GROUNDED FOUNDATION PLINTHS (y = -0.46 -> +0.62) & TEAM BASE TRIM
        # Tight footprint hugs walls cleanly so green grass meets the castle masonry organically!
        self.box("stoneDark", (kx, -0.15, kz), (hw * 2 + 0.54, 0.62, hd * 2 + 0.54), "KeepFooting")
        self.frustum_box("stoneDark", (kx, kz), 0.15, 0.56, (hw * 2 + 0.54, hd * 2 + 0.54), (hw * 2 + 0.18, hd * 2 + 0.18), "KeepPlinthTalus")
        self.box("stone", (kx, 0.60, kz), (hw * 2 + 0.22, 0.12, hd * 2 + 0.22), "KeepPlinthCap", bevel=0.014)
        self.box("stoneDark", (kx, -0.16, 3.36), (1.92, 0.60, 1.44), "BridgeAbutment")

        self.box("team", (x_max + 0.19, 0.34, 0.50), (0.14, 0.22, 3.65), "BaseTrim_Right")
        self.box("team", (x_min - 0.19, 0.34, kz), (0.14, 0.22, hd * 2 + 0.16), "BaseTrim_Left")
        self.box("team", (-0.65, 0.34, z_min - 0.19), (4.55, 0.22, 0.14), "BaseTrim_Back")

        # 2. MAIN KEEP MASONRY BODY + RECESSED FRONT GATEWAY CORE
        core_z0, core_z1 = z_min, z_max - 0.54
        self.box("stone", (kx, 2.46, (core_z0 + core_z1) * 0.5), (hw * 2, 4.92, core_z1 - core_z0), "KeepCore", bevel=0.018)
        gate_hw = 0.78
        left_w = (kx - gate_hw) - x_min
        self.box("stone", (x_min + left_w * 0.5, 2.46, z_max - 0.27), (left_w, 4.92, 0.54), "GatePier_L", bevel=0.015)
        right_w = x_max - (kx + gate_hw)
        self.box("stone", (x_max - right_w * 0.5, 2.46, z_max - 0.27), (right_w, 4.92, 0.54), "GatePier_R", bevel=0.015)
        self.box("stone", (kx, 3.64, z_max - 0.27), (gate_hw * 2 + 0.08, 2.56, 0.54), "GateUpperWall", bevel=0.015)

        for yy in (1.92, 3.74):
            self.box("stoneDark", (kx, yy, kz - 0.12), (hw * 2 + 0.10, 0.11, hd * 2 - 0.12), f"KeepBand_{int(yy*10)}")

        # 3. THREE PROJECTING SQUARE CORNER BASTIONS
        bastions = [
            ("FL", x_min + 0.18, z_max - 0.16, True),
            ("FR", x_max - 0.18, z_max - 0.16, True),
            ("BL", x_min + 0.18, z_min + 0.18, False),
        ]
        for tag, bx, bz, front_shields in bastions:
            self.box("stoneDark", (bx, -0.15, bz), (1.44, 0.62, 1.44), f"BastionFoot_{tag}")
            self.frustum_box("stoneDark", (bx, bz), 0.15, 0.60, (1.44, 1.44), (1.28, 1.28), f"BastionTalus_{tag}")
            self.box("team", (bx, 0.34, bz), (1.42, 0.22, 1.42), f"BastionTrim_{tag}")
            self.box("stone", (bx, 2.74, bz), (1.24, 4.40, 1.24), f"BastionShaft_{tag}", bevel=0.020)
            for yy in (0.62, 1.94, 3.76):
                self.box("stone", (bx, yy, bz), (1.32, 0.11, 1.32), f"BastionBand_{tag}_{int(yy*10)}")
            if front_shields:
                self.lancet_window((bx, 2.86, bz + 0.62), "+z", w=0.26, h=0.84, subtle_ember=True, label=f"BastWinZ_{tag}")
                side_ax = "+x" if bx > kx else "-x"
                side_x = bx + (0.62 if bx > kx else -0.62)
                self.lancet_window((side_x, 2.86, bz), side_ax, w=0.26, h=0.84, subtle_ember=False, label=f"BastWinX_{tag}")
                # Sculpted corner heraldic heater shields
                self.heater_shield("iron", (bx, 1.12, bz + 0.65), 0.56, 0.68, 0.05, "+z", f"ShieldRimZ_{tag}")
                self.heater_shield("team", (bx, 1.12, bz + 0.68), 0.46, 0.58, 0.05, "+z", f"ShieldBodyZ_{tag}")
                self.box("snow", (bx, 1.15, bz + 0.715), (0.34, 0.08, 0.03), f"ShieldStripeZ_{tag}", rot=(0.0, 0.0, 0.62))
                if bx > kx:
                    self.heater_shield("iron", (bx + 0.65, 1.12, bz), 0.56, 0.68, 0.05, "+x", f"ShieldRimX_{tag}")
                    self.heater_shield("team", (bx + 0.68, 1.12, bz), 0.46, 0.58, 0.05, "+x", f"ShieldBodyX_{tag}")
                    self.box("snow", (bx + 0.715, 1.15, bz), (0.03, 0.08, 0.34), f"ShieldStripeX_{tag}", rot=(0.62, 0.0, 0.0))

        # 4. STEPPED VERTICAL BUTTRESSES & 3-BAY ARCHED EMBRASURES ON ALL FLANKS
        for idx, bz in enumerate((0.92, -0.06)):
            self.box("stoneDark", (x_max + 0.16, 0.85, bz), (0.40, 1.70, 0.44), f"ButtressBaseR_{idx}")
            self.frustum_box("stone", (x_max + 0.14, bz), 1.70, 1.98, (0.40, 0.44), (0.28, 0.36), f"ButtressStepR_{idx}")
            self.box("stone", (x_max + 0.11, 3.26, bz), (0.28, 2.60, 0.36), f"ButtressShaftR_{idx}", bevel=0.012)
        for idx, wz in enumerate((1.42, 0.43, -0.56)):
            self.lancet_window((x_max, 1.66, wz), "+x", w=0.28, h=0.78, subtle_ember=False, label=f"WinRLo_{idx}")
            self.lancet_window((x_max, 3.36, wz), "+x", w=0.30, h=0.84, subtle_ember=(idx == 1), label=f"WinRHi_{idx}")

        for idx, bz in enumerate((0.88, -0.78)):
            self.box("stoneDark", (x_min - 0.16, 0.85, bz), (0.40, 1.70, 0.44), f"ButtressBaseL_{idx}")
            self.frustum_box("stone", (x_min - 0.14, bz), 1.70, 1.98, (0.40, 0.44), (0.28, 0.36), f"ButtressStepL_{idx}")
            self.box("stone", (x_min - 0.11, 3.26, bz), (0.28, 2.60, 0.36), f"ButtressShaftL_{idx}", bevel=0.012)
        for idx, wz in enumerate((1.45, 0.05, -1.45)):
            self.lancet_window((x_min, 1.66, wz), "-x", w=0.28, h=0.78, subtle_ember=False, label=f"WinLLo_{idx}")
            self.lancet_window((x_min, 3.36, wz), "-x", w=0.30, h=0.84, subtle_ember=(idx == 1), label=f"WinLHi_{idx}")

        for idx, bx in enumerate((-1.42, -0.18)):
            self.box("stoneDark", (bx, 0.85, z_min - 0.16), (0.44, 1.70, 0.40), f"ButtressBaseB_{idx}")
            self.frustum_box("stone", (bx, z_min - 0.14), 1.70, 1.98, (0.44, 0.40), (0.36, 0.28), f"ButtressStepB_{idx}")
            self.box("stone", (bx, 3.26, z_min - 0.11), (0.36, 2.60, 0.28), f"ButtressShaftB_{idx}", bevel=0.012)
        for idx, wx in enumerate((-0.80, 0.50)):
            self.lancet_window((wx, 1.66, z_min), "-z", w=0.28, h=0.78, subtle_ember=False, label=f"WinBLo_{idx}")
            self.lancet_window((wx, 3.36, z_min), "-z", w=0.30, h=0.84, subtle_ember=(idx == 0), label=f"WinBHi_{idx}")

        # 5. MONUMENTAL FRONT GATEHOUSE, PORTCULLIS, WARM TORCHLIGHT & DRAWBRIDGE
        self.box("stoneDark", (kx, 0.14, 2.42), (1.72, 0.28, 0.66), "GateThreshold")
        # Deep shadowed timber gatehouse interior + warm recessed hearth firelight
        self.box("darkwood", (kx, 1.32, 2.14), (1.58, 2.28, 0.08), "GateBackShadow")
        self.box("glow", (kx, 0.94, 2.20), (0.94, 1.18, 0.06), "GateInteriorGlow")
        for side in (-1.0, 1.0):
            self.box("stoneDark", (kx + side * 0.84, 1.12, 2.50), (0.22, 2.10, 0.52), f"GateJamb_{int(side)}")
            self.box("stone", (kx + side * 0.88, 1.78, 2.66), (0.28, 0.14, 0.26), f"GateImpost_{int(side)}")

        n_vous = 9 if self.high_detail else 5
        arch_cy = 1.66
        arch_r_mid = 0.88
        for i in range(n_vous):
            a = math.pi * (i + 0.5) / n_vous
            vx = kx + math.cos(a) * arch_r_mid
            vy = arch_cy + math.sin(a) * arch_r_mid
            role_v = "stone" if i % 2 == 0 else "stoneDark"
            extra_z = 0.04 if i == n_vous // 2 else 0.0
            self.box(
                role_v,
                (vx, vy, 2.66 + extra_z * 0.5),
                (0.38 if not self.high_detail else 0.32, 0.28, 0.30 + extra_z),
                f"GateVoussoir_{i}",
                rot=(0.0, 0.0, a - math.pi * 0.5),
            )

        # Forged iron portcullis grate
        bar_xs = (-0.56, -0.28, 0.0, 0.28, 0.56) if self.high_detail else (-0.48, -0.16, 0.16, 0.48)
        for bx_off in bar_xs:
            self.rod("iron", (kx + bx_off, 0.38, 2.48), (kx + bx_off, 2.34, 2.48), 0.036, 0.036, segs=rod_segs, label="PortcullisV")
            if self.high_detail:
                self.rod("iron", (kx + bx_off, 0.38, 2.48), (kx + bx_off, 0.24, 2.48), 0.042, 0.010, segs=4, label="PortcullisSpike")
        for by in (0.64, 1.16, 1.68, 2.08):
            span = 1.44 if by < 1.85 else 1.04
            self.box("iron", (kx, by, 2.48), (span, 0.065, 0.065), f"PortcullisH_{int(by*10)}")

        # Sculpted Gothic pointed-arch heraldic niche & relief above gateway (authentic AoE2 crest!)
        self.box("stoneDark", (kx, 3.58, 2.68), (1.18, 1.44, 0.12), "GateCrestNiche")
        for side in (-1.0, 1.0):
            self.box("stone", (kx + side * 0.62, 3.52, 2.74), (0.14, 1.40, 0.16), f"GateCrestCol_{int(side)}")
            # Pointed Gothic hood-molding gable arms
            self.beam("stone", (kx + side * 0.68, 4.16, 2.75), (kx, 4.52, 2.75), 0.16, 0.18, f"GateGothicHood_{int(side)}")
        # Sculpted heraldic escutcheon & subtle white chevron inside Gothic arch
        self.heater_shield("team", (kx, 3.84, 2.76), 0.80, 0.94, 0.08, "+z", "GateHeraldShield")
        self.beam("snow", (kx - 0.28, 3.96, 2.815), (kx, 3.74, 2.815), 0.065, 0.035, "GateChevL")
        self.beam("snow", (kx + 0.28, 3.96, 2.815), (kx, 3.74, 2.815), 0.065, 0.035, "GateChevR")
        self.heater_shield("stone", (kx, 3.16, 2.79), 0.44, 0.56, 0.09, "+z", "GateKeystoneRelief")

        # Heavy weathered oak wooden drawbridge & forged-iron chains!
        self.box("wood", (kx, 0.23, 3.34), (1.58, 0.14, 1.40), "DrawbridgeDeck", rot=(0.025, 0.0, 0.0), bevel=0.010)
        self.frustum_box("darkwood", (kx, 4.08), 0.02, 0.22, (1.58, 0.26), (1.50, 0.06), "DrawbridgeLip")
        batten_zs = (2.82, 3.16, 3.50, 3.86) if self.high_detail else (2.94, 3.44, 3.88)
        for cz_b in batten_zs:
            self.box("darkwood", (kx, 0.305, cz_b), (1.62, 0.045, 0.08), f"BridgeBatten_{int(cz_b*10)}")
        for side in (-1.0, 1.0):
            self.box("darkwood", (kx + side * 0.82, 0.31, 3.34), (0.12, 0.16, 1.44), f"BridgeCurb_{int(side)}")
            self.box("darkwood", (kx + side * 0.82, 0.54, 3.92), (0.13, 0.58, 0.13), f"BridgePost_{int(side)}")
            self.box("stoneDark", (kx + side * 0.94, 2.28, 2.67), (0.20, 0.24, 0.10), f"ChainPort_{int(side)}")
            self.rod("iron", (kx + side * 0.94, 2.26, 2.68), (kx + side * 0.82, 0.38, 3.90), 0.040, 0.040, segs=rod_segs, label=f"BridgeChain_{int(side)}")
            self.box("iron", (kx + side * 0.82, 0.38, 3.90), (0.16, 0.12, 0.16), f"ChainRing_{int(side)}")

        # 6. HEAVY CORBELED MACHICOLATIONS & CHUNKY CRENELLATED KEEP PARAPET
        self.battlement_run((-3.44, 3.10), (-2.20, 3.10), (0.0, 1.0), corbel_step=0.55, merlon_step=0.62, label="ParFL_Z")
        self.battlement_run((-2.20, 2.65), (1.50, 2.65), (0.0, 1.0), corbel_step=0.58, merlon_step=0.82, label="ParGate_Z")
        self.battlement_run((1.50, 3.10), (2.74, 3.10), (0.0, 1.0), corbel_step=0.55, merlon_step=0.62, label="ParFR_Z")
        self.battlement_run((2.74, 3.10), (2.74, 1.86), (1.0, 0.0), corbel_step=0.55, merlon_step=0.62, label="ParFR_X")
        self.battlement_run((2.30, 1.86), (2.30, -0.78), (1.0, 0.0), corbel_step=0.58, merlon_step=0.82, label="ParRight_X")
        self.battlement_run((-3.44, 1.86), (-3.44, 3.10), (-1.0, 0.0), corbel_step=0.55, merlon_step=0.62, label="ParFL_X")
        self.battlement_run((-3.00, -1.75), (-3.00, 1.86), (-1.0, 0.0), corbel_step=0.58, merlon_step=0.82, label="ParLeft_X")
        self.battlement_run((-3.44, -2.99), (-3.44, -1.75), (-1.0, 0.0), corbel_step=0.55, merlon_step=0.62, label="ParBL_X")
        self.battlement_run((-2.20, -2.99), (-3.44, -2.99), (0.0, -1.0), corbel_step=0.55, merlon_step=0.62, label="ParBL_Z")
        self.battlement_run((1.22, -2.55), (-2.20, -2.55), (0.0, -1.0), corbel_step=0.58, merlon_step=0.82, label="ParBack_Z")

        for tag, cx, cz in (("FL", -3.48, 3.14), ("FR", 2.78, 3.14), ("BL", -3.48, -3.03)):
            self.box("stone", (cx, 5.20, cz), (0.48, 0.56, 0.48), f"CornerPar_{tag}")
            self.box("stone", (cx, 5.72, cz), (0.48, 0.54, 0.48), f"CornerMerl_{tag}", bevel=0.015)
            if self.high_detail:
                self.box("stone", (cx, 6.01, cz), (0.55, 0.09, 0.55), f"CornerMerlCap_{tag}")

        # 7. ICONIC TALL CYLINDRICAL ROUND CORNER TOWER (+X, -Z) — RAISED PROUDLY ABOVE KEEP!
        # Grounded cylindrical footing down to -0.46
        self.cylinder("stoneDark", (tx, tz), -0.46, 0.22, 1.56, 1.56, segs=t_segs, label="TowerFoot", smooth=True)
        self.cylinder("stoneDark", (tx, tz), 0.20, 0.68, 1.56, 1.40, segs=t_segs, label="TowerTalus", smooth=True)
        self.cylinder("team", (tx, tz), 0.24, 0.46, 1.53, 1.48, segs=t_segs, label="TowerBaseTrim", smooth=True)
        self.cylinder("stone", (tx, tz), 0.66, 0.78, 1.45, 1.43, segs=t_segs, label="TowerBaseRing", smooth=True)
        # Tall cylindrical masonry drum (rises +1.45 m taller than main keep parapet!)
        self.cylinder("stone", (tx, tz), 0.76, 6.18, r_tower, r_tower, segs=t_segs, label="TowerDrum", smooth=True)
        for yy in (2.34, 4.30):
            self.cylinder("stone", (tx, tz), yy - 0.07, yy + 0.07, r_tower + 0.055, r_tower + 0.055, segs=t_segs, label=f"TowerBand_{int(yy*10)}", smooth=True)

        # Narrow recessed arched windows around exposed round tower faces
        for w_idx, w_ang_deg in enumerate((2.0, -54.0, -114.0)):
            wa = math.radians(w_ang_deg)
            for t_idx, wy in enumerate((2.96, 5.04)):
                wx = tx + math.cos(wa) * (r_tower + 0.01)
                wz = tz + math.sin(wa) * (r_tower + 0.01)
                w_rot = (0.0, math.atan2(math.cos(wa), math.sin(wa)), 0.0)
                self.box("stoneDark", (wx, wy, wz), (0.40, 0.86, 0.15), f"TowWinFrame_{w_idx}_{t_idx}", rot=w_rot)
                self.box("stone", (wx + math.cos(wa) * 0.05, wy - 0.44, wz + math.sin(wa) * 0.05), (0.46, 0.09, 0.21), f"TowWinSill_{w_idx}_{t_idx}", rot=w_rot)
                if self.high_detail:
                    self.box("stone", (wx + math.cos(wa) * 0.04, wy + 0.44, wz + math.sin(wa) * 0.04), (0.44, 0.10, 0.19), f"TowWinCap_{w_idx}_{t_idx}", rot=w_rot)
                self.box("glass", (wx + math.cos(wa) * 0.06, wy, wz + math.sin(wa) * 0.06), (0.20, 0.68, 0.06), f"TowWinGlass_{w_idx}_{t_idx}", rot=w_rot)
                if w_idx == 0 and t_idx == 1:
                    self.box("glow", (wx + math.cos(wa) * 0.072, wy - 0.10, wz + math.sin(wa) * 0.072), (0.08, 0.22, 0.04), f"TowWinEmber_{w_idx}_{t_idx}", rot=w_rot)

        # Round tower overhanging corbeled machicolations & hollow open battlement crown!
        self.cylinder("stoneDark", (tx, tz), 6.06, 6.48, r_tower + 0.08, r_tower + 0.14, segs=t_segs, label="TowerMachRing", smooth=True)
        n_tcorb = 12 if self.high_detail else 10
        for i in range(n_tcorb):
            a = math.tau * i / n_tcorb
            ca, sa = math.cos(a), math.sin(a)
            c_yaw = math.atan2(ca, sa)
            if self.high_detail:
                self.box("stone", (tx + ca * (r_tower + 0.08), 6.18, tz + sa * (r_tower + 0.08)), (0.22, 0.22, 0.24), f"TowCorbLo_{i}", rot=(0.0, c_yaw, 0.0))
                self.box("stone", (tx + ca * (r_tower + 0.14), 6.40, tz + sa * (r_tower + 0.14)), (0.26, 0.22, 0.34), f"TowCorbHi_{i}", rot=(0.0, c_yaw, 0.0))
            else:
                self.box("stone", (tx + ca * (r_tower + 0.12), 6.28, tz + sa * (r_tower + 0.12)), (0.24, 0.42, 0.32), f"TowCorb_{i}", rot=(0.0, c_yaw, 0.0))

        r_par_out, r_par_in = r_tower + 0.20, r_tower - 0.16
        self.hollow_cylinder("stone", (tx, tz), 6.46, 6.96, r_par_out, r_par_in, segs=t_segs, label="TowerParapet", smooth=True)
        if self.high_detail:
            self.hollow_cylinder("stone", (tx, tz), 6.90, 6.99, r_par_out + 0.05, r_par_in - 0.03, segs=t_segs, label="TowerCoping", smooth=True)
        n_tmerl = 10
        arc_span = (math.tau / n_tmerl) * 0.58
        m_segs = 2 if self.high_detail else 1
        for i in range(n_tmerl):
            a_mid = math.tau * i / n_tmerl
            a0, a1 = a_mid - arc_span * 0.5, a_mid + arc_span * 0.5
            self.arc_wall_segment("stone", (tx, tz), 6.98, 7.46, r_par_out + 0.01, r_par_in + 0.03, a0, a1, segs=m_segs, label=f"TowMerl_{i}")
            if self.high_detail:
                self.arc_wall_segment("stone", (tx, tz), 7.44, 7.53, r_par_out + 0.06, r_par_in - 0.01, a0 - 0.02, a1 + 0.02, segs=m_segs, label=f"TowMerlCap_{i}")

        # Open tower fighting platform + lived-in wooden crate, barrel & glowing signal brazier!
        self.cylinder("darkwood", (tx, tz), 6.38, 6.54, r_par_in + 0.04, r_par_in + 0.04, segs=t_segs, label="TowerDeck")
        self.box("wood", (tx - 0.42, 6.78, tz + 0.25), (0.48, 0.46, 0.46), "TowerCrate", rot=(0.0, 0.4, 0.0))
        self.cylinder("wood", (tx + 0.46, tz + 0.30), 6.54, 7.00, 0.22, 0.21, segs=8 if self.high_detail else 6, label="TowerBarrel")
        if self.high_detail:
            self.cylinder("iron", (tx + 0.46, tz + 0.30), 6.66, 6.72, 0.235, 0.235, segs=8, label="TowerBarrelHoop")
        self.cylinder("iron", (tx + 0.04, tz - 0.34), 6.54, 6.96, 0.14, 0.26, segs=8 if self.high_detail else 6, label="TowerBrazier")
        self.cylinder("glow", (tx + 0.04, tz - 0.34), 6.90, 7.04, 0.19, 0.11, segs=8 if self.high_detail else 6, label="TowerEmber")

        # ICONIC VERTICAL HERALDIC CHEVRON BANNER ON ROUND TOWER (razor-sharp ribbon chevrons!)
        b_ang = math.radians(48.0)
        b_ca, b_sa = math.cos(b_ang), math.sin(b_ang)
        b_tx, b_tz = -b_sa, b_ca
        b_rot = (0.0, math.atan2(b_ca, b_sa), 0.0)
        beam_r = r_tower + 0.11
        self.box("darkwood", (tx + b_ca * beam_r, 5.88, tz + b_sa * beam_r), (0.90, 0.09, 0.10), "BannerCrossbar", rot=b_rot)
        for side in (-0.36, 0.36):
            self.box("iron", (tx + b_ca * (r_tower + 0.04) + b_tx * side, 5.88, tz + b_sa * (r_tower + 0.04) + b_tz * side), (0.08, 0.11, 0.22), f"BannerBracket_{int(side*10)}", rot=b_rot)
        b_half_ang = math.radians(15.2)
        r_b_in, r_b_out = r_tower + 0.055, r_tower + 0.115
        b_segs = 4 if self.high_detail else 2
        self.arc_wall_segment("team", (tx, tz), 3.66, 5.86, r_b_out, r_b_in, b_ang - b_half_ang, b_ang + b_half_ang, segs=b_segs, label="TowerBannerMain")
        self.arc_wall_segment("team", (tx, tz), 3.28, 3.70, r_b_out, r_b_in, b_ang - b_half_ang, b_ang - math.radians(3.5), segs=1, label="TowerBannerTailL")
        self.arc_wall_segment("team", (tx, tz), 3.28, 3.70, r_b_out, r_b_in, b_ang + math.radians(3.5), b_ang + b_half_ang, segs=1, label="TowerBannerTailR")
        # Three crisp flat-ribbon heraldic white downward chevrons (V V V) hugging the curved cloth!
        r_chev = r_b_out + 0.018
        for c_idx, cy in enumerate((5.26, 4.66, 4.06)):
            for side in (-1.0, 1.0):
                a_outer = b_ang + side * math.radians(12.6)
                p_outer = (tx + math.cos(a_outer) * r_chev, cy + 0.18, tz + math.sin(a_outer) * r_chev)
                p_apex = (tx + math.cos(b_ang) * (r_chev + 0.014), cy - 0.09, tz + math.sin(b_ang) * (r_chev + 0.014))
                self.beam("snow", p_outer, p_apex, 0.095, 0.032, label=f"BannerChev_{c_idx}_{int(side)}")

        # 8. FLAT ROOFTOP COURTYARD, SOLID BROAD STONE STAIRS, REAR WATCH-TURRET & FLAG
        self.box("stoneDark", (kx, 4.91, kz), (hw * 2 - 0.18, 0.14, hd * 2 - 0.18), "RoofCourtyard")
        self.box("darkwood", (kx + 0.26, 5.01, kz + 0.34), (1.02, 0.09, 0.92), "RoofHatch")
        for hx_off in (-0.30, 0.30):
            self.box("iron", (kx + 0.26 + hx_off, 5.065, kz + 0.34), (0.08, 0.035, 0.88), f"RoofHatchStrap_{int(hx_off*10)}")

        # Elevated Rear Watch-Turret / Bartizan at (-X, -Z) top-back corner
        rx, rz = -2.28, -1.92
        self.box("stone", (rx, 5.82, rz), (1.68, 1.80, 1.68), "RearTurretShaft", bevel=0.018)
        self.box("stoneDark", (rx, 6.64, rz), (1.78, 0.22, 1.78), "RearTurretMach")
        self.box("stone", (rx, 6.88, rz), (1.90, 0.34, 1.90), "RearTurretParapet", bevel=0.014)
        self.box("stoneDark", (rx, 7.02, rz), (1.44, 0.12, 1.44), "RearTurretFloor")
        for mx in (-0.75, 0.0, 0.75):
            for mz in (-0.75, 0.75):
                self.box("stone", (rx + mx, 7.24, rz + mz), (0.38, 0.42, 0.34), "RearTurretMerlZ")
                if self.high_detail:
                    self.box("stone", (rx + mx, 7.47, rz + mz), (0.43, 0.07, 0.39), "RearTurretMerlCapZ")
        for mx in (-0.75, 0.75):
            self.box("stone", (rx + mx, 7.24, rz), (0.34, 0.42, 0.38), "RearTurretMerlX")
            if self.high_detail:
                self.box("stone", (rx + mx, 7.47, rz), (0.39, 0.07, 0.43), "RearTurretMerlCapX")
        # Small arched timber doorway facing right-front at the top of the stone steps
        self.box("stoneDark", (rx + 0.85, 6.16, rz + 0.05), (0.12, 0.86, 0.56), "TurretDoorFrame")
        self.box("darkwood", (rx + 0.87, 6.12, rz + 0.05), (0.10, 0.74, 0.42), "TurretDoor")
        # Flanking heraldic banners on rear watch-turret
        self.box("team", (rx + 0.44, 6.20, rz + 0.87), (0.44, 0.74, 0.07), "RearTurretBannerZ")
        self.box("snow", (rx + 0.44, 6.22, rz + 0.91), (0.30, 0.09, 0.03), "RearTurretBandZ")
        self.box("team", (rx + 0.87, 6.20, rz - 0.42), (0.07, 0.74, 0.44), "RearTurretBannerX")
        self.box("snow", (rx + 0.91, 6.22, rz - 0.42), (0.03, 0.09, 0.30), "RearTurretBandX")

        # SOLID, BROAD, ARCHITECTURAL 5-STEP STONE STAIRCASE rising gently to rear watch-turret!
        # Runs cleanly along the +X face of the rear turret from z = -0.30 back toward z = -1.65 (aligned with keep walls!)
        stair_x = rx + 1.18  # -1.10, flush right beside the turret doorway!
        for s in range(5):
            step_h = 0.17 * (s + 1)  # rises gently 0.17 -> 0.85 m above courtyard (4.94 -> 5.79)
            step_z = -0.35 - s * 0.32
            self.box("stoneDark", (stair_x, 4.94 + step_h * 0.5, step_z), (0.98, step_h, 0.34), f"RoofStepBody_{s}")
            self.box("stone", (stair_x, 4.94 + step_h + 0.035, step_z), (1.02, 0.08, 0.36), f"RoofStepTread_{s}")
        # Solid landing pad at top of stairs right outside turret doorway + stone side balustrade curb
        self.box("stoneDark", (stair_x, 5.38, -1.90), (1.00, 0.88, 0.66), "RoofStairLanding")
        self.box("stone", (stair_x, 5.84, -1.90), (1.04, 0.08, 0.70), "RoofStairLandingCap")
        self.box("stone", (stair_x + 0.48, 5.36, -1.12), (0.14, 0.84, 1.85), "RoofStairCheek")

        # Lived-in medieval rooftop wooden props (siege timber trestle, crate & barrels!)
        self.box("wood", (-1.85, 5.20, 1.28), (1.18, 0.24, 0.44), "RoofTimberFrame", rot=(0.0, 0.22, 0.0))
        self.box("darkwood", (-2.18, 5.14, 1.18), (0.14, 0.42, 0.50), "RoofTrestleA", rot=(0.0, 0.22, 0.0))
        self.box("darkwood", (-1.52, 5.14, 1.38), (0.14, 0.42, 0.50), "RoofTrestleB", rot=(0.0, 0.22, 0.0))
        self.box("wood", (-1.75, 5.44, 0.62), (0.52, 0.48, 0.50), "RoofCrateA", rot=(0.0, -0.30, 0.0))
        if self.high_detail:
            self.box("darkwood", (-1.75, 5.44, 0.62), (0.55, 0.08, 0.53), "RoofCrateBand", rot=(0.0, -0.30, 0.0))
        self.cylinder("wood", (1.28, 1.24), 4.96, 5.44, 0.21, 0.20, segs=8 if self.high_detail else 6, label="RoofBarrelA")
        if self.high_detail:
            self.cylinder("iron", (1.28, 1.24), 5.14, 5.20, 0.225, 0.225, segs=8, label="RoofBarrelHoopA")
        self.cylinder("wood", (1.62, 0.92), 4.96, 5.38, 0.18, 0.17, segs=8 if self.high_detail else 6, label="RoofBarrelB")

        # Tall flagpole with gold finial + animated fluttering cloth pennant!
        fx, _, fz = self.flag_origin
        self.rod("darkwood", (fx, 7.04, fz), (fx, 9.14, fz), 0.058, 0.044, segs=rod_segs, label="FlagPole")
        self.rod("gold", (fx, 9.12, fz), (fx, 9.40, fz), 0.075, 0.012, segs=rod_segs, label="FlagFinial")
        self._make_fluttering_flag()

        # 9. ORGANIC MULTI-CLUSTERED CLIMBING GREEN IVY & BASE MOSS VINES
        # Tightly clustered smaller overlapping leaf-tufts hugging the keep-to-tower corner masonry!
        ivy_core = [
            (2.38, 0.40, -0.78, 0.28, 0.24, 0.28, "leafDark", 1.1),
            (2.56, 0.52, -0.64, 0.24, 0.22, 0.24, "leaf", 2.2),
            (2.34, 0.72, -0.62, 0.22, 0.24, 0.22, "leafDark", 3.3),
            (2.52, 0.94, -0.76, 0.25, 0.24, 0.22, "leaf", 4.4),
            (2.36, 1.20, -0.70, 0.24, 0.26, 0.22, "leafDark", 5.5),
            (2.50, 1.48, -0.66, 0.22, 0.24, 0.20, "leaf", 6.6),
            (2.38, 1.78, -0.76, 0.22, 0.25, 0.20, "leafDark", 7.7),
            (2.48, 2.10, -0.68, 0.20, 0.24, 0.19, "leaf", 8.8),
            (2.38, 2.42, -0.76, 0.19, 0.23, 0.18, "leafDark", 9.9),
            (2.46, 2.74, -0.70, 0.17, 0.21, 0.17, "leaf", 11.0),
            (2.40, 3.06, -0.78, 0.15, 0.19, 0.15, "leafDark", 12.1),
            (2.46, 3.36, -0.72, 0.14, 0.17, 0.14, "leaf", 13.2),
        ]
        ivy_high_fronds = [
            (2.26, 0.48, -0.46, 0.22, 0.19, 0.22, "leaf", 14.3),
            (2.68, 0.66, -0.88, 0.22, 0.20, 0.22, "leafDark", 15.4),
            (2.28, 0.92, -0.48, 0.18, 0.20, 0.18, "leaf", 16.5),
            (2.64, 1.12, -0.86, 0.20, 0.21, 0.20, "leafDark", 17.6),
            (2.32, 1.38, -0.52, 0.18, 0.19, 0.18, "leaf", 18.7),
            (2.60, 1.66, -0.84, 0.18, 0.20, 0.18, "leafDark", 19.8),
            (2.34, 1.96, -0.56, 0.16, 0.18, 0.16, "leaf", 20.9),
            (2.58, 2.26, -0.82, 0.16, 0.19, 0.16, "leafDark", 22.0),
            (2.34, 2.58, -0.60, 0.15, 0.17, 0.15, "leaf", 23.1),
            (2.54, 2.90, -0.80, 0.14, 0.16, 0.14, "leafDark", 24.2),
        ]
        ivy_base = [
            (-3.40, 0.34, 2.84, 0.24, 0.19, 0.24, "leafDark", 25.3),
            (-3.34, 0.54, 2.66, 0.19, 0.17, 0.20, "leaf", 26.4),
            (2.68, 0.34, 1.80, 0.22, 0.18, 0.22, "leafDark", 27.5),
            (2.62, 0.50, 1.66, 0.18, 0.16, 0.18, "leaf", 28.6),
            (3.74, 0.34, -1.32, 0.24, 0.19, 0.22, "leafDark", 29.7),
            (3.68, 0.52, -1.46, 0.19, 0.17, 0.19, "leaf", 30.8),
        ]
        selected_ivy = ivy_core + ivy_base + (ivy_high_fronds if self.high_detail else [])
        for idx, (ix, iy, iz, sx, sy, sz, role, seed) in enumerate(selected_ivy):
            self.ivy_lobe(role, (ix, iy, iz), (sx, sy, sz), seed, label=f"Ivy_{idx}")

        return self.buckets


# Cool silver-grey medieval limestone-granite balance offsets the warm buff
# sandstone texture into authentic weathered grey AoE2 castle masonry!
ROLE_TINTS = {
    "stone": (0.68, 0.84, 1.00),
    "stoneDark": (0.78, 0.89, 1.00),
    "wood": (1.00, 0.96, 0.88),
    "darkwood": (0.94, 0.88, 0.82),
    "iron": (0.44, 0.47, 0.52),
    "team": (1.00, 1.00, 1.00),
    "snow": (1.00, 1.00, 1.00),
    "glass": (0.46, 0.50, 0.58),
    "glow": (1.00, 0.88, 0.70),
    "leaf": (0.96, 1.00, 0.90),
    "leafDark": (0.86, 0.94, 0.84),
    "gold": (1.00, 0.98, 0.90),
}


def build_shared_meshes(high_detail, tier_tag):
    """Build all buckets, bake non-crushing 3D BVH ambient occlusion, and return shared mesh specs."""
    builder = CastleBuilder(high_detail=high_detail)
    buckets = builder.build()
    flag_pivot = pt(builder.flag_origin)

    specs = []
    all_verts = []
    all_polys = []

    for role, is_flag in sorted(buckets.keys()):
        bm, _ = buckets[(role, is_flag)]
        mesh = bpy.data.meshes.new(f"CastleMesh_{tier_tag}_{role}{'_flag' if is_flag else ''}")
        bm.to_mesh(mesh)
        bm.free()
        mesh.materials.append(materials[role])
        mesh.update()

        offset = flag_pivot if is_flag else Vector((0.0, 0.0, 0.0))
        base = len(all_verts)
        for v in mesh.vertices:
            all_verts.append(v.co + offset)
        for p in mesh.polygons:
            if len(p.vertices) >= 3:
                for k in range(1, len(p.vertices) - 1):
                    all_polys.append((base + p.vertices[0], base + p.vertices[k], base + p.vertices[k + 1]))

        tris = sum(max(0, len(p.vertices) - 2) for p in mesh.polygons)
        specs.append({
            "role": role,
            "is_flag": is_flag,
            "mesh": mesh,
            "location": offset,
            "tris": tris,
        })

    # Gentle, luminous 3D BVH AO (keeps crevices crisp without double-crushing against runtime Vertex AO!)
    bvh = BVHTree.FromPolygons(all_verts, all_polys)
    dirs = []
    for i in range(16):
        z = (i + 0.5) / 16.0
        r = math.sqrt(max(0.0, 1.0 - z * z))
        a = i * 2.39996323
        dirs.append(Vector((math.cos(a) * r, math.sin(a) * r, z)).normalized())

    z_min = min(v.z for v in all_verts)
    z_span = max(1.0, max(v.z for v in all_verts) - z_min)

    for spec in specs:
        mesh = spec["mesh"]
        role = spec["role"]
        offset = spec["location"]
        tr, tg, tb = ROLE_TINTS.get(role, (1.0, 1.0, 1.0))
        colors = mesh.color_attributes.new(name="BakedDepth", type="FLOAT_COLOR", domain="POINT")
        mesh.color_attributes.active_color = colors

        if role == "glow":
            for v in mesh.vertices:
                colors.data[v.index].color = (tr, tg, tb, 1.0)
            continue

        for v in mesh.vertices:
            wp = v.co + offset
            wn = v.normal.normalized()
            if wn.length < 1e-4:
                wn = Vector((0, 0, 1))
            up = Vector((0, 0, 1)) if abs(wn.z) < 0.92 else Vector((1, 0, 0))
            tx = wn.cross(up).normalized()
            ty = wn.cross(tx).normalized()
            occluded = 0.0
            for d in dirs:
                ray_dir = (tx * d.x + ty * d.y + wn * d.z).normalized()
                hit, _, _, dist = bvh.ray_cast(wp + wn * 0.025, ray_dir, 1.65)
                if hit is not None:
                    occluded += 1.0 - (dist / 1.65) * 0.45
            ao = 1.0 - 0.20 * (occluded / len(dirs))
            h_frac = min(1.0, max(0.0, (wp.z - z_min) / z_span))
            height_lift = 0.93 + 0.11 * math.pow(h_frac, 0.70)
            if role in ("stone", "stoneDark"):
                course = 0.965 + 0.035 * math.sin(wp.z * 5.6 + math.floor(wp.z * 2.4) * 1.7 + (wp.x + wp.y) * 2.4)
                sky_pop = 0.97 + 0.07 * max(0.0, wn.z)
                # Subtle bright limestone pop on merlon caps, corbels, and upper crown!
                battlement_lift = 1.0 + (0.08 if wp.z > 4.6 else 0.0)
                shade = min(1.06, max(0.76, ao * height_lift * course * sky_pop * battlement_lift))
            else:
                course = 0.985 + 0.015 * math.sin(wp.x * 4.1 + wp.y * 3.7 + wp.z * 4.5)
                shade = min(1.04, max(0.78, ao * height_lift * course))
            colors.data[v.index].color = (
                min(1.0, max(0.0, tr * shade)),
                min(1.0, max(0.0, tg * shade)),
                min(1.0, max(0.0, tb * shade)),
                1.0,
            )

    total_tris = sum(s["tris"] for s in specs)
    return specs, total_tris, builder.part_count


def attach_castle_instances(shared_specs):
    created = []
    for key in KEYS:
        root = roots[key]
        assert root.matrix_local.is_identity, f"Preserve browser-space identity root for {key}"
        for obj in reversed(descendants(root)[1:]):
            bpy.data.objects.remove(obj, do_unlink=True)
        faction = key.split(":")[2]
        root["model3d"] = {
            "kind": "building",
            "type": "keep",
            "volumetric": True,
            "architectureAge": 0,
            "artRevision": CASTLE_REVISION,
            "wallTier": "stone",
        }
        for spec in shared_specs:
            suffix = "flag" if spec["is_flag"] else spec["role"]
            obj = bpy.data.objects.new(f"Castle_{faction}_{suffix}", spec["mesh"])
            bpy.context.collection.objects.link(obj)
            obj.parent = root
            obj.location = spec["location"].copy()
            obj["assetMaterial"] = spec["role"]
            if spec["is_flag"]:
                obj["flag"] = True
            created.append(obj)
    return created


detail_stats = {}
part_counts = {}
near_specs = None

for detail in ("low", "near"):
    high_detail = detail == "near"
    specs, tris, raw_count = build_shared_meshes(high_detail=high_detail, tier_tag=detail)
    created = attach_castle_instances(specs)
    bpy.context.view_layer.update()

    bpy.ops.object.select_all(action="DESELECT")
    for key in KEYS:
        roots[key].select_set(True)
    for obj in created:
        obj.select_set(True)

    bpy.ops.export_scene.gltf(
        filepath=str(out / f"frontier-{detail}.glb"),
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_vertex_color="ACTIVE",
        export_extras=True,
        export_animations=False,
        export_cameras=False,
        export_lights=False,
    )
    detail_stats[detail] = {key: tris for key in KEYS}
    part_counts[detail] = raw_count
    if high_detail:
        near_specs = specs

for m in list(bpy.data.meshes):
    if m.users == 0:
        bpy.data.meshes.remove(m)

for key, digest in unchanged.items():
    assert fingerprint(roots[key]) == digest, f"Unrelated model mutated: {key}"

bpy.ops.wm.save_as_mainfile(filepath=str(out / "frontier-assets.blend"), compress=True)

report = {
    "passed": True,
    "revision": CASTLE_REVISION,
    "models": 126,
    "unchangedOtherModels": len(unchanged),
    "closedSolidParts": part_counts,
    "keys": KEYS,
    "triangles": detail_stats,
    "sharedMeshes": len(near_specs),
    "sourceSHA256": hashlib.sha256(source.read_bytes()).hexdigest(),
}
(out / "authoring-validation.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
print(json.dumps(report), flush=True)
