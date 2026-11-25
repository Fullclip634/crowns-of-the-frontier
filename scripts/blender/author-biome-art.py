"""Author realistic Age of Empires-grade terrain formations in Blender 4.5 LTS.

Produces strictly closed 2-manifold meshes with outward normals, UVs, and baked
ambient-occlusion + biome top-cap vertex colors:
  - cliff:meadow, cliff:arid, cliff:volcanic        (existing ambient rock outcrops)
  - cliffwall:meadow, cliffwall:arid, cliffwall:volcanic, cliffwall:snow
      (tall sheer stratified AoE-style impassable stone cliff escarpments with mossy/capped plateau tops)
  - mountain:meadow, mountain:volcanic, mountain:snow
      (towering multi-spire jagged mountain crags anchoring natural passes & valley walls)
  - bush:meadow, bush:arid, bush:snow
      (sculpted multi-lobed medieval woodland shrub & hedgerow clusters)
  - ruin:meadow, ruin:arid, ruin:snow, ruin:volcanic
      (crumbling weathered medieval stone archways & broken watchtower masonry with mossy/capped crevices)
  - waystone:meadow, waystone:arid, waystone:snow, waystone:volcanic
      (carved medieval roadside mile-markers & ancient border standing stones)
  - fallenlog:meadow, fallenlog:snow
      (moss-covered fallen ancient woodland timber trunks with broken roots & knots)
  - spire:meadow, spire:arid, spire:snow, spire:volcanic
      (weathered standing dolmens, desert sandstone hoodoos, alpine crags & dark basalt spires)
  - tree:volcanic:{0..3}:{near,far}                 (existing charred volcanic snags)
"""
import argparse
import json
import math
import os
import random
import sys
import bpy
import bmesh
from mathutils import Euler, Matrix, Vector


def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def make_material(name, rgba, roughness=0.88, metallic=0.0, use_vc=False):
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    bsdf = nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = rgba
        bsdf.inputs["Roughness"].default_value = roughness
        bsdf.inputs["Metallic"].default_value = metallic
        if use_vc:
            vc_node = nodes.new("ShaderNodeVertexColor")
            vc_node.layer_name = "Color"
            links.new(vc_node.outputs["Color"], bsdf.inputs["Base Color"])
    return mat


def add_uv_only(bm, uv_scale=0.28):
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


def finalize_mesh(bm, name, mat, color_fn, uv_scale=0.28, smooth=False):
    """Writes clean triplanar UVs and Blender 4.5 LTS FLOAT_COLOR CORNER vertex colors."""
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.normal_update()
    add_uv_only(bm, uv_scale=uv_scale)
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
            colors.data[li].color = (
                max(0.0, min(1.0, c[0])),
                max(0.0, min(1.0, c[1])),
                max(0.0, min(1.0, c[2])),
                1.0,
            )

    mesh.materials.append(mat)
    return mesh


def add_uv_and_vc(bm, color_fn):
    """Legacy wrapper retained for volcanic snags that use bmesh before finalize."""
    add_uv_only(bm, uv_scale=0.35)


def slice_plane(v, normal, limit, strength):
    d = v.dot(normal)
    if d <= limit:
        return v
    return v - normal * ((d - limit) * strength)


def build_cliff_mesh(name, style, seed, mat):
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=2, radius=0.68)

    if style == "meadow":
        planes = [
            (Vector((0.76, -0.48, 0.44)).normalized(), 0.28, 0.90),
            (Vector((-0.66, 0.52, 0.54)).normalized(), 0.29, 0.88),
            (Vector((0.20, 0.86, 0.46)).normalized(), 0.30, 0.86),
            (Vector((-0.42, -0.82, 0.38)).normalized(), 0.31, 0.86),
            (Vector((0.10, 0.18, 0.98)).normalized(), 0.34, 0.92),
        ]
    elif style == "arid":
        planes = [
            (Vector((0.0, 0.0, 1.0)), 0.24, 0.97),
            (Vector((0.84, 0.42, 0.34)).normalized(), 0.32, 0.92),
            (Vector((-0.80, -0.48, 0.36)).normalized(), 0.30, 0.92),
            (Vector((0.35, -0.88, 0.32)).normalized(), 0.31, 0.90),
            (Vector((-0.38, 0.86, 0.33)).normalized(), 0.32, 0.90),
        ]
    else:
        planes = [
            (Vector((0.88, 0.32, 0.35)).normalized(), 0.24, 0.96),
            (Vector((-0.78, 0.56, 0.28)).normalized(), 0.25, 0.95),
            (Vector((0.18, -0.92, 0.35)).normalized(), 0.24, 0.96),
            (Vector((-0.54, -0.68, 0.49)).normalized(), 0.26, 0.94),
            (Vector((0.34, 0.48, 0.81)).normalized(), 0.32, 0.92),
            (Vector((-0.26, 0.14, 0.95)).normalized(), 0.36, 0.90),
        ]

    for vert in bm.verts:
        p = vert.co.copy()
        n1 = math.sin(p.x * 91.3 + p.y * 57.1 + p.z * 113.7 + seed) * 0.5 + 0.5
        n2 = math.cos(p.x * 137.5 - p.y * 83.9 + p.z * 71.3 + seed * 1.7) * 0.5 + 0.5
        for pn, lim, st in planes:
            p = slice_plane(p, pn, lim, st)
        if style == "arid":
            z_step = math.floor(p.z * 6.5) / 6.5
            p.z = p.z * 0.58 + z_step * 0.42
            strata = 1.0 + math.tanh(math.sin(p.z * 19.0 + p.x * 1.6) * 3.0) * 0.14
            flare = 1.38 if p.z < 0.0 else (1.06 - p.z * 0.32)
            p.x *= (0.94 + n1 * 0.20) * strata * flare
            p.y *= (0.94 + n2 * 0.20) * strata * flare
            p.z *= 0.78
        elif style == "volcanic":
            strata = 1.0 + math.sin(p.z * 11.0 + p.x * 5.2 - p.y * 4.7) * 0.12
            flare = 1.28 if p.z < 0.0 else (1.0 - p.z * 0.36)
            p.x *= (0.86 + n1 * 0.26) * strata * flare
            p.y *= (0.86 + n2 * 0.26) * strata * flare
            p.z *= 1.04 + (n1 - 0.5) * 0.16
        else:
            if p.z > 0.18:
                p.z = 0.18 + (p.z - 0.18) * 0.36 + p.x * 0.09
            strata = 1.0 + math.tanh(math.sin(p.z * 14.5 + p.x * 2.5 - p.y * 1.8) * 2.8) * 0.12
            flare = 1.32 if p.z < 0.0 else (1.0 - p.z * 0.26)
            p.x *= (0.88 + n1 * 0.24) * strata * flare
            p.y *= (0.88 + n2 * 0.24) * strata * flare
            p.z *= 0.86
        vert.co = p

    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.normal_update()

    def cliff_vc(co, n):
        up = max(0.0, min(1.0, n.z * 0.5 + 0.5))
        h = max(0.0, min(1.0, (co.z + 0.55) / 1.05))
        ao = 0.74 + 0.26 * (up * 0.55 + h * 0.45)
        if style == "arid":
            band = 0.92 + 0.12 * math.sin(co.z * 21.0 + co.x * 1.8)
            return (ao * band * 1.04, ao * band * 0.96, ao * band * 0.88)
        if style == "volcanic":
            return (ao * 0.92, ao * 0.90, ao * 0.91)
        return (ao * 1.01, ao * 1.02, ao * 0.98)

    mesh = finalize_mesh(bm, name, mat, cliff_vc, uv_scale=0.36)
    obj = bpy.data.objects.new(name, mesh)
    obj["assetKey"] = name
    obj["assetMaterial"] = "rock"
    return obj


