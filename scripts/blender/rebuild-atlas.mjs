/**
 * Rebuilds the complete shipped 3D catalogue, in the only order that is safe.
 *
 * `build.mjs` on its own produces a regressed atlas: it re-exports the source
 * models but does not run the four patch stages that re-author worker tools,
 * figure forms, bows and horse legs. Promoting a bare build silently drops
 * that work (villager tools 1,454 -> 684 triangles, archer bows 1,458 -> 854,
 * horse legs 2,078 -> 1,236).
 *
 * The patch stages read the live catalogue in `src/assets3d`, so each one has
 * to be promoted before the next can build on it. That ordering is encoded
 * here instead of being remembered.
 *
 *   node scripts/blender/rebuild-atlas.mjs
 *   node scripts/blender/rebuild-atlas.mjs --pack-only   # reuse the raw export
 *
 * Takes roughly half an hour; Blender and gltfpack run single-threaded and at
 * low priority so the machine stays usable.
 */
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const packOnly = process.argv.includes('--pack-only');
const project = fileURLToPath(new URL('../../', import.meta.url));
const live = path.join(project, 'src', 'assets3d');
const candidate = path.join(project, '.tools', 'art-candidate');
const stages = ['worker-tools', 'figure-forms', 'bows', 'horse-legs'];

function run(script, args = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(project, script), ...args], {
      cwd: project, stdio: 'inherit', windowsHide: true,
    });
    child.on('error', reject);
    child.on('exit', code => code === 0 ? resolve() : reject(new Error(`${script} failed (${code})`)));
  });
}

// Only whole catalogues and the manifest move into the live roster. Stage
// folders also hold validation reports and per-run logs that must not ship.
function promote(directory) {
  const copied = [];
  for (const file of fs.readdirSync(directory)) {
    if (file !== 'catalogue.json' && !/^frontier-[a-z-]+\.glb$/.test(file)) continue;
    fs.copyFileSync(path.join(directory, file), path.join(live, file));
    copied.push(file);
  }
  if (!copied.includes('catalogue.json')) throw new Error(`${directory} produced no catalogue.json`);
  console.log(`promoted ${copied.length} files from ${path.relative(project, directory)}`);
}

console.log(`1/5 building the base catalogue${packOnly ? ' (packing only)' : ''}`);
await run('scripts/blender/build.mjs', ['--stage', ...(packOnly ? ['--pack-only'] : [])]);
promote(path.join(candidate, 'full', 'optimized'));

for (const [index, stage] of stages.entries()) {
  console.log(`${index + 2}/5 patching ${stage}`);
  await run(`scripts/blender/build-${stage}.mjs`);
  promote(path.join(candidate, stage, 'full'));
}

const manifest = JSON.parse(fs.readFileSync(path.join(live, 'catalogue.json'), 'utf8'));
const missing = ['workerToolRevision', 'figureRevision', 'bowRevision', 'horseLegRevision']
  .filter(key => !manifest[key]);
if (missing.length) throw new Error(`catalogue is missing ${missing.join(', ')}; a patch stage did not promote`);
if (manifest.models.length !== 126) throw new Error(`expected 126 models, found ${manifest.models.length}`);
console.log(JSON.stringify({models: manifest.models.length, sizes: manifest.sizes, revisions: {
  workerTool: manifest.workerToolRevision,
  figure: manifest.figureRevision,
  bow: manifest.bowRevision,
  horseLeg: manifest.horseLegRevision,
}}));
