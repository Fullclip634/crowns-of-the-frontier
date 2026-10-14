import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Simulation,distance} from '../src/simulation.js';
import {WALL_SPACING,wallLinePoints,wallConnections} from '../src/walls.js';
import {WallVisuals} from '../src/wall-visuals.js';
import {clearSegment} from '../src/navigation.js';
import {battlePreset} from '../src/custom-battle.js';

function fixture(){const sim=new Simulation({mode:'sandbox',map:'highlands',seed:512});for(const e of sim.entities)if(e.kind==='resource'||e.kind==='building')e.hp=0;sim.revision++;sim.visible.fill(1);sim.players[0].age=3;sim.players[0].resources.stone=10000;return sim;}

test('wall drags keep fixed spacing at every direction and long lengths',()=>{
  for(const end of [{x:4,z:0},{x:40,z:0},{x:0,z:40},{x:28,z:28},{x:150,z:0}]){
    const points=wallLinePoints({x:0,z:0},end);for(let i=1;i<points.length;i++)assert.ok(Math.abs(distance(points[i-1],points[i])-WALL_SPACING)<1e-8);
    assert.ok(distance(points.at(-1),end)<=WALL_SPACING/2+1e-8);if(end.x===150)assert.ok(points.length>45);
  }
  assert.deepEqual(wallLinePoints({x:NaN,z:0},{x:20,z:0}),[]);
});

test('paid wall lines stop at the first obstruction or budget limit and extend existing walls',()=>{
  const sim=fixture(),worker=sim.addUnit('villager',0,0,15),house=sim.addBuilding('house',0,12,20,true),before=sim.players[0].resources.stone;
  const walls=sim.buildWallLine({x:0,z:20},{x:30,z:20},[worker.id]);assert.equal(walls.length,3);assert.ok(walls.every(wall=>wall.x<house.x));assert.equal(sim.players[0].resources.stone,before-22*walls.length);assert.equal(worker.order.target,walls[0].id);assert.equal(worker.orders.length,walls.length-1);
  const extended=sim.buildWallLine(walls[0],{x:-12,z:20},[worker.id]);assert.equal(extended.length,4);assert.ok(walls[0].wallLinks.includes(extended[0].id));
  const low=fixture(),builder=low.addUnit('villager',0,0,15);low.players[0].resources.stone=44;assert.equal(low.buildWallLine({x:0,z:20},{x:30,z:20},[builder.id]).length,2);assert.equal(low.players[0].resources.stone,0);
});

test('wall turns retain their actual neighbors and a destroyed corner remains a breach after reload',()=>{
  const sim=fixture(),a=sim.addBuilding('wall',0,0,20,true),corner=sim.addBuilding('wall',0,WALL_SPACING,20,true),b=sim.addBuilding('wall',0,WALL_SPACING,20+WALL_SPACING,true);
  assert.equal(wallConnections(sim.entities).length,2);assert.deepEqual(a.wallLinks,[corner.id]);assert.deepEqual(b.wallLinks,[corner.id]);assert.ok(Math.abs(Math.sin(b.wallAngle))>.999);
  sim.hurt(corner,corner.hp+1,null);assert.equal(wallConnections(sim.entities).length,0);
  const restored=Simulation.restore(JSON.parse(JSON.stringify(sim.serialize())));assert.equal(wallConnections(restored.entities).length,0);assert.ok(!restored.get(a.id).wallLinks.includes(b.id));
  const replacement=restored.addBuilding('wall',0,corner.x,corner.z,true);assert.equal(wallConnections(restored.entities).length,2);assert.ok(restored.get(a.id).wallLinks.includes(replacement.id));assert.ok(restored.get(b.id).wallLinks.includes(replacement.id));
});

test('connected gates keep a friendly passage in horizontal and vertical walls',()=>{
  for(const vertical of [false,true]){const sim=fixture();for(const side of [-1,1])sim.addBuilding('wall',0,vertical?0:side*6,vertical?20+side*6:20,true);const gate=sim.addBuilding('gate',0,0,20,true);
    assert.equal(gate.wallLinks.length,2);assert.equal(wallConnections(sim.entities).length,2);if(vertical)assert.ok(Math.abs(Math.sin(gate.wallAngle))>.999);
    const from=vertical?{x:-7,z:20}:{x:0,z:13},to=vertical?{x:7,z:20}:{x:0,z:27};assert.equal(clearSegment(sim,sim.grid(0),from,to),true);assert.equal(clearSegment(sim,sim.grid(1),from,to),false);
  }
});

