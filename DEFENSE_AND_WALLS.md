# Defensive battles and tree-anchored walls

Wall drafts snap to a nearby live tree when a line starts or ends at its trunk;
clicking or tapping its visible canopy also resolves to the trunk.
The preview reports the tree connection and the actual construction command uses
the same points, including in multiplayer. Short masonry caps join wall ends to
the trunks. Their rendered geometry and movement collision use the same live
trees, so felling a tree removes its cap and can create a real breach. Existing
wall-to-wall links, allied gates, paid foundations, and builder orders remain in
effect. A draft that cannot fit full linked sections explains that the player
should choose a different tree or wall.

Melee units approach the visible footprint of their target building before
attacking. Walls and gates use their narrower oriented footprints; other
buildings use their construction footprint. Connected wall attacks use a small
private navigation adjustment with swept collision against adjacent masonry,
and reuse those adjusted grids for troops attacking the same point. Ranged and
artillery units keep their existing weapon ranges.

All three automatic defenses fire more frequently. A town center fires two
base arrows every 1.2 seconds, a watchtower three every 1.1 seconds, and a
castle five every 1.0 second. The previous base damage per volley is divided
among those arrows; the shorter interval increases sustained damage. Sheltered
villagers add their existing extra arrows and damage, following the defensive
garrison principle described in the [Age of Empires guide](https://www.ageofempires.com/learn-to-play/defending-your-empires-aoe2/).
The particular values are this game's balance choices. In-flight volleys retain
their individual arrows after saving or reconnecting.

River and coastal waves have slightly stronger surface displacement and
highlights. The shared wave and normal formulas agree in WebGL and WebGPU,
settle at the bank, respect reduced motion and do not upload geometry every
frame. They add no geometry, render passes or textures.

Verify with `npm test`, `npm run build`, and
`node scripts/defense-water-visual-qa.mjs`. The latter uses a production build
and checks moving and reduced-motion water plus a battle scene in desktop
WebGPU and phone-sized WebGL. Emulated viewports do not establish physical
device frame rates or replace balance playtesting.
