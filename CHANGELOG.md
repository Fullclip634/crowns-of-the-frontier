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

- Resolve ranged damage after weapon windup and flight; align archer, trebuchet
  and naval effects with release and impact. Siege can miss moving targets.
- Preserve shots in saves and cosmetic flights on reconnect; cancel unreleased
  attacks with Stop and keep hidden targets, shooters and transport cargo private.
- Reroute coastal AI transports around blocked beaches and let a ready capped
  army depart with its surviving escort after the normal buildup.
- Pass 370 serial tests and a production build. Fresh eight-AI Highlands and
  Coast battles reach normal results at 900.9 and 1171.8 simulated seconds.
  See [behaviour, evidence and remaining limits](PROJECTILE_COMBAT_DESIGN.md).

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

## 16 October 2026 — Solid siege and safer graphics

- Replace ram/trebuchet art with solid Blender frames, mechanisms and wheels across every preset; preserve the other 124 models and reduce the High pair's total triangles.
- Skip unchanged pose uploads, update only changed rows, retain pending writes and fully upload after context restoration.
- Restore the working battlefield when a graphics rebuild fails, serialize overlapping replacements, and provide recovery controls that protect the live match and local saves.
- Pass 341 regressions and rendered desktop/touch checks. See SIEGE_ART_DESIGN.md and artifacts/siege-release-validation.json for measurements, download tradeoffs and remaining validation.

## 16 October 2026 — Graphics loading and memory

- Reuse the startup graphics context, retain decoded full-precision buffers, and support full-resolution compressed color/roughness maps with original-image recovery and unchanged normal detail.
- Evict unused quality maps, prepare shaders before field draws, show progress, hold/resume local combat during frame replacement and recover from optional precompilation failure.
- Add a focused graphics-unavailable reload screen before heavy downloads/offline caching. Preserve manual presets and existing Blender art.
- Verified with 328 regressions, repeated rendered switches, both texture formats, offline play and desktop/touch startup recovery. Downloads/cache grow; physical-device performance and whole-game readiness remain unverified.

## 16 October 2026 — Windmill roof clearance

- Move all civilization mill rotors ahead of their roofs and add solid Blender axle mounts across Low, Balanced and High, with a matching procedural fallback.
- Preserve existing roof/blade mesh data and all unrelated models; retain animated picking and existing building draw budgets.
- Verified with 312 release regressions, six rendered desktop/touch cases and full-rotation/batching checks. Physical-device performance and hosted deployment remain unverified.

## 16 October 2026 — Water depth and weather rendering

- Add depth coloring, shoreline transparency/foam, fine ripples and lighting-aware sky reflections to GPU-displaced water.
- Resolve coastal waves more closely in Balanced/High while preserving Low's mesh budget and all navigation banks. Storms affect water and foliage; reduced decorative motion freezes their decorative movement.
- Verified with 309 release regressions and six rendered High-quality desktop / Low-quality touch checks. Physical-device FPS and full release readiness remain unverified.

## 16 October 2026 — Villager shelter and defensive volleys

- Add Shelter and Return to work controls for town centers, castles and towers, with capacity, incoming workers, preserved jobs/cargo and additional 3D arrow volleys.
- AI shelters threatened villagers and restores work after danger; server-authoritative multiplayer validates ownership and hides occupied workers from opponents.
- Cover saves, targeting, evacuation, demolition and transport sinking with 302 passing release regressions, four rendered desktop/touch checks and a longer AI diagnostic. Physical-device performance and final human balance remain unverified.

## 16 October 2026 — Resource settlements and larger battlefields

- Custom AI expands at scouted resource sites using paid builders, staffs new settlements, uses multiple town centers, protects workers, recovers construction and invests in defenses. Siege targets visible structures with infantry support.
- Add 480 m Vast and 560 m Epic battlefields while preserving existing map sizes and saved layouts. Replace circular starting forests with irregular dense groves and give playable terrain broader rolling elevation.
- Verified with 289 release regressions, 5 production browser checks and longer 2v2/4v4 AI diagnostics. Hardware FPS, human balance and full-game completion remain unverified.

# Terrain-fitted foundations and clear gate passages (version 2.6.1)

## 15 October 2026 — Richer Balanced trees with a smaller catalogue

