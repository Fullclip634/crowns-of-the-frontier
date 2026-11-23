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
from mathutils import Matrix, Vector


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


def finalize_mesh(bm, name, mat, color_fn, uv_scale=0.28):
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
        fn = poly.normal
        for li in poly.loop_indices:
            co = verts[loops[li].vertex_index].co
            c = color_fn(co, fn)
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
    """Creates a strictly closed 2-manifold terraced geological cliff prism with sharp strata ledges."""
    ring_verts = []
    for r_idx in range(rings):
        t = r_idx / max(1, rings - 1)
        z = -0.35 + t * (height + 0.35)
        # Wide grounded talus base -> steep faceted cliff wall -> stepped upper shelf
        if t < 0.22:
            profile = 1.24 - (t / 0.22) * 0.24
        elif t < 0.85:
            shelf = math.sin(t * math.pi * 3.0) * 0.06
            profile = 1.0 - (t - 0.22) * (1.0 - taper_top) * 0.85 + shelf
        else:
            profile = taper_top * (1.0 - (t - 0.85) * (0.35 if flat_top else 1.45))
        verts = []
        for s in range(sides):
            ang = (s / sides) * math.tau
            # Crisp angular rock cleavage facets + stratified horizontal ripples
            crag = 0.84 + 0.24 * math.sin(ang * 3.0 + seed * 1.3 + t * 2.2) + 0.14 * math.cos(ang * 5.0 - seed * 0.7 - t * 3.8)
            if t > 0.15 and t < 0.90:
                # Sharp vertical fissure grooves
                crag *= 0.93 + 0.10 * math.tanh(math.sin(ang * 4.0 + seed) * 2.5)
            px = center.x + math.cos(ang) * rx * profile * crag
            py = center.y + math.sin(ang) * ry * profile * crag
            pz = center.z + z + (0.0 if r_idx == 0 else (0.14 if not flat_top else 0.08) * math.sin(ang * 2.0 + seed) * t)
            verts.append(bm.verts.new(Vector((px, py, pz))))
        ring_verts.append(verts)

    # Bottom cap (outward -Z normal)
    bot_center = bm.verts.new(Vector((center.x, center.y, center.z - 0.38)))
    for s in range(sides):
        sn = (s + 1) % sides
        bm.faces.new((ring_verts[0][sn], ring_verts[0][s], bot_center))

    # Side quads
    for i in range(rings - 1):
        r0, r1 = ring_verts[i], ring_verts[i + 1]
        for s in range(sides):
            sn = (s + 1) % sides
            bm.faces.new((r0[s], r0[sn], r1[sn], r1[s]))

    # Top cap (flat grassy plateau or jagged mountain crest)
    top_z = center.z + height + (0.04 if flat_top else 0.38)
    top_center = bm.verts.new(Vector((center.x, center.y, top_z)))
    top_ring = ring_verts[-1]
    for s in range(sides):
        sn = (s + 1) % sides
        bm.faces.new((top_ring[s], top_ring[sn], top_center))


