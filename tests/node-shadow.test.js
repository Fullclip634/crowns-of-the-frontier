import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {WebGPURenderer,MeshStandardNodeMaterial,rigidPose} from '../src/render-nodes.js';

test('a rigid troop shadow leaves the next ordinary mesh at its own position',()=>{
  const rig={texture:new THREE.DataTexture(new Float32Array(16),4,1,THREE.RGBAFormat,THREE.FloatType)},material=new MeshStandardNodeMaterial();rigidPose(material,rig);
  const shadow=new MeshStandardNodeMaterial();shadow.isShadowPassMaterial=true;
  const scene={overrideMaterial:shadow},seen=[],renderer={shadowMap:{},_cacheShadowNodes:new WeakMap(),_getShadowNodes:WebGPURenderer.prototype._getShadowNodes,_handleObjectFunction(object,active){seen.push({object,position:active.positionNode});}};
  const troop=new THREE.Mesh(new THREE.BoxGeometry(),material),tree=new THREE.Mesh(new THREE.BoxGeometry(),new MeshStandardNodeMaterial());
  for(const object of [troop,tree])WebGPURenderer.prototype.renderObject.call(renderer,object,scene,{},object.geometry,object.material,null,null);
  assert.equal(seen[0].position,material.positionNode);assert.equal(seen[1].position,null,'a tree must not inherit a troop pose or require unitJoint');assert.equal(shadow.positionNode,null);
  rig.texture.dispose();for(const object of [troop,tree]){object.geometry.dispose();object.material.dispose();}shadow.dispose();
});
