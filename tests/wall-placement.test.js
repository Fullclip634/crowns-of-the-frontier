import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Simulation} from '../src/simulation.js';
import {FACTIONS} from '../src/data.js';
import {WallPlacement,wallPlacementPlan} from '../src/wall-placement.js';
import {WallPreview} from '../src/wall-preview.js';
import {wallConnections} from '../src/walls.js';

function fixture(faction='alder'){
  const sim=new Simulation({mode:'sandbox',map:'highlands',seed:512,faction});
  for(const e of sim.entities)if(e.kind==='resource'||e.kind==='building')e.hp=0;
  sim.revision++;sim.visible.fill(1);sim.players[0].age=3;sim.players[0].resources.stone=10000;
  const worker=sim.addUnit('villager',0,0,16);return {sim,worker};
}
function plan(sim,worker,from={x:0,z:20},to={x:20,z:20}){const draft=new WallPlacement();draft.drag(from,to);return wallPlacementPlan(sim,draft,[worker.id]);}

test('wall drafts copy finite endpoints, preserve them while moving the map, and reset without commands',()=>{
  const draft=new WallPlacement(),start={x:0,z:20};assert.equal(draft.point({x:NaN,z:1}),false);assert.equal(draft.start,null);
  draft.point(start);start.x=100;assert.deepEqual(draft.start,{x:0,z:20});draft.point({x:20,z:20});
  const before=JSON.stringify([draft.start,draft.end]);draft.togglePan();assert.equal(draft.drag({x:5,z:3},{x:12,z:3}),false);assert.equal(draft.point({x:8,z:3}),false);assert.equal(JSON.stringify([draft.start,draft.end]),before);
  draft.togglePan();draft.drag({x:80,z:0},{x:14,z:24});assert.deepEqual(draft.start,{x:0,z:20});assert.deepEqual(draft.end,{x:14,z:24});draft.clear();assert.equal(draft.start,null);assert.equal(draft.end,null);assert.equal(draft.panning,false);
});

test('preview is read only and predicts actual paid wall counts, costs and links in every direction and civilization',()=>{
  for(const faction of Object.keys(FACTIONS))for(const to of [{x:20,z:20},{x:0,z:40},{x:20,z:40}]){
    const {sim,worker}=fixture(faction),before=JSON.stringify(sim.serialize()),p=plan(sim,worker,undefined,to);
    assert.equal(p.canBuild,true,`${faction}: ${p.message}`);assert.equal(JSON.stringify(sim.serialize()),before,'draft cannot create foundations, spend or command workers');
    const stone=sim.players[0].resources.stone,built=sim.buildWallLine(p.from,p.to,[worker.id]);assert.equal(built.length,p.count);assert.equal(stone-sim.players[0].resources.stone,p.cost.stone);
    assert.deepEqual(built.map(({x,z})=>({x,z})),p.segments.map(({x,z})=>({x,z})));assert.equal(wallConnections(sim.entities).length,built.length-1);assert.equal(worker.order.target,built[0].id);
  }
});

test('wall previews extend either endpoint of an existing wall and join two ends without duplicate foundations',()=>{
  for(const reverse of [false,true]){
    const {sim,worker}=fixture(),existing=sim.addBuilding('wall',0,0,20,true),p=plan(sim,worker,reverse?{x:20,z:20}:existing,reverse?existing:{x:20,z:20});
    assert.equal(p.canBuild,true,p.message);assert.equal(p.reverse,reverse);const built=sim.buildWallLine(p.from,p.to,[worker.id]);assert.equal(built.length,p.count);assert.ok(existing.wallLinks.includes(built[0].id));assert.equal(wallConnections(sim.entities).length,built.length);
  }
  const {sim,worker}=fixture(),a=sim.addBuilding('wall',0,0,20,true),b=sim.addBuilding('wall',0,17.1,20,true),p=plan(sim,worker,a,b);
  assert.equal(p.canBuild,true,p.message);assert.equal(p.count,5);const before=sim.players[0].resources.stone,built=sim.buildWallLine(p.from,p.to,[worker.id]);assert.equal(built.length,5);assert.equal(before-sim.players[0].resources.stone,p.cost.stone);assert.equal(wallConnections(sim.entities).length,6);assert.ok(b.wallLinks.includes(built.at(-1).id));
});

