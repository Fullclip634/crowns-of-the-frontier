import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {replaceModelPatch} from './model-patch.mjs';
import {LOW_CATALOGUE_BUDGET} from './content-budget.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const args = process.argv.slice(2);
const options = {};
for (let i = 0; i < args.length; i += 2) {
  assert.ok(['--source', '--directory'].includes(args[i]) && args[i + 1], 'Use --source and/or --directory');
  options[args[i]] = args[i + 1];
}
const owned = value => {
  const file = path.resolve(root, value);
  const rel = path.relative(root, file);
  assert.ok(rel && !rel.startsWith('..') && !path.isAbsolute(rel), `Path outside project: ${value}`);
  return file;
};

const source = owned(options['--source'] || '.tools/art-refined/frontier-assets.blend');
const directory = owned(options['--directory'] || 'src/assets3d');
const stage = path.join(root, '.tools/art-candidate/siege-naval');
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

await run(
  blender,
  [
    '--background',
    '--threads', '1',
    '--python-exit-code', '1',
    '--python', 'scripts/blender/author-siege-naval.py',
    '--',
    '--source', source,
    '--out', rawDir,
  ],
  path.join(stage, 'author.log'),
);

const report = JSON.parse(fs.readFileSync(path.join(rawDir, 'authoring-validation.json'), 'utf8'));
assert.ok(report.passed && report.unchangedOtherModels === 120 && report.keys.length === 6, 'Blender validation report failed');

const checks = [];
const results = [];
for (const detail of ['low', 'near']) {
  const patchPath = path.join(optDir, `frontier-${detail}.glb`);
  await run(
    optimizer,
    ['-i', path.join(rawDir, `frontier-${detail}.glb`), '-o', patchPath, '-cc', '-kn', '-km', '-ke', '-kv', '-vpf', '-vtf'],
    path.join(stage, `${detail}-pack.log`),
  );
  const baseBytes = fs.readFileSync(path.join(directory, `frontier-${detail}.glb`));
  const patchBytes = fs.readFileSync(patchPath);
  const patched = replaceModelPatch(baseBytes, patchBytes, report.keys);
  assert.equal(patched.unchangedModels, 120, `${detail} catalogue mutated unrelated models`);
  if (detail === 'low') {
    assert.ok(
      patched.bytes.length < LOW_CATALOGUE_BUDGET,
      `Low catalogue (${patched.bytes.length} bytes) exceeds LOW_CATALOGUE_BUDGET (${LOW_CATALOGUE_BUDGET} bytes)`,
    );
  }
  results.push([detail, patched.bytes]);
  checks.push({
    detail,
    unchangedModels: patched.unchangedModels,
    beforeBytes: baseBytes.length,
    afterBytes: patched.bytes.length,
    deltaBytes: patched.bytes.length - baseBytes.length,
  });
}

const nearBytes = results.find(([d]) => d === 'near')[1];
const lowBytes = results.find(([d]) => d === 'low')[1];
assert.ok(lowBytes.length < nearBytes.length * 0.5, `Low (${lowBytes.length}) must stay below 50% of High (${nearBytes.length})`);

for (const [detail, bytes] of results) {
  fs.writeFileSync(path.join(directory, `frontier-${detail}.glb`), bytes);
  manifest.sizes[detail] = bytes.length;
}
const blendHash = createHash('sha256').update(fs.readFileSync(path.join(rawDir, 'frontier-assets.blend'))).digest('hex');
manifest.siegeRevision = 'solid-timber-v1';
manifest.navalRevision = 'carvel-timber-v1';
manifest.siegeSourceSHA256 = blendHash;
manifest.navalSourceSHA256 = blendHash;
manifest.lowContentBudgetBytes = LOW_CATALOGUE_BUDGET;
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
fs.writeFileSync(path.join(stage, 'composition-validation.json'), JSON.stringify({passed: true, ...report, checks}, null, 2) + '\n');
console.log(JSON.stringify({passed: true, triangles: report.triangles, checks, editable: path.relative(root, path.join(rawDir, 'frontier-assets.blend'))}, null, 2));
