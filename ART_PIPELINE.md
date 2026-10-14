# Blender art and runtime rendering

The deployed game includes three GLB catalogues and texture files. Playing or deploying it requires no Blender installation and no external asset service.

Balanced uses the High buildings/resources and Low troops/forests. Run `npm run art:balanced` after promoting changes to the complete High/Low catalogues; full Blender builds also generate it in their output directory. The composer copies the selected compressed hierarchy, then packs referenced vertices without simplification or another quantization pass. Packing removes only zero-area faces. Integrity checks compare all 126 decoded models' visible triangles, material regions, silhouettes and animated joints, and verify source hashes. The current Balanced file is 14,742,520 bytes; Low/High remain 3,928,668 / 16,237,168 bytes.

The catalogue contains 126 models: 66 civilization/age building variants, 18 troop/ship/caravan types plus four worker task variants, 24 forest variants and 14 resource models. The models were made for this original game. They are not Age of Empires or Warcraft assets.

## Edit and regenerate

The development installation uses Blender 4.5.14 LTS at `.tools/blender-4.5.14-windows-x64/blender.exe`. The editable generated project is `.tools/art-refined/frontier-assets.blend`. Open the current catalogue showcase with:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/blender/start.ps1 -Visible -Showcase
```

`scripts/blender/showcase.py` arranges the catalogue for inspection with material colors. The live browser applies the photographed surfaces, lighting, fog and weather. The lightweight Blender preview disables expensive viewport modifiers for this laptop.

```powershell
npm run art:build
npm run art:materials
npm run build
```

`art:build` exports the original model source, refines it in background Blender, creates adult-proportioned figures and solid worker tools, then compresses near/low GLBs with gltfpack. Bevels, baked vertex shading, normals, UVs and semantic material/joint metadata survive export. The builder runs jobs sequentially to limit memory pressure. Blender and gltfpack are development tools in `.tools`; they are excluded from deployment archives. Blender's [published minimum is 8 GB RAM](https://www.blender.org/download/requirements/), above this laptop's approximately 4 GB, so large art tasks need care.

`art:materials` downloads seven CC0 surface sets using the published Poly Haven API and verifies file sizes and hashes, reusing only verified local files. Runtime uses local bundled JPEGs, with no asset API requests. Creator credits and source links are in [the texture license](src/assets3d/textures/LICENSE.md).

On another computer, install Blender and gltfpack and set `BLENDER_BIN` and `GLTFPACK_BIN` to their executable paths before `art:build`. Normal deployment builds use the supplied GLBs and JPEGs directly.

### Staging changes safely

`npm run art:build -- --stage` writes a separate full candidate. `npm run art:build -- --stage --resources-only` authors only fourteen resource models in `.tools/art-candidate/resources`; partial builds cannot target the game's live catalogue. Staged Blender jobs use one thread and run at low process priority.

For the current field-resources pass, run `node scripts/blender/validate-candidate.mjs --resources-only`, then `node scripts/blender/compose-candidate.mjs` and `node scripts/blender/validate-candidate.mjs`. The composer replaces twelve food/gold/stone variants in both complete catalogues while preserving unrelated compressed bytes and joint metadata. It handles separate Meshopt fallback buffers and uses patch hashes to avoid appending identical resources twice. Unreferenced superseded bytes remain until a full rebake; the complete Low file still fits its declared budget.

Run background Blender with `scripts/blender/compose-editable.py` to produce the corresponding complete editable source. It checks all 126 keys, unchanged transforms and 114 unrelated model hierarchies before saving `.tools/art-candidate/full/raw/frontier-assets.blend`. The verified file is now promoted to `.tools/art-refined/frontier-assets.blend`; `frontier-assets-previous.blend` preserves the preceding source. The resource-only file remains separate and never replaces the full source.

`scripts/resource-candidate-qa.mjs` checks both detail levels, actual resource gathering clicks and seven emulated screen sizes, including paid training and touch movement. `scripts/interface-qa.mjs` covers desktop, small landscape and portrait menus, setup, settings, field guide, technology and multiplayer entry, with keyboard focus and target-size checks. Their diagnostic reports are in `artifacts` and are not deployment assets.

## In-game behavior and budgets

- The near GLB is 16,237,168 bytes (15.49 MiB); the lower detail GLB is 3,928,668 bytes (3.75 MiB). Both contain the full 126-model catalogue. Twenty-one photographed surface maps total 15,684,309 bytes (14.96 MiB). The declared low-catalogue content budget is 4 MiB; this is a download budget, not an FPS achievement.
- High uses near geometry and color/normal/roughness maps. Medium uses low geometry with color/normal maps. Low uses low geometry and color maps.
- All seven biomes have stronger rolling relief, slope/altitude/shore/road transitions and grass/soil/rock blends at their documented physical scales. A small road mask keeps paths continuous on Low geometry. Solid seeded pebbles use one instanced draw, obey exploration and clear beneath foundations; the caps are 360 on High and 120 otherwise. These cosmetic stones do not change navigation.
- Natural rock grain and normal/roughness detail replace masonry on ore deposits. Gold retains its separate metallic inclusions. Pebbles share the rock texture; building masonry stays separate.
- Food clusters use branching canes, red fruits and closed three-leaflet volumes. Uneven settled ore has rounded corners, small scattered stones and erosion; High adds solid seams aligned to the gold-bearing rock surfaces, while Low keeps solid metallic inclusions. Open foliage gaps have a visibility-aware picking fallback; actual foreground meshes retain priority.
- Covered civic arcades, front steps, facade arches, gable windows and civilization-specific roof details strengthen building silhouettes. Painted-plaster color, normal and roughness maps join the grass, wood and masonry sets.
- Adult figures include villager field packs and armored visors. Local unit positions interpolate between simulation ticks and turn smoothly without changing authoritative positions or saves. Multiplayer interpolation is bounded to its snapshot interval.
- Nested joint metadata drives runtime poses. The catalogue does not contain baked skeletal animation clips. Worker tools follow their actual gathering/building/repair task.
- Reusable joint-prefix matrices avoid repeating torso/limb calculations within each rendered unit, with numerical coverage against the original poses. The cache stores joint definitions rather than unit history. Cargo samples the same interpolated positions and turns as figures, including bounded network snapshots.
- Curved tapering trunks and branching bends support distinct oak, birch, elm and beech crown proportions. High includes sixteen smaller crown lobes with pointed closed leaf tips; the tips are excluded from the smaller phone catalogue. Winter forests have branched boughs and irregular snow patches. Bark grain and muted, varied canopy colors add surface detail. Runtime tree detail follows projected screen size.
- Bows use distinct draw/release/recovery poses, melee uses a striking arm with a steadier off hand, and firing intervals come from each unit's real cooldown.
- Arrows and siege shots start at terrain-aligned weapon heights and turn along their flight arc. Reusable meshes bound repeated combat allocation. Active cosmetic effects are released when changing scenes; they do not change simulation damage or attack timing.
- Troops share instanced batches across team colors. Visible instance IDs are packed together so picking and selection still identify the correct unit. Fog and offscreen culling reduce submitted instances.
- Buildings merge static surfaces into one opaque draw, with shared geometry for repeat structures. Flags, windmills, gates and harbor piers retain their independent transforms. Construction clipping preserves the textured material shader.
- Batched roofs retain their shared tile texture and per-owner colors, including the lighter model catalogue. Roof normals use the actual mesh rather than a wall's normal map.
- Water waves displace the actual mesh on the GPU with analytical slope normals and expanded culling bounds. They retain the earlier wave profile without uploading geometry or recalculating face normals each frame. `scripts/water-visual-qa.mjs` checks visible lighting changes, both presets, unchanged CPU geometry and disposal on scene changes.
- Terrain banks meet water level at the naval channel boundary rather than dipping below the sea outside navigable water. View-angle-dependent sky tint replaces the conspicuous scrolling stripe map. This is a lightweight lighting approximation, not a full reflection of other scene objects.
- Fine moving ripple normals add small highlights between the larger mesh waves, with lower intensity on Low. Water is treated as a dielectric surface rather than metal. Water-only pixel probes exclude ships, fish and foliage so their movement cannot pass the wave check.
- Solid grass uses one instanced draw and clears building foundations. Fallen units and flying/settling rubble are cosmetic, bounded and excluded from collision, orders and saves.
- The square radar, HUD and text remain interface overlays. The playable world and selectable objects use solid 3D meshes.
- Artwork loading requires every manifest model and offers a retry on failure. Production pages check the current build and offer a saved solo refresh; an active human multiplayer match blocks refreshing until leaving the room. Existing pages from before this feature need one normal refresh first.

Use `scripts/blender/start.ps1 -Visible -Showcase -LowPreview` for the actual lighter catalogue in Blender when authoring and gameplay would otherwise compete for memory. It saves a separate `frontier-showcase-low.blend`; the detailed editable source and the High runtime catalogue remain available.

`tests/authored-assets.test.js`, `tests/render-batches.test.js`, `tests/ground-cover.test.js`, `tests/battle-effects.test.js` and `tests/battle-remains.test.js` check catalogue coverage, outward leaf volumes, bounds, joints, tools, ownership, packing, foundations and effect limits. `scripts/authored-art-qa.mjs` reviews the live renderer, camera/selection preservation, biomes, naval models and emulated landscape-phone controls. `scripts/battle-visual-qa.mjs` captures close forests and checks live projectile arcs, pool reuse and scene-switch memory. Rendering targets and actual measured limitations are recorded separately in [RELEASE_CHECKS.md](RELEASE_CHECKS.md).
