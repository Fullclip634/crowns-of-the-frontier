# Forest residency and large-army action updates

The shared forest used by all graphics presets supersedes the trees embedded in each original roster. Replacing entries in the template map did not detach the old tree roots from their source scene. Other templates retained that scene through their parent links, keeping 24 redundant forest models reachable after the replacement.

Superseded tree roots now detach before replacement. The catalogue still contains all 126 playable models, with one shared set of 24 trees. Repeated preparation keeps the shared scene intact; source geometry, materials, detail selection and rendered silhouettes are preserved.

| Preset | Redundant decoded buffers released |
| --- | ---: |
| High | 3.56 MiB |
| Balanced | 2.21 MiB |
| Low | 1.20 MiB |

These measurements count unique attribute/index ArrayBuffers reachable through model parents and children. They do not measure total process RAM, GPU memory or displayed frame rate.

Soldiers use locomotion and combat poses without a worker action state. Their work-state updates now return immediately, and a unit changing roles clears its prior action. An isolated 1,280-soldier, 600-frame update benchmark retained zero action states instead of 1,280. Eight alternating before/after rounds in one process measured median loop times of 26.48 ms and 8.55 ms for 768,000 calls. This is a microbenchmark, not a claim about game FPS. Villagers and healers retain their phased work, carrying and healing poses.

The [measurement report](artifacts/forest-memory-and-army-actions.json) includes exact source hashes and scope limits. The unchanged shared-tree asset hash is recorded there. The [long battle report](artifacts/allied-defense-30-minute-soak.json) records a normal, eight-kingdom battle on the Vast map: it reached a victory condition after 1,726.6 simulated seconds, with real relief combat across 15 assisting pairs. Major army damage to a base first occurred after 345.4 seconds. Both alliances used the same AI rules; no resources or damage were synthesized. This one all-AI seed does not establish balance for every human match or map.

CPU tick time, the isolated action benchmark and rendering FPS are separate measurements. Device performance and broader match balance remain ongoing validation.

Screenshot review caught a gap in the phone harness: resizing cleared its drawing buffer after a one-shot test draw, while the test had disabled the ordinary render loop. Layout dimensions still passed despite an empty capture. The harness now waits for resize, checks screenshot pixels outside the HUD, and verifies the normal loop repaints at 568×320 as well as the paused test at 740×360. The [earlier blank image](artifacts/phone-resize-unpainted-before.png) is a negative fixture. The same-build phone checks are recorded separately from the previously completed forest/feature checks; the game itself required no resize change.

Repeat the current measurements with `node scripts/forest-residency-profile.mjs` and `node scripts/work-state-profile.mjs`. Repeat the battle with `AI_TEAMS=4v4`, `AI_SIZE=vast`, `AI_SECONDS=1800`, `AI_SEED=512` and `AI_DIFFICULTY=normal` set before running `node scripts/ai-battle-soak.mjs`. The default battle instrumentation reports actual relief hits as well as dispatch notices.

Release checks: [423 passing tests](artifacts/forest-memory-regression.txt), [same-build browser and phone verification](artifacts/forest-memory-validation.json), and [alternating work-state measurements](artifacts/work-state-alternating-comparison.json). These are incremental results; the broader RTS goal remains active.