def add_stratified_rock_block(bm, center, rx, ry, height, rings, sides, seed, flat_top=True, taper_top=0.72):
    """Creates a strictly closed 2-manifold AoE:DE vertical striated rock escarpment / sweeping mountain ridge."""
    ring_verts = []
    for r_idx in range(rings):
        t = r_idx / max(1, rings - 1)
        z = -0.35 + t * (height + 0.35)
        if flat_top:
            # Classic AoE:DE terraced cliff escarpment: broad grounded foot -> vertical fluted basalt face -> crisp grassy plateau!
            if t < 0.16:
                profile = 1.24 - (t / 0.16) * 0.22
            elif t < 0.88:
                shelf = math.tanh(math.sin(t * math.pi * 4.0 + seed) * 2.2) * 0.038
                profile = 1.02 - (t - 0.16) * (1.02 - taper_top) * 0.72 + shelf
            else:
                profile = taper_top * (1.0 - (t - 0.88) * 0.28)
        else:
            # Sweeping curved alpine peak with natural buttress slopes (NEVER a harsh jagged pyramid cone!)
            curve = math.pow(1.0 - t, 0.78)
            profile = max(0.06, taper_top * 0.45 + curve * (1.28 - taper_top * 0.45))
        verts = []
        for s in range(sides):
            ang = (s / sides) * math.tau
            if flat_top:
                # Subtle vertical columnar basalt fluting + organic horizontal rim curve (no spiky zigzags!)
                crag = 0.91 + 0.11 * math.sin(ang * 4.0 + seed * 1.3) + 0.06 * math.cos(ang * 7.0 - seed * 0.9)
            else:
                # Sweeping natural mountain ridgelines (3–4 major radiating buttress ridges!)
                ridge = 0.86 + 0.20 * math.pow(math.sin(ang * 2.0 + seed) * 0.5 + 0.5, 1.3) + 0.10 * math.cos(ang * 5.0 - seed * 1.1) * (1.0 - t * 0.4)
                crag = ridge
            px = center.x + math.cos(ang) * rx * profile * crag
            py = center.y + math.sin(ang) * ry * profile * crag
            pz = center.z + z + (0.0 if r_idx == 0 else (0.10 if not flat_top else 0.05) * math.sin(ang * 2.0 + seed) * t)
            verts.append(bm.verts.new(Vector((px, py, pz))))
        ring_verts.append(verts)

    bot_center = bm.verts.new(Vector((center.x, center.y, center.z - 0.38)))
    for s in range(sides):
        sn = (s + 1) % sides
        bm.faces.new((ring_verts[0][sn], ring_verts[0][s], bot_center))

    for i in range(rings - 1):
        r0, r1 = ring_verts[i], ring_verts[i + 1]
        for s in range(sides):
            sn = (s + 1) % sides
            bm.faces.new((r0[s], r0[sn], r1[sn], r1[s]))

    top_z = center.z + height + (0.03 if flat_top else 0.26)
    top_center = bm.verts.new(Vector((center.x, center.y, top_z)))
    top_ring = ring_verts[-1]
    for s in range(sides):
        sn = (s + 1) % sides
        bm.faces.new((top_ring[s], top_ring[sn], top_center))


def build_cliffwall_mesh(name, style, seed, mat):
    """Builds an AoE:DE vertical striated stone cliff ledge with lush overhanging grass plateau top."""
    bm = bmesh.new()
    # Broad interlocking vertical striated cliff ledges (all flat grassy plateaus, zero pointy spikes!)
    add_stratified_rock_block(bm, Vector((0.0, 0.0, 0.0)), rx=1.62, ry=1.18, height=3.05, rings=8, sides=16, seed=seed, flat_top=True, taper_top=0.84)
    add_stratified_rock_block(bm, Vector((-1.20, 0.12, 0.0)), rx=1.02, ry=0.92, height=2.55, rings=7, sides=14, seed=seed + 17, flat_top=True, taper_top=0.82)
    add_stratified_rock_block(bm, Vector((1.22, -0.10, 0.0)), rx=1.04, ry=0.90, height=2.68, rings=7, sides=14, seed=seed + 31, flat_top=True, taper_top=0.82)
    # Soft stepped lower rocky apron (flat-topped terraced shelf, never harsh triangular spikes!)
    add_stratified_rock_block(bm, Vector((-0.55, -0.82, 0.0)), rx=0.74, ry=0.58, height=0.88, rings=5, sides=10, seed=seed + 47, flat_top=True, taper_top=0.72)
    add_stratified_rock_block(bm, Vector((0.68, 0.76, 0.0)), rx=0.70, ry=0.55, height=0.82, rings=5, sides=10, seed=seed + 63, flat_top=True, taper_top=0.72)

    def wall_vc(co, n):
        h = max(0.0, min(1.0, co.z / 3.10))
        ao = 0.64 + 0.36 * (h * 0.62 + max(0.0, n.z) * 0.38)
        strata = 0.90 + 0.14 * math.sin(co.z * 8.2 + co.x * 1.15)
        top_cap = max(0.0, min(1.0, (n.z - 0.44) / 0.26)) * (1.0 if co.z > 0.72 else 0.0)
        foot_moss = max(0.0, min(1.0, (0.30 - h) * 3.0)) * max(0.0, n.z * 0.7 + 0.3)

        if style == "volcanic":
            rock = (0.54 * ao * strata, 0.50 * ao * strata, 0.48 * ao * strata)
            cap = (0.64 * ao, 0.58 * ao, 0.52 * ao)
            return (rock[0]*(1-top_cap)+cap[0]*top_cap, rock[1]*(1-top_cap)+cap[1]*top_cap, rock[2]*(1-top_cap)+cap[2]*top_cap)
        if style == "arid":
            rock = (1.00 * ao * strata, 0.84 * ao * strata, 0.62 * ao * strata)
            cap = (1.00 * ao, 0.90 * ao, 0.66 * ao)
            return (rock[0]*(1-top_cap)+cap[0]*top_cap, rock[1]*(1-top_cap)+cap[1]*top_cap, rock[2]*(1-top_cap)+cap[2]*top_cap)
        if style == "snow":
            rock = (0.78 * ao * strata, 0.84 * ao * strata, 0.92 * ao * strata)
            cap = (0.99 * ao, 1.00 * ao, 1.00 * ao)
            return (rock[0]*(1-top_cap)+cap[0]*top_cap, rock[1]*(1-top_cap)+cap[1]*top_cap, rock[2]*(1-top_cap)+cap[2]*top_cap)

        # Sunlit warm limestone/granite vertical strata + vibrant AoE:DE emerald meadow grass turf top!
        rock = (0.94 * ao * strata, 0.90 * ao * strata, 0.82 * ao * strata)
        cap = (0.58 * ao, 0.94 * ao, 0.34 * ao)
        m = max(top_cap, foot_moss * 0.60)
        return (
            rock[0] * (1.0 - m) + cap[0] * m,
            rock[1] * (1.0 - m) + cap[1] * m,
            rock[2] * (1.0 - m) + cap[2] * m,
        )

    mesh = finalize_mesh(bm, name, mat, wall_vc, uv_scale=0.22, smooth=False)
    obj = bpy.data.objects.new(name, mesh)
    obj["assetKey"] = name
    obj["assetMaterial"] = "rock"
    return obj


