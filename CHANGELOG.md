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
