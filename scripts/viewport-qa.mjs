import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const base=process.env.QA_URL||'http://localhost:4174/',report={checks:[],errors:[],passed:false};
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
try{
  const page=await browser.newPage({viewport:{width:1280,height:720}});page.setDefaultTimeout(90000);page.on('pageerror',e=>report.errors.push(e.message));page.on('console',message=>{if(message.type()==='error')report.errors.push(message.text());});
  await page.addInitScript(()=>localStorage.setItem('crowns-settings',JSON.stringify({quality:'low',autoQuality:false,weather:'clear',music:false,volume:0})));
  await page.goto(base,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.frontier?.view);
  for(const quality of ['low','high']){
    await page.evaluate(q=>frontier.view.quality(q),quality);await page.waitForFunction(q=>frontier.view.surfaceQuality===q&&frontier.view.artDiagnostics.detail===(q==='high'?'high':'low'),quality);
    const check=await page.evaluate(()=>{
      frontier.start({mode:'custom',map:'highlands',mapSize:'huge',seed:512});frontier.action('pause');document.querySelector('#modal-root').style.visibility='hidden';
      const v=frontier.view,s=frontier.sim,workers=s.owned(0,'unit','villager').slice(0,2);s.stop(s.owned(0,'unit').map(e=>e.id));s.visible.fill(1);s.explored.fill(1);v.updateFog();v.localMotion.clear();
      workers.forEach((e,i)=>{e.x=i?80:-80;e.z=0;e.carry=18;e.carryType='wood';});
      const render=v.renderer.render;let captured;
      v.renderer.render=function(...args){captured={forest:v.forest.flatMap(batch=>batch.sets.flatMap(set=>[...set.ids])),units:[...v.unitBatches.values()].flatMap(batch=>[...batch.renderIds]),cargo:{...v.interactionDiagnostics.cargo},contacts:{...v.contactDiagnostics}};return render.apply(this,args);};
      const locations=[];
      try{for(const [i,x]of [-80,80,-80].entries()){
        v.zoom=25;v.focus(x,0);v.render(0,false);const first=structuredClone(captured);v.render(0,false);const settled=structuredClone(captured),expected=workers[i===1?1:0],outside=workers[i===1?0:1];
        locations.push({x,first,settled,expected:expected.id,outside:outside.id});
      }}finally{v.renderer.render=render;}
      return {quality:v.settings.quality,locations,models:v.artDiagnostics.models};
    });
    for(const location of check.locations){assert.ok(location.first.forest.length>0,'fixture must contain visible solid trees');assert.deepEqual(location.first.forest,location.settled.forest,'camera pan must pack the forest before the first GPU submission');assert.ok(location.first.units.includes(location.expected));assert.ok(!location.first.units.includes(location.outside));assert.equal(location.first.cargo.wood,1);assert.ok(location.first.contacts.culled>0);}
    assert.equal(check.models,126);report.checks.push({quality,locations:check.locations.map(e=>({x:e.x,immediateForest:e.first.forest.length,visibleWorkers:e.first.units.filter(id=>id===e.expected).length,cargo:e.first.cargo.wood,contacts:e.first.contacts})),sameFrameForest:true});
    await page.screenshot({path:`artifacts/viewport-${quality}.png`});
  }
  await page.setViewportSize({width:568,height:320});
  const resized=await page.evaluate(()=>{const v=frontier.view;v.resize();v.render(0,false);return {cameraAspect:v.camera.aspect,forestAspect:v.lastForestAspect,height:v.lastForestHeight,canvasWidth:v.renderer.domElement.getBoundingClientRect().width,canvasHeight:v.renderer.domElement.getBoundingClientRect().height};});
  assert.equal(resized.cameraAspect,resized.forestAspect);assert.equal(resized.height,320);assert.equal(resized.canvasWidth,568);assert.equal(resized.canvasHeight,320);report.checks.push({landscapeResize:resized});
  assert.deepEqual(report.errors,[]);report.passed=true;console.log(JSON.stringify(report,null,2));
}finally{fs.writeFileSync('artifacts/viewport-qa.json',JSON.stringify(report,null,2));await browser.close();}
