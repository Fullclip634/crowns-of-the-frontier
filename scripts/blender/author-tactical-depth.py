"""
Blender 4.5 LTS Authoring Script — Tactical Depth 3D Models
============================================================
Generates 3 closed-manifold, vertex-AO-baked, studio-calibrated 3D models into
`frontier-tactical-depth-raw.glb` (meshopt-packed via gltfpack into
`src/assets3d/frontier-tactical-depth.glb`):

  1. building:bombard  — Imperial Bombard Cannon Bastion Tower
       Octagonal battered stone fortress tower, corner buttresses, flared
       machicolation gallery, 4 sculpted cast-iron cannons with brass hoops &
       oak carriages, gunpowder barrels, cannonball pyramid, ember braziers,
       cupola cap & heraldic war banner.
  2. unit:skirmisher   — Frontier Javelin Skirmisher
       Agile medieval skirmisher in kettle-helm & team-colored surcoat/cloak,
       round iron-rimmed wooden buckler shield with heraldic boss, back leather
       quiver with 3 spare javelins, and poised steel-tipped throwing javelin.
  3. unit:catapult     — Castle Age Torsion Mangonel
       Low-slung wheeled oak siege carriage, heavy padded stop-beam, twisted
       torsion rope skein & iron ratchet windlass, flanking heraldic plaques,
       and animated iron-bound throwing spoon arm loaded with a granite boulder.

Coordinate convention:
  Blender X  -> Three.js X
  Blender Z  -> Three.js Y (up)
  Blender -Y -> Three.js +Z (front face = -Y in Blender -> +Z in Three.js)
"""
import argparse
import json
import math
import sys
from pathlib import Path
import bpy
import bmesh
from mathutils import Euler, Matrix, Vector

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parents[1]
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from figure_rig_lib import (
    add_flowing_cape,
    add_spoked_wheel,
    add_unit_part,
    bake_figure_ao,
    load_studio_figure,
)

MAT_SPECS = {
    "stone": ((0.68, 0.66, 0.61, 1.0), 0.90, 0.0),
    "stoneDark": ((0.40, 0.42, 0.43, 1.0), 0.92, 0.0),
    "wood": ((0.52, 0.38, 0.25, 1.0), 0.88, 0.0),
    "darkwood": ((0.24, 0.17, 0.12, 1.0), 0.90, 0.0),
    "gold": ((0.86, 0.68, 0.26, 1.0), 0.38, 0.52),
    "iron": ((0.26, 0.29, 0.33, 1.0), 0.46, 0.56),
    "steel": ((0.74, 0.78, 0.82, 1.0), 0.32, 0.58),
    "glow": ((0.98, 0.48, 0.14, 1.0), 0.35, 0.0),
    "canvas": ((0.84, 0.75, 0.58, 1.0), 0.92, 0.0),
    "leather": ((0.38, 0.27, 0.19, 1.0), 0.84, 0.0),
    "pants": ((0.30, 0.34, 0.28, 1.0), 0.90, 0.0),
    "skin": ((0.82, 0.64, 0.50, 1.0), 0.82, 0.0),
    "hair": ((0.20, 0.16, 0.13, 1.0), 0.88, 0.0),
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
        mats[name] = mat
    return mats


def write_triplanar_uv(bm, scale=0.34):
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
    if len(bm.verts) == 0:
        bm.free()
        return None
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.normal_update()
    write_triplanar_uv(bm, scale=0.34)
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
            ao = clamp(0.66 + h * 0.24 + sun * 0.14, 0.50, 1.08)
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


def add_box(bm, center, size, rot=(0.0, 0.0, 0.0)):
    mat = Matrix.Translation(center) @ Euler(rot, "XYZ").to_matrix().to_4x4() @ Matrix.Diagonal((size[0], size[1], size[2], 1.0))
    bmesh.ops.create_cube(bm, size=1.0, matrix=mat)


def add_cyl(bm, p0, p1, r0, r1, segs=10):
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
        a = (2.0 * math.pi * i) / segs
        ca, sa = math.cos(a), math.sin(a)
        radial = x_dir * ca + y_dir * sa
        ring0.append(bm.verts.new(v0 + radial * r0))
        ring1.append(bm.verts.new(v1 + radial * r1))
    for i in range(segs):
        j = (i + 1) % segs
        bm.faces.new((ring0[i], ring0[j], ring1[j], ring1[i]))
    bm.faces.new(list(reversed(ring0)))
    bm.faces.new(ring1)


def add_sphere(bm, center, radii, subdiv=2):
    mat = Matrix.Translation(center) @ Matrix.Diagonal((radii[0], radii[1], radii[2], 1.0))
    bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=1.0, matrix=mat)


