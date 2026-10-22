# AI resource selection and battle responsiveness

A native WebGPU crowded-battle CPU profile identified AI worker resource sorting
as a substantial source of main-thread work. Every reassignment sorted the full
eligible forest to use only its first five sources. Each source also recreated
the same list of remembered enemies during one synchronous decision.

The AI now selects that five-source prefix in one pass. It calculates each
eligible source's original `Math.hypot` distance once and keeps the original
iteration order for equal distances. Construction uses the same selection with
a limit of one available worker. This preserves the existing
[stable-sort ordering](https://tc39.es/ecma262/multipage/indexed-collections.html#sec-array.prototype.sort)
without sorting the full candidate array.

The observed-enemy list is reused only inside one worker assignment. The next
assignment reads current memory again. Safety ranges, resource weights, water
and depletion checks, farm ownership/completion, worker availability, the five
path-attempt budget, actual routes and paid construction remain unchanged.
The optimization applies to local games under either renderer and authoritative
server simulations. It does not change models, detail presets or frame targets.

## Deterministic replay

`scripts/resource-selection-qa.mjs` runs 200 ordinary simulation ticks for each
of six cases: early, crowded and late eight-kingdom highlands snapshots, coastal
allies, eight coastal rivals, and a classic rival match. It hashes the complete
serialized state and emitted events after every tick, retaining additional
checkpoints every 20 ticks. Reference and candidate reports must agree on the
whole replay digest, checkpoints, worker call count and result.

All six comparisons match exactly. The checks cover 1,200 ticks, rather than
only the final selected resource. Tests also cover equal-distance cutoff ties,
thousands of candidates, one score per eligible source, unsafe/depleted/water
exclusions, blocked-route retries, updated enemy knowledge and busy builders.

One paired Node run recorded these CPU totals, in milliseconds:

| Case | Worker assignments | Reference worker time | Candidate worker time | Reference tick time | Candidate tick time |
|---|---:|---:|---:|---:|---:|
| Early highlands | 75 | 300.4 | 122.5 | 1,244.0 | 1,099.9 |
| Crowded highlands | 218 | 846.1 | 268.1 | 3,168.7 | 2,609.0 |
| Late highlands | 40 | 76.2 | 25.2 | 2,670.9 | 2,613.0 |
| Coastal allies | 35 | 86.0 | 75.3 | 768.8 | 861.2 |
| Coastal rivals | 40 | 80.6 | 44.6 | 723.2 | 682.5 |
| Classic rivals | 5 | 3.2 | 2.4 | 86.0 | 86.3 |

These are observations from one development host. Tick timing excludes hashing;
worker timing includes pathfinding. Allocation, JIT and scheduling noise affect
totals: the coastal-allies tick total increased even though its worker total
decreased. This is not a universal percentage speedup or an FPS certification.

## Reproduce and scope

Generate the ordinary highlands snapshots with
`node scripts/capture-battle-stages.mjs`, then run
`node scripts/resource-selection-qa.mjs`. `RESOURCE_SOURCE_ROOT` selects a
preserved reference source directory, `QA_OUTPUT` selects its report, and
`RESOURCE_REFERENCE` supplies that report for a candidate comparison. Use the
same fixture files for both runs; their hashes are recorded.

The normal regression command is
`node --test --test-concurrency=1 tests/*.test.js`.
Build with `npm run build`. Run `scripts/battle-performance-qa.mjs` against that
production build for actual submitted-frame and simulation timing. Browser
submission cadence differs from display-presentation FPS.

The native baseline profile and final browser reports record their own build,
quality, viewport, GPU, warmup, duration and limitations. Headless qualification
uses isolated foreground browser profiles and `--ignore-gpu-blocklist`; emulated
touch does not establish physical-phone performance or native eligibility in an
unmodified browser. WebGPU remains an opt-in preview. GPU work, native pose
uploads, broader device/thermal qualification, balance playtesting and complete
release readiness remain open. The full development goal is active.
