## 29 October 2026 — Omit historical dead units from actor snapshots

A fresh Normal 4v4 Vast highlands AI run reached the 1,200-second diagnostic
limit with all kingdoms active. All eight reached Imperial Age and completed
second town centers. Military base damage began at 340.3 seconds, and assigned
relief troops dealt actual damage near allies. The run ended at its time limit,
not a victory. Its final authoritative state contained 574 living and 1,201 dead
units, exposing an accumulating snapshot cost.

Complete outgoing actor lists now omit dead units. Death effects and loss totals
remain separate, and authoritative history is preserved. Verified: 24 network,
projectile, visibility, remains and cleanup tests; production build. New classic
and custom-room regressions cover 100 historical corpses, a fresh death effect,
surviving actors, loss statistics and a full reconnect.

An eight-client frozen fixture with 1,280 living and 2,560 dead units sent 320
updates in each eight-second sample. Mean decoded JSON changed from 502,487 to
201,847 bytes per update; server CPU changed from 3,953 to 2,218 ms. Those are
snapshot-only measurements with external test clients, before WebSocket
compression, not internet bandwidth or rendered FPS. Long-session simulation
history/memory and broader AI/human balance remain open.

The preceding 05e2bdd workflow passed on GitHub and Render health reported the
same expected commit before this change was published.

## 29 October 2026 — Reuse snapshot indexes for visual cleanup

Multiplayer passes its freshly merged entity index to visual cleanup, avoiding
a second full entity scan and temporary filtered arrays/ID set. Dead and missing
nodes retain their disposal and batch-slot rules; callers without an index use
the entity-list path.

Verified: seven scene-cleanup, residency and snapshot-merge tests; production
build; a real 844-by-390 touch-browser multiplayer/resync check confirmed two
indexed cleanup calls, resource identity, resource updates and valid interpolated
units with no browser errors. A synthetic 6,000-entity/200-node benchmark used
39–56 ms per 100 old cleanup calls versus 0.22–2.46 ms with the existing index.
This measures cleanup alone and excludes building the already-available index.
It does not establish device frame rate.

The preceding 59a0b4c workflow completed successfully on GitHub and Render health
reported that same expected revision before this change was published.

## 29 October 2026 — Reuse fog pixels and skip unchanged texture updates

The fog canvas reuses its ImageData buffer, initializes the fixed RGB tint once,
and requests a texture update only when an alpha value or map dimensions change.
Tree visibility refreshes still run through the existing render extension.

Verified: 11 fog-pixel, visibility-protocol and rendering tests; production build;
phone-size multiplayer browser checks with no errors. Twenty unchanged real
browser updates retained the image and texture version; revealing and restoring
an unseen cell changed the version and actual canvas alpha as expected. Resource
deltas and forced resync also passed in that session. This reduces redundant
work without establishing a device FPS gain.

Before this change was published, release 81c132e was confirmed green on its
public GitHub Actions page and live on Render with matching health revision,
expected app asset, HTTP checks and a WebSocket ping. GitHub API checks were
rate limited; these checks used no API credentials.

## 29 October 2026 — Index client resource deltas and merge snapshots once

The client merges incoming actors and retained resources with indexed lookups
instead of scanning every resource for each delta. It builds entity maps without
temporary entry-pair arrays and gives all interpolated units one packet-arrival
timestamp. Full snapshots still replace resources; new troops are not tweened
from unrelated positions.

Verified: 15 client, visibility, interpolation and merge tests; production build;
an 844-by-390 touch-browser session with a second human socket connection,
30 real resource updates, preserved resource references, forced fog/resource
resync and 18 interpolated units sharing a finite timestamp. No browser errors;
the phone screenshot was inspected. The larger two-browser regression timed out
opening its second page before a match started, so it supplies no pass evidence.

A synthetic 1,280-unit/2,100-resource merge benchmark matched before/after data.
Median batches of 50 merges changed from 40.96 to 25.66 ms with 20 updates and
139.90 to 30.40 ms with 1,500 updates. These measure the merge step, not device FPS.

## 29 October 2026 — Copy only public foreign-entity fields

Snapshot preparation omits private order, route, AI and passenger fields while
copying a foreign entity, instead of copying and then deleting them. Own command
data, observed worker activity and live shelter/passenger counts are preserved.

Verified: 19,552 before/after entity views matched across eight commanders in a
saved battle. A frozen eight-client fixture with 3,380 entities sent 320 state
updates in each eight-second sample. Server CPU was 2,688 and 2,781 ms in baseline
samples versus 2,313 ms after the change; network payload size was effectively
unchanged. This measures snapshot preparation/transport, not live simulation or
device frame rate. Privacy, visibility, reconnect and congestion tests cover the
relevant multiplayer behavior.

## 29 October 2026 — Reuse exact fog-of-war circle spans

Local and multiplayer visibility use cached integer row widths instead of
repeating circular distance tests for every revealed cell. Exploration history,
map-edge clipping, allied vision and observer visibility retain their rules.

Verified: 25 visibility, custom-battle and real multiplayer tests; exact mask
comparison across multiple map sizes, radii and edges; identical serialized
battle states in four alternating before/after 200-tick runs. An isolated
1,000-call fog benchmark changed from 714 to 494 ms (about 31% less CPU time).
Full-tick median changed from 5.41 to 5.19 ms in the desktop fixture. These are
local CPU measurements, not an all-device FPS claim.

## 29 October 2026 — Reduce target-search square roots

Nearest-target queries now reject candidates outside the current surface-distance
bound before calculating a square root. Candidate order, predicates, footprint
radii and the final strict distance comparison are preserved.

Verified: 29 targeting, spatial-index, obstacle and garrison tests. Four
alternating before/after runs of the crowded battle (200 ticks each) produced
identical serialized-state hashes. Median CPU tick time changed from 6.12 to
5.79 ms and p95 from 19.57 to 16.03 ms in this sample. These are simulation-only
measurements on one desktop fixture, not an FPS or all-device guarantee.

## 29 October 2026 — Cull offscreen troop animation before posing

Batched troops outside the camera viewport now skip gait and work-action
updates while retaining current render positions for projectiles and picking.
The camera uses the same culling radius as before.

Verified: 18 focused rendering, motion, gait and action tests; production build;
338-unit browser scene with unchanged 120 drawn units, 197 calls and 992,002
triangles. Panning to another kingdom drew 51 units; returning restored 120
with finite instance matrices. The screenshot was visually inspected.
Median render time was essentially unchanged (23.5 to 23.7 ms); p95 changed
from 29.3 to 28.1 ms in this desktop sample. These paused-simulation render
measurements do not establish full-match FPS or physical-phone performance.

## 29 October 2026 — Staged offline install and runtime quality caching

Service-worker installation now precaches only the app shell, Low catalogue,
shared trees, bridge, Low color surfaces, character color, decoder and fonts
(**23.51 MB / 39 requests**) instead of every hashed asset (**70.48 MB**). High and
Balanced catalogues, normal/arm maps and KTX2 color surfaces are fetched on
first use and stored in the same versioned cache, so they remain available
offline after that quality has actually been used. Low offline still falls back
to the precached color JPEGs when KTX2 is unsupported. `/version.json` continues
to bypass the cache for update checks.

Verified: **6 focused tests** for asset selection, runtime caching and offline
registration, plus a production build. Physical-device download/startup timing
and the hosted Render revision remain open.

The texture filter applies only within `/assets/`, preserving both fonts whose
filenames contain `normal`. The canonical browser regression passed Low offline
reload/play, runtime caching of High assets, and High offline reload/play with
the origin server stopped and no unexpected browser errors. The test preserves
the selected graphics quality between reloads and uses a private preview on
port 4174. This verifies a local desktop browser; physical phone coverage remains
open.

## 25 October 2026 — Curved natural settlement roads across rolling terrain

The roads stretching from settlements across the terrain now curve naturally to
follow the landscape rather than cutting across hills in ruler-straight lines.
Both the drawn canvas texture and the 3D material mask derive from shared,
seeded meanders (`terrainRoadPaths`) that preserve consistent grass clearing,
dirt blending, and stone foundation boundaries without adding extra draw calls
or terrain triangles.

Verified: **551 serial tests**, zero regressions, production build, and all 7
biome maps ('highlands', 'canyon', 'coast', 'rivers', 'valley', 'winter',
'desert') across multiple seeds. Meander lengths stay gently bounded (between
1.002× and 1.12× direct distance) with continuous analytic road distances.

## 22 October 2026 — WebGPU on the normal game URL

The normal game address now prefers native WebGPU automatically. Players no
longer need a renderer query parameter. Missing WebGPU support or adapter
startup failure selects the established classic WebGL renderer; an explicit
`?renderer=webgl` override, including protected recovery reloads, is honored.
Settings reports the active renderer and explains compatibility fallback.
Adapter eligibility is checked before loading the native engine. The initial
candidate timed out in the failed-adapter fixture; that failure is retained,
and the final candidate enters compatibility graphics without loading the node
module in that case.

