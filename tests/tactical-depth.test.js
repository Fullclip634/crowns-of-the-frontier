import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {UNITS, BUILDINGS, TECHS} from '../src/data.js';
import {Simulation} from '../src/simulation.js';
import {GARRISONS} from '../src/garrison.js';
import {UI_ICONS, PAINTED_ICONS} from '../src/ui-icons.js';
import {BUILD_CATEGORIES, categorizedBuildMarkup} from '../src/hud-macro.js';
import {technologyTreeMarkup} from '../src/technology-tree.js';
import {inspectorStatsMarkup, unitSpeedValue} from '../src/entity-inspector.js';
import {siegeProjectile, flightDuration} from '../src/combat-timing.js';
import {combatSoundKind} from '../src/combat-audio.js';

test('Castle Age Mangonel and Imperial Giant Trebuchet have distinct ages, roles, and ranges', () => {
  assert.equal(UNITS.catapult.name, 'Mangonel');
  assert.equal(UNITS.catapult.age, 2);
  assert.ok(UNITS.catapult.splashRadius >= 4);
  assert.equal(UNITS.trebuchet.name, 'Giant trebuchet');
  assert.equal(UNITS.trebuchet.age, 3);
  assert.ok(UNITS.trebuchet.range > UNITS.catapult.range);
});

test('Feudal Skirmisher costs zero gold, counters archers with 2.2x damage, and yields to knights', () => {
  assert.equal(UNITS.skirmisher.age, 1);
  assert.equal(UNITS.skirmisher.cost.gold || 0, 0);
  assert.ok(UNITS.skirmisher.at.includes('range'));

  const sim = new Simulation({mode: 'sandbox', map: 'highlands', seed: 101});
  const sk = sim.addUnit('skirmisher', 0, 0, 0);
  const arch = sim.addUnit('archer', 1, 6, 0);
  const knight = sim.addUnit('knight', 1, 8, 0);

  const dmgVsArcher = sim.attackDamage(sk, arch);
  const dmgVsKnight = sim.attackDamage(sk, knight);
  const archerVsSk = sim.attackDamage(arch, sk);
  const knightVsSk = sim.attackDamage(knight, sk);

  assert.ok(dmgVsArcher >= 14, `Skirmisher should shred archers (${dmgVsArcher})`);
  assert.ok(dmgVsArcher > dmgVsKnight * 2.5, `Skirmisher should deal much more to archers than knights`);
  assert.ok(archerVsSk < dmgVsArcher * 0.6, `Skirmisher high armor should mitigate archer fire`);
  assert.ok(knightVsSk > dmgVsKnight * 4, `Knights should decisively counter skirmishers`);
});

test('Imperial Bombard Tower shatters rams and cavalry, uses cannonball projectiles, and supports garrison', () => {
  assert.equal(BUILDINGS.bombard.age, 3);
  assert.ok(GARRISONS.bombard && GARRISONS.bombard.capacity >= 5);
  assert.equal(siegeProjectile({kind: 'building', type: 'bombard'}), true);
  assert.equal(combatSoundKind({kind: 'building', type: 'bombard'}, {kind: 'unit', type: 'ram'}), 'siege');
  assert.ok(flightDuration({kind: 'building', type: 'bombard'}, 18) < 0.7);

  const sim = new Simulation({mode: 'sandbox', map: 'highlands', seed: 202});
  const bt = sim.addBuilding('bombard', 0, 0, 0, true);
  const ram = sim.addUnit('ram', 1, 14, 0);
  const knight = sim.addUnit('knight', 1, 16, 0);

  const dmgVsRam = sim.attackDamage(bt, ram);
  const dmgVsKnight = sim.attackDamage(bt, knight);
  assert.ok(dmgVsRam >= 110, `Bombard tower should devastate battering rams (${dmgVsRam})`);
  assert.ok(dmgVsKnight >= 70, `Bombard tower should pierce heavy cavalry armor (${dmgVsKnight})`);

  const defenseTab = BUILD_CATEGORIES.find(c => c.id === 'defense');
  assert.ok(defenseTab.items.includes('bombard'));
  const html = categorizedBuildMarkup(sim, 'defense');
  assert.match(html, /data-build="bombard"/);
});

