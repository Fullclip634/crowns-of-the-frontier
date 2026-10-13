import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const report={checks:[],errors:[],passed:false},base=process.env.QA_URL||'http://localhost:4173/';
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
try{
  const page=await browser.newPage({viewport:{width:1440,height:900}});page.setDefaultTimeout(90000);
  page.on('pageerror',error=>report.errors.push(error.message));page.on('console',message=>{if(message.type()==='error')report.errors.push(message.text());});
  await page.addInitScript(()=>localStorage.setItem('crowns-settings',JSON.stringify({quality:'high',autoQuality:false,weather:'clear',volume:0,music:false})));
  await page.goto(base,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.frontier?.view);
  for(const quality of ['high','medium','low']){
    await page.evaluate(quality=>frontier.view.quality(quality),quality);
    await page.waitForFunction(quality=>frontier.view.surfaceQuality===quality&&frontier.view.artDiagnostics.detail===(quality==='high'?'high':'low'),quality);
    const info=await page.evaluate(quality=>{
      frontier.start({mode:'sandbox',map:'highlands',seed:512});frontier.action('pause');document.querySelector('#modal-root').style.visibility='hidden';
      const v=frontier.view,s=frontier.sim,stone=s.entities.find(e=>e.type==='stone'),gold=s.entities.find(e=>e.type==='gold');v.settings.fog=false;
      v.focus(stone.x,stone.z);v.zoom=21;v.tilt=.95;v.angle=2.6;v.updateCamera();s.updateFog();v.render(.016,false);
      const deposits=[stone,gold].map(e=>{
        const node=v.nodes.get(e.id)||v.createNode(e),materials=[];node.traverse(part=>{if(part.isMesh)materials.push({natural:[v.materials.rock,v.materials.oreRock].includes(part.material),metal:part.material===v.materials.gold,map:!!part.material.map,normal:!!part.material.normalMap,roughness:!!part.material.roughnessMap});});
        return {type:e.type,materials,solid:node.userData.model3d.authored};
      });
      const pebbles=v.terrainDetails.mesh;
      return {quality,models:v.artDiagnostics.models,surfaces:v.surfaceDiagnostics.loaded,deposits,pebbles:{map:!!pebbles.material.map,normal:!!pebbles.material.normalMap,shared:pebbles.material.map===v.materials.rock.map,missingColor:pebbles.material.vertexColors&&!pebbles.geometry.attributes.color},calls:v.renderer.info.render.calls};
    },quality);
    assert.equal(info.models,126);assert.equal(info.surfaces,21);assert.ok(info.pebbles.map&&info.pebbles.shared);assert.equal(info.pebbles.normal,quality!=='low');assert.equal(info.pebbles.missingColor,false);
    for(const deposit of info.deposits){assert.ok(deposit.solid);const natural=deposit.materials.filter(m=>m.natural);assert.ok(natural.length);assert.ok(natural.every(m=>m.map&&m.normal===(quality!=='low')&&m.roughness===(quality==='high')));if(deposit.type==='gold')assert.ok(deposit.materials.some(m=>m.metal));}
    report.checks.push(info);await page.screenshot({path:`artifacts/resource-stone-${quality}.png`});
    if(quality==='high'){
      await page.evaluate(()=>{const v=frontier.view,e=frontier.sim.entities.find(e=>e.type==='gold');v.focus(e.x,e.z);v.updateCamera();v.render(.016,false);});
      await page.screenshot({path:'artifacts/resource-gold-high.png'});
    }
  }
  assert.deepEqual(report.errors,[]);report.passed=true;console.log(JSON.stringify(report));
}catch(error){report.failure=error.message;console.log(JSON.stringify(report));throw error;}
finally{fs.writeFileSync('artifacts/resource-visual-qa.json',JSON.stringify(report,null,2));await browser.close();}