test('blocked, unseen, water and out of bounds sections cannot be confirmed as a full line',()=>{
  const {sim,worker}=fixture();sim.addBuilding('house',0,12,20,true);let p=plan(sim,worker);assert.equal(p.canBuild,false);assert.ok(p.blocked>0);assert.ok(p.segments.some(s=>!s.valid));
  const clear=fixture();clear.sim.visible.fill(0);p=plan(clear.sim,clear.worker);assert.equal(p.canBuild,false);assert.ok(p.blocked>0);
  clear.sim.visible.fill(1);assert.equal(plan(clear.sim,clear.worker,{x:clear.sim.halfWorld,z:20},{x:clear.sim.halfWorld,z:30}).canBuild,false);
  const water=new Simulation({mode:'sandbox',map:'rivers',seed:512});water.visible.fill(1);water.players[0].age=3;const u=water.addUnit('villager',0,0,16);let point;
  for(let x=-50;x<50&&!point;x+=2)for(let z=-50;z<50;z+=2)if(water.isWater(x,z)){point={x,z};break;}
  assert.ok(point);p=plan(water,u,point,point);assert.equal(p.canBuild,false);assert.equal(p.blocked,1);
});

test('affordability, age and an available owned villager gate confirmation without spending anything',()=>{
  const {sim,worker}=fixture();sim.players[0].resources.stone=44;const p=plan(sim,worker);assert.equal(p.canBuild,false);assert.equal(p.segments.filter(s=>s.affordable).length,2);assert.ok(p.unaffordable>0);assert.equal(sim.players[0].resources.stone,44);
  sim.players[0].resources.stone=10000;sim.players[0].age=0;assert.equal(plan(sim,worker).canBuild,false);sim.players[0].age=3;
  for(const change of [{hp:0},{embarked:123},{owner:1}]){const previous={hp:worker.hp,embarked:worker.embarked,owner:worker.owner};Object.assign(worker,change);assert.equal(plan(sim,worker).canBuild,false);Object.assign(worker,previous);}
  const draft=new WallPlacement();draft.point({x:0,z:20});assert.equal(wallPlacementPlan(sim,draft,[]).canBuild,false);assert.equal(wallPlacementPlan(sim,draft,[worker.id]).count,1);draft.togglePan();assert.equal(wallPlacementPlan(sim,draft,[worker.id]).canBuild,false);
});

test('wall preview buffers are bounded solid 3D meshes, separate from simulation and picking, and hide completely',()=>{
  const view={scene:new THREE.Scene(),objects:new THREE.Group(),groundHeight:(x,z)=>x*.01+z*.02,hideGhost(){this.hidden=true;}},preview=new WallPreview(view);
  const segments=Array.from({length:250},(_,i)=>({x:i*2.85,z:20,valid:i!==1,affordable:i<2}));preview.show({segments,from:{x:0,z:20},to:{x:570,z:20},start:{x:0,z:20},end:{x:570,z:20},blocked:1,unaffordable:248});
  assert.equal(preview.walls.count,201);assert.ok(preview.walls.geometry.attributes.position.count>=24);assert.ok(preview.walls.instanceMatrix.array.every(Number.isFinite));assert.equal(view.objects.children.length,0);assert.equal(view.scene.children.length,1);assert.equal(view.hidden,true);assert.equal(view.wallPreviewDiagnostics.drawCalls,3);
  const a=new THREE.Color(),b=new THREE.Color(),c=new THREE.Color();preview.walls.getColorAt(0,a);preview.walls.getColorAt(1,b);preview.walls.getColorAt(2,c);assert.notEqual(a.getHex(),b.getHex());assert.notEqual(a.getHex(),c.getHex());
  preview.hide();assert.equal(preview.group.visible,false);assert.equal(preview.walls.count,0);assert.equal(view.wallPreviewDiagnostics.drawCalls,0);
  const geometries=new Set(),materials=new Set();view.scene.traverse(mesh=>{if(mesh.isMesh){geometries.add(mesh.geometry);materials.add(mesh.material);}});for(const item of [...geometries,...materials])item.dispose();preview.walls.dispose();
});
