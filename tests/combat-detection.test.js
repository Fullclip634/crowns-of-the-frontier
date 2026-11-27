import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation, distance} from '../src/simulation.js';
import {inspectorStatsMarkup} from '../src/entity-inspector.js';

const advance = (sim, seconds) => {
  const steps = Math.round(seconds * 10);
  for (let i = 0; i < steps; i++) sim.tick(0.1);
};

function cleanBattlefield(map = 'highlands', options = {}) {
  const sim = new Simulation({mode: 'sandbox', map, seed: 512, ...options});
  sim.entities = [];
  sim.index = new Map();
  sim.revision++;
  sim.grids = {};
  sim.players[0].age = 3;
  sim.players[1].age = 3;
  sim.players[0].resources = {food: 5000, wood: 5000, gold: 5000, stone: 5000};
  sim.players[1].resources = {food: 5000, wood: 5000, gold: 5000, stone: 5000};
  return sim;
}

test('military rally points use attackmove and fight raiders along the route', () => {
  const sim = cleanBattlefield();
  sim.addBuilding('house', 0, -45, 0, true);
  sim.addBuilding('house', 0, -45, 8, true);
  const barracks = sim.addBuilding('barracks', 0, -30, 0, true);
  sim.smartCommand([barracks.id], null, 20, 0);
  assert.ok(sim.train(barracks.id, 'swordsman'));
  const raider = sim.addUnit('scout', 1, -12, 0);
  raider.stance = 'hold';

  // Fast-forward training completion.
  barracks.queue[0].remaining = 0.05;
  sim.tick(0.1);

  const trained = sim.owned(0, 'unit', 'swordsman')[0];
  assert.ok(trained, 'swordsman should spawn from barracks');
  assert.equal(trained.order?.type, 'attackmove', 'combat units rallied from military buildings must use attackmove');

  advance(sim, 10);
  assert.ok(raider.hp < raider.maxHp, 'rallied military unit should engage raiders encountered on its way to the rally flag');
});

test('villager rally points build unfinished foundations and harvest rallied resources/farms', () => {
  const sim = cleanBattlefield();
  const tc = sim.addBuilding('towncenter', 0, -25, 0, true);
  const site = sim.addBuilding('house', 0, -10, 0, false);
  sim.smartCommand([tc.id], site, site.x, site.z);
  assert.equal(tc.rally.target, site.id);
  assert.ok(sim.train(tc.id, 'villager'));
  tc.queue[0].remaining = 0.05;
  sim.tick(0.1);
  const builder = sim.owned(0, 'unit', 'villager')[0];
  assert.equal(builder.order?.type, 'build');
  assert.equal(builder.order?.target, site.id);

  // Now rally onto a friendly completed farm.
  const farm = sim.addBuilding('farm', 0, -10, 10, true);
  sim.smartCommand([tc.id], farm, farm.x, farm.z);
  assert.ok(sim.train(tc.id, 'villager'));
  tc.queue[0].remaining = 0.05;
  sim.tick(0.1);
  const farmer = sim.owned(0, 'unit', 'villager').find(u => u.id !== builder.id);
  assert.equal(farmer.order?.type, 'gather');
  assert.equal(farmer.order?.target, farm.id);
});

test('defensive stance engages nearby enemies, breaks pursuit beyond leash, returns to post, and survives save/restore', () => {
  const sim = cleanBattlefield();
  const guard = sim.addUnit('knight', 0, 0, 0);
  const bait = sim.addUnit('scout', 1, 9, 0);
  bait.stance = 'hold';

  assert.equal(sim.setStance([guard.id], 'defensive', 1), false, 'non-owner cannot change stance');
  assert.ok(sim.setStance([guard.id], 'defensive', 0));
  assert.equal(guard.stance, 'defensive');
  assert.equal(guard.guardX, 0);
  assert.equal(guard.guardZ, 0);

  // Inspector renders Defensive chip cleanly.
  const markup = inspectorStatsMarkup(sim, guard);
  assert.match(markup, /Defensive/);

  // Guard engages nearby enemy inside leash.
  advance(sim, 1.2);
  assert.ok(guard.x > 1.5, 'defensive unit should advance toward a threat inside its leash');

  // Enemy retreats far beyond leash (simulating tower bait).
  const hpAtRetreat = bait.hp;
  bait.x = 24;
  bait.z = 0;
  advance(sim, 4);
  assert.ok(distance(guard, {x: 0, z: 0}) <= 2.3, 'defensive unit must break off pursuit and return to its guard post');
  assert.equal(bait.hp, hpAtRetreat, 'baited unit should not chase 24m out to hit the retreating enemy');

  // Moving a defensive unit updates its guard post and preserves defensive stance.
  sim.command([guard.id], {type: 'move', x: -12, z: 5});
  assert.equal(guard.stance, 'defensive');
  assert.equal(guard.guardX, -12);
  assert.equal(guard.guardZ, 5);

  // Save/restore retains defensive stance and guard coordinates.
  const restored = Simulation.restore(JSON.parse(JSON.stringify(sim.serialize())));
  const restoredGuard = restored.get(guard.id);
  assert.equal(restoredGuard.stance, 'defensive');
  assert.equal(restoredGuard.guardX, -12);
  assert.equal(restoredGuard.guardZ, 5);
});

