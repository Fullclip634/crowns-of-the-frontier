import fs from 'node:fs';
import path from 'node:path';

// Vite emits hashed filenames but the host blocks a bulk clean, so every build
// used to leave the previous catalogue and chunks behind. The deployed bundle
// carried two copies of every GLB (35.7 MB) plus 7.9 MB of dead chunks.
// This removes only files that the current entry graph cannot reach.

const dist = 'dist';
const assets = path.join(dist, 'assets');
const htmlPath = path.join(dist, 'index.html');
if (!fs.existsSync(htmlPath)) throw new Error('clean-dist: dist/index.html is missing; run the build first.');

const html = fs.readFileSync(htmlPath, 'utf8');
const entry = [...html.matchAll(/src="\/?assets\/([^"]+\.js)"/g)].map(match => match[1]);
if (!entry.length) throw new Error('clean-dist: no entry script found in dist/index.html.');

// Walk the module graph from the entry script. Any name mentioned in reachable
// code counts as referenced, which over-approximates on purpose: keeping a file
// is always safer than deleting a live one.
const reachable = new Set();
const queue = [...entry];
const sources = [];
while (queue.length) {
  const file = queue.pop();
  if (reachable.has(file)) continue;
  reachable.add(file);
  const target = path.join(assets, file);
  if (!fs.existsSync(target)) continue;
  const source = fs.readFileSync(target, 'utf8');
  sources.push(source);
  for (const match of source.matchAll(/[A-Za-z0-9_-]+\.js/g)) queue.push(match[0]);
}

const code = sources.join('\n');
const referencedGlbs = new Set([...code.matchAll(/frontier-[a-z]+-[A-Za-z0-9_-]+\.glb/g)].map(match => match[0]));
if (referencedGlbs.size < 4) throw new Error(`clean-dist: only ${referencedGlbs.size} catalogue files are referenced; refusing to delete anything.`);

let removed = 0;
let reclaimed = 0;
const skipped = [];
for (const file of fs.readdirSync(assets)) {
  const isCatalogue = file.startsWith('frontier-') && file.endsWith('.glb');
  const isChunk = file.endsWith('.js');
  if (!isCatalogue && !isChunk) continue;
  if (isCatalogue ? referencedGlbs.has(file) : reachable.has(file)) continue;
  const target = path.join(assets, file);
  const stat = fs.statSync(target);
  if (!stat.isFile()) continue;
  try {
    fs.unlinkSync(target);
    removed += 1;
    reclaimed += stat.size;
    console.log(`clean-dist: removed ${file} (${(stat.size / 1048576).toFixed(1)} MB)`);
  } catch (error) {
    // The host may block deletes behind a guard that can time out. Stale files
    // are a hygiene problem, never a reason to fail an otherwise good build.
    skipped.push(file);
    console.warn(`clean-dist: kept ${file} (${error.code || 'delete blocked'})`);
  }
}

if (skipped.length) console.warn(`clean-dist: ${skipped.length} stale file(s) could not be removed; the next build will retry.`);
console.log(JSON.stringify({ removed, reclaimedMB: Number((reclaimed / 1048576).toFixed(1)), skipped: skipped.length, catalogues: referencedGlbs.size }));
