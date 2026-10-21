import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {positionShadowLight,scheduleShadows} from '../src/shadow-sampling.js';

test('shadow sampling bounds repeated passes but refreshes immediately after camera, structure and quality changes',()=>{
  const view={renderer:{shadowMap:{enabled:true,needsUpdate:false}},sim:{revision:0},settings:{quality:'high'},target:new THREE.Vector3(),zoom:44,angle:0,tilt:.6,camera:{aspect:1.6},sun:{shadow:{mapSize:new THREE.Vector2(2048,2048)}},clock:0};
  let updates=0;for(let i=0;i<60;i++){view.clock=i/60;if(scheduleShadows(view))updates++;view.renderer.shadowMap.needsUpdate=false;}
  assert.equal(updates,30);assert.equal(view.renderer.shadowMap.autoUpdate,false);
  view.target.x=.001;assert.equal(scheduleShadows(view),true);view.renderer.shadowMap.needsUpdate=false;
  view.sim.revision++;assert.equal(scheduleShadows(view),true);view.renderer.shadowMap.needsUpdate=false;
  view.settings.quality='medium';assert.equal(scheduleShadows(view),true);view.renderer.shadowMap.needsUpdate=false;
  updates=0;for(let i=1;i<=60;i++){view.clock+=1/60;if(scheduleShadows(view))updates++;view.renderer.shadowMap.needsUpdate=false;}
  assert.equal(updates,20);assert.equal(view.shadowDiagnostics.refreshRate,20);
  view.renderer.shadowMap.enabled=false;assert.equal(scheduleShadows(view),false);assert.equal(view.shadowSampling,null);
  view.renderer.shadowMap.enabled=true;assert.equal(scheduleShadows(view),true);view.renderer.shadowMap.needsUpdate=false;
  view.sim={revision:view.sim.revision};assert.equal(scheduleShadows(view),true,'another saved/multiplayer scene needs a fresh map even at the same revision');
});

test('light-space snapping retains the sun direction and holds sub-texel camera pans steady',()=>{
  const sun=new THREE.DirectionalLight(),view={sun,target:new THREE.Vector3()};sun.shadow.mapSize.set(1024,1024);
  const offset=new THREE.Vector3(-48,62,32),right=new THREE.Vector3(0,1,0).cross(offset).normalize();
  positionShadowLight(view,55);const center=sun.target.position.clone();
  view.target.addScaledVector(right,.01);positionShadowLight(view,55);assert.ok(center.distanceTo(sun.target.position)<1e-8);
  assert.ok(sun.position.clone().sub(sun.target.position).distanceTo(offset)<1e-8);
  view.target.addScaledVector(right,.11);positionShadowLight(view,55);assert.ok(Math.abs(sun.target.position.dot(right)-110/1024)<1e-8);
  sun.shadow.mapSize.set(2048,2048);positionShadowLight(view,55);assert.ok(sun.target.position.toArray().every(Number.isFinite));
});

test('node renderer consumes refresh requests without relying on a WebGL flag reset',()=>{
  const view={renderer:{isWebGPURenderer:true,shadowMap:{enabled:true,needsUpdate:true}},sim:{revision:0},settings:{quality:'high'},target:new THREE.Vector3(),zoom:44,angle:0,tilt:.6,camera:{aspect:1.6},sun:{shadow:{mapSize:new THREE.Vector2(2048,2048)}},clock:0};
  let updates=0;for(let i=0;i<60;i++){view.clock=i/60;if(scheduleShadows(view))updates++;}
  assert.equal(updates,30);assert.equal(view.renderer.shadowMap.needsUpdate,false);assert.equal(view.sun.shadow.autoUpdate,false);assert.equal(view.sun.shadow.needsUpdate,true);
  view.settings.quality='medium';view.clock=0;updates=0;
  for(let i=0;i<60;i++){view.clock=i/60;if(scheduleShadows(view))updates++;}
  assert.equal(updates,20);
});
