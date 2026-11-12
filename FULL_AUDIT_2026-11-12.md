# Crowns of the Frontier — Full Technical & Product Audit

**Date:** 12 November 2026
**Version audited:** 2.6.1 (`package.json`), branch `main`, HEAD `8c1a110`
**Requested scope:** deep scan of the whole game, all areas, nothing ignored; determine whether it is fully world-class / professional / standard in every area, and whether it can rival world-class 3D RTS titles on all platforms, in gameplay and in visuals.
**Method:** full-source subsystem reads (150 client modules, 9 server modules, 171 build/QA scripts, 160 test files), direct verification of the highest-impact claims against source, execution of the full test suite, execution of two production builds, inspection of measured benchmark artefacts, review of rendered gameplay screenshots, git/repo/config/deployment inspection, and external comparison against current commercial RTS benchmarks.

> **Honesty about coverage.** "100%" here means every *area* was examined — engine, simulation, AI, pathfinding, combat, economy, content, rendering, art pipeline, animation, audio, UX, input, accessibility, mobile, networking, server, security, build, CI, tests, deployment, release, legal and documentation. It does not mean every one of ~26,000 lines was read line-by-line, nor that I ran a live 8-player match on physical phones under packet loss. Areas I could not validate empirically are marked **[UNVERIFIED]** and the repository's own docs agree they are unmeasured. Where an agent finding contradicted source, I re-read the code and corrected it (see §17.4).

---

## 0. Direct answers

### Is it fully world-class, fully professional and standard in all areas?

**No.** It is not world-class in *any* single area against the commercial-RTS bar, and it is not uniformly professional across areas. What it actually is:

- **Top-tier for a solo/indie browser project** in engineering discipline, deterministic simulation design, authoritative netcode with real information hiding, test volume, dependency restraint, and honest self-documentation. I would put it in the top few percent of independent browser RTS projects.
- **Mid-tier/prototype-grade** in gameplay depth, animation, visual fidelity, audio, accessibility, localization, observability, security hardening, release engineering and operations.
- **Below playable on its own measured hardware** in crowded battles: 11–24 FPS against a declared 60 FPS target.

"World class" is a comparative claim. Against *Age of Empires II: Definitive Edition*, *Age of Empires IV*, *StarCraft II*, *Company of Heroes 3* or *Northgard*, the gap is **structural**, not a matter of polish: no skeletal animation, no armour-class damage system, no strategic economy depth, ~11–24 FPS, 3 factions vs 37–50+, 11 technologies vs ~90+, 29 synthesized sound cues vs full orchestral scores and voice acting, no replay/editor/matchmaking/ranked infrastructure.

### Can it rival world-class 3D RTS games on all platforms, gameplay and visuals?

**No — not in its current architecture, and not by iteration alone.** Three of the four load-bearing gaps require replacing or adding subsystems, not tuning:

| Structural gap | Why iteration cannot close it |
|---|---|
| **No skeletal animation** | Every GLB has `skins: 0, animations: 0`. All motion is procedural joint rotation driven by sine waves and hand-authored pose tables. A real animation pipeline (skinning, clips, blend trees, animation events, state machines, IK, ragdolls) is a new asset + runtime subsystem, not a patch. |
| **Systems depth is one generation behind** | The damage model is 6 hardcoded role multipliers plus flat armour subtraction. Adding armour classes, bonus-damage tables, conversion, relics, trade routes, farm depletion/reseeding and ballistics changes the entity/data model and every combat test. |
| **Frame budget** | 706k authored triangles in the near catalogue with no polygon LOD for units/buildings, no occlusion culling, fixed-sun shadow map, and a 70 MB payload. 11 FPS at High on its own benchmark fixture requires an art-budget and render-path rework (Blender + shaders), which the project's own sprint plan marks **Blocked**. |

### Master scores

| Dimension | Score /10 | Verdict |
|---|---:|---|
| Engineering discipline (code-level) | **7.0** | 763 passing tests, deterministic sim, two runtime dependencies, honest docs |
| Engine architecture & determinism | **7.5** | Genuinely strong core, weakened by mixin monkey-patching and split-brain MP state |
| Multiplayer correctness | **6.0** | Correct authoritative + fog-filtered design; single room, no persistence, no auth |
| Input & controls (desktop) | **8.0** | Best-in-class for a browser RTS; no gamepad, no keyboard-only play |
| HUD & interface design | **7.0** | Genuinely well art-directed; small type, weak tooltips |
| Rendering *engineering* | **7.5** | Real WebGPU + WebGL2, TSL, GPU pose textures, KTX2, residency, device-loss recovery |
| Rendering *image* (visual fidelity) | **4.3** | Coherent stylized low-poly, but no post-processing, no reflections, hard shadows |
| Animation | **2.0** | Rigid hinged parts; zero animation clips, zero skinned meshes |
| Gameplay systems depth | **3.5** | Complete loop, structurally shallow |
| AI opponent | **5.0** | Non-cheating, adaptive heuristics, fortifications, naval, allies; scalar-only difficulty |
| Content volume | **3.5** | 10 short missions, 3 factions, 18 units, 19 buildings, 14 maps |
| Audio | **4.0** | Engineered, documented, licensed — but no score, no voice acting, 29 cues |
| Performance | **2.0** | 11.0–24.4 FPS measured vs 60 target; p95 frame 79–132 ms |
| Accessibility | **4.0** | Colour-blind palette, reduced motion, high contrast; no keyboard play, no captions, zoom disabled |
| Mobile / touch | **6.0** | Real touch scheme and PWA; unverified on physical devices, no store path |
| Localization | **1.0** | Zero i18n; every string inline; English only |
| Security | **4.0** | Good XSS and traversal handling; no auth, no CSP/HSTS, permissive origin fallback |
| Release & operations | **3.5** | Health gate, release hash manifest, PWA updates; no logs/metrics/rollback/flags/tags |
| Store / commercial readiness | **1.0** | No accounts, matchmaking, privacy policy, terms, age rating, IAP, store assets |

| Composite | Score |
|---|---:|
| **Product, against commercial 3D RTS standards** | **3.6 / 10** |
| **Engineering, against professional software standards** | **6.2 / 10** |
| **Engineering, against a solo/indie browser project** | **8.8 / 10** |

The project's own internal audit (`AUDIT_2026-11-10.md:25-27`) reached 3.4/10 product and 7.2/10 engineering two days earlier. My independent audit lands in the same place, with three material updates: the test suite is now fully green, a colour-blind palette now exists, and a **newly discovered release-engineering defect** (§14.2) is confirmed by an actual failed build.

---

## 1. Method and reproduced evidence

| Check | Command / action | Result |
|---|---|---|
| Full test suite | `npm test` | **763 tests, 763 pass, 0 fail, 0 skipped**, 1,372,535 ms (**22 m 53 s**) |
| Production build #1 | `npm run build` | **FAILED** after 10 m 29 s: `EPERM ... dist/assets/frontier-near-BF3tygjM.glb` |
| Production build #2 | `npx vite build --outDir .audit-dist --emptyOutDir` | **SUCCESS**, 178 modules, **12 m 28 s**, 97 files, **70 MB** |
| Release integrity | `inspectRelease('dist')` | `ready: true, failures: []` after restoration |
| Benchmark artefact | `artifacts/battle-smoothness-performance.json` | Low 24.4 / Medium 23.0 / High 11.0 FPS vs 60 target |
| Visual | 3 rendered screenshots reviewed | §8.7 |
| External | Current AoE II DE / AoE IV platform & content scope | §5.6 |

