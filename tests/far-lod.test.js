import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {readGlbJson, catalogueStats, compareCatalogues} from '../scripts/blender/build-lod.mjs';
import {registerAuthoredAssets, clearAuthoredAssets, detailForQuality} from '../src/authored-assets.js';
import {precacheFiles} from '../scripts/offline-assets.js';

const asset = name => new URL(`../src/assets3d/${name}`, import.meta.url);
const read = name => fs.readFileSync(asset(name));

test('the generated far LOD is smaller, decimated and keeps every asset key', () => {
  const report = JSON.parse(read('lod.json'));
  const source = read('frontier-low.glb');
  const lod = read('frontier-far.glb');
  const comparison = compareCatalogues(readGlbJson(source), readGlbJson(lod));

  assert.equal(comparison.ok, true, comparison.failures.join(', '));
  assert.equal(comparison.keys, 126);
  assert.ok(comparison.reduction >= 0.3, `expected >=30% triangle reduction, got ${(comparison.reduction * 100).toFixed(1)}%`);
  assert.ok(lod.length < source.length * 0.6, 'far catalogue must also cut download size');

  // The manifest must describe the files on disk, not a stale build.
  assert.equal(report.sourceSHA256, createHash('sha256').update(source).digest('hex'));
  assert.equal(report.lodSHA256, createHash('sha256').update(lod).digest('hex'));
  assert.equal(report.triangles.source, comparison.before);
  assert.equal(report.triangles.lod, comparison.after);
  assert.equal(report.assetKeys, 126);
});

test('the far catalogue actually loads through GLTFLoader and registers all 126 models', async () => {
  const bytes = read('frontier-far.glb');
  const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
    .parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  const catalogue = registerAuthoredAssets(gltf, 'far', bytes.length, false);
  assert.equal(catalogue.templates.size, 126);
  assert.equal(catalogue.detail, 'far');
  assert.ok(catalogue.geometries.size > 0);
  for (const key of ['unit:archer', 'building:towncenter:alder:0', 'resource:food:0']) {
    assert.ok(catalogue.templates.has(key), key);
  }
  clearAuthoredAssets();
});

test('detail selection only uses the far catalogue when explicitly requested', () => {
  assert.equal(detailForQuality('high'), 'high');
  assert.equal(detailForQuality('medium'), 'medium');
  assert.equal(detailForQuality('low'), 'low');
  assert.equal(detailForQuality('high', {distant: true}), 'far');
  assert.equal(detailForQuality('low', {distant: false}), 'low');
});

test('the distant catalogues stay out of the offline precache', () => {
  const files = ['/', '/index.html', '/assets/frontier-far-abc.glb', '/assets/frontier-near-abc.glb', '/assets/index-abc.js'];
  const precached = precacheFiles(files);
  assert.ok(!precached.includes('/assets/frontier-far-abc.glb'));
  assert.ok(!precached.includes('/assets/frontier-near-abc.glb'));
  assert.ok(precached.includes('/assets/index-abc.js'));
});

test('LOD validation rejects lost asset keys and a simplification that changes nothing', () => {
  const source = {nodes: [{extras: {assetKey: 'unit:archer'}}, {extras: {assetKey: 'building:house'}}],
    meshes: [{primitives: [{indices: 0}]}], accessors: [{count: 3000}]};
  const lost = {nodes: [{extras: {assetKey: 'unit:archer'}}],
    meshes: [{primitives: [{indices: 0}]}], accessors: [{count: 1500}]};
  const rejected = compareCatalogues(source, lost);
  assert.equal(rejected.ok, false);
  assert.ok(rejected.failures.includes('lost-asset-key:building:house'));

  const unchanged = compareCatalogues(source, {...source});
  assert.equal(unchanged.ok, false);
  assert.ok(unchanged.failures.some(f => f.startsWith('insufficient-triangle-reduction')));

  assert.equal(catalogueStats(source).triangles, 1000);
});