def build_cliffwall_mesh(name, style, seed, mat):
    """Builds a monumental AoE2/AoE4 sheer stepped stone cliff escarpment segment.

    Composed of an interlocking main cliff wall buttress + flanking rock shoulders +
    talus scree base so chained segments form dramatic continuous mountain walls.
    """
    bm = bmesh.new()
    # Central steep terraced rock escarpment (richer rings & sides for realistic geological ledges)
    add_stratified_rock_block(bm, Vector((0.0, 0.0, 0.0)), rx=1.55, ry=1.14, height=3.20, rings=8, sides=14, seed=seed, flat_top=True, taper_top=0.76)
    # Flanking interlocking step-down ledges that blend seamlessly into neighboring cliff segments
    add_stratified_rock_block(bm, Vector((-1.15, 0.14, 0.0)), rx=0.96, ry=0.88, height=2.35, rings=6, sides=11, seed=seed + 17, flat_top=True, taper_top=0.74)
    add_stratified_rock_block(bm, Vector((1.18, -0.12, 0.0)), rx=0.98, ry=0.84, height=2.55, rings=6, sides=11, seed=seed + 31, flat_top=True, taper_top=0.72)
    # Grounded rocky scree shoulders at the cliff foot
    add_stratified_rock_block(bm, Vector((-0.58, -0.84, 0.0)), rx=0.68, ry=0.56, height=1.02, rings=5, sides=9, seed=seed + 47, flat_top=False, taper_top=0.52)
    add_stratified_rock_block(bm, Vector((0.72, 0.78, 0.0)), rx=0.64, ry=0.52, height=0.95, rings=5, sides=9, seed=seed + 63, flat_top=False, taper_top=0.50)

    def wall_vc(co, n):
        # Vertical stone stratification bands + deep ground AO + vibrant biome plateau top cap!
        # Calibrated to multiply cleanly with Poly Haven rock_01_color PBR albedo (~0.55 base).
        h = max(0.0, min(1.0, co.z / 3.25))
        ao = 0.56 + 0.44 * (h * 0.62 + max(0.0, n.z) * 0.38)
        strata = 0.88 + 0.16 * math.sin(co.z * 7.2 + co.x * 1.15)
        top_cap = max(0.0, min(1.0, (n.z - 0.52) / 0.28)) * (1.0 if co.z > 1.35 else 0.0)
        foot_moss = max(0.0, min(1.0, (0.28 - h) * 3.2)) * max(0.0, n.z * 0.7 + 0.3)

        if style == "volcanic":
            rock = (0.48 * ao * strata, 0.45 * ao * strata, 0.44 * ao * strata)
            cap = (0.58 * ao, 0.52 * ao, 0.48 * ao)
            return (rock[0]*(1-top_cap)+cap[0]*top_cap, rock[1]*(1-top_cap)+cap[1]*top_cap, rock[2]*(1-top_cap)+cap[2]*top_cap)
        if style == "arid":
            rock = (0.98 * ao * strata, 0.80 * ao * strata, 0.58 * ao * strata)
            cap = (1.00 * ao, 0.88 * ao, 0.64 * ao)
            return (rock[0]*(1-top_cap)+cap[0]*top_cap, rock[1]*(1-top_cap)+cap[1]*top_cap, rock[2]*(1-top_cap)+cap[2]*top_cap)
        if style == "snow":
            rock = (0.72 * ao * strata, 0.78 * ao * strata, 0.86 * ao * strata)
            cap = (0.98 * ao, 1.00 * ao, 1.00 * ao)
            return (rock[0]*(1-top_cap)+cap[0]*top_cap, rock[1]*(1-top_cap)+cap[1]*top_cap, rock[2]*(1-top_cap)+cap[2]*top_cap)

        # Classic AoE sunlit limestone/granite cliff wall + rich mossy meadow turf plateau top!
        rock = (0.86 * ao * strata, 0.85 * ao * strata, 0.80 * ao * strata)
        cap = (0.48 * ao, 0.76 * ao, 0.36 * ao)
        m = max(top_cap, foot_moss * 0.55)
        return (
            rock[0] * (1.0 - m) + cap[0] * m,
            rock[1] * (1.0 - m) + cap[1] * m,
            rock[2] * (1.0 - m) + cap[2] * m,
        )

    mesh = finalize_mesh(bm, name, mat, wall_vc, uv_scale=0.22)
    obj = bpy.data.objects.new(name, mesh)
    obj["assetKey"] = name
    obj["assetMaterial"] = "rock"
    return obj


def build_mountain_mesh(name, style, seed, mat):
    """Builds a towering multi-spire alpine mountain crag anchoring passes and valley walls."""
    bm = bmesh.new()
    # Central jagged mountain spire
    add_stratified_rock_block(bm, Vector((0.0, 0.0, 0.0)), rx=1.82, ry=1.62, height=5.5, rings=8, sides=12, seed=seed, flat_top=False, taper_top=0.24)
    # Two secondary interlocking alpine ridges
    add_stratified_rock_block(bm, Vector((-1.18, 0.54, 0.0)), rx=1.24, ry=1.10, height=3.9, rings=7, sides=10, seed=seed + 23, flat_top=False, taper_top=0.32)
    add_stratified_rock_block(bm, Vector((1.14, -0.48, 0.0)), rx=1.26, ry=1.12, height=3.5, rings=7, sides=10, seed=seed + 41, flat_top=False, taper_top=0.36)
    # Broad lower foothills gripping the battlefield terrain
    add_stratified_rock_block(bm, Vector((0.16, 1.18, 0.0)), rx=1.10, ry=0.90, height=2.15, rings=6, sides=9, seed=seed + 59, flat_top=True, taper_top=0.65)
    add_stratified_rock_block(bm, Vector((-0.32, -1.20, 0.0)), rx=1.04, ry=0.88, height=1.85, rings=6, sides=9, seed=seed + 71, flat_top=True, taper_top=0.68)

    def mtn_vc(co, n):
        h = max(0.0, min(1.0, co.z / 5.5))
        ao = 0.54 + 0.46 * (h * 0.70 + max(0.0, n.z) * 0.30)
        strata = 0.88 + 0.16 * math.sin(co.z * 5.8 - co.x * 0.95)
        if style == "volcanic":
            return (0.46 * ao * strata, 0.43 * ao * strata, 0.42 * ao * strata)
        if style == "snow":
            snow = max(0.0, min(1.0, (h - 0.30) * 2.1 + max(0.0, n.z - 0.38)))
            r = 0.68 * ao * strata * (1.0 - snow) + 0.98 * ao * snow
            g = 0.74 * ao * strata * (1.0 - snow) + 0.99 * ao * snow
            b = 0.82 * ao * strata * (1.0 - snow) + 1.00 * ao * snow
            return (r, g, b)
        # Alpine granite mountain: mossy lower foothills -> sunlit weathered granite -> crisp alpine summit
        moss = max(0.0, min(1.0, (0.38 - h) * 2.8)) * max(0.0, n.z * 0.85 + 0.15)
        peak = max(0.0, min(1.0, (h - 0.64) * 2.6)) * max(0.0, n.z * 0.65 + 0.35)
        base_r, base_g, base_b = 0.82 * ao * strata, 0.82 * ao * strata, 0.78 * ao * strata
        r = base_r * (1.0 - moss) + 0.46 * ao * moss
        g = base_g * (1.0 - moss) + 0.72 * ao * moss
        b = base_b * (1.0 - moss) + 0.35 * ao * moss
        r = r * (1.0 - peak) + 0.96 * ao * peak
        g = g * (1.0 - peak) + 0.97 * ao * peak
        b = b * (1.0 - peak) + 0.95 * ao * peak
        return (r, g, b)

    mesh = finalize_mesh(bm, name, mat, mtn_vc, uv_scale=0.18)
    obj = bpy.data.objects.new(name, mesh)
    obj["assetKey"] = name
    obj["assetMaterial"] = "rock"
    return obj