Verified: **407 serial tests**, **15 focused tests**, production
**1792670321980**, and four browser renderer cases. The ordinary URL starts
native WebGPU, switches all three detail levels without replacing the match,
and reloads offline with its node module and all three model catalogues cached.
Missing-API, failed-adapter and explicit-compatibility cases pass the same
construction, placement, night rain, portrait and landscape checks. A default-URL
landscape-touch native fault test protects the save, blocks reload when storage
fails, and restores the kingdom using explicit compatible graphics.

See [startup behavior](WEBGPU_MIGRATION.md) and
[validation evidence](artifacts/webgpu-default-validation.json). This startup
policy change does not resolve the previously measured cold-start delays or
missed frame targets. Physical devices, sustained performance and the public
Render revision remain open. The full game goal stays active.

## 22 October 2026 — Preserve model vertex sharing

Scenery merging, ownership-color baking and articulated troop batches now keep
the Blender/exporter's existing indices. Genuinely unindexed immutable Float32
inputs share only bit-identical complete vertices; hard edges, UVs, colors,
surface channels, joint assignments and triangle order remain intact. Picking
uses the corresponding index-stream ranges. No triangles or detail presets are
removed.

Verified: **406 serial tests**, **19 focused tests**, production
**1792665364111**, and native WebGPU, WebGL and unsupported-WebGPU fallback
checks at High, Balanced and Performance. Those paused four-unit checks preserve
the match and cover construction, placement, night rain, 3D portraits and
740 × 360 landscape layout.

Live Chrome WebGPU windows submitted **16.9/s** at Balanced desktop (60 target)
and **22.8/s** at Performance emulated touch (30 target). Both missed their
targets; touch simulation/wall time was **0.880**. Both report zero rendering
errors and at most seven native vertex buffers against the limit of eight.
Crowded WebGL warmup timed out separately in Edge and Chrome; no valid
measurement window is claimed for those failures. Desktop native initialization
took about 54 seconds and warmup had severe stalls.

See [the design and limits](VERTEX_REUSE_DESIGN.md) and
[successful checks and failed captures](artifacts/vertex-reuse-validation.json).
Submission counts are not display-presentation FPS or an equal-state speedup.
Native WebGPU stays opt-in. Cold starts, sustained performance, physical devices,
maximum-population workloads and the public Render revision remain open. The
overall game goal remains active.

## 22 October 2026 — AI resource-search CPU work

AI worker assignments select the five closest safe sources in one pass and reuse
the observed-enemy list only within that synchronous decision. Construction
chooses the same nearest available builder without a full sort. Stable ties,
safety, path retries, paid construction and graphics presets are preserved.

Verified: **399 serial tests**, final focused assertions, production
**1792633987231**, and six exact reference replays totaling **1,200 ticks**.
The crowded replay's 218 assignments used 268.1 ms rather than 846.1 ms in one
paired Node observation. Total timing varies; this is not an FPS guarantee.
Three evolving production-browser battle windows record:

- webgpu, medium: 12.1 submissions/s; 60 target; targetMet=false.
- webgl, medium: 20.0 submissions/s; 60 target; targetMet=false.
- webgpu, low emulated landscape touch: 28.0 submissions/s; 30 target; targetMet=false.

See [the design and scope](RESOURCE_SELECTION_DESIGN.md) and
[validation evidence](artifacts/resource-selection-validation.json). Browser
submission cadence is not display-presentation FPS. Physical devices, sustained
performance, native GPU optimization and the public Render revision remain open.
The full development goal is active.

## 22 October 2026 — Shared WebGPU device recovery

Unexpected native errors now hold the battlefield, protect local saves and offer
compatible reload. Opening a 3D portrait cannot replace error protection on its
shared device. A fault during an asynchronous rebuild cannot mark the failed
scene valid. Settings reports the active renderer and explains insecure-address
fallback.

Verified: **395 serial tests**, production **1792630432510**, four candidate
browser scenarios across Edge, Chrome and emulated landscape touch, plus the
published-build reproduction. Recovery preserves the kingdom and manual graphics
choice, blocks reload when saving fails, and renders the restored 3D scene.
Current visibility is recomputed on Resume; no exploration history is lost. See
[WEBGPU_RECOVERY_DESIGN.md](WEBGPU_RECOVERY_DESIGN.md) and
[the validation report](artifacts/native-error-release-validation.json).
Physical devices, real out-of-memory/driver failures, sustained performance and
the public Render revision remain open. The overall development goal is active.

## 22 October 2026 — Battle timing and native buffer compatibility

Foreground simulation uses bounded fixed steps independently of the visual delta
cap. Impact and healing feedback reuse their final PBR and solid 3D resources.
Native rigid-unit geometry shares immutable vertex storage, fixing the nine-buffer
pipeline failure at eight-kingdom capacity without reducing model detail. Automatic graphics also responds to held native
GPU submissions while preserving manual presets and frame targets.

Verified: **389 serial tests**, production **1792625522529**, controlled
before/after timing and feedback, High WebGL, landscape-touch Low, all three
native presets at 1,280-instance batch capacity, separate Chrome checks for all three native presets, and six crowded-battle performance
windows with zero reported rendering errors. Measured submission cadence and
missed frame-rate targets remain explicit in
[the validation report](artifacts/battle-smoothness-validation.json). See
[BATTLE_SMOOTHNESS_DESIGN.md](BATTLE_SMOOTHNESS_DESIGN.md) for reproduction.
One development GPU and emulated touch do not certify physical phones, all
seeds/populations, sustained performance or the public Render revision.
The whole-game goal remains active.

## 22 October 2026 — Clear transport landings

Transports reserve separate dry landing spaces, including the larger Blender
siege envelopes. Shore walls and hostile gates block unloading; crowded beaches
release only the troops that fit and preserve the remaining passengers. AI keeps
partially completed landings, and classic multiplayer leaves transports under
human control.

Verified: **377 serial tests**, production **1792610564505**, actual desktop
WebGL/native WebGPU and emulated landscape-touch Unload input, six authored model
envelopes, save/retry and a full eight-Hard-AI coastal battle ending normally at
1182.2 simulated seconds. See
[DISEMBARKATION_DESIGN.md](DISEMBARKATION_DESIGN.md) and
[the validation report](artifacts/disembark-release-validation.json). CPU timings
are not FPS; physical devices, broader seeds/balance and Render's public revision
remain unverified. The whole-game goal remains active.

## 22 October 2026 — Projectile impacts and coastal AI

Current source passes **370 serial regressions** and production build
**1792608202676**. Real-room tests verify shot redaction, owner mapping, reconnect,
transport cargo privacy and actual unload. Complete eight-Hard-AI seeded battles
finish on Highlands (900.9 simulated seconds, player alliance victory) and Coast
(1171.8 seconds, player alliance defeat). A separate old-save replay confirms
both formerly stuck transports unload within 17.5 simulated seconds.

Final-build browser evidence is in
`artifacts/projectile-browser-validation.json`; full battles and regression output
are in the adjacent `projectile-*` reports. See
[PROJECTILE_COMBAT_DESIGN.md](PROJECTILE_COMBAT_DESIGN.md) for exact coverage and
reproduction. Checks use one Intel GPU and an emulated 640 × 360 touch viewport.
They do not certify physical phones, sustained FPS, all seeds or player balance.
The public Render revision remains unverified; the overall release goal is active.

## 21 October 2026 — Optional WebGPU preview

Current source adds a lazy WebGPU renderer behind `?renderer=webgpu`, with the
classic WebGL renderer as the default and startup fallback. Three.js is pinned
to 0.186.1. Terrain, roads, palettes, rigid poses, water, construction, environment
and portraits have node-renderer paths. Queued battlefield submissions are
bounded, shadow sampling remains scheduled, hidden phone portraits stay idle,
and device loss uses save/rejoin recovery.

The clean publication source passes **350 serial tests** and a production build
(1792588702658). Browser checks pass native Intel Gen 11 WebGPU, classic
WebGL and forced unsupported-WebGPU fallback, each with all quality changes,
construction, storm/night, portraits and a touch landscape viewport. WebGPU
offline caching/reload and local-match startup also pass. See
[WEBGPU_MIGRATION.md](WEBGPU_MIGRATION.md) and
[the browser report](artifacts/renderer-webgpu-validation.json).

WebGPU remains opt-in pending physical-device and sustained performance testing.
The whole-game quality goal remains active. This is not full release or universal
FPS certification. Versioned 2.6.1 ZIPs retain the previous stable siege snapshot.
Render deployment and its public revision have not been verified. Separate
unfinished projectile work was excluded from that renderer milestone.

