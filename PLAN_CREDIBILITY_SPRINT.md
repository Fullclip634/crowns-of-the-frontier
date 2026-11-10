# Credibility Sprint — Implementation Plan

**Decision:** I'm taking the credibility sprint. Not the skinned-animation bet, not a store push.

**Why:** The audit found exactly two things standing between "indie curiosity" and "credible RTS": it runs at 11–24 FPS, and its simulation is a fifth as deep as the genre standard. Both are pure engineering. Both are fully within my ability. Art, score and voice acting are not — and pretending otherwise would waste your time.

**Rule for the whole sprint:** no phase is "done" until a test proves it. Every change lands with a regression test, or it doesn't land.

---

## Status — 10 November 2026

| Phase | State | Commit |
|---|---|---|
| 0 — foundation grounding | **Shipped** | `7e70bdb` |
| 1 — AI resilience | **Shipped** | `becd572` |
| 2 — performance | **Blocked** | — |
| 3 — simulation depth | **Blocked** | — |

Full suite at time of writing: **753/753 pass**, up from 746/749 with three red.

### What shipped

**Phase 0.** `groundBuildingFoundation` measured its terrain floor against the *node* transform but extended the plinth in *mesh local* space. The keep and the siege workshop raise their structure mesh inside the node, so both stopped short of the ground by exactly their own local offset — measured at 0.383 m on highlands, which is the mesh offset to three decimals. The floor is now measured per mesh, with scale applied. A new test fails on the old code and passes on the new.

**Phase 1.** Three behaviours that made the commander exploitable:
- A razed capital no longer ends the opponent; the AI remembers its home and founds a paid replacement.
- Production counts scale with the age, gated on a real economic surplus. Measured over 600 s: armies rise from 25/20 to 33/48 while both commanders still reach the Imperial Age.
- Walls no longer stall forever under intermittent harassment; they wait out a live attack and resume once it has been held off for 90 s with a 3:1 garrison.

### What was deliberately not shipped

Two Phase 1 items were implemented, measured, and then reverted:

- **A second mill.** Redundant — every settlement already starts with one and farms are placed beside a town centre, so it only competed for early timber. The audit claim was wrong; the starting mill was missed.
- **Scout-immune army recall.** The correct fix for the scout-feint exploit, but it measurably reduced a commander's reach in the expansion benchmark (30.9 → 29.4). That is a balance trade that needs human play, not a code change I can validate alone.

### Why phases 2 and 3 are blocked here

- **Phase 2 needs Blender.** No Blender is installed in this environment, and the triangle budget is the actual frame-time problem. A distance-LOD rework in JS is possible but is a multi-day change across the whole render path that cannot be validated without a browser; the browser cannot run here either (esbuild is blocked in the sandbox, so Vite cannot start). Shipping a fidelity guess would be worse than shipping nothing.
- **Phase 3 is a set of balance changes.** Every item (pierce armour, farm depletion, tech branching) shifts win rates. The garrison item is already excluded by a deliberate, tested design decision ("shelter reservations reject foreign troops, soldiers, unfinished sites"), so extending it would contradict an intentional choice rather than fix a bug.

**Recommendation:** the remaining work is a playtest problem before it is an engineering problem. Run the benchmark on real hardware, then decide the fidelity budget; and put the balance changes behind a human playtest loop rather than shipping them blind.

---

## Phase 0 — Stop the bleeding

**Goal:** the suite goes green, and buildings stop floating.

**The bug.** `tests/building-grounding.test.js:42-63` fails for `building:keep:alder:0` and `building:workshop:alder:0` at all three tiers — "has no daylight beneath the original footprint." `groundBuildingFoundation` (`src/building-grounding.js:47-76`) flattens the plinth underside to `terrainFloor(...) − 0.12` and moves only vertices within `minimum + 0.08`. Something is letting the underside end up *above* the surface.

Two candidate causes, both testable:

1. **Shared geometry double-grounding.** `privateGeometry(source)` copies once, but `originals.set(geometry, source)` maps the copy back to the original. If two `structureSurface` meshes share one geometry, the second mesh reads an already-moved plinth as its `source`, recomputes `minimum` from moved vertices, and derives a floor from the wrong bounds. Keep and workshop are the two largest multi-part buildings — consistent with them being the only failures.
2. **Terraced terrain spanning a discontinuity.** On `canyon`, a flat plinth can straddle a mesa step where `surfaceHeightAt` is discontinuous between the sampled AABB edges and the interior.

**Work:**
- `src/building-grounding.js` — instrument `terrainFloor` and `groundBuildingFoundation` to dump `bounds`, `floor`, `delta` and per-mesh `source` identity for the failing cases.
- Fix whichever cause reproduces; if both, fix both.
- Add a regression test that grounds every building model on every map at every tier and asserts zero float — this is the census the existing test only partially covers.

**Done when:** `npm test` is 749/749 green, and a new test asserts the full building × map × tier matrix.

**Buys:** nothing visible to a player except buildings that sit on the ground. But a red suite is a credibility problem in its own right.

---

## Phase 1 — Make the AI respectable

**Goal:** remove the four exploits that let a human win in two minutes.

| Exploit | File | Fix |
|---|---|---|
| Scout feint — one damaged unit sends the whole army | `src/commander-ai.js:294` | `settlementThreats` (`src/ai-settlements.js:29-32`) already filters `damage > 0`; it does not filter *scouts*. Require a threat to clear a minimum damage threshold, or require ≥2 threats, before flipping to `defend`. |
| One barracks forever | `src/commander-ai.js:218-219` | `if(!buildings.some(b => b.type === type))` → allow a count that scales with age and army size (e.g. barracks cap `1 + age`, range/stable `1 + floor(age/2)`). |
| Mill never built | `src/commander-ai.js:218` | Add `mill` to the priority list once a farm exists and food distance is long. |
| Walls never start while any threat exists | `src/ai-fortifications.js:144` | Require a *sustained* threat (N seconds) rather than instantaneous presence. |
| No town-centre rebuild in skirmish | `src/commander-ai.js:186` | `if(!tc) return` → if villagers and resources exist, place a new TC instead of idling forever. |

**Also worth doing while I'm in here:** expansion sends a single worker up to 110 units away (`src/ai-settlements.js:41,76-80`). Escort it with two military units.

**Tests:** extend `tests/commander.test.js` and `tests/ai-fortifications.test.js` with:
- a scout poking a farm does **not** pull the army;
- the AI reaches ≥2 barracks by Castle Age;
- a mill is built when farms exist;
- walls complete under intermittent harassment;
- the AI rebuilds a destroyed town centre.

**Done when:** all five pass, and a 10-minute soak shows the AI fielding a larger army than before without free resources.

**Buys:** the AI stops being a punching bag. This is the cheapest credibility gain in the entire sprint — roughly a day.

---

## Phase 2 — Make it run

**Goal:** 60 FPS at Medium on integrated graphics. This is the phase that decides whether the game is shippable at all.

**Where the frame time goes** (from the audit and the renderer read): 851k triangles of authored geometry, **no geometric LOD for units or buildings** — trees are the only LOD system in the codebase — plus per-frame fog work and a 70 MB payload.

**Work, in order of measured impact:**

1. **Unit and building LOD.** `src/tree-lod.js` already implements screen-height-threshold swapping with a hold range. Generalise it into `src/mesh-lod.js` and apply to units and buildings. The `frontier-low` catalogue (4.6 MB) already exists — it just isn't used for distance culling, only as a quality tier. This is the single largest win available.
2. **Triangle budget.** Profile which models dominate the 851k. Farm is 26,322 triangles for a flat field; that is indefensible. Rebuild the worst offenders in the Blender pipeline with a hard per-class budget (units ≤ 3k, buildings ≤ 8k, trees ≤ 4k near / 1.2k far).
3. **Fog and shadow off the critical path.** `world.js` refreshes fog on a 0.5 s timer but the texture upload still lands on a frame; move it to an idle callback or spread it across frames. Shadows already run at 20–30 Hz — verify the upload isn't forcing a full re-render.
4. **Asset weight.** 70 MB → target ≤ 30 MB. The KTX2 set (13.6 MB) is *larger* than the JPEGs it replaces — that trade is wrong and should be reverted or re-tuned. Drop `frontier-near` from the initial install entirely; fetch it only when a player selects High.
5. **A CI perf gate.** `scripts/battle-benchmark.mjs` already measures tick times. Add a frame-time gate on a fixed fixture so a regression fails the build instead of being discovered three months later.

