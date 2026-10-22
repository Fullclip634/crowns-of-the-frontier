# Custom battle allied response

Allied assistance uses the same rules for every team configuration, including unequal teams and human/AI mixtures. Enemy AI teams receive the same behavior. Free-for-all kingdoms receive no allied assistance. Human commanders retain control of their units.

Multiple simultaneous alarms are considered in priority order until a real relief route is found. Previously, an urgent alarm behind an impassable wall could prevent a commander from helping any other teammate. The planner now skips that blocked assignment and checks the next threatened allied base. It retains the ordinary home reserves, visibility limits and movement rules.

`tests/allied-team-routing.test.js` reproduces that failure with a continuous hostile wall, then verifies assistance reaches the accessible teammate. It also covers reordered player slots, unequal teams, three separate alliances, and an AI protecting a remote human teammate in a multiplayer custom setup without controlling the human's troops. These cases supplement the existing 2v2, 3v3, 4v4, coastal and free-for-all checks; 4v4 is not a special requirement for assistance.

The routing follow-up is verified by [426 passing regression tests](artifacts/allied-routing-regression.txt) and a [production-build validation report](artifacts/allied-routing-validation.json). This change affects simulation decisions; it makes no new rendering or device-performance claim.

The previous implementation rejected relief when the assisting commander's town center was over 240 map units away, even if that commander's army was beside the threatened ally. A reproducible eight-kingdom scenario had an army 17 units from the damaged base, its home 339 units away, and zero reinforcements. The new planner ranks available armies by their actual travel time and validates a real ground route.

Relief troops now move toward visible attackers around the protected base, prioritizing nearby siege, rather than stopping at a rally point on the rear side of the town center. Without enemy vision they approach the reported allied base; the damage report contains no hidden attacker data. A visible attacking group or siege can trigger assistance before buildings take damage. A lone scouting unit does not trigger a full relief deployment.

Relief strength scales with observed pressure and capital damage. Reinforcements replace losses and can grow during sustained attacks. A quarter of the field force, or more if required by local threats, is withheld from relief for the commander's other duties, including home defense. Small home distractions do not recall an entire relief force; a serious home raid can. Coastal shores retain separate reserves. Workers, sovereigns, scouts, boarded troops, siege and human-controlled armies are not commandeered as relief infantry. Healers may escort an eligible relief group.

Assignments allow time for the actual route and slowest selected infantry instead of expiring after a fixed 100 seconds. Assistance ends when the threat clears, the protected base is lost, diplomacy changes, or home defense requires the army. State survives ordinary save/restore.

Offensive target selection considers distance to known enemy buildings and unexplored public starting locations. It no longer defaults to the first hostile slot, which could concentrate multiple computer kingdoms on the human before they had scouted other fronts. It does not read unseen enemy units, new hidden settlements or future orders.

The deterministic combat replay in `artifacts/allied-relief-combat-replay.json` starts both implementations with the same damaged capital, infantry and seven raiders, then uses ordinary movement, collision, armor, building fire and damage. Previously, nine assigned soldiers never attacked and the capital fell after 17.7 seconds. With the fix, relief first attacked after 7 seconds, defeated the raiders, and the capital remained standing at 40 seconds. The cumulative dispatch count includes reassignments of existing units, not spawned troops. This isolates relief behavior; it is not a claim that every full match is balanced or every defense succeeds.

Design references: [Age of Empires IV's published defensive and offensive AI improvements](https://www.ageofempires.com/news/age-of-empires-iv-update-9-1-109/) discuss protecting an AI's own base, reliable responses en route, and avoiding passive defense loops. [Age of Empires II's AI update](https://www.ageofempires.com/news/aoe2de-update-39284/) describes allied intelligence reports, scouting and counter-unit decisions. Our implementation applies those principles to this game's own rules; it does not copy either game's AI.

Long routes, blocked passages, a weak allied economy or overwhelming opponents can still defeat a defense. Longer complete matches and physical-device performance remain part of the ongoing project validation.

Verification: [422 passing regression tests](artifacts/allied-response-regression.txt), the [paired combat replay](artifacts/allied-relief-combat-replay.json), and [production/browser validation](artifacts/allied-forests-actions-validation.json). Native WebGPU used the test GPU-blocklist override; WebGL used software rendering after the host hardware driver stalled at startup. These verify functionality and layout, not universal frame rates.
