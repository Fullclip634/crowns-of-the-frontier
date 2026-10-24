# AI gate and wall defenses

Custom-battle AI allies and opponents initially plan a gate with connected stone-wall flanks near an established town center and its completed tower or castle. They choose currently visible, buildable land, face last-seen hostile buildings or the map center, and try several nearby orientations. A woodline can shorten a flank.

From five elapsed game minutes, an economy with at least 24 villagers can extend a completed front into a closed perimeter around that town center. The planner first tries compact layouts, then searches wall routes around developed buildings, occupied sites and forests. It retains paid sections and adds a rear gate. The complete candidate must prevent hostile foot troops from reaching its protected interior by walking around the wall ends; a visually plausible outline alone is insufficient. Safe, affordable, scouted space is still required. This protects a settlement core, not every distant expansion or resource deposit.

The normal policy requires age one, at least 18 villagers and 180 elapsed game seconds. Story difficulty waits until age two and 420 seconds. Existing tower, army, economy and expansion decisions continue. Human solo seats and multiplayer human seats do not receive automatic fortification orders.

Before constructing the gate, the planner checks the complete linked layout on private scratch navigation grids. Friendly passage through both gates must remain clear; roads beyond the portal may bend around existing buildings. Nearby allied land units must retain an exit, and nearby production buildings must retain a usable spawn and route. Water, resources and ordinary wall collision remain active. The preview neither moves real units nor edits their orders, resources or wall links.

During construction, the next real foundation must preserve current unit exits; full-layout gate and production checks continue. A soldier or worker passing through a much later wall site does not freeze an unrelated safe foundation. AI villagers blocking the next foundation or its closing exit are ordered to a reachable staging point that remains safe in the completed layout. Economic construction and settlement staffing respect that temporary move. Human and allied units are not commandeered.

Villagers pay the civilization's ordinary building costs and construct one foundation at a time, with up to two builders for an enclosing perimeter. Reserves apply to resources actually spent: food or gold committed to armies does not freeze a stone-funded wall. Expansion can proceed with a separate crew. Current base threats pause new foundations. The established worker-protection system can withdraw endangered builders, and settlement staffing replaces a lost builder at an abandoned foundation. Destroyed pieces must be bought and built again. The plan and its building identities survive saves.

A resource barrier can form part of an adaptive perimeter only when the complete navigation check confirms that it really blocks passage. It is not replaced by a free cosmetic wall. Future wall sites retain the natural obstacle identities; after those resources are harvested, the AI must buy and construct their replacements.

AI economic construction and expansion reserve future allied wall sites and the gate approach. Human construction can still occupy that land; an obstructed plan waits and retries after the footprint clears. A waiting plan does not prevent consideration of a different town center. The same authoritative AI code runs in mixed multiplayer rooms; plans remain in private commander state.

The existing volumetric wall and gate models, connectors, orientation and ownership colors render these structures. No separate cosmetic wall or invisible barrier is introduced.

## Design references

The official [AoE II defense guide](https://www.ageofempires.com/learn-to-play/defending-your-empires-aoe2/) describes using walls to protect the economy and buy reaction time. [Update 61321](https://www.ageofempires.com/news/age-of-empires-ii-definitive-edition-update-61321/) discusses AI gate access and reactions to being walled in. These motivate protected approaches and traffic checks; this game's layout, timing and resource reserves are its own choices.

## Verification

`node --test tests/ai-fortifications.test.js` covers actual paid construction through completion, a closed developed-base enclosure with detours, both allied gates, enemy approaches from eight directions, save/resume, lost builders, paid breach and harvested-anchor replacement, visibility and economic requirements, human-seat exclusion, separate expansion crews, construction conflicts, staging orders and the future-wall stall regression. Existing expansion, construction-route, blocked-retry, foundation and wall tests cover their interacting behavior.

The developed-building fixture completed all 60 fortification pieces through normal builders, retained its existing paid front and blocked hostile entry. A separate inspection of the ongoing Highlands replay identified an overly broad future-wall safety check: at simulated second 3,150 an unrelated future worker position blocked a safe foundation. The corrected per-foundation check permitted the actual stalled wall to be purchased for its normal 20 stone civilization cost. Continued replay observations also show construction, destruction and resource harvesting during the war; they do not establish that every AI completes every perimeter under attack.

A standard-resource Highlands Vast 2v2, seed 512, four Hard AI kingdoms reached 1,200 simulated seconds. It created six gates and 31 wall foundations, with 31 distinct fortification structures observed complete and some later destroyed or rebuilt. Kingdoms continued training, aging and expanding; the match was still running at the diagnostic limit. This is a simulation scenario, not a completed-match, balance, FPS or physical-device certification.

Two eight-kingdom Vast 4v4 diagnostics used Hard AI, age two and abundant starting resources. At 480 simulated seconds, Rivers seed 83 had created four gates and 12 wall foundations, with 15 distinct fortification structures observed complete. Coast seed 117 had created six gates and 22 wall foundations, with 27 observed complete. Both battles continued normally to their diagnostic limit. Construction remained conditional on the active battle and economy; not every kingdom selected or finished a wall plan in that window.

The developed Highlands save rendered its completed AI defense in native WebGPU at High on desktop and Performance in an emulated landscape-phone viewport. Connected walls remained finite, an allied unit crossed the gate in both scenes, the spectator controls remained read-only, and neither view had horizontal UI overflow or reported graphics errors. This scope does not establish physical-phone performance. The large-scene loading work is described in [SCENE_RESIDENCY.md](SCENE_RESIDENCY.md).

The original gate-front release passed 512 local tests. Its production bundle rendered the full replay at Performance in a 568-by-320 WebGL compatibility viewport with successful allied traversal and the corrected spectator hint.

The enclosure and input follow-up passes all 526 local tests and the production build. The final renderer displayed the completed 60-piece developed-base fixture at High in native WebGPU (1366 by 768) and Performance in an emulated WebGL phone (568 by 320). Both gates passed real allied unit movement, hostile ground pathfinding was blocked, all 60 visible wall connections had finite transforms, and neither capture had horizontal overflow or a page error. Generated captures, saves and logs are kept outside the source commit.

The full quality goal and device/playtesting requirements remain in [QUALITY_TARGETS.md](QUALITY_TARGETS.md).
