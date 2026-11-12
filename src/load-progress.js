// The first visit downloads several megabytes of GLB and texture data. A
// single "Preparing your kingdom…" line gave no indication of progress or
// whether the download was still alive. Asset loaders report byte counts here;
// the boot screen aggregates them into one determinate bar.

const streams = new Map();
const listeners = new Set();

export function onAssetProgress(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function resetAssetProgress() {
  streams.clear();
}

export function reportAssetProgress(id, {loaded = 0, total = 0, label = ''} = {}) {
  const safeLoaded = Number.isFinite(loaded) ? Math.max(0, loaded) : 0;
  const safeTotal = Number.isFinite(total) ? Math.max(0, total) : 0;
  streams.set(id, {loaded: safeLoaded, total: Math.max(safeTotal, safeLoaded), label});
  let sumLoaded = 0, sumTotal = 0;
  for (const entry of streams.values()) { sumLoaded += entry.loaded; sumTotal += entry.total; }
  const snapshot = {
    loaded: sumLoaded,
    total: sumTotal,
    percent: sumTotal ? Math.min(100, Math.round(100 * sumLoaded / sumTotal)) : null,
    label,
  };
  for (const listener of listeners) {
    try { listener(snapshot); } catch { /* a broken UI must never break loading */ }
  }
  return snapshot;
}

// Streams a fetch response so the bar moves during a large download instead of
// jumping at the end. Falls back to arrayBuffer() for mock responses and
// browsers without ReadableStream support.
export async function readAssetResponse(response, id, label) {
  if (!response.body?.getReader) return response.arrayBuffer();
  const declared = Number(response.headers?.get?.('content-length')) || 0;
  const reader = response.body.getReader();
  const chunks = [];
  let loaded = 0;
  reportAssetProgress(id, {loaded: 0, total: declared, label});
  for (;;) {
    const {done, value} = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.byteLength;
    reportAssetProgress(id, {loaded, total: Math.max(declared, loaded), label});
  }
  const bytes = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  reportAssetProgress(id, {loaded, total: Math.max(declared, loaded), label});
  return bytes.buffer;
}
