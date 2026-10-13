import {chromium} from '@playwright/test';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const base=process.env.QA_URL||'http://localhost:4173/';
const targetFPS=Number(process.env.BENCH_FPS)||60;if(![30,60].includes(targetFPS))throw new Error('BENCH_FPS must be 30 or 60.');
const viewport={width:Number(process.env.BENCH_WIDTH)||1280,height:Number(process.env.BENCH_HEIGHT)||800};
const qualities=process.env.BENCH_QUALITY?[process.env.BENCH_QUALITY]:['low','high'];if(qualities.some(quality=>!['low','high'].includes(quality)))throw new Error('BENCH_QUALITY must be low or high.');
const save=JSON.parse(fs.readFileSync(process.env.PROFILE_SAVE||'artifacts/blender-custom-battle-save.json','utf8'));
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
const errors=[],samples=[];
try{
  for(const quality of qualities){
    const page=await browser.newPage({viewport});page.on('pageerror',error=>errors.push(error.message));
    await page.addInitScript(({quality,targetFPS})=>localStorage.setItem('crowns-settings',JSON.stringify({quality,frameRate:String(targetFPS),autoQuality:false,volume:0,music:false,weather:'clear'})),{quality,targetFPS});
    await page.goto(base,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.frontier?.view,null,{timeout:90000});
    const offlineCacheReady=await page.evaluate(async()=>{if(typeof frontier.checkUpdate==='function'&&navigator.serviceWorker){await navigator.serviceWorker.ready;return true;}return false;});
    await page.evaluate(save=>{
      frontier.start(save.options,save);frontier.sim.players[0].controller='human';
      const army=frontier.sim.owned(0,'unit').filter(e=>e.type!=='villager'),at=army.find(e=>e.order?.type==='attack')||army[0];
      if(at)frontier.view.focus(at.x,at.z);frontier.view.zoom=65;frontier.view.updateCamera();
    },save);
    await page.waitForTimeout(1500);
    const sample=await page.evaluate(async()=>{
      const v=frontier.view,render=v.render,times=[],ticks=[],tick=frontier.sim.tick;
      let frames=0;
      v.render=function(...args){const before=performance.now();const result=render.apply(this,args);times.push(performance.now()-before);frames++;return result;};
      frontier.sim.tick=function(...args){const before=performance.now();const result=tick.apply(this,args);ticks.push(performance.now()-before);return result;};
      const start=performance.now();await new Promise(resolve=>setTimeout(resolve,5000));const elapsed=performance.now()-start;
      v.render=render;frontier.sim.tick=tick;
      const stats=values=>{values.sort((a,b)=>a-b);return {samples:values.length,median:values[Math.floor(values.length*.5)]||0,p95:values[Math.floor(values.length*.95)]||0,max:values.at(-1)||0};};
      const gl=v.renderer.getContext(),debug=gl.getExtension('WEBGL_debug_renderer_info');
      return {quality:v.settings.quality,headless:true,physicalPhone:false,world:frontier.sim.worldSize,players:frontier.sim.players.length,units:frontier.sim.entities.filter(e=>e.kind==='unit'&&e.hp>0).length,
        renderedFPS:frames*1000/elapsed,sampleWindow:{requestedMilliseconds:5000,elapsedMilliseconds:elapsed,frames,prolongedStall:elapsed>6250},renderSubmitMilliseconds:stats(times),simulationTickMilliseconds:stats(ticks),gpu:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),
        render:{...v.renderer.info.render},memory:{...v.renderer.info.memory},packedUnits:v.unitRenderDiagnostics,jointPoses:{...v.jointPoseDiagnostics,cachedDefinitions:v.jointPoseCache.size},interactions:v.interactionDiagnostics,contacts:v.contactDiagnostics,art:v.artDiagnostics,surfaces:v.surfaceDiagnostics,cover:v.groundCoverDiagnostics};
    });
    assert.equal(sample.players,8);assert.equal(sample.world,400);assert.ok(sample.renderedFPS>0);assert.ok(sample.packedUnits.drawn<sample.units);samples.push(sample);
    sample.profile=process.env.BENCH_PROFILE||'Development laptop headless stress';sample.viewport=viewport;sample.targetFPS=targetFPS;sample.targetMet=sample.renderedFPS>=targetFPS*.97;sample.offlineCacheReady=offlineCacheReady;
    await page.screenshot({path:`artifacts/late-battle-${quality}.png`});await page.close();console.log(JSON.stringify(sample));
  }
  assert.deepEqual(errors,[]);
  if(process.env.REQUIRE_FPS_TARGET==='true')assert.ok(samples.every(sample=>sample.targetMet),'The declared hardware/profile does not meet its frame-rate target.');
}finally{fs.writeFileSync('artifacts/performance-qa.json',JSON.stringify({samples,errors},null,2));await browser.close();}
