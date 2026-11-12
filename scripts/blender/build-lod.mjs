import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath, pathToFileURL} from 'node:url';

// The three shipped catalogues differ in precision and composition, not in
// polygon count (catalogue.json: "no triangle simplification"). This produces
// an actual decimated catalogue for distant geometry. The runtime requires one
// node per assetKey, so a simplification that prunes or merges those nodes is
// a build failure, never a silent visual regression.

export const project = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));
export const assetDirectory = path.join(project, 'src', 'assets3d');

export function readGlbJson(buffer) {
  if (buffer.toString('utf8', 0, 4) !== 'glTF') throw new Error('Not a GLB file.');
  const length = buffer.readUInt32LE(12);
  return JSON.parse(buffer.subarray(20, 20 + length).toString('utf8'));
}

export function catalogueStats(json) {
  const keys = new Set();
  for (const node of json.nodes || []) if (node.extras?.assetKey) keys.add(node.extras.assetKey);
  let triangles = 0;
  for (const mesh of json.meshes || []) for (const primitive of mesh.primitives || []) {
    if (primitive.mode !== undefined && primitive.mode !== 4) continue;
    const accessor = primitive.indices !== undefined ? json.accessors?.[primitive.indices] : null;
    const count = accessor ? accessor.count : json.accessors?.[primitive.attributes?.POSITION]?.count || 0;
    triangles += Math.floor(count / 3);
  }
  return {keys, triangles};
}

export function compareCatalogues(source, lod, {minimumReduction = 0.15} = {}) {
  const before = catalogueStats(source);
  const after = catalogueStats(lod);
  const failures = [];
  if (!before.keys.size) failures.push('source-has-no-asset-keys');
  for (const key of before.keys) if (!after.keys.has(key)) failures.push(`lost-asset-key:${key}`);
  if (after.keys.size !== before.keys.size) failures.push(`asset-key-count:${before.keys.size}->${after.keys.size}`);
  const reduction = before.triangles ? 1 - after.triangles / before.triangles : 0;
  if (reduction < minimumReduction) failures.push(`insufficient-triangle-reduction:${(reduction * 100).toFixed(1)}%`);
  return {ok: failures.length === 0, failures, before: before.triangles, after: after.triangles, reduction, keys: before.keys.size};
}

export function buildLod({source = 'frontier-low.glb', output = 'frontier-far.glb', ratio = 0.35, error = 0.02, minimumReduction = 0.15} = {}) {
  const input = path.join(assetDirectory, source);
  const target = path.join(assetDirectory, output);
  const optimizer = process.env.GLTFPACK_BIN || path.join(project, '.tools', 'gltfpack', 'gltfpack.exe');
  if (!fs.existsSync(optimizer)) throw new Error(`gltfpack is missing at ${optimizer}`);

  const result = spawnSync(optimizer, [
    '-i', input, '-o', target,
    '-si', String(ratio), '-se', String(error),
    '-ke', '-kn', '-km', '-c',
  ], {cwd: project, encoding: 'utf8'});
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`gltfpack exited with ${result.status}: ${result.stderr || result.stdout}`);

  const sourceBuffer = fs.readFileSync(input);
  const lodBuffer = fs.readFileSync(target);
  const comparison = compareCatalogues(readGlbJson(sourceBuffer), readGlbJson(lodBuffer), {minimumReduction});
  if (!comparison.ok) {
    fs.rmSync(target, {force: true});
    throw new Error(`Generated LOD is invalid:\n  - ${comparison.failures.join('\n  - ')}`);
  }

  const report = {
    source, output, ratio,
    sourceBytes: sourceBuffer.length,
    lodBytes: lodBuffer.length,
    sourceSHA256: createHash('sha256').update(sourceBuffer).digest('hex'),
    lodSHA256: createHash('sha256').update(lodBuffer).digest('hex'),
    triangles: {source: comparison.before, lod: comparison.after, reduction: Number(comparison.reduction.toFixed(4))},
    assetKeys: comparison.keys,
    tool: 'gltfpack -si -se -ke -kn -km -c',
  };
  fs.writeFileSync(path.join(assetDirectory, 'lod.json'), JSON.stringify(report, null, 2) + '\n');
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { console.log(JSON.stringify(buildLod(), null, 2)); }
  catch (error) { console.error(`[art:lod] ${error.message}`); process.exitCode = 1; }
}
