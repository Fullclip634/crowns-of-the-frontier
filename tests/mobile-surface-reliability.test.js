import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MAPS } from '../src/data.js';
import { SurfaceResidency, surfaceKeys } from '../src/surface-residency.js';
import {
  surfaceRolesForMap,
  hasSurfaceAssetsForMap,
  loadSurfaceAssets,
  trimSurfaceAssets,
  retainedSurfaceTextures,
  applyGroundSurface,
} from '../src/surface-assets.js';
import { compressedSurfaceSupport } from '../src/surface-codecs.js';
import { watchRendererDevice } from '../src/render-context.js';
import { Landscape, refreshGroundSurface } from '../src/landscape.js';
import { installNodeRuntime } from '../src/render-runtime.js';
import * as renderNodes from '../src/render-nodes.js';
import { WGSLNodeBuilder } from 'three/webgpu';

test('biome-scoped surfaceRolesForMap covers every map cleanly while dropping 3-4 unused biomes', () => {
  const mapIds = Object.keys(MAPS);
  assert.ok(mapIds.length >= 14, 'covers all shipped maps');
  for (const map of mapIds) {
    const roles = surfaceRolesForMap(map);
    assert.equal(new Set(roles).size, roles.length, `${map} roles are deduplicated`);
    for (const shared of ['stone', 'wood', 'plaster', 'boulder', 'roof']) {
      assert.ok(roles.includes(shared), `${map} includes shared role ${shared}`);
    }
    assert.ok(roles.length <= 8, `${map} loads at most 8 of 11 roles (got ${roles.length})`);
  }
  assert.deepEqual(surfaceRolesForMap('highlands').sort(), ['boulder', 'grass', 'plaster', 'rock', 'roof', 'soil', 'stone', 'wood']);
  assert.ok(!surfaceRolesForMap('highlands').includes('snow'));
  assert.ok(!surfaceRolesForMap('highlands').includes('sand'));
  assert.ok(!surfaceRolesForMap('highlands').includes('volcanic'));

  assert.deepEqual(surfaceRolesForMap('winter').sort(), ['boulder', 'plaster', 'roof', 'snow', 'soil', 'stone', 'volcanic', 'wood']);
  assert.deepEqual(surfaceRolesForMap('arid').sort(), ['boulder', 'plaster', 'roof', 'sand', 'soil', 'stone', 'volcanic', 'wood']);
  assert.deepEqual(surfaceRolesForMap('coast').sort(), ['boulder', 'grass', 'plaster', 'rock', 'roof', 'sand', 'stone', 'wood']);
  assert.deepEqual(surfaceRolesForMap('volcanic').sort(), ['boulder', 'plaster', 'roof', 'soil', 'stone', 'volcanic', 'wood']);
  assert.equal(surfaceRolesForMap(null).length, 11, 'omitting map keeps backward-compatible full role set');
});

test('compressedSurfaceSupport enables KTX2 on WebGPU & WebGL2 across iOS ASTC, Android ETC2, and desktop BC7 while guarding Linux Mesa', () => {
  const prevNav = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const setNav = (platform, userAgent) => Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { platform, userAgent },
  });
  try {
    // WebGPU feature matrix (Desktop BC, iOS/Flagship ASTC, Budget Android ETC2)
    for (const feat of ['texture-compression-bc', 'texture-compression-astc', 'texture-compression-etc2']) {
      assert.equal(compressedSurfaceSupport({ isWebGPURenderer: true, hasFeature: (f) => f === feat }), true, `WebGPU ${feat}`);
    }
    assert.equal(compressedSurfaceSupport({ isWebGPURenderer: true, hasFeature: () => false }), false);

    // Budget Android WebGL2 (Linux armv8l + Android UA, ETC2-only without ASTC or BPTC)
    setNav('Linux armv8l', 'Mozilla/5.0 (Linux; Android 13; Moto G) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36');
    assert.equal(compressedSurfaceSupport({ extensions: { has: (e) => e === 'WEBGL_compressed_texture_etc' } }), true, 'Android ETC2-only uses KTX2');

    // iOS Safari WebGL2 (ASTC)
    setNav('iPhone', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1');
    assert.equal(compressedSurfaceSupport({ extensions: { has: (e) => e === 'WEBGL_compressed_texture_astc' } }), true, 'iOS ASTC uses KTX2');

    // Desktop Linux Mesa guard: ETC2-only without BPTC/ASTC must NOT hit software emulation
    setNav('Linux x86_64', 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36');
    assert.equal(compressedSurfaceSupport({ extensions: { has: (e) => e === 'WEBGL_compressed_texture_etc' } }), false, 'Desktop Linux skips emulated ETC2-only');
    assert.equal(compressedSurfaceSupport({ extensions: { has: (e) => e === 'EXT_texture_compression_bptc' } }), true, 'Desktop Linux with BPTC still uses KTX2');
  } finally {
    if (prevNav) Object.defineProperty(globalThis, 'navigator', prevNav);
    else delete globalThis.navigator;
  }
});

