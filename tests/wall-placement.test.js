import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Simulation} from '../src/simulation.js';
import {FACTIONS} from '../src/data.js';
import {WallPlacement,wallPlacementPlan,wallPointerPoint} from '../src/wall-placement.js';
import {wallTreeConnections} from '../src/walls.js';
import {gateConversionPlan} from '../src/gate-conversion.js';
import {clearSegment} from '../src/navigation.js';
import {WallPreview} from '../src/wall-preview.js';
import {wallConnections,wallSupportConnections} from '../src/walls.js';

function fixture(faction='alder'){
  const sim=new Simulation({mode:'sandbox',map:'highlands',seed:512,faction});
  for(const e of sim.entities)if(e.kind==='resource'||e.kind==='building')e.hp=0;
  sim.revision++;sim.visible.fill(1);sim.players[0].age=3;sim.players[0].resources.stone=10000;
  const worker=sim.addUnit('villager',0,0,16);return {sim,worker};
}
function plan(sim,worker,from={x:0,z:20},to={x:20,z:20}){const draft=new WallPlacement();draft.drag(from,to);return wallPlacementPlan(sim,draft,[worker.id]);}

test('clicking a visible tree canopy anchors the wall at its trunk instead of the ground behind it',()=>{
  const tree={kind:'resource',type:'wood',hp:1,x:3,z:4},view={pick:()=>tree,groundPoint:()=>({x:10,z:11})};
  assert.deepEqual(wallPointerPoint(view,50,60),{x:3,z:4});
  for(const type of ['stone','gold']){view.pick=()=>({...tree,type});assert.deepEqual(wallPointerPoint(view,50,60),{x:3,z:4});}
  for(const target of [null,{...tree,hp:0},{...tree,type:'food'},{...tree,water:true}]){view.pick=()=>target;assert.deepEqual(wallPointerPoint(view,50,60),{x:10,z:11});}
});

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
    const stone=sim.players[0].resources.stone,built=sim.buildWallDraft(p.start,p.end,[worker.id]);assert.equal(built.length,p.count);assert.equal(stone-sim.players[0].resources.stone,p.cost.stone);
    assert.deepEqual(built.map(({x,z})=>({x,z})),p.segments.filter(section=>section.affordable).map(({x,z})=>({x,z})));assert.equal(wallConnections(sim.entities).length,built.length-1);assert.equal(worker.order.target,built[0].id);
  }
});

test('wall previews extend either endpoint of an existing wall and join two ends without duplicate foundations',()=>{
  for(const reverse of [false,true]){
    const {sim,worker}=fixture(),existing=sim.addBuilding('wall',0,0,20,true),p=plan(sim,worker,reverse?{x:20,z:20}:existing,reverse?existing:{x:20,z:20});
    assert.equal(p.canBuild,true,p.message);assert.equal(p.reverse,reverse);const built=sim.buildWallDraft(p.start,p.end,[worker.id]);assert.equal(built.length,p.count);assert.ok(existing.wallLinks.includes(built[0].id));assert.equal(wallConnections(sim.entities).length,built.length);
  }
  const {sim,worker}=fixture(),a=sim.addBuilding('wall',0,0,20,true),b=sim.addBuilding('wall',0,17.1,20,true),p=plan(sim,worker,a,b);
  assert.equal(p.canBuild,true,p.message);assert.equal(p.count,5);const before=sim.players[0].resources.stone,built=sim.buildWallDraft(p.start,p.end,[worker.id]);assert.equal(built.length,5);assert.equal(before-sim.players[0].resources.stone,p.cost.stone);assert.equal(wallConnections(sim.entities).length,6);assert.ok(b.wallLinks.includes(built.at(-1).id));
});