- Add sparse, closed Blender leaf tips and fuller near broadleaf canopies, retain cheap distant trees and three forest material batches, and improve projected-size selection with hysteresis.
- Reduce Balanced from 16.28 MB to 12.98 MB. Validate every visible triangle and strict additional shading precision during packing; preserve Low and High catalogues and the complete editable source.
- Verify 279 release regressions, 13 focused checks, three biomes with harvesting, quality return, paired screenshots and touch-emulated landscape controls. Hardware FPS and full game completion remain unverified.

## 15 October 2026 — Preserve local kingdoms when leaving multiplayer

- Prevent private multiplayer snapshots from overwriting a local save, including after disconnect/leave. Hide legacy network snapshots from local resume without deleting them.
- Remove unavailable local-save controls from multiplayer menus, preserve ordinary AI/campaign saving, and return safely when the server closes a room.
- Verified with 272 release regressions and six production browser checks; software rendering and viewport checks do not establish physical-device performance or full game completion.

- Existing building plinths extend into the displayed terrain instead of leaving daylight underneath on slopes. Roofs and architecture retain their authored positions and normals; stone courses keep a consistent texture scale. This adds no meshes or texture loads. Wall joints retain their two instance batches.
- Three original Blender gates use two solid side footings and a banner mounted on the lintel. Their 2.5 m entrance stays clear when the portcullis opens. Grounded bars retract inside the masonry housing, with matching CPU picking and bounds, and stationary gates avoid repeated buffer uploads.
- Thin building selection contours follow terrain; connected wall rotations preserve that contour. Farms retain their fitted crop beds and square selection frames, and docks retain their separate shoreline behavior.

# Custom multiplayer battle chat and phone pinch zoom (version 2.6.1)

- Human players can chat during a multiplayer battle with All and Team channels. The server supplies each sender's identity, isolates rooms and team audiences, limits bursts and message size, and holds only the latest 100 messages in room memory. Rejoining restores only authorized room history. There is no database or disk chat log.
- Chat stays behind a small unread-count button until opened. Touch controls are at least 44 pixels high; the message field uses a 16-pixel font, and the panel responds to the visible viewport when the phone keyboard opens. Enter opens/sends chat on a keyboard; Escape closes it. Typed game keys cannot issue orders. AI-only battles hide the chat controls.
- Delayed confirmations remain matchable, retries reuse their identifier and the server avoids duplicate broadcasts while the original message remains in room history. Valid application traffic keeps an active connection alive; snapshots yield to control messages under backpressure, with a 4 MB socket backlog cap.
- Pinching with two fingers zooms without twisting the battlefield. Explicit camera rotation buttons and desktop rotation keys remain available.

# Terrain-fitted original crop fields (version 2.6.1)

- Three original Blender farms replace the previous fields with curved stalks, closed grain heads, thick leaves, cultivated soil, timber rails and an owner pennant. Low uses 48 stalks per field; Balanced and High use 144 with extra grain detail. Other buildings, troops, trees, resources and animated joints retain their original geometry.
- Fields, their selection rings and moving construction previews follow the displayed terrain. Picking, bounds and shadows use those same fitted vertices. Each field owns its fitted buffers, while source models remain reusable; moving a preview does not accumulate height errors.
- Land-building placement checks the footprint for water, while docks retain their shoreline rule. Full art regeneration includes the crop patch and updates the complete editable Blender source. The three quality catalogues remain complete, and Low remains below its 4 MiB content budget.

# Reliable worker routes and work direction (version 2.6.1)

- Workers finish the last short step of a route so reachable trees and deposits can be harvested. Approaches to mines, drop sites and combat targets can use another reachable cell within the existing interaction range when the nearest cell is crowded. Resources, water, connected walls and hostile gates retain their movement barriers.
- Changing the target or working range invalidates the previous route. AI resource assignments preserve the correct destination metadata, and old saved blocked deliveries retry instead of abandoning carried resources. Queued player commands remain intact.
- Gathering, building, repairing and depositing turn the worker toward the actual site, using the existing 3D model and smooth heading animation.
- Six new regressions cover the recorded woodcutter/farmer stalls, crowded starts, saved cargo and queues, AI resource changes, barrier protection and work direction. In the same 160-second coastal replay, gathering stalls drop from 19 to zero, while total blocked orders drop from 31 to 19. Other movement congestion and wider match balance still require work.

