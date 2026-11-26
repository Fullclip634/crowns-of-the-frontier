"""Build shared fitted costume pieces for the adult infantry and rider rigs.

Run with Blender LTS in background mode. Work in game coordinates (+Y up,
+Z forward), convert to Blender for mesh validation and triangulation.
"""
import json
import math
import sys
from pathlib import Path

import bmesh
import bpy


project = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))
from knight_mount import author_knight

pieces = {}


def solid(name, rows):
    """Loft closed rings with matching vertex counts into a solid trim or panel."""
    sides = len(rows[0])
    points = [(x, -z, y) for row in rows for x, y, z in row]
    faces = [tuple(reversed(range(sides)))]
    for row in range(len(rows) - 1):
        for i in range(sides):
            a = row * sides + i
            b = row * sides + (i + 1) % sides
            faces.append((a, b, b + sides, a + sides))
    faces.append(tuple(range(len(points) - sides, len(points))))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(points, [], faces)
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    assert all(edge.is_manifold for edge in bm.edges) and bm.calc_volume() > 0
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    bm.to_mesh(mesh)
    bm.free()
    piece = pieces.setdefault(name, {"points": [], "triangles": []})
    base = len(piece["points"]) // 3
    for vertex in mesh.vertices:
        x, y, z = vertex.co
        piece["points"].extend(round(v * 10000) for v in (x, z, -y))
    for face in mesh.polygons:
        piece["triangles"].extend(base + i for i in face.vertices)
    bpy.data.meshes.remove(mesh)


def mantle(name, widths, depths, heights, drop, skew=0):
    rows = []
    for row, (w, d, y) in enumerate(zip(widths, depths, heights)):
        t = row / (len(heights) - 1)
        ring = []
        for i in range(24):
            a = math.tau * i / 24
            # Box pleats open toward the hem. The back hangs below the clasp.
            fold = 1 + .045 * t * math.cos(8 * a)
            hem = drop * (1 - math.cos(a)) / 2 + skew * math.sin(a)
            ring.append((w * math.sin(a) * fold, y - t * hem,
                         d * math.cos(a) * fold))
        rows.append(ring)
    solid(name, rows)


def panel(name, rows):
    # Each cross section is a slightly ridged strip with a backed edge.
    solid(name, [[(x-w, y, z-.012), (x, y, z+.008), (x+w, y, z-.012),
                  (x+w, y, z-.023), (x, y, z-.003), (x-w, y, z-.023)]
                 for x, y, z, w in rows])


def oval(name, center, radius, sides=10):
    x, y, z = center
    w, h, d = radius
    solid(name, [[(x + w*r*math.cos(math.tau*i/sides), y + h*t,
                   z + d*r*math.sin(math.tau*i/sides)) for i in range(sides)]
                 for t, r in [(-.96, .25), (-.48, .86), (.15, 1), (.72, .70), (.98, .2)]])


mantle("linenKerchief", [.114,.154,.264], [.12,.157,.202], [2.073,2.011,1.957], .067)
mantle("rangerMantle", [.143,.226,.408,.425], [.159,.195,.256,.261],
       [2.085,2.026,1.915,1.839], .215, .083)
mantle("mailStandard", [.126,.16,.25,.33], [.141,.16,.207,.226],
       [2.105,2.065,1.988,1.948], .074)
mantle("courtMantle", [.145,.252,.398,.437], [.154,.205,.256,.272],
       [2.11,2.045,1.95,1.849], .205)

panel("scarfKnot", [(0,2.015,.144,.038),(.012,1.958,.20,.044),
                    (.034,1.915,.212,.03),(.082,1.793,.223,.013)])