def build_bush_mesh(name, style, seed, mat):
    """Builds a lush, strictly closed 2-manifold multi-lobed medieval woodland bush cluster."""
    bm = bmesh.new()
    # 7 organically deformed leafy foliage clusters forming a dense medieval hedgerow bush
    lobes = [
        (Vector((0.0, 0.0, 0.46)), 0.68, 0.62, 0.54, 2),
        (Vector((-0.48, 0.24, 0.35)), 0.50, 0.46, 0.40, 1),
        (Vector((0.50, 0.18, 0.37)), 0.52, 0.47, 0.42, 1),
        (Vector((-0.26, -0.45, 0.33)), 0.48, 0.44, 0.38, 1),
        (Vector((0.34, -0.39, 0.31)), 0.46, 0.42, 0.36, 1),
        (Vector((0.06, 0.14, 0.74)), 0.40, 0.38, 0.32, 1),
        (Vector((-0.18, 0.38, 0.52)), 0.36, 0.34, 0.30, 1),
    ]
    for idx, (offset, rx, ry, rz, subdivs) in enumerate(lobes):
        ret = bmesh.ops.create_icosphere(bm, subdivisions=subdivs, radius=1.0)
        for v in ret["verts"]:
            p = v.co
            ripple = 0.80 + 0.28 * math.sin(p.x * 6.3 + p.y * 4.7 + seed + idx * 1.9) * math.cos(p.z * 5.3 - idx)
            flat_base = 0.50 if p.z < -0.2 else 1.0
            v.co = Vector((
                offset.x + p.x * rx * ripple,
                offset.y + p.y * ry * ripple,
                max(-0.08, offset.z + p.z * rz * ripple * flat_base),
            ))

    def bush_vc(co, n):
        h = max(0.0, min(1.0, co.z / 0.98))
        sun = max(0.0, min(1.0, n.z * 0.55 + 0.45))
        ao = 0.36 + 0.64 * (h * 0.60 + sun * 0.40)
        dapple = 0.84 + 0.24 * math.sin(co.x * 7.8 - co.y * 6.5 + seed)
        if style == "snow":
            frost = max(0.0, min(1.0, (n.z - 0.38) * 1.45)) * h
            r = 0.14 * ao * dapple * (1.0 - frost) + 0.80 * ao * frost
            g = 0.28 * ao * dapple * (1.0 - frost) + 0.86 * ao * frost
            b = 0.20 * ao * dapple * (1.0 - frost) + 0.90 * ao * frost
            return (r, g, b)
        if style == "arid":
            return (0.38 * ao * dapple, 0.42 * ao * dapple, 0.20 * ao * dapple)
        # Rich realistic medieval forest-green undergrowth matching woodland spruce/meadow turf
        return (0.26 * ao * dapple, 0.48 * ao * dapple, 0.18 * ao * dapple)

    mesh = finalize_mesh(bm, name, mat, bush_vc, uv_scale=0.55)
    obj = bpy.data.objects.new(name, mesh)
    obj["assetKey"] = name
    obj["assetMaterial"] = "bush"
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
