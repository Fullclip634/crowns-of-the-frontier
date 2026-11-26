import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {bindFootJoints} from '../src/foot-placement.js';
import {bindMountedFootRig} from '../src/mounted-footing.js';
import {animatePart} from '../src/world-polish.js';
import {combatJointRotation} from '../src/combat-poses.js';

async function loadGlbTemplates(relPath) {
  await MeshoptDecoder.ready;
  const bytes = fs.readFileSync(new URL(relPath, import.meta.url));
  const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    '',
  );
  const templates = new Map();
  gltf.scene.traverse(node => {
    if (node.userData.assetKey) templates.set(node.userData.assetKey, node);
  });
  return templates;
}

function matrixDiff(a, b) {
  let max = 0;
  for (let i = 0; i < 16; i++) max = Math.max(max, Math.abs(a.elements[i] - b.elements[i]));
  return max;
}

test('All newly authored Blender 4.5 LTS characters have studio articulated rigs, Terrain Foot/Horse IK, and live walk + combat actions', async () => {
  const [tactical, jade, ironhold] = await Promise.all([
    loadGlbTemplates('../src/assets3d/frontier-tactical-depth.glb'),
    loadGlbTemplates('../src/assets3d/frontier-jade-heroes.glb'),
    loadGlbTemplates('../src/assets3d/frontier-ironhold.glb'),
  ]);
  const all = new Map([...tactical, ...jade, ...ironhold]);

  const footUnits = ['skirmisher', 'chukonu', 'hero_iron', 'ironbreaker'];
  const mountedUnits = ['firelancer', 'hero_alder', 'hero_sun', 'hero_raven', 'hero_jade'];
  const siegeUnits = ['catapult', 'trebuchet'];
  const identity = new THREE.Matrix4();

  for (const type of footUnits) {
    const template = all.get(`unit:${type}`);
    assert.ok(template, `Missing unit:${type} template`);
    const root = template.clone(true);
    assert.equal(bindFootJoints(root), true, `unit:${type} must bind 2-bone Terrain Foot IK`);
    const motions = new Set();
    const parts = [];
    root.traverse(p => {
      if (p.isMesh && p.userData.motion) {
        motions.add(p.userData.motion.type);
        parts.push(p);
      }
    });
    for (const required of ['torso', 'head', 'arm', 'forearm', 'leg', 'knee', 'ankle']) {
      assert.ok(motions.has(required), `unit:${type} missing motion joint '${required}'`);
    }
    // Verify real movement during walking AND combat!
    const walkView = {clock: 1.4, locomotion: new Map([[1, {phase: 1.1, blend: 1, wheel: 0}]])};
    const walkEntity = {id: 1, type, moving: true, cooldown: 0, hp: 100};
    let walkDelta = 0;
    for (const part of parts) walkDelta = Math.max(walkDelta, matrixDiff(animatePart(walkView, part, walkEntity, identity), identity));
    assert.ok(walkDelta > 0.15, `unit:${type} must animate limbs while walking (delta=${walkDelta})`);

    const attackView = {clock: 2.0, sim: {time: 2.0}, combatTime: 2.0, locomotion: new Map([[1, {phase: 0, blend: 0, wheel: 0}]])};
    const interval = UNITS[type].cooldown || 1.2;
    const attackEntity = {id: 1, type, moving: false, cooldown: interval * 0.85, order: {type: 'attack'}, hp: 100};
    let attackDelta = 0;
    for (const part of parts) attackDelta = Math.max(attackDelta, matrixDiff(animatePart(attackView, part, attackEntity, identity), identity));
    assert.ok(attackDelta > 0.20, `unit:${type} must animate limbs while attacking (delta=${attackDelta})`);
  }

  for (const type of mountedUnits) {
    const template = all.get(`unit:${type}`);
    assert.ok(template, `Missing unit:${type} template`);
    const root = template.clone(true);
    assert.equal(bindMountedFootRig(root), true, `unit:${type} must bind 3-bone articulated-hooves-v1 horse IK`);
    const motions = new Set();
    const parts = [];
    root.traverse(p => {
      if (p.isMesh && p.userData.motion) {
        motions.add(p.userData.motion.type);
        parts.push(p);
      }
    });
    for (const required of ['torso', 'head', 'cape', 'arm', 'forearm', 'leg', 'knee', 'horseleg', 'horseknee', 'horsehoof']) {
      assert.ok(motions.has(required), `unit:${type} missing mounted motion joint '${required}'`);
    }
    const walkView = {clock: 1.4, locomotion: new Map([[2, {phase: 1.2, blend: 1, wheel: 0}]])};
    const walkEntity = {id: 2, type, moving: true, cooldown: 0, hp: 100};
    let walkDelta = 0;
    for (const part of parts) walkDelta = Math.max(walkDelta, matrixDiff(animatePart(walkView, part, walkEntity, identity), identity));
    assert.ok(walkDelta > 0.15, `unit:${type} must gallop/animate while moving (delta=${walkDelta})`);

    const attackView = {clock: 2.0, sim: {time: 2.0}, combatTime: 2.0, locomotion: new Map([[2, {phase: 0, blend: 0, wheel: 0}]])};
    const interval = UNITS[type].cooldown || 1.2;
    const attackEntity = {id: 2, type, moving: false, cooldown: interval * 0.25, order: {type: 'attack'}, hp: 100};
    let attackDelta = 0;
    for (const part of parts) attackDelta = Math.max(attackDelta, matrixDiff(animatePart(attackView, part, attackEntity, identity), identity));
    assert.ok(attackDelta > 0.20, `unit:${type} must animate weapons/torso while attacking (delta=${attackDelta})`);
  }

  for (const type of siegeUnits) {
    const template = all.get(`unit:${type}`);
    assert.ok(template, `Missing unit:${type} template`);
    const wheelPivots = new Set();
    let siegeArmCount = 0;
    const parts = [];
    template.traverse(p => {
      if (!p.isMesh || !p.userData.motion) return;
      parts.push(p);
      if (p.userData.motion.type === 'wheel') wheelPivots.add(JSON.stringify(p.userData.motion.pivot));
      if (p.userData.motion.type === 'siegearm') siegeArmCount++;
    });
    assert.equal(wheelPivots.size, 4, `unit:${type} must have 4 distinct rotating wheel pivots`);
    assert.ok(siegeArmCount >= 3, `unit:${type} must have articulated siegearm throwing meshes`);
    const rollView = {clock: 1.0, locomotion: new Map([[3, {phase: 0, blend: 1, wheel: 1.25}]])};
    const rollEntity = {id: 3, type, moving: true, cooldown: 0, hp: 100};
    let wheelDelta = 0;
    for (const part of parts) if (part.userData.motion.type === 'wheel') wheelDelta = Math.max(wheelDelta, matrixDiff(animatePart(rollView, part, rollEntity, identity), identity));
    assert.ok(wheelDelta > 0.25, `unit:${type} wheels must spin when rolling (delta=${wheelDelta})`);
  }

  // Verify Skirmisher overhand javelin throw raises right arm via Z-abduction and twists torso!
  const skOut = {x: 0, y: 0, z: 0};
  const skEntity = {id: 9, type: 'skirmisher', moving: false, cooldown: 1.38, order: {type: 'attack'}};
  assert.equal(combatJointRotation(skEntity, {type: 'arm', side: 1}, 0, skOut), true);
  assert.ok(skOut.z > 1.2, `Skirmisher javelin cock-back should raise right arm high via Z abduction (z=${skOut.z})`);
  assert.equal(combatJointRotation(skEntity, {type: 'torso', side: 1}, 0, skOut), true);
  assert.ok(Math.abs(skOut.y) > 0.2, `Skirmisher javelin cock-back should twist torso (y=${skOut.y})`);
});
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
