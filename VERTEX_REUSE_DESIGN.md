# Indexed models without reducing detail

The model pipeline retains the Blender/exporter's existing vertex indices through
static scenery merging, ownership-palette baking and articulated troop batching.
Each joint keeps a range in the index stream, so color, depth rendering and CPU
picking address the same triangles. Per-instance ownership and pose data remain
separate.

Previously those stages expanded indexed models into one vertex per triangle
corner. Rebuilding shared storage afterward adds avoidable copying, allocation
and hashing. Retaining the original indices avoids that work and lets the GPU
reuse the original vertex records. It does not remove triangles or change a
detail preset.

Genuinely unindexed sources can share only bit-identical immutable Float32
records. Position, normal, UV, color, surface and joint channels all participate;
hash collisions are resolved by comparing every word. There is no positional
tolerance or smoothing. Raw-word copying also avoids a temporary subarray for
every vertex/channel pair. Unsupported or mutable layouts retain their data;
identity indices let otherwise incompatible indexed/unindexed inputs merge.
Already indexed inputs keep their index and attribute arrays intact.

Indices use 32 bits when necessary. The 65,535 boundary is handled conservatively
to avoid wrapping an index or using a 16-bit primitive-restart sentinel. Driver
storage may differ from initial CPU storage: the pinned native backend can
promote 16-bit indices. Native immutable Float32 channels still use the existing
interleaved layout to stay within vertex-buffer binding limits.

## Verification

The serial CPU suite has 406 passing tests. Added coverage reconstructs the exact
triangle stream, including hard edges, UVs, a one-bit color difference, signed
zero, joint values, material masks and draw ranges. A real hash-collision fixture
checks that distinct vertices survive. Large-index coverage prevents 16-bit
overflow. Integration checks preserve original shared geometry, moving gate
parts, palette surfaces, articulated poses and picking.

Production **1792665364111** passed native WebGPU, classic WebGL and deliberately
unavailable-WebGPU fallback checks at all three detail levels. Each verifies
indexed troop draws, match preservation, construction/completion, placement
tint, night rain, a 3D portrait and a 740 × 360 landscape viewport without
horizontal overflow. These are paused four-unit feature checks, not crowded
performance qualification. Native Medium has 4,800 ram vertices for 8,628
triangle-corner indices, 4,080/7,440 for the catapult and 1,154/2,562 for the
archer. Faces and their attribute values are retained.

Two live eight-kingdom battle windows completed after 90 warmup submissions:

| Case | Render submissions/s | Target | Simulation/wall time | Target met |
| --- | ---: | ---: | ---: | --- |
| Chrome native WebGPU, manual Balanced, 1280 × 720 | 16.9 | 60 | 1.000 | No |
| Chrome native WebGPU, manual Performance, emulated 640 × 360 touch | 22.8 | 30 | 0.880 | No |

Both windows report no validation or shader errors; newly observed native
pipelines use at most seven vertex buffers against the device limit of eight.
The fixture starts at 420 seconds with 399 living units across eight kingdoms
and a 160-per-kingdom limit. Capacity is not a maximum-population workload.
Scenes evolve during warmup; these are not equal-state speedup comparisons.
A GPU timestamp or render-submission count is not display-presentation FPS.

Crowded classic WebGL warmup timed out in both Edge and Chrome before a valid
measurement window. Those captures remain failures, despite the separate
functional checks passing. Native desktop setup itself took about 54 seconds
and warmup had severe stalls on this host. Startup and sustained performance
are unresolved. See [the validation report](artifacts/vertex-reuse-validation.json),
which links the successful checks and failed captures separately.

`scripts/native-pass-profile.mjs` provides a separate paused-scene diagnostic.
It warms normal game submissions before taking control, normalizes only the
fixture's derived render coordinates, and verifies the complete serialized
kingdom afterward. Its shadow-held and half-resolution variants are diagnostic
controls, never product settings. Per-pass timing comes from WebGPU
[timestamp writes](https://developer.mozilla.org/en-US/docs/Web/API/GPUCommandEncoder/beginRenderPass#timestampwrites).
When analyzing results, classify shadow refreshes and sum each row's actual pass
durations rather than comparing medians across different pass combinations.

Several paused captures stalled before measurements on the development Intel
Gen 11/2021 driver, including the prior published build. Failed captures remain
failed evidence. Browser qualification uses isolated headless profiles,
foreground-test flags and forced GPU eligibility; it does not establish support
in an unmodified browser. An additional scheduling experiment disabled VSync
and Chromium's begin-frame limiting; it also failed and is not a performance
result. These flags follow Chromium's
[test-launcher documentation](https://github.com/GoogleChrome/chrome-launcher/blob/main/docs/chrome-flags-for-tools.md)
and [frame-scheduling implementation](https://chromium.googlesource.com/chromium/src/+/2c951c8f6de48c558783859c611f3dd04a6f46a8%5E%21/).

Physical phones, broader drivers, cold-start latency, sustained frame times,
maximum-population battles and complete release readiness remain open. Native
WebGPU remains an opt-in preview, and the overall game goal stays active.
