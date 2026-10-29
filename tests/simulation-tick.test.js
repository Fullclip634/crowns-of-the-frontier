import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation} from '../src/simulation.js';

test('a unit trained during a tick first updates on the next tick',()=>{
  const sim=new Simulation({mode:'sandbox',seed:512});sim.entities=[];sim.index=new Map();sim.revision++;
  const town=sim.addBuilding('towncenter',0,0,0,true);town.queue.push({kind:'unit',type:'villager',remaining:.01});
  const updated=[],tickUnit=sim.tickUnit;sim.tickUnit=function(unit,dt){updated.push(unit.id);return tickUnit.call(this,unit,dt);};
  sim.tick(.1);const villager=sim.entities.find(entity=>entity.kind==='unit');
  assert.ok(villager);assert.equal(updated.includes(villager.id),false);
  sim.tick(.1);assert.equal(updated.includes(villager.id),true);
});