def build_cliffcap_mesh(name, style, seed, mat):
    """Builds a smooth, overhanging lush grass/snow/sand turf cap matching cliffwall plateaus 1:1
    so cliff tops render in vivid natural biome colors without brown rock texture muddying them!"""
    bm = bmesh.new()
    shelves = [
        (Vector((0.0, 0.0, 2.94)), 1.38, 1.02, 0.28, 16, seed),
        (Vector((-1.20, 0.12, 2.45)), 0.88, 0.78, 0.24, 14, seed + 17),
        (Vector((1.22, -0.10, 2.58)), 0.90, 0.77, 0.24, 14, seed + 31),
    ]
    for center, rx, ry, thick, sides, sd in shelves:
        bot_ring, mid_ring, top_ring = [], [], []
        for s in range(sides):
            ang = (s / sides) * math.tau
            crag = 0.92 + 0.11 * math.sin(ang * 4.0 + sd * 1.3) + 0.06 * math.cos(ang * 7.0 - sd * 0.9)
            lip = 1.03 + 0.05 * math.sin(ang * 6.0 + sd)
            dx, dy = math.cos(ang) * rx * crag, math.sin(ang) * ry * crag
            bot_ring.append(bm.verts.new(Vector((center.x + dx * 0.94, center.y + dy * 0.94, center.z - 0.10))))
            mid_ring.append(bm.verts.new(Vector((center.x + dx * lip, center.y + dy * lip, center.z + thick * 0.42))))
            top_ring.append(bm.verts.new(Vector((center.x + dx * 0.86, center.y + dy * 0.86, center.z + thick))))
        bot_c = bm.verts.new(Vector((center.x, center.y, center.z - 0.10)))
        top_c = bm.verts.new(Vector((center.x, center.y, center.z + thick + 0.06)))
        for s in range(sides):
            sn = (s + 1) % sides
            bm.faces.new((bot_ring[sn], bot_ring[s], bot_c))
            bm.faces.new((bot_ring[s], bot_ring[sn], mid_ring[sn], mid_ring[s]))
            bm.faces.new((mid_ring[s], mid_ring[sn], top_ring[sn], top_ring[s]))
            bm.faces.new((top_ring[s], top_ring[sn], top_c))

    def cap_vc(co, n):
        sun = max(0.0, min(1.0, n.z * 0.35 + 0.65))
        dapple = 0.92 + 0.12 * math.sin(co.x * 2.8 + co.y * 2.4 + seed)
        # Neutral-warm AO multiplier so Poly Haven grass/snow/sand textures blend 1:1 with terrain!
        if style == "snow":
            return (0.94 * sun, 0.96 * sun, 0.99 * sun)
        if style == "arid":
            return (0.96 * sun * dapple, 0.88 * sun * dapple, 0.72 * sun * dapple)
        return (0.86 * sun * dapple, 0.94 * sun * dapple, 0.78 * sun * dapple)

    mesh = finalize_mesh(bm, name, mat, cap_vc, uv_scale=0.32, smooth=True)
    obj = bpy.data.objects.new(name, mesh)
    obj["assetKey"] = name
    obj["assetMaterial"] = "bush"
    return obj


def build_mountain_mesh(name, style, seed, mat):
    """Builds a sweeping AoE:DE sunlit alpine mountain massif with sculpted ridges and grassy foothills."""
    bm = bmesh.new()
    # Smooth sweeping central alpine peak + interlocking warm-granite side ridges + grassy shoulders
    add_stratified_rock_block(bm, Vector((0.0, 0.0, 0.0)), rx=2.05, ry=1.82, height=5.4, rings=10, sides=16, seed=seed, flat_top=False, taper_top=0.14)
    add_stratified_rock_block(bm, Vector((-1.25, 0.58, 0.0)), rx=1.42, ry=1.24, height=3.8, rings=8, sides=14, seed=seed + 23, flat_top=False, taper_top=0.18)
    add_stratified_rock_block(bm, Vector((1.22, -0.52, 0.0)), rx=1.40, ry=1.22, height=3.4, rings=8, sides=14, seed=seed + 41, flat_top=False, taper_top=0.20)
    add_stratified_rock_block(bm, Vector((0.18, 1.24, 0.0)), rx=1.22, ry=1.00, height=2.05, rings=6, sides=12, seed=seed + 59, flat_top=True, taper_top=0.72)
    add_stratified_rock_block(bm, Vector((-0.34, -1.24, 0.0)), rx=1.18, ry=0.96, height=1.80, rings=6, sides=12, seed=seed + 71, flat_top=True, taper_top=0.74)

    def mtn_vc(co, n):
        h = max(0.0, min(1.0, co.z / 5.4))
        ao = 0.62 + 0.38 * (h * 0.68 + max(0.0, n.z) * 0.32)
        strata = 0.90 + 0.14 * math.sin(co.z * 5.2 - co.x * 0.85)
        if style == "volcanic":
            return (0.50 * ao * strata, 0.46 * ao * strata, 0.45 * ao * strata)
        if style == "snow":
            snow = max(0.0, min(1.0, (h - 0.28) * 2.1 + max(0.0, n.z - 0.34)))
            r = 0.74 * ao * strata * (1.0 - snow) + 0.99 * ao * snow
            g = 0.80 * ao * strata * (1.0 - snow) + 1.00 * ao * snow
            b = 0.88 * ao * strata * (1.0 - snow) + 1.00 * ao * snow
            return (r, g, b)
        # Warm AoE:DE sunlit tan-grey granite ridges + rich emerald grassy foothills + pale alpine crest!
        moss = max(0.0, min(1.0, (0.44 - h) * 2.6)) * max(0.0, n.z * 0.82 + 0.18)
        peak = max(0.0, min(1.0, (h - 0.66) * 2.5)) * max(0.0, n.z * 0.62 + 0.38)
        base_r, base_g, base_b = 0.94 * ao * strata, 0.89 * ao * strata, 0.81 * ao * strata
        r = base_r * (1.0 - moss) + 0.54 * ao * moss
        g = base_g * (1.0 - moss) + 0.88 * ao * moss
        b = base_b * (1.0 - moss) + 0.34 * ao * moss
        r = r * (1.0 - peak) + 0.98 * ao * peak
        g = g * (1.0 - peak) + 0.98 * ao * peak
        b = b * (1.0 - peak) + 0.95 * ao * peak
        return (r, g, b)

    mesh = finalize_mesh(bm, name, mat, mtn_vc, uv_scale=0.18, smooth=True)
    obj = bpy.data.objects.new(name, mesh)
    obj["assetKey"] = name
    obj["assetMaterial"] = "rock"
    return obj


