import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation} from '../src/simulation.js';
import {wasFelledOutOfSight} from '../src/resource-vision.js';

function gatheringScene({water=false,multiplayer=false,type='wood'}={}) {
  const sim=new Simulation({mode:'sandbox',map:water?'coast':'highlands',seed:512,multiplayer});
  for(const entity of sim.entities) entity.hp=0;
  const site=sim.addResource(water?'food':type,water?0:36,0,12);
  if(water)site.water=true;
  const worker=sim.addUnit(water?'fishingboat':'villager',1,site.x,site.z);
  const scout=sim.addUnit('scout',0,site.x-9,site.z);
  worker.order={type:'gather',target:site.id};
  sim.updateFog();
  assert.equal(sim.isVisible(site.x,site.z),true);
  return {sim,site,worker,scout};
}

function leaveSight(sim,site,scout) {
  Object.assign(scout,{x:-65,z:-65});
  sim.updateFog();
  assert.equal(sim.isVisible(site.x,site.z),false);
  assert.equal(sim.isExplored(site.x,site.z),true);
}

test('solo woodcutting preserves the last observed tree through depletion and save/load',()=>{
  const {sim,site,worker,scout}=gatheringScene();
  sim.tickUnit(worker,.25);
  const amount=site.amount;
  assert.ok(amount>0&&amount<site.initialAmount);
  assert.equal(sim.resourceMemory,undefined,'visible gathering needs no memory entry');

  leaveSight(sim,site,scout);
  sim.tickUnit(worker,.25);
  const memory=sim.resourceMemory.get(site.id);
  assert.equal(memory.amount,amount);
  assert.ok(site.amount<amount);
  sim.tickUnit(worker,5);
  assert.equal(site.hp,0);
  assert.equal(sim.get(site.id),null,'commands see the depleted site');
  assert.equal(sim.resourceMemory.get(site.id),memory);
  assert.equal(wasFelledOutOfSight(site),true);

  const restored=Simulation.restore(JSON.parse(JSON.stringify(sim.serialize())));
  assert.equal(restored.get(site.id),null);
  assert.equal(restored.resourceMemory.get(site.id).amount,amount);
  assert.equal(restored.resourceMemory.get(site.id).hp,1);
  assert.equal(wasFelledOutOfSight(restored.entities.find(entity=>entity.id===site.id)),true);

  const restoredScout=restored.get(scout.id);
  Object.assign(restoredScout,{x:site.x-9,z:site.z});
  restored.updateFog();
  assert.equal(restored.isVisible(site.x,site.z),true);
  assert.equal(restored.resourceMemory,undefined);
  assert.equal(restored.get(site.id),null);
  assert.equal('resourceMemory' in restored.serialize(),false);
});

test('revisiting a mine refreshes the remembered amount for the next scouting pass',()=>{
  const {sim,site,worker,scout}=gatheringScene({type:'gold'});
  leaveSight(sim,site,scout);
  sim.tickUnit(worker,1);
  assert.equal(sim.resourceMemory.get(site.id).amount,12);
  const remaining=site.amount;

  Object.assign(scout,{x:site.x-9,z:site.z});
  sim.updateFog();
  assert.equal(sim.resourceMemory,undefined);
  assert.equal(sim.get(site.id).amount,remaining);

  leaveSight(sim,site,scout);
  sim.tickUnit(worker,1);
  assert.equal(sim.resourceMemory.get(site.id).amount,remaining);
  assert.ok(site.amount<remaining);
});

test('the fishing fleet obeys the same observation rule in solo games',()=>{
  const {sim,site,worker,scout}=gatheringScene({water:true});
  leaveSight(sim,site,scout);
  sim.tickUnit(worker,4);
  assert.equal(site.hp,0);
  assert.equal(sim.resourceMemory.get(site.id).amount,12);
});

test('the multiplayer simulation does not record a solo commander observation',()=>{
  const {sim,site,worker,scout}=gatheringScene({multiplayer:true});
  leaveSight(sim,site,scout);
  sim.tickUnit(worker,5);
  assert.equal(site.hp,0);
  assert.equal(sim.resourceMemory,undefined);
  assert.equal('resourceMemory' in sim.serialize(),false);
});
