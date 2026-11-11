# Tripo characters — measured findings and the path to in-game use

Source: three Tripo AI exports uploaded at the repository root
(`tripo_convert_*.glb`), 36 MB total.

## What the files actually contain

| Model | Size | Triangles | Skeleton | Animations |
|---|---:|---:|---|---|
| Villager (peasant) | 10.6 MB | 357,940 | none | none |
| Knight | 14.8 MB | 500,834 | none | none |
| Archer | 10.2 MB | 348,682 | none | none |

**1.21 M triangles for three characters.** The entire shipped catalogue —
126 models, every building, tree and unit — is 851 k triangles in 4.6 MB. One
knight alone is 59% of the whole game's triangle budget.

Neither file has a skeleton or a clip, so nothing can animate them. They are
single fused scans, and the renderer animates units by rotating separate body
parts, so there is no code path that could move them even if the density were
acceptable.

## Measured ceiling after decimation

`scripts/blender/decimate-tripo-character.py` on the villager:

- 357,940 → **9,042 triangles** (97.5% reduction)
- 10.6 MB → **746 KB**
- Surface degrades visibly: the silhouette survives, the scanned detail turns
  mottled. At RTS camera distance it reads as a peasant; up close it does not.

## The rigging trap

Blender's automatic weights fail on fused scans:

```
Bone Heat Weighting: failed to find solution for one or more bones
tripo_node_... has no skin, skipping adding neutral bone data on it
```

The resulting GLB is deceptively broken: it contains `JOINTS_0` and `WEIGHTS_0`
and an animation, but **no skin**, so the mesh cannot move. `scripts/blender/
rig-tripo-character.py` avoids this by parenting with empty groups
(`ARMATURE_NAME`) and assigning weights deterministically from bone proximity,
blending the two nearest bones so joints bend instead of tearing.

Verified output on the villager: `node.skin = 0`, seven joints
(`hips, spine, head, arm.L, arm.R, leg.L, leg.R`), 21 animation channels, no
tearing at the mid-walk pose.

## What is still missing

The renderer has **no `AnimationMixer`** — only `shader-preparation.js` mentions
`SkinnedMesh`. Playing these clips needs a new animation path: clip loading, a
mixer per unit, locomotion blending, and disposal on death.

**Do not apply this to massed infantry.** Fifty skinned meshes with fifty mixers
cost more than the procedural system the game already has. The place a real
character earns its cost is the handful of unique units: the king, the monk,
campaign heroes — one to five on screen.

## Commands

```bash
# Decimate only
blender --background --python scripts/blender/decimate-tripo-character.py -- \
  tripo_convert_<id>.glb out.glb 6000 preview.png

# Decimate, rig, weight and animate
blender --background --python scripts/blender/rig-tripo-character.py -- \
  tripo_convert_<id>.glb out-rigged.glb 6000

# Render a preview at any frame of the clip
blender --background --python scripts/blender/render-model-preview.py -- \
  out-rigged.glb pose.png 7
```

Blender takes roughly twelve minutes per character on the development laptop,
almost all of it importing the 350 k-triangle source. Decimate first and rig the
decimated file to cut that to a fraction.
