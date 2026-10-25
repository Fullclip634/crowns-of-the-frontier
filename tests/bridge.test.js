import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {Landscape} from '../src/landscape.js';
import {WorldView} from '../src/world.js';
import {loadBridgeArtwork,buildBridges} from '../src/bridge-art.js';
import {bridgeSpans,bridgeFootprint,bridgeArtwork,bridgeWidthScale,bridgeRoadHalfWidth} from '../src/bridge-layout.js';
import {Simulation} from '../src/simulation.js';

async function fixture(map,size=160,segments=112){
  const previous=globalThis.fetch;globalThis.fetch=async url=>new Response(fs.readFileSync(new URL(url)));
  try{await loadBridgeArtwork();}finally{globalThis.fetch=previous;}
  const landscape=new Landscape(512,map,size),groundSurface=new THREE.Mesh(landscape.geometry(landscape.renderSize,segments),new THREE.MeshStandardMaterial());
  const view={landscape,groundSurface,terrain:new THREE.Group(),materials:Object.fromEntries(bridgeArtwork.materialRoles.map(role=>[role,new THREE.MeshStandardMaterial({vertexColors:true})])),mergeModel:WorldView.prototype.mergeModel};
  view.terrain.add(groundSurface);buildBridges(view);view.terrain.updateMatrixWorld(true);return view;
}

test('the actual Blender bridge and approach ramps match walking and command heights on both river maps',async()=>{
  for(const [map,size,segments]of [['valley',160,112],['valley',400,112],['rivers',160,160],['rivers',640,112],['rivers',640,160]]){
    const view=await fixture(map,size,segments),ray=new THREE.Raycaster();
    assert.equal(view.bridgeMeshes.length,bridgeSpans(map).length);assert.equal(view.bridgeDiagnostics.source,'Blender');assert.ok(view.bridgeDiagnostics.draws<=view.bridgeMeshes.length*3);assert.ok(view.bridgeDiagnostics.triangles<view.bridgeMeshes.length*16000);
    assert.equal(view.bridgeDiagnostics.clearWidth,13.6);
    for(const span of bridgeSpans(map))for(const z of [-bridgeRoadHalfWidth+.8,0,bridgeRoadHalfWidth-.8])for(let offset=-span.halfLength-3;offset<=span.halfLength+3;offset+=.37){
      const x=span.center+offset;ray.set(new THREE.Vector3(x,20,z),new THREE.Vector3(0,-1,0));const hit=ray.intersectObjects([...view.bridgeMeshes,view.groundSurface],true)[0];assert.ok(hit,`${map} has solid paving at ${x}, ${z}`);
      if(Math.abs(offset)<=span.halfLength)assert.notEqual(hit.object,view.groundSurface,'the rendered terrain cannot cover the bridge road');
      assert.ok(Math.abs(hit.point.y-view.landscape.walkableHeightAt(x,z))<.085,`${map} feet and road agree at ${x}, ${z}: mesh ${hit.point.y}, walking ${view.landscape.walkableHeightAt(x,z)}`);
      const command=view.landscape.rayPoint(ray.ray);assert.ok(command&&Math.abs(command.y-view.landscape.walkableHeightAt(x,z))<.003,'commands target the road rather than the riverbed');
    }
  }
});

test('bridge arches remain open above the continuous riverbed while the masonry piers are solid',async()=>{
  const view=await fixture('valley'),ray=new THREE.Raycaster();
  assert.ok(view.landscape.surfaceHeightAt(0,0)<0,'the old raised land dam is gone');
  for(const [x,y]of [[0,.5],[-8,.1],[8,.1]]){ray.set(new THREE.Vector3(x,y,15),new THREE.Vector3(0,0,-1));assert.equal(ray.intersectObjects(view.bridgeMeshes,true).length,0,'water can be seen through the actual arch geometry');}
  ray.set(new THREE.Vector3(4.425,.3,15),new THREE.Vector3(0,0,-1));assert.ok(ray.intersectObjects(view.bridgeMeshes,true).length>0,'the pier has real volume');
  for(const z of [-9.9*bridgeWidthScale,9.9*bridgeWidthScale]){ray.set(new THREE.Vector3(0,20,z),new THREE.Vector3(0,-1,0));const hit=ray.intersectObjects(view.bridgeMeshes,true)[0];assert.ok(hit&&hit.point.y>3.2,`both parapets rise above the road: ${z}, ${hit?.point.y}`);}
});

test('fresh river maps keep natural obstacles and new construction off the bridge while armies can cross',()=>{
  for(const map of ['valley','rivers'])for(const seed of [1,512,2026]){
    const sim=new Simulation({mode:'custom',map,mapSize:'huge',seed});
    assert.equal(sim.entities.filter(e=>e.kind==='resource'&&!e.water&&bridgeFootprint(map,e.x,e.z,8)).length,0,'seeded resources leave room to turn into the bridge approaches');
    sim.entities=[];sim.index=new Map();sim.revision++;sim.grids={};sim.visible.fill(1);
    for(const span of bridgeSpans(map))for(const type of ['house','wall','gate','dock'])assert.equal(sim.buildValid(type,span.center,0,0),false,'structures cannot intersect bridge masonry');
    const first=bridgeSpans(map)[0],unit=sim.addUnit('scout',0,first.center-first.halfLength-7,0),destination=first.center+first.halfLength+7;
    sim.command([unit.id],{type:'move',x:destination,z:0});for(let i=0;i<200&&unit.order;i++)sim.tickUnit(unit,.1);
    assert.ok(Math.hypot(unit.x-destination,unit.z)<1.5,'the existing army route still reaches the far bank');
  }
});

test('older saved bridge resources move to a clear bank without losing supplies, identity or worker orders',()=>{
  const sim=new Simulation({mode:'sandbox',map:'valley',seed:512}),tree=sim.addResource('wood',0,1,777),worker=sim.owned(0,'unit','villager')[0];worker.order={type:'gather',target:tree.id};worker.path=[{x:0,z:1}];worker.pathTargetX=0;worker.pathTargetZ=1;
  const resources={...sim.players[0].resources},random=sim.rng.state,restored=Simulation.restore(JSON.parse(JSON.stringify(sim.serialize()))),moved=restored.get(tree.id),builder=restored.get(worker.id);
  assert.equal(moved.amount,777);assert.equal(moved.initialAmount,777);assert.equal(bridgeFootprint('valley',moved.x,moved.z,3),false);assert.equal(restored.isWater(moved.x,moved.z),false);assert.deepEqual(restored.players[0].resources,resources);assert.equal(restored.rng.state,random);assert.equal(builder.order.target,tree.id);assert.deepEqual(builder.path,[]);
  assert.equal(restored.entities.some(other=>other!==moved&&other.hp>0&&Math.hypot(other.x-moved.x,other.z-moved.z)<moved.r+(other.r||1)+.5),false);
  const again=Simulation.restore(JSON.parse(JSON.stringify(restored.serialize()))).get(tree.id);assert.equal(again.x,moved.x);assert.equal(again.z,moved.z);
});