**Incident caused and repaired during this audit.** Build #1 failed mid-emit and left `dist/` corrupted: **13 zero-byte files**, several 512 KB-truncated GLBs/KTX2s, and `dist/index.html` pointing at a **0-byte** `index-CLRRTwtc.js`. Because `vite.config.js:25` sets `emptyOutDir:false` and there is no transactional output directory, a failed build silently ships a broken game. I restored `dist/` from the verified clean build and re-validated the release manifest (`ready: true`). Temporary directories were removed. This is a real, reproducible release-engineering defect, not an environment quirk — see §14.2.

---

## 2. Ground-truth inventory

| Metric | Value |
|---|---|
| Game name / version | Crowns of the Frontier / 2.6.1 |
| Client modules | **150** `.js` + 8 `.css` in `src/` |
| Client + server source lines | **10,736** (src 10,372 · server 364) |
| Test files / lines / cases | **160** / **9,409** / **763** |
| Build & QA scripts | **171** files, ~5.9k lines |
| Runtime dependencies | **2** (`three@0.186.1`, `ws@^8.22.0`) |
| Dev dependencies | 3 (`vite`, `@playwright/test`, `playwright-core`) |
| TypeScript / ESLint / Prettier / coverage tool | **None** |
| 3D assets | 6 GLBs, `src/assets3d` **67 MB**; 126 models, 1,405 meshes, **706,222 triangles** (balanced catalogue) |
| Textures | 14 KTX2/UASTC 1024² with 11 mips; 7 Poly Haven CC0 1k sets; 512² character atlas |
| Audio | **29** WAV cues, ~804 KB, 22,050 Hz mono PCM |
| Production output | **70 MB / 97 files**; minified JS 2.13 MB (628 KB gzip) + 39 MB GLBs |
| Simulation | **10 Hz** fixed step, seeded mulberry32 RNG with serialized state |
| Multiplayer | Authoritative server, **5 Hz** snapshots, 8 slots, `MAX_ROOMS=1` in production |
| Population | 160 per kingdom, 8 kingdoms → theoretical 1,280 units |
| Content | 4 resources, 4 ages, **18 units**, **19 buildings**, **11 techs**, **3 factions**, **14 maps**, **10 missions**, **9 modes**, 4 difficulties |
| Git | 1,551 tracked files, **3,705 untracked**, **0 tags**, `.gitignore` has 9 patterns |

---

## 3. Architecture and simulation — 7.5/10

### 3.1 What is genuinely excellent

- **Fixed-timestep deterministic simulation, cleanly separated from rendering.** `SIMULATION_STEP = 0.1` (10 Hz) in `src/simulation-pacing.js:1`. `SimulationPacer.advance()` clamps elapsed to 0.25 s, caps the accumulator at 0.5, and limits catch-up to 3 steps/frame — a real spiral-of-death guard. Network extrapolation uses a hardcoded 200 ms window (`src/motion-smoothing.js:37`).
- **Determinism is real, not aspirational.** All simulation randomness is `seededRandom` (mulberry32, `src/data.js:83`) and `rngState` is serialized and restored in `Simulation.serialize/restore` (`src/simulation.js:476-477`). Verified: no `Math.random` or `Date.now` in `simulation.js`, `commander-ai.js`, `navigation.js`, `frontiers.js`, `campaigns.js`, `custom-battle.js` or any AI module. `Math.random` appears only in render/audio/UI (`world.js:185`, `soundscape.js`, `main.js`).
- **Save/load is composable and validated.** Eight `installX(Simulation)` mixins layer `serialize`/`restore`/`tick` (`simulation.js:480-486`), covering projectiles (`projectile-state.js:19-39` validates fields), AI memory, fog `explored`, campaign checkpoints, garrison clocks and queued orders (entities are serialized wholesale).
- **Game-loop hygiene.** Tab visibility gates ticks, `visibilitychange` auto-saves/pauses and resets the pacer, hidden tabs render at 1 FPS, modals at 10 FPS. Camera/UI `dt` clamped to 0.08 s, render `dt` to 0.2 s (`main.js:554-569`).
- **Context-loss and graphics recovery** is a real pipeline: `onDeviceLost`/`uncapturederror` → `graphicsFatal` → recovery UI, WebGL reload URL, rig restore on `webglcontextrestored`, telemetry redaction (`render-context.js:42-65`, `graphics-compatibility.js:14-25`, `rig-batches.js:58`).

### 3.2 What is not professional

- **Mixin monkey-patching is the architecture.** Eight installers overwrite `Simulation.prototype.serialize`, `.tick`, `.emit` and `Simulation.restore` in a load-bearing, undocumented order. Reordering `simulation.js:480-486` silently drops save fields. This is fragile and untestable in isolation.
- **Split-brain state.** Single-player has one truth (`sim`). Multiplayer has a fog-filtered server projection patched field-by-field into the client `sim` (`main.js:587`) while `net.bind(sim)` monkey-patches command methods to forward to the server (`network.js:40`). `main.js` also holds ~25 module-level UI state variables and duplicates `accumulator` from `simulationPacer`.
- **`main.js` is a 593-line god-module** holding DOM, input, modals, HUD, loop, save, network and audio wiring, while 70 of 150 modules are under 40 lines and `server/rooms.js` is a 1-line re-export. The module count is fragmentation, not cohesion.
- **O(n) hot paths at the unit cap.** `get(id)` is `entities.find` (`simulation.js:50`); `owned()` allocates a new array per call (`:63-66`); `nearest()` falls back to a full scan when `max=Infinity` (`:278`, hit by `assignWorker` and `nearestDrop`); splash damage loops all entities (`:308`); `updateFog`/`tickShrines` `filter` every tick (`:434,443`).
- **Server tick has no accumulator.** One global `setInterval(...,100)` ticks **all** rooms with `sim.tick(.1)` (`server/team-rooms.js:209-227`). An event-loop stall silently slows every match, and there is no `try/catch` around that tick — one throw kills the process and all rooms.
- **No observability.** The server message handler is a blanket silent `catch{}` (`:206`); boot logs one line (`server/index.js:7`). No metrics, structured logs, traces or crash reporting anywhere.
- **Minor:** `tutorialStep` is never serialized (`simulation.js:41,476`); `discardedSeconds` is dead (`simulation-pacing.js:12`); `view.adapt(elapsed)` receives unclamped delta (`main.js:564`); `local-save.js:6,12` swallows storage errors.

---

## 4. Gameplay systems and content — 3.5/10

### 4.1 Content inventory (verified against `src/data.js`)

| Category | Count | Detail |
|---|---:|---|
| Resources | 4 | food, timber, gold, stone (`data.js:3`) |
| Ages | 4 | Frontier / Feudal / Castle / Imperial (`data.js:2`) |
| Units | **18** (16 trainable) | villager, scout, spearman, archer, man-at-arms, knight, ram, trebuchet, healer, sovereign, 3 faction uniques, cart, 4 naval (`data.js:14-25,88-113`) |
| Buildings | **19** | TC, house, farm, mill, camp, mine, barracks, range, stable, workshop, blacksmith, market, tower, keep, wall, gate, monastery, wonder, harbor (`data.js:26-45,107`) |
| Technologies | **11** | 7 generic + 3 faction + seamanship; max levels 3/3/3/3/3/1/1/2 (`data.js:46-54,93-97,114`) |
| Factions | **3** | Alder / Sunward / Raven: **5 flat scalars each** (`buildingHP, infantryHP, gather, cavalry, cost`) + 1 unique unit + 1 unique tech (`data.js:56-60`) |
| Maps | **14** | 7 with tactical elevation; fixed mirrored template with biome overlays, not random-map scripts |
| Modes | **9** | tutorial, skirmish, regicide, survival, dominion, wonder, sandbox, tides, custom |
| Missions | **10** | 3 stages each, ~424 words of dialogue (per internal audit) |
| Difficulty | 4 | story/normal/hard/brutal — **scalar timers only** (`data.js:61-65`) |

### 4.2 Combat model — the deepest structural gap

