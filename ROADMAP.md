# Crowns of the Frontier: quality roadmap

Reviewed 13 October 2026 against the version 2.6 source and current verification scripts. The user's quality goal explicitly includes design, style and UI/UX throughout the system.

This is an ordered development proposal, not a claim that its milestones have been implemented. The current game is a playable beta. A world-class assessment needs independent player feedback, reliable performance, strong content, and sustained quality across complete matches.

## Current baseline

- Three.js world with elevated terrain, solid building/unit/resource models, articulated parts, animated water, and 3D selection portraits.
- Resource gathering, construction, queues, upgrades, ages, unit counters, siege, healing, walls, gates, fleets, transports, fog, saves, and several victory conditions.
- Nine modes, seven seeded maps, six campaign chapters, three civilizations, 19 building types, and 16 trainable types across the catalog plus sovereigns.
- Two-to-eight-kingdom custom battles, AI allies/enemies with individual difficulties, human slots, huge maps and three elimination rules.
- Classic two-player and custom mixed human/AI Wi-Fi rooms with authoritative commands, team perspectives, readiness and reconnection. Rooms are held in server memory; they are not a public matchmaking service.
- Seeded volumetric weather, pooled effects, optional audio/lightning and quality budgets.
- Rooted and wind-animated trees, winter snowcaps, harvested tree falls/stumps, batched carried supplies, ore depletion, and age-specific town-center architecture. Huge-map fog and grass cover the full playable area.
- Free Render deployment configuration for one game/multiplayer service, plus optional Netlify static hosting and a separate secure multiplayer endpoint. Hosting variants have local browser coverage; no public deployment is active.
- Mouse edge scrolling, corner scrolling, cursor arrows, keyboard controls, camera inspection, and landscape touch input.
- Square radar with a rectangular camera locator and mouse/touch dragging. Global production overview, selection across completed production buildings, balanced training batches, and cancel/refund controls.
- Existing automated simulation/graphics/network checks and browser verification. Physical-device performance, balance, and extensive human playtesting remain unverified.

## Version 2.5 art, AI and performance progress

- Integrated 126 original Blender models, near/low catalogues, photographed CC0 surfaces, adult figures with nested joints, task-specific worker tools, solid grass and bounded battlefield remains. The art pipeline and creator/source credits are documented.
- Packed visible troops into shared team-colored batches with correct picking, merged static building surfaces and shared repeat geometry, while keeping flags, gates, mill rotors, harbor piers and construction effects. The updated live settlement fixture uses 218 draws, compared with 483 before batching. Used instance prefixes reduce recurring matrix uploads, and unchanged ownership avoids color uploads.
- Added Balanced/Grand war/Aggressive custom pacing, paid army/economy buildup before major balanced attacks, allied land/naval support, home reserves and recall. Saved assignments and multiplayer notice privacy have regression coverage.
- Spatial queries, resource drop-offs, fog circles and custom victory scans reduce CPU work. A full eight-Hard-AI Balanced highlands battle reached normal all-building victory after approximately 20 simulated minutes, with every kingdom reaching Imperial Age.
- The full automated suite passes 156 checks, including shorelines, all-biome surface transitions and exact shared joint poses. Production checks cover the Blender roster, landscape touch, pooled effects, download retry, current artwork revisions, saved updates and real-room refresh guards. Civic arcades, field gear, species-shaped forests, photographed plaster, rolling terrain, natural roads/shore blends and textured resources improve the visible world. Seven CC0 sets provide 21 local maps. GPU water removes per-frame geometry uploads; joint-prefix reuse avoids repeated animation work, and cargo follows interpolated figures. Sustained device performance and independent player assessment remain open.
- Performance remains open: short headless crowded-battle results vary and still miss the declared 60 FPS desktop target on this 4 GB Intel UHD laptop. It is a constrained diagnostic device, not the standard for all users. [QUALITY_TARGETS.md](QUALITY_TARGETS.md) preserves full art/gameplay/device acceptance targets; [RELEASE_CHECKS.md](RELEASE_CHECKS.md) records actual measurements. Formation recovery reduced one saved replay's blocked orders from 23 to 1, but broad routing, sustained device performance and human playtests remain unfinished.

## Version 2.4 custom-battle progress

