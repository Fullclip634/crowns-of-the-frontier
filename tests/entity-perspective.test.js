import test from 'node:test';
import assert from 'node:assert/strict';
import {entityPerspective} from '../server/entity-perspective.js';

test('observed workers retain visible activity while private commands stay with their owner',()=>{
  const food={id:2,kind:'resource',type:'food',hp:1,amount:300,x:1,z:0,r:1.7},sim={get:id=>id===2?food:null};
  const worker={id:1,owner:1,kind:'unit',type:'villager',hp:50,x:0,z:0,moving:false,cooldown:0,order:{type:'gather',target:2},orders:[{type:'move',x:90,z:90}],path:[{x:9,z:9}],pathStatus:'ready',pathTargetX:90,aiGoal:'secret',navyPlan:{secret:1},landing:{x:20,z:30},loadingSince:4,rally:{x:10,z:10},shelterWork:{secret:1},workStyle:'stale',queue:[{type:'secret'}]};
  const saved=structuredClone(worker),foreign=entityPerspective(sim,0,worker);
  for(const key of ['order','pathStatus','pathTargetX','aiGoal','navyPlan','landing','loadingSince','rally','shelterWork'])assert.equal(key in foreign,false,key);
  assert.deepEqual(foreign.path,[]);assert.deepEqual(foreign.orders,[]);assert.deepEqual(foreign.queue,[]);
  assert.equal(foreign.activity,'gather');assert.equal(foreign.working,true);assert.equal(foreign.workStyle,'forage');
  const own=entityPerspective(sim,1,worker);assert.equal(own.order,worker.order);assert.equal(own.aiGoal,'secret');assert.deepEqual(own.path,[]);assert.deepEqual(own.orders,[]);assert.deepEqual(worker,saved,'projection never mutates authoritative orders');
});

test('opponents receive live shelter and passenger counts without occupant identities',()=>{
  const occupants=new Map([[7,{hp:50,embarked:true,shelter:3}],[8,{hp:0,embarked:true,shelter:3}]]),sim={get:id=>occupants.get(id)};
  const fortress=entityPerspective(sim,0,{id:3,owner:1,kind:'building',type:'keep',garrison:[7,8]});assert.equal(fortress.garrisonCount,1);assert.equal('garrison' in fortress,false);
  const ship=entityPerspective(sim,0,{id:4,owner:1,kind:'unit',type:'transport',passengers:[7,8]});assert.equal(ship.passengerCount,2);assert.equal('passengers' in ship,false);
});
