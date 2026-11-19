import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildLod} from './build-lod.mjs';
import {lowCatalogueBudget} from './content-budget.mjs';
import {mountedFormRevision, replaceMountedForms} from './mounted-form-patch.mjs';

const project = fileURLToPath(new URL('../../', import.meta.url));
const source = path.join(project, 'src/assets3d');
const stage = path.join(project, '.tools/art-candidate/mounted-forms');
const directory = path.join(stage, 'full');
const optimizer = process.env.GLTFPACK_BIN || path.join(project, '.tools/gltfpack/gltfpack.exe');
const run = (command, args) => execFileSync(command, args, {cwd: project, windowsHide: true, stdio: 'inherit'});
const manifestPath = path.join(directory, 'catalogue.json');
const args = process.argv.slice(2);
assert.ok(args.length === 0 || (args.length === 1 && args[0] === '--from-export'), 'Use --from-export to reuse the Blender export');

if (!args.length) {
  const blender = process.env.BLENDER_BIN || path.join(project, '.tools/blender-4.5.14-windows-x64/blender.exe');
  run(blender, ['--background', '--threads', '1', '--python-exit-code', '1', '--python', 'scripts/blender/author-mounted-forms.py']);
}
fs.mkdirSync(directory, {recursive: true});
for (const file of ['frontier-foliage.glb', 'frontier-trees.glb', 'catalogue.json']) {
  fs.copyFileSync(path.join(source, file), path.join(directory, file));
}
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const checks = [];
for (const detail of ['low', 'near']) {
  const file = `frontier-${detail}.glb`;
  const packed = path.join(stage, `packed-${detail}.glb`);
  run(optimizer, ['-i', path.join(stage, 'raw', detail + '.glb'), '-o', packed, '-cc', '-kn', '-km', '-ke', '-kv', '-vpf', '-vtf', '-vn', '16', '-vc', '8']);
  const base = fs.readFileSync(path.join(source, file));
  const {bytes, mounts, unchangedModels} = replaceMountedForms(base, fs.readFileSync(packed));
  const growth = bytes.length - base.length;
  assert.ok(growth < 20_000, detail + ' mounted geometry download growth');
  if (detail === 'low') assert.ok(bytes.length <= lowCatalogueBudget(manifest));
  fs.writeFileSync(path.join(directory, file), bytes);
  manifest.sizes[detail] = bytes.length;
  checks.push({detail, mounts, unchangedModels, growth});
}
manifest.mountedFormRevision = mountedFormRevision;
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
const lod = buildLod({directory});
run(process.execPath, ['scripts/blender/build-balanced.mjs', '--directory', directory]);
console.log(JSON.stringify({directory, checks, lod}, null, 2));
