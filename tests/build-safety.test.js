import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {writeReleaseManifest} from '../server/release.js';
import {fingerprintBuildId, validateBuild, publishStaging} from '../scripts/build-safety.mjs';
import {build} from '../scripts/build-safe.mjs';

const buildId = '1234567890123';
const catalogueNames = ['frontier-low', 'frontier-balanced', 'frontier-near', 'frontier-trees', 'frontier-bridge'];

function temporary(t, prefix) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  return root;
}

// A minimal but release-complete package: writeReleaseManifest itself verifies
// the entry hash and build metadata, so this is the same shape a real build has.
function fixture(t, {catalogues = 0, sourceDir = null, root = null} = {}) {
  const target = root || temporary(t, 'frontier-build-');
  return makePackage(target, catalogues, sourceDir);
}

function makePackage(root, catalogues = 0, sourceDir = null) {
  const assets = path.join(root, 'assets');
  fs.mkdirSync(assets);
  fs.writeFileSync(path.join(root, 'index.html'),
    `<html><head><meta name="frontier-build" content="${buildId}"><script type="module" crossorigin src="/assets/index-test.js"></script></head></html>`);
  fs.writeFileSync(path.join(assets, 'index-test.js'), 'console.log("built game");');
  fs.writeFileSync(path.join(assets, 'chunk-test.js'), 'export const value=1;');
  fs.writeFileSync(path.join(assets, 'style-test.css'), 'body{color:#fff}');
  fs.writeFileSync(path.join(root, 'version.json'), JSON.stringify({buildId, version: '2.6.1'}));
  fs.writeFileSync(path.join(root, 'sw.js'), 'self.addEventListener("install",()=>{});');

  const files = ['/index.html', '/assets/index-test.js', '/assets/chunk-test.js', '/assets/style-test.css', '/version.json', '/sw.js'];
  let sources = null;
  if (catalogues) {
    sources = sourceDir || path.join(root, 'sources');
    fs.mkdirSync(sources, {recursive: true});
    for (const name of catalogueNames.slice(0, catalogues)) {
      const bytes = Buffer.alloc(256, name.length);
      fs.writeFileSync(path.join(sources, `${name}.glb`), bytes);
      fs.writeFileSync(path.join(assets, `${name}-HASH123.glb`), bytes);
      files.push(`/assets/${name}-HASH123.glb`);
    }
  }
  writeReleaseManifest(root, {buildId, version: '2.6.1', files});
  return {root, assets, sources, files};
}

test('a complete staged build passes validation', t => {
  const {root} = fixture(t, {catalogues: 5});
  const result = validateBuild(root, {sourceDir: path.join(root, 'sources'), minimumCatalogues: 4});
  assert.equal(result.ok, true, result.failures.join(', '));
  assert.equal(result.counts.catalogues, 5);
  assert.ok(result.counts.emitted >= 8);
});

test('a zero-byte entry script is rejected — the EPERM failure that shipped a dead bundle', t => {
  const {root, assets} = fixture(t);
  fs.writeFileSync(path.join(assets, 'index-test.js'), '');
  const result = validateBuild(root);
  assert.equal(result.ok, false);
  assert.ok(result.failures.includes('zero-byte-entry-script'));
  assert.ok(result.failures.includes('zero-byte-build-file:/assets/index-test.js'));
  assert.ok(result.failures.some(reason => reason.startsWith('readiness:entry-content-mismatch')));
});

test('a partially written GLB is rejected by size parity with its source', t => {
  const {root, assets} = fixture(t, {catalogues: 5});
  const target = path.join(assets, 'frontier-near-HASH123.glb');
  fs.writeFileSync(target, Buffer.alloc(524288)); // exactly the truncated size seen in the incident
  const result = validateBuild(root, {sourceDir: path.join(root, 'sources'), minimumCatalogues: 4});
  assert.equal(result.ok, false);
  assert.ok(result.failures.includes('truncated-catalogue:frontier-near-HASH123.glb'));
});

test('a zero-byte asset outside the release manifest is still rejected', t => {
  const {root, assets} = fixture(t);
  fs.writeFileSync(path.join(assets, 'rock_01_color-ABC.ktx2'), '');
  assert.ok(validateBuild(root).failures.includes('zero-byte-asset:rock_01_color-ABC.ktx2'));
});

test('an incomplete catalogue set, missing entry, bad service worker and version drift are rejected', t => {
  const {root} = fixture(t, {catalogues: 1});
  assert.ok(validateBuild(root, {sourceDir: path.join(root, 'sources'), minimumCatalogues: 4})
    .failures.includes('incomplete-catalogue:1'));

  const missing = fixture(t);
  fs.unlinkSync(path.join(missing.assets, 'index-test.js'));
  assert.ok(validateBuild(missing.root).failures.includes('missing-build-file:/assets/index-test.js'));

  const badSw = fixture(t);
  fs.writeFileSync(path.join(badSw.root, 'sw.js'), 'function ( {');
  assert.ok(validateBuild(badSw.root).failures.includes('invalid-service-worker'));

  const drift = fixture(t);
  fs.writeFileSync(path.join(drift.root, 'version.json'), JSON.stringify({buildId: '9999999999999', version: '2.6.1'}));
  assert.ok(validateBuild(drift.root).failures.includes('version-build-mismatch'));
});

