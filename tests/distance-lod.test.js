import test from 'node:test';
import assert from 'node:assert/strict';
import {screenHeightFor, selectDetail, lodDecision, periodicStride, treeDetailThreshold, unitScreenHeight} from '../src/distance-lod.js';
import {treeDetail} from '../src/tree-lod.js';

test('projected height shrinks with distance and scales with the viewport', () => {
  const near = screenHeightFor(20, 3, 720);
  const far = screenHeightFor(80, 3, 720);
  assert.ok(near > far);
  assert.equal(near / far, 4);
  assert.equal(screenHeightFor(0, 3, 720), screenHeightFor(1, 3, 720), 'clamped against a zero distance');
  assert.ok(screenHeightFor(40, 3, 1440) > screenHeightFor(40, 3, 720));
});

test('LOD selection uses screen size, not raw distance', () => {
  assert.equal(lodDecision({distance: 30, viewportHeight: 720, worldHeight: 3}).detail, 'near');
  assert.equal(lodDecision({distance: 220, viewportHeight: 720, worldHeight: 3}).detail, 'far');
  // The same world distance reads larger on a taller viewport.
  assert.equal(lodDecision({distance: 90, viewportHeight: 1440, worldHeight: 3}).detail, 'near');
});

test('hysteresis keeps a detailed object detailed through small camera changes', () => {
  const previous = {detail: 'near'};
  const wobble = selectDetail(23, previous, {threshold: 26, hysteresis: 0.8});
  assert.equal(wobble.detail, 'near', '23 px stays near because 26 * .8 = 20.8');
  assert.equal(selectDetail(23, {detail: 'far'}, {threshold: 26, hysteresis: 0.8}).detail, 'far',
    'a far object needs the full threshold before switching back');
  assert.equal(selectDetail(30, {detail: 'far'}, {threshold: 26, hysteresis: 0.8}).detail, 'near');
});

test('a disabled distant tier never changes any object', () => {
  assert.equal(selectDetail(1, {detail: 'far'}, {enabled: false}).detail, 'near');
  assert.equal(lodDecision({distance: 400, enabled: false}).detail, 'near');
});

test('tree LOD threshold rises under GPU pressure and stays at the authored value otherwise', () => {
  assert.equal(treeDetailThreshold(null, 16.7), 34);
  assert.equal(treeDetailThreshold(10, 16.7), 34, 'a healthy GPU keeps the authored 34 px threshold');
  assert.ok(treeDetailThreshold(40, 16.7) > 34);
  assert.equal(treeDetailThreshold(4000, 16.7), 68, 'capped so trees never vanish into the far mesh');
  assert.ok(treeDetail(40, 'high', {near: true}, {threshold: 68}).near === false);
  assert.equal(treeDetail(40, 'high', {near: true}).near, true, 'default behaviour is unchanged');
});

test('unit silhouette heights scale projected size for siege and cavalry', () => {
  assert.ok(unitScreenHeight('catapult') > unitScreenHeight('knight'));
  assert.ok(unitScreenHeight('knight') > unitScreenHeight('archer'));
  assert.equal(unitScreenHeight('unknown'), 3);
});

test('periodic work backs off under GPU pressure but never stops', () => {
  assert.equal(periodicStride(null, 16.7), 1);
  assert.equal(periodicStride(10, 16.7), 1);
  assert.equal(periodicStride(18, 16.7), 1, 'just over budget keeps the base stride');
  assert.ok(periodicStride(40, 16.7) > 1);
  assert.ok(periodicStride(400, 16.7, {base: 1, maximum: 4}) <= 4);
  assert.equal(periodicStride(100, 16.7, {base: 2, maximum: 6}), 6);
});