def build_bush_mesh(name, style, seed, mat):
    """Builds a realistic crisp-faceted woodland fern & leafy bramble tuft (zero spherical bubbles!)."""
    bm = bmesh.new()
    rng = random.Random(seed * 313 + 17)

    def add_frond(angle, length, width, arch_h, pitch, offset_x=0.0, offset_y=0.0, base_z=-0.04):
        """Creates a strictly closed 2-manifold tapered arching botanical frond blade."""
        ca, sa = math.cos(angle), math.sin(angle)
        tx, ty = -sa, ca
        segs = 4
        rings = []
        for s in range(segs):
            t = s / (segs - 1)
            r = t * length
            z = base_z + math.sin(t * math.pi * 0.82) * arch_h + t * pitch
            # Tapered lance-leaf profile: narrow stem -> broad leafy mid-blade -> crisp point
            w = width * (0.18 if s == 0 else (1.0 if s == 1 else (0.68 if s == 2 else 0.08)))
            thick = 0.028 * (1.0 - t * 0.65)
            cx = offset_x + ca * r
            cy = offset_y + sa * r
            v_l = bm.verts.new(Vector((cx - tx * w, cy - ty * w, z - thick * 0.35)))
            v_t = bm.verts.new(Vector((cx, cy, z + thick)))
            v_r = bm.verts.new(Vector((cx + tx * w, cy + ty * w, z - thick * 0.35)))
            v_b = bm.verts.new(Vector((cx, cy, z - thick)))
            rings.append((v_l, v_t, v_r, v_b))
        for i in range(segs - 1):
            a0, a1, a2, a3 = rings[i]
            b0, b1, b2, b3 = rings[i + 1]
            bm.faces.new((a0, a1, b1, b0))
            bm.faces.new((a1, a2, b2, b1))
            bm.faces.new((a2, a3, b3, b2))
            bm.faces.new((a3, a0, b0, b3))
        # Cap stem base & frond tip so geometry is 100% closed manifold
        bm.faces.new((rings[0][3], rings[0][2], rings[0][1], rings[0][0]))
        bm.faces.new((rings[-1][0], rings[-1][1], rings[-1][2], rings[-1][3]))

    # Outer ring of low arching fern & bramble fronds radiating naturally around dark woodland core
    outer_n = 11
    for i in range(outer_n):
        ang = (i / outer_n) * math.tau + rng.uniform(-0.18, 0.18)
        ox = math.cos(ang) * rng.uniform(0.04, 0.14)
        oy = math.sin(ang) * rng.uniform(0.04, 0.14)
        add_frond(
            angle=ang,
            length=rng.uniform(0.68, 0.96),
            width=rng.uniform(0.16, 0.23),
            arch_h=rng.uniform(0.28, 0.44),
            pitch=rng.uniform(0.04, 0.16),
            offset_x=ox,
            offset_y=oy,
        )

    # Mid-tier rising woodland foliage fronds (gives natural crisp silhouette like pine branches!)
    mid_n = 8
    for i in range(mid_n):
        ang = ((i + 0.5) / mid_n) * math.tau + rng.uniform(-0.20, 0.20)
        add_frond(
            angle=ang,
            length=rng.uniform(0.46, 0.68),
            width=rng.uniform(0.14, 0.20),
            arch_h=rng.uniform(0.36, 0.56),
            pitch=rng.uniform(0.22, 0.36),
            offset_x=rng.uniform(-0.08, 0.08),
            offset_y=rng.uniform(-0.08, 0.08),
            base_z=0.02,
        )

    # Inner upright shoots
    for i in range(4):
        ang = (i / 4.0) * math.tau + rng.uniform(-0.25, 0.25)
        add_frond(
            angle=ang,
            length=rng.uniform(0.30, 0.44),
            width=rng.uniform(0.11, 0.15),
            arch_h=rng.uniform(0.44, 0.62),
            pitch=rng.uniform(0.38, 0.52),
            base_z=0.06,
        )

    def bush_vc(co, n):
        r = math.hypot(co.x, co.y)
        h = max(0.0, min(1.0, co.z / 0.78))
        tip = max(0.0, min(1.0, r / 0.85))
        sun = max(0.0, min(1.0, n.z * 0.48 + 0.52))
        # Deep grounded woodland interior shadow -> rich organic sunlit leaf tips (calibrated linear RGB!)
        ao = 0.32 + 0.68 * (h * 0.48 + tip * 0.26 + sun * 0.26)
        dapple = 0.86 + 0.22 * math.sin(co.x * 7.8 - co.y * 6.5 + seed)
        if style == "snow":
            frost = max(0.0, min(1.0, (n.z - 0.32) * 1.35)) * (0.45 + 0.55 * h)
            r_c = 0.06 * ao * dapple * (1.0 - frost) + 0.66 * ao * frost
            g_c = 0.13 * ao * dapple * (1.0 - frost) + 0.74 * ao * frost
            b_c = 0.08 * ao * dapple * (1.0 - frost) + 0.80 * ao * frost
            return (r_c, g_c, b_c)
        if style == "arid":
            return (0.16 * ao * dapple, 0.19 * ao * dapple, 0.07 * ao * dapple)
        # Authentic deep forest-olive & warm fern-green linear RGB matching our pine trees & grass!
        return (0.075 * ao * dapple, 0.165 * ao * dapple, 0.042 * ao * dapple)

    mesh = finalize_mesh(bm, name, mat, bush_vc, uv_scale=0.55, smooth=False)
    obj = bpy.data.objects.new(name, mesh)
    obj["assetKey"] = name
    obj["assetMaterial"] = "bush"
    return obj


def add_weathered_block(bm, center, sx, sy, sz, rot_x=0.0, rot_y=0.0, rot_z=0.0, chip=0.045, seed=0):
    """Creates a strictly closed 2-manifold chamfered/weathered stone masonry block."""
    ret = bmesh.ops.create_cube(bm, size=1.0)
    verts = ret["verts"]
    sub = bmesh.ops.subdivide_edges(bm, edges=list({e for v in verts for e in v.link_edges}), cuts=1, use_grid_fill=True)
    block_verts = {v for v in verts if v.is_valid}
    for g in sub["geom"]:
        if isinstance(g, bmesh.types.BMVert) and g.is_valid:
            block_verts.add(g)
    rot = Euler((rot_x, rot_y, rot_z), "XYZ").to_matrix()
    for v in block_verts:
        p = v.co.copy()
        # Subtle medieval chisel bevel + weathered edge chipping
        edge_pull = 1.0 - 0.06 * (abs(p.x) * abs(p.y) + abs(p.y) * abs(p.z) + abs(p.x) * abs(p.z))
        p.x *= sx * edge_pull
        p.y *= sy * edge_pull
        p.z *= sz * edge_pull
        n1 = math.sin(p.x * 13.7 + p.y * 19.3 + p.z * 11.1 + seed)
        n2 = math.cos(p.x * 17.1 - p.y * 12.9 + p.z * 23.7 + seed * 1.4)
        p.x += n1 * chip
        p.y += n2 * chip
        p.z += (n1 - n2) * chip * 0.55
        v.co = (rot @ p) + center