test('SurfaceResidency evicts GPU textures, closes ImageBitmaps, and releases KTX2 mipmap buffers', async () => {
  const cache = new SurfaceResidency();
  let closed = 0;
  let disposedImg = 0;
  let disposedKtx = 0;

  const imgTex = new THREE.Texture({ close() { closed++; } });
  imgTex.addEventListener('dispose', () => disposedImg++);
  const ktxTex = new THREE.CompressedTexture([{ data: new Uint8Array(64), width: 8, height: 8 }], 8, 8);
  ktxTex.addEventListener('dispose', () => disposedKtx++);

  await cache.load('snow:normal', () => imgTex);
  await cache.load('snow:color', () => ktxTex);
  const res = cache.trim(new Set());
  assert.equal(res.evicted, 2);
  assert.equal(disposedImg, 1);
  assert.equal(closed, 1);
  assert.equal(disposedKtx, 1);
  assert.equal(ktxTex.mipmaps.length, 0, 'evicted CompressedTexture drops CPU mipmap buffers');
});

test('biome-scoped loadSurfaceAssets & trimSurfaceAssets load only active map textures and evict previous biome on switch', async (t) => {
  const requested = [];
  t.mock.method(THREE.TextureLoader.prototype, 'loadAsync', async (url) => {
    requested.push(new URL(url).pathname.split('/').at(-1));
    return new THREE.Texture();
  });

  // Start clean
  const stubView = (map, quality = 'medium') => ({
    sim: { options: { map } },
    renderQuality: quality,
    settings: { quality },
    scene: new THREE.Scene(),
    materials: {},
  });
  trimSurfaceAssets(stubView('highlands', 'low'));

  // 1. Load highlands on medium: should NOT request snow, sand, or volcanic
  await loadSurfaceAssets('medium', null, { map: 'highlands' });
  assert.equal(hasSurfaceAssetsForMap('medium', 'highlands'), true);
  assert.equal(hasSurfaceAssetsForMap('medium', 'winter'), false);
  assert.equal(requested.some((f) => /snow_|sand_|rock_face_03/.test(f)), false, `highlands skipped unused biomes: ${requested.join(',')}`);
  const highlandsLoaded = retainedSurfaceTextures().size;
  assert.equal(highlandsLoaded, surfaceKeys('medium', surfaceRolesForMap('highlands')).size + 2);

  // 2. Switch to winter: requests ONLY missing snow + volcanic maps, then trim evicts unused grass + rock
  const beforeWinter = requested.length;
  await loadSurfaceAssets('medium', null, { map: 'winter' });
  const winterAdded = requested.slice(beforeWinter);
  assert.ok(winterAdded.some((f) => f.startsWith('snow_02_')), 'winter loads snow textures');
  assert.ok(winterAdded.some((f) => f.startsWith('rock_face_03_')), 'winter loads volcanic crag textures');
  assert.ok(!winterAdded.some((f) => f.startsWith('medieval_blocks_') || f.startsWith('old_wood_')), 'winter reuses cached shared structure textures');

  const trimmed = trimSurfaceAssets(stubView('winter', 'medium'));
  assert.equal(trimmed.evicted, 4, 'evicts unused grass (color+normal) and rock (color+normal)');
  assert.equal(hasSurfaceAssetsForMap('medium', 'winter'), true);
  assert.equal(hasSurfaceAssetsForMap('medium', 'highlands'), false);

  // 3. Clean up mock textures from global cache so later tests start fresh
  trimSurfaceAssets({ sim: { options: { map: 'volcanic' } }, renderQuality: 'low', settings: { quality: 'low' }, scene: new THREE.Scene(), materials: {} });
  const finalCache = retainedSurfaceTextures();
  assert.ok(finalCache.size <= 8);
});

