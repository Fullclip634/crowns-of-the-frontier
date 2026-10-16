import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const surfaceMaps=JSON.parse(fs.readFileSync(new URL('../src/assets3d/textures/manifest.json',import.meta.url),'utf8')).flatMap(asset=>asset.maps);
const compressedMaps=JSON.parse(fs.readFileSync(new URL('../src/assets3d/textures/ktx2/manifest.json',import.meta.url),'utf8')).maps;
const browser=process.env.QA_BROWSER_ENDPOINT?await chromium.connectOverCDP(process.env.QA_BROWSER_ENDPOINT):await chromium.launch({channel:'msedge',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
try {
  const context=await browser.newContext({viewport:process.env.QA_OFFLINE_COMPACT==='1'?{width:960,height:640}:{width:1280,height:800}}),page=await context.newPage(),errors=[];
  page.setDefaultNavigationTimeout(90000);page.setDefaultTimeout(90000);
  await page.addInitScript(()=>localStorage.setItem('crowns-settings',JSON.stringify({quality:'low',autoQuality:false,weather:'clear',music:false,volume:0})));
  page.on('pageerror',e=>errors.push(e.message));page.on('console',e=>{if(e.type()==='error')console.log('browser:',e.text());});page.on('requestfailed',r=>console.log('failed:',r.url(),r.failure()?.errorText));await page.goto(process.env.QA_URL||'http://localhost:4173/',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>!!navigator.serviceWorker.controller,{},{timeout:90000});
  assert.ok(await page.evaluate(()=>!!navigator.serviceWorker.controller));
  const cached=await page.evaluate(async()=>{const keys=(await caches.keys()).filter(key=>key.startsWith('frontier-'));assertSingle(keys);const c=await caches.open(keys[0]);return(await c.keys()).map(r=>r.url);function assertSingle(keys){if(keys.length!==1)throw new Error('Expected one current offline game cache');}});assert.equal(cached.filter(url=>url.endsWith('.glb')).length,3);assert.equal(cached.filter(url=>url.endsWith('.jpg')).length,surfaceMaps.length);assert.equal(cached.filter(url=>url.endsWith('.ktx2')).length,compressedMaps.length);assert.equal(cached.filter(url=>/basis_transcoder-.*\.js$/.test(url)).length,1);assert.equal(cached.filter(url=>/basis_transcoder-.*\.wasm$/.test(url)).length,1);console.log(`Offline cache includes all three Blender catalogues, ${surfaceMaps.length} original maps, ${compressedMaps.length} compressed maps and both decoder assets.`);
  await context.setOffline(true);await page.reload({waitUntil:'load'});await page.waitForFunction(()=>!!window.frontier?.view,{},{timeout:90000});
  await page.getByRole('button',{name:'Begin your reign'}).click();await page.getByRole('button',{name:'Enter the frontier'}).click();assert.equal(await page.evaluate(()=>frontier.playing),true);assert.deepEqual(errors,[]);
  const localQuality=await checkOfflineSwitch(page);
  await page.screenshot({path:'artifacts/offline-production.png'});const report={localQuality,buildId:await page.locator('meta[name="frontier-build"]').getAttribute('content'),production:true,offlineReload:true,offlineGameplay:true,catalogues:3,originalMaps:surfaceMaps.length,compressedMaps:compressedMaps.length,decoderAssets:2,errors};fs.writeFileSync('artifacts/offline-production-qa.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
} finally {await browser.close();}

async function checkOfflineSwitch(page){
  await page.evaluate(()=>{
    const renderer=frontier.view.renderer,compile=renderer.compileAsync;
    window.qaOfflineReady=false;window.qaOfflineFailure=null;
    renderer.compileAsync=function(...args){window.qaOfflineHeld=true;return new Promise(resolve=>window.qaOfflineRelease=resolve).then(()=>compile.apply(renderer,args));};
    window.qaOfflineQuality=frontier.view.quality('medium').then(applied=>{window.qaOfflineApplied=applied;window.qaOfflineReady=true;}).finally(()=>renderer.compileAsync=compile);
  });
  await page.waitForFunction(()=>window.qaOfflineHeld,null,{timeout:180000});
  const held=await page.evaluate(async()=>{
    const start=frontier.sim.time;let frames=0;
    await new Promise(resolve=>{const next=()=>{if(++frames>=24)resolve();else requestAnimationFrame(next);};requestAnimationFrame(next);});
    return {start,end:frontier.sim.time,frames,progressVisible:!document.querySelector('#graphics-status').classList.contains('hidden'),busy:document.querySelector('#world').getAttribute('aria-busy'),rebuilding:!!frontier.view.graphicsRebuilding};
  });
  assert.equal(held.end,held.start,'Local combat must wait while the battlefield frame is held');assert.ok(held.frames>=24&&held.rebuilding&&held.progressVisible&&held.busy==='true');
  await page.evaluate(()=>qaOfflineRelease());
  await page.waitForFunction(()=>window.qaOfflineReady,null,{timeout:180000});
  assert.equal(await page.evaluate(()=>window.qaOfflineApplied),true);
  await page.waitForFunction(time=>frontier.sim.time>time,held.end);
  const frame=await page.evaluate(()=>frontier.view.renderer.info.render.frame);await page.waitForFunction(before=>frontier.view.renderer.info.render.frame>before,frame);
  const result=await page.evaluate(()=>({quality:frontier.view.renderQuality,surfaces:frontier.view.surfaceDiagnostics,units:frontier.view.unitRenderDiagnostics.drawn,shadows:frontier.view.renderer.shadowMap.enabled,shaderErrors:frontier.view.renderer.info.programs.filter(p=>p.diagnostics?.runnable===false).length,progressHidden:document.querySelector('#graphics-status').classList.contains('hidden'),time:frontier.sim.time}));
  assert.equal(result.quality,'medium');assert.equal(result.surfaces.compressed,10);assert.equal(result.surfaces.loaded,17);assert.equal(result.surfaces.codecFallbacks,0);assert.ok(result.units>0&&result.shadows&&result.progressHidden);assert.equal(result.shaderErrors,0);
  return {held,resumed:result};
}