Damage is `max(1, n − max(0, armor − penetration))` (`simulation.js:302`), where `n` is a base value scaled by age (+12%/age), techs (+20%/level), faction, terrain and **6 hardcoded role multipliers** (`:295-300`):

```
spear→cavalry ×3 · ranged→spear ×1.5 · cavalry→ranged ×1.7
siege→building ×3 · ram→non-building ×0.22 · non-siege→building ×0.65
```

Armour is a flat subtraction (`unitArmor = base + tech*2 + shieldDrill*2`, `:304`). **There are no armour classes, no bonus-damage tables, no hidden soft-counter matrix.** This is the single biggest reason the game cannot rival AoE II: the entire counter-play depth of that genre comes from armour-class × bonus-damage interactions.

Also absent: monk conversion (the "monk" is a pure healer with `damage:0`, `data.js:23`), relics and relic victory, friendly fire, morale/routing, minimum range on siege, attack priority, terrain line-of-sight blocking, and per-unit attack animations/frame delays. Projectiles are **timed events, not physics**: `flightDuration = clamp(distance/34, .14, .65)` (`combat-timing.js:7`), aim is a release-time snapshot, arrows home to the original target ID regardless of movement (`projectile-combat.js:17,34`), with **no leading/ballistics, no accuracy, no miss chance, no projectile blocking**. Kiting and attack-ground micro are therefore meaningless.

Stances: 2 (aggressive/hold, `tactics.js:32`). Formations: 3 (square/line/column), implemented **only as destination offsets** (`simulation.js:203`) and not maintained in transit. Local avoidance is soft (units overlap by design, `:252-255`). No RVO/boids.

### 4.3 Economy

Gather rates 3.1/2.9/2.6 per second, carry capacity 18 (`:375,383`), drop-off walk to nearest TC/mill/camp/mine. **Farms are infinite** — `data.js:29` gives farms no `amount`, so `target.amount ?? Infinity` (`:383`) removes farm depletion and reseeding entirely, deleting a core macro loop. Market is a fixed 100→130 gold swap (`:201`); **no trade carts, no trade routes, no distance-based gold**, so there is no gold income to fight over. Population is 1 per unit; no carry-capacity upgrade, no idle-villager cycling, no auto-reseed for human players (`:354`).

### 4.4 Map and navigation

A\* on a `CELL=2` grid: `WORLD=160` → 80×80 = 6,400 cells (custom 560 → 78,400), 8 neighbours, octile costs, binary heap, typed-array scratch, LOS short-circuit and flood-fill connectivity labels (`navigation.js:79-155`). Dynamic re-blocking for walls and bridges is a real strength (`bridge-navigation.js:66-73`). But there is **no flow field, no group path, no hard collision, no RVO**. Each unit independently resolves a formation slot; the code contains explicit engineering around chronic blocked orders (`simulation.js:264-267`, `commander-ai.js:51-56`, `bridge-navigation.js:14-26` "restoreBridgeOccupants") — evidence of a persistent bottleneck, not a solved solution. Map generation is a **fixed mirrored template** with hardcoded resource clusters and start positions (`simulation.js:89-137`), which removes scouting-based adaptation. Cliffs are smooth `tanh` terraces and **never impassable**; elevation combat (+25%/−15%) exists on only 7 of 14 maps. No relics, no Gaia/neutral tribes.

### 4.5 Game modes and competitive infrastructure

Present: campaign (10 missions), skirmish, regicide, survival, dominion, wonder, sandbox, naval tides, custom 2–8 slots with teams/AI difficulty/map size/pop cap/start age/3 victory rules/tribute, AI-vs-AI spectator with full vision, tutorial (5 objectives), local save/load.

**Absent:** replay recording/playback, scenario/map editor, observer-with-fog, matchmaking, ranked ladder, accounts, persisted match history, hotkey-build `ControlGroup` persistence across saves, tournament/observer delay. These are not polish — they are the infrastructure that makes an RTS *competitive*.

### 4.6 Feature comparison against Age of Empires II: DE

| Feature | AoE II DE (2026) | This game | Gap |
|---|---|---|---|
| Civilizations | 37+ base, 8 DLCs adding ~31 more | 3, 5 flat scalars each | **Critical** |
| Armour classes / bonus damage | Extensive hidden tables | None; 6 role multipliers | **Critical** |
| Technologies | ~90+ | 11 | **High** |
| Monk conversion / relics / relic victory | Yes | Absent; monk = healer | **Critical** |
| Farms | Finite, must reseed | Infinite | **High** |
| Trade carts / distance gold | Yes | Fixed 100→130 swap | **High** |
| Ballistics / leading / accuracy | Researchable, miss chance | Snapshot aim, arrows home, never miss | **Critical** |
| Friendly fire (siege) | Yes | None | **High** |
| Stances / formations | 4 stances, maintained formations | 2 stances, 3 spawn offsets | **High** |
| Elevation / cliffs | Global, impassable cliffs | 7/14 maps, passable slopes | **Medium** |
| Garrison | Archers fire, murder holes | Villagers only | **Medium** |
| Random map scripts | Yes, many sizes | Fixed mirrored template | **High** |
| Replay / editor / ranked / spectator | Yes | None (AI spectator only) | **High** |
| Platforms | PC, Xbox, PS5, Mac (May 2026) | Browser only | **High** |
| Presentation | 4K, remastered score, full voice | 1k textures, 29 cues, wordless barks | **High** |

AoE IV adds 4K HDR, 8 base civilizations plus DLC, 8-player PvP/PvE, historical campaigns, and a purpose-built engine with skeletal animation and physics — a different production class entirely.

---

## 5. AI — 5.0/10

Genuinely more capable than a typical indie RTS. Four layers: legacy skirmish `tickAI`, a `CommanderAI` mixin (`commander-ai.js`, 362 lines), frontier/naval AI, and per-owner custom-battle AI up to 8 owners. Verified behaviours: build priorities, boom to 20–48 workers, houses/drop-offs/farms, age-ups, all 11 techs, second-TC expansion gated on age ≥2 / ≥22 workers / ≤3 bases, defensive response, town-bell garrison, timed raids, wounded retreat (28%/50% HP thresholds), scouting, healer/repair support, siege targeting walls and gates, naval transports and amphibious landings, and **ally coordination** via `teamAlarms`/`alliedSupport` (`allied-ai.js:26-113`, custom mode only). Army composition reacts to observed enemy roles with decaying memory (`commander-ai.js:131-149`), and `canSee` is honoured — **the AI does not cheat on fog**.

Weaknesses: all 4 difficulties differ only by scalars (attack timer 220/150/95/65 s, tick multiplier, wave size, worker targets) — no difficulty-specific strategy or build orders. It is a large heuristic `if/else` ladder, not a planner, behaviour tree, utility AI or learning system. The internal sprint document records a known scout-feint exploit whose correct fix was **reverted** because it reduced commander reach in a benchmark, and notes the remaining work needs human playtests (`PLAN_CREDIBILITY_SPRINT.md`).

---

## 6. Rendering and visual fidelity — engine 7.5/10, image 4.3/10

### 6.1 Renderer (verified)

Both backends are **real**: `render-context.js:6` builds a WebGL2 `WebGLRenderer`; `:17-25` prefers native WebGPU via `navigator.gpu.requestAdapter({featureLevel:'compatibility'})` + `three/webgpu` `WebGPURenderer` with TSL node materials (`render-runtime.js:8`), falling back to WebGL2. `rendererBackend()` reports `webgpu | nodes-webgl | webgl`. A Compatibility-Mode WGSL fix and `?renderer=` override exist (`graphics-compatibility.js:7-24`).

