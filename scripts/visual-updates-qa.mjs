import {chromium} from '@playwright/test';
import WebSocket from 'ws';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const base=process.env.QA_URL||'http://localhost:4173/',report={checks:[],errors:[],passed:false};
fs.mkdirSync('artifacts',{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
let guest,page;
try{
  const context=await browser.newContext({viewport:{width:1280,height:800},serviceWorkers:'block'});page=await context.newPage();
  page.setDefaultTimeout(90000);page.on('pageerror',error=>report.errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error'&&/WebGL|Shader|THREE/.test(message.text()))report.errors.push(message.text());});
  await page.addInitScript(()=>localStorage.setItem('crowns-settings',JSON.stringify({quality:'low',autoQuality:false,volume:0,music:false,weather:'clear'})));
  let failed=false;
  await page.route('**/*.glb',route=>{if(!failed){failed=true;return route.fulfill({status:503,body:'Deliberate artwork download failure'});}return route.continue();});
  await page.goto(base,{waitUntil:'commit',timeout:90000});
  await page.getByRole('button',{name:'Try again',exact:true}).waitFor();
  assert.equal(await page.locator('[data-mode=skirmish]').isDisabled(),true);
  assert.equal(await page.evaluate(()=>!!window.frontier?.view),false);
  await page.getByRole('button',{name:'Try again',exact:true}).click();
  await page.waitForFunction(()=>window.frontier?.view);
  assert.equal(await page.evaluate(()=>frontier.view.artDiagnostics.models),126);
  report.checks.push({missingArtworkBlocksPlay:true,retryLoadsFullCatalogue:true});
  console.log('Verified artwork retry and the complete catalogue.');

  const visuals=await page.evaluate(()=>{
    frontier.start({mode:'sandbox',map:'highlands',seed:512});frontier.action('pause');
    document.querySelector('#modal-root').style.visibility='hidden';
    const s=frontier.sim,v=frontier.view,tc=s.owned(0,'building','towncenter')[0],worker=s.owned(0,'unit','villager')[0];
    s.stop([worker.id]);v.focus(tc.x,tc.z);v.zoom=25;v.tilt=.6;v.updateCamera();v.render(.016,false);
    const building=v.nodes.get(tc.id),unit=v.nodes.get(worker.id),uniforms=v.materials.structurePalette.frontierUniforms;
    let plasterVertices=0,roofVertices=0;building.traverse(part=>{const a=part.geometry?.attributes.structureSurface;if(a)for(let i=0;i<a.count;i++){if(a.getZ(i)===3)plasterVertices++;if(a.getZ(i)===4)roofVertices++;}});
    return {building:building.userData.model3d,unit:unit.userData.model3d,art:v.artDiagnostics,plasterVertices,roofVertices,plasterMap:!!uniforms.plaster.value,roofMap:!!uniforms.roof.value,draws:v.renderer.info.render.calls};
  });
  assert.equal(visuals.building.artRevision,'civic-arcades');assert.equal(visuals.unit.artRevision,'field-gear');
  assert.ok(visuals.plasterVertices>0&&visuals.plasterMap);assert.equal(visuals.art.bytes,fs.statSync('src/assets3d/frontier-low.glb').size);
  assert.ok(visuals.roofVertices>0&&visuals.roofMap);
  report.checks.push({currentArtwork:visuals});await page.screenshot({path:'artifacts/civic-capital-close.png'});
  console.log('Verified the new civic and troop details in the live game.');

  const motion=await page.evaluate(()=>{
    const s=frontier.sim,v=frontier.view,e=s.owned(0,'unit','scout')[0];s.stop([e.id]);
    const from={x:e.x,z:e.z};v.localMotion.capture(s);e.x+=.4;s.time+=.1;v.localMotion.commit(s);
    const authoritative={x:e.x,z:e.z};v.localBlend=.25;v.render(.016,false);const quarter=e.renderX;
    v.localBlend=.75;v.render(.016,false);const threeQuarter=e.renderX;
    return {from,authoritative,after:{x:e.x,z:e.z},quarter,threeQuarter,finite:[...v.unitBatches.values()].every(b=>b.parts.every(p=>p.instanceMatrix.array.every(Number.isFinite)))};
  });
  assert.ok(Math.abs(motion.quarter-motion.from.x-.1)<1e-6&&Math.abs(motion.threeQuarter-motion.from.x-.3)<1e-6);
  assert.deepEqual(motion.after,motion.authoritative);assert.ok(motion.finite);report.checks.push({interpolatedMovement:motion});
  const current=await page.locator('meta[name=frontier-build]').getAttribute('content'),version=await(await fetch(new URL('version.json',base))).json();assert.equal(version.buildId,current);
  const newer=String(Number(current)+1);
  await page.route('**/version.json',route=>route.fulfill({json:{buildId:newer,version:version.version}}));
  await page.evaluate(()=>frontier.checkUpdate());await page.locator('#game-update:not(.hidden)').waitFor();
  await Promise.all([page.waitForURL(url=>url.searchParams.get('build')===newer),page.locator('#game-update button').click()]);
  await page.waitForFunction(()=>window.frontier?.view);
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('crowns-save')));assert.equal(saved.time,.1);assert.equal(saved.options.mode,'sandbox');
  report.checks.push({productionVersionMatchesPage:true,updateSavesSoloMatch:true,refreshUsesNewBuildURL:true});
  await page.unroute('**/version.json');

  // One browser renderer plus a real socket keeps this check within the dev
  // machine's memory budget while exercising the actual room update guard.
  await page.locator('[data-action=lan]').click();await page.locator('[data-action=lan-host]').click();
  const room=page.locator('#room-code');await room.waitFor();const code=(await room.textContent()).trim();
  const endpoint=new URL('socket',base);endpoint.protocol=endpoint.protocol==='https:'?'wss:':'ws:';
  guest=new WebSocket(endpoint);await new Promise((resolve,reject)=>{guest.once('open',resolve);guest.once('error',reject);});
  guest.send(JSON.stringify({type:'join',code,name:'Update check guest',faction:'raven'}));
  await page.locator('[data-action=lan-start]:enabled').waitFor();await page.locator('[data-action=lan-start]').click();
  await page.waitForFunction(()=>frontier.playing);await page.route('**/version.json',route=>route.fulfill({json:{buildId:newer,version:version.version}}));
  await page.evaluate(()=>frontier.checkUpdate());const update=page.locator('#game-update button');
  assert.equal(await update.isDisabled(),true);assert.equal(await update.textContent(),'Leave the room to update');
  const address=page.url();await page.evaluate(()=>document.querySelector('#game-update button').click());assert.equal(page.url(),address);
  report.checks.push({liveMultiplayerRefreshBlocked:true});await page.evaluate(()=>frontier.action('menu'));
  assert.deepEqual(report.errors,[]);report.passed=true;console.log(JSON.stringify(report));
}catch(error){report.failure=error.message;if(page){report.loading=await page.locator('.battlefield-loading').innerText().catch(()=>'');report.requests=await page.evaluate(()=>performance.getEntriesByType('resource').map(r=>({name:r.name,duration:r.duration,bytes:r.transferSize}))).catch(()=>[]);}console.log(JSON.stringify(report));throw error;}
finally{guest?.terminate();fs.writeFileSync('artifacts/visual-updates-qa.json',JSON.stringify(report,null,2));await browser.close();}
