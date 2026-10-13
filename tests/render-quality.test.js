import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {setShadowEnabled} from '../src/render-quality.js';

test('shadow quality changes refresh shared, scene-only and dormant palette materials once',()=>{
  const shared=new THREE.MeshStandardMaterial(),palette=new THREE.MeshStandardMaterial(),team=new THREE.MeshStandardMaterial(),roof=new THREE.MeshStandardMaterial(),sceneOnly=new THREE.MeshStandardMaterial();
  const scene=new THREE.Scene();scene.add(new THREE.Mesh(new THREE.BoxGeometry(),[shared,sceneOnly]),new THREE.Mesh(new THREE.BoxGeometry(),shared));
  const view={renderer:{shadowMap:{enabled:false,needsUpdate:false}},scene,materials:{shared,palette},teamMaterials:[team],roofMaterials:[roof]};
  const materials=[shared,palette,team,roof,sceneOnly],versions=materials.map(material=>material.version);
  assert.equal(setShadowEnabled(view,true),true);assert.equal(view.renderer.shadowMap.enabled,true);assert.equal(view.renderer.shadowMap.needsUpdate,true);
  assert.deepEqual(materials.map(material=>material.version),versions.map(version=>version+1));
  assert.equal(setShadowEnabled(view,true),false);assert.deepEqual(materials.map(material=>material.version),versions.map(version=>version+1),'ordinary frames must not trigger shader rebuilds');
  assert.equal(setShadowEnabled(view,false),true);assert.deepEqual(materials.map(material=>material.version),versions.map(version=>version+2));
  scene.traverse(object=>object.geometry?.dispose());for(const material of materials)material.dispose();
});
