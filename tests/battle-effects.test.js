import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {attackFlight,updateFlight,releaseEffect,FlightEffects,ImpactEffects} from '../src/battle-effects.js';

test('projectiles follow raised, interpolated weapon positions and turn along their arc',()=>{
  const view={entityHeight:e=>e.kind==='building'?4:2},archer={kind:'unit',type:'archer',x:0,z:0,renderX:1,renderZ:2},target={kind:'unit',type:'swordsman',x:1,z:12};
  const shot={...attackFlight(view,archer,target),object:new THREE.Object3D()};
  assert.equal(shot.kind,'arrow');assert.ok(Math.abs(shot.from.y-4.1)<1e-8,'archer release starts at the aimed nock height');assert.ok(Math.abs(shot.from.x-.875)<1e-8,'the interpolated bowstring release remains attached to the drawing hand');assert.ok(Math.abs(shot.from.z-2.525)<1e-8);assert.equal(shot.to.y,3.35);
  updateFlight(shot,0);assert.ok(shot.object.position.distanceTo(shot.from)<1e-8);const rotation=shot.object.quaternion.clone();
  updateFlight(shot,.5);assert.ok(shot.object.position.y>(shot.from.y+shot.to.y)/2);updateFlight(shot,1);assert.ok(shot.object.position.distanceTo(shot.to)<1e-8);assert.ok(rotation.angleTo(shot.object.quaternion)>.05);
  for(const type of ['catapult','warship','galley','tower','swordsman']){
    const entity={...archer,type,kind:type==='tower'?'building':'unit'},f=attackFlight(view,entity,target);f.object=new THREE.Object3D();
    if(f.kind==='slash')f.object.material={};for(const t of [0,.2,.5,1]){updateFlight(f,t);assert.ok(f.object.position.toArray().every(Number.isFinite));assert.ok(Math.abs(f.object.quaternion.length()-1)<1e-8);}
    if(type==='tower')assert.ok(f.from.y>10);if(['catapult','warship'].includes(type))assert.ok(f.impact&&f.arc>1&&f.duration>shot.duration);
  }
});

test('combat mesh pools reuse completed shots, preserve shared geometry and bound retained objects',()=>{
  const pool=new FlightEffects(),scene=new THREE.Scene(),mesh=pool.acquire('arrow');scene.add(mesh);let disposed=false;mesh.geometry.addEventListener('dispose',()=>disposed=true);
  releaseEffect({object:mesh,recycle:m=>pool.release(m)});assert.equal(scene.children.length,0);assert.equal(disposed,false);assert.equal(pool.acquire('arrow'),mesh);pool.release(mesh);
  for(const kind of ['arrow','stone','slash']){
    const a=pool.acquire(kind);scene.add(a);assert.ok(a.geometry.attributes.position.array.every(Number.isFinite));a.geometry.computeBoundingBox();const size=a.geometry.boundingBox.getSize(new THREE.Vector3());assert.ok(size.x>0&&size.y>0&&size.z>=0);
    pool.release(a);assert.equal(pool.acquire(kind),a);pool.release(a);
  }
  const many=Array.from({length:120},()=>pool.acquire('slash'));many.forEach(m=>pool.release(m));assert.ok(pool.retained.size<=pool.limit);assert.equal(disposed,false);
  const geometry=new THREE.BoxGeometry(),material=new THREE.MeshBasicMaterial(),ordinary=new THREE.Mesh(geometry,material);let released=0;geometry.addEventListener('dispose',()=>released++);material.addEventListener('dispose',()=>released++);scene.add(ordinary);releaseEffect({object:ordinary});assert.equal(released,2);assert.equal(scene.children.length,0);
  pool.dispose();assert.equal(disposed,true);assert.equal(pool.retained.size,0);
});

test('impact feedback reuses meshes without sharing live colors, fading state or velocities',()=>{
  const pool=new ImpactEffects(),scene=new THREE.Scene(),first=pool.acquire('burst',0xff0000),second=pool.acquire('burst',0x00ff00),heal=pool.acquire('heal');
  scene.add(first,second,heal);assert.equal(first.geometry,second.geometry);assert.notEqual(first.material,second.material);assert.notEqual(first.userData.velocities,second.userData.velocities);
  first.userData.velocities[0].x=19;assert.equal(second.userData.velocities[0].x,0);assert.equal(first.material.color.getHex(),0xff0000);assert.equal(second.material.color.getHex(),0x00ff00);
  let disposed=0;first.geometry.addEventListener('dispose',()=>disposed++);first.material.addEventListener('dispose',()=>disposed++);first.scale.setScalar(.2);first.material.opacity=.1;first.rotation.set(1,2,3);
  releaseEffect({object:first,recycle:mesh=>pool.release(mesh)});assert.equal(disposed,0);assert.equal(scene.children.length,2);
  const reused=pool.acquire('burst',0x0000ff);assert.equal(reused,first);assert.equal(reused.material.color.getHex(),0x0000ff);assert.equal(reused.material.opacity,.8);assert.deepEqual(reused.scale.toArray(),[1,1,1]);assert.equal(reused.quaternion.angleTo(new THREE.Quaternion()),0);
  heal.material.opacity=.05;pool.release(heal);assert.equal(pool.acquire('heal'),heal);assert.equal(heal.material.opacity,.7);pool.release(heal);pool.release(heal);assert.equal(pool.free.heal.length,1);
  pool.dispose();assert.equal(disposed,2);assert.equal(scene.children.length,0);
});

test('impact pools bound retained GPU objects, dispose overflow and release shared geometry only at teardown',()=>{
  const pool=new ImpactEffects(),bursts=Array.from({length:60},()=>pool.acquire('burst')),rings=Array.from({length:12},()=>pool.acquire('heal'));
  let burstGeometry=0,ringGeometry=0,meshes=0,materials=0;
  pool.geometry.burst.addEventListener('dispose',()=>burstGeometry++);pool.geometry.heal.addEventListener('dispose',()=>ringGeometry++);
  for(const mesh of [...bursts,...rings]){mesh.material.addEventListener('dispose',()=>materials++);if(mesh.isInstancedMesh)mesh.addEventListener('dispose',()=>meshes++);pool.release(mesh);}
  assert.equal(pool.retained.size,pool.limit);assert.equal(materials,24);assert.equal(meshes,24);assert.equal(burstGeometry,0);assert.equal(ringGeometry,0);
  pool.dispose();pool.dispose();assert.equal(materials,72);assert.equal(meshes,60);assert.equal(burstGeometry,1);assert.equal(ringGeometry,1);assert.equal(pool.retained.size,0);assert.throws(()=>pool.acquire('burst'),/disposed/);
});
