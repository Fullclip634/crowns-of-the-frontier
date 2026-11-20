"""Author ultra-premium solid timber siege engines and medieval naval ships in Blender 4.5 LTS.

Browser-space coordinates use Y-up / +Z-forward; this script converts cleanly
into Blender's Z-up / -Y-forward space while keeping every asset root identity.
Only the 6 siege & naval roots change; all 120 other catalogue models remain
byte-exact. Every generated piece is a watertight, outward-normal closed solid
with wood-grain UVs and BVH ambient-occlusion vertex shading.
"""
import argparse
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
parser.add_argument("--out", default=str(project / ".tools/art-candidate/siege-naval/raw"))
args = parser.parse_args(sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else [])

source = Path(args.source).resolve()
assert source.is_relative_to(project) and source.suffix == ".blend" and source.is_file()
out = Path(args.out).resolve()
assert out.is_relative_to(project)
out.mkdir(parents=True, exist_ok=True)

bpy.ops.wm.open_mainfile(filepath=str(source))
roots = {obj["assetKey"]: obj for obj in bpy.data.objects if obj.get("assetKey")}
assert len(roots) == 126

KEYS = [
    "unit:ram",
    "unit:catapult",
    "unit:fishingboat",
    "unit:galley",
    "unit:warship",
    "unit:transport",
]


def descendants(root):
    return [root] + [part for child in root.children for part in descendants(child)]


def fingerprint(root):
    values = []
    for obj in descendants(root):
        values.append(
            (
                obj.name,
                tuple(value for row in obj.matrix_local for value in row),
                obj.get("assetMaterial"),
            )
        )
        if obj.type == "MESH":
            values.append(
                (
                    [tuple(v.co) for v in obj.data.vertices],
                    [tuple(p.vertices) for p in obj.data.polygons],
                )
            )
    return hashlib.sha256(repr(values).encode()).hexdigest()


unchanged = {key: fingerprint(root) for key, root in roots.items() if key not in KEYS}
materials = {
    p.get("assetMaterial"): p.data.materials[0]
    for root in roots.values()
    for p in descendants(root)
    if p.type == "MESH" and p.get("assetMaterial") and p.data.materials
}


def pt(p):
    """Browser (x, y, z) [Y-up, +Z-forward] -> Blender (x, -z, y) [Z-up, -Y-forward]."""
    return Vector((p[0], -p[2], p[1]))


parts = []
cur_root = None
cur_motion = None
serial = 0


