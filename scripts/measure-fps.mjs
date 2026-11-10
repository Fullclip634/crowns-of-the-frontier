// Measures real frame rate for the built game in Chromium.
//
// Run it headful on the machine you actually care about:
//
//   npm run build -- --configLoader native
//   node scripts/measure-fps.mjs --headful
//
// Headless numbers are not representative. A sandboxed or headless Chromium can
// report a D3D11 renderer while compositing in software, and its frame clock is
// unreliable enough to report frames that take seconds. Only a headful run on
// the target machine answers the question the quality targets ask.
//
// The page is forced visible because the game deliberately renders once a second
// while `document.hidden`, which would otherwise report ~1 FPS everywhere.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';

const args = process.argv.slice(2);
const headful = args.includes('--headful');
const software = args.includes('--software');
const port = Number(process.env.FPS_PORT) || 4173;
const tiers = (process.env.FPS_TIERS || 'low,medium,high').split(',');
const sampleMs = Number(process.env.FPS_SAMPLE_MS) || 12000;
const warmupMs = Number(process.env.FPS_WARMUP_MS) || 9000;

const root = path.resolve('dist');
if (!fs.existsSync(path.join(root, 'index.html'))) {
  console.error('dist/index.html is missing. Build first: npm run build -- --configLoader native');
  process.exit(1);
}
const types = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.glb':'model/gltf-binary','.ktx2':'image/ktx2','.wasm':'application/wasm','.woff2':'font/woff2','.wav':'audio/wav','.webmanifest':'application/manifest+json'};
const server = http.createServer((req,res)=>{
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const file = path.join(root, p);
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, {'content-type': types[path.extname(file)] || 'application/octet-stream'});
  fs.createReadStream(file).pipe(res);
});
await new Promise(r => server.listen(port, '127.0.0.1', r));

// Playwright's bundled headless shell is not always installed; prefer an
// explicit CHROME_PATH, then the newest full Chromium in the Playwright cache.
function resolveChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const base = process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'ms-playwright');
  if (!base || !fs.existsSync(base)) return undefined;
  const candidates = fs.readdirSync(base)
    .filter(name => name.startsWith('chromium-'))
    .sort()
    .reverse()
    .map(name => path.join(base, name, 'chrome-win64', 'chrome.exe'))
    .filter(file => fs.existsSync(file));
  return candidates[0];
}
const executablePath = resolveChrome();
const gpuArgs = software ? ['--use-angle=swiftshader','--enable-unsafe-swiftshader'] : ['--ignore-gpu-blocklist','--enable-gpu-rasterization'];
const browser = await chromium.launch({
  executablePath, headless: !headful,
  args:[...gpuArgs,'--no-sandbox','--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows','--disable-features=CalculateNativeWinOcclusion']
});
const page = await browser.newPage({viewport:{width:1600,height:900}});
await page.addInitScript(() => {
  Object.defineProperty(document, 'hidden', {get: () => false, configurable: true});
  Object.defineProperty(document, 'visibilityState', {get: () => 'visible', configurable: true});
});
page.on('pageerror', e => console.error('PAGEERROR:', e.message.slice(0,200)));

await page.goto(`http://127.0.0.1:${port}/`, {waitUntil:'domcontentloaded', timeout:120000});
await page.waitForFunction(() => !!window.frontier, null, {timeout:240000});

const renderer = await page.evaluate(() => {
  const gl = document.createElement('canvas').getContext('webgl2');
  if (!gl) return 'no webgl2';
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
});
console.log(`mode: ${headful ? 'headful' : 'headless (not representative)'}`);
console.log(`renderer: ${renderer}`);

await page.evaluate(() => {
  window.frontier.start({mode:'custom', map:'highlands', mapSize:'huge', seed:512, populationLimit:80, slots:[
    {name:'P1',faction:'alder',team:1,difficulty:'hard',enabled:true,slotNumber:1,controller:'human'},
    {name:'P2',faction:'sun',team:2,difficulty:'hard',enabled:true,slotNumber:2,controller:'ai'},
    {name:'P3',faction:'raven',team:1,difficulty:'hard',enabled:true,slotNumber:3,controller:'ai'},
    {name:'P4',faction:'alder',team:2,difficulty:'hard',enabled:true,slotNumber:4,controller:'ai'}
  ]});
});
await page.waitForTimeout(warmupMs);

const results = [];
for (const quality of tiers) {
  await page.evaluate(q => window.frontier.view.quality(q), quality);
  await page.waitForTimeout(warmupMs);
  const sample = await page.evaluate(ms => new Promise(resolve => {
    const frameTimes = [];
    let last = performance.now();
    const start = last;
    const step = now => {
      const delta = now - last;
      last = now;
      // Ignore a first outlier and anything longer than a second: those are
      // scheduler stalls, not frames, and they dominate a naive average.
      if (delta > 0 && delta < 1000) frameTimes.push(delta);
      if (now - start < ms) requestAnimationFrame(step);
      else {
        frameTimes.sort((a, b) => a - b);
        const at = p => frameTimes[Math.min(frameTimes.length - 1, Math.floor(frameTimes.length * p))] || 0;
        const mean = frameTimes.reduce((a, b) => a + b, 0) / Math.max(1, frameTimes.length);
        resolve({
          frames: frameTimes.length,
          fps: +(1000 / Math.max(1, mean)).toFixed(1),
          medianFrameMs: +at(.5).toFixed(1),
          p95FrameMs: +at(.95).toFixed(1),
          stalls: frameTimes.length ? undefined : 0
        });
      }
    };
    requestAnimationFrame(step);
  }), sampleMs);
  const counts = await page.evaluate(() => ({
    units: window.frontier.sim.entities.filter(e => e.kind === 'unit').length,
    buildings: window.frontier.sim.entities.filter(e => e.kind === 'building').length,
    time: Math.round(window.frontier.sim.time)
  }));
  results.push({quality, ...sample, ...counts});
  console.log(JSON.stringify(results.at(-1)));
}

console.log('\nsummary');
for (const r of results) console.log(`${r.quality.padEnd(7)} ${String(r.fps).padStart(6)} fps   median ${r.medianFrameMs} ms   p95 ${r.p95FrameMs} ms   ${r.units}u/${r.buildings}b`);

await browser.close();
server.close();
process.exit(0);
