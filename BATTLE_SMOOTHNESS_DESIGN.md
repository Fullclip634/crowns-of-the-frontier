# Battle timing and reusable feedback

The simulation now takes foreground elapsed time independently of the camera's
80 ms visual delta cap. It still advances in fixed 100 ms steps. Each callback
can process at most three steps, accepts at most 250 ms of elapsed time, and keeps
at most 500 ms of queued work. Excess time is recorded as discarded by the pacer;
severe overload can still slow play. This bounds recovery work instead of
allowing an unlimited catch-up loop.

The existing background autosave/pause behavior is preserved. Visibility changes
also clear pending timing/interpolation state and stale edge-scroll input. Saves
start with a fresh pacer; the pacer is not part of authoritative save data.
Multiplayer's server-owned simulation is unchanged.

A controlled browser reproduction runs the actual game loop through eight
125 ms callbacks. The published build advances **0.6 simulated seconds**; the
candidate advances **one second**, including after save restoration. Pause,
resume and background handling are also checked. Rendering is held during this
controlled scheduling test: it verifies timing, not device FPS.

## Feedback resources

Bursts and healing feedback now reuse their final geometry, meshes and materials.
Burst particles retain their lit PBR material, original icosahedron shape, eight
particles, colors, fade and lifetime. Healing retains the original solid torus
and double-sided transparency passes. The 3D presentation layer adjusts terrain
height without recreating those resources after every event.

Each live effect owns its material state. Concurrent colors, opacity and particle
velocities remain independent. Returned effects reset their pose and fading state.
The pool keeps up to 48 objects after excess active work returns; existing effect
caps still bound visible work. Shared geometry survives ordinary returns and is
released at teardown. Retention trades some idle memory for predictable reuse.

The full presentation-stack regression checks the final PBR particles and solid
healing geometry through repeated quiet gaps. Browser checks exercise five
separated feedback cycles with actual GPU rendering, preserve per-frame particle
uploads, and confirm the same meshes/geometry survive. Repeated cycles require
no new shader-status queries on WebGL or render-pipeline creation on WebGPU.
Shader error checking remains enabled.

The published-version reproduction makes eight repeat shader-log queries over
four post-warmup feedback cycles. The candidate makes zero. A separate live
crowded-scene diagnostic recorded fourteen queries taking about 916 ms over a
ten-second window; the initial pooling experiment recorded none. The live windows
contain evolving battles, so their FPS/CPU distributions are observations, not
a controlled percentage-speedup claim.

## Performance measurement

`scripts/capture-battle-stages.mjs` captures ordinary early, crowded and late
eight-Hard-AI battles with a configured population limit of 160 per kingdom.
Only the diagnostic controls the human slot during generation; recruitment,
resources and combat remain real. The captured stages contain 169, 399 and 474
living units. They do not saturate the configured 1,280-unit maximum.

`scripts/battle-performance-qa.mjs` counts battlefield render submissions, rather
than calls that may return without drawing. It reports held frames, CPU work,
submission cadence, simulation/wall-time ratio, actual buffer size, selected
quality, GPU identity, scene counts and optional query/CPU diagnostics. Submission
rate is not a display-presentation measurement. Warmup and sample duration are
recorded; shader profiling takes place outside the frame-rate sample.