test('base and villager call-for-help mobilizes nearby idle defenders without hijacking hold or ordered units', () => {
  const sim = cleanBattlefield();
  const tc = sim.addBuilding('towncenter', 0, 0, 0, true);
  // Idle defender on the opposite side of the base (~20m from the TC edge, >32m from the enemy archer!).
  const idleDefender = sim.addUnit('knight', 0, -20, 0);
  // Hold Ground soldier right next to the TC must NOT break formation.
  const holdSoldier = sim.addUnit('spearman', 0, -8, 2);
  sim.setStance([holdSoldier.id], 'hold');
  // Manually ordered soldier moving away must NOT be hijacked.
  const orderedSoldier = sim.addUnit('swordsman', 0, -8, -4);
  sim.command([orderedSoldier.id], {type: 'move', x: -45, z: -4});
  // King in Regicide must NEVER charge out on building call-for-help.
  const king = sim.addUnit('king', 0, -9, 0);
  king.stance = 'aggressive';

  // Enemy archer shelling the TC from the east (outside idleDefender's normal 13m detection!).
  const enemyArcher = sim.addUnit('archer', 1, 14, 0);
  enemyArcher.stance = 'hold';
  sim.command([enemyArcher.id], {type: 'attack', target: tc.id});

  advance(sim, 3.5);
  assert.ok(idleDefender.x > -10, 'idle defender should rush across the base when the Town Center is attacked');
  assert.equal(holdSoldier.x, -8, 'Hold Ground defender must never break hold on call-for-help');
  assert.equal(orderedSoldier.order?.type, 'move', 'manually ordered soldier must keep its move order');
  assert.ok(orderedSoldier.x < -12, 'manually ordered soldier should continue toward its destination');
  assert.equal(king.x, -9, 'sovereign must never rush out on building call-for-help');

  // Verify villager raid call-for-help too.
  const sim2 = cleanBattlefield();
  const villager = sim2.addUnit('villager', 0, 0, 0);
  villager.stance = 'hold';
  const responder = sim2.addUnit('knight', 0, -18, 0);
  const raider = sim2.addUnit('archer', 1, 9, 0);
  raider.stance = 'hold';
  sim2.command([raider.id], {type: 'attack', target: villager.id});

  advance(sim2, 3.0);
  assert.ok(responder.x > -8, 'idle defender should respond when a nearby villager is attacked');
});

test('long-range retaliation lets idle troops detect and charge distant marksmen beyond 13m', () => {
  const sim = cleanBattlefield();
  const knight = sim.addUnit('knight', 0, 0, 0);
  const sniper = sim.addUnit('marksman', 1, 16, 0);
  sim.players[1].tech.ranged = 3; // 17m range — well beyond knight's 13m detection!
  sniper.stance = 'hold';
  sim.command([sniper.id], {type: 'attack', target: knight.id});

  advance(sim, 4.5);
  assert.ok(knight.x > 6, 'aggressive knight taking long-range fire should detect and charge the sniper');
  assert.ok(sniper.hp < sniper.maxHp, 'knight should close in and damage the distant sniper');
});

test('Hold Ground respects upgraded ranged technology (Bodkin Arrows)', () => {
  const sim = cleanBattlefield();
  sim.players[0].tech.ranged = 3; // Archer range 11 + 3 = 14m
  const archer = sim.addUnit('archer', 0, 0, 0);
  sim.setStance([archer.id], 'hold');
  const enemy = sim.addUnit('spearman', 1, 13.5, 0);
  enemy.stance = 'hold';

  advance(sim, 2.5);
  assert.equal(archer.x, 0, 'Hold Ground archer must stay stationary');
  assert.ok(enemy.hp < enemy.maxHp, 'Hold Ground archer must detect and hit targets across its full upgraded range');
});