def build_ruin_mesh(name, style, seed, mat):
    """Builds a grounded, realistic crumbling medieval stone archway & broken masonry ruin."""
    bm = bmesh.new()
    # Grounded foundation plinth extending below z=0 so it never floats on slopes
    add_weathered_block(bm, Vector((0.0, 0.0, -0.06)), 3.25, 1.38, 0.56, chip=0.05, seed=seed + 1)
    add_weathered_block(bm, Vector((-0.96, 0.02, 0.24)), 1.02, 1.04, 0.34, rot_z=0.04, chip=0.04, seed=seed + 2)
    add_weathered_block(bm, Vector((0.98, -0.03, 0.22)), 0.98, 1.00, 0.32, rot_z=-0.05, chip=0.04, seed=seed + 3)

    # Tall left ashlar masonry pier (weathered stacked courses)
    add_weathered_block(bm, Vector((-0.98, 0.0, 0.72)), 0.82, 0.80, 0.66, rot_z=0.02, chip=0.045, seed=seed + 5)
    add_weathered_block(bm, Vector((-0.96, -0.02, 1.34)), 0.78, 0.76, 0.64, rot_z=-0.03, chip=0.045, seed=seed + 7)
    add_weathered_block(bm, Vector((-0.93, 0.01, 1.94)), 0.74, 0.72, 0.58, rot_y=0.04, chip=0.05, seed=seed + 11)
    # Moulded stone impost cap + partial broken Gothic arch voussoirs curving rightward
    add_weathered_block(bm, Vector((-0.90, 0.0, 2.28)), 0.86, 0.80, 0.22, rot_y=0.05, chip=0.035, seed=seed + 13)
    add_weathered_block(bm, Vector((-0.56, 0.0, 2.58)), 0.66, 0.64, 0.44, rot_y=0.38, chip=0.045, seed=seed + 17)
    add_weathered_block(bm, Vector((-0.08, -0.02, 2.74)), 0.62, 0.60, 0.42, rot_y=0.14, chip=0.055, seed=seed + 19)
    # Flanking broken low curtain wall wing extending left
    add_weathered_block(bm, Vector((-1.62, 0.06, 0.56)), 0.72, 0.62, 0.88, rot_z=0.12, chip=0.05, seed=seed + 23)
    add_weathered_block(bm, Vector((-1.68, 0.08, 1.12)), 0.56, 0.54, 0.44, rot_z=0.16, rot_y=-0.12, chip=0.055, seed=seed + 29)

    # Shorter broken right pier (collapsed halfway up)
    add_weathered_block(bm, Vector((0.98, -0.02, 0.68)), 0.80, 0.78, 0.64, rot_z=-0.04, chip=0.045, seed=seed + 31)
    add_weathered_block(bm, Vector((0.95, 0.01, 1.24)), 0.74, 0.72, 0.54, rot_y=-0.08, rot_z=-0.05, chip=0.05, seed=seed + 37)
    add_weathered_block(bm, Vector((1.02, -0.05, 1.62)), 0.52, 0.54, 0.36, rot_y=-0.22, rot_x=0.10, chip=0.05, seed=seed + 41)

    # Fallen dressed masonry rubble blocks resting naturally around the breach
    add_weathered_block(bm, Vector((0.36, 0.52, 0.16)), 0.58, 0.44, 0.36, rot_x=0.18, rot_y=-0.28, rot_z=0.52, chip=0.04, seed=seed + 43)
    add_weathered_block(bm, Vector((0.72, -0.66, 0.14)), 0.52, 0.48, 0.32, rot_x=-0.16, rot_y=0.22, rot_z=-0.74, chip=0.04, seed=seed + 47)
    add_weathered_block(bm, Vector((-0.34, -0.62, 0.12)), 0.46, 0.40, 0.28, rot_x=0.24, rot_y=0.15, rot_z=0.35, chip=0.035, seed=seed + 53)

    def ruin_vc(co, n):
        h = max(0.0, min(1.0, (co.z + 0.15) / 2.95))
        ao = 0.52 + 0.48 * (h * 0.58 + max(0.0, n.z) * 0.42)
        course = 0.88 + 0.14 * math.sin(co.z * 11.5 + co.x * 2.4)
        top_ledge = max(0.0, min(1.0, (n.z - 0.55) / 0.35))
        base_damp = max(0.0, min(1.0, (0.34 - h) * 2.8))
        if style == "arid":
            stone = (0.94 * ao * course, 0.79 * ao * course, 0.59 * ao * course)
            dust = (0.98 * ao, 0.87 * ao, 0.66 * ao)
            m = max(top_ledge * 0.45, base_damp * 0.50)
            return tuple(stone[i] * (1.0 - m) + dust[i] * m for i in range(3))
        if style == "snow":
            stone = (0.70 * ao * course, 0.74 * ao * course, 0.80 * ao * course)
            snow = (0.97 * ao, 0.99 * ao, 1.00 * ao)
            m = top_ledge * 0.85
            return tuple(stone[i] * (1.0 - m) + snow[i] * m for i in range(3))
        if style == "volcanic":
            stone = (0.44 * ao * course, 0.41 * ao * course, 0.40 * ao * course)
            ash = (0.56 * ao, 0.50 * ao, 0.46 * ao)
            m = max(top_ledge * 0.35, base_damp * 0.40)
            return tuple(stone[i] * (1.0 - m) + ash[i] * m for i in range(3))
        # Weathered medieval limestone/granite with rich organic moss on base & broken ledges
        stone = (0.82 * ao * course, 0.80 * ao * course, 0.74 * ao * course)
        moss = (0.38 * ao, 0.62 * ao, 0.30 * ao)
        m = max(top_ledge * 0.62, base_damp * 0.58 * max(0.0, n.z * 0.6 + 0.4))
        return tuple(stone[i] * (1.0 - m) + moss[i] * m for i in range(3))

    mesh = finalize_mesh(bm, name, mat, ruin_vc, uv_scale=0.32)
    obj = bpy.data.objects.new(name, mesh)
    obj["assetKey"] = name
    obj["assetMaterial"] = "rock"
    return obj