- The requested AI and real-human battle configurations are implemented separately in one custom setup. Solo configurations convert the other enabled slots to AI; multiplayer preserves Human slots and allows AI kingdoms alongside them.
- Huge maps, eight kingdoms, allied gates/healing/shared vision, independent AI economies and planning clocks, capital rebuilding, all-building elimination, optional conquest/capital rules and team victory are implemented.
- Multiplayer checks include eight real WebSocket participants, private economies and fog, ownership, mixed AI/humans, guest slot choice, readiness, concessions, host defeat, reconnect and winning/losing alliance perspectives.
- Resource exhaustion, unreachable routes, outer-map picking and private completion notices were corrected during the audit. Cached movement regions, route retention, vision indexing, pooled weather and reduced render cadence address measured CPU/GPU pressure.
- Coastal armies use their current shore, scout capitals, search remaining settlements, reserve fleet capacity, rebuild harbors, prioritize transports and fill balanced crews. A full eight-kingdom paid coastal war now reaches all-building victory; the final diagnostic lasted about 19 simulated minutes.
- Keep physical-device performance, multiplayer latency/failure testing and human balance/pacing reviews in the release checklist. The original 3D art remains procedural; commercial world-class parity has not been established.

## Version 2.3 campaign progress

- Six chapters now have three authored stages each, original dialogue journals, optional completion medals, and active goal markers in the minimap and explored 3D world.
- The river chapter has a modeled supply caravan, guarded escort navigation, a bridgehead objective, a loss condition, and recovery through frozen checkpoints.
- Fortress defense requires a completed castle and the wave objectives. Sacred valley supports shrine control or a recorded conquest alternative. Final siege requires paid siege production and a defensive breach. The coastal chapter counts actual deposited fishing catch and accepts a landing or an Imperial siege-galleon route.
- Initial and stage checkpoints preserve actors, objectives, economy, armies, exploration, and AI state without recursive snapshots. Existing campaign saves retain legacy rules.
- Automated scenarios use gathering, construction, training, escort movement, shrine control, fishing, and gate attacks to exercise the chapter flows. All four difficulties initialize every chapter. Browser verification covers journals, selecting and inspecting the caravan, locating goals, defeat recovery, local save/resume, and emulated-phone controls.

Pass 4 has a playable scripted baseline. Human completion tests on all difficulties, more mission events and set pieces, professional narration/audio, broader map fairness checks, and mission pacing remain unfinished.

## Version 2.2 implementation progress

- Saved remappable keyboard controls, reserved-key validation, conflict reporting, active key documentation, and updated shortcut labels.
- Patrol and guard commands in the simulation, desktop/touch interface, saves, and authoritative network commands. Formation slots avoid blocked terrain. Partial paths no longer count as successful arrival; persistent blocked orders report feedback and yield to queued orders.
- Selected-unit order summaries and bounded 3D route previews, including patrol return routes and ship routes above the water.
- Paid AI economy and army planning, civilization-aware counter composition, scouting memory, age-resource reserves, worker reassignment, repairs, retreats, healer escorts, and transport boarding/departure reservations.
- Three civilization-exclusive units with solid model variants, explicit costs, age/building requirements, and distinct roles. Three exclusive technologies affect armor, market exchange, and cavalry raids. Old saves initialize the new research fields.
- Interactive technology tree with faction comparison, prerequisite/status explanations, training, and research. Higher-contrast UI, reduced decorative motion, and larger tactical touch buttons.
- Regression coverage now includes these behaviors. Commander browser checks exercise remapping, persistence, tactics, queued-order feedback without movement lines, save/resume, and desktop/emulated-phone layouts. Passive-player soak checks exercise full land, river, and coastal matches and record simulation CPU timings.

Passes 1 through 3 have concrete implementation progress; they are not fully complete. Group cohesion, advanced recovery, AI expansion, further economy/combat tuning, richer strategic interactions, authored missions, asset/audio production, measured device performance, public online services, and external playtesting remain on the roadmap. Naval regrouping now respects the current island, and movement reaches the actual final waypoint rather than stopping at a grid center. The latest coastal soak reports four blocked orders instead of 74 in the previous diagnostic run; remaining land/bridge cases still need review. CPU timings from automated simulations do not establish rendering FPS, phone performance, or enjoyable difficulty.

## Development order and release checks

