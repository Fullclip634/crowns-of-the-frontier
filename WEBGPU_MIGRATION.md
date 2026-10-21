# WebGPU preview — 21 October 2026

The source build now includes a working, opt-in WebGPU renderer. Open the game
with `?renderer=webgpu` appended to its address. Use `?renderer=webgl` or remove
the parameter to return to the default compatibility renderer. On a URL that
already has a query, append `&renderer=webgpu` instead.

WebGPU needs a supported browser/GPU and a secure connection, normally HTTPS
or localhost. A phone opening a laptop's plain HTTP Wi-Fi address may therefore
use WebGL. Unsupported WebGPU startup falls back to the established classic
WebGL renderer before installing node materials. The node renderer's separate
WebGL compatibility backend is not enabled: it failed shader validation on the
development GPU. `document.documentElement.dataset.renderer` reports the active
backend in the browser console.

## Implementation

Three.js is pinned to 0.186.1 in both dependency files. A lazy module supplies
TSL terrain blending/roads, troop and building palettes, rigid joint poses,
water waves/normals/reflections/shore foam and construction clipping. Standard
materials retain their PBR textures, surface properties and node graphs when
cloned for batching, placement previews and shader preparation. Environment
lighting and visible 3D portraits use the selected renderer; hidden phone
portraits do not create another renderer.

At most two battlefield frames wait for WebGPU completion. Skipping a busy
submission preserves elapsed animation time and does not stop the simulation.
Shadow refreshes use the node renderer's light flags, preserving the existing
30/20 Hz sampling budgets. Device loss holds rendering and uses the existing
local-save/multiplayer-rejoin recovery controls; reload recovery selects WebGL.
The Blender masters, model catalogues and gameplay rules are unchanged by this
renderer milestone.

## Verification and limits

Browser checks cover native Intel Gen 11 WebGPU in an owned Edge profile,
classic WebGL, and WebGPU requested with browser support removed. Each passes
live High/Balanced/Low switching without changing the paused match, construction
and completion, placement tint, storm/night rendering, a visible 3D portrait and
a 740 × 360 touch landscape layout. The WebGPU check also caches its lazy module
and all three catalogues, reloads offline and starts a local match. An earlier
native check grows the rigid pose texture beyond 16 rows and verifies picking
among 24 rendered troops.

These are functional checks on one development GPU and an emulated touch
viewport. Physical phones, sustained frame times, thermal behavior, additional
GPU drivers and full-battle WebGL/WebGPU comparisons remain open. WebGPU still
uploads complete pose DataTextures; the WebGL path retains partial row uploads.
The default therefore remains WebGL. No universal FPS improvement or full-game
release certification is claimed. The older versioned 2.6.1 ZIPs remain the
previous stable siege snapshot; this preview is available from current source.

Run `node --test --test-concurrency=1 tests/*.test.js` and `npm run build`.
With a production server running, set `QA_URL` and run
`node scripts/renderer-qa.mjs`. `QA_BROWSER_ENDPOINT` attaches an owned test
browser, or `QA_BROWSER_CHANNEL` selects an installed browser (default `msedge`).
`QA_RENDERERS=webgl,webgpu,fallback` chooses checks; `QA_OFFLINE=1` adds the
offline check. Native WebGPU must actually be available for that check to pass.

References: [Three.js WebGPU migration](https://threejs.org/manual/pages/webgpurenderer),
[r186 changes](https://github.com/mrdoob/three.js/releases/tag/r186),
[version migration guide](https://github.com/mrdoob/three.js/wiki/Migration-Guide#185--186),
and [WebGPU browser requirements](https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API).
