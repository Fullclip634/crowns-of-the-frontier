import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Landscape} from '../src/landscape.js';
import {Simulation} from '../src/simulation.js';
import {cameraMapBox,cameraMapFootprint,insideMap,minimapPoint} from '../src/map-geometry.js';
import {CAMERA_PRESETS} from '../src/world.js';

function cameraAt(x,z,angle,tilt,zoom,aspect){
  const camera=new THREE.PerspectiveCamera(46,aspect,.5,400);
  camera.position.set(x+Math.sin(angle)*zoom,.65+Math.tan(tilt)*zoom,z+Math.cos(angle)*zoom);
  camera.lookAt(x,.65,z);camera.updateMatrixWorld();return camera;
}

test('river and sea banks meet the naval boundary rather than submerged dry land',()=>{
  for(const map of ['coast','valley','rivers'])for(const seed of [512,2026,91]){
    const sim=new Simulation({mode:'sandbox',map,seed}),land=new Landscape(seed,map),z=30;
    for(const channel of land.channels())for(const side of [-1,1]){
      const mid=channel.center+Math.sin(z*channel.frequency)*channel.bend,bank=mid+side*channel.width;
      assert.ok(sim.isWater(bank-side*.25,z));assert.equal(sim.isWater(bank+side*.25,z),false);
      assert.ok(land.heightAt(mid,z)<-.5);assert.ok(Math.abs(land.heightAt(bank,z)-.08)<1e-8);
      assert.ok(land.heightAt(bank+side*.25,z)>.08,'land immediately outside the navigation boundary stays above water');
    }
  }
});

test('radar camera box stays finite and rectangular across map edges, views and rotations',()=>{
  for(const preset of Object.values(CAMERA_PRESETS))for(const [x,z]of [[0,0],[-72,-72],[-72,72],[72,-72],[72,72]])for(const angle of [0,Math.PI/4,1.85,Math.PI])for(const aspect of [1440/900,844/390,390/844]){
    const camera=cameraAt(x,z,angle,preset.tilt,preset.zoom,aspect),box=cameraMapBox(camera,.65);
    assert.ok(box,'a camera aimed inside the battlefield always has a locator');
    for(const value of Object.values(box))assert.ok(Number.isFinite(value)&&Math.abs(value)<=80.00001);
    assert.ok(box.minX<box.maxX&&box.minZ<box.maxZ);
    assert.ok(x>=box.minX-1e-5&&x<=box.maxX+1e-5&&z>=box.minZ-1e-5&&z<=box.maxZ+1e-5,'the camera center is inside its box');
    for(const p of cameraMapFootprint(camera,.65))assert.ok(p.x>=box.minX-1e-5&&p.x<=box.maxX+1e-5&&p.z>=box.minZ-1e-5&&p.z<=box.maxZ+1e-5);
  }
});

test('radar locator follows scrolling and grows when zooming out',()=>{
  const preset=CAMERA_PRESETS.tactical,make=(x,z,zoom)=>cameraMapBox(cameraAt(x,z,0,preset.tilt,zoom,1.6),.65);
  const near=make(0,0,24),far=make(0,0,45),moved=make(10,12,24);
  assert.ok(far.maxX-far.minX>near.maxX-near.minX);assert.ok(far.maxZ-far.minZ>near.maxZ-near.minZ);
  assert.ok(Math.abs(moved.minX-near.minX-10)<1e-5);assert.ok(Math.abs(moved.minZ-near.minZ-12)<1e-5);
});

test('minimap coordinates map consistently to the square battlefield and clamp captured drags',()=>{
  const rect={left:17,top:29,width:101,height:101};
  assert.deepEqual(minimapPoint(17,29,rect),{x:-80,z:-80});assert.deepEqual(minimapPoint(118,130,rect),{x:80,z:80});
  assert.deepEqual(minimapPoint(67.5,79.5,rect),{x:0,z:0});assert.deepEqual(minimapPoint(-50,600,rect),{x:-80,z:80});
  for(const [x,z]of [[NaN,0],[0,Infinity],[81,0],[0,-81]])assert.equal(insideMap(x,z),false);
});

test('terrain picking allows the playable square and rejects decorative surroundings',()=>{
  for(const map of ['highlands','coast','valley']){
    const land=new Landscape(512,map),geometry=land.geometry(320,112);
    for(const [x,z]of [[-79,-79],[79,79],[-79,79],[79,-79],[0,0]])assert.ok(land.rayPoint(new THREE.Ray(new THREE.Vector3(x,80,z),new THREE.Vector3(0,-1,0))));
    for(const [x,z]of [[81,0],[-81,0],[0,81],[0,-81],[140,140]])assert.equal(land.rayPoint(new THREE.Ray(new THREE.Vector3(x,80,z),new THREE.Vector3(0,-1,0))),null);
    geometry.dispose();
  }
});

test('huge battlefield terrain remains clickable at all four outer edges',()=>{
  const land=new Landscape(512,'highlands',400),geometry=land.geometry(800,112);
  for(const [x,z]of [[199,199],[-199,199],[199,-199],[-199,-199],[180,0],[0,-180]]){
    const point=land.rayPoint(new THREE.Ray(new THREE.Vector3(x,80,z),new THREE.Vector3(0,-1,0)));assert.ok(point);assert.ok(Math.abs(point.y-land.surfaceHeightAt(x,z))<.005);
  }
  assert.equal(land.rayPoint(new THREE.Ray(new THREE.Vector3(201,80,0),new THREE.Vector3(0,-1,0))),null);geometry.dispose();
});