Headless checks use emulated focus and Chromium's foreground-test flags to avoid
background/occlusion scheduling stalls. These settings are recorded with the
evidence. See [Chromium's test launcher flags](https://github.com/GoogleChrome/chrome-launcher/blob/main/src/flags.ts).
The owned launchers also use `--ignore-gpu-blocklist` for hardware qualification;
these runs do not establish native eligibility in an unmodified user browser.
An earlier headless warmup froze after one scene submission while timer-based
diagnostics remained responsive; the independent native draw/readback probe and
the foreground-configured game both render successfully. That investigation is
a test-environment finding, not a claimed production animation fix.

Desktop presets target 60 FPS; the emulated landscape-touch case targets 30.
These are unchanged targets, not achieved support claims. The development Intel
UHD Graphics / D3D11 baseline submitted about 15–21 FPS in the crowded Balanced
scene. It misses the desktop target. The committed final report records all
measured presets and their `targetMet` results without redefining the target.

The final six ten-second windows on the development Intel UHD host record
(WebGL uses ANGLE/D3D11):

| Configuration | Submissions/s | Target | Simulation/wall time |
|---|---:|---:|---:|
| WebGL Low, desktop | 24.4 | 60 | 0.995 |
| WebGL Balanced, desktop | 23.0 | 60 | 0.998 |
| WebGL High, desktop | 11.0 | 60 | 0.809 |
| WebGL Low, emulated landscape touch | 29.6 | 30 | 0.999 |
| Native WebGPU Balanced, desktop | 9.2 | 60 | 0.849 |
| Native WebGPU Automatic, desktop | 30.3 | 60 | 0.999 |

Automatic starts at High and selects Low with adaptive resolution. This is not
an equal-quality backend comparison. Only the emulated-touch window meets its
unchanged target tolerance. Severe overload still loses simulation time under
the bounded pacing policy. None of these windows certify display-presentation FPS.

The reports use one development GPU and emulated touch. They do not certify
physical phones, gaming PCs, sustained thermal behavior, all maps/seeds or the
maximum population. Broader rendering/simulation optimization, device/player
testing, startup/offline cost and the hosted Render revision remain open. The
whole-game development goal remains active.

## Native vertex-buffer compatibility

The crowded eight-kingdom, 160-population configuration exposed a native WebGPU
pipeline needing nine vertex buffers on a device allowing eight. Rigid unit
geometry now interleaves its immutable Float32 channels into shared storage before
the first upload. Dynamic ownership and instance data remain separate. Every
channel, float value, index and joint range is retained; articulated picking also
uses the interleaved positions correctly. The classic WebGL layout is unchanged.

This uses fewer buffer bindings rather than raising the required device limit.
The browser performance diagnostic records pipeline buffer counts and rejects
invalid rendering before treating its submission-rate window as usable. See
[Three.js interleaved attributes](https://threejs.org/docs/pages/InterleavedBufferAttribute.html)
and [WebGPU limits](https://developer.mozilla.org/en-US/docs/Web/API/GPUSupportedLimits)
for the relevant storage model and limits.

## Automatic graphics and native queue pressure

Automatic graphics also counts render opportunities held by the two-frame native
queue budget. A fast browser callback is no longer treated as proof that the GPU
kept up. Each existing five-second decision window combines the browser timing
with its submitted/held ratio and the selected 30/60 frame budget. It then uses
the existing detail, resolution and shadow adjustments. This is a pressure
estimate, not a GPU timestamp or display-presentation measurement.
The internal `graphicsPressure.cpuFrameSeconds` field records the browser callback
interval estimate; actual draw and tick CPU costs are reported separately.

Manual quality remains fixed. Menus, pause, hidden tabs and graphics rebuilding
clear the pressure window so their counters cannot trigger a stale downgrade.
Queue failures still release their frame slots, and no additional in-flight work
is permitted. The performance diagnostic can opt into Automatic with
`"autoQuality":true` in `BENCH_CASES`; manual measurements remain separate.

## Reproduce

Run `node scripts/capture-battle-stages.mjs`, then build with `npm run build`.
Run `node scripts/battle-performance-qa.mjs` with `QA_URL` at the built game and
optionally `QA_BROWSER_ENDPOINT` at an isolated Chromium CDP endpoint.
`PROFILE_SAVE`, `QA_OUTPUT`, `BENCH_CASES`, `BENCH_MS`, `BENCH_WARM_FRAMES` and
`BENCH_GL_DIAG=1` select the fixture, report and measurement configuration.
`BENCH_PROFILE=1` adds a separate CPU profile. The scripts leave manual quality
fixed unless a case explicitly selects Automatic, and do not enforce a lower
frame target for the development laptop.

Run `node scripts/feedback-clock-qa.mjs` against the same build for repeated
feedback, GPU uploads, pause/background and controlled timing checks. Its default
cases are High WebGL, Low landscape emulated touch, and all three native WebGPU
presets with eight-kingdom batch capacity (1,280 instances). The controlled
feedback scene does not fill that capacity; the separate crowded-stage benchmark
uses hundreds of normally recruited units.
Use `node --test --test-concurrency=1 tests/*.test.js` for the complete CPU suite.

The timing policy follows the fixed-step and bounded-recovery principles in
[Glenn Fiedler's timestep article](https://gafferongames.com/post/fix_your_timestep/).
[MDN's WebGL guidance](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices#avoid_blocking_api_calls_in_production)
explains why synchronous status queries can stall the main thread. The game
retains error validation and prevents repeated resource/program churn.