# Visible idle troops and coastal movement (version 2.6.1)

- Newly spawned and restored idle troops retain finite animation poses before their first simulation tick. A missing movement flag no longer makes their 3D bodies disappear. Walking, stopping and scene reattachment retain the same gait and articulated models.
- Units covered by an ordinary building foundation can walk out and continue their orders. The exception applies only to the containing footprint; other troops still see a solid building. Walls, hostile gates, water, resources and neighboring buildings keep their navigation barriers.
- Stalled units can choose an uncrowded route around nearby troops without teleporting or changing those troops' orders. The recorded 160-second coastal replay produces no boarding-stall records and reduces all blocked-order events from 54 to 31; remaining congestion still needs work.
- Regression coverage includes the recorded trapped knight, a healer behind farm workers, queued commands, save restoration, wall barriers and bounded navigation caches. A real local browser check confirms visible workers and finite poses in both troop rendering paths. Its software GPU does not establish frame rates on physical devices.

# Prevent accidental game text selection (version 2.6.1)

- Game labels, menus, dialogs, tooltips and battlefield controls disable native text selection and phone long-press callouts. Editable name, chat and room-code fields retain normal editing, selection and paste behavior. Keyboard focus, buttons, scrolling and gameplay gestures keep their existing controls.

# Dense starting forests (version 2.6.1)

