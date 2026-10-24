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
  for(const type of ['wood','gold','stone'])for(const barrier of ['water','wall']){const s=fixture(barrier==='water'?'coast':'highlands'),tree=s.addResource(type,25,20,300),worker=s.addUnit('villager',0,barrier==='water'?-25:0,20);if(barrier==='wall')for(let z=-79;z<=79;z+=2.85)s.addBuilding('wall',1,12,z,true);s.command([worker.id],{type:'gather',target:tree.id});for(let i=0;i<150&&worker.order;i++){s.tickUnit(worker,.1);s.time+=.1;}assert.equal(tree.amount,300);assert.equal(worker.carry,0);assert.ok(worker.x<(barrier==='water'?0:12));}
});

test('gold and stone miners reach pick distance across grid offsets, approach directions and depletion states',()=>{
  const s=fixture();let reached=0;
  for(const type of ['gold','stone'])for(let ix=0;ix<8;ix++)for(let iz=0;iz<8;iz++)for(let a=0;a<8;a++){
    s.entities=[];s.index=new Map();s.grids={};s.revision++;
    const ore=s.addResource(type,ix*.25,20+iz*.25,300),worker=s.addUnit('villager',0,ore.x+Math.sin(a*Math.PI/4)*10,ore.z+Math.cos(a*Math.PI/4)*10);
    if(a%2)ore.amount=3;
    s.command([worker.id],{type:'gather',target:ore.id});assert.equal(workingTarget(s,worker),null);
    for(let tick=0;tick<150&&worker.order&&!worker.carry;tick++){const before={x:worker.x,z:worker.z};s.time+=.1;s.tickUnit(worker,.1);assert.ok(distance(before,worker)<=.411);}
    assert.ok(worker.carry>0,`${type} at ${ix},${iz} direction ${a} reaches the deposit`);
    assert.ok(distance(worker,ore)<=gatheringRange(worker,ore)+1e-8);
    assert.ok(distance(worker,ore)>ore.r+worker.r-.15,'the miner stays outside the rock');
    assert.equal(workingTarget(s,worker),ore);reached++;
  }assert.equal(reached,1024);
});

test('a restored miner completes a nearly exhausted deposit, delivers the final cargo and resumes another deposit',()=>{
  for(const type of ['gold','stone']){
    const s=fixture(),ore=s.addResource(type,0,20,300);ore.amount=1.53;
    const next=s.addResource(type,6,20,300),drop=s.addBuilding('mine',0,-9,20,true),worker=s.addUnit('villager',0,-3,21),bank=s.players[0].resources[type];
    s.command([worker.id],{type:'gather',target:ore.id});s.tickUnit(worker,.1);
    const restored=Simulation.restore(JSON.parse(JSON.stringify(s.serialize()))),w=restored.get(worker.id);
    for(let n=0;n<300;n++){restored.tickUnit(w,.1);restored.time+=.1;}
    assert.equal(restored.entities.find(e=>e.id===ore.id).hp,0);assert.ok(restored.players[0].resources[type]>=bank+1.53-1e-8);
    assert.ok(restored.get(next.id).amount<300);assert.equal(restored.nearestDrop(w,type).id,drop.id);
    const observation=entityPerspective(restored,1,w);assert.equal(observation.order,undefined);assert.deepEqual(observation.orders,[]);
  }
});
test('worker animation and network observations start only after the real closer approach, including a restored route',()=>{
  const s=fixture(),tree=s.addResource('wood',0,21,300),worker=s.addUnit('villager',1,0,31);worker.order={type:'gather',target:tree.id};s.tickUnit(worker,.1);assert.equal(workingTarget(s,worker),null);assert.equal(entityPerspective(s,0,worker).working,false);
  const restored=Simulation.restore(JSON.parse(JSON.stringify(s.serialize()))),w=restored.get(worker.id),target=restored.get(tree.id);for(let i=0;i<150&&!w.carry;i++){restored.tickUnit(w,.1);restored.time+=.1;}assert.ok(w.carry>0);assert.equal(workingTarget(restored,w),target);const observed=entityPerspective(restored,0,w);assert.equal(observed.working,true);assert.equal(observed.order,undefined);assert.deepEqual(observed.orders,[]);
});
