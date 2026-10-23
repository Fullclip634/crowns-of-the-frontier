import test from 'node:test';import assert from 'node:assert/strict';import {Simulation,distance} from '../src/simulation.js';import {gatheringRange} from '../src/work-ranges.js';import {workingTarget} from '../src/work-activity.js';import {entityPerspective} from '../server/entity-perspective.js';
function fixture(map='highlands'){const s=new Simulation({mode:'sandbox',map,seed:512});s.entities=[];s.index=new Map();s.grids={};s.revision++;s.visible.fill(1);return s;}
test('woodcutters reach axe distance at every fractional grid offset without teleporting or harvesting from afar',()=>{
  let reached=0;for(const fx of [0,.25,.5,.75,1,1.25,1.5,1.75])for(const fz of [0,.5,1,1.5])for(const angle of [0,Math.PI/2,Math.PI,Math.PI*1.5]){
    const s=fixture(),tree=s.addResource('wood',fx,20+fz,300),worker=s.addUnit('villager',0,tree.x+Math.sin(angle)*10,tree.z+Math.cos(angle)*10);s.command([worker.id],{type:'gather',target:tree.id});
    for(let tick=0;tick<150&&worker.order&&!worker.carry;tick++){const before={x:worker.x,z:worker.z};s.time+=.1;s.tickUnit(worker,.1);assert.ok(distance(before,worker)<=.411);}
    assert.ok(worker.carry>0,`${fx},${fz},${angle} must reach the tree`);assert.ok(distance(worker,tree)<=gatheringRange(worker,tree)+1e-8);assert.ok(distance(worker,tree)>tree.r+worker.r-.1);assert.equal(workingTarget(s,worker),tree);reached++;
  }assert.equal(reached,128);
});
test('the final resource approach never crosses water or a continuous hostile wall',()=>{
  for(const barrier of ['water','wall']){const s=fixture(barrier==='water'?'coast':'highlands'),tree=s.addResource('wood',25,20,300),worker=s.addUnit('villager',0,barrier==='water'?-25:0,20);if(barrier==='wall')for(let z=-79;z<=79;z+=2.85)s.addBuilding('wall',1,12,z,true);s.command([worker.id],{type:'gather',target:tree.id});for(let i=0;i<150&&worker.order;i++){s.tickUnit(worker,.1);s.time+=.1;}assert.equal(tree.amount,300);assert.equal(worker.carry,0);assert.ok(worker.x<(barrier==='water'?0:12));}
});
test('worker animation and network observations start only after the real closer approach, including a restored route',()=>{
  const s=fixture(),tree=s.addResource('wood',0,21,300),worker=s.addUnit('villager',1,0,31);worker.order={type:'gather',target:tree.id};s.tickUnit(worker,.1);assert.equal(workingTarget(s,worker),null);assert.equal(entityPerspective(s,0,worker).working,false);
  const restored=Simulation.restore(JSON.parse(JSON.stringify(s.serialize()))),w=restored.get(worker.id),target=restored.get(tree.id);for(let i=0;i<150&&!w.carry;i++){restored.tickUnit(w,.1);restored.time+=.1;}assert.ok(w.carry>0);assert.equal(workingTarget(restored,w),target);const observed=entityPerspective(restored,0,w);assert.equal(observed.working,true);assert.equal(observed.order,undefined);assert.deepEqual(observed.orders,[]);
});
