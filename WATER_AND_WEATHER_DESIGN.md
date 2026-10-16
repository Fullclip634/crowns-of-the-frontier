# Water and weather rendering

The water surface uses two moving geometric waves with matching slope normals, finer shaded ripples, depth coloring, shoreline transparency and broken foam. Depth comes from the actual triangulated riverbed or seabed. Wave displacement fades at the existing navigation banks. Water animation updates shared shader uniforms rather than uploading positions or normals every frame.

The reflection term approximates the sky using the view angle and current background color. Reflections of buildings, boats and terrain are not implemented. This avoids adding scene captures, reflection textures or another water render target. The obsolete striped canvas texture is released.

Fine ripples combine three directions rather than an independent horizontal/vertical pair. Balanced and High also distort their phases with slowly moving noise, breaking up the grid that appeared in the first High-quality review. Low skips that noise calculation. Reduced motion skips the fine-ripple branch entirely. A slightly broader specular response softens the remaining highlights.

Storm strength now uses the weather renderer's actual `amount` value. It increases wave and ripple strength, and forest foliage responds to the same value. The earlier foliage code read a nonexistent `intensity` property. Night lighting dims shoreline foam and updates the reflected sky color. Reduced decorative motion freezes the water phase, removes fine ripple motion and stops decorative tree sway. Tree-felling cues remain visible because they communicate a gameplay event.

These effects do not change navigation, combat, resource production, saved map layouts or simulation randomness. The existing 3D rain, snow and cloud budgets remain in place.

## Mesh budgets

Low retains eight cross-channel segments. Balanced and High use up to 1.4 meters between coastal vertices, resolving the geometric waves more closely while sharing the same navigation-bank coordinates. Narrow rivers retain their previous mesh budget. Each channel remains one mesh with the shared water material.

| Map width | Low coastal triangles | Balanced / High coastal triangles |
| --- | ---: | ---: |
| 160 m | 1,280 | 3,200 |
| 480 m | 3,840 | 9,600 |
| 560 m | 4,480 | 11,200 |

Bounds include 0.085 meters of displacement in each vertical direction, covering the maximum storm wave scale. Depth, bank distance and all mesh data are prepared when the map or quality changes.

## Research and verification

The [NVIDIA GPU Gems water chapter](https://developer.nvidia.com/gpugems/gpugems/part-i-natural-effects/chapter-1-effective-water-simulation-physical-models) explains geometric wave sums, their analytical slopes and finer surface shading. This implementation adapts those principles to the existing RTS channels and their small, bounded waves.

Regression coverage checks numerical wave derivatives, displacement bounds, the actual navigation banks, mesh budgets, shared uniforms, weather strength, night lighting, reduced motion and tree-felling behavior. Production browser checks inspect rendered water pixels, shader errors, unchanged CPU geometry, real storm particles, scene disposal and landscape touch layout. The release checkpoint and `artifacts/water-weather-release-validation.json` record the completed runs and their exact build IDs.

Software rendering and touch emulation do not establish physical-device FPS, battery use or native input quality. Human visual review, wider devices and full-game release readiness remain ongoing work. This rendering milestone does not establish parity with commercial RTS games.