test('old saved wall lines gain connections while new saved breaches keep their topology',()=>{
  const sim=fixture();for(let z=20;z<=29;z+=3)sim.addBuilding('wall',0,0,z,true);const data=JSON.parse(JSON.stringify(sim.serialize()));for(const e of data.entities){delete e.wallLinks;delete e.wallAngle;}
  const restored=Simulation.restore(data),walls=restored.owned(0,'building','wall');assert.equal(wallConnections(restored.entities).length,3);assert.ok(walls.every(e=>Math.abs(Math.sin(e.wallAngle))>.999));
});

test('a long paid wall line finishes beyond the bounded order queue after saving, and Stop still cancels work',()=>{
  const sim=new Simulation({mode:'custom',map:'highlands',seed:512,mapSize:'huge',slots:battlePreset('2v2')});for(const e of sim.entities)if(e.kind==='resource'||e.kind==='building')e.hp=0;sim.revision++;sim.visible.fill(1);sim.players[0].age=3;sim.players[0].resources.stone=10000;
  const worker=sim.addUnit('villager',0,0,16),walls=sim.buildWallLine({x:0,z:20},{x:120,z:20},[worker.id]);assert.ok(walls.length>32);assert.equal(worker.orders.length,32);
  for(let i=0;i<25;i++){sim.tickUnit(worker,1);sim.time++;}const restored=Simulation.restore(JSON.parse(JSON.stringify(sim.serialize()))),builder=restored.get(worker.id),line=walls.map(wall=>restored.get(wall.id));
  for(let i=0;i<2000&&line.some(wall=>wall.progress<1);i++){restored.tickUnit(builder,1);restored.time++;}assert.ok(line.every(wall=>wall.progress===1),'every paid section must be completed, including those outside the ordinary queue');assert.ok(builder.orders.length<=32);
  const stopped=fixture(),u=stopped.addUnit('villager',0,0,16),tasks=stopped.buildWallLine({x:0,z:20},{x:18,z:20},[u.id]);stopped.tickUnit(u,1);stopped.stop([u.id]);const progress=tasks.map(wall=>wall.progress);for(let i=0;i<30;i++)stopped.tickUnit(u,1);assert.deepEqual(tasks.map(wall=>wall.progress),progress);assert.equal(u.order,null);
});

test('builders finish separately placed walls and different lines after saving, without building foreign walls',()=>{
  const sim=fixture(),worker=sim.addUnit('villager',0,0,16);
  const first=sim.buildWallLine({x:0,z:20},{x:6,z:20},[worker.id]);
  const separate=sim.build('wall',14,20,[worker.id]);
  const second=sim.buildWallLine({x:0,z:28},{x:6,z:28},[worker.id]);
  const foreign=sim.addBuilding('wall',1,14,28,false);
  const restored=Simulation.restore(JSON.parse(JSON.stringify(sim.serialize()))),builder=restored.get(worker.id),walls=[...first,separate,...second].map(wall=>restored.get(wall.id));
  for(let i=0;i<2000&&walls.some(wall=>wall.progress<1);i++)restored.tickUnit(builder,.2);
  assert.ok(walls.every(wall=>wall.progress===1),'one builder continues through every owned planted wall');
  assert.equal(restored.get(foreign.id).progress,foreign.progress);
});

test('canceling the current wall refunds it once and builders continue remaining walls; completed walls can be demolished',()=>{
  const sim=fixture(),worker=sim.addUnit('villager',0,0,16),first=sim.build('wall',0,20,[worker.id]),current=sim.build('wall',8,20,[worker.id]),before=sim.players[0].resources.stone;
  assert.ok(sim.demolish(current.id));assert.equal(sim.players[0].resources.stone,before+Math.floor(22*.7));assert.equal(sim.demolish(current.id),false);
  for(let i=0;i<500&&first.progress<1;i++)sim.tickUnit(worker,.2);
  assert.equal(first.progress,1,'a canceled last assignment does not strand earlier sites');
  const paid=sim.players[0].resources.stone;assert.ok(sim.demolish(first.id));assert.equal(sim.players[0].resources.stone,paid+Math.floor(22*.2));assert.equal(sim.get(first.id),null);
});

