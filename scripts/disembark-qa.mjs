import {chromium} from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const output=process.env.QA_OUTPUT||'artifacts/disembark-browser-validation.json';
fs.mkdirSync(path.dirname(output),{recursive:true});
const browser=process.env.QA_BROWSER_ENDPOINT?await chromium.connectOverCDP(process.env.QA_BROWSER_ENDPOINT):await chromium.launch({channel:'msedge',headless:true});
const report={startedAt:new Date().toISOString(),cases:[],errors:[]};
const cases=process.env.QA_DISEMBARK_CASES?JSON.parse(process.env.QA_DISEMBARK_CASES):[{backend:'webgl',quality:'high'},{backend:'webgpu',quality:'medium'},{backend:'webgl',quality:'low',phone:true}];
const guard=setTimeout(()=>browser.close().catch(()=>{}),900000);
try{
 for(const item of cases){
  console.log('Disembark scene '+JSON.stringify(item));
  const context=await browser.newContext({viewport:item.phone?{width:640,height:360}:{width:960,height:640},hasTouch:!!item.phone,isMobile:!!item.phone,serviceWorkers:'block'}),page=await context.newPage();page.setDefaultTimeout(240000);
  page.on('pageerror',e=>report.errors.push({item,error:e.stack}));page.on('console',m=>{if(m.type()==='error'||m.type()==='warning'&&!/powerPreference option|Service Worker registration blocked|warning X4122:/.test(m.text()))report.errors.push({item,type:m.type(),error:m.text()});});
  await page.addInitScript(quality=>localStorage.setItem('crowns-settings',JSON.stringify({quality,autoQuality:false,frameRate:'30',fog:false,weather:'clear',lighting:'day',music:false,volume:0})),item.quality);
  const url=new URL(process.env.QA_URL||'http://localhost:4173/');url.searchParams.set('renderer',item.backend);await page.goto(url.href,{waitUntil:'domcontentloaded',timeout:90000});await page.waitForFunction(()=>window.frontier?.view);
  assert.equal(await page.evaluate(()=>document.documentElement.dataset.renderer),item.backend);report.buildId??=await page.locator('meta[name="frontier-build"]').getAttribute('content');
  await page.evaluate(()=>{
   const v=frontier.view,draw=v.render.bind(v);v.render=()=>false;
   window.qaDraw=async()=>{const queue=v.renderer.backend?.device?.queue;if(queue)await queue.onSubmittedWorkDone();draw(.016,false);if(queue)await queue.onSubmittedWorkDone();};
   window.qaLanding=async(kind='open')=>{
    frontier.start({mode:'sandbox',map:'coast',seed:512});const s=frontier.sim,ship=s.owned(0,'unit','transport')[0];s.tick=()=>{};
    s.entities=s.entities.filter(e=>e===ship||Math.hypot(e.x+19,e.z)>=25);s.index=null;s.revision++;ship.x=-12;ship.z=0;
    const types=kind==='crowded'?Array(8).fill('spearman'):['ram','catapult','knight','spearman','ram','catapult','knight','spearman'];
    const units=types.map(type=>s.addUnit(type,0,-16,0));for(const unit of units){s.command([unit.id],{type:'board',target:ship.id});s.tickUnit(unit,.1);}
    const blockers=[];
    if(kind==='blocked')for(let z=-12;z<=12;z+=2.85)s.addBuilding('wall',1,-17,z,true);
    if(kind==='crowded')for(let x=-25;x<=-15;x+=2)for(let z=-9;z<=9;z+=2)if(Math.hypot(x+15,z)>3.2&&!s.isWater(x,z))blockers.push(s.addUnit('villager',0,x,z).id);
    s.visible.fill(1);s.explored.fill(1);v.attach(s);v.focus(-17,0);v.zoom=30;v.tilt=.6;v.angle=.65;v.updateCamera();frontier.select([ship.id]);
    window.qaIds={ship:ship.id,units:units.map(u=>u.id),blockers,kind};await qaDraw();return qaIds;
   };
   window.qaState=()=>{
    const s=frontier.sim,ship=s.get(qaIds.ship),units=qaIds.units.map(id=>s.get(id)),landed=units.filter(u=>!u.embarked),overlaps=[];
    const clearance=unit=>Math.max(unit.r,{ram:2.7,catapult:3.3}[unit.type]||unit.r);
    for(const unit of landed.filter(u=>qaLastAboard.includes(u.id)))for(const other of s.entities)if(unit!==other&&other.hp>0&&!other.embarked&&other.kind==='unit'&&!s.unitDefinition(other).naval&&Math.hypot(unit.x-other.x,unit.z-other.z)<clearance(unit)+clearance(other)+.14)overlaps.push([unit.id,other.id]);
    return {remaining:ship.passengers.length,landed:landed.map(u=>{const groundRadius=Math.max(u.r,['ram','catapult'].includes(u.type)?2.1:u.r);return {id:u.id,type:u.type,x:u.x,z:u.z,hp:u.hp,water:s.isWater(u.x,u.z),groundDry:Array.from({length:32},(_,i)=>!s.isWater(u.x+Math.cos(i*Math.PI/16)*groundRadius,u.z+Math.sin(i*Math.PI/16)*groundRadius)).every(Boolean),range:Math.hypot(u.x-ship.x,u.z-ship.z)};}),overlaps,overflow:document.documentElement.scrollWidth>innerWidth,shaderErrors:(v.renderer.info.programs||[]).filter(p=>p.diagnostics?.runnable===false).length};
   };
   window.qaLandingPoint=(x,z)=>{const v=frontier.view,p=v.camera.position.clone().set(x,v.groundHeight(x,z),z).project(v.camera),r=v.renderer.domElement.getBoundingClientRect(),screen={x:r.left+(p.x+1)*r.width/2,y:r.top+(1-p.y)*r.height/2};return {...screen,uncovered:document.elementFromPoint(screen.x,screen.y)===v.renderer.domElement};};
  });
  async function unload(x){
   await page.evaluate(()=>window.qaLastAboard=[...frontier.sim.get(qaIds.ship).passengers]);
   if(item.phone)await page.locator('#selection-panel [data-action=selection-details]').click();
   await page.locator('[data-action=unload]').click();
   const point=await page.evaluate(x=>qaLandingPoint(x,0),x);assert.equal(point.uncovered,true,'The target beach remains visible after opening the unload command');
   if(item.phone)await page.touchscreen.tap(point.x,point.y);else await page.mouse.click(point.x,point.y);
   await page.evaluate(()=>qaDraw());return page.evaluate(()=>qaState());
  }
  const check={...item};report.cases.push(check);const prefix=path.join(path.dirname(output),`disembark-${item.backend}-${item.quality}`);
  await page.evaluate(()=>qaLanding());check.open=await unload(-15);assert.ok(check.open.landed.length>0);assert.equal(check.open.landed.length+check.open.remaining,8);assert.deepEqual(check.open.overlaps,[]);assert.ok(check.open.landed.every(u=>!u.water&&u.groundDry&&u.range<=11));assert.equal(check.open.overflow,false);assert.equal(check.open.shaderErrors,0);await page.screenshot({path:prefix+'-open.png'});
  if(check.open.remaining){
   await page.evaluate(()=>{const s=frontier.sim,landed=qaIds.units.map(id=>s.get(id)).filter(unit=>!unit.embarked);for(const unit of landed){s.command([unit.id],{type:'move',x:-33,z:(unit.id%4-1.5)*4});for(let i=0;i<120;i++)s.tickUnit(unit,.1);}});
   check.openRetry=await unload(-15);assert.equal(check.openRetry.remaining,0);assert.equal(check.openRetry.landed.length,8);assert.deepEqual(check.openRetry.overlaps,[]);
  }
  await page.evaluate(()=>qaLanding('blocked'));check.blocked=await unload(-22);assert.equal(check.blocked.remaining,8);assert.equal(check.blocked.landed.length,0);assert.match(await page.locator('#toasts').innerText(),/No clear landing space/);await page.screenshot({path:prefix+'-blocked.png'});
  await page.evaluate(()=>qaLanding('crowded'));check.partial=await unload(-15);assert.ok(check.partial.remaining>0&&check.partial.remaining<8);assert.deepEqual(check.partial.overlaps,[]);assert.equal(check.partial.landed.length+check.partial.remaining,8);
  await page.waitForFunction(remaining=>document.querySelector('[data-action=unload]')?.textContent.includes(String(remaining)),check.partial.remaining);
  await page.evaluate(()=>{const s=frontier.sim;for(const id of [...qaIds.blockers,...qaIds.units.filter(id=>!s.get(id).embarked)]){const unit=s.get(id);unit.x=-50;unit.z=id%30;}});
  check.retry=await unload(-15);assert.equal(check.retry.remaining,0);assert.equal(check.retry.landed.length,8);assert.deepEqual(check.retry.overlaps,[]);assert.equal(check.retry.shaderErrors,0);assert.equal(check.retry.overflow,false);
  await context.close();console.log('Passed '+JSON.stringify(item));
 }
 assert.deepEqual(report.errors,[]);report.passed=true;
}catch(error){report.failure=error.stack;throw error;}
finally{clearTimeout(guard);fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');await browser.close();}
console.log(JSON.stringify({passed:true,output}));