test('smart counter targeting prioritizes hard counters, buildings for rams, and siege for bombard towers', () => {
  // 1. Spearman prioritizes Knight over closer Villager.
  {
    const sim = cleanBattlefield();
    const spear = sim.addUnit('spearman', 0, 0, 0);
    const villager = sim.addUnit('villager', 1, 5, 0);
    const knight = sim.addUnit('knight', 1, 8, 0);
    villager.stance = 'hold';
    knight.stance = 'hold';
    sim.tick(0.1);
    assert.equal(spear.lastCombatTargetId, knight.id, 'spearman should prioritize cavalry over a closer villager');
  }

  // 2. Skirmisher prioritizes Archer over slightly closer Knight.
  {
    const sim = cleanBattlefield();
    const skirm = sim.addUnit('skirmisher', 0, 0, 0);
    const knight = sim.addUnit('knight', 1, 6, 0);
    const archer = sim.addUnit('archer', 1, 8.5, 0);
    knight.stance = 'hold';
    archer.stance = 'hold';
    sim.tick(0.1);
    assert.equal(skirm.lastCombatTargetId, archer.id, 'skirmisher should prioritize ranged units over heavy cavalry');
  }

  // 3. Battering Ram prioritizes hostile building over nearby Scout.
  {
    const sim = cleanBattlefield();
    const ram = sim.addUnit('ram', 0, 0, 0);
    const scout = sim.addUnit('scout', 1, 5, 0);
    const tower = sim.addBuilding('tower', 1, 12, 0, true);
    scout.stance = 'hold';
    tower.cooldown = 99;
    sim.tick(0.1);
    assert.equal(ram.lastCombatTargetId, tower.id, 'battering ram should prioritize hostile buildings over stray units');
  }

  // 4. Bombard Tower prioritizes Battering Ram over closer Spearman.
  {
    const sim = cleanBattlefield();
    const bombard = sim.addBuilding('bombard', 0, 0, 0, true);
    const spear = sim.addUnit('spearman', 1, 7, 0);
    const ram = sim.addUnit('ram', 1, 15, 0);
    spear.stance = 'hold';
    ram.stance = 'hold';
    sim.tick(0.1);
    assert.equal(bombard.lastCombatTargetId, ram.id, 'bombard tower should prioritize enemy siege over closer infantry');
  }
});

test('river reachability avoids locking melee onto across-water targets when a same-bank enemy is present', () => {
  const sim = cleanBattlefield('valley');
  // Place a mock river channel along x = 0 (width 4m) so (-3,0) and (3,0) are on opposite banks.
  sim.isWater = (x, _z) => Math.abs(x) < 2;

  const swordsman = sim.addUnit('swordsman', 0, -4, 0);
  const acrossRiver = sim.addUnit('spearman', 1, 3.5, 0); // 7.5m away across water
  const sameBank = sim.addUnit('spearman', 1, -13, 0); // 9m away on the same bank
  acrossRiver.stance = 'hold';
  sameBank.stance = 'hold';

  sim.tick(0.1);
  assert.equal(swordsman.lastCombatTargetId, sameBank.id, 'melee soldier should engage the reachable same-bank enemy instead of stalling at the river');
});

test('sticky target hysteresis prevents target flip-flopping between nearly equidistant enemies', () => {
  const sim = cleanBattlefield();
  const swordsman = sim.addUnit('swordsman', 0, 0, 0);
  const enemyA = sim.addUnit('swordsman', 1, 6, 0);
  const enemyB = sim.addUnit('swordsman', 1, -6.5, 0);
  enemyA.stance = 'hold';
  enemyB.stance = 'hold';

  sim.tick(0.1);
  assert.equal(swordsman.lastCombatTargetId, enemyA.id);

  // Move enemyB slightly closer (within the 2.5m sticky margin) — swordsman should stay committed to enemyA!
  enemyB.x = -5.2;
  sim.tick(0.1);
  assert.equal(swordsman.lastCombatTargetId, enemyA.id, 'soldier should commit to its current target instead of oscillating');
});
