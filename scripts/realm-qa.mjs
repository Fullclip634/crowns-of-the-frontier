import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
const base=process.env.QA_URL||'http://localhost:4173/',errors=[],reports=[];fs.mkdirSync('artifacts',{recursive:true});
const watch=page=>{page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});};
try{
  const page=await browser.newPage({viewport:{width:1440,height:900}});watch(page);await page.goto(base,{waitUntil:'networkidle'});await page.waitForFunction(()=>window.frontier?.view);
  await page.evaluate(()=>{frontier.start({mode:'sandbox',map:'highlands',faction:'alder',difficulty:'normal',seed:512});frontier.sim.owned(0,'unit','villager').forEach(e=>frontier.sim.stop([e.id]));const s=frontier.sim;
    const sites=[['keep',-15,17],['gate',-8,33],['tower',-15,43],['farm',-36,49],['farm',-29,49],['market',-25,4],['range',-42,7],['stable',-48,18],['blacksmith',-51,35],['workshop',-19,54],['monastery',-55,51],['camp',-56,2],['mine',-21,-9],['wonder',-6,0]];
    for(const[type,x,z]of sites)s.addBuilding(type,0,x,z,true);for(let z=22;z<=45;z+=2.85)s.addBuilding('wall',0,-8,z,true);
    for(let i=0;i<30;i++)s.addUnit(['spearman','swordsman','archer','knight','ram','catapult'][i%6],0,-33+i%10*2.5,36+Math.floor(i/10)*2.3);
    s.updateFog();frontier.view.focus(-30,28);frontier.view.angle=.65;frontier.view.zoom=84;frontier.view.tilt=.65;frontier.view.updateCamera();
  });await page.waitForTimeout(1200);await page.getByRole('button',{name:'Toggle battlefield panels'}).click();await page.screenshot({path:'artifacts/realm3d-kingdom.png'});
  const scene=await page.evaluate(()=>({buildings:frontier.sim.owned(0,'building').length,units:frontier.sim.population(0),calls:frontier.view.renderer.info.render.calls,triangles:frontier.view.renderer.info.render.triangles,heightRange:frontier.view.groundSurface.geometry.boundingBox.max.y-frontier.view.groundSurface.geometry.boundingBox.min.y,packedTrees:frontier.view.forest.reduce((n,b)=>n+b.sets.reduce((k,s)=>k+s.ids.length,0),0)}));assert.ok(scene.heightRange>10);assert.ok(scene.buildings>20);reports.push({kingdom:scene});
  await page.getByRole('button',{name:'Toggle battlefield panels'}).click();
  await page.evaluate(()=>{frontier.start({mode:'sandbox',map:'highlands',faction:'alder',difficulty:'normal',seed:512});const e=frontier.sim.owned(0,'unit','villager')[0];frontier.sim.stop([e.id]);frontier.select([e.id]);frontier.action('inspect');});
  await page.waitForFunction(()=>document.querySelector('#model-portrait canvas')&&frontier.view.modelPortrait?.model);
  await page.waitForTimeout(200);await page.screenshot({path:'artifacts/realm3d-villager.png'});assert.equal(await page.evaluate(()=>frontier.view.zoom),16);assert.ok(await page.evaluate(()=>!frontier.view.portraitDisabled));
  const aligned=await page.evaluate(()=>{const e=frontier.sim.owned(0,'unit','villager')[0],node=frontier.view.nodes.get(e.id);return Math.abs(node.position.y-frontier.view.groundHeight(e.x,e.z))<.001;});assert.ok(aligned);reports.push({inspect:true,livePortrait:true,surfaceAligned:true});
  // Every biome is exercised by the live renderer, including naval water and faction roofs.
  for(const map of ['valley','winter','desert','canyon','rivers','coast']){
    await page.evaluate(map=>{frontier.start({mode:map==='coast'?'tides':'sandbox',map,faction:map==='desert'?'sun':'raven',difficulty:'normal',seed:512});},map);
    await page.waitForTimeout(180);assert.ok(await page.evaluate(()=>frontier.view.renderer.info.render.triangles>0));
  }
  await page.evaluate(()=>{const e=frontier.sim.owned(0,'unit','galley')[0];frontier.select([e.id]);frontier.action('inspect');});await page.waitForTimeout(300);await page.screenshot({path:'artifacts/realm3d-fleet.png'});
  assert.equal(await page.evaluate(()=>frontier.view.waterMeshes.length),1);reports.push({biomes:7,naval:true});await page.close();

  const phone=await browser.newPage({viewport:{width:844,height:390},isMobile:true,hasTouch:true,deviceScaleFactor:2});watch(phone);await phone.goto(base,{waitUntil:'networkidle'});await phone.waitForFunction(()=>window.frontier?.view);
  await phone.getByRole('button',{name:'Begin your reign'}).tap();await phone.getByRole('button',{name:'Enter the frontier'}).tap();await phone.waitForFunction(()=>frontier.playing);
  await phone.evaluate(()=>{const e=frontier.sim.owned(0,'unit','villager')[0];frontier.select([e.id]);});await phone.waitForFunction(()=>!!document.querySelector('#model-portrait canvas'));
  await phone.locator('[data-action=inspect]').tap();await phone.getByRole('button',{name:'Toggle battlefield panels'}).tap();
  assert.equal(await phone.locator('.bottom-hud').isVisible(),false);await phone.getByRole('button',{name:'Rotate camera left',exact:true}).tap();await phone.waitForTimeout(200);await phone.screenshot({path:'artifacts/realm3d-phone.png'});
  await phone.getByRole('button',{name:'Toggle battlefield panels'}).tap();assert.equal(await phone.locator('.bottom-hud').isVisible(),true);assert.equal(await phone.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  reports.push({phone:true,inspect:true,panelsToggle:true,portrait:true});assert.deepEqual(errors,[]);console.log(JSON.stringify({reports,errors},null,2));await phone.close();
}finally{await browser.close();}
