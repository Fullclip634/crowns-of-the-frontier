# AI gate and wall defenses

Custom-battle AI kingdoms can plan a gate with connected stone-wall flanks near an established town center and its completed tower or castle. They choose currently visible, buildable land, face last-seen hostile buildings or the map center, and try several nearby orientations. A woodline can shorten a flank. These are defended approaches; they do not promise to enclose the entire economy.

The normal policy requires age one, at least 18 villagers and 180 elapsed game seconds. Story difficulty waits until age two and 420 seconds. Existing tower, army, economy and expansion decisions continue. Human solo seats and multiplayer human seats do not receive automatic fortification orders.

Before constructing the gate, the planner checks the complete linked layout on private scratch navigation grids. Friendly passage through the gate must remain clear. Nearby allied land units must retain an exit, and nearby production buildings must retain a usable spawn and route. Water, resources and ordinary wall collision remain active. The preview neither moves real units nor edits their orders, resources or wall links.

Villagers pay the civilization's ordinary building costs and construct one foundation at a time. An economic reserve is required before starting or continuing. Current base threats pause new foundations. The established worker-protection system can withdraw endangered builders, and settlement staffing replaces a lost builder at an abandoned foundation. Destroyed pieces must be bought and built again. The plan and its building identities survive saves.

AI economic construction and expansion reserve future allied wall sites and the gate approach. Human construction can still occupy that land; an obstructed plan waits and retries after the footprint clears. A waiting plan does not prevent consideration of a different town center. The same authoritative AI code runs in mixed multiplayer rooms; plans remain in private commander state.

The existing volumetric wall and gate models, connectors, orientation and ownership colors render these structures. No separate cosmetic wall or invisible barrier is introduced.

## Design references

The official [AoE II defense guide](https://www.ageofempires.com/learn-to-play/defending-your-empires-aoe2/) describes using walls to protect the economy and buy reaction time. [Update 61321](https://www.ageofempires.com/news/age-of-empires-ii-definitive-edition-update-61321/) discusses AI gate access and reactions to being walled in. These motivate protected approaches and traffic checks; this game's layout, timing and resource reserves are its own choices.

## Verification

`node --test tests/ai-fortifications.test.js` covers actual paid construction through completion, allied versus hostile passage, save/resume, lost builders, paid breach replacement, visibility and economic requirements, human-seat exclusion, later construction conflicts and recovery. Existing expansion, construction-route, blocked-retry, foundation and wall tests cover their interacting behavior.

A standard-resource Highlands Vast 2v2, seed 512, four Hard AI kingdoms reached 1,200 simulated seconds. It created six gates and 31 wall foundations, with 31 distinct fortification structures observed complete and some later destroyed or rebuilt. Kingdoms continued training, aging and expanding; the match was still running at the diagnostic limit. This is a simulation scenario, not a completed-match, balance, FPS or physical-device certification.

Two eight-kingdom Vast 4v4 diagnostics used Hard AI, age two and abundant starting resources. At 480 simulated seconds, Rivers seed 83 had created four gates and 12 wall foundations, with 15 distinct fortification structures observed complete. Coast seed 117 had created six gates and 22 wall foundations, with 27 observed complete. Both battles continued normally to their diagnostic limit. Construction remained conditional on the active battle and economy; not every kingdom selected or finished a wall plan in that window.

The developed Highlands save rendered its completed AI defense in native WebGPU at High on desktop and Performance in an emulated landscape-phone viewport. Connected walls remained finite, an allied unit crossed the gate in both scenes, the spectator controls remained read-only, and neither view had horizontal UI overflow or reported graphics errors. This scope does not establish physical-phone performance. The large-scene loading work is described in [SCENE_RESIDENCY.md](SCENE_RESIDENCY.md).

The final local regression run passed all 512 tests. The production build passed, and the final bundle also rendered the full replay at Performance in a 568-by-320 WebGL compatibility viewport with successful allied traversal and the corrected spectator hint. Generated captures, saves and logs are kept outside the source commit.

The full quality goal and device/playtesting requirements remain in [QUALITY_TARGETS.md](QUALITY_TARGETS.md).
