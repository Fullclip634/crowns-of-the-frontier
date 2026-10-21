# Projectile combat and coastal invasions

Ranged attacks now deal damage when their projectile arrives. Archers draw before
releasing, trebuchets release from the animated Blender sling pouch, and warships
launch stones over water. Melee attacks retain their existing resolution.

## Combat rules

- A windup cancels if the shooter dies, moves, enters a shelter, changes its
  order, loses its target or receives Stop. A released projectile survives its
  shooter's death and cannot be cancelled by Stop.
- Arrows follow their original living hostile target. A dead or embarked target
  cannot redirect an arrow to someone else.
- Siege captures a ground aim point at release. Moving troops can leave that
  area. The primary hit and four-metre hostile-unit splash resolve there; allies
  and embarked troops remain protected.
- Existing weapon damage, attack intervals and garrison bonus-arrow counts are
  retained. Travel time changes combat outcomes and still needs wider balance
  testing. No guaranteed match duration is imposed.
- Saves retain valid windups, released shots, aim points, damage and unique IDs.
  Old saves without projectile records load normally. Malformed optional shot
  records are discarded without poisoning valid damage or reusing active IDs.

`combat-timing.js` shares release, flight and pose timing with the renderer.
`projectile-combat.js` owns authoritative damage; `combat-presentation.js` restores
visible flights without replaying launch sounds or applying damage. Flight age
uses simulation time with bounded render interpolation, so pausing freezes shots.
Camera and fog checks bound effects. Impact sounds originate at the impact point.

The trebuchet release uses the authored pouch centre `(0, 4.13, -2.66)` around
the `(0, 2.8, 0)` siege pivot in `scripts/blender/author-siege.py`. The existing
solid Blender models and their six rigid joints are used; this change does not
replace the art catalogue or introduce another geometry download.

Official Age of Empires IV notes informed projectile readability and the
distinction between tracking shots and ground siege attacks. These are reference
behaviours, not copied assets or a claim of equivalent balance:
[Update 17718](https://www.ageofempires.com/news/age-of-empires-iv-update-17718/)
and [Season Nine preview](https://www.ageofempires.com/news/age-of-empires-iv-season-nine-update-preview-12-0-1974/).

## Multiplayer and fog

The server alone advances projectile damage. Clients receive cosmetic flights,
including their existing age on reconnect, rather than the pending damage queue.
Visible launches toward unseen targets expose a ground point without the target's
identity, owner, health or damage. A visible impact from an unseen shooter hides
the shooter's identity and location. Defeated-alliance spectators retain their
existing observer view.

Non-owned entity snapshots and effects strip future orders, route goals, AI jobs,
landing plans and passenger IDs. Visible transports show a passenger count;
embarked non-owned troops remain hidden until unloading. Owned transports retain
their command data. These checks cover the new payloads; they are not a complete
network security audit.

## Coastal AI repair

Full-match checking exposed transports waiting indefinitely at forest-blocked
beaches. After a blocked approach, the AI now chooses another nearby beach and
sails there using ordinary movement. Only observed collision cells can reject a
landing candidate; danger scores use visible troops and remembered fortifications.
Other transports' planned landing areas influence spacing.

A population-capped, otherwise ready army may depart with its surviving armed
escort after the existing opening plus an additional minute, rather than waiting
forever for a third ship it cannot recruit. Worker and army buildup gates remain.
Embarked enemy troops no longer count as separate visible threats to the AI.

## Verification and limits

The committed reports contain serial regression results, rendered projectile
checks, complete seeded battles and the original stalled-save replay.

- Real-room tests cover owner remapping, fog redaction, reconnect flights,
  passenger privacy and an actual unload.
- Browser checks exercise High WebGL, Balanced native WebGPU and Low WebGL at a
  640 × 360 emulated-touch viewport: release before damage, one restored impact,
  Stop, moving siege targets, hostile splash with allied safety, naval shots and
  victory after the final building's impact.
- Eight Hard AI commanders on seed 512, Huge maps and an 80 population cap finish
  through ordinary alliance victory/defeat: Highlands at 900.9 simulated seconds
  and Coast at 1171.8. The benchmark controls the human slot only in the diagnostic;
  it grants no supplies or synthetic damage.
- The old coastal save's two stuck transports unload after approximately 15.4 and
  17.5 simulated seconds with the fix. That replay is separate from the fresh
  full-match results.

CPU benchmark tick timings are not rendered FPS. Browser checks use one Intel
GPU and emulated touch, not physical-phone certification. Wider seeds, competitive
human balance, sustained thermal/performance measurements, other GPU/browser
families and the public Render revision remain unverified. This is a tested
combat milestone within the active whole-game goal, not a finished 100/100 game.

Run the complete suite with
`node --test --test-concurrency=1 tests/*.test.js`.
Build with `npm run build`. Run `node scripts/projectile-qa.mjs` with `QA_URL`
pointing at that build and optionally `QA_BROWSER_ENDPOINT` at an isolated local
Chromium CDP endpoint. `QA_OUTPUT` selects its report path. To reproduce each full
battle, set `BENCH_MAP` to `highlands` or `coast`, `BENCH_SECONDS=2400` and a unique
`BENCH_OUTPUT`, then run `node scripts/battle-benchmark.mjs`.