test('watchRendererDevice protects WebGL 2 canvas from silent context loss without mutating renderer properties', () => {
  const canvas = new EventTarget();
  const renderer = { domElement: canvas };
  const failures = [];
  const view = {
    renderer,
    renderQuality: 'medium',
    graphicsSceneValid: true,
    onGraphicsFailure: (f) => failures.push(f),
  };
  const release = watchRendererDevice(view);
  assert.equal(typeof release, 'function');
  assert.equal(Object.hasOwn(renderer, 'onDeviceLost'), false, 'classic renderer object stays untouched');

  let prevented = false;
  const ev = Object.assign(new Event('webglcontextlost'), {
    statusMessage: 'GPU memory pressure',
    preventDefault() { prevented = true; },
  });
  canvas.dispatchEvent(ev);
  assert.equal(prevented, true, 'calls preventDefault() so mobile browsers allow clean recovery');
  assert.equal(view.graphicsSceneValid, false);
  assert.equal(view.graphicsFatal.deviceLost, true);
  assert.equal(failures.length, 1);

  // Clean detach
  release();
  assert.equal(view.releaseRendererWatch, null);
  view.graphicsFatal = null;
  canvas.dispatchEvent(new Event('webglcontextlost'));
  assert.equal(view.graphicsFatal, null, 'released listener no longer fires');
});

test('refreshGroundSurface cleanly hot-swaps terrain material on both WebGL 2 and WebGPU NodeMaterial paths', async (t) => {
  const prevDoc = globalThis.document;
  const prevImageData = globalThis.ImageData;
  const makeCtx = () => ({
    fillStyle: '', strokeStyle: '', lineWidth: 1, lineCap: 'round', lineJoin: 'round', globalAlpha: 1,
    fillRect() {}, strokeRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, fill() {},
    arc() {}, closePath() {}, drawImage() {}, save() {}, restore() {}, translate() {}, rotate() {}, scale() {},
    createRadialGradient: () => ({ addColorStop() {} }),
    createLinearGradient: () => ({ addColorStop() {} }),
    createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
    putImageData() {},
  });
  globalThis.ImageData = class ImageData { constructor(data, width, height) { this.data = data; this.width = width; this.height = height; } };
  globalThis.document = {
    createElement: () => ({ width: 0, height: 0, getContext: () => makeCtx() }),
  };
  t.mock.method(THREE.TextureLoader.prototype, 'loadAsync', async () => new THREE.Texture());
  try {
    await loadSurfaceAssets('medium', null, { map: 'winter' });
    const fogTex = new THREE.DataTexture(new Uint8Array(16), 2, 2);
    const makeView = () => {
      const land = new Landscape(512, 'winter', 160);
      const oldMat = new THREE.MeshStandardMaterial();
      const ground = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), oldMat);
      return {
        landscape: land,
        groundSurface: ground,
        fogTexture: fogTex,
        settings: { quality: 'medium' },
        battleFog: {
          mask: { value: fogTex },
          scale: { value: 1 / 160 },
          enabled: { value: 1 },
          tint: { value: new THREE.Color(0x0c131d) },
        },
        atmosphereUniforms: null,
      };
    };

    // 1. WebGL 2 hot-swap
    installNodeRuntime(null);
    const glView = makeView();
    const glOld = glView.groundSurface.material;
    let glDisposed = 0;
    glOld.addEventListener('dispose', () => glDisposed++);
    assert.equal(refreshGroundSurface(glView), true);
    assert.notEqual(glView.groundSurface.material, glOld);
    assert.equal(glDisposed, 1, 'WebGL 2 disposes replaced ground material');
    assert.ok(glView.groundSurface.material.frontierTerrainUniforms?.grass?.value, 'WebGL 2 binds snow biome textures');
    glView.groundSurface.geometry.dispose();
    glView.groundSurface.material.dispose();

    // 2. WebGPU NodeMaterial hot-swap + full WGSL shader compilation check
    installNodeRuntime(renderNodes);
    const gpuView = makeView();
    const posCount = gpuView.groundSurface.geometry.attributes.position.count;
    gpuView.groundSurface.geometry.setAttribute('terrainMix', new THREE.BufferAttribute(new Float32Array(posCount * 3), 3));
    const gpuOld = gpuView.groundSurface.material;
    let gpuDisposed = 0;
    gpuOld.addEventListener('dispose', () => gpuDisposed++);
    assert.equal(refreshGroundSurface(gpuView), true);
    assert.equal(gpuDisposed, 1, 'WebGPU disposes replaced ground material');
    const gpuMat = gpuView.groundSurface.material;
    assert.equal(gpuMat.isNodeMaterial, true, 'WebGPU builds MeshStandardNodeMaterial');
    assert.ok(gpuMat.colorNode && gpuMat.outputNode, 'WebGPU attaches terrain + battlefield fog TSL nodes');
    assert.ok(gpuMat.frontierTerrainUniforms?.grass?.value, 'WebGPU pins active snow biome texture');
    const mockRenderer = new renderNodes.WebGPURenderer({
      canvas: { width: 1280, height: 720, style: {}, addEventListener() {}, removeEventListener() {} },
    });
    mockRenderer._initialized = true;
    mockRenderer.backend.hasFeature = () => true;
    mockRenderer.backend.has = () => true;
    mockRenderer.backend.compatibilityMode = false;
    const builder = new WGSLNodeBuilder(gpuView.groundSurface, mockRenderer);
    builder.camera = new THREE.PerspectiveCamera(45, 16 / 9, 1, 200);
    builder.scene = new THREE.Scene();
    builder.build();
    assert.ok(builder.fragmentShader.includes('@fragment'), 'WebGPU WGSL terrain fragment shader compiles cleanly after hot-swap');
    gpuView.groundSurface.geometry.dispose();
    gpuMat.dispose();
    fogTex.dispose();
  } finally {
    installNodeRuntime(null);
    if (prevDoc === undefined) delete globalThis.document;
    else globalThis.document = prevDoc;
    if (prevImageData === undefined) delete globalThis.ImageData;
    else globalThis.ImageData = prevImageData;
  }
});