class PartBuilder:
    def __init__(self, root, mats, height_ref=6.0):
        self.root = root
        self.mats = mats
        self.height_ref = height_ref
        self.parts = {}

    def bm(self, role):
        if role not in self.parts:
            self.parts[role] = bmesh.new()
        return self.parts[role]

    def box(self, role, x, y, z, sx, sy, sz, rot=(0.0, 0.0, 0.0)):
        add_box(self.bm(role), (x, y, z), (sx, sy, sz), rot)

    def box_z(self, role, x, y, z0, z1, sx, sy, rot=(0.0, 0.0, 0.0)):
        add_box(self.bm(role), (x, y, (z0 + z1) * 0.5), (sx, sy, abs(z1 - z0)), rot)

    def cyl(self, role, p0, p1, r0, r1, segs=10):
        add_cyl(self.bm(role), p0, p1, r0, r1, segs=segs)

    def sphere(self, role, center, radii, subdiv=2):
        add_sphere(self.bm(role), center, radii, subdiv=subdiv)

    def finalize(self, smooth_roles=None):
        smooth_roles = set(smooth_roles or ())
        for role, bm in self.parts.items():
            finish_part(
                self.root,
                f"Part_{role}",
                bm,
                role,
                self.mats,
                height_ref=self.height_ref,
                smooth=(role in smooth_roles),
            )