test('dragged walls snap to both trees and retain their natural end caps until trees are felled',()=>{
  const {sim,worker}=fixture(),left=sim.addResource('wood',-10,20,600),right=sim.addResource('wood',10,20,600);
  const p=plan(sim,worker,left,right);assert.equal(p.canBuild,true,p.message);assert.match(p.message,/both trees/);
  const before=sim.players[0].resources.stone,built=sim.buildWallDraft(p.start,p.end,[worker.id]);
  assert.equal(built.length,p.count);assert.deepEqual(built.map(({x,z})=>({x,z})),p.segments.filter(section=>section.affordable).map(({x,z})=>({x,z})));assert.equal(before-sim.players[0].resources.stone,p.cost.stone);
  for(const wall of built)wall.progress=1;
  let links=wallTreeConnections(sim.entities);assert.equal(links.length,2);assert.deepEqual(new Set(links.map(link=>link.b.id)),new Set([left.id,right.id]));
  const restored=Simulation.restore(JSON.parse(JSON.stringify(sim.serialize())));assert.equal(wallTreeConnections(restored.entities).length,2);
  left.hp=0;sim.revision++;links=wallTreeConnections(sim.entities);assert.equal(links.length,1);assert.equal(links[0].b.id,right.id,'the felled trunk no longer supplies invisible collision or masonry');
});

test('a dragged line joins an existing wall to a tree in either direction',()=>{
  for(const reversed of [false,true]){
    const {sim,worker}=fixture(),wall=sim.addBuilding('wall',0,0,20,true),tree=sim.addResource('wood',15,20,600);
    const p=plan(sim,worker,reversed?tree:wall,reversed?wall:tree);assert.equal(p.canBuild,true,p.message);
    const built=sim.buildWallDraft(p.start,p.end,[worker.id]);assert.equal(built.length,p.count);assert.ok(wall.wallLinks.includes(built.at(-1).id));
    assert.ok(wallTreeConnections(sim.entities).some(link=>link.b.id===tree.id));
  }
});

test('blocked, unseen, water and out of bounds sections cannot be confirmed as a full line',()=>{
  const {sim,worker}=fixture();sim.addBuilding('house',0,12,20,true);let p=plan(sim,worker);assert.equal(p.canBuild,true);assert.ok(p.blocked>0);assert.ok(p.segments.some(s=>!s.valid));
  const stone=sim.players[0].resources.stone,built=sim.buildWallDraft(p.start,p.end,[worker.id]);
  assert.deepEqual(built.map(w=>w.x),p.segments.filter(w=>w.affordable).map(w=>w.x));
  assert.equal(stone-sim.players[0].resources.stone,p.cost.stone);
  assert.ok(built.some(w=>w.x<8)&&built.some(w=>w.x>16));
  assert.ok(wallConnections(sim.entities).every(link=>link.a.x<8||link.b.x>16));
  const clear=fixture();clear.sim.visible.fill(0);p=plan(clear.sim,clear.worker);assert.equal(p.canBuild,false);assert.ok(p.blocked>0);
  clear.sim.visible.fill(1);assert.equal(plan(clear.sim,clear.worker,{x:clear.sim.halfWorld,z:20},{x:clear.sim.halfWorld,z:30}).canBuild,false);
  const water=new Simulation({mode:'sandbox',map:'rivers',seed:512});water.visible.fill(1);water.players[0].age=3;const u=water.addUnit('villager',0,0,16);let point;
  for(let x=-50;x<50&&!point;x+=2)for(let z=-50;z<50;z+=2)if(water.isWater(x,z)){point={x,z};break;}
  assert.ok(point);p=plan(water,u,point,point);assert.equal(p.canBuild,false);assert.equal(p.blocked,1);
});

