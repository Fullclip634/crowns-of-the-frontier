"""Fitted armored destrier, tack, and war saddle for the knight's four-leg cavalry rig."""
import math


def author_knight(solid, sides, suffix):
    # Sections follow the body in the Y/Z plane. Rings stay perpendicular to
    # that curve so the poll, nose, fetlocks, and tail retain their cross section.
    def loft(name, sections, x=0, n=None):
        count = n or sides
        rings = []
        for i, (y, z, width, depth) in enumerate(sections):
            prev, nxt = sections[max(0, i - 1)], sections[min(i + 1, len(sections) - 1)]
            dy, dz = nxt[0] - prev[0], nxt[1] - prev[1]
            length = math.hypot(dy, dz)
            rings.append([
                (x + width * math.cos(a), y + depth * math.sin(a) * dz / length,
                 z - depth * math.sin(a) * dy / length)
                for a in (math.tau * k / count for k in range(count))
            ])
        solid(name + suffix, rings)

    def tube(name, points, radius, n=6):
        """Loft a closed circular tube along an arbitrary 3D polyline (x, y, z)."""
        rings = []
        for i, (x, y, z) in enumerate(points):
            p0 = points[max(0, i - 1)]
            p1 = points[min(i + 1, len(points) - 1)]
            tx, ty, tz = p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]
            tl = math.hypot(tx, ty, tz) or 1.0
            tx, ty, tz = tx / tl, ty / tl, tz / tl
            # Pick a stable reference vector not parallel to tangent.
            rx, ry, rz = (0.0, 1.0, 0.0) if abs(ty) < 0.85 else (1.0, 0.0, 0.0)
            ux = ty * rz - tz * ry
            uy = tz * rx - tx * rz
            uz = tx * ry - ty * rx
            ul = math.hypot(ux, uy, uz) or 1.0
            ux, uy, uz = ux / ul, uy / ul, uz / ul
            vx = ty * uz - tz * uy
            vy = tz * ux - tx * uz
            vz = tx * uy - ty * ux
            r = radius[i] if isinstance(radius, (list, tuple)) else radius
            rings.append([
                (x + r * (ux * math.cos(a) + vx * math.sin(a)),
                 y + r * (uy * math.cos(a) + vy * math.sin(a)),
                 z + r * (uz * math.cos(a) + vz * math.sin(a)))
                for a in (math.tau * k / n for k in range(n))
            ])
        solid(name + suffix, rings)

    # Smooth muscular destrier barrel: rounded croup, supportive back, deep ribcage,
    # and gently curved breast that sits comfortably inside the steel peytral.
    loft("destrier", [
        (1.36, -1.02, .11, .15), (1.38, -.92, .29, .30),
        (1.38, -.72, .415, .395), (1.34, -.44, .440, .390),
        (1.32, -.14, .455, .398), (1.34, .18, .455, .420),
        (1.37, .44, .428, .418), (1.40, .63, .352, .348),
        (1.44, .75, .240, .245), (1.48, .80, .115, .130),
    ])
    # Arched muscular warhorse neck rooted cleanly inside the chest and withers.
    loft("destrier", [
        (1.44, .38, .34, .34), (1.62, .47, .315, .335),
        (1.82, .57, .268, .295), (2.04, .68, .215, .245),
        (2.24, .79, .168, .188), (2.35, .90, .132, .132),
    ])
    # Sculpted equine head: poll, cheek/jowl, clean nasal plane, and tapered muzzle.
    loft("destrier", [
        (2.32, .79, .102, .102), (2.35, .92, .168, .162),
        (2.28, 1.05, .175, .176), (2.18, 1.16, .140, .152),
        (2.09, 1.27, .106, .108), (2.01, 1.38, .098, .088),
        (1.97, 1.45, .114, .084), (1.955, 1.50, .086, .056),
    ])
    for side in (-1, 1):
        # Alert forward-pricked ears.
        loft("destrier", [
            (2.39, .865, .058, .052), (2.47, .880, .054, .042),
            (2.55, .905, .034, .032), (2.615, .924, .009, .010),
        ], side * .102, 6)
        # Glossy eyes and sculpted nostrils.
        loft("horseFeatures", [
            (2.295, 1.040, .009, .011), (2.290, 1.066, .021, .024),
            (2.282, 1.092, .010, .013),
        ], side * .168, 8)
        loft("horseFeatures", [
            (1.995, 1.430, .009, .009), (1.988, 1.452, .014, .016),
            (1.978, 1.470, .009, .010),
        ], side * .100, 6)
        # Bridle cheekpieces curving from poll down to the bit ring.
        tube("horseTack", [
            (side * .136, 2.38, .90),
            (side * .162, 2.28, 1.04),
            (side * .152, 2.16, 1.16),
            (side * .132, 2.07, 1.27),
            (side * .138, 2.00, 1.36),
        ], .016, 6)
        # Throatlatch anchoring the bridle cleanly behind the jowl.
        tube("horseTack", [
            (side * .142, 2.34, .93),
            (side * .155, 2.20, .97),
            (side * .090, 2.10, .99),
        ], .014, 6)
        # Bit ring at the corner of the mouth.
        tube("bridleHardware", [
            (side * .144, 2.00 + .032 * math.cos(a), 1.36 + .032 * math.sin(a))
            for a in (math.tau * k / 8 for k in range(9))
        ], .010, 6)
        # Continue the rider's reins from Figure2's endpoints (±0.26, 2.07, 0.95)
        # cleanly forward-down to the bridle bit rings.
        tube("horseTack", [
            (side * .260, 2.070, .950),
            (side * .224, 2.036, 1.085),
            (side * .186, 2.012, 1.225),
            (side * .146, 2.000, 1.355),
        ], .013, 6)

    # Bridle noseband and browband.
    loft("horseTack", [(2.042, 1.330, .112, .096), (2.022, 1.362, .116, .094)])
    tube("horseTack", [
        (.148 * math.sin(a), 2.345 + .035 * math.cos(a), .96 + .10 * math.cos(a))
        for a in (-1.3, -.7, 0.0, .7, 1.3)
    ], .015, 6)

    # Flowing crest mane and lush plumed warhorse tail.
    loft("crestAndTail", [
        (1.68, .22, .068, .072), (1.86, .34, .096, .092),
        (2.05, .45, .094, .102), (2.24, .56, .084, .106),
        (2.39, .69, .072, .092), (2.455, .85, .056, .066),
        (2.440, .96, .042, .046), (2.355, 1.03, .022, .034),
    ])
    loft("crestAndTail", [
        (1.53, -.92, .115, .105), (1.42, -1.045, .122, .130),
        (1.23, -1.135, .128, .138), (.98, -1.168, .122, .134),
        (.72, -1.215, .100, .114), (.54, -1.295, .072, .080),
        (.465, -1.375, .026, .040),
    ])

    # Anatomically blended limbs: tops taper inside the shoulder/haunch so no
    # flat cylinder edge protrudes, and knee/hock ends round smoothly over the
    # exact IK pivots (knee y=0.66 z=+0.04, ankle y=0.20 z=-0.02).
    for prefix, upper, lower in [
        ("fore", [
            (1.42, -.020, .065, .095), (1.26, .005, .132, .160),
            (1.07, -.015, .118, .132), (.88, -.010, .092, .098),
            (.73, .032, .078, .082), (.66, .040, .082, .082),
            (.625, .038, .056, .058),
        ], [
            (.695, .040, .058, .060), (.66, .040, .079, .080),
            (.58, .036, .064, .068), (.37, .008, .052, .056),
            (.25, -.026, .068, .076), (.19, -.018, .060, .062),
        ]),
        ("hind", [
            (1.44, -.020, .075, .105), (1.25, .000, .155, .182),
            (1.06, .062, .138, .156), (.88, .102, .110, .115),
            (.74, .072, .088, .092), (.66, .040, .080, .082),
            (.625, .028, .056, .058),
        ], [
            (.695, .040, .058, .060), (.66, .040, .080, .084),
            (.55, -.055, .076, .088), (.46, -.082, .068, .080),
            (.34, -.060, .054, .060), (.25, -.036, .066, .072),
            (.19, -.020, .060, .062),
        ]),
    ]:
        loft(prefix + "Upper", upper)
        loft(prefix + "Lower", lower)

    # Sculpted equine hoof with flat ground-contacting sole at exact Y=0.
    solid("hoofWall" + suffix, [
        [(w * math.cos(a), y, z + d * math.sin(a))
         for a in (math.tau * i / sides for i in range(sides))]
        for y, z, w, d in [
            (0.0, -.004, .098, .122), (.024, -.006, .101, .124),
            (.115, -.016, .088, .100), (.185, -.022, .072, .078),
            (.220, -.022, .060, .062),
        ]
    ])

    # Sculpted steel peytral (warhorse chest barding) wrapping cleanly around the
    # rounded breast with generous clearance over the coat and upper forelegs.
    arc_steps = 11 if sides >= 10 else 7
    angles = [-1.60 + 3.20 * k / (arc_steps - 1) for k in range(arc_steps)]
    peytral_rows = []
    for y_base, rx, rz, dip in [
        (1.12, .496, .435, .085),
        (1.24, .506, .472, .052),
        (1.38, .498, .496, .020),
        (1.50, .468, .482, .004),
        (1.60, .415, .428, -.010),
        (1.67, .365, .368, -.018),
    ]:
        outer = [
            (rx * math.sin(a), y_base - dip * max(0.0, math.cos(a)) + .045 * (1.0 - math.cos(a)),
             .455 + rz * math.cos(a))
            for a in angles
        ]
        inner = [
            ((rx - .024) * math.sin(a),
             y_base - dip * max(0.0, math.cos(a)) + .045 * (1.0 - math.cos(a)),
             .455 + (rz - .024) * math.cos(a))
            for a in reversed(angles)
        ]
        peytral_rows.append(outer + inner)
    solid("peytral" + suffix, peytral_rows)

    # Gold border along the peytral lower scalloped hem, upper neckline, and center boss.
    tube("peytralTrim", [
        (.500 * math.sin(a), 1.125 - .085 * max(0.0, math.cos(a)) + .045 * (1.0 - math.cos(a)),
         .455 + .442 * math.cos(a))
        for a in angles
    ], .019, 6)
    tube("peytralTrim", [
        (.370 * math.sin(a), 1.672 + .018 * max(0.0, math.cos(a)) + .045 * (1.0 - math.cos(a)),
         .455 + .374 * math.cos(a))
        for a in angles
    ], .015, 6)
    loft("peytralTrim", [
        (1.40, .932, .082, .090),
        (1.40, .964, .058, .064),
        (1.40, .984, .022, .026),
    ], 0, 8)

    # Sculpted steel chamfron (face armor) hugging the forehead and nasal bridge
    # while leaving the eyes, ears, and nostrils completely clear.
    chamfron_sections = [
        (2.442, 1.008, .078, .018),
        (2.392, 1.132, .112, .022),
        (2.296, 1.252, .096, .020),
        (2.196, 1.352, .076, .018),
        (2.106, 1.432, .054, .016),
        (2.060, 1.468, .026, .013),
    ]
    chamfron_rows = []
    for y, z, hw, th in chamfron_sections:
        # Cross section arches subtly over the nasal ridge with a closed underside.
        outer = [
            (-hw, y - .026, z - .024),
            (-hw * .52, y + .004, z + .008),
            (0.0, y + .024, z + .026),
            (hw * .52, y + .004, z + .008),
            (hw, y - .026, z - .024),
        ]
        inner = [(px * .92, py - th * .75, pz - th * .65) for px, py, pz in reversed(outer)]
        chamfron_rows.append(outer + inner)
    solid("chamfron" + suffix, chamfron_rows)

    # Gold center crest and forehead rondel boss on the chamfron.
    tube("chamfronTrim", [
        (0.0, y + .028, z + .030) for y, z, _, _ in chamfron_sections
    ], .013, 6)
    loft("chamfronTrim", [
        (2.402, 1.148, .038, .042),
        (2.418, 1.170, .026, .028),
        (2.428, 1.182, .010, .012),
    ], 0, 8)

    # Deep high-cantle medieval war saddle filling the seat seamlessly up to Y=1.83+.
    loft("saddleTree", [
        (1.78, -.48, .25, .10), (1.855, -.38, .338, .165),
        (1.775, -.24, .290, .112), (1.768, .005, .272, .105),
        (1.820, .17, .258, .135), (1.835, .24, .202, .125),
    ])
    # Gold trim seated flush along the arched rear cantle and front pommel rims.
    tube("saddleTrim", [
        (.325 * math.sin(a), 1.835 + .132 * math.cos(a), -.395 - .042 * math.cos(a))
        for a in (-1.15, -.58, 0.0, .58, 1.15)
    ], .017, 6)
    tube("saddleTrim", [
        (.215 * math.sin(a), 1.815 + .095 * math.cos(a), .212 + .028 * math.cos(a))
        for a in (-1.05, -.52, 0.0, .52, 1.05)
    ], .015, 6)

    # Draped heraldic caparison wrapping seamlessly across the spine, croup, and barrel.
    for side in (-1, 1):
        def skirt(z, hem):
            top_y = 1.822 if z < -.42 else 1.785
            profile = [(.002, top_y), (.18, top_y - .032), (.34, top_y - .118),
                       (.468, 1.505), (.490, 1.315), (.462, hem)]
            return [(side * x, y, z) for x, y in profile] + [
                (side * max(.001, x - .016), y - .012, z) for x, y in reversed(profile)
            ]

        hem_curve = [(-.86, 1.20), (-.68, 1.03), (-.46, .925), (-.26, .985), (-.05, 1.045), (.18, 1.095), (.32, 1.21)]
        solid("saddleCloth" + suffix, [skirt(z, y) for z, y in hem_curve])
        solid("clothBinding" + suffix, [
            [(side * x, y + h, z) for x, h in [(.458, .052), (.474, .052), (.474, 0.0), (.458, 0.0)]]
            for z, y in hem_curve
        ])

        # Stirrup leathers emerge cleanly from under the saddle flap and hang straight
        # down to the iron stirrups cradling the seated knight's boot arch.
        tube("horseTack", [
            (side * .345, 1.670, .055),
            (side * .474, 1.480, .090),
            (side * .516, 1.295, .120),
            (side * .534, 1.135, .140),
        ], .021, 6)
        for dz in (-.100, .105):
            tube("stirrupIron", [
                (side * .534, 1.138, .140),
                (side * .540, .992, .140 + dz * .84),
                (side * .540, .808, .140 + dz),
            ], .017, 6)
        loft("stirrupIron", [
            (.796, .032, .068, .016),
            (.796, .254, .068, .016),
        ], side * .540, 6)