test('offline partial biome load still registers cached color textures after slower decode and quality races stay guarded', async (t) => {
  const prevDoc = globalThis.document;
  const prevImageData = globalThis.ImageData;
  const makeCtx = () => ({
    fillStyle: '', strokeStyle: '', lineWidth: 1, lineCap: 'round', lineJoin: 'round', globalAlpha: 1,
    fillRect() {}, strokeRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, fill() {},
    arc() {}, closePath() {}, drawImage() {}, save() {}, restore() {}, translate() {}, rotate() {}, scale() {},
    createRadialGradient: () => ({ addColorStop() {} }),
    createLinearGradient: () => ({ addColorStop() {} }),
    createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
    putImageData() {},
  });
  globalThis.ImageData = class ImageData { constructor(data, width, height) { this.data = data; this.width = width; this.height = height; } };
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => makeCtx() }) };

  let releaseColor;
  const colorReady = new Promise((resolve) => { releaseColor = resolve; });
  t.mock.method(THREE.TextureLoader.prototype, 'loadAsync', async (url) => {
    const file = new URL(url).pathname.split('/').at(-1);
    if (file.includes('_normal')) throw new Error('offline uncached normal');
    if (file.startsWith('sand_01_color')) {
      await colorReady;
    }
    const tex = new THREE.Texture();
    tex.name = file;
    return tex;
  });

  try {
    // Evict sand first so it must be freshly loaded
    trimSurfaceAssets({ sim: { options: { map: 'volcanic' } }, renderQuality: 'low', settings: { quality: 'low' }, scene: new THREE.Scene(), materials: {} });
    assert.equal(hasSurfaceAssetsForMap('low', 'arid'), false);

    // Simulate offline Medium load for 'arid': normal map rejects immediately while cached sand color finishes 10ms later.
    const loadPromise = loadSurfaceAssets('medium', null, { map: 'arid' });
    setTimeout(() => releaseColor(), 10);
    await assert.rejects(loadPromise, /offline uncached normal/);

    // Because loadSurfaceAssets awaits Promise.allSettled before throwing, cached sand_01_color IS registered!
    assert.equal(hasSurfaceAssetsForMap('low', 'arid'), true, 'cached arid color textures still register despite offline normal failure');

    // Verify applyGroundSurface binds the loaded sand color texture cleanly
    const land = new Landscape(512, 'arid', 160);
    const mat = new THREE.MeshStandardMaterial();
    applyGroundSurface(mat, land, 'medium', null);
    assert.equal(mat.frontierTerrainUniforms?.grass?.value?.name, 'sand_01_color.jpg', 'offline arid ground uses real sand albedo instead of green fallback');
    for (const tex of mat.frontierOwnedTextures || []) tex.dispose();
    mat.dispose();
  } finally {
    if (prevDoc === undefined) delete globalThis.document;
    else globalThis.document = prevDoc;
    if (prevImageData === undefined) delete globalThis.ImageData;
    else globalThis.ImageData = prevImageData;
  }
});
