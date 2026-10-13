import test from 'node:test';
import assert from 'node:assert/strict';
import {UnitLocomotion} from '../src/locomotion.js';
import {animatePart} from '../src/world-polish.js';
import * as THREE from 'three';

test('gait cadence follows distance at different frame rates and never advances while blocked',()=>{
  const e={id:11,kind:'unit',type:'spearman',moving:true,x:0,z:0},sample=frames=>{const gait=new UnitLocomotion();gait.update(e,0,0,0);for(let i=1;i<=frames;i++)gait.update(e,0,i*4/frames,1/frames);return gait;};
  const a=sample(30),b=sample(60);assert.ok(Math.abs(a.get(e.id).phase-b.get(e.id).phase)<1e-10);assert.ok(Math.abs(a.get(e.id).blend-b.get(e.id).blend)<1e-10);
  const phase=a.get(e.id).phase;for(let i=0;i<30;i++)a.update(e,0,4,1/30);assert.equal(a.get(e.id).phase,phase);assert.ok(a.get(e.id).blend<.00001,'blocked movement settles rather than marching in place');
  a.update(e,80,80,1/60);assert.equal(a.get(e.id).phase,phase);assert.equal(a.get(e.id).blend,0,'teleports do not produce an enormous step');assert.equal(e.x,0);assert.equal(e.z,0,'render history never changes authoritative positions');
});

test('wheels preserve their stopped orientation, siege does not bounce and motion caches release removed units',()=>{
  const e={id:1,type:'ram',moving:true},gait=new UnitLocomotion();gait.update(e,0,0,0);const moved=gait.update(e,0,.2,.1);assert.equal(moved.bob,0);assert.equal(moved.wheel,.4);
  const view={clock:4,locomotion:gait},part={userData:{motion:{type:'wheel',pivot:[0,.5,0],side:1}}},matrix=new THREE.Matrix4();const before=animatePart(view,part,e,matrix).clone();e.moving=false;gait.update(e,0,.2,.1);assert.deepEqual(animatePart(view,part,e,matrix).elements,before.elements);
  gait.prune({get:()=>null});assert.equal(gait.states.size,0);gait.update(e,0,0,0);gait.clear();assert.equal(gait.states.size,0);
});

test('horse legs use diagonal pairs and troop strides keep rigid articulated transforms',()=>{
  const e={id:7,type:'knight',moving:true},gait=new UnitLocomotion();gait.update(e,0,0,0);gait.update(e,0,.3,.1);const view={clock:1,locomotion:gait},matrix=new THREE.Matrix4();
  const pose=(side,z)=>animatePart(view,{userData:{motion:{type:'horseleg',pivot:[0,1,z],side}}},e,matrix).clone();
  const rightRear=pose(1,-.5),leftFront=pose(-1,.5),leftRear=pose(-1,-.5);assert.ok(Math.abs(rightRear.elements[6]-leftFront.elements[6])<1e-10);assert.ok(Math.abs(rightRear.elements[6]+leftRear.elements[6])<1e-10);
  for(const result of [rightRear,leftFront,leftRear]){assert.ok(result.elements.every(Number.isFinite));assert.ok(Math.abs(result.determinant()-1)<1e-10);}
});