**No post-processing of any kind.** No `EffectComposer`, bloom, SSAO, TAA/FXAA/SMAA, HDR float target, colour grading/LUT, DOF or motion blur. Only MSAA. `ACESFilmicToneMapping` + sRGB + exposure 1.1 (`world.js:45`) are three.js output transforms, not a post stack. IBL is a **128×64 canvas gradient** through PMREM at `environmentIntensity = 0.3` (`visual-depth.js:20-30`). "Contact shadows" are 1,024 instanced 64×64 radial-gradient billboards (`:45-55`), not AO. Shadows: one fixed `DirectionalLight`, `PCFShadowMap` (not soft/VSM), 2048/1024 map, ortho ±55, bias −0.00025, refreshed at 20/30 Hz (`world.js:48`, `shadow-sampling.js:5-23`). No cascades. **The sun never moves** — day/night is a colour/exposure lerp only (`day-night.js:41-61`).

### 6.2 Assets and animation — the decisive gap

6 GLBs: three catalogues (low 4.59 MB / balanced 13.66 MB / near 17.68 MB), trees 2.66 MB, foliage 0.44 MB, bridge 0.20 MB. 126 models / 1,405 meshes / 706,222 triangles in the balanced catalogue; ~853k authored triangles total. Baked vertex colours + shared palette materials.

**The three catalogue tiers are not polygon LOD.** `catalogue.json:531-533` explicitly states "no second simplification pass… no triangle simplification" — they are precision/composition variants. Only tree far-canopies are genuinely decimated. `ART_PIPELINE.md:113` cites stale sizes and omits the balanced tier.

**Characters are rigid posed meshes, not skeletal.** `userData.motion` tags are posed by per-frame CPU matrix math (`world-polish.js:77-137`), merged into one `InstancedMesh` per unit-type/variant with a GPU `DataTexture` of one mat4 per joint per instance sampled in the vertex shader (`rig-batches.js:7-79`, `render-nodes.js:100-117`). **Zero `SkinnedMesh`, `Skeleton`, `AnimationMixer`, glTF animations, morph targets or animation clips.** ~16 procedural joint channels (`wheel, horseleg, knee, leg, torso, head, cape, sail, oar, ram, siege, forearm, arm, ankle, workerTool, bow`) and ~10 states. Gait is distance-driven sine (`locomotion.js:11-20`), work strokes are 5-key hand-authored tables (`action-poses.js:4-18`), with one scalar `blend` — no blend trees. One narrow analytic 2-bone leg IK plants boots on terrain (`foot-placement.js:21-31`); no full-body IK, no foot locking, no ragdolls (death = flattened static mesh, `battle-remains.js:8-21`).

Git history shows a **Tripo-scan-to-rigged-character pipeline was added (`9b92972`) and then deleted** (`9135557`, `b555d4f`, `3e75b00`, `5b61181`, `4d0bef0`, `17bc7c2`, `8c1a110`) — an attempt at real character art that was rolled back. The sprint plan explicitly declines the "skinned-animation bet".

### 6.3 Materials, batching, terrain, water, effects

Real KTX2/Basis UASTC (14 files, 1024², 11 mips) with BC/ASTC feature detection (`surface-codecs.js:7-13`), but **normal maps are uncompressed 1k JPG**, no 2k/4k, no streaming (all roles eagerly loaded). ~37 shared standard materials, 7 texture sets + 1 character atlas, anisotropy 16/8/4 by tier.

Batching is aggressive and real: rigid unit batches, trees, ground cover, pebbles, 1,024 contact shadows, weather (1,400 rain / 1,000 snow / 36 clouds), fire/smoke, remains, partial uploads via `addUpdateRange`. **Measured 71–173 draw calls, 0.20M–1.42M triangles** (`artifacts/ai-world-browser-qa.json`). Culling is manual per-instance sphere-vs-frustum; **no occlusion culling, no impostors, no indirect/mesh shaders**. LOD: 2 levels, **trees only**, hard 34 px pop with 0.82 hysteresis (`tree-lod.js:1-11`).

Terrain: one `PlaneGeometry` at 160 segments (25,921 verts / 51,200 tris), CPU noise deformation, baked 1536² composite + per-vertex `terrainMix` 3-way blend + 512² road mask. **No cliffs, no decal system, no per-pixel splatmap, no triplanar/parallax, no quadtree/chunks.** Water is a custom GLSL/TSL shader with 2-sine displacement, slope normals, depth absorption, Fresnel against a **flat sky gradient** and shore foam — **no planar reflections, SSR, refraction, scene cubemap, caustics or flow maps**. Weather and day/night are light-value lerps; rain/snow are instanced cylinders/icosahedra; no volumetrics, wetness PBR, puddles or accumulation.

Effects: pooled ballistic projectiles, unlit `MeshBasicMaterial` instanced spark/shard bursts, flat ring craters, heal/death tori, fire/smoke cones, charred building shells + rubble, static corpses. **No screen shake, no damage numbers, no hit flash.** **Health bars do exist** — `renderHealth()` in `main.js:339` builds a DOM overlay refreshed at ~3.3 Hz from `renderHUD()` (`:336`), for damaged/selected/visible entities; the earlier internal audit's claim that they are absent is incorrect (§17.4).

Performance engineering is the strongest visual area: 3 quality tiers + auto from `deviceMemory`/`hardwareConcurrency`/coarse pointer (`main.js:62-64`), async quality transitions with checkpoint/restore, pixelRatio 1/1.25/2, `adapt()` scaling `dynamicScale` 0.62–1.0 every 5 s, `SurfaceResidency` pin/evict/trim, catalogue disposal and byte diagnostics. But **quality decisions use CPU frame `dt`, not GPU timing** — no `EXT_disjoint_timer_query` / timestamp queries anywhere; only WebGPU queue backpressure (`render-flight.js:3-18`).

### 6.4 Visual rubric (0–10)

| Category | Score | Reason |
|---|---:|---|
| Renderer & post-processing | 4 | Real WebGPU+WebGL2/TSL, but zero post stack |
| Geometry & asset fidelity | 5 | 126 models / 706k tris, low-poly, no true poly LOD |
| Materials & textures | 5 | Genuine KTX2/PBR/ARM, but 1k only, 7 sets |
| Animation & rigging | **2** | No skinning, no clips, no blend trees, no ragdolls |
| Terrain / water / environment | 4 | Custom shaders, but no cliffs/decals/SSR/refraction |
| Lighting & atmosphere | 4 | Fake 128×64 IBL, fixed sun, no GI/volumetrics |
| VFX & combat feedback | 3 | Health bars exist; unlit particles, no shake/hit flash/numbers |
| Performance engineering | 8 | Residency, auto-scaling, real context-loss recovery |
| **Overall image** | **4.3** | Strong engine, mid-indie image |

### 6.5 Honest screenshot assessment

I reviewed `artifacts/3d-desktop-game.png`, `artifacts/ai-world-expanded-settlement.png` and `artifacts/battle-smoothness-crowded-native.png`. The visual identity is **coherent and genuinely well art-directed**: a restrained dark-green/cream/teal palette, elegant Cormorant Garamond serif HUD, low-poly timber-and-plaster buildings with blue roofs, soft tree canopies, readable isometric camera. The front end is commercial-grade for an indie title. That is a real achievement and should not be dismissed.

But: units are tiny at RTS zoom and hard to tell apart (clone armies differing only by tint), the lighting is flat and uniformly lit, shadows are hard and stair-stepped, water reflects nothing, there is no atmospheric depth, and there is no sense of impact or weight to combat. In a crowded 8-kingdom scene the screen is dominated by HUD panels and buildings while the actual battle is nearly invisible. Compared to AoE II DE's hand-painted directional sprites with baked lighting and destruction frames, it wins on true 3D but loses on **readability and art richness**. Against AoE IV it is not in the same medium. Against a strong Three.js demo it is above average on engineering, below on visible polish.

---

## 7. Audio — 4.0/10

