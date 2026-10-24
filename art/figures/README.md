# Articulated character source

`figure-source.blend` contains the original fifteen articulated figures, including the four worker tool variants. It is the versioned input to the procedural refinement. It contains no town buildings, trees, siege engines or other world models.

`frontier-figures.blend` is the refined editable output. Its **Figure gallery** scene arranges the figures with collection instances; their actual source pivots remain at the origin. Switch to **Figure workshop** and enable the desired **Edit** collection to inspect or edit its meshes. The figures use the project's original cloth, leather, metal and skin materials in the Blender study. The game uses the corresponding shared baked atlas and ownership palette.

Rebuild with Blender 4.5 LTS and gltfpack available through `BLENDER_BIN` and `GLTFPACK_BIN`, or the workspace's existing `.tools` installations:

```text
node scripts/blender/build-figure-forms.mjs
node scripts/blender/validate-figure-forms.mjs .tools/art-candidate/figure-forms/full
```

The builder creates a candidate under `.tools/art-candidate/figure-forms`; it never overwrites gameplay assets. It reconstructs the original material library when needed. `--pack-existing` repacks an already authored candidate without running Blender again. The candidate's native editable file is `raw/frontier-assets.blend`.

The composer replaces only the selected body surfaces in the current complete catalogue. It checks exact fingerprints for the other 111 models and every retained figure part, including weapons and tools. The mobile export has separate per-part triangle limits; the detailed source stays editable. Mesh validation checks garment clearance, grounding, normals, geometry budgets and working tool attachment through every tier. Review the complete figures in both game renderers, working poses, crowd rendering and phone layouts before promoting the three GLBs, catalogue and editable output.

Changes to source coordinates, animation pivots, material roles or tool parents require corresponding runtime and contact validation. Gallery offsets must never be baked into the exported models. Regenerated inspection reports remain outside the source artwork.
