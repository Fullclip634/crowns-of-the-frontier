import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const surfaceMaps=JSON.parse(fs.readFileSync(new URL('../src/assets3d/textures/manifest.json',import.meta.url),'utf8')).flatMap(asset=>asset.maps);
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
try {
  const context=await browser.newContext({viewport:{width:1280,height:800}}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',e=>{if(e.type()==='error')console.log('browser:',e.text());});page.on('requestfailed',r=>console.log('failed:',r.url(),r.failure()?.errorText));await page.goto('http://localhost:4173/',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>!!navigator.serviceWorker.controller,{},{timeout:90000});
  assert.ok(await page.evaluate(()=>!!navigator.serviceWorker.controller));
  const cached=await page.evaluate(async()=>{const keys=await caches.keys();const c=await caches.open(keys[0]);return(await c.keys()).map(r=>r.url);});assert.equal(cached.filter(url=>url.endsWith('.glb')).length,2);assert.equal(cached.filter(url=>url.endsWith('.jpg')).length,surfaceMaps.length);console.log(`Offline cache includes both Blender catalogues and all ${surfaceMaps.length} surface maps.`);
  await context.setOffline(true);await page.reload({waitUntil:'load'});await page.waitForFunction(()=>!!window.frontier?.view,{},{timeout:90000});
  await page.getByRole('button',{name:'Begin your reign'}).click();await page.getByRole('button',{name:'Enter the frontier'}).click();assert.equal(await page.evaluate(()=>frontier.playing),true);assert.deepEqual(errors,[]);
  await page.screenshot({path:'artifacts/offline-production.png'});console.log(JSON.stringify({production:true,offlineReload:true,offlineGameplay:true,errors},null,2));
} finally {await browser.close();}
