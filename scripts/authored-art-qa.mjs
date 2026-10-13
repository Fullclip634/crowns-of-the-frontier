import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const base=process.env.QA_URL||'http://localhost:4174/';
fs.mkdirSync('artifacts',{recursive:true});
const errors=[],report={checks:[],errors};
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
let page;
function watch(page){page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});page.on('requestfailed',request=>console.log('Request failed:',request.url(),request.failure()?.errorText));}
async function ready(page){page.setDefaultTimeout(90000);await page.goto(base,{waitUntil:'domcontentloaded',timeout:90000});await page.waitForFunction(()=>window.frontier?.view,null,{timeout:90000});}
try{
  page=await browser.newPage({viewport:{width:1440,height:900}});watch(page);
  await page.addInitScript(()=>localStorage.setItem('crowns-settings',JSON.stringify({quality:'high',autoQuality:false,volume:0,music:false})));
  const started=Date.now();await ready(page);
  const boot=await page.evaluate(()=>({art:frontier.view.artDiagnostics,quality:frontier.view.settings.quality}));
  assert.equal(boot.art.models,126);assert.equal(boot.art.source,'Blender');assert.equal(boot.art.detail,'high');
  report.checks.push({boot,elapsedMs:Date.now()-started});console.log('Verified: the game starts with the detailed Blender catalogue.');
  await page.locator('.landing-header [data-action=settings]').click();await page.locator('#frame-rate').selectOption('60');await page.getByRole('button',{name:'Apply settings'}).click();assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('crowns-settings')).frameRate),'60');report.checks.push({savedFrameRateTarget:60});
  await page.evaluate(()=>{
    frontier.start({mode:'sandbox',map:'highlands',faction:'alder',difficulty:'normal',seed:512});
    const s=frontier.sim;s.owned(0,'unit','villager').forEach(e=>s.stop([e.id]));
    const sites=[['keep',-15,17],['gate',-8,33],['tower',-15,43],['farm',-36,49],['farm',-29,49],['market',-25,4],['range',-42,7],['stable',-48,18],['blacksmith',-51,35],['workshop',-19,54],['monastery',-55,51],['camp',-56,2],['mine',-21,-9],['wonder',-6,0]];
    for(const[type,x,z]of sites)s.addBuilding(type,0,x,z,true);
    for(let z=22;z<=45;z+=2.85)s.addBuilding('wall',0,-8,z,true);
    for(let i=0;i<36;i++)s.addUnit(['spearman','swordsman','archer','knight','ram','catapult'][i%6],0,-33+i%12*2.2,36+Math.floor(i/12)*2.3);
    s.updateFog();frontier.view.focus(-30,28);frontier.view.angle=.65;frontier.view.zoom=84;frontier.view.tilt=.65;frontier.view.updateCamera();
  });
  await page.waitForTimeout(700);await page.getByRole('button',{name:'Toggle battlefield panels'}).click();
  await page.screenshot({path:'artifacts/blender-kingdom-high.png'});
  const kingdom=await page.evaluate(()=>({
    authoredBuildings:[...frontier.view.nodes.values()].filter(n=>n.userData.model3d?.kind==='building'&&n.userData.model3d.authored).length,
    authoredUnits:[...frontier.view.nodes.values()].filter(n=>n.userData.model3d?.kind==='unit'&&n.userData.model3d.authored).length,
    calls:frontier.view.renderer.info.render.calls,triangles:frontier.view.renderer.info.render.triangles,
    memory:frontier.view.renderer.info.memory,
    packedUnits:frontier.view.unitRenderDiagnostics,groundCover:frontier.view.groundCoverDiagnostics,
  }));assert.ok(kingdom.authoredBuildings>20);assert.ok(kingdom.authoredUnits>30);report.checks.push({kingdom});
  console.log('Verified: buildings and batched troops use the Blender models in the live battlefield.');

  const workers=await page.evaluate(()=>{
    const e=frontier.sim.owned(0,'unit','villager')[0],v=frontier.view;
    frontier.sim.stop([e.id]);frontier.select([e.id]);
    const jobs=[['wood','wood'],['gold','mine'],['food','food'],['farm','build']];
    const results=[];
    for(let pass=0;pass<3;pass++)for(const [resource,variant] of jobs){
      const target=frontier.sim.entities.find(entity=>entity.type===resource&&entity.hp>0);
      e.order={type:variant==='build'?'build':'gather',target:target.id};e.moving=false;e.carryType='wood';
      const old=v.nodes.get(e.id),oldBatch=old.userData.batch,oldIndex=old.userData.index;
      v.render(.033,false);const node=v.nodes.get(e.id);
      const alive=[...v.unitBatches.values()].reduce((n,b)=>n+b.ids.filter(id=>id===e.id).length,0);
      const oldCleared=old===node||oldBatch.ids[oldIndex]===null;
      results.push({variant:node.userData.unitVariant,expected:variant,alive,oldCleared,selected:v.selection.has(e.id),figure:node.userData.model3d.figure});
    }
    frontier.sim.stop([e.id]);
    return {changes:results,capacity:[...v.unitBatches.values()].filter(b=>b.model3d.type==='villager').map(b=>({slots:b.ids.length,free:b.free.length}))};
  });
  for(const result of workers.changes){assert.equal(result.variant,result.expected);assert.equal(result.figure,'adult');assert.equal(result.alive,1);assert.ok(result.oldCleared&&result.selected);}
  assert.ok(workers.capacity.every(b=>b.slots<=10));report.checks.push({workers});
  console.log('Verified: worker tools change with jobs, recycle their slots, and preserve selection without duplicate figures.');

  const picking=await page.evaluate(()=>{
    const e=frontier.sim.addUnit('swordsman',0,-40,60),v=frontier.view;
    v.focus(e.x,e.z);v.zoom=20;v.updateCamera();v.render(.033,false);
    const node=v.nodes.get(e.id),point=node.position.clone();point.y+=1.4;point.project(v.camera);
    const picked=v.pick((point.x+1)*innerWidth/2,(1-point.y)*innerHeight/2);
    return {expected:e.id,picked:picked?.id,packed:node.userData.batch.renderIds.includes(e.id)};
  });assert.equal(picking.picked,picking.expected);assert.ok(picking.packed);report.checks.push({packedPicking:picking});

  const teams=await page.evaluate(()=>{
    const s=frontier.sim,v=frontier.view,a=s.owned(0,'unit','swordsman')[0],b=s.addUnit('swordsman',1,a.x+2,a.z);
    s.stop([a.id,b.id]);s.updateFog();v.render(.033,false);
    const first=v.nodes.get(a.id).userData.batch,second=v.nodes.get(b.id).userData.batch;
    return {shared:first===second,owners:[a,b].map(e=>first.parts[0].geometry.attributes.instanceOwner.getX(first.renderIds.indexOf(e.id))),teamMask:first.parts[0].geometry.attributes.unitTeamMask.array.some(mask=>mask>0)};
  });assert.ok(teams.shared);assert.deepEqual(teams.owners,[0,1]);assert.ok(teams.teamMask);report.checks.push({sharedTeamBatches:teams});

  const remains=await page.evaluate(()=>{
    const s=frontier.sim,v=frontier.view;
    for(let i=0;i<6;i++){const e=s.addUnit(['spearman','swordsman','archer'][i%3],0,-42+i*1.4,61);s.hurt(e,e.maxHp+1);}
    const house=s.addBuilding('house',0,-35,60,true);s.hurt(house,house.maxHp+1);v.render(.033,false);v.clock+=.7;v.render(.033,false);
    return {diagnostics:v.remainsDiagnostics,solid:[...v.remains.batches.values()].every(batch=>batch.mesh.geometry.attributes.position.count>20),finite:[...v.remains.batches.values()].every(batch=>batch.mesh.instanceMatrix.array.every(Number.isFinite))};
  });assert.ok(remains.diagnostics.bodies>=6);assert.equal(remains.diagnostics.rubble,12);assert.ok(remains.diagnostics.retained<=remains.diagnostics.limit);assert.ok(remains.solid&&remains.finite);report.checks.push({remains});
  await page.screenshot({path:'artifacts/blender-battle-remains.png'});

  await page.evaluate(()=>{const e=frontier.sim.owned(0,'unit','villager')[0];frontier.select([e.id]);frontier.action('inspect');});
  await page.waitForTimeout(400);await page.screenshot({path:'artifacts/blender-villager-high.png'});
  const selection=await page.evaluate(()=>({target:frontier.view.target.toArray(),zoom:frontier.view.zoom,selected:[...frontier.view.selection],time:frontier.sim.time}));
  await page.evaluate(()=>frontier.view.quality('low'));
  await page.waitForFunction(()=>frontier.view.artDiagnostics?.detail==='low',null,{timeout:90000});
  const low=await page.evaluate(()=>({art:frontier.view.artDiagnostics,target:frontier.view.target.toArray(),zoom:frontier.view.zoom,selected:[...frontier.view.selection]}));
  assert.deepEqual(low.target,selection.target);assert.equal(low.zoom,selection.zoom);assert.deepEqual(low.selected,selection.selected);
  await page.screenshot({path:'artifacts/blender-villager-low.png'});report.checks.push({qualitySwitch:low});
  console.log('Verified: changing graphics detail preserves the camera and selection.');

  for(const map of ['winter','desert','canyon','rivers','valley','coast']){
    await page.evaluate(map=>frontier.start({mode:map==='coast'?'tides':'sandbox',map,faction:map==='desert'?'sun':'raven',difficulty:'normal',seed:512}),map);
    await page.waitForTimeout(180);assert.equal(await page.evaluate(()=>frontier.view.artDiagnostics.models),126);
  }
  await page.evaluate(()=>{const e=frontier.sim.owned(0,'unit','galley')[0];frontier.select([e.id]);frontier.action('inspect');});
  await page.waitForTimeout(300);await page.screenshot({path:'artifacts/blender-fleet-low.png'});
  report.checks.push({biomes:7,naval:true});await page.close();page=null;

  const phone=await browser.newPage({viewport:{width:844,height:390},isMobile:true,hasTouch:true,deviceScaleFactor:2});page=phone;watch(phone);
  await phone.addInitScript(()=>localStorage.setItem('crowns-settings',JSON.stringify({quality:'low',autoQuality:true,volume:0,music:false})));
  await ready(phone);await phone.getByRole('button',{name:'Begin your reign'}).tap();await phone.getByRole('button',{name:'Enter the frontier'}).tap();
  await phone.waitForFunction(()=>frontier.playing);
  await phone.evaluate(()=>{const e=frontier.sim.owned(0,'unit','villager')[0];frontier.select([e.id]);});
  await phone.waitForFunction(()=>!!document.querySelector('#model-portrait canvas'));
  await phone.locator('[data-action=inspect]').tap();await phone.waitForTimeout(200);
  await phone.screenshot({path:'artifacts/blender-phone-landscape.png'});
  assert.equal(await phone.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.equal(await phone.evaluate(()=>frontier.view.artDiagnostics.detail),'low');
  const hud=await phone.evaluate(()=>{
    const rect=document.querySelector('#selection-panel').getBoundingClientRect();
    const buttons=[...document.querySelectorAll('.worker-actions button,.command-buttons button')].map(button=>({width:button.getBoundingClientRect().width,height:button.getBoundingClientRect().height}));
    const map=document.querySelector('#minimap').getBoundingClientRect();
    return {selectionHeight:rect.height,buttons,radar:{width:map.width,height:map.height}};
  });assert.ok(hud.selectionHeight<=126);assert.ok(hud.buttons.every(b=>b.width>=44&&b.height>=44));assert.equal(hud.radar.width,hud.radar.height);
  report.checks.push({landscapeTouch:true,authoredPortrait:true,lowDetail:true,hud});
  assert.deepEqual(errors,[]);report.passed=true;
  console.log(JSON.stringify(report,null,2));
}catch(error){
  report.passed=false;report.failure=error.message;
  if(page){report.worldError=await page.locator('#world').innerText().catch(()=>'');report.bootStatus=await page.locator('.battlefield-loading').innerText().catch(()=>'');report.requests=await page.evaluate(()=>performance.getEntriesByType('resource').map(r=>({name:r.name,duration:r.duration,bytes:r.transferSize}))).catch(()=>[]);await page.screenshot({path:'artifacts/blender-browser-failure.png'}).catch(()=>{});}
  console.log(JSON.stringify(report,null,2));throw error;
}finally{
  fs.writeFileSync('artifacts/authored-art-qa.json',JSON.stringify(report,null,2));await browser.close();
}