29 authored WAV cues (`public/audio/manifest.json`): 6 UI + 20 combat (5 kinds × 4 variants) + horn + rain + pad, ~804 KB, 22,050 Hz mono PCM. Procedural layers: oscillator UI tones (`audio.js:14-22`), combat synthesis (`combat-audio.js:41-70`), wind/bird/drum ambience (`soundscape.js`), rain/thunder (`weather-audio.js`), and wordless formant "barks" (4 kinds × 3 factions × pitch mods, `voice-system.js:4-34`). **No composed score** — an 8-note sine drone plus a pad bed. **Zero recorded voice lines.**

Positional audio is `StereoPanner` + distance gain only — no HRTF/PannerNode, no occlusion, no reverb. One master gain (`volume * .24`) and one compressor; **no bus separation, no ducking, no per-category sliders**. Autoplay unlock/resume is handled correctly. Licensing is exemplary: `public/AUDIO_LICENSES.txt` (CC0, synthesized), `ICON_LICENSES.txt` (Lucide ISC/MIT, game-icons.net CC BY 3.0), SIL OFL fonts, and an in-game credits panel.

---

## 8. UX, input, HUD, accessibility — desktop 8.0, accessibility 4.0

**Input is the strongest product area.** Verified in `main.js`: drag selection box, shift-add, double-click same-type within 40 world units, Ctrl+1–9 groups, shift+right-click waypoint queues, right-click smart commands and rally points, attack-move (`F`), patrol/guard (`R`/`G`), stop (`X`), idle villager (`.`), edge scroll, WASD/arrows/Q/E/V/wheel/middle-drag, minimap click-jump and right-click order, pinch zoom, zoom clamp 16–112 (160 custom), and **20 remappable actions with collision validation** (`controls.js:1-19`, `keyboard-settings.js`). Missing: gamepad (zero `getGamepads` references), mouse-button/chord remapping, keyboard-only unit selection or targeting, visible waypoint markers.

**HUD:** live resource bar with ARIA, age/time/speed/pause, 3D unit portrait, HP bar, production queue with cancel/progress, tech tree, idle-villager button, garrison/shelter controls, toasts with `aria-live`, raid horn, minimap with terrain/entities/fog/camera box/objective. Tooltips are native `title=` only — no cost hover cards, no disabled reasons. **No minimap ping/flare, no shared-vision control, no rich tooltips.**

**Mobile is a real touch scheme, not a shrunken desktop:** tap-select, tap-ground smart-command, drag-pan, pinch zoom, double-tap same-type, 22 px touch-pick fallback, 44 px targets, collapsible panels, breakpoints at 520/600 px landscape/portrait (`phone-hud.css`, `compact-hud.js`). Gaps: no touch box-select or additive multi-select, no long-press, no one-handed layout, 8–9 px labels, and only bottom safe-area inset despite `viewport-fit=cover` (landscape notch clips HUD).

**Accessibility:** wins are a real Okabe-Ito colour-blind team palette (commit `bf2b6fa`, `custom-battle.js:18-19`), high-contrast and reduced-motion toggles, `aria-live`/`aria-pressed`, `:focus-visible` outlines, SR-only chat, and a modal focus trap. Fails: **keyboard-only play is impossible** (no keyboard path to select a unit or target a point; the 3D world is a bare labelled `<div>`), no font-scaling control (all px), `maximum-scale=1.0,user-scalable=no` blocks browser zoom (`index.html:3`), no captions/subtitles, no screen-reader game-state live region.

**Localization: 1.0/10.** No i18n framework, no string externalization, no translation keys — every string is inline in template literals across dozens of files (`main.js:69-87,198-230`, `custom-battle-ui.js`). English only, `toLocaleString('en-US')`, no RTL, no pluralization. A second language means rewriting the UI.

**Onboarding:** a wall-of-text help modal instead of an interactive tutorial (`main.js:228-229`), an orientation nag, and a single-line "Preparing your kingdom…" loading screen with **no progress, percentage or cancel** (`main.js:101`) while 70 MB loads.

---

## 9. Networking and server — 6.0/10

**Design is correct and above prototype grade.** The server is authoritative, running `new Simulation(...)` and `sim.tick(.1)`; the client never ticks when `net.active`. It sends fog-filtered `state` snapshots every 2nd tick = **5 Hz** (`team-rooms.js:216`). Information hiding is genuine: `entity-perspective.js:3-18` strips private fields, `combat-perspective.js:3-15` strips pending projectile damage, visibility deltas are sequenced and out-of-order packets rejected with a `visibility-resync` (`network-visibility.js:29-45`). Reconnect uses 128-bit `randomBytes(16)` resume tokens, a full `begin` snapshot within ~115–120 s, and the match **pauses** so nobody gains time. Command validation includes `owns()` filtering, 160-id slicing, arg validation, an 80 msg/s rate limit, `maxPayload: 24000`, bufferedAmount backpressure, and a 20 s heartbeat. Chat is burst-limited (5/10 s), control/bidi stripped, and XSS-safe (`textContent`, `esc()`).

**Weaknesses:** no command sequence numbers or acks (fire-and-forget, `network.js:39`); hardcoded 200 ms extrapolation; `originAllowed` returns `true` for a missing `Origin` (`server/origins.js:2`); tokens in `sessionStorage`; coordinates allowed to 1e9; `buildWallLine`/`unload`/`townBell`/`returnToWork` skip the `owns()`/`canSee` filtering that `build` applies (`:134-145,293-296`); unguarded `JSON.parse(event.data)` (`network.js:23`); one global 100 ms interval for all rooms with no try/catch; in-memory `Map` rooms, max 8, deleted 150 s after disconnect; no persistence, no horizontal scaling, no auth, no matchmaking; **production `MAX_ROOMS=1` on a Render free instance that sleeps after 15 min idle** (`render.yaml:13`, `DEPLOYMENT.md:9-13`). One unauthenticated client can occupy the only room indefinitely.

---

## 10. Performance — 2.0/10 — the primary blocker

Measured by the project's own harness on an Intel UHD integrated-GPU laptop, 8-player crowded highlands fixture, 400 world, 160 pop, 10 s samples (`artifacts/battle-smoothness-performance.json`):

| Quality | Measured FPS | Target | Median frame | p95 frame | Sim speed |
|---|---:|---:|---:|---:|---:|
| Low | **24.4** | 60 | 32.4 ms | 78.9 ms | 0.99× |
| Medium | **23.0** | 60 | 38.5 ms | 87.2 ms | 1.00× |
| High | **11.0** | 60 | 71.1 ms | 132.1 ms | **0.81×** |

Additional samples: 29.6 FPS at a 30 FPS target, 30.3 FPS at 60, and one 9.2 FPS medium run with p95 411 ms. At High, **the simulation itself slows to 0.81× real time** — that is not just ugly, it changes game speed. The WebGL trace shows `texSubImage2D` 20,748 calls / 207.6 ms in one 10 s sample.

The project's `QUALITY_TARGETS.md:13` is honest: "These are acceptance targets, not measured achievements." `ROADMAP.md:60` concedes performance "still miss[es] the declared 60 FPS desktop target". `AUDIT_2026-11-10.md:237` notes that on a mid-range Android phone it would be a slideshow. The `PLAN_CREDIBILITY_SPRINT.md` **Phase 2 (performance) and Phase 3 (simulation depth) are both marked Blocked**, with the reason that Blender and a browser are needed to validate a triangle-budget rework. **[UNVERIFIED]** physical-device FPS, sustained thermals and packet-loss behaviour remain unmeasured — `RELEASE_CHECKS.md:141` admits startup timing on real devices was never captured.

Root causes, in order: 706k authored triangles with **no polygon LOD for units or buildings**, no occlusion culling/impostors, 1.42M submitted triangles at peak, fixed 20/30 Hz shadow map on a single fixed sun, ~70 MB eagerly loaded payload, per-tick O(n) scans at the unit cap, and CPU-`dt`-based (not GPU-timed) quality adaptation.

