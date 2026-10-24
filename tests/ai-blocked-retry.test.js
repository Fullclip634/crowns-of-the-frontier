import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation} from '../src/simulation.js';
import {shouldRetryBlockedOrder} from '../src/commander-ai.js';

test('AI pauses retrying the same blocked destination until the retry window expires',()=>{
  const sim=new Simulation({mode:'sandbox',seed:512}),unit=sim.addUnit('spearman',0,0,1);
  sim.time=100;unit.pathStatus='blocked';unit.blockedAt=90;unit.pathTargetX=10;unit.pathTargetZ=20;
  assert.equal(shouldRetryBlockedOrder(sim,unit,10,20),false);
  assert.equal(shouldRetryBlockedOrder(sim,unit,14,20),true);
  unit.blockedAt=70;assert.equal(shouldRetryBlockedOrder(sim,unit,10,20),true);
});

test('AI retries blocked orders without a recorded timestamp or destination',()=>{
  const sim=new Simulation({mode:'sandbox',seed:512}),unit=sim.addUnit('spearman',0,0,1);
  sim.time=100;unit.pathStatus='pending';assert.equal(shouldRetryBlockedOrder(sim,unit,10,20),true);
  unit.pathStatus='blocked';assert.equal(shouldRetryBlockedOrder(sim,unit,10,20),true);
  unit.blockedAt=90;assert.equal(shouldRetryBlockedOrder(sim,unit,10,20),true);
});
