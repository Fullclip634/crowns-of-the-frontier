# Terrain-aware character footing

Unmounted Blender figures now place each boot against the walking surface.
The existing travelled-distance gait defines a planted stance phase and a
clearance arc for the free foot. Two rigid leg chains bend to those targets;
the body lowers enough to retain the authored leg lengths. Each boot gains an
ankle motion group so its sole can follow the terrain independently of the calf.
All 36 unmounted figure variants across Low, Balanced and Near retain their
original geometry and materials. Mounted figures keep their existing riding rig.

The combined landscape query returns the displayed triangle's height and slope.
Bridge travel lanes use their arched walking surface. Completed leg transforms
are cached with the unit's position, heading, gait and terrain grid. Stationary
figures reuse them; offscreen figures skip preparation. Match attachment clears
the cache and dead units release their entries.

The body adjustment also moves projectile origins/targets and carried supplies.
Cargo receives its final vertical alignment after troop posing, before the
scheduled matrix upload, so it follows the current frame. Ground-shadow roots
retain their original surface placement. Authoritative movement, combat, economy,
save data and multiplayer commands are unchanged.

## Evidence and cost

Regression checks load the actual released meshes and cover sole contact,
multiple headings and slopes, world-space planted strides at two frame rates,
idle reuse, offscreen work, cache disposal, batching, shadow roots, bow release,
terrain triangle normals, bridge travel heights and cargo alignment. The final
focused render/terrain/archery/cargo checks pass. Run `npm test` for the full suite.

Production captures in `artifacts/foot-contact-before/` and
`artifacts/foot-contact-after/` use the same seeded slope and frozen gait phases.
All fifteen final High/Balanced native WebGPU and 568-by-320 Low WebGL views pass
without a renderer error. They are emulated views, not physical-phone testing.
Eight separate first-frame cargo checks pass in High WebGPU and phone-sized Low
WebGL; their captures are in `artifacts/foot-cargo-after/`.

`node scripts/foot-placement-profile.mjs` compares original and bound foot joint
groups for 96 figures over alternating controlled CPU windows. Moving medians
were 0.519/0.515 ms without placement and 0.628/0.551 ms with it. Idle medians were
0.559/0.536 ms and 0.454/0.455 ms respectively. Cached idle frames made no new
terrain samples; moving figures used two combined triangle queries each.
These measurements exclude rendering, simulation and device FPS.

No triangles, textures, model downloads or opaque draw batches are added.
Used pose data grows by two matrices (128 bytes) per figure; allocated texture
size also reflects its row capacity. The three-figure render fixture retains
three opaque batches and increases used pose data from 2,368 to 2,752 bytes.

Terrain discontinuities at bridge rims and steep banks still need a separate
navigation/footprint pass. Foot fitting uses bounded corrections there. Contact
between tools and irregular resource faces also needs further slope calibration.
This work improves footing; the larger visual, device and whole-game goals remain
open. Generated captures and measurement reports stay out of source commits.