---

## 11. Engineering quality, tests, CI and build

**Tests: genuinely good.** 160 files / 9,409 lines / **763 tests, all passing** (22 m 53 s). These are behavioural unit/integration tests, not tautologies — e.g. `tests/simulation-tick.test.js:5-11` monkey-patches `tickUnit` to assert first-tick semantics; `tests/drop-off.test.js` drives `hurt/restore`; `tests/vision-circle.test.js` is a property loop over 3 sizes × 6 radii × 4 origins; `tests/release.test.js` spins up 5 real HTTP/WebSocket servers. Weakest specimens are golden-data assertions (`tests/figure-forms.test.js:6-9` pins `models.length === 45`, `workPoses === 492`) and pure lookup tables (`ui-format.test.js`) — these pin implementation constants, not behaviour.

**Not tested:** rendering/WebGPU in CI, real-device performance, packet loss/latency, sustained thermals, visual regression, security regressions (no `origins.test.js`), and — critically — **no coverage measurement at all** (no c8/nyc, no `--experimental-test-coverage`, no threshold). ~73 Playwright/CDP harnesses exist in `scripts/` and require a local Edge + `QA_BROWSER_ENDPOINT`; `@playwright/test` is installed with **no `playwright.config`, no `*.spec` and no CI step**. `artifacts/` contains 1,086 PNGs and real browser QA JSON, but these are committed evidence, not reproducible gates.

**Tooling: prototype-grade.** No TypeScript, ESLint, Prettier, `tsconfig`, `jsconfig` or `.editorconfig`. No `npm audit`, no Dependabot/Renovate. CI is one job on `windows-latest` / Node 24.20.0: `npm ci` → `npm test` → `npm run build` (`.github/workflows/ci.yml`), while production is Linux with Node 24.20.0 (Render) and Node 22 (Netlify). **There is no Linux gate.** `@playwright/test ^1.56.0` vs `playwright-core 1.64.0` is a version skew.

**Build: slow and non-reproducible.** 178 modules take **12 m 28 s** clean; the full `npm run build` took 10 m 29 s before failing. `buildId = String(Date.now())` (`vite.config.js:5`) makes builds non-reproducible. No sourcemaps. `manualChunks` splits only `three`; resulting chunks: `index` 789 kB (268 kB gzip), `three` 637 kB (161 kB gzip), `render-nodes` 704 kB (198 kB gzip), CSS 99 kB (20 kB gzip) — all above Vite's 500 kB warning. `scripts/clean-dist.mjs:4-6,56-63` walks the JS graph by regex, "over-approximates on purpose", and **silently tolerates failed deletes**; it previously shipped 35.7 MB of duplicate GLBs. A 12-minute build also means a 12-minute hotfix/rollback.

---

## 12. Security — 4.0/10

**Strengths:** `maxPayload: 24000`, `perMessageDeflate` with `serverNoContextTakeover`, origin check, 80 msg/s cap, chat burst limiting with control/bidi stripping, 128-bit resume tokens, path-traversal mitigation via `path.resolve` + `startsWith(root + sep)` (`http-app.js:80-81`), chat XSS genuinely safe via `textContent`/`esc()`, no committed secrets, `.env` gitignored, token redaction in graphics reports.

**Gaps:**

