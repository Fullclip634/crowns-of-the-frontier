# Crowns of the Frontier

Optional WebGPU preview: append `?renderer=webgpu` to the game URL. WebGL remains the default and compatibility fallback. See [setup, verification and limits](WEBGPU_MIGRATION.md).

An original 3D browser RTS built with Three.js. Version 2.6.1 integrates 126 original Blender models, photographed CC0 surfaces, raised terrain, solid ground cover and battlefield remains. Custom battles support up to eight kingdoms, configurable human/AI slots, allies and enemies, individual difficulties, large maps, team multiplayer and 3D weather. Staged campaigns, checkpoints, naval warfare, civilization-exclusive troops and upgrades, a technology tree and laptop/phone controls are available. Compact phone panels leave more battlefield visible. Original metallic combat sounds follow the camera; shoreline shading, optimized articulated troops, stable tree detail and moonlit lighting improve the 3D presentation. This remains a development beta; verified scenarios and open release requirements are recorded in [RELEASE_CHECKS.md](RELEASE_CHECKS.md).

In **Settings → Battlefield lighting**, choose **Daylight**, **Moonlit night**, or **Day & night cycle**. Night has cooler ambient light and warm building windows, and works with rain and storms. The cycle takes 18 minutes of game time; pausing single-player also pauses it. The choice is saved on the device. Nearby trees retain richer models; distant trees use lighter versions, with a hold range to reduce repeated detail swaps while panning.

Graphics presets retain their manual choice. **Performance** uses lighter models, photographed color surfaces and soft contact shadows. **Balanced** now uses the detailed buildings/resources with lighter armies and forests, normal/roughness surfaces and full-resolution shadows refreshed at 20 Hz. **High** retains the detailed full roster, stronger surface filtering and 30 Hz shadows. Camera and structural changes refresh shadows immediately. Automatic can select these presets and adjust resolution under pressure; manual choices stay fixed. Actual frame rate still depends on the device and battle load.