def finalize_mesh(bm, role, label, bevel=0.0, smooth=False):
    global serial
    serial += 1
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(f"{cur_root.name}_{label}_{serial}")
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()
    if smooth:
        for poly in mesh.polygons:
            poly.use_smooth = True
    obj = bpy.data.objects.new(mesh.name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.parent = cur_root
    obj["assetMaterial"] = role
    obj["craftPart"] = label
    if cur_motion:
        obj["motion"] = cur_motion
    mat = materials.get(role) or materials["wood"]
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    uv = obj.data.uv_layers.active or obj.data.uv_layers.new(name="UVMap")
    for loop in obj.data.loops:
        p = obj.data.vertices[loop.vertex_index].co
        uv.data[loop.index].uv = (p.x * 0.65 - p.y * 0.22, p.z * 0.36 - p.y * 0.44)
    if bevel > 0.0:
        mod = obj.modifiers.new("CraftBevel", "BEVEL")
        mod.width = bevel
        mod.segments = 1
        mod.limit_method = "ANGLE"
        mod.angle_limit = math.radians(32)
    parts.append(obj)
    return obj


def make_box(role, center, size, label, rot=(0.0, 0.0, 0.0), bevel=0.0):
    """Closed box centered at browser-space `center` with browser-space `size`=(sx,sy,sz)."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    sx, sy, sz = size
    # In Blender space: X=sx, Y=sz, Z=sy
    scale_mat = Matrix.Diagonal((sx, sz, sy, 1.0))
    # Convert browser Euler (rx, ry, rz) to Blender rotation via basis mapping
    # Browser rotation around X -> Blender +X; Browser +Y -> Blender +Z; Browser +Z -> Blender -Y
    rot_mat = (
        Matrix.Rotation(rot[1], 4, "Z")
        @ Matrix.Rotation(-rot[2], 4, "Y")
        @ Matrix.Rotation(rot[0], 4, "X")
    )
    xform = Matrix.Translation(pt(center)) @ rot_mat @ scale_mat
    bmesh.ops.transform(bm, matrix=xform, verts=bm.verts)
    return finalize_mesh(bm, role, label, bevel=bevel)


def make_beam(role, a, b, width, depth, label, bevel=0.0):
    pa, pb = pt(a), pt(b)
    delta = pb - pa
    length = delta.length
    if length < 1e-5:
        return None
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    scale_mat = Matrix.Diagonal((width, depth, length, 1.0))
    quat = delta.to_track_quat("Z", "Y")
    xform = Matrix.Translation((pa + pb) * 0.5) @ quat.to_matrix().to_4x4() @ scale_mat
    bmesh.ops.transform(bm, matrix=xform, verts=bm.verts)
    return finalize_mesh(bm, role, label, bevel=bevel)


def make_rod(role, a, b, r0, r1=None, label="Rod", segs=10, smooth=False):
    if r1 is None:
        r1 = r0
    pa, pb = pt(a), pt(b)
    delta = pb - pa
    length = delta.length
    if length < 1e-5:
        return None
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
    return finalize_mesh(bm, role, label, smooth=smooth)


def make_sphere(role, center, scale, label, segs=10, rings=7, smooth=True):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=rings, radius=1.0)
    sx, sy, sz = scale if isinstance(scale, (tuple, list)) else (scale, scale, scale)
    xform = Matrix.Translation(pt(center)) @ Matrix.Diagonal((sx, sz, sy, 1.0))
    bmesh.ops.transform(bm, matrix=xform, verts=bm.verts)
    return finalize_mesh(bm, role, label, smooth=smooth)


def make_boulder(role, center, scale, seed, label):
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=1, radius=1.0)
    sx, sy, sz = scale
    c = pt(center)
    for v in bm.verts:
        p = v.co
        n = 1.0 + 0.16 * math.sin(p.x * 4.3 + seed) * math.cos(p.y * 3.7 - seed * 0.7) + 0.09 * math.cos(p.z * 5.1 + seed * 1.3)
        v.co = c + Vector((p.x * sx * n, p.y * sz * n, p.z * sy * n))
    return finalize_mesh(bm, role, label, smooth=False)


def make_ring(role, x, y, z, outer, inner, width, label, segs=16):
    bm = bmesh.new()
    rings = []
    for xx, r in [(x - width * 0.5, outer), (x + width * 0.5, outer), (x - width * 0.5, inner), (x + width * 0.5, inner)]:
        ring = []
        for i in range(segs):
            a = math.tau * i / segs
            ring.append(bm.verts.new(pt((xx, y + r * math.cos(a), z + r * math.sin(a)))))
        rings.append(ring)
    r0, r1, r2, r3 = rings
    for i in range(segs):
        j = (i + 1) % segs
        bm.faces.new((r0[i], r0[j], r1[j], r1[i]))
        bm.faces.new((r2[j], r2[i], r3[i], r3[j]))
        bm.faces.new((r0[j], r0[i], r2[i], r2[j]))
        bm.faces.new((r1[i], r1[j], r3[j], r3[i]))
    return finalize_mesh(bm, role, label)


def make_loft(role, stations, label, cap_ends=True, smooth=False):
    """Build a closed manifold loft through cross-section rings of equal vertex count.
    `stations`: list of lists of browser-space (x, y, z) points (closed loop per ring).
    """
    bm = bmesh.new()
    n = len(stations[0])
    rings = [[bm.verts.new(pt(p)) for p in ring] for ring in stations]
    for s in range(len(rings) - 1):
        a, b = rings[s], rings[s + 1]
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((a[i], a[j], b[j], b[i]))
    if cap_ends:
        cap0 = bm.faces.new(tuple(reversed(rings[0])))
        cap1 = bm.faces.new(tuple(rings[-1]))
        bmesh.ops.triangulate(bm, faces=[cap0, cap1])
    return finalize_mesh(bm, role, label, smooth=smooth)


def make_curved_sail(role, width, height, y_bottom, z_base, belly=0.42, thickness=0.045, cols=7, rows=5, u_range=(0.0, 1.0), v_range=(0.0, 1.0), label="Sail"):
    """True 3D wind-billowed closed cloth volume in browser space."""
    bm = bmesh.new()
    u0, u1 = u_range
    v0, v1 = v_range
    front, back = [], []
    for r in range(rows + 1):
        vf = v0 + (v1 - v0) * (r / rows)
        row_f, row_b = [], []
        for c in range(cols + 1):
            uf = u0 + (u1 - u0) * (c / cols)
            x = (uf - 0.5) * width
            y = y_bottom + vf * height
            # Natural wind belly: fuller in the middle, slight vertical drape sag
            arch_u = math.sin(uf * math.pi)
            arch_v = math.sin(vf * math.pi)
            z = z_base + belly * (0.28 + 0.72 * arch_u) * arch_v + 0.04 * math.sin(uf * math.pi * 3.0) * arch_v
            row_f.append(bm.verts.new(pt((x, y, z + thickness * 0.5))))
            row_b.append(bm.verts.new(pt((x, y, z - thickness * 0.5))))
        front.append(row_f)
        back.append(row_b)
    for r in range(rows):
        for c in range(cols):
            bm.faces.new((front[r][c], front[r][c + 1], front[r + 1][c + 1], front[r + 1][c]))
            bm.faces.new((back[r][c], back[r + 1][c], back[r + 1][c + 1], back[r][c + 1]))
    # Stitch all four outer borders so the cloth is strictly watertight manifold
    for c in range(cols):
        bm.faces.new((front[0][c], back[0][c], back[0][c + 1], front[0][c + 1]))
        bm.faces.new((front[rows][c + 1], back[rows][c + 1], back[rows][c], front[rows][c]))
    for r in range(rows):
        bm.faces.new((front[r + 1][0], back[r + 1][0], back[r][0], front[r][0]))
        bm.faces.new((front[r][cols], back[r][cols], back[r + 1][cols], front[r + 1][cols]))
    return finalize_mesh(bm, role, label, smooth=True)


def make_war_shield(role_face, role_rim, center, normal_axis, radius=0.34, thick=0.05, label="Shield"):
    """Round embossed medieval war shield facing +/-X or +/-Z."""
    cx, cy, cz = center
    if normal_axis == "x":
        make_rod(role_face, (cx - thick * 0.5, cy, cz), (cx + thick * 0.5, cy, cz), radius, radius, label + "Body", segs=10)
        make_ring(role_rim, cx, cy, cz, radius + 0.025, radius - 0.03, thick + 0.02, label + "Rim", segs=10)
        sign = 1.0 if cx >= 0 else -1.0
        make_sphere(role_rim, (cx + sign * (thick * 0.55), cy, cz), (0.06, 0.10, 0.10), label + "Boss", segs=6, rings=4)
    else:
        make_rod(role_face, (cx, cy, cz - thick * 0.5), (cx, cy, cz + thick * 0.5), radius, radius, label + "Body", segs=10)
        sign = 1.0 if cz >= 0 else -1.0
        make_sphere(role_rim, (cx, cy, cz + sign * (thick * 0.55)), (0.10, 0.10, 0.06), label + "Boss", segs=6, rings=4)


def make_barrel(center, scale=0.45, label="Barrel"):
    cx, cy, cz = center
    h = scale * 1.35
    r = scale * 0.44
    stations = []
    for t, mult in [(0.0, 0.80), (0.32, 1.02), (0.68, 1.02), (1.0, 0.80)]:
        ring = []
        for i in range(8):
            a = math.tau * i / 8
            ring.append((cx + math.cos(a) * r * mult, cy + t * h, cz + math.sin(a) * r * mult))
        stations.append(ring)
    make_loft("wood", stations, label + "Staves")
    for t in (0.22, 0.78):
        make_rod("iron", (cx, cy + t * h - 0.03, cz), (cx, cy + t * h + 0.03, cz), r * 1.03, r * 1.03, label + "Hoop", segs=8)


def make_crate(center, size=0.56, label="Crate"):
    cx, cy, cz = center
    make_box("wood", (cx, cy + size * 0.5, cz), (size, size, size), label + "Body", bevel=0.012)
    for sx in (-1, 1):
        make_box("darkwood", (cx + sx * size * 0.46, cy + size * 0.5, cz), (0.06, size * 1.02, size * 1.03), label + "TrimX")
    for sz in (-1, 1):
        make_box("darkwood", (cx, cy + size * 0.5, cz + sz * size * 0.46), (size * 1.03, size * 1.02, 0.06), label + "TrimZ")
    make_box("iron", (cx, cy + size * 0.5, cz), (size * 1.05, 0.055, size * 1.05), label + "Band")


def make_sculpted_hull(
    length,
    beam,
    depth,
    waterline=-0.16,
    sheer_bow=0.52,
    sheer_stern=0.44,
    stern_flatness=0.48,
    clinker_wales=True,
    label="Hull",
):
    """Sculpted closed clinker/carvel medieval hull lofted from stern (-Z) to bow (+Z),
    plus recessed planked deck, external keel, curved stempost, sternpost, gunwale cap rails,
    and optional external darkwood armor strakes (wales).
    """
    half_l = length * 0.5
    half_b = beam * 0.5
    # 9 longitudinal stations from stern (-half_l) to pointed bow (+half_l)
    z_fracs = [-1.0, -0.84, -0.58, -0.24, 0.10, 0.44, 0.72, 0.90, 1.0]
    width_curve = [stern_flatness * 0.42, stern_flatness, 0.88, 1.0, 1.0, 0.92, 0.68, 0.34, 0.07]
    keel_curve = [0.22, 0.04, 0.0, 0.0, 0.0, 0.0, 0.06, 0.24, 0.55]
    sheer_curve = [sheer_stern, sheer_stern * 0.78, sheer_stern * 0.38, 0.06, 0.0, 0.08, sheer_bow * 0.40, sheer_bow * 0.76, sheer_bow]

    # Cross-section profile (10 vertices around closed hull section, from keel up starboard, across deck edge, down port)
    # Using a solid watertight hull shell with recessed deck shelf
    stations = []
    deck_y_base = waterline + depth * 0.76
    for idx, zf in enumerate(z_fracs):
        z = zf * half_l
        w = max(0.06, half_b * width_curve[idx])
        ky = waterline + keel_curve[idx] * depth * 0.65
        gy = waterline + depth + sheer_curve[idx]
        dy = min(gy - 0.16, deck_y_base + sheer_curve[idx] * 0.45)
        bilge_y = ky + (gy - ky) * 0.30
        mid_y = ky + (gy - ky) * 0.66
        # 10-point section (clockwise looking from bow):
        # keel -> stbd bilge -> stbd waist -> stbd gunwale -> stbd inner rail -> port inner rail -> port gunwale -> port waist -> port bilge -> keel-port
        sec = [
            (w * 0.12, ky, z),
            (w * 0.78, bilge_y, z),
            (w * 1.00, mid_y, z),
            (w * 0.96, gy, z),
            (w * 0.82, dy, z),
            (-w * 0.82, dy, z),
            (-w * 0.96, gy, z),
            (-w * 1.00, mid_y, z),
            (-w * 0.78, bilge_y, z),
            (-w * 0.12, ky, z),
        ]
        stations.append(sec)
    make_loft("wood", stations, label + "Shell", cap_ends=True, smooth=False)

    # Heavy external timber keel + sweeping curved stempost & sternpost
    make_box("darkwood", (0.0, waterline + 0.06, -half_l * 0.04), (0.16, 0.22, length * 0.80), label + "Keel", bevel=0.015)
    # Curved bow stempost rising proudly above prow
    bow_pts = [
        (0.0, waterline + 0.12, half_l * 0.74),
        (0.0, waterline + depth * 0.55, half_l * 0.96),
        (0.0, waterline + depth + sheer_bow + 0.18, half_l * 1.05),
        (0.0, waterline + depth + sheer_bow + 0.52, half_l * 1.11),
    ]
    for i in range(len(bow_pts) - 1):
        make_beam("darkwood", bow_pts[i], bow_pts[i + 1], 0.15, 0.19, label + "Stempost", bevel=0.012)
    # Curved sternpost + hinged rudder
    stern_pts = [
        (0.0, waterline + 0.10, -half_l * 0.82),
        (0.0, waterline + depth * 0.60, -half_l * 0.99),
        (0.0, waterline + depth + sheer_stern + 0.16, -half_l * 1.04),
    ]
    for i in range(len(stern_pts) - 1):
        make_beam("darkwood", stern_pts[i], stern_pts[i + 1], 0.15, 0.17, label + "Sternpost", bevel=0.012)
    # Rudder blade & iron pintles at stern
    make_box("darkwood", (0.0, waterline + depth * 0.42, -half_l * 1.07), (0.09, depth * 0.78, 0.34), label + "Rudder", bevel=0.01)
    make_box("iron", (0.0, waterline + depth * 0.62, -half_l * 1.02), (0.13, 0.07, 0.24), label + "RudderPintle")

    # External darkwood rubbing strakes (wales) & gunwale cap rails following hull curve
    for side in (-1.0, 1.0):
        for i in range(len(z_fracs) - 1):
            z0, z1 = z_fracs[i] * half_l, z_fracs[i + 1] * half_l
            w0, w1 = max(0.07, half_b * width_curve[i]), max(0.07, half_b * width_curve[i + 1])
            gy0 = waterline + depth + sheer_curve[i]
            gy1 = waterline + depth + sheer_curve[i + 1]
            # Gunwale cap timber
            make_beam("darkwood", (side * w0 * 0.94, gy0 + 0.04, z0), (side * w1 * 0.94, gy1 + 0.04, z1), 0.13, 0.10, label + "Gunwale")
            if clinker_wales:
                wy0 = waterline + depth * 0.64 + sheer_curve[i] * 0.72
                wy1 = waterline + depth * 0.64 + sheer_curve[i + 1] * 0.72
                make_beam("darkwood", (side * w0 * 1.02, wy0, z0), (side * w1 * 1.02, wy1, z1), 0.09, 0.11, label + "Wale")

    # Internal transverse deck planks & timber ribs
    for zi in range(-4, 5):
        zf = zi * 0.18
        z = zf * half_l
        # Approximate beam at zf
        w = half_b * max(0.32, 1.0 - 0.62 * (zf * zf))
        make_box("darkwood", (0.0, deck_y_base + 0.03, z), (w * 1.56, 0.06, 0.10), label + "DeckBeam")

    return deck_y_base


# ==============================================================================
# 1. ULTRA-PREMIUM SIEGE ENGINES: BATTERING RAM & IMPERIAL TREBUCHET
# ==============================================================================


def build_siege_wheels(wheel_x=1.08, wheel_z=0.98):
    global cur_motion
    for x in (-wheel_x, wheel_x):
        for z in (-wheel_z, wheel_z):
            cur_motion = {"type": "wheel", "pivot": [x, 0.55, z], "side": 1}
            make_ring("iron", x, 0.55, z, 0.54, 0.485, 0.20, "IronTyre", segs=16)
            make_ring("wood", x, 0.55, z, 0.485, 0.36, 0.17, "WoodenFelloe", segs=16)
            for i in range(6):
                a = i * math.pi / 3.0
                make_beam("wood", (x, 0.55, z), (x, 0.55 + math.cos(a) * 0.41, z + math.sin(a) * 0.41), 0.11, 0.075, "WheelSpoke")
                # Forged iron rim bolts around felloe
                make_box("iron", (x + (0.095 if x > 0 else -0.095), 0.55 + math.cos(a) * 0.43, z + math.sin(a) * 0.43), (0.04, 0.05, 0.05), "RimBolt")
            make_rod("darkwood", (x - 0.17, 0.55, z), (x + 0.17, 0.55, z), 0.15, 0.15, "WheelHub", segs=12)
            make_rod("iron", (x - 0.21, 0.55, z), (x + 0.21, 0.55, z), 0.085, 0.065, "AxleCap", segs=10)
            cur_motion = None
    for z in (-wheel_z, wheel_z):
        make_rod("iron", (-wheel_x - 0.10, 0.55, z), (wheel_x + 0.10, 0.55, z), 0.078, 0.078, "Axle", segs=10)
        make_box("darkwood", (0.0, 0.62, z), (1.76, 0.18, 0.20), "AxleBed", bevel=0.012)


def build_siege_chassis():
    build_siege_wheels()
    for x in (-0.78, 0.78):
        make_box("darkwood", (x, 0.77, 0.0), (0.23, 0.27, 2.98), "ChassisRail", bevel=0.018)
        for z in (-1.38, 1.38):
            make_box("iron", (x, 0.77, z), (0.26, 0.30, 0.18), "CornerBracket")
    for z in (-1.30, -0.45, 0.45, 1.30):
        make_box("wood", (0.0, 0.80, z), (1.88, 0.22, 0.22), "CrossMember", bevel=0.012)
    for x in (-0.57, -0.285, 0.0, 0.285, 0.57):
        make_box("wood", (x, 0.92, 0.0), (0.26, 0.09, 2.66), "DeckPlank")


def author_ram():
    global cur_motion
    build_siege_chassis()
    # Heavy armored timber penthouse canopy frame
    for x in (-0.80, 0.80):
        for z in (-1.18, 0.0, 1.18):
            make_box("darkwood", (x, 1.48, z), (0.19, 1.34, 0.20), "CanopyPost", bevel=0.012)
            make_box("iron", (x, 1.01, z), (0.23, 0.16, 0.24), "PostShoe")
        for z in (-1.18, 1.18):
            make_beam("wood", (x, 1.04, z * 0.48), (x, 1.98, z), 0.12, 0.13, "DiagonalBrace", bevel=0.01)
        make_box("darkwood", (x, 2.09, 0.0), (0.21, 0.19, 2.94), "CanopyEave", bevel=0.014)
        # Armored side pavise skirt planks protecting crew from arrows
        for y_pl in (1.28, 1.54, 1.80):
            make_box("wood", (x * 1.09, y_pl, 0.0), (0.075, 0.23, 2.58), "SideArmorPlank", bevel=0.008)
        for z_st in (-0.98, 0.0, 0.98):
            make_box("iron", (x * 1.13, 1.54, z_st), (0.045, 0.84, 0.085), "SideIronStrap")
        # Pair of heraldic war shields bolted along each armored flank
        for z_sh in (-0.54, 0.54):
            make_war_shield("team", "iron", (x * 1.18, 1.56, z_sh), "x", radius=0.31, thick=0.055, label="FlankShield")

    # Rear armored crew bulkhead & twin iron-shod push handles
    make_box("darkwood", (0.0, 1.42, -1.32), (1.58, 0.72, 0.10), "RearBulkhead", bevel=0.01)
    for x in (-0.55, 0.55):
        make_rod("iron", (x, 1.18, -1.34), (x, 1.12, -1.62), 0.045, 0.045, "PushBar", segs=8)

    # Sloped overlapping heavy oak roof planks + forged iron roof straps + iron-capped ridge crest
    for side in (-1.0, 1.0):
        for i in range(8):
            x = side * (i + 0.5) * 0.145
            center = (x, 2.75 - abs(x) * 0.57, 0.0)
            make_box("wood", center, (0.165, 0.11, 3.16), "RoofPlank", rot=(0.0, 0.0, -side * math.atan(0.57)))
        for z in (-1.26, -0.42, 0.42, 1.26):
            make_beam("iron", (0.0, 2.81, z), (side * 1.18, 2.13, z), 0.06, 0.095, "RoofStrap")
        # Iron eave edge reinforcement
        make_box("iron", (side * 1.17, 2.11, 0.0), (0.07, 0.10, 3.18), "EaveIron")
    make_box("darkwood", (0.0, 2.80, 0.0), (0.15, 0.16, 3.24), "RidgeBeam", bevel=0.014)
    make_box("iron", (0.0, 2.89, 0.0), (0.09, 0.08, 3.26), "RidgeIronCrest", bevel=0.01)
    for z in (-1.59, 1.59):
        for side in (-1.0, 1.0):
            make_beam("darkwood", (0.0, 2.75, z), (side * 1.17, 2.07, z), 0.14, 0.13, "GableFascia", bevel=0.012)
    # Front gilded heraldic crest medallion on gable apex
    make_sphere("gold", (0.0, 2.54, 1.62), (0.15, 0.17, 0.07), "GableCrest", segs=10, rings=6)

    # Heavy hanging iron suspension chains from ridge rafters
    for z in (-0.80, 0.80):
        for x in (-0.21, 0.21):
            make_rod("iron", (x, 2.12, z), (x, 1.44, z), 0.032, 0.032, "Chain", segs=8)
            for y_lk in (1.58, 1.76, 1.94):
                make_box("iron", (x, y_lk, z), (0.068, 0.08, 0.068), "ChainLink")

    # Articulated Ramming Log + Sculpted Forged Iron/Steel Ram's-Head Prow
    cur_motion = {"type": "ram", "pivot": [0, 1.36, 0], "side": 1}
    make_rod("wood", (0.0, 1.36, -1.52), (0.0, 1.36, 1.88), 0.255, 0.265, "RamLog", segs=14, smooth=True)
    for z in (-0.82, 0.0, 0.80, 1.62):
        make_rod("iron", (0.0, 1.36, z - 0.06), (0.0, 1.36, z + 0.06), 0.282, 0.282, "LogBinding", segs=14)
    # Sculpted iron ram's-head sleeve + gilded crown band
    make_rod("iron", (0.0, 1.36, 1.76), (0.0, 1.36, 2.18), 0.295, 0.24, "RamHeadSocket", segs=14, smooth=True)
    make_rod("gold", (0.0, 1.36, 1.82), (0.0, 1.36, 1.90), 0.308, 0.308, "RamCrownBand", segs=14)
    # Armored snout & faceted steel striking brow
    make_box("iron", (0.0, 1.31, 2.17), (0.38, 0.34, 0.24), "RamSnout", bevel=0.025)
    make_box("steel", (0.0, 1.37, 2.28), (0.44, 0.38, 0.11), "RamStrikePlate", bevel=0.022)
    # Curved forged steel ram horns sweeping back along cheeks
    for side in (-1.0, 1.0):
        horn_pts = [
            (side * 0.17, 1.54, 2.02),
            (side * 0.34, 1.56, 1.88),
            (side * 0.39, 1.38, 1.76),
            (side * 0.32, 1.21, 1.86),
            (side * 0.24, 1.24, 1.98),
        ]
        radii = [0.088, 0.075, 0.062, 0.048, 0.032]
        for i in range(len(horn_pts) - 1):
            make_rod("steel", horn_pts[i], horn_pts[i + 1], radii[i], radii[i + 1], "RamHorn", segs=8, smooth=True)
    cur_motion = None


def author_trebuchet():
    global cur_motion
    build_siege_chassis()
    # Central projectile launching trough with iron guide rails
    make_box("darkwood", (0.0, 0.99, -0.05), (0.58, 0.08, 2.52), "TroughFloor")
    for x in (-0.31, 0.31):
        make_box("wood", (x, 1.07, -0.05), (0.09, 0.16, 2.52), "TroughWall", bevel=0.01)
        make_box("iron", (x, 1.15, -0.05), (0.055, 0.04, 2.52), "TroughRail")

    # Twin reinforced heavy timber A-frames with iron gusset plates & lateral buttresses
    for x in (-0.65, 0.65):
        for z in (-1.16, 1.16):
            make_beam("wood", (x, 0.96, z), (x, 2.86, 0.0), 0.23, 0.23, "AFrameLeg", bevel=0.018)
            make_box("iron", (x, 0.99, z), (0.29, 0.19, 0.31), "FrameShoe")
            make_beam("darkwood", (x, 0.98, z), (x, 1.82, z * 0.48), 0.12, 0.14, "InnerBrace")
        # Lateral side outrigger buttresses from chassis rail up to A-frame waist
        make_beam("darkwood", (x * 1.24, 0.86, 0.0), (x, 2.08, 0.0), 0.13, 0.15, "SideOutrigger", bevel=0.01)
        make_box("darkwood", (x, 1.38, 0.0), (0.17, 0.17, 2.10), "FrameTie", bevel=0.01)
        make_box("darkwood", (x, 2.02, 0.0), (0.15, 0.15, 1.22), "UpperTie", bevel=0.01)
        # Heavy forged iron trunnion axle bearing block + bolts
        make_box("iron", (x, 2.81, 0.0), (0.31, 0.34, 0.32), "AxleBearing", bevel=0.014)
        make_box("gold", (x * 1.23, 2.81, 0.0), (0.05, 0.16, 0.16), "BearingCap")
        # Heraldic team shields mounted on both sides of the A-frame
        make_war_shield("team", "iron", (x * 1.28, 1.72, 0.24), "x", radius=0.33, thick=0.055, label="TrebuchetShield")

    # Heavy forged iron main throwing axle
    make_rod("iron", (-0.94, 2.80, 0.0), (0.94, 2.80, 0.0), 0.12, 0.12, "ThrowingAxle", segs=14)

    # Articulated Throwing Beam + Iron-Banded Boulder Counterweight Hopper + Sling + Loaded Stone
    # Pivot at [0, 2.8, 0]. All vertices stay strictly within radius <= 3.12 (sweptRadius <= 3.15 < 3.3)
    # and counterweight bottom stays at y >= 1.56 (min animated y >= 1.48 > 0.90).
    cur_motion = {"type": "siege", "pivot": [0, 2.8, 0], "side": 1}
    # Tapered throwing beam passing cleanly through iron pivot collar
    make_beam("wood", (0.0, 2.08, 0.82), (0.0, 4.62, -1.96), 0.22, 0.24, "ThrowingBeam", bevel=0.016)
    make_rod("iron", (-0.26, 2.80, 0.0), (0.26, 2.80, 0.0), 0.20, 0.20, "BeamCollar", segs=14)
    # Forged iron reinforcing bands along the beam + steel release prong at tip
    for t in (0.22, 0.48, 0.74, 0.95):
        bx = 0.0
        by = 2.08 + (4.62 - 2.08) * t
        bz = 0.82 + (-1.96 - 0.82) * t
        make_box("iron", (bx, by, bz), (0.25, 0.27, 0.10), "BeamBand")
    make_rod("steel", (0.0, 4.62, -1.96), (0.0, 4.80, -2.14), 0.045, 0.018, "ReleaseProng", segs=8)

    # Tapered trapezoidal timber counterweight hopper hung below short arm (y = 1.68..2.30)
    cw_stations = [
        [(-0.46, 1.68, 0.56), (0.46, 1.68, 0.56), (0.46, 1.68, 1.32), (-0.46, 1.68, 1.32)],
        [(-0.38, 2.28, 0.64), (0.38, 2.28, 0.64), (0.38, 2.28, 1.24), (-0.38, 2.28, 1.24)],
    ]
    make_loft("wood", cw_stations, "CounterweightHopper", cap_ends=True)
    for x in (-0.33, 0.0, 0.33):
        make_box("iron", (x, 1.98, 0.94), (0.065, 0.64, 0.78), "HopperStrap")
    make_box("darkwood", (0.0, 2.31, 0.94), (0.82, 0.07, 0.66), "HopperRim")
    # Hanging iron trunnion straps connecting hopper to short arm
    for x in (-0.28, 0.28):
        make_beam("iron", (x, 2.22, 0.90), (x, 2.38, 0.64), 0.06, 0.08, "HopperHanger")
    # Visible sculpted stone ballast boulders crowning the hopper
    for idx, (bx, by, bz) in enumerate([(-0.18, 2.36, 0.84), (0.16, 2.37, 0.90), (0.0, 2.39, 1.08)]):
        make_boulder("stoneDark", (bx, by, bz), (0.16, 0.12, 0.15), idx * 2.1 + 1.3, "BallastStone")

    # Twin taut sling ropes, contoured leather sling pouch, and cradled siege stone projectile
    for x in (-0.13, 0.13):
        make_rod("canvas", (x, 4.60, -1.96), (x, 4.10, -2.54), 0.025, 0.025, "SlingRope", segs=8)
    make_box("leather", (0.0, 4.06, -2.56), (0.42, 0.15, 0.42), "SlingPouch", bevel=0.035)
    make_boulder("stone", (0.0, 4.18, -2.54), (0.17, 0.16, 0.17), 7.7, "LoadedBoulder")
    cur_motion = None

    # Geared rear windlass winch with spoked handwheels & coiled rope drum
    make_rod("darkwood", (-0.90, 1.14, -1.06), (0.90, 1.14, -1.06), 0.125, 0.125, "WindlassDrum", segs=12)
    make_rod("canvas", (-0.42, 1.14, -1.06), (0.42, 1.14, -1.06), 0.15, 0.15, "WinchRopeCoil", segs=12)
    for x in (-0.98, 0.98):
        make_ring("iron", x, 1.14, -1.06, 0.34, 0.29, 0.06, "WinchWheel", segs=12)
        for i in range(4):
            a = i * math.pi * 0.5
            make_beam("darkwood", (x, 1.14, -1.06), (x, 1.14 + math.cos(a) * 0.31, -1.06 + math.sin(a) * 0.31), 0.055, 0.055, "WinchSpoke")
        make_rod("wood", (x - 0.10, 1.44, -1.06), (x + 0.10, 1.44, -1.06), 0.045, 0.045, "CrankHandle", segs=8)
    # Spare stack of 3 stone projectiles stowed neatly on the forward deck
    for idx, (bx, by, bz) in enumerate([(-0.50, 1.07, 1.04), (-0.50, 1.07, 0.72), (0.50, 1.07, 0.92)]):
        make_boulder("stone", (bx, by, bz), (0.16, 0.15, 0.16), idx * 3.1 + 0.5, "SpareAmmo")


# ==============================================================================
# 2. ULTRA-PREMIUM MEDIEVAL SHIPS: FISHING BOAT, GALLEY, WARSHIP, TRANSPORT
# ==============================================================================


def author_fishingboat():
    deck_y = make_sculpted_hull(
        length=4.9,
        beam=2.25,
        depth=1.08,
        waterline=-0.16,
        sheer_bow=0.36,
        sheer_stern=0.28,
        stern_flatness=0.62,
        clinker_wales=True,
        label="FishHull",
    )
    # Stern tiller bar mounted to rudder head
    make_beam("darkwood", (0.0, deck_y + 0.42, -2.42), (0.0, deck_y + 0.48, -1.68), 0.08, 0.08, "Tiller")

    # Aft timber-framed fisherman's cabin with pitched team-colored roof
    cab_z = -0.78
    make_box("wood", (0.0, deck_y + 0.42, cab_z), (1.28, 0.78, 1.24), "CabinWalls", bevel=0.015)
    for sx in (-0.64, 0.64):
        for sz in (-0.62, 0.62):
            make_box("darkwood", (sx, deck_y + 0.42, cab_z + sz), (0.10, 0.82, 0.10), "CabinPost")
    make_box("darkwood", (0.0, deck_y + 0.36, cab_z + 0.63), (0.42, 0.66, 0.05), "CabinDoor")
    # Pitched roof prism
    roof_y = deck_y + 0.82
    roof_stations = [
        [(-0.78, roof_y, cab_z - 0.74), (0.78, roof_y, cab_z - 0.74), (0.0, roof_y + 0.52, cab_z - 0.74)],
        [(-0.78, roof_y, cab_z + 0.74), (0.78, roof_y, cab_z + 0.74), (0.0, roof_y + 0.52, cab_z + 0.74)],
    ]
    make_loft("teamRoof", roof_stations, "CabinRoof", cap_ends=True)
    make_box("darkwood", (0.0, roof_y + 0.53, cab_z), (0.10, 0.09, 1.54), "CabinRidge")

    # Forward mast + angled fishing derrick boom + pulley + draped casting net
    make_rod("darkwood", (0.0, deck_y, 0.82), (0.0, deck_y + 2.15, 0.82), 0.075, 0.055, "FishMast", segs=10)
    make_rod("wood", (0.0, deck_y + 0.85, 0.82), (1.38, deck_y + 1.52, 0.25), 0.055, 0.038, "NetBoom", segs=8)
    make_rod("canvas", (0.0, deck_y + 2.02, 0.82), (1.32, deck_y + 1.48, 0.27), 0.018, 0.018, "BoomStay", segs=6)
    make_rod("canvas", (0.0, deck_y + 2.05, 0.82), (0.0, deck_y + 0.55, 2.38), 0.016, 0.016, "Forestay", segs=6)
    # Draped fishing net curtain hanging from boom toward the waterline
    for i in range(6):
        t = i / 5.0
        top = (0.72 + t * 0.64, deck_y + 1.18 + t * 0.30, 0.50 - t * 0.24)
        bot = (1.16 + t * 0.34, deck_y - 0.42, 0.56 - t * 0.26)
        make_rod("canvas", top, bot, 0.016, 0.016, "NetStrand", segs=6)
    make_beam("canvas", (0.76, deck_y + 0.46, 0.52), (1.44, deck_y + 0.60, 0.26), 0.03, 0.03, "NetCross")
    make_beam("canvas", (0.98, deck_y - 0.02, 0.54), (1.48, deck_y + 0.04, 0.28), 0.03, 0.03, "NetWeightLine")

    # Provision & catch barrels + fish crate + iron anchor on foredeck
    make_barrel((-0.44, deck_y, 0.36), 0.46, "FishBarrelA")
    make_barrel((-0.38, deck_y, 1.06), 0.42, "FishBarrelB")
    make_crate((0.36, deck_y, 1.28), 0.46, "CatchBox")
    make_rod("iron", (-0.54, deck_y + 0.24, 1.72), (-0.54, deck_y + 0.24, 2.16), 0.038, 0.038, "AnchorShank", segs=8)
    make_beam("iron", (-0.72, deck_y + 0.24, 2.08), (-0.36, deck_y + 0.24, 2.08), 0.05, 0.05, "AnchorFluke")


def build_rigged_mast(z_pos, deck_y, mast_h, yard_y, yard_w, sail_h, hull_half_b, herald="cross", with_crows_nest=True, nest_y=None, label="Main"):
    """Tall stepped timber mast with crow's nest, yardarm, rope rigging, animated curved
    3D billowing sail with bold team heraldry, and masthead swallowtail pennant."""
    global cur_motion
    make_rod("darkwood", (0.0, deck_y, z_pos), (0.0, deck_y + mast_h, z_pos), 0.115, 0.068, label + "Mast", segs=12, smooth=True)
    if with_crows_nest:
        ny = nest_y if nest_y is not None else deck_y + mast_h * 0.79
        make_rod("wood", (0.0, ny - 0.08, z_pos), (0.0, ny + 0.30, z_pos), 0.29, 0.38, label + "CrowsNest", segs=10)
        make_rod("darkwood", (0.0, ny + 0.28, z_pos), (0.0, ny + 0.35, z_pos), 0.40, 0.40, label + "NestRim", segs=10)
        make_rod("iron", (0.0, ny + 0.06, z_pos), (0.0, ny + 0.12, z_pos), 0.35, 0.35, label + "NestBand", segs=10)

    # Yardarm + iron mast truss
    make_rod("wood", (-yard_w * 0.52, yard_y, z_pos + 0.08), (yard_w * 0.52, yard_y, z_pos + 0.08), 0.052, 0.052, label + "Yard", segs=10)
    make_box("iron", (0.0, yard_y, z_pos + 0.04), (0.20, 0.16, 0.18), label + "MastCollar")

    # Rope shrouds & forestay/backstay rigging
    rig_top = deck_y + mast_h * 0.82
    for side in (-1.0, 1.0):
        for dz in (-0.38, 0.14):
            make_rod("canvas", (0.0, rig_top, z_pos), (side * hull_half_b * 0.88, deck_y + 0.32, z_pos + dz), 0.017, 0.017, label + "Shroud", segs=6)
    make_rod("canvas", (0.0, rig_top, z_pos), (0.0, deck_y + 0.42, z_pos + 1.85), 0.018, 0.018, label + "Forestay", segs=6)
    make_rod("canvas", (0.0, rig_top, z_pos), (0.0, deck_y + 0.42, z_pos - 1.65), 0.018, 0.018, label + "Backstay", segs=6)

    # Masthead golden finial & team pennant
    make_sphere("gold", (0.0, deck_y + mast_h + 0.06, z_pos), 0.095, label + "Finial", segs=8, rings=6)
    make_curved_sail("team", 0.92, 0.34, deck_y + mast_h - 0.34, z_pos + 0.02, belly=0.09, thickness=0.03, cols=4, rows=2, u_range=(0.5, 1.0), label=label + "Pennant")

    # Animated wind-billowed square sail + raised team heraldry strips
    cur_motion = {"type": "sail", "pivot": [0, yard_y, z_pos + 0.08], "side": 1}
    y_bot = yard_y - sail_h
    make_curved_sail("canvas", yard_w * 0.95, sail_h, y_bot, z_pos + 0.12, belly=0.46, thickness=0.048, cols=6, rows=4, label=label + "Sail")
    if herald == "cross":
        make_curved_sail("team", yard_w * 0.95, sail_h, y_bot, z_pos + 0.175, belly=0.46, thickness=0.032, cols=2, rows=4, u_range=(0.43, 0.57), v_range=(0.12, 0.88), label=label + "HeraldV")
        make_curved_sail("team", yard_w * 0.95, sail_h, y_bot, z_pos + 0.18, belly=0.46, thickness=0.032, cols=6, rows=1, u_range=(0.16, 0.84), v_range=(0.43, 0.57), label=label + "HeraldH")
    elif herald == "stripes":
        for band in ((0.18, 0.32), (0.68, 0.82)):
            make_curved_sail("team", yard_w * 0.95, sail_h, y_bot, z_pos + 0.175, belly=0.46, thickness=0.032, cols=2, rows=4, u_range=band, v_range=(0.06, 0.94), label=label + "HeraldStripe")
    else:
        make_curved_sail("team", yard_w * 0.95, sail_h, y_bot, z_pos + 0.175, belly=0.46, thickness=0.032, cols=6, rows=1, u_range=(0.10, 0.90), v_range=(0.38, 0.62), label=label + "HeraldBand")
    cur_motion = None


def author_galley():
    global cur_motion
    deck_y = make_sculpted_hull(
        length=5.6,
        beam=2.36,
        depth=1.12,
        waterline=-0.16,
        sheer_bow=0.46,
        sheer_stern=0.58,
        stern_flatness=0.46,
        clinker_wales=True,
        label="GalleyHull",
    )
    # Armored forged bronze/steel naval ramming beak at the prow
    make_rod("iron", (0.0, 0.34, 2.45), (0.0, 0.24, 3.24), 0.20, 0.045, "NavalRam", segs=8)
    make_rod("steel", (0.0, 0.27, 2.92), (0.0, 0.23, 3.30), 0.11, 0.025, "NavalRamTip", segs=8)
    make_box("gold", (0.0, 0.34, 2.52), (0.30, 0.30, 0.14), "RamCollar")

    # Raised bow fighting forecastle with timber parapet
    make_box("darkwood", (0.0, deck_y + 0.44, 1.88), (1.32, 0.42, 0.82), "ForecastleDeck", bevel=0.012)
    for side in (-1.0, 1.0):
        make_box("wood", (side * 0.64, deck_y + 0.78, 1.88), (0.10, 0.34, 0.82), "ForeParapet")
    make_box("wood", (0.0, deck_y + 0.78, 2.26), (1.36, 0.34, 0.10), "ForeFrontParapet")

    # Raised stern quarterdeck + ornate curved stern rail + brass lantern
    make_box("darkwood", (0.0, deck_y + 0.56, -2.06), (1.42, 0.62, 1.12), "QuarterDeck", bevel=0.015)
    make_box("team", (0.0, deck_y + 0.96, -2.58), (1.38, 0.24, 0.09), "SternBanner")
    make_rod("iron", (0.0, deck_y + 0.86, -2.52), (0.0, deck_y + 1.56, -2.68), 0.04, 0.04, "LanternPost", segs=8)
    make_box("gold", (0.0, deck_y + 1.62, -2.68), (0.20, 0.26, 0.20), "SternLantern", bevel=0.015)

    # Row of mounted team-colored round war shields lining both port and starboard gunwales
    for side in (-1.0, 1.0):
        for z_sh in (-1.15, -0.45, 0.25, 0.95):
            make_war_shield("team", "steel", (side * 1.16, deck_y + 0.42, z_sh), "x", radius=0.25, thick=0.045, label="GunwaleShield")

    # Rigged mainmast with billowing sail & heraldic cross
    build_rigged_mast(z_pos=0.08, deck_y=deck_y, mast_h=5.28, yard_y=deck_y + 3.92, yard_w=3.05, sail_h=2.40, hull_half_b=1.18, herald="cross", with_crows_nest=True, label="Galley")

    # 8 sculpted rowing oars (4 per side) with flat paddle blades & oarlock collars
    for side in (-1.0, 1.0):
        for z_oar in (-1.08, -0.42, 0.24, 0.90):
            pivot = [side * 0.98, deck_y + 0.22, z_oar]
            cur_motion = {"type": "oar", "pivot": pivot, "side": int(side)}
            make_rod("wood", (side * 0.84, deck_y + 0.28, z_oar), (side * 2.18, 0.28, z_oar - 0.28), 0.042, 0.032, "OarShaft", segs=8)
            make_box("wood", (side * 2.18, 0.24, z_oar - 0.30), (0.48, 0.05, 0.16), "OarBlade", rot=(0.0, -side * 0.22, -side * 0.36))
            cur_motion = None


def author_warship():
    deck_y = make_sculpted_hull(
        length=6.5,
        beam=3.15,
        depth=1.42,
        waterline=-0.16,
        sheer_bow=0.62,
        sheer_stern=0.72,
        stern_flatness=0.58,
        clinker_wales=True,
        label="GalleonHull",
    )
    # Sweeping timber bowsprit + gilded brass figurehead prow
    make_rod("darkwood", (0.0, deck_y + 0.56, 2.65), (0.0, deck_y + 1.48, 4.18), 0.11, 0.055, "Bowsprit", segs=10)
    make_rod("canvas", (0.0, deck_y + 4.85, 0.32), (0.0, deck_y + 1.38, 4.02), 0.018, 0.018, "BowspritStay", segs=6)
    make_sphere("gold", (0.0, deck_y + 0.72, 3.45), (0.16, 0.22, 0.26), "Figurehead", segs=10, rings=7)

    # Tall crenellated Forecastle
    make_box("wood", (0.0, deck_y + 0.68, 2.08), (2.10, 0.84, 1.32), "Forecastle", bevel=0.018)
    make_box("darkwood", (0.0, deck_y + 1.12, 2.08), (2.22, 0.12, 1.42), "ForecastleCap")
    for side in (-1.0, 1.0):
        for zi in (-0.42, 0.0, 0.42):
            make_box("wood", (side * 1.05, deck_y + 1.32, 2.08 + zi), (0.12, 0.32, 0.28), "ForeMerlon")
        make_war_shield("team", "gold", (side * 1.12, deck_y + 0.74, 2.08), "x", radius=0.28, thick=0.05, label="ForeShield")

    # Towering two-tier Imperial Sterncastle with gilded gallery & triple stern lanterns
    make_box("wood", (0.0, deck_y + 0.86, -2.22), (2.36, 1.18, 1.72), "SternLower", bevel=0.018)
    make_box("darkwood", (0.0, deck_y + 1.48, -2.26), (2.48, 0.12, 1.80), "SternMidTrim")
    make_box("wood", (0.0, deck_y + 1.86, -2.44), (2.06, 0.68, 1.24), "SternUpper", bevel=0.016)
    make_box("darkwood", (0.0, deck_y + 2.24, -2.44), (2.18, 0.12, 1.34), "SternTopTrim")
    # Sterncastle crenellations + team banner transom + gilded gallery windows
    for side in (-1.0, 1.0):
        for zi in (-0.42, 0.0, 0.42):
            make_box("wood", (side * 1.02, deck_y + 2.42, -2.44 + zi), (0.12, 0.28, 0.26), "SternMerlon")
        make_war_shield("team", "gold", (side * 1.24, deck_y + 0.94, -2.18), "x", radius=0.30, thick=0.05, label="SternShield")
    make_box("team", (0.0, deck_y + 1.88, -3.09), (1.88, 0.46, 0.07), "SternHeraldry")
    make_box("gold", (0.0, deck_y + 1.48, -3.14), (2.30, 0.14, 0.12), "SternGoldGallery", bevel=0.01)
    for lx in (-0.64, 0.0, 0.64):
        make_box("gold", (lx, deck_y + 2.52, -3.08), (0.20, 0.30, 0.20), "SternLantern", bevel=0.012)

    # Heavy Broadside Naval Bombard Cannons (6 broadside + 1 forward bow chaser) on gun carriages
    for side in (-1.0, 1.0):
        for z_gun in (-0.98, 0.04, 1.02):
            # Timber naval gun carriage
            make_box("darkwood", (side * 1.12, deck_y + 0.24, z_gun), (0.58, 0.30, 0.46), "GunCarriage", bevel=0.01)
            # Tapered cast-steel naval bombard barrel + reinforcing breech rings
            make_rod("steel", (side * 0.92, deck_y + 0.42, z_gun), (side * 1.98, deck_y + 0.44, z_gun), 0.145, 0.105, "CannonBarrel", segs=10, smooth=True)
            make_rod("gold", (side * 1.48, deck_y + 0.43, z_gun), (side * 1.56, deck_y + 0.43, z_gun), 0.138, 0.138, "CannonBand", segs=10)
            make_box("iron", (side * 1.54, deck_y + 0.42, z_gun), (0.08, 0.36, 0.42), "GunportFrame")
    # Forward bow chaser cannon & stacked iron shot on main deck
    make_rod("steel", (0.0, deck_y + 1.30, 2.02), (0.0, deck_y + 1.34, 2.98), 0.13, 0.095, "BowChaser", segs=10, smooth=True)
    for sx, sz in [(-0.34, 0.56), (-0.16, 0.56), (-0.25, 0.72), (-0.25, 0.62)]:
        sy = deck_y + (0.25 if sz == 0.62 else 0.11)
        make_sphere("iron", (sx, sy, sz), 0.10, "Cannonball", segs=8, rings=5)

    # Mainmast (tall, with fighting top cleanly between main sail and upper topsail) + Aft Mizzenmast
    build_rigged_mast(z_pos=0.28, deck_y=deck_y, mast_h=6.12, yard_y=deck_y + 3.86, yard_w=3.52, sail_h=2.20, hull_half_b=1.54, herald="cross", with_crows_nest=True, nest_y=deck_y + 4.02, label="GalleonMain")
    # Upper topsail on mainmast sitting cleanly above the fighting top
    global cur_motion
    cur_motion = {"type": "sail", "pivot": [0, deck_y + 5.50, 0.36], "side": 1}
    make_rod("wood", (-1.18, deck_y + 5.50, 0.36), (1.18, deck_y + 5.50, 0.36), 0.042, 0.042, "TopYard", segs=8)
    make_curved_sail("canvas", 2.20, 1.00, deck_y + 4.48, 0.40, belly=0.30, thickness=0.04, cols=5, rows=3, label="TopSail")
    make_curved_sail("team", 2.20, 1.00, deck_y + 4.48, 0.445, belly=0.30, thickness=0.025, cols=5, rows=1, u_range=(0.15, 0.85), v_range=(0.38, 0.62), label="TopHerald")
    cur_motion = None

    # Aft Mizzenmast stepped on sterncastle
    build_rigged_mast(z_pos=-2.35, deck_y=deck_y + 2.16, mast_h=2.95, yard_y=deck_y + 4.18, yard_w=2.02, sail_h=1.35, hull_half_b=1.02, herald="stripes", with_crows_nest=False, label="GalleonMizzen")


def author_transport():
    deck_y = make_sculpted_hull(
        length=5.5,
        beam=2.82,
        depth=1.22,
        waterline=-0.16,
        sheer_bow=0.38,
        sheer_stern=0.46,
        stern_flatness=0.66,
        clinker_wales=True,
        label="CogHull",
    )
    # Iron-hinged bow disembarkation ramp (brow) raised slightly at the prow
    make_box("wood", (0.0, deck_y + 0.46, 2.66), (1.28, 0.14, 0.92), "LandingRamp", rot=(-0.44, 0.0, 0.0), bevel=0.012)
    for sx in (-0.42, 0.42):
        make_box("iron", (sx, deck_y + 0.48, 2.66), (0.09, 0.17, 0.94), "RampHingeStrap", rot=(-0.44, 0.0, 0.0))
        make_rod("canvas", (sx * 1.15, deck_y + 1.12, 2.18), (sx, deck_y + 0.64, 2.98), 0.022, 0.022, "RampChain", segs=6)

    # Raised stern steerage deck with helm rail & tiller
    make_box("darkwood", (0.0, deck_y + 0.44, -2.02), (1.84, 0.56, 1.06), "SternDeck", bevel=0.014)
    make_beam("darkwood", (0.0, deck_y + 0.80, -2.54), (0.0, deck_y + 0.88, -1.78), 0.09, 0.09, "CogTiller")
    for sx in (-0.86, 0.0, 0.86):
        make_box("wood", (sx, deck_y + 0.94, -2.50), (0.10, 0.42, 0.10), "SternPostRail")
    make_box("darkwood", (0.0, deck_y + 1.14, -2.50), (1.86, 0.09, 0.10), "SternTopRail")
    make_box("team", (0.0, deck_y + 0.92, -2.54), (1.62, 0.24, 0.05), "CogSternBanner")

    # Spacious central cargo well packed with supply crates, iron-hooped barrels & troop shields
    make_crate((-0.56, deck_y, -0.96), 0.58, "CargoCrateA")
    make_crate((0.54, deck_y, -0.92), 0.54, "CargoCrateB")
    make_crate((-0.52, deck_y, 1.04), 0.54, "CargoCrateC")
    make_barrel((0.56, deck_y, 0.96), 0.48, "ProvisionBarrelA")
    make_barrel((0.52, deck_y, 1.54), 0.44, "ProvisionBarrelB")
    for side in (-1.0, 1.0):
        for z_sh in (-0.75, 0.05, 0.85):
            make_war_shield("team", "iron", (side * 1.38, deck_y + 0.44, z_sh), "x", radius=0.25, thick=0.045, label="TroopShield")

    # Central stepped mast with broad cargo sail & bold team chevron/band
    build_rigged_mast(z_pos=0.02, deck_y=deck_y, mast_h=5.20, yard_y=deck_y + 3.84, yard_w=3.20, sail_h=2.36, hull_half_b=1.38, herald="band", with_crows_nest=True, label="Cog")


# ==============================================================================
# BVH AMBIENT OCCLUSION + DEPTH VERTEX SHADING PASS
# ==============================================================================


def bake_bvh_ao(root_parts):
    """Bake real geometric BVH ambient occlusion + soft vertical warmth into BakedDepth."""
    depsgraph = bpy.context.evaluated_depsgraph_get()
    all_verts = []
    all_polys = []
    for obj in root_parts:
        eval_obj = obj.evaluated_get(depsgraph)
        mesh = eval_obj.to_mesh()
        base = len(all_verts)
        m = obj.matrix_world
        for v in mesh.vertices:
            all_verts.append(m @ v.co)
        for p in mesh.polygons:
            if len(p.vertices) >= 3:
                for k in range(1, len(p.vertices) - 1):
                    all_polys.append((base + p.vertices[0], base + p.vertices[k], base + p.vertices[k + 1]))
        eval_obj.to_mesh_clear()

    bvh = BVHTree.FromPolygons(all_verts, all_polys)
    # 12 deterministic hemisphere sample directions (Fibonacci dome)
    dirs = []
    for i in range(12):
        z = (i + 0.5) / 12.0
        r = math.sqrt(max(0.0, 1.0 - z * z))
        a = i * 2.39996323
        dirs.append(Vector((math.cos(a) * r, math.sin(a) * r, z)).normalized())

    z_min = min(v.z for v in all_verts)
    z_span = max(0.5, max(v.z for v in all_verts) - z_min)

    for obj in root_parts:
        mesh = obj.data
        colors = mesh.color_attributes.get("BakedDepth")
        if colors is None:
            colors = mesh.color_attributes.new(name="BakedDepth", type="FLOAT_COLOR", domain="POINT")
        mesh.color_attributes.active_color = colors
        m = obj.matrix_world
        nm = m.to_3x3().inverted_safe().transposed()
        for v in mesh.vertices:
            wp = m @ v.co
            wn = (nm @ v.normal).normalized()
            if wn.length < 1e-4:
                wn = Vector((0, 0, 1))
            # Build local tangent frame around wn
            up = Vector((0, 0, 1)) if abs(wn.z) < 0.92 else Vector((1, 0, 0))
            tx = wn.cross(up).normalized()
            ty = wn.cross(tx).normalized()
            occluded = 0.0
            for d in dirs:
                ray_dir = (tx * d.x + ty * d.y + wn * d.z).normalized()
                hit, _, _, dist = bvh.ray_cast(wp + wn * 0.02, ray_dir, 1.35)
                if hit is not None:
                    occluded += 1.0 - (dist / 1.35) * 0.5
            ao = 1.0 - 0.34 * (occluded / len(dirs))
            height_lift = 0.88 + 0.14 * min(1.0, max(0.0, (wp.z - z_min) / z_span))
            grain = 0.97 + 0.03 * math.sin(wp.x * 6.7 + wp.y * 4.3 + wp.z * 5.1)
            shade = min(1.04, max(0.62, ao * height_lift * grain))
            colors.data[v.index].color = (shade, shade, shade, 1.0)


BUILDERS = {
    "unit:ram": (author_ram, {"kind": "unit", "type": "ram", "articulated": True, "siegeRevision": "solid-timber-v1"}),
    "unit:catapult": (author_trebuchet, {"kind": "unit", "type": "catapult", "articulated": True, "siegeRevision": "solid-timber-v1"}),
    "unit:fishingboat": (author_fishingboat, {"kind": "unit", "type": "fishingboat", "articulated": True, "navalRevision": "carvel-timber-v1"}),
    "unit:galley": (author_galley, {"kind": "unit", "type": "galley", "articulated": True, "navalRevision": "carvel-timber-v1"}),
    "unit:warship": (author_warship, {"kind": "unit", "type": "warship", "articulated": True, "navalRevision": "carvel-timber-v1"}),
    "unit:transport": (author_transport, {"kind": "unit", "type": "transport", "articulated": True, "navalRevision": "carvel-timber-v1"}),
}

parts_by_key = {}
for key in KEYS:
    cur_root = roots[key]
    assert cur_root.matrix_local.is_identity, f"Preserve browser-space identity root for {key}"
    for obj in reversed(descendants(cur_root)[1:]):
        bpy.data.objects.remove(obj, do_unlink=True)
    cur_motion = None
    start_idx = len(parts)
    builder_fn, meta = BUILDERS[key]
    builder_fn()
    cur_root["model3d"] = meta
    parts_by_key[key] = parts[start_idx:]

bpy.context.view_layer.update()

# Verify every single generated piece is strictly watertight manifold
for obj in parts:
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    non_manifold = [e for e in bm.edges if not e.is_manifold]
    assert not non_manifold, f"Non-manifold edges ({len(non_manifold)}) in {obj.name}"
    bm.free()

# Bake BVH ambient occlusion per unit so crevices and hulls have sculpted depth
for key in KEYS:
    bake_bvh_ao(parts_by_key[key])

# Verify the other 120 models are 100% untouched
for key, digest in unchanged.items():
    assert fingerprint(roots[key]) == digest, f"Unrelated model mutated: {key}"

# Export low (clean solid geometry, bevels off) and near (bevels enabled) with IDENTICAL joined mesh names
detail_stats = {}
for detail in ("low", "near"):
    bpy.ops.object.select_all(action="DESELECT")
    for obj in parts:
        for mod in obj.modifiers:
            mod.show_viewport = mod.show_render = detail == "near"
    bpy.context.view_layer.update()
    depsgraph = bpy.context.evaluated_depsgraph_get()
    exported = []
    tris_by_key = {}
    for key in KEYS:
        root = roots[key]
        groups = {}
        for obj in parts_by_key[key]:
            m_def = json.dumps(obj["motion"].to_dict() if obj.get("motion") else None, sort_keys=True)
            groups.setdefault((obj.get("assetMaterial"), m_def), []).append(obj)
        key_tris = 0
        # Deterministic sort guarantees identical child names between low and near!
        for group_idx, ((role, definition), members) in enumerate(sorted(groups.items())):
            bpy.ops.object.select_all(action="DESELECT")
            copies = []
            for obj in members:
                mesh = bpy.data.meshes.new_from_object(
                    obj.evaluated_get(depsgraph),
                    preserve_all_data_layers=True,
                    depsgraph=depsgraph,
                )
                copy = bpy.data.objects.new(f"Craft_{key.split(':')[1]}_{role}_{group_idx}", mesh)
                bpy.context.collection.objects.link(copy)
                copy.matrix_world = obj.matrix_world.copy()
                copy.select_set(True)
                copies.append(copy)
            bpy.context.view_layer.objects.active = copies[0]
            if len(copies) > 1:
                bpy.ops.object.join()
            joined = copies[0]
            bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
            joined.name = f"Craft_{key.split(':')[1]}_{role}_{group_idx}"
            joined.parent = root
            joined["assetMaterial"] = role
            if definition != "null":
                joined["motion"] = json.loads(definition)
            key_tris += sum(max(0, len(p.vertices) - 2) for p in joined.data.polygons)
            exported.append(joined)
        tris_by_key[key] = key_tris
    detail_stats[detail] = tris_by_key
    bpy.ops.object.select_all(action="DESELECT")
    for key in KEYS:
        roots[key].select_set(True)
    for obj in exported:
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
    for obj in exported:
        bpy.data.objects.remove(obj, do_unlink=True)

for obj in parts:
    for mod in obj.modifiers:
        mod.show_viewport = mod.show_render = True
bpy.ops.wm.save_as_mainfile(filepath=str(out / "frontier-assets.blend"), compress=True)

report = {
    "passed": True,
    "models": 126,
    "unchangedOtherModels": len(unchanged),
    "closedSolidParts": len(parts),
    "keys": KEYS,
    "triangles": detail_stats,
    "sourceSHA256": hashlib.sha256(source.read_bytes()).hexdigest(),
}
(out / "authoring-validation.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
print(json.dumps(report), flush=True)
