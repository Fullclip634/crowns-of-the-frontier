# Mounted unit footing

Scout, knight and outrider horses have Blender-authored upper legs, lower legs and hooves. Their gait pairs diagonally opposite legs, as in a horse's trot ([University of Minnesota Extension](https://horses.extension.org/horse-trot/)). Movement follows distance travelled, while the visible hooves sample walkable ground and bridges. The underlying simulation positions and collision rules do not change.

The rig samples four terrain points per visible moving horse; stationary poses are cached, and off-screen units do not need new poses. Each horse uses eight additional pose matrices compared with the previous leg rig; the existing rigid batching remains in use. Ground following is an approximation at sharp terrain boundaries and is limited to normal walkable slopes. The automated terrain tests cover representative maps, headings, graphics tiers and bridge approaches, but do not establish performance on every device.

`npm run art:horse` uses Blender LTS and gltfpack to create a candidate in `.tools/art-candidate/horse-legs`; it requires the existing editable source `.tools/art-refined/frontier-assets.blend` and the configured Blender and gltfpack executables. The script checks that unrelated models and horse bodies are unchanged. Candidate files must be reviewed and promoted to `src/assets3d` before they appear in the game.

Run `npm test` for the regression suite. For the CPU-only comparison, set `MOUNTED_BASELINE` to the earlier Low catalogue and run `node scripts/mounted-footing-profile.mjs`; it does not measure GPU rendering, complete frame rate, or physical-device performance.