**Done when:** the crowded 8-player 400×400 fixture holds ≥55 FPS at Medium and ≥30 FPS at Low on this machine, and the number is in CI.

**Buys:** the largest single jump in the product score. Nothing else in the sprint matters if this fails.

---

## Phase 3 — Make it deep

**Goal:** from ~8 meaningful decisions to ~25.

| Change | File | Effect |
|---|---|---|
| **Split melee / pierce armour** | `src/simulation.js:287-296`, `src/data.js` | The single biggest depth unlock. Archers stop being universal DPS; armour upgrades become a real choice; the counter triangle becomes a counter web. |
| **Depleting farms + reseed** | `src/simulation.js:375`, `src/data.js` | Removes the "build 8 farms once" degenerate strategy. Forces ongoing wood spending and villager management. |
| **Tech prerequisites + branching** | `src/technology-tree.js`, `src/data.js` | Two mutually exclusive choices per age (e.g. economy vs military, walls vs siege). Turns five linear ladders into an actual tree. |
| **Archer/infantry garrison** | `src/garrison.js:7` | Towers become a real defensive decision instead of a villager shelter. |
| **One more counter relationship** | `src/simulation.js:290` | Skirmisher-style anti-archer unit closes the third leg of the triangle. |

**Balance risk is real.** Each of these changes win rates, and I can't playtest. Mitigation: `tests/balance-counters.test.js` already locks counter relationships — extend it to assert every unit has a cost-effective counter, and run the AI soak (`scripts/ai-battle-soak.mjs`) before and after to confirm no faction collapses.

**Done when:** the counter matrix is complete and tested, farms deplete and reseed, the tech tree has real branch choices, and a 20-minute AI-vs-AI soak shows all three factions winning some matches.

**Buys:** the difference between "a skirmish toy" and "an RTS."

---

## What I am deliberately not doing

- **Art, animation, score, voice.** These are the things that actually make it look and sound commercial, and they are not engineering problems. I'd be producing placeholder work that looks like placeholder work.
- **Store packaging.** Wrapping an 11 FPS game for the Play Store is putting a bow on the wrong problem. Revisit after Phase 2.
- **The skinned-animation pipeline.** I want to build it. I'll ask again once the frame budget can afford it.

---

## Order and expected movement

| Phase | Effort | Product score |
|---|---|---:|
| Start | — | 3.4 |
| 0 — bleeding | ~1 day | 3.4 |
| 1 — AI | ~1 day | 4.2 |
| 2 — performance | ~3–5 days | **5.5** |
| 3 — depth | ~4–6 days | **6.5** |

A 6.5 is "credible premium indie RTS." It is not "rivals AoE IV" — that number is unreachable without art, audio and content, and no amount of my work changes it. But 6.5 is a game I'd be comfortable putting in front of a reviewer, and it's an honest ceiling for what code alone can do.

---

## Evidence standard

Every phase ends with a runnable command and a number, not an opinion:

- Phase 0 → `npm test` exit 0, 749+/749+
- Phase 1 → exploit regression suite + 10-min AI soak army-size delta
- Phase 2 → `node scripts/battle-benchmark.mjs` FPS at three tiers, plus `dist/` size
- Phase 3 → counter-matrix test + AI-vs-AI faction win distribution

If a phase can't produce its number, it isn't done — and I'll say so rather than calling it finished.
