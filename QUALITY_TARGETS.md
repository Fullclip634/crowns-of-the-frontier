# Full game quality targets

The goal is a compelling original 3D RTS comparable in overall experience to established games. The current beta has not reached that goal. The development laptop is one constrained test case, not the definition of acceptable graphics or frame rate.

## Frame rate and supported profiles

| Candidate profile | Rendering target | Evidence required |
|---|---|---|
| Gaming desktop/laptop | High, 1920 x 1080, 60 FPS | Sustained early, crowded and late battles on defined CPU/GPU/RAM hardware, with frame-time spikes and input latency recorded. |
| Integrated-graphics laptop | Low/Medium, 1280 x 720 or adaptive resolution, 60 FPS target | Sustained economy/army play, scene changes, camera input and long-session memory results. Declare a lower supported tier if measured hardware cannot sustain the target. |
| Landscape phone/tablet | Adaptive resolution/detail, 30 FPS sustained; optional 60 FPS | Real Android/iOS devices, sustained temperature/memory behavior, touch precision, pinch/rotate, browser recovery, saves and network play. |

These are acceptance targets, not measured achievements. Graphics quality and frame-rate target are separate settings. Low graphics must not force every desktop to 30 FPS. High retains its richer original meshes/surfaces; automatic quality responds to the player's selected frame budget.

Test the default Huge 400 x 400, eight-kingdom battle and configurable populations up to 160 per kingdom, alongside smaller matches. Include armies in view, sieges, walls, fog, weather and simultaneous production. Publish the exact supported hardware/browser matrix and achieved results. A weak-laptop headless benchmark cannot prove broad deployment performance.

Established RTS games publish hardware tiers and use scalable graphics. [Age of Empires IV's minimum/recommended requirements](https://support.ageofempires.com/hc/en-us/articles/4408849398804-What-are-the-minimum-requirements-for-Age-of-Empires-IV) and [its min-spec design article](https://www.ageofempires.com/news/min-spec-pc-aoeiv/) are references for this approach, not performance evidence for our game.

## Gaps to close across the whole experience

| Area | Current implemented baseline | Required progress and proof |
|---|---|---|
| Art and lighting | Original Blender catalogue, photographed surfaces, elevated 3D terrain, shadows, weather, solid resources and figures | Stronger species/architecture identity, natural materials and foliage, readable silhouettes, richer terrain composition and consistent lighting. Review normal RTS zoom and close inspection, with no visibly crude detail transitions. |
| Animation and effects | Nested procedural joints, worker tools, cavalry/siege parts, projectiles, cargo and remains | Natural task/combat poses, believable contact/recovery, distinct ranged/melee actions, death transitions and readable siege impacts. Inspect real combat rather than rely only on geometry counts. |
| Economy and strategic depth | Paid resources/buildings/queues/upgrades/ages, civilization rosters, counters, walls/gates and fleets | Improve recovery, expansion, economy choices and army tactics; human tests must demonstrate meaningful alternatives and fair challenge. |
| AI and custom battles | Eight allied/enemy kingdoms, selectable difficulty/pace, real reinforcement groups, home reserves and team victory | Reliable formations, route recovery, scouting/retreat/counter choices, stronger coordinated pressure and interesting long wars. Verify full matches across seeds, biomes, starting ages and player configurations. |
| Campaigns and maps | Six staged chapters, checkpoints, journals, escort/defense/naval objectives and seven seeded biomes | More distinctive authored locations, mission events, varied encounters and pacing, plus completion/failure testing and human reviews on every difficulty. |
| Controls and interface | Desktop edge scrolling, square radar/locator, production overview, hotkeys, landscape touch | Responsive, precise and readable control through crowded play; camera/selection/production remain reliable on real devices. Preserve the user's removal of movement lines. |
| Audio and feedback | Synthesized ambience/music/combat/weather and bounded voices | More distinctive, coherent unit/impact/ambient layers and clear attack/order feedback; assess audibility and fatigue over full matches. |
| Multiplayer and release | Authoritative mixed human/AI rooms, ownership/fog privacy, reconnect, static/Node builds and local saves | Hosted capacity/latency/loss/restart tests, version compatibility, durable operations where required, installation/update recovery, accessibility and external playtesting. Public matchmaking/persistent rooms remain unfinished. |

The gaps are broader than frame rate. [Blizzard's Reforged development update](https://news.blizzard.com/en-us/article/23411981/warcraft-iii-reforged-developer-update) addresses art, gameplay and systems across campaign/custom/versus modes. [AoE IV's formation and allied-healing changes](https://www.ageofempires.com/news/age-of-empires-iv-update-8-1-185/) provide concrete genre examples. These are historical design references, not claims that our implementation matches them.

Green tests prove their covered scenarios. They do not prove AAA parity, human enjoyment, complete balance or compatibility with every possible device. Keep the full goal active until its requirements have appropriate evidence.

## Interface and experience acceptance

The user's 13 October instruction explicitly includes UI/UX design and style throughout the system. Review the landing screen, all mode and campaign menus, custom human/AI battle setup, room lobby, settings, field guide, technology tree, objectives, radar, selection, construction, production, save/update/retry flows and victory/defeat screens. Consistent colors, typography, focus states and spacing must accompany understandable actions and readable feedback.

Emulated checks include 568 × 320, 640 × 360, 667 × 375, 844 × 390, 320 × 568, 360 × 640 and 1024 × 768. Require a correctly scaled canvas, no horizontal layout overflow, reachable camera and command controls, paid touch production and actual battlefield movement. Compact objectives and portrait camera options must expand to their complete controls. Review screenshots as well as bounds; a fitting panel may still obscure useful gameplay.

Use 44 × 44 CSS-pixel targets for primary touch controls, following [W3C's enhanced target-size technique](https://www.w3.org/WAI/WCAG22/Techniques/css/C44). Dialogs need accessible titles, contained keyboard focus, Escape behavior that preserves key-capture cancellation, and focus returned to the opener, following the [WAI modal dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/). These individual checks are not a complete accessibility certification. Physical-phone usability, human playtests and all remaining quality areas still need evidence.
