import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { WGSLNodeBuilder } from 'three/webgpu';
import { detectRecommendedQuality, preferredRenderer } from '../src/graphics-compatibility.js';
import { Landscape, refreshGroundSurface } from '../src/landscape.js';
import { applyTerrainShading, roadMask } from '../src/terrain-surface.js';
import { shadeBattlefieldFog } from '../src/fog-surface.js';
import { configureWaterSurface } from '../src/water-surface.js';
import { GroundCover } from '../src/ground-cover.js';
import { renderModelPortrait } from '../src/portrait-3d.js';
import { applyRendererQuality } from '../src/render-quality.js';
import { Simulation } from '../src/simulation.js';
import { battlePreset } from '../src/custom-battle.js';
import { planPerimeterUpgrade } from '../src/ai-fortifications.js';
import { installNodeRuntime } from '../src/render-runtime.js';
import * as renderNodes from '../src/render-nodes.js';

function installCanvasStub() {
  const prevDoc = globalThis.document;
  const prevImageData = globalThis.ImageData;
  const makeCtx = () => ({
    fillStyle: '', strokeStyle: '', lineWidth: 1, lineCap: 'round', lineJoin: 'round', globalAlpha: 1,
    fillRect() {}, strokeRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, fill() {},
    arc() {}, closePath() {}, drawImage() {}, save() {}, restore() {}, translate() {}, rotate() {}, scale() {},
    createRadialGradient: () => ({ addColorStop() {} }),
    createLinearGradient: () => ({ addColorStop() {} }),
    createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
    putImageData() {},
  });
  globalThis.ImageData = class ImageData {
    constructor(data, width, height) { this.data = data; this.width = width; this.height = height; }
  };
  globalThis.document = {
    hidden: false,
    getElementById: () => null,
    createElement: () => ({ width: 0, height: 0, getContext: () => makeCtx() }),
  };
  return () => {
    if (prevDoc === undefined) delete globalThis.document;
    else globalThis.document = prevDoc;
    if (prevImageData === undefined) delete globalThis.ImageData;
    else globalThis.ImageData = prevImageData;
  };
}

function compileWgsl(mesh) {
  const mockRenderer = new renderNodes.WebGPURenderer({
    canvas: { width: 1280, height: 720, style: {}, addEventListener() {}, removeEventListener() {} },
  });
  mockRenderer._initialized = true;
  mockRenderer.backend.hasFeature = () => true;
  mockRenderer.backend.has = () => true;
  mockRenderer.backend.compatibilityMode = false;
  const builder = new WGSLNodeBuilder(mesh, mockRenderer);
  builder.camera = new THREE.PerspectiveCamera(45, 16 / 9, 1, 200);
  builder.scene = new THREE.Scene();
  builder.build();
  return builder;
}

test('detectRecommendedQuality and preferredRenderer protect iOS and budget Android phones without downgrading desktop', () => {
  // iOS Safari omits deviceMemory
  assert.equal(detectRecommendedQuality({ coarsePointer: true, hardwareConcurrency: 6 }), 'low');
  // 4 GB and 6 GB 8-core budget Androids (SD 680 / Helio G85 / Unisoc T606)
  assert.equal(detectRecommendedQuality({ coarsePointer: true, deviceMemory: 4, hardwareConcurrency: 8 }), 'low');
  assert.equal(detectRecommendedQuality({ coarsePointer: true, deviceMemory: 6, hardwareConcurrency: 8 }), 'low');
  // 8 GB flagship touch devices
  assert.equal(detectRecommendedQuality({ coarsePointer: true, deviceMemory: 8, hardwareConcurrency: 8 }), 'medium');
  assert.equal(detectRecommendedQuality({ coarsePointer: true, deviceMemory: 8, hardwareConcurrency: 4 }), 'low');
  // Desktop behavior unchanged
  assert.equal(detectRecommendedQuality({ coarsePointer: false, deviceMemory: 16, hardwareConcurrency: 8 }), 'high');
  assert.equal(detectRecommendedQuality({ coarsePointer: false, hardwareConcurrency: 8 }), 'high');
  assert.equal(detectRecommendedQuality({ coarsePointer: false, deviceMemory: 4, hardwareConcurrency: 8 }), 'low');

  const href = 'https://crowns.example/';
  assert.equal(preferredRenderer(href, null), 'webgpu');
  assert.equal(preferredRenderer(href, null, { mobile: false }), 'webgpu');
  assert.equal(preferredRenderer(href, null, { mobile: true }), 'webgl');
  assert.equal(preferredRenderer(href + '?renderer=webgpu', null, { mobile: true }), 'webgpu');
});