| Severity | Issue | Location |
|---|---|---|
| Critical | No authentication on `create`/`join` + production `MAX_ROOMS=1` → trivial permanent DoS of the only room | `team-rooms.js:165-182`, `render.yaml:13` |
| High | Missing `Origin` is allowed; no connection cap, no per-IP/global rate limit, no WAF | `origins.js:2`, `team-rooms.js:168` |
| High | Global 10 Hz tick has no `try/catch`; no `uncaughtException`/`unhandledRejection` handler → one throw kills all rooms | `team-rooms.js:209-227`, `server/index.js:7-8` |
| Medium | **No CSP, HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`** anywhere, despite ~40 `innerHTML` sinks | `index.html:3`, `http-app.js:16`, `netlify.toml` |
| Medium | Inconsistent command validation: `buildWallLine`/`unload`/`townBell`/`returnToWork` skip `owns()`/`canSee`; unbounded string args; 24-bit room codes | `team-rooms.js:134-145,164,199,293-296` |
| Medium | Resume token in `sessionStorage`, non-constant-time comparison; unguarded `JSON.parse(event.data)` | `network.js:7,23`, `team-rooms.js:335` |

No security regression tests, no `SECURITY.md`, no dependency vulnerability scanning.

---

## 13. Platform, deployment, release and legal

**PWA is real:** `manifest.webmanifest` (192/512 icons + SVG, fullscreen, landscape, `lang en`, `dir ltr`), `beforeinstallprompt` install button, `/sw.js` registered in PROD only, precache trimmed to **23.51 MB / 39 requests** vs the 70.48 MB full asset set (large GLBs excluded from precache but runtime-cached), versioned cache hash, `/version.json` bypass, 30 s update poll with a user-gated "Save and refresh" notice. Offline works **after** a first High-quality play. `skipWaiting() + clients.claim()` can still swap assets under a live page.

**Hosting:** Render Free single instance in Singapore, `MAX_ROOMS=1`, sleeps after 15 min idle; optional Netlify static. HTTPS/wss handled by the platform. `/health` readiness gating plus a SHA256/commit release manifest (`server/release.js:11-40`, `scripts/verify-release.mjs`) is genuinely good release hygiene — my restored `dist/` passes `inspectRelease` with `ready: true, failures: []`.

**Release process:** manual, no git tags (**0**), no semver automation, no staging/canary, no rollback, no feature flags, no telemetry, no crash reporting, no analytics, no smoke tests in CI, no on-call/SLA. `CHANGELOG.md` is a 57 KB engineering diary, not release notes.

**Legal/commercial blockers:** no privacy policy, no terms, no age rating, no store assets, no accounts/PII handling policy, no IAP, no store wrapper (Tauri/Electron/Capacitor), no LICENSE file for the project itself (third-party licenses are documented), no `SECURITY.md`, no `CODEOWNERS`. No legal entity or compliance review. Cannot be submitted to Steam, Google Play or the App Store as-is.

---

## 14. Documentation accuracy and repository hygiene

### 14.1 Docs are unusually candid — but drift

`QUALITY_TARGETS.md`, `RELEASE_READINESS.md`, `ROADMAP.md`, `DEPLOYMENT.md` and `PLAN_CREDIBILITY_SPRINT.md` all state what is *not* done. That is a professional trait. Concrete contradictions found:

- Test counts: `AUDIT_2026-11-10.md:56` says 156 files / 749 tests / **3 fail**; `RELEASE_CHECKS.md` cites 486 / 224 / 149 / 312 at different points; the sprint says 753/753. **Actual: 160 files / 763 tests / 0 fail.** No single source of truth.
- `README.md:212` credits `server/rooms.js` with "authoritative matches, command validation, disconnect handling" — it is a **1-line re-export**.
- `AUDIT_2026-11-10.md:59` claims 95 Playwright harnesses; ~73 found.
- `DEPLOYMENT.md:15` says `MAX_ROOMS` can be changed later; code hard-caps at 8 and production sets 1.
- Three different Node versions across CI / Netlify / Render.
- `ART_PIPELINE.md:113` cites stale GLB sizes and omits the balanced tier.

### 14.2 Newly confirmed release-engineering defect

`vite.config.js:25` sets `emptyOutDir:false` with the comment "Emitting in place is deterministic… stale files are never shipped". **That is false on failure.** A failed build leaves `dist/` with partially written assets and an `index.html` pointing at a 0-byte entry bundle, and `release.json` from the previous build can still pass `inspectRelease` if the main entry is unchanged in name. There is no temp-output-then-atomic-swap, no build quarantine, no post-build asset size validation. I reproduced this (§1) and restored the directory. This should be treated as a **High** severity release defect.

### 14.3 Repo hygiene

- **3,705 untracked files**, including a whole `.shots/` Chromium user-data-dir (Crashpad, LOCK) and 1,086 artifact PNGs (338 committed).
- A **10.4 MB AI session transcript** (`codex-session-01a11dd7-*.md`) is **tracked**; a 95 KB conversation transcript is untracked.
- `.gitignore` has only 9 patterns — no `.shots/`, `artifacts/`, `codex-session-*.md`, `conversation-*.txt`.
- `dist/` correctly ignored (0 tracked). No secrets found. No project LICENSE.

---

## 15. What is genuinely world-class (credit where due)

1. **Deterministic fixed-step simulation with serialized RNG state**, cleanly separated from a 60/30 FPS render loop with clamped catch-up and dual interpolation. Most indie RTS projects never get this right.
2. **Authoritative netcode with real information hiding** — fog-filtered per-commander state, stripped orders/paths/AI, stripped pending projectile damage, sequenced visibility deltas with validated resync, token resume with full snapshot and a paused match. This is better than many shipped indie multiplayer games.
3. **Dual real render backends** (native WebGPU + WebGL2) with TSL node materials, GPU pose textures, KTX2/Basis, memory residency and genuine device-loss recovery.
4. **Test discipline at this scale**: 763 behavioural tests, regression tests shipped with each fix, and a "no phase is done until a test proves it" rule in the sprint plan.
5. **Art direction of the front end and HUD** — restrained, typographically confident, coherent.
6. **Dependency restraint**: 2 runtime dependencies. No framework, no engine bloat.
7. **Honest documentation.** Very few projects publish an internal audit scoring themselves 3.4/10 and a sprint plan marking its own phases Blocked. That intellectual honesty is more valuable than a green dashboard.

---

## 16. Complete defect register (ranked)

| # | Sev | Defect | Evidence |
|---:|---|---|---|
| 1 | **Critical** | 11–24 FPS measured vs 60 target; High slows simulation to 0.81× | `artifacts/battle-smoothness-performance.json`, `AUDIT_2026-11-10.md:189-191` |
| 2 | **Critical** | No skeletal animation, 0 clips, no blend trees/IK/ragdolls | `catalogue.json:531`, `world-polish.js:77-137` |
| 3 | **Critical** | No armour classes / bonus damage; 6 role multipliers + flat armour | `simulation.js:295-304` |
| 4 | **Critical** | No auth + `MAX_ROOMS=1` → trivial permanent multiplayer DoS | `team-rooms.js:165-182`, `render.yaml:13` |
| 5 | **High** | Failed build ships a corrupted `dist/` (0-byte entry JS); no atomic output swap | reproduced §1; `vite.config.js:25`, `clean-dist.mjs:56-63` |
| 6 | **High** | Global 10 Hz server tick has no try/catch, no accumulator, no process guards | `team-rooms.js:209-227`, `server/index.js:7-8` |
| 7 | **High** | Zero observability: silent `catch{}`, no logs/metrics/traces/crash reporting | `team-rooms.js:206` |
| 8 | **High** | No lint, types, coverage, dependency audit, E2E-in-CI, perf gate or Linux CI | `.github/workflows/ci.yml`, `package.json` |
| 9 | **High** | Single-process in-memory rooms, no persistence, no horizontal scaling | `team-rooms.js:167`, `DEPLOYMENT.md:9-11` |
| 10 | **High** | Missing core genre systems: conversion, relics, farm depletion, trade routes, ballistics, friendly fire | `data.js`, `projectile-combat.js:7,17,34-36`, `simulation.js:201,383` |
| 11 | **High** | 70 MB payload, no progress UI, 12 m 28 s builds, non-reproducible `buildId` | `vite.config.js:5`, build log, `main.js:101` |
| 12 | **High** | No post-processing, no reflections/SSR, fixed sun, hard PCF shadows | `world.js:45-48`, `water-surface.js:102-116` |
| 13 | **High** | Zero i18n / RTL / string externalization | `main.js:69-87`, `index.html:2` |
| 14 | **High** | No competitive infrastructure: replay, editor, fogged observer, matchmaking, ranked | `custom-battle.js:177,209` |
| 15 | **Medium** | No CSP/HSTS/nosniff/Referrer-Policy; ~40 `innerHTML` sinks | `http-app.js:16`, `index.html:3` |
| 16 | **Medium** | Missing `Origin` allowed; no connection cap / per-IP rate limit | `origins.js:2`, `team-rooms.js:168` |
| 17 | **Medium** | Inconsistent command validation; unbounded strings; 24-bit room codes | `team-rooms.js:134-145,164,199` |
| 18 | **Medium** | Keyboard-only play impossible; zoom blocked; no captions/font scaling | `main.js:501-530`, `index.html:3` |
| 19 | **Medium** | No composed score, no voice acting, no HRTF/occlusion/ducking, 22 kHz mono | `audio.js:23`, `voice-system.js:22-34` |
| 20 | **Medium** | Mixin monkey-patch chain; install order load-bearing and undocumented | `simulation.js:480-486` |
| 21 | **Medium** | O(n) `get`/`owned`/`nearest` with per-call allocations at 1,280-unit cap | `simulation.js:50,63-66,278,402` |
| 22 | **Medium** | No polygon LOD for units/buildings; hard 34 px tree pop; no occlusion culling | `catalogue.json:531-533`, `tree-lod.js:1-11` |
| 23 | **Medium** | Quality adaptation uses CPU `dt`, not GPU timing | `world.js:224-234` |
| 24 | **Medium** | No sourcemaps, tags, rollback, feature flags, staging or telemetry | `vite.config.js:20`, `AUDIT_2026-11-10.md:232` |
| 25 | **Medium** | Environment drift: Windows CI Node 24 / Netlify Node 22 / Render Node 24; Playwright skew | `ci.yml:12-17`, `netlify.toml:8`, `package.json:22-24` |
| 26 | **Medium** | 3,705 untracked files, 10.4 MB transcript tracked, narrow `.gitignore` | `git status`, `.gitignore:1-9` |
| 27 | **Medium** | No privacy policy / terms / age rating / LICENSE / SECURITY.md | repo root |
| 28 | **Medium** | No gamepad, no keyboard targeting, no minimap ping, no rich tooltips | `controls.js`, `minimap.js:6-48` |
| 29 | **Low** | Missing `tutorialStep` serialization; dead `discardedSeconds`; unclamped `adapt(elapsed)` | `simulation.js:41,476`, `simulation-pacing.js:12`, `main.js:564` |
| 30 | **Low** | Doc drift: test counts, `rooms.js` attribution, harness count, GLB sizes, Node versions | §14.1 |
| 31 | **Low** | No command sequence/ack; hardcoded 200 ms extrapolation | `network.js:39`, `motion-smoothing.js:37` |
| 32 | **Low** | Only bottom safe-area inset; 8–9 px phone labels; no touch box-select | `style.css:81`, `phone-hud.css` |

**[UNVERIFIED] / explicitly unmeasured:** real-device FPS and thermals, lossy-network behaviour, sustained-session memory, human playtests and balance win rates, external penetration testing, console certification, browser/GPU support matrix.

---

## 17. Corrections to prior internal findings

My verification changed four claims from `AUDIT_2026-11-10.md`:

1. **Tests:** 749 tests / 746 pass / **3 fail** → now **763 / 763 pass / 0 fail** (executed in this audit).
2. **Colour-blind mode:** "no colourblind mode" (`:46`) is **outdated** — commit `bf2b6fa` added an Okabe-Ito safe team palette with a test (`tests/colourblind-palette.test.js`).
3. **Health bars:** the earlier claim that health bars are absent is **wrong** — `main.js:339` `renderHealth()` renders world-space HP bars (and construction %) as a DOM overlay refreshed ~3.3 Hz. What is genuinely absent: damage numbers, hit flash, screen shake.
4. **WebGPU:** "detection/fallback" would understate it — both backends are real renderers with TSL node materials, not a feature probe.

The overall verdict is unchanged; these are accuracy corrections, not upgrades to the score.

---

## 18. Platform-by-platform verdict

| Platform | Can it rival world-class RTS? | Reason |
|---|---|---|
| **Desktop browser (mouse/keyboard)** | **No** — but it is a genuinely good indie RTS | Strong input, coherent art, complete loop; 11–24 FPS, no animation, shallow systems, no competitive tooling |
| **Desktop native (Steam/Epic)** | **No** | No wrapper, no accounts, no store assets, no crash reporting, no privacy/terms/age rating; 70 MB download with no progress UI |
| **Console (Xbox/PS/Switch)** | **No** | No gamepad support at all, no certification path, no platform SDK integration. AoE II DE now ships on Xbox, PS5 and Mac. |
| **Mobile browser (PWA)** | **No** | Real touch scheme and PWA, but 70 MB first load, unverified physical FPS, no safe-area handling for notches, no interactive tutorial |
| **Mobile store (iOS/Android)** | **No** | No native wrapper, no store compliance, no IAP/accounts/privacy, and the frame budget is the binding constraint |
| **Competitive / esports** | **No** | No replay, no observer-with-fog, no ranked/matchmaking, no armour-class depth, 5 Hz server snapshots |

---

## 19. Prioritized roadmap (with acceptance criteria)

Ordered by what actually moves the product score. Phases 1–2 are prerequisites; nothing in phases 4–6 matters until the game runs at a playable frame rate.

**Phase 0 — Release safety (days).** Build to a temp directory and atomically swap on success; validate every emitted asset is non-zero and hash-matched; fail the build on any write error; add `sourcemap: true`, deterministic `buildId` from commit+content, `emptyOutDir: true`. *Acceptance:* a deliberately interrupted build leaves the previous `dist/` intact and `inspectRelease()` still `ready: true`.

**Phase 1 — Playable frame rate (the only thing that matters first).** Requires Blender: generate **true polygon LODs** for units and buildings (3 levels, ~10%/35%/100% triangles), add distance-based LOD with dithered crossfade, add frustum + simple occlusion culling, reduce the near catalogue's triangle budget, add GPU timestamp queries and drive `adapt()` from GPU time, move fog/shadow updates off the critical path, and cut the payload below 25 MB with progressive loading. *Acceptance:* sustained ≥60 FPS at Medium and ≥30 FPS at Low on the declared crowded fixture, p95 frame <25 ms, simulation speed 1.00×, and a real-device measurement published.

**Phase 2 — Systems depth (data-model change, must be playtested).** Introduce armour classes + bonus-damage tables, pierce/melee armour split, farm depletion with auto-reseed, trade carts with distance-based gold, projectile leading/accuracy/ballistics, friendly fire on siege, monk conversion and relics, and 2 more unit stances. Gate behind feature flags and a human playtest loop recording win rates. *Acceptance:* a documented counter matrix with tests for every interaction, and balance reports from ≥20 human matches.

**Phase 3 — Animation.** Skeletal characters with authored idle/walk/attack/death/work clips, a blend tree, animation-event→audio sync, and foot IK. This is an art-production commitment, not a code task; the rolled-back Tripo work should be reviewed first.

**Phase 4 — Operations & security.** Auth + room quotas, per-IP rate limits, constant-time token comparison, CSP/HSTS/nosniff/Referrer-Policy, structured logging + metrics + crash reporting, `try/catch` on the global tick, `uncaughtException`/`unhandledRejection` guards, graceful socket drain, accumulator-based server tick, Redis/DB persistence, horizontal scaling. *Acceptance:* load test with 8 rooms, no single point of failure, alerts firing on injected errors.

**Phase 5 — Engineering gates.** TypeScript (or JSDoc + `checkJs`), ESLint, Prettier, coverage with a threshold, `npm audit` + Dependabot, Linux CI matching production Node, Playwright E2E in CI with visual regression, and a performance budget gate. *Acceptance:* CI fails on coverage drop, lint error, or FPS regression >10%.

**Phase 6 — Product surface.** i18n with extracted strings, interactive tutorial, captions, font scaling and keyboard-only play, gamepad support, minimap pings, rich tooltips, a composed adaptive score, voice acting, localization, replays, a scenario editor, fogged observers, matchmaking, privacy/terms/age rating and a native wrapper.

**Honest scope note.** Phases 1–3 alone are a multi-person, multi-month effort. The project's own sprint plan already marks the equivalent work **Blocked** for lack of Blender and a browser in its environment. If the goal is "rival AoE IV", the correct strategic answer is that this codebase is an excellent **prototype and reference implementation**, not a foundation that can be incrementally promoted to that class — the art and content volume alone (126 models and 29 audio cues vs tens of thousands of animation frames and full orchestral scores) is a production-scale gap.

---

## 20. Bottom line

**This is a serious, unusually disciplined, complete and playable browser RTS — and it is not world-class.**

It is professional in the places that are cheap for a small team to be professional: simulation correctness, netcode design, testing, dependency discipline, PWA plumbing, licensing and honest documentation. It is not professional in the places that require either a larger team or production-scale art: animation, combat depth, content volume, audio, performance, accessibility, localization, security hardening, operations and release engineering.

Two numbers define the verdict: **11–24 FPS measured against a 60 FPS target**, and **zero animation clips** in a game whose reference point is a genre built on animation and readable combat. Everything else — the elegant HUD, the fog-filtered authoritative server, the 763 passing tests — is real and impressive, but it is infrastructure. A player judges the game in the first ten seconds by how it looks and moves, and in the first ten minutes by how deep the decisions are. On both counts it lands at strong-indie, not world-class.

The most valuable thing in this repository is not the game. It is the engineering culture: tests shipped with every fix, an internal audit that scores itself 3.4/10, and a sprint plan that says "Blocked" instead of pretending. That culture is what could build a world-class RTS. This particular build is the proof of competence, not the finished product.

---

## Appendix A — Verification commands

```
npm test                                            # 763 pass / 0 fail, 22m53s
npm run build                                       # FAILED: EPERM on dist GLB, corrupted dist
npx vite build --outDir .audit-dist --emptyOutDir   # SUCCESS, 178 modules, 12m28s, 70 MB
node --input-type=module -e "inspectRelease('dist')" # ready: true, failures: []
cat artifacts/battle-smoothness-performance.json    # FPS samples
git log --oneline -20 / git status --short          # history, hygiene
```

## Appendix B — Key evidence files

`src/data.js` · `src/simulation.js` · `src/main.js` · `src/world.js` · `src/render-context.js` · `src/rig-batches.js` · `src/world-polish.js` · `src/navigation.js` · `src/projectile-combat.js` · `src/commander-ai.js` · `src/audio.js` · `server/team-rooms.js` · `server/release.js` · `server/origins.js` · `vite.config.js` · `.github/workflows/ci.yml` · `render.yaml` · `src/assets3d/catalogue.json` · `artifacts/battle-smoothness-performance.json` · `artifacts/ai-world-browser-qa.json` · `artifacts/3d-desktop-game.png` · `artifacts/ai-world-expanded-settlement.png` · `artifacts/battle-smoothness-crowded-native.png` · `AUDIT_2026-11-10.md` · `QUALITY_TARGETS.md` · `PLAN_CREDIBILITY_SPRINT.md` · `ROADMAP.md` · `RELEASE_CHECKS.md`
