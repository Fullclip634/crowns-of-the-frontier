import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// Renders the real game in a headless browser and writes screenshots for
// visual sign-off. Covers the new biome kinds plus the moonlit-night look.
const base=process.env.QA_URL||'http://localhost:4173/';
const output=process.env.QA_OUTPUT||'artifacts/biome-review';
const maps=process.env.QA_MAPS?process.env.QA_MAPS.split(','):['highlands','arid','tundra','volcanic','highland','woodland','riverland','archipelago'];
fs.mkdirSync(output,{recursive:true});
const report={url:base,maps:[],errors:[],passed:false};
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist','--use-gl=angle','--use-angle=swiftshader']});
try{
  const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
  page.setDefaultTimeout(90000);
  page.on('pageerror',error=>report.errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')report.errors.push(message.text());});
  await page.addInitScript(()=>localStorage.setItem('crowns-settings',JSON.stringify({quality:'medium',autoQuality:false,weather:'clear',volume:0,music:false,lighting:'day',fog:false})));
  await page.goto(base,{waitUntil:'domcontentloaded',timeout:90000});
  await page.waitForFunction(()=>window.frontier?.view);
  for(const map of maps){
    const info=await page.evaluate(map=>{
      frontier.start({mode:'sandbox',map,seed:512});frontier.action('pause');
      const modal=document.querySelector('#modal-root');if(modal)modal.style.visibility='hidden';
      const v=frontier.view,sim=frontier.sim,tc=sim.owned(0,'building','towncenter')[0];
      v.settings.fog=false;v.focus(tc.x+14,tc.z-10);v.zoom=64;v.tilt=.64;v.angle=.62;v.updateCamera();
      v.render(.016,false);v.render(.016,false);
      const ground=v.groundSurface?.geometry?.attributes?.position;
      return {map,biome:map,entities:sim.entities.length,
        relief:ground?Number((v.groundSurface.geometry.boundingBox.max.y-v.groundSurface.geometry.boundingBox.min.y).toFixed(2)):null,
        drawCalls:v.renderer.info.render.calls,triangles:v.renderer.info.render.triangles,
        finite:ground?ground.array.every(Number.isFinite):false,
        lighting:v.lightingState?.label||'Day'};
    },map);
    assert.equal(info.finite,true,map+' terrain is finite');
    assert.ok(info.drawCalls>0,map+' actually rendered');
    report.maps.push(info);
    await page.screenshot({path:`${output}/${map}.png`,timeout:240000,animations:'disabled'});
  }
  // Moonlit night on a cliff map, plus a fortified-wall comparison.
  const night=await page.evaluate(()=>{
    frontier.start({mode:'sandbox',map:'highland',seed:512});frontier.action('pause');
    const modal=document.querySelector('#modal-root');if(modal)modal.style.visibility='hidden';
    const v=frontier.view,sim=frontier.sim,tc=sim.owned(0,'building','towncenter')[0];
    v.settings.fog=false;v.settings.lighting='night';v.focus(tc.x+14,tc.z-10);v.zoom=64;v.tilt=.64;v.angle=.62;v.updateCamera();
    v.render(.016,false);v.render(.016,false);v.render(.016,false);
    return {label:v.lightingState?.label,sun:v.sun.intensity,hemi:v.hemi.intensity,exposure:v.renderer.toneMappingExposure};
  });
  assert.equal(night.label,'Night');
  assert.ok(night.sun>.9&&night.hemi>.55,'moonlit night stays readable');
  report.night=night;
  await page.screenshot({path:`${output}/highland-night.png`,timeout:240000,animations:'disabled'});
  assert.deepEqual(report.errors,[]);
  report.passed=true;
  console.log(JSON.stringify(report,null,2));
}catch(error){
  report.failure=error.message;console.error(JSON.stringify(report,null,2));process.exitCode=1;
}finally{
  fs.writeFileSync(`${output}/report.json`,JSON.stringify(report,null,2));
  await browser.close();
}
