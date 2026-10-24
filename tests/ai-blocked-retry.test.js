import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation} from '../src/simulation.js';
import {battlePreset} from '../src/custom-battle.js';
import {shouldRetryBlockedOrder} from '../src/commander-ai.js';

test('AI pauses retrying the same blocked destination until the retry window expires',()=>{
  const sim=new Simulation({mode:'sandbox',seed:512}),unit=sim.addUnit('spearman',0,0,1);
  sim.time=100;unit.pathStatus='blocked';unit.blockedAt=90;unit.pathTargetX=10;unit.pathTargetZ=20;
  assert.equal(shouldRetryBlockedOrder(sim,unit,10,20),false);
  assert.equal(shouldRetryBlockedOrder(sim,unit,18,20),false);
  assert.equal(shouldRetryBlockedOrder(sim,unit,25,20),true);
  unit.blockedAt=70;assert.equal(shouldRetryBlockedOrder(sim,unit,10,20),true);
});

test('AI retries blocked orders without a recorded timestamp or destination',()=>{
  const sim=new Simulation({mode:'sandbox',seed:512}),unit=sim.addUnit('spearman',0,0,1);
  sim.time=100;unit.pathStatus='pending';assert.equal(shouldRetryBlockedOrder(sim,unit,10,20),true);
  unit.pathStatus='blocked';assert.equal(shouldRetryBlockedOrder(sim,unit,10,20),true);
  unit.blockedAt=90;assert.equal(shouldRetryBlockedOrder(sim,unit,10,20),true);
});

test('tickAI skips a recently blocked destination but still orders a ready army',()=>{
  const sim=new Simulation({mode:'custom',map:'highlands',mapSize:'large',slots:battlePreset('2v2'),startAge:2,seed:512}),owner=1,tc=sim.owned(owner,'building','towncenter')[0],target={x:tc.x-12,z:tc.z+9};
  sim.time=10;sim.aiStates[owner]={known:{},phase:'opening',scoutIndex:0,lastOrders:-20,lastRebalance:-20,decision:0,nextAttack:9999};
  const blocked=sim.addUnit('spearman',owner,tc.x+20,tc.z+20),control=sim.addUnit('spearman',owner,tc.x+24,tc.z+20);
  blocked.pathStatus='blocked';blocked.blockedAt=sim.time;blocked.pathTargetX=target.x;blocked.pathTargetZ=target.z;
  sim.tickAI(owner);
  assert.equal(blocked.order,null);
  assert.ok(['move','attackmove'].includes(control.order?.type));
});
