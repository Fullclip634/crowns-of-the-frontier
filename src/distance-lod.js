// Screen-space level of detail for instanced scene objects. Distance alone is
// the wrong signal for an RTS camera: a high overhead view makes every unit
// "far" even when it still occupies a readable number of pixels. Projected
// height keeps the decision tied to what the player can actually see.

export function screenHeightFor(distance, worldHeight, viewportHeight, fovDegrees = 46) {
  const projection = viewportHeight / (2 * Math.tan(fovDegrees * Math.PI / 360));
  return worldHeight * projection / Math.max(1, distance);
}

// Hysteresis: while an object is on the detailed mesh, the threshold drops to
// `hysteresis * threshold`, so a small camera wobble cannot flip it back and
// forth. `previous` is the object's own last decision, keyed by entity id by
// the caller, so a settings change at a fixed camera does not reshuffle LODs.
export function selectDetail(screenHeight, previous, {threshold = 26, hysteresis = 0.8, enabled = true} = {}) {
  if (!enabled) return {detail: 'near', screenHeight};
  const wasNear = previous?.detail !== 'far';
  const near = screenHeight >= threshold * (wasNear ? hysteresis : 1);
  return {detail: near ? 'near' : 'far', screenHeight};
}

// Approximate silhouette heights for the batched unit roster. Only used to
// scale projected size; exact bounds would cost a per-frame geometry query.
export function unitScreenHeight(type) {
  if (type === 'catapult' || type === 'ram' || type === 'warship' || type === 'galley' || type === 'transport') return 5;
  if (type === 'knight' || type === 'scout' || type === 'outrider') return 4;
  return 3;
}

export function lodDecision({distance, worldHeight = 3, viewportHeight = 720, fovDegrees = 46, previous, threshold, hysteresis, enabled} = {}) {
  const screenHeight = screenHeightFor(distance, worldHeight, viewportHeight, fovDegrees);
  return selectDetail(screenHeight, previous, {threshold, hysteresis, enabled});
}

// Forests dominate the triangle budget (a near canopy is ~4.7k triangles).
// Raising the screen-space swap threshold under GPU pressure sends more trees
// to the decimated canopy without changing the art on a healthy GPU.
export function treeDetailThreshold(gpuFrameMs, budgetMs, {base = 34, maximum = 68} = {}) {
  if (!Number.isFinite(gpuFrameMs) || gpuFrameMs <= 0) return base;
  const ratio = gpuFrameMs / Math.max(0.001, budgetMs);
  if (ratio < 1.15) return base;
  return Math.min(maximum, base * Math.min(2, ratio / 1.15));
}

// Periodic work (fog texture, shadow map) should back off when the GPU is the
// bottleneck, but never stop entirely. Returns an integer frame stride.
export function periodicStride(gpuFrameMs, budgetMs, {base = 1, maximum = 4} = {}) {
  if (!Number.isFinite(gpuFrameMs) || gpuFrameMs <= 0) return base;
  const ratio = gpuFrameMs / Math.max(0.001, budgetMs);
  if (ratio < 1.15) return base;
  return Math.min(maximum, Math.max(base, Math.ceil(base * ratio / 1.15)));
}
