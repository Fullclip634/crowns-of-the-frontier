import test from 'node:test';
import assert from 'node:assert/strict';
import {UnitLocomotion} from '../src/locomotion.js';
import {animatePart} from '../src/world-polish.js';
import * as THREE from 'three';
import {Simulation} from '../src/simulation.js';

test('new idle units keep finite poses before their first simulation tick and after movement',()=>{
  const sim=new Simulation({mode:'sandbox',map:'highlands',seed:512}),e=sim.addUnit('villager',0,0,20),gait=new UnitLocomotion();
  assert.equal(e.moving,undefined,'new units do not receive a movement flag until tickUnit runs');
  const part={userData:{motion:{type:'leg',pivot:[0,1,0],side:1}}},view={clock:0,locomotion:gait};
  const check=()=>{const state=gait.update(e,e.x,e.z,1/60),root=new THREE.Matrix4().makeTranslation(e.x,state.bob,e.z);
    assert.ok([state.phase,state.wheel,state.blend,state.bob].every(Number.isFinite));
    assert.ok(animatePart(view,part,e,root).elements.every(Number.isFinite),'root and articulated joint poses must remain drawable');
    return state;
  };
  for(let i=0;i<120;i++)assert.equal(check().bob,0);
  e.moving=true;for(let i=0;i<60;i++){e.z+=.05;check();}assert.ok(gait.get(e.id).blend>.99);
  e.moving=false;for(let i=0;i<120;i++)check();assert.ok(gait.get(e.id).blend<1e-10);
  gait.clear();delete e.moving;for(let i=0;i<120;i++)assert.equal(check().bob,0);
});

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
  const pose=(x,z)=>animatePart(view,{userData:{motion:{type:'horseleg',pivot:[x,1,z],side:Math.sign(x)*(z>0?1:-1)}}},e,matrix).clone();
  const leftRear=pose(-.3,-.58),rightFront=pose(.3,.59),leftFront=pose(-.3,.59);assert.ok(Math.abs(leftRear.elements[6]-rightFront.elements[6])<1e-10);assert.ok(Math.abs(leftRear.elements[6]+leftFront.elements[6])<1e-10);
  for(const result of [leftRear,rightFront,leftFront]){assert.ok(result.elements.every(Number.isFinite));assert.ok(Math.abs(result.determinant()-1)<1e-10);}
});
