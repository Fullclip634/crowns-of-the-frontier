import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const surfaceMapCount=JSON.parse(fs.readFileSync(new URL('../src/assets3d/textures/manifest.json',import.meta.url),'utf8')).reduce((count,asset)=>count+asset.maps.length,0);
const base=process.env.QA_URL||'http://localhost:4173/',report={checks:[],errors:[],passed:false};
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
try{
  const page=await browser.newPage({viewport:{width:1440,height:900}});page.setDefaultTimeout(90000);
  page.on('pageerror',error=>report.errors.push(error.message));page.on('console',message=>{if(message.type()==='error')report.errors.push(message.text());});
  await page.addInitScript(()=>localStorage.setItem('crowns-settings',JSON.stringify({quality:'high',autoQuality:false,weather:'clear',volume:0,music:false})));
  await page.goto(base,{waitUntil:'domcontentloaded',timeout:90000});await page.waitForFunction(()=>window.frontier?.view);
  for(const map of ['highlands','winter','desert','canyon','valley','rivers','coast']){
    const info=await page.evaluate(map=>{
      frontier.start({mode:map==='coast'?'tides':'sandbox',map,seed:512});frontier.action('pause');document.querySelector('#modal-root').style.visibility='hidden';
      const s=frontier.sim,v=frontier.view,tc=s.owned(0,'building','towncenter')[0];v.settings.fog=false;v.focus(tc.x+9,tc.z-6);v.zoom=58;v.tilt=.62;v.angle=.7;v.updateCamera();v.render(.016,false);v.render(.016,false);
      return {map,land:v.terrainDiagnostics,details:v.terrainDetailDiagnostics,surfaces:v.surfaceDiagnostics,uniforms:Object.keys(v.groundSurface.material.frontierTerrainUniforms||{}),
        calls:v.renderer.info.render.calls,triangles:v.renderer.info.render.triangles,finite:v.groundSurface.geometry.attributes.position.array.every(Number.isFinite)};
    },map);
    assert.ok(info.finite&&info.land.rockyVertices>0);assert.ok(info.uniforms.includes('roads')&&info.uniforms.includes('soil')&&info.uniforms.includes('rock'));assert.equal(info.surfaces.loaded,surfaceMapCount);
    assert.ok(info.details.capacity<=360&&info.details.drawCalls<=1);report.checks.push({biome:info});await page.screenshot({path:`artifacts/terrain-${map}-high.png`});
  }
  const memory=await page.evaluate(()=>{
    const records=[],disposed=[];
    for(let i=0;i<4;i++){
      const previous=frontier.view.groundSurface.material.frontierOwnedTextures[0];let released=false;previous.addEventListener('dispose',()=>released=true);
      frontier.start({mode:'sandbox',map:'highlands',seed:512});frontier.action('pause');document.querySelector('#modal-root').style.visibility='hidden';frontier.view.render(.016,false);
      records.push({...frontier.view.renderer.info.memory});disposed.push(released);
    }return {records,disposed};
  });
  assert.ok(memory.disposed.every(Boolean));assert.equal(memory.records[3].geometries,memory.records[1].geometries);assert.equal(memory.records[3].textures,memory.records[1].textures);report.checks.push({sceneMemory:memory});
  await page.evaluate(()=>frontier.view.quality('low'));await page.waitForFunction(()=>frontier.view.surfaceQuality==='low'&&frontier.view.artDiagnostics.detail==='low');
  const low=await page.evaluate(()=>({land:frontier.view.terrainDiagnostics,details:frontier.view.terrainDetailDiagnostics,normal:!!frontier.view.groundSurface.material.normalMap,models:frontier.view.artDiagnostics.models}));
  assert.equal(low.models,126);assert.equal(low.normal,false);assert.ok(low.details.capacity<=120);report.checks.push({low});await page.screenshot({path:'artifacts/terrain-highlands-low.png'});
  assert.deepEqual(report.errors,[]);report.passed=true;console.log(JSON.stringify(report));
}catch(error){report.failure=error.message;console.log(JSON.stringify(report));throw error;}
finally{fs.writeFileSync('artifacts/terrain-visual-qa.json',JSON.stringify(report,null,2));await browser.close();}
