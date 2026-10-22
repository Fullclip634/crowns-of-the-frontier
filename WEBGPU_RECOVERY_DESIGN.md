# Native graphics faults and recovery

Unexpected native errors now hold the battlefield and open recovery instead of
only printing a console message. The game retains the engine's diagnostics and
stores a bounded error type/message rather than the GPU event or its resources.
Repeated errors keep the same recovery state. A later device loss upgrades that
state to the disconnected-device explanation.

The model portrait and battlefield share a GPU device. In the pinned Three.js
backend, initializing another renderer replaces the device's property handler.
The game therefore keeps an independent `uncapturederror` listener on the shared
device, as well as its renderer callbacks. Opening or hiding a portrait cannot
remove battlefield protection. Reinstalling the watch removes its old listener;
teardown removes the listener and restores callbacks before disposing renderers.

## Keeping the match safe

A native backend fault requires a fresh renderer. Its recovery dialog offers
compatible reload, without retrying the same failed backend. Local simulation
and invalid frame submissions stop. The local kingdom is saved when storage is
available; a failed save blocks reload and keeps the match in memory. Repeated
faults do not repeatedly reopen the dialog. Graphics quality and the selected
frame-rate target are retained.

An error arriving during an asynchronous scene rebuild or shader warmup cannot
mark the failed scene valid, restore through the failed backend, or complete a
pending quality request. Ordinary recoverable scene failures still support the
existing retry and rollback behavior.

Reload uses the existing WebGL compatibility path. The player restores a local
kingdom with **Resume saved kingdom**. Network sessions remain authoritative on
the server and use their room rejoin path; a partial room view is never turned
into a local save. This change does not pause the multiplayer server.

## Renderer status

Settings reports the active renderer. If WebGPU was requested but the page is
insecure, the message points players to the deployed HTTPS address. A secure
page that cannot start WebGPU reports compatibility rendering. The existing
WebGL default and opt-in `?renderer=webgpu` behavior are retained.

The HTTPS requirement comes from the browser API's
[secure-context restriction](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/gpu).
[Localhost is a trusted development origin](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Secure_Contexts#potentially_trustworthy_origins);
an ordinary phone Wi-Fi HTTP address does not have the same status.

## Verification and scope

The CPU suite covers fault latching, shared-device listeners, cleanup, device
loss, errors during rebuild/warmup, and local-save versus room provenance.
`scripts/native-error-qa.mjs` opens a real shared-device portrait before creating
an intentionally invalid 16-byte buffer. It checks the actual device event,
paused simulation, held frames, unchanged match/camera, preserved manual quality,
one recovery dialog, a blocked reload under simulated full storage, and a saved
kingdom restored through compatibility rendering. Only diagnostics from the
uniquely labelled invalid buffers are classified as expected. Other graphics
errors still fail the check.

Resume recalculates current visibility. The report distinguishes exact serialized
equality from kingdom-state preservation: all other saved fields must match,
no exploration history may be lost, and any newly explored cells must be within
the restored kingdom's current visible area. Graphics settings are seeded only
once so the reload check tests the application's persisted preference.
The resumed scene must also submit real draw calls with visible troops, the
selected detail and no reported shader failure. The insecure-origin fallback
has the same rendered-frame check.

The insecure-origin case routes the built application to a reserved HTTP test
origin and checks the browser's real secure-context/API state. It verifies the
fallback status and landscape layout; it is not a physical-phone test.

The validation buffer uses incompatible mapping/storage flags, which generate
a documented [GPU validation error](https://developer.mozilla.org/en-US/docs/Web/API/GPUDevice/createBuffer#validation).
It does not allocate a large buffer or attempt to exhaust the user's GPU.
The application observes the standard
[uncaptured-error event](https://developer.mozilla.org/en-US/docs/Web/API/GPUDevice/uncapturederror_event)
and preserves the renderer's logging.

Run `node --test --test-concurrency=1 tests/*.test.js`, build the game, and run
`node scripts/native-error-qa.mjs` with `QA_URL` pointing to that build and
`QA_BROWSER_ENDPOINT` pointing to an isolated hardware-enabled Chromium CDP
endpoint. `QA_ERROR_CASE` selects quality, emulated touch, or the routed insecure
origin; `QA_OUTPUT` selects the report. `QA_EXPECT_HANDLED=0` records the published
version's earlier behavior. Reports distinguish those runs.

These controlled faults do not prove recovery from every driver hang, operating
system failure, physical out-of-memory condition, or browser shutdown. Persistent
storage denial still blocks local reload until saving becomes possible. Physical
devices, broader browser/driver coverage, sustained performance, complete release
readiness and the public Render revision remain open. The overall development
goal remains active.

Native qualification uses owned headless Edge/Chrome with foreground-test flags
and `--ignore-gpu-blocklist`. Those runs do not establish native eligibility in
an unmodified browser. This phase adds no new real-room browser reconnect test
or FPS benchmark; the existing complete CPU suite retains room and save-provenance
regressions.
