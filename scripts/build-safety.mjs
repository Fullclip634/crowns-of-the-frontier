import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execSync} from 'node:child_process';
import {Script} from 'node:vm';
import {inspectRelease} from '../server/release.js';

// A build is only publishable if every emitted byte survived the write. Vite's
// in-place build used to leave truncated assets and a zero-byte entry script
// behind when a single asset write failed (EPERM), so validation and an atomic
// directory swap are part of the build, not a post-deploy check.

const ENTRY = /<script\b[^>]*\bsrc="(\/assets\/[A-Za-z0-9._-]+\.js)"/;
const HASHED_GLB = /^(frontier-[a-z]+)-[A-Za-z0-9_-]+\.glb$/;
const FINGERPRINT_ROOTS = ['index.html', 'package.json', 'scripts/sw-template.js', 'src', 'public'];

function walk(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walk(file));
    else if (entry.isFile()) files.push(file);
  }
  return files;
}

const commitCache = new Map();
function projectCommit(project) {
  // Avoid spawning git for non-repositories, and never spawn it twice for the
  // same tree: process creation is expensive on sandboxed Windows hosts.
  if (!fs.existsSync(path.join(project, '.git'))) return 'no-commit';
  if (commitCache.has(project)) return commitCache.get(project);
  let commit = 'no-commit';
  try {
    commit = execSync('git rev-parse HEAD', {cwd: project, stdio: ['ignore', 'pipe', 'ignore']}).toString().trim() || 'no-commit';
  } catch { /* an unborn or detached tree is still fingerprintable */ }
  commitCache.set(project, commit);
  return commit;
}

// Two builds of identical sources must produce identical metadata. Date.now()
// made every build look like an update and made releases unreproducible.
export function fingerprintBuildId(project) {
  const hash = createHash('sha256');
  hash.update(projectCommit(project));
  for (const relative of FINGERPRINT_ROOTS) {
    const absolute = path.join(project, relative);
    if (!fs.existsSync(absolute)) continue;
    if (fs.statSync(absolute).isFile()) {
      hash.update(relative);
      hash.update(fs.readFileSync(absolute));
      continue;
    }
    for (const file of walk(absolute).sort()) {
      hash.update(path.relative(project, file).replace(/\\/g, '/'));
      hash.update(fs.readFileSync(file));
    }
  }
  // inspectRelease requires a 10-20 digit numeric build id.
  return BigInt('0x' + hash.digest('hex').slice(0, 16)).toString().padStart(20, '0');
}

const isFile = file => {
  try { return fs.statSync(file).isFile(); } catch { return false; }
};
const sizeOf = file => {
  try { return fs.statSync(file).size; } catch { return 0; }
};

export function validateBuild(root, {sourceDir = null, minimumCatalogues = 0} = {}) {
  const failures = [];
  const index = path.join(root, 'index.html');
  const assets = path.join(root, 'assets');
  const html = isFile(index) ? fs.readFileSync(index, 'utf8') : '';
  if (!html) failures.push('missing-or-empty-index');

  const entry = html.match(ENTRY)?.[1];
  if (!entry) failures.push('missing-entry-script');
  else if (sizeOf(path.join(root, entry.slice(1))) === 0) failures.push('zero-byte-entry-script');

  const manifestPath = path.join(root, 'release.json');
  let manifest = null;
  if (!isFile(manifestPath)) failures.push('missing-release-manifest');
  else {
    try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); }
    catch { failures.push('invalid-release-manifest'); }
  }

  const inspection = inspectRelease(root, {});
  if (!inspection.ready) failures.push(...inspection.failures.map(reason => `readiness:${reason}`));

  if (manifest?.files?.length) {
    for (const file of manifest.files) {
      const target = path.join(root, file.slice(1));
      if (!isFile(target)) failures.push(`missing-build-file:${file}`);
      else if (fs.statSync(target).size === 0) failures.push(`zero-byte-build-file:${file}`);
    }
  } else if (manifest) failures.push('empty-release-file-list');

  // Catch partial writes of assets that are not listed in release.json (GLBs,
  // KTX2 textures, fonts). A 512 KB chunk of a 17 MB GLB is exactly the
  // failure that produced a broken deployed bundle.
  let emitted = 0;
  const catalogues = [];
  if (fs.existsSync(assets)) {
    for (const file of walk(assets)) {
      emitted += 1;
      if (fs.statSync(file).size === 0) failures.push(`zero-byte-asset:${path.basename(file)}`);
      const match = path.basename(file).match(HASHED_GLB);
      if (match) catalogues.push({file, sourceName: `${match[1]}.glb`});
    }
  }
  if (catalogues.length < minimumCatalogues) failures.push(`incomplete-catalogue:${catalogues.length}`);

  if (sourceDir) {
    for (const {file, sourceName} of catalogues) {
      const source = path.join(sourceDir, sourceName);
      if (!isFile(source)) { failures.push(`missing-catalogue-source:${sourceName}`); continue; }
      if (fs.statSync(file).size !== fs.statSync(source).size) {
        failures.push(`truncated-catalogue:${path.basename(file)}`);
      }
    }
  }

  const sw = path.join(root, 'sw.js');
  if (!isFile(sw) || sizeOf(sw) === 0) failures.push('missing-or-empty-service-worker');
  else {
    try { new Script(fs.readFileSync(sw, 'utf8'), {filename: 'sw.js'}); }
    catch { failures.push('invalid-service-worker'); }
  }

  const version = path.join(root, 'version.json');
  if (manifest && isFile(version)) {
    try {
      if (JSON.parse(fs.readFileSync(version, 'utf8')).buildId !== manifest.buildId) failures.push('version-build-mismatch');
    } catch { failures.push('invalid-version-json'); }
  }

  return {ok: failures.length === 0, failures: [...new Set(failures)], counts: {emitted, catalogues: catalogues.length}};
}

// Windows can briefly hold a directory open (antivirus, indexer, a running dev
// server). Retry those transient EPERM failures before giving up; a persistent
// lock must still fail loudly rather than overwrite files in place.
const sleep = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
function renameWithRetry(from, to, rename) {
  for (let attempt = 0; ; attempt++) {
    try { rename(from, to); return; }
    catch (error) {
      if (error.code !== 'EPERM' || attempt >= 2) throw error;
      sleep(200 * (attempt + 1));
    }
  }
}

// Publish by renaming directories, never by overwriting files in place. A
// failure before the second rename restores the previous build.
export function publishStaging({dist, staging, backup, onWarning = () => {}, rename = fs.renameSync}) {
  const hadDist = fs.existsSync(dist);
  let moved = false;
  let backupPath = backup;
  try {
    if (hadDist) {
      if (fs.existsSync(backupPath)) {
        try { fs.rmSync(backupPath, {recursive: true, force: true}); }
        catch { backupPath = `${backup}-${process.pid}-${Date.now()}`; }
      }
      renameWithRetry(dist, backupPath, rename);
      moved = true;
    }
    renameWithRetry(staging, dist, rename);
  } catch (error) {
    if (moved && !fs.existsSync(dist)) rename(backupPath, dist);
    throw error;
  }
  let backupRemoved = !hadDist;
  if (moved && fs.existsSync(backupPath)) {
    try {
      fs.rmSync(backupPath, {recursive: true, force: true});
      backupRemoved = !fs.existsSync(backupPath);
    } catch (error) {
      onWarning(`previous build retained at ${backupPath} (${error.code || error.message})`);
    }
  }
  return {replaced: hadDist, backupRemoved, backup: backupPath};
}