test('Low terrain reduces texture taps on both WebGL 2 and WebGPU (WGSL) and shrinks ground/road canvas VRAM', () => {
  const restore = installCanvasStub();
  const tex = () => new THREE.Texture();
  const surfaces = {
    grass: { color: tex(), normal: tex(), arm: tex() },
    soil: { color: tex(), normal: tex(), arm: tex() },
    rock: { color: tex(), normal: tex(), arm: tex() },
    paving: { color: tex() },
  };
  const fogTex = new THREE.DataTexture(new Uint8Array(16), 2, 2);
  try {
    const land = new Landscape(512, 'highlands', 240);
    const lowMask = roadMask(land, 'low');
    const highMask = roadMask(land, 'high');
    assert.equal(lowMask.image.width, 512);
    assert.equal(highMask.image.width, 768);
    lowMask.dispose();
    highMask.dispose();

    // WebGL 2: Low compiles single-tap grass/soil/rock/paving and omits cloud shadow tap
    installNodeRuntime(null);
    const glLow = new THREE.MeshStandardMaterial();
    const glMed = new THREE.MeshStandardMaterial();
    applyTerrainShading(glLow, land, 'low', surfaces, { grass: 2, soil: 1.5, rock: 65, paving: 2 });
    applyTerrainShading(glMed, land, 'medium', surfaces, { grass: 2, soil: 1.5, rock: 65, paving: 2 });
    const sLow = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
    const sMed = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
    glLow.onBeforeCompile(sLow);
    glMed.onBeforeCompile(sMed);
    const countTerrainTaps = shader => (shader.fragmentShader.match(/(?:texture2D|textureGrad)\(frontierTerrain(?:grass|soil|rock|paving|roads)\b/g) || []).length;
    const lowTaps = countTerrainTaps(sLow);
    const medTaps = countTerrainTaps(sMed);
    assert.equal(lowTaps, 5, 'WebGL 2 Low terrain uses 1 tap each for roads/grass/soil/rock/paving');
    assert.ok(medTaps >= 11, `WebGL 2 Medium terrain keeps full multi-tap/triplanar detail (got ${medTaps})`);
    assert.equal(sLow.fragmentShader.includes('rainDarken * frontierCloudLight('), false, 'WebGL 2 Low skips cloud shadow tap');
    assert.equal(sMed.fragmentShader.includes('rainDarken * frontierCloudLight('), true, 'WebGL 2 Medium preserves cloud shadows');
    for (const mat of [glLow, glMed]) {
      for (const t of mat.frontierOwnedTextures || []) t.dispose();
      mat.dispose();
    }

    // Ground canvas VRAM size: 768x768 (anisotropy 1) on Low vs 1536x1536 (anisotropy 8) on High
    const makeGroundView = (quality) => {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.MeshStandardMaterial());
      return {
        landscape: land,
        groundSurface: mesh,
        fogTexture: fogTex,
        settings: { quality },
        battleFog: {
          mask: { value: fogTex },
          scale: { value: 1 / land.worldSize },
          enabled: { value: 1 },
          blur: { value: quality === 'low' ? 0 : 1 },
          tint: { value: new THREE.Color(0x0c131d) },
        },
        atmosphereUniforms: null,
      };
    };
    const lowGroundView = makeGroundView('low');
    const highGroundView = makeGroundView('high');
    refreshGroundSurface(lowGroundView);
    refreshGroundSurface(highGroundView);
    assert.equal(lowGroundView.groundSurface.material.map.image.width, 768);
    assert.equal(lowGroundView.groundSurface.material.map.anisotropy, 1);
    assert.equal(highGroundView.groundSurface.material.map.image.width, 1536);
    assert.equal(highGroundView.groundSurface.material.map.anisotropy, 8);
    for (const gv of [lowGroundView, highGroundView]) {
      gv.groundSurface.geometry.dispose();
      gv.groundSurface.material.map?.dispose();
      gv.groundSurface.material.bumpMap?.dispose();
      for (const t of gv.groundSurface.material.frontierOwnedTextures || []) t.dispose();
      gv.groundSurface.material.dispose();
    }

    // WebGPU (WGSLNodeBuilder): Low terrain + battlefieldFog compiles cleanly with strictly fewer textureSample calls
    installNodeRuntime(renderNodes);
    const buildWebGpuTerrain = (quality) => {
      const geo = new THREE.PlaneGeometry(10, 10);
      geo.setAttribute('terrainMix', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 3), 3));
      const mat = new renderNodes.MeshStandardNodeMaterial();
      applyTerrainShading(mat, land, quality, surfaces, { grass: 2, soil: 1.5, rock: 65, paving: 2 });
      shadeBattlefieldFog(mat, {
        battleFog: {
          mask: { value: fogTex },
          scale: { value: 1 / land.worldSize },
          enabled: { value: 1 },
          blur: { value: quality === 'low' ? 0 : 1 },
          tint: { value: new THREE.Color(0x0c131d) },
        },
      });
      const mesh = new THREE.Mesh(geo, mat);
      const builder = compileWgsl(mesh);
      const wgsl = builder.fragmentShader;
      geo.dispose();
      for (const t of mat.frontierOwnedTextures || []) t.dispose();
      mat.dispose();
      return wgsl;
    };
    const wgslLow = buildWebGpuTerrain('low');
    const wgslMed = buildWebGpuTerrain('medium');
    assert.ok(wgslLow.includes('@fragment'), 'WebGPU Low terrain WGSL compiles cleanly');
    assert.ok(wgslMed.includes('@fragment'), 'WebGPU Medium terrain WGSL compiles cleanly');
    const wgslLowSamples = (wgslLow.match(/textureSample\(/g) || []).length;
    const wgslMedSamples = (wgslMed.match(/textureSample\(/g) || []).length;
    assert.ok(wgslLowSamples < wgslMedSamples - 6, `WebGPU Low terrain emits far fewer textureSample calls (${wgslLowSamples} vs ${wgslMedSamples})`);
  } finally {
    installNodeRuntime(null);
    restore();
    fogTex.dispose();
    for (const set of Object.values(surfaces)) for (const t of Object.values(set)) t.dispose();
  }
});

