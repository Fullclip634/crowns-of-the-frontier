/**
 * Rebuild optimized resources (food, gold, stone), meadow conifers (highlands:near),
 * and un-beveled 3D roof _SlateTiles from the editable Blender source, compose them
 * surgically into src/assets3d (preserving every unrelated model and building body
 * byte-exact), GC-repack losslessly with precision verification, and rebuild
 * balanced, shared-trees, and far-LOD catalogues.
 */
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { setPriority, constants as osConstants } from 'node:os';
import { readGlb, writeGlb } from './glb-catalogue.mjs';
import { composeQualityCatalogue } from './quality-catalogue.mjs';
import { modelFingerprint } from './model-patch.mjs';
import { validateMeshPrecision } from './validate-mesh-precision.mjs';
import { sharedTreeKeys } from './build-shared-trees.mjs';

const project = fileURLToPath(new URL('../../', import.meta.url));
const assets = path.join(project, 'src', 'assets3d');
const source = path.join(project, '.tools', 'art-refined', 'frontier-assets.blend');
const stage = path.join(project, '.tools', 'art-candidate', 'optimized-details');
const blender = process.env.BLENDER_BIN || path.join(project, '.tools', 'blender-4.5.14-windows-x64', 'blender.exe');
const gltfpack = process.env.GLTFPACK_BIN || path.join(project, '.tools', 'gltfpack', 'gltfpack.exe');

await fs.mkdir(stage, { recursive: true });

function run(command, argv, logPath) {
  return new Promise((resolve, reject) => {
    const fd = fsSync.openSync(logPath, 'w');
    const child = spawn(command, argv, { cwd: project, windowsHide: true, stdio: ['ignore', fd, fd] });
    try { setPriority(child.pid, osConstants.priority.PRIORITY_LOW); } catch {}
    child.on('error', (err) => { fsSync.closeSync(fd); reject(err); });
    child.on('exit', (code) => {
      fsSync.closeSync(fd);
      if (code === 0) resolve();
      else reject(new Error(`${path.basename(command)} failed (${code}); see ${logPath}`));
    });
  });
}

function isSlateTileNode(node) {
  return Boolean(node?.name?.endsWith('_SlateTiles'));
}

function bodyWithoutSlateFingerprint(bytes, key) {
  const { json, bin } = readGlb(bytes);
  const root = json.nodes.find((n) => n.extras?.assetKey === key);
  assert.ok(root, `Missing root ${key}`);
  root.children = (root.children || []).filter((id) => !isSlateTileNode(json.nodes[id]));
  return modelFingerprint(writeGlb(json, bin), key);
}

function replaceSlateTiles(baseBytes, patchBytes) {
  const original = readGlb(baseBytes);
  const replacement = readGlb(patchBytes);
  const allKeys = original.json.nodes.filter((n) => n.extras?.assetKey).map((n) => n.extras.assetKey);
  const patchKeys = replacement.json.nodes.filter((n) => n.extras?.assetKey).map((n) => n.extras.assetKey);
  const otherKeys = allKeys.filter((k) => !patchKeys.includes(k));
  assert.equal(allKeys.length, 126);
  assert.ok(patchKeys.length >= 30);

  for (const key of patchKeys) {
    const origRoot = original.json.nodes.find((n) => n.extras?.assetKey === key);
    const patchRoot = replacement.json.nodes.find((n) => n.extras?.assetKey === key);
    assert.ok(origRoot && patchRoot, `Missing slate root for ${key}`);
    for (const field of ['matrix', 'translation', 'rotation', 'scale']) {
      assert.deepEqual(origRoot[field], patchRoot[field], `Transform drift on ${key}`);
    }
    const origTiles = (origRoot.children || []).filter((id) => isSlateTileNode(original.json.nodes[id]));
    const newTiles = (patchRoot.children || []).filter((id) => isSlateTileNode(replacement.json.nodes[id]));
    assert.equal(origTiles.length, 1, `Expected 1 original _SlateTiles on ${key}`);
    assert.equal(newTiles.length, 1, `Expected 1 replacement _SlateTiles on ${key}`);
    assert.equal(replacement.json.nodes[newTiles[0]].name, original.json.nodes[origTiles[0]].name);

    origRoot.children = origRoot.children.filter((id) => !isSlateTileNode(original.json.nodes[id]));
    patchRoot.children = newTiles;
    origRoot.extras.assetKey = 'slate-body:' + key;
    patchRoot.extras.assetKey = 'slate-tiles:' + key;
  }

  const combined = composeQualityCatalogue([
    { bytes: writeGlb(original.json, original.bin), keys: allKeys.map((k) => (patchKeys.includes(k) ? 'slate-body:' + k : k)) },
    { bytes: writeGlb(replacement.json, replacement.bin), keys: patchKeys.map((k) => 'slate-tiles:' + k) },
  ]);
  const result = readGlb(combined);

  for (const key of patchKeys) {
    const body = result.json.nodes.find((n) => n.extras?.assetKey === 'slate-body:' + key);
    const tiles = result.json.nodes.find((n) => n.extras?.assetKey === 'slate-tiles:' + key);
    const tilesRootIdx = result.json.nodes.indexOf(tiles);
    body.extras.assetKey = key;
    body.children.push(...tiles.children);
    result.json.scenes[0].nodes = result.json.scenes[0].nodes.filter((idx) => idx !== tilesRootIdx);
    delete tiles.extras.assetKey;
    tiles.children = [];
  }

  const bytes = writeGlb(result.json, result.bin);
  assert.equal(result.json.nodes.filter((n) => n.extras?.assetKey).length, 126);
  for (const key of otherKeys) {
    assert.equal(modelFingerprint(bytes, key), modelFingerprint(baseBytes, key), `Unrelated model mutated: ${key}`);
  }
  for (const key of patchKeys) {
    assert.equal(bodyWithoutSlateFingerprint(bytes, key), bodyWithoutSlateFingerprint(baseBytes, key), `Building body mutated: ${key}`);
  }
  return { bytes, patchedBuildings: patchKeys.length, unchangedModels: otherKeys.length };
}

