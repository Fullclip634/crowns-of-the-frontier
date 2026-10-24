import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation} from '../src/simulation.js';

test('workers select eligible drop-offs and immediately recover after destruction, completion and restoration',()=>{
  const sim=new Simulation({mode:'sandbox',map:'highlands',seed:512}),worker=sim.owned(0,'unit','villager')[0];
  const enemy=sim.addBuilding('mine',1,worker.x+1,worker.z,true),foundation=sim.addBuilding('mine',0,worker.x+2,worker.z,false);
  assert.notEqual(sim.nearestDrop(worker,'gold'),enemy);assert.notEqual(sim.nearestDrop(worker,'gold'),foundation);
  worker.x=foundation.x+foundation.r+1.1;worker.z=foundation.z;sim.command([worker.id],{type:'build',target:foundation.id});foundation.progress=.999;sim.tickUnit(worker,1);
  assert.equal(foundation.progress,1);assert.equal(sim.nearestDrop(worker,'gold'),foundation);
  sim.hurt(foundation,foundation.hp+1,null);assert.notEqual(sim.nearestDrop(worker,'gold'),foundation);
  const camp=sim.addBuilding('camp',0,worker.x+1,worker.z,true);assert.equal(sim.nearestDrop(worker,'wood'),camp);assert.notEqual(sim.nearestDrop(worker,'stone'),camp);
  const restored=Simulation.restore(JSON.parse(JSON.stringify(sim.serialize())));assert.equal(restored.nearestDrop(restored.get(worker.id),'wood').id,camp.id);
  const coast=new Simulation({mode:'sandbox',map:'coast'}),boat=coast.owned(0,'unit','fishingboat')[0];
  assert.equal(coast.nearestDrop(boat,'food',true).type,'dock');assert.equal(coast.nearestDrop(boat,'gold',true),null);
});