test('publishing swaps in the new build and rolls back when the swap fails', t => {
  const root = temporary(t, 'frontier-publish-');
  const dist = path.join(root, 'dist');
  const staging = path.join(root, 'staging');
  const backup = path.join(root, 'dist.previous');
  fs.mkdirSync(dist);
  fs.writeFileSync(path.join(dist, 'old.txt'), 'previous build');
  fs.mkdirSync(staging);
  fs.writeFileSync(path.join(staging, 'new.txt'), 'new build');

  const outcome = publishStaging({dist, staging, backup});
  assert.equal(outcome.replaced, true);
  assert.equal(fs.readFileSync(path.join(dist, 'new.txt'), 'utf8'), 'new build');
  assert.equal(fs.existsSync(path.join(dist, 'old.txt')), false);

  // A failed second rename must restore the live build byte for byte.
  const broken = path.join(root, 'does-not-exist');
  assert.throws(() => publishStaging({dist, staging: broken, backup}));
  assert.equal(fs.readFileSync(path.join(dist, 'new.txt'), 'utf8'), 'new build');
});

test('publishStaging retries a transient EPERM directory lock', t => {
  const root = temporary(t, 'frontier-retry-');
  const dist = path.join(root, 'dist');
  const staging = path.join(root, 'staging');
  fs.mkdirSync(dist);
  fs.mkdirSync(staging);
  fs.writeFileSync(path.join(dist, 'old.txt'), 'previous');
  fs.writeFileSync(path.join(staging, 'new.txt'), 'current');
  let calls = 0;
  const rename = (from, to) => {
    calls += 1;
    if (calls === 1) { const error = new Error('locked'); error.code = 'EPERM'; throw error; }
    return fs.renameSync(from, to);
  };
  const outcome = publishStaging({dist, staging, backup: path.join(root, 'dist.previous'), rename});
  // One failed rename + its retry, then the staging-to-dist rename.
  assert.equal(calls, 3);
  assert.equal(outcome.replaced, true);
  assert.equal(fs.readFileSync(path.join(dist, 'new.txt'), 'utf8'), 'current');
});

test('the build wrapper publishes only a validated package and never damages a live build', t => {
  const root = temporary(t, 'frontier-orchestration-');
  const log = {log() {}, warn() {}, error() {}};

  // Success path: a complete staged package replaces the previous build.
  const staging = path.join(root, 'staging');
  fs.mkdirSync(staging);
  const {sources} = makePackage(staging, 5);
  const dist = path.join(root, 'dist');
  fs.mkdirSync(dist);
  fs.writeFileSync(path.join(dist, 'old.txt'), 'previous build');
  const options = {stagingDirectory: staging, sourceDir: sources, dist, backup: path.join(root, 'dist.previous'), emit() {}, log};
  assert.equal(build(options).ok, true);
  assert.ok(fs.existsSync(path.join(dist, 'index.html')));
  assert.equal(fs.existsSync(path.join(dist, 'old.txt')), false);

  // A build that fails to emit leaves the published directory untouched.
  fs.writeFileSync(path.join(dist, 'live.txt'), 'still live');
  assert.throws(() => build({...options, stagingDirectory: path.join(root, 'staging2'), emit() { throw new Error('vite failed'); }}), /vite failed/);
  assert.equal(fs.readFileSync(path.join(dist, 'live.txt'), 'utf8'), 'still live');

  // A build that emits a truncated asset is rejected before the swap.
  const broken = path.join(root, 'staging2');
  fs.mkdirSync(broken, {recursive: true});
  const emitted = makePackage(broken, 5);
  fs.writeFileSync(path.join(emitted.assets, 'frontier-near-HASH123.glb'), Buffer.alloc(512));
  assert.throws(() => build({...options, stagingDirectory: broken, sourceDir: emitted.sources}), /incomplete/);
  assert.equal(fs.readFileSync(path.join(dist, 'live.txt'), 'utf8'), 'still live');
  assert.ok(fs.existsSync(path.join(dist, 'index.html')));
});

test('build ids are deterministic, numeric, and change with source content', t => {
  const root = temporary(t, 'frontier-fingerprint-');
  fs.mkdirSync(path.join(root, 'src'));
  fs.writeFileSync(path.join(root, 'index.html'), '<html></html>');
  fs.writeFileSync(path.join(root, 'package.json'), '{"version":"2.6.1"}');
  fs.writeFileSync(path.join(root, 'src', 'main.js'), 'export const value=1;');

  const first = fingerprintBuildId(root);
  assert.match(first, /^\d{10,20}$/);
  assert.equal(first, fingerprintBuildId(root));
  fs.writeFileSync(path.join(root, 'src', 'main.js'), 'export const value=2;');
  assert.notEqual(fingerprintBuildId(root), first);
});
