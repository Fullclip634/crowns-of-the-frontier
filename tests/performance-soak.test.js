import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation} from '../src/simulation.js';
import {battlePreset} from '../src/custom-battle.js';

// Goal 8 groundwork. Timing budgets are machine-dependent, so this gate is
// structural instead: a long battle must not leak entities, keep dead units
// around, drift into non-finite state, or grow the save without bound.
// Measured baseline for this exact setup: 1,939 entities, 190 units, 1 dead
// unit, 1.16 MB save.
test('a three-minute 4v4 battle keeps entities, dead units and saves bounded',()=>{
  const sim=new Simulation({mode:'custom',map:'highlands',mapSize:'large',slots:battlePreset('4v4'),seed:512});
  for(let tick=0;tick<1800;tick++)sim.tick(.1);
  const units=sim.entities.filter(e=>e.kind==='unit');
  assert.ok(sim.entities.length<2600,`entity count grew to ${sim.entities.length}`);
  assert.ok(units.length<320,`unit count grew to ${units.length}`);
  assert.ok(units.filter(e=>e.hp<=0).length<=8,'dead units are pruned instead of accumulating');
  assert.ok(sim.entities.every(e=>Number.isFinite(e.x)&&Number.isFinite(e.z)&&Number.isFinite(e.hp)),'no entity may hold non-finite state');
  const save=JSON.stringify(sim.serialize());
  assert.ok(save.length<1_600_000,`save grew to ${save.length} bytes`);
  const restored=Simulation.restore(JSON.parse(save));
  assert.equal(restored.entities.length,sim.entities.length,'restoring keeps the full roster');
  assert.ok(restored.entities.every(e=>Number.isFinite(e.hp)&&Number.isFinite(e.x)),'restored state stays finite');
});
