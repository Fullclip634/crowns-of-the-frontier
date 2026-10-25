// Production-build visual checks. QA_BROWSER_ENDPOINT optionally uses an
// existing local browser; viewport emulation does not measure phone hardware.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {createGameServer} from '../server/http-app.js';
import {capturePaintedBattlefield} from './painted-battlefield-qa.mjs';

const phase=process.env.QA_RIVER_PHASE||'after',out=path.resolve('artifacts/river-bridge-'+phase);
fs.mkdirSync(out,{recursive:true});
const {server,rooms}=createGameServer({root:path.resolve(process.env.QA_GAME_DIST||'dist')});
let browser,page;const report={phase,passed:false,checks:[],errors:[],scope:'Production rendering and emulated viewports; not physical-device FPS'};
try{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  browser=process.env.QA_BROWSER_ENDPOINT?await chromium.connectOverCDP(process.env.QA_BROWSER_ENDPOINT):await chromium.launch({channel:'msedge',headless:true});
  for(const profile of [{name:'high',quality:'high',renderer:'webgpu',width:1000,height:700},{name:'balanced',quality:'medium',renderer:'webgpu',width:1000,height:700},{name:'phone',quality:'low',renderer:'webgl',width:568,height:320,touch:true}]){
    if(phase==='before'&&profile.name==='balanced')continue;
    console.log('River and bridge '+profile.name+' '+phase);
    const context=await browser.newContext({viewport:{width:profile.width,height:profile.height},isMobile:!!profile.touch,hasTouch:!!profile.touch,serviceWorkers:'block'});
    page=await context.newPage();page.setDefaultTimeout(120000);page.on('pageerror',error=>report.errors.push(error.message));
    page.on('console',message=>{if(message.type()==='error')report.errors.push(message.text());});
    await page.addInitScript(quality=>localStorage.setItem('crowns-settings',JSON.stringify({quality,autoQuality:false,fog:false,weather:'clear',lighting:'day',music:false,volume:0,edgeScroll:false})),profile.quality);
    await page.goto(`http://127.0.0.1:${server.address().port}/?renderer=${profile.renderer}`,{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>window.frontier?.view&&!frontier.view.graphicsLoading);
    report.buildId??=await page.locator('meta[name="frontier-build"]').getAttribute('content');
    await page.evaluate(()=>{const view=frontier.view;window.qaRender=view.render.bind(view);view.render=()=>false;window.qaDraw=async()=>{await view.renderer.backend?.device?.queue?.onSubmittedWorkDone();qaRender(.016,false);await view.renderer.backend?.device?.queue?.onSubmittedWorkDone();};});
    for(const [map,scene] of [['valley','bridge'],['rivers','bridge'],['valley','river']]){
      await page.evaluate(({map,scene})=>{
        frontier.start({mode:'sandbox',map,seed:512});frontier.sim.tick=()=>{};frontier.action('pause');
        document.querySelector('#modal-root').style.visibility='hidden';document.querySelector('#hud').style.visibility='hidden';
        const view=frontier.view,center=map==='rivers'?19:0;
        for(const [type,x,z]of [['villager',-3,-2],['knight',0,1],['ram',4,0]])frontier.sim.addUnit(type,0,center+x,z);
        view.focus(center,scene==='bridge'?0:28);view.zoom=scene==='bridge'?48:27;view.angle=.85;view.tilt=.6;view.clock=4;view.updateCamera();
      },{map,scene});
      for(let i=0;i<4;i++)await page.evaluate(()=>qaDraw());
      const state=await page.evaluate(()=>{
        const view=frontier.view,water=view.waterMeshes[0].geometry;
        return {renderer:document.documentElement.dataset.renderer,quality:view.renderQuality,fatal:view.graphicsFatal||null,error:view.graphicsError||null,bridge:view.bridgeDiagnostics,water:{shallow:view.materials.water.frontierWaterShallow?.value.getHexString(),deep:view.materials.water.frontierWaterDeep?.value.getHexString(),opacity:view.materials.water.opacity,meshes:view.waterMeshes.length,vertices:water.attributes.position.count,version:water.attributes.position.version,uploads:view.waterDiagnostics?.geometryUploadsPerFrame},render:view.renderer.info.render,overflow:document.documentElement.scrollWidth>innerWidth};
      });
      assert.equal(state.renderer,profile.renderer);assert.equal(state.quality,profile.quality);assert.equal(state.fatal,null);assert.equal(state.error,null);assert.equal(state.overflow,false);assert.equal(state.water.uploads,0);
      if(phase!=='before'){assert.equal(state.bridge.clearWidth,13.6);assert.equal(state.water.deep,'344f3f');assert.equal(state.water.shallow,'838268');}
      const capture=await capturePaintedBattlefield(page,path.join(out,`${profile.name}-${map}-${scene}.png`),{manual:true});
      await page.evaluate(()=>{frontier.view.clock=9;});await page.evaluate(()=>qaDraw());assert.equal(await page.evaluate(()=>frontier.view.waterMeshes[0].geometry.attributes.position.version),state.water.version);
      report.checks.push({profile:profile.name,map,scene,pixels:capture.pixels,...state});
    }
    await context.close();page=null;
  }
  assert.deepEqual(report.errors,[]);report.passed=true;
}catch(error){report.error=error.stack;process.exitCode=1;console.error(error.stack);}
finally{fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({phase,passed:report.passed,checks:report.checks.length,error:report.error}));await browser?.close().catch(()=>{});rooms.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
