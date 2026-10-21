# Clear transport landings

Transports now reserve a separate landing space for each disembarking troop.
Landing positions remain within eleven metres of the ship and on open, connected
land near the requested beach. Troops keep their navigation footprints on land;
siege additionally uses the measured lower-chassis clearance described below.
Standing troops, trees, ore, buildings, wall bodies and connected wall joins take
space; allied gates retain their existing passage rule.

The original eight-passenger probe produced fourteen overlapping pairs, including
a ram and trebuchet only 1.3 metres apart. It also allowed an open destination
behind a continuous shore wall to receive the entire cargo. Destination-only
validation and independent formation slots did not validate a clear approach or
reserve space shared by the passengers.

`src/disembark.js` plans positions before changing the cargo. Its approach grid
allows the ship's water approach while retaining land obstacles, and supercover
segment checks prevent crossing blocked cells or diagonal wall corners. Each
passenger uses its own alliance's land grid. The planner reserves larger models
first, then checks the remaining spaces against standing and newly landed troops.

Siege landing clearance uses **2.7 metres for a ram** and **3.3 metres for a
trebuchet**, rather than their smaller movement collision circles. The actual
Low, Balanced and High Blender meshes pass sampled firing-pose envelope checks:
the ram reaches about 2.512 metres from its centre and the trebuchet about 2.872.
An additional 2.1-metre ground clearance keeps their wheels and lower chassis
off the water; the checks also inspect model vertices below 1.05 metres.
The clearance affects placement and spacing only; combat and ordinary movement
radii remain unchanged. These sampled envelopes are not a claim that the entire
movement or combat system prevents every possible model intersection.

A cramped shore accepts only the passengers that fit. Others remain alive and
embarked, with their cargo and ship association preserved. The player receives a
remaining-passenger notice and can clear room or choose another beach. Unloading
resets the released units' route and display interpolation state. Saves retain
the passengers still aboard. Invalid coordinates, foreign control and blocked
landings do not release anyone.

Custom naval AI orders only released troops toward its objective and retains the
landing mission while it still has passengers. Classic naval AI also waits for
the remaining cargo instead of immediately sailing home. Its automatic landing
routine is disabled in multiplayer, where the second human controls their own
transport. Multiplayer continues
to use server-authoritative unloading; other commanders receive counts rather
than passenger IDs.

The browser diagnostic uses the visible **Unload** button, mouse clicks and
emulated touch taps on the 3D beach. It covers open, obstructed and crowded shores,
remaining-count updates and retry. CPU tests additionally cover mixed siege and
infantry, allied passengers/gates, save recovery and retained AI landing orders.
The committed reports record the final build, complete suite and a seeded full
coastal battle. Browser scenes are controlled fixtures; the full battle uses
ordinary gathering, recruitment and combat.

Run `node --test --test-concurrency=1 tests/*.test.js` and `npm run build`.
For browser verification, run `node scripts/disembark-qa.mjs` with `QA_URL` pointing
at that production build and optionally `QA_BROWSER_ENDPOINT` at an isolated local
Chromium CDP endpoint. `QA_OUTPUT` selects the JSON/image directory. The default
cases are desktop High WebGL, desktop Balanced native WebGPU, and 640 × 360 Low
WebGL with emulated touch.

Physical phones, sustained rendering/thermal measurements, other GPU/browser
families, wider coastal seeds and competitive balance still need validation.
The hosted Render revision has not been verified. This fixes concrete landing
and presentation issues within the active whole-game development goal.
