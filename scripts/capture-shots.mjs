/**
 * Captures real screenshots of the running game with headless Edge.
 *
 * Playwright cannot run in this sandbox, but Edge's own headless mode can, and
 * the DevTools protocol is enough to click through the menu and take pictures.
 * Node 22 ships a WebSocket client, so this needs no dependencies.
 *
 *   npm start                       # serve dist on :4173
 *   node scripts/capture-shots.mjs [url] [outDir]
 *
 * Writes landing.png, battle.png and battle-zoomed.png. Every wait is on real
 * page state, so a slow software renderer produces a slower run, not a blank
 * image.
 */
import {spawn,spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const url = process.argv[2] || 'http://127.0.0.1:4173/';
const outDir = path.resolve(process.argv[3] || '.shots');
const edge = process.env.EDGE_BIN || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const port = Number(process.env.CDP_PORT || 9400 + Math.floor(Math.random() * 400));
const profile = path.join(outDir, `profile-${Date.now()}`);
fs.mkdirSync(outDir, {recursive: true});
// A fresh profile per run avoids deleting the previous one: the host's
// safe-delete guard blocks recursive removal inside the workspace.
//
// Launching the browser from this process is unreliable in the agent sandbox,
// so CDP_URL can point at an Edge started from the shell instead:
//   msedge --headless=new --remote-debugging-port=9500 --user-data-dir=...
//   CDP_URL=ws://127.0.0.1:9500/devtools/page/<id> node scripts/capture-shots.mjs
const external = process.env.CDP_URL || '';
const browser = external ? null : spawn(edge, [
  `--remote-debugging-port=${port}`, '--remote-allow-origins=*', `--user-data-dir=${profile}`,
  '--headless=new', '--enable-unsafe-swiftshader', '--use-angle=swiftshader',
  '--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars',
  '--no-first-run', '--disable-extensions', '--window-size=1600,900',
  'about:blank',
], {stdio: ['ignore', 'ignore', fs.openSync(path.join(outDir, 'edge.log'), 'w')], windowsHide: true});

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function endpoint() {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      const targets = await response.json();
      // Extension and devtools pages also report type 'page'; take the blank
      // tab this launch created.
      const page = targets.find(target => target.type === 'page' && /^about:blank|127\.0\.0\.1|localhost/.test(target.url))
        || targets.find(target => target.type === 'page');
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch {}
    await sleep(250);
  }
  throw new Error('headless Edge did not expose a debugging target');
}

function connect(socketUrl) {
  const socket = new WebSocket(socketUrl);
  const pending = new Map();
  let nextId = 0;
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    const entry = pending.get(message.id);
    if (!entry) return;
    pending.delete(message.id);
    if (message.error) entry.reject(new Error(message.error.message));
    else entry.resolve(message.result);
  });
  const ready = new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, {once: true});
    socket.addEventListener('error', () => reject(new Error('CDP socket failed')), {once: true});
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, {resolve, reject});
    socket.send(JSON.stringify({id, method, params}));
  });
  return {socket, ready, send};
}

async function main() {
  const cdp = connect(external || await endpoint());
  await cdp.ready;
  const {send} = cdp;
  await send('Page.enable');
  await send('Runtime.enable');

  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', {expression, returnByValue: true, awaitPromise: true});
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result.value;
  };
  const consoleErrors = [];
  cdp.socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.method === 'Runtime.exceptionThrown') consoleErrors.push(message.params.exceptionDetails.text);
    if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
      consoleErrors.push(message.params.args.map(arg => arg.value ?? arg.description).join(' '));
    }
  });
  // A synthetic element.click() skips the hit testing a player's click goes
  // through, so aim a real pointer event at the button's centre.
  const clickCentre = async selector => {
    const box = await evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el)return null;const r=el.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
    if (!box) throw new Error(`no element for ${selector}`);
    for (const type of ['mousePressed', 'mouseReleased']) {
      await send('Input.dispatchMouseEvent', {type, x: box.x, y: box.y, button: 'left', clickCount: 1});
    }
  };
  const waitFor = async (expression, label, timeout = 60000) => {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      if (await evaluate(expression)) return;
      await sleep(250);
    }
    throw new Error(`timed out waiting for ${label}`);
  };
  const shot = async name => {
    const {data} = await send('Page.captureScreenshot', {format: 'png', captureBeyondViewport: false});
    const file = path.join(outDir, `${name}.png`);
    fs.writeFileSync(file, Buffer.from(data, 'base64'));
    console.log(`${name}.png ${(fs.statSync(file).size / 1024).toFixed(0)} KB`);
  };

  await send('Page.navigate', {url});
  // The page keeps fetching assets after load, so wait for the controls the
  // capture actually needs rather than for a quiet network.
  await waitFor("!!document.querySelector('[data-mode=skirmish]')", 'landing controls', 120000);
  // The menu buttons stay disabled until the battlefield artwork and models
  // have loaded, and a failed load offers a retry instead of finishing.
  const deadline = Date.now() + 240000;
  for (;;) {
    const state = await evaluate("(()=>{const el=document.querySelector('.battlefield-loading');if(!el)return 'ready';return el.querySelector('button')?'retry':(el.textContent||'').trim();})()");
    if (state === 'ready') break;
    if (state === 'retry') { await clickCentre('.battlefield-loading button'); await sleep(1500); continue; }
    if (Date.now() > deadline) throw new Error(`battlefield never finished loading (${state})`);
    await sleep(1000);
  }
  // The landing backdrop is a 3D scene, so give the software renderer time.
  await sleep(6000);
  await shot('landing');

  await clickCentre('[data-mode=skirmish]');
  try {
    await waitFor("!!document.querySelector('[data-start=skirmish]')", 'battle setup panel', 30000);
  } catch (error) {
    console.error('setup panel missing; modal contents:', await evaluate("document.querySelector('#modal-root')?.textContent?.slice(0,160)||'(empty)'"));
    throw error;
  }
  await sleep(500);
  await shot('setup');
  await clickCentre('[data-start=skirmish]');
  await waitFor("document.querySelector('#hud') && !document.querySelector('#hud').classList.contains('hidden')", 'battle HUD', 180000);
  await waitFor("document.querySelectorAll('canvas').length>0", 'battlefield canvas');
  await sleep(10000);
  await shot('battle');

  // Zoom out the way the game expects: wheel over the battlefield.
  for (let step = 0; step < 6; step += 1) {
    await send('Input.dispatchMouseEvent', {type: 'mouseWheel', x: 800, y: 420, deltaX: 0, deltaY: 240});
    await sleep(120);
  }
  await sleep(3000);
  await shot('battle-zoomed');

  const errors = await evaluate("(window.__shotErrors||[]).length");
  console.log(JSON.stringify({url, shots: 3, pageErrors: errors, consoleErrors: consoleErrors.slice(0, 5)}));
  await send('Browser.close').catch(() => {});
  cdp.socket.close();
}

main().then(() => {
  finish(0);
}).catch(error => {
  console.error(`capture failed: ${error.message}`);
  finish(1);
});

// Edge spawns its own child processes and outlives a plain kill, which leaves
// the debugging port and the profile locked for the next run.
function finish(code) {
  if (browser) {
    try {
      spawnSync('taskkill', ['/PID', String(browser.pid), '/T', '/F'], {stdio: 'ignore', windowsHide: true});
    } catch {}
    browser.kill();
  }
  process.exit(code);
}