def build_waystone_mesh(name, style, seed, mat):
    """Builds a medieval roadside stone mile-marker / ancient carved frontier waystone."""
    bm = bmesh.new()
    # Grounded stepped base plinth (extends down to z=-0.30)
    add_weathered_block(bm, Vector((0.0, 0.0, -0.04)), 1.08, 1.04, 0.52, rot_z=0.10, chip=0.035, seed=seed + 1)
    add_weathered_block(bm, Vector((0.0, 0.0, 0.30)), 0.82, 0.78, 0.24, rot_z=0.04, chip=0.025, seed=seed + 2)
    # Tapered carved standing obelisk/mile-marker shaft
    add_stratified_rock_block(bm, Vector((0.0, 0.0, 0.36)), rx=0.33, ry=0.25, height=1.56, rings=7, sides=8, seed=seed + 5, flat_top=False, taper_top=0.58)
    # Moulded stone crown cap slightly tilted with age
    add_weathered_block(bm, Vector((0.0, 0.0, 1.48)), 0.54, 0.44, 0.16, rot_x=0.04, rot_y=-0.05, chip=0.02, seed=seed + 9)
    # Leaning cobble boulders anchoring the foot into the road verge
    add_stratified_rock_block(bm, Vector((0.46, 0.24, -0.05)), rx=0.32, ry=0.28, height=0.46, rings=4, sides=7, seed=seed + 13, flat_top=False, taper_top=0.48)
    add_stratified_rock_block(bm, Vector((-0.44, -0.22, -0.06)), rx=0.26, ry=0.24, height=0.36, rings=4, sides=7, seed=seed + 17, flat_top=False, taper_top=0.50)

    def ws_vc(co, n):
        h = max(0.0, min(1.0, (co.z + 0.15) / 2.15))
        ao = 0.54 + 0.46 * (h * 0.62 + max(0.0, n.z) * 0.38)
        grain = 0.90 + 0.12 * math.sin(co.z * 14.0 + co.x * 5.0)
        cap = max(0.0, min(1.0, (n.z - 0.55) / 0.35))
        base = max(0.0, min(1.0, (0.30 - h) * 3.0))
        if style == "arid":
            return (0.94 * ao * grain, 0.80 * ao * grain, 0.58 * ao * grain)
        if style == "snow":
            stone = (0.72 * ao * grain, 0.77 * ao * grain, 0.84 * ao * grain)
            snow = (0.97 * ao, 0.99 * ao, 1.00 * ao)
            m = cap * 0.82
            return tuple(stone[i] * (1.0 - m) + snow[i] * m for i in range(3))
        if style == "volcanic":
            return (0.45 * ao * grain, 0.42 * ao * grain, 0.41 * ao * grain)
        stone = (0.83 * ao * grain, 0.81 * ao * grain, 0.75 * ao * grain)
        moss = (0.38 * ao, 0.60 * ao, 0.29 * ao)
        m = max(base * 0.62, cap * 0.42)
        return tuple(stone[i] * (1.0 - m) + moss[i] * m for i in range(3))

    mesh = finalize_mesh(bm, name, mat, ws_vc, uv_scale=0.40)
    obj = bpy.data.objects.new(name, mesh)
    obj["assetKey"] = name
    obj["assetMaterial"] = "rock"
    return obj


def build_fallen_log_mesh(name, style, seed, mat):
    """Builds a realistic mossy fallen ancient woodland trunk with broken roots & stubs."""
    bm = bmesh.new()
    # Main slightly arched timber trunk resting naturally on the forest floor
    trunk_pts = [
        Vector((-1.75, -0.08, 0.16)),
        Vector((-0.95, 0.04, 0.24)),
        Vector((0.0, 0.06, 0.22)),
        Vector((0.92, -0.03, 0.18)),
        Vector((1.72, -0.10, 0.10)),
    ]
    trunk_rads = [0.36, 0.30, 0.27, 0.23, 0.16]
    add_closed_tapered_limb(bm, trunk_pts, trunk_rads, sides=9)

    # Flared upturned roots at the base end
    add_closed_tapered_limb(bm, [Vector((-1.62, -0.06, 0.18)), Vector((-1.96, 0.36, 0.36)), Vector((-2.14, 0.56, 0.24))], [0.16, 0.11, 0.05], sides=6)
    add_closed_tapered_limb(bm, [Vector((-1.64, -0.08, 0.14)), Vector((-2.02, -0.34, 0.06)), Vector((-2.18, -0.52, -0.12))], [0.17, 0.11, 0.05], sides=6)
    # Two broken gnarled side branch stubs
    add_closed_tapered_limb(bm, [Vector((-0.25, 0.06, 0.26)), Vector((-0.04, 0.44, 0.52)), Vector((0.14, 0.62, 0.62))], [0.13, 0.09, 0.04], sides=6)
    add_closed_tapered_limb(bm, [Vector((0.68, -0.02, 0.20)), Vector((0.96, -0.36, 0.38))], [0.11, 0.05], sides=5)

    def log_vc(co, n):
        up = max(0.0, min(1.0, n.z))
        h = max(0.0, min(1.0, (co.z + 0.10) / 0.72))
        ao = 0.42 + 0.58 * (h * 0.55 + up * 0.45)
        bark_grain = 0.84 + 0.20 * math.sin(co.x * 5.2 + co.y * 19.0 + seed)
        bark = (0.36 * ao * bark_grain, 0.27 * ao * bark_grain, 0.19 * ao * bark_grain)
        top_cover = max(0.0, min(1.0, (up - 0.48) / 0.38)) * (0.65 + 0.35 * math.sin(co.x * 2.8 + seed))
        if style == "snow":
            snow = (0.94 * ao, 0.97 * ao, 1.00 * ao)
            return tuple(bark[i] * (1.0 - top_cover * 0.85) + snow[i] * (top_cover * 0.85) for i in range(3))
        moss = (0.28 * ao, 0.50 * ao, 0.20 * ao)
        return tuple(bark[i] * (1.0 - top_cover * 0.72) + moss[i] * (top_cover * 0.72) for i in range(3))

    mesh = finalize_mesh(bm, name, mat, log_vc, uv_scale=0.45)
    obj = bpy.data.objects.new(name, mesh)
    obj["assetKey"] = name
    obj["assetMaterial"] = "bush"
    return obj