| Pass | Work to implement or improve | Evidence required before declaring the pass complete |
|---|---|---|
| 1. Controls and army movement | Remappable hotkeys, selection priority, production across selected buildings, global production queue, queued-command feedback, patrol/guard behaviors, formation cohesion, obstacle avoidance, and recovery from blocked routes. Preserve edge scrolling and touch input. | Repeatable mouse/keyboard/touch scenarios; armies navigate woods, walls, gates, bridges, and crowded towns; no duplicated queued orders or indefinitely stuck troops in the tested cases. Local command feedback and execution latency measured on reference hardware. |
| 2. Economy, AI, and battle balance | Explicit AI build orders and resource budgets, scouting memory, different attack plans, counter-unit composition, regrouping, retreating, siege protection, expansion, transport decisions, and difficulty based on decisions. Audit starting advantages and any difficulty bonuses. | Seeded economy and combat scenarios; AI can recover after worker losses and exhausted nearby resources; attacks change based on observed enemies; difficulty rules are documented; human testers find each level understandable and challenging. |
| 3. Civilizations and strategic depth | Build on the implemented exclusive units/technologies, technology tree and eight-kingdom team support with clearer identities, more useful upgrade choices, land/naval counters and alternative economic strategies. | Comparable-cost counter scenarios plus human matches; all additions have costs, prerequisites, counters, descriptions, art, audio, AI support, saves, and multiplayer validation. Balance judged across maps and skill levels. |
| 4. Missions and map design | A mission-event system with staged objectives, dialogue, reinforcements, escort/rescue tasks, branching optional goals, checkpoints, and authored set pieces. Curate resource placement, chokepoints, naval landings, and spawn fairness. | Each mission can be completed and failed correctly on each difficulty; checkpoints restore the correct event state; missions require different strategies; map objectives and travel routes remain reachable. |
| 5. Art, animation, and sound | Establish a consistent medieval art direction; replace or refine the procedural assets with original or appropriately licensed authored models, textures, character rigs, transitions, worker tasks, cargo, attack impacts, damage, and death animations. Add distinctive music, unit responses, ambience, and readable combat sound. | Visual review in real gameplay at every quality setting and camera angle; recognizable units and silhouettes; animations match actions; assets fit performance budgets; retain real mesh geometry at every detail level. |
| 6. Laptop and phone experience | Profile CPU/GPU work, pathfinding, draw calls, memory, network snapshots, and input delay. Improve detail levels, shared routes, batching, effects budgets, loading, safe areas, readable UI, touch selection, UI scaling, and accessibility options. | Publish device/browser/specification results. Proposed targets: 60 FPS on a defined reference laptop and 30 FPS on defined supported phones in benchmark matches. Verify sustained performance, frame-time spikes, thermal behavior, and memory over long sessions. Targets are not current achievements or guarantees for every device. |
| 7. Multiplayer and community | Extend the implemented team rooms, readiness, authoritative validation, defeat spectating and reconnect recovery with public hosting, persistent rooms, matchmaking, profiles, replays and operational monitoring. | Test multiple clients, latency, packet loss, disconnects, server restarts, ownership, hidden-information handling, version compatibility, and replay results. Hosting choices and ongoing costs need an explicit deployment decision. |
| 8. Release readiness | Improve onboarding, settings, saved-game migrations, campaign progression, post-match economy/combat graphs, installation/update behavior, diagnostics, recovery, and documentation. Conduct repeated external playtests and fix their highest-impact problems. | Long complete matches, all modes, save/resume/update cycles, physical phones/laptops, multiplayer failure scenarios, and accessibility reviews pass the agreed release checklist. Record remaining limitations instead of labeling unchecked areas complete. |

Performance, regression testing, and human feedback run throughout these passes; they are not postponed until the end.

## Recommended next release

Start with Pass 1 and the most visible parts of Pass 2:

1. Global production overview and multi-building training are implemented. Configurable hotkeys and queued-order feedback are now implemented; continue with group cohesion, obstacle recovery, and full-match input testing.
2. Continue control refinements with profile management, selection priority, and accessibility reviews.
3. Improve group movement through gates, around buildings, and over bridges; show blocked-order feedback.
4. Refine the implemented AI plans with expansion, resource exhaustion recovery, siege protection, and human difficulty tuning.
5. Exercise complete economy-to-victory matches with several seeds and difficulties, followed by laptop and phone playtests.

Deliver these as tested releases that can be played and reviewed. Additional units or prettier screenshots alone do not establish overall game quality.

## What can be developed here and what needs outside evidence

The existing workspace supports implementation of gameplay, AI, UI, asset integration, shaders, animation, performance instrumentation, testing, and multiplayer services. Professional asset/audio production requires suitable original work or licensed sources. Physical-device results require access to the actual devices or measurements from testers. Public online operation requires a hosting decision and ongoing service resources. Fun and balance require repeated human playtesting.

No honest development process can promise an objective “100% world-class” score. The useful commitment is to finish defined requirements, publish test evidence, address player feedback, and improve successive releases.

## Research references

- [Official Age of Empires IV Season One development notes](https://www.ageofempires.com/news/age-of-empires-iv-season-one-update-release-notes/): controls, global production queues, patrol, player feedback, balance, maps, campaign tuning, and post-match navigation. Used as a genre quality reference, not a statement of this project's implemented features.
- [Official Age of Empires IV Season Two development notes](https://www.ageofempires.com/news/age-of-empires-iv-update-17718/): continued iteration across controls, game modes, multiplayer, and stability.
- The baseline above is supported by the local source, [README](README.md), [change log](CHANGELOG.md), and tests/scripts in this repository.
