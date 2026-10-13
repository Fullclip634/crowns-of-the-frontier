import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {attackFlight,updateFlight,releaseEffect,FlightEffects} from '../src/battle-effects.js';

test('projectiles follow raised, interpolated weapon positions and turn along their arc',()=>{
  const view={entityHeight:e=>e.kind==='building'?4:2},archer={kind:'unit',type:'archer',x:0,z:0,renderX:1,renderZ:2},target={kind:'unit',type:'swordsman',x:1,z:12};
  const shot={...attackFlight(view,archer,target),object:new THREE.Object3D()};
  assert.equal(shot.kind,'arrow');assert.ok(Math.abs(shot.from.y-3.95)<1e-8);assert.ok(Math.abs(shot.from.x-.52)<1e-8);assert.ok(shot.from.z>2);assert.equal(shot.to.y,3.35);
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