# ---------------------------------------------------------------------------
# 1. IMPERIAL BOMBARD CANNON BASTION TOWER (building:bombard)
# ---------------------------------------------------------------------------
def build_bombard_tower(mats):
    root = make_root("building:bombard")
    b = PartBuilder(root, mats, height_ref=9.6)

    # Grounded battered octagonal fortress plinth (-0.48m below z=0 for uneven slopes)
    b.cyl("stoneDark", (0, 0, -0.48), (0, 0, 0.85), 2.52, 2.18, segs=8)
    b.cyl("stone", (0, 0, 0.82), (0, 0, 1.12), 2.24, 2.14, segs=8)

    # Heavy tapered octagonal main tower shaft with ashlar stone ribs
    b.cyl("stone", (0, 0, 1.08), (0, 0, 5.45), 1.98, 1.72, segs=8)
    # Dark stone mid-level girdle band & iron strapping collar
    b.cyl("stoneDark", (0, 0, 3.25), (0, 0, 3.62), 1.96, 1.94, segs=8)
    b.cyl("iron", (0, 0, 3.62), (0, 0, 3.74), 1.96, 1.96, segs=8)

    # Four massive corner diagonal stone buttresses anchoring the tower to the ground
    for i in range(4):
        a = i * math.pi * 0.5 + math.pi * 0.25
        ca, sa = math.cos(a), math.sin(a)
        b.box_z("stoneDark", ca * 1.92, sa * 1.92, -0.45, 2.95, 0.78, 0.78, rot=(0, 0, a))
        b.box_z("stone", ca * 1.82, sa * 1.82, 2.90, 4.75, 0.62, 0.62, rot=(0, 0, a))
        b.box("stoneDark", ca * 1.82, sa * 1.82, 4.84, 0.70, 0.70, 0.20, rot=(0, 0, a))

    # Recessed front oak-and-iron fortified doorway (-Y front)
    b.box_z("stoneDark", 0, -1.94, 0.0, 2.25, 1.24, 0.42)
    b.box_z("darkwood", 0, -2.02, 0.0, 1.92, 0.86, 0.22)
    for bar_x in (-0.28, 0.0, 0.28):
        b.box_z("iron", bar_x, -2.14, 0.15, 1.86, 0.06, 0.06)
    for bar_z in (0.65, 1.32):
        b.box("iron", 0, -2.14, bar_z, 0.84, 0.07, 0.07)

    # Gunpowder barrels & stacked pyramid of iron cannonballs outside the base
    for bx, by in ((-1.78, -1.35), (-1.22, -1.78)):
        b.cyl("wood", (bx, by, 0.0), (bx, by, 0.74), 0.28, 0.26, segs=8)
        b.cyl("iron", (bx, by, 0.18), (bx, by, 0.25), 0.30, 0.30, segs=8)
        b.cyl("iron", (bx, by, 0.52), (bx, by, 0.59), 0.30, 0.30, segs=8)
    # Pyramid of 4 iron cannonballs on a timber rack (+X, -Y)
    b.box_z("darkwood", 1.56, -1.52, 0.0, 0.14, 0.88, 0.88)
    for cx, cy, cz in (
        (1.36, -1.36, 0.30), (1.74, -1.36, 0.30),
        (1.55, -1.68, 0.30), (1.55, -1.48, 0.58),
    ):
        b.sphere("iron", (cx, cy, cz), (0.19, 0.19, 0.19), subdiv=1)

    # Cantilevered Machicolation Corbel Ring & Cannon Gallery Deck (z = 5.35..6.45)
    for i in range(8):
        a = i * math.pi * 0.25 + math.pi * 0.125
        ca, sa = math.cos(a), math.sin(a)
        b.box("stoneDark", ca * 1.86, sa * 1.86, 5.45, 0.42, 0.62, 0.68, rot=(0, 0, a))
    b.cyl("stoneDark", (0, 0, 5.72), (0, 0, 6.26), 2.15, 2.36, segs=8)
    b.cyl("iron", (0, 0, 6.24), (0, 0, 6.38), 2.40, 2.40, segs=8)
    b.cyl("gold", (0, 0, 6.38), (0, 0, 6.49), 2.38, 2.38, segs=8)

    # Cannon Gallery Parapet Merlons (8 corner merlons framing 4 cardinal gun embrasures!)
    for i in range(4):
        a = i * math.pi * 0.5 + math.pi * 0.25
        ca, sa = math.cos(a), math.sin(a)
        b.box_z("stone", ca * 2.02, sa * 2.02, 6.45, 7.62, 0.96, 0.52, rot=(0, 0, a + math.pi * 0.5))
        b.box("stoneDark", ca * 2.02, sa * 2.02, 7.68, 1.04, 0.60, 0.14, rot=(0, 0, a + math.pi * 0.5))
        # Glowing iron ember brazier on alternating diagonal parapets
        if i % 2 == 0:
            b.cyl("iron", (ca * 2.04, sa * 2.04, 7.72), (ca * 2.04, sa * 2.04, 8.04), 0.18, 0.28, segs=7)
            b.sphere("glow", (ca * 2.04, sa * 2.04, 8.10), (0.20, 0.20, 0.18), subdiv=1)

    # Four Heavy Sculpted Cast-Iron Bombards (Cannons) on Cardinal Embrasures!
    for i in range(4):
        a = i * math.pi * 0.5
        dx, dy = math.sin(a), -math.cos(a)
        px, py = math.cos(a), math.sin(a)
        # Bolted oak gun-carriage cheeks sitting on gallery deck
        for side in (-0.28, 0.28):
            cx = dx * 1.48 + px * side
            cy = dy * 1.48 + py * side
            b.box("darkwood", cx, cy, 6.72, 0.18, 1.15, 0.42, rot=(0, 0, a))
        # Tapered cast-iron cannon barrel aimed slightly upward (+4 deg)
        p_breech = (dx * 0.95, dy * 0.95, 6.94)
        p_muzzle = (dx * 2.86, dy * 2.86, 7.06)
        b.cyl("iron", p_breech, p_muzzle, 0.30, 0.22, segs=12)
        # Cascabel iron breech knob
        b.sphere("iron", (dx * 0.80, dy * 0.80, 6.93), (0.20, 0.20, 0.20), subdiv=1)
        # Flared muzzle bell & 3 brass/gold reinforcing hoops
        for frac, rad in ((0.28, 0.31), (0.62, 0.27), (0.94, 0.27)):
            rx0 = dx * (0.95 + (2.86 - 0.95) * (frac - 0.04))
            ry0 = dy * (0.95 + (2.86 - 0.95) * (frac - 0.04))
            rz0 = 6.94 + 0.12 * (frac - 0.04)
            rx1 = dx * (0.95 + (2.86 - 0.95) * (frac + 0.04))
            ry1 = dy * (0.95 + (2.86 - 0.95) * (frac + 0.04))
            rz1 = 6.94 + 0.12 * (frac + 0.04)
            b.cyl("gold", (rx0, ry0, rz0), (rx1, ry1, rz1), rad, rad, segs=12)

    # Central Armored Gunner Cupola, Team Roof Spire & War Banner
    b.cyl("stoneDark", (0, 0, 6.45), (0, 0, 7.75), 1.24, 1.14, segs=8)
    b.cyl("teamRoof", (0, 0, 7.68), (0, 0, 9.15), 1.48, 0.16, segs=8)
    b.sphere("gold", (0, 0, 9.24), (0.24, 0.24, 0.24), subdiv=1)
    # Tall iron flagpole + fluttering team war banner
    b.cyl("iron", (0, 0, 9.25), (0, 0, 10.65), 0.055, 0.04, segs=6)
    b.box("team", 0.0, 0.56, 10.18, 0.09, 1.12, 0.58)
    # Hanging heraldic tower banner beneath front cannon embrasure (-Y)
    b.box("wood", 0, -2.02, 5.12, 0.92, 0.10, 0.10)
    b.box("team", 0, -2.04, 4.38, 0.76, 0.08, 1.38)
    b.box("gold", 0, -2.07, 4.42, 0.34, 0.06, 0.34)

    b.finalize(smooth_roles={"iron", "gold", "glow", "teamRoof"})
    return root


