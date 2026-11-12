// Quality used to be driven only by CPU frame time. On a GPU-bound RTS that is
// the wrong signal: the main thread can finish in 8 ms while the GPU takes
// 70 ms, so automatic quality never reacted. Where the browser exposes
// EXT_disjoint_timer_query_webgl2 we measure the actual draw and take the
// worse of the two signals. WebGPU backends keep their existing queue-pressure
// heuristic and simply get a null timer.

const MAX_PENDING = 4;

export function effectiveFrameSeconds({cpuSeconds = 0, gpuMs = null, budgetSeconds = 1 / 60, submitted = 0, held = 0} = {}) {
  let average = cpuSeconds;
  // Queue holds are missed render opportunities, not fast displayed frames.
  if (held) average = Math.max(average, budgetSeconds) * (submitted ? 1 + held / submitted : 2);
  // GPU time and CPU time overlap (the CPU submits while the GPU draws), so
  // the frame is bounded by the slower of the two, not by their sum.
  if (Number.isFinite(gpuMs) && gpuMs > 0) average = Math.max(average, gpuMs / 1000);
  return average;
}

function webglContext(renderer) {
  if (!renderer || typeof renderer.getContext !== 'function') return null;
  // WebGPURenderer has no WebGL context. Asking must never break startup.
  try { return renderer.getContext() || null; }
  catch { return null; }
}

// A WebGL2 timer query is not free. On ANGLE/D3D11, polling a pending
// TIME_ELAPSED_EXT query forces pipeline synchronization and can more than
// halve the frame rate, even when queries are issued infrequently. This is
// therefore an opt-in diagnostic (settings.gpuTiming), not a default render
// path. Production quality adaptation uses CPU frame time and queue pressure.
// One sample every `sampleEvery` frames is still plenty for a diagnostic.
export function createGpuFrameTimer(renderer, {sampleEvery = 30} = {}) {
  const gl = webglContext(renderer);
  const extension = gl && typeof gl.getExtension === 'function'
    ? gl.getExtension('EXT_disjoint_timer_query_webgl2')
    : null;
  if (!gl || !extension || typeof gl.createQuery !== 'function') return null;

  let active = null;
  let pending = [];
  let lastMs = null;
  let disposed = false;
  let frames = 0;
  const stride = Math.max(1, Math.floor(sampleEvery) || 1);

  const drain = () => {
    if (!pending.length) return;
    // A disjoint event means the timings are invalid, not merely late.
    if (gl.getParameter(extension.GPU_DISJOINT_EXT)) {
      for (const query of pending) gl.deleteQuery(query);
      pending = [];
      lastMs = null;
      return;
    }
    while (pending.length) {
      const query = pending[0];
      if (!gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)) break;
      const nanoseconds = gl.getQueryParameter(query, gl.QUERY_RESULT);
      if (Number.isFinite(nanoseconds) && nanoseconds > 0) lastMs = nanoseconds / 1e6;
      gl.deleteQuery(query);
      pending.shift();
    }
  };

  return {
    supported: true,
    sampleEvery: stride,
    get frameMs() { return lastMs; },
    begin() {
      if (disposed || active) return;
      frames += 1;
      // Never poll a pending query on ordinary frames: that is the expensive
      // synchronization point. Only look at results on a sample frame.
      if (frames % stride !== 0) return;
      drain();
      if (pending.length >= MAX_PENDING) return;
      const query = gl.createQuery();
      if (!query) return;
      try { gl.beginQuery(extension.TIME_ELAPSED_EXT, query); active = query; }
      catch { gl.deleteQuery(query); }
    },
    end() {
      if (!active) return;
      try { gl.endQuery(extension.TIME_ELAPSED_EXT); pending.push(active); }
      catch { gl.deleteQuery(active); }
      active = null;
    },
    dispose() {
      disposed = true;
      if (active) {
        try { gl.endQuery(extension.TIME_ELAPSED_EXT); } catch { /* context already lost */ }
        gl.deleteQuery(active);
        active = null;
      }
      for (const query of pending) gl.deleteQuery(query);
      pending = [];
      lastMs = null;
    },
  };
}
