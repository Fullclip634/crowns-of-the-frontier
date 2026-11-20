"""Author stratified biome cliff outcrops & charred volcanic dead trees in Blender 4.5 LTS.

Produces strictly closed 2-manifold meshes with outward normals, UVs, and vertex colors:
  - cliff:meadow    (stepped limestone crag)
  - cliff:arid      (layered sandstone mesa shelf)
  - cliff:volcanic  (angular fractured columnar basalt)
  - tree:volcanic:{0..3}:{near,far} (gnarled charred dead snags with ember root clefts)
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


def make_material(name, rgba, roughness=0.88, metallic=0.0):
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = rgba
        bsdf.inputs["Roughness"].default_value = roughness
        bsdf.inputs["Metallic"].default_value = metallic
    return mat


def add_uv_and_vc(bm, color_fn):
    uv_layer = bm.loops.layers.uv.verify()
    vc_layer = bm.loops.layers.color.verify()
    for f in bm.faces:
        n = f.normal
        ax, ay, az = abs(n.x), abs(n.y), abs(n.z)
        for loop in f.loops:
            co = loop.vert.co
            if az >= ax and az >= ay:
                loop[uv_layer].uv = (co.x * 0.45 + 0.5, co.y * 0.45 + 0.5)
            elif ax >= ay:
                loop[uv_layer].uv = (co.y * 0.45 + 0.5, co.z * 0.45 + 0.5)
            else:
                loop[uv_layer].uv = (co.x * 0.45 + 0.5, co.z * 0.45 + 0.5)
            c = color_fn(co, n)
            loop[vc_layer] = (c[0], c[1], c[2], 1.0)


def slice_plane(v, normal, limit, strength):
    d = v.dot(normal)
    if d <= limit:
        return v
    return v - normal * ((d - limit) * strength)


def build_cliff_mesh(name, style, seed, mat):
    rng = random.Random(seed)
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
        # Flat-topped mesa shelf with wind-cut horizontal sandstone ledges.
        planes = [
            (Vector((0.0, 0.0, 1.0)), 0.24, 0.97),
            (Vector((0.84, 0.42, 0.34)).normalized(), 0.32, 0.92),
            (Vector((-0.80, -0.48, 0.36)).normalized(), 0.30, 0.92),
            (Vector((0.35, -0.88, 0.32)).normalized(), 0.31, 0.90),
            (Vector((-0.38, 0.86, 0.33)).normalized(), 0.32, 0.90),
        ]
    else:
        # Angular fractured columnar volcanic basalt.
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
            # Stepped horizontal sedimentary shelves
            z_step = math.floor(p.z * 6.5) / 6.5
            p.z = p.z * 0.58 + z_step * 0.42
            strata = 1.0 + math.tanh(math.sin(p.z * 19.0 + p.x * 1.6) * 3.0) * 0.14
            flare = 1.38 if p.z < 0.0 else (1.06 - p.z * 0.32)
            p.x *= (0.94 + n1 * 0.20) * strata * flare
            p.y *= (0.94 + n2 * 0.20) * strata * flare
            p.z *= 0.78
        elif style == "volcanic":
            # Sharp fractured jagged crag with slight angular facets
            strata = 1.0 + math.sin(p.z * 11.0 + p.x * 5.2 - p.y * 4.7) * 0.12
            flare = 1.28 if p.z < 0.0 else (1.0 - p.z * 0.36)
            p.x *= (0.86 + n1 * 0.26) * strata * flare
            p.y *= (0.86 + n2 * 0.26) * strata * flare
            p.z *= 1.04 + (n1 - 0.5) * 0.16
        else:
            # Stepped limestone crag with weathered top shelf
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
        # Bake vertical crevice & underside AO directly into vertex colors (0.72..1.05)
        up = max(0.0, min(1.0, n.z * 0.5 + 0.5))
        h = max(0.0, min(1.0, (co.z + 0.55) / 1.05))
        ao = 0.74 + 0.26 * (up * 0.55 + h * 0.45)
        if style == "arid":
            band = 0.92 + 0.12 * math.sin(co.z * 21.0 + co.x * 1.8)
            return (min(1.0, ao * band * 1.04), min(1.0, ao * band * 0.96), min(1.0, ao * band * 0.88))
        if style == "volcanic":
            return (min(1.0, ao * 0.92), min(1.0, ao * 0.90), min(1.0, ao * 0.91))
        return (min(1.0, ao * 1.01), min(1.0, ao * 1.02), min(1.0, ao * 0.98))

    add_uv_and_vc(bm, cliff_vc)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    mesh.materials.append(mat)
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
            # Subtle organic bark fluting on lower trunk rings
            flute = 1.0 + (0.12 * math.sin(ang * 3.0 + idx) if idx <= 1 and rad > 0.12 else 0.0)
            offset = (right * math.cos(ang) + fwd * math.sin(ang)) * (rad * flute)
            ring.append(bm.verts.new(pt + offset))
        rings.append(ring)

    # Bottom cap (outward normal pointing down/backward along -tangent)
    bm.faces.new(list(reversed(rings[0])))
    # Side quads
    for i in range(n_pts - 1):
        r0, r1 = rings[i], rings[i + 1]
        for s in range(sides):
            sn = (s + 1) % sides
            bm.faces.new((r0[s], r0[sn], r1[sn], r1[s]))
    # Top tip cap (pyramid apex or cap)
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

    # Main gnarled charred trunk (Blender Z-up; exporter converts cleanly to glTF Y-up)
    trunk_pts = [
        Vector((0.0, 0.0, -0.08)),
        Vector((lean_x * 0.25, lean_y * 0.25, trunk_h * 0.28)),
        Vector((lean_x * 0.68, lean_y * 0.55, trunk_h * 0.58)),
        Vector((lean_x * 1.05, lean_y * 0.92, trunk_h * 0.84)),
        Vector((lean_x * 1.22, lean_y * 1.10, trunk_h)),
    ]
    trunk_rads = [base_r * 1.24, base_r * 0.88, base_r * 0.62, base_r * 0.36, base_r * 0.14]
    add_closed_tapered_limb(bm_bark, trunk_pts, trunk_rads, sides)

    # Exposed root buttresses gripping the basalt floor
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

    # Dead twisted skeletal boughs + forked twigs
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
            # Secondary broken fork twig
            twig_ang = ang + (0.65 if b_idx % 2 == 0 else -0.65)
            tdx, tdy = math.cos(twig_ang), math.sin(twig_ang)
            twig_end = mid + Vector((tdx * reach * 0.48, tdy * reach * 0.48, rise * 0.52))
            add_closed_tapered_limb(bm_bark, [mid, twig_end], [b_rad * 0.48, b_rad * 0.16], 4)

    bmesh.ops.recalc_face_normals(bm_bark, faces=bm_bark.faces)
    bm_bark.normal_update()

    def bark_vc(co, n):
        # Charred obsidian base warming slightly to ashen grey on upper windswept tips
        h = max(0.0, min(1.0, co.z / max(1.0, trunk_h)))
        ao = 0.66 + 0.34 * h
        return (ao * 0.96, ao * 0.90, ao * 0.86)

    add_uv_and_vc(bm_bark, bark_vc)
    bark_mesh = bpy.data.meshes.new(key + ":trunk")
    bm_bark.to_mesh(bark_mesh)
    bm_bark.free()
    bark_mesh.materials.append(trunk_mat)
    bark_obj = bpy.data.objects.new(key + ":trunk", bark_mesh)
    bark_obj["assetMaterial"] = "trunk"
    bark_obj.parent = root

    parts = [bark_obj]
    if not far:
        # Smoldering glowing lava cleft nestled in root hollow
        bm_ember = bmesh.new()
        c_ang = variant * 1.7 + 0.5
        dx, dy = math.cos(c_ang), math.sin(c_ang)
        e_pts = [
            Vector((dx * base_r * 0.72, dy * base_r * 0.72, 0.04)),
            Vector((dx * base_r * 0.84, dy * base_r * 0.84, 0.32)),
            Vector((dx * base_r * 0.68, dy * base_r * 0.68, 0.56)),
        ]
        add_closed_tapered_limb(bm_ember, e_pts, [0.11, 0.085, 0.04], 5)
        bmesh.ops.recalc_face_normals(bm_ember, faces=bm_ember.faces)
        bm_ember.normal_update()
        add_uv_and_vc(bm_ember, lambda co, n: (1.0, 0.72, 0.32))
        ember_mesh = bpy.data.meshes.new(key + ":glow")
        bm_ember.to_mesh(ember_mesh)
        bm_ember.free()
        ember_mesh.materials.append(ember_mat)
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
    rock_mat = make_material("rock", (0.72, 0.72, 0.69, 1.0), roughness=0.90)
    trunk_mat = make_material("trunk", (0.20, 0.17, 0.16, 1.0), roughness=0.92)
    ember_mat = make_material("glow", (1.0, 0.44, 0.12, 1.0), roughness=0.35)

    col = bpy.context.scene.collection
    summary = {}

    for style, seed in [("meadow", 101), ("arid", 202), ("volcanic", 303)]:
        key = f"cliff:{style}"
        obj = build_cliff_mesh(key, style, seed, rock_mat)
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
