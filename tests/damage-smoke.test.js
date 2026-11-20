import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {WorldView} from '../src/world.js';
import {BuildingDamageEffects} from '../src/battle-effects.js';

test('collapse dust still emits while the persistent damage batches are present', () => {
  const view = Object.create(WorldView.prototype);
  view.scene = new THREE.Scene();
  view.fx = [];
  view.settings = {quality: 'low'};
  view.buildingDamage = new BuildingDamageEffects(view.scene);

  try {
    assert.equal(view.smoke(0,1,0),true);
    assert.equal(view.fx.length,1);
    assert.equal(view.fx[0].smoke,true);
  } finally {
    view.impactEffects?.dispose();
    view.buildingDamage.dispose();
  }
});