test('Water removes alphaTest Early-Z blocker and compiles cleanly on both WebGL 2 and WebGPU; fog blur toggles cleanly', () => {
  const fogTex = new THREE.DataTexture(new Uint8Array(16), 2, 2);
  try {
    // WebGL 2 water & fog blur gate
    installNodeRuntime(null);
    const glWater = new THREE.MeshStandardMaterial({ color: 0x6a9fa6, transparent: true, opacity: .9 });
    configureWaterSurface(glWater);
    assert.equal(glWater.alphaTest, 0, 'WebGL 2 water keeps alphaTest at 0 for Early-Z / HSR on mobile GPUs');
    const ws = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
    glWater.onBeforeCompile(ws);
    assert.match(ws.fragmentShader, /if \(frontierWaterDetail > 0\.5\)/, 'WebGL 2 water gates multi-octave streaks behind frontierWaterDetail');
    glWater.dispose();

    const glFogMat = new THREE.MeshStandardMaterial();
    const blur = { value: 0 };
    shadeBattlefieldFog(glFogMat, {
      battleFog: { mask: { value: fogTex }, scale: { value: 1 / 160 }, enabled: { value: 1 }, blur, tint: { value: new THREE.Color(0x0c131d) } },
    });
    const fs = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
    glFogMat.onBeforeCompile(fs);
    assert.equal(fs.uniforms.frontierFogBlur, blur);
    assert.match(fs.fragmentShader, /if \(frontierFogBlur > 0\.5\)/, 'WebGL 2 fog skips 4 blur taps when blur uniform is 0');
    glFogMat.dispose();

    // WebGPU water + fog WGSL compilation
    installNodeRuntime(renderNodes);
    const gpuWater = new renderNodes.MeshStandardNodeMaterial({ color: 0x6a9fa6, transparent: true, opacity: .9 });
    configureWaterSurface(gpuWater);
    assert.equal(gpuWater.alphaTest, 0, 'WebGPU water keeps alphaTest at 0 for Early-Z / HSR');
    shadeBattlefieldFog(gpuWater, {
      battleFog: { mask: { value: fogTex }, scale: { value: 1 / 160 }, enabled: { value: 1 }, blur: { value: 0 }, tint: { value: new THREE.Color(0x0c131d) } },
    });
    const land = new Landscape(512, 'riverland');
    const waterGeo = land.waterGeometry(land.channels()[0], 'low');
    const waterMesh = new THREE.Mesh(waterGeo, gpuWater);
    const builder = compileWgsl(waterMesh);
    assert.ok(builder.fragmentShader.includes('@fragment'), 'WebGPU water + fog WGSL compiles cleanly');
    waterGeo.dispose();
    gpuWater.dispose();
  } finally {
    installNodeRuntime(null);
    fogTex.dispose();
  }
});

