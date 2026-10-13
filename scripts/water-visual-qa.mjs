import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const base=process.env.QA_URL||'http://localhost:4173/',report={checks:[],errors:[],passed:false};
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
try{
  const page=await browser.newPage({viewport:{width:1280,height:720}});page.setDefaultTimeout(90000);
  page.on('pageerror',error=>report.errors.push(error.message));page.on('console',message=>{if(message.type()==='error')report.errors.push(message.text());});
  await page.addInitScript(()=>localStorage.setItem('crowns-settings',JSON.stringify({quality:'high',autoQuality:false,volume:0,music:false,weather:'clear'})));
  await page.goto(base,{waitUntil:'domcontentloaded',timeout:90000});await page.waitForFunction(()=>window.frontier?.view);
  const waves=await page.evaluate(()=>{
    frontier.start({mode:'tides',map:'coast',seed:512});frontier.action('pause');document.querySelector('#modal-root').style.visibility='hidden';
    const v=frontier.view;v.settings.fog=false;v.focus(0,10);v.zoom=24;v.tilt=.6;v.updateCamera();
    const geometry=v.waterMeshes[0].geometry,position=geometry.attributes.position,normal=geometry.attributes.normal;
    const before={position:position.version,normal:normal.version,values:position.array.slice()},gl=v.renderer.getContext();
    const pixels=()=>{v.render(0,false);const bytes=new Uint8Array(64*64*4);gl.readPixels(Math.floor(gl.drawingBufferWidth/2)-32,Math.floor(gl.drawingBufferHeight/2)-32,64,64,gl.RGBA,gl.UNSIGNED_BYTE,bytes);return bytes;};
    v.objects.visible=false;v.clock=0;const first=pixels();v.clock=1.7;const second=pixels();let changed=0,strong=0,total=0;
    for(let i=0;i<first.length;i+=4){const delta=Math.abs(first[i]-second[i])+Math.abs(first[i+1]-second[i+1])+Math.abs(first[i+2]-second[i+2]);total+=delta;if(delta>0)changed++;if(delta>3)strong++;}
    v.objects.visible=true;v.render(0,false);
    return {diagnostics:v.waterDiagnostics,uniformTime:v.materials.water.frontierWaveTime.value,changedPixels:changed,strongChangedPixels:strong,colorDifference:total,objectsExcludedFromPixelProbe:true,
      unchangedGeometry:position.version===before.position&&normal.version===before.normal&&position.array.every((value,i)=>value===before.values[i]),
      boundHeight:geometry.boundingBox.max.y-geometry.boundingBox.min.y,calls:v.renderer.info.render.calls,art:v.artDiagnostics};
  });
  report.checks.push({high:waves});
  assert.equal(waves.uniformTime,1.7);assert.equal(waves.diagnostics.geometryUploadsPerFrame,0);
  assert.ok(waves.unchangedGeometry&&waves.boundHeight>=.109);assert.ok(waves.changedPixels>100&&waves.colorDifference>1000);
  await page.screenshot({path:'artifacts/water-waves-high.png'});
  await page.evaluate(()=>frontier.view.quality('low'));await page.waitForFunction(()=>frontier.view.surfaceQuality==='low'&&frontier.view.artDiagnostics.detail==='low');
  const low=await page.evaluate(()=>{const v=frontier.view;v.clock=2.8;v.render(0,false);return {diagnostics:v.waterDiagnostics,time:v.materials.water.frontierWaveTime.value,finite:v.waterMeshes.every(mesh=>mesh.geometry.attributes.position.array.every(Number.isFinite))};});
  assert.equal(low.time,2.8);assert.equal(low.diagnostics.meshes,1);assert.ok(low.finite);report.checks.push({low});
  const cleanup=await page.evaluate(()=>{const v=frontier.view;let disposed=false;v.waterMeshes[0].geometry.addEventListener('dispose',()=>disposed=true);frontier.start({mode:'sandbox',map:'highlands',seed:512});v.render(0,false);return {disposed,waterMeshes:v.waterMeshes.length};});
  assert.ok(cleanup.disposed);assert.equal(cleanup.waterMeshes,0);report.checks.push({sceneCleanup:cleanup});
  assert.deepEqual(report.errors,[]);report.passed=true;console.log(JSON.stringify(report));
}catch(error){report.failure=error.message;console.log(JSON.stringify(report));throw error;}
finally{fs.writeFileSync('artifacts/water-visual-qa.json',JSON.stringify(report,null,2));await browser.close();}
