import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {validateBuild, publishStaging} from './build-safety.mjs';

// Build into a fresh staging directory, prove the package is complete, then
// swap it in. The live dist/ is never touched by a failing build.

export const project = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
export const distDirectory = path.join(project, 'dist');
export const backupDirectory = path.join(project, 'dist.previous');

function run(command, args) {
  const result = spawnSync(command, args, {cwd: project, stdio: 'inherit'});
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${path.basename(args[0] || command)} exited with ${result.status}`);
}

const defaultEmit = staging => run(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--outDir', staging, '--emptyOutDir']);

export function build({
  stagingDirectory = fs.mkdtempSync(path.join(project, '.build-staging-')),
  sourceDir = path.join(project, 'src', 'assets3d'),
  dist = distDirectory,
  backup = backupDirectory,
  emit = defaultEmit,
  log = console,
} = {}) {
  let published = false;
  try {
    log.log(`[build] staging in ${path.basename(stagingDirectory)}`);
    emit(stagingDirectory);

    const result = validateBuild(stagingDirectory, {sourceDir, minimumCatalogues: 4});
    if (!result.ok) throw new Error(`Built package is incomplete:\n  - ${result.failures.join('\n  - ')}`);
    log.log(`[build] validated ${result.counts.emitted} assets (${result.counts.catalogues} catalogues)`);

    const outcome = publishStaging({
      dist, staging: stagingDirectory, backup,
      onWarning: message => log.warn(`[build] ${message}`),
    });
    published = true;
    log.log(`[build] published to dist/ (replaced previous build: ${outcome.replaced})`);
    return {ok: true, ...result, ...outcome};
  } catch (error) {
    log.error(`[build] FAILED: ${error.message}`);
    log.error(published
      ? '[build] The new build was published; investigate before deploying.'
      : '[build] The existing dist/ was left untouched.');
    throw error;
  } finally {
    if (!published) {
      try { if (fs.existsSync(stagingDirectory)) fs.rmSync(stagingDirectory, {recursive: true, force: true}); }
      catch (error) { log.warn(`[build] staging directory retained at ${stagingDirectory}: ${error.code || error.message}`); }
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { build(); }
  catch { process.exitCode = 1; }
}