On phones, tap **Deselect** to clear selection while units continue their orders. Tap **Done building** to leave placement; successful touch wall placement exits automatically. Wall drags keep fixed spacing and connected stone joins; destroyed sections leave a breach. Builders finish their line, then continue other reachable unfinished walls you own, including individual sections and separate lines. Stop or a new command interrupts work; queued commands take priority. To remove a mistaken wall, select it and choose **Cancel construction** or **Demolish** (under the selection's **Options** on phones).

## Play

For a free online address with one service hosting the game and multiplayer, use the included Render deployment file. See [the short deployment guide](DEPLOYMENT.md). Netlify static hosting is also configured; it needs a separate running server for real-person multiplayer.

```powershell
npm install
npm run build
npm start
```

Open **http://localhost:4173** on the laptop. On a phone connected to the same Wi-Fi, open **http://YOUR_LAPTOP_WIFI_IP:4173**. Landscape is recommended. The laptop must keep the game server running. If the phone cannot reach it, check that the local network permits connections to port 4173.

For development, `npm run dev` serves on port 5173. Use `npm start` for Wi-Fi multiplayer; the static Vite preview server does not host rooms.

### Play with a friend

Both players open the same laptop's game URL. Choose **Play with friends**, enter a commander name, then create or join a room. Share the six-character room code with the second player. The host starts once both players join. Conquest, regicide, shrine control, wonder race, and naval conquest are supported.

The server runs the simulation and checks command ownership. Each player sees their own economy and fog of war. Classic two-player rooms receive mirrored starting towns and armies. If a connection drops, the match pauses for a reconnect grace period of two minutes. Refreshing the page preserves a room credential in session storage; choose **Rejoin your previous network session**. The menu does not pause an otherwise connected network match. Leaving a started match concedes that kingdom. Restarting the laptop server ends its in-memory rooms.

### Custom battles with AI or real people

Choose **Custom battle**. Enable two to eight kingdoms, set their civilizations and team numbers, and choose a difficulty for each AI. Matching team numbers are allies. Presets include 2v2, 3v3, 4v4, 1v3, and four/eight-way free-for-all. Without other people, all remaining enabled kingdoms are AI, including your allies.

**Huge** is the default: a 400 × 400 battlefield, 6.25 times the area of a classic map. Large is 320 × 320 and Spacious is 240 × 240. Choose any of the seven biomes, a seed, starting age, starting resources, population cap, shared allied vision, and victory rule. Coast battles begin in at least the Feudal Age and include harbors, fishing boats and transports.

The default victory rule is **destroy all opposing buildings**, including walls and unfinished foundations. Losing a capital alone does not eliminate a kingdom; surviving villagers can rebuild. Other rules require the last town center to fall, or require every opposing unit and building to be defeated. The final few buildings can be revealed after a capital falls to help finish the war. Battles develop through real paid gathering, construction, upgrades and armies; their length depends on the battle rather than a forced minimum timer.

Choose **Balanced** for economy and army buildup before major AI offensives, **Grand war** for a longer opening, or **Aggressive** for early pressure. Balanced also requires Feudal Age, enough workers and a fuller army. Defense stays active from the beginning. AI allies can send a limited reinforcement group to a threatened allied settlement or harbor, keep troops at home, and recall support if their own base is attacked. They use existing units and regular movement, with no free reinforcements. The selected pace is preserved in saves and multiplayer setup; older saves retain their previous aggressive pacing.

For real people, choose **Human slot** for each friend and **Host multiplayer battle**. Friends join using the room code and can choose an available Human slot. Every human must be connected and ready before the host starts; AI slots are ready automatically. Human and AI kingdoms can fight together or against each other. A defeated host can watch surviving allies, and the match continues until one alliance remains. Each client receives its own command perspective and private economy.

### Weather and graphics

Automatic weather changes from clear skies to clouds, rain or storms; Winterwood can receive snow, and the desert is drier. Rain, snow, clouds and splash rings use 3D meshes with pooled instances. Weather changes atmosphere without altering resource or combat rules. Settings provide automatic or forced weather, independent weather audio, and optional lightning flashes; reduced motion disables flashes.

The world also has rooted trees with wind movement and winter snowcaps, falling harvested trees and persistent stumps, carried logs/sacks/ingots/rocks, shrinking ore deposits, stronger terrain relief, and town-center architecture that changes through the four ages. Cargo and stumps use at most five additional draw calls. The HUD, text, and square radar remain readable interface elements over the 3D battlefield.

Buildings, troops, trees, resources and worker tools load from the Blender catalogue. Workers switch between solid axes, picks, harvest tools and hammers as their jobs change. Nested joints animate the figures; cavalry includes horses and riders. Near and lower detail catalogues preserve the same gameplay roster. Grass blades have physical thickness, and fallen troops and scattered building rubble fade within bounded visual budgets. Photo surfaces come from [Poly Haven](https://polyhaven.com/license); their creators and sources are recorded in [the texture license](src/assets3d/textures/LICENSE.md). See [the art pipeline](ART_PIPELINE.md) to edit or rebuild models.

Graphics quality and frame-rate target are separate settings. Automatic targets 60 FPS for desktop and 30 FPS for primary-touch devices; players can choose 30 or 60 explicitly. Low reduces particles, shadows and geometry while retaining the selected frame target. Medium uses the lower detail catalogue with normal maps; High uses the larger catalogue and full surface maps. Automatic quality adjusts detail/resolution to the selected frame budget; switching detail preserves camera and selection. A fresh installation chooses conservative graphics on modest reported hardware, while saved choices take precedence. Menus and hidden tabs render less often, and unseen objects defer mesh allocation. These are budgets, not achieved FPS guarantees. The development laptop is one stress case; [QUALITY_TARGETS.md](QUALITY_TARGETS.md) defines the broader device and gameplay acceptance goals.

Start with **First light**, the guided tutorial. Use **Clash of crowns** for a standard match. **Legendary** difficulty offers early attacks and relentless pressure. The game runs locally; it does not require an account.

## Included gameplay

- **Nine modes:** tutorial, conquest skirmish, regicide, ten-wave survival, shrine control, monument race, peaceful sandbox, naval conquest, and configurable custom battles.
- **Six campaign chapters:** settlement, river crossing, fortress defense, sacred valley, final siege, and a coastal invasion. All chapters can be played immediately. Each has three staged objectives, an original dialogue journal, an optional completion goal, and checkpoints. The river chapter requires a protected caravan escort; shrine control supports an alternative conquest route, and the coastal chapter supports landings or naval artillery.
- **Seven seeded maps:** Emerald highlands, river crossing, sunlit steppe, Winterwood, iron frontier, twin rivers, and the divided coast. Seeds reproduce resource layouts. Bridges create movement chokepoints; winter has additional timber, the iron frontier has contested central ore, and the coast requires fleets or transports.
- **Three original civilizations:** Alder Kingdom (durability), Sunward Sultanate (economy and construction), Raven Clans (cavalry).
- **Four difficulties:** Explorer, Commander, Conqueror, Legendary. Difficulty changes enemy decision and attack timing; survival also changes wave strength.
- **19 buildings:** town center, house, farm, mill, lumber camp, mining camp, barracks, archery range, stable, siege workshop, blacksmith, market, watchtower, castle, stone wall, gatehouse, monastery, grand monument, and harbor.
- **16 trainable unit types across the catalog:** villager, scout, spearman, archer, man-at-arms, knight, battering ram, trebuchet, healer, fishing boat, galley, siege galleon, and transport, plus civilization-exclusive Alder sentinels, Sunward marksmen, and Raven outriders. Each civilization has access to its own exclusive troop. Regicide adds an irreplaceable sovereign for each side.
- **Four ages** with population limits, paid training queues, rally points, age requirements, automatic age strength improvements, and queue cancellation refunds.
- **Ten technology families across the catalog:** gathering tools, melee attack, armor, ranged attack, fortification, cavalry speed, and seamanship, plus civilization-exclusive Shield drill, Caravan ledger, and Raiding parties. Research levels have age requirements and increasing costs.
- Harbors must be built near a shore. Fishing boats collect fish and return their catch to a harbor. Command land troops onto a friendly transport to embark up to eight passengers; select the transport, choose **Unload**, and select nearby open land. Sinking a transport defeats its passengers. Siege galleons can bombard shoreline defenses.
- Villagers physically walk between resources and drop-off buildings, carry supplies, construct buildings, and repair damage. Farms provide renewable food. Mines and trees deplete. Markets buy and sell resources for gold.
- Walls block paths; friendly units can pass through gates. Connected walls support queued construction. Construction can be canceled for a 70% resource refund; finished buildings can be demolished for a 20% refund. Your last town center is protected from accidental demolition.
- Unit counters, splash siege damage, automatic healing, defensive towers, formations, aggressive/hold stances, queued orders, box selection, type selection, numbered control groups, and visible selected-unit attributes.
- Enemy AI responds to visible threats, repairs damaged buildings, reinforces counters against observed unit types, escorts attacks with healers, and runs a fishing and transport economy on the coastal map.
- Articulated walking, weapon motion, working villagers, rocking ships, ship wakes, drifting water textures, textured masonry and wood, gabled roofs, and biome-specific foliage. Hidden forests obey exploration. Battle audio includes impact layers, arrows, siege sounds, stereo placement, wind, birds, and ambient music, with bounded effects and audio voices.
- Closer perspective cameras, selectable close/perspective/overview angles, mouse and touch rotation, surface relief, directional lighting, sharper camera-centered shadows, timber framing, window recesses, and shared instanced contact shadows that remain available in Performance quality.
- All 19 building types and all 18 character/ship types (16 trainable across the catalog, the sovereign, and a campaign supply caravan) have solid mesh models. Buildings use arches, domes, gables, piers, fences, turrets, grain stalks, and distinct workshops. Human models have faces, shaped torsos, jointed limbs, held tools and weapons; cavalry adds modeled horses, and siege equipment has moving wheels and mechanisms. Trees, ore deposits, fruit, fish, and shrines also use mesh geometry.
- All seven maps have seeded rolling terrain and surrounding ridges. Picking, walking, building foundations, effects, previews, and fog follow the surface. Bridges stay dry and naval channels have submerged beds. Water has moving vertices and updated normals. Nearby gate portcullises lift for friendly troops.
- Selection portraits render the actual model as a live WebGL turntable. Tap/click the portrait, or press **I**, to inspect the selected object. The square camera button hides or restores battlefield panels for an unobstructed view.
- Fog of war, exploration, a working minimap, mission objectives, victory/defeat screens, match statistics, synthesized audio, pause, game speed, local saves, and campaign completion tracking.
- Landscape-first touch interface, pinch zoom, drag pan, responsive menus, graphics presets, and automatic rendering resolution adjustment.

## Controls

These are the default keyboard bindings. Settings lets you remap controls with conflict checks; Escape, Tab, and numbered control groups stay reserved. Custom bindings, higher-contrast UI, and reduced decorative motion are saved on this device.

| Action | Laptop | Phone/tablet |
|---|---|---|
| Select | Left click; Shift adds; drag a selection box | Tap a unit or building |
| Command | Right click; Shift queues | Select units, then tap ground, enemies, or resources |
| Pan | Mouse at the game-window edges/corners, WASD/arrows, or middle-button drag | Drag the battlefield |
| Zoom | Mouse wheel | Two-finger pinch |
| Rotate | Q/E or camera arrow buttons | Two-finger twist or camera arrow buttons |
| Camera angle | V or the camera view button | Camera view button |
| Inspect selected model | I or selection portrait | Tap selection portrait |
| Hide/show panels | Square camera button | Square camera button |
| Center town | H or minimap home | Minimap home button |
| Radar navigation | Click or drag the square minimap | Tap or drag the square minimap |
| Production overview | P or top-bar P button | Top-bar P button |
| Queue five troops | Shift-click a troop; +5 in building groups | +5 in building groups |
| Select army | M | Army button |
| Idle villagers | Period | Idle button |
| Construct | B | Build button |
| Attack move | F, then click | Attack button, then tap |
| Stop / hold | X | Stop button |
| Patrol | R, then click a destination | Select military units, tap Patrol, then a destination |
| Guard | G, then click a friendly unit/building | Select military units, tap Guard, then an ally |
| Groups | Ctrl + 1–9 assigns; 1–9 recalls | Army/type selection buttons |
| Focus selection | Space | Tap minimap to navigate |
| Pause | Esc | Pause button |

Choose **Stone wall** and drag across visible, open land to place a connected line. Use **Shift** to keep other construction tools active. Select a completed military building to train troops, a blacksmith to research combat technologies, or the town center to advance ages. Use the in-game **Field guide** for costs and counters.

Mouse edge scrolling is enabled by default. Bring the cursor into the outer 24 pixels of the game window to pan; corners pan diagonally and a directional arrow appears. Scrolling follows the rotated camera, stops outside the game or during menus/pauses, and avoids controls. **Settings** includes an on/off toggle and speed slider. Touch gestures continue to pan and zoom. Fullscreen lets you use the monitor edges.

The square minimap acts as your battlefield radar. Its outlined rectangle encloses the ground within the camera view, and its center dot marks where the camera is aimed. The locator remains rectangular at map edges and follows rotation and zoom. Right-click the minimap to give selected units orders; commands outside the playable battlefield are ignored.

Open **Production** with **P** or the top-bar button to see your completed production/research buildings, active queues, progress, and idle sites. Tap a building to select and locate it, or choose its type to select several. Troop orders across selected buildings go to the shortest available queue. Use **+5** or Shift-click to request a batch, limited by resources, population, ages, and queue capacity. Tap queued items to cancel and refund them. Research and age advancement also appear in the overview.

Selected units show their current orders and queued waypoint counts. Movement commands display without route lines on desktop and phones. Unreachable orders report a blocked route and yield to the next queued order. Melee units do not automatically pursue ships beyond their reach.

Open the Field guide and choose **Explore the technology tree** to compare civilizations, inspect age and building requirements, and train/research directly when eligible. The opponent uses paid queues and buildings, scouting memory, composition targets, age-resource reserves, repairs, retreats, and transport boarding reservations. These are implemented behaviors, not a claim of balanced difficulty.

Campaign objectives include **Journal**, **Locate goal**, and (for the escort) **Select caravan** controls. A gold diamond marks the active destination on the minimap; an explored destination also has a 3D banner. Restore the starting or latest completed-objective checkpoint from the commander menu or defeat screen. Checkpoints capture a separate, frozen simulation snapshot and are included in local saves. Existing campaign saves retain their previous victory rules instead of acquiring a new escort requirement. Optional completions earn a chapter star.

## Build, offline play, and tests

```powershell
npm run build
npm run preview
npm test
node scripts/browser-qa.mjs
node scripts/interaction-qa.mjs
node scripts/visual-qa.mjs
node scripts/realm-qa.mjs
node scripts/edge-scroll-qa.mjs
node scripts/map-qa.mjs
node scripts/production-qa.mjs
node scripts/offline-qa.mjs
node scripts/release-qa.mjs
node scripts/commander-qa.mjs
node scripts/ai-soak.mjs
node scripts/campaign-qa.mjs
node scripts/custom-battle-qa.mjs
node scripts/custom-multiplayer-qa.mjs
node scripts/battle-benchmark.mjs
node scripts/regression-browser.mjs
```

The production output is in `dist/`. Deploy it to a static web host. The generated service worker caches the game and its bundled assets for offline use after the first successful visit over HTTPS (or localhost). The web app manifest requests fullscreen landscape when installed. Browser support for fullscreen, installation, and orientation locking varies. Fonts and their licenses are bundled locally. No game assets depend on a third-party CDN.

The browser QA scripts use a locally installed Microsoft Edge. `regression-browser.mjs` runs camera, radar, production, controls, campaigns, 3D models, offline play and custom multiplayer checks sequentially, recording results in `artifacts/release-browser-checks.json`. `custom-multiplayer-qa.mjs` starts an isolated service so its surrender/reconnect tests cannot alter live rooms. Older `release-qa.mjs` tests a classic room and defaults to port 4180; set `QA_URL` to another server URL as needed. `npm test` includes real WebSocket checks for fair starts, ownership, fog, readiness, mixed AI/humans, disconnects and restoration. Emulation does not substitute for testing on physical phones. See [release evidence](RELEASE_CHECKS.md).

## Implementation

- `src/custom-battle.js` and `src/custom-battle-ui.js`: eight-kingdom setup, spawn layouts, alliances, independent AI clocks, victory rules, roster, and room lobby.
- `src/weather.js` and `src/weather-audio.js`: seeded weather cycles, pooled volumetric effects, adaptive budgets, atmosphere, rain and thunder audio.
- `server/team-rooms.js`: authoritative classic/custom rooms, human readiness, AI participants, private team perspectives, compact resource updates, reconnection, concessions and team results. `server/rooms.js` retains the existing import entry point.

- `src/campaigns.js` and `src/campaign-view.js`: staged mission rules, story journals, escort actor, optional objectives, checkpoint snapshots, and 3D goal markers.

- `src/controls.js` and `src/keyboard-settings.js`: saved keyboard bindings, conflict checks, active-key documentation, and the settings editor.
- `src/tactics.js`: patrol/guard commands, legal formation destinations, and stances.
- `src/commander-ai.js`: paid economy and army plans, scouting memory, counter composition, retreats, repairs, and naval staging.
- `src/technology-tree.js`: civilization comparison, prerequisites, and direct training/research.

- `src/data.js`: troops, buildings, research, civilizations, difficulties, maps, and missions.
- `src/simulation.js`: deterministic map generation and independent fixed-step gameplay simulation. The opponent gathers, pays for buildings and units, advances ages, researches technologies, and attacks. Survival is explicitly a wave-spawn scenario.
- `src/world.js`: procedural 3D models, camera, ray picking, shadows, fog, and combat effects. Forests and units use instanced rendering; buildings/resources merge geometry by material. Graphics adapt to sustained slow frames.
- `src/landscape.js`: seeded elevated terrain, triangulated surface sampling and ray picking, river/coastal beds, bridges, terrain textures, solid grass tufts, and animated water meshes.
- `src/models-3d.js`: solid world models for the complete building/unit/resource catalog and civilization architecture.
- `src/realm-3d.js`: terrain/model integration, packed forest detail levels, foundations, construction clipping and scaffolds, previews, gate motion, and solid projectiles.
- `src/portrait-3d.js`: throttled live 3D selection turntables.
- `src/main.js`: menus, responsive HUD, touch/mouse/keyboard controls, objectives, saves, and modal flows.
- `src/map-geometry.js` and `src/minimap.js`: square radar coordinates, bounded rectangular camera locator, waterways, icons, and camera location.
- `src/production.js`: completed production sites and training batches balanced across eligible building queues, including virtual planning for multiplayer snapshots.
- `src/audio.js`: synthesized cues and ambient music.
- `src/frontiers.js`: naval mechanics and tactical AI additions.
- `src/navigation.js`: straight-segment checks, cached movement regions, reusable heap-pathfinding buffers, and blocked-route handling. Trees and ore block land navigation and construction until depleted. Valid existing routes survive unrelated map changes.
- `src/world-polish.js`: articulated model animation, ship models, material textures, and exploration-aware foliage.
- `src/soundscape.js`: battle sounds and atmospheric audio.
- `src/network.js`: room connection, commands, and session reconnection.
- `server/rooms.js`: authoritative Wi-Fi matches, player perspectives, command validation, disconnect handling, and room lifecycle.
- `server/index.js`: local game hosting and WebSocket server.
- `vite.config.js`: build splitting and offline cache generation.

In multiplayer battles, open **Chat** to send to **All** players or only your **Team**. On a keyboard, Enter opens chat and sends a message; Escape closes the panel. The phone panel stays collapsed until opened and has an unread badge. Pinching zooms without rotating; use the camera rotation buttons to turn the view. Chat uses the existing WebSocket server and room memory only: its latest 100 messages disappear when the room is removed or the server restarts. AI-only matches have no player chat.

## Research and scope

The design draws on the genre's established exploration → resource collection → construction → army → age progression loop and varied victory conditions described in the [official Age of Empires IV quickstart](https://www.ageofempires.com/news/quickstart-guide-age-of-empires-iv/) and [official strategy introduction](https://www.ageofempires.com/news/age-of-empires-iv-tips-to-help-you-get-started/). Picking and repeated-model rendering follow the [Three.js Raycaster](https://threejs.org/docs/pages/Raycaster.html) and [InstancedMesh](https://threejs.org/docs/pages/InstancedMesh.html) documentation.

Instanced animation follows the [Three.js update documentation](https://threejs.org/manual/pages/how-to-update-things.html). Room transport and heartbeat handling follow the [official ws documentation](https://github.com/websockets/ws). The naval design considers fishing economies, transport landings, and shoreline defense described in the [official Age of Empires naval update](https://www.ageofempires.com/news/age-of-empires-iv-update-11-0-782/).

The graphics use shaped [CapsuleGeometry](https://threejs.org/docs/pages/CapsuleGeometry.html), solid architectural [ExtrudeGeometry](https://threejs.org/docs/pages/ExtrudeGeometry.html), and indexed terrain [BufferGeometry](https://threejs.org/docs/pages/BufferGeometry.html). Distant forests use simpler solid geometry and pack only visible instances; world objects do not switch to billboard images.

Custom setup and elimination rules were researched against the official [Age of Empires civilization/game-mode guide](https://www.ageofempires.com/learn-to-play/civilizations-game-modes-aoe2/), [ending a match guide](https://www.ageofempires.com/learn-to-play/ending-a-match-aoe2/), and [military/economy guide](https://www.ageofempires.com/learn-to-play/military-and-economy-aoe2/). The resulting rules are this game's own implementation.

This is an original playable RTS implementation with procedural art, fictional civilizations, and its own balance. It contains no Age of Empires assets or licensed branding. Wi-Fi custom battles support up to eight human/AI kingdoms; public internet matchmaking, accounts, historical documentary campaigns, professional voice acting, and a production-scale backend service are not included. Commercial AAA parity is not claimed. Balance and performance need broader human playtesting and real-device testing; smooth performance on every device cannot be guaranteed.
