# Multiplayer snapshot preparation

The server prepares the same current vision once per allied team during a
broadcast. Each commander's exploration history still belongs to that commander.
Rooms with shared vision disabled prepare separate views, and defeated-alliance
observers use a separate complete-vision entry. The cache lasts one broadcast.

Outgoing snapshots now serialize once when sent. Their temporary entity and
player objects are consumed synchronously before the simulation advances. Fog
and resource baselines still commit only after an accepted send. Remembered
buildings own a detached copy of their nested fields: previously, a wall's live
connection array could change its remembered appearance after leaving vision.

The network format, snapshot rate, owner mapping, private commands, paid
production and graphical detail are preserved. Remembered-building lookup also
uses an ID set, and visibility checks calculate a cell once per entity.

## Verification

The hidden-wall regression fails against `f158138` and passes after the fix.
All 39 focused network, room-lifecycle, chat and release checks pass, and the
production build passes.
Real WebSocket cases cover shared scouting, separate exploration histories,
disabled shared vision, hidden supplies, reconnect/resync, legacy clients,
skipped snapshots, observer reveals, garrisons, transports and team results.

`node scripts/snapshot-profile.mjs current` creates an isolated local server and
eight client sockets in a separate process. The synthetic Huge 4v4 fixture has
1,280 units, 296 buildings and 1,804 resources. It freezes simulation, disables
WebSocket compression, samples server CPU for eight seconds and writes a report
to `artifacts/snapshot-profile-current.json`. Reports are kept out of source
commits. It does not measure rendering, full-match simulation or physical phones.

Two alternating observations on the development laptop measured 20.6/20.2 ms
of server CPU per delivered state before the change and 10.7/10.3 ms after it.
The old server delivered 264 states per window; the new server delivered 320.
JSON payloads remained approximately 201,847 bytes per state. These results show
lower snapshot CPU cost in this fixture; sustained hosted capacity and device
frame rates still require separate evidence.

## Congested connections

The room now checks outgoing capacity before preparing a battle packet. A
connection above the existing 1 MB state threshold continues recording current
scouting and remembered buildings, while full actor projection, resource changes,
effect projection and fog-delta construction wait for the link to recover.
Incoming paid commands and chat keep their existing behavior. The 4 MB disconnect
limit and accepted-send baseline commits are preserved.

Detached non-owner building observations are shared read-only within one
broadcast. Each commander's memory map retains its previous observation when
that commander loses vision. Seeing empty ground during congestion removes an
obsolete remembered building. No complete historical packet queue is retained.

All 41 affected network, chat, room-lifecycle and release checks pass, and the
production build passes. The new
congestion regression fails against `25d1e92`; it verifies skipped actor work,
paid production, scouting during a wholly held interval, hidden construction,
recovery and empty-ground observations. Another real-room regression checks
different last-seen wall states after two commanders scout together.

Set `SNAPSHOT_CONGESTED=6` when running the profiler to hold six links and leave
two healthy. Two alternating eight-second observations measured 2,625/2,453 ms
of server CPU before the change and 1,907/1,874 ms after it. Every window delivered
80 updates to healthy clients with exactly 15,951,754 bytes of JSON. This is a
24–27% CPU reduction in the isolated fixture, with unchanged delivered content.
The final all-healthy eight-client window delivered all 320 expected updates.
It does not measure full-match simulation, internet latency or graphics FPS.