test('Sanctuary, Wheelbarrow, Conscription, and Keep emplacements apply live simulation bonuses and survive save migration', () => {
  const sim = new Simulation({mode: 'sandbox', map: 'highlands', seed: 303});
  sim.players[0].age = 3;
  sim.players[0].resources = {food: 5000, wood: 5000, gold: 5000, stone: 5000};

  // Sanctuary: healer speed +25% and heal rate +40% (12 -> 17)
  const monk = sim.addUnit('monk', 0, 0, 0);
  const wounded = sim.addUnit('knight', 0, 2, 0);
  wounded.hp = 100;
  const speedBefore = Number(unitSpeedValue(sim, monk));
  sim.players[0].tech.sanctuary = 1;
  const speedAfter = Number(unitSpeedValue(sim, monk));
  assert.ok(speedAfter > speedBefore * 1.2);
  monk.cooldown = 0;
  sim.tickUnit(monk, 0.1);
  assert.equal(wounded.hp, 117);

  // Wheelbarrow: villager speed +15% and carry capacity +35% (18 -> 24)
  const vil = sim.addUnit('villager', 0, -4, 0);
  const vilBefore = Number(unitSpeedValue(sim, vil));
  sim.players[0].tech.wheelbarrow = 1;
  const vilAfter = Number(unitSpeedValue(sim, vil));
  assert.ok(vilAfter > vilBefore * 1.12);
  const tree = sim.addNaturalResource('wood', -4.5, 0, 500);
  vil.order = {type: 'gather', target: tree.id};
  for (let i = 0; i < 120 && !vil.order?.returning; i++) sim.tickUnit(vil, 0.1);
  assert.ok(vil.carry >= 23.9, `Wheelbarrow should raise villager carry capacity to 24 (got ${vil.carry})`);

  // Conscription: military training 25% faster
  const barracks = sim.addBuilding('barracks', 0, 12, 12, true);
  sim.train(barracks.id, 'spearman');
  const remBase = barracks.queue[0].remaining;
  sim.players[0].tech.conscription = 0;
  sim.tickBuilding(barracks, 1);
  const deltaBase = remBase - barracks.queue[0].remaining;
  const remFast = barracks.queue[0].remaining;
  sim.players[0].tech.conscription = 1;
  sim.tickBuilding(barracks, 1);
  const deltaFast = remFast - barracks.queue[0].remaining;
  assert.ok(Math.abs(deltaFast - deltaBase * 1.25) < 0.01, `Conscription should boost training rate by 25%`);

  // Keep emplacements (arrowslits): +2 tower/castle/bombard range in inspector and simulation
  const tower = sim.addBuilding('tower', 0, -14, -14, true);
  sim.players[0].tech.arrowslits = 1;
  const towerInspector = inspectorStatsMarkup(sim, tower);
  assert.match(towerInspector, /22m/, 'Tower inspector should display +2m Keep emplacements range');

  // Backward-compatible save migration backfills missing tech keys cleanly
  const saved = sim.serialize();
  delete saved.players[0].tech.sanctuary;
  delete saved.players[0].tech.wheelbarrow;
  delete saved.players[0].tech.conscription;
  delete saved.players[0].tech.arrowslits;
  const restored = Simulation.restore(saved);
  for (const key of ['sanctuary', 'wheelbarrow', 'conscription', 'arrowslits']) {
    assert.equal(restored.players[0].tech[key], 0);
  }
});

test('Painted icons, Tech Tree cards, and Blender 4.5 LTS Tactical Depth GLB cover every new addition', () => {
  for (const key of ['skirmisher', 'bombard', 'sanctuary', 'wheelbarrow', 'conscription', 'arrowslits']) {
    assert.ok(PAINTED_ICONS[key], `Painted atlas icon missing for ${key}`);
    assert.match(UI_ICONS[key], /ui-icon-painted/, `UI_ICONS.${key} must render painted badge`);
  }

  const treeHtml = technologyTreeMarkup(null, 'alder');
  assert.match(treeHtml, /Skirmisher/);
  assert.match(treeHtml, /Mangonel/);
  assert.match(treeHtml, /Sanctuary/);
  assert.match(treeHtml, /Wheelbarrow/);
  assert.match(treeHtml, /Conscription/);
  assert.match(treeHtml, /Keep emplacements/);

  const glbPath = new URL('../src/assets3d/frontier-tactical-depth.glb', import.meta.url);
  assert.ok(fs.existsSync(glbPath), 'Blender 4.5 LTS frontier-tactical-depth.glb must exist');
  const bytes = fs.readFileSync(glbPath);
  assert.equal(bytes.subarray(0, 4).toString('utf8'), 'glTF', 'must be a valid binary GLB');
  const text = bytes.toString('latin1');
  assert.ok(text.includes('building:bombard'), 'GLB must contain building:bombard');
  assert.ok(text.includes('unit:skirmisher'), 'GLB must contain unit:skirmisher');
  assert.ok(text.includes('unit:catapult'), 'GLB must contain unit:catapult (Mangonel)');
});