test('Low quality trims GroundCover, disables 2nd portrait WebGL context, and syncs applyRendererQuality flags', () => {
  const land = new Landscape(512, 'highlands', 240);
  const makeCover = (quality) => new GroundCover({
    landscape: land,
    terrain: new THREE.Group(),
    settings: { quality, fog: false },
    sim: { entities: [], isExplored: () => true },
    clock: 0,
    target: new THREE.Vector3(),
    zoom: 40,
    angle: 0,
    tilt: .7,
  });
  const lowCover = makeCover('low');
  const medCover = makeCover('medium');
  assert.ok(lowCover.entries.length > 500 && lowCover.entries.length <= 720, `Low vast grass count capped to <= 720 (got ${lowCover.entries.length})`);
  assert.ok(medCover.entries.length > 1000 && medCover.entries.length <= 1800, `Medium vast grass stays lush (got ${medCover.entries.length})`);
  lowCover.dispose();
  medCover.dispose();

  // renderModelPortrait exits immediately on Low without touching DOM or creating a 2nd renderer
  let queried = false;
  const prevDoc = globalThis.document;
  globalThis.document = {
    hidden: false,
    getElementById() { queried = true; return null; },
  };
  try {
    const lowView = { renderQuality: 'low', settings: { quality: 'low' }, sim: { get: () => ({ id: 1 }) } };
    renderModelPortrait(lowView);
    assert.equal(queried, false, 'Low quality skips 3D portrait lookup and 2nd WebGL context');
    assert.equal(lowView.modelPortrait, undefined);
  } finally {
    if (prevDoc === undefined) delete globalThis.document;
    else globalThis.document = prevDoc;
  }

  // applyRendererQuality syncs disableFootPlacement, battleFog.blur, and disposes modelPortrait on downgrade to Low
  let portraitDisposed = 0;
  const view = {
    renderer: { shadowMap: { enabled: true, needsUpdate: false }, setPixelRatio() {} },
    sun: { shadow: { radius: 2, mapSize: new THREE.Vector2(1024, 1024), map: null } },
    battleFog: { blur: { value: 1 } },
    disableFootPlacement: false,
    modelPortrait: { dispose() { portraitDisposed++; } },
    settings: { quality: 'low' },
  };
  applyRendererQuality(view, 'low');
  assert.equal(view.disableFootPlacement, true);
  assert.equal(view.battleFog.blur.value, 0);
  assert.equal(portraitDisposed, 1);
  assert.equal(view.modelPortrait, null);

  applyRendererQuality(view, 'medium');
  assert.equal(view.disableFootPlacement, false);
  assert.equal(view.battleFog.blur.value, 1);
});

test('CPU simulation optimizations: nonWood shortlist, staggered AI ticks, and fast incremental fortification planning', () => {
  const sim = new Simulation({ mode: 'custom', map: 'highlands', mapSize: 'vast', seed: 2026, slots: battlePreset('2v2') });
  const nonWood = sim.candidatesFor('nonWood');
  assert.ok(nonWood.length > 0 && nonWood.length < sim.entities.length);
  assert.equal(nonWood.some((e) => e.kind === 'resource' && e.type === 'wood'), false, 'nonWood shortlist omits wood trees');
  const woodCount = sim.entities.filter((e) => e.kind === 'resource' && e.type === 'wood').length;
  assert.equal(nonWood.length + woodCount, sim.entities.length, 'nonWood + wood equals full entity list');

  // tickCustomAI runs at most 1 overdue AI commander per tick, picking the most overdue first
  sim.players[1].aiClock = 5.0;
  sim.players[2].aiClock = 6.2;
  sim.players[3].aiClock = 4.5;
  sim.tickCustomAI(0.1);
  assert.ok(sim.players[2].aiClock < 4.0, 'most overdue AI (slot 2) ran on tick 1');
  assert.ok(sim.players[1].aiClock >= 5.0, 'slot 1 waited for next tick');
  assert.ok(sim.players[3].aiClock >= 4.5, 'slot 3 waited for a later tick');

  sim.tickCustomAI(0.1);
  assert.ok(sim.players[1].aiClock < 4.0, 'second most overdue AI (slot 1) ran on tick 2');
  assert.ok(sim.players[3].aiClock >= 4.5, 'slot 3 still staggered to tick 3');

  sim.tickCustomAI(0.1);
  assert.ok(sim.players[3].aiClock < 4.0, 'third overdue AI (slot 3) ran on tick 3');

  // Fortification planner runs cleanly with incremental grid stamping and completes swiftly
  sim.players[1].age = 1;
  sim.players[1].resources.wood = 2000;
  sim.players[1].resources.stone = 2000;
  const start = performance.now();
  const plan = planPerimeterUpgrade(sim, 1);
  const elapsed = performance.now() - start;
  assert.ok(plan === null || typeof plan.type === 'string', 'planPerimeterUpgrade returns valid plan or null');
  assert.ok(elapsed < 40, `incremental fortification planner finished rapidly (${elapsed.toFixed(2)}ms)`);
});
