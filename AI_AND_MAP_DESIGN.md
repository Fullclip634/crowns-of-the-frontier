# Settlement AI and larger battlefields

Custom AI kingdoms can now establish additional town centers at scouted resource sites. They send an existing villager along a valid land route, pay the civilization's actual building cost only when that builder reaches the site, and assign construction helpers. Completed settlements receive workers, paid production and local towers. The normal limit is two centers; Conqueror and Legendary can establish three. Expansion pauses when the economy cannot afford it, the base is under attack, or observed enemies threaten the destination. It does not cross an unbridged sea without transport support.

Resource intelligence retains the last observed amount. Hidden depletion and hidden enemy movement do not update expansion intelligence. Foundation and planning state survive saving. Abandoned paid foundations regain a builder. The global worker target prevents each new town center from independently filling the population limit with villagers.

Defense covers economic buildings and additional capitals. Threatened villagers use normal movement orders to withdraw behind nearby defended structures, then become available for work after the danger clears. The AI invests in towers earlier and can afford a castle later. Siege receives separate orders against visible buildings, with a small infantry screen for trebuchets. Existing allied reinforcement, home-garrison, retreat, difficulty and battle-pace behavior remains in place. Human multiplayer slots do not receive AI planning state.

These decisions improve resilience without adding free resources, free buildings, invulnerability, or a fixed minimum match duration. A prepared attacker can still break defenses with siege. Match length depends on scouting, economy, terrain, combat, teams and the chosen victory rule. Human playtesting and a wider seed/difficulty balance matrix remain necessary.

## Battlefields

Vast is the new default at 480 meters per side, 44% more area than Huge. Epic is 560 meters per side, 96% more area than Huge. Existing Spacious, Large and Huge selections retain their original dimensions. Existing saved layouts retain their trees and chosen map size.

Starting forests are overlapping, irregular groves with varied orientation, depth and lobed edges, replacing the narrow circular band. Dense neighboring trees still form a harvestable barrier. Three clear approaches, dry harbors, initial units/buildings and local food/gold/stone deposits remain protected. Tightly packed eight-player starts receive supplementary lobes if neighboring clearances clip too much timber. Placement stays seeded and deterministic for multiplayer.

The playable landscape uses broader, stronger rolling forms, with different relief by biome. Starting town centers retain level construction ground, and the established shoreline/bridge rules still shape water crossings. These are visual elevation changes: no new high-ground combat bonus is claimed. Terrain vertex budgets are unchanged. Larger navigation/fog grids still cost more CPU and memory, so physical-device performance must be measured before making hardware recommendations.

## Research informing the decisions

- [Age of Empires IV update 9.1.109](https://www.ageofempires.com/news/age-of-empires-iv-update-9-1-109/) describes observed-map control, economic placement, recovery, defended retreats, better siege targets, and siege protection. Our implementation adapts those principles to this game's own units and simulation.
- [Warcraft III invasion guide](https://classic.battle.net/war3/basics/invasion.shtml) discusses defensive repair, rebuilding, and siege when attacking towns. Its [armor and weapon guide](https://classic.battle.net/war3/basics/armorandweapontypes.shtml) explains why fortified buildings and siege should have distinct roles.
- [Age of Empires IV Season Four map changes](https://www.ageofempires.com/news/ageiv_seasonfour_update_60878/) discusses preserving dock placement and flanking space. [Patch 20249](https://www.ageofempires.com/news/age-of-empires-iv-patch-20249/) documents resource-placement fairness and forest-blocked lanes. These motivate testing access and build space along with appearance.

See the release checkpoint and `artifacts/ai-world-release-validation.json` for achieved verification and its limits. This milestone does not establish overall release completion or parity with commercial RTS games.

## Villager shelter and defensive volleys

Select an owned, completed town center, castle or tower and press **Shelter** to call nearby villagers. Select villagers and press **Shelter** to send them to eligible nearby fortifications. Town centers and castles hold 15 villagers; towers hold eight. Entry reserves capacity and uses ordinary land movement. The controls show occupants and incoming villagers. **Return to work** cancels incoming orders, releases occupants onto separate walkable ground, and restores their previous jobs, queued orders and carried resources.

Every group of up to three sheltered villagers contributes one additional arrow per normal attack cycle. Town-center/tower arrows add five raw damage and castle arrows add seven, with the existing armor and masonry rules applied. Each arrow has a separate volumetric 3D flight origin. The capacity, damage and grouping values are this game's own balance choices. Sheltered workers remain part of the population, stop working, and cannot be targeted through the building. Destruction can injure escaping occupants; demolition evacuates them safely and preserves the existing last-town-center safeguard. A sinking ship retains the original passenger-loss rule.

AI kingdoms shelter threatened nearby workers and send them back after the local danger clears. Human-controlled slots retain manual control. Network commands validate ownership on the authoritative server; opponents can observe a visible fort's occupant count without receiving its hidden villagers, occupant IDs or private work orders. Save files retain jobs, cargo, capacity and AI shelter timing.

The official [Age of Empires II defense guide](https://www.ageofempires.com/learn-to-play/defending-your-empires-aoe2/) describes sheltering villagers in town centers and the resulting defensive arrows. The official [resource-control guide](https://www.ageofempires.com/learn-to-play/control-resources-aoe2/) discusses villagers retreating into defensive buildings. These inform the mechanic, rather than supplying this game's numerical balance.

The garrison checkpoint and `artifacts/garrison-release-validation.json` record achieved verification. Physical devices, wider human balance, and overall release readiness remain outstanding. Automatic AI gate and wall planning is described in [AI_FORTIFICATIONS.md](AI_FORTIFICATIONS.md).
