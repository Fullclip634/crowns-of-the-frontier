import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {WorldView} from '../src/world.js';

// Regression: the constructor used to store the persistent fire-plume batch as
// `this.smoke`, shadowing the `smoke()` damage-effect method on the prototype.
// Any building below 60% HP then crashed the render loop with
// "this.smoke is not a function".
test('damageSmoke can emit puffs while the plume batch is present', () => {
  const view = Object.create(WorldView.prototype);
  view.scene = new THREE.Scene();
  view.fx = [];
  view.settings = {quality: 'low'};
  view.renderQuality = 'low';
  view.smokeMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshBasicMaterial(), 80);
  view.sim = {
    entities: [{id: 1, kind: 'building', type: 'house', hp: 20, maxHp: 100, progress: 1, owner: 0, x: 0, z: 0, r: 2}],
    isVisible: () => true,
  };
  view.groundHeight = () => 0;
  view.frameFrustum = null; // nearViewport short-circuits to visible

  assert.equal(typeof view.smoke, 'function', 'the smoke() factory must remain callable');
  assert.doesNotThrow(() => view.damageSmoke(0.6));
  assert.ok(view.fx.length > 0, 'a damaged building emits a smoke puff');
});
