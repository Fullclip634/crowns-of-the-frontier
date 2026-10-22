import test from 'node:test';
import assert from 'node:assert/strict';
import {closestCandidates} from '../src/closest-candidates.js';
import {Simulation} from '../src/simulation.js';
import {battlePreset} from '../src/custom-battle.js';

test('closest selection preserves equal-distance order, object identity and the source array',()=>{
  const points=[[3,4],[-3,4],[0,5],[3,-4],[-3,-4],[5,0],[0,1]].map(([x,z],id)=>({id,x,z})),before=[...points];
  assert.deepEqual(closestCandidates(points,5,()=>true,p=>Math.hypot(p.x,p.z)),[points[6],...points.slice(0,4)]);
  assert.deepEqual(points,before);assert.equal(closestCandidates(points,1,()=>true,p=>Math.hypot(p.x,p.z))[0],points[6]);
  assert.deepEqual(closestCandidates([],5,()=>true,()=>0),[]);assert.deepEqual(closestCandidates(points,0,()=>true,()=>0),[]);
});

test('large forests use one score per eligible source and retain the exact stable-sort prefix',()=>{
  let seed=512;const next=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;},points=Array.from({length:4096},(_,id)=>({id,x:Math.floor(next()*100)-50,z:Math.floor(next()*100)-50,alive:next()>.2}));
  for(const limit of [1,5]){
    const visited=new Set(),scored=new Set(),selected=closestCandidates(points,limit,p=>{assert.ok(!visited.has(p));visited.add(p);return p.alive;},p=>{assert.ok(p.alive);assert.ok(!scored.has(p));scored.add(p);return Math.hypot(p.x-3,p.z+7);});
    const expected=points.filter(p=>p.alive).sort((a,b)=>Math.hypot(a.x-3,a.z+7)-Math.hypot(b.x-3,b.z+7)).slice(0,limit);
    assert.deepEqual(selected,expected);assert.equal(visited.size,points.length);assert.equal(scored.size,points.filter(p=>p.alive).length);
  }
});

function workerFixture(){const sim=new Simulation({mode:'custom',map:'highlands',slots:battlePreset('4v4'),seed:512});sim.entities=[];sim.grids={};sim.revision++;sim.aiStates[1]={known:{}};return sim;}

test('AI resource selection keeps safety, depleted/water exclusions, stable ties and route retries',()=>{
  const sim=workerFixture(),worker=sim.addUnit('villager',1,0,0),dead=sim.addResource('food',0,1,100),empty=sim.addResource('food',0,2,0),fish=sim.addResource('food',0,3,100),unsafe=sim.addResource('food',0,4,100);dead.hp=0;fish.water=true;
  const sources=[[-40,3],[-40,-3],[-42,0],[-43,0],[-44,0],[-45,0]].map(([x,z])=>sim.addResource('food',x,z,100));sim.aiStates[1].known.enemy={id:99999,type:'tower',kind:'building',owner:4,x:0,z:20};
  const tried=[];sim.pathTo=(e,source)=>{tried.push(source);e.pathStatus=source===sources[2]?'ready':'blocked';return [{x:source.x,z:source.z}];};
  sim.assignWorker(worker);assert.deepEqual(tried,sources.slice(0,3));assert.equal(worker.order.target,sources[2].id);assert.equal(worker.gatherType,'food');assert.equal(worker.pathTargetId,sources[2].id);
  assert.ok(!tried.includes(dead)&&!tried.includes(empty)&&!tried.includes(fish)&&!tried.includes(unsafe));
  worker.order=null;tried.length=0;sim.pathTo=(e,source)=>{tried.push(source);e.pathStatus='blocked';return [];};sim.assignWorker(worker);
  assert.deepEqual(tried,sources.slice(0,5),'an unreachable sixth source must not change the established five-route budget');assert.equal(worker.order,null);
  sim.aiStates[1].known.enemy={id:99999,type:'tower',kind:'building',owner:4,x:-40,z:0};tried.length=0;
  sim.pathTo=(e,source)=>{tried.push(source);e.pathStatus='ready';return [{x:source.x,z:source.z}];};sim.assignWorker(worker);
  assert.deepEqual(tried,[unsafe],'the next decision reads updated enemy memory instead of retaining a previous danger list');assert.equal(worker.order.target,unsafe.id);
});

test('AI construction chooses the first equally close available worker and retains busy-worker exclusions',()=>{
  const sim=workerFixture();sim.addBuilding('towncenter',1,0,0,true);
  const busy=sim.addUnit('villager',1,0,0),fleeing=sim.addUnit('villager',1,0,0),expanding=sim.addUnit('villager',1,0,0),embarked=sim.addUnit('villager',1,0,0),first=sim.addUnit('villager',1,3,4),second=sim.addUnit('villager',1,-3,4);busy.order={type:'repair'};fleeing.aiFleeing=20;expanding.order={type:'move',aiExpansion:true};embarked.embarked=true;
  sim.buildValid=()=>true;sim.pathTo=e=>{e.pathStatus='ready';return [];};let selected;sim.build=(type,x,z,ids)=>{selected=ids;return true;};
  assert.equal(sim.commanderBuild('house',null,1),true);assert.deepEqual(selected,[first.id]);first.hp=0;
  assert.equal(sim.commanderBuild('house',null,1),true);assert.deepEqual(selected,[second.id]);
});