const reuseRaw = process.argv.includes('--reuse-raw');

// 1. Export optimized resources (food, gold, stone)
const resRaw = path.join(stage, 'resources-raw');
await fs.mkdir(resRaw, { recursive: true });
if (!reuseRaw) {
  console.log('1/4 Refining resources (food, gold, stone) in Blender...');
  await run(blender, ['--background', '--threads', '1', '--python-exit-code', '1', '--python', 'scripts/blender/refine-catalogue.py', '--', '--blend', source, '--prefix', 'resource:', '--output', resRaw], path.join(stage, 'resources-refine.log'));
}
const resReport = JSON.parse(await fs.readFile(path.join(resRaw, 'report.json'), 'utf8'));
const resKeys = resReport.keys.filter((k) => /^resource:(food|gold|stone):/.test(k));
assert.equal(resKeys.length, 12, `Expected 12 food/gold/stone resources, found ${resKeys.length}`);

// 2. Export optimized meadow conifers (highlands:0..3:near only; far stays untouched)
const treeRaw = path.join(stage, 'meadow-raw');
await fs.mkdir(treeRaw, { recursive: true });
if (!reuseRaw) {
  console.log('2/4 Refining meadow conifers (tree:highlands:*:near) in Blender...');
  await run(blender, ['--background', '--threads', '1', '--python-exit-code', '1', '--python', 'scripts/blender/refine-catalogue.py', '--', '--blend', source, '--prefix', 'tree:highlands:', '--output', treeRaw], path.join(stage, 'meadow-refine.log'));
}
const meadowNearKeys = sharedTreeKeys.filter((k) => k.startsWith('tree:highlands:') && k.endsWith(':near')).sort();
assert.equal(meadowNearKeys.length, 4);

// 3. Export un-beveled 3D roof _SlateTiles from editable .blend
const slateRaw = path.join(stage, 'slate-raw');
await fs.mkdir(slateRaw, { recursive: true });
if (!reuseRaw) {
  console.log('3/4 Exporting clean un-beveled 3D roof _SlateTiles from editable .blend...');
  await run(blender, ['--background', '--threads', '1', '--python-exit-code', '1', '--python', 'scripts/blender/export-slate-tiles.py', '--', '--source', source, '--output', slateRaw], path.join(stage, 'slate-export.log'));
}
const slateReport = JSON.parse(await fs.readFile(path.join(slateRaw, 'slate-report.json'), 'utf8'));
assert.ok(slateReport.passed && slateReport.models >= 30);

// Lossless meshopt pack on exported patches
const packArgs = ['-cc', '-kn', '-km', '-ke', '-kv', '-vpf', '-vtf', '-vn', '16', '-vc', '8'];
const packedResLow = path.join(stage, 'resources-low-packed.glb');
const packedResNear = path.join(stage, 'resources-near-packed.glb');
const packedMeadowNear = path.join(stage, 'meadow-near-packed.glb');
const packedSlate = path.join(stage, 'slate-tiles-packed.glb');
await run(gltfpack, ['-i', path.join(resRaw, 'frontier-low.glb'), '-o', packedResLow, ...packArgs], path.join(stage, 'pack-res-low.log'));
await run(gltfpack, ['-i', path.join(resRaw, 'frontier-near.glb'), '-o', packedResNear, ...packArgs], path.join(stage, 'pack-res-near.log'));
await run(gltfpack, ['-i', path.join(treeRaw, 'frontier-near.glb'), '-o', packedMeadowNear, ...packArgs], path.join(stage, 'pack-meadow.log'));
await run(gltfpack, ['-i', path.join(slateRaw, 'slate-tiles.glb'), '-o', packedSlate, ...packArgs], path.join(stage, 'pack-slate.log'));