def build_spire_mesh(name, style, seed, mat):
    """Builds a biome-specific natural stone landmark (volcanic basalt columns, desert hoodoo, alpine crag, or ancient dolmen)."""
    bm = bmesh.new()
    if style == "volcanic":
        # Clustered jagged hexagonal obsidian/basalt volcanic spires
        add_stratified_rock_block(bm, Vector((0.0, 0.0, 0.0)), rx=0.66, ry=0.62, height=3.15, rings=7, sides=6, seed=seed + 1, flat_top=False, taper_top=0.34)
        add_stratified_rock_block(bm, Vector((-0.68, 0.24, 0.0)), rx=0.48, ry=0.46, height=2.15, rings=6, sides=6, seed=seed + 5, flat_top=False, taper_top=0.42)
        add_stratified_rock_block(bm, Vector((0.64, -0.26, 0.0)), rx=0.46, ry=0.44, height=1.75, rings=6, sides=6, seed=seed + 9, flat_top=False, taper_top=0.46)
        add_stratified_rock_block(bm, Vector((0.12, 0.68, 0.0)), rx=0.42, ry=0.38, height=1.22, rings=5, sides=6, seed=seed + 13, flat_top=True, taper_top=0.68)
    elif style == "arid":
        # Sun-carved wind-layered sandstone desert hoodoo pillar + flanking talus
        add_stratified_rock_block(bm, Vector((0.0, 0.0, 0.0)), rx=0.78, ry=0.68, height=2.75, rings=8, sides=10, seed=seed + 1, flat_top=True, taper_top=0.84)
        add_stratified_rock_block(bm, Vector((-0.72, 0.16, 0.0)), rx=0.52, ry=0.48, height=1.35, rings=6, sides=8, seed=seed + 7, flat_top=True, taper_top=0.72)
        add_stratified_rock_block(bm, Vector((0.68, -0.28, 0.0)), rx=0.44, ry=0.40, height=0.92, rings=5, sides=8, seed=seed + 11, flat_top=False, taper_top=0.56)
    elif style == "snow":
        # Jagged frost-sheathed alpine granite crag monolith
        add_stratified_rock_block(bm, Vector((0.0, 0.0, 0.0)), rx=0.74, ry=0.64, height=2.95, rings=7, sides=9, seed=seed + 1, flat_top=False, taper_top=0.28)
        add_stratified_rock_block(bm, Vector((-0.66, -0.22, 0.0)), rx=0.54, ry=0.48, height=1.65, rings=6, sides=8, seed=seed + 5, flat_top=False, taper_top=0.40)
        add_stratified_rock_block(bm, Vector((0.58, 0.34, 0.0)), rx=0.46, ry=0.42, height=1.25, rings=5, sides=8, seed=seed + 9, flat_top=False, taper_top=0.48)
    else:
        # Ancient weathered mossy Celtic/medieval standing stones & capstone dolmen cluster
        add_stratified_rock_block(bm, Vector((-0.56, 0.04, 0.0)), rx=0.40, ry=0.34, height=1.72, rings=6, sides=8, seed=seed + 1, flat_top=True, taper_top=0.76)
        add_stratified_rock_block(bm, Vector((0.58, -0.06, 0.0)), rx=0.38, ry=0.34, height=1.58, rings=6, sides=8, seed=seed + 5, flat_top=True, taper_top=0.74)
        add_weathered_block(bm, Vector((0.02, 0.0, 1.84)), 1.92, 0.96, 0.42, rot_x=0.06, rot_y=-0.08, rot_z=0.05, chip=0.065, seed=seed + 9)
        add_stratified_rock_block(bm, Vector((0.18, 0.72, -0.05)), rx=0.38, ry=0.32, height=0.54, rings=4, sides=7, seed=seed + 13, flat_top=False, taper_top=0.52)

    def spire_vc(co, n):
        h = max(0.0, min(1.0, (co.z + 0.2) / 3.2))
        ao = 0.50 + 0.50 * (h * 0.65 + max(0.0, n.z) * 0.35)
        strata = 0.86 + 0.16 * math.sin(co.z * 8.4 + co.x * 1.9)
        top_cap = max(0.0, min(1.0, (n.z - 0.50) / 0.34))
        if style == "volcanic":
            # Dark charcoal basalt with faint warm scorched mineral veining near the lower crevices
            heat = max(0.0, min(1.0, (0.26 - h) * 3.5)) * (1.0 - max(0.0, n.z))
            return (
                0.38 * ao * strata + 0.42 * heat,
                0.36 * ao * strata + 0.14 * heat,
                0.37 * ao * strata + 0.04 * heat,
            )
        if style == "arid":
            return (0.96 * ao * strata, 0.78 * ao * strata, 0.55 * ao * strata)
        if style == "snow":
            rock = (0.68 * ao * strata, 0.75 * ao * strata, 0.84 * ao * strata)
            snow = (0.97 * ao, 0.99 * ao, 1.00 * ao)
            m = top_cap * 0.88
            return tuple(rock[i] * (1.0 - m) + snow[i] * m for i in range(3))
        rock = (0.80 * ao * strata, 0.80 * ao * strata, 0.75 * ao * strata)
        moss = (0.40 * ao, 0.66 * ao, 0.30 * ao)
        m = max(top_cap * 0.68, max(0.0, (0.30 - h) * 2.5) * 0.45)
        return tuple(rock[i] * (1.0 - m) + moss[i] * m for i in range(3))

    mesh = finalize_mesh(bm, name, mat, spire_vc, uv_scale=0.26)
    obj = bpy.data.objects.new(name, mesh)
    obj["assetKey"] = name
    obj["assetMaterial"] = "rock"
    return obj


def add_closed_tapered_limb(bm, points, radii, sides):
    """Build a strictly closed 2-manifold gnarled branch tube along 3D points."""
    rings = []
    n_pts = len(points)
    for idx, (pt, rad) in enumerate(zip(points, radii)):
        if idx == 0:
            tangent = (points[1] - points[0]).normalized()
        elif idx == n_pts - 1:
            tangent = (points[-1] - points[-2]).normalized()
        else:
            tangent = (points[idx + 1] - points[idx - 1]).normalized()
        ref = Vector((0.0, 0.0, 1.0)) if abs(tangent.z) < 0.92 else Vector((1.0, 0.0, 0.0))
        right = tangent.cross(ref).normalized()
        fwd = right.cross(tangent).normalized()
        ring = []
        for s in range(sides):
            ang = (s / sides) * math.tau
            flute = 1.0 + (0.12 * math.sin(ang * 3.0 + idx) if idx <= 1 and rad > 0.12 else 0.0)
            offset = (right * math.cos(ang) + fwd * math.sin(ang)) * (rad * flute)
            ring.append(bm.verts.new(pt + offset))
        rings.append(ring)

    bm.faces.new(list(reversed(rings[0])))
    for i in range(n_pts - 1):
        r0, r1 = rings[i], rings[i + 1]
        for s in range(sides):
            sn = (s + 1) % sides
            bm.faces.new((r0[s], r0[sn], r1[sn], r1[s]))
    tip_pt = points[-1] + (points[-1] - points[-2]).normalized() * max(0.05, radii[-1] * 1.4)
    apex = bm.verts.new(tip_pt)
    top_ring = rings[-1]
    for s in range(sides):
        sn = (s + 1) % sides
        bm.faces.new((top_ring[s], top_ring[sn], apex))


