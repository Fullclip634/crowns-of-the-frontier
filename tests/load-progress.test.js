import test from 'node:test';
import assert from 'node:assert/strict';
import {onAssetProgress, resetAssetProgress, reportAssetProgress, readAssetResponse} from '../src/load-progress.js';

test('progress aggregates concurrent downloads and never exceeds 100%', () => {
  resetAssetProgress();
  const seen = [];
  const off = onAssetProgress(snapshot => seen.push(snapshot));
  const first = reportAssetProgress('models', {loaded: 5, total: 10, label: '3D models'});
  assert.equal(first.percent, 50);
  const second = reportAssetProgress('trees', {loaded: 0, total: 10, label: 'Woodland'});
  assert.equal(second.loaded, 5);
  assert.equal(second.total, 20);
  assert.equal(second.percent, 25);
  reportAssetProgress('models', {loaded: 15, total: 10, label: '3D models'});
  assert.equal(seen.at(-1).percent, 60, 'an oversized read grows the total instead of exceeding 100%');
  reportAssetProgress('trees', {loaded: 10, total: 10, label: 'Woodland'});
  assert.equal(seen.at(-1).percent, 100);
  off();
  const count = seen.length;
  reportAssetProgress('bridge', {loaded: 1, total: 1});
  assert.equal(seen.length, count, 'unsubscribe stops notifications');
});

test('a listener that throws cannot break asset loading', () => {
  resetAssetProgress();
  const off = onAssetProgress(() => { throw new Error('broken UI'); });
  assert.equal(reportAssetProgress('x', {loaded: 1, total: 2}).percent, 50);
  off();
});

test('readAssetResponse streams bytes and reports progress', async () => {
  resetAssetProgress();
  const seen = [];
  const off = onAssetProgress(snapshot => seen.push(snapshot.percent));
  const payload = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
  const response = new Response(payload, {headers: {'content-length': '8'}});
  const buffer = await readAssetResponse(response, 'models', '3D models');
  assert.deepEqual([...new Uint8Array(buffer)], [...payload]);
  assert.equal(seen.at(-1), 100);
  assert.ok(seen.length >= 2, 'progress is reported during the stream, not only at the end');
  off();
});

test('readAssetResponse falls back to arrayBuffer for mock responses', async () => {
  const bytes = new Uint8Array([9, 8, 7]).buffer;
  const response = {ok: true, arrayBuffer: async () => bytes};
  assert.equal(await readAssetResponse(response, 'mock', 'Test'), bytes);
});

test('missing byte counts produce an indeterminate bar', () => {
  resetAssetProgress();
  assert.equal(reportAssetProgress('x', {}).percent, null);
  assert.equal(onAssetProgress(() => {}) instanceof Function, true);
});