for sign in (-1, 1):
    panel("stole", [(sign*.10,2.03,.115,.048),(sign*.137,1.927,.204,.058),
                    (sign*.143,1.73,.224,.052),(sign*.139,1.38,.208,.049),
                    (sign*.158,1.12,.237,.058),(sign*.155,1.025,.239,.042)])
    for row in range(3):
        y = 1.32 - row*.076
        panel("tassets", [(sign*.169,y+.026,.181+row*.014,.082),
                          (sign*.181,y-.053,.202+row*.014,.095),
                          (sign*.178,y-.075,.207+row*.014,.067)])
    panel("cheek", [(sign*.081,2.337,.113,.024),(sign*.086,2.317,.11,.036),
                    (sign*.079,2.282,.11,.025),(sign*.066,2.269,.105,.009)])
    oval("eyes", (sign*.055,2.355,.119),(.022,.008,.009))
    panel("brow",[(sign*.058,2.39,.118,.029),(sign*.060,2.377,.126,.033),
                  (sign*.058,2.371,.125,.026)])
panel("chin", [(0,2.248,.119,.035),(0,2.236,.125,.033),(0,2.216,.117,.038),
               (0,2.192,.106,.026)])
panel("beard", [(0,2.263,.115,.082),(0,2.236,.135,.083),
                (0,2.191,.139,.071),(0,2.15,.128,.039),(0,2.128,.115,.012)])
for x in (-.048,.048):
    oval("clasp", (x,1.919,.248),(.025,.029,.013),8)
panel("clasp", [(-.052,1.924,.249,.012),(0,1.888,.27,.013),(.052,1.924,.249,.012)])
panel("tabard", [(0,1.941,.223,.115),(0,1.784,.251,.138),(0,1.55,.244,.118),
                 (0,1.35,.207,.107),(0,1.19,.228,.139),(0,1.04,.231,.149),
                 (0,.958,.239,.046)])
panel("blazon", [(0,1.825,.261,.065),(0,1.771,.265,.074),
                 (0,1.705,.262,.051),(0,1.657,.26,.008)])
for x in (-.103,.103):
    panel("pocket", [(x,1.49,.229,.07),(x,1.46,.257,.07),
                     (x,1.356,.257,.065),(x,1.33,.246,.046)])
    panel("pocketFlap", [(x,1.50,.244,.072),(x,1.468,.267,.074),
                         (x,1.432,.27,.045)])

# Local to each knee pivot. The rear stays open over the trouser calf.
panel("greave", [(0,-.035,.093,.047),(0,-.092,.103,.081),
                 (0,-.226,.109,.072),(0,-.363,.09,.049),(0,-.398,.081,.027)])
for y, w in [(-.12,.106),(-.32,.089)]:
    solid("bindings", [[(w*math.cos(math.tau*i/12), y+dy+.016*math.sin(math.tau*i/12),
                         w*math.sin(math.tau*i/12)) for i in range(12)]
                       for dy in (-.013,.013)])

output = project / "src/assets3d/characters/dress.json"
panel("visorBrow", [(0,2.453,.145,.105),(0,2.421,.171,.137),
                    (0,2.393,.193,.124),(0,2.384,.191,.095)])
panel("bevor", [(0,2.332,.187,.116),(0,2.304,.193,.122),
                (0,2.255,.17,.095),(0,2.219,.14,.046)])
# Subtle sculpted royal helm comb seated flush on the sallet crown, and a
# full wrap-around steel poleyn (knee cop) sealing the seated knee joint cleanly.
panel("helmCrest", [(0,2.558,.024,.018),(0,2.586,-.020,.022),
                    (0,2.568,-.082,.020),(0,2.502,-.132,.015)])
solid("poleyn", [
    [(w * math.cos(math.tau * i / 12), y, z + d * math.sin(math.tau * i / 12))
     for i in range(12)]
    for y, z, w, d in [
        (-.085, .012, .096, .094),
        (-.035, .026, .112, .114),
        (.018, .030, .114, .116),
        (.072, .014, .098, .096),
    ]
])
for sides, suffix in [(12,"High"),(7,"Field")]:
    author_knight(solid, sides, suffix)
output.write_text(json.dumps(pieces, separators=(",", ":")) + "\n", encoding="utf8")
print(f"Wrote {len(pieces)} fitted pieces to {output}")