test('affordability, age and an available owned villager gate confirmation without spending anything',()=>{
  const {sim,worker}=fixture();sim.players[0].resources.stone=44;const p=plan(sim,worker);assert.equal(p.canBuild,true);assert.equal(p.count,2);assert.equal(p.segments.filter(s=>s.affordable).length,2);assert.ok(p.unaffordable>0);assert.equal(sim.players[0].resources.stone,44);
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


test('crossing an existing wall counts it as already built and charges only for linked new sections',()=>{
  const {sim,worker}=fixture(),existing=sim.addBuilding('wall',0,0,20,true);
  const p=plan(sim,worker,{x:-8.55,z:20},{x:8.55,z:20});
  assert.equal(p.blocked,0);assert.equal(p.reused,1);assert.equal(p.count,6);
  const stone=sim.players[0].resources.stone,built=sim.buildWallDraft(p.start,p.end,[worker.id]);
  assert.equal(built.length,6);assert.equal(stone-sim.players[0].resources.stone,p.cost.stone);
  assert.equal(existing.wallLinks.length,2);
  assert.equal(sim.owned(0,'building','wall').length,7);
});

test('walls anchor to solid buildings and gold or stone and release the join when the support disappears',()=>{
  const {sim,worker}=fixture(),house=sim.addBuilding('house',0,-11,20,true);
  const gold=sim.addResource('gold',13,20,500),stone=sim.addResource('stone',13,34,500);
  for(const [support,end] of [[house,{x:-11,z:30}],[gold,{x:0,z:20}],[stone,{x:0,z:34}]]){
    const p=plan(sim,worker,support,end);
    assert.equal(p.canBuild,true,p.message);assert.ok(p.segments[0].supports.includes(support.id));
    assert.equal(sim.buildWallDraft(p.start,p.end,[worker.id]).length,p.count);
  }
  const links=wallSupportConnections(sim.entities);
  assert.deepEqual(links.map(link=>link.b.id),[house.id,gold.id,stone.id]);
  assert.ok(links.every(link=>link.gap>0));
  const restored=Simulation.restore(JSON.parse(JSON.stringify(sim.serialize())));
  assert.equal(wallSupportConnections(restored.entities).length,3);
  gold.hp=0;sim.revision++;
  assert.deepEqual(wallSupportConnections(sim.entities).map(link=>link.b.id),[house.id,stone.id]);
});

test('conversion replaces three completed straight sections with a fortified gate and keeps both connections',()=>{
  for(const vertical of [false,true]){
    const {sim}=fixture();sim.players[0].tech.fortifiedWall=1;
    const walls=[-2,-1,0,1,2].map(i=>sim.addBuilding('wall',0,vertical?0:i*2.85,20+(vertical?i*2.85:0),true));
    const center=walls[2],old=sim.players[0].resources.stone,p=gateConversionPlan(sim,center.id);
    assert.ok(p);walls[1].hp*=.8;
    assert.equal(sim.convertWallToGate(center.id,1),false);
    const gate=sim.convertWallToGate(center.id);
    assert.equal(gate.type,'gate');assert.equal(gate.maxHp,center.maxHp);assert.equal(gate.hp,gate.maxHp*.8);
    assert.equal(old-sim.players[0].resources.stone,p.cost.stone);
    assert.deepEqual(new Set(gate.wallLinks),new Set([walls[0].id,walls[4].id]));
    assert.ok(walls.slice(1,4).every(wall=>wall.hp===0));
    const ends=vertical?[{x:-2,z:20},{x:2,z:20}]:[{x:0,z:18},{x:0,z:22}];
    assert.equal(clearSegment(sim,sim.grid(0),...ends),true);
    assert.equal(clearSegment(sim,sim.grid(1),...ends),false);
    const restored=Simulation.restore(JSON.parse(JSON.stringify(sim.serialize())));
    assert.equal(wallConnections(restored.entities).length,2);
  }
});

test('corner, unfinished section and obstructed footprint cannot be converted or charged',()=>{
  const {sim}=fixture(),center=sim.addBuilding('wall',0,0,20,true),left=sim.addBuilding('wall',0,-2.85,20,true);
  const right=sim.addBuilding('wall',0,0,22.85,true),resources={...sim.players[0].resources};
  assert.equal(sim.convertWallToGate(center.id),false);
  right.x=2.85;right.z=20;sim.revision++;
  left.progress=.9;assert.equal(sim.convertWallToGate(center.id),false);
  left.progress=1;const deposit=sim.addResource('stone',0,23.8,400);
  assert.equal(sim.convertWallToGate(center.id),false);
  assert.deepEqual(sim.players[0].resources,resources);
  assert.equal(deposit.hp,1);
});

test('an anchored run at the strict wall clearance keeps its build count in sync with the preview',()=>{
  const {sim,worker}=fixture();
  const left=sim.addResource('wood',0,20,600),right=sim.addResource('wood',10.25-1e-10,20,600);
  const p=plan(sim,worker,left,right);
  assert.equal(p.canBuild,true);
  assert.equal(sim.buildWallDraft(p.start,p.end,[worker.id]).length,p.count);
});