test('queued player commands and Stop take precedence over automatic wall construction',()=>{
  const sim=fixture(),worker=sim.addUnit('villager',0,0,16),a=sim.build('wall',0,20,[worker.id]),b=sim.addBuilding('wall',0,8,20,false);
  sim.command([worker.id],{type:'move',x:0,z:10},true);
  for(let i=0;i<300&&worker.order?.type==='build';i++)sim.tickUnit(worker,.2);
  assert.equal(a.progress,1);assert.equal(worker.order.type,'move');assert.equal(b.progress,0);
  sim.command([worker.id],{type:'build',target:b.id});sim.stop([worker.id]);for(let i=0;i<100;i++)sim.tickUnit(worker,.2);assert.equal(b.progress,0);assert.equal(worker.order,null);
});

test('automatic wall builders skip unreachable sites and continue reachable construction',()=>{
  const sim=fixture(),worker=sim.addUnit('villager',0,0,16),a=sim.build('wall',0,20,[worker.id]),blocked=sim.addBuilding('wall',0,15,20,false),reachable=sim.addBuilding('wall',0,24,20,false),pathTo=sim.pathTo;
  sim.pathTo=function(unit,target){if(target.id===blocked.id){unit.pathStatus='blocked';return [];}return pathTo.call(this,unit,target);};
  for(let i=0;i<800&&reachable.progress<1;i++)sim.tickUnit(worker,.2);
  assert.equal(a.progress,1);assert.equal(blocked.progress,0);assert.equal(reachable.progress,1);assert.ok(worker.wallConstructionSkipped.includes(blocked.id));
});

test('builders sharing a completed wall continue onto remaining sites',()=>{
  const sim=fixture(),workers=[sim.addUnit('villager',0,0,16),sim.addUnit('villager',0,1,16)],a=sim.build('wall',0,20,workers.map(worker=>worker.id)),b=sim.addBuilding('wall',0,8,20,false);
  for(let i=0;i<500&&b.progress<1;i++)for(const worker of workers)sim.tickUnit(worker,.2);
  assert.equal(a.progress,1);assert.equal(b.progress,1);
});

test('wall joints remain finite, pickable, fog-aware, and release their instance buffers',()=>{
  const sim=fixture(),a=sim.addBuilding('wall',0,0,20,true),b=sim.addBuilding('wall',0,3,20,true),view={sim,objects:new THREE.Group(),geo:{box:new THREE.BoxGeometry()},materials:{stone:new THREE.MeshStandardMaterial(),stoneDark:new THREE.MeshStandardMaterial()},entityHeight:e=>e.x*.02};
  const visual=new WallVisuals(view);visual.update(false);assert.equal(view.wallDiagnostics.visible,1);assert.ok(visual.stone.count>=2);assert.equal(visual.stone.userData.wallIds[0],a.id);assert.ok(visual.stone.instanceMatrix.array.every(Number.isFinite));const version=visual.stone.instanceMatrix.version;visual.update(false);assert.equal(visual.stone.instanceMatrix.version,version,'static walls avoid repeated uploads');
  b.progress=.5;visual.update(false);assert.ok(visual.stone.instanceMatrix.array.every(Number.isFinite));a.owner=b.owner=1;sim.revision++;sim.visible.fill(0);visual.update(false);assert.equal(visual.stone.count,0);visual.update(true);assert.ok(visual.stone.count>0);sim.hurt(b,b.hp+1,null);visual.update(false);assert.equal(visual.stone.count,0);
  let released=0;for(const mesh of visual.meshes)mesh.addEventListener('dispose',()=>released++);visual.dispose();assert.equal(released,2);assert.equal(view.objects.children.length,0);
  view.geo.box.dispose();for(const material of Object.values(view.materials))material.dispose();
});
