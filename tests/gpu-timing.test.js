import test from 'node:test';
import assert from 'node:assert/strict';
import {effectiveFrameSeconds, createGpuFrameTimer} from '../src/gpu-timing.js';
import {WorldView} from '../src/world.js';

test('frameTimeMs falls back to presented frame time and adapt always tracks it', () => {
  const view = Object.create(WorldView.prototype);
  view.frameAverage = 0.016;
  view.gpuTimer = null;
  assert.equal(view.frameTimeMs, 16);
  view.gpuTimer = {frameMs: 42};
  assert.equal(view.frameTimeMs, 42);
  view.gpuTimer = {frameMs: NaN};
  assert.equal(view.frameTimeMs, 16);

  // Automatic quality may be disabled, but the LOD and shadow schedulers still
  // need a live frame-time signal.
  view.settings = {autoQuality: false};
  view.performanceClock = 0;
  view.renderPressure = {};
  view.adapt(0.1);
  assert.ok(view.frameAverage > 0.016, 'frameAverage advances even when auto-quality is off');
  assert.equal(view.frameTimeMs, view.frameAverage * 1000);
});

test('CPU-only timing is unchanged when no GPU timer is available', () => {
  assert.equal(effectiveFrameSeconds({cpuSeconds: 0.024}), 0.024);
  assert.equal(effectiveFrameSeconds({cpuSeconds: 0.024, gpuMs: null}), 0.024);
  assert.equal(effectiveFrameSeconds({cpuSeconds: 0.024, gpuMs: NaN}), 0.024);
  assert.equal(effectiveFrameSeconds({cpuSeconds: 0.024, gpuMs: 0}), 0.024);
});

test('a GPU-bound frame is reported as GPU time, not the optimistic CPU time', () => {
  // This is the exact failure mode: 8 ms of CPU work, 70 ms of GPU work.
  assert.equal(effectiveFrameSeconds({cpuSeconds: 0.008, gpuMs: 70}), 0.07);
  assert.equal(effectiveFrameSeconds({cpuSeconds: 0.09, gpuMs: 12}), 0.09);
});

test('queue holds are missed frames, and combine with GPU time without double counting', () => {
  const budget = 1 / 60;
  assert.equal(effectiveFrameSeconds({cpuSeconds: 0.008, budgetSeconds: budget, held: 10, submitted: 10}), budget * 2);
  assert.equal(effectiveFrameSeconds({cpuSeconds: 0.008, budgetSeconds: budget, held: 10}), budget * 2);
  assert.equal(effectiveFrameSeconds({cpuSeconds: 0.008, gpuMs: 70, budgetSeconds: budget, held: 10, submitted: 10}), Math.max(budget * 2, 0.07));
});

function fakeRenderer({withExtension = true, disjoint = false} = {}) {
  const calls = {begun: 0, ended: 0, deleted: 0, created: 0};
  let available = false;
  let result = 0;
  const gl = {
    QUERY_RESULT_AVAILABLE: 1,
    QUERY_RESULT: 2,
    GPU_DISJOINT_EXT: 3,
    createQuery() { calls.created += 1; return {id: calls.created}; },
    beginQuery() { calls.begun += 1; },
    endQuery() { calls.ended += 1; },
    deleteQuery() { calls.deleted += 1; },
    getQueryParameter(query, parameter) {
      if (parameter === gl.QUERY_RESULT_AVAILABLE) return available;
      available = false; // each query resolves once, like a real GL query
      return result;
    },
    getParameter() { return disjoint; },
    getExtension(name) { return withExtension && name === 'EXT_disjoint_timer_query_webgl2'
      ? {TIME_ELAPSED_EXT: 4, GPU_DISJOINT_EXT: 3} : null; },
  };
  return {
    gl, calls,
    renderer: {getContext: () => gl},
    resolve(nanoseconds) { available = true; result = nanoseconds; },
    reset() { available = false; result = 0; },
  };
}

test('an unsupported or non-WebGL renderer yields no timer and never throws', () => {
  assert.equal(createGpuFrameTimer(null), null);
  assert.equal(createGpuFrameTimer({getContext: () => null}), null);
  assert.equal(createGpuFrameTimer({getContext: () => { throw new Error('no context'); }}), null);
  assert.equal(createGpuFrameTimer(fakeRenderer({withExtension: false}).renderer), null);
  assert.equal(createGpuFrameTimer({}), null);
});

test('the timer measures a completed query in milliseconds and releases it', () => {
  const harness = fakeRenderer();
  const timer = createGpuFrameTimer(harness.renderer, {sampleEvery: 1});
  assert.equal(timer.supported, true);
  assert.equal(timer.frameMs, null);

  timer.begin();
  timer.end();
  assert.equal(harness.calls.begun, 1);
  assert.equal(harness.calls.ended, 1);
  assert.equal(timer.frameMs, null, 'a pending query is not yet a measurement');

  harness.resolve(42_000_000); // 42 ms in nanoseconds
  timer.begin();
  assert.equal(timer.frameMs, 42);
  timer.end();
  assert.equal(harness.calls.deleted, 1);
  timer.dispose();
});

test('a disjoint event discards invalid timings instead of reporting a fast frame', () => {
  const harness = fakeRenderer({disjoint: true});
  const timer = createGpuFrameTimer(harness.renderer, {sampleEvery: 1});
  timer.begin();
  timer.end();
  timer.begin(); // drains the pending query
  assert.equal(timer.frameMs, null);
  assert.equal(harness.calls.deleted >= 1, true);
  timer.end();
  timer.dispose();
});

test('GPU time is sampled periodically rather than bracketing every frame', () => {
  const harness = fakeRenderer();
  const timer = createGpuFrameTimer(harness.renderer, {sampleEvery: 10});
  assert.equal(timer.sampleEvery, 10);
  for (let frame = 0; frame < 9; frame++) { timer.begin(); timer.end(); }
  assert.equal(harness.calls.begun, 0, 'no query is issued on non-sample frames');
  timer.begin(); timer.end();
  assert.equal(harness.calls.begun, 1, 'one query every ten frames');
  for (let frame = 0; frame < 10; frame++) { timer.begin(); timer.end(); }
  assert.equal(harness.calls.begun, 2);
  timer.dispose();
});

test('overlapping begin calls are ignored and dispose stops all measurement', () => {
  const harness = fakeRenderer();
  const timer = createGpuFrameTimer(harness.renderer, {sampleEvery: 1});
  timer.begin();
  timer.begin();
  assert.equal(harness.calls.begun, 1, 'WebGL2 allows only one active timer query');
  timer.end();
  timer.end();
  assert.equal(harness.calls.ended, 1);
  timer.dispose();
  timer.begin();
  assert.equal(harness.calls.begun, 1);
});
