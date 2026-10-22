# WebGPU default — 22 October 2026

The normal game address now requests native WebGPU automatically. Players do
not need to add a query parameter. Settings reports **WebGPU is active** when
the native renderer starts successfully. An old bookmark containing
`?renderer=webgl` explicitly chooses compatibility graphics; remove that
parameter to restore automatic WebGPU selection. `?renderer=webgpu` remains a
supported explicit request.

WebGPU needs a supported browser/GPU and a secure connection, normally HTTPS
or localhost. A phone opening a laptop's plain HTTP Wi-Fi address may therefore
use WebGL. Unsupported WebGPU startup falls back to the established classic
WebGL renderer before installing node materials. Adapter eligibility is checked
before loading the node engine; an exposed API with no usable adapter goes
directly to compatibility graphics. The node renderer's separate WebGL backend
is not used for gameplay: it failed shader validation on the development GPU,
so compatibility graphics uses the classic renderer instead.
`document.documentElement.dataset.renderer` reports the active
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

Production **1792670321980** passed 407 serial tests and the four normal-URL/
compatibility browser cases, plus protected recovery from a native graphics fault.
The normal URL also reloads offline using WebGPU. See
[the current validation report](artifacts/webgpu-default-validation.json).

Current checks use native Intel Gen 11 WebGPU in an owned Chrome profile and
classic WebGL in owned Edge profiles, including missing-API and failed-adapter
startup. Earlier native Edge checks are retained in the preceding milestones.
Each current renderer case passes
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
Automatic WebGPU selection follows the requested migration; it does not certify
universal FPS improvement or full-game release readiness. Recent crowded native
windows missed the unchanged 60 desktop / 30 emulated-touch targets, and crowded
WebGL warmups also stalled. See [the measured limits](VERTEX_REUSE_DESIGN.md).
The older versioned 2.6.1 ZIPs remain the previous stable siege snapshot; use the
current source/deployment for this renderer behavior.

Run `node --test --test-concurrency=1 tests/*.test.js` and `npm run build`.
With a production server running, set `QA_URL` and run
`node scripts/renderer-qa.mjs`. `QA_BROWSER_ENDPOINT` attaches an owned test
browser, or `QA_BROWSER_CHANNEL` selects an installed browser (default `msedge`).
`QA_RENDERERS=webgl,webgpu,fallback` chooses checks; `QA_OFFLINE=1` adds the
offline check. Native WebGPU must actually be available for that check to pass.
`QA_RENDERERS=default,default-fallback,default-no-adapter,webgl` additionally
checks the ordinary URL, missing API, failed adapter startup and explicit
compatibility override. The default native case also supports the offline check.

References: [Three.js WebGPU migration](https://threejs.org/manual/pages/webgpurenderer),
[r186 changes](https://github.com/mrdoob/three.js/releases/tag/r186),
[version migration guide](https://github.com/mrdoob/three.js/wiki/Migration-Guide#185--186),
and [WebGPU browser requirements](https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API).
