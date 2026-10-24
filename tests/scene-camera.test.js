import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {installVisualDepth} from '../src/visual-depth.js';
import {installRealm3D} from '../src/realm-3d.js';

function fixture(){
  class View{
    attach(sim){this.sim=sim;this.attached++;}
    focus(x,z){this.target.set(x,0,z);this.focused.push({x,z});}
    setCameraPreset(){this.zoom=44;this.tilt=.56;this.presets++;}
    hideGhost(){}
  }
  installVisualDepth(View);installRealm3D(View);
  const sim={options:{seed:512,map:'highlands'},worldSize:480,players:[{},{}],spawnPositions:[{x:-90,z:90},{x:90,z:-90}],owned:()=>[{x:-90,z:90}]};
  const view=new View();Object.assign(view,{sim,target:new THREE.Vector3(125,2,-75),zoom:37,angle:-.8,tilt:.72,settings:{cameraPreset:'balanced'},camera:new THREE.PerspectiveCamera(),scene:{fog:{}},ghost:new THREE.Group(),teamMaterials:[{},{}],polished:true,depthInitialized:true,attached:0,focused:[],presets:0});
  return {view,sim};
}

test('graphics scene extensions preserve the current distant camera throughout a rebuild of the same battle',()=>{
  const {view,sim}=fixture(),pose={target:view.target.clone(),zoom:view.zoom,angle:view.angle,tilt:view.tilt};
  view.attach(sim);assert.equal(view.attached,1);assert.equal(view.sim,sim);assert.deepEqual(view.target,pose.target);assert.equal(view.zoom,pose.zoom);assert.equal(view.angle,pose.angle);assert.equal(view.tilt,pose.tilt);
  assert.deepEqual(view.focused,[]);assert.equal(view.presets,0);assert.ok(view.landscape);assert.equal(view.camera.far,960);
});

test('attaching a different battle still establishes the new kingdom camera and its configured preset',()=>{
  const {view,sim}=fixture(),next={...sim,owned:()=>[{x:70,z:55}]};view.attach(next);
  assert.equal(view.attached,1);assert.equal(view.sim,next);assert.deepEqual(view.focused,[{x:70,z:55}]);assert.equal(view.presets,1);assert.equal(view.zoom,44);assert.deepEqual(view.target.toArray(),[70,0,55]);
});
