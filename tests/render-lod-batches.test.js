import test from 'node:test';
import assert from 'node:assert/strict';
import {poseTarget, beginUnitFrame, endUnitFrame} from '../src/render-batches.js';

function fakePart(renderIds) {
  const updates = [];
  return {
    count: 0, visible: false, boundingSphere: null,
    userData: {unitIds: renderIds, ownerChanged: false},
    instanceMatrix: {
      array: new Float32Array(16),
      clearUpdateRanges() {}, addUpdateRange(start, count) { updates.push([start, count]); }, needsUpdate: false,
    },
    geometry: {getAttribute: () => null},
    updates,
  };
}

function fakeView() {
  const batch = {parts: [], farParts: [], ids: [], free: [], renderIds: [], farRenderIds: [], model3d: {}};
  batch.parts.push(fakePart(batch.renderIds));
  batch.farParts.push(fakePart(batch.farRenderIds));
  return {batch, view: {unitBatches: new Map([['archer:standard', batch]]), frameFrustum: null}};
}

test('poseTarget only routes to the far set when the decimated geometry exists', () => {
  const {batch} = fakeView();
  assert.deepEqual(poseTarget(batch, 'far'), {parts: batch.farParts, renderIds: batch.farRenderIds, distant: true});
  assert.deepEqual(poseTarget(batch, 'near'), {parts: batch.parts, renderIds: batch.renderIds, distant: false});
  assert.equal(poseTarget(batch).distant, false, 'near is the default');
  const withoutFar = {parts: batch.parts, renderIds: batch.renderIds};
  assert.equal(poseTarget(withoutFar, 'far').distant, false, 'no far parts means the near set is used');
});

test('a frame resets both render lists and both ownership flags', () => {
  const {batch, view} = fakeView();
  batch.renderIds.push(1, 2);
  batch.farRenderIds.push(3);
  for (const part of [...batch.parts, ...batch.farParts]) part.userData.ownerChanged = true;
  beginUnitFrame(view, false);
  assert.deepEqual(batch.renderIds, []);
  assert.deepEqual(batch.farRenderIds, []);
  assert.equal([...batch.parts, ...batch.farParts].every(part => part.userData.ownerChanged === false), true);
});

test('endUnitFrame packs near and far instances into separate draw counts', () => {
  const {batch, view} = fakeView();
  batch.renderIds.push(1, 2);
  batch.farRenderIds.push(3, 4, 5);
  batch.ids.push(1, 2, 3, 4, 5);
  endUnitFrame(view);
  assert.equal(batch.parts[0].count, 2);
  assert.equal(batch.farParts[0].count, 3);
  assert.equal(batch.parts[0].visible, true);
  assert.equal(batch.farParts[0].visible, true);
  assert.equal(view.unitRenderDiagnostics.drawn, 5);
  assert.equal(view.unitRenderDiagnostics.distant, 3);
  assert.equal(view.unitRenderDiagnostics.activeBatches, 1);
});

test('an empty LOD tier is hidden and not submitted', () => {
  const {batch, view} = fakeView();
  batch.renderIds.push(1);
  endUnitFrame(view);
  assert.equal(batch.farParts[0].count, 0);
  assert.equal(batch.farParts[0].visible, false);
  assert.equal(view.unitRenderDiagnostics.distant, 0);
});

test('legacy batches without far parts still report as before', () => {
  const {batch, view} = fakeView();
  batch.farParts = [];
  batch.renderIds.push(7);
  endUnitFrame(view);
  assert.equal(batch.parts[0].count, 1);
  assert.equal(view.unitRenderDiagnostics.drawn, 1);
  assert.equal(view.unitRenderDiagnostics.distant, 0);
});
