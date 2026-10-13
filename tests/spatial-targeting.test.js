import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation,distance} from '../src/simulation.js';

test('target queries retain surface distances, containing buildings, strict range and stable ties',()=>{
  const source={id:0,hp:10,x:0,z:0,r:.5},entities=[source,
    {id:1,hp:10,x:12,z:0,r:5,enemy:true},
    {id:2,hp:10,x:-12,z:0,r:5,enemy:true},
    {id:3,hp:10,x:0,z:6,r:.5,enemy:false},
    {id:4,hp:0,x:1,z:0,r:2,enemy:true},
    {id:5,hp:10,x:0,z:50,r:1,enemy:true}];
  const sim=Object.create(Simulation.prototype);sim.entities=entities;
  const reference=max=>{let best=null,d=max;for(const target of entities)if(target.hp>0&&target!==source&&target.enemy){const len=distance(source,target)-target.r;if(len<d){d=len;best=target;}}return best;};
  for(const range of [0,2,7,7.000000000001,12,Infinity])assert.equal(sim.nearest(source,e=>e.enemy,range),reference(range));
  assert.equal(sim.nearest(source,e=>e.enemy,8)?.id,1,'equal surface distances retain the first candidate');
  entities.push({id:6,hp:10,x:1,z:0,r:4,enemy:true});assert.equal(sim.nearest(source,e=>e.enemy,0)?.id,6,'an overlapping building can have a negative surface distance');
  sim.entityBuckets=new Map([[-2,new Map([[0,[entities[2]]]])],[0,new Map([[0,[source,entities[3],entities[4],entities[6]]],[6,[entities[5]]]])],[1,new Map([[0,[entities[1]]]])]]);sim.maxEntityRadius=5;
  assert.equal(sim.nearest(source,e=>e.id===1,8),entities[1]);assert.equal(sim.nearest(source,e=>e.id===2,8),entities[2]);assert.equal(sim.nearest(source,e=>e.id===5,8),null);
});

test('combat targeting excludes scenery while retaining the same spatial order and live deaths',()=>{
  const sim=new Simulation({mode:'sandbox',seed:512});sim.stop(sim.owned(0,'unit').map(e=>e.id));const archer=sim.addUnit('archer',0,7.95,30),enemy=sim.addUnit('spearman',1,15.95,30);enemy.stance='hold';sim.addResource('gold',10,30,300);sim.tick(.1);
  const predicate=t=>sim.hostile(archer.owner,t.owner)&&!t.embarked&&(t.kind==='unit'||t.kind==='building');
  assert.equal(sim.nearest(archer,predicate,20,true),sim.nearest(archer,predicate,20));assert.equal(sim.nearest(archer,t=>t===enemy,20,true),enemy);
  let scenery=0;sim.nearest(archer,t=>{if(t.kind==='resource')scenery++;return false;},20,true);assert.equal(scenery,0);
  enemy.hp=0;assert.equal(sim.nearest(archer,t=>t===enemy,20,true),null,'index membership never revives a dead target');
  const saved=sim.serialize();assert.equal(saved.entityBuckets,undefined);const restored=Simulation.restore(saved);restored.tick(.1);const own=restored.get(archer.id);assert.equal(restored.nearest(own,predicate,20,true)?.id,restored.nearest(own,predicate,20)?.id);
});