# Solid siege milestone — 16 October 2026

Verified on production 1792126674471: all 341 serial regressions; front/side/firing gameplay on High and Balanced plus 640 × 360 emulated-touch Low; actual GPU upload calls, picking and zero shader errors; real WebGL loss/restoration; overlapping Low → High requests; desktop High and phone Low partial/persistent rebuild failures, unchanged serialized match/camera, correct textures/shadows, released source leases, focused recovery, Escape handling, blocked reload on simulated full storage and successful UI retry. Current images were inspected. Browser rendering uses SwiftShader; it does not establish physical-device FPS or native phone behavior.

Solid Blender battering rams and trebuchets now have thick planks, braced frames, iron tyres, hubs, axles, a windlass and a bound counterweight box. The other 124 compressed models are unchanged. Both engines retain four animated wheels, a separate weapon joint and one opaque instanced draw each. High uses 6,572 triangles for the pair versus 7,182 previously (8.5% fewer); Low and Balanced keep the complete structural form. The Low catalogue is 4,236,080 bytes, about 70 KiB larger, within an explicit revised 4.125 MiB ceiling. High is 17,635,496 bytes and Balanced 13,031,176 bytes.

Still open: sustained physical phone/laptop performance, Safari/hybrid GPU coverage, latest-build full offline reload and multiplayer recovery sessions in real browsers, full Blender pipeline regeneration, hosted Render revision, and wider art, combat, missions, balance, interface and release-readiness work. Large JS chunks and initial caching/decoder costs remain. This milestone is not a whole-game completion, AAA-parity or 100/100 claim.