- New matches place connected, harvestable 3D woodlines around starting settlements. Open front and flank entrances let players join forests with shorter defensive wall runs while retaining room for buildings, farms and armies. Coastal starts keep their harbor approach; trees respect water, map edges, nearby settlements, troops and buildings.
- Custom battles place every kingdom's buildings before distributing resources. Food, gold and stone patches try alternative clear positions instead of disappearing when their first location is obstructed. The same rules apply to allied AI and human multiplayer starts.
- Chopping trees creates real navigation breaches. Existing saved games retain their original layout. The forests use the existing original Blender models, instanced rendering and graphics detail settings; no new asset download is required.
- All 230 release regression tests pass and the production build succeeds. Forest checks cover seven maps, all three custom sizes, eight player slots, multiple seeds, advanced ages, campaign starts, construction space, harvesting, navigation, deterministic human multiplayer generation and save restoration. The design follows nearby-resource and defensive-wall principles described in the [official Age of Empires learning guide](https://www.ageofempires.com/learn-to-play/defending-your-empires-aoe2/). The separate browser check timed out during Chrome launch before loading the game; fresh visual checks, device frame rate and match balance still require playtesting.

# Graphics presets (version 2.6.1)

- Wall builders now continue through all owned, reachable unfinished wall sites, including different lines and individual placements. Canceling their current wall lets them continue the remaining sites. Explicit Stop/new commands and queued player orders retain priority; foreign walls are excluded. Save/restore, shared builders, refunds and real multiplayer commands have coverage.
- Graphics changes prepare new artwork before increasing GPU targets; superseded requests cannot overwrite a newer choice. Navigation releases the field/portrait renderers. Phone help explains deselection, placement, camera gestures and wall cancellation.
- Balanced now has its own complete Blender catalogue: detailed buildings/resources, lighter troops/forests and preserved source vertex precision. Every visible source triangle, material region, silhouette and animated joint passes decoded comparison; packing removes invisible zero-area faces. Its 14.74 MB download remains below High's 16.24 MB.
- Balanced and High include architectural roughness and ambient surface shading, with sharper hardware-capped texture filtering. All three presets retain near tree detail longer with the existing hold range.
- Directional shadows align to light-space texels for steadier camera pans. Full-resolution maps refresh at 20 Hz in Balanced and 30 Hz in High; camera/structural changes refresh immediately. Performance retains soft contacts with directional shadows disabled. Manual graphics stay fixed; Automatic uses the updated presets.
- Unused quality catalogues release their CPU references and GPU buffers after scene changes; active scene and portrait geometry remains pinned. Evicted presets reload safely when selected again. Muted startup avoids opening an audio device; rejected resumes are handled instead of interrupting play. 224 regression tests pass with one worker and the production build succeeds. These checks do not establish sustained frame rate on every device.

# Connected walls and touch selection (version 2.6.1)

- Wall drags retain 2.85-meter spacing, including long and diagonal runs. Persistent neighbor links join the original Blender wall bodies with shared solid masonry; turns keep their orientation, gates retain friendly passages and destroyed sections leave breaches after saving. Paid long runs continue beyond the bounded worker order queue; Stop cancels their work.
- Phone controls expose Deselect without stopping orders, Done building, automatic exit after successful touch wall placement and a small friendly-unit touch allowance when the actual body ray misses. Starting a new match clears placement state. Compact controls retain 44-pixel targets.
- Multiplayer wall lines validate owned builders, visible land and real resource costs on the server. Coastal movement retries discard obsolete paths; allied reinforcements stay on the threatened shore, replacement harvesting finds reachable resources and fleets receive distinct water formation slots.
- 207 regression tests pass. Browser wall checks cover 240 joint samples in Low, High and landscape phone rendering, real paid mouse/touch drags and the new phone controls. Coastal long-run diagnostics still identify congestion and boarding failures; the overall quality goal remains active.

# Troop rendering and coastal water (version 2.6.1)

- Battlefield settings offer Daylight, Moonlit Night and a gradual 18-minute Day/Night Cycle. Moonlight, ambient light, atmospheric fog and warm 3D building windows follow the lighting mode while rain, storms and lightning continue working. The choice is saved and survives reload; visibility and AI rules are unchanged.
- Tree detail uses a hold range, keeping the richer silhouette longer as the camera moves away and preventing repeated detail swaps under small camera movements. Distant trees still use lighter meshes to bound rendering work.
- Opaque Blender troop parts share one articulated draw per type/variant, preserving their geometry, materials, shadows and body picking. Pose textures grow with visible units; transparent parts retain their existing rendering path. All eighteen troop/ship types pass Low/High appearance and selection checks, with unchanged triangle counts and stable repeated-scene memory.
- Water uses the terrain depth and distance to its bank to distinguish deep water from shallows and add subtle animated shoreline foam. Waves settle at the bank and remain on the GPU; geometry is not rewritten every frame. Navigation and bridge terrain are unchanged.
- Fresh checks cover forty walking/cavalry/siege pose frames, felling and stumps, all four carried resources, interpolated cargo, depleted ore, age architecture, and phone camera interaction. Short frozen render comparisons reduce draw submissions; sustained frame rate and physical-device validation remain open.

# Phone battlefield space and combat audio (version 2.6.1)

- Short landscape phones use a compact resource bar, square minimap, selection strip and expandable command/camera controls. Empty selection panels disappear; training stays directly available, with research, queues and tactics in selection options. Construction and tactical orders close extra information for battlefield placement. Desktop keeps its full controls.
- Original metallic melee clashes replace the generic combat noise. Bows, structural blows and siege use separate effects. Combat audibility follows the current camera, zoom and fog; active clashes fade when the camera moves away. Cached effects and bounded overlap limit audio work in large battles.
- Buildings under construction retain the shader definitions required by their textured surfaces, fixing the compilation error found during production phone gameplay. Completed buildings restore their original materials.
- Browser checks cover four landscape sizes, two portrait widths, paid training/research, construction, tactics, production, camera controls and square minimap navigation. The smallest 568 × 320 view increases its clear battlefield area from about 27% to 60% with a selection; primary touch controls remain at least 44 pixels. Audio checks verify visible melee and ranged/siege attacks, fading on camera jumps, and silence for 100 offscreen attacks.

# Camera consistency and crowded-battle work (version 2.6.1)

- Camera frustums are ready before visual extensions run. Forests, grass and terrain details update before the GPU submission, including immediate pans and screen resizing.
- Contact shadows use this frame's interpolated position. Offscreen contacts skip normal/pose calculation; returning objects retain correct terrain alignment. Offscreen cargo and troop roots avoid unnecessary matrix work. Fire/smoke buffers upload only their used prefix.
- Crowded movement reads neighboring buckets directly without building temporary arrays. Combat queries use unit/building candidates, preserving surface-distance targeting, stable order, live deaths and scenery/resource queries. Worker assignment counts its economy once; route expansion reuses neighbor definitions and its best remaining distance.
- Six alternating CPU-only replay comparisons retain identical final states. The full suite passes 173 checks. Browser High/Low checks verify immediate forest/worker/cargo consistency and landscape resizing with all 126 models.

The complete quality goal remains active. These fixes do not establish AAA parity, a universal frame-rate achievement or release readiness.

# Fieldcraft and controls (version 2.6)

- Offline registration handles artwork decoding finishing after the page's load event. Both early and late startup timings have regression coverage, preventing a missed listener from leaving the page without an offline cache.

- Blender-authored branching fruit canes with closed leaflets, settled weathered ore and metallic gold inclusions/seams replace twelve resource variants. Both complete 126-model catalogues retain unrelated compressed geometry. The full editable Blender source is updated and checked, with the previous source preserved.
- Staged resource/full authoring prevents partial catalogues from replacing the game. Validation checks coverage, finite geometry, closed outward leaves and Low detail exclusions; patch hashes prevent adding the same resource payload twice.
- Phone canvas sizing follows the actual CSS container through orientation changes. The resource header fits compact landscape screens, primary touch targets are at least 44 pixels, objectives expand on demand and portrait camera options leave more battlefield visible. Real touch movement and paid training pass seven emulated screen sizes.
- Shared interface styles improve menu, custom setup, settings, field-guide, technology and room controls. Dialogs expose their titles, return focus to the opener and close with Escape from ordinary fields. Tab navigates keyboard-binding fields without overwriting their bindings; Escape still cancels capture.
- Cargo uploads only its used matrix prefix. Static stumps reuse terrain poses and unchanged instance matrices; their cache is bounded and pruned after removal. Gameplay, fog and authoritative positions are preserved.

The overall quality goal remains active. This milestone does not establish AAA parity, universal device compatibility, 60 FPS or complete release readiness.

# Crafted battlefields (version 2.5)

- Stronger rolling land across seven biomes, photographed grass/soil/rock blends, continuous soil roads and shore transitions. Bounded solid pebbles share one draw and respect fog and foundations.
- Seven verified CC0 sets provide 21 bundled maps. Natural rock grain replaces masonry on stone/gold deposits and textures terrain pebbles; separate solid gold inclusions remain metallic.
- Shared torso/limb pose prefixes retain the same animation with less repeated calculation. Cargo follows the figures' interpolated positions and turns. The full suite passes 156 checks; sustained frame-rate and physical-device validation remain open.

- Covered civic arcades, facade arches, steps and gable details; villager field packs and armored visors; species-shaped oak/birch/elm/beech canopies. Both complete Blender catalogues were regenerated.
- Local photographed plaster surfaces join wood, stone and grass, with verified CC0 credits. The lighter complete catalogue has a declared 4 MiB content budget.
- Smooth rendering between fixed simulation ticks, bounded network interpolation and gradual heading changes preserve authoritative gameplay positions.
- Required artwork retry, explicit graphics-start failure handling and saved production-update refresh. Live human rooms block refreshing mid-match. Loading status cannot erase a failed-download retry.
- Optional lighter Blender showcase avoids opening the full authoring scene during gameplay checks. Deterministic network timer testing isolates perspective remapping from sacred-site resets; the full automated suite passes 152 checks.
- Building batching preserves roof tile textures and team colors in both catalogues. The retry banner accepts mouse/touch input and stays available when background texture downloads finish.
- Animated water now uses GPU mesh displacement and analytical slope normals, with expanded wave bounds. Live High/Low checks verify visible waves, zero per-frame geometry updates and scene cleanup without shader errors.
- Terrain banks meet water level at the actual river/sea navigation boundary. Angle-dependent sky tint replaces the repetitive stripe map; the complete suite passes 153 checks with shoreline coverage.
- Fine moving ripple highlights use lighter intensity on Low; water-only visual probes exclude other objects and verify both presets without shader errors.

- Detailed closed leaf tips, muted canopy variation, bark grain and branched winter foliage with patchy snow. Extra broadleaf tip meshes are excluded from the smaller phone catalogue.
- Terrain-aligned weapon origins and rotating projectile arcs, reusable combat meshes, and cleanup of active cosmetic effects during scene switches. Idle contact shadows reuse cached terrain poses.
- Used-prefix uploads for troops, forests, contacts and ground cover, with team-color uploads only when packed ownership changes. Narrowed unit/building queries preserve immediate deaths/transfers, newly spawned entities and restored snapshots.
- Saved 30/60 FPS targets independent of visual presets, fractional-frame deadline pacing, and automatic quality based on the selected budget. Wider device/game quality acceptance targets are documented separately from development-laptop stress results.
- Curved tapering Blender trunks, branch bends, smoother closed foliage and projected-size tree detail. Distinct bow/melee combat poses use actual firing intervals; observed allied workers select the same solid tools and work poses as local units.
- Formation destination reservations, grouped injured retreats/support recall/coastal regrouping and retained retreat routes. One late-battle replay reduced blocked orders from 23 to 1.

- 126 original Blender models with near/low catalogues, adult-proportioned figures, nested joints, task-specific worker tools, refined buildings and solid foliage. Photographed CC0 grass, wood and masonry surfaces have local creator/source credits.
- Solid grass blades, bounded fallen troops and physical building rubble. Landscape-phone controls use a compact selection panel with larger touch targets.
- Shared troop batches across team colors, viewport/fog instance packing with correct picking IDs, building surface batching and repeat geometry sharing. Moving gates, flags, mills, harbor piers and construction clipping keep their behavior.
- Balanced, Grand war and Aggressive custom AI pacing. Major balanced offensives require an economy, Feudal Age and a fuller army; early defense remains active. AI allies lend real troops or ships, retain defenders, and recall help when threatened at home. Support assignments and pace survive saves.
- Allied support notices are private and remapped for each multiplayer perspective. Server AI alarm data is excluded from client snapshots.
- Indexed spatial queries, cached eligible resource drop-offs, cheaper fog circles and a single custom-victory scan reduce simulation CPU work. Automatic graphics reacts to actual elapsed frame time and respects manual quality.
- Added art, support/recall, privacy, graphics adaptation and economy regression checks, plus crowded-battle rendering diagnostics. High-load performance and physical-device/human release testing remain open.

# Kingdoms and skies (version 2.4)

- Rooted near-detail trees, solid winter snowcaps, wind movement, harvested tree falls and persistent stumps. Batched 3D cargo follows villagers, ore visibly shrinks with depletion, and town-center architecture gains physical features at each age. Stronger playable terrain relief, huge-map grass/fog coverage, allied animated gates, and observed multiplayer work animations.
- Coastal armies stay on their current shore, scout capitals before repeated harbor foundations, search cleared settlements, rebuild harbors with paid workers, reserve fleet population, prioritize transport replacement, fill balanced invasion crews, retry voyages, and choose flanking landing sites around observed defenses.
- Free single-service Render deployment configuration, health checks and a short deployment guide; optional Netlify static builds with a separate secure multiplayer endpoint and exact frontend origin permissions. Leaving now cancels pending reconnect attempts.
- Health, carried-resource and production timer updates preserve existing buttons and portrait canvases, preventing live updates from interrupting touch training or cancellation. Hosted connection errors stay visible in the multiplayer dialog.

- Configurable custom battles with two to eight kingdoms, human or AI slots, civilizations, teams, individual AI difficulties and six team/free-for-all presets.
- Huge 400 × 400 maps by default, plus 320 × 320 and 240 × 240 options. Navigation, fog, terrain picking, camera limits, minimap and rendering support the larger battlefield and eight army colors.
- Default victory requires all opposing buildings, including walls and foundations. Optional capital and total-conquest rules, capital rebuilding, public final-building markers, alliance results and defeat spectating.
- Authoritative mixed human/AI multiplayer, slot choice, readiness gating, per-team visibility, private economies, ownership, compressed compact snapshots, disconnect pauses, reconnect recovery and concessions that preserve surviving teams.
- Seeded weather transitions, volumetric rain/snow/clouds and splash rings, wet terrain/light changes, optional lightning, independent weather audio, reduced-motion support and quality budgets.
- Sustained AI attacks across large maps, independent planning, remembered-target cleanup and paid market trade for shortages. AI gathers and pays for armies, buildings and upgrades.
- Physical tree/ore navigation and construction obstacles, final-load delivery after resources run out, cached vision/movement regions, valid-route retention and bounded blocked-path retries.
- Low quality renders at up to 30 FPS; menu and hidden-tab rendering is throttled. Fresh settings choose Low on modest reported hardware, and unseen objects defer mesh allocation. Real-device FPS and balance remain separate release validation requirements.
- Expanded automated, browser and long-match diagnostics cover custom setup, eight real WebSocket clients, phone layouts, weather, ownership, reconnects, alliances, late-game progression and full-building elimination.

# Movement display update

- Removed selected-unit movement and queued-route lines on desktop and phones, including the route-display setting. Movement, patrol, guard, and queued commands remain available.

# Frontier chronicles (version 2.3)

- Three staged objectives per campaign chapter, original dialogue journals, optional medals, and active minimap/3D goal markers.
- Supply-caravan mesh model and guarded river escort with an explicit loss condition. Select-caravan and locate-goal controls are available in the objective panel.
- Frozen initial and stage checkpoints, commander-menu and defeat-screen recovery, local save/resume, and legacy rules for existing campaign saves.
- Settlement, fortress, shrine-control/conquest, siege-breach, and coastal landing/artillery chapter flows. Fishing objectives count deposited boat catch.
- Objective updates preserve scrolling/focus and expose interactive controls without triggering camera edge scrolling. Phone recovery controls and compact technology-tree layouts receive browser coverage.
- Exact waypoint arrival and island-aware naval regrouping reduce the coastal diagnostic run from 74 blocked orders to four. Remaining bridge/crowding cases still need review.
- Regression coverage includes normal economy/production, real escort navigation, shrine holding, paid naval artillery, actual gate attacks, actor loss, and checkpoint recovery.

This continues the playable beta roadmap. External balance and mission-pacing tests, real-device rendering performance, richer authored assets/audio, public online operations, and overall world-class parity remain unfinished.

# Commanders and kingdoms (version 2.2)

- Saved remappable keys with conflict/reserved-key validation, updated shortcut labels, and active bindings in Help.
- Patrol/guard orders, network ownership checks, queued-order summaries, and bounded 3D route previews. Routes follow terrain and stay visible above water for ships.
- Legal formation destinations, correct partial-path arrival checks, blocked-order feedback/recovery, axis sliding near obstacles, and safer automatic naval target selection.
- Paid strategic AI with planned economy/production, observed enemy memory, counters, age-resource reserves, repairs, retreats, healer escorts, scouting, and transport boarding reservations.
- Alder sentinels, Sunward marksmen, and Raven outriders with solid 3D model variants, costs, prerequisites, and counters. Shield drill, Caravan ledger, and Raiding parties add civilization-specific research.
- Interactive technology tree with faction comparison and eligible training/research. Older saves initialize added research fields.
- Higher-contrast interface, reduced decorative motion, larger tactical touch controls, and saved route preferences.
- Expanded simulation, graphics, control, strategy, save, and real-WebSocket regression coverage. New commander browser and passive-player AI soak scripts write reviewable artifacts.

This is a tested development milestone. Public matchmaking, replay/spectator services, richer authored campaigns, production-quality assets/audio, measured physical-device targets, independent balance testing, and overall world-class parity remain unverified or unfinished. Naval blocked-order cases remain under review.

# Realm in depth — version 2.1

## Radar and production controls

- Square minimap at desktop, tablet, and phone sizes. A rectangular camera locator replaces the irregular perspective polygon; a center dot makes location readable when zoomed out. The rectangle encloses the visible ground and updates while scrolling, zooming, and rotating.
- Mouse and touch dragging on the minimap, accurate curved waterways and bridges, visible ship/resource icons, and orders restricted to playable terrain with reachable edge coordinates.
- Fog matches the terrain triangulation at every quality setting.
- Production overview (P or the top-bar button) shows active/idle buildings, units, research, age advancement, progress, and cancel/refund controls. Select a production building to locate it or select a whole building type.
- Queue refreshes preserve panel scrolling and keyboard focus, including short landscape phone layouts.
- Train across several selected buildings, balancing requests by remaining queue time. Shift-click queues up to five; phones have +5 buttons. Resource, population, ownership, age, and queue limits remain enforced, including authoritative multiplayer requests.
- Nine additional automated checks cover radar geometry, boundaries, batch distribution, budget limits, network request planning, and saved production queues. Browser scripts exercise laptop/phone radar and production controls.

## Mouse camera controls

- Mouse edge scrolling enabled by default on all four viewport edges and diagonal corners, with directional cursor arrows and camera-relative movement.
- Saved toggle and speed control in Settings; stops over controls, during menus and pauses, on blur/viewport exit, and for touch input or middle-button dragging.
- Construction previews follow the cursor while edge scrolling moves the terrain beneath it.
- Browser verification covers eight directions, rotated views, stopping conditions, settings persistence, and touch protection.

- Rebuilt all 19 building models and all 14 troop/ship/sovereign models, with faction architecture, solid folded sails and banners, shaped humanoids and horses, and articulated limbs, wheels, oars, rams, and trebuchets.
- Rebuilt trees, ore deposits, fruit, fish, and shrines as volumetric models.
- Replaced flat ground and cone-shaped map borders with seeded terrain and ridges. Picking, actors, foundations, fog, construction previews, and effects follow the triangulated terrain surface.
- Moving water vertices, submerged naval basins, dry bridges, lifting gate portcullises, construction scaffolds/clipping, and actual 3D building previews.
- Live WebGL selection portraits, object inspection on mouse/touch, closer perspectives, and a button to hide battlefield panels.
- Visible forests pack into near/far instanced batches with solid geometry at both detail levels. Camera obstruction handling, efficient crop geometry, bounded portrait refresh, and cleanup between maps.
- Five additional graphics checks cover all model types/civilizations, terrain determinism, surface picking, bridge/sea elevations, model bounds, batching, and skeletal motion. Browser coverage exercises every biome, naval rendering, live portraits, inspection, and landscape phone controls.

# Frontiers & fleets — version 2.0

## Visual depth update

- A closer default perspective and three selectable camera angles, with visible rotate/zoom buttons, V shortcut, two-finger touch rotation, and saved camera preferences.
- More directional light, procedural environment illumination, camera-centered shadow coverage, and shared contact shadows that remain available with dynamic shadows disabled.
- Surface relief on masonry, timber, and roofs; separate roof and troop materials; aligned gables; raised timber framing, windows, eaves, and entry steps; smoother heads and shaped torsos.
- Browser checks cover camera buttons, picking after rotation, persisted settings, actual two-finger touch events, and contact shadows in Performance quality.

## Gameplay

- Two-player Wi-Fi rooms with five victory rules, mirrored starting forces, private player economies, per-player fog, command ownership checks, and session reconnection.
- Naval conquest, a divided-coast map, and a sixth campaign chapter.
- Shoreline harbors, fishing boats with actual catch deposits, galleys, siege galleons, and eight-passenger transports.
- Embarking, disembarking, passenger loss when a transport sinks, naval navigation, ship production, and seamanship research.
- Tactical AI responds to observed cavalry/archers, defends its base, repairs buildings, escorts attacks with healers, manages fishing, and ferries invasion forces.

## Presentation and performance

- Articulated legs, arms, weapons, and working villagers through instanced model parts.
- Rocking ships, ship wakes, animated water, harbor jetties, gabled roofs, textured materials, and rounded forest canopies.
- Exploration controls forest visibility. Hidden units are not included in multiplayer opponent snapshots.
- Layered impacts, arrows, siege sounds, stereo placement, birds, wind, and music. Effect counts and audio voices are bounded.
- Heap-based pathfinding, indexed entity lookup, broader collision checks, cached animation transforms, and interpolated network movement.
- Selected-unit combat attributes, clear transport unloading controls, room codes, and phone-compatible room menus.

## Validation

- Automated simulation and real WebSocket tests cover economy, queues, ages, research, combat, walls, victory rules, save compatibility, naval mechanics, player ownership, fog masking, fair starts, and reconnect pauses.
- Browser QA covers naval controls and a live desktop/landscape-phone match, phone troop training, and reconnection after a reload.
- Hardware performance and game balance still need broader real-device and human playtesting. This release does not establish commercial AAA parity.