# ---------------------------------------------------------------------------
# 2. FRONTIER JAVELIN SKIRMISHER (unit:skirmisher) — FULL STUDIO ARTICULATION
# ---------------------------------------------------------------------------
def build_unit_skirmisher(mats):
    """
    Built on top of the studio-sculpted `unit:archer` skeleton from
    `art/figures/frontier-figures.blend` so walking strides, 2-bone terrain foot
    IK, idle breathing, cape flutter, and overhand javelin throws are 100% native!
    """
    col = bpy.context.scene.collection
    root, anc, j = load_studio_figure(
        PROJECT_ROOT,
        src_unit_type="archer",
        new_asset_key="unit:skirmisher",
        mats=mats,
        col=col,
        strip_suffixes=("_Figure19", "_Figure20", "_Figure21", "_Figure22", "_Figure6"),
        replace_horse_legs=False,
    )
    hr, hl, hc, fwd, prefix = anc["hr"], anc["hl"], anc["hc"], anc["fwd"], anc["prefix"]
    back = -fwd
    created = []

    def make_gear(suffix, role, motion_dict, fn, smooth=False):
        bm = bmesh.new()
        fn(bm)
        obj = add_unit_part(root, col, f"{prefix}_{suffix}", bm, role, mats, motion_dict, smooth=smooth)
        if obj is not None:
            created.append(obj)

    # A. CLASSIC MEDIEVAL STEEL KETTLE-HELM (Head)
    hz = hc.z + 0.10
    def build_kettle_steel(bm):
        # Domed crown skull + broad protective sloping kettle brim!
        add_sphere(bm, (0.0, hc.y, hz + 0.06), (0.19, 0.20, 0.17), subdiv=2)
        add_cyl(bm, (0.0, hc.y, hz - 0.03), (0.0, hc.y, hz + 0.07), 0.31, 0.21, segs=14)
        add_cyl(bm, (0.0, hc.y, hz + 0.05), (0.0, hc.y, hz + 0.14), 0.20, 0.16, segs=12)
    make_gear("KettleHelm", "steel", j["head"], build_kettle_steel, smooth=True)

    def build_kettle_trim(bm):
        add_cyl(bm, (0.0, hc.y, hz + 0.05), (0.0, hc.y, hz + 0.085), 0.215, 0.215, segs=14)
        add_sphere(bm, (0.0, hc.y, hz + 0.235), (0.048, 0.048, 0.056), subdiv=1)
    make_gear("KettleFinial", "gold", j["head"], build_kettle_trim, smooth=True)

    # B. REINFORCED LEATHER GAMBESON SHOULDER GUARDS & CHEST BALDRIC (Arms & Torso)
    for side, m_arm, tag in ((-1, j["arm_l"], "L"), (1, j["arm_r"], "R")):
        def build_shoulder(bm, s=side):
            add_sphere(bm, (s * 0.36, 0.0, 1.94), (0.14, 0.14, 0.11), subdiv=2)
        make_gear(f"ShoulderGuard{tag}", "leather", m_arm, build_shoulder, smooth=True)

    def build_baldric(bm):
        # Cross-chest leather quiver strap + brass buckle
        add_cyl(bm, (-0.20, fwd * 0.19, 1.88), (0.22, fwd * 0.19, 1.38), 0.042, 0.042, segs=6)
        add_cyl(bm, (-0.20, back * 0.18, 1.88), (0.20, back * 0.18, 1.38), 0.042, 0.042, segs=6)
    make_gear("QuiverBaldric", "leather", j["torso"], build_baldric)

    # C. BACK LEATHER JAVELIN QUIVER WITH 3 SPARE THROWING JAVELINS (Torso)
    def build_quiver(bm):
        add_cyl(bm, (-0.16, back * 0.23, 1.26), (0.14, back * 0.25, 1.86), 0.10, 0.115, segs=9)
    make_gear("JavelinQuiver", "leather", j["torso"], build_quiver, smooth=True)

    def build_spare_shafts(bm):
        for ox, oz in ((-0.045, 0.0), (0.015, 0.03), (0.075, -0.02)):
            add_cyl(bm, (0.09 + ox, back * 0.25, 1.78 + oz), (0.24 + ox, back * 0.28, 2.24 + oz), 0.019, 0.017, segs=6)
    make_gear("SpareJavelinShafts", "wood", j["torso"], build_spare_shafts)

    def build_spare_tips(bm):
        for ox, oz in ((-0.045, 0.0), (0.015, 0.03), (0.075, -0.02)):
            add_cyl(bm, (0.24 + ox, back * 0.28, 2.24 + oz), (0.29 + ox, back * 0.29, 2.42 + oz), 0.036, 0.005, segs=4)
    make_gear("SpareJavelinTips", "steel", j["torso"], build_spare_tips)

    # D. FLOWING WIND-RIPPLED SKIRMISHER HALF-CLOAK (Cape)
    cape = add_flowing_cape(
        root, col, f"{prefix}_SkirmisherCape", "team", mats, j["cape"],
        z_top=1.96, length=0.88, width_top=0.52, width_flare=0.20, fwd_sign=fwd,
    )
    if cape is not None:
        created.append(cape)

    # E. ROUND IRON-RIMMED WOODEN BUCKLER SHIELD ON LEFT FOREARM (side = -1)
    # Mounted cleanly on the outer-front side of Left Hand `hl` so it swings naturally while running & braces forward in combat!
    sh_cx = hl.x - 0.08
    sh_cy = hl.y + fwd * 0.14
    sh_cz = hl.z + 0.06
    # Shield normal angled slightly forward-left
    sh_n = Vector((-0.42, fwd * 0.90, 0.06)).normalized()

    def build_buckler_wood(bm):
        add_cyl(bm, Vector((sh_cx, sh_cy, sh_cz)) - sh_n * 0.03, Vector((sh_cx, sh_cy, sh_cz)) + sh_n * 0.03, 0.39, 0.38, segs=16)
    make_gear("BucklerWood", "wood", j["fore_l"], build_buckler_wood)

    def build_buckler_iron(bm):
        add_cyl(bm, Vector((sh_cx, sh_cy, sh_cz)) - sh_n * 0.02, Vector((sh_cx, sh_cy, sh_cz)) + sh_n * 0.035, 0.425, 0.415, segs=16)
    make_gear("BucklerRim", "iron", j["fore_l"], build_buckler_iron, smooth=True)

    def build_buckler_team(bm):
        add_cyl(bm, Vector((sh_cx, sh_cy, sh_cz)) + sh_n * 0.025, Vector((sh_cx, sh_cy, sh_cz)) + sh_n * 0.052, 0.30, 0.29, segs=14)
    make_gear("BucklerFace", "team", j["fore_l"], build_buckler_team)

    def build_buckler_boss(bm):
        add_sphere(bm, Vector((sh_cx, sh_cy, sh_cz)) + sh_n * 0.062, (0.095, 0.095, 0.095), subdiv=2)
    make_gear("BucklerBoss", "gold", j["fore_l"], build_buckler_boss, smooth=True)

    # F. POISED STEEL-TIPPED THROWING JAVELIN IN RIGHT HAND (side = +1)
    # Bold 2.25m medieval javelin oriented forward-up (+12 deg pitch) through Right Hand `hr`
    # so both walking trot AND the overhand throw silhouette read unmistakably from RTS height!
    j_dir = Vector((0.0, fwd * 0.978, 0.208)).normalized()
    j_hand = Vector((hr.x + 0.02, hr.y, hr.z + 0.01))
    j_butt = j_hand - j_dir * 0.88
    j_neck = j_hand + j_dir * 1.18
    j_tip = j_hand + j_dir * 1.62

    def build_jav_shaft(bm):
        add_cyl(bm, j_butt, j_neck, 0.032, 0.027, segs=7)
    make_gear("JavelinShaft", "wood", j["fore_r"], build_jav_shaft)

    def build_jav_grip(bm):
        add_cyl(bm, j_hand - j_dir * 0.16, j_hand + j_dir * 0.16, 0.042, 0.042, segs=7)
    make_gear("JavelinGrip", "leather", j["fore_r"], build_jav_grip)

    def build_jav_tip(bm):
        add_cyl(bm, j_neck, j_tip, 0.068, 0.008, segs=4)
    make_gear("JavelinHead", "steel", j["fore_r"], build_jav_tip)

    # Bake genuine Blender BVH hemisphere raycast Vertex AO over all custom Skirmisher gear!
    bpy.context.view_layer.update()
    bake_figure_ao(root, created)
    return root