CPU suite: node --test --test-concurrency=1 tests/*.test.js. Browser checks: scripts/siege-qa.mjs and scripts/graphics-recovery-qa.mjs with QA_BROWSER_ENDPOINT pointing to an isolated loopback Chromium CDP endpoint; QA_GAME_DIST selects the built game. QA_SIEGE_QUALITIES=high and QA_SIEGE_CONTEXT=1 add context-restoration and overlapping-preset checks. See the committed validation report and selected before/after images.

# Graphics loading, memory and recovery — 16 October 2026

The game now reuses one startup WebGL context for texture capability detection and the battlefield. Fourteen full-resolution color/roughness maps can use GPU compression; all seven original normal maps remain JPEG. Unsupported GPUs and failed compressed requests use the original images. One decoder worker closes after pending work finishes. Full-precision model attributes reuse their existing buffers instead of copying the entire decoded roster. The existing Blender geometry, terrain detail, frame-rate targets and manual quality preferences are preserved.

Quality switches release unused maps, preserve live scene/portrait references, free larger downgrade targets early and prepare shader programs before replacing the displayed frame. A compact accessible progress notice stays visible; local combat waits while the replacement frame is held and resumes afterward. Optional precompilation failure falls back to normal first-frame compilation with the selected preset. Missing WebGL produces a focused reload dialog before downloading models/textures/decoders or starting offline caching.

Verified: 328 release regressions; production 1792122713315; continuous High → Balanced → Low → High → Low with real frames, finite troop poses, 126 models and correct texture counts; injected optional precompilation failure; preference reload; deliberate compressed-request failure with a rendered original-image coast; offline reload/play and a cached Balanced switch that holds local combat for 24 UI frames then resumes; desktop/landscape-touch startup failure and retry with zero heavy asset requests. All fourteen maps pass the unchanged 35 dB PSNR / 10-of-255 95th-percentile error gate through actual ASTC and BPTC decoding. See GRAPHICS_LOADING_DESIGN.md and artifacts/graphics-release-validation.json.

Tradeoff: the fourteen encoded maps download 13,629,106 bytes versus 8,631,261 bytes for the corresponding JPEGs. Their High compressed mip payload is 19,573,792 bytes, about one quarter of a full RGBA mip chain for those fourteen maps. This is texture payload, not total VRAM/RAM or an FPS result. Offline packages keep both formats plus the bundled decoder. The runs use software rendering and emulated touch; physical-device FPS, Safari/hybrid-GPU behavior, fatal scene-rebuild recovery, initial caching cost, large JS chunks and the broader game-release goal remain open. The earlier missing-glyph artifact was not reproduced in the current reviewed screenshots; its cause is not established. Full Blender regeneration and the hosted Render revision remain unverified.

# Windmill roof clearance — 16 October 2026

All three civilizations' mill rotors now turn ahead of the front gable, roof tiles and timber trim. A solid Blender bearing, axle and iron hub connect the rotor to the building. Low, Balanced, High and the procedural fallback use the corrected placement. The original roof and blade geometry is retained; the swept blade volume stays more than 0.24 m ahead of the original building geometry throughout its rotation. The added static parts merge into existing building draws.

Verification: all 312 isolated release regressions pass. Exact vertex checks cover full rotations before/after render batching for nine authored civilization/quality combinations and the three procedural variants. The original compressed mesh buffers and transforms of all 123 unrelated models are unchanged. Normalizing only the mill pivot/mount additions also recovers all 126 original model fingerprints. Repeated composition preserves all 126 fingerprints. Production 1792121849615 passes six actual rendered desktop High / 640 × 360 touch Low cases, with front/side views, rotating pivots, picking and no shader errors. Two published-version comparison cases reproduce the clipping. Phone testing uses emulated touch and software rendering, not physical-device FPS.

The complete editable Blender catalogue is preserved locally with a backup of the previous master. Complete art builds now add this selective mount stage after gates and before Balanced; the source export leaves mounts to Blender to avoid duplicates. That full regeneration sequence has not been rerun end to end. This is a targeted visual correction; broader release readiness and the hosted Render revision remain unverified.

# Water depth, coastal geometry and weather — 16 October 2026

Water now has depth tint, bank transparency, separate ripple normals, a sky-reflection approximation and broken shoreline foam. Storm strength increases motion; night lighting dims foam and changes the reflected sky. Reduced decorative motion freezes water and foliage sway, while gameplay tree-felling remains visible. Foliage previously read a nonexistent weather intensity property; it now uses the actual amount.

Balanced and High coastal water uses 20 cross-channel segments instead of eight, with the same bank coordinates. Low and narrow river meshes retain the previous budget. A 560 m coast has at most 11,200 water triangles and remains one water mesh. Animation updates uniforms without uploading water vertices or normals. See WATER_AND_WEATHER_DESIGN.md for budgets, research and limits.

Verification: all 309 isolated release regressions pass. Production 1792111282353 passes six High-quality desktop / Low-quality 640 × 360 touch browser checks covering real changing water pixels, shader errors, unchanged CPU geometry, storm particles, night lighting, zero water-pixel change under reduced motion, river replacement/disposal, and the phone layout. A previous Low-only shader candidate and the published baseline were also rendered from the same coastal view; their original reports and comparison image are retained separately. This is software rendering and emulated touch, not hardware FPS or native phone validation.

The broader goal remains active and incomplete. Reflections approximate the sky rather than depicting boats/buildings. Physical-device performance, human balance, broader visual/missions work, the hosted Render revision and complete release readiness remain unverified. Separate compressed-texture/shader-startup experiments remain unpublished.

# Villager shelter and defensive volleys — 16 October 2026

Town centers, castles and towers now shelter owned villagers, fire extra arrows and return workers to their previous jobs. Entry is real movement with reserved capacity; jobs, queued orders, carried resources and population survive sheltering. The AI shelters locally threatened workers and releases them after danger clears. Multiplayer validates ownership and keeps occupied villagers and private work orders hidden from opponents. Destruction, safe demolition, saved games, stale attack targets and sinking transports are covered by regressions. See AI_AND_MAP_DESIGN.md for controls and original balance values.

Verification: all 302 isolated release regressions pass. Production 1792108621704 passes 4 rendered checks covering the town center, castle, tower and 640 × 360 touch controls, including return-to-work, live occupant/arrow labels and separate volumetric arrow flights. The normal 2v2 Vast diagnostic ended after 10.1 simulated minutes, with 82 shelter entries, 14 return commands and 426 extra defensive arrows. The hard 4v4 Epic diagnostic reached 20.0 minutes without ending, with 254 entries and 1052 extra arrows. These deterministic battles exercise the behavior; they do not establish final human balance or guarantee match duration. The shorter 2v2 result especially requires wider balance playtesting. CPU tick timings are recorded separately from rendering FPS.

The broader goal remains active and incomplete. Software rendering and emulated touch do not prove physical-device smoothness. The hosted Render revision, human balance, wider mission/visual quality and full release readiness remain unverified. Separate graphics and water/weather experiments remain unpublished.

# Settlement AI and larger battlefields — 16 October 2026

Custom AI now establishes paid, scouted resource settlements with real builders, additional town-center production, worker allocation, defenses and foundation recovery. Threatened villagers withdraw through normal movement; economic sites participate in defense; visible buildings receive siege priorities and trebuchet escorts. A multiplayer regression caused by initializing AI planning state for human workers was found and fixed. Difficulty, pacing and allied reinforcement remain active. See AI_AND_MAP_DESIGN.md for research and behavior.

Vast (480 m) is the new custom default; Epic (560 m) adds 96% more area than the preserved 400 m Huge selection. Saved choices/layouts remain intact. Starting forests now form varied, dense lobed groves, preserving clear approaches, docks and local deposits. Three seeds × seven biomes × five sizes × eight slots pass resource/access/clearance checks; advanced starts, harvestable breaches, multiplayer determinism and legacy layouts pass. Broad rolling terrain is more pronounced without adding vertices or high-ground combat bonuses.

Verification: all 289 isolated release regressions pass. Production 1792106235903 passes 5 browser checks, including all four Epic corners, real expanded AI settlements, and 640 × 360 coarse-pointer/touch emulation with a square minimap and deselection preserving orders. The normal 2v2 Vast diagnostic completed in 27.2 simulated minutes with 15 allied reinforcement dispatches; 3/4 kingdoms completed extra centers. The hard 4v4 Epic diagnostic reached 20.0 minutes without ending, with 7/8 kingdoms reaching three completed centers. These are deterministic AI diagnostics, not a promise of match duration or final human balance. CPU tick timings are reported separately from rendering FPS.

The wider goal is active and incomplete. Software rendering and emulated touch do not prove physical-device smoothness. Human balance playtests, native phone/laptop performance, the hosted Render revision, broader visuals/missions and full release readiness remain unverified. Separate compressed-surface/shader and water/weather experiments remain unpublished and must not be staged wholesale. New forest layouts require a new battle; existing saves deliberately retain their original trees.

# Balanced foliage and catalogue checkpoint — 15 October 2026

This isolated release upgrades eight near broadleaf variants with fuller original Blender canopies and 392–393 sparse closed leaf tips per tree. The full canopy outline is retained within the declared geometry tolerance, and the trees use 64–65% of High's triangles while still merging into three material batches. Distant/evergreen forests and Low/High catalogues are preserved. Balanced selects its richer near model at 40 projected pixels, with hysteresis while moving away. The separate editable leaf patch is .tools/art-candidate/balanced-foliage/raw/frontier-foliage.blend; the complete original source remains unchanged at .tools/art-refined/frontier-assets.blend.

Balanced now downloads 12,979,076 bytes versus 16,280,868 previously (20.3% smaller despite the added detail). Its compact encoding preserves every visible triangle position/winding, UV and vertex color against the former no-quantization packing, with at most 0.003860 degrees of additional normal error. The existing source-to-no-quantization normal deviation is separately recorded (up to 0.625 degrees); do not present the additional error as the total source error. Decoded source buffer counts are measurements of catalogue buffers, not GPU VRAM, total browser RAM or FPS. Build tooling validates the precision contract before accepting a new Balanced file. The source-only frontier-foliage.glb is a build input; the browser still downloads three complete catalogues.

All 279 clean release regressions and 13 focused checks pass. Production build 1792064666043 passes six browser checks covering the three tree biomes, real villager harvesting, Low → Balanced return, and actual touch-emulated 640 × 360 controls. Deselecting on touch leaves the harvesting order intact. Candidate and unchanged-art screenshots use the same fixture. The corrected phone check verifies a coarse pointer and touch points; earlier viewport-only screenshots are not phone-input evidence. The browser is software SwiftShader, so this does not establish physical-phone compatibility, native keyboard behavior or hardware FPS.

Reports: artifacts/foliage-browser-qa.json, artifacts/foliage-art-promotion.json, artifacts/balanced-foliage-geometry.json, artifacts/balanced-foliage-batching.json, artifacts/balanced-precision-compare.json and artifacts/regression-foliage-release.txt. The full art regeneration pipeline includes the foliage patch and precision gate, but complete regeneration has not been rerun end to end. Previous graphics source hashes below refer to earlier working states. Compressed-texture/shader-transition experiments remain unpublished; their full continuous sequence, earlier software glyph artifact, broader visuals/balance, physical devices and hosted deployment still need work. The whole-game goal remains active and incomplete.

# Local kingdom save protection — 15 October 2026

Leaving a multiplayer room previously cleared the connection flag before saving the player's partial perspective over the local kingdom. The unchanged foundation release reproduced this through real WebSockets and the production menu. Save eligibility now checks the simulation's multiplayer provenance as well as the connection, even after leaving. Existing network snapshots are not offered as local saves and are preserved in storage for diagnosis. Local allied AI/campaign saves remain available. Multiplayer menus remove the local-save button and label leaving accurately; a server-closed room exits safely.

The isolated release passes all 272 regression tests, including four new storage/Simulation regressions. Production build 1792060823341 passes six browser checks: actual private room state, unchanged local save on leave, allied AI restore, refusal to resume legacy network snapshots, server-closed room handling, and the local menu at 640 × 360. The browser uses software SwiftShader with fixture rendering throttled; this is functional evidence, not phone hardware, native keyboard or FPS validation. See artifacts/local-save-before.json, artifacts/local-save-browser-qa.json and artifacts/regression-local-save-release.txt.

The full RTS goal remains active and incomplete. Compressed surfaces and graphics-transition work remain excluded from this release. Their previous High-to-Balanced runtime check stalled; broader visuals, balance, physical devices and hosted deployment still need validation.

# Foundations and gates release checks — 15 October 2026

- [Complete isolated regression](artifacts/regression-foundations-release.txt): 268 passes, zero failures. The final marker refinement is included.
- [Focused geometry/gameplay tests](artifacts/gate-foundation-focused.txt): 42 passes before the final marker refinement. Three decoded graphics catalogues cover 60 nonfarm/non-dock building variants, seven maps and 2,283 valid sampled placements per catalogue. The source architecture and authored normals stay unchanged above the plinth. This does not prove every possible map position.
- Gate tests check open/closed bars, clear entrance rays at multiple positions and four angles, source-buffer preservation, restored closing geometry and stable-pose uploads. Existing wall, farm and ownership behavior remains covered.
- [Production browser report](artifacts/foundations-browser-qa.json): six checks pass on build 1792059726497. Screenshots cover Low, High, Balanced, closed/open gates and a short landscape viewport. Software SwiftShader and a paused fixture support visual/functional conclusions only. Physical-device FPS and native touch behavior are not established here.
- [Blender editable comparison](artifacts/gate-editable-validation.json): 126 complete models, 123 unrelated models unchanged including UVs/colors/metadata/transforms. Repeat authoring reuses the two gate footings. Repeating composition with the same patch is safe; re-exporting Blender data may change compressed bytes, and Balanced must be regenerated afterward.
- Live art promotion retains a source/GLB backup and checks the validated editable SHA-256 before writing. Full Blender regeneration, broader performance, real-device play and hosted revision verification remain outstanding.

# Chat and phone camera release checks — 15 October 2026

- [Release regression](artifacts/regression-chat-release.txt): 257 passing tests, zero failures in the exact isolated source snapshot.
- [Focused network regression](artifacts/chat-network-focused.txt): nine passing tests covering team/room isolation, server identity, input limits, flood limits, bounded history, rejoining and existing multiplayer commands.
- [Browser QA](scripts/battle-chat-qa.mjs) / [recorded result](artifacts/battle-chat-qa.json): production browser checks pass. This uses software SwiftShader on this machine; desktop rendering is throttled only in the test fixture. It is functional evidence, not hardware FPS or an actual phone keyboard test.
- [Chat component browser checks](artifacts/battle-chat-panel-qa.json) pass for delayed confirmations, safe retries, reconnect history, edited drafts and composition.
- Chat is room memory only, capped at 100 messages, 240 Unicode characters per message and five messages per 10 seconds per participant. Team history remains private on rejoining. The room lifecycle and server restart discard it.
- Phone layout targets landscape with collapsed chat and minimum 44-pixel control heights; input is 16 pixels to avoid focus zoom. [VisualViewport documentation](https://developer.mozilla.org/en-US/docs/Web/API/VisualViewport) informs keyboard-aware panel placement. The existing [ws transport](https://github.com/websockets/ws/blob/master/doc/ws.md) carries chat separately from authoritative gameplay snapshots and saves.
- Full end-to-end Blender regeneration, unpublished graphics transitions/building foundations, hosted deployment verification, wider balance tests and physical device testing remain outstanding. No 100/100, universal FPS or AAA parity claim.

# Original crop fields and terrain verification — 15 October 2026

- Final isolated release suite: 252 passed, zero failed (59.43 seconds). The development suite passed 267 cases before the final outline change; nine focused real-art/terrain/outline checks then passed. Staged catalogue checks passed all eleven cases before promotion. The exact release source excludes the separate compressed-surface and shader-preparation work in progress.
- The three farm variants are original Blender geometry: Low has 48 stalks, Balanced/High 144, with closed grain, thick leaves, shallow cultivated soil, rails and a pennant. All three complete catalogues retain 126 models. Fingerprints preserve all 123 unrelated Low/High models; decoded Balanced checks retain visible triangles, material roles, silhouettes and animated joints. Low is 4,123,364 bytes, below its 4 MiB content budget; Balanced/High are 16,264,796 / 17,288,372 bytes.
- Production build 1792013667571 renders the new farms on Performance, High and Balanced with no page errors. A paid farm completes through actual worker construction. Fitted field and square selection geometry remain finite and match the terrain; maximum selection-height error in the browser fixture is below 0.000001 metre. Desktop screenshots were inspected. Reports: artifacts/farm-browser-qa.json and artifacts/farm-production-{desktop,high,medium}.png.
- Touch-enabled 640 × 360 production check passes actual farm selection, Deselect and a fitted preview, with no document overflow or page errors. The combined run's phone step timed out because the screenshot fixture had paused gameplay. The corrected phone-only check resumes gameplay before tapping and passes; the original incomplete report is retained. Report: artifacts/farm-phone-qa.json; the new phone screenshot was inspected. SwiftShader and emulated touch establish functional/visual coverage, not physical-device FPS or every-phone readiness.
- Complete editable Blender source retains all 126 entries and 123 unrelated hierarchies. The preceding source/catalogues remain in the ignored art backup. Complete regeneration now includes the farm patch sequentially, but the complete Blender regeneration sequence has not been rerun end to end. Normal deployment uses the bundled models and needs no Blender installation.
- Ordinary building/wall/gate foundations, wider visual polish, physical-device performance, broader match playtests and hosted revision validation remain open. The full quality and release goal remains active.

# Graphics, wall and phone-control verification — 14 October 2026

- Full regression suite: **224 passed, zero failed** with one test worker; production build succeeds. A preceding 219-test two-worker run had three network startup timeouts; all 219 then passed sequentially. The final run adds five wall cases. Coverage includes all owned planted walls across separate lines/individual sections, current-wall cancellation/refunds, saved long queues, Stop/queued commands, shared builders, unreachable sites, foreign ownership and real multiplayer completion. Graphics checks verify all 126 Balanced models' visible triangles, material regions, silhouettes/joints, source hashes, light-space shadow alignment, bounded refreshes, safe cache eviction/reload with scene/portrait pins, deferred GPU targets and request supersession. Muted startup opens no audio device; rejected resumes are handled.
- A production browser attempt rendered all three presets on desktop and 640 x 360 touch viewports, including High geometry in Balanced and fixed manual settings, then timed out on the final High reload. Its diagnostic is `artifacts/graphics-tiers-before-navigation-cleanup.json`. Renderer navigation cleanup was added; the subsequent attempt timed out on initial navigation (`artifacts/graphics-tiers-qa.json`). These are incomplete checks, not a full browser pass. Physical phone and sustained frame-rate validation remain open.
- Final production phone checks pass four landscape sizes (568/640/844/915 widths), two portrait sizes (320/390), actual wall cancellation/refund through Options, touch-first help, square radar, paid training/research, new-match reset and desktop controls, with zero browser errors. `artifacts/phone-layout-after.json` records the scenarios. These are emulated touch viewports rather than physical-device certification.
- Production offline verification passes all three cached Blender catalogues, all 21 maps, offline reload and actual offline gameplay, with zero page errors. The first reload exceeded the old 30-second navigation limit; the isolated rerun passes with the 90-second limit used by the other production browser checks. This is functional coverage, not a loading-speed achievement.
- Balanced is 14,742,520 bytes with High buildings/resources and Low troops/forests. Source precision is preserved; only zero-area faces are removed during packing. Texture filtering is hardware capped at 4/8/16 for Performance/Balanced/High. Directional shadows retain 1024/2048 resolution at 20/30 Hz and refresh immediately on camera or structural changes. Manual presets remain explicit choices.
- The attempted source all-quality stress baseline completed only Low, with 3 frames over a prolonged 10.8-second sample stall; the next navigation timed out. Retain `artifacts/performance-all-quality-before.json` as a failed diagnostic, not an accepted FPS baseline or proof of improvement. A complete isolated production comparison and physical-device checks remain necessary.
- `artifacts/wall-qa.json` passes actual Low/High and 640 x 360 touch rendering: 48 links and 240 solid-body coverage probes in each scene, no holes, finite transforms and real eight-section paid mouse/touch drags. Deselect preserves a moving unit's order, Done building clears placement and touch placement exits automatically. Screenshots were inspected. `walls-before.png` is a deliberately disabled-join/unrotated comparison fixture, not a capture of an older production build.
- Coastal improvements pass focused and full regressions. The final eight-Hard Huge coastal diagnostic reaches a legitimate alliance loss at 1425.5 simulated seconds, with 190 allied support events, 66 landings and 559 blocked orders. Numerical state is valid; the remaining boarding/congestion examples require further work. This does not demonstrate a global blocked-order reduction.
- These are development checks. All-preset graphics improvement, measured sustained performance, physical-device playtesting and hosted validation remain active work.

# Version 2.6.1 verification

Checked 13 October 2026. The complete quality goal remains active. These results cover the named scenarios and do not establish 100/100 quality, AAA parity or every-device readiness.

- Full current automated suite: **195 passed, zero failed**. Production build succeeds. Coverage includes original catalogue geometry, strategic/economy/campaign/network behavior, graphics preference persistence, construction materials, localized combat audio, shoreline data, day/night states and stable tree detail.
- Production night checks pass Low/High, all 126 models, actual warm window geometry, readable darker lighting, storm/rain compatibility, saved preference/reload and landscape-phone Home/command access. Report: `artifacts/night-qa.json`; screenshots show the actual built game.
- Phone layout checks cover four landscape sizes, two portrait widths, visible resource counts, square radar/navigation, paid training/research, construction/tactics, production and camera controls. At 568 x 320, default clear battlefield area with a selection rises from about 27% to 60%; primary touch controls remain at least 44px. Reports: `artifacts/phone-layout-before.json`, `artifacts/phone-layout-after.json`.
- Production combat audio checks verify original metallic melee, bow/structural/siege effects, fading active sources on camera jumps and silence for 100 offscreen attack events. Report: `artifacts/combat-audio-qa.json`.
- All eighteen troop/ship types retain triangle counts and exposed body picking in Low/High comparisons. The naval fixture has only three differing pixels of 921,600 in each quality, while draw counts fall 225 -> 172 and 237 -> 184. Three scene rebuilds retain stable memory. Reports: `artifacts/rig-visual-qa.json`, `artifacts/rig-naval-qa.json`. These isolate renderer equivalence rather than establish the art's overall quality.
- Fresh interaction/gait checks cover felling and stumps, four carried resources, interpolated cargo, ore depletion, age architecture and phone camera controls. Four Huge winter scenes plateau at 101 geometries/18 textures; forty gait frames advance by 4.1 meters of visible travel while authoritative/save state is preserved. Reports: `artifacts/interactions-qa.json`, `artifacts/locomotion-qa.json`.
- Water visual checks pass High/Low moving waves, static CPU geometry and scene cleanup without shader errors. Depth and bank-distance attributes provide the new shoreline shading. Report: `artifacts/water-visual-qa.json`.
- The current production mixed-multiplayer check passes two real desktop/phone browser clients, a third WebSocket human and one independent AI, including slot/readiness gates, privacy/ownership, paid phone training, rejoin, play after host defeat and team results. Its destructive checks run on an isolated server. Report: `artifacts/custom-multiplayer-qa.json`.
- Offline cache/reload/gameplay passes on the final night production build, with both Blender catalogues and all 21 surface maps cached. Human multiplayer requires a reachable server; a laptop-hosted same-Wi-Fi server can work without internet. Render multiplayer requires internet. Source/static deployment archives are refreshed and inspected separately from this browser check.

The short frozen renderer benchmark reduces draw submissions and instance capacity memory with unchanged triangles, but does not prove sustained simulation FPS or physical-phone performance. Art/animation, strategic depth, coastal routes, all-mode human playtesting, hardware/browser coverage and hosted operations remain full-goal work. The user reports an existing Render deployment; its public URL, deployed revision and auto-deploy setting have not been independently verified.

## Version 2.6 verification (historical)

Checked 13 October 2026. The full quality goal, including UI/UX design and style throughout the system, remains active. The game is a development beta; these checks do not establish 100/100 quality, AAA parity or universal-device readiness.

- Full automated suite: **169 passed, zero failed**. Production build succeeds. The new coverage includes safe staged art paths, GLB/Meshopt remapping and preservation, visibility-aware fruit picking, reused harvested-remains buffers, compact economy amounts and both offline-registration startup timings.
- Both complete catalogues retain 126 models. Twelve food/gold/stone variants now use native Blender branching plants and weathered ore. Near/Low sizes are 16,237,168 / 3,928,668 bytes; Low stays under its 4 MiB content budget. Native full-source composition passes: twelve replacements and 114 unrelated model hierarchies preserved. Editable source is `.tools/art-refined/frontier-assets.blend`, with a preceding backup.
- Candidate browser checks pass actual resource gathering on both detail levels and seven emulated screen sizes. They verify canvas scaling, no horizontal overflow, reachable 44-pixel primary controls, expandable objectives/camera options, square radar, paid touch training, construction access and real touch movement. A berry-center ray may hit a legitimate foreground branch from an adjacent bush; its gathering order is checked rather than requiring an occluded exact ID.
- Final production interface checks pass **18 menu/technology layouts and three large-economy profiles**, without browser errors. They cover desktop 1440 × 900, landscape 568 × 320 and portrait 320 × 568; dialog titles, focus wrapping/restoration, Escape, key-capture navigation, fields, scrollable presets and large stockpile headers are checked. Primary touch controls are at least 44 pixels; the exact resource amount remains available in labels and tooltips. Report: `artifacts/interface-qa.json`.
- The final 320 × 568 and 360 × 640 portrait regression also passes canvas dimensions, resource-header fit, camera/objective expansion, square radar, paid training, construction access and actual touch movement after the resource-grid/offline changes. Report: `artifacts/resource-candidate-phone-qa.json`.
- Production harvesting/cargo checks pass felling, persistent stumps, four resource loads, ore depletion, smooth carrying positions, one-time age mesh replacement and landscape controls. Four Huge winter matches retain **142 geometries / 14 textures**. Four cargo instances upload **256 bytes** per frame; unchanged stump matrices upload zero additional bytes. This is rendering-buffer evidence, not an FPS claim. Report: `artifacts/interactions-qa.json`.
- Production resource materials pass High/Medium/Low with all 126 models and 21 local surface maps. Campaign desktop/phone escort controls, journal, goal location, loss checkpoint recovery and save/resume pass. Reports: `artifacts/resource-visual-qa.json`, `artifacts/campaign-qa.json`.

Current local production build: **2.6.0 / 1791869175250**. The previously running Node service serves the updated client files without a restart. Latest stress and archive checks are recorded below as they complete; older results remain historical.

Current mixed multiplayer check passes two actual desktop/phone browser clients plus a third real WebSocket human and one independent AI. It verifies guest-slot changes, readiness, private economies, paid phone production, hostile-command rejection, reload/rejoin preserving queues, continued play after host defeat and correct alliance results. The destructive defeat scenario uses an isolated server and leaves the normal Wi-Fi rooms intact. Report: `artifacts/custom-multiplayer-qa.json`.

The first current offline check failed because artwork decoding finished after the load event and registration never ran. A fresh browser trace confirmed a completed document with zero service-worker registrations. Registration now runs immediately after load or once on the upcoming load event. The corrected production check passes both GLBs, all 21 surface maps, offline reload and actual gameplay, with no page errors. The temporary diagnostic and the overlapping performance run are not acceptance evidence.

The final isolated 1280 × 720 Low, 60-FPS-target test waits for the production offline cache before warming up. Intel UHD headless rendering measures **19.54 FPS**, 99 frames in 5.066 seconds, 291 draws and 392,580 triangles with 330 living units. Render submission median/p95 is **24.5 / 34.1 ms**; simulation ticks **23.5 / 42.4 ms**. No prolonged sample stall occurs, all 126 Low models remain loaded, and the frame-rate target is **not met**. Report: `artifacts/performance-qa.json`. The earlier overlapping 16.90-FPS run is retained as `artifacts/performance-contended-2.6.json` and discarded for acceptance. These are short development-laptop samples, not sustained physical-device or AAA-quality proof; differences from older builds are not an isolated attribution to one optimization.

Current laptop/Wi-Fi HTTP version and health checks pass for build 1791869175250. Fresh 2.6.0 source/static archives are generated and inspected for required files and excluded private/tool/dependency/bytecode content. Source has 191 entries; static has 37, including both GLBs and all 21 JPEGs. The static archive is for offline/AI play; online human rooms require a secure backend. These deployment artifacts do not remove the open quality/performance/physical-device requirements.

## Version 2.5 evidence (historical)

Checked 11 October 2026. This is a tested development build; the high-load performance and external playtesting requirements below remain release blockers.

## Latest quality work

The latest source/build pass adds civic arcades and facade details, field gear, species-shaped crowns, local movement interpolation, art retry and saved update notices. It also adds stronger rolling land, grass/soil/rock transitions and continuous roads across seven biomes, bounded solid pebbles and natural resource textures. Both catalogues have all 126 models; current sizes are 15,554,824/3,639,276 bytes. Seven CC0 sets provide 21 surface JPEGs totaling 15,684,309 bytes. The low-catalogue download budget is explicitly 4 MiB. The complete suite passes **156 checks, zero failures**, including shore boundaries, all-biome normalized blends, seeded/fog-aware foundation clearing and exact shared animation poses. The network timer fixture isolates perspective remapping from normal sacred-site counter resets. Earlier performance results below must not be treated as measurements of the latest terrain.

Live all-biome High/Low terrain checks pass without shader errors. Four scene replacements retain a stable 146-geometry/25-texture count and dispose each previous road mask. This was before the extra resource rock set. High/Medium/Low resource checks confirm natural rock color, tier-specific normal/roughness maps, solid gold inclusions and shared pebble textures, retaining all 126 models. Records: `artifacts/terrain-visual-qa.json` and `artifacts/resource-visual-qa.json`. Joint-prefix reuse keeps exact figure poses; cargo now follows the same local/network interpolation as figures.

Latest interaction checks pass actual tree harvesting/felling, cargo/depletion, age-model replacement and emulated landscape controls. Four Huge winter scene changes retain 133 geometries/14 textures. A moving load stays 0.42 units from its interpolated worker while authority stays at the simulation destination; that frame computes 94 joint transforms and reuses 81 prefixes. Record: `artifacts/interactions-qa.json`.

Final inspection caught dark pebbles from a shared baked-color material without a color attribute. Pebbles now use only their instance colors; procedural props and stumps provide neutral vertex colors. All 156 tests pass after the correction. Final High/Medium/Low resource checks and offline reload/gameplay pass with both catalogues and all 21 maps. Laptop and Wi-Fi HTTP/health serve build 1791704086229, checked 2026-10-11T07:38:40Z. Interaction/stress measurements precede this last prop-color correction; release ZIP refresh is pending while the user tries the live game.

The latest crowded Low run at 1280 x 720 measures **18.48 FPS**, 281 draws and 397,072 triangles with 330 live units. It records 94 frames in 5.086 seconds without a prolonged stall. Render submission median/p95 is 24.2/39.9 ms; simulation ticks 27.7/64.0 ms. The visible 153 troops compute 1,597 joint transforms and reuse 1,373 prefixes across 29 cached definitions. This still fails the selected **60 FPS** target. Earlier runs used older terrain/materials, and this short headless sample is not an isolated causal comparison or sustained hardware certification. Record: `artifacts/performance-qa.json`. No latest High stress measurement is available.

Current production Edge checks pass both catalogues, all seven biomes, naval models, working tools, picking/team colors, bounded remains, camera preservation and emulated landscape touch with no browser errors. High startup takes 10.6 seconds in this run; the settlement fixture uses 218 draws and 1,131,379 triangles. Close High forests/projectiles compile with no shader errors and retain 146 geometries/18 textures through repeated combat. Focused checks deliberately fail the artwork download, verify a usable retry, prove current civic/figure revisions and textured roof/plaster surfaces, sample movement between ticks without changing simulation positions, save before updating, and block refresh in a real human room. Reports: `artifacts/authored-art-qa.json`, `artifacts/battle-visual-qa.json`, `artifacts/visual-updates-qa.json`. These are functional/visual checks, not sustained frame-rate or physical-device certification.

The subsequent GPU-water check passes on High/Low: the same physical wave profile moves highlights across the sampled water pixels while CPU vertex/normal versions remain unchanged, and old water geometry is disposed on scene changes. Culling bounds include the wave amplitude. This eliminates that animation's per-frame geometry uploads; it is not proof of a 60 FPS achievement. `artifacts/water-visual-qa.json` records the live shader result.

Before the new terrain and joint reuse, the crowded scene measured High **13.48 FPS**, 305 draws and 1,958,126 triangles at 1280 x 720. A Low repeat after GPU-water source measured **12.24 FPS**, 294 draws and 399,532 triangles in a 5.065-second window. Both missed the selected 60 FPS target; this highlands fixture contains no water. The preceding Low sample stalled for roughly 21 seconds with a 14-second tick; it is retained separately and should not be used as a stable quality comparison. Reports: `artifacts/performance-before-gpu-water.json`, `artifacts/performance-civic-stalled-low.json`, `artifacts/performance-before-terrain-and-pose-cache.json`. Sustained optimization and reference-device validation remain open.

### Earlier checks before the civic and figure redesign

The laptop's earlier 12 FPS result is a constrained stress measurement, not the development target or a definition of acceptable graphics. [QUALITY_TARGETS.md](QUALITY_TARGETS.md) keeps the full art, animation, gameplay, missions, controls, sound, multiplayer and device goals explicit. Desktop/gaming-laptop rendering targets 60 FPS and primary-touch devices target 30 FPS, with saved 30/60 choices independent of Low/Medium/High graphics. Deadline-based frame pacing avoids accidentally halving a 60 FPS target on fractional display ticks. Automatic quality uses the selected frame budget.

The latest full automated run passes **149 checks**. The regenerated 126-model Blender catalogues retain their complete roster; curved/tapered trunks, closed broadleaf tips, varied canopy shading, bark grain and branched winter foliage with patchy snow improve forest detail. Extra broadleaf tip meshes are excluded from the smaller phone catalogue. Tree detail follows projected screen size. Near/low GLBs are 13,753,532/3,093,656 bytes. Live Blender-art checks pass all seven biomes, naval models, saved frame-rate choice, 3D picking, team colors, camera/selection preservation and landscape touch without browser errors. The updated settlement fixture submits 218 draws and approximately 862,000 triangles; richer foliage adds geometry, and this count is not a frame-rate achievement.

Ranged soldiers now use bow draw/release/recovery poses rather than melee swings; real unit cooldowns preserve firing intervals. Working villagers have a steadier off hand. Observed multiplayer workers use their public work activity/resource type to choose the same physical tools and poses as local workers, without revealing private orders.

Solid projectiles start at terrain/interpolation-aligned weapon heights and rotate along their flight arc. Live combat-effects checks verify reuse, bounded retained objects, cleanup during scene switches and a stable 146-geometry/14-texture count over the repeated attack fixture. These cosmetic effects preserve authoritative damage/timing. Idle contact shadows reuse cached terrain poses.

The live CPU profile identified ownership queries, joint animation and graphics buffer work among remaining costs. Unit/building queries now narrow candidates while preserving immediate death/ownership changes, spawning and snapshot restoration. Packed troop, forest, contact and cover matrices upload only their used prefix; unchanged troop ownership avoids repeated color uploads. The late fixture requests 103,424 bytes of troop matrices per frame instead of its 5,939,200-byte allocated capacity. This is upload-range evidence, not an FPS guarantee.

An isolated replay of the same earlier late battle logged **23 blocked orders before** retreat/formation recovery and **1 after**, while reaching normal victory. The remaining order came from the restored legacy retreat state before a new AI decision. Destination reservations keep corrected formation slots distinct around buildings; injured troops, recalled support and coastal regrouping use groups instead of repeated overlapping rally points. This demonstrates improvement in that replay, not universal route completion. Reports: `artifacts/navigation-before-formations.json` and `artifacts/navigation-audit.json`.

All ten earlier refreshed browser scenarios pass across `artifacts/latest-quality-browser-checks.json` and `artifacts/latest-extra-browser-checks.json`. The final production Blender-art check passes after partial uploads: both catalogues, all seven biomes, team colors/picking, tool changes, quality switching and landscape touch, without browser errors. Combat visual coverage is in `artifacts/battle-visual-qa.json`. The remaining interaction/offline checks are refreshed separately. Prior baseline results below retain their dates and scope.

The latest fresh eight-Hard-AI Huge coastal battle reaches normal all-building team victory at 1276.3 simulated seconds (about 21 minutes), with 165 allied-support events. Six kingdoms reach Imperial Age; two are defeated at Castle Age. First land offensives occur at 169.3-230.5 seconds from the coastal Feudal start, while naval launches occur at 168.1-712.2 seconds. Paid economy/production and transport warfare remain active. CPU tick median/p95 is 4.68/14.24 ms in the offline diagnostic. There are still 547 blocked orders across the kingdoms, so route recovery remains open even though the match reaches legitimate victory. Report: `artifacts/battle-benchmark-coast.json`. This is simulation evidence, not human difficulty or rendered-FPS certification.

## Earlier automated and visual evidence

- Production build succeeds; `npm test` passes **149 checks, zero failures**. Coverage includes the economy/combat/campaign/network baseline, Blender roster/leaf volumes/tools/joints, pooled projectile arcs/reuse, shared colors/picking/upload ranges, building bounds/cache/construction/moving pivots, solid cover/remains, frame pacing/automatic quality, eligible drop-off recovery, live ownership queries, formations and allied support/recall.
- Eight real WebSocket clients pass private team perspective, readiness, command ownership, reconnect, host defeat and alliance results. Support notices reach teammates only and have correctly remapped owners. AI alarm data is removed from every client snapshot.
- `scripts/authored-art-qa.mjs` passes live Edge checks: both 126-model Blender catalogues, actual jobs switching tools without duplicate figures, animated parts, 3D picking, team colors in shared batches, bounded bodies/rubble, seven biomes, naval models, quality switching with preserved camera/selection, and landscape touch layout. No browser errors were recorded.
- At 844 x 390, the tested selection panel is 110 pixels high, primary touch controls are at least 44 pixels tall and the radar is a 96 x 96 square. This is browser emulation, not physical phone certification.
- The updated settlement fixture uses **218 draw calls**, compared with **483** before troop/building batching. It retains the solid models and photographed surfaces. Actual crowded-battle measurements are reported separately below.
- The local production server serves version **2.5.0**. HTTP, WebSocket ping and `/health` pass. Its current Wi-Fi play address is **http://192.168.1.3:4173/**; the laptop address is **http://localhost:4173/**. The server was refreshed after verifying no clients were connected.
- All ten production-browser checks pass: edge scrolling, radar, production, commander/technology controls, staged campaigns, 3D biomes, world interactions, custom setup/pacing/weather, offline play and mixed human/AI multiplayer. The phone Home control was moved above the radar after a test found it intercepted map taps. Portrait-transition and grass-coverage assertions were updated for the new renderer. Failed attempts are retained in `artifacts/release-browser-2.5-checks.json`.
- Offline verification confirms both Blender GLBs and all nine surface maps are cached and solo gameplay starts after an offline reload.
- Static-host solo/custom/offline play and a separate frontend/backend multiplayer deployment pass against the current build. The static frontend reports unavailable multiplayer without attempting a broken socket; the configured frontend connects to the isolated authoritative server through its explicitly allowed origin. Record: `artifacts/deployment-qa.json`.
- Versioned source and static ZIPs were created and inspected: both include two GLBs and nine JPEG maps; the static ZIP has a root `index.html`; local tools, dependencies and private environment files are excluded. The actual 126-model Blender showcase was opened and visually inspected through the native connector.

## Balanced AI full match

`scripts/battle-benchmark.mjs`, seed 512, Huge highlands, eight Hard AI kingdoms, standard resources, 80-person caps and Balanced pacing reached normal all-building victory after **1214.3 simulated seconds** (about 20 minutes). Every kingdom reached Imperial Age. Major land offensives began between **240.8 and 311.6 seconds**; defense and allied support remained active beforehand. Reinforcements used existing units, regular movement and actual damage/visible threat reports. The diagnostic assigned AI control to the normal human slot only for this offline test.

CPU-only ticks had a **6.57 ms median**, **16.38 ms p95** and **85.09 ms maximum**. A separate 200-tick replay reduced the median from **11.35 to 6.29 ms** after spatial/drop-off/fog/victory optimizations. These are simulation timings, not rendered FPS. The match logged numerous blocked orders, particularly in crowded settlements; movement recovery and long-match routing still need further review. Record: `artifacts/battle-benchmark-highlands.json`.

## Crowded-battle performance

`scripts/performance-qa.mjs` restores the same earlier 780-second Huge battle, with approximately 330 surviving troops. Presets run sequentially in headless Edge, automatic quality off, with actual Intel UHD graphics through ANGLE. Render submissions and displayed-frame cadence are measured over a five-second sample after warmup. The script accepts declared profile/resolution/frame targets and reports whether the target is met; it can enforce a target as a separate acceptance gate. This machine is not the reference for every player's hardware.

| Earlier preset, 1280 x 720 | Rendered FPS | Draw calls | Render submission median | Simulation tick median |
|---|---:|---:|---:|---:|
| Low | 17.0 | 294 | 21.9 ms | 24.7 ms |
| High | 8.4 | 308 | 34.9 ms | 26.6 ms |

Both current samples miss the selected 60 FPS target. Earlier 1280 x 800 measurements were Low 19.2/High 12.1 FPS; a prior Low baseline submitted 942 draws at 13.7 FPS. The immediately preceding 1280 x 720 sample measured Low 14.5/High 14.0 FPS. These short runs vary substantially and cannot establish sustained gains; the latest High scene also has richer foliage. High remains unsuitable for this approximately 4 GB Intel UHD laptop's crowded battles. This is not a physical-phone result or evidence of broad compatibility. Files: `artifacts/performance-qa.json`, `artifacts/performance-before-partial-uploads.json`, `artifacts/performance-before-shared-batches.json`, `artifacts/render-profile.json` and late-battle screenshots. Continue optimization and defined physical-device acceptance testing.

## Remaining release work

Continue crowded-scene CPU/GPU optimization and movement recovery; verify sustained play on defined physical phones/laptops; and obtain human difficulty, mission-pacing and usability feedback. Public hosting has not been deployed. Rooms are in server memory, and public matchmaking/persistent rooms/accounts are not implemented. The implemented original 3D game is a beta; overall AAA/world-class parity and compatibility with every device have not been established.

# Archived version 2.4 verification

Checked 10 October 2026. This records observed checks, rather than a claim that all possible bugs or all device configurations have been ruled out.

## Automated game checks

`npm test`: **118 passed, zero failed**. Coverage includes paid gathering/construction/training/research; ages and civilization restrictions; counters, healing and siege; walls, gates and bridges; fleets and transports; all modes and staged campaigns; checkpoints and save compatibility; production batches; custom alliances, large-map fog/navigation/picking, each victory rule, independent AI clocks, seeded weather, real WebSocket rooms, shore-aware invasion targets, fleet population reserves, visible work animations, solid cargo/tree transforms, secure hosted endpoints and canceled reconnect timers.

Eight simultaneous real WebSocket clients exercised readiness, private economies and fog, command ownership, reconnect recovery, host elimination and alliance results. Mixed human/AI rooms also passed. These tests use isolated services and do not modify live player rooms.

## Custom battle and 3D checks

`scripts/custom-battle-qa.mjs` passed in a real Edge renderer with desktop and emulated landscape-phone layouts:

- Huge 400 × 400 battlefield, eight kingdoms, independent AI difficulty and eight army materials.
- Actual terrain clicks beyond the former ±160 picking limit and full-map radar navigation.
- Deferred unseen-mesh allocation, persistent objective scrolling/rules, and custom save/resume with a paid training queue.
- Volumetric rain with three effect draw calls; quality-limited snow, weather settings and optional lightning.
- Square minimap, touch interaction and no horizontal page overflow at 844 × 390.

`scripts/custom-multiplayer-qa.mjs` passed with desktop and phone-sized browsers, a third real WebSocket commander and an AI kingdom: guest slot choice, host/guest readiness, private local perspectives, rejected foreign commands, phone production, reload/rejoin, host defeat without ending the match, and correct alliance victory/defeat.

The machine reports approximately 4 GB RAM. Three simultaneous 3D browser contexts timed out without a JavaScript error; a later two-renderer run also timed out during startup. The current mixed-room check keeps two browser connections, suspends rendering in the background desktop host, actively renders the landscape-phone client, and connects a third real WebSocket commander. This is not a simultaneous multi-device FPS measurement. Failed attempts remain recorded in the browser report. A reconnect assertion was corrected to count both queued and completed paid units in the received resume state, because production can finish while a cold browser redraws.

`scripts/interactions-qa.mjs` passed actual harvesting, carried logs/sacks/ingots/rocks, tree falls and persistent stumps, ore depletion, one-time town-center model replacement per age change, huge-map fog/grass coverage and landscape-phone camera interaction. The scene contains no sprites. Four repeated Huge winter matches held GPU counts at **245 geometries and 11 textures** in this fixture. Cargo/stumps used at most five extra draw calls. This follows Three.js's [explicit resource disposal guidance](https://threejs.org/manual/pages/how-to-dispose-of-objects.html) and [mesh batching guidance](https://threejs.org/manual/pages/optimize-lots-of-objects.html).

## Full-match diagnostic

`scripts/battle-benchmark.mjs`, seed 512, Huge highlands, eight Hard AI kingdoms, standard resources and an 80-person cap:

- Started with the normal economy. The diagnostic alone assigned AI control to the normal human slot.
- All kingdoms reached Imperial Age. The winning alliance eliminated every opposing building through normal production and combat, finishing at **977.4 simulated seconds** (about 16 minutes).
- CPU-only simulation tick times: median **10.44 ms**, p95 **21.24 ms**, p99 **30.10 ms**, maximum **65.68 ms** on this run. These are simulation timings, not rendered FPS or phone timings.
- An earlier pre-optimization match also reached a normal result after about 29 simulated minutes. Battle length is situational, without a forced minimum timer.

Recorded artifacts include `artifacts/battle-benchmark-highlands.json`, the earlier baseline/pre-route-cache reports, custom browser JSON reports and screenshots.

The expanded coastal audit initially exposed stalled cross-shore orders, repeated harbor losses and fleet recruitment starvation. After the fixes, the eight-Hard-AI Huge coast diagnostic reached normal all-building victory at **1138.8 simulated seconds** (about 19 minutes), with all kingdoms reaching Imperial Age. It used standard starting resources, paid production and actual combat. The earlier fleet-fix run also reached victory at 778.5 seconds; flanking strategy changed the final battle's course. The final report is `artifacts/battle-benchmark-coast.json`, with failed/stalled earlier runs retained separately. It ran alongside browser checks on this low-memory machine: median tick 12.86 ms, p95 73.86 ms and a 2.51-second maximum under contention. These timings are not a standalone performance baseline or evidence of smooth phone FPS.

## Corrections made during the audit

Corrected outer-map picking, resource/harbor overlap, coastal resource access, final-load delivery after deposits/shoals are exhausted, sustained AI attack orders, final-building visibility for AI, naval boarding reservations, individual AI ownership/budgets, private research/error notices and objective scroll resets. Added straight-route checks, connected movement regions, reusable path buffers, valid-route retention, blocked-order retry limits, vision indexing and shared composition calculations. Low quality and background/menu rendering budgets reduce work; saved graphics preferences remain respected.

Further corrections include harbor rebuilding without free resources, market trade recovery at the real price threshold, current-shore army orders and retreats, legal capital scouting, searches after clearing a capital, canceled-voyage retries, formation-safe unloading beside occupied harbors, reserved fleet population, transport replacement priority, fuller siege/healer invasion crews and flanking shores chosen from observed defenses. Cargo now uses current interpolated unit positions; town-center age metadata survives batching, and allied units open modeled gate portcullises.

Live selected-object health/cargo and production countdowns now update in place. Production buttons and portrait canvases remain attached until the selection or available actions change, avoiding interrupted taps when a network snapshot updates the UI. A browser regression checks the actual training-button identity across health/timer changes while its health text and queue progress continue updating.

## Hosting preparation

The included `render.yaml` selects one **Free** Node web service in Singapore, with a health check and one simultaneous room for the small server. No expiring database or paid service is provisioned. `netlify.toml` also supports a static frontend with an optional separate secure multiplayer URL and exact server origin permissions. See [DEPLOYMENT.md](DEPLOYMENT.md) for the short setup and verified provider limits. No public site has been deployed from this workspace.

`scripts/deployment-qa.mjs` passed two isolated production builds: static solo/custom play, readable unavailable-multiplayer notices, no broken socket attempts and offline reload; then a separate frontend/backend with a configured endpoint, accepted exact origin and real WebSocket room creation. Offline manifests now follow the configured build output directory rather than accidentally using another build's assets. The report is `artifacts/deployment-qa.json`.

## Further release evidence

Ten broader browser checks and the affected reruns passed: edge scrolling, square radar, production, commander controls/tactics/technology tree, campaign checkpoint flows, solid 3D models across biomes, world interactions, custom setup/weather, offline reload/play, and custom multiplayer. The consolidated report is `artifacts/release-browser-checks.json`; failed attempts are preserved in each affected check's history. The final production/multiplayer rerun is also in `artifacts/production-stability-checks.json`. The running server was restarted with the final source after verifying that no player connections were active; its HTTP version 2.4 bundle, WebSocket ping and hosting health check passed at the laptop and Wi-Fi address. See `artifacts/live-server-check.json`. The current local addresses are `http://localhost:4173/` and `http://192.168.1.6:4173/` on the same Wi-Fi.

Physical phone/laptop FPS, sustained thermal/memory behavior, human balance and mission pacing, and delayed/lossy network play still need independent testing. Public matchmaking, persistent server rooms, accounts, professional authored assets and voice acting are outside this implemented local release. The game is an original playable RTS beta; commercial AAA parity or “100% world class” has not been established.
