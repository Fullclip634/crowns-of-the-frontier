"""Original articulated medieval figures with adult proportions and real tools.

Executed by refine-catalogue.py with its mesh/material helpers available.
Coordinates and joint extras use the game's Y-up convention; authored mesh
vertices are converted to Blender's Z-up convention for glTF export.
"""

HUMANS = {"villager", "spearman", "swordsman", "archer", "scout", "knight", "monk", "king", "sentinel", "marksman", "outrider"}

def author_human(root):
    key = root["assetKey"].split(":")
    unit = key[1]
    if unit not in HUMANS:
        return
    task = key[2] if len(key) > 2 else "wood"
    riding = unit in {"scout", "knight", "outrider"}
    armored = unit in {"spearman", "swordsman", "knight", "sentinel", "king"}
    offset = .78 if riding else 0
    # Retain the articulated horse; replace its rider and saddle independently.
    keep = set()
    if riding:
        for obj in descendants(root)[1:]:
            role = obj.get("assetMaterial")
            motion = obj.get("motion")
            if role in {"horse", "mane"} or (motion and motion.get("type") == "horseleg"):
                keep.add(obj)
    for obj in reversed(descendants(root)[1:]):
        if obj not in keep:
            bpy.data.objects.remove(obj, do_unlink=True)

    batches = {}
    def add(role, verts, faces, motion=None):
        motion_key = json.dumps(motion, sort_keys=True) if motion else ""
        batch = batches.setdefault((role, motion_key), [[], [], motion])
        start = len(batch[0])
        batch[0].extend((x, -z, y) for x, y, z in verts)
        batch[1].extend(tuple(start + index for index in face) for face in faces)

    def section(role, center, rings, motion=None, sides=10):
        verts, faces = [], []
        for height, width, depth in rings:
            for i in range(sides):
                angle = math.tau * i / sides
                verts.append((center[0] + math.sin(angle) * width,
                              center[1] + height, center[2] + math.cos(angle) * depth))
        faces.append(tuple(range(sides - 1, -1, -1)))
        for ring in range(len(rings) - 1):
            for i in range(sides):
                j = (i + 1) % sides
                faces.append((ring * sides + i, ring * sides + j,
                              (ring + 1) * sides + j, (ring + 1) * sides + i))
        faces.append(tuple((len(rings) - 1) * sides + i for i in range(sides)))
        add(role, verts, faces, motion)

    def bar(role, start, end, radius=.035, motion=None, taper=1, sides=7):
        a, b = Vector(start), Vector(end)
        direction = (b - a).normalized()
        u = direction.cross(Vector((0, 1, 0)))
        if u.length < .001:
            u = direction.cross(Vector((0, 0, 1)))
        u.normalize()
        v = direction.cross(u).normalized()
        verts, faces = [], []
        for center, scale in [(a, 1), (b, taper)]:
            for i in range(sides):
                angle = i * math.tau / sides
                verts.append(tuple(center + (u * math.cos(angle) + v * math.sin(angle)) * radius * scale))
        faces.extend([tuple(range(sides - 1, -1, -1)), tuple(sides + i for i in range(sides))])
        for i in range(sides):
            j = (i + 1) % sides
            faces.append((i, j, sides + j, sides + i))
        add(role, verts, faces, motion)

    def box(role, center, size, motion=None):
        x, y, z = center
        a, b, c = [v / 2 for v in size]
        verts = [(x-a,y-b,z-c),(x+a,y-b,z-c),(x+a,y+b,z-c),(x-a,y+b,z-c),
                 (x-a,y-b,z+c),(x+a,y-b,z+c),(x+a,y+b,z+c),(x-a,y+b,z+c)]
        add(role, verts, [(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)], motion)

    torso = {"type":"torso", "pivot":[0,1.28+offset,0], "side":1}
    head = {"type":"head", "pivot":[0,2.14+offset,0], "side":1, "parent":torso}
    section("steel" if armored else "team", (0,offset,0),
            [(1.21,.25,.17),(1.38,.28,.18),(1.77,.36,.205),(1.94,.31,.17),(2.02,.16,.14)], torso)
    section("pants", (0,offset,0), [(1.1,.28,.18),(1.32,.27,.18)], torso)
    section("leather", (0,offset,0), [(1.29,.286,.188),(1.37,.286,.188)], torso)
    box("gold", (0,1.33+offset,.194), (.095,.065,.035), torso)
    if armored:
        box("team", (0,1.64+offset,.216), (.40,.50,.035), torso)
        bar("steel", (0,1.42+offset,.247), (0,1.93+offset,.247), .014, torso)
        for x in [-.145,.145]:
            for y in [1.48,1.78,1.93]:
                section("gold", (x,y+offset,.245), [(-.015,.016,.012),(.015,.016,.012)], torso, sides=6)
    elif unit == "villager":
        box("canvas", (0,1.62,.218), (.37,.59,.025), torso)
        for x in [-.15,.15]:
            bar("leather", (x,1.36,.234), (x,1.98,.172), .014, torso)
        section("leather", (0,1.54,-.255), [(-.29,.21,.10),(.19,.22,.105),(.29,.17,.07)], torso)
        for x in [-.18,.18]:
            bar("canvas", (x,1.32,.20), (x,1.95,-.19), .023, torso)
        box("wood", (0,1.25,-.36), (.47,.13,.14), torso)
        box("canvas", (.12,1.61,-.37), (.10,.16,.025), torso)
    else:
        bar("leather", (-.25,1.44+offset,.19), (.25,1.93+offset,.19), .02, torso)

    bar("skin", (0,1.99+offset,0), (0,2.18+offset,0), .085, head)
    section("skin", (0,2.32+offset,.012),
            [(-.17,.085,.092),(-.11,.126,.112),(.015,.142,.122),(.115,.134,.111),(.18,.088,.077)], head, sides=12)
    for side in [-1,1]:
        section("skin", (side*.145,2.31+offset,0), [(-.045,.018,.023),(.045,.018,.024)], head, sides=6)
        section("hair", (side*.057,2.36+offset,.133), [(-.012,.013,.010),(.012,.013,.010)], head, sides=6)
        bar("hair", (side*.04,2.397+offset,.13), (side*.087,2.392+offset,.129), .006, head)
    add("skin", [(-.023,2.345+offset,.131),(.023,2.345+offset,.131),(0,2.285+offset,.174),
                 (-.025,2.286+offset,.132),(.025,2.286+offset,.132)],
        [(0,1,2),(0,2,3),(1,4,2),(3,2,4),(0,3,4,1)], head)
    bar("hair", (-.026,2.245+offset,.123), (.026,2.245+offset,.123), .004, head)
    section("hair", (0,2.32+offset,0), [(.085,.145,.124),(.18,.12,.10),(.205,.04,.035)], head)
    if unit == "villager":
        section("straw", (0,2.49,0), [(-.015,.29,.255),(.015,.29,.255),(.045,.15,.14),(.18,.10,.09)], head, sides=12)
    elif unit in {"archer","marksman","monk","scout","outrider"}:
        role = "canvas" if unit == "monk" else "team"
        section(role, (0,2.34+offset,-.035), [(-.08,.16,.14),(.11,.175,.15),(.235,.10,.08)], head)
    else:
        section("steel", (0,2.36+offset,-.01), [(-.02,.158,.142),(.13,.153,.13),(.22,.04,.04)], head)
        bar("steel", (0,2.51+offset,.147), (0,2.29+offset,.147), .025, head)
        if unit in {"swordsman","sentinel","knight"}:
            box("steel", (0,2.33+offset,.153), (.235,.19,.035), head)
            box("leather", (0,2.36+offset,.178), (.155,.025,.018), head)
    if unit == "king":
        section("gold", (0,2.57,0), [(-.02,.17,.15),(.075,.17,.15)], head)
        for i in range(6):
            a = i * math.tau / 6
            bar("gold", (math.sin(a)*.16,2.61,math.cos(a)*.14),
                (math.sin(a)*.16,2.78,math.cos(a)*.14), .025, head, taper=.2)

    hands = {}
    for side in [-1,1]:
        hip = [side*.18,1.26+offset,0]
        knee = [side*(.47 if riding else .18),.73+offset,.01]
        ankle = [side*(.52 if riding else .18),.19+offset,.035]
        leg = {"type":"leg","pivot":hip,"side":side,"riding":riding}
        lower = {"type":"knee","pivot":knee,"side":side,"parent":leg,"riding":riding}
        bar("pants", hip, knee, .118, leg, taper=.81, sides=9)
        bar("pants", knee, ankle, .088, lower, taper=.72, sides=9)
        section("leather", (ankle[0],offset,.08),[(.035,.094,.16),(.17,.095,.17),(.31,.067,.08)], lower, sides=9)
        if armored:
            box("steel", (knee[0],knee[1],knee[2]+.085), (.17,.19,.065), lower)
        shoulder = [side*.35,1.925+offset,0]
        elbow = [side*.46,1.63+offset,.035]
        hand = [side*.50,1.38+offset,.115]
        arm = {"type":"arm","pivot":shoulder,"side":side,"parent":torso}
        forearm = {"type":"forearm","pivot":elbow,"side":side,"parent":arm}
        bar("steel" if armored else "team", shoulder, elbow, .098, arm, taper=.88, sides=9)
        bar("leather" if armored else "team", elbow, hand, .078, forearm, taper=.7, sides=9)
        section("skin", hand, [(-.08,.05,.055),(.065,.058,.06)], forearm, sides=8)
        if armored:
            section("steel", shoulder, [(-.105,.14,.145),(.085,.12,.13)], arm, sides=9)
            section("leather", elbow, [(-.04,.085,.085),(.045,.085,.085)], forearm, sides=9)
        hands[side] = (hand,forearm)

    hand, tool = hands[1]
    x, y, z = hand
    if unit in {"spearman","knight","scout","outrider"}:
        bar("wood", (x,y-.65,z), (x,y+1.90,z), .026, tool)
        add("steel", [(x-.09,y+1.88,z),(x+.09,y+1.88,z),(x,y+2.18,z),
                      (x-.09,y+1.88,z+.035),(x+.09,y+1.88,z+.035),(x,y+2.18,z+.035)],
            [(0,1,2),(3,5,4),(0,3,4,1),(1,4,5,2),(2,5,3,0)],tool)
    elif unit in {"archer","marksman"}:
        left, bow_motion = hands[-1]
        bx,by,bz = left
        points=[]
        for i in range(9):
            a=-math.pi/2+i*math.pi/8
            points.append((bx+.22*math.cos(a),by+.49*math.sin(a),bz+.16))
        for a,b in zip(points,points[1:]):bar("wood",a,b,.026,bow_motion)
        bar("canvas",points[0],points[-1],.008,bow_motion)
        bar("wood",(bx,by,bz),(bx,by,bz+.75),.011,tool)
        section("leather",(.16,1.63,-.27),[(-.32,.095,.085),(.32,.095,.085)],torso)
        for i in range(3):bar("wood",(.11+i*.05,1.6,-.27),(.11+i*.05,2.1,-.27),.011,torso)
    elif unit == "villager":
        bar("wood",(x,y-.43,z),(x,y+.47,z),.026,tool)
        if task == "mine":
            for side in [-1,1]:
                bar("steel",(x,y+.44,z),(x+side*.28,y+.36,z),.037,tool,taper=.24)
        elif task == "build":
            box("steel",(x,y+.44,z),(.28,.13,.12),tool)
        elif task == "food":
            points=[(x+.24*math.cos(a),y+.41+.24*math.sin(a),z) for a in [i*math.pi/6 for i in range(7)]]
            for a,b in zip(points,points[1:]):bar("steel",a,b,.019,tool)
        else:
            add("steel",[(x,y+.38,z-.045),(x+.27,y+.31,z-.045),(x+.29,y+.59,z-.045),(x,y+.48,z-.045),
                         (x,y+.38,z+.045),(x+.27,y+.31,z+.045),(x+.29,y+.59,z+.045),(x,y+.48,z+.045)],
                [(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],tool)
    elif unit == "monk":
        bar("wood",(x,.14,z),(x,2.8,z),.03,tool)
        box("gold",(x,2.65,z),(.07,.32,.07),tool)
        box("gold",(x,2.72,z),(.25,.065,.065),tool)
        section("canvas",(0,0,0),[(.16,.32,.26),(1.24,.27,.19),(1.45,.25,.18)],torso)
    else:
        bar("leather",(x,y-.12,z),(x,y+.1,z),.034,tool)
        box("gold",(x,y+.10,z),(.29,.055,.08),tool)
        box("steel",(x,y+.58,z),(.065,.95,.035),tool)
        left,shield_motion=hands[-1]
        sx,sy,sz=left
        verts=[(sx-.22,sy+.32,sz+.11),(sx+.22,sy+.32,sz+.11),(sx+.20,sy-.17,sz+.11),(sx,sy-.40,sz+.11),(sx-.20,sy-.17,sz+.11)]
        verts += [(a,b,c+.07) for a,b,c in verts]
        faces=[(4,3,2,1,0),(5,6,7,8,9)]
        for i in range(5):j=(i+1)%5;faces.append((i,j,j+5,i+5))
        add("team",verts,faces,shield_motion)
        bar("steel",(sx,sy-.22,sz+.195),(sx,sy+.22,sz+.195),.018,shield_motion)
        bar("steel",(sx-.16,sy+.06,sz+.195),(sx+.16,sy+.06,sz+.195),.018,shield_motion)

    if unit in {"sentinel","marksman","king","outrider"}:
        cape_motion={"type":"cape","pivot":[0,1.98+offset,-.15],"side":1,"parent":torso}
        verts,faces=[],[]
        for layer in [0,.018]:
            for row in range(5):
                for col in range(7):
                    u,v=col/6,row/4
                    verts.append(((u-.5)*(.58+v*.20),1.97+offset-v*1.06,
                                  -.20-v*.05+math.sin(u*math.tau*2)*(.025+v*.035)+layer))
        for row in range(4):
            for col in range(6):
                a=row*7+col
                faces.extend([(a,a+1,a+8,a+7),(a+35,a+42,a+43,a+36)])
        for col in range(6):faces.extend([(col,col+35,col+36,col+1),(28+col,29+col,64+col,63+col)])
        for row in range(4):faces.extend([(row*7,(row+1)*7,(row+1)*7+35,row*7+35),(row*7+6,row*7+41,(row+1)*7+41,(row+1)*7+6)])
        add("canvas" if unit=="marksman" else "team",verts,faces,cape_motion)
    if riding:
        box("leather",(0,1.56,-.1),(.84,.16,.71))
        for side in [-1,1]:
            section("hair",(side*.235,2.17,1.06),[(-.018,.025,.022),(.018,.025,.022)],sides=6)
            bar("leather",(side*.26,2.07,.95),(side*.46,2.03,.12),.012,torso)
        if unit=="knight":
            section("steel",(0,1.28,.62),[(-.17,.37,.20),(.18,.38,.23),(.31,.30,.19)],sides=10)

    for index, ((role,_),(verts,faces,motion)) in enumerate(batches.items()):
        obj=make_mesh(root,role,verts,faces,root.name+f"_Figure{index}")
        if motion:obj["motion"]=motion
    root["model3d"]={"kind":"unit","type":unit,"articulated":True,"figure":"adult", "variant":task if unit=="villager" else "standard", "artRevision":"field-gear"}
