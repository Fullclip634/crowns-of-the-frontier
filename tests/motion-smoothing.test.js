import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {LocalMotion,smoothHeading,renderPosition} from '../src/motion-smoothing.js';

test('local render movement interpolates fixed ticks without changing authoritative positions',()=>{
  const unit={id:1,kind:'unit',type:'archer',hp:10,x:2,z:4},sim={entities:[unit],time:0},motion=new LocalMotion();
  motion.capture(sim);unit.x=2.3;unit.z=4.2;sim.time=.1;motion.commit(sim);
  assert.deepEqual({...motion.sample(unit,0,.1)},{x:2,z:4});assert.deepEqual({...motion.sample(unit,.5,.1)},{x:2.15,z:4.1});assert.deepEqual({...motion.sample(unit,1,.1)},{x:2.3,z:4.2});
  assert.equal(unit.x,2.3);assert.equal(unit.z,4.2);assert.equal(unit.snapshotAt,undefined);
  const view={localMotion:motion,localBlend:.5,sim,renderFrameAt:1100};assert.deepEqual({...renderPosition(view,unit)},{x:2.15,z:4.1});
  const network={...unit,snapshotAt:1000,renderFromX:2,renderFromZ:4};assert.deepEqual({...renderPosition(view,network)},{x:2.15,z:4.1});view.renderFrameAt=900;assert.deepEqual({...renderPosition(view,network)},{x:2,z:4});view.renderFrameAt=1400;assert.deepEqual({...renderPosition(view,network)},{x:2.3,z:4.2});
  unit.x=30;assert.equal(motion.sample(unit,.5,.1),unit);assert.equal(motion.sample(unit,.5,.2),unit);
  unit.hp=0;motion.capture(sim);assert.equal(motion.previous.size,0);motion.clear();assert.equal(motion.time,-1);
});

test('figures take the shortest smooth turn across the angle boundary and start facing correctly',()=>{
  const node=new THREE.Object3D();assert.equal(smoothHeading(node,3.12,.016),3.12);node.rotation.y=3.12;
  const next=smoothHeading(node,-3.12,.016);assert.ok(next>3.12&&next<3.17);node.rotation.y=next;
  for(let i=0;i<60;i++)node.rotation.y=smoothHeading(node,-3.12,.016);
  assert.ok(Math.abs(Math.atan2(Math.sin(node.rotation.y+3.12),Math.cos(node.rotation.y+3.12)))<.0001);assert.equal(smoothHeading(node,0,0),node.rotation.y);
});