# ---------------------------------------------------------------------------
# 3. CASTLE AGE TORSION MANGONEL (unit:catapult) — ROTATING WHEELS + THROW ARM
# ---------------------------------------------------------------------------
def build_unit_mangonel(mats):
    col = bpy.context.scene.collection
    root = make_root("unit:catapult")
    root["model3d"] = {"kind": "unit", "type": "catapult", "articulated": True, "siegeRevision": "mangonel-v2"}
    body = bpy.data.objects.new("Body", None)
    body["assetBody"] = True
    col.objects.link(body)
    body.parent = root

    b = PartBuilder(body, mats, height_ref=3.2)
    wheel_objs = []

    # Heavy low-slung bolted oak chassis (2.1m wide x 3.1m long)
    for si, sx in enumerate((-0.96, 0.96)):
        b.box("wood", sx, 0.0, 0.56, 0.28, 3.05, 0.30)
        b.box("iron", sx, -1.32, 0.56, 0.32, 0.16, 0.34)
        b.box("iron", sx, 1.32, 0.56, 0.32, 0.16, 0.34)
        # Diagonal reinforcement knees up to the front padded stop-frame
        b.cyl("wood", (sx, 0.85, 0.62), (sx, -0.42, 2.10), 0.13, 0.12, segs=7)
        b.cyl("wood", (sx, -1.20, 0.62), (sx, -0.42, 2.10), 0.13, 0.12, segs=7)
        b.box_z("darkwood", sx, -0.42, 0.58, 2.22, 0.24, 0.24)
        # Side heraldic faction shield plaque bolted to frame
        b.box("team", sx + (0.16 if sx > 0 else -0.16), 0.12, 0.86, 0.07, 1.05, 0.44)
        b.box("gold", sx + (0.19 if sx > 0 else -0.19), 0.12, 0.86, 0.04, 0.24, 0.24)

        # 4 massive ROTATING spoked iron-rimmed wooden siege wheels grounded at z = 0!
        for wi, wy in enumerate((-1.05, 1.05)):
            wx0 = sx + (0.04 if sx > 0 else -0.04)
            wx1 = sx + (0.28 if sx > 0 else -0.28)
            wheel_objs.extend(
                add_spoked_wheel(body, col, f"MangonelWheel_{si}_{wi}", mats, wx0, wx1, wy, 0.48, 0.49, spokes=6)
            )

    # Transverse axles, decking & thick heavy padded crossbar stop-beam
    for cy in (-1.05, 0.0, 1.05):
        b.box("darkwood", 0, cy, 0.48, 2.25, 0.22, 0.20)
    b.box("wood", 0, 0.05, 0.72, 1.72, 2.55, 0.12)
    b.box("wood", 0, -0.42, 2.12, 2.26, 0.30, 0.32)
    # Leather/canvas rope impact bumper pad wrapped around center of stop-beam
    b.box("canvas", 0, -0.34, 2.12, 0.72, 0.38, 0.40)
    b.box("iron", -0.46, -0.42, 2.12, 0.10, 0.34, 0.36)
    b.box("iron", 0.46, -0.42, 2.12, 0.10, 0.34, 0.36)

    # Thick twisted torsion rope skein across lower pivot + rear iron windlass winch
    b.cyl("canvas", (-0.98, 0.22, 0.96), (0.98, 0.22, 0.96), 0.24, 0.24, segs=10)
    b.cyl("iron", (-1.10, 1.24, 1.05), (1.10, 1.24, 1.05), 0.10, 0.10, segs=8)
    for sx in (-1.06, 1.06):
        b.cyl("darkwood", (sx, 1.24, 0.70), (sx, 1.24, 1.40), 0.09, 0.09, segs=6)

    # Reserve granite boulders stacked in front ammo tray
    for bx, by in ((-0.38, -1.15), (0.38, -1.15), (0.0, -1.28)):
        b.sphere("stoneDark", (bx, by, 0.96), (0.24, 0.22, 0.20), subdiv=1)

    b.finalize(smooth_roles={"iron", "canvas"})

    # Animated Mangonel Throwing Arm + Iron-Strapped Wooden Spoon Bucket + Granite Boulder!
    arm_grp = bpy.data.objects.new("MangonelArm", None)
    arm_grp.location = (0.0, 0.22, 0.96)
    col.objects.link(arm_grp)
    arm_grp.parent = body

    bm_wd, bm_ir, bm_st = bmesh.new(), bmesh.new(), bmesh.new()
    # Heavy beam cocked backward (+Y) ready to snap forward against stop-beam (-Y)
    add_cyl(bm_wd, (0, 0.0, 0.0), (0, 1.65, 1.42), 0.16, 0.11, segs=8)
    # Iron reinforcing rings on arm + deep iron-strapped wooden throwing cup
    add_box(bm_wd, (0, 1.72, 1.48), (0.68, 0.72, 0.28), rot=(0.58, 0, 0))
    add_box(bm_ir, (0, 1.72, 1.48), (0.74, 0.76, 0.10), rot=(0.58, 0, 0))
    add_box(bm_ir, (0, 0.85, 0.74), (0.28, 0.20, 0.28), rot=(0.58, 0, 0))
    # Chiseled heavy granite boulder seated right inside the Mangonel spoon cup!
    add_sphere(bm_st, (0, 1.68, 1.74), (0.34, 0.32, 0.30), subdiv=1)

    motion_extra = {"motion": {"type": "siegearm", "pivot": [0, 0.96, -0.22], "side": 1}}
    finish_part(arm_grp, "ArmBeam", bm_wd, "wood", mats, height_ref=3.0, extra=motion_extra)
    finish_part(arm_grp, "ArmIron", bm_ir, "iron", mats, height_ref=3.0, extra=motion_extra)
    finish_part(arm_grp, "ArmBoulder", bm_st, "stone", mats, height_ref=3.0, extra=motion_extra)

    bpy.context.view_layer.update()
    bake_figure_ao(root, wheel_objs)
    return root


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True)
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    args = parser.parse_args(argv)

    out_dir = Path(args.output)
    out_dir.mkdir(parents=True, exist_ok=True)

    clear_scene()
    mats = ensure_materials()

    roots = [
        build_bombard_tower(mats),
        build_unit_skirmisher(mats),
        build_unit_mangonel(mats),
    ]
    for r in roots:
        r.location = (0.0, 0.0, 0.0)

    raw_glb = out_dir / "frontier-tactical-depth-raw.glb"
    bpy.ops.export_scene.gltf(
        filepath=str(raw_glb),
        export_format="GLB",
        export_extras=True,
        export_yup=True,
        export_apply=True,
        export_normals=True,
        export_texcoords=True,
        export_vertex_color="ACTIVE",
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
