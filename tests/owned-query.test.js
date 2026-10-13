import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation} from '../src/simulation.js';

test('indexed army/building queries retain live death, ownership, spawn and caller-array semantics',()=>{
  const s=new Simulation({mode:'sandbox',map:'highlands',seed:512}),first=s.owned(0,'unit'),worker=first.find(e=>e.type==='villager');
  first.length=0;assert.ok(s.owned(0,'unit').length>0);
  worker.owner=1;assert.ok(!s.owned(0,'unit').includes(worker));assert.ok(s.owned(1,'unit').includes(worker));
  worker.hp=0;assert.ok(!s.owned(1,'unit').includes(worker));
  const added=s.addUnit('spearman',0,-40,60);assert.ok(s.owned(0,'unit','spearman').includes(added));
  const house=s.addBuilding('house',0,-40,66,true);assert.ok(s.owned(0,'building','house').includes(house));s.hurt(house,house.hp+1);assert.ok(!s.owned(0,'building').includes(house));
  const shrine=s.addShrine(-50,60);s.owned(0);shrine.owner=0;assert.ok(s.owned(0).includes(shrine));assert.ok(s.owned(0,'shrine').includes(shrine));
});

test('candidate indexes rebuild after snapshot replacement and restoration without entering saves',()=>{
  const s=new Simulation({mode:'sandbox',map:'highlands',seed:512});s.owned(0,'unit');
  const old=s.owned(0,'unit')[0];s.entities=s.entities.map(e=>e.id===old.id?{...e,owner:1}:e);
  assert.ok(!s.owned(0,'unit').some(e=>e.id===old.id));assert.ok(s.owned(1,'unit').some(e=>e.id===old.id));
  const data=s.serialize();assert.equal(data.ownedCandidates,undefined);const restored=Simulation.restore(data);
  for(const owner of [0,1])for(const kind of ['unit','building'])assert.deepEqual(restored.owned(owner,kind).map(e=>e.id),s.owned(owner,kind).map(e=>e.id));
  const added=restored.addUnit('swordsman',0,-35,65);assert.ok(restored.owned(0,'unit').includes(added));
});