// 4. Compose into frontier-low.glb and frontier-near.glb + GC repack + precision validation
console.log('4/4 Composing patches into frontier-low.glb & frontier-near.glb and validating mesh precision...');
const manifestPath = path.join(assets, 'catalogue.json');
const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
assert.equal(manifest.completeCatalogue, true);

// Low tier: replace 12 resource models + GC repack
const baseLow = await fs.readFile(path.join(assets, 'frontier-low.glb'));
const lowAllKeys = readGlb(baseLow).json.nodes.flatMap((n) => (n.extras?.assetKey ? [n.extras.assetKey] : []));
const lowOtherKeys = lowAllKeys.filter((k) => !resKeys.includes(k));
const lowComposed = composeQualityCatalogue([
  { bytes: baseLow, keys: lowOtherKeys },
  { bytes: await fs.readFile(packedResLow), keys: resKeys },
]);
for (const key of lowOtherKeys) {
  assert.equal(modelFingerprint(lowComposed, key), modelFingerprint(baseLow, key), `Low unrelated model mutated: ${key}`);
}
const lowComposedPath = path.join(stage, 'frontier-low-composed.glb');
const lowGcPath = path.join(stage, 'frontier-low-gc.glb');
await fs.writeFile(lowComposedPath, lowComposed);
await run(gltfpack, ['-i', lowComposedPath, '-o', lowGcPath, ...packArgs], path.join(stage, 'gc-low.log'));
const finalLow = await fs.readFile(lowGcPath);
await validateMeshPrecision(lowComposed, finalLow);

// Near tier: replace 12 resources + 4 highlands:near conifers + surgical 32 _SlateTiles + GC repack
const baseNear = await fs.readFile(path.join(assets, 'frontier-near.glb'));
const nearAllKeys = readGlb(baseNear).json.nodes.flatMap((n) => (n.extras?.assetKey ? [n.extras.assetKey] : []));
const replacedFullNear = new Set([...resKeys, ...meadowNearKeys]);
const nearOtherKeys = nearAllKeys.filter((k) => !replacedFullNear.has(k));
const nearStep1 = composeQualityCatalogue([
  { bytes: baseNear, keys: nearOtherKeys },
  { bytes: await fs.readFile(packedResNear), keys: resKeys },
  { bytes: await fs.readFile(packedMeadowNear), keys: meadowNearKeys },
]);
for (const key of nearOtherKeys) {
  assert.equal(modelFingerprint(nearStep1, key), modelFingerprint(baseNear, key), `Near unrelated model mutated: ${key}`);
}
const slateResult = replaceSlateTiles(nearStep1, await fs.readFile(packedSlate));
const nearComposedPath = path.join(stage, 'frontier-near-composed.glb');
const nearRefPath = path.join(stage, 'frontier-near-ref.glb');
const nearGcPath = path.join(stage, 'frontier-near-gc.glb');
await fs.writeFile(nearComposedPath, slateResult.bytes);
await run(gltfpack, ['-i', nearComposedPath, '-o', nearRefPath, '-cc', '-kn', '-km', '-ke', '-kv', '-noq'], path.join(stage, 'ref-near.log'));
await run(gltfpack, ['-i', nearComposedPath, '-o', nearGcPath, ...packArgs], path.join(stage, 'gc-near.log'));
const refNear = await fs.readFile(nearRefPath);
const finalNear = await fs.readFile(nearGcPath);
await validateMeshPrecision(refNear, finalNear);
await validateMeshPrecision(slateResult.bytes, finalNear, { normalLimit: 1 });

// Write final near & low GLBs and update catalogue.json sizes
await fs.writeFile(path.join(assets, 'frontier-low.glb'), finalLow);
await fs.writeFile(path.join(assets, 'frontier-near.glb'), finalNear);
manifest.sizes.low = finalLow.length;
manifest.sizes.near = finalNear.length;
await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

// Rebuild derived balanced, shared trees, and far-LOD catalogues
console.log('Rebuilding frontier-balanced.glb, frontier-trees.glb, and frontier-far.glb...');
await run(process.execPath, ['scripts/blender/build-balanced.mjs', '--directory', 'src/assets3d'], path.join(stage, 'build-balanced.log'));
await run(process.execPath, ['scripts/blender/build-lod.mjs'], path.join(stage, 'build-lod.log'));

console.log(JSON.stringify({
  passed: true,
  resourcesPatched: resKeys.length,
  meadowNearPatched: meadowNearKeys.length,
  slateTileRoofsPatched: slateResult.patchedBuildings,
  sizes: { low: finalLow.length, near: finalNear.length },
}));