def build_volcanic_tree(variant, far, trunk_mat, ember_mat):
    rng = random.Random(9001 + variant * 733)
    key = f"tree:volcanic:{variant}:{'far' if far else 'near'}"
    root = bpy.data.objects.new(key, None)
    root["assetKey"] = key
    root["foliageSpecies"] = "volcanic snag"

    bm_bark = bmesh.new()
    trunk_h = 4.6 + (variant % 3) * 0.65
    base_r = 0.36 + (variant % 2) * 0.06
    sides = 5 if far else 7
    lean_x = (rng.random() - 0.5) * 0.42
    lean_y = (rng.random() - 0.5) * 0.42

    trunk_pts = [
        Vector((0.0, 0.0, -0.08)),
        Vector((lean_x * 0.25, lean_y * 0.25, trunk_h * 0.28)),
        Vector((lean_x * 0.68, lean_y * 0.55, trunk_h * 0.58)),
        Vector((lean_x * 1.05, lean_y * 0.92, trunk_h * 0.84)),
        Vector((lean_x * 1.22, lean_y * 1.10, trunk_h)),
    ]
    trunk_rads = [base_r * 1.24, base_r * 0.88, base_r * 0.62, base_r * 0.36, base_r * 0.14]
    add_closed_tapered_limb(bm_bark, trunk_pts, trunk_rads, sides)

    root_count = 3 if far else 4
    for r_idx in range(root_count):
        ang = (r_idx / root_count) * math.tau + variant * 0.7 + (rng.random() - 0.5) * 0.35
        dx, dy = math.cos(ang), math.sin(ang)
        r_pts = [
            Vector((dx * base_r * 0.3, dy * base_r * 0.3, 0.55)),
            Vector((dx * base_r * 1.35, dy * base_r * 1.35, 0.22)),
            Vector((dx * base_r * 2.15, dy * base_r * 2.15, -0.06)),
        ]
        add_closed_tapered_limb(bm_bark, r_pts, [base_r * 0.38, base_r * 0.26, base_r * 0.12], 4 if far else 5)

    bough_count = 3 if far else 5
    for b_idx in range(bough_count):
        t = 0.46 + (b_idx / max(1, bough_count - 1)) * 0.44
        origin = trunk_pts[1].lerp(trunk_pts[-1], t)
        ang = b_idx * 2.3999 + variant * 1.15 + (rng.random() - 0.5) * 0.4
        dx, dy = math.cos(ang), math.sin(ang)
        reach = (1.55 + rng.random() * 1.05) * (1.12 - t * 0.38)
        rise = 0.75 + rng.random() * 0.85
        mid = origin + Vector((dx * reach * 0.52, dy * reach * 0.52, rise * 0.48))
        end = origin + Vector((dx * reach, dy * reach, rise * (0.95 if b_idx % 2 == 0 else 0.65)))
        b_rad = base_r * (0.34 - t * 0.12)
        add_closed_tapered_limb(bm_bark, [origin, mid, end], [b_rad, b_rad * 0.62, b_rad * 0.24], 4 if far else 5)
        if not far and b_idx < 3:
            twig_ang = ang + (0.65 if b_idx % 2 == 0 else -0.65)
            tdx, tdy = math.cos(twig_ang), math.sin(twig_ang)
            twig_end = mid + Vector((tdx * reach * 0.48, tdy * reach * 0.48, rise * 0.52))
            add_closed_tapered_limb(bm_bark, [mid, twig_end], [b_rad * 0.48, b_rad * 0.16], 4)

    bmesh.ops.recalc_face_normals(bm_bark, faces=bm_bark.faces)
    bm_bark.normal_update()

    def bark_vc(co, n):
        h = max(0.0, min(1.0, co.z / max(1.0, trunk_h)))
        ao = 0.66 + 0.34 * h
        return (ao * 0.96, ao * 0.90, ao * 0.86)

    bark_mesh = finalize_mesh(bm_bark, key + ":trunk", trunk_mat, bark_vc, uv_scale=0.35)
    bark_obj = bpy.data.objects.new(key + ":trunk", bark_mesh)
    bark_obj["assetMaterial"] = "trunk"
    bark_obj.parent = root

    parts = [bark_obj]
    if not far:
        bm_ember = bmesh.new()
        c_ang = variant * 1.7 + 0.5
        dx, dy = math.cos(c_ang), math.sin(c_ang)
        e_pts = [
            Vector((dx * base_r * 0.72, dy * base_r * 0.72, 0.04)),
            Vector((dx * base_r * 0.84, dy * base_r * 0.84, 0.32)),
            Vector((dx * base_r * 0.68, dy * base_r * 0.68, 0.56)),
        ]
        add_closed_tapered_limb(bm_ember, e_pts, [0.11, 0.085, 0.04], 5)
        ember_mesh = finalize_mesh(bm_ember, key + ":glow", ember_mat, lambda co, n: (1.0, 0.72, 0.32), uv_scale=0.35)
        ember_obj = bpy.data.objects.new(key + ":glow", ember_mesh)
        ember_obj["assetMaterial"] = "glow"
        ember_obj.parent = root
        parts.append(ember_obj)

    return root, parts


def main():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True)
    args = parser.parse_args(argv)
    os.makedirs(args.output, exist_ok=True)

    clear_scene()
    rock_mat = make_material("rock", (0.86, 0.86, 0.84, 1.0), roughness=0.90, use_vc=True)
    bush_mat = make_material("bush", (0.94, 0.96, 0.92, 1.0), roughness=0.92, use_vc=True)
    trunk_mat = make_material("trunk", (0.20, 0.17, 0.16, 1.0), roughness=0.92)
    ember_mat = make_material("glow", (1.0, 0.44, 0.12, 1.0), roughness=0.35)

    col = bpy.context.scene.collection
    summary = {}

    for style, seed in [("meadow", 101), ("arid", 202), ("volcanic", 303)]:
        key = f"cliff:{style}"
        obj = build_cliff_mesh(key, style, seed, rock_mat)
        col.objects.link(obj)
        summary[key] = {"tris": sum(len(p.vertices) - 2 for p in obj.data.polygons)}

    for style, seed in [("meadow", 411), ("arid", 422), ("volcanic", 433), ("snow", 444)]:
        key = f"cliffwall:{style}"
        obj = build_cliffwall_mesh(key, style, seed, rock_mat)
        col.objects.link(obj)
        summary[key] = {"tris": sum(len(p.vertices) - 2 for p in obj.data.polygons)}

    for style, seed in [("meadow", 411), ("arid", 422), ("snow", 444)]:
        key = f"cliffcap:{style}"
        obj = build_cliffcap_mesh(key, style, seed, bush_mat)
        col.objects.link(obj)
        summary[key] = {"tris": sum(len(p.vertices) - 2 for p in obj.data.polygons)}

    for style, seed in [("meadow", 511), ("volcanic", 522), ("snow", 533)]:
        key = f"mountain:{style}"
        obj = build_mountain_mesh(key, style, seed, rock_mat)
        col.objects.link(obj)
        summary[key] = {"tris": sum(len(p.vertices) - 2 for p in obj.data.polygons)}

    for style, seed in [("meadow", 611), ("arid", 622), ("snow", 633)]:
        key = f"bush:{style}"
        obj = build_bush_mesh(key, style, seed, bush_mat)
        col.objects.link(obj)
        summary[key] = {"tris": sum(len(p.vertices) - 2 for p in obj.data.polygons)}

    for style, seed in [("meadow", 711), ("arid", 722), ("snow", 733), ("volcanic", 744)]:
        key = f"ruin:{style}"
        obj = build_ruin_mesh(key, style, seed, rock_mat)
        col.objects.link(obj)
        summary[key] = {"tris": sum(len(p.vertices) - 2 for p in obj.data.polygons)}

    for style, seed in [("meadow", 811), ("arid", 822), ("snow", 833), ("volcanic", 844)]:
        key = f"waystone:{style}"
        obj = build_waystone_mesh(key, style, seed, rock_mat)
        col.objects.link(obj)
        summary[key] = {"tris": sum(len(p.vertices) - 2 for p in obj.data.polygons)}

    for style, seed in [("meadow", 911), ("snow", 922)]:
        key = f"fallenlog:{style}"
        obj = build_fallen_log_mesh(key, style, seed, bush_mat)
        col.objects.link(obj)
        summary[key] = {"tris": sum(len(p.vertices) - 2 for p in obj.data.polygons)}

    for style, seed in [("meadow", 1011), ("arid", 1022), ("snow", 1033), ("volcanic", 1044)]:
        key = f"spire:{style}"
        obj = build_spire_mesh(key, style, seed, rock_mat)
        col.objects.link(obj)
        summary[key] = {"tris": sum(len(p.vertices) - 2 for p in obj.data.polygons)}

    for variant in range(4):
        for far in (False, True):
            root, parts = build_volcanic_tree(variant, far, trunk_mat, ember_mat)
            col.objects.link(root)
            for p in parts:
                col.objects.link(p)
            tris = sum(sum(len(poly.vertices) - 2 for poly in p.data.polygons) for p in parts)
            summary[root["assetKey"]] = {"tris": tris}

    glb_path = os.path.join(args.output, "frontier-biome-art-raw.glb")
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
    with open(os.path.join(args.output, "report.json"), "w", encoding="utf-8") as fh:
        json.dump({"keys": sorted(summary.keys()), "summary": summary}, fh, indent=2)
    print(json.dumps({"glb": glb_path, "count": len(summary), "summary": summary}))


if __name__ == "__main__":
    main()
