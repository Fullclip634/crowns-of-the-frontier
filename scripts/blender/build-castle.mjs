import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {replaceModelPatch} from './model-patch.mjs';
import {validateMeshPrecision} from './validate-mesh-precision.mjs';
import {LOW_CATALOGUE_BUDGET} from './content-budget.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const args = process.argv.slice(2);
const options = {};
let skipAuthor = false;
let promoteEditable = true;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--skip-author') { skipAuthor = true; continue; }
  if (args[i] === '--no-promote-blend') { promoteEditable = false; continue; }
  assert.ok(['--source', '--directory'].includes(args[i]) && args[i + 1], 'Use --source, --directory, --skip-author, and/or --no-promote-blend');
  options[args[i]] = args[++i];
}
const owned = value => {
  const file = path.resolve(root, value);
  const rel = path.relative(root, file);
  assert.ok(rel && !rel.startsWith('..') && !path.isAbsolute(rel), `Path outside project: ${value}`);
  return file;
};

const source = owned(options['--source'] || '.tools/art-refined/frontier-assets.blend');
const directory = owned(options['--directory'] || 'src/assets3d');
const stage = path.join(root, '.tools/art-candidate/castle');
const rawDir = path.join(stage, 'raw');
const optDir = path.join(stage, 'optimized');
const manifestPath = path.join(directory, 'catalogue.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
assert.equal(manifest.completeCatalogue, true, 'Target directory must hold the complete catalogue');

const blender = process.env.BLENDER_BIN || path.join(root, '.tools/blender-4.5.14-windows-x64/blender.exe');
const optimizer = process.env.GLTFPACK_BIN || path.join(root, '.tools/gltfpack/gltfpack.exe');
assert.ok(fs.existsSync(blender), `Blender LTS not found at ${blender}`);
assert.ok(fs.existsSync(optimizer), `gltfpack not found at ${optimizer}`);
fs.mkdirSync(rawDir, {recursive: true});
fs.mkdirSync(optDir, {recursive: true});

async function run(command, cmdArgs, logFile) {
  const fd = fs.openSync(logFile, 'w');
  try {
    await new Promise((resolve, reject) => {
      const child = spawn(command, cmdArgs, {cwd: root, windowsHide: true, stdio: ['ignore', fd, fd]});
      child.on('error', reject);
      child.on('exit', code => {
        if (code === 0) return resolve();
        const tail = fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8').slice(-2000) : '';
        reject(new Error(`Command failed (${code}): ${logFile}\n${tail}`));
      });
    });
  } finally {
    fs.closeSync(fd);
  }
}

if (!skipAuthor) {
  await run(
    blender,
    [
      '--background',
      '--threads', '1',
      '--python-exit-code', '1',
      '--python', 'scripts/blender/author-castle.py',
      '--',
      '--source', source,
      '--out', rawDir,
    ],
    path.join(stage, 'author.log'),
  );
}

const report = JSON.parse(fs.readFileSync(path.join(rawDir, 'authoring-validation.json'), 'utf8'));
assert.ok(report.passed && report.unchangedOtherModels === 123 && report.keys.length === 3, 'Blender castle validation report failed');

const checks = [];
const results = [];
for (const detail of ['low', 'near']) {
  const baseBytes = fs.readFileSync(path.join(directory, `frontier-${detail}.glb`));
  const patchPath = path.join(optDir, `frontier-${detail}.glb`);
  await run(
    optimizer,
    ['-i', path.join(rawDir, `frontier-${detail}.glb`), '-o', patchPath, '-cc', '-kn', '-km', '-ke', '-kv', '-vpf', '-vtf'],
    path.join(stage, `${detail}-pack.log`),
  );
  const patchBytes = fs.readFileSync(patchPath);
  const patched = replaceModelPatch(baseBytes, patchBytes, report.keys);
  assert.equal(patched.unchangedModels, 123, `${detail} catalogue mutated unrelated models`);

  let finalBytes = patched.bytes;
  let compactedDeadBytes = 0;
  let precisionReport = null;

  // Earlier incremental patches leave unreferenced vertices inside shared meshopt
  // bufferViews in frontier-low.glb. If appending the castle pushes over budget,
  // reclaim dead unreferenced bytes losslessly (no triangle simplification) and
  // verify every single visible triangle, UV, color and normal across all 126 models!
  if (detail === 'low' && finalBytes.length >= LOW_CATALOGUE_BUDGET) {
    const composedPath = path.join(optDir, 'frontier-low-composed.glb');
    const compactedPath = path.join(optDir, 'frontier-low-compacted.glb');
    fs.writeFileSync(composedPath, finalBytes);
    await run(
      optimizer,
      ['-i', composedPath, '-o', compactedPath, '-cc', '-kn', '-km', '-ke', '-kv', '-vpf', '-vtf', '-vn', '10'],
      path.join(stage, 'low-compact.log'),
    );
    const compactedBytes = fs.readFileSync(compactedPath);
    precisionReport = await validateMeshPrecision(finalBytes, compactedBytes, {normalLimit: 1.0});
    assert.ok(precisionReport.passed && precisionReport.exactTrianglePositionsAndWinding && precisionReport.maxUVError === 0 && precisionReport.maxColorError === 0);
    compactedDeadBytes = finalBytes.length - compactedBytes.length;
    finalBytes = compactedBytes;
  }

  if (detail === 'low') {
    assert.ok(
      finalBytes.length < LOW_CATALOGUE_BUDGET,
      `Low catalogue (${finalBytes.length} bytes) exceeds LOW_CATALOGUE_BUDGET (${LOW_CATALOGUE_BUDGET} bytes)`,
    );
  }
  results.push([detail, finalBytes]);
  checks.push({
    detail,
    unchangedModels: patched.unchangedModels,
    beforeBytes: baseBytes.length,
    afterBytes: finalBytes.length,
    deltaBytes: finalBytes.length - baseBytes.length,
    compactedDeadBytes,
    ...(precisionReport ? {compactedMaxNormalDegrees: precisionReport.maxNormalDegrees} : {}),
  });
}

const nearBytes = results.find(([d]) => d === 'near')[1];
const lowBytes = results.find(([d]) => d === 'low')[1];
assert.ok(lowBytes.length < nearBytes.length * 0.5, `Low (${lowBytes.length}) must stay below 50% of High (${nearBytes.length})`);

for (const [detail, bytes] of results) {
  fs.writeFileSync(path.join(directory, `frontier-${detail}.glb`), bytes);
  manifest.sizes[detail] = bytes.length;
}

const candidateBlend = path.join(rawDir, 'frontier-assets.blend');
const blendHash = createHash('sha256').update(fs.readFileSync(candidateBlend)).digest('hex');
manifest.castleRevision = report.revision;
manifest.castleSourceSHA256 = blendHash;
manifest.lowContentBudgetBytes = LOW_CATALOGUE_BUDGET;
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

if (promoteEditable && !options['--directory']) {
  const backupDir = path.join(root, '.tools/art-backup/castle-pre-aoe2');
  const backupBlend = path.join(backupDir, 'frontier-assets.blend');
  if (!fs.existsSync(backupBlend) && fs.existsSync(source)) {
    fs.mkdirSync(backupDir, {recursive: true});
    fs.copyFileSync(source, backupBlend);
  }
  fs.copyFileSync(candidateBlend, path.join(root, '.tools/art-refined/frontier-assets.blend'));
}

const dirRel = path.relative(root, directory);
await run(process.execPath, ['scripts/blender/build-balanced.mjs', '--directory', dirRel], path.join(stage, 'balanced.log'));
if (!options['--directory']) {
  await run(process.execPath, ['scripts/blender/build-lod.mjs'], path.join(stage, 'lod.log'));
}

fs.writeFileSync(path.join(stage, 'composition-validation.json'), JSON.stringify({passed: true, ...report, checks}, null, 2) + '\n');
console.log(JSON.stringify({passed: true, revision: report.revision, triangles: report.triangles, checks, editable: path.relative(root, candidateBlend)}, null, 2));
